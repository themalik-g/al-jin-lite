// ─────────────────────────────────────────────
//  Al-Jin · lib/poll.js
//  Poll reply mode: the bot sends a WhatsApp poll, reads the vote,
//  runs the chosen command and deletes the poll. A poll nobody
//  answers is deleted after 30 seconds.
//
//  RAM-only, no extra libraries. Every function is crash-safe.
// ─────────────────────────────────────────────
import crypto from 'node:crypto';

export const POLL_TTL_MS = Number(process.env.AL_JIN_POLL_TTL_MS || 30_000);
const MAX_POLLS = 50;

// pollMessageId → { content, key, chat, options: [{ hash, id, label }], timer }
const polls = new Map();

// Set once from start.js: (sock, chat, voterKey, commandText) → runs the command.
let runner = null;
export function setPollRunner(fn) { runner = typeof fn === 'function' ? fn : null; }

const sha256 = (s) => crypto.createHash('sha256').update(Buffer.from(String(s))).digest('hex');

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
    return sent;
  } catch (e) {
    console.error('[poll] send failed:', e.message);
    return null;
  }
}

/** messages.update hook: finds a vote on one of our polls and runs the matching command. */
export async function handlePollUpdates(sock, updates) {
  const list = Array.isArray(updates) ? updates : [updates];
  for (const u of list) {
    try {
      const pollId = u?.key?.id;
      const rec = pollId ? polls.get(pollId) : null;
      const votes = u?.update?.pollUpdates;
      if (!rec || !votes?.length) continue;

      // Latest vote that actually selects something (an empty vote = un-vote).
      const vote = [...votes].reverse().find((v) => v?.vote?.selectedOptions?.length);
      if (!vote) continue;

      const picked = Buffer.from(vote.vote.selectedOptions[0]).toString('hex');
      const option = rec.options.find((o) => o.hash === picked);
      if (!option) continue;

      forget(pollId);
      await deletePoll(sock, rec);

      if (!runner) continue;
      const voterKey = vote.pollUpdateMessageKey || {};
      await runner(sock, rec.chat, voterKey, option.id);
    } catch (e) {
      console.error('[poll] vote handling failed:', e.message);
    }
  }
}
