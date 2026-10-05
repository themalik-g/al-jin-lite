// ─────────────────────────────────────────────
//  Al-Jin · modules/ping.js
//  Latency probe + container-aware system vitals.
//
//  Reads cgroup v1/v2 directly so CPU% and memory
//  reflect the CONTAINER, not the host — matching
//  what your panel shows.
// ─────────────────────────────────────────────
import fs from 'node:fs';
import os from 'node:os';
import { isOwner } from '../core/identity.js';
import { execFile } from 'node:child_process';
import { sendWithCta, newsletterContext } from '../lib/buttons.js';

const NEWSLETTER_CONTEXT_FN = newsletterContext;

const BOOT_TIME = Date.now() - process.uptime() * 1000;   // real process start, not first-use

// ─────────────────────────────────────────────
//  cgroup detection
// ─────────────────────────────────────────────
function readFileSafe(p) {
    try { return fs.readFileSync(p, 'utf8').trim(); } catch { return null; }
}

function detectCgroupVersion() {
    const cg = readFileSafe('/proc/self/cgroup');
    if (!cg) return 0;
    if (/^0::/m.test(cg)) return 2;
    return 1;
}

function detectCgroupPath() {
    const cg = readFileSafe('/proc/self/cgroup');
    if (!cg) return '';
    const v2 = cg.match(/^0::(.+)$/m);
    if (v2) return v2[1];
    const v1 = cg.match(/^\d+:[^:]*:(.+)$/m);
    return v1 ? v1[1] : '';
}

const CG_VERSION = detectCgroupVersion();
const CG_PATH    = detectCgroupPath();

function cgReadV2(file) {
    return readFileSafe(`/sys/fs/cgroup${CG_PATH}/${file}`)
        ?? readFileSafe(`/sys/fs/cgroup/${file}`);
}
function cgReadV1(subsystem, file) {
    return readFileSafe(`/sys/fs/cgroup/${subsystem}${CG_PATH}/${file}`)
        ?? readFileSafe(`/sys/fs/cgroup/${subsystem}/${file}`);
}

// ─────────────────────────────────────────────
//  Container memory
// ─────────────────────────────────────────────
function containerMemory() {
    if (CG_VERSION === 2) {
        const current = parseInt(cgReadV2('memory.current') || '0', 10);
        const maxRaw  = cgReadV2('memory.max');
        const limit   = (!maxRaw || maxRaw === 'max') ? 0 : parseInt(maxRaw, 10);
        if (current > 0 && limit > 0) {
            return { used: current, limit, source: 'cgroup v2' };
        }
    }

    if (CG_VERSION === 1) {
        const current = parseInt(cgReadV1('memory', 'memory.usage_in_bytes') || '0', 10);
        const maxRaw  = cgReadV1('memory', 'memory.limit_in_bytes');
        let limit     = parseInt(maxRaw || '0', 10);
        if (limit > 1e15) limit = 0;
        if (current > 0 && limit > 0) {
            return { used: current, limit, source: 'cgroup v1' };
        }
    }

    const total = os.totalmem();
    const free  = os.freemem();
    return { used: total - free, limit: total, source: 'host' };
}

// ─────────────────────────────────────────────
//  Container CPU
// ─────────────────────────────────────────────
function cgCpuUsageUsec() {
    if (CG_VERSION === 2) {
        const stat = cgReadV2('cpu.stat');
        if (stat) {
            const m = stat.match(/^usage_usec\s+(\d+)/m);
            if (m) return parseInt(m[1], 10);
        }
    }
    if (CG_VERSION === 1) {
        const raw = cgReadV1('cpuacct', 'cpuacct.usage');
        if (raw) return Math.floor(parseInt(raw, 10) / 1000);
    }
    return null;
}

function cgCpuCores() {
    if (CG_VERSION === 2) {
        const raw = cgReadV2('cpu.max');
        if (raw) {
            const [quotaStr, periodStr] = raw.split(/\s+/);
            if (quotaStr !== 'max') {
                const quota  = parseInt(quotaStr, 10);
                const period = parseInt(periodStr, 10);
                if (quota > 0 && period > 0) return quota / period;
            }
        }
    }
    if (CG_VERSION === 1) {
        const quotaStr  = cgReadV1('cpu', 'cpu.cfs_quota_us');
        const periodStr = cgReadV1('cpu', 'cpu.cfs_period_us');
        if (quotaStr && periodStr) {
            const quota  = parseInt(quotaStr, 10);
            const period = parseInt(periodStr, 10);
            if (quota > 0 && period > 0) return quota / period;
        }
    }
    return null;
}

async function sampleContainerCpu(gapMs = 300) {
    const before = cgCpuUsageUsec();
    if (before === null) return null;

    const t0 = process.hrtime.bigint();
    await new Promise((r) => setTimeout(r, gapMs));
    const t1 = process.hrtime.bigint();

    const after = cgCpuUsageUsec();
    if (after === null) return null;

    const deltaUsageUsec = after - before;
    const deltaWallUsec  = Number(t1 - t0) / 1000;

    if (deltaWallUsec <= 0) return { pct: 0, cores: cgCpuCores() || 1, coreFraction: 0 };

    const coreFraction = deltaUsageUsec / deltaWallUsec;
    const quotaCores = cgCpuCores();
    const denom = (quotaCores && quotaCores > 0) ? quotaCores : 1;

    return {
        pct: Math.max(0, Math.min(100, (coreFraction / denom) * 100)),
        cores: quotaCores || 1,
        coreFraction,
    };
}

// ─────────────────────────────────────────────
//  Formatting helpers
// ─────────────────────────────────────────────
function bar(pct, width = 10) {
    const p = Math.max(0, Math.min(100, pct));
    const filled = Math.max(0, Math.min(width, Math.round((p / 100) * width)));
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function rttBar(ms) {
    const filled = Math.min(Math.max(Math.round(ms / 100), 1), 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

// RTT quality — how fast WhatsApp is answering
function rttQuality(ms) {
    if (ms < 150) return '🟢excellent';
    if (ms < 400) return '🟡good';
    if (ms < 900) return '🟠slow';
    return '🔴laggy';
}

// CPU quality — how much of YOUR quota is being used
// (based on actual utilisation %, not absolute cores)
function cpuQuality(pct) {
    if (pct < 10)  return '🟢minute';
    if (pct < 40)  return '🟢light';
    if (pct < 70)  return '🟡normal';
    if (pct < 90)  return '🟠busy';
    return '🔴saturated';
}

// Memory quality — how close to the cgroup limit
function memQuality(pct) {
    if (pct < 60) return '🟢healthy';
    if (pct < 80) return '🟡normal';
    if (pct < 92) return '🟠high';
    return '🔴critical';
}

export function ramSummary() {
    const m = containerMemory();
    return `${mb(m.used)} MB / ${mb(m.limit)} MB`;
}

export function uptime() {
    const s   = Math.floor((Date.now() - BOOT_TIME) / 1000);
    const d   = Math.floor(s / 86400);
    const h   = Math.floor((s % 86400) / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = s % 60;

    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h || d) parts.push(`${h}h`);
    if (m || h || d) parts.push(`${m}m`);
    parts.push(`${sec}s`);
    return parts.join(' ');
}

function mb(bytes) {
    return (bytes / 1024 / 1024).toFixed(1);
}

// ─────────────────────────────────────────────
//  helpers shared by .cpu .gpu .ram .rom
// ─────────────────────────────────────────────
function ownerGuard(sock, chat, msg) {
    const from = msg.key.participant || msg.key.remoteJid;
    if (!msg.key.fromMe && !isOwner(from)) {
        sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg }).catch(() => {});
        return true;
    }
    return false;
}

function gb(bytes) {
    return (bytes / 1024 / 1024 / 1024).toFixed(2);
}

function runCmd(cmd, args, timeout = 2500) {
    return new Promise((resolve) => {
        try {
            execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout) => {
                resolve(err ? null : String(stdout || '').trim());
            });
        } catch { resolve(null); }
    });
}

// ─────────────────────────────────────────────
//  .ping  → milliseconds only
// ─────────────────────────────────────────────
export async function pingCommand(sock, chat, msg) {
    const t0 = Date.now();
    const sent = await sock.sendMessage(chat, { text: '🏓' }, { quoted: msg });
    const ms = Date.now() - t0;
    const text = `🏓 *${ms} ms*`;
    if (sent?.key) {
        await sock.sendMessage(chat, { text, edit: sent.key, contextInfo: NEWSLETTER_CONTEXT_FN() })
            .catch(() => sock.sendMessage(chat, { text }, { quoted: msg }));
    } else {
        await sock.sendMessage(chat, { text }, { quoted: msg });
    }
}

// ─────────────────────────────────────────────
//  .cpu
// ─────────────────────────────────────────────
export async function cpuCommand(sock, chat, msg) {
    if (ownerGuard(sock, chat, msg)) return;
    const cpus = os.cpus() || [];
    const model = (cpus[0]?.model || 'unknown').replace(/\s+/g, ' ').trim();
    const sample = await sampleContainerCpu(300);
    const load = os.loadavg().map((n) => n.toFixed(2)).join(' · ');
    const lines = [`🧠 *CPU*`, ``, `*model* · ${model}`];
    if (sample) {
        const quota = Number.isInteger(sample.cores) ? sample.cores : sample.cores.toFixed(2);
        lines.push(
            `*cores* · ${cpus.length} host / ${quota} quota`,
            `*usage* · ${sample.pct.toFixed(1)}% ${cpuQuality(sample.pct)}`,
            `\`${bar(sample.pct)}\``
        );
    } else {
        lines.push(`*cores* · ${cpus.length}`);
    }
    if (cpus[0]?.speed) lines.push(`*speed* · ${cpus[0].speed} MHz`);
    lines.push(`*load avg* · ${load}`);
    await sock.sendMessage(chat, { text: lines.join('\n') }, { quoted: msg });
}

// ─────────────────────────────────────────────
//  .gpu
// ─────────────────────────────────────────────
export async function gpuCommand(sock, chat, msg) {
    if (ownerGuard(sock, chat, msg)) return;
    let text = null;
    const nv = await runCmd('nvidia-smi', [
        '--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu',
        '--format=csv,noheader,nounits',
    ]);
    if (nv) {
        const rows = nv.split('\n').map((l) => l.split(',').map((x) => x.trim()));
        text = ['🎮 *GPU*', ''].concat(rows.map((r, i) =>
            `*#${i}* · ${r[0]}\n• usage · ${r[1]}%\n• vram · ${r[2]} / ${r[3]} MB\n• temp · ${r[4]}°C`
        )).join('\n');
    } else {
        const pci = await runCmd('sh', ['-c', "lspci 2>/dev/null | grep -iE 'vga|3d|display'"]);
        if (pci) {
            const names = pci.split('\n').map((l) => l.replace(/^[^:]+:\d+\.\d+\s+[^:]+:\s*/, '').trim());
            text = ['🎮 *GPU*', ''].concat(names.map((n, i) => `*#${i}* · ${n}`)).join('\n');
        }
    }
    await sock.sendMessage(chat, { text: text || '🎮 *GPU*\n\nNo GPU detected on this server.' }, { quoted: msg });
}

// ─────────────────────────────────────────────
//  .ram
// ─────────────────────────────────────────────
export async function ramCommand(sock, chat, msg) {
    if (ownerGuard(sock, chat, msg)) return;
    const mem = containerMemory();
    const pct = (mem.used / mem.limit) * 100;
    const proc = process.memoryUsage();
    const text = [
        `💾 *RAM*`,
        ``,
        `\`${bar(pct)}\` ${pct.toFixed(1)}% ${memQuality(pct)}`,
        `*used* · ${mb(mem.used)} / ${mb(mem.limit)} MB`,
        `*host total* · ${gb(os.totalmem())} GB`,
        `*host free* · ${gb(os.freemem())} GB`,
        `*process rss* · ${mb(proc.rss)} MB`,
        `*heap* · ${mb(proc.heapUsed)} / ${mb(proc.heapTotal)} MB`,
    ].join('\n');
    await sock.sendMessage(chat, { text }, { quoted: msg });
}

// ─────────────────────────────────────────────
//  .rom  (disk storage)
// ─────────────────────────────────────────────
export async function romCommand(sock, chat, msg) {
    if (ownerGuard(sock, chat, msg)) return;
    let text;
    try {
        const st = fs.statfsSync(process.cwd());
        const total = st.blocks * st.bsize;
        const free = st.bavail * st.bsize;
        const used = total - free;
        const pct = total ? (used / total) * 100 : 0;
        text = [
            `📀 *ROM / Storage*`,
            ``,
            `\`${bar(pct)}\` ${pct.toFixed(1)}%`,
            `*used* · ${gb(used)} GB`,
            `*free* · ${gb(free)} GB`,
            `*total* · ${gb(total)} GB`,
        ].join('\n');
    } catch {
        const df = await runCmd('df', ['-kP', process.cwd()]);
        const row = df?.split('\n')[1]?.split(/\s+/);
        text = row
            ? `📀 *ROM / Storage*\n\n*used* · ${gb(row[2] * 1024)} GB\n*free* · ${gb(row[3] * 1024)} GB\n*total* · ${gb(row[1] * 1024)} GB (${row[4]})`
            : '📀 *ROM / Storage*\n\nCould not read disk info on this platform.';
    }
    await sock.sendMessage(chat, { text }, { quoted: msg });
}

// ─────────────────────────────────────────────
//  .alive
// ─────────────────────────────────────────────
export async function aliveCommand(sock, chat, msg) {
    return sendWithCta(sock, chat, '𝐀𝐥-𝐉𝐢𝐧 𝗜𝗦 𝗔𝗟𝗜𝗩𝗘 ✅', { quoted: msg });
}

// ─────────────────────────────────────────────
//  .uptime
// ─────────────────────────────────────────────
export async function uptimeCommand(sock, chat, msg) {
    return sock.sendMessage(chat, { text: `⏰ *Uptime:* ${uptime()}` }, { quoted: msg });
}

// ─────────────────────────────────────────────
//  .restart
// ─────────────────────────────────────────────
export async function restartCommand(sock, chat, msg) {
    const from = msg.key.participant || msg.key.remoteJid;
    if (!msg.key.fromMe && !isOwner(from)) {
        return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
    }
    await sock.sendMessage(chat, { text: '🔄 *Restarting Al-Jin server…*' }, { quoted: msg });
    setTimeout(() => {
        process.exit(0);
    }, 1000);
}
