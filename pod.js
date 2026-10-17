#!/usr/bin/env node
// ─────────────────────────────────────────────
// Al-Jin · pod.js
// Hosts a handful of WhatsApp sessions as worker_threads instead of each
// being its own OS process. One pod = one Node process baseline shared by
// every session it holds; each session still gets its own V8 isolate (via
// worker_threads' resourceLimits) and its own module cache, so all the
// per-session state the rest of the codebase keeps in module-level
// Maps/Sets/singletons stays exactly as isolated as it was when every
// session was a separate process.
//
// Spawned by index.js with:
//   env.WRAITH_POD_ID        — this pod's id (for logging)
//   env.WRAITH_POD_SESSIONS  — JSON: [{ id, number, dataDir, sharedDir }]
//   env.WRAITH_ACTIVE_SESSIONS — total sessions across the WHOLE box (for
//                                 core/limiter.js's CPU/RAM share split)
// Talks to index.js over process IPC (same as a legacy session process did);
// talks to each session over that worker's `postMessage`/`on('message')`.
// ─────────────────────────────────────────────
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_FILE = path.join(__dirname, 'session-worker.js');

const POD_ID = process.env.WRAITH_POD_ID || 'pod';
const dye = (c, s) => `\x1b[${c}m${s}\x1b[0m`;
const grey = s => dye(90, s);
const say = (...p) => console.log(grey(`[${POD_ID}]`), ...p);

let initialSessions = [];
try { initialSessions = JSON.parse(process.env.WRAITH_POD_SESSIONS || '[]'); } catch { initialSessions = []; }

// sessionId → { worker, number, dataDir, sharedDir, muted, backlog, exiting, reported }
const workers = new Map();

function resourceLimitsFor(totalSessions) {
  const ramBudgetMB = Number(process.env.WRAITH_RAM_BUDGET_MB || 256);
  // Threads share the process's own baseline (loaded V8/Node binary, libuv,
  // compiled builtins) far more than separate processes did, so the
  // per-session overhead reserved outside the heap can be smaller here.
  // Override with WRAITH_SESSION_OVERHEAD_MB if real measurements differ.
  const baseOverheadMB = Number(process.env.WRAITH_SESSION_OVERHEAD_MB || 16);
  const autoPerSession = Math.floor((ramBudgetMB - baseOverheadMB * totalSessions) / totalSessions);
  const maxOld = Number(process.env.WRAITH_MAX_OLD_SPACE_SIZE) || Math.max(24, Math.min(256, autoPerSession));
  const semi = Number(process.env.WRAITH_V8_SEMI_SPACE_SIZE) || (ramBudgetMB <= 256 ? 8 : 16);
  return { maxOldGenerationSizeMb: maxOld, maxYoungGenerationSizeMb: semi };
}

function pipeTagged(stream, dest, rec) {
  const rl = readline.createInterface({ input: stream });
  rl.on('line', (line) => {
    const out = `${grey(`[${rec.sessionId}]`)} ${line}\n`;
    if (rec.muted) rec.backlog.push(out);
    else dest.write(out);
  });
}

function spawnWorker(sessionId, number, dataDir, sharedDir, totalSessions) {
  if (workers.has(sessionId)) {
    say(`session ${sessionId} already running in this pod`);
    return;
  }
  const limits = resourceLimitsFor(totalSessions);
  const env = {
    ...process.env,
    WRAITH_SESSION_ID: sessionId,
    WRAITH_DATA_DIR: dataDir,
    WRAITH_SHARED_DIR: sharedDir,
    WRAITH_ACTIVE_SESSIONS: String(totalSessions),
  };
  say(`starting session ${sessionId}${number ? ' · +' + number : ''} (heap ${limits.maxOldGenerationSizeMb}MB)`);
  const worker = new Worker(WORKER_FILE, {
    workerData: { sessionId, number },
    env,
    stdout: true,
    stderr: true,
    resourceLimits: limits,
  });

  const rec = { sessionId, worker, number, dataDir, sharedDir, muted: false, backlog: [], exiting: false, reported: null };
  workers.set(sessionId, rec);

  pipeTagged(worker.stdout, process.stdout, rec);
  pipeTagged(worker.stderr, process.stderr, rec);

  worker.on('message', (m) => {
    if (m?.type === 'wraith:session_exited') rec.reported = m.reason || 'exited';
    // Relay everything up to the launcher as-is — messages are already
    // self-tagged with fromSessionId by core/launcher-ipc.js.
    try { process.send?.(m); } catch {}
  });

  worker.on('error', (err) => {
    say(dye(31, `session ${sessionId} worker error: ${err?.message || err}`));
  });

  worker.on('exit', (code) => {
    workers.delete(sessionId);
    if (!rec.reported) {
      // The worker never told us it was exiting on purpose (deleted /
      // shutting down) — treat it as a crash so the launcher restarts it.
      try { process.send?.({ type: 'wraith:worker_crashed', fromSessionId: sessionId, code }); } catch {}
    }
  });
}

// ── Launcher → pod messages ──
process.on('message', (m) => {
  if (!m || typeof m !== 'object') return;

  if (m.type === 'wraith:spawn_worker') {
    spawnWorker(m.sessionId, m.number || null, m.dataDir, m.sharedDir, Number(m.totalSessions) || workers.size + 1);
    return;
  }
  if (m.type === 'wraith:sessions') {
    for (const rec of workers.values()) {
      try { rec.worker.postMessage({ type: 'wraith:sessions', count: m.count }); } catch {}
    }
    return;
  }
  if (m.type === 'wraith:to_session' && m.sessionId) {
    const rec = workers.get(m.sessionId);
    if (rec) { try { rec.worker.postMessage(m.payload); } catch {} }
    return;
  }
  if (m.type === 'wraith:mute' && m.sessionId) {
    const rec = workers.get(m.sessionId);
    if (rec) rec.muted = true;
    return;
  }
  if (m.type === 'wraith:unmute' && m.sessionId) {
    const rec = workers.get(m.sessionId);
    if (rec) {
      rec.muted = false;
      for (const chunk of rec.backlog) process.stdout.write(chunk);
      rec.backlog.length = 0;
    }
    return;
  }
  if (m.type === 'wraith:mute_all') {
    for (const rec of workers.values()) rec.muted = true;
    return;
  }
  if (m.type === 'wraith:unmute_all') {
    for (const rec of workers.values()) {
      rec.muted = false;
      for (const chunk of rec.backlog) process.stdout.write(chunk);
      rec.backlog.length = 0;
    }
    return;
  }
  if (m.type === 'wraith:kill_session' && m.sessionId) {
    // Hard kill — unlike wraith:to_session, this doesn't rely on the worker
    // still being responsive enough to handle a message (used when a
    // session hung instead of exiting cleanly after being asked to).
    const rec = workers.get(m.sessionId);
    if (rec) { rec.reported = rec.reported || 'killed'; try { rec.worker.terminate(); } catch {} }
    return;
  }
  if (m.type === 'wraith:shutdown_pod') {
    shutdown('launcher request');
    return;
  }
});

// Tell the launcher we're actually listening — it queues any
// wraith:spawn_worker sent before this arrives rather than firing them at a
// process that technically exists but hasn't registered its handler yet.
try { process.send?.({ type: 'wraith:pod_ready' }); } catch {}

let shuttingDown = false;
function shutdown(why) {
  if (shuttingDown) return;
  shuttingDown = true;
  say(`shutting down (${why})`);
  const pending = [...workers.values()];
  if (!pending.length) { process.exit(0); return; }
  for (const rec of pending) {
    try { rec.worker.postMessage({ type: 'wraith:shutdown' }); } catch {}
  }
  const killer = setTimeout(() => process.exit(0), 3000);
  killer.unref?.();
  let left = pending.length;
  for (const rec of pending) {
    rec.worker.once('exit', () => { left--; if (left <= 0) { clearTimeout(killer); process.exit(0); } });
  }
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Stagger even a single pod's own initial batch — a 4-session pod booting
// all 4 Baileys sockets in the same tick is still a small CPU/WA-servers
// spike, just a smaller one than booting 15 at once.
const WORKER_STAGGER_MS = Number(process.env.WRAITH_WORKER_STAGGER_MS ?? 600);
initialSessions.forEach((s, i) => {
  const go = () => spawnWorker(s.id, s.number || null, s.dataDir, s.sharedDir, Number(process.env.WRAITH_ACTIVE_SESSIONS) || initialSessions.length);
  if (i === 0 || WORKER_STAGGER_MS <= 0) go(); else setTimeout(go, i * WORKER_STAGGER_MS);
});

if (!initialSessions.length) {
  say(dye(33, 'started with no sessions assigned — idle, waiting for wraith:spawn_worker'));
}
