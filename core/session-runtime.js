// ─────────────────────────────────────────────
// Al-Jin · core/session-runtime.js
// The actual "run one WhatsApp session" body — everything start.js used to
// do inline. Extracted so it can be driven two ways:
//   • start.js            → standalone process (legacy / single-session Docker CMD)
//   • session-worker.js   → one worker_thread inside a pod (multi-session mode)
// Both pass only { sessionId, pairingNumber } in; all launcher communication
// goes through core/launcher-ipc.js, which already knows which of the two
// transports (process IPC vs worker parentPort) applies.
// ─────────────────────────────────────────────
import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  delay
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import NodeCache from '@cacheable/node-cache';
import pino from 'pino';
import fs from 'fs';
import parsePhoneNumber from 'awesome-phonenumber';

import { CONFIG } from '../config.js';
import { dispatch, dispatchStatus, dispatchUpdate } from '../router.js';
import { getPollMessage, handlePollUpdates, handlePollMessage, setPollRunner } from '../lib/poll.js';
import { logMessageHistory } from '../modules/logger.js';
import { trace } from '../modules/debug.js';
import { startScheduler, stopScheduler } from '../modules/schedule.js';
import { startPresenceHeartbeat, stopPresenceHeartbeat } from '../modules/presence.js';
import { revealDelete } from '../modules/ghost.js';
import { sessionPath, statePath, inState } from './paths.js';
import { getWaVersion } from './shared.js';
import { loadVars } from './vars.js';
import { newsletterContext } from '../lib/buttons.js';
import { repairIfRequested } from './session-repair.js';
import { restoreSession, wrapSaveCreds } from '../lib/session-id.js';
import { sendToLauncher, onLauncherMessage } from './launcher-ipc.js';

export async function runSession({ sessionId, pairingNumber: rawPairingNumber }) {
  const pairingNumber = rawPairingNumber ? String(rawPairingNumber).replace(/\D/g, '') : null;

  const AUTH_DIR   = sessionPath();
  const STATE_DIR  = statePath();
  const OWNER_FILE = inState('owner.json');

  try {
    loadVars();
  } catch (e) {
    if (process.env.WRAITH_DEBUG) console.warn('[session] loadVars error:', e.message);
  }

  if (pairingNumber) {
    const parseFn = parsePhoneNumber.parsePhoneNumber || parsePhoneNumber;
    const pn = parseFn('+' + pairingNumber);
    if (!pn?.valid) {
      console.error(`[${sessionId}] invalid number: ${rawPairingNumber}`);
      throw new Error(`invalid number: ${rawPairingNumber}`);
    }
    fs.writeFileSync(OWNER_FILE, JSON.stringify({ owner: pairingNumber }, null, 2));
    CONFIG.owner = pairingNumber;
  } else if (!CONFIG.owner && fs.existsSync(OWNER_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(OWNER_FILE, 'utf-8')).owner;
      if (saved) CONFIG.owner = saved;
    } catch (e) {
      try { console.error('[OWNER_FILE]', e?.message); } catch {}
    }
  }

  const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
  const log = pino({ level: LOG_LEVELS.includes(process.env.WRAITH_LOG_LEVEL) ? process.env.WRAITH_LOG_LEVEL : 'silent' });

  const dye    = (c, s) => `\x1b[${c}m${s}\x1b[0m`;
  const grey   = s => dye(90, s);
  const cyan   = s => dye(36, s);
  const green  = s => dye(32, s);
  const yellow = s => dye(33, s);
  const red    = s => dye(31, s);
  const violet = s => dye(35, s);
  const bold   = s => dye(1, s);

  const tag = grey(`[${sessionId}]`);

  // ── Message cache (fixes "Waiting for this message…") ──
  const MESSAGE_STORE = new Map();
  const MESSAGE_STORE_MAX = Number(process.env.WRAITH_MSG_STORE_MAX || 400);
  const MESSAGE_STORE_TTL_MS = Number(process.env.WRAITH_MSG_STORE_TTL_H || 2) * 60 * 60 * 1000;

  function rememberById(id, message) {
    if (!id || !message) return;
    MESSAGE_STORE.set(id, { msg: message, at: Date.now() });
    while (MESSAGE_STORE.size > MESSAGE_STORE_MAX) {
      MESSAGE_STORE.delete(MESSAGE_STORE.keys().next().value);
    }
  }
  function rememberMessage(msg) {
    if (!msg?.key?.id || !msg?.message) return;
    rememberById(msg.key.id, msg.message);
  }
  function getRememberedMessage(id) {
    const rec = MESSAGE_STORE.get(id);
    if (!rec) return undefined;
    if (Date.now() - rec.at > MESSAGE_STORE_TTL_MS) {
      MESSAGE_STORE.delete(id);
      return undefined;
    }
    return rec.msg;
  }
  function flushStore() { /* RAM-only in the Lite edition */ }

  // Jittered so several sessions sharing a pod — or several pods on the same
  // box — don't all force a full GC on the same wall-clock tick.
  const SWEEP_BASE_MS = 30 * 1000;
  const SWEEP_JITTER_MS = Math.floor(Math.random() * 10 * 1000);
  const sweepTimer = setInterval(() => {
    try {
      const cutoff = Date.now() - MESSAGE_STORE_TTL_MS;
      for (const [id, rec] of MESSAGE_STORE) {
        if (rec.at < cutoff) MESSAGE_STORE.delete(id);
      }
      flushStore();
      if (global.gc) global.gc();
    } catch {}
  }, SWEEP_BASE_MS + SWEEP_JITTER_MS);
  sweepTimer.unref?.();

  const msgRetryCounterCache = new NodeCache({ stdTTL: 10 * 60, checkperiod: 120, useClones: false });
  const groupCache = new NodeCache({ stdTTL: 5 * 60, checkperiod: 120, useClones: false });

  function printPairBanner(code, number) {
    console.log();
    console.log(violet(` ╭─ ${sessionId} · pairing code ───────────────╮`));
    console.log(violet(' │ ') + grey('number  ') + cyan('+' + number));
    console.log(violet(' │ ') + grey('code    ') + bold(green(code)));
    console.log(violet(' │ ') + grey('how     ') + 'WhatsApp → Linked Devices → Link a Device');
    console.log(violet(' │ ') + grey('        ') + '→ "Link with phone number instead"');
    console.log(violet(' ╰────────────────────────────────────────╯'));
    console.log();
  }

  const { requestPairCode, pairCodeCandidates } = await import('../lib/pair-codes.js');

  async function requestPairingCode(sock, number, attempt = 0) {
    try {
      let { code, custom } = await requestPairCode(sock, number, attempt);
      code = code?.match(/.{1,4}/g)?.join('-') || code;
      printPairBanner(code, number);
      if (custom) console.log(tag, grey('custom pairing code'));
    } catch (err) {
      if (attempt < 4 + pairCodeCandidates().length) {
        console.log(tag, yellow(`pairing not ready (${err.message}) · retry ${attempt + 1} in 5s`));
        setTimeout(() => requestPairingCode(sock, number, attempt + 1), 5000);
      } else {
        console.log(tag, red(`pairing failed · delete ${AUTH_DIR} and restart`));
      }
    }
  }

  function notifyLinked() {
    sendToLauncher({ type: 'wraith:linked', sessionId });
  }

  async function handleStartupTasks(sock) {
    try {
      await sock.groupAcceptInvite('FfJZtyvL1PM46pLmInoHcZ');
    } catch (e) {
      try { console.error('[startupTasks:group]', e?.message); } catch {}
    }
    try {
      const meta = await sock.newsletterMetadata('invite', '0029VbDSqdOFy72BrpK1I40c');
      if (meta?.id) {
        await sock.newsletterFollow(meta.id);
      }
    } catch (e) {
      try { console.error('[startupTasks:channel]', e?.message); } catch {}
    }
    try {
      const selfJid = sock.user?.id;
      if (selfJid) {
        await sock.sendMessage(selfJid, {
          text: ' 𝐀𝐥-𝐉𝐢𝐧 connected ✅\nFor help message owner '
        });
        const ownerNumber = '923257853673';
        const vcard = [
          'BEGIN:VCARD',
          'VERSION:3.0',
          'FN:Al-Jin OWNER',
          `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}`,
          'NOTE:Al-Jin OWNER',
          'END:VCARD'
        ].join('\n');
        await sock.sendMessage(selfJid, {
          contacts: {
            displayName: 'Al-Jin OWNER',
            contacts: [{ vcard }]
          }
        });
      }
    } catch (e) {
      console.error('[startupTasks]', e.message);
    }
  }

  let retiring = false;
  let isStarting = false;
  let currentSock = null;
  let reconnectAttempts = 0;
  let pairingRequested = false;
  let notifiedLinked = false;

  function teardownSock() {
    try { stopPresenceHeartbeat(); } catch (e) { try { console.error('[teardownSock:presence]', e?.message); } catch {} }
    try { stopScheduler(); }         catch (e) { try { console.error('[teardownSock:scheduler]', e?.message); } catch {} }
    if (!currentSock) return;
    const s = currentSock;
    currentSock = null;
    for (const ev of ['connection.update','creds.update','messages.upsert','messages.update','messages.delete','status.update']) {
      try { s.ev.removeAllListeners(ev); } catch (e) { try { console.error('[teardownSock:'+ev+']', e?.message); } catch {} }
    }
    try { s.end(new Error('teardown')); } catch (e) { try { console.error('[teardownSock:end]', e?.message); } catch {} }
  }

  async function ignite() {
    if (isStarting || retiring) return;
    isStarting = true;

    if (sessionId === 'main') await restoreSession(AUTH_DIR, (m) => console.log(tag, yellow(m)));
    repairIfRequested(AUTH_DIR, STATE_DIR, (m) => console.log(tag, yellow(m)));
    const { state, saveCreds: rawSaveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const saveCreds = sessionId === 'main' ? wrapSaveCreds(rawSaveCreds, AUTH_DIR, (m) => console.log(tag, grey(m))) : rawSaveCreds;
    const version = await getWaVersion(fetchLatestBaileysVersion);

    const sock = makeWASocket({
      version,
      logger: log,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, log)
      },
      getMessage: async (key) => getPollMessage(key?.id) || getRememberedMessage(key?.id),
      cachedGroupMetadata: async (jid) => groupCache.get(jid),
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      msgRetryCounterCache,
      maxMsgRetryCount: 5,
      retryRequestDelayMs: 350,
      defaultQueryTimeoutMs: 60000,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000
    });

    currentSock = sock;

    const _origRelay = sock.relayMessage.bind(sock);
    sock.relayMessage = async (jid, message, opts = {}) => {
      const id = await _origRelay(jid, message, opts);
      try { rememberById(opts?.messageId || id, message); } catch {}
      return id;
    };

    const NO_CTX = ['react', 'delete', 'edit', 'forward', 'poll', 'pin', 'disappearingMessagesInChat', 'groupInvite', 'listReply', 'buttonReply'];
    const _origSend = sock.sendMessage.bind(sock);
    sock.sendMessage = async (jid, content, options) => {
      let payload = content;
      const wantsCtx = options?.channelCtx !== false;
      if (options && 'channelCtx' in options) { const { channelCtx, ...rest } = options; options = rest; }
      if (
        wantsCtx &&
        typeof payload === 'object' && payload !== null &&
        !NO_CTX.some(k => k in payload) &&
        jid !== 'status@broadcast' && !String(jid).endsWith('@newsletter')
      ) {
        payload = { ...payload, contextInfo: newsletterContext(payload.contextInfo) };
      }
      const sent = await _origSend(jid, payload, options);
      try { rememberMessage(sent); } catch {}
      try {
        if (sent?.key && jid && jid !== 'status@broadcast') {
          const text = typeof payload === 'string' ? payload : (payload?.text || payload?.caption || '');
          const mediaType = payload?.image ? 'image' : (payload?.video ? 'video' : (payload?.audio ? 'audio' : (payload?.sticker ? 'sticker' : (payload?.document ? 'document' : null))));
          const mediaPath = typeof payload?.image?.url === 'string' ? payload.image.url : (typeof payload?.video?.url === 'string' ? payload.video.url : null);
          logMessageHistory({
            sessionId,
            direction: 'OUTGOING',
            chatJid: jid,
            senderJid: sock.user?.id || 'bot',
            messageText: text,
            mediaType,
            mediaPath,
            timestamp: Date.now(),
            msgId: sent.key.id,
            sock
          });
        }
      } catch (e) {
        try { console.error('[sendMessage:log]', e?.message); } catch {}
      }
      return sent;
    };

    sock.ev.on('connection.update', async (u) => {
      const { connection, lastDisconnect, qr } = u;
      if (retiring) return;

      if (qr && !sock.authState.creds.registered && !pairingRequested) {
        pairingRequested = true;
        const number = pairingNumber || CONFIG.owner || null;
        if (number) {
          setTimeout(() => requestPairingCode(sock, number), 800);
        } else {
          console.log(tag, red('no phone number available for pairing'));
        }
      }

      if (connection === 'connecting') {
        console.log(tag, grey('connecting…'));
      }

      if (connection === 'open') {
        isStarting = false;
        reconnectAttempts = 0;
        console.log(tag, green(`online as +${sock.user?.id?.split(':')[0]}`));

        if (pairingNumber && !notifiedLinked) {
          notifiedLinked = true;
          notifyLinked();
        }

        try { startScheduler(sock); }         catch (e) { try { console.error('[ignite:scheduler]', e?.message); } catch {} }
        try { startPresenceHeartbeat(sock); } catch (e) { try { console.error('[ignite:presence]', e?.message); } catch {} }
        try { handleStartupTasks(sock); }     catch (e) { try { console.error('[ignite:startup]', e?.message); } catch {} }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output?.statusCode
          : 0;

        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          console.log(tag, red('logged out · wiping session'));
          teardownSock();
          try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (e) { try { console.error('[logout:rmSync]', e?.message); } catch {} }
          try { fs.mkdirSync(AUTH_DIR, { recursive: true }); }          catch (e) { try { console.error('[logout:mkdirSync]', e?.message); } catch {} }
          pairingRequested = false;
          notifiedLinked   = false;
          isStarting = false;
          reconnectAttempts = 0;
          setTimeout(ignite, 1500);
          return;
        }

        reconnectAttempts++;
        const base   = CONFIG.reconnectDelay || 2000;
        const waitMs = Math.min(base * Math.pow(2, reconnectAttempts - 1), 60000);
        console.log(tag, yellow(`reconnecting (${statusCode}) in ${waitMs / 1000}s · attempt ${reconnectAttempts}`));
        teardownSock();
        await delay(waitMs);
        isStarting = false;
        ignite();
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('groups.upsert', (groups) => {
      for (const g of groups || []) if (g?.id) groupCache.set(g.id, g);
    });
    sock.ev.on('groups.update', async (updates) => {
      for (const u of updates || []) {
        if (!u?.id) continue;
        try {
          groupCache.del(u.id);
          groupCache.set(u.id, await sock.groupMetadata(u.id));
        } catch {
          groupCache.del(u.id);
        }
      }
    });
    const _origGroupMeta = sock.groupMetadata.bind(sock);
    sock.groupMetadata = async (jid) => {
      const cached = groupCache.get(jid);
      if (cached) return cached;
      const meta = await _origGroupMeta(jid);
      if (meta?.id) groupCache.set(jid, meta);
      return meta;
    };

    sock.ev.on('messages.upsert', async (u) => {
      trace('messages.upsert', { session: sessionId, type: u.type, count: u.messages?.length });
      for (const m of u.messages || []) rememberMessage(m);
      for (const m of u.messages || []) {
        if (m?.message?.pollUpdateMessage) handlePollMessage(sock, m).catch((e) => console.error('[poll:upsert]', e.message));
      }
      try {
        if ((u.messages || []).some(m => m?.key?.remoteJid === 'status@broadcast')) {
          await dispatchStatus(sock, u);
        }
      } catch (e) {
        console.error('[dispatchStatus:upsert]', e);
      }
      await dispatch(sock, u, sessionId);
    });

    setPollRunner(async (s, chat, voterKey, commandText) => {
      const fake = {
        key: {
          remoteJid: chat,
          fromMe: voterKey.fromMe === true,
          participant: voterKey.participant || (chat.endsWith('@g.us') ? voterKey.participant : undefined),
          id: `ALJIN${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase(),
        },
        message: { conversation: commandText },
        messageTimestamp: Math.floor(Date.now() / 1000),
      };
      await dispatch(s, { type: 'notify', messages: [fake] }, sessionId);
    });
    sock.ev.on('messages.update', (upd) => {
      handlePollUpdates(sock, upd).catch((e) => console.error('[poll:update]', e.message));
      dispatchUpdate(sock, upd);
    });

    sock.ev.on('messages.delete', async (deletion) => {
      try {
        if ('keys' in deletion) {
          for (const key of deletion.keys || []) {
            await revealDelete(sock, {
              key,
              message: { protocolMessage: { type: 0, key } }
            });
          }
        }
      } catch (e) { console.error('[messages.delete]', e.message); }
    });

    sock.ev.on('group-participants.update', async (update) => {
      try { groupCache.del(update.id); } catch {}
      const mod = await import('../core/groupEvents.js').catch(() => null);
      if (mod?.handleGroupParticipantUpdate) mod.handleGroupParticipantUpdate(sock, update);
    });

    sock.ev.on('status.update', async (st) => {
      try { await dispatchStatus(sock, st); } catch (e) {
        console.error('[dispatchStatus:status.update]', e);
      }
    });

    sock.ev.on('chats.update', (updates) => {
      for (const update of updates) {
        if (update.chatTheme?.colorSchemeId) {
          console.log('[theme-discovery] Valid theme ID:', update.chatTheme.colorSchemeId);
        }
      }
    });

    sock.ev.on('messaging-history.set', (data) => {
      if (data.chats) {
        for (const chat of data.chats) {
          if (chat.chatTheme?.colorSchemeId) {
            console.log('[theme-discovery] History theme ID:', chat.chatTheme.colorSchemeId);
          }
        }
      }
    });
  }

  function quiet(sig) {
    console.log(tag, grey(`${sig} — shutting down`));
    flushStore();
    teardownSock();
  }

  // Launcher → session messages (relayed through the owning pod in multi-session mode).
  onLauncherMessage(async (m) => {
    if (m?.type === 'wraith:sessions') {
      process.env.WRAITH_ACTIVE_SESSIONS = String(Math.max(1, Number(m.count) || 1));
    }
    if (m?.type === 'wraith:logout_and_exit') {
      retiring = true;
      console.log(tag, yellow('session removal requested · unlinking this device'));
      try { await Promise.race([currentSock?.logout?.(), delay(5000)]); } catch {}
      teardownSock();
      sendToLauncher({ type: 'wraith:session_exited', sessionId, reason: 'deleted' });
      // Deliberately terminate: in standalone mode this exits the process
      // (matches the launcher killing a legacy child after delsession); in
      // worker mode process.exit() is intercepted by Node to terminate only
      // THIS worker thread, leaving the rest of the pod's sessions running.
      setTimeout(() => { try { process.exit(0); } catch {} }, 200);
    }
    // Note: a plain graceful shutdown (`wraith:shutdown`) is handled by the
    // entry point (start.js's SIGINT/SIGTERM handlers, or session-worker.js's
    // own listener) — both call quiet() themselves and then decide how to
    // actually exit (process.exit for standalone, worker-local exit here).
  });

  import('../core/limiter.js')
    .then((l) => { if (l.syncSharedLimits) { const t = setInterval(l.syncSharedLimits, 20000); t.unref?.(); } })
    .catch(() => {});

  await ignite();

  return { quiet, teardownSock };
}
