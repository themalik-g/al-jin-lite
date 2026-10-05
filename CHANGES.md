# Al-Jin — changed files (copy over your project, same folder structure)

Built against the project zip you uploaded last (identical to the original Al-Jin build).

| File | What changed |
|---|---|
| modules/forward.js | FIXED: bad import (`resolveJid` doesn't exist) crashed it. Native forward of replied text/media to number/JID/LID |
| modules/ping.js | `.ping` = ms only. NEW `.cpu` `.gpu` `.ram` `.rom`. Uptime from real process start |
| modules/help.js | Menu info block (prefix/user/time/day/date/version/commands/ram/uptime/platform), quoted on blue-tick WhatsApp Business status |
| modules/group.js | FIXED: `.tagallnoadmin` / `.hidetagnoadmin` were wired in router but never written (crashed) |
| lib/buttons.js | qadeer-btns and buttons mode REMOVED completely (no import, no fallback). Reply modes: `text` or `poll` only. Proper "forwarded from channel" context (fresh object per message) |
| lib/pollmode.js | NEW: multi-select poll; each newly ticked option runs its command; poll deleted after 2 min |
| core/settings.js | reply mode is `text` (default) or `poll`; an old saved `buttons` value becomes `text` |
| router.js | routes .cpu/.gpu/.ram/.rom, poll votes, `.replymode text|poll` |
| modules/details.js, test/buttons.test.js | `.replymode` help text and the test updated for text|poll |
| start.js, modules/location.js, modules/media.js | use fresh channel-forward context |

Optional: run `npm uninstall @qadeerxtech/qadeer-btns` — nothing imports it anymore.
Optional: root `noaction.js` is an unused old duplicate of modules/noaction.js — safe to delete.
