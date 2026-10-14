// ─────────────────────────────────────────────
//  Al-Jin · lib/pair-codes.js
//  Custom (readable) pairing codes: ALMEHTAB, A1MEHTAB, A1M3HTAB …
//
//  WhatsApp pairing codes are 8 characters from the Crockford alphabet:
//      1 2 3 4 5 6 7 8 9 A B C D E F G H J K L M N P Q R S T V W X Y Z
//  → the letters I, O, U and the digit 0 can NOT be used (use 1 for I/L, 8 for B, … 3 for E, 7 for T).
//
//  Order tried (each failed attempt moves to the next one, the last resort is Baileys' random code):
//      1. WRAITH_PAIR_CODES / AL_JIN_PAIR_CODES  (comma separated, your own list)
//      2. built-in list below
//  Turn it off with  WRAITH_PAIR_CODES=off
// ─────────────────────────────────────────────

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTVWXYZ';
const BASE = 'ALMEHTAB';
// letter → look-alike digit used in the variants (only these three, as requested)
const LEET = { L: '1', E: '3', T: '7' };

export const isValidPairCode = (c) =>
  typeof c === 'string' && c.length === 8 && [...c].every((ch) => ALPHABET.includes(ch));

/** ALMEHTAB, A1MEHTAB, A1M3HTAB, A1MEH7AB, then every other L/E/T combination. */
export function builtInCodes() {
  const slots = [...BASE].map((ch, i) => (LEET[ch] ? { i, ch, alt: LEET[ch] } : null)).filter(Boolean);
  const out = [];
  for (let mask = 0; mask < 1 << slots.length; mask++) {
    const chars = [...BASE];
    slots.forEach((s, k) => { if (mask & (1 << k)) chars[s.i] = s.alt; });
    out.push({ code: chars.join(''), bits: mask.toString(2).split('1').length - 1, mask });
  }
  const first = ['ALMEHTAB', 'A1MEHTAB', 'A1M3HTAB', 'A1MEH7AB'];   // the order you asked for
  const rest = out.map((o) => o.code).filter((c) => !first.includes(c));
  return [...first, ...rest];
}

export function pairCodeCandidates() {
  const raw = process.env.WRAITH_PAIR_CODES ?? process.env.WRAITH_PAIR_CODE ?? '';
  if (/^(off|none|0|false)$/i.test(raw.trim())) return [];
  const mine = raw.split(/[,\s]+/).map((c) => c.replace(/[^A-Za-z0-9]/g, '').toUpperCase()).filter(Boolean);
  const bad = mine.filter((c) => !isValidPairCode(c));
  if (bad.length) { try { console.warn(`[pair-code] ignored (must be 8 chars from ${ALPHABET}): ${bad.join(', ')}`); } catch {} }
  const list = [...mine.filter(isValidPairCode), ...builtInCodes()];
  return [...new Set(list)];
}

/**
 * Asks WhatsApp for a pairing code, using the custom code for this attempt.
 * Returns { code, custom } — `custom` is false when Baileys ignored it or none are left (random code).
 */
export async function requestPairCode(sock, number, attempt = 0) {
  const candidates = pairCodeCandidates();
  const wanted = candidates[attempt];
  const supported = typeof sock.requestPairingCode === 'function' && sock.requestPairingCode.length >= 2;

  if (!wanted || !supported) {
    if (wanted && !supported) {
      try { console.warn('[pair-code] this Baileys build has no custom pairing code support — run: node scripts/apply-pairing-patch.js'); } catch {}
    }
    return { code: await sock.requestPairingCode(number), custom: false };
  }

  const code = await sock.requestPairingCode(number, wanted);
  const same = String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase() === wanted;
  if (!same) { try { console.warn(`[pair-code] asked for ${wanted} but Baileys returned ${code} — patch not active`); } catch {} }
  return { code, custom: same };
}
