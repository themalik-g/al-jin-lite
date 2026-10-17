// ─────────────────────────────────────────────
// Al-Jin · core/launcher-ipc.js
// Talks to the launcher (index.js) regardless of HOW this session is
// running: as its own standalone child process (`node start.js --session x`,
// legacy / single-session Docker mode — uses process IPC), or as a
// worker_thread hosted inside a pod process (multi-session mode — uses
// parentPort). Every caller (start.js, modules/owner.js, modules/update.js)
// goes through here instead of touching `process.send` / `process.on`
// directly, so the rest of the bot never has to know which mode it's in.
// ─────────────────────────────────────────────
import { parentPort, isMainThread } from 'node:worker_threads';

const inWorker = !isMainThread && !!parentPort;

/** True once there's SOME way to reach the launcher (worker or IPC-connected process). */
export function canReachLauncher() {
  return inWorker || typeof process.send === 'function';
}

/** Fire-and-forget message up to the launcher (direct in legacy mode, via the owning pod otherwise). */
export function sendToLauncher(msg) {
  try {
    // Every outgoing message is tagged with this session's own id so a pod
    // (which hosts several sessions) and the launcher (which hosts several
    // pods) can always tell who it came from, even for messages that don't
    // carry a sessionId of their own (e.g. wraith:restart_all).
    const tagged = (msg && typeof msg === 'object' && !('fromSessionId' in msg))
      ? { ...msg, fromSessionId: process.env.WRAITH_SESSION_ID || null }
      : msg;
    if (inWorker) parentPort.postMessage(tagged);
    else if (typeof process.send === 'function') process.send(tagged);
  } catch { /* launcher unreachable — best-effort only */ }
}

/** Listen for messages coming DOWN from the launcher (possibly relayed through a pod). */
export function onLauncherMessage(handler) {
  if (inWorker) parentPort.on('message', handler);
  else process.on('message', handler);
}

export const launcherTransport = inWorker ? 'worker' : 'process';
