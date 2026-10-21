// ─────────────────────────────────────────────
//  Al-Jin · lib/native-buttons.js
//  Own native-flow buttons — replaces @qadeerxtech/qadeer-btns.
//
//  Works on plain upstream Baileys (no fork, no node_modules edit): the message is built here and
//  relayed with the same "biz / native_flow" nodes WhatsApp expects for interactive buttons.
//
//  Two ways to use it:
//    1) sendNativeButtons(sock, jid, { body, footer, header, buttons, image|video|document, contextInfo }, { quoted })
//    2) installNativeButtons(sock)  →  sock.sendMessage(jid, { text, footer, interactiveButtons: [...] })
//       exactly like the @vinzsocket/baileys and @fazzcodestudio/baileys forks. Old-style `buttons`
//       (buttonId / buttonText) and `sections` + `buttonText` (list) payloads are converted automatically.
//
//  Button objects are { name, buttonParamsJson } — quick_reply, cta_url, cta_copy, cta_call,
//  single_select, open_webview, … (the create* helpers in lib/buttons.js build them).
// ─────────────────────────────────────────────
import { generateWAMessageFromContent, prepareWAMessageMedia } from '@whiskeysockets/baileys';

// Quick-reply taps are sent back to the bot as plain text (the button label). Toggle buttons must come
// back as "Online off" / "Typing on" — lower-case on/off — so every quick_reply label is normalised here.
export const lowerOnOff = (s) => String(s ?? '').replace(/\b(on|off)\b/gi, (m) => m.toLowerCase());

/** Returns the button with a lower-case on/off label (quick_reply only; ids and other button types untouched). */
export function fixToggleLabel(b) {
  if (!b || b.name !== 'quick_reply' || !b.buttonParamsJson) return b;
  try {
    const p = JSON.parse(b.buttonParamsJson);
    if (typeof p.display_text !== 'string') return b;
    const t = lowerOnOff(p.display_text);
    if (t === p.display_text) return b;
    return { ...b, buttonParamsJson: JSON.stringify({ ...p, display_text: t }) };
  } catch { return b; }
}

const clean = (b) => (b || []).filter((x) => x && typeof x === 'object' && x.name && x.buttonParamsJson).map(fixToggleLabel);

/** Quote / reply context for the interactive message (kept outside the view-once wrapper). */
function quoteContext(jid, quoted, userJid) {
  if (!quoted) return {};
  try {
    const tmp = generateWAMessageFromContent(jid, { extendedTextMessage: { text: '.' } }, { quoted, userJid });
    return tmp?.message?.extendedTextMessage?.contextInfo || {};
  } catch { return {}; }
}

async function buildHeader(sock, o) {
  const media = o.image ? { image: o.image }
    : o.video ? { video: o.video }
    : o.document ? { document: o.document, mimetype: o.document.mimetype || 'application/octet-stream', fileName: o.document.fileName || 'file' }
    : null;

  if (media) {
    const prepared = await prepareWAMessageMedia(media, { upload: sock.waUploadToServer });
    return { hasMediaAttachment: true, ...prepared };
  }
  const title = o.header || o.title;
  if (title || o.subtitle) return { title: title || '', subtitle: o.subtitle || '', hasMediaAttachment: false };
  return undefined;
}

export async function sendNativeButtons(sock, jid, o = {}, opts = {}) {
  const buttons = clean(o.buttons);
  if (!buttons.length) throw new Error('native buttons: no valid buttons');
  if (String(jid).endsWith('@newsletter')) throw new Error('native buttons: channels do not support buttons');
  if (typeof sock?.relayMessage !== 'function') throw new Error('native buttons: relayMessage missing');

  const userJid = sock.user?.id;
  const header = await buildHeader(sock, o);
  let body = String(o.body ?? o.text ?? '');
  // With a media header WhatsApp ignores a title → keep the heading inside the body instead.
  if (header?.hasMediaAttachment && (o.header || o.title)) body = `*${o.header || o.title}*\n\n${body}`;

  const interactiveMessage = {
    body: { text: body },
    ...(o.footer ? { footer: { text: String(o.footer) } } : {}),
    ...(header ? { header } : {}),
    contextInfo: { ...(o.contextInfo || {}), ...quoteContext(jid, opts.quoted, userJid) },
    nativeFlowMessage: { buttons, messageParamsJson: '' },
  };

  const wa = generateWAMessageFromContent(jid, {
    viewOnceMessage: { message: {
      messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
      interactiveMessage,
    } },
  }, { userJid });

  const additionalNodes = [
    { tag: 'biz', attrs: {}, content: [
      { tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: o.flowName || 'mixed' } }] },
    ] },
  ];
  if (!String(jid).endsWith('@g.us')) additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });

  // start.js wraps relayMessage, so the message is also kept for WhatsApp's retry requests.
  await sock.relayMessage(jid, wa.message, { messageId: wa.key.id, additionalNodes });
  return wa;
}

// ── fork-style sendMessage support ───────────────────────────────────────────
function toSpec(c) {
  const base = {
    body: c.text ?? c.caption ?? '',
    footer: c.footer,
    header: c.title ?? c.header,
    subtitle: c.subtitle,
    contextInfo: c.contextInfo,
    image: c.image, video: c.video,
    document: c.document ? { ...c.document, mimetype: c.mimetype || c.document.mimetype, fileName: c.fileName || c.document.fileName } : undefined,
  };

  // 1) fork API: interactiveButtons
  if (Array.isArray(c.interactiveButtons) && c.interactiveButtons.length) {
    return { ...base, buttons: c.interactiveButtons };
  }
  // 2) legacy quick buttons: [{ buttonId, buttonText: { displayText } }]
  if (Array.isArray(c.buttons) && c.buttons.length && c.buttons.every((b) => b && 'buttonId' in b)) {
    return {
      ...base,
      buttons: c.buttons.map((b) => ({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: b.buttonText?.displayText || String(b.buttonText || b.buttonId), id: b.buttonId }),
      })),
    };
  }
  // 3) legacy list: { text, buttonText, sections: [{ title, rows: [{ title, description, rowId }] }] }
  if (Array.isArray(c.sections) && c.sections.length && c.buttonText) {
    return {
      ...base,
      buttons: [{
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
          title: String(c.buttonText),
          sections: c.sections.map((s) => ({
            title: s.title || '',
            rows: (s.rows || []).map((r) => ({ title: r.title, description: r.description || '', id: r.rowId || r.id || r.title })),
          })),
        }),
      }],
    };
  }
  return null;
}

function plainText(spec) {
  const labels = [];
  for (const b of clean(spec.buttons)) {
    try {
      const p = JSON.parse(b.buttonParamsJson);
      if (b.name === 'single_select') for (const s of p.sections || []) for (const r of s.rows || []) labels.push(r.title);
      else if (p.display_text) labels.push(p.url ? `${p.display_text}: ${p.url}` : p.display_text);
    } catch {}
  }
  return [spec.body, labels.length ? labels.map((l, i) => `${i + 1}. ${l}`).join('\n') : '', spec.footer ? `_${spec.footer}_` : '']
    .filter(Boolean).join('\n\n');
}

export function installNativeButtons(sock) {
  if (!sock || sock.__alJinNativeButtons || typeof sock.sendMessage !== 'function') return;
  sock.__alJinNativeButtons = true;
  const original = sock.sendMessage.bind(sock);

  sock.sendNativeButtons = (jid, spec, opts) => sendNativeButtons(sock, jid, spec, opts);

  sock.sendMessage = async (jid, content, options) => {
    const spec = content && typeof content === 'object' ? toSpec(content) : null;
    if (!spec) return original(jid, content, options);
    try {
      return await sendNativeButtons(sock, jid, spec, options || {});
    } catch (e) {
      try { console.warn('[native-buttons] failed, sending plain text:', e?.message || e); } catch {}
      return original(jid, { text: plainText(spec) }, options);   // never lose the message
    }
  };
}
