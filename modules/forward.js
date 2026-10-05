// ─────────────────────────────────────────────
// Al-Jin · modules/forward.js
// .forward <number | jid | lid>   (reply to any message / media)
// .forward <custom text> <number | jid | lid>
//
// • Replied message (text, image, video, audio, voice, sticker, document, …)
//   is forwarded with WhatsApp's native forward, so nothing is downloaded
//   or written to disk.
// • If native forward is rejected, media is re-sent from an in-memory buffer
//   (still no disk / vault usage).
// ─────────────────────────────────────────────
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { resolveTargetUniversal, getBestUserJid } from '../core/jid-resolver.js';
import { sendWithCta } from '../lib/buttons.js';

// Content sent to the recipient is the user's own — no "forwarded from channel" stamp.
const NOCTX = { channelCtx: false };

const MEDIA_KINDS = {
  imageMessage:    'image',
  videoMessage:    'video',
  audioMessage:    'audio',
  stickerMessage:  'sticker',
  documentMessage: 'document',
  ptvMessage:      'video',
};

// ── unwrap ephemeral / view-once / caption wrappers ─────────────
function unwrap(message) {
  let m = message;
  for (let i = 0; i < 6 && m; i++) {
    const inner =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message ||
      m.editedMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m || null;
}

// contextInfo can live inside ANY message type (text, image caption, …)
function getContext(msg) {
  const m = unwrap(msg?.message);
  if (!m) return null;
  for (const v of Object.values(m)) {
    if (v && typeof v === 'object' && v.contextInfo) return v.contextInfo;
  }
  return null;
}

function looksLikeTarget(tok = '') {
  if (!tok) return false;
  if (tok.includes('@') && !tok.startsWith('@')) return true;
  const digits = tok.replace(/\D/g, '');
  return /^[+\d][\d\s-]*$/.test(tok) && digits.length >= 7 && digits.length <= 15;
}

async function resolveTarget(sock, raw) {
  let jid = null;
  try {
    const r = await resolveTargetUniversal(sock, raw);
    jid = r?.jid || null;
  } catch { /* fall through */ }

  if (!jid) {
    if (raw.includes('@')) jid = raw;
    else {
      const d = raw.replace(/\D/g, '');
      if (d.length >= 7) jid = `${d}@s.whatsapp.net`;
    }
  }
  if (jid && jid.endsWith('@lid')) {
    try { const best = await getBestUserJid(jid, sock); if (best) jid = best; } catch { /* keep lid */ }
  }
  return jid;
}

async function toBuffer(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

// Memory-only fallback when native forward is rejected
async function resendFromMemory(sock, target, qm, customText) {
  const content = unwrap(qm) || qm;

  for (const [prop, kind] of Object.entries(MEDIA_KINDS)) {
    const node = content[prop];
    if (!node) continue;
    const buf = await toBuffer(await downloadContentFromMessage(node, kind));
    const caption = customText || node.caption || undefined;
    if (kind === 'image')   return sock.sendMessage(target, { image: buf, caption }, NOCTX);
    if (kind === 'video')   return sock.sendMessage(target, { video: buf, caption, gifPlayback: !!node.gifPlayback }, NOCTX);
    if (kind === 'sticker') return sock.sendMessage(target, { sticker: buf }, NOCTX);
    if (kind === 'audio') {
      if (customText) await sock.sendMessage(target, { text: customText }, NOCTX);
      return sock.sendMessage(target, { audio: buf, mimetype: node.mimetype || 'audio/mpeg', ptt: !!node.ptt }, NOCTX);
    }
    return sock.sendMessage(target, {
      document: buf,
      mimetype: node.mimetype || 'application/octet-stream',
      fileName: node.fileName || 'file',
      caption,
    }, NOCTX);
  }

  const text = customText || content.conversation || content.extendedTextMessage?.text || '';
  if (!text) throw new Error('This message type cannot be forwarded.');
  return sock.sendMessage(target, { text }, NOCTX);
}

export async function forwardCommand(sock, chat, msg, args) {
  const tokens = (args || []).map(String).filter(Boolean);
  const ctx = getContext(msg);
  const quotedMessage = ctx?.quotedMessage || null;

  if (!tokens.length) {
    return sendWithCta(
      sock, chat,
      '⏩ *Forward*\n\n' +
      'Reply to any message or media with:\n' +
      '• `.forward <number | jid | lid>`\n' +
      '• `.forward <custom text> <number | jid | lid>`\n\n' +
      'Examples:\n• `.forward 923001234567`\n• `.forward 120363…@g.us`\n• `.forward 1234567890@lid`',
      { quoted: msg }
    );
  }

  // target = last token that looks like a number/jid, otherwise the first one
  let idx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) if (looksLikeTarget(tokens[i])) { idx = i; break; }
  if (idx === -1) {
    return sock.sendMessage(chat, { text: `❌ Invalid recipient: \`${tokens[tokens.length - 1]}\`` }, { quoted: msg });
  }
  const targetRaw = tokens[idx];
  const customText = tokens.filter((_, i) => i !== idx).join(' ').trim();

  const target = await resolveTarget(sock, targetRaw);
  if (!target) {
    return sock.sendMessage(chat, { text: `❌ Could not resolve: \`${targetRaw}\`` }, { quoted: msg });
  }

  try {
    if (!quotedMessage) {
      if (!customText) throw new Error('Reply to a message, or give some text to send.');
      await sock.sendMessage(target, { text: customText }, NOCTX);
    } else if (customText) {
      // custom text overrides the caption / text, so re-send with it
      await resendFromMemory(sock, target, quotedMessage, customText);
    } else {
      const myId = (sock.user?.id || '').replace(/:\d+@/, '@');
      const fwdKey = {
        remoteJid: chat,
        id: ctx.stanzaId,
        fromMe: !!ctx.participant && ctx.participant.replace(/:\d+@/, '@') === myId,
        participant: ctx.participant || undefined,
      };
      try {
        await sock.sendMessage(target, { forward: { key: fwdKey, message: quotedMessage }, force: true });
      } catch (e) {
        console.warn('[forward] native forward failed, falling back:', e?.message);
        await resendFromMemory(sock, target, quotedMessage, '');
      }
    }

    await sock.sendMessage(chat, { text: `✅ Forwarded to \`${target}\`` }, { quoted: msg });
  } catch (err) {
    console.error('[forwardCommand]', err);
    await sock.sendMessage(chat, { text: `❌ Forward failed: ${err.message}` }, { quoted: msg }).catch(() => {});
  }
}
