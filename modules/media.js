// ─────────────────────────────────────────────
// Al-Jin · modules/media.js
// Image search + movie + song info + lyrics + couplepp + meme
// ─────────────────────────────────────────────
import {
  searchImages,
  searchMovie,
  searchSong,
  fetchLyrics,
} from '../lib/apis.js';
import { chunkText } from '../lib/net.js';
import { sendInteractive, createQuickReply, NEWSLETTER_CONTEXT, sendWithCta } from '../lib/buttons.js';
import { getPrefix } from '../core/settings.js';

async function sendChunked(sock, chat, msg, text) {
  for (const p of chunkText(text, 3800)) {
    await sock.sendMessage(chat, { text: p }, { quoted: msg });
  }
}

// ─────────────────────────────────────────────
// .img / .image — stock image search
// ─────────────────────────────────────────────
export async function imageCommand(sock, chat, msg, args) {
  try {
    const parts = (args || []).slice();
    let count = 5;
    if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
      count = Math.min(Math.max(parseInt(parts.pop(), 10), 1), 10);
    }
    const query = parts.join(' ').trim();
    if (!query) {
      return sendWithCta(sock, chat, '🖼️ *img*\n\nUsage: `.img <query> [count]`\nCount default 5, max 10.', { quoted: msg });
    }

    await sock.sendMessage(chat, { text: `🔎 Searching images for *${query}*…` }, { quoted: msg });

    const r = await searchImages(query, count);
    if (!r.ok || !r.images?.length) {
      return sock.sendMessage(chat, { text: `❌ No images found for *${query}*.` }, { quoted: msg });
    }

    let sent = 0;
    for (const img of r.images.slice(0, count)) {
      const url = img.full || img.url;
      if (!url) continue;
      try {
        await sock.sendMessage(chat, {
          image: { url },
          caption: sent === 0 ? `🖼️ *${query}*\n_source: ${img.source || r.source || 'web'}_` : undefined,
        }, sent === 0 ? { quoted: msg } : undefined);
        sent++;
      } catch {}
    }
    if (!sent) {
      await sock.sendMessage(chat, { text: `❌ Could not send any images for *${query}*.` }, { quoted: msg });
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ img failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ─────────────────────────────────────────────
// .movie
// ─────────────────────────────────────────────
export async function movieCommand(sock, chat, msg, args) {
  try {
    const query = (args || []).join(' ').trim();
    if (!query) {
      return sendWithCta(sock, chat, '🎬 *movie*\n\nUsage: `.movie <title>`', { quoted: msg });
    }

    const r = await searchMovie(query);
    if (!r.ok) {
      return sock.sendMessage(chat, { text: `❌ No movie found for *${query}*.` }, { quoted: msg });
    }

    const lines = [
      `🎬 *${r.title}*`,
      `*year* · ${r.year || '—'}`,
      `*genre* · ${r.genre || '—'}`,
      `*director* · ${r.director || '—'}`,
      `*rating* · ${r.rating || '—'}`,
      '',
      r.description ? r.description.slice(0, 600) : '',
      '',
      `_source: ${r.source}_`
    ].filter(Boolean);

    if (r.poster) {
      await sock.sendMessage(chat, {
        image: { url: r.poster },
        caption: lines.join('\n')
      }, { quoted: msg });
    } else {
      await sendChunked(sock, chat, msg, lines.join('\n'));
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ movie failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ─────────────────────────────────────────────
// .songinfo — track metadata (not a download)
// ─────────────────────────────────────────────
export async function songCommand(sock, chat, msg, args) {
  try {
    const query = (args || []).join(' ').trim();
    if (!query) {
      return sendWithCta(sock, chat, '🎵 *songinfo*\n\nUsage: `.songinfo <title>`', { quoted: msg });
    }

    const r = await searchSong(query);
    if (!r.ok) {
      return sock.sendMessage(chat, { text: `❌ No song found for *${query}*.` }, { quoted: msg });
    }

    const dur = r.duration
      ? `${Math.floor(r.duration / 60)}:${String(r.duration % 60).padStart(2, '0')}`
      : '—';

    const lines = [
      `🎵 *${r.title}*`,
      `*artist* · ${r.artist || '—'}`,
      `*album* · ${r.album || '—'}`,
      `*duration* · ${dur}`,
      '',
      `_source: ${r.source}_`
    ];

    if (r.cover) {
      await sock.sendMessage(chat, {
        image: { url: r.cover },
        caption: lines.join('\n')
      }, { quoted: msg });
    } else {
      await sendChunked(sock, chat, msg, lines.join('\n'));
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ songinfo failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ─────────────────────────────────────────────
// .lyrics
// ─────────────────────────────────────────────
export async function lyricsCommand(sock, chat, msg, args) {
  try {
    const full = (args || []).join(' ').trim();
    if (!full) {
      return sendWithCta(sock, chat, '📜 *lyrics*\n\nUsage: `.lyrics <artist> - <title>`', { quoted: msg });
    }

    const sep = full.indexOf(' - ');
    if (sep === -1) {
      return sock.sendMessage(chat, {
        text: '❌ Use format: `.lyrics <artist> - <title>`'
      }, { quoted: msg });
    }

    const artist = full.slice(0, sep).trim();
    const title  = full.slice(sep + 3).trim();
    if (!artist || !title) {
      return sock.sendMessage(chat, {
        text: '❌ Both artist and title are required.'
      }, { quoted: msg });
    }

    const r = await fetchLyrics(artist, title);
    if (!r.ok || !r.lyrics) {
      return sock.sendMessage(chat, {
        text: `❌ No lyrics found for *${title}* by *${artist}*.`
      }, { quoted: msg });
    }

    const header = `📜 *${title}* — _${artist}_\n_source: ${r.source}_\n\n`;
    await sendChunked(sock, chat, msg, header + r.lyrics);
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ lyrics failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ─────────────────────────────────────────────
// .couplepp — random couple profile pics from repository
// ─────────────────────────────────────────────
const RAW_REPO = 'https://raw.githubusercontent.com/themalik-g/Couple-PP/main';

export async function coupleppCommand(sock, chat, msg, args) {
  try {
    // Select 2 distinct random numbers from 1 to 51
    const n1 = Math.floor(Math.random() * 51) + 1;
    let n2 = Math.floor(Math.random() * 51) + 1;
    while (n2 === n1) {
      n2 = Math.floor(Math.random() * 51) + 1;
    }

    const pairs = [
      {
        num: n1,
        male: `${RAW_REPO}/male/m${n1}.jpg`,
        female: `${RAW_REPO}/female/f${n1}.jpg`,
      },
      {
        num: n2,
        male: `${RAW_REPO}/male/m${n2}.jpg`,
        female: `${RAW_REPO}/female/f${n2}.jpg`,
      },
    ];

    let sent = 0;
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];
      try {
        await sock.sendMessage(chat, {
          image: { url: p.male },
          caption: `💞 *Couple PP (Pair ${i + 1} - #${p.num})* · Male\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`,
        }, i === 0 ? { quoted: msg } : undefined);

        await sock.sendMessage(chat, {
          image: { url: p.female },
          caption: `💞 *Couple PP (Pair ${i + 1} - #${p.num})* · Female\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`,
        });
        sent++;
      } catch (err) {
        console.error('[couplepp] send pair error:', err.message);
      }
    }

    if (!sent) {
      await sock.sendMessage(chat, { text: '❌ Failed to fetch couple profile pictures.' }, { quoted: msg });
    }
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ couplepp failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ── .meme "Top Text" | "Bottom Text" ─────────────────────────────────────────
export async function memeCommand(sock, chat, msg, args) {
  try {
    const raw = (args || []).join(' ').trim();
    let topText = '';
    let bottomText = '';

    if (raw.includes('|')) {
      const parts = raw.split('|');
      topText = parts[0].replace(/^["']|["']$/g, '').trim();
      bottomText = parts[1].replace(/^["']|["']$/g, '').trim();
    } else if (raw) {
      topText = raw.replace(/^["']|["']$/g, '').trim();
    }

    // Get media from quoted message or direct message
    const { getMediaFromMsg } = await import('../lib/getmedia.js');
    const media = await getMediaFromMsg(msg);

    if (!media || media.kind !== 'image') {
      return sock.sendMessage(chat, { text: '🎭 *meme*\n\nUsage: Reply to an image with:\n`.meme "Top Text" | "Bottom Text"` or `.meme Top Text | Bottom Text`' }, { quoted: msg });
    }

    await sock.sendMessage(chat, { text: '🎭 Generating custom meme...' }, { quoted: msg });

    // Sanitize text for Memegen URL scheme
    const cleanStr = (s) => encodeURIComponent(
      s.replace(/_/g, '__')
       .replace(/-/g, '--')
       .replace(/\?/g, '~q')
       .replace(/%/g, '~p')
       .replace(/#/g, '~h')
       .replace(/\//g, '~s')
       || '_'
    );

    const top = cleanStr(topText || '_');
    const bottom = cleanStr(bottomText || '_');

    // Upload image to temporary host or use MemeGen custom image parameter
    // MemeGen accepts custom image via ?background=URL or custom POST
    const uploadRes = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: (() => {
        const FormData = globalThis.FormData;
        if (!FormData) return null;
        const fd = new FormData();
        const blob = new Blob([media.buffer], { type: media.mimetype });
        fd.append('file', blob, 'meme.jpg');
        return fd;
      })()
    }).catch(() => null);

    let imageUrl = null;
    if (uploadRes && uploadRes.ok) {
      const upJson = await uploadRes.json();
      if (upJson?.data?.url) {
        imageUrl = upJson.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      }
    }

    if (!imageUrl) {
      return sock.sendMessage(chat, { text: '❌ Could not upload image for meme generation.' }, { quoted: msg });
    }

    const memeUrl = `https://api.memegen.link/images/custom/${top}/${bottom}.png?background=${encodeURIComponent(imageUrl)}`;
    const memeRes = await fetch(memeUrl);

    if (!memeRes.ok) {
      throw new Error(`MemeGen API status ${memeRes.status}`);
    }

    const memeBuf = Buffer.from(await memeRes.arrayBuffer());

    await sock.sendMessage(chat, {
      image: memeBuf,
      caption: `🎭 *Custom Meme*\n\nProvided by 𝐀𝐥-𝐉𝐢𝐧`
    }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ meme failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}
