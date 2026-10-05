# Al-Jin — changed files (copy over your project, same folder structure)

- modules/forward.js   — fixed (bad import `resolveJid` crashed the module); native forward of replied text/media to number/JID/LID
- modules/ping.js      — `.ping` shows ms only; new `.cpu` `.gpu` `.ram` `.rom`; uptime now counts from real process start
- modules/help.js      — menu info block (prefix, user, time, day, date, version, commands, ram, uptime, platform); sent as reply to a blue-tick "WhatsApp Business" status; new commands listed
- lib/buttons.js       — correct "forwarded from channel" context on every reply; `poll` reply mode
- lib/pollmode.js      — NEW: multi-select poll, every newly ticked option runs its command, poll deleted after 2 min
- core/settings.js     — reply mode accepts `poll`
- router.js            — .cpu/.gpu/.ram/.rom, poll-vote handling, `.replymode poll`
- start.js, modules/location.js, modules/media.js — use fresh channel-forward context

`.replymode poll` to enable. No new dependencies.
