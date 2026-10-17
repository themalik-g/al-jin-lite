#!/usr/bin/env node
// ─────────────────────────────────────────────
// Al-Jin · standalone single-session entry (ESM)
// node start.js --session <id> [--number <digits>]
//
// This is the legacy / single-session path: run directly (as the Dockerfile's
// single-session CMD does, or by hand), it behaves exactly as before — one
// session, one OS process, talking to a launcher over process IPC if one
// spawned it.
//
// Multi-session deployments (index.js) no longer spawn THIS file per
// session — they spawn pod.js, which runs each session as a worker_thread
// instead (several sessions sharing one Node process's baseline memory).
// Both paths call the same core/session-runtime.js, so behavior is identical
// either way; only the transport to the launcher differs (see
// core/launcher-ipc.js).
// ─────────────────────────────────────────────

try {
  await import('dotenv/config');
} catch (err) {
  if (process.env.WRAITH_DEBUG) {
    console.warn('[al-jin] dotenv not loaded:', err?.code || err?.message || err);
  }
}

// Al-Jin: AL_JIN_* variables are aliases for the legacy WRAITH_* names.
for (const k of Object.keys(process.env)) {
  if (k.startsWith('AL_JIN_')) {
    const legacy = 'WRAITH_' + k.slice(7);
    if (process.env[legacy] === undefined) process.env[legacy] = process.env[k];
  }
}

// ── CLI Arg Parsing ──
const argv = process.argv.slice(2);
const argVal = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
};

const sessionId     = argVal('--session') || process.env.WRAITH_SESSION_ID || 'main';
const rawNumber     = argVal('--number');
const pairingNumber = rawNumber ? rawNumber.replace(/\D/g, '') : null;

// Standalone mode needs these set before core/paths.js is touched (pod.js
// sets the equivalent via each worker's own `env` option instead).
process.env.WRAITH_SESSION_ID = sessionId;
process.env.WRAITH_DATA_DIR = process.env.WRAITH_DATA_DIR || process.cwd();

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

const { runSession } = await import('./core/session-runtime.js');

let handle = null;
function quiet(sig) {
  try { handle?.quiet(sig); } catch {}
  setTimeout(() => process.exit(0), 400);
}
process.on('SIGINT',  () => quiet('SIGINT'));
process.on('SIGTERM', () => quiet('SIGTERM'));

try {
  handle = await runSession({ sessionId, pairingNumber });
} catch (err) {
  console.error(`[${sessionId}]`, '\x1b[31mfatal:\x1b[0m', err);
  process.exit(1);
}
