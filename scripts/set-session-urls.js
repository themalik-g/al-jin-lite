#!/usr/bin/env node
// Usage:  node scripts/set-session-urls.js <PAIRING_SITE_URL> <WORKER_URL>
// e.g.    node scripts/set-session-urls.js https://jin-session.me.workers.dev https://jin-session.me.workers.dev
// Puts your addresses where they belong, so users only need a SESSION_ID:
//   README.md            → the "Get pairing code" button link
//   index.js             → const SESSION_API   (address of the session store)
//   lib/session-id.js    → const DEFAULT_API   (same, for `node start.js` / npm start)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clean = (u) => String(u || '').trim().replace(/\/+$/, '');
const site = clean(process.argv[2]), api = clean(process.argv[3]);
if (!/^https:\/\/\S+$/.test(site) || !/^https:\/\/\S+$/.test(api)) {
  console.log('Usage: node scripts/set-session-urls.js <PAIRING_SITE_URL> <WORKER_URL>   (both must start with https://)');
  process.exit(1);
}
const edit = (file, fn) => {
  const f = path.join(ROOT, file); let s = fs.readFileSync(f, 'utf8'); const o = fn(s);
  if (o === s) return console.log(`= ${file}: nothing to change`);
  fs.writeFileSync(f, o); console.log(`✓ ${file}`);
};
edit('README.md', (s) => s.replace(/\]\(https:\/\/YOUR-PAIRING-SITE-URL\)/g, `](${site})`).replace(/(<a href=")(?:https:\/\/YOUR-PAIRING-SITE-URL|[^"]*)("><img src="assets\/get-session-id\.svg")/g, `$1${site}$2`));
edit('index.js', (s) => s.replace(/const SESSION_API = '[^']*';/, `const SESSION_API = '${api}';`));
edit('lib/session-id.js', (s) => s.replace(/const DEFAULT_API = '[^']*';/, `const DEFAULT_API = '${api}';`));
console.log('\nDone. Commit and push these 3 files + assets/get-session-id.svg to GitHub.');
