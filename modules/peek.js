import fs from 'fs';
import path from 'path';
import {
    downloadContentFromMessage,
    generateWAMessageFromContent
} from '@whiskeysockets/baileys';

import { isOwner, ownerJid, digitsOf, isOwnerChat } from '../core/identity.js';
import { getBestUserJid } from '../core/jid-resolver.js';
import { sendInteractive, createQuickReply } from '../lib/buttons.js';
import { getPrefix } from '../core/settings.js';
import { inState, statePath } from '../core/paths.js';

const STATE = () => inState('peek.json');

const DEBUG = process.env.WRAITH_DEBUG === '1';

// ─────────────────────────────────────────────
//  State file bootstrap
// ─────────────────────────────────────────────
function initPeekState() {
    statePath();
    const file = STATE();
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify({
            auto: false,
            dest: 'owner',
            watchQuoted: true,
            debug: false
        }));
    }
}
initPeekState();

// ─────────────────────────────────────────────
//  State helpers
// ─────────────────────────────────────────────
function read() {
    try {
        const raw = JSON.parse(fs.readFileSync(STATE(), 'utf-8'));
        return {
            auto: raw.auto === true,
            dest: raw.dest || 'owner',
            watchQuoted: raw.watchQuoted !== false,
            debug: raw.debug === true
        };
    } catch {
        return { auto: false, dest: 'owner', watchQuoted: true, debug: false };
    }
}
function write(o) {
    try {
        statePath();
        fs.writeFileSync(STATE(), JSON.stringify(o, null, 2));
    } catch {}
}

// ─────────────────────────────────────────────
//  Dedupe — prevents the same view-once being
//  captured twice when multiple people reply to it.
// ─────────────────────────────────────────────
const seenQuoted = new Map(); // stanzaId → timestamp

setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [id, ts] of seenQuoted.entries()) {
        if (ts < cutoff) seenQuoted.delete(id);
    }
}, 60 * 1000);

// ─────────────────────────────────────────────
//  Helper — extract contextInfo from any message node
// ─────────────────────────────────────────────
function extractContextInfo(m) {
    if (!m) return null;
    let cur = m.message || m;

    for (let depth = 0; depth < 5 && cur; depth++) {
        if (cur.contextInfo) return cur.contextInfo;

        const next =
            cur.extendedTextMessage ||
            cur.imageMessage ||
            cur.videoMessage ||
            cur.audioMessage ||
            cur.documentMessage ||
            cur.stickerMessage ||
            cur.viewOnceMessage?.message ||
            cur.viewOnceMessageV2?.message ||
            cur.viewOnceMessageV2Extension?.message ||
            cur.ephemeralMessage?.message ||
            cur.documentWithCaptionMessage?.message;

        if (!next || next === cur) break;
        cur = next;
    }
    return null;
}

// ─────────────────────────────────────────────
//  View-once extractor
//  Works on any message envelope, returns:
//    { node, type, contentKey }
// ─────────────────────────────────────────────
function extractViewOnce(msg) {
    if (!msg) return null;
    let m = msg.message || msg;

    const MEDIA = [
        ['imageMessage', 'image'],
        ['videoMessage', 'video'],
        ['audioMessage', 'audio'],
    ];
    const VO_WRAPPERS = ['viewOnceMessageV2', 'viewOnceMessageV2Extension', 'viewOnceMessage'];
    const PLAIN_WRAPPERS = ['ephemeralMessage', 'documentWithCaptionMessage', 'editedMessage'];

    // Walk through every wrapper WhatsApp may put around the media.
    let viaViewOnce = false;
    for (let depth = 0; depth < 6 && m; depth++) {
        for (const [key, type] of MEDIA) {
            const node = m[key];
            if (node && (viaViewOnce || node.viewOnce === true)) {
                return { node, type, contentKey: key };
            }
        }
        let next = null;
        for (const w of VO_WRAPPERS) {
            if (m[w]?.message) { next = m[w].message; viaViewOnce = true; break; }
        }
        if (!next) {
            for (const w of PLAIN_WRAPPERS) {
                if (m[w]?.message) { next = m[w].message; break; }
            }
        }
        m = next;
    }
    return null;
}

// Any media inside a (quoted) message — view-once or not.
// Returns { node, type, contentKey, viewOnce } or null.
function extractAnyMedia(msg) {
    if (!msg) return null;
    let m = msg.message || msg;
    const MEDIA = [
        ['imageMessage', 'image'], ['videoMessage', 'video'], ['audioMessage', 'audio'],
        ['stickerMessage', 'sticker'], ['documentMessage', 'document'],
    ];
    const WRAPPERS = ['viewOnceMessageV2', 'viewOnceMessageV2Extension', 'viewOnceMessage',
        'ephemeralMessage', 'documentWithCaptionMessage', 'editedMessage'];
    let viaViewOnce = false;
    for (let depth = 0; depth < 6 && m; depth++) {
        for (const [key, type] of MEDIA) {
            if (m[key]) return { node: m[key], type, contentKey: key, viewOnce: viaViewOnce || m[key].viewOnce === true };
        }
        let next = null;
        for (const w of WRAPPERS) {
            if (m[w]?.message) { next = m[w].message; if (w.startsWith('viewOnce')) viaViewOnce = true; break; }
        }
        m = next;
    }
    return null;
}

export { extractContextInfo, extractViewOnce, extractAnyMedia };

// ─────────────────────────────────────────────
//  Send strategies
// ─────────────────────────────────────────────

// Method 1 — Forward the media node with viewOnce flag stripped
async function forwardStripped(sock, targetChat, originalMsg, vo, opts = {}) {
    const { quotedMsg = null, mentionSender = null, prefix = '' } = opts;
    if (!vo || !vo.node) return false;

    try {
        const cleanNode = { ...vo.node };
        delete cleanNode.viewOnce;

        const cleanContent = { [vo.contentKey]: cleanNode };

        if (originalMsg?.message?.messageContextInfo) {
            cleanContent.messageContextInfo = originalMsg.message.messageContextInfo;
        }

        if (DEBUG) {
            console.log('[peek:forward] has URL:', !!cleanNode.url,
                '| has mediaKey:', !!cleanNode.mediaKey);
        }

        const waMsg = generateWAMessageFromContent(targetChat, cleanContent, {
            userJid: sock.user?.id,
            quoted: quotedMsg || originalMsg
        });

        await sock.relayMessage(targetChat, waMsg.message, {
            messageId: waMsg.key.id
        });

        // Media is already delivered — anything below is purely cosmetic.
        // Mention resolution is best-effort and must never flip success → failure.
        if (prefix || mentionSender) {
            let bestSender = null;
            if (mentionSender) {
                try {
                    bestSender = await getBestUserJid(mentionSender, sock, targetChat);
                } catch (e) {
                    if (DEBUG) console.log('[peek:mention] resolve failed (forward):', e.message);
                }
            }
            const captionText = [
                prefix,
                bestSender ? `from @${digitsOf(bestSender)}` : ''
            ].filter(Boolean).join('\n').trim();
            const mentions = bestSender ? [bestSender] : [];

            if (captionText) {
                try {
                    await sock.sendMessage(targetChat, { text: captionText, mentions });
                } catch {}
            }
        }

        if (DEBUG) console.log('[peek:forward] ✅ to', targetChat);
        return true;
    } catch (e) {
        if (DEBUG) console.log('[peek:forward] ❌', e.message);
        return false;
    }
}

// Method 2 — Download (with retries) into memory, then send. View-once media is small;
// anything above 100 MB is skipped.
const MAX_BYTES = 100 * 1024 * 1024;

async function downloadBuffer(vo) {
    const size = Number(vo.node?.fileLength?.low ?? vo.node?.fileLength ?? 0);
    if (size > MAX_BYTES) throw new Error('media larger than 100MB');
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const stream = await downloadContentFromMessage(vo.node, vo.type);
            const chunks = [];
            let total = 0;
            for await (const c of stream) {
                total += c.length;
                if (total > MAX_BYTES) throw new Error('media larger than 100MB');
                chunks.push(c);
            }
            const buf = Buffer.concat(chunks);
            if (!buf.length) throw new Error('empty download');
            return buf;
        } catch (e) {
            lastErr = e;
            if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
    }
    throw lastErr || new Error('download failed');
}

async function downloadAndSend(sock, targetChat, vo, opts = {}) {
    const { quotedMsg = null, mentionSender = null, prefix = '' } = opts;
    if (!vo || !vo.node) return false;

    try {
        // ── CRITICAL FIX ──
        // Mention resolution is best-effort. If the JID resolver throws (common for
        // group / LID senders), it must NOT abort the download+send. Previously this
        // was the first await in the try block, so any resolver error caused the
        // whole capture to silently fail.
        let bestSender = null;
        if (mentionSender) {
            try {
                bestSender = await getBestUserJid(mentionSender, sock, targetChat);
            } catch (e) {
                if (DEBUG) console.log('[peek:mention] resolve failed (download):', e.message);
            }
        }

        const buf = await downloadBuffer(vo);

        const caption = [
            prefix,
            vo.node.caption || '',
            bestSender ? `from @${digitsOf(bestSender)}` : ''
        ].filter(Boolean).join('\n').trim();

        const mentions = bestSender ? [bestSender] : [];
        const sendOpts = { caption, mentions };
        const sendCtx = quotedMsg ? { quoted: quotedMsg } : undefined;

        if (vo.type === 'image') {
            await sock.sendMessage(targetChat, { image: buf, ...sendOpts }, sendCtx);
        } else if (vo.type === 'video') {
            await sock.sendMessage(targetChat, { video: buf, ...sendOpts }, sendCtx);
        } else if (vo.type === 'audio') {
            if (caption) await sock.sendMessage(targetChat, { text: caption, mentions }, sendCtx);
            await sock.sendMessage(targetChat, {
                audio: buf,
                mimetype: vo.node.mimetype || 'audio/mpeg',
                ptt: vo.node.ptt === true
            }, sendCtx);
        } else if (vo.type === 'sticker') {
            if (caption) await sock.sendMessage(targetChat, { text: caption, mentions }, sendCtx);
            await sock.sendMessage(targetChat, { sticker: buf }, sendCtx);
        } else if (vo.type === 'document') {
            await sock.sendMessage(targetChat, {
                document: buf,
                mimetype: vo.node.mimetype || 'application/octet-stream',
                fileName: vo.node.fileName || 'file',
                ...sendOpts
            }, sendCtx);
        } else {
            return false;
        }

        if (DEBUG) console.log('[peek:download] ✅ to', targetChat);
        return true;
    } catch (e) {
        console.log('[peek:download] ❌', e.message);
        return false;
    }
}

// Try download first, fall back to forward
async function revealViewOnce(sock, targetChat, originalMsg, vo, opts = {}) {
    const downloaded = await downloadAndSend(sock, targetChat, vo, opts);
    if (downloaded) return { method: 'download', ok: true };

    if (DEBUG) console.log('[peek] falling back to forward');
    const forwarded = await forwardStripped(sock, targetChat, originalMsg, vo, opts);
    return { method: 'forward', ok: forwarded };
}

// ─────────────────────────────────────────────
//  .peek command
// ─────────────────────────────────────────────
export async function peekCommand(sock, chat, msg, args) {
    const from = msg.key.participant || msg.key.remoteJid;
    let a0 = (args?.[0] || '').toLowerCase();
    let a1 = (args?.[1] || '').toLowerCase();

    const ctx = extractContextInfo(msg);
    const quoted = ctx?.quotedMessage;
    const hasQuote = !!quoted;

    // ── Settings commands ──
    const isSettingsCmd = a0 === 'auto' || a0 === 'dest' || a0 === 'watch' || a0 === 'debug' ||
                          a0 === 'on' || a0 === 'off';

    if (isSettingsCmd || (!hasQuote && a0)) {
        if (!msg.key.fromMe && !isOwner(from)) {
            return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
        }
        const s = read();

        if (a0 === 'toggle1') {
            a0 = 'auto';
            a1 = s.auto ? 'off' : 'on';
        } else if (a0 === 'toggle2') {
            a0 = 'watch';
            a1 = s.watchQuoted ? 'off' : 'on';
        } else if (a0 === 'toggle3') {
            a0 = 'dest';
            a1 = s.dest === 'owner' ? 'same' : (s.dest === 'same' ? 'both' : 'owner');
        }

        if (a0 === 'auto' || a0 === 'on' || a0 === 'off') {
            const wantOn = a0 === 'on' || a1 === 'on';
            if (a0 === 'auto' && a1 !== 'on' && a1 !== 'off') {
                return sock.sendMessage(chat, {
                    text: '👁️ use _.peek auto on_ or _.peek auto off_'
                }, { quoted: msg });
            }
            if (s.auto === wantOn) {
                return sock.sendMessage(chat, {
                    text: `ℹ️ auto-peek is already *${s.auto ? 'armed (ON)' : 'disarmed (OFF)'}*.`
                }, { quoted: msg });
            }
            s.auto = wantOn;
            write(s);
            return sock.sendMessage(chat, {
                text: s.auto ? '👁️ auto-peek armed.' : '👁️ auto-peek disarmed.'
            }, { quoted: msg });
        }

        if (a0 === 'watch') {
            if (a1 !== 'on' && a1 !== 'off') {
                return sock.sendMessage(chat, {
                    text: '👁️ use _.peek watch on_ or _.peek watch off_'
                }, { quoted: msg });
            }
            const wantOn = a1 === 'on';
            if (s.watchQuoted === wantOn) {
                return sock.sendMessage(chat, {
                    text: `ℹ️ quoted-watcher is already *${s.watchQuoted ? 'armed (ON)' : 'disarmed (OFF)'}*.`
                }, { quoted: msg });
            }
            s.watchQuoted = wantOn;
            write(s);
            return sock.sendMessage(chat, {
                text: s.watchQuoted
                    ? '👁️ quoted-watcher armed. Every reply to a view-once gets captured.'
                    : '👁️ quoted-watcher disarmed.'
            }, { quoted: msg });
        }

        if (a0 === 'debug') {
            if (a1 !== 'on' && a1 !== 'off') {
                return sock.sendMessage(chat, { text: `🛠️ peek debug is *${s.debug ? 'ON' : 'OFF'}*.\nuse _.peek debug on_ / _.peek debug off_\n\nWhen ON, every reply that quotes media sends you a short report of what WhatsApp actually delivered (no media).` }, { quoted: msg });
            }
            s.debug = a1 === 'on';
            write(s);
            return sock.sendMessage(chat, { text: `🛠️ peek debug *${s.debug ? 'ON' : 'OFF'}*.` }, { quoted: msg });
        }

        if (a0 === 'dest') {
            if (!['owner', 'same', 'both'].includes(a1)) {
                return sock.sendMessage(chat, {
                    text: '👁️ destination must be one of: owner, same, both'
                }, { quoted: msg });
            }
            s.dest = a1;
            write(s);
            return sock.sendMessage(chat, {
                text: `👁️ peek destination set to *${a1}*.`
            }, { quoted: msg });
        }

        return sock.sendMessage(chat, { text: `👁️ unknown option _${a0}_.` }, { quoted: msg });
    }

    // ── Status card ──
    if (!hasQuote) {
        const s = read();
        const p = getPrefix();
        const st = (on) => (on ? '✅ ON' : '❌ OFF');
        const next = s.dest === 'owner' ? 'same' : s.dest === 'same' ? 'both' : 'owner';
        return sendInteractive(sock, chat, {
            body:
                `👁️ *peek* — view-once control\n\n` +
                `Currently the settings are:\n` +
                `• Auto-peek — ${st(s.auto)}\n` +
                `• Quoted-watch — ${st(s.watchQuoted)}\n` +
                `• Destination — ${s.dest}\n`,
            footer: 'Provided by 𝐀𝐥-𝐉𝐢𝐧',
            actions: true,
            buttons: [
                createQuickReply(`Turn Auto-peek ${s.auto ? 'OFF' : 'ON'}`, `${p}peek auto ${s.auto ? 'off' : 'on'}`),
                createQuickReply(`Turn Quoted-watch ${s.watchQuoted ? 'OFF' : 'ON'}`, `${p}peek watch ${s.watchQuoted ? 'off' : 'on'}`),
                createQuickReply(`Send captures to: ${next}`, `${p}peek dest ${next}`),
            ]
        }, { quoted: msg });
    }

    // ── Manual reveal ──
    const pseudoMsg = { message: quoted };
    const vo = extractViewOnce(pseudoMsg);

    if (DEBUG) {
        console.log('[peek:cmd] quoted keys:', quoted ? Object.keys(quoted) : null);
        console.log('[peek:cmd] extract →', vo ? vo.type : 'null');
    }

    if (!vo) {
        return sock.sendMessage(chat, {
            text: '👁️ that message is not a view-once (or content has expired).'
        }, { quoted: msg });
    }

    const originalMsg = { key: msg.key, message: quoted };
    const result = await revealViewOnce(sock, chat, originalMsg, vo, { quotedMsg: msg });

    if (!result.ok) {
        return sock.sendMessage(chat, {
            text: "👁️ couldn't retrieve that view-once — content may have expired."
        }, { quoted: msg });
    }

    if (DEBUG) console.log('[peek:cmd] succeeded via', result.method);
}

// ─────────────────────────────────────────────
//  Auto-peek — attempts to catch view-onces
//  as they arrive (usually only works for
//  direct/forwarded view-onces with content).
// ─────────────────────────────────────────────
export async function autoPeek(sock, msg) {
    const s = read();
    if (!s.auto) return;

    const chat = msg.key?.remoteJid;
    const sender = msg.key?.participant || chat;
    if (chat?.endsWith('@newsletter') || sender?.endsWith('@newsletter')) return;

    // ── Skip owner DM — prevents spam loop ──
    if (isOwnerChat(msg.key?.remoteJid)) return;

    if (msg.key?.isViewOnce === true && !msg.message) {
        if (DEBUG) console.log('[peek:auto] stub without content — skipped');
        return;
    }

    const vo = extractViewOnce({ message: msg.message });
    if (DEBUG) {
        console.log('[peek:auto] incoming', msg.key?.id,
            '| isViewOnce:', msg.key?.isViewOnce,
            '→', vo ? vo.type : 'not view-once');
    }
    if (!vo) return;

    const originChat = msg.key.remoteJid;
    const voSender = msg.key.participant || msg.key.remoteJid;
    const prefix = `👁️ *auto-peek · ${vo.type}*`;

    const targets = [];
    if (s.dest === 'owner' || s.dest === 'both') targets.push(ownerJid());
    if (s.dest === 'same'  || s.dest === 'both') targets.push(originChat);

    for (const target of targets) {
        const result = await revealViewOnce(sock, target, msg, vo, {
            mentionSender: voSender,
            prefix
        });
        if (DEBUG) console.log('[peek:auto]', target, '→', result.method, result.ok);
    }
}

// ─────────────────────────────────────────────
//  Passive quoted watcher
//
//  Runs on EVERY inbound message. If the message
//  quotes a view-once, their phone embedded the
//  real content in contextInfo.quotedMessage.
//  We extract it and send it straight to your DM.
// ─────────────────────────────────────────────
// Short, media-free description of a quoted message (for debug reports).
function describeQuote(ctx) {
    const q = ctx?.quotedMessage || {};
    const lines = [`quoted keys: ${Object.keys(q).join(', ') || '(none)'}`];
    const seenNodes = [];
    const walk = (o, path, depth) => {
        if (!o || typeof o !== 'object' || depth > 5) return;
        for (const k of Object.keys(o)) {
            const v = o[k];
            if (/^(image|video|audio|document|sticker)Message$/.test(k) && v) {
                seenNodes.push(`${path}${k}: viewOnce=${v.viewOnce === true} mediaKey=${!!v.mediaKey} directPath=${!!v.directPath} url=${!!v.url} thumb=${!!v.jpegThumbnail}`);
            } else if (v && typeof v === 'object' && v.message) {
                lines.push(`wrapper ${path}${k}`);
                walk(v.message, `${path}${k}>`, depth + 1);
            }
        }
    };
    walk(q, '', 0);
    lines.push(...(seenNodes.length ? seenNodes : ['no media node in quote']));
    lines.push(`stanzaId: ${ctx?.stanzaId || '-'}`);
    return lines.join('\n');
}

const inFlight = new Set();   // stanzaIds being captured right now
const attempts = new Map();   // stanzaId → failed attempts (give up after 2)

export async function watchQuotedViewOnce(sock, msg) {
    const s = read();
    if (!s.watchQuoted) return;

    const chat = msg.key?.remoteJid;
    const sender = msg.key?.participant || chat;
    if (!chat || chat === 'status@broadcast') return;
    if (chat.endsWith('@newsletter') || sender?.endsWith('@newsletter')) return;

    // Skip the owner's own DM — prevents a capture loop.
    if (isOwnerChat(chat)) return;

    // The owner's own replies are skipped (they already have the media); everything else is captured.
    if (msg.key?.fromMe) return;

    // Skip commands — the user is handling it manually.
    const body = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        ''
    ).trim();
    if (body && body.startsWith(getPrefix())) return;

    const ctx = extractContextInfo(msg);
    if (!ctx?.quotedMessage) return;

    const quotedId = ctx.stanzaId;
    if (!quotedId || seenQuoted.has(quotedId) || inFlight.has(quotedId)) return;

    const vo = extractAnyMedia({ message: ctx.quotedMessage });

    // Debug report — always emits what WhatsApp actually delivered inside the quote,
    // even when no media node was found (that's the most useful case for diagnosis).
    if (s.debug && !seenQuoted.has('dbg:' + quotedId)) {
        seenQuoted.set('dbg:' + quotedId, Date.now());
        const report = `🛠️ *peek debug*\ndetected media: ${vo ? vo.type + (vo.viewOnce ? ' (view-once)' : '') : 'NONE'}\n${describeQuote(ctx)}`;
        console.log('[peek:watch]', report.replace(/\n/g, ' | '));
        try { await sock.sendMessage(ownerJid(), { text: report }); } catch {}
    }
    if (!vo) return;

    inFlight.add(quotedId);
    const originalSender = ctx.participant || msg.key.participant || msg.key.remoteJid;
    const owner = ownerJid();

    try {
        const hasKeys = !!(vo.node.mediaKey && (vo.node.directPath || vo.node.url));
        console.log('[peek:watch] quoted', vo.viewOnce ? 'view-once' : 'media', quotedId, vo.type,
            '| mediaKey:', !!vo.node.mediaKey, '| directPath:', !!vo.node.directPath, '| url:', !!vo.node.url);

        // Always attempt the reveal — revealViewOnce tries download first, then forward.
        // The old hasKeys gate silently skipped forward-only captures.
        const result = await revealViewOnce(sock, owner, msg, vo, {
            mentionSender: originalSender,
            prefix: vo.viewOnce
                ? `👁️ *peek · view-once ${vo.type} captured from a reply*`
                : `📎 *peek · quoted ${vo.type}*`
        });

        if (result.ok) {
            seenQuoted.set(quotedId, Date.now());
            attempts.delete(quotedId);
            console.log(`[peek:watch] captured ${quotedId} (${vo.type}) via ${result.method} → owner DM`);
            return;
        }

        // ── Failed: tell the owner why (never fail silently) ──
        if (!hasKeys) console.log('[peek:watch] quote detail:', describeQuote(ctx).replace(/\n/g, ' | '));
        const tries = (attempts.get(quotedId) || 0) + 1;
        attempts.set(quotedId, tries);
        const reason = !hasKeys
            ? 'WhatsApp removed the media key/location from the quote'
            : 'download failed (media expired or deleted from WhatsApp servers)';
        console.log(`[peek:watch] ❌ ${quotedId} (${vo.type}) — ${reason} [try ${tries}]`);

        // Plain (non view-once) media fails quietly; view-once failures are always reported.
        if (tries >= 2 || !hasKeys) {
            seenQuoted.set(quotedId, Date.now());
            attempts.delete(quotedId);
        }
        if (vo.viewOnce && (tries >= 2 || !hasKeys)) {
            let bestSender = null;
            try { bestSender = await getBestUserJid(originalSender, sock, owner); }
            catch (e) { if (DEBUG) console.log('[peek:mention] resolve failed (fail-note):', e.message); }
            const note = `👁️ *peek · couldn't capture a ${vo.type}*\n${reason}.` +
                (bestSender ? `\nfrom @${digitsOf(bestSender)}` : '');
            const thumb = vo.node.jpegThumbnail;
            if (thumb?.length && vo.type !== 'audio') {
                await sock.sendMessage(owner, {
                    image: Buffer.from(thumb),
                    caption: note + '\n_(blurred preview only)_',
                    mentions: bestSender ? [bestSender] : []
                }).catch(() => {});
            } else {
                await sock.sendMessage(owner, {
                    text: note,
                    mentions: bestSender ? [bestSender] : []
                }).catch(() => {});
            }
        }
    } catch (e) {
        console.log('[peek:watch] ❌', e.message);
    } finally {
        inFlight.delete(quotedId);
    }
    }
