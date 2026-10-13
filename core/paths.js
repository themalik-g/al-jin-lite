// core/paths.js — single source of truth for per-session data locations
import fs from 'node:fs';
import path from 'node:path';

export function dataDir() {
  const d = path.resolve(process.env.WRAITH_DATA_DIR || process.cwd());
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function sub(name) {
  const p = path.join(dataDir(), name);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export const sessionPath   = () => sub('session');
export const statePath     = () => sub('state');
export const vaultPathRoot = () => sub('vault');
export const storePath     = () => sub('data');
export const logsPath      = () => sub('logs');

export const inState = (...n) => path.join(statePath(), ...n);
export const inStore = (...n) => path.join(storePath(), ...n);
export const inData  = (...n) => path.join(storePath(), ...n);

// ── Shared (cross-session) data ─────────────────────────────────────────────
// instances/_shared  — one folder every session process reads/writes (API keys, settings,
// channel cache, WhatsApp-web version, compile cache). Launcher exports WRAITH_SHARED_DIR.
export function sharedPath() {
  const env = process.env.WRAITH_SHARED_DIR;
  const dd = dataDir();
  const d = env
    ? path.resolve(env)
    : (path.basename(path.dirname(dd)) === 'instances'
        ? path.join(path.dirname(dd), '_shared')
        : path.join(dd, '_shared'));
  fs.mkdirSync(d, { recursive: true });
  return d;
}
export const inShared = (...n) => path.join(sharedPath(), ...n);
