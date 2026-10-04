// ─────────────────────────────────────────────
// Al-Jin Lite · modules/ghost.js — anti-delete / anti-edit (zero media storage)
//
//  TEXT   → tiny JSON ledger (id → sender, text, where the media copy lives). No media bytes, ever.
//  MEDIA  → every incoming media message (chats, statuses, view-once) is relayed by reference
//           to a DESTINATION chat the moment it arrives (see core/relay.js). Nothing is
//           downloaded, buffered or written to disk by the bot.
//  DELETE → the owner gets a text alert (who / when / where) that points to the copy in the
//           destination chat, with the date & time it was saved.
//
//  .ghost                       status
//  .ghost on|off                anti-delete
//  .ghost edit on|off           anti-edit
//  .ghost relay on|off          media relay (global)
//  .ghost status on|off         relay status stories
//  .ghost labels on|off         send a caption line after every relayed media
//  .ghost dest <number|jid>     set destination chat (also: here · me/reset)
//  .ghost mode all|selected     relay every chat (default) or only chats switched on
//  .ghost chat on|off [number]  per-chat switch (current chat when no number)
//  .ghost chats                 list per-chat overrides
// ─────────────────────────────────────────────
import fs from 'fs';
import { proto, jidNormalizedUser } from '@whiskeysockets/baileys';

import { isOwner, ownerJid, digitsOf } from '../core/identity.js';
import { CONFIG } from '../config.js';
import { getBestUserJid } from '../core/jid-resolver.js';
import { sendInteractive, createQuickReply } from '../lib/buttons.js';
import { getPrefix } from '../core/settings.js';
import { inState, statePath } from '../core/paths.js';
import { writeJsonAtomic } from '../core/state-io.js';
import { mediaNodeOf, relayMedia, textOf, ownChat } from '../core/relay.js';

const STATE = () => inState('ghost.json');
const LEDGER_FILE = () => inState('ghost-ledger.json');
const DEBUG = process.env.WRAITH_DEBUG === '1';
const LEDGER_MAX = 1000;
const STATUS_INDEX_MAX = 300;
const tz = () => CONFIG.timezone || 'Asia/Karachi';

const stamp = (ms = Date.now()) => new Date(ms).toLocaleString('en-GB', {
  hour12: true, timeZone: tz(), day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────
const DEFAULTS = { on: true, edit: true, relay: true, statusRelay: true, labels: false, dest: null, mode: 'all', chats: {} };
let _state = null;
function read() {
  if (_state) return _state;
  try { _state = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(STATE(), 'utf-8')) }; }
  catch { _state = { ...DEFAULTS }; }
  if (!_state.chats || typeof _state.chats !== 'object') _state.chats = {};
  return _state;
}
function write() {
  try { statePath(); writeJsonAtomic(STATE(), _state); } catch {}
}

function chatEnabled(s, chat) {
  if (Object.prototype.hasOwnProperty.call(s.chats, chat)) return !!s.chats[chat];
  return s.mode !== 'selected';
}

function destJid(sock) {
  const s = read();
  return s.dest || ownChat(sock);
}

function destLabel(sock, jid) {
  const own = ownChat(sock);
  if (!jid || jid === own) return 'the bot’s own chat (Message yourself)';
  if (jid.endsWith('@g.us')) return `group ${jid.split('@')[0]}`;
  return `+${digitsOf(jid)}`;
}

// ─────────────────────────────────────────────
//  Ledger (text only)
// ─────────────────────────────────────────────
const ledger = new Map();
let saveTimer = null;

function loadLedger() {
  try {
    const raw = JSON.parse(fs.readFileSync(LEDGER_FILE(), 'utf-8'));
    const cutoff = Date.now() - CONFIG.memoryTTL;
    for (const [id, rec] of Object.entries(raw)) if (rec?.at >= cutoff) { delete rec.file; ledger.set(id, rec); }
  } catch { /* first run */ }
}
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { statePath(); writeJsonAtomic(LEDGER_FILE(), Object.fromEntries(ledger)); } catch {}
  }, 3000);
  saveTimer.unref?.();
}
loadLedger();

export function getLedgerEntry(id) { return id ? ledger.get(id) || null : null; }

function putLedger(id, rec) {
  ledger.set(id, rec);
  while (ledger.size > LEDGER_MAX) ledger.delete(ledger.keys().next().value);
  scheduleSave();
}

// status index: poster digits → [{ id, type, caption, at, fwd }]   (24 h, text only)
const statusIndex = new Map();
export function getStatusIndexFor(digits) {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  return (statusIndex.get(digits) || []).filter((r) => r.at >= cutoff);
}
function indexStatus(digits, rec) {
  const list = statusIndex.get(digits) || [];
  list.push(rec);
  while (list.length > 40) list.shift();
  statusIndex.set(digits, list);
  while (statusIndex.size > STATUS_INDEX_MAX) statusIndex.delete(statusIndex.keys().next().value);
}

// ─────────────────────────────────────────────
//  Protocol helpers
// ─────────────────────────────────────────────
const TYPE_REVOKE = proto.Message.ProtocolMessage.Type.REVOKE;
const TYPE_MESSAGE_EDIT = proto.Message.ProtocolMessage.Type.MESSAGE_EDIT;
const WRAPPER_KEYS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage', 'associatedChildMessage'];

export function unwrapProtocol(msg) {
  if (!msg) return { pm: null, host: msg };
  let cur = msg.message;
  const seen = new Set();
  let depth = 0;
  while (cur && typeof cur === 'object' && depth < 6) {
    depth++;
    if (seen.has(cur)) break;
    seen.add(cur);
    if (cur.protocolMessage) return { pm: cur.protocolMessage, host: msg };
    let descended = false;
    for (const key of WRAPPER_KEYS) {
      const node = cur[key];
      if (!node) continue;
      if (node.protocolMessage) return { pm: node.protocolMessage, host: msg };
      if (node.message) { cur = node.message; descended = true; break; }
    }
    if (!descended) break;
  }
  return { pm: null, host: msg };
}

export function bodyText(m) {
  if (!m) return '';
  if (m.message && !m.conversation && !m.extendedTextMessage && !m.imageMessage && !m.videoMessage && !m.documentMessage) return bodyText(m.message);
  return (m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption
    || m.videoMessage?.caption || m.documentMessage?.caption || m.audioMessage?.caption || '').trim();
}

export function classifyMessage(msg) {
  if (!msg?.message) return null;
  const { pm } = unwrapProtocol(msg);
  if (pm) {
    const t = pm.type;
    if (t === TYPE_REVOKE || t === 'REVOKE' || t === 0) return 'revoke';
    if (t === TYPE_MESSAGE_EDIT || t === 'MESSAGE_EDIT' || t === 14) return 'edit';
  }
  if (msg.message?.editedMessage) return 'edit';
  const sem = msg.message?.secretEncryptedMessage;
  if (sem) {
    const t = sem.secretEncType;
    if (t === 2 || t === 'MESSAGE_EDIT') return 'secret_edit';
    if (t === 1 || t === 'EVENT_EDIT') return 'secret_edit';
  }
  return null;
}

// ─────────────────────────────────────────────
//  .ghost command
// ─────────────────────────────────────────────
const onoff = (v) => (v ? 'ON' : 'OFF');

function toJid(raw, sock) {
  const t = String(raw || '').trim();
  if (!t) return null;
  if (/@(g\.us|s\.whatsapp\.net|lid)$/.test(t)) return t;
  const d = t.replace(/\D/g, '');
  return d.length >= 7 && d.length <= 15 ? `${d}@s.whatsapp.net` : null;
}

export async function ghostCommand(sock, chat, msg, args) {
  const from = msg.key.participant || msg.key.remoteJid;
  if (!msg.key.fromMe && !isOwner(from)) {
    return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  }
  const s = read();
  const p = getPrefix();
  let a0 = (args?.[0] || '').toLowerCase();
  let a1 = (args?.[1] || '').toLowerCase();
  const reply = (text) => sock.sendMessage(chat, { text }, { quoted: msg });

  const overrides = Object.keys(s.chats).length;
  const st = (on) => (on ? '✅ ON' : '❌ OFF');
  const act = (on) => (on ? 'OFF' : 'ON');
  const statusBody = () =>
    `Currently the settings are:\n` +
    `• Antidelete — ${st(s.on)}\n` +
    `• Antiedit — ${st(s.edit)}\n` +
    `• Media relay — ${st(s.relay)} (${s.mode === 'all' ? 'all chats' : 'selected chats only'}${overrides ? `, ${overrides} override${overrides > 1 ? 's' : ''}` : ''})\n` +
    `• Status relay — ${st(s.statusRelay)}\n` +
    `• Labels — ${st(s.labels)}\n` +
    `• Destination — ${destLabel(sock, destJid(sock))}\n` +
    `• Ledger — ${ledger.size}/${LEDGER_MAX} (text only, no media stored)`;

  const buttons = () => [
    createQuickReply(`Turn Antidelete ${act(s.on)}`, `${p}ghost ${s.on ? 'off' : 'on'}`),
    createQuickReply(`Turn Antiedit ${act(s.edit)}`, `${p}ghost edit ${s.edit ? 'off' : 'on'}`),
    createQuickReply(`Turn Media-relay ${act(s.relay)}`, `${p}ghost relay ${s.relay ? 'off' : 'on'}`),
    createQuickReply(`Turn Status-relay ${act(s.statusRelay)}`, `${p}ghost status ${s.statusRelay ? 'off' : 'on'}`),
  ];
  const show = (head) => sendInteractive(sock, chat, { body: `${head}\n\n${statusBody()}`, footer: 'Provided by 𝐀𝐥-𝐉𝐢𝐧', actions: true, buttons: buttons() }, { quoted: msg });

  if (!a0) return show('👻 *ghost* — watcher status');

  if (a0 === 'toggle1') a0 = s.on ? 'off' : 'on';
  else if (a0 === 'toggle2') { a0 = 'edit'; a1 = s.edit ? 'off' : 'on'; }

  if (a0 === 'on' || a0 === 'off') { s.on = a0 === 'on'; write(); return show(`👻 Antidelete is now *${s.on ? 'ARMED (ON)' : 'DISARMED (OFF)'}*.`); }

  if (a0 === 'edit') {
    if (a1 !== 'on' && a1 !== 'off') return reply(`👻 use _${p}ghost edit on_ or _${p}ghost edit off_`);
    s.edit = a1 === 'on'; write();
    return show(`👻 Antiedit is now *${s.edit ? 'ARMED (ON)' : 'DISARMED (OFF)'}*.`);
  }

  if (a0 === 'relay' || a0 === 'status' || a0 === 'labels') {
    if (a1 !== 'on' && a1 !== 'off') return reply(`👻 use _${p}ghost ${a0} on_ or _${p}ghost ${a0} off_`);
    const key = a0 === 'relay' ? 'relay' : a0 === 'status' ? 'statusRelay' : 'labels';
    s[key] = a1 === 'on'; write();
    return show(`👻 ${a0} is now *${onoff(s[key])}*.`);
  }

  if (a0 === 'dest' || a0 === 'destination') {
    const raw = args?.[1] || '';
    if (!raw) return reply(`📍 Destination: *${destLabel(sock, destJid(sock))}*\n\nChange it:\n• ${p}ghost dest <number>\n• ${p}ghost dest here (this chat)\n• ${p}ghost dest me (bot’s own chat)`);
    if (['me', 'self', 'reset', 'default', 'own'].includes(a1)) { s.dest = null; write(); return show('📍 Destination reset to the bot’s own chat.'); }
    const j = a1 === 'here' ? chat : toJid(raw, sock);
    if (!j) return reply('❌ Give a phone number with country code (e.g. 923001234567), a group JID, or `here`.');
    s.dest = jidNormalizedUser(j) === ownChat(sock) ? null : j; write();
    return show(`📍 Media copies will now be sent to *${destLabel(sock, destJid(sock))}*.`);
  }

  if (a0 === 'mode') {
    if (a1 !== 'all' && a1 !== 'selected') return reply(`👻 use _${p}ghost mode all_ (every chat) or _${p}ghost mode selected_ (only chats switched on)`);
    s.mode = a1; write();
    return show(`👻 Relay mode: *${a1 === 'all' ? 'ALL chats' : 'SELECTED chats only'}*.`);
  }

  if (a0 === 'chat') {
    if (a1 !== 'on' && a1 !== 'off') return reply(`👻 use _${p}ghost chat on|off_ (this chat) or _${p}ghost chat on|off <number>_`);
    const target = args?.[2] ? toJid(args[2], sock) : chat;
    if (!target) return reply('❌ Invalid number / JID.');
    s.chats[target] = a1 === 'on'; write();
    return reply(`👻 Media relay for *${target.endsWith('@g.us') ? 'this group' : '+' + digitsOf(target)}* is now *${onoff(s.chats[target])}*.`);
  }

  if (a0 === 'chats') {
    const rows = Object.entries(s.chats).map(([j, v]) => `• ${j.endsWith('@g.us') ? j : '+' + digitsOf(j)} — ${onoff(v)}`);
    return reply(rows.length ? `👻 *Per-chat overrides* (mode: ${s.mode})\n\n${rows.join('\n')}` : `👻 No per-chat overrides. Mode: ${s.mode}.`);
  }

  return reply('👻 unknown option. Try `.ghost` to see the status.');
}

// ─────────────────────────────────────────────
//  REMEMBER  (runs for every incoming message)
// ─────────────────────────────────────────────
const statusSeen = new Set();
const markSeen = (set, id, max = 800) => { set.add(id); if (set.size > max) set.delete(set.values().next().value); };

async function captionFor(sock, dest, relayed, text, mentions = []) {
  try {
    const stub = { key: { remoteJid: dest, id: relayed.id, fromMe: true }, message: { conversation: '📎 saved copy' } };
    await sock.sendMessage(dest, { text, mentions }, { quoted: stub });
  } catch (e) { if (DEBUG) console.log('[ghost] label failed:', e.message); }
}

/**
 * Relay a status story to the destination (de-duplicated by id).
 * Returns the relay record or null. `force` ignores the status switch (used by .statusalert).
 */
export async function relayStatusMessage(sock, msg, { force = false } = {}) {
  try {
    const s = read();
    if (!force && (!s.on || !s.statusRelay)) return null;
    const id = msg?.key?.id;
    if (!id || msg.key.fromMe || !msg.message) return null;
    const seen = ledger.get(id);
    if (seen?.status && seen.fwd) return seen.fwd;
    if (statusSeen.has(id)) return seen?.fwd || null;
    markSeen(statusSeen, id);

    const rawSender = msg.key.participant;
    if (!rawSender || rawSender === 'status@broadcast') return null;
    const bestSender = await getBestUserJid(rawSender, sock);
    const info = mediaNodeOf(msg.message);
    const text = info ? info.caption : textOf(msg.message);
    const rec = { from: bestSender, scope: null, text, media: info?.type || null, status: true, fwd: null, at: Date.now() };

    if (info) {
      const dest = destJid(sock);
      rec.fwd = await relayMedia(sock, dest, msg, info);
      if (rec.fwd) await captionFor(sock, dest, rec.fwd, `🌒 *status* · ${info.type} · @${digitsOf(bestSender)} · ${stamp()}${text ? `\n${text.slice(0, 300)}` : ''}`, [bestSender]);
    }
    putLedger(id, rec);
    indexStatus(digitsOf(bestSender), { id, type: info?.type || (text ? 'text' : 'other'), caption: text, at: rec.at, fwd: rec.fwd });
    return rec.fwd || (text ? { text: true } : null);
  } catch (e) {
    if (DEBUG) console.log('[ghost] relayStatus error:', e.message);
    return null;
  }
}

export async function remember(sock, msg) {
  if (msg.key?.fromMe) return;
  const s = read();
  if (!s.on && !s.edit) return;

  const chat = msg.key?.remoteJid;
  if (chat === 'status@broadcast') { await relayStatusMessage(sock, msg); return; }
  const sender = msg.key?.participant || chat;
  if (chat?.endsWith('@newsletter') || sender?.endsWith('@newsletter')) return;

  const id = msg.key?.id;
  if (!id) return;
  if (msg.message?.protocolMessage || msg.message?.secretEncryptedMessage || msg.message?.editedMessage) return;

  const rawFrom = msg.key.participant || msg.key.remoteJid;
  const groupJid = chat?.endsWith('@g.us') ? chat : null;

  try {
    const bestFrom = await getBestUserJid(rawFrom, sock, groupJid);
    const info = mediaNodeOf(msg.message);
    const record = { from: bestFrom, scope: groupJid, text: info ? info.caption : (bodyText(msg.message) || textOf(msg.message)), media: info?.type || null, viewOnce: !!info?.viewOnce, fwd: null, at: Date.now() };

    if (info && s.on && s.relay && chatEnabled(s, chat)) {
      const dest = destJid(sock);
      record.fwd = await relayMedia(sock, dest, msg, info);
      if (record.fwd && (s.labels || info.viewOnce)) {
        const where = groupJid ? ' · group' : '';
        await captionFor(sock, dest, record.fwd,
          `${info.viewOnce ? '👁️ *view-once*' : '📎'} ${info.type} · @${digitsOf(bestFrom)}${where} · ${stamp()}${info.caption ? `\n${info.caption.slice(0, 300)}` : ''}`, [bestFrom]);
      }
    }
    putLedger(id, record);
  } catch (e) {
    if (DEBUG) console.log('[ghost] remember error:', e.message);
  }
}

// ─────────────────────────────────────────────
//  De-dup caches
// ─────────────────────────────────────────────
const processedDeletes = new Set();
const processedEdits = new Set();

// ─────────────────────────────────────────────
//  REVEAL — delete
// ─────────────────────────────────────────────
export async function revealDelete(sock, msg) {
  if (msg.key?.fromMe) return;
  const s = read();
  if (!s.on) return;

  const { pm } = unwrapProtocol(msg);
  if (!pm?.key?.id) return;

  const targetId = pm.key.id;
  if (processedDeletes.has(targetId)) return;
  markSeen(processedDeletes, targetId, 500);

  const culprit = msg.participant || msg.key?.participant || msg.key?.remoteJid;
  const selfNum = digitsOf(sock.user?.id || '');

  const rec = ledger.get(targetId);
  if (!rec) return;

  const scopeJid = rec.scope || (msg.key?.remoteJid?.endsWith('@g.us') ? msg.key.remoteJid : null);
  const bestCulprit = await getBestUserJid(culprit, sock, scopeJid);
  const bestSender = await getBestUserJid(rec.from, sock, scopeJid);

  if (bestCulprit && digitsOf(bestCulprit) === selfNum) return;
  if (bestSender && digitsOf(bestSender) === selfNum) return;

  const owner = ownerJid();
  let scope = '';
  if (rec.scope) { try { scope = (await sock.groupMetadata(rec.scope)).subject; } catch {} }

  const what = rec.status ? 'a status' : (rec.media ? `${rec.viewOnce ? 'a view-once' : (/^[aeiou]/.test(rec.media) ? 'an' : 'a')} ${rec.media}` : 'a message');
  const lines = [
    `👻 *ghost ledger · erased*`, ``,
    `*erased by ·* @${digitsOf(bestCulprit || bestSender)}`,
    `*original sender ·* @${digitsOf(bestSender)}`,
    `*deleted ·* ${stamp()}`,
    `*what ·* ${what}`,
  ];
  if (scope) lines.push(`*chat ·* ${scope}`);
  if (rec.text) lines.push(``, `*what was said*`, rec.text);

  let quoted;
  if (rec.media) {
    lines.push('');
    if (rec.fwd?.jid) {
      const where = destLabel(sock, rec.fwd.jid);
      lines.push(`📎 *${rec.media} saved* — copy is in *${where}*`, `🕒 look there at *${stamp(rec.fwd.at)}* to see it`);
      if (digitsOf(rec.fwd.jid) && digitsOf(rec.fwd.jid) === digitsOf(owner) && rec.fwd.id) {
        quoted = { key: { remoteJid: rec.fwd.jid, id: rec.fwd.id, fromMe: true }, message: { conversation: `📎 ${rec.media} (saved copy)` } };
      }
    } else {
      lines.push(`📎 *${rec.media}* — no copy was saved (media relay was off for this chat, or the file was too large).`);
    }
  }

  try {
    await sock.sendMessage(owner, { text: lines.join('\n'), mentions: [bestCulprit, bestSender].filter(Boolean) }, quoted ? { quoted } : undefined);
  } catch (e) { if (DEBUG) console.log('[ghost] reveal failed:', e.message); }

  ledger.delete(targetId);
  scheduleSave();
}

// ─────────────────────────────────────────────
//  REVEAL — edit
// ─────────────────────────────────────────────
async function editAlert(sock, { editor, rec, scopeJid, before, after, note }) {
  const bestEditor = await getBestUserJid(editor, sock, scopeJid);
  const bestOriginalSender = await getBestUserJid(rec?.from || editor, sock, scopeJid);
  const selfNum = digitsOf(sock.user?.id || '');
  if (bestEditor && digitsOf(bestEditor) === selfNum) return null;
  if (bestOriginalSender && digitsOf(bestOriginalSender) === selfNum) return null;

  let scope = '';
  if (rec?.scope) { try { scope = (await sock.groupMetadata(rec.scope)).subject; } catch {} }
  const lines = [
    `👻 *ghost ledger · edited*`, ``,
    `*edited by ·* @${digitsOf(bestEditor)}`,
    `*original sender ·* @${digitsOf(bestOriginalSender)}`,
    `*when ·* ${stamp()}`,
  ];
  if (scope) lines.push(`*chat ·* ${scope}`);
  lines.push(``, `*before*`, before || note.before, ``, `*after*`, after || note.after);
  try { await sock.sendMessage(ownerJid(), { text: lines.join('\n'), mentions: [bestEditor, bestOriginalSender] }); } catch (e) { if (DEBUG) console.log('[ghost] edit alert failed:', e.message); }
  return true;
}

export async function revealEdit(sock, msg) {
  if (msg.key?.fromMe) return;
  const s = read();
  if (!s.edit) return;

  let pm = unwrapProtocol(msg).pm;
  if (!pm && msg.message?.editedMessage) {
    const em = msg.message.editedMessage;
    pm = { type: 14, key: em.key || msg.key, editedMessage: em.message || em };
  }
  if (!pm) return;

  const targetId = pm.key?.id || msg.key?.id;
  const afterText = bodyText(pm.editedMessage) || bodyText(pm.editedMessage?.message) || bodyText(pm.editedMessage?.extendedTextMessage) || '';

  const dedupe = `${targetId || ''}:${afterText}`;
  if (processedEdits.has(dedupe)) return;
  markSeen(processedEdits, dedupe, 500);

  const rec = targetId ? ledger.get(targetId) : null;
  const editor = msg.participant || msg.key?.participant || msg.key?.remoteJid;
  const scopeJid = rec?.scope || (msg.key?.remoteJid?.endsWith('@g.us') ? msg.key.remoteJid : null);

  const ok = await editAlert(sock, {
    editor, rec, scopeJid, before: rec?.text || '', after: afterText,
    note: { before: '_…not captured (antiedit was armed after)_', after: '_…empty (could not extract new content)_' },
  });
  if (ok && rec && targetId) { rec.text = afterText || rec.text; rec.editedAt = Date.now(); putLedger(targetId, rec); }
}

export async function revealSecretEdit(sock, msg) {
  if (msg.key?.fromMe) return;
  const s = read();
  if (!s.edit) return;
  const sem = msg.message?.secretEncryptedMessage;
  if (!sem) return;

  const targetId = sem.targetMessageKey?.id || msg.key?.id;
  const editor = msg.key?.participant || msg.key?.remoteJid;
  const rec = targetId ? ledger.get(targetId) : null;
  const scopeJid = rec?.scope || (msg.key?.remoteJid?.endsWith('@g.us') ? msg.key.remoteJid : null);

  const ok = await editAlert(sock, {
    editor, rec, scopeJid, before: rec?.text || '', after: '',
    note: { before: '_…not captured_', after: '_…new text is encrypted by WhatsApp and cannot be read on linked devices_' },
  });
  if (ok && rec && targetId) { rec.editedAt = Date.now(); putLedger(targetId, rec); }
}

// ─────────────────────────────────────────────
//  Housekeeping — 24 h TTL sweep (text only)
// ─────────────────────────────────────────────
setInterval(() => {
  try {
    const cutoff = Date.now() - CONFIG.memoryTTL;
    let changed = false;
    for (const [id, rec] of ledger.entries()) if (rec.at < cutoff) { ledger.delete(id); changed = true; }
    if (changed) scheduleSave();
  } catch (e) { if (DEBUG) console.log('[ghost] sweeper error:', e.message); }
}, 10 * 60 * 1000).unref?.();
