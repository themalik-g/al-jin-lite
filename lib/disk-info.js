// ─────────────────────────────────────────────
//  Al-Jin Lite · lib/disk-info.js
//  Disk-room measurement only (no streaming/media code — Lite has none).
//  Ported from the main bot's lib/stream-send.js so `.disk` works here too,
//  without pulling in ffmpeg / child_process / media-send machinery.
//
//  Settings (all owner-controlled with the  .disk  command, persisted):
//    tmpDir        'auto' (default) | 'system' | <folder>   where temp files go
//    diskReserveMB safety margin that is always kept free    (default 150)
//    diskLimitMB   most the bot may use for ONE send          (0 = no extra limit)
//    diskRoomMB    manual "treat this much as free" override  (0 = measure)
// ─────────────────────────────────────────────
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getSetting } from '../core/settings.js';
import { getMaxDownloadBytes } from '../core/limits.js';

const MB = 1024 * 1024;
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

export const reserveBytes = () => (num(getSetting('diskReserveMB')) || num(process.env.AIJIN_DISK_RESERVE_MB) || 150) * MB;
export const wantedTmpDir = () => String(getSetting('tmpDir') || 'auto');
export const botTmpFolder = () => path.join(process.cwd(), 'vault', 'wa-tmp');

async function availOf(dir) {
  try { const s = await fs.promises.statfs(dir); return Number(s.bavail) * Number(s.bsize); } catch { return null; }
}

const ORIG_TMPDIR = process.env.TMPDIR;
const setTmp = (v) => { if (v) process.env.TMPDIR = v; else delete process.env.TMPDIR; };

/** Point the OS temp dir (os.tmpdir() reads TMPDIR on every call) at the roomiest disk. Returns the folder in use. */
export async function ensureTmpDir() {
  const want = wantedTmpDir();
  if (want !== 'auto' && want !== 'system') {            // explicit folder
    try { fs.mkdirSync(want, { recursive: true }); setTmp(want); } catch { /* keep current */ }
    return os.tmpdir();
  }
  setTmp(ORIG_TMPDIR);                                   // start from what the host gave us
  if (want === 'auto' && !ORIG_TMPDIR) {
    const sys = await availOf(os.tmpdir());
    const here = await availOf(process.cwd());
    if (here != null && (sys == null || here > sys * 1.5) && here > 300 * MB) {
      try { fs.mkdirSync(botTmpFolder(), { recursive: true }); setTmp(botTmpFolder()); } catch { /* keep system */ }
    }
  }
  return os.tmpdir();
}

/** Free bytes for ONE send: measured free space minus the reserve, bounded by the manual limit; or the manual room override. */
export async function diskRoomBytes() {
  await ensureTmpDir();
  const manual = num(getSetting('diskRoomMB')) * MB;
  let room;
  if (manual) room = manual;
  else {
    const free = await availOf(os.tmpdir());
    room = free == null ? Infinity : Math.max(0, free - reserveBytes());
  }
  const limit = (num(getSetting('diskLimitMB')) || num(process.env.AIJIN_MAX_TMP_MB)) * MB;
  if (limit) room = Math.min(room, limit);
  return room;
}

/** The size a single send may have right now: .dlcap AND what the disk can take. */
export async function effectiveCapBytes() {
  return Math.min(getMaxDownloadBytes(), await diskRoomBytes());
}

/** Everything the .disk command shows. */
export async function diskInfo() {
  const dir = await ensureTmpDir();
  return {
    dir, tmpAvail: await availOf(dir), here: await availOf(process.cwd()),
    reserve: reserveBytes(), limit: num(getSetting('diskLimitMB')) * MB, manual: num(getSetting('diskRoomMB')) * MB,
    want: wantedTmpDir(), room: await diskRoomBytes(),
  };
}

// Sweep any leftover half-written temp files from earlier crashes (startup only).
export function purgeLeftovers(ageMs = 15 * 60_000) {
  const now = Date.now();
  const sweep = (dir, test) => {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { return; }
    for (const n of names) {
      if (test && !test.test(n)) continue;
      const p = path.join(dir, n);
      try {
        const st = fs.statSync(p);
        if (st.isFile() && now - st.mtimeMs >= ageMs) fs.unlinkSync(p);
      } catch { /* ignore */ }
    }
  };
  sweep(botTmpFolder(), /^(video|document|image|audio|sticker)[\w-]*-(enc|plain)$/i);
  sweep(os.tmpdir(), /^(video|document|image|audio|sticker)[\w-]*-(enc|plain)$/i);
}
ensureTmpDir().then(() => purgeLeftovers(0)).catch(() => purgeLeftovers(0));
