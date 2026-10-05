// ─────────────────────────────────────────────
//  Al-Jin · modules/ping.js
//  .ping   → WhatsApp round-trip in ms (ms only)
//  .cpu    → processor + live load
//  .gpu    → graphics card(s)
//  .ram    → memory (container-aware)
//  .rom    → storage (disk + bot files)
//  .alive  .uptime  .restart
//  All probes live in lib/sysinfo.js.
// ─────────────────────────────────────────────
import os from 'node:os';
import { isOwner } from '../core/identity.js';
import { sendWithCta } from '../lib/buttons.js';
import {
  bar, fmtBytes, uptimeText, qualityPct,
  containerMemory, sampleCpu, cpuModel, gpuList, romInfo,
} from '../lib/sysinfo.js';

function allowed(msg) {
  const from = msg.key.participant || msg.key.remoteJid;
  return !!msg.key.fromMe || isOwner(from);
}

async function ownerGate(sock, chat, msg) {
  if (allowed(msg)) return true;
  await sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  return false;
}

// ─────────────────────────────────────────────
//  .ping — ms only
// ─────────────────────────────────────────────
export async function pingCommand(sock, chat, msg) {
  if (!(await ownerGate(sock, chat, msg))) return;

  const t0 = Date.now();
  const sent = await sock.sendMessage(chat, { text: '🏓' }, { quoted: msg });
  const ms = Date.now() - t0;
  const text = `*${ms} ms*`;

  // Show the result in place; if editing is not possible, send it as a new message.
  try {
    if (!sent?.key) throw new Error('no key');
    await sock.sendMessage(chat, { text, edit: sent.key });
  } catch {
    await sock.sendMessage(chat, { text }, { quoted: msg }).catch(() => {});
  }
}

// ─────────────────────────────────────────────
//  .cpu
// ─────────────────────────────────────────────
export async function cpuCommand(sock, chat, msg) {
  if (!(await ownerGate(sock, chat, msg))) return;
  try {
    const info = cpuModel();
    const load = await sampleCpu(400);
    const avg = os.loadavg().map((x) => x.toFixed(2)).join(' · ');
    const lines = [
      '🧠 *CPU*',
      '',
      `*Model* · ${info.model}`,
      `*Threads (host)* · ${info.threads}`,
      `*Available* · ${Number.isInteger(load.cores) ? load.cores : load.cores.toFixed(2)} core${load.cores === 1 ? '' : 's'} _(${load.source})_`,
      `*Load* · ${load.pct.toFixed(1)}%`,
      `\`${bar(load.pct)}\` ${qualityPct(load.pct)}`,
    ];
    if (process.platform !== 'win32') lines.push(`*Load avg (1·5·15m)* · ${avg}`);
    await sendWithCta(sock, chat, lines.join('\n'), { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ cpu failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ─────────────────────────────────────────────
//  .gpu
// ─────────────────────────────────────────────
export async function gpuCommand(sock, chat, msg) {
  if (!(await ownerGate(sock, chat, msg))) return;
  try {
    const list = await gpuList();
    let body;
    if (!list.length) {
      body = '🎮 *GPU*\n\nNo GPU detected on this server.';
    } else {
      body = ['🎮 *GPU*', ''];
      list.forEach((g, i) => {
        body.push(`*${list.length > 1 ? `#${i + 1} ` : ''}${g.name}*`);
        if (g.extra) body.push(g.extra);
      });
      body = body.join('\n');
    }
    await sendWithCta(sock, chat, body, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ gpu failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ─────────────────────────────────────────────
//  .ram
// ─────────────────────────────────────────────
export async function ramCommand(sock, chat, msg) {
  if (!(await ownerGate(sock, chat, msg))) return;
  try {
    const mem = containerMemory();
    const pct = mem.limit > 0 ? (mem.used / mem.limit) * 100 : 0;
    const p = process.memoryUsage();
    const lines = [
      '💾 *RAM*',
      '',
      `\`${bar(pct)}\` ${pct.toFixed(1)}% ${qualityPct(pct)}`,
      `*Used* · ${fmtBytes(mem.used)} / ${fmtBytes(mem.limit)}`,
      `*Free* · ${fmtBytes(Math.max(0, mem.limit - mem.used))}`,
      `*Source* · ${mem.source}`,
      '',
      `*Bot process*`,
      `• rss · ${fmtBytes(p.rss)}`,
      `• heap · ${fmtBytes(p.heapUsed)} / ${fmtBytes(p.heapTotal)}`,
    ];
    await sendWithCta(sock, chat, lines.join('\n'), { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ ram failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}

// ─────────────────────────────────────────────
//  .rom
// ─────────────────────────────────────────────
export async function romCommand(sock, chat, msg) {
  if (!(await ownerGate(sock, chat, msg))) return;
  try {
    const r = romInfo();
    const lines = ['🗄️ *ROM (storage)*', ''];
    if (r.disk) {
      const pct = r.disk.total > 0 ? (r.disk.used / r.disk.total) * 100 : 0;
      lines.push(
        `\`${bar(pct)}\` ${pct.toFixed(1)}% ${qualityPct(pct)}`,
        `*Used* · ${fmtBytes(r.disk.used)} / ${fmtBytes(r.disk.total)}`,
        `*Free* · ${fmtBytes(r.disk.free)}`,
      );
    } else {
      lines.push('Disk information is not available on this host.');
    }
    lines.push('', `*Bot files* · ${fmtBytes(r.project)} _(without node_modules)_`);
    await sendWithCta(sock, chat, lines.join('\n'), { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ rom failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
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
  return sock.sendMessage(chat, { text: `⏰ *Uptime:* ${uptimeText()}` }, { quoted: msg });
}

// ─────────────────────────────────────────────
//  .restart
// ─────────────────────────────────────────────
export async function restartCommand(sock, chat, msg) {
  if (!(await ownerGate(sock, chat, msg))) return;
  await sock.sendMessage(chat, { text: '🔄 *Restarting Al-Jin server…*' }, { quoted: msg });
  setTimeout(() => { process.exit(0); }, 1000);
}
