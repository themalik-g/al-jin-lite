// ─────────────────────────────────────────────
// Al-Jin Lite · modules/stickers.js  (sharp — static images only, no ffmpeg, no temp files)
//   .sticker (.s)  image / static sticker  →  WhatsApp sticker   (add `crop` to fill the square)
//   .toimg         sticker                 →  image (JPEG; first frame if animated)
// Video / GIF → sticker needs ffmpeg and is not part of the Lite edition.
// ─────────────────────────────────────────────
import PQueue from 'p-queue';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { toSticker, toJpeg, sharpenImage } from '../lib/img.js';

const BRAND = 'Provided by 𝐀𝐥-𝐉𝐢𝐧';
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const queue = new PQueue({ concurrency: 1 });   // one conversion at a time → flat RAM/CPU

const unwrap = (x) => x?.ephemeralMessage?.message || x?.viewOnceMessage?.message || x?.viewOnceMessageV2?.message
  || x?.documentWithCaptionMessage?.message || x;

function contextOf(m) {
  return m?.extendedTextMessage?.contextInfo || m?.imageMessage?.contextInfo || m?.videoMessage?.contextInfo
    || m?.documentMessage?.contextInfo || m?.stickerMessage?.contextInfo;
}

function pickImage(x) {
  if (!x) return null;
  if (x.imageMessage) return { node: x.imageMessage, kind: 'image' };
  if (x.stickerMessage) return { node: x.stickerMessage, kind: 'sticker' };
  const d = x.documentMessage;
  if (d && /^image\//i.test(d.mimetype || '')) return { node: d, kind: 'document' };
  return null;
}

async function toBuffer(node, kind) {
  const stream = await downloadContentFromMessage(node, kind);
  const chunks = []; let n = 0;
  for await (const c of stream) { n += c.length; if (n > MAX_INPUT_BYTES) throw new Error('file too large'); chunks.push(c); }
  return Buffer.concat(chunks);
}

export async function stickerCommand(sock, chat, msg, args = []) {
  const reply = (text) => sock.sendMessage(chat, { text }, { quoted: msg }).catch(() => {});
  try {
    const m = unwrap(msg.message) || {};
    const quoted = unwrap(contextOf(m)?.quotedMessage);
    const src = pickImage(quoted) || pickImage(m);
    if (!src) {
      const hasVideo = quoted?.videoMessage || m.videoMessage;
      return await reply(hasVideo
        ? '⚠️ Video / GIF stickers are not available in the Lite edition. Send an *image*.'
        : '🎨 *sticker*\n\nSend or reply to an image with `.sticker` (or `.s`).\nAdd `crop` to fill the whole square: `.sticker crop`');
    }
    if (Number(src.node.fileLength || 0) > MAX_INPUT_BYTES) return await reply('⚠️ That file is too large for a sticker (max 15 MB).');
    const crop = args.some((a) => /^(crop|fill|full)$/i.test(a));
    await queue.add(async () => {
      const webp = await toSticker(await toBuffer(src.node, src.kind), { crop, packName: 'Al-Jin', author: msg.pushName || '' });
      await sock.sendMessage(chat, { sticker: webp }, { quoted: msg });
    });
  } catch (e) {
    console.error('[sticker]', e?.message || e);
    await reply(`⚠️ Sticker creation failed: ${e?.message || 'the image could not be converted'}.`);
  }
}

export async function toimgCommand(sock, chat, msg, args = []) {
  const reply = (text) => sock.sendMessage(chat, { text }, { quoted: msg }).catch(() => {});
  try {
    const m = unwrap(msg.message) || {};
    const quoted = unwrap(contextOf(m)?.quotedMessage);
    const node = quoted?.stickerMessage || m.stickerMessage;
    if (!node) return await reply('🖼️ *toimg*\n\nReply to a sticker with `.toimg`.\nAdd `black` for a black background (default white).');
    const background = args.some((a) => /^black$/i.test(a)) ? '#000000' : '#ffffff';
    await queue.add(async () => {
      const jpg = await toJpeg(await toBuffer(node, 'sticker'), { background });
      await sock.sendMessage(chat, { image: jpg, caption: BRAND }, { quoted: msg });
    });
  } catch (e) {
    console.error('[toimg]', e?.message || e);
    await reply(`⚠️ Conversion failed: ${e?.message || 'the sticker could not be converted'}.`);
  }
}

// ── .hd / .enhance — sharpen + normalise an image ──────────────────────────
export async function enhanceCommand(sock, chat, msg) {
  const reply = (text) => sock.sendMessage(chat, { text }, { quoted: msg }).catch(() => {});
  try {
    const m = unwrap(msg.message) || {};
    const src = pickImage(unwrap(contextOf(m)?.quotedMessage)) || pickImage(m);
    if (!src || src.kind === 'sticker') return await reply('✨ Reply to an *image* with `.hd` (or `.enhance`).');
    await queue.add(async () => {
      const out = await sharpenImage(await toBuffer(src.node, src.kind));
      await sock.sendMessage(chat, { image: out, caption: BRAND }, { quoted: msg });
    });
  } catch (e) { await reply(`⚠️ enhance failed: ${e?.message || 'could not process the image'}.`); }
}

// ── .exifwipe / .sanitize — re-encode an image without any metadata ────────
export async function exifwipeCommand(sock, chat, msg) {
  const reply = (text) => sock.sendMessage(chat, { text }, { quoted: msg }).catch(() => {});
  try {
    const m = unwrap(msg.message) || {};
    const src = pickImage(unwrap(contextOf(m)?.quotedMessage)) || pickImage(m);
    if (!src || src.kind === 'sticker') return await reply('🧼 Reply to an *image* with `.sanitize` — it is re-encoded with all EXIF / GPS data removed.');
    await queue.add(async () => {
      const out = await toJpeg(await toBuffer(src.node, src.kind), { maxSide: 4000, quality: 92 });   // sharp drops metadata by default
      await sock.sendMessage(chat, { document: out, mimetype: 'image/jpeg', fileName: `clean_${Date.now()}.jpg`, caption: '🧼 metadata removed' }, { quoted: msg });
    });
  } catch (e) { await reply(`⚠️ sanitize failed: ${e?.message || 'could not process the image'}.`); }
}
