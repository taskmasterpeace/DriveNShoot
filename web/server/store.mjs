// The shard's file-backed store: four JSON files in one gitignored folder (default web/server/data/).
//   accounts.json    users: { name: { pw, created, lastLogin, chars: [id] } }        (pw is a scrypt string)
//   sessions.json    { sha256(token): { user, exp } }                                 (never the token itself)
//   characters.json  byId: { id: { id, account, name, flag, look, created, lastSeen, played, data } }
//   world.json       the shared world that outlives every session (see emptyWorld)
// Each file is written whole to a temp file and renamed over the old one, so a crash mid-write leaves the last good
// copy. Writes are batched: a change marks its file dirty and the flush runs within `flushMs` (and on shutdown).
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function emptyWorld() {
  return {
    v: 1,
    created: new Date().toISOString(),
    interiors: { d: {}, w: {} },  // doors (locks kicked in: l, h, k) and windows (state, glass hp, boards, side) by row id
    deadNpcs: {},                // named people killed for good: npc id -> { name, by, at }
    claims: {},                  // house claims: building key -> { char, name, flag, label, x, z, at }
    takenVehicles: {},           // the town's own cars that somebody drove off in: seed vehicle id -> char id
    standings: {},               // each character's standing with every faction (their notoriety, mirrored for the shard)
    chronicle: [],               // the shard's record of what players did: { at, char, name, verb, target, place, x, z }
    stats: { logins: 0, saves: 0, patches: 0 },
  };
}

export class Store {
  constructor(dir, { flushMs = 2000, log = () => {} } = {}) {
    this.dir = dir;
    this.flushMs = flushMs;
    this.log = log;
    mkdirSync(dir, { recursive: true });
    this.accounts = this.read('accounts.json', { users: {} });
    this.sessions = this.read('sessions.json', {});
    this.chars = this.read('characters.json', { byId: {} });
    this.world = { ...emptyWorld(), ...this.read('world.json', emptyWorld()) };
    this.dirty = new Set();
    this.timer = null;
    this.pruneSessions();
  }

  read(file, fallback) {
    const p = join(this.dir, file);
    if (!existsSync(p)) return fallback;
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) {
      this.log(`[store] ${file} unreadable (${e.message}); starting it fresh, the old file kept as ${file}.bad`);
      try { renameSync(p, `${p}.bad`); } catch {}
      return fallback;
    }
  }

  write(file, obj) {
    const p = join(this.dir, file), tmp = `${p}.tmp`;
    writeFileSync(tmp, JSON.stringify(obj));
    renameSync(tmp, p);
  }

  mark(...files) {
    for (const f of files) this.dirty.add(f);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.flushMs);
  }

  flush() {
    clearTimeout(this.timer); this.timer = null;
    const map = { 'accounts.json': this.accounts, 'sessions.json': this.sessions, 'characters.json': this.chars, 'world.json': this.world };
    for (const f of this.dirty) this.write(f, map[f]);
    const n = this.dirty.size;
    this.dirty.clear();
    return n;
  }

  // Everything, now (shutdown, and the periodic world save).
  flushAll() { for (const f of ['accounts.json', 'sessions.json', 'characters.json', 'world.json']) this.dirty.add(f); return this.flush(); }

  pruneSessions() {
    const now = Date.now();
    for (const [k, s] of Object.entries(this.sessions)) if (!(s.exp > now)) delete this.sessions[k];
  }

  user(name) { return this.accounts.users[name] ?? null; }
  charsOf(name) { return (this.user(name)?.chars ?? []).map((id) => this.chars.byId[id]).filter(Boolean); }
  charByName(name) { const n = name.toLowerCase(); return Object.values(this.chars.byId).find((c) => c.name.toLowerCase() === n) ?? null; }
}
