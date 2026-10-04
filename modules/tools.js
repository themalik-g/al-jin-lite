// Al-Jin Lite · modules/tools.js — only .vcard remains (OCR / barcode / TTS removed: heavy).
export async function vcardCommand(sock, chat, msg, args) {
  try {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    let targetJid = ctx?.mentionedJid?.[0] || ctx?.participant;

    if (!targetJid && args && args[0]) {
      const raw = args[0].replace(/[^\d@a-zA-Z.-]/g, '');
      if (raw.includes('@')) {
        targetJid = raw;
      } else if (/^\d+$/.test(raw)) {
        targetJid = `${raw}@s.whatsapp.net`;
      }
    }

    if (!targetJid) {
      targetJid = msg.key.participant || msg.key.remoteJid;
    }

    const digits = targetJid.replace(/\D/g, '');
    const name = digits ? `User +${digits}` : 'WhatsApp Contact';

    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${name}`,
      `TEL;type=CELL;type=VOICE;waid=${digits}:+${digits}`,
      'END:VCARD',
    ].join('\n');

    await sock.sendMessage(chat, {
      contacts: {
        displayName: name,
        contacts: [{ vcard }],
      },
    }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chat, { text: `⚠️ vcard failed: ${e.message}` }, { quoted: msg }).catch(() => {});
  }
}
