// ─────────────────────────────────────────────
//  Al-Jin · PM2 ecosystem config
//  Usage: pm2 start ecosystem.config.cjs
// ─────────────────────────────────────────────
module.exports = {
    apps: [
        {
            name: 'al-jin',
            script: 'index.js',
            cwd: __dirname,
            interpreter: 'node',
            autorestart: true,
            watch: false,
            // index.js is the orchestrator; each WhatsApp session it spawns is its
            // own node child with --max-old-space-size set from WRAITH_RAM_BUDGET_MB
            // below, split across however many sessions are running. 200M here is a
            // safety net on the orchestrator itself for a 256MB-RAM box.
            max_memory_restart: '200M',
            restart_delay: 4000,
            max_restarts: 20,
            min_uptime: '30s',
            output: './logs/out.log',
            error: './logs/error.log',
            merge_logs: true,
            time: true,
            env: {
                NODE_ENV: 'production',
                // Total RAM (MB) the bot may use across the orchestrator + all sessions.
                // Lower this if your box has less than 256MB; raise it if you have more.
                WRAITH_RAM_BUDGET_MB: process.env.WRAITH_RAM_BUDGET_MB || '220',
            },
            kill_timeout: 5000,
            wait_ready: false,
            listen_timeout: 10000
        }
    ]
};
