// lib/buttons.js — Al-Jin Lite: PLAIN-TEXT replies only (no native buttons, no extra packages).
// Same exports as the full edition so every module keeps working; numbered choices
// ("reply 1") still work through registerChoices/matchChoice.
import { getReplyMode } from '../core/settings.js';
import { sendPoll, plainTitle, inPollRun } from './poll.js';

export const NEWSLETTER_JID = '120363409689492071@newsletter';
export const NEWSLETTER_NAME = '𝐀𝐥-𝐉𝐢𝐧';
// -1 = "no specific post": tapping the "Al-Jin" forwarded label just opens the channel.
// (A fake positive id makes WhatsApp say "Update deleted".) If -1 ever misbehaves on your
// WhatsApp version, set AL_JIN_CHANNEL_MSG_ID to the id of a REAL post in the channel.
export const NEWSLETTER_SERVER_ID = Number.isFinite(Number(process.env.AL_JIN_CHANNEL_MSG_ID)) && process.env.AL_JIN_CHANNEL_MSG_ID !== undefined && process.env.AL_JIN_CHANNEL_MSG_ID !== ''
  ? Number(process.env.AL_JIN_CHANNEL_MSG_ID) : -1;

// "Forwarded from channel" look. Always returns a FRESH object (Baileys mutates
// contextInfo while building a message, so a shared constant would leak between sends).
// Pass an existing contextInfo (mentions, etc.) and it is kept — only the
// forward fields are added.
export function newsletterContext(base = {}) {
  const b = (base && typeof base === 'object') ? base : {};
  return {
    ...b,
    isForwarded: true,
    forwardingScore: b.forwardingScore || 1,
    forwardedNewsletterMessageInfo: b.forwardedNewsletterMessageInfo || {
      newsletterJid: NEWSLETTER_JID,
      newsletterName: NEWSLETTER_NAME,
      serverMessageId: NEWSLETTER_SERVER_ID,
      contentType: 1,
    },
  };
}

// Kept so older imports never break. Prefer newsletterContext() (fresh object per message).
export const NEWSLETTER_CONTEXT = Object.freeze(newsletterContext());

const pendingChoices = new Map();
const PENDING_TTL_MS = 2 * 60 * 1000;

function keywordsFrom(id = '', display = '') {
  const words = new Set();
  for (const src of [id, display]) {
    for (const w of String(src).toLowerCase().split(/[^a-z0-9]+/)) {
      if (w && w.length >= 2 && w.length <= 12) words.add(w);
    }
  }
  for (const stop of ['ghost','peek','lurk','auto','cmd','command','btn','button']) words.delete(stop);
  return [...words];
}

// One source of truth for text mode: the numbered choices that are shown to the
// user AND the ones registered for "reply with a number" use the same list.
// Link / copy / call buttons are never numbered, so replies like "1" or "chat"
// are no longer swallowed by buttons that were never displayed as options.
function collectChoices(buttons = []) {
  const choices = [];
  const extras = [];
  let num = 1;
  for (const b of buttons || []) {
    let p = {};
    try { p = JSON.parse(b?.buttonParamsJson || '{}'); } catch { continue; }
    switch (b?.name) {
      case 'quick_reply':
        if (p.display_text) choices.push({ num: String(num++), label: p.display_text, id: p.id || p.display_text });
        break;
      case 'single_select':
        for (const sec of p.sections || []) {
          const rows = [];
          for (const row of sec.rows || []) {
            if (!row?.title) continue;
            rows.push({ num: String(num++), label: row.title, desc: row.description || '', id: row.id || row.title });
          }
          if (rows.length) choices.push({ heading: p.title || '', section: sec.title || '', rows });
        }
        break;
      case 'cta_url': if (p.url) extras.push({ icon: '🔗', label: p.display_text, value: p.url }); break;
      case 'cta_copy': if (p.copy_code) extras.push({ icon: '📋', label: p.display_text, value: p.copy_code, copy: true }); break;
      case 'cta_call': if (p.phone_number) extras.push({ icon: '📞', label: p.display_text, value: p.phone_number }); break;
      case 'open_webview': if (p.link) extras.push({ icon: '🌐', label: p.title, value: p.link }); break;
      case 'send_location': extras.push({ note: '📍 Share your location: tap 📎 Attach → Location.' }); break;
      default: break;
    }
  }
  return { choices, extras };
}

function flatChoices(choices) {
  const flat = [];
  for (const c of choices) {
    if (c.rows) flat.push(...c.rows); else flat.push(c);
  }
  return flat;
}

export function registerChoices(chatJid, senderJid, buttons = []) {
  const flat = flatChoices(collectChoices(buttons).choices).map((c) => ({
    num: c.num,
    id: c.id,
    keywords: keywordsFrom(c.id, c.label),
  }));
  if (!flat.length) { pendingChoices.delete(chatJid); return; }
  pendingChoices.set(chatJid, { sender: senderJid, exp: Date.now() + PENDING_TTL_MS, choices: flat });
}

export function clearChoices(chatJid) {
  pendingChoices.delete(chatJid);
}

export function matchChoice(chatJid, senderJid, text = '') {
  const rec = pendingChoices.get(chatJid);
  if (!rec) return null;
  if (Date.now() > rec.exp) { pendingChoices.delete(chatJid); return null; }
  const t = String(text).trim().toLowerCase();
  if (!t || t.length > 24) return null;
  let hit = null;
  if (/^\d{1,2}$/.test(t)) hit = rec.choices.find(c => c.num === t);
  if (!hit) hit = rec.choices.find(c => c.keywords.length && c.keywords.some(k => t === k));
  if (!hit) return null;
  pendingChoices.delete(chatJid);
  return hit.id;
}

export function createQuickReply(displayText, id) {
  return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: displayText, id }) };
}
export function createCtaUrl(displayText, url, merchantUrl) {
  return { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: displayText, url, merchant_url: merchantUrl || url }) };
}
export function createCtaCopy(displayText, copyCode) {
  return { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: displayText, copy_code: copyCode }) };
}
export function createCtaCall(displayText, phoneNumber) {
  return { name: 'cta_call', buttonParamsJson: JSON.stringify({ display_text: displayText, phone_number: phoneNumber }) };
}
export function createCtaCatalog(businessPhoneNumber) {
  return { name: 'cta_catalog', buttonParamsJson: JSON.stringify({ business_phone_number: businessPhoneNumber }) };
}
export function createSingleSelect(title, sections) {
  return { name: 'single_select', buttonParamsJson: JSON.stringify({ title, sections }) };
}
export function createOpenWebview(title, link) {
  return { name: 'open_webview', buttonParamsJson: JSON.stringify({ title, link }) };
}
export function createLocationRequest(displayText = 'Share Location') {
  return { name: 'send_location', buttonParamsJson: JSON.stringify({ display_text: displayText }) };
}
export function createAddressRequest(displayText = 'Share Address') {
  return { name: 'address_message', buttonParamsJson: JSON.stringify({ display_text: displayText }) };
}
export function createReminder(displayText = 'Remind Me') {
  return { name: 'cta_reminder', buttonParamsJson: JSON.stringify({ display_text: displayText }) };
}

export const DEFAULT_CTA_BUTTONS = [
  createCtaUrl('CHAT WITH OWNER', 'https://wa.me/923257853673?text=al-jin'),
  createCtaUrl('FOLLOW CHANNEL', 'https://whatsapp.com/channel/0029VbDSqdOFy72BrpK1I40c'),
];

export async function sendWithCta(sock, jid, text, opts = {}) {
  return sendInteractive(sock, jid, {
    body: text,
    footer: opts.footer || '',
    header: opts.header || '',
    buttons: opts.buttons || DEFAULT_CTA_BUTTONS,
    image: opts.image,
    video: opts.video,
    document: opts.document,
  }, opts);
}


export function extractInteractiveResponse(msg) {
  if (!msg?.message) return null;
  const m = msg.message;
  if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
  if (m.interactiveResponseMessage) {
    const flowReply = m.interactiveResponseMessage.nativeFlowResponseMessage;
    if (flowReply) {
      try { const p = JSON.parse(flowReply.paramsJson || '{}'); if (p.id) return p.id; } catch {}
    }
    const btnReply = m.interactiveResponseMessage.buttonsResponseMessage;
    if (btnReply?.selectedButtonId) return btnReply.selectedButtonId;
  }
  const inner = m.viewOnceMessage?.message?.interactiveResponseMessage
    || m.ephemeralMessage?.message?.interactiveResponseMessage
    || m.documentWithCaptionMessage?.message?.interactiveResponseMessage;
  if (inner?.nativeFlowResponseMessage) {
    try { const p = JSON.parse(inner.nativeFlowResponseMessage.paramsJson || '{}'); if (p.id) return p.id; } catch {}
  }
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) return m.listResponseMessage.singleSelectReply.selectedRowId;
  return null;
}

function normalizeButtons(buttons = []) {
  return (buttons || []).map(b => {
    if (typeof b === 'object' && b?.buttonParamsJson) return b;
    if (b?.quickReply) return createQuickReply(b.quickReply.displayText, b.quickReply.id);
    return b;
  }).filter(Boolean);
}

export async function sendInteractive(sock, jid, options = {}, opts = {}) {
  const { body = '', footer = '', header = '', buttons = [], image, video, document, actions = false } = options;
  const normalizedButtons = normalizeButtons(buttons);
  const senderOf = opts.quoted?.key?.participant || opts.quoted?.key?.remoteJid || opts.sender || jid;
  if (!inPollRun()) registerChoices(jid, senderOf, normalizedButtons);   // a vote must not replace the open poll's numbers
  return sendFallbackText(sock, jid, { body, footer, header, buttons: normalizedButtons, image, video, document, actions }, opts);
}

// Plain-text rendering (reply mode "text"):
//   *Header*            (if any)
//   body
//   numbered options    (quick replies / list rows) + one-line reply hint
//   explicit links      (🔗 / 📋 / 📞) — only buttons a command added on purpose;
//                       the generic "chat with owner / follow channel" buttons are
//                       NOT appended to every reply, and a link already present in
//                       the body is not repeated.
//   _footer_
const lowerFirst = (t = '') => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

export function renderTextMode({ body = '', footer = '', header = '', buttons = [], actions = false } = {}) {
  const { choices, extras } = collectChoices(normalizeButtons(buttons));
  const defaultUrls = new Set(DEFAULT_CTA_BUTTONS.map((b) => { try { return JSON.parse(b.buttonParamsJson).url; } catch { return ''; } }));
  const parts = [];
  if (header) parts.push(`*${header}*`);
  if (body) parts.push(body);

  if (choices.length) {
    const lines = [];
    for (const c of choices) {
      if (c.rows) {
        if (c.heading) lines.push(`📋 *${c.heading}*`);
        if (c.section) lines.push(`── ${c.section} ──`);
        for (const r of c.rows) lines.push(actions ? `Reply *${r.num}* to ${lowerFirst(r.label)}` : `${r.num}. ${r.label}${r.desc ? ` — ${r.desc}` : ''}`);
      } else {
        lines.push(actions ? `Reply *${c.num}* to ${lowerFirst(c.label)}` : `${c.num}. ${c.label}`);
      }
    }
    if (!actions) lines.push('', '_Reply with the number or option name._');
    parts.push(lines.join('\n'));
  }

  const links = [];
  for (const e of extras) {
    if (e.note) { links.push(e.note); continue; }
    if (defaultUrls.has(e.value)) continue;
    if (body.includes(e.value)) continue;
    if (e.copy && String(e.value).length > 300) continue;
    links.push(`${e.icon} ${e.label ? `${e.label}: ` : ''}${e.value}`);
  }
  if (links.length) parts.push(links.join('\n'));
  if (footer) parts.push(`_${footer}_`);
  return parts.join('\n\n');
}

// Poll reply mode: body (+ current settings) is the poll question, every choice is an
// option. Returns null when a poll isn't possible (needs 2–12 choices) → text fallback.
async function sendPollMode(sock, jid, options, opts) {
  const { body = '', header = '', image, video, document } = options;
  const { choices, extras } = collectChoices(options.buttons);
  const flat = flatChoices(choices);
  if (flat.length < 2 || flat.length > 12) return null;

  const quoted = opts?.quoted;
  const question = plainTitle([header, body].filter(Boolean).join('\n\n'));
  const media = image ? { image } : video ? { video } : document
    ? { document, mimetype: document.mimetype || 'application/octet-stream', fileName: document.fileName || 'file' }
    : null;

  let title = question;
  if (media || question.length > 240) {
    // Too long for a poll title (or has media): send it normally, poll just asks.
    const text = renderTextMode({ ...options, buttons: [] });
    if (media) await sock.sendMessage(jid, { ...media, caption: text.length <= 1000 ? text : undefined }, { quoted });
    if (!media || text.length > 1000) await sock.sendMessage(jid, { text, contextInfo: newsletterContext() }, { quoted });
    title = 'Select an option 👇';
  }

  const sent = await sendPoll(sock, jid, {
    title,
    options: flat.map((c) => ({ label: c.label, id: c.id })),
  }, { quoted, onExpire: () => clearChoices(jid) });
  if (!sent) return null;

  const defaultUrls = new Set(DEFAULT_CTA_BUTTONS.map((b) => { try { return JSON.parse(b.buttonParamsJson).url; } catch { return ''; } }));
  const links = extras
    .filter((e) => !e.note && !defaultUrls.has(e.value) && !body.includes(e.value) && !(e.copy && String(e.value).length > 300))
    .map((e) => `${e.icon} ${e.label ? `${e.label}: ` : ''}${e.value}`);
  if (links.length) { try { await sock.sendMessage(jid, { text: links.join('\n') }); } catch {} }
  return sent;
}

async function sendFallbackText(sock, jid, options, opts) {
  // A command started by a poll vote answers in plain text: the open poll stays,
  // no new poll is created, and the choices are not repeated.
  if (inPollRun()) {
    options = {
      ...options,
      buttons: (options.buttons || []).filter((b) => b?.name !== 'quick_reply' && b?.name !== 'single_select'),
    };
  } else if (getReplyMode() === 'poll') {
    try {
      const sent = await sendPollMode(sock, jid, options, opts);
      if (sent) return sent;
    } catch (e) { console.error('[buttons] poll mode failed, using text:', e.message); }
  }
  const { image, video, document } = options;
  const text = renderTextMode(options);
  const quoted = opts?.quoted;

  // Media that a command attached to a "button message" must not be lost in text mode.
  const media = image ? { image } : video ? { video } : document
    ? { document, mimetype: document.mimetype || 'application/octet-stream', fileName: document.fileName || 'file' }
    : null;
  if (media) {
    if (text.length <= 1000) {
      return sock.sendMessage(jid, { ...media, caption: text }, { quoted });
    }
    await sock.sendMessage(jid, media, { quoted });
  }
  return sock.sendMessage(jid, { text, contextInfo: newsletterContext() }, { quoted });
}
