// ─────────────────────────────────────────────
//  Al-Jin · lib/session-id.js
//  Connect with a Session ID (JIN_xxxx) made by the Jin pairing site instead of pairing again.
//
//  The pairing site stores your login (creds.json) in Cloudflare Workers KV. On start this file
//  downloads it into instances/main/session/ so the bot is online without a new pairing code.
//
//  Settings (env / .env / panel variables / top of index.js):
//    SESSION_ID    JIN_xxxxxxxxxxxxxxxxxxxxxxxxxxxx      (empty = normal pairing)
//    SESSION_API   https://your-store.your-name.workers.dev
//    SESSION_SYNC  off   → never upload refreshed login data back to the store
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ID_RE = /^JIN_[A-Za-z0-9]{24,64}$/;
const DEFAULT_API = '';              // optional: put your Worker address here to skip SESSION_API
const MARKER = '.session-id';        // remembers WHICH session id the local files came from
const SYNC_DELAY_MS = 10 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readSafe = (f) => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return ''; } };
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function sessionConfig(env = process.env) {
  const id = String(env.SESSION_ID || env.JIN_SESSION_ID || '').trim();
  if (!id) return null;
  if (!ID_RE.test(id)) return { id, error: 'SESSION_ID is not valid — it must look like JIN_xxxxxxxxxxxxxxxxxxxxxxxxxxxx' };
  const api = String(env.SESSION_API || env.JIN_SESSION_API || DEFAULT_API).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(api)) return { id, error: 'SESSION_API is missing — set it to the address of your session store (Cloudflare Worker)' };
  return { id, api };
}

async function fetchCreds(cfg) {
  let err = null;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${cfg.api}/s/${cfg.id}`, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json' } });
      if (r.ok) return { text: await r.text() };
      err = new Error(r.status === 404
        ? 'Session ID not found — check it was copied completely (if you linked a moment ago, wait a minute and restart)'
        : `session store answered HTTP ${r.status}`);
    } catch (e) { err = new Error(`could not reach the session store (${e?.message || e})`); }
    if (i < 2) await sleep(1500 * (i + 1));
  }
  return { err };
}

/**
 * Makes sure `dir` (…/instances/main/session) holds the login of SESSION_ID.
 * Never throws. Returns { skipped } | { ok, already } | { ok, restored } | { ok:false, error }.
 */
export async function restoreSession(dir, log = console.log) {
  const cfg = sessionConfig();
  if (!cfg) return { skipped: true };
  if (cfg.error) { log(`[session-id] ${cfg.error}`); return { ok: false, error: cfg.error }; }
  try {
    const creds = path.join(dir, 'creds.json');
    const have = fs.existsSync(creds);
    if (have && readSafe(path.join(dir, MARKER)) === cfg.id) return { ok: true, already: true };

    const { text, err } = await fetchCreds(cfg);
    if (err) { log(`[session-id] ${err.message}`); return { ok: false, error: err.message }; }
    let j = null; try { j = JSON.parse(text); } catch {}
    if (!j?.noiseKey || !j?.signedIdentityKey) { const m = 'the stored login is not valid'; log(`[session-id] ${m}`); return { ok: false, error: m }; }

    if (have) {   // a different login is already here → keep it as a backup, never mix two logins
      try { fs.renameSync(dir, `${dir}.old-${Date.now()}`); } catch { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(creds + '.tmp', text);
    fs.renameSync(creds + '.tmp', creds);
    fs.writeFileSync(path.join(dir, MARKER), cfg.id);
    log('[session-id] login restored from your Session ID');
    return { ok: true, restored: true };
  } catch (e) {
    log(`[session-id] restore failed: ${e?.message || e}`);
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Wraps Baileys' saveCreds: refreshed login data is uploaded back to the store (at most once per
 * 10 minutes) so a host that wipes its disk on restart still comes back with fresh data.
 */
export function wrapSaveCreds(saveCreds, dir, log = () => {}) {
  const cfg = sessionConfig();
  if (!cfg || cfg.error || /^(off|0|false|no)$/i.test(process.env.SESSION_SYNC || '')) return saveCreds;
  let timer = null, last = null;
  const push = async () => {
    timer = null;
    try {
      if (readSafe(path.join(dir, MARKER)) !== cfg.id) return;
      const text = fs.readFileSync(path.join(dir, 'creds.json'), 'utf8');
      if (!JSON.parse(text)?.me?.id) return;
      const h = sha(text);
      if (h === last) return;
      const r = await fetch(`${cfg.api}/s/${cfg.id}`, {
        method: 'PUT', body: text, headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15000),
      });
      if (r.ok) last = h; else log(`[session-id] sync skipped (HTTP ${r.status})`);
    } catch {}
  };
  return async (...a) => {
    const out = await saveCreds(...a);
    if (!timer) { timer = setTimeout(push, SYNC_DELAY_MS); timer.unref?.(); }
    return out;
  };
}
