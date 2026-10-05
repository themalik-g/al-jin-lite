// ─────────────────────────────────────────────
// Al-Jin · modules/forward.js
// .forward <custom text / JID / Phone / Mention> — Forwards text, quoted media, or quoted message to specified recipient
// ─────────────────────────────────────────────
import { resolveBoth, resolveTargetUniversal, getBestUserJid } from '../core/jid-resolver.js';
import { sendWithCta } from '../lib/buttons.js';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

function getQuotedInfo(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo ||
              msg.message?.imageMessage?.contextInfo ||
              msg.message?.videoMessage?.contextInfo ||
              msg.message?.documentMessage?.contextInfo ||
              msg.message?.audioMessage?.contextInfo ||
              msg.message?.stickerMessage?.contextInfo;
  if (!ctx?.quotedMessage) return null;
  return {
    quotedMessage: ctx.quotedMessage,
    participant: ctx.participant,
    stanzaId: ctx.stanzaId,
    contextInfo: ctx
  };
}

export async function forwardCommand(sock, chat, msg, args) {
  const fullArgs = (args || []).join(' ').trim();
  const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const quotedInfo = getQuotedInfo(msg);

  if (!fullArgs && !mentions.length) {
    return sendWithCta(
      sock,
      chat,
      `⏩ *Forward Command*\n\nUsage:\n• Reply to a message and type: \`.forward <JID / Phone / @mention>\`\n• \`.forward <custom text> <JID / Phone / @mention>\`\n\nExamples:\n• \`.forward 923257853673\`\n• \`.forward Hello 923257853673@s.whatsapp.net\``,
      { quoted: msg }
    );
  }

  // Determine target JID and optional custom text
  let targetJid = null;
  let customText = '';

  if (mentions.length > 0) {
    targetJid = mentions[mentions.length - 1];
    // Remove mention from fullArgs
    customText = fullArgs.replace(/@\d+/g, '').trim();
  } else {
    const tokens = fullArgs.split(/\s+/);
    const lastToken = tokens[tokens.length - 1];

    const resolvedLast = await resolveTargetUniversal(sock, lastToken);
    if (resolvedLast?.jid) {
      targetJid = resolvedLast.jid;
      customText = tokens.slice(0, -1).join(' ').trim();
    } else {
      const resolvedWhole = await resolveTargetUniversal(sock, fullArgs);
      if (resolvedWhole?.jid) {
        targetJid = resolvedWhole.jid;
        customText = '';
      }
    }
  }

  if (!targetJid) {
    // Attempt fallback with resolveBoth
    const res = await resolveBoth(sock, fullArgs, { msg, groupJid: chat });
    if (res.pn || res.lid) {
      targetJid = res.pn || res.lid;
    }
  }

  if (!targetJid) {
    return sendWithCta(sock, chat, `❌ *Invalid Recipient JID / Phone / Mention provided.*`, { quoted: msg });
  }

  if (targetJid.endsWith('@lid')) {
    const best = await getBestUserJid(targetJid, sock, chat);
    if (best) targetJid = best;
  }

  const statusMsg = await sock.sendMessage(chat, { text: `⏩ *Forwarding message to ${targetJid}…*` }, { quoted: msg });

  try {
    if (quotedInfo) {
      const qm = quotedInfo.quotedMessage;
      // Handle view once unwrap if present
      const realQm = qm.viewOnceMessage?.message || qm.viewOnceMessageV2?.message || qm;

      if (realQm.imageMessage) {
        const node = realQm.imageMessage;
        const stream = await downloadContentFromMessage(node, 'image');
        await sock.sendMessage(targetJid, { image: { stream }, caption: customText || node.caption || '' });
      } else if (realQm.videoMessage) {
        const node = realQm.videoMessage;
        const stream = await downloadContentFromMessage(node, 'video');
        await sock.sendMessage(targetJid, { video: { stream }, caption: customText || node.caption || '' });
      } else if (realQm.audioMessage) {
        const node = realQm.audioMessage;
        const stream = await downloadContentFromMessage(node, 'audio');
        if (customText) await sock.sendMessage(targetJid, { text: customText });
        await sock.sendMessage(targetJid, { audio: { stream }, mimetype: node.mimetype || 'audio/mpeg', ptt: Boolean(node.ptt) });
      } else if (realQm.stickerMessage) {
        const node = realQm.stickerMessage;
        const stream = await downloadContentFromMessage(node, 'sticker');
        if (customText) await sock.sendMessage(targetJid, { text: customText });
        await sock.sendMessage(targetJid, { sticker: { stream } });
      } else if (realQm.documentMessage) {
        const node = realQm.documentMessage;
        const stream = await downloadContentFromMessage(node, 'document');
        await sock.sendMessage(targetJid, {
          document: { stream },
          mimetype: node.mimetype || 'application/octet-stream',
          fileName: node.fileName || 'file',
          caption: customText || node.caption || ''
        });
      } else if (realQm.locationMessage) {
        const node = realQm.locationMessage;
        if (customText) await sock.sendMessage(targetJid, { text: customText });
        await sock.sendMessage(targetJid, { location: { degreesLatitude: node.degreesLatitude, degreesLongitude: node.degreesLongitude, name: node.name, address: node.address } });
      } else if (realQm.contactMessage) {
        const node = realQm.contactMessage;
        if (customText) await sock.sendMessage(targetJid, { text: customText });
        await sock.sendMessage(targetJid, { contacts: { displayName: node.displayName, contacts: [{ vcard: node.vcard }] } });
      } else {
        const textToForward = customText || realQm.conversation || realQm.extendedTextMessage?.text || realQm.imageMessage?.caption || realQm.videoMessage?.caption || '';
        if (!textToForward) {
          throw new Error('Unable to extract text or content from quoted message.');
        }
        await sock.sendMessage(targetJid, { text: textToForward });
      }
    } else {
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
