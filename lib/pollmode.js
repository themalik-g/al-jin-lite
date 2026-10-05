// ─────────────────────────────────────────────
// Al-Jin · lib/pollmode.js
// "poll" reply mode: choices are shown as ONE native WhatsApp poll
// (multiple selection allowed). The poll is NOT deleted / re-sent on every
// vote — each newly ticked option runs its command (so settings toggle on
// every new vote) until the poll's time window ends, then the poll is deleted.
// ─────────────────────────────────────────────
import crypto from 'node:crypto';
import { proto } from '@whiskeysockets/baileys';
import { isOwner } from '../core/identity.js';
import { getBestUserJidSync } from '../core/jid-resolver.js';
import { getPrefix } from '../core/settings.js';

export const POLL_TTL_MS = 2 * 60 * 1000;   // how long a poll stays alive
const MAX_OPTIONS = 12;                      // WhatsApp poll limit
const polls = new Map();                     // pollMsgId → record

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const bare = (jid = '') => String(jid).replace(/:\d+@/, '@');
const digitsOf = (jid = '') => String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');

export function pollFromChoices(flatChoices = []) {
  const seen = new Set();
  const options = [];
  for (const c of flatChoices.slice(0, MAX_OPTIONS)) {
    let label = String(c.label || c.id || '').trim().slice(0, 90) || `Option ${options.length + 1}`;
    while (seen.has(label)) label += '\u200b';   // keep names unique (poll rule)
    seen.add(label);
    options.push({ label, id: c.id });
  }
  return options;
}

export async function sendChoicePoll(sock, jid, { title, options, quoted, sender }) {
  const messageSecret = crypto.randomBytes(32);
  const sent = await sock.sendMessage(
    jid,
    {
      poll: {
        name: String(title || 'Choose an option').slice(0, 120),
        values: options.map((o) => o.label),
        selectableCount: 0,            // 0 = any number of options may be ticked
        messageSecret,
      },
    },
    { quoted }
  );
  if (!sent?.key?.id) return sent;

  const rec = {
    chat: jid,
    key: sent.key,
    secret: messageSecret,
    sender,
    options: options.map((o) => ({ ...o, hash: sha256(o.label) })),
    votes: new Map(),                  // voterDigits → Set(option index)
    timer: null,
  };
  rec.timer = setTimeout(() => closePoll(sock, sent.key.id), POLL_TTL_MS);
  rec.timer.unref?.();
  polls.set(sent.key.id, rec);
  if (polls.size > 200) closePoll(sock, polls.keys().next().value);
  return sent;
}

async function closePoll(sock, id) {
  const rec = polls.get(id);
  if (!rec) return;
  polls.delete(id);
  clearTimeout(rec.timer);
  try { await sock.sendMessage(rec.chat, { delete: rec.key }); } catch { /* already gone */ }
}

// ── vote decryption ────────────────────────────
function decryptVote(upd, secret, pollId, creator, voter) {
  const sign = Buffer.concat([
    Buffer.from(pollId), Buffer.from(creator), Buffer.from(voter),
    Buffer.from('Poll Vote'), Buffer.from([1]),
  ]);
  const key0 = crypto.createHmac('sha256', Buffer.alloc(32)).update(secret).digest();
  const decKey = crypto.createHmac('sha256', key0).update(sign).digest();
  const payload = Buffer.from(upd.vote.encPayload);
  const iv = Buffer.from(upd.vote.encIv);
  const tag = payload.subarray(payload.length - 16);
  const data = payload.subarray(0, payload.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', decKey, iv);
  d.setAAD(Buffer.from(`${pollId}\u0000${voter}`));
  d.setAuthTag(tag);
  const plain = Buffer.concat([d.update(data), d.final()]);
  return proto.Message.PollVoteMessage.decode(plain);
}

function tryDecrypt(sock, msg, upd, rec, pollId) {
  const me = [sock.user?.id, sock.user?.lid].filter(Boolean).map(bare);
  const creators = [...new Set([...me, bare(rec.key.participant || ''), bare(upd.pollCreationMessageKey?.participant || '')].filter(Boolean))];
  const voters = [...new Set([
    msg.key.fromMe ? null : bare(msg.key.participant || ''),
    msg.key.fromMe ? null : bare(msg.key.participantAlt || ''),
    msg.key.fromMe ? null : bare(msg.key.remoteJid || ''),
    msg.key.fromMe ? null : bare(msg.key.remoteJidAlt || ''),
    ...(msg.key.fromMe ? me : []),
  ].filter(Boolean))];

  for (const creator of creators) {
    for (const voter of voters) {
      try { return { vote: decryptVote(upd, rec.secret, pollId, creator, voter), voter }; } catch { /* try next */ }
    }
  }
  return null;
}

function allowed(rec, msg, voter) {
  if (msg.key.fromMe) return true;
  if (isOwner(voter)) return true;
  if (!rec.chat.endsWith('@g.us')) return true;           // private chat: only the two of you
  const a = digitsOf(getBestUserJidSync(voter) || voter);
  const b = digitsOf(getBestUserJidSync(rec.sender) || rec.sender);
  return !!a && a === b;
}

/**
 * Called by the router for every incoming pollUpdateMessage.
 * Returns true when the message was a poll vote (always consumed).
 */
export async function handlePollVote(sock, msg, dispatchFn) {
  const upd = msg.message?.pollUpdateMessage;
  if (!upd) return false;

  const pollId = upd.pollCreationMessageKey?.id;
  const rec = pollId && polls.get(pollId);
  if (!rec) return true;

  const res = tryDecrypt(sock, msg, upd, rec, pollId);
  if (!res) return true;
  const { vote, voter } = res;
  if (!allowed(rec, msg, voter)) return true;

  const picked = new Set();
  for (const h of vote.selectedOptions || []) {
    const hex = Buffer.from(h).toString('hex');
    const i = rec.options.findIndex((o) => o.hash === hex);
    if (i !== -1) picked.add(i);
  }

  const vkey = digitsOf(voter) || 'x';
  const prev = rec.votes.get(vkey) || new Set();
  rec.votes.set(vkey, picked);

  // every newly ticked option = one toggle
  const prefix = getPrefix();
  for (const i of picked) {
    if (prev.has(i)) continue;
    const id = String(rec.options[i].id || '');
    if (!id) continue;
    const text = id.startsWith(prefix) ? id : `${prefix}${id}`;
    const fake = {
      key: {
        remoteJid: rec.chat,
        fromMe: !!msg.key.fromMe,
        participant: msg.key.participant,
        id: `POLL${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
      },
      message: { conversation: text },
      messageTimestamp: Math.floor(Date.now() / 1000),
      pushName: msg.pushName,
      _synthetic: true,
    };
    try { await dispatchFn(sock, { type: 'notify', messages: [fake] }); }
    catch (e) { console.error('[pollmode] command failed:', e?.message); }
  }
  return true;
}
