// The shard's wire rules, shared by the server (web/server/shard.mjs) and the page (src/net/shard.js).
// Plain data and pure functions only: Node imports this file as it is.
//
// Messages are JSON objects with a type `t`. Client -> server:
//   register {user, pass} | login {user, pass} | resume {token} | signout
//   chars | newChar {name, flag} | enter {char} | leave
//   p {x, z, y, f, s, w, a, hp, v?}          presence, ~15 Hz
//   save {data}                               the character's own state (position, pack, needs, money, standing, car, house)
//   world {patch}                             a change to the shared world (doors, windows, a named death, a deed)
//   claim {key, label, x, z} | unclaim        a house claim
// Server -> client:
//   hello {shard, v, online} | auth {user, token, chars} | chars {chars} | entered {char, world, players}
//   s {ts, p:[...]}                           everyone else's presence, ~15 Hz
//   join {player} | gone {id} | world {patch, by} | claimed {key, claim} | saved {at} | kicked {why} | err {code, msg, re}

export const PROTOCOL = 1;
export const SHARD_PORT = 3280;
export const SHARD_PATH = '/shard';

export const LIMITS = {
  userMin: 3, userMax: 16,
  passMin: 8, passMax: 128,
  nameMin: 2, nameMax: 16,
  charsPerAccount: 3,
  saveBytes: 256 * 1024,      // one character's saved state
  patchBytes: 64 * 1024,      // one world change
  messageBytes: 300 * 1024,   // anything at all
  presenceHz: 15,             // what the page sends, and how often the shard sends everyone else back
  chronicleKeep: 1000,        // the shard's own record of deeds
};

// Lowercase letters, digits and underscore: what goes in a login box and in a file name.
export function cleanUser(u) {
  const s = String(u ?? '').trim().toLowerCase();
  return /^[a-z0-9_]+$/.test(s) && s.length >= LIMITS.userMin && s.length <= LIMITS.userMax ? s : null;
}

export function cleanPass(p) {
  const s = typeof p === 'string' ? p : '';
  return s.length >= LIMITS.passMin && s.length <= LIMITS.passMax ? s : null;
}

// A character's name: a letter first, then letters, digits, a space, an apostrophe or a hyphen (shown over their head).
export function cleanName(n) {
  const s = String(n ?? '').trim().replace(/\s+/g, ' ');
  return /^[A-Za-z][A-Za-z0-9 '-]*$/.test(s) && s.length >= LIMITS.nameMin && s.length <= LIMITS.nameMax ? s : null;
}

// Flags the page can draw (ui/portrait.js FLAGS): everybody is from somewhere, and it shows.
export const FLAG_CODES = ['US', 'MX', 'CA', 'CU', 'JM', 'IE', 'NG', 'IT', 'DE', 'CO', 'HT', 'GH', 'JP', 'VN', 'PH', 'KR', 'BR', 'PR'];
export const cleanFlag = (f) => (FLAG_CODES.includes(String(f ?? '').toUpperCase()) ? String(f).toUpperCase() : null);

const fin = (n, lim = 1e6) => (typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= lim ? n : null);
const word = (s, max = 24) => (typeof s === 'string' && s.length <= max && /^[A-Za-z0-9_:.-]*$/.test(s) ? s : null);
const paint = (s) => (typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s) ? s : null);

// One presence sample, trimmed to what the shard relays. Returns null when it is not one.
export function cleanPresence(m) {
  const x = fin(m?.x), z = fin(m?.z);
  if (x === null || z === null) return null;
  const out = { x: r2(x), z: r2(z), y: r2(fin(m.y, 500) ?? 0), f: r2(fin(m.f, 100) ?? 0), s: r2(fin(m.s, 200) ?? 0), w: word(m.w) ?? null, a: m.a ? 1 : 0, hp: Math.round(fin(m.hp, 10000) ?? 100), d: m.d ? 1 : 0 };
  if (m.v && typeof m.v === 'object') {
    const vx = fin(m.v.x), vz = fin(m.v.z), t = word(m.v.t);
    if (vx !== null && vz !== null && t) out.v = { t, x: r2(vx), z: r2(vz), h: r2(fin(m.v.h, 100) ?? 0), c: paint(m.v.c) ?? '#6a2a1a', seat: Math.max(0, Math.min(8, Math.round(fin(m.v.seat, 8) ?? 0))) };
  }
  return out;
}
const r2 = (v) => Math.round(v * 100) / 100;

// A house claim's key: an island building by index, or a Phoenix ring building by its id.
export const cleanClaimKey = (k) => (typeof k === 'string' && /^(isle|ring):[A-Za-z0-9_.:-]{1,40}$/.test(k) ? k : null);
