// ─────────────────────────────────────────────
// Al-Jin · lib/ephoto360.js
// Al-Jin Lite · Ephoto360 text effects — plain fetch (no mumaker, no cheerio, no image processing).
// Flow: GET effect page → POST text form → POST /effect/create-image → download the finished JPEG.
// ─────────────────────────────────────────────
import { fetchBuffer } from './net.js';

export const EPHOTO_EFFECTS = {
  metallic: { url: 'https://en.ephoto360.com/impressive-decorative-3d-metal-text-effect-798.html', dual: false },
  ice: { url: 'https://en.ephoto360.com/ice-text-effect-online-101.html', dual: false },
  snow: { url: 'https://en.ephoto360.com/create-a-snow-3d-text-effect-free-online-621.html', dual: false },
  impressive: { url: 'https://en.ephoto360.com/create-3d-colorful-paint-text-effect-online-801.html', dual: false },
  matrix: { url: 'https://en.ephoto360.com/matrix-text-effect-154.html', dual: false },
  light: { url: 'https://en.ephoto360.com/light-text-effect-futuristic-technology-style-648.html', dual: false },
  neon: { url: 'https://en.ephoto360.com/create-colorful-neon-light-text-effects-online-797.html', dual: false },
  devil: { url: 'https://en.ephoto360.com/neon-devil-wings-text-effect-online-683.html', dual: false },
  purple: { url: 'https://en.ephoto360.com/purple-text-effect-online-100.html', dual: false },
  thunder: { url: 'https://en.ephoto360.com/thunder-text-effect-online-97.html', dual: false },
  leaves: { url: 'https://en.ephoto360.com/green-brush-text-effect-typography-maker-online-153.html', dual: false },
  '1917': { url: 'https://en.ephoto360.com/1917-style-text-effect-523.html', dual: false },
  arena: { url: 'https://en.ephoto360.com/create-cover-arena-of-valor-by-mastering-360.html', dual: false },
  hacker: { url: 'https://en.ephoto360.com/create-anonymous-hacker-avatars-cyan-neon-677.html', dual: false },
  sand: { url: 'https://en.ephoto360.com/write-names-and-messages-on-the-sand-online-582.html', dual: false },
  blackpink: { url: 'https://en.ephoto360.com/create-a-blackpink-style-logo-with-members-signatures-810.html', dual: false },
  glitch: { url: 'https://en.ephoto360.com/create-digital-glitch-text-effects-online-767.html', dual: false },
  fire: { url: 'https://en.ephoto360.com/flame-lettering-effect-372.html', dual: false },
  '3dgold': { url: 'https://en.ephoto360.com/create-a-3d-golden-metal-text-effect-802.html', dual: false },
  marvel: { url: 'https://en.ephoto360.com/create-a-marvel-studio-logo-style-text-effect-online-711.html', dual: true },
  pornhub: { url: 'https://en.ephoto360.com/create-pornhub-style-logos-online-free-549.html', dual: true },
  graffiti: { url: 'https://en.ephoto360.com/create-a-graffiti-text-effect-online-682.html', dual: false },
  naruto: { url: 'https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html', dual: false },
  blood: { url: 'https://en.ephoto360.com/horror-blood-text-effect-online-784.html', dual: false },
  hologram: { url: 'https://en.ephoto360.com/create-3d-hologram-text-effects-online-768.html', dual: false },
  luxury: { url: 'https://en.ephoto360.com/luxury-gold-text-effect-208.html', dual: false },
  glowing: { url: 'https://en.ephoto360.com/create-glowing-neon-text-effects-online-794.html', dual: false },
  wall: { url: 'https://en.ephoto360.com/write-text-on-wet-glass-online-589.html', dual: false },
  circuit: { url: 'https://en.ephoto360.com/create-printed-circuit-board-text-effect-793.html', dual: false },
  neondevil: { url: 'https://en.ephoto360.com/neon-devil-wings-text-effect-online-683.html', dual: false },

  // Fixed & Expanded Effects
  dragon: { url: 'https://en.ephoto360.com/create-dragon-ball-style-text-effects-online-809.html', dual: false },
  space: { url: 'https://en.ephoto360.com/making-neon-light-text-effect-with-galaxy-style-521.html', dual: false },
  cyberpunk: { url: 'https://en.ephoto360.com/create-a-cyberpunk-light-effect-online-668.html', dual: false },
  galaxy: { url: 'https://en.ephoto360.com/create-galaxy-batman-text-effects-online-607.html', dual: false },
  vintage: { url: 'https://en.ephoto360.com/create-realistic-vintage-3d-light-bulb-608.html', dual: false },
  lightglow: { url: 'https://en.ephoto360.com/create-sunset-light-text-effects-online-807.html', dual: false },
  neonlight: { url: 'https://en.ephoto360.com/create-colorful-neon-light-text-effects-online-797.html', dual: false },
  captainamerica: { url: 'https://en.ephoto360.com/free-online-american-flag-3d-text-effect-generator-725.html', dual: false },
  comic: { url: 'https://en.ephoto360.com/create-online-3d-comic-style-text-effects-817.html', dual: false },
  titanium: { url: 'https://en.ephoto360.com/create-the-titanium-text-effect-to-introduce-iphone-15-812.html', dual: false },
  sunset: { url: 'https://en.ephoto360.com/create-sunset-light-text-effects-online-807.html', dual: false },
  balloon: { url: 'https://en.ephoto360.com/beautiful-3d-foil-balloon-effects-for-holidays-and-birthday-803.html', dual: false },
  silver: { url: 'https://en.ephoto360.com/create-glossy-silver-3d-text-effect-online-802.html', dual: false },
  paint: { url: 'https://en.ephoto360.com/create-3d-colorful-paint-text-effect-online-801.html', dual: false },
  xmas: { url: 'https://en.ephoto360.com/christmas-and-new-year-glittering-3d-golden-text-effect-794.html', dual: false },
  sparkle: { url: 'https://en.ephoto360.com/create-sparkles-3d-christmas-text-effect-online-727.html', dual: false },
  american: { url: 'https://en.ephoto360.com/free-online-american-flag-3d-text-effect-generator-725.html', dual: false },
  blueneon: { url: 'https://en.ephoto360.com/create-blue-neon-logo-online-507.html', dual: false },
  greenneon: { url: 'https://en.ephoto360.com/create-light-effects-green-neon-online-429.html', dual: false },
  goldletter: { url: 'https://en.ephoto360.com/write-gold-letters-online-285.html', dual: false },
  pubg: { url: 'https://en.ephoto360.com/lightning-pubg-video-logo-maker-online-615.html', dual: false },
  starwars: { url: 'https://en.ephoto360.com/create-a-star-wars-character-mascot-logo-online-707.html', dual: false },
  neonart: { url: 'https://en.ephoto360.com/create-multicolored-neon-light-signatures-591.html', dual: false },
  glitchneon: { url: 'https://en.ephoto360.com/create-impressive-neon-glitch-text-effects-online-768.html', dual: false },
};

const BASE = 'https://en.ephoto360.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TIMEOUT = 25000;

const decode = (s) => String(s || '').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Value of the <input> whose name or id equals `key` (attribute order independent). */
function inputValue(html, key) {
  for (const tag of html.match(/<input\b[^>]*>/gi) || []) {
    if (!new RegExp(`\\b(?:name|id)=["']${key}["']`, 'i').test(tag)) continue;
    const m = /\bvalue=(["'])([\s\S]*?)\1/i.exec(tag);
    if (m) return decode(m[2]);
  }
  return null;
}

const cookieOf = (res) => (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');

async function http(url, init = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT);
  try { return await fetch(url, { ...init, signal: ac.signal, headers: { 'User-Agent': UA, Accept: '*/*', ...(init.headers || {}) } }); }
  finally { clearTimeout(timer); }
}

async function ephotoUrl(effectUrl, texts) {
  // 1) effect page → token + build server + cookie
  const page = await http(effectUrl);
  if (!page.ok) throw new Error(`effect page HTTP ${page.status}`);
  const cookie = cookieOf(page);
  const html1 = await page.text();
  const token = inputValue(html1, 'token');
  const buildServer = inputValue(html1, 'build_server');
  const buildServerId = inputValue(html1, 'build_server_id');
  if (!token || !buildServer) throw new Error('effect page layout changed');

  // 2) submit the text(s) → hidden form_value_input
  const f1 = new FormData();
  for (const t of texts) f1.append('text[]', t);
  f1.append('submit', 'GO');
  f1.append('token', token);
  f1.append('build_server', buildServer);
  f1.append('build_server_id', buildServerId || '1');
  const r2 = await http(effectUrl, { method: 'POST', body: f1, headers: { Cookie: cookie, Referer: effectUrl, Origin: BASE } });
  const html2 = await r2.text();
  const raw = inputValue(html2, 'form_value_input');
  if (!raw) throw new Error('could not read the generated form');
  const value = JSON.parse(raw);

  // 3) create the image
  const f2 = new FormData();
  for (const [k, v] of Object.entries(value)) {
    if (k === 'text') for (const t of texts) f2.append('text[]', t);
    else if (Array.isArray(v)) for (const x of v) f2.append(`${k}[]`, x);
    else f2.append(k, v);
  }
  const r3 = await http(`${BASE}/effect/create-image`, { method: 'POST', body: f2, headers: { Cookie: cookie, Referer: effectUrl, Origin: BASE } });
  const j = await r3.json();
  if (!j?.success || !j.image) throw new Error('the site did not return an image');
  return `${buildServer}${j.image}`;
}

export async function createEphotoImage(effectKey, text1, text2 = '') {
  const effect = EPHOTO_EFFECTS[effectKey];
  if (!effect) throw new Error(`Unknown effect key: ${effectKey}`);
  const texts = effect.dual ? [text1, text2 || 'Al-Jin'] : [text1];
  try {
    const url = await ephotoUrl(effect.url, texts);
    const buf = await fetchBuffer(url, { timeout: 20000, maxBytes: 6 * 1024 * 1024 });
    if (buf && buf.length > 1024) return buf;                       // sent as-is — no resizing / re-encoding
  } catch (err) {
    console.error(`[Ephoto360 ${effectKey}]:`, err.message);
  }
  throw new Error('Could not generate Ephoto360 image. Please try again later.');
}
