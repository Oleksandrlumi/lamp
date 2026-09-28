// Admin authentication: scrypt password hashes, server-side sessions,
// CSRF tokens and brute-force protection.
import crypto from 'node:crypto';

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64, maxmem: 128 * 1024 * 1024 };

const scrypt = (password, salt, { N, r, p, keylen }) =>
  new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, keylen, { N, r, p, maxmem: SCRYPT.maxmem }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );

// Format: scrypt:N:r:p:saltBase64:hashBase64
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join(':');
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    // Still spend the same time so a bad config can't be detected by timing.
    await scrypt(password, 'invalid', SCRYPT);
    return false;
  }
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    keylen: expected.length,
  });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// Constant-time string comparison (lengths are hidden by hashing first).
export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/* ---------------- Sessions ---------------- */

const IDLE_MS = 2 * 60 * 60 * 1000; // log out after 2 hours of inactivity
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // and after 12 hours at most
const MAX_SESSIONS = 20;
const sessions = new Map();

export function createSession(user, ip) {
  const id = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  sessions.set(id, { user, ip, csrf: crypto.randomBytes(32).toString('base64url'), created: now, seen: now });
  if (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].seen - b[1].seen)[0][0];
    sessions.delete(oldest);
  }
  return id;
}

export function getSession(id) {
  if (!id) return null;
  const s = sessions.get(id);
  if (!s) return null;
  const now = Date.now();
  if (now - s.seen > IDLE_MS || now - s.created > MAX_AGE_MS) {
    sessions.delete(id);
    return null;
  }
  s.seen = now;
  return s;
}

export const destroySession = (id) => sessions.delete(id);
export const destroyAllSessions = () => sessions.clear();

/* ---------------- Brute-force protection ---------------- */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_IP = 5; // then that IP is locked for 15 minutes
const MAX_FAILS_GLOBAL = 30; // then all logins are locked for 15 minutes
const failsByIp = new Map();
let globalFails = [];

const prune = (list, now) => list.filter((t) => now - t < WINDOW_MS);

export function loginBlocked(ip) {
  const now = Date.now();
  globalFails = prune(globalFails, now);
  const ipFails = prune(failsByIp.get(ip) || [], now);
  failsByIp.set(ip, ipFails);
  if (ipFails.length >= MAX_FAILS_PER_IP) return Math.ceil((WINDOW_MS - (now - ipFails[0])) / 60000);
  if (globalFails.length >= MAX_FAILS_GLOBAL) return Math.ceil((WINDOW_MS - (now - globalFails[0])) / 60000);
  return 0;
}

export function recordLoginFailure(ip) {
  const now = Date.now();
  failsByIp.set(ip, [...prune(failsByIp.get(ip) || [], now), now]);
  globalFails.push(now);
}

export const clearLoginFailures = (ip) => failsByIp.delete(ip);
