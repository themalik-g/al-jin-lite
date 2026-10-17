#!/usr/bin/env node
// ─────────────────────────────────────────────
// Al-Jin · bootstrap launcher (standalone, zero-dep)
// ─────────────────────────────────────────────

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { containerMemory } from './lib/sysinfo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Real RAM ceiling for this box/container (cgroup-aware where possible, falls
// back to os.totalmem()). Used to size the RAM budget automatically when
// WRAITH_RAM_BUDGET_MB isn't set, so more sessions fit on a bigger box without
// hand-tuning, and fewer get started than the box can actually hold.
function detectRamBudgetMB() {
  try {
    const limitBytes = containerMemory().limit;
    if (limitBytes > 0) {
      // Leave ~20% (min 64MB, max 256MB) for the OS, the launcher process
      // itself, and anything else sharing the box.
      const slackMB = Math.min(256, Math.max(64, Math.round((limitBytes / (1024 * 1024)) * 0.2)));
      return Math.max(128, Math.round(limitBytes / (1024 * 1024)) - slackMB);
    }
  } catch { /* fall through */ }
  return 256; // previous hardcoded default, used only if detection fails entirely
}

// ─────────────────────────────────────────────
// 1. INLINE .env LOADER  (NO dotenv dependency)
//    Runs before anything else touches process.env.
//    Existing env vars (panel/PM2/docker) are NOT overridden.
// ─────────────────────────────────────────────
function loadEnvFile(file) {
  try {
    if (!fs.existsSync(file)) return;
    const text = fs.readFileSync(file, 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (!key) continue;
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (e) {
    console.warn('[al-jin] .env load skipped:', e.message);
  }
}

loadEnvFile(path.join(__dirname, '.env'));

// Al-Jin: AL_JIN_* variables are aliases for the legacy WRAITH_* names.
for (const k of Object.keys(process.env)) {
  if (k.startsWith('AL_JIN_')) {
    const legacy = 'WRAITH_' + k.slice(7);
    if (process.env[legacy] === undefined) process.env[legacy] = process.env[k];
  }
}

// ─────────────────────────────────────────────
// 2. Container-safe default
// ─────────────────────────────────────────────
if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = '2';
}

// ─────────────────────────────────────────────
// 3. Constants
// ─────────────────────────────────────────────
const SOURCE = 'https://github.com/themalik-g/al-jin-lite.git';
const BRANCH = process.env.WRAITH_BRANCH || 'main';

// ─────────────────────────────────────────────
//  ▸ PAIRING_NUMBER  ◂
// ─────────────────────────────────────────────
//  Hardcode a WhatsApp number here to auto-pair on startup.
//
//  • Leave it as '' (empty string)
//        → normal startup: the wizard ASKS you for the number.
//
//  • Set it to digits (10–15 digits, country code + number)
//        → that number is used AUTOMATICALLY to request the
//          pairing code. No prompt, no waiting.
//
//  Accepted formats (all sanitized internally):
//      '923001234567'
//      '+92 300 1234567'
//      '+923001234567'
//      923001234567          (number, not string — works too)
//
//  Precedence:  CLI --phone=…  >  Pairing_Number  >  env  >  null
//  Env fallback keys: WRAITH_PHONE / WRAITH_NUMBER
// ─────────────────────────────────────────────
const Pairing_Number = ''; // ← put your number here, e.g. '923001234567'

// ═══════════════════════════════════════════════
// 🔑 SESSION ID (optional) — from the Jin pairing site
// Paste your Session ID (JIN_...) to connect WITHOUT pairing again.
// Can also be set as SESSION_ID in .env / panel variables / --session-id=JIN_...
// SESSION_API is the address of the session store; the pairing site fills it in.
// ═══════════════════════════════════════════════
const SESSION_ID = '';
const SESSION_API = '';

const CLONE_TIMEOUT = 180_000;
const INSTALL_TIMEOUT = 300_000;
const LINK_WAIT_MS = 300_000;
const MAX_RESTARTS = 10;
const ADD_MODE =
  process.argv.includes('--add') || process.argv.includes('--setup');
const PROMPT_TIMEOUT_MS = Number(
  process.env.WRAITH_PROMPT_TIMEOUT_MS || 20_000
);

// ─────────────────────────────────────────────
// 4. Styling helpers
// ─────────────────────────────────────────────
const dye = (c, s) => `\x1b[${c}m${s}\x1b[0m`;
const grey = s => dye(90, s);
const cyan = s => dye(36, s);
const violet = s => dye(35, s);
const green = s => dye(32, s);
const yellow = s => dye(33, s);
const red = s => dye(31, s);
const clock = () => grey(new Date().toTimeString().slice(0, 8));
const say = (...p) => console.log(clock(), violet('❯'), ...p);

const veil = () => {
  console.log();
  console.log(violet(' · · · · · · · · · · ·'));
  console.log(violet(' a l - j i n'));
  console.log(violet(' · · · · · · · · · · ·'));
  console.log();
};

// ─────────────────────────────────────────────
// 5. Configured phone number resolution
//    Priority:  CLI arg  >  Pairing_Number  >  env  >  null
// ─────────────────────────────────────────────
const PHONE_RE = /^\d{10,15}$/;

function resolveConfiguredPhone(argv = process.argv, env = process.env) {
  // 1) CLI override  --phone=…  /  --number=…
  const cli = argv.find(
    a => a.startsWith('--phone=') || a.startsWith('--number=')
  );
  if (cli) {
    const digits = cli.split('=')[1].replace(/\D/g, '');
    if (PHONE_RE.test(digits)) return digits;
    console.warn(
      clock(),
      red(`ignoring invalid --phone value: ${cli.split('=')[1]}`)
    );
  }

  // 2) Hardcoded Pairing_Number (takes priority over env).
  //    Sanitize: strip +, spaces, dashes, and coerce to string so
  //    '+92 300 1234567' / 923001234567 (number) both work.
  if (Pairing_Number !== '' && Pairing_Number != null) {
    const digits = String(Pairing_Number).replace(/\D/g, '');
    if (PHONE_RE.test(digits)) {
      return digits;
    }
    console.warn(
      clock(),
      red(
        `ignoring invalid Pairing_Number "${Pairing_Number}" — must be 10–15 digits`
      )
    );
  }

  // 3) Env fallback:  WRAITH_PHONE / WRAITH_NUMBER
  const fromEnv = (env.WRAITH_PHONE || env.WRAITH_NUMBER || '').replace(
    /\D/g,
    ''
  );
  if (PHONE_RE.test(fromEnv)) return fromEnv;

  // 4) Nothing configured → wizard will prompt
  return null;
}

const CONFIGURED_PHONE = resolveConfiguredPhone();

// ─────────────────────────────────────────────
// DEBUG — one-line confirmation of what was resolved.
// Remove once pairing works if you prefer silence.
// ─────────────────────────────────────────────
say(
  grey(
    `[config] Pairing_Number="${Pairing_Number}" · ` +
      `CONFIGURED_PHONE=${CONFIGURED_PHONE ?? 'null'} · ` +
      `TTY=${process.stdin.isTTY}`
  )
);

// ─────────────────────────────────────────────
// 6. Repo / instance helpers
// ─────────────────────────────────────────────
function repoRoot() {
  if (fs.existsSync(path.join(__dirname, 'start.js'))) return __dirname;

  const dir = path.join(__dirname, 'wraith');
  if (!fs.existsSync(path.join(dir, 'start.js'))) {
    say(yellow('fetching al-jin from origin…'));
    const res = spawnSync(
      'git',
      ['clone', '--depth', '1', '-b', BRANCH, SOURCE, dir],
      { stdio: 'inherit', timeout: CLONE_TIMEOUT }
    );
    if (res.status !== 0) {
      throw new Error('git clone failed – check network or repository access');
    }
  }
  return dir;
}

function installDeps(dir) {
  say(yellow('installing dependencies…'));
  const res = spawnSync('npm', ['install', '--omit=dev'], {
    cwd: dir,
    stdio: 'inherit',
    timeout: INSTALL_TIMEOUT,
  });
  if (res.status !== 0) {
    throw new Error('npm install failed – see output above');
  }
  say(green('✓ dependencies locked in'));
}

const instDir = (root, id) => path.join(root, 'instances', id);
const SHARED_ID = '_shared';
// Session ids: letters/digits/_/- only, never starting with "_" (so "_shared" and path tricks are rejected).
const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const sharedDirOf = root => {
  const d = path.join(root, 'instances', SHARED_ID);
  fs.mkdirSync(d, { recursive: true });
  return d;
};

function makeInstance(root, id) {
  const dir = instDir(root, id);
  for (const name of ['session', 'state', 'logs', 'data']) {
    fs.mkdirSync(path.join(dir, name), { recursive: true });
  }
  return dir;
}

function migrateLegacy(root) {
  const main = instDir(root, 'main');
  for (const name of ['session', 'state', 'vault']) {
    const src = path.join(root, name);
    const dst = path.join(main, name);
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      say(yellow(`migrating legacy /${name} → instances/main/${name}`));
      try {
        fs.cpSync(src, dst, { recursive: true, force: false });
      } catch (e) {
        say(red(`migration warning: ${e.message}`));
      }
    }
  }

  // Auto-import root creds.json if uploaded directly to VPS
  const rootCreds = path.join(root, 'creds.json');
  const mainCreds = path.join(main, 'session', 'creds.json');
  if (fs.existsSync(rootCreds) && !fs.existsSync(mainCreds)) {
    say(green('found root creds.json — auto-moving to instances/main/session/creds.json'));
    try {
      fs.mkdirSync(path.join(main, 'session'), { recursive: true });
      fs.renameSync(rootCreds, mainCreds);
    } catch (e) {
      try {
        fs.copyFileSync(rootCreds, mainCreds);
        fs.unlinkSync(rootCreds);
      } catch (err) {
        say(red(`auto-creds migration warning: ${err.message}`));
      }
    }
  }
}

const isLinked = (root, id) =>
  fs.existsSync(path.join(root, 'instances', id, 'session', 'creds.json'));

function listExistingInstances(root) {
  const dir = path.join(root, 'instances');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(n => {
      try {
        return fs.statSync(path.join(dir, n)).isDirectory();
      } catch {
        return false;
      }
    })
    .filter(n => isLinked(root, n))
    .sort();
}

function nextSessionId(root) {
  const dir = path.join(root, 'instances');
  if (!fs.existsSync(dir)) return 'main';

  const used = fs.readdirSync(dir).filter(n => {
    try {
      return fs.statSync(path.join(dir, n)).isDirectory() && isLinked(root, n);
    } catch {
      return false;
    }
  });

  if (used.length === 0 || !used.includes('main')) return 'main';
  let maxN = 1;
  for (const id of used) {
    const m = /^sess(\d+)$/.exec(id);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  }
  return `sess${maxN + 1}`;
}

// ─────────────────────────────────────────────
// 7. Session spawning
// ─────────────────────────────────────────────
const children = new Map();
const restartingSessions = new Set();
const removed = new Set(); // ids deleted with .delsession — never auto-restarted / re-created
const STAGGER_MS = Number(process.env.WRAITH_SPAWN_STAGGER_MS ?? 2500);

// Tell every running session how many sessions share the box (CPU/RAM limits are split by it).
function broadcastCount() {
  const live = [...children.values()].filter(r => !r.deleting);
  const count = Math.max(1, live.length);
  for (const r of live) {
    try { if (r.proc.connected) r.proc.send({ type: 'wraith:sessions', count }); } catch {}
  }
}

// Start several sessions one after another (a simultaneous boot spikes CPU/RAM and the WA servers).
function spawnAll(root, ids) {
  ids.forEach((id, i) => {
    const go = () => { if (!shuttingDown) spawnSession(root, id, null, { totalSessions: ids.length }); };
    if (i === 0 || STAGGER_MS <= 0) go(); else setTimeout(go, i * STAGGER_MS);
  });
}

// .delsession: unlink the device, stop the process, WAIT for it to exit, then delete the folder.
// (Old flow deleted the folder while the process was still alive; its clean exit then looked like a
//  "restart for update" and the launcher respawned it, re-creating the deleted instance.)
function deleteSession(root, id) {
  if (!VALID_ID.test(String(id)) || id === 'main') {
    say(red(`refusing to delete session "${id}"`));
    return;
  }
  removed.add(id);
  const dir = instDir(root, id);
  const wipe = () => {
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 }); break; }
      catch (e) { if (i === 4) { say(red(`failed to remove ${id}: ${e.message}`)); return; } }
    }
    say(green(`deleted session ${id}`));
    broadcastCount();
  };
  const rec = children.get(id);
  if (!rec) { wipe(); return; }
  rec.deleting = true;
  broadcastCount();
  const killer = setTimeout(() => { try { rec.proc.kill('SIGKILL'); } catch {} }, 9000);
  killer.unref?.();
  rec.proc.once('exit', () => { clearTimeout(killer); setTimeout(wipe, 300); });
  try { rec.proc.send({ type: 'wraith:logout_and_exit' }); }
  catch { try { rec.proc.kill('SIGTERM'); } catch {} }
}
let shuttingDown = false;
let rl = null;

const ask = q => new Promise(res => rl.question(q, a => res(a.trim())));

// ─────────────────────────────────────────────
// Prompt for a WhatsApp number.
// If CONFIGURED_PHONE is set, auto-fallback to it
// after PROMPT_TIMEOUT_MS of no input.
// ─────────────────────────────────────────────
async function promptNumber(label = 'number') {
  console.log();
  console.log(violet(` ╭─ link a ${label} ─────────────────────╮`));
  console.log(violet(' │') + ' WhatsApp number, digits only ' + violet('│'));
  console.log(
    violet(' │') +
      grey(' country code + number · 923001234567 ') +
      violet('│')
  );
  if (CONFIGURED_PHONE) {
    console.log(
      violet(' │') +
        yellow(
          ` ⏱ no input in ${PROMPT_TIMEOUT_MS / 1000}s → +${CONFIGURED_PHONE} `
        ) +
        violet('│')
    );
  }
  console.log(violet(' ╰────────────────────────────────────────╯'));

  return new Promise(resolve => {
    let settled = false;
    let timer = null;

    const finish = num => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(num);
    };

    if (CONFIGURED_PHONE) {
      timer = setTimeout(() => {
        if (settled) return;
        process.stdout.write('\n');
        say(
          yellow(
            `⏱ no input in ${PROMPT_TIMEOUT_MS / 1000}s — auto-pairing +${CONFIGURED_PHONE}`
          )
        );
        finish(CONFIGURED_PHONE);
      }, PROMPT_TIMEOUT_MS);
    }

    (async () => {
      while (!settled) {
        let raw;
        try {
          raw = await ask(violet(' ❯ ') + cyan(`${label}: `));
        } catch {
          if (CONFIGURED_PHONE) finish(CONFIGURED_PHONE);
          return;
        }
        if (settled) return;

        const digits = raw.replace(/\D/g, '');
        if (!/^\d{10,15}$/.test(digits)) {
          console.log(red(' ✖ must be 10–15 digits'));
          continue;
        }
        finish(digits);
        return;
      }
    })();
  });
}

function spawnSession(root, id, number, opts = {}) {
  const refuse = why => {
    say(yellow(`not starting session "${id}": ${why}`));
    return { proc: null, linkedPromise: Promise.resolve(false), exitPromise: Promise.resolve({ code: 1 }) };
  };
  if (!VALID_ID.test(String(id))) return refuse('invalid id');
  if (opts.fresh) removed.delete(id);
  else if (removed.has(id)) return refuse('it was deleted');
  const shared = sharedDirOf(root);
  const dir = makeInstance(root, id);
  // RAM-budget aware: split the box's total RAM across every session that will run
  // concurrently, instead of handing each one the full ceiling (which is wrong the
  // moment a 2nd session starts). Override per-session with WRAITH_MAX_OLD_SPACE_SIZE.
  const totalSessions = Math.max(1, Number(opts.totalSessions) || 1);
  const ramBudgetMB = Number(process.env.WRAITH_RAM_BUDGET_MB || detectRamBudgetMB());
  // node baseline + OS slack is paid by EVERY session process, not once —
  // each spawned child is its own full node process (module code, libuv,
  // Baileys/libsignal state, pino, etc. all live outside the V8 heap this
  // flag caps). Subtracting it only once badly over-budgeted the heap on
  // every session as soon as more than 2-3 were running, so the real,
  // combined RSS of all children blew past the box's actual RAM long before
  // any single session hit its own --max-old-space-size ceiling.
  const baseOverheadMB = Number(process.env.WRAITH_SESSION_OVERHEAD_MB || 30); // per-process baseline RSS outside the V8 heap
  const autoPerSession = Math.floor((ramBudgetMB - baseOverheadMB * totalSessions) / totalSessions);
  const maxOldSpace = process.env.WRAITH_MAX_OLD_SPACE_SIZE || String(Math.max(24, Math.min(256, autoPerSession)));
  const semiSpace = process.env.WRAITH_V8_SEMI_SPACE_SIZE || (ramBudgetMB <= 256 ? '8' : '16');
  const args = [
    `--max-old-space-size=${maxOldSpace}`,
    `--max-semi-space-size=${semiSpace}`,
    '--expose-gc',
  ];
  if (process.env.WRAITH_V8_POOL_SIZE) {
    args.push(`--v8-pool-size=${process.env.WRAITH_V8_POOL_SIZE}`);
  }
  args.push(path.join(root, 'start.js'), '--session', id);
  if (number) args.push('--number', number);

  const env = {
    ...process.env,
    UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || '2',
    WRAITH_REPO_ROOT: root,
    WRAITH_SESSION_ID: id,
    WRAITH_DATA_DIR: dir,
    WRAITH_SHARED_DIR: shared,
    WRAITH_ACTIVE_SESSIONS: String(totalSessions),
    // one V8 compile cache for every session → faster boot, less CPU
    NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE || path.join(shared, '.compile-cache'),
  };

  say(cyan(`starting session ${id}${number ? ' · +' + number : ''}`));
  const proc = spawn('node', args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env,
  });

  let muted = false;
  const backlog = [];
  const route = (stream, dest) => {
    stream.on('data', chunk => {
      if (muted) backlog.push([dest, chunk]);
      else dest.write(chunk);
    });
  };
  route(proc.stdout, process.stdout);
  route(proc.stderr, process.stderr);

  let resolveLinked, resolveExit;
  const linkedPromise = new Promise(r => (resolveLinked = r));
  const exitPromise = new Promise(r => (resolveExit = r));

  const rec = {
    number,
    proc,
    restarts: 0,
    resetTimer: null,
    resolveLinked,
    resolveExit,
    mute: () => {
      muted = true;
    },
    unmute: () => {
      muted = false;
      for (const [dest, chunk] of backlog) dest.write(chunk);
      backlog.length = 0;
    },
  };
  children.set(id, rec);

  proc.on('message', m => {
    if (m?.type === 'wraith:linked') {
      try {
        resolveLinked(true);
      } catch {}
    }
    if (m?.type === 'wraith:spawn_session' && m.sessionId) {
      if (children.has(m.sessionId)) {
        say(yellow(`session ${m.sessionId} is already running`));
      } else {
        say(
          green(
            `dynamic spawn request received for session ${m.sessionId}${
              m.number ? ' (+' + m.number + ')' : ''
            }`
          )
        );
        spawnSession(root, m.sessionId, m.number || null, { totalSessions: children.size + 1, fresh: true });
      }
    }
    if (m?.type === 'wraith:restart_all') {
      say(
        cyan(
          `multi-session update requested by ${id} — restarting all other sessions`
        )
      );
      for (const [otherId, otherRec] of children.entries()) {
        if (otherId !== id) {
          restartingSessions.add(otherId);
          try {
            otherRec.proc.kill('SIGTERM');
          } catch {}
        }
      }
    }
    if (m?.type === 'wraith:delete_session' && m.sessionId) {
      say(yellow(`delete session request received for ${m.sessionId}`));
      deleteSession(root, String(m.sessionId));
    }
  });

  proc.on('error', err =>
    console.error(clock(), red('spawn error:'), err.message)
  );

  proc.on('exit', (code, signal) => {
    if (children.get(id) === rec) children.delete(id);
    try {
      resolveExit({ code, signal });
    } catch {}
    clearTimeout(rec.resetTimer);
    broadcastCount();

    if (shuttingDown) return;
    if (rec.deleting || removed.has(id)) return; // deleted on purpose — never restart

    if (restartingSessions.has(id)) {
      restartingSessions.delete(id);
      say(cyan(`restarting session ${id} for update…`));
      setTimeout(() => {
        if (!shuttingDown && !removed.has(id)) spawnSession(root, id, rec.number, { totalSessions: Math.max(1, children.size) });
      }, 1000);
      return;
    }

    if (signal === 'SIGINT' || signal === 'SIGTERM') return;

    rec.restarts++;
    if (rec.restarts > MAX_RESTARTS) {
      say(red(`${id}: exceeded max restarts (${MAX_RESTARTS}) — giving up`));
      return;
    }

    const wait = Math.min(1500 * Math.pow(2, rec.restarts - 1), 30_000);
    const exitDetail =
      code !== null
        ? `code ${code}`
        : signal
        ? `signal ${signal}`
        : 'code null';
    const why =
      code === 0
        ? 'restarting for update/clean exit'
        : `crashed (${exitDetail})`;
    say(
      yellow(
        `${id}: ${why} · retry ${rec.restarts} in ${(wait / 1000).toFixed(1)}s`
      )
    );

    setTimeout(() => {
      if (!shuttingDown && !removed.has(id)) spawnSession(root, id, rec.number, { totalSessions: Math.max(1, children.size) });
    }, wait);
  });

  clearTimeout(rec.resetTimer);
  rec.resetTimer = setTimeout(() => {
    rec.restarts = 0;
  }, 20_000);
  setTimeout(broadcastCount, 800);

  return { proc, linkedPromise, exitPromise };
}

async function waitForLink(spawnResult, id) {
  return Promise.race([
    spawnResult.linkedPromise.then(() => 'linked'),
    spawnResult.exitPromise.then(({ code }) => {
      if (code === 0) return 'exited';
      throw new Error(`session ${id} exited early with code ${code}`);
    }),
    new Promise((_, rej) =>
      setTimeout(
        () =>
          rej(
            new Error(
              `session ${id} link timeout after ${LINK_WAIT_MS / 1000}s`
            )
          ),
        LINK_WAIT_MS
      )
    ),
  ]);
}

function muteAll() {
  for (const rec of children.values()) rec.mute?.();
}
function unmuteAll() {
  for (const rec of children.values()) rec.unmute?.();
}

async function linkOne(root, label, presetNumber = null) {
  let number = presetNumber;

  if (number) {
    say(cyan(`using configured number +${number}`));
  } else if (!process.stdin.isTTY || !rl) {
    throw new Error(
      'no phone number available — set Pairing_Number, WRAITH_PHONE env, or pass --phone=923001234567'
    );
  } else {
    number = await promptNumber(label);
  }

  const id = nextSessionId(root);
  say(grey(`spawning session ${id} for +${number} — waiting for pairing code…`));

  const result = spawnSession(root, id, number, { totalSessions: children.size + 1, fresh: true });
  try {
    await waitForLink(result, id);
    console.log(green(`\n ✔ ${id} linked (+${number})`));
    return true;
  } catch (e) {
    console.error(red(` ✖ ${e.message}`));
    return false;
  }
}

async function wizard(root) {
  console.log();
  console.log(violet(' ╭───────────────────────────────────────╮'));
  console.log(violet(' │') + ' Al-Jin · pairing wizard ' + violet('│'));
  console.log(violet(' ╰───────────────────────────────────────╯'));

  const firstLabel = ADD_MODE ? 'new number' : 'first number';

  // If Pairing_Number (or CLI/env) is set, linkOne uses it directly
  // and the interactive prompt is skipped.
  const ok1 = await linkOne(root, firstLabel, CONFIGURED_PHONE);
  if (!ok1) {
    say(red('first number failed — aborting wizard'));
    return;
  }

  while (true) {
    if (!process.stdin.isTTY) {
      console.log(grey(' non-interactive — running linked session(s).\n'));
      break;
    }
    muteAll();
    await new Promise(r => setTimeout(r, 250));
    process.stdout.write('\n');
    const ans = await ask(
      violet(' ❯ ') + 'link another number? ' + grey('[y/N]: ')
    );
    unmuteAll();
    if (!/^y(es)?$/i.test(ans)) {
      console.log(grey(' done — running linked session(s).\n'));
      break;
    }
    // Subsequent numbers always prompt (no preset) — Pairing_Number
    // applies only to the first/primary session.
    const ok = await linkOne(root, 'next number');
    if (!ok) {
      console.log(grey(' aborting further links.\n'));
      break;
    }
  }
}

function quiet(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  say(grey(`${sig} received — shutting down all sessions`));
  for (const { proc } of children.values()) {
    try {
      proc.kill('SIGTERM');
    } catch {}
  }
  setTimeout(() => process.exit(0), 800);
}

process.on('SIGINT', () => quiet('SIGINT'));
process.on('SIGTERM', () => quiet('SIGTERM'));

// ─────────────────────────────────────────────
// 7b. SESSION_ID restore (Cloudflare Workers KV)
//     Puts the saved login into instances/main/session before the bot starts.
// ─────────────────────────────────────────────
const SESSION_ID_RE = /^JIN_[A-Za-z0-9]{24,64}$/;

function sessionIdConfig() {
  const cli = process.argv.find(a => a.startsWith('--session-id='));
  const id = String(
    (cli ? cli.slice(13) : '') || process.env.SESSION_ID || process.env.JIN_SESSION_ID || SESSION_ID || ''
  ).trim();
  if (!id) return null;
  if (!SESSION_ID_RE.test(id)) {
    return { error: 'SESSION_ID is not valid - it must look like JIN_xxxxxxxxxxxxxxxxxxxxxxxxxxxx' };
  }
  const api = String(
    process.env.SESSION_API || process.env.JIN_SESSION_API || SESSION_API || ''
  ).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(api)) {
    return { error: 'SESSION_API is missing - set the address of your session store' };
  }
  return { id, api };
}

async function restoreFromSessionId(root) {
  const cfg = sessionIdConfig();
  if (!cfg) return;
  if (cfg.error) { say(red('session ID: ' + cfg.error)); return; }
  // the bot process inherits these (used for keeping the stored login fresh)
  process.env.SESSION_ID = cfg.id;
  process.env.SESSION_API = cfg.api;

  const dir = path.join(instDir(root, 'main'), 'session');
  const creds = path.join(dir, 'creds.json');
  const marker = path.join(dir, '.session-id');
  const read = f => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return ''; } };

  if (fs.existsSync(creds) && read(marker) === cfg.id) {
    say(grey('session ID: using the saved login'));
    return;
  }

  say(cyan('session ID: fetching your login...'));
  let text = null, err = null;
  for (let i = 0; i < 3 && text === null; i++) {
    try {
      const r = await fetch(cfg.api + '/s/' + cfg.id, { signal: AbortSignal.timeout(15000) });
      if (r.ok) text = await r.text();
      else err = new Error(r.status === 404
        ? 'Session ID not found - check it was copied completely (if you linked a moment ago, wait a minute and restart)'
        : 'session store answered HTTP ' + r.status);
    } catch (e) {
      err = new Error('could not reach the session store (' + (e && e.message) + ')');
    }
    if (text === null && i < 2) await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  if (text === null) { say(red('session ID: ' + (err && err.message))); return; }

  let j = null;
  try { j = JSON.parse(text); } catch {}
  if (!j || !j.noiseKey || !j.signedIdentityKey) {
    say(red('session ID: the stored login is not valid'));
    return;
  }

  if (fs.existsSync(creds)) {   // another login is here -> keep it as a backup, never mix two logins
    try { fs.renameSync(dir, dir + '.old-' + Date.now()); }
    catch { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(creds + '.tmp', text);
  fs.renameSync(creds + '.tmp', creds);
  fs.writeFileSync(marker, cfg.id);
  say(green('session ID: login restored - no pairing needed'));
}

// ─────────────────────────────────────────────
// 8. Main entry
// ─────────────────────────────────────────────
(async () => {
  try {
    veil();
    const root = repoRoot();
    if (!fs.existsSync(path.join(root, 'node_modules'))) installDeps(root);
    makeInstance(root, 'main');
    migrateLegacy(root);

    await restoreFromSessionId(root);

    const existing = listExistingInstances(root);

    // ── non-interactive (Pterodactyl, PM2, systemd, docker) ──
    if (!process.stdin.isTTY) {
      if (existing.length) {
        say(
          grey(
            `[non-interactive] resuming ${existing.length} session(s): ${existing.join(
              ', '
            )}`
          )
        );
        spawnAll(root, existing);
        return;
      }

      if (CONFIGURED_PHONE) {
        say(
          grey(
            `[non-interactive] no sessions found — auto-pairing +${CONFIGURED_PHONE}`
          )
        );
        try {
          const ok = await linkOne(root, 'auto', CONFIGURED_PHONE);
          if (!ok) process.exit(0);
        } catch (e) {
          console.error(red(`auto-pair failed: ${e.message}`));
          process.exit(0);
        }
        return;
      }

      say(
        red(
          '[non-interactive] no linked sessions and no Pairing_Number / WRAITH_PHONE set'
        )
      );
      say(
        grey(
          '  → set SESSION_ID (from the Jin pairing site), or Pairing_Number = "923001234567" in index.js, or WRAITH_PHONE=923001234567 in env, or run once interactively'
        )
      );
      process.exit(0);
    }

    // ── interactive TTY ──
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (ADD_MODE) {
      spawnAll(root, existing);
      await wizard(root);
      return;
    }

    if (existing.length) {
      say(grey(`resuming ${existing.length} session(s): ${existing.join(', ')}`));
      spawnAll(root, existing);
      return;
    }

    await wizard(root);
  } catch (err) {
    console.error(red('FATAL:'), err.message);
    process.exit(1);
  }
})();
