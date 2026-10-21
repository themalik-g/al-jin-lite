// ─────────────────────────────────────────────
//  Al-Jin Lite · lib/ytapi.js
//  The one extra download source for YouTube, used after every ESM endpoint has failed: the David Cyril API
//  (same endpoints as the ytmp3.js / ytmp4.js plugins):
//     GET <base>/download/ytmp4?url=<youtube url>   → video
//     GET <base>/download/ytmp3?url=<youtube url>   → audio
//  Reply: { result: { download_url | downloadUrl | url, title … } }  or  { url | link }.
//  Base address can be changed with  AL_JIN_YT_API.
// ─────────────────────────────────────────────
import { httpGetJson, BROWSER_USER_AGENT } from './net.js';

export const YT_API_BASE = String(process.env.AL_JIN_YT_API || 'https://apis.davidcyriltech.my.id').replace(/\/+$/, '');
const PATHS = { video: '/download/ytmp4', audio: '/download/ytmp3' };

function pickLink(data) {
  const r = data?.result;
  const cand = [r?.download_url, r?.downloadUrl, r?.url, r?.link, data?.download_url, data?.url, data?.link];
  return cand.find((x) => typeof x === 'string' && /^https?:\/\//i.test(x)) || null;
}

/** Asks the API for a direct link. Returns { link, title, thumbnail }; throws one readable Error. */
export async function fetchApiYoutube(videoUrl, { type = 'video', timeout = 30000 } = {}) {
  const path = PATHS[type === 'audio' ? 'audio' : 'video'];
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await httpGetJson(`${YT_API_BASE}${path}?url=${encodeURIComponent(videoUrl)}`, { timeout, headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'application/json' } });
      const link = pickLink(data);
      if (!link) throw new Error(data?.message || data?.error || 'no download link in reply');
      const r = data?.result || {};
      return { link, title: r.title || data?.title || null, thumbnail: r.thumbnail || r.image || null };
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 800));
    }
  }
  throw new Error(`backup API: ${lastErr?.message || lastErr}`);
}
