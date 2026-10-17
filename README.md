# 𝐀𝐥-𝐉𝐢𝐧 Lite

<p align="center">
  <a href="https://tiles-talk-collection-cassette.trycloudflare.com/"><img src="assets/get-session-id.svg" alt="Get pairing code" width="520"></a>
</p>

**The ultra-light edition of [Al-Jin](https://github.com/themalik-g/al-jin-whatsapp-bot) — same core engine, built to run on the smallest VPS you can find.**

No ffmpeg, no yt-dlp, no OCR/PDF/PPT, no media ever written to disk. 9 dependencies total. Runs comfortably on **256MB RAM / 512MB storage**, including multiple WhatsApp sessions on one box.

> 🧞 **Want the full feature set** — video/audio tools, movies, subtitles, AI chatbot, Telegram downloader, 150+ commands? Use the main bot: **https://github.com/themalik-g/al-jin-whatsapp-bot**
> Lite is for when your server can't afford the extra RAM/CPU that media processing needs.

---

## What's in Lite vs Main

| | Lite | Main |
|---|---|---|
| Dependencies | 9 | 20+ |
| RAM for one session | ~50–100MB | 200MB+ |
| ffmpeg / yt-dlp / OCR | ❌ none | ✅ |
| Media stored on disk | ❌ never | temp only, swept |
| Multi-session on one box | ✅ (RAM auto-split) | ✅ |
| Anti-delete / view-once relay | ✅ | ✅ |
| Group admin, AI chat, downloaders | ✅ (lightweight ones) | ✅ (full set) |
| CPU/RAM governor, disk guard | ✅ | ✅ |
| Stealth mode (offline by default) | ✅ | ✅ |

If a command needs ffmpeg, OCR, PDF rendering, subtitles, or yt-dlp, it isn't in Lite — that's the entire point. Everything else from the main bot that runs on plain JS/Baileys/sharp is fair game here and gets ported over as it's needed.

---

## Quick start

### One-click (Windows / Termux / Linux / macOS) — no Node.js install required
```bash
curl -fsSL -o aljin.sh https://raw.githubusercontent.com/themalik-g/al-jin-lite/main/aljin.sh
bash aljin.sh
```
This downloads a private Node.js if you don't have one, asks for your WhatsApp number once, shows the pairing code, and restarts the bot automatically if it crashes. Re-run the same command any time to resume — your session is kept.

### npm
```bash
npm install
npm start            # single session, asks for pairing code on first run
# or
node index.js        # multi-session launcher: link more than one number, auto-restart, RAM-aware
```

### PM2 (recommended for a VPS)
```bash
npm install
pm2 start ecosystem.config.cjs
pm2 logs
```

### Docker
```bash
docker build -t al-jin-lite .
docker run -d --name al-jin-lite \
  -v $(pwd)/session:/app/session \
  -v $(pwd)/state:/app/state \
  --memory=256m \
  al-jin-lite
```
The image defaults to a 200MB V8 heap so it fits inside a 256MB container with headroom for Node's own baseline. One session per container is the Docker pattern — run another container for a second number.

### Procfile (Railway / Render / Koyeb / Heroku-style platforms)
A `Procfile` (`worker: node index.js`) is included — most platforms detect it automatically.

Node ≥ 20 is required everywhere.

---

## 🔑 Deploy with a Session ID (no pairing on the server)

Link once on the Jin pairing site, get a `JIN_...` Session ID, and any host can start Lite with it. No pairing code is asked again, and no extra dependency is added.

Set `SESSION_ID` (and `SESSION_API`) as a panel variable, in `.env`, at the top of `index.js`, or run `node index.js --session-id=JIN_...`. Launchers downloaded from the pairing site already contain both. Guide: [Session ID](docs/session-id.md).

## Dependencies (9, no new ones added by this update)
`@whiskeysockets/baileys`, `@hapi/boom`, `@cacheable/node-cache`, `@postfetch/core`, `awesome-phonenumber`, `dotenv`, `p-queue`, `pino`, **`sharp`** (the only image library — no jimp, no canvas).

---

## Resource tuning (built for small VPS boxes)

### Multi-session RAM budget
Sessions run as `worker_threads` grouped into **pods** (processes) rather than one OS process per session — by default every 4 sessions (`WRAITH_SESSIONS_PER_POD`) share one process's Node/V8 baseline memory instead of each paying for it separately. `index.js` (the multi-session launcher) auto-detects your box's real RAM (container/cgroup-aware) and splits it across every session, instead of giving each one the full heap size:

```bash
# .env or environment — leave unset to auto-detect from the box/container
WRAITH_RAM_BUDGET_MB=220          # total RAM the bot may use
WRAITH_SESSIONS_PER_POD=4         # sessions sharing one pod process (1 = old one-process-per-session)
```
Override a single session's heap with `WRAITH_MAX_OLD_SPACE_SIZE` if you need an exact number instead of the auto-split.

**Trade-off:** a pod sharing N sessions means a hard crash of the pod process itself (rare — a native-addon fault, a stack overflow) takes all N sessions down together, restarting together; one session's own WhatsApp-level errors never affect its pod-mates. Set `WRAITH_SESSIONS_PER_POD=1` for the old full-isolation behavior if you'd rather trade the RAM savings for that.

The `.cpulimit`/`.ramlimit` governor reads this *process's* own CPU/RAM usage, which in pod mode is shared by every session hosted in that pod — so it now acts pod-wide rather than precisely per-session. The hard per-session memory ceiling still comes from `WRAITH_RAM_BUDGET_MB` (enforced via each worker's own V8 heap limit), regardless.

### Live commands (owner only)
| Command | Does |
|---|---|
| `.cpulimit 0.30` / `.cpulimit auto` / `.cpulimit off` | Cap the bot's CPU use (cores, %, or auto from the server's cgroup quota) |
| `.ramlimit 512` / `.ramlimit 512 restart` | RAM ceiling in MB, optionally auto-restart if stuck over it |
| `.disk` | Free space, temp-folder location, and per-send disk reservation |
| `.disk reserve 100` / `.disk limit 3gb` | Always keep this much free / cap one send's disk use |
| `.dlcap 300mb` | Cap the size of one download |

These are zero extra dependencies — pure Node + `/proc`/cgroup reads.

---

## Stealth mode (default)

Lite stays invisible unless you turn something on:

| Behaviour | Default |
|---|---|
| Shows "online" | ❌ off |
| Marks statuses as seen | ❌ off (`.lurk on` to enable) |
| Reacts to statuses | ❌ off (`.lurk react on` to enable) |
| Blue ticks / read receipts | ❌ off |
| Auto typing / recording indicator | ❌ off |
| Auto-react in every chat (`.reactall`) | ❌ off, owner-controlled |
| Saves statuses silently (no "seen" sent) | ✅ on |

---

## New in this update

- **CPU/RAM governor** (`.cpulimit`, `.ramlimit`) + **disk guard** (`.disk`, `.dlcap`) — ported from the main bot, zero new dependencies.
- **Multi-session RAM auto-split** in `index.js` — see [Resource tuning](#resource-tuning-built-for-small-vps-boxes) above.
- **Group guard pack**: `.muteuser`, `.unmuteuser`, `.mutelist`, `.mutesticker`, `.unmutesticker`, `.antiforward`, `.dnd` — admin-level, no extra dependency.
- **`.reactall`** — owner-controlled auto-react in every chat, off by default (stealthy).
- **`.fixkeys`** — fixes "Waiting for this message" on your own phone by dropping stale signal sessions, without re-pairing.
- **Stealth-by-default fix**: status auto-view/auto-react now default to **off** (previously on), matching the main bot's documented stealth mode.
- **One-click deploy**: `aljin.sh`, `Procfile`, tuned `Dockerfile`/`ecosystem.config.cjs` for a 256MB/512MB box.
- Lazy-loaded command modules (already in place) keep cold-start RAM low; nothing here removes that.

See `FIX-NOTES.md` for the full file-level changelog.

---

## Configuration

Copy `.env.example` to `.env` and fill in what you need — everything has a sane default. Key knobs:

```bash
WRAITH_PHONE=                  # your number, or leave empty to be asked
WRAITH_RAM_BUDGET_MB=220       # total RAM across all sessions (see Resource tuning)
WRAITH_MSG_STORE_MAX=400       # in-RAM retry cache size
WRAITH_LOG_LEVEL=silent        # warn/error/info/debug while diagnosing
```

---

## Support & links

- Full-feature bot: https://github.com/themalik-g/al-jin-whatsapp-bot
- Issues / questions: open an issue on this repo, or see the main bot's [docs](https://github.com/themalik-g/al-jin-whatsapp-bot/tree/main/docs) — most of it (stealth, JID system, deployment) applies to Lite too.

License: MIT
