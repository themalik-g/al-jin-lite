const crypto = require('crypto');

function generateMsgId(sock) {
    if (typeof sock?.generateMessageID === 'function') {
        try {
            return sock.generateMessageID();
        } catch (e) {}
    }
    return '3EB0' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

async function getTargetDevices(sock, target) {
    if (!target) return [];
    if (String(target).endsWith('@g.us')) return [target];

    const cleanUser = String(target || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (!cleanUser) return [];

    const baseJid = `${cleanUser}@s.whatsapp.net`;
    const deviceSet = new Set([baseJid]);

    try {
        if (typeof sock?.getUSyncDevices === 'function') {
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
        // Fallback to base JID and common device indexes
    }

    if (deviceSet.size <= 1) {
        deviceSet.add(`${cleanUser}:0@s.whatsapp.net`);
        deviceSet.add(`${cleanUser}:1@s.whatsapp.net`);
    }

    return Array.from(deviceSet);
}

async function relayCrashToDevices(sock, target, message, options = {}) {
    return sendCrashWithFallbacks(sock, target, message, options);
}

async function sendCrashWithFallbacks(sock, target, message, options = {}) {
    const errors = [];
    let deliveredCount = 0;
    let tier1Count = 0;
    let tier2Count = 0;

    const isGroup = String(target).endsWith('@g.us');

    if (isGroup) {
        // Direct group relay
        try {
            const msgId = generateMsgId(sock);
            await sock.relayMessage(target, message, {
                messageId: msgId,
                ...options
            });
            deliveredCount++;
            tier1Count++;
        } catch (e) {
            errors.push(`Group Relay [${target}]: ${e.message}`);
        }
    } else {
        // Direct individual JID and device JID relays
        const devices = await getTargetDevices(sock, target);

        for (const devJid of devices) {
            try {
                const msgId = generateMsgId(sock);
                // Do NOT supply participant attribute for individual user JIDs
                const relayOpts = {
                    messageId: msgId,
                    ...options
                };
                delete relayOpts.participant;

                await sock.relayMessage(devJid, message, relayOpts);
                deliveredCount++;
                tier1Count++;
            } catch (e1) {
                errors.push(`Direct Relay [${devJid}]: ${e1.message}`);
            }
        }

        // Secondary direct fallback to baseJid via relayMessage if initial attempts yielded no success
        if (deliveredCount === 0) {
            const cleanUser = String(target || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            const baseJid = `${cleanUser}@s.whatsapp.net`;
            try {
                const msgId = generateMsgId(sock);
                const fallbackOpts = { messageId: msgId, ...options };
                delete fallbackOpts.participant;
                await sock.relayMessage(baseJid, message, fallbackOpts);
                deliveredCount++;
                tier2Count++;
            } catch (e2) {
                errors.push(`Fallback Relay [${baseJid}]: ${e2.message}`);
            }
        }
    }

    return {
        success: deliveredCount > 0,
        deliveredCount,
        tier1Count,
        tier2Count,
        errors
    };
}

module.exports = {
    getTargetDevices,
    relayCrashToDevices,
    sendCrashWithFallbacks
};
