// ─────────────────────────────────────────────
// Al-Jin · modules/esm-commands.js
// ESM API commands: .jindl .jinvideo .jinytsearch .jinimage .jinai .jinapk
// Endpoint names / parameters follow the live list on esm.apiis.dpdns.org
// (AI endpoints take ?text= or ?prompt=, everything else takes ?url=).
//
// • YouTube downloads use the /youtube/* endpoints (confirmed working format).
// • Other ESM endpoints (aio / ai / apk / image) are tried first, and every
//   command falls back to a built-in source if ESM fails.
// • Errors go back to WhatsApp; temp files are always deleted.
// ─────────────────────────────────────────────
import { fetchEsmApi, esmErrorMessage, esmYoutubeSend, fetchEsmInstagram, instagramDownloadHeaders, fetchEsmMedia, pickMediaUrls, esmFindArray } from '../lib/esm.js';
import { ytSearch, isYoutubeUrl } from '../lib/ytsearch.js';
import { sendFromUrl } from '../lib/net.js';

const BRAND = 'Provided by 𝐀𝐥-𝐉𝐢𝐧';
const MAX_VIDEO = 80 * 1024 * 1024;
const MAX_APK = 100 * 1024 * 1024;
const MAX_IMAGE = 10 * 1024 * 1024;
const isUrl = (s) => /^https?:\/\//i.test(String(s || ''));
const isInstagramUrl = (s) => /^https?:\/\/((www|m)\.)?instagram\.com\//i.test(String(s || ''));
const MAX_IG_ITEMS = 6;

// ── small helpers ────────────────────────────
async function react(sock, msg, emoji) {
  try { await sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } }); } catch {}
}

async function edit(sock, chat, statusMsg, text) {
  try {
    if (statusMsg?.key) await sock.sendMessage(chat, { text, edit: statusMsg.key });
    else await sock.sendMessage(chat, { text });
  } catch {}
}

function isOkPayload(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.status === false || data.success === false || data.error) return false;
  if (typeof data.status === 'string' && /^(error|fail|failed)$/i.test(data.status)) return false;
  return Boolean(data.status || data.success || data.data || data.result);
}

/** Generic ESM call → parsed JSON, or throws ONE readable Error. */
async function esmJson(endpoint, params) {
  const res = await fetchEsmApi(endpoint, params);
  if (!res.ok || !isOkPayload(res.data)) {
    const err = new Error(esmErrorMessage(res));
    err.denied = Boolean(res.denied);
    throw err;
  }
  return res.data;
}

// ── .jindl ───────────────────────────────────
export async function jindlCommand(sock, chat, msg, args) {
  const url = (args || []).join(' ').trim();
  if (!url) return sock.sendMessage(chat, { text: '📥 Usage: `.jindl <media-url>`' }, { quoted: msg });
  let st;
  try {
    st = await sock.sendMessage(chat, { text: '📥 *Jindl:* fetching media via ESM API…' }, { quoted: msg });
    const push = (item, caption = BRAND) => sendFromUrl(sock, chat, msg, item.url, { kind: item.isVideo ? 'video' : 'image', caption, maxBytes: MAX_VIDEO, minBytes: 1024 });

    if (isYoutubeUrl(url)) {
      await esmYoutubeSend(sock, chat, msg, url, { type: 'video', maxBytes: MAX_VIDEO, caption: (i) => `${i.title ? `🎬 *${i.title}*\n\n` : ''}${BRAND}` });
    } else if (isInstagramUrl(url)) {
      const media = (await fetchEsmInstagram(url)).slice(0, MAX_IG_ITEMS);
      let sent = 0; let lastErr = null;
      for (const item of media) {
        try {
          const { openStream } = await import('../lib/net.js');
          const { stream } = await openStream(item.url, { headers: instagramDownloadHeaders(), maxBytes: MAX_VIDEO, minBytes: 1024 });
          await sock.sendMessage(chat, item.isVideo ? { video: { stream }, mimetype: 'video/mp4', caption: BRAND } : { image: { stream }, caption: BRAND }, { quoted: msg });
          sent++;
        } catch (err) { lastErr = err; }
      }
      if (!sent) throw lastErr || new Error('Could not download the Instagram media.');
    } else {
      const family = /(^|\.)(tiktok\.com)\//i.test(url) || /vm\.tiktok|vt\.tiktok/i.test(url) ? ['tiktok', 'aio']
        : /facebook\.com|fb\.watch|fb\.com/i.test(url) ? ['facebook', 'aio']
          : ['aio'];
      const items = await fetchEsmMedia(family, url);
      let sent = false; let lastErr = null;
      for (const item of items.slice(0, 3)) {
        try { await push(item); sent = true; break; } catch (err) { lastErr = err; }
      }
      if (!sent) throw lastErr || new Error('No downloadable URL found in response.');
    }
    await edit(sock, chat, st, '✅ *Jindl:* complete');
    await react(sock, msg, '☑');
  } catch (e) {
    await edit(sock, chat, st, `❌ *Jindl failed:* ${e.message}`);
    await react(sock, msg, '❌');
  }
}

// ── .jinvideo ────────────────────────────────
export async function jinvideoCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) return sock.sendMessage(chat, { text: '🎬 Usage: `.jinvideo <YouTube url or search query>`' }, { quoted: msg });
  let st;
  try {
    st = await sock.sendMessage(chat, { text: '🎬 *Jinvideo:* fetching video via ESM API…' }, { quoted: msg });
    let target = query; let title = null;
    if (!isUrl(query)) {
      const hit = (await ytSearch(query, 1))[0];
      if (!hit) throw new Error('No video found for that search.');
      target = hit.url; title = hit.title;
      await edit(sock, chat, st, `🎬 *Found:* ${title}\n⏬ Downloading…`);
    } else if (!isYoutubeUrl(query)) {
      throw new Error('ESM video download supports YouTube links only.');
    }
    await esmYoutubeSend(sock, chat, msg, target, {
      type: 'video', maxBytes: MAX_VIDEO,
      caption: (i) => `${[`🎬 *${i.title || title || 'YouTube Video'}*`, i.author && `👤 ${i.author}`, i.duration && `⏱ ${i.duration}`].filter(Boolean).join('\n')}\n\n${BRAND}`,
    });
    await edit(sock, chat, st, '✅ *Jinvideo:* complete');
    await react(sock, msg, '☑');
  } catch (e) {
    await edit(sock, chat, st, `❌ *Jinvideo failed:* ${e.message}`);
    await react(sock, msg, '❌');
  }
}

// ── .jinytsearch ─────────────────────────────
export async function jinytsearchCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) return sock.sendMessage(chat, { text: '🔍 Usage: `.jinytsearch <query>`' }, { quoted: msg });
  let st;
  try {
    st = await sock.sendMessage(chat, { text: '🔍 *Jinytsearch:* searching YouTube…' }, { quoted: msg });
    const items = await ytSearch(query, 5);
    const lines = [`🔍 *YouTube results for "${query}"*`, ''];
    items.forEach((it, i) => {
      lines.push(`*${i + 1}. ${it.title}*`);
      if (it.channel) lines.push(`👤 ${it.channel}`);
      if (it.duration) lines.push(`⏱ ${it.duration}`);
      lines.push(`🔗 ${it.url}`, '');
    });
    lines.push(BRAND);
    await sock.sendMessage(chat, { text: lines.join('\n') }, { quoted: msg });
    await edit(sock, chat, st, '✅ *Jinytsearch:* done');
    await react(sock, msg, '☑');
  } catch (e) {
    await edit(sock, chat, st, `❌ *Jinytsearch failed:* ${e.message}`);
    await react(sock, msg, '❌');
  }
}

// ── .jinimage ────────────────────────────────
export async function jinimageCommand(sock, chat, msg, args) {
  const prompt = (args || []).join(' ').trim();
  if (!prompt) return sock.sendMessage(chat, { text: '🎨 Usage: `.jinimage <prompt>`' }, { quoted: msg });
  let st;
  try {
    st = await sock.sendMessage(chat, { text: '🎨 *Jinimage:* generating image…' }, { quoted: msg });
    let image; let backup = false;
    try {
      const res = await fetchEsmApi('/ai/image', { prompt });
      if (res.binary) {
        if (res.binary.length < 2048) throw new Error('image was empty');
        image = res.binary;                                   // the API sent the picture itself
      } else {
        if (!res.ok || !isOkPayload(res.data)) throw new Error(esmErrorMessage(res));
        const imgUrl = pickMediaUrls(res.data.result ?? res.data.data ?? res.data)[0]?.url;
        if (!imgUrl) throw new Error('No image URL returned.');
        image = { url: imgUrl };
      }
    } catch (esmErr) {
      backup = true;
      await edit(sock, chat, st, `⚠️ ESM unavailable (${esmErr.message}).\n↪️ Trying backup image engine…`);
      image = { url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true` };
    }
    await sock.sendMessage(chat, { image, caption: `🎨 *${prompt}*\n\n${BRAND}${backup ? ' · backup engine' : ''}` }, { quoted: msg });
    await edit(sock, chat, st, '✅ *Jinimage:* complete');
    await react(sock, msg, '☑');
  } catch (e) {
    await edit(sock, chat, st, `❌ *Jinimage failed:* ${e.message}`);
    await react(sock, msg, '❌');
  }
}

// ── .jinai ───────────────────────────────────
export async function jinaiCommand(sock, chat, msg, args) {
  const prompt = (args || []).join(' ').trim();
  if (!prompt) return sock.sendMessage(chat, { text: '🤖 Usage: `.jinai <prompt>`' }, { quoted: msg });
  let st;
  try {
    st = await sock.sendMessage(chat, { text: '🤖 *Jinai:* thinking…' }, { quoted: msg });
    let reply = null; let lastErr = null;

    // Blackbox endpoints take ?text=
    for (const ep of ['/ai/blackbox/web', '/ai/blackbox']) {
      try {
        const body = await esmJson(ep, { text: prompt });
        const d = body.result ?? body.data ?? body;
        reply = typeof d === 'string' ? d : (d?.response || d?.text || d?.answer || d?.result || d?.output || d?.message || d?.content);
        if (typeof reply !== 'string') reply = null;
        if (reply) break;
      } catch (err) {
        lastErr = err;
        if (err.denied) break;
      }
    }

    // Fallback → the bot's own free AI provider chain
    if (!reply) {
      try {
        const { aiChat } = await import('../lib/ai.js');
        const r = await aiChat([{ role: 'user', content: prompt }]);
        reply = r?.text;
      } catch (aiErr) {
        throw new Error(`${lastErr?.message || 'ESM returned an empty reply'} | Backup AI: ${aiErr.message}`);
      }
    }
    if (!reply) throw lastErr || new Error('Empty response from AI.');

    await sock.sendMessage(chat, { text: `🤖 *Jin AI Response:*\n\n${reply}\n\n${BRAND}` }, { quoted: msg });
    await edit(sock, chat, st, '✅ *Jinai:* complete');
    await react(sock, msg, '☑');
  } catch (e) {
    await edit(sock, chat, st, `❌ *Jinai failed:* ${e.message}`);
    await react(sock, msg, '❌');
  }
}

// ── .jinapk ──────────────────────────────────
export async function jinapkCommand(sock, chat, msg, args) {
  const query = (args || []).join(' ').trim();
  if (!query) return sock.sendMessage(chat, { text: '📲 Usage: `.jinapk <app name>`' }, { quoted: msg });
  let st;
  try {
    st = await sock.sendMessage(chat, { text: '📲 *Jinapk:* searching APK…' }, { quoted: msg });
    // The ESM site lists both APK endpoints with a single ?url= parameter.
    const search = await esmJson('/apksearch', { url: query, q: query, query });
    const items = esmFindArray(search) || [];
    if (!items.length) throw new Error('No APK found.');

    const first = items[0];
    const appName = first.name || first.title || query;
    await edit(sock, chat, st, `📲 *Downloading APK:* ${appName}…`);

    const candidates = [...new Set([first.url, first.link, first.id, first.package, first.packageName, first.name, query].filter(Boolean))];
    let apkUrl = null; let lastDl = null;
    for (const cand of candidates) {
      try {
        const dl = await esmJson('/apkdl', { url: cand, id: cand, q: cand });
        const links = pickMediaUrls(dl.result ?? dl.data ?? dl);
        apkUrl = (links.find((l) => /apk|dllink|download/i.test(`${l.key} ${l.url}`)) || links[0])?.url;
        if (apkUrl) break;
      } catch (err) {
        lastDl = err;
        if (err.denied) break;
      }
    }
    if (!apkUrl) throw lastDl || new Error('No APK download link returned.');

    await sendFromUrl(sock, chat, msg, apkUrl, {
      kind: 'document', mimetype: 'application/vnd.android.package-archive', maxBytes: MAX_APK, minBytes: 50_000,
      fileName: `${appName.replace(/[^a-zA-Z0-9_-]/g, '_')}.apk`, caption: `📲 *${appName}*\n\n${BRAND}`,
    });
    await edit(sock, chat, st, '✅ *Jinapk:* complete');
    await react(sock, msg, '☑');
  } catch (e) {
    // Fallback → built-in Aptoide / F-Droid command
    try {
      await edit(sock, chat, st, `⚠️ ESM unavailable (${e.message}).\n↪️ Switching to the built-in APK store search…`);
      const { apkCommand } = await import('./apk.js');
      return await apkCommand(sock, chat, msg, args);
    } catch (e2) {
      await edit(sock, chat, st, `❌ *Jinapk failed:* ${e.message}\nFallback: ${e2.message}`);
      await react(sock, msg, '❌');
    }
  }
}
