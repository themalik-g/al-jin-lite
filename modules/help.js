// ─────────────────────────────────────────────
// Al-Jin · modules/help.js
// Clean single-message plain text list menu with box layout
// ─────────────────────────────────────────────
import { isOwner } from '../core/identity.js';
import { getPrefix } from '../core/settings.js';
import { newsletterContext, sendWithCta } from '../lib/buttons.js';
import { X_MENU } from './x-details.js';
import { CONFIG } from '../config.js';
import { businessStatusQuote } from '../lib/fakequote.js';
import { getSetting, setSetting } from '../core/settings.js';
import { ramSummary, uptimeText, platformParts, botVersion } from '../lib/sysinfo.js';

const MENU_IMAGE = process.env.WRAITH_MENU_IMAGE || 'https://i.picrd.com/images/P6Z69uI7bfC.jpg';

// Sends the menu as ONE message. If it fits in an image caption, the banner is
// attached; otherwise the whole menu goes out as a single text message
// (never split into two). Falls back to plain text if the image fails.
// .imenu off     (default) → ONE plain text message
// .imenu on                → ONE message: banner image, whole menu as its caption
// .imenu preview           → ONE text message with the banner as a large preview card
// Never split into two messages. If the image can't be used, the same text goes out alone.
const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbDSqdOFy72BrpK1I40c';

export function imenuMode() {
  const v = getSetting('imenu');
  if (v === 'on' || v === true) return 'on';           // true = value saved by the previous update
  if (v === 'preview') return 'preview';
  return 'off';
}

let _thumb = null;
async function menuThumb() {
  if (_thumb) return _thumb;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(MENU_IMAGE, { signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    _thumb = Buffer.from(await res.arrayBuffer());
    return _thumb;
  } catch { return null; }
}

async function sendMenu(sock, chat, text, msg, mentions = []) {
  // Whole menu is a reply to the blue-tick "WhatsApp Business" status.
  const quoted = businessStatusQuote();
  const ctx = (extra = {}) => newsletterContext({ ...(mentions.length ? { mentionedJid: mentions } : {}), ...extra });
  const mode = imenuMode();

  if (mode === 'on') {
    try {
      return await sock.sendMessage(chat, { image: { url: MENU_IMAGE }, caption: text, mentions, contextInfo: ctx() }, { quoted });
    } catch (e) { try { console.error('[menu:image]', e?.message); } catch {} }
  }

  if (mode === 'preview') {
    try {
      const thumbnail = await menuThumb();
      if (thumbnail) {
        return await sock.sendMessage(chat, {
          text, mentions,
          contextInfo: ctx({
            externalAdReply: {
              title: '𝗔𝗟-𝗝𝗜𝗡',
              body: 'Al-Jin Official Channel',
              mediaType: 1,
              renderLargerThumbnail: true,
              showAdAttribution: false,
              thumbnail,
              sourceUrl: CHANNEL_LINK,
            },
          }),
        }, { quoted });
      }
    } catch (e) { try { console.error('[menu:preview]', e?.message); } catch {} }
  }

  try {
    return await sock.sendMessage(chat, { text, mentions, contextInfo: ctx() }, { quoted });
  } catch (e) {
    try { console.error('[menu:text]', e?.message); } catch {}
    return sendWithCta(sock, chat, text, { quoted: msg });
  }
}

const c = (cmd, ownerOnly = false) => ({ cmd, ownerOnly });

const SMALL_CAPS = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
  j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ꞯ', r: 'ʀ',
  s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
};

function toSmallCaps(str) {
  return str.toLowerCase().split('').map((ch) => SMALL_CAPS[ch] || ch).join('');
}

const REGISTRY = [
  {
    id: 'core',
    icon: '🛡️',
    title: 'CORE',
    commands: [
      c('.alive'),
      c('.imenu', true),
      c('.cpu', true),
      c('.gpu', true),
      c('.ram', true),
      c('.rom', true),
      c('.ping'),
      c('.uptime'),
      c('.restart', true),
      c('.help'),
      c('.menu'),
      c('.usermanual'),
      c('.prefix', true),
      c('.mode', true),
      c('.replymode', true),
      c('.update', true),
      c('.script'),
      c('.repo'),
      c('.owner'),
    ],
  },
  {
    id: 'ai2',
    icon: '🧞',
    title: 'JIN AI & ESM',
    commands: [
      c('.jin <q>'), c('.jin2 <q>'), c('.jin create <prompt>'), c('.jincreate2 <prompt>'),
      c('.gpt <q>'), c('.claude <q>'), c('.grok <q>'), c('.deepseek <q>'), c('.kimi <q>'),
      c('.jindl <url>'), c('.jinvideo <url/query>'), c('.jinytsearch <query>'),
      c('.jinimage <prompt>'), c('.jinai <prompt>'), c('.jinapk <app>'),
      c('.gpt models'), c('.gpt use <id>', true),
    ],
  },
  {
    id: 'apps',
    icon: '📦',
    title: 'APPS & DEVICES',
    commands: [
      c('.apk <app>'), c('.betaapk <app>'),
      c('.mobileinfo <phone>'), c('.laptopinfo <laptop>'),
    ],
  },
  {
    id: 'igplus',
    icon: '📸',
    title: 'INSTAGRAM+',
    commands: [
      c('.igstory <user>', true),
      c('.igsearch <name>', true), c('.igprofile <user>', true),
      c('.fb <url>'),
    ],
  },
  {
    id: 'tagplus',
    icon: '🏷️',
    title: 'TAG (NO ADMINS)',
    commands: [c('.tagallnoadmin [text]', true), c('.hidetagnoadmin [text]', true)],
  },
  {
    id: 'ghost',
    icon: '🎭',
    title: 'GHOST',
    commands: [
      c('.ghost', true),
      c('.ghost on|off', true),
      c('.ghost edit on|off', true),
      c('.ghost relay on|off', true),
      c('.ghost status on|off', true),
      c('.ghost mode all|selected', true),
      c('.ghost chat on|off', true),
      c('.ghost chats', true),
      c('.ghost dest <number>', true),
      c('.setdest <number>', true),
    ],
  },
  {
    id: 'peek',
    icon: '👀',
    title: 'PEEK',
    commands: [
      c('.peek', true),
      c('.peek auto on|off', true),
      c('.peek watch on|off', true),
      c('.peek dest owner', true),
      c('.peek dest same', true),
      c('.peek dest both', true),
    ],
  },
  {
    id: 'lurk',
    icon: '🕵️',
    title: 'LURK',
    commands: [
      c('.lurk', true),
      c('.lurk on|off', true),
      c('.lurk react on|off', true),
      c('.lurk download on|off', true),
      c('.lurk emoji ❤️', true),
      c('.lurk emoji random', true),
      c('.lurk emoji none', true),
    ],
  },
  {
    id: 'schedule',
    icon: '⏰',
    title: 'SCHEDULE',
    commands: [
      c('.schedule', true),
      c('.schedule list', true),
      c('.schedule cancel <id>', true),
      c('.schedule media', true),
    ],
  },
  {
    id: 'utility',
    aliases: ['tools'],
    icon: '🛠',
    title: 'UTILITY & NETWORK',
    commands: [
      c('.currency'),
      c('.qr <text>'),
      c('.qr read'),
      c('.define <word>'),
      c('.weather <city>'),
      c('.pwned <password>'),
      c('.url (reply to media)'),
      c('.reqlocation'),
      c('.relocation'),
      c('.shorten <url>'),
      c('.unroll <short_url>'),
      c('.speedtest'),
      c('.npm <package>'),
      c('.tempmail'),
      c('.readmail <address>'),
      c('.news [topic]'),
      c('.hackernews'),
      c('.wiki <topic>'),
      c('.joke'),
      c('.advice'),
      c('.fact'),
      c('.githubdiff <url>'),
      c('.urban <slang>'),
      c('.slang <term>'),
      c('.channelinfo <url>'),
      c('.unit <val> <u1> to <u2>'),
      c('.commandcount'),
    ],
  },
  {
    id: 'islamic',
    aliases: ['quran', 'hadith', 'hadees'],
    icon: '🕌',
    title: 'ISLAMIC',
    commands: [
      c('.prayertimes <city>'),
      c('.pts <city>'),
      c('.quran <surah:ayah>'),
      c('.sora <name_or_number>'),
      c('.para <1-30>'),
      c('.muslim <number>'),
      c('.bukhari <number>'),
      c('.search quran <topic>'),
      c('.quransearch <query>'),
      c('.hadeessearch <query>'),
      c('.islamsearch <query>'),
    ],
  },
  {
    id: 'media',
    icon: '📚',
    title: 'MEDIA, AI & TOOLS',
    commands: [
      c('.img <query> [count]'),
      c('.vcard @user'),
      c('.sanitize / .exifwipe'),
      c('.whatanime'),
      c('.gemini <prompt>'),
      c('.scholar <topic/question>'),
      c('.photo <prompt>'),
      c('.couplepp [count]'),
      c('.movie <title>'),
      c('.songinfo <title> [artist]'),
      c('.lyrics <artist> - <title>'),
      c('.hd / .enhance'),
      c('.meme "top" | "bottom"'),
      c('.sticker / .s'),
      c('.toimg'),
      c('.fancy <text>'),
      c('.dice [spec]'),
      c('.coin [count]'),
    ],
  },
  {
    id: 'download',
    aliases: ['dl'],
    icon: '⬇️',
    title: 'DOWNLOAD',
    commands: [
      c('.dl <url>'),
      c('.dl audio <url>'),
      c('.dl mp3 <url>'),
      c('.play <query>'),
      c('.ytv <query/url>'),
      c('.video <query/url>'),
      c('.ytdl <url>'),
      c('.pdl <post-url>'),
      c('.download <url>'),
      c('.twitter <url>'),
      c('.pinterest <url>'),
      c('.threads <url>'),
      c('.reddit <url>'),
      c('.youtube <url>'),
      c('.gitdl <github-url>', true),
      c('.mfdl <mediafire-url>', true),
    ],
  },
  {
    id: 'display',
    aliases: ['wallpaper', 'wp', 'dp'],
    icon: '🖼️',
    title: 'WALLPAPERS',
    commands: [
      c('.wp1 ... .wp10'),
      c('.wp (reply photo)'),
      c('.dp (reply photo)'),
      c('.reset wp'),
    ],
  },
  {
    id: 'textmaker',
    aliases: ['ephoto', 'logo'],
    icon: '🪄',
    title: 'TEXT→PHOTO',
    commands: [
      c('.textmaker effect txt'),
      c('.neon <text>'),
      c('.glitch <text>'),
      c('.3dgold <text>'),
      c('.marvel <text1 ; text2>'),
      c('.pornhub <text1 ; text2>'),
      c('.cyberpunk <text>'),
      c('.graffiti <text>'),
      c('.blackpink <text>'),
      c('.naruto <text>'),
      c('.galaxy <text>'),
      c('.blood <text>'),
      c('.hologram <text>'),
      c('.matrix <text>'),
      c('.slice <text>'),
      c('.luxury <text>'),
      c('.vintage <text>'),
      c('.lightglow <text>'),
      c('.sand <text>'),
      c('.water <text>'),
      c('.fire <text>'),
      c('.metallic <text>'),
      c('.space <text>'),
      c('.neonlight <text>'),
      c('.glowing <text>'),
      c('.captainamerica <text>'),
      c('.wall <text>'),
      c('.paper <text>'),
      c('.circuit <text>'),
      c('.neondevil <text>'),
      c('.dragon <text>'),
      c('.comic <text>'),
      c('.titanium <text>'),
      c('.sunset <text>'),
      c('.balloon <text>'),
      c('.silver <text>'),
      c('.paint <text>'),
      c('.xmas <text>'),
      c('.sparkle <text>'),
      c('.american <text>'),
      c('.blueneon <text>'),
      c('.greenneon <text>'),
      c('.goldletter <text>'),
      c('.pubg <text>'),
      c('.starwars <text>'),
      c('.neonart <text>'),
      c('.glitchneon <text>'),
    ],
  },
  {
    id: 'social',
    aliases: ['social,search'],
    icon: '📥',
    title: 'SEARCH|DL',
    commands: [
      c('.ig <username/url>'),
      c('.tiktok <username/url>'),
      c('.fb <username/url>'),
    ],
  },
  {
    id: 'group',
    aliases: ['admin', 'groupadmin'],
    icon: '👨‍👩‍👧‍👧',
    title: 'GROUP ADMIN',
    commands: [
      c('.open', true),
      c('.close', true),
      c('.schedule open', true),
      c('.schedule close', true),
      c('.kick (reply|num)', true),
      c('.add <number>', true),
      c('.promote (reply|num)', true),
      c('.demote (reply|num)', true),
      c('.tag [msg]', true),
      c('.tagall [msg]', true),
      c('.tag admin [msg]', true),
      c('.hidetag [msg]', true),
      c('.hidetag admin [msg]', true),
      c('.pdd <on|off>'),
      c('.pinchat', true),
      c('.unpinchat', true),
      c('.setgdesc <text>', true),
      c('.setgpp', true),
      c('.welcome on'),
      c('.welcome off'),
      c('.goodbye on'),
      c('.goodbye off'),
      c('.antilink on|off', true),
      c('.antispam on|off', true),
      c('.antisticker on|off', true),
      c('.kickall', true),
      c('.kickcc <code>', true),
      c('.approveall', true),
      c('.declineall', true),
      c('.leave', true),
      c('.join <link>', true),
      c('.gclone', true),
      c('.revoke', true),
      c('.gshield on|off', true),
      c('.fakereply txt|reply'),
      c('.antipromote on|off', true),
      c('.antidemote on|off', true),
      c('.purge [count]', true),
      c('.antibot on|off', true),
      c('.warn @user [reason]', true),
      c('.warns [@user]'),
      c('.resetwarns @user', true),
    ],
  },
  {
    id: 'owner',
    aliases: ['profile', 'only-owner'],
    icon: '⛔',
    title: 'OWNER PROFILE',
    commands: [
      c('.setpp', true),
      c('.setabout <text>', true),
      c('.setstatus reply|text', true),
      c('.getstatus <number|jid>', true),
      c('.replymode buttons|txt', true),
      c('.getpair <number>', true),
      c('.setsession <number>', true),
      c('.addsession <number>', true),
      c('.delsession <id>', true),
      c('.setvar <key> <value>', true),
      c('.getvar <key|all>', true),
      c('.delvar <key>', true),
      c('.block (reply|num)', true),
      c('.unblock (reply|num)', true),
      c('.blocklist', true),
      c('.unblockall', true),
      c('.rejectcalls on', true),
      c('.rejectcalls off', true),
      c('.stalk <number>', true),
      c('.stalk list', true),
      c('.stalk stop <number>', true),
      c('.noaction @user', true),
      c('.statusalert <number>', true),
      c('.watch <number>', true),
      c('.ginfo <link>', true),
      c('.chatstats <number>', true),
      c('.addowner <number>', true),
      c('.delowner <number>', true),
      c('.owner list', true),
      c('.privacy lastseen', true),
      c('.privacy groupadd', true),
      c('.privacy pfp', true),
      c('.stealfull @user', true),
    ],
  },
  {
    id: 'chat',
    aliases: ['chatcontrols'],
    icon: '💬',
    title: 'CHAT CONTROLS',
    commands: [
      c('.disappearing 24h|7d|90d'),
      c('.mute 8h|1d|forever', true),
      c('.unmute', true),
      c('.archive', true),
      c('.unarchive', true),
      c('.clearchat', true),
      c('.pinchat', true),
      c('.unpinchat', true),
    ],
  },
  {
    id: 'jid',
    aliases: ['jidprofile'],
    icon: '🧭',
    title: 'JID|PROFILE',
    commands: [
      c('.getjid'),
      c('.getpp'),
      c('.presence', true),
      c('.presence online on|off', true),
      c('.presence typing on|off', true),
      c('.presence recording on', true),
      c('.presence recording off', true),
      c('.presence reads on|off', true),
      c('.activity', true),
    ],
  },
];

// extras pack categories (modules/x-details.js)
REGISTRY.push(...X_MENU);

function applyPrefix(cmd, prefix) {
  if (prefix === '.') return cmd;
  return cmd.startsWith('.') ? prefix + cmd.slice(1) : cmd;
}

function visibleRegistry(isOwnerUser) {
  if (isOwnerUser) return REGISTRY;
  return REGISTRY
    .map((g) => ({
      ...g,
      commands: g.commands.filter((x) => !x.ownerOnly),
    }))
    .filter((g) => g.commands.length > 0);
}

function totalCommands() {
  return REGISTRY.reduce((n, g) => n + g.commands.length, 0);
}

function clockParts() {
  const tz = CONFIG?.timezone || 'UTC';
  const now = new Date();
  const f = (opts) => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }).format(now); } catch { return new Intl.DateTimeFormat('en-GB', opts).format(now); } };
  return {
    time: f({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    day: f({ weekday: 'long' }),
    date: f({ day: '2-digit', month: '2-digit', year: 'numeric' }),
  };
}

// First part on the Platform line, every further part on its own line that also starts with the bar.
function platformLines() {
  const parts = platformParts();
  const lines = [`│ ${toSmallCaps('Platform')}: ${parts[0] || 'unknown'}`];
  for (const extra of parts.slice(1)) lines.push(`│ ${extra}`);
  return lines;
}

function renderHeaderBox(prefix, isOwnerUser, senderJid = '') {
  const ownerText = isOwnerUser ? toSmallCaps('COMMANDS ARE OWNER-ONLY') : toSmallCaps('COMMANDS ARE PUBLIC');
  const guideCmd = applyPrefix('.ᴄᴏᴍᴍᴀɴᴅ ꜰᴏʀ ɢᴜɪᴅᴇ', prefix);
  const { time, day, date } = clockParts();
  const who = String(senderJid || '').split('@')[0].split(':')[0] || 'user';
  return [
    '      【 🤖 𝐀𝐥-𝐉𝐢𝐧 🤖 】',
    '┌─────────────────┈⚝',
    `│ ${ownerText}`,
    `│ ℹ️ ${guideCmd}`,
    '│',
    `│ ${toSmallCaps('Prefix')}: ${prefix}`,
    `│ ${toSmallCaps('User')}: @${who}`,
    `│ ${toSmallCaps('Time')}: ${time}`,
    `│ ${toSmallCaps('Day')}: ${day}`,
    `│ ${toSmallCaps('Date')}: ${date}`,
    `│ ${toSmallCaps('Version')}: ${botVersion()}`,
    `│ ${toSmallCaps('Commands')}: ${totalCommands()}`,
    `│ ${toSmallCaps('Ram')}: ${ramSummary()}`,
    `│ ${toSmallCaps('Uptime')}: ${uptimeText()}`,
    ...platformLines(),
    '└─────────────────┈⚝',
  ].join('\n');
}

function renderCategoryBox(group, prefix, isOwnerUser) {
  const visible = isOwnerUser
    ? group.commands
    : group.commands.filter((x) => !x.ownerOnly);

  if (!visible.length) return null;

  const lines = [
    `      _*【 ${group.icon} ${toSmallCaps(group.title)} 】*_`,
    '┌─────────────────┈⚝',
  ];

  for (const item of visible) {
    lines.push(`│ ◈ ${applyPrefix(item.cmd, prefix)}`);
  }

  lines.push('└─────────────────┈⚝');

  return lines.join('\n');
}

function renderAllPlainText(prefix, isOwnerUser, senderJid = '') {
  const header = renderHeaderBox(prefix, isOwnerUser, senderJid);
  const groups = visibleRegistry(isOwnerUser);
  const categoryBoxes = [];

  for (const group of groups) {
    const box = renderCategoryBox(group, prefix, isOwnerUser);
    if (box) categoryBoxes.push(box);
  }

  return [header, ...categoryBoxes].join('\n');
}

function findGroup(name) {
  const wanted = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!wanted) return null;
  return (
    REGISTRY.find((g) => {
      const ids = [g.id, ...(g.aliases || [])];
      if (ids.some((x) => x.toLowerCase() === wanted)) return true;
      const cleanedTitle = g.title.replace(/[^a-z]/gi, '').toLowerCase();
      return cleanedTitle === wanted;
    }) || null
  );
}

export async function helpCommand(sock, chat, msg, args) {
  try {
    const from = msg.key.participant || msg.key.remoteJid;
    const isOwnerUser = msg.key.fromMe || isOwner(from);
    const prefix = getPrefix();
    // who gets the @mention in the menu header
    const senderJid = msg.key.fromMe ? (sock.user?.id || from) : from;
    const mentions = [String(senderJid).replace(/:\d+(?=@)/, '')];

    const target = (args?.[0] || '').toLowerCase().trim();

    if (!target) {
      const text = renderAllPlainText(prefix, isOwnerUser, senderJid);
      return await sendMenu(sock, chat, text, msg, mentions);
    }

    const group = findGroup(target);

    if (!group) {
      const avail = visibleRegistry(isOwnerUser)
        .map((g) => `• ${g.id}`)
        .join(' · ');
      return await sendWithCta(
        sock,
        chat,
        `❓ Unknown menu category: *${target}*\n\nAvailable categories:\n${avail}`,
        { quoted: msg }
      );
    }

    const box = renderCategoryBox(group, prefix, isOwnerUser);

    if (!box) {
      return await sendWithCta(
        sock,
        chat,
        `🔒 Category *${group.title}* is owner-only.`,
        { quoted: msg }
      );
    }

    const text = [renderHeaderBox(prefix, isOwnerUser, senderJid), box].join('\n');

    return await sendMenu(sock, chat, text, msg, mentions);
  } catch (e) {
    try {
      await sock.sendMessage(
        chat,
        { text: `⚠️ help failed: ${e.message}`, contextInfo: newsletterContext() },
        { quoted: msg }
      );
    } catch {}
  }
}

// .imenu [on|off|preview] — owner only
export async function imenuCommand(sock, chat, msg, args) {
  const from = msg.key.participant || msg.key.remoteJid;
  if (!msg.key.fromMe && !isOwner(from)) {
    return sock.sendMessage(chat, { text: '⛔ Owner only.' }, { quoted: msg });
  }
  const prefix = getPrefix();
  const arg = String(args?.[0] || '').toLowerCase();
  const info = {
    on: 'image embedded in the menu (single message)',
    preview: 'text menu with the image as a preview card (single message)',
    off: 'normal text menu, no image',
  };
  if (info[arg]) {
    setSetting('imenu', arg);
    return sock.sendMessage(chat, { text: `✅ Image menu *${arg.toUpperCase()}* — ${info[arg]}.` }, { quoted: msg });
  }
  return sock.sendMessage(chat, { text: `🖼️ Image menu is *${imenuMode().toUpperCase()}*\n\nUsage:\n• \`${prefix}imenu off\` — ${info.off} (default)\n• \`${prefix}imenu on\` — ${info.on}\n• \`${prefix}imenu preview\` — ${info.preview}` }, { quoted: msg });
}
