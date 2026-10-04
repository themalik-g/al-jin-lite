import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isOwner, ownerJid, digitsOf } from '../core/identity.js';
import { relayStatusMessage } from './ghost.js';
import { getBestUserJid } from '../core/jid-resolver.js';
import { sendInteractive, createQuickReply } from '../lib/buttons.js';
import { getPrefix } from '../core/settings.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.join(here, '..', 'state', 'lurk.json');

const DEBUG = process.env.WRAITH_DEBUG === '1';

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────
fs.mkdirSync(path.dirname(STATE), { recursive: true });
if (!fs.existsSync(STATE)) {
    fs.writeFileSync(STATE, JSON.stringify({
        on: true,
        react: true,
        emoji: '❤️',
        download: true
    }));
}

function read() {
    try {
        const raw = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
        return {
            on: raw.on !== false,
            react: raw.react !== false,
            emoji: raw.emoji || '❤️',
            download: raw.download !== false
        };
    } catch {
        return { on: true, react: true, emoji: '❤️', download: true };
    }
}

function write(o) {
    try { fs.writeFileSync(STATE, JSON.stringify(o, null, 2)); } catch {}
}

export function isLurking() { return read().on === true; }
function isReacting()     { return read().react === true; }
function isDownloading()  { return read().download === true; }
function emoji()          { return read().emoji || '❤️'; }

const RANDOM_POOL = ['❤️','🔥','👍','😮','😂','😍','🥰','😎','🙌','✨','💯','🎉','🍀','⚡','🌙'];

function pickEmoji() {
    const e = emoji();
    if (e === 'random') return RANDOM_POOL[Math.floor(Math.random() * RANDOM_POOL.length)];
    return e;
}

// ─────────────────────────────────────────────
//  .lurk — command
// ─────────────────────────────────────────────
export async function lurkCommand(sock, chat, msg, args) {
    const from = msg.key.participant || msg.key.remoteJid;

    if (!msg.key.fromMe && !isOwner(from)) {
        return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
    }

    const s = read();
    let a0 = (args?.[0] || '').toLowerCase();
    let a1 = (args?.[1] || '').toLowerCase();

    const p = getPrefix();
    const st = (on) => (on ? '✅ ON' : '❌ OFF');
    const act = (on) => (on ? 'OFF' : 'ON');
    // One status card for every path: current settings + "Reply N to …" actions.
    const card = (head) => sendInteractive(sock, chat, {
        body:
            `${head}\n\n` +
            `Currently the settings are:\n` +
            `• Auto-view — ${st(s.on)}\n` +
            `• Auto-react — ${st(s.react)}\n` +
            `• Status download — ${st(s.download)}\n` +
            `• Reaction emoji — ${s.emoji}\n`,
        footer: 'Provided by 𝐀𝐥-𝐉𝐢𝐧',
        actions: true,
        buttons: [
            createQuickReply(`Turn Auto-view ${act(s.on)}`, `${p}lurk ${s.on ? 'off' : 'on'}`),
            createQuickReply(`Turn Auto-react ${act(s.react)}`, `${p}lurk react ${s.react ? 'off' : 'on'}`),
            createQuickReply(`Turn Status-download ${act(s.download)}`, `${p}lurk download ${s.download ? 'off' : 'on'}`),
        ]
    }, { quoted: msg });
    if (!a0) {
        return card(`🌒 *lurk* — status watcher`);
    }

    if (a0 === 'toggle1') {
        a0 = s.on ? 'off' : 'on';
    } else if (a0 === 'toggle2') {
        a0 = 'react';
        a1 = s.react ? 'off' : 'on';
    } else if (a0 === 'toggle3') {
        a0 = 'download';
        a1 = s.download ? 'off' : 'on';
    }

    if (a0 === 'on' || a0 === 'off') {
        const targetState = a0 === 'on';
        if (s.on === targetState) {
            return card(`ℹ️ Lurk auto-view is already *${s.on ? 'ENGAGED (ON)' : 'DISENGAGED (OFF)'}*.`);
        }
        s.on = targetState;
        write(s);
        return card(`🌒 Lurk auto-view is now *${s.on ? 'ENGAGED (ON)' : 'DISENGAGED (OFF)'}*.`);
    }

    if (a0 === 'react') {
        if (a1 !== 'on' && a1 !== 'off') {
            return sock.sendMessage(chat, { text: '🌒 use _.lurk react on|off_' }, { quoted: msg });
        }
        const targetState = a1 === 'on';
        if (s.react === targetState) {
            return card(`ℹ️ Lurk auto-react is already *${s.react ? 'ENABLED (ON)' : 'DISABLED (OFF)'}*.`);
        }
        s.react = targetState;
        write(s);
        return card(`🌒 Lurk auto-react is now *${s.react ? 'ENABLED (ON)' : 'DISABLED (OFF)'}*.`);
    }

    if (a0 === 'download') {
        if (a1 !== 'on' && a1 !== 'off') {
            return sock.sendMessage(chat, { text: '🌒 use _.lurk download on|off_' }, { quoted: msg });
        }
        const targetState = a1 === 'on';
        if (s.download === targetState) {
            return card(`ℹ️ Status download is already *${s.download ? 'ENABLED (ON)' : 'DISABLED (OFF)'}*.`);
        }
        s.download = targetState;
        write(s);
        return card(`🌒 Status download is now *${s.download ? 'ENABLED (ON)' : 'DISABLED (OFF)'}*.`);
    }

    if (a0 === 'emoji') {
        if (!a1) {
            return sock.sendMessage(chat, { text: '🌒 use _.lurk emoji ❤️_' }, { quoted: msg });
        }

        if (a1 === 'random') {
            s.emoji = 'random';
            write(s);
            return sock.sendMessage(chat, { text: '🌒 each status will get a random emoji.' }, { quoted: msg });
        }

        if (a1 === 'none' || a1 === 'off') {
            s.emoji = '';
            write(s);
            return sock.sendMessage(chat, { text: '🌒 reactions will be empty (silent).' }, { quoted: msg });
        }

        const chosen = args[1];
        s.emoji = chosen;
        write(s);
        return sock.sendMessage(chat, { text: `🌒 reaction emoji set to ${chosen}` }, { quoted: msg });
    }

    return sock.sendMessage(chat, { text: '🌒 unknown option.' }, { quoted: msg });
}

// ─────────────────────────────────────────────
//  Reaction attach
// ─────────────────────────────────────────────
async function attach(sock, key) {
    if (!isReacting()) return;

    const chosen = pickEmoji();

    try {
        await sock.relayMessage('status@broadcast', {
            reactionMessage: {
                key: {
                    remoteJid: 'status@broadcast',
                    id: key.id,
                    participant: key.participant || key.remoteJid,
                    fromMe: false
                },
                text: chosen
            }
        }, {
            messageId: key.id,
            statusJidList: [key.participant || key.remoteJid]
        });
    } catch {}
}

// ─────────────────────────────────────────────
//  Download status media without seen/reaction
// ─────────────────────────────────────────────
async function downloadStatus(sock, key, statusMsg) {
    if (!isDownloading()) return;
    try {
        if (!statusMsg?.message) return;
        // Forwarded by reference to the ghost destination chat — nothing is downloaded or stored.
        await relayStatusMessage(sock, { key, message: statusMsg.message }, { force: true });
    } catch (e) {
        if (DEBUG) console.log('[lurk:download] error:', e.message);
    }
}

// ─────────────────────────────────────────────
//  View with retry
// ─────────────────────────────────────────────
async function viewWithRetry(sock, key) {
    try {
        await sock.readMessages([key]);
    } catch (e) {
        if (String(e.message).includes('rate-overlimit')) {
            await new Promise(r => setTimeout(r, 2500));
            try { await sock.readMessages([key]); } catch {}
        }
    }
}

// ─────────────────────────────────────────────
//  Payload normalizer — accepts every shape
//  the socket can throw at us:
//    · messages.upsert        → { messages: [WAMessage] }
//    · status.update          → WAMessageKey[]          (array!)
//    · messages.delete        → { keys: [WAMessageKey] }
//    · single key / reaction  → { key } / { reaction: { key } }
// ─────────────────────────────────────────────
function collectCandidates(payload) {
    const out = [];
    const seen = new Set();

    function push(key, msg) {
        if (!key?.id) return;
        if (key.remoteJid !== 'status@broadcast') return;
        if (seen.has(key.id)) return;
        seen.add(key.id);
        out.push({ key, msg: msg || null });
    }

    // status.update → bare array of keys
    if (Array.isArray(payload)) {
        for (const k of payload) push(k, null);
    }

    // messages.upsert → full messages (needed for download)
    if (Array.isArray(payload?.messages)) {
        for (const m of payload.messages) push(m?.key, m);
    }

    // messages.delete → { keys: [...] }
    if (Array.isArray(payload?.keys)) {
        for (const k of payload.keys) push(k, null);
    }

    // single message / single key
    if (payload?.key?.remoteJid === 'status@broadcast') {
        push(payload.key, payload.message ? payload : null);
    }

    // reaction events
    if (payload?.reaction?.key?.remoteJid === 'status@broadcast') {
        push(payload.reaction.key, null);
    }

    return out;
}

// ─────────────────────────────────────────────
//  Handler — called by router on status events
// ─────────────────────────────────────────────
export async function lurkTick(sock, payload) {
    const s = read();

    // Silent download mode: download only, no seen/reaction
    const silentDownload = s.download && !s.on && !s.react;

    if (!s.on && !s.download) return;

    const candidates = collectCandidates(payload);
    if (!candidates.length) return;

    await new Promise(r => setTimeout(r, 800));

    for (const { key, msg } of candidates) {
        // Silent download (no seen, no reaction)
        if (silentDownload) {
            await downloadStatus(sock, key, msg);
            continue;
        }

        // Normal lurk: view + optionally react + optionally download
        if (s.on) {
            await viewWithRetry(sock, key);
        }

        if (s.download) {
            await downloadStatus(sock, key, msg);
        }

        if (s.react) {
            await attach(sock, key);
        }
    }
}
