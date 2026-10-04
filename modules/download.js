// ─────────────────────────────────────────────
// Al-Jin Lite · modules/download.js
// Platform downloaders — @postfetch/core (posts / reels) + ESM API (YouTube, TikTok, Facebook, …)
// Every file is STREAMED network → WhatsApp. Nothing is written to disk or held in RAM.
// ─────────────────────────────────────────────
import { Readable } from 'node:stream';
import PQueue from 'p-queue';
import { postfetch, download as pfDownload, detect as pfDetect } from '@postfetch/core';
import { sendWithCta } from '../lib/buttons.js';
import { esmYoutubeSend, fetchEsmMedia } from '../lib/esm.js';
import { sendFromUrl } from '../lib/net.js';
import { isYoutubeUrl } from '../lib/ytsearch.js';

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO = 60 * 1024 * 1024;
const RESOLVE_TIMEOUT = 120_000;
const ITEM_DL_TIMEOUT = 90_000;
const ITEM_GAP_MS = 700;
const BRAND = 'Provided by 𝐀𝐥-𝐉𝐢𝐧';
const queue = new PQueue({ concurrency: 1 });

async function react(sock, chat, msg, emoji) { try { await sock.sendMessage(chat, { react: { text: emoji, key: msg.key } }); } catch {} }
async function edit(sock, chat, key, text) { try { await sock.sendMessage(chat, { text, edit: key.key }); } catch {} }
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function isPostUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  if (
    lower.includes('instagram.com/p/') || lower.includes('instagram.com/reel/') || lower.includes('instagram.com/tv/') ||
    (lower.includes('tiktok.com/') && (lower.includes('/photo/') || lower.includes('/video/'))) ||
    (lower.includes('facebook.com/') && (lower.includes('/posts/') || lower.includes('/photos/') || lower.includes('/videos/'))) ||
    lower.includes('fb.watch/') ||
    ((lower.includes('twitter.com/') || lower.includes('x.com/')) && lower.includes('/status/')) ||
    lower.includes('threads.net/') || lower.includes('reddit.com/') ||
    lower.includes('pinterest.com/pin/') || lower.includes('pin.it/')
  ) return true;
  try { return !!pfDetect(url); } catch { return false; }
}

// Sends ONE post item by streaming the response body into the upload. Never throws.
async function sendPostfetchItem(sock, chat, msg, item, idx) {
  try {
    const res = await withTimeout(pfDownload(item), ITEM_DL_TIMEOUT, `item ${idx + 1}`);
    if (res && typeof res.ok === 'boolean' && !res.ok) throw new Error(`HTTP ${res.status}`);
    const ctype = String(res.headers?.get?.('content-type') || item.mime || '').split(';')[0].toLowerCase();
    const len = Number(res.headers?.get?.('content-length') || 0);
    const kind = item.kind || item.type || (ctype.startsWith('video/') ? 'video' : ctype.startsWith('audio/') ? 'audio' : ctype.startsWith('image/') ? 'image' : 'image');
    const limit = kind === 'video' ? MAX_VIDEO : MAX_BYTES;
    if (len && len > limit) { try { res.body?.cancel(); } catch {} return { ok: false, reason: `too large (${(len / 1048576).toFixed(1)} MB)` }; }
    if (!res.body) throw new Error('empty response');
    const stream = Readable.fromWeb(res.body);
    const name = item.filename || `media_${idx + 1}`;
    let content;
    if (kind === 'video') content = { video: { stream }, mimetype: ctype.startsWith('video/') ? ctype : 'video/mp4' };
    else if (kind === 'audio') content = { audio: { stream }, mimetype: ctype.startsWith('audio/') ? ctype : 'audio/mpeg', ptt: false };
    else if (kind === 'image') content = { image: { stream } };
    else content = { document: { stream }, mimetype: ctype || 'application/octet-stream', fileName: name };
    try { await sock.sendMessage(chat, content, { quoted: msg }); }
    catch (e) { try { stream.destroy(); } catch {} throw e; }
    return { ok: true };
  } catch (e) {
    console.warn(`[sendPostfetchItem ${idx + 1}]`, e.message);
    return { ok: false, reason: e.message };
  }
}

async function deliverPostItems(sock, chat, msg, status, items) {
  const total = Math.min(items.length, 20);
  let sent = 0;
  const failed = [];
  for (let i = 0; i < total; i++) {
    await edit(sock, chat, status, `📤 *Sending ${i + 1}/${total}…*`);
    const r = await sendPostfetchItem(sock, chat, msg, items[i], i);
    if (r.ok) sent++; else failed.push({ n: i + 1, reason: r.reason || 'send failed' });
    if (i < total - 1) await sleep(ITEM_GAP_MS);
  }
  return { sent, total, failed };
}

async function finishPostDelivery(sock, chat, msg, status, r) {
  if (r.failed.length === 0) {
    await edit(sock, chat, status, `✅ *Download complete* (${r.sent}/${r.total} sent)\n\n${BRAND}`);
    await react(sock, chat, msg, '☑');
    return;
  }
  const why = r.failed.slice(0, 5).map((f) => `• #${f.n}: ${f.reason}`).join('\n');
  await edit(sock, chat, status, `⚠️ *Sent ${r.sent}/${r.total}*\n${why}\n\n${BRAND}`);
  await react(sock, chat, msg, '⚠️');
}

export async function downloadPostMediaDirect(sock, chat, msg, url) {
  if (!isPostUrl(url)) {
    return sock.sendMessage(chat, { text: '❌ *Not a post URL:* try `.dl <url>` for videos.' }, { quoted: msg });
  }
  const status = await sock.sendMessage(chat, { text: '📦 *Postfetch:* resolving post media…' }, { quoted: msg });
  try {
    const result = await withTimeout(postfetch(url), RESOLVE_TIMEOUT, 'postfetch resolve');
    if (!result?.items?.length) throw new Error('No media items found in this post');
    const r = await deliverPostItems(sock, chat, msg, status, result.items);
    if (r.sent === 0) {
      const why = r.failed.slice(0, 3).map((f) => `#${f.n}: ${f.reason}`).join('; ');
      throw new Error(`Nothing could be sent${why ? ` — ${why}` : ''}`);
    }
    await finishPostDelivery(sock, chat, msg, status, r);
  } catch (e) {
    console.error('[postfetch]', e.message);
    await edit(sock, chat, status, `❌ *Post download failed:* ${e.message}`);
    await react(sock, chat, msg, '❌');
  }
}

// Generic link: post → postfetch · YouTube → ESM · TikTok / Facebook / other → ESM chains
async function downloadAny(sock, chat, msg, query, audioOnly) {
  const status = await sock.sendMessage(chat, { text: `${audioOnly ? '🎵' : '⬇️'} *${audioOnly ? '.mp3' : '.dl'}:* ${query.slice(0, 80)}` }, { quoted: msg });
  try {
    if (!/^https?:\/\//i.test(query)) throw new Error('send a link — for songs use .play <name>');

    if (isYoutubeUrl(query)) {
      await esmYoutubeSend(sock, chat, msg, query, { type: audioOnly ? 'audio' : 'video', maxBytes: MAX_VIDEO, caption: (i) => `${i.title ? `🎬 *${i.title}*\n\n` : ''}${BRAND}` });
    } else if (!audioOnly && isPostUrl(query)) {
      await edit(sock, chat, status, '🖼️ *Fetching post media (@postfetch/core)…*');
      const result = await withTimeout(postfetch(query), RESOLVE_TIMEOUT, 'postfetch resolve').catch(() => null);
      let ok = false;
      if (result?.items?.length) {
        const r = await deliverPostItems(sock, chat, msg, status, result.items);
        if (r.sent > 0) { await finishPostDelivery(sock, chat, msg, status, r); return; }
      }
      if (!ok) await fromEsm(sock, chat, msg, status, query, audioOnly);
    } else {
      await fromEsm(sock, chat, msg, status, query, audioOnly);
    }
    await edit(sock, chat, status, `✅ *Download complete*\n\n${BRAND}`);
    await react(sock, chat, msg, '☑');
  } catch (e) {
    console.error('[download]', e.message);
    await edit(sock, chat, status, `❌ *Failed:* ${e.message}`).catch(() => {});
    await react(sock, chat, msg, '❌');
  }
}

async function fromEsm(sock, chat, msg, status, url, audioOnly) {
  await edit(sock, chat, status, '🌐 *Fetching via ESM API…*');
  const family = /tiktok\.com/i.test(url) ? ['tiktok', 'aio'] : /facebook\.com|fb\.watch|fb\.com/i.test(url) ? ['facebook', 'aio'] : ['aio'];
  const items = await fetchEsmMedia(family, url);
  let lastErr = null;
  for (const item of items.slice(0, 3)) {
    try {
      await sendFromUrl(sock, chat, msg, item.url, { kind: audioOnly ? 'audio' : (item.isVideo ? 'video' : 'image'), caption: audioOnly ? undefined : BRAND, maxBytes: MAX_VIDEO, minBytes: 1024, mimetype: audioOnly ? 'audio/mpeg' : undefined });
      return;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('No downloadable URL found');
}

export async function ytdlCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').replace(/--direct/gi, '').trim();
  if (!query) return sendWithCta(sock, chat, '❌ Usage: `.dl <url>`', { quoted: msg });
  return queue.add(() => downloadAny(sock, chat, msg, query, false));
}

export async function mp3Command(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) return sendWithCta(sock, chat, '❌ Usage: `.mp3 <YouTube url>` (for a song name use `.play <name>`)', { quoted: msg });
  return queue.add(() => downloadAny(sock, chat, msg, query, true));
}

export async function pdlCommand(sock, chat, msg, args) {
  const input = (args || []).join(' ').replace(/\bzip\b|--zip/gi, '').trim();
  if (!input) return sendWithCta(sock, chat, '📦 *pdl* — download post / carousel / reel media\n\nUsage: `.pdl <post-url>`', { quoted: msg });
  return queue.add(() => downloadPostMediaDirect(sock, chat, msg, input));
}

const viaPost = (usage) => async (sock, chat, msg, args) => {
  const query = (args || []).join(' ').trim();
  if (!query) return sendWithCta(sock, chat, usage, { quoted: msg });
  return isPostUrl(query) ? pdlCommand(sock, chat, msg, args) : ytdlCommand(sock, chat, msg, args);
};
export const twitterCommand = viaPost('❌ Usage: `.twitter <tweet-url>` or `.tw <tweet-url>`');
export const pinterestCommand = viaPost('❌ Usage: `.pinterest <pin-url>` or `.pin <pin-url>`');
export const threadsCommand = viaPost('❌ Usage: `.threads <threads-url>`');
export const redditCommand = viaPost('❌ Usage: `.reddit <reddit-post-url>`');
export const youtubeCommand = async (sock, chat, msg, args) => {
  const query = (args || []).join(' ').trim();
  if (!query) return sendWithCta(sock, chat, '❌ Usage: `.youtube <url or query>` or `.yt <url or query>`', { quoted: msg });
  if (/^https?:\/\//i.test(query)) return ytdlCommand(sock, chat, msg, args);
  const { ytvCommand } = await import('./yt-esm.js');
  return ytvCommand(sock, chat, msg, args);
};
