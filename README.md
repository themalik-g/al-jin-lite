# Al-Jin Lite

Ultra-light edition of the Al-Jin WhatsApp bot (Baileys v7). **No ffmpeg, no yt-dlp, no OCR/PDF/PPT, no media on disk.**

## Install
```bash
npm install
npm start          # first run: pairing code
```
Dependencies (9): baileys, boom, node-cache, postfetch, phonenumber, dotenv, p-queue, pino, **sharp** (only image library).
Node ≥ 20. Docker: `docker build -t al-jin-lite .`

## What is stored
| Kept | Gone |
|---|---|
| `session/` (login) | media vault, status store, pps sync |
| `state/*.json` (settings, tiny text ledger) | `msgstore.json` (message cache is RAM-only now) |
| `logs/` — text log of every message | media files in logs |

## Anti-delete without storage — `.ghost`
Every incoming media (chats, groups, statuses, view-once) is **relayed by reference** to a *destination chat* the moment it arrives. The bot never downloads it, never buffers it, never writes it. When someone deletes it, you get a text alert with who / when / what and **where + at what time the copy was saved**.

| Command | Meaning |
|---|---|
| `.ghost` | status |
| `.ghost on/off` · `.ghost edit on/off` | anti-delete · anti-edit |
| `.ghost relay on/off` | media relay on/off |
| `.ghost status on/off` | relay status stories |
| `.ghost labels on/off` | caption line after every relayed media (view-once always gets one) |
| `.ghost dest <number\|here\|me>` / `.setdest <number>` | destination (default: the bot's own chat) |
| `.ghost mode all\|selected` | all chats (default) or only chats switched on |
| `.ghost chat on/off [number]` · `.ghost chats` | per-chat switch / list |

Env tuning: `ALJIN_RELAY_GAP_MS` (default 350, pause between relays), `ALJIN_RELAY_MAX_MB` (default 150).

## Downloads (all streamed: network → WhatsApp, nothing on disk)
`.play` `.ytv/.video` `.ytdl` `.yt` `.mp3` (YouTube via ESM) · `.dl` `.pdl` `.ig` `.tiktok` `.fb` `.tw` `.reddit` `.threads` `.pin` (postfetch / ESM) · `.jindl` `.jinvideo` `.jinapk` `.apk`

## Images (sharp)
`.sticker/.s` (images) · `.toimg` · `.take` · `.stickercrop` · `.circle` · `.blur` · `.greyscale` · `.pixelate` · `.hd/.enhance` · `.sanitize` · `.hddp` · `.fulldp` · `.setpp` · `.setgpp` · Ephoto360 text effects (plain `fetch`)

## Removed (needed ffmpeg / heavy libs)
video/GIF stickers, `.tovid`, `.trim .tomp3 .vn .compress .8d .bassboost .robot .vocal .waveform`, `.speed .treble .reverse .pitch .avm .attp`, `.tts`, `.ocr`, `.barcode`, `.ppt`, `.pdf`, `.book`, `.web2img`, `.igzip`, `.pdlzip`, `.ytcookies`, button/reply-mode UI (plain text now).

## Security
`lib/esm-secrets.js` contains hard-coded ESM credentials and `.env` / `keys.env` hold your keys — rotate them and never publish this folder.
