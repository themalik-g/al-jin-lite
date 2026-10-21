// core/settings.js — settings are PER SESSION (prefix, reply mode, imenu, download limits, AI model pins…)
// Each session keeps its own data/settings.json inside its own instance folder, so changing the prefix
// (or anything else) in one session never touches another session.
//
// BOX-LEVEL keys stay shared on purpose (instances/_shared/settings.json): CPU/RAM caps and disk/tmp
// settings describe the machine, and the limiter divides them by the number of running sessions.
// To make those per-session too, empty the SHARED_KEYS set below.
//
// First start after updating: if a session has no settings.json yet, it is seeded once from the old
// shared file (so your current prefix etc. is kept), then it is independent.
import fs from 'node:fs';
import { inStore } from './paths.js';
import { readJson, writeJsonAtomic } from './state-io.js';
import { sharedJson } from './shared.js';

const DEFAULTS = {
  prefix: '.',
};

const SHARED_KEYS = new Set([
  'cpulimit', 'ramlimitMB', 'ramlimitRestart',
  'tmpDir', 'diskReserveMB', 'diskLimitMB', 'diskRoomMB',
]);

const FILE = () => inStore('settings.json');
const shared = sharedJson('settings.json');

let own = null;       // this session's settings (in memory)
let sig = null;       // mtime:size of the file we last loaded
let checked = 0;

const stat = () => { try { const s = fs.statSync(FILE()); return `${s.mtimeMs}:${s.size}`; } catch { return 'none'; } };

function loadOwn() {
  const now = Date.now();
  if (own && now - checked < 1500) return own;
  checked = now;
  const s = stat();
  if (own && s === sig) return own;

  if (s === 'none') {
    // First run of the per-session store: start from the old shared values (minus box-level keys).
    const seed = {};
    try {
      for (const [k, v] of Object.entries(shared.read() || {})) if (!SHARED_KEYS.has(k)) seed[k] = v;
    } catch {}
    own = seed;
    if (writeJsonAtomic(FILE(), own)) sig = stat();
    return own;
  }
  const j = readJson(FILE(), null);
  if (j && typeof j === 'object' && !Array.isArray(j)) { own = j; sig = s; }
  else if (!own) { own = {}; sig = s; }     // corrupt file → start empty, keep last good copy if we had one
  return own;
}

function load() {
  const o = loadOwn();
  const sh = shared.read() || {};
  const merged = { ...DEFAULTS, ...o };
  for (const k of SHARED_KEYS) if (k in sh) merged[k] = sh[k];
  return merged;
}

function put(key, value) {
  try {
    if (SHARED_KEYS.has(key)) {
      shared.update((s) => { s[key] = value; });
    } else {
      const o = { ...loadOwn(), [key]: value };
      if (!writeJsonAtomic(FILE(), o)) throw new Error('write failed');
      own = o; sig = stat(); checked = Date.now();
    }
  } catch (e) { console.error('[settings] persist failed:', e.message); }
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
  // text     plain text, numbered replies
  // poll     multi-select poll
  // list     one "Select option" button that opens a list menu to pick from   (default)
  // buttons  native-flow buttons (many non-business clients show "Waiting for this message")
  const m = load().replyMode || process.env.WRAITH_REPLY_MODE;
  if (m === 'text') return 'text';
  if (m === 'poll') return 'poll';
  if (m === 'buttons') return 'buttons';
  return 'list';
}

export function setReplyMode(mode) {
  put('replyMode', mode === 'poll' ? 'poll' : mode === 'buttons' ? 'buttons' : mode === 'list' ? 'list' : 'text');
}
