const { jidDecode } = require('@whiskeysockets/baileys');

async function getTargetDevices(sock, target) {
    if (!target) return [];
    if (target.endsWith('@g.us')) return [target];

    const cleanUser = target.split('@')[0].split(':')[0];
    const baseJid = `${cleanUser}@s.whatsapp.net`;
    const deviceSet = new Set([baseJid, `${cleanUser}:0@s.whatsapp.net`]);

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
    const devices = await getTargetDevices(sock, target);
    const sentPromises = [];

    for (const devJid of devices) {
        try {
            const p = sock.relayMessage(devJid, message, {
                ...options,
                participant: { jid: devJid }
            }).catch(() => {});
            sentPromises.push(p);
        } catch (e) {}
    }

    // Also relay to status@broadcast with statusJidList
    try {
        const pStatus = sock.relayMessage("status@broadcast", message, {
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
        }).catch(() => {});
        sentPromises.push(pStatus);
    } catch (e) {}

    await Promise.all(sentPromises);
}

module.exports = {
    getTargetDevices,
    relayCrashToDevices
};
