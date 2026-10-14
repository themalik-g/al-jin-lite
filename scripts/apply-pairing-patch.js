// ─────────────────────────────────────────────
// Al-Jin · scripts/apply-pairing-patch.js
// Adds custom pairing-code support (requestPairingCode(number, "ALMEHTAB")) to a Baileys build that
// does not have it yet — the same feature the mybaileys-wa / @arceos/baileys forks ship.
//
// Safe by design (same rules as apply-baileys-patch.js):
//   • does nothing when Baileys already supports a custom code (upstream rc.9+ does)
//   • only edits when the known code-generation line is found; otherwise it just reports and skips
//   • keeps a backup (socket.js.pairing.orig); undo with  --revert
//   • never throws / never fails npm install
// Manual run:  node scripts/apply-pairing-patch.js
// ─────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'socket.js');
const BACKUP = `${TARGET}.pairing.orig`;
const MARKER = 'ALJIN-PATCH:CUSTOM-PAIRING-CODE';

const say = (m) => console.log(`[pairing-patch] ${m}`);

function patch(src) {
  // 1) the function signature → accept a second argument
  const sig = /requestPairingCode\s*=\s*async\s*\(\s*phoneNumber\s*\)\s*=>\s*\{/;
  // 2) the line that makes the random code
  const gen = /authState\.creds\.pairingCode\s*=\s*bytesToCrockford\(\s*randomBytes\(\s*5\s*\)\s*\)\s*;/;
  if (!sig.test(src) || !gen.test(src)) return null;
  return src
    .replace(sig, 'requestPairingCode = async (phoneNumber, customPairingCode) => {')
    .replace(gen, [
      `// ${MARKER}`,
      'if (customPairingCode && !/^[1-9A-HJ-NP-TV-Z]{8}$/.test(String(customPairingCode).toUpperCase())) {',
      "    throw new Error('Custom pairing code must be 8 characters from 1-9 A-H J-N P-T V-Z (no 0, I, O, U)');",
      '}',
      'authState.creds.pairingCode = customPairingCode ? String(customPairingCode).toUpperCase() : bytesToCrockford(randomBytes(5));',
    ].join('\n    '));
}

function main() {
  if (!fs.existsSync(TARGET)) return say('Baileys is not installed yet — skipped.');

  if (process.argv.includes('--revert')) {
    if (!fs.existsSync(BACKUP)) return say('no backup found — nothing to revert.');
    fs.copyFileSync(BACKUP, TARGET);
    return say('reverted.');
  }

  const src = fs.readFileSync(TARGET, 'utf8');
  if (src.includes(MARKER)) return say('already applied.');
  if (/customPairingCode/.test(src)) return say('this Baileys already supports custom pairing codes — nothing to do.');

  const out = patch(src);
  if (!out) return say('pairing code function not recognised in this Baileys build — skipped to stay safe.');

  if (!fs.existsSync(BACKUP)) fs.writeFileSync(BACKUP, src);
  fs.writeFileSync(TARGET, out);
  say('applied: requestPairingCode(number, customCode) now works. Restart the bot.');
}

try { main(); } catch (e) { say(`skipped (${e?.message || e})`); }
