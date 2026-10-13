# Al-Jin Lite — fix notes

Base: your OLD working lite archive. Only the files below differ from it.

CHANGED:  core/settings.js  lib/buttons.js  lib/poll.js  modules/details.js
          modules/forward.js  modules/help.js  modules/location.js  modules/ping.js
          router.js  start.js
NEW:      lib/sysinfo.js  lib/fakequote.js

Delete from the broken "al-jin-lite-main (2)" if you keep using it as base:
  lib/pollmode.js   test/   CHANGES.md
and replace router.js + start.js (they came from a different, bigger build).
Keep package-lock.json from the old archive. No new npm packages needed.

Env (optional): AL_JIN_POLL_TTL_MS (poll lifetime, default 60000),
                WRAITH_FAKE_QUOTE_JID (verified JID used for the menu's status quote).

## Update 2 + 3 (combined)
CHANGED (replace 5 files): lib/buttons.js  lib/sysinfo.js  modules/help.js  modules/details.js  router.js
- Forwarded-channel label opens the channel (serverMessageId -1). Optional env AL_JIN_CHANNEL_MSG_ID = id of a real channel post.
- Menu is always ONE message. New .imenu off (default, text) | on (image + caption) | preview (text + large preview card).
- Platform parts each on their own "│" line.

## Update 4 — resource governor, guard pack, stealth defaults, one-click deploy
NEW:      core/limiter.js  core/limits.js  core/session-repair.js
          modules/disk.js  modules/limits.js  modules/dlcap.js
          lib/guard-core.js  lib/disk-info.js  modules/x-guard.js
          modules/x-react.js  modules/x-repair.js
          aljin.sh  Procfile  .dockerignore  .env.example
CHANGED:  modules/lurk.js (stealth defaults: status auto-view/react now OFF by default)
          lib/sysinfo.js (export cgCpuCores, already implemented, was unexported)
          modules/x-registry.js  modules/x-hooks.js (wired guard/react/repair into the extras pack)
          router.js (new .disk/.cpulimit/.ramlimit/.dlcap commands + CPU/RAM wait-gate)
          start.js (wire core/session-repair.js — runs before Baileys loads keys)
          index.js (multi-session RAM auto-split via WRAITH_RAM_BUDGET_MB)
          modules/help.js (new "RESOURCES & GUARD" menu section)
          ecosystem.config.cjs, Dockerfile (tuned for a 256MB RAM / 512MB disk box)
REMOVED:  plan.txt (unrelated scratch notes, not part of the bot)
All ported files are zero-extra-dependency (same 9 packages as before).
Env: WRAITH_RAM_BUDGET_MB (total RAM across sessions, default 256),
     WRAITH_MAX_OLD_SPACE_SIZE / WRAITH_V8_SEMI_SPACE_SIZE (override auto-split).

## Update 5 — multi-session sharing + .delsession fix
NEW:      core/shared.js (cross-process JSON store: atomic write + lock + mtime cache, shared WA-version cache)
CHANGED:  core/paths.js (sharedPath/inShared → instances/_shared)  core/vars.js  core/settings.js
          core/limiter.js  core/jid-resolver.js  index.js  start.js  modules/owner.js  .env.example
SHARED by every session now (instances/_shared/):
  vars.json         API keys / .setvar values (GEMINI_API_KEY …) — set once, all sessions see it
  settings.json     prefix, reply mode, imenu, .cpulimit/.ramlimit/.dlcap/.disk, tmp dir …
  channel-cache.json  newsletter/channel cache (same for every account)
  wa-version.json   WhatsApp-web version fetched once per 6 h instead of once per session per (re)connect
  .compile-cache/   one V8 compile cache for all session processes (faster boot, Node >= 22.1)
  Old per-session vars.json / settings.json / channel-cache.json are merged in once (shared value wins,
  missing keys are copied) and renamed *.migrated.
CPU/RAM limits are BOX totals: .cpulimit / .ramlimit are divided by the number of running sessions
  (launcher pushes the live count over IPC). A change made in one session is applied by all within ~20 s.
Sessions start staggered (WRAITH_SPAWN_STAGGER_MS, default 2500) instead of all at once.
STAYS per-session on purpose: creds/keys (session/), owner, presence, ghost/peek/spy/lurk, group warns/welcome,
  message logs, anti-delete destination — mixing these between different accounts would be a conflict.
.delsession FIXED:
  - old: folder deleted while the process was alive; its clean exit (code 0) looked like "restart for update"
    so the launcher respawned it and re-created the folder → session came back.
  - now: launcher tells the session to log out (device is unlinked from WhatsApp), waits for the process
    to exit (SIGKILL after 9 s), THEN deletes the folder; deleted ids are never auto-restarted, pending
    retry timers are ignored, ids are validated (no ../ tricks, "_shared" protected).
  - the session being removed no longer tries to re-pair after the logout.
Also fixed: .getpair temp dir and .chatstats read the repo-root /state instead of the session's own state.
