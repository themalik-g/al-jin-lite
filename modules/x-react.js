// ---------------------------------------------
//  Al-Jin · modules/x-react.js
//  .reactall — owner-controlled auto-react for EVERY chat (private + groups).
//  Off by default (Al-Jin is stealthy). Per-group reacting stays in .areact.
//
//    .reactall on|off            .reactall status
//    .reactall scope pm|group|all
//    .reactall skip <number|here>    never react in that chat
//    .reactall only <number|here>    react only in the listed chats
//    .reactall clear                 empty both lists
//    .reactall emoji 😀 🔥 ...        custom emoji set  (.reactall emoji reset)
// ---------------------------------------------
import { store, safe, reply, prefix, pick, isGroup } from '../lib/x.js';

const DEFAULT_EMOJIS = ['👍', '❤️', '😂', '🔥', '😮', '🙏', '✨', '💯', '😎', '🥰', '👏', '🎉', '🤝', '😍', '💪', '🌟'];
const cfgStore = () => store('reactall', {});
const cfg = () => {
    const d = cfgStore().data;
    d.on ??= false;
    d.scope ||= 'all';
    d.skip ||= [];
    d.only ||= [];
    d.emoji ||= [];
    return d;
};

const digits = (j) => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const sameChat = (a, b) => a === b || (!isGroup(a) && !isGroup(b) && digits(a) && digits(a) === digits(b));
const listed = (list, chat) => list.some((j) => sameChat(j, chat));
const toJid = (arg, chat) => {
    if (/^here$/i.test(arg)) return chat;
    if (arg.includes('@')) return arg;
    const d = digits(arg);
    return d.length >= 6 ? `${d}@s.whatsapp.net` : null;
};

// ── message hook (called from x-hooks.js for every message) ───────────
const lastReact = new Map();
export async function globalReact(sock, chat, msg, text) {
    const c = cfg();
    if (!c.on || msg.key.fromMe || !msg.key.id) return;
    if (chat === 'status@broadcast' || chat.endsWith('@newsletter') || chat.endsWith('@broadcast')) return;
    if (text && text.startsWith(prefix())) return;                 // commands carry their own reactions
    if (c.scope === 'pm' && isGroup(chat)) return;
    if (c.scope === 'group' && !isGroup(chat)) return;
    if (listed(c.skip, chat)) return;
    if (c.only.length && !listed(c.only, chat)) return;

    const now = Date.now();
    if (now - (lastReact.get(chat) || 0) < 1500) return;
    lastReact.set(chat, now);
    try {
        await sock.sendMessage(chat, { react: { text: pick(c.emoji.length ? c.emoji : DEFAULT_EMOJIS), key: msg.key } });
    } catch (e) { console.error('[x:reactall]', e?.message); }
}

// ── command ───────────────────────────────────────────────────────────
const statusText = (c) => [
    '😀 *reactall* — auto-react everywhere',
    `state · ${c.on ? 'ON' : 'OFF'}    scope · ${c.scope}`,
    `skip · ${c.skip.length ? c.skip.map((j) => (isGroup(j) ? 'group' : `+${digits(j)}`)).join(', ') : '—'}`,
    `only · ${c.only.length ? c.only.map((j) => (isGroup(j) ? 'group' : `+${digits(j)}`)).join(', ') : '— (all chats)'}`,
    `emoji · ${c.emoji.length ? c.emoji.join(' ') : 'default set'}`,
].join('\n');

export const reactall = safe('reactall', async (sock, chat, msg, args) => {
    const c = cfg();
    const p = prefix();
    const sub = (args[0] || '').toLowerCase();
    const save = () => cfgStore().save();

    if (!sub || sub === 'status') {
        return reply(sock, chat, msg, `${statusText(c)}\n\n_${p}reactall on|off · scope pm|group|all · skip|only <number|here> · clear · emoji ..._`);
    }
    if (sub === 'on' || sub === 'off') {
        c.on = sub === 'on'; save();
        return reply(sock, chat, msg, c.on ? '😀 Auto-react is now *ON* for every chat in scope.' : '🕶 Auto-react is *OFF*.');
    }
    if (sub === 'scope') {
        const v = (args[1] || '').toLowerCase();
        if (!['pm', 'group', 'all'].includes(v)) return reply(sock, chat, msg, `Usage: \`${p}reactall scope pm|group|all\``);
        c.scope = v; save();
        return reply(sock, chat, msg, `✅ Scope set to *${v}*.`);
    }
    if (sub === 'skip' || sub === 'only') {
        const jid = toJid(args[1] || '', chat);
        if (!jid) return reply(sock, chat, msg, `Usage: \`${p}reactall ${sub} <number|here>\``);
        const list = c[sub];
        const at = list.findIndex((j) => sameChat(j, jid));
        if (at >= 0) list.splice(at, 1); else list.push(jid);
        save();
        return reply(sock, chat, msg, `${at >= 0 ? '➖ Removed from' : '➕ Added to'} the *${sub}* list.\n\n${statusText(c)}`);
    }
    if (sub === 'clear') { c.skip = []; c.only = []; save(); return reply(sock, chat, msg, '🧹 Skip and only lists cleared.'); }
    if (sub === 'emoji') {
        if ((args[1] || '').toLowerCase() === 'reset') { c.emoji = []; save(); return reply(sock, chat, msg, '✅ Emoji set reset to default.'); }
        const set = args.slice(1).filter(Boolean).slice(0, 30);
        if (!set.length) return reply(sock, chat, msg, `Usage: \`${p}reactall emoji 😀 🔥 ❤️\` or \`${p}reactall emoji reset\``);
        c.emoji = set; save();
        return reply(sock, chat, msg, `✅ Using: ${set.join(' ')}`);
    }
    return reply(sock, chat, msg, `❓ Unknown option. Try \`${p}reactall status\`.`);
});
