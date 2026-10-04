// ─────────────────────────────────────────────
// Al-Jin Lite · core/relay.js
// Zero-storage media relay.
//
//  • relayMedia() re-sends an incoming media message to another chat by
//    REFERENCE (same WhatsApp server copy) — the bot downloads nothing and
//    keeps nothing: no RAM buffer, no disk file.
//  • If WhatsApp refuses the reference, it falls back to piping the download
//    stream straight into the upload stream (still no file, no buffer).
//  • Sends are serialised with a small gap so a busy group cannot flood the
//    account.
// ─────────────────────────────────────────────
import { downloadContentFromMessage, generateWAMessageFromContent, jidNormalizedUser } from '@whiskeysockets/baileys';

const DEBUG = process.env.WRAITH_DEBUG === '1';
const GAP_MS = Number(process.env.ALJIN_RELAY_GAP_MS || 350);
const MAX_BYTES = Number(process.env.ALJIN_RELAY_MAX_MB || 150) * 1024 * 1024;

const KINDS = [
  ['imageMessage', 'image'],
  ['videoMessage', 'video'],
  ['audioMessage', 'audio'],
  ['stickerMessage', 'sticker'],
  ['documentMessage', 'document'],
  ['ptvMessage', 'video'],
];

const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage', 'editedMessage'];

/** Strip every wrapper (ephemeral / view-once / doc-with-caption) → inner content. */
export function unwrapContent(message) {
  let cur = message;
  let viaViewOnce = false;
  for (let i = 0; i < 6 && cur; i++) {
    let next = null;
    for (const w of WRAPPERS) {
      if (cur[w]?.message) {
        if (w.startsWith('viewOnce')) viaViewOnce = true;
        next = cur[w].message;
        break;
      }
    }
    if (!next) break;
    cur = next;
  }
  return { content: cur || null, viaViewOnce };
}

/** Describe the media inside a message, or null if it has none. */
export function mediaNodeOf(message) {
  const { content, viaViewOnce } = unwrapContent(message);
  if (!content) return null;
  for (const [contentKey, type] of KINDS) {
    const node = content[contentKey];
    if (node) {
      return {
        contentKey, type, node,
        viewOnce: viaViewOnce || node.viewOnce === true,
        size: Number(node.fileLength?.toString?.() ?? node.fileLength ?? 0) || 0,
        caption: node.caption || '',
        content,
      };
    }
  }
  return null;
}

/** Plain text of any message (for the text ledger). */
export function textOf(message) {
  const { content } = unwrapContent(message);
  if (!content) return '';
  return String(content.conversation || content.extendedTextMessage?.text || content.imageMessage?.caption
    || content.videoMessage?.caption || content.documentMessage?.caption || '').trim();
}

/** The bot's own chat ("message yourself"). */
export function ownChat(sock) {
  const id = sock?.user?.id || '';
  return id ? jidNormalizedUser(id) : null;
}

// ── serial queue ─────────────────────────────
let chain = Promise.resolve();
function enqueue(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(() => new Promise((r) => setTimeout(r, GAP_MS)), () => new Promise((r) => setTimeout(r, GAP_MS)));
  return run;
}

async function relayByReference(sock, dest, info, original) {
  const clean = { ...info.node };
  delete clean.viewOnce;          // the copy is a normal message
  delete clean.contextInfo;       // drop quoted text / mentions of the original
  clean.contextInfo = { isForwarded: true, forwardingScore: 1 };
  const content = { [info.contentKey]: clean };
  if (original?.message?.messageContextInfo) content.messageContextInfo = original.message.messageContextInfo;
  const waMsg = generateWAMessageFromContent(dest, content, { userJid: sock.user?.id });
  await sock.relayMessage(dest, waMsg.message, { messageId: waMsg.key.id });
  return waMsg;
}

async function relayByStream(sock, dest, info) {
  const stream = await downloadContentFromMessage(info.node, info.type === 'sticker' ? 'sticker' : info.type);
  const payload = { [info.type]: { stream } };
  if (info.type === 'image' || info.type === 'video') { if (info.caption) payload.caption = info.caption; }
  if (info.type === 'video') payload.mimetype = info.node.mimetype || 'video/mp4';
  if (info.type === 'audio') { payload.mimetype = info.node.mimetype || 'audio/ogg; codecs=opus'; payload.ptt = !!info.node.ptt; }
  if (info.type === 'document') { payload.mimetype = info.node.mimetype || 'application/octet-stream'; payload.fileName = info.node.fileName || 'file'; if (info.caption) payload.caption = info.caption; }
  return sock.sendMessage(dest, payload);
}

/**
 * Relay the media of `msg` to `dest`.
 * Resolves { id, jid, at, method } on success, or null (nothing relayed).
 */
export function relayMedia(sock, dest, msg, info = mediaNodeOf(msg?.message)) {
  if (!info || !dest) return Promise.resolve(null);
  if (info.size > MAX_BYTES) {
    if (DEBUG) console.log(`[relay] skipped ${info.type} (${(info.size / 1048576).toFixed(0)} MB > cap)`);
    return Promise.resolve(null);
  }
  return enqueue(async () => {
    try {
      const sent = await relayByReference(sock, dest, info, msg);
      return { id: sent.key.id, jid: dest, at: Date.now(), method: 'reference' };
    } catch (e1) {
      if (DEBUG) console.log('[relay] reference failed, streaming:', e1.message);
      try {
        const sent = await relayByStream(sock, dest, info);
        return { id: sent?.key?.id || null, jid: dest, at: Date.now(), method: 'stream' };
      } catch (e2) {
        if (DEBUG) console.log('[relay] stream failed:', e2.message);
        return null;
      }
    }
  });
}
