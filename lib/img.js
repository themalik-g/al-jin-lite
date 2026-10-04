// ─────────────────────────────────────────────
// Al-Jin Lite · lib/img.js
// The ONLY image processor in the bot: `sharp` (libvips) — lazy-loaded,
// buffer in → buffer out, no temp files, no ffmpeg. Static images only.
// ─────────────────────────────────────────────
import { withStickerExif } from './webp-exif.js';

let _sharp = null;
async function S() {
  if (!_sharp) {
    const m = await import('sharp');
    _sharp = m.default;
    _sharp.cache(false);        // do not keep decoded images in RAM
    _sharp.concurrency(1);      // one libvips thread → low CPU spikes
  }
  return _sharp;
}

const open = async (buf, opts = {}) => (await S())(buf, { failOn: 'none', limitInputPixels: 50_000_000, ...opts });

const need = (buf) => {
  if (!Buffer.isBuffer(buf) || buf.length < 64) throw new Error('input image is empty');
};

/** Square cover-crop JPEG (profile pictures). */
export async function resizeSquare(buf, size = 640, quality = 90) {
  need(buf);
  return (await open(buf)).rotate().resize(size, size, { fit: 'cover' }).jpeg({ quality }).toBuffer();
}

/** Padded square JPEG — whole image visible (hddp). */
export async function containSquare(buf, size, background = 'black', quality = 92) {
  need(buf);
  const bg = background === 'white' ? { r: 255, g: 255, b: 255, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 1 };
  return (await open(buf)).rotate().resize(size, size, { fit: 'contain', background: bg }).jpeg({ quality }).toBuffer();
}

/** Original shape, longest side ≤ maxSide (fulldp). */
export async function fitInside(buf, maxSide, quality = 92) {
  need(buf);
  return (await open(buf)).rotate().resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality }).toBuffer();
}

/** Any image (incl. sticker/webp, first frame) → JPEG. */
export async function toJpeg(buf, { maxSide = 1700, quality = 88, background = '#ffffff' } = {}) {
  need(buf);
  return (await open(buf)).rotate().resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background }).jpeg({ quality }).toBuffer();
}

/** Static WebP sticker (512x512, ≤ 95 KB) with pack metadata. */
export async function toSticker(buf, { crop = false, packName = 'Al-Jin', author = '' } = {}) {
  need(buf);
  const base = (await open(buf)).rotate().resize(512, 512, crop
    ? { fit: 'cover' }
    : { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha();
  const raw = await base.png().toBuffer();
  let out;
  for (const q of [80, 60, 40, 25]) {
    out = await (await open(raw)).webp({ quality: q, effort: 2 }).toBuffer();
    if (out.length <= 95 * 1024) break;
  }
  if (out.length > 100 * 1024) throw new Error('the result is too large for a sticker');
  try { out = withStickerExif(out, { packName, author }); } catch { /* sticker still valid without metadata */ }
  return out;
}

export async function blurImage(buf, sigma = 8) {
  need(buf);
  return (await open(buf)).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .blur(Math.min(50, Math.max(0.5, sigma))).jpeg({ quality: 85 }).toBuffer();
}

export async function greyscaleImage(buf) {
  need(buf);
  return (await open(buf)).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .greyscale().jpeg({ quality: 85 }).toBuffer();
}

export async function pixelateImage(buf, block = 12) {
  need(buf);
  const img = (await open(buf)).rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true });
  const { data, info } = await img.toBuffer({ resolveWithObject: true });
  const w = Math.max(1, Math.round(info.width / block));
  const h = Math.max(1, Math.round(info.height / block));
  const small = await (await open(data)).resize(w, h, { kernel: 'nearest' }).toBuffer();
  return (await open(small)).resize(info.width, info.height, { kernel: 'nearest' }).jpeg({ quality: 85 }).toBuffer();
}

export async function sharpenImage(buf) {
  need(buf);
  return (await open(buf)).rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .normalise().sharpen({ sigma: 1.2 }).jpeg({ quality: 92 }).toBuffer();
}

/** Round sticker (static). */
export async function circleSticker(buf, { packName = 'Al-Jin', author = '' } = {}) {
  need(buf);
  const mask = Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="#fff"/></svg>');
  const png = await (await open(buf)).rotate().resize(512, 512, { fit: 'cover' }).ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  let out = await (await open(png)).webp({ quality: 75, effort: 2 }).toBuffer();
  try { out = withStickerExif(out, { packName, author }); } catch {}
  return out;
}

/** Solid colour swatch PNG (for .color). */
export async function solidColor(hex, size = 320) {
  const s = await S();
  return s({ create: { width: size, height: size, channels: 3, background: hex } }).png().toBuffer();
}

/** True for animated WebP (has an ANIM chunk). */
export function isAnimatedWebp(buf) {
  return Buffer.isBuffer(buf) && buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP' && buf.includes('ANIM');
}
