// ─────────────────────────────────────────────
// Al-Jin · modules/forward.js
// .forward <custom text / JID> — Forwards text, quoted media, or quoted message to specified recipient JID/LID/phone
// ─────────────────────────────────────────────
import { resolveJid, getBestUserJid } from '../core/jid-resolver.js';
import { sendWithCta } from '../lib/buttons.js';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

function extractQuotedMessageNode(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx?.quotedMessage) return null;
  return ctx.quotedMessage;
}

export async function forwardCommand(sock, chat, msg, args) {
  const fullArgs = (args || []).join(' ').trim();

  if (!fullArgs) {
    return sendWithCta(sock, chat, `⏩ *Forward Command*\n\nUsage:\n• \`.forward <JID or Phone>\` (while quoting a message)\n• \`.forward <custom text> <JID or Phone>\`\n\nExamples:\n• \`.forward 923257853673\`\n• \`.forward Hello 923257853673@s.whatsapp.net\``, { quoted: msg });
  }

  // Parse arguments: target JID/Phone is usually the last token
  const tokens = fullArgs.split(/\s+/);
  let targetRaw = tokens[tokens.length - 1];
  let customText = tokens.length > 1 ? tokens.slice(0, -1).join(' ') : '';

  let targetJid = resolveJid(targetRaw, sock);

  if (targetJid && targetJid.endsWith('@lid')) {
    const best = await getBestUserJid(targetJid, sock);
    if (best) targetJid = best;
  }

  if (!targetJid || (!targetJid.endsWith('@s.whatsapp.net') && !targetJid.endsWith('@g.us') && !targetJid.endsWith('@lid'))) {
    // If last token was not a valid target, maybe whole input is target
    const resolvedWhole = resolveJid(fullArgs, sock);
    if (resolvedWhole) {
      targetJid = resolvedWhole;
      customText = '';
    } else {
      return sendWithCta(sock, chat, `❌ *Invalid Recipient JID / Phone:* \`${targetRaw}\``, { quoted: msg });
    }
  }

  const quotedMsg = extractQuotedMessageNode(msg);
  const statusMsg = await sock.sendMessage(chat, { text: `⏩ *Forwarding message to ${targetJid}…*` }, { quoted: msg });

  try {
    if (quotedMsg) {
      // Media is piped download → upload (no file, no buffer)
      if (quotedMsg.imageMessage) {
        const node = quotedMsg.imageMessage;
        const stream = await downloadContentFromMessage(node, 'image');
        await sock.sendMessage(targetJid, { image: { stream }, caption: customText || node.caption || '' });
      }
      else if (quotedMsg.videoMessage) {
        const node = quotedMsg.videoMessage;
        const stream = await downloadContentFromMessage(node, 'video');
        await sock.sendMessage(targetJid, { video: { stream }, caption: customText || node.caption || '' });
      }
      else if (quotedMsg.audioMessage) {
        const node = quotedMsg.audioMessage;
        const stream = await downloadContentFromMessage(node, 'audio');
        if (customText) await sock.sendMessage(targetJid, { text: customText });
        await sock.sendMessage(targetJid, { audio: { stream }, mimetype: node.mimetype || 'audio/mpeg', ptt: false });
      }
      // Quoted Text
      else {
        const textToForward = customText || quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';
        if (!textToForward) {
          throw new Error('Unable to extract text from quoted message.');
        }
        await sock.sendMessage(targetJid, { text: textToForward });
      }
    } else {
      // Direct text forward
      if (!customText) {
        throw new Error('No text or quoted message provided to forward.');
      }
      await sock.sendMessage(targetJid, { text: customText });
    }

    await sock.sendMessage(chat, {
      text: `✅ *Message successfully forwarded to ${targetJid}!*`,
      edit: statusMsg.key
    }).catch(() => {});

  } catch (err) {
    console.error('[forwardCommand]', err);
    await sock.sendMessage(chat, {
      text: `❌ *Forward failed:* ${err.message}`,
      edit: statusMsg.key
    }).catch(() => {});
  }
}
