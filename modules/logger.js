// ─────────────────────────────────────────────
// Al-Jin · modules/logger.js
// Buffered, non-blocking per-session message logger.
// Lines are queued in memory and flushed asynchronously.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { logsPath } from '../core/paths.js';
import { getBestUserJid } from '../core/jid-resolver.js';

const FLUSH_MS = 2000;

// filePath → string[] (pending lines)
const buffers = new Map();
let flushTimer = null;

// ── Retention: delete old `messages_<session>_<date>.txt` files ──
// There's one file per session per calendar day and nothing ever removed
// them, so on a small disk (e.g. 1GB across 8-10 sessions) they'd slowly
// accumulate forever. Default keeps 7 days; set WRAITH_LOG_RETENTION_DAYS=0
// to disable pruning.
const RETENTION_DAYS = Number(process.env.WRAITH_LOG_RETENTION_DAYS ?? 7);

export function pruneOldLogs() {
  if (!(RETENTION_DAYS > 0)) return;
  try {
    const dir = logsPath();
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(dir)) {
      if (!/^messages_.+_\d{4}-\d{2}-\d{2}\.txt$/.test(name)) continue;
      const full = path.join(dir, name);
      try {
        if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
      } catch { /* file may already be gone / being written */ }
    }
  } catch { /* logs dir unreadable — nothing to prune */ }
}

pruneOldLogs();
const pruneTimer = setInterval(pruneOldLogs, 6 * 60 * 60 * 1000); // every 6h
if (typeof pruneTimer.unref === 'function') pruneTimer.unref();

const loggedMsgIds = new Set();
function isDuplicateMsg(msgId) {
  if (!msgId) return false;
  if (loggedMsgIds.has(msgId)) return true;
  loggedMsgIds.add(msgId);
  if (loggedMsgIds.size > 2000) loggedMsgIds.delete(loggedMsgIds.values().next().value);
  return false;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flushNow, FLUSH_MS);
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

export function flushNow() {
  flushTimer = null;
  for (const [filePath, lines] of buffers) {
    if (!lines.length) continue;
    const data = lines.join('');
    lines.length = 0;
    try {
      fs.appendFile(filePath, data, (err) => {
        if (err) console.error('[logger] append failed:', err.message);
      });
    } catch (e) {
      console.error('[logger] append threw:', e.message);
    }
  }
}

export function flushSync() {
  for (const [filePath, lines] of buffers) {
    if (!lines.length) continue;
    try { fs.appendFileSync(filePath, lines.join('')); lines.length = 0; } catch {}
  }
}
process.on('SIGINT', flushSync);
process.on('SIGTERM', flushSync);

async function formatIdentity(jid, sock = null, groupJid = null) {
  if (!jid) return 'N/A';
  const clean = String(jid).split(':')[0];
  const bestJid = await getBestUserJid(clean, sock, groupJid);
  const digits = bestJid.split('@')[0].replace(/\D/g, '');
  if (bestJid.endsWith('@s.whatsapp.net')) return digits ? `+${digits}` : bestJid;
  if (bestJid.endsWith('@lid')) return digits ? `+${digits}` : bestJid;
  if (bestJid.endsWith('@g.us')) return digits ? `Group(${digits})` : bestJid;
  if (digits.length >= 7) return `+${digits}`;
  return bestJid;
}

export async function logMessageHistory({
  sessionId = 'main',
  direction = 'INCOMING',
  chatJid = '',
  senderJid = '',
  messageText = '',
  mediaType = null,
  mediaPath = null,
  timestamp = null,
  msgId = null,
  sock = null,
}) {
  try {
    if (chatJid?.endsWith('@newsletter') || senderJid?.endsWith('@newsletter')) return;
    if (msgId && isDuplicateMsg(msgId)) return;

    const now = timestamp ? new Date(timestamp) : new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const logFileName = `messages_${sessionId}_${dateStr}.txt`;
    const logFilePath = path.join(logsPath(), logFileName);

    const groupJid = chatJid?.endsWith('@g.us') ? chatJid : null;
    const formattedSender = await formatIdentity(senderJid, sock, groupJid);
    const formattedChat = await formatIdentity(chatJid, sock, groupJid);

    let logLine = `[${dateStr}, ${hours}:${minutes}:${seconds}] ${formattedSender} -> ${formattedChat}`;
    if (direction) logLine += ` [${direction}]`;
    if (mediaType) logLine += ` <Media: ${mediaType}${mediaPath ? ` (${mediaPath})` : ''}>`;
    logLine += `: ${(messageText || '').replace(/\r?\n/g, ' ') || '(no text)'}\n`;

    let buf = buffers.get(logFilePath);
    if (!buf) { buf = []; buffers.set(logFilePath, buf); }
    buf.push(logLine);
    scheduleFlush();
  } catch (e) {
    try { console.error('[logger] Failed to write message log:', e?.message); } catch {}
  }
}
