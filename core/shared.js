// ─────────────────────────────────────────────
//  Al-Jin · core/shared.js
//  Cross-session JSON stores. Every session is its own process, so shared files need:
//   • atomic writes (tmp + rename)          — never a half-written file
//   • a tiny lock around read-modify-write  — two sessions can't overwrite each other's change
//   • mtime-checked cache                   — a change made by one session is seen by all
//  Zero dependencies.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { sharedPath, inShared } from './paths.js';
import { readJson, writeJsonAtomic } from './state-io.js';

const sleep = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} };

function withLock(file, fn) {
  const lock = file + '.lock';
  const t0 = Date.now();
  let fd = null;
  for (;;) {
    try { fd = fs.openSync(lock, 'wx'); break; }
    catch (e) {
      if (e.code !== 'EEXIST') break;                       // can't lock (read-only fs…) → go unlocked
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 5000) { fs.unlinkSync(lock); continue; } } catch {}
      if (Date.now() - t0 > 3000) break;                    // never block the bot for long
      sleep(15);
    }
  }
  try { return fn(); }
  finally { if (fd !== null) { try { fs.closeSync(fd); } catch {} try { fs.unlinkSync(lock); } catch {} } }
}

/** A JSON object stored in instances/_shared/<name>. read() is cheap; update(fn) is safe across processes. */
export function sharedJson(name, { ttlMs = 1500 } = {}) {
  const file = () => path.join(sharedPath(), name);
  let cache = {};
  let sig = null;
  let checked = 0;
  const stat = () => { try { const s = fs.statSync(file()); return `${s.mtimeMs}:${s.size}`; } catch { return 'none'; } };

  function load(force) {
    const now = Date.now();
    if (!force && sig !== null && now - checked < ttlMs) return cache;
    checked = now;
    const s = stat();
    if (!force && s === sig) return cache;
    if (s === 'none') { cache = {}; sig = s; return cache; }
    try { cache = JSON.parse(fs.readFileSync(file(), 'utf8')) || {}; sig = s; }
    catch { if (sig === null) { cache = {}; sig = s; } }    // corrupt/mid-write → keep last good copy
    return cache;
  }

  return {
    file,
    read: () => load(false),
    update(fn) {
      return withLock(file(), () => {
        const cur = JSON.parse(JSON.stringify(load(true)));
        const r = fn(cur);
        if (writeJsonAtomic(file(), cur)) { cache = cur; sig = stat(); checked = Date.now(); }
        return r;
      });
    },
  };
}

/** One-time merge of an old per-session file into the shared store (shared values win), then retire it. */
export function migrateLocal(store, localFile) {
  try {
    if (!fs.existsSync(localFile)) return false;
    const local = readJson(localFile, null);
    if (local && typeof local === 'object' && !Array.isArray(local)) {
      store.update((cur) => { for (const [k, v] of Object.entries(local)) if (!(k in cur)) cur[k] = v; });
    }
    try { fs.renameSync(localFile, localFile + '.migrated'); } catch {}
    return true;
  } catch { return false; }
}

/** WhatsApp-web version: fetched once for ALL sessions (6 h cache), falls back to the last good value. */
export async function getWaVersion(fetchFn, maxAgeMs = 6 * 3600 * 1000) {
  const f = inShared('wa-version.json');
  const c = readJson(f, null);
  if (c?.version && Date.now() - c.at < maxAgeMs) return c.version;
  try {
    const r = await fetchFn();
    if (r?.version && !r.error) writeJsonAtomic(f, { version: r.version, at: Date.now() });
    return r?.version || c?.version;
  } catch (e) {
    if (c?.version) return c.version;
    throw e;
  }
}
