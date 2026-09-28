// Time-based one-time passwords (RFC 6238) for two-factor admin login.
// Compatible with Google Authenticator, Microsoft Authenticator, 1Password…
import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateSecret = () => base32Encode(crypto.randomBytes(20));

function hotp(key, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0xf;
  const bin = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 1_000_000).padStart(6, '0');
}

const STEP = 30;
export const currentCounter = () => Math.floor(Date.now() / 1000 / STEP);

/**
 * Check a 6-digit code, allowing one step of clock drift either way.
 * Returns the matching counter (to block reuse of the same code), or -1.
 */
export function verifyTotp(secret, code, lastUsedCounter = -1) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.replace(/\s/g, ''))) return -1;
  const want = Buffer.from(code.replace(/\s/g, ''));
  const key = base32Decode(secret);
  const now = currentCounter();
  let match = -1;
  for (const c of [now - 1, now, now + 1]) {
    // compare every candidate so timing doesn't depend on which one matched
    if (crypto.timingSafeEqual(Buffer.from(hotp(key, c)), want) && c > lastUsedCounter) match = c;
  }
  return match;
}

export const otpauthUri = (secret, account, issuer = 'LUMI') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;
