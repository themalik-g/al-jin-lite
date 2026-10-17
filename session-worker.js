// ─────────────────────────────────────────────
// Al-Jin · session-worker.js
// worker_thread entry point — one of these runs per session inside a pod
// process (pod.js). Gets its own V8 isolate and module cache (so every
// module-level cache/Map/singleton across the codebase stays exactly as
// isolated between sessions as it was when each session was its own OS
// process), but shares the pod process's Node/V8 baseline memory with
// however many sibling sessions that pod is hosting.
// ─────────────────────────────────────────────
import { workerData } from 'node:worker_threads';
import { runSession } from './core/session-runtime.js';
import { onLauncherMessage, sendToLauncher } from './core/launcher-ipc.js';

process.on('unhandledRejection', (reason) => {
  console.error(`[${workerData?.sessionId}] [unhandledRejection]`, reason);
});
process.on('uncaughtException', (err) => {
  console.error(`[${workerData?.sessionId}] [uncaughtException]`, err);
  // A truly uncaught exception here would otherwise crash this worker in an
  // unclean way; let the pod see it exit so the launcher can restart just
  // THIS session rather than nothing happening silently.
  process.exit(1);
});

const { sessionId, number } = workerData || {};

let handle = null;
onLauncherMessage((m) => {
  if (m?.type === 'wraith:shutdown') {
    try { handle?.quiet('shutdown'); } catch {}
    sendToLauncher({ type: 'wraith:session_exited', sessionId, reason: 'shutdown' });
    setTimeout(() => process.exit(0), 400);
  }
});

try {
  handle = await runSession({ sessionId, pairingNumber: number });
} catch (err) {
  console.error(`[${sessionId}]`, '\x1b[31mfatal:\x1b[0m', err);
  sendToLauncher({ type: 'wraith:session_exited', sessionId, reason: 'fatal', error: String(err?.message || err) });
  process.exit(1);
}
