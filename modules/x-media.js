// ─────────────────────────────────────────────
//  Al-Jin Lite · modules/x-media.js     (sharp — static images only, buffer in → buffer out)
//  stickers : take · stickercrop · circle
//  images   : blur · greyscale · pixelate
// ─────────────────────────────────────────────
import { reply, safe, findMedia, mediaBuffer, clamp } from '../lib/x.js';
import { withStickerExif } from '../lib/webp-exif.js';
import { toSticker, circleSticker, blurImage, greyscaleImage, pixelateImage, isAnimatedWebp } from '../lib/img.js';
import { getPrefix } from '../core/settings.js';

const P = () => getPrefix();
class UserError extends Error {}
const need = (cond, msg) => { if (!cond) throw new UserError(msg); };
const pushName = (msg) => String(msg.pushName || '').trim() || 'Al-Jin';

const sendSticker = (sock, chat, msg, webp) => sock.sendMessage(chat, { sticker: webp }, { quoted: msg });

function imageSource(msg, kinds = ['image', 'sticker']) {
    const m = findMedia(msg, kinds);
    need(m, 'Reply to an image or sticker.');
    return m;
}

// ── take ───────────────────────────────────────
export const take = safe('take', async (sock, chat, msg, args) => {
    const m = findMedia(msg, ['sticker']);
    if (!m) return reply(sock, chat, msg, `🏷️ Reply to a sticker:\n\`${P()}take Pack name | Author\`\n\`${P()}take\` — uses “Al-Jin” and your name`);
    const raw = args.join(' ').trim();
    const [packRaw, ...authorParts] = raw ? raw.split('|') : [];
    const pack = (packRaw || '').trim() || 'Al-Jin';
    const author = authorParts.join('|').trim() || pushName(msg);
    const buf = await mediaBuffer(m, 3 * 1024 * 1024);
    return sendSticker(sock, chat, msg, withStickerExif(buf, { packName: pack, author }));
});

// ── stickercrop ────────────────────────────────
export const stickercrop = safe('stickercrop', async (sock, chat, msg) => {
    const m = imageSource(msg);
    need(m.kind !== 'video', 'Videos are not supported in Lite — use an image.');
    const buf = await mediaBuffer(m, 15 * 1024 * 1024);
    need(!isAnimatedWebp(buf), 'Animated stickers can’t be re-cropped.');
    return sendSticker(sock, chat, msg, await toSticker(buf, { crop: true, packName: 'Al-Jin', author: pushName(msg) }));
});

// ── circle ─────────────────────────────────────
export const circle = safe('circle', async (sock, chat, msg) => {
    const m = imageSource(msg);
    const buf = await mediaBuffer(m, 15 * 1024 * 1024);
    need(!isAnimatedWebp(buf), 'Animated stickers are not supported here.');
    return sendSticker(sock, chat, msg, await circleSticker(buf, { packName: 'Al-Jin', author: pushName(msg) }));
});

// ═════════ image effects ═════════
async function imageEffect(sock, chat, msg, name, fn) {
    const m = findMedia(msg, ['image', 'sticker']);
    if (!m) return reply(sock, chat, msg, `Reply to an image with \`${P()}${name}\`.`);
    const buf = await mediaBuffer(m, 20 * 1024 * 1024);
    need(!isAnimatedWebp(buf), 'Animated stickers are not supported here.');
    await sock.sendMessage(chat, { image: await fn(buf) }, { quoted: msg });
}
export const blur = safe('blur', (sock, chat, msg, args) => {
    const n = clamp(parseInt(args[0], 10) || 8, 1, 40);
    return imageEffect(sock, chat, msg, 'blur', (b) => blurImage(b, n));
});
export const greyscale = safe('greyscale', (sock, chat, msg) => imageEffect(sock, chat, msg, 'greyscale', greyscaleImage));
export const pixelate = safe('pixelate', (sock, chat, msg, args) => {
    const n = clamp(parseInt(args[0], 10) || 24, 4, 120);
    return imageEffect(sock, chat, msg, 'pixelate', (b) => pixelateImage(b, n));
});
