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
