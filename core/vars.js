// ─────────────────────────────────────────────
// Al-Jin · core/vars.js
// Variable store SHARED by every session (API keys such as GEMINI_API_KEY, .setvar values).
// Set once in any session → every session sees it. Old per-session vars.json is merged in once.
// ─────────────────────────────────────────────
import { inState } from './paths.js';
import { sharedJson, migrateLocal } from './shared.js';

const store = sharedJson('vars.json');
const applied = new Set();      // keys we copied into process.env (real panel env vars are never overridden)
let migrated = false;
let lastData = null;

function sync() {
    if (!migrated) { migrated = true; try { migrateLocal(store, inState('vars.json')); } catch {} }
    const data = store.read();
    if (data === lastData) return data;
    lastData = data;
    for (const [k, v] of Object.entries(data)) {
        if (v === undefined || v === null) continue;
        if (applied.has(k) || !process.env[k]) { process.env[k] = String(v); applied.add(k); }
    }
    for (const k of [...applied]) {
        if (!(k in data)) { delete process.env[k]; applied.delete(k); }
    }
    return data;
}

export function loadVars() { return sync(); }

export function getVar(key) {
    if (!key) return null;
    const data = sync();
    if (Object.prototype.hasOwnProperty.call(data, key)) return data[key];
    return process.env[key] || null;
}

export function setVar(key, value) {
    if (!key) return false;
    store.update((d) => { d[key] = value; });
    process.env[key] = value;
    applied.add(key);
    lastData = null;
    return true;
}

export function delVar(key) {
    if (!key) return false;
    let had = false;
    store.update((d) => { if (Object.prototype.hasOwnProperty.call(d, key)) { delete d[key]; had = true; } });
    if (had) { delete process.env[key]; applied.delete(key); lastData = null; }
    return had;
}

export function getAllVars() { return sync(); }
