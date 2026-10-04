// ─────────────────────────────────────────────
//  Al-Jin · lib/poll.js
//  Poll reply mode: the bot sends a WhatsApp poll, reads the vote,
//  runs the chosen command and deletes the poll. A poll nobody
//  answers is deleted after 30 seconds.
//
//  Votes are read two ways, so a change in WhatsApp/Baileys can't break it:
//    1. Baileys' own `messages.update` → pollUpdates   (handlePollUpdates)
//    2. Our own decryption of the raw vote message,     (handlePollMessage)
//       trying every phone/LID id combination.
//  Whichever arrives first wins; the poll is consumed once.
//
//  RAM-only, no extra libraries. Every function is crash-safe.
// ─────────────────────────────────────────────
import crypto from 'node:crypto';
import * as Baileys from '@whiskeysockets/baileys';

export const POLL_TTL_MS = Number(process.env.AL_JIN_POLL_TTL_MS || 30_000);
const MAX_POLLS = 50;

// pollMessageId → { content, secret, key, chat, options, timer }
const polls = new Map();

// Set once from start.js: (sock, chat, voterKey, commandText) → runs the command.
let runner = null;
export function setPollRunner(fn) { runner = typeof fn === 'function' ? fn : null; }

const sha256 = (s) => crypto.createHash('sha256').update(Buffer.from(String(s))).digest('hex');
const stripDevice = (j) => String(j || '').replace(/:\d+(?=@)/, '');
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

function forget(id) {
  const rec = polls.get(id);
  if (!rec) return null;
  clearTimeout(rec.timer);
  polls.delete(id);
  return rec;
}

async function deletePoll(sock, rec) {
  try { await sock.sendMessage(rec.chat, { delete: rec.key }); } catch {}
}

/** The poll's encryption secret, wherever WhatsApp wrapped it. */
function secretOf(content) {
  let m = content;
  for (let i = 0; i < 4 && m; i++) {
    const s = m.messageContextInfo?.messageSecret;
    if (s) return Buffer.from(s);
    m = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.deviceSentMessage?.message || null;
  }
  return null;
}

/** getMessage() hook: Baileys needs the poll creation message to decrypt votes. */
export function getPollMessage(id) {
  return polls.get(id)?.content;
}

/** Plain text for a poll title (polls do not render WhatsApp markdown). */
export function plainTitle(text = '') {
  return String(text).replace(/[*_~`]/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Send a poll. `options` = [{ label, id }] (2-12 entries).
 * Returns the sent message, or null when a poll can't be used (caller falls back to text).
 */
export async function sendPoll(sock, jid, { title, options }, { quoted, onExpire } = {}) {
  try {
    if (!Array.isArray(options) || options.length < 2 || options.length > 12) return null;

    const seen = new Set();
    const clean = options.map((o, i) => {
      let label = String(o.label || `Option ${i + 1}`).slice(0, 90);
      while (seen.has(label)) label += ' ';
      seen.add(label);
      return { label, id: o.id };
    });

    const name = plainTitle(title || 'Select an option').slice(0, 250) || 'Select an option';
    const sent = await sock.sendMessage(jid, {
      poll: { name, values: clean.map((o) => o.label), selectableCount: 1 },
    }, { quoted });

    if (!sent?.key?.id || !sent.message) return null;

    while (polls.size >= MAX_POLLS) forget(polls.keys().next().value);

    const rec = {
      content: sent.message,
      secret: secretOf(sent.message),
      key: sent.key,
      chat: jid,
      options: clean.map((o) => ({ hash: sha256(o.label), id: o.id, label: o.label })),
      timer: null,
    };
    rec.timer = setTimeout(async () => {
      const r = forget(sent.key.id);
      if (!r) return;
      try { onExpire?.(); } catch {}
      await deletePoll(sock, r);
    }, POLL_TTL_MS);
    rec.timer.unref?.();
    polls.set(sent.key.id, rec);
    if (!rec.secret) console.log('[poll] ⚠️ sent poll has no messageSecret — votes may not decrypt');
    return sent;
  } catch (e) {
    console.error('[poll] send failed:', e.message);
    return null;
  }
}

// Consume a poll and run the chosen option. Safe to call twice (second call is a no-op).
async function choose(sock, pollId, hashHex, voterKey) {
  const rec = polls.get(pollId);
  if (!rec) return false;
  const option = rec.options.find((o) => o.hash === hashHex);
  if (!option) { console.log('[poll] vote did not match any option'); return false; }

  forget(pollId);
  console.log(`[poll] vote → "${option.label}" → ${option.id}`);
  await deletePoll(sock, rec);

  if (!runner) return true;
  try { await runner(sock, rec.chat, voterKey || {}, option.id); }
  catch (e) { console.error('[poll] command failed:', e.message); }
  return true;
}

/** Path 1 — Baileys already decrypted the vote (messages.update). */
export async function handlePollUpdates(sock, updates) {
  const list = Array.isArray(updates) ? updates : [updates];
  for (const u of list) {
    try {
      const pollId = u?.key?.id;
      const votes = u?.update?.pollUpdates;
      if (!pollId || !polls.has(pollId) || !votes?.length) continue;

      const vote = [...votes].reverse().find((v) => v?.vote?.selectedOptions?.length);
      if (!vote) continue;
      await choose(sock, pollId, Buffer.from(vote.vote.selectedOptions[0]).toString('hex'), vote.pollUpdateMessageKey);
    } catch (e) {
      console.error('[poll] vote handling failed:', e.message);
    }
  }
}

/** Path 2 — raw vote message (messages.upsert); we decrypt it ourselves. */
export async function handlePollMessage(sock, msg) {
  try {
    const pu = msg?.message?.pollUpdateMessage;
    if (!pu) return;
    const pollId = pu.pollCreationMessageKey?.id;
    const rec = pollId ? polls.get(pollId) : null;
    if (!rec) return;

    console.log('[poll] vote message received for', pollId);
    if (typeof Baileys.decryptPollVote !== 'function' || !rec.secret || !pu.vote) {
      console.log('[poll] cannot decrypt ourselves (decryptPollVote/secret missing) — waiting for Baileys');
      return;
    }

    const me = uniq([sock.user?.id, sock.user?.lid].map(stripDevice));
    const k = msg.key || {};
    const creators = uniq([...me, stripDevice(rec.key?.participant)]);
    const voters = k.fromMe
      ? me
      : uniq([k.participant, k.participantAlt, k.remoteJid, k.remoteJidAlt].map(stripDevice));
    // A fromMe vote could still be addressed either way — try the other form too.
    if (k.fromMe) voters.push(...uniq([k.remoteJid, k.remoteJidAlt, k.participant].map(stripDevice)));

    let selected = null;
    outer:
    for (const pollCreatorJid of creators) {
      for (const voterJid of voters) {
        try {
          const dec = Baileys.decryptPollVote(pu.vote, {
            pollEncKey: rec.secret, pollCreatorJid, pollMsgId: pollId, voterJid,
          });
          selected = dec?.selectedOptions || [];
          break outer;
        } catch { /* wrong id combination — try next */ }
      }
    }

    if (selected === null) {
      console.log('[poll] ❌ could not decrypt vote (creators:', creators.join(','), '| voters:', voters.join(','), ')');
      setTimeout(() => {
        const r = polls.get(pollId);
        if (r && !r.warned) {
          r.warned = true;
          sock.sendMessage(r.chat, { text: "⚠️ I couldn't read that poll vote. Use `.replymode text` and reply with a number instead." }).catch(() => {});
        }
      }, 2500).unref?.();
      return;
    }
    if (!selected.length) return;   // vote withdrawn
    await choose(sock, pollId, Buffer.from(selected[0]).toString('hex'), msg.key);
  } catch (e) {
    console.error('[poll] raw vote handling failed:', e.message);
  }
}
