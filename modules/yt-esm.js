// ─────────────────────────────────────────────
// Al-Jin Lite · modules/yt-esm.js — YouTube commands on the ESM API (no yt-dlp, no ffmpeg, no files)
//   .play <query|url>   audio     .ytv / .video <query|url>   video     .ytdl <url>   video
// Media is streamed network → WhatsApp upload.
// ─────────────────────────────────────────────
import { esmYoutubeSend } from '../lib/esm.js';
import { ytSearch, isYoutubeUrl } from '../lib/ytsearch.js';

const BRAND = 'Provided by 𝐀𝐥-𝐉𝐢𝐧';
const isUrl = (s) => /^https?:\/\//i.test(String(s || ''));
const edit = async (sock, chat, st, text) => { try { await sock.sendMessage(chat, { text, ...(st?.key ? { edit: st.key } : {}) }); } catch {} };
const react = async (sock, msg, emoji) => { try { await sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } }); } catch {} };

async function resolve(query, st, sock, chat) {
  if (isUrl(query)) {
    if (!isYoutubeUrl(query)) throw new Error('only YouTube links are supported here — use .dl for other sites');
    return { url: query, title: null };
  }
  const hit = (await ytSearch(query, 1))[0];
  if (!hit) throw new Error('nothing found for that search');
  await edit(sock, chat, st, `🔎 *Found:* ${hit.title}\n⏬ Sending…`);
  return { url: hit.url, title: hit.title };
}

async function run(sock, chat, msg, args, { type, label, usage }) {
  const query = (args || []).join(' ').trim();
  if (!query) return sock.sendMessage(chat, { text: usage }, { quoted: msg });
  const st = await sock.sendMessage(chat, { text: `${label} *working…*` }, { quoted: msg });
  try {
    const { url, title } = await resolve(query, st, sock, chat);
    await esmYoutubeSend(sock, chat, msg, url, {
      type,
      caption: (i) => `${[`🎬 *${i.title || title || 'YouTube'}*`, i.author && `👤 ${i.author}`, i.duration && `⏱ ${i.duration}`].filter(Boolean).join('\n')}\n\n${BRAND}`,
    });
    await edit(sock, chat, st, '✅ Done');
    await react(sock, msg, '☑');
  } catch (e) {
    await edit(sock, chat, st, `❌ *Failed:* ${e.message}`);
    await react(sock, msg, '❌');
  }
}

export const playCommand = (sock, chat, msg, args) => run(sock, chat, msg, args, { type: 'audio', label: '🎵', usage: '🎵 Usage: `.play <song name or YouTube link>`' });
export const ytvCommand = (sock, chat, msg, args) => run(sock, chat, msg, args, { type: 'video', label: '🎬', usage: '🎬 Usage: `.ytv <title or YouTube link>`' });
export const videoCommand = ytvCommand;
export const ytdlCommand = ytvCommand;
