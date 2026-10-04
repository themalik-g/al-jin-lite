// Al-Jin Lite · lib/getmedia.js — read the media of a message (or its quoted message) into a Buffer.
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

const MAX = 25 * 1024 * 1024;
export async function getMediaFromMsg(msg) {
  const own = msg.message || {};
  const q = own.extendedTextMessage?.contextInfo?.quotedMessage || {};
  for (const src of [own, q]) {
    const pairs = [['imageMessage', 'image'], ['videoMessage', 'video'], ['documentMessage', 'document'], ['audioMessage', 'audio']];
    for (const [k, kind] of pairs) {
      const node = src[k];
      if (!node) continue;
      const stream = await downloadContentFromMessage(node, kind);
      const chunks = []; let n = 0;
      for await (const c of stream) { n += c.length; if (n > MAX) throw new Error('file is too large'); chunks.push(c); }
      return { buffer: Buffer.concat(chunks), kind, mimetype: node.mimetype || 'application/octet-stream', fileName: node.fileName || `file_${Date.now()}` };
    }
  }
  return null;
}
