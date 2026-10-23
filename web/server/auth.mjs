// Passwords and session tokens for the shard.
//   Passwords: scrypt (Node's crypto) with a fresh 16-byte salt per user; only "scrypt$N$r$p$salt$hash" is stored.
//   Tokens: 32 random bytes, handed to the page once; the shard keeps only their SHA-256 (a stolen sessions file
//   logs nobody in).
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

const N = 16384, R = 8, P = 1, KEYLEN = 64; // ~16 MB and ~50 ms a hash on a desktop: slow for a guesser, fine for a login
export const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000;

const scryptP = (pass, salt, n, r, p) => new Promise((ok, fail) =>
  scrypt(pass, salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (e, key) => (e ? fail(e) : ok(key))));

export async function hashPassword(pass) {
  const salt = randomBytes(16);
  const key = await scryptP(pass, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function checkPassword(pass, stored) {
  const [kind, n, r, p, salt, hash] = String(stored ?? '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = await scryptP(pass, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return got.length === want.length && timingSafeEqual(got, want);
}

// A login against a user that does not exist still pays for one hash, so timing does not say who has an account.
let dummy = null;
export async function burnHash(pass) { dummy ??= await hashPassword('not-a-real-password'); await checkPassword(pass ?? '', dummy); return false; }

export const newToken = () => randomBytes(32).toString('base64url');
export const tokenKey = (token) => createHash('sha256').update(String(token)).digest('hex');
export const newId = (prefix) => `${prefix}${randomBytes(6).toString('hex')}`;

// Failed logins per username and attempts per address: a slow trickle only.
export class Throttle {
  constructor({ fails = 5, windowMs = 5 * 60 * 1000, lockMs = 60 * 1000, perIpPerMin = 30 } = {}) {
    Object.assign(this, { fails, windowMs, lockMs, perIpPerMin });
    this.byUser = new Map(); // user -> { n, first, until }
    this.byIp = new Map();   // ip -> { n, first }
  }
  // null when allowed, else the seconds to wait.
  check(user, ip) {
    const now = Date.now();
    const a = this.byIp.get(ip);
    if (a && now - a.first < 60000 && a.n >= this.perIpPerMin) return Math.ceil((60000 - (now - a.first)) / 1000);
    const u = user && this.byUser.get(user);
    if (u?.until > now) return Math.ceil((u.until - now) / 1000);
    return null;
  }
  attempt(ip) {
    const now = Date.now(), a = this.byIp.get(ip);
    if (!a || now - a.first >= 60000) this.byIp.set(ip, { n: 1, first: now }); else a.n++;
  }
  fail(user) {
    const now = Date.now();
    let u = this.byUser.get(user);
    if (!u || now - u.first > this.windowMs) { u = { n: 0, first: now, until: 0 }; this.byUser.set(user, u); }
    if (++u.n >= this.fails) { u.until = now + this.lockMs; u.n = 0; u.first = now; }
  }
  ok(user) { this.byUser.delete(user); }
}
