// core/settings.js — settings SHARED by every session (prefix, reply mode, CPU/RAM/disk/download limits…)
// One file in instances/_shared; a change made in any session is picked up by all of them.
// An old per-session settings.json is merged in once (shared values win), then renamed *.migrated.
import path from 'node:path';
import { storePath } from './paths.js';
import { sharedJson, migrateLocal } from './shared.js';

const DEFAULTS = {
  prefix: '.',
};

const store = sharedJson('settings.json');
let migrated = false;

function load() {
  if (!migrated) {
    migrated = true;
    try { migrateLocal(store, path.join(storePath(), 'settings.json')); } catch {}
  }
  return { ...DEFAULTS, ...store.read() };
}

function put(key, value) {
  load(); // make sure migration ran first
  try { store.update((s) => { s[key] = value; }); }
  catch (e) { console.error('[settings] persist failed:', e.message); }
}

export function getPrefix() {
  return load().prefix || '.';
}

export function setPrefix(p) {
  put('prefix', p);
}

export function getSetting(key) {
  return load()[key];
}

export function setSetting(key, value) {
  put(key, value);
}

export function getReplyMode() {
  // Two modes only: "text" (default, numbered replies) and "poll" (multi-select poll).
  // An old saved "buttons" value is treated as "text".
  const m = load().replyMode || process.env.WRAITH_REPLY_MODE;
  return m === 'poll' ? 'poll' : 'text';
}

export function setReplyMode(mode) {
  put('replyMode', mode === 'poll' ? 'poll' : 'text');
}
