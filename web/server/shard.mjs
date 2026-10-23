#!/usr/bin/env node
// DIVIDED STATES OF AMERICA - shard v0 (docs/design/WEB_SHARD.md).
//
//   node server/shard.mjs                       ws://localhost:3280/shard, data in server/data/
//   node server/shard.mjs --port 3280 --data <dir> --name "PHOENIX-1"
//   env: SHARD_PORT, SHARD_DATA, SHARD_NAME, SHARD_ORIGINS (comma list; when set, a page from any other origin is refused)
//
// What it is authoritative for: accounts (scrypt), sessions (hashed tokens), each account's characters and everything
// they carry, the shared world that outlives a session (locks kicked in, windows broken or boarded, house claims,
// named people killed for good, the town cars somebody drove off in, standings, the shard's chronicle), and presence
// (who is online, where, facing which way, holding what, in which car). What it is NOT authoritative for yet: the
// simulation. Each page simulates its own surroundings and reports its own player (authority model (a), WEB_SHARD §3.1).
//
// HTTP on the same port: GET /health (anyone; the page probes it), GET /who and GET /world (this machine only).
// Stop it with Ctrl+C, a line "stop" on stdin, or the IPC message "shutdown": every one flushes the store first.
import http from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Store } from './store.mjs';
import { hashPassword, checkPassword, burnHash, newToken, tokenKey, newId, Throttle, TOKEN_TTL_MS } from './auth.mjs';
import { PROTOCOL, SHARD_PORT, SHARD_PATH, LIMITS, cleanUser, cleanPass, cleanName, cleanFlag, cleanPresence, cleanClaimKey } from '../src/net/protocol.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const PORT = Number(arg('port') ?? process.env.SHARD_PORT ?? SHARD_PORT);
const DATA = arg('data') ?? process.env.SHARD_DATA ?? join(HERE, 'data');
const NAME = arg('name') ?? process.env.SHARD_NAME ?? 'PHOENIX-1';
const ORIGINS = (process.env.SHARD_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const AOI = 600;        // metres: presence is relayed between players this close (everyone is still on the who list)
const WARP = 120;       // m/s: faster than any rig on I-10 - counted as a warp (agents teleport; v0 logs, never refuses)

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const store = new Store(DATA, { log });
const throttle = new Throttle();
const sessions = new Set(); // every open connection
const started = Date.now();

// ---- helpers ----------------------------------------------------------------------------------------------------
const send = (S, msg) => { if (S.ws.readyState === 1) S.ws.send(JSON.stringify(msg)); };
const err = (S, code, msg, re) => send(S, { t: 'err', code, msg, re });
const inWorld = () => [...sessions].filter((S) => S.char);
const charSummary = (c) => ({ id: c.id, name: c.name, flag: c.flag, look: c.look, created: c.created, lastSeen: c.lastSeen ?? null, played: Math.round(c.played ?? 0),
  where: c.data?.pos ? { x: Math.round(c.data.pos.x), z: Math.round(c.data.pos.z) } : null, house: c.house ?? null });
const playerView = (S) => ({ id: S.char.id, name: S.char.name, flag: S.char.flag, look: S.char.look, user: S.user, p: S.pres ?? null });
const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const sizeOf = (o) => Buffer.byteLength(JSON.stringify(o ?? null));
const id40 = (s) => typeof s === 'string' && s.length <= 40 && /^[A-Za-z0-9_.:-]+$/.test(s);
const num = (n, lim = 1e6) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= lim;

function startSession(S, user) {
  const token = newToken();
  store.sessions[tokenKey(token)] = { user, exp: Date.now() + TOKEN_TTL_MS };
  store.mark('sessions.json');
  S.user = user; S.tokenKey = tokenKey(token);
  const u = store.user(user);
  u.lastLogin = new Date().toISOString();
  store.world.stats.logins++;
  store.mark('accounts.json', 'world.json');
  send(S, { t: 'auth', user, token, chars: store.charsOf(user).map(charSummary) });
  log(`auth ${user} from ${S.ip}`);
}

function leaveWorld(S, why = 'left') {
  if (!S.char) return;
  const c = S.char;
  c.lastSeen = new Date().toISOString();
  c.played = (c.played ?? 0) + (Date.now() - S.enteredAt) / 1000;
  store.mark('characters.json');
  for (const o of inWorld()) if (o !== S) send(o, { t: 'gone', id: c.id, name: c.name, why });
  log(`leave ${c.name} (${S.user}) ${why}`);
  S.char = null; S.pres = null;
}

// ---- the world's own merge rules ----------------------------------------------------------------------------------
// A patch is checked field by field; whatever does not fit is dropped, the rest applied and relayed.
function applyPatch(S, patch) {
  const W = store.world, out = {};
  const I = patch?.interiors;
  if (I && typeof I === 'object') {
    out.interiors = { d: {}, w: {} };
    for (const [id, v] of Object.entries(I.d ?? {})) {
      if (!id40(id)) continue;
      if (v === null) { delete W.interiors.d[id]; out.interiors.d[id] = null; continue; }
      if (!v || !num(v.h, 1e4) || !num(v.k, 100)) continue;
      W.interiors.d[id] = out.interiors.d[id] = { l: v.l ? 1 : 0, h: Math.round(v.h), k: Math.round(v.k) };
    }
    for (const [id, v] of Object.entries(I.w ?? {})) {
      if (!id40(id)) continue;
      if (v === null) { delete W.interiors.w[id]; out.interiors.w[id] = null; continue; }
      if (!v || !['intact', 'shattered', 'boarded'].includes(v.s) || !num(v.hp, 1e4) || !num(v.b, 1e4)) continue;
      W.interiors.w[id] = out.interiors.w[id] = { s: v.s, hp: Math.round(v.hp), b: Math.round(v.b), sd: v.sd > 0 ? 1 : -1 };
    }
  }
  const D = patch?.deadNpc;
  if (D && id40(D.id) && !W.deadNpcs[D.id]) {
    W.deadNpcs[D.id] = out.deadNpc = { id: D.id, name: String(D.name ?? D.id).slice(0, 40), by: S.char.name, at: new Date().toISOString() };
    log(`world: ${S.char.name} killed ${W.deadNpcs[D.id].name} for good`);
  }
  const T = patch?.takeVehicle;
  if (T && id40(T.seed) && !W.takenVehicles[T.seed]) { W.takenVehicles[T.seed] = S.char.id; out.takeVehicle = { seed: T.seed, by: S.char.id }; }
  if (Array.isArray(patch?.deeds)) {
    out.deeds = [];
    for (const d of patch.deeds.slice(0, 20)) {
      if (!d || !id40(d.verb)) continue;
      const rec = { at: new Date().toISOString(), char: S.char.id, name: S.char.name, flag: S.char.flag, verb: d.verb, target: String(d.target ?? '').slice(0, 40), place: String(d.place ?? '').slice(0, 40),
        x: num(d.x) ? Math.round(d.x) : null, z: num(d.z) ? Math.round(d.z) : null, seen: Math.max(0, Math.min(99, Math.round(Number(d.seen) || 0))) };
      W.chronicle.push(rec); out.deeds.push(rec);
    }
    if (W.chronicle.length > LIMITS.chronicleKeep) W.chronicle.splice(0, W.chronicle.length - LIMITS.chronicleKeep);
  }
  W.stats.patches++;
  store.mark('world.json');
  return out;
}

function worldView() {
  const W = store.world;
  // Every character's parked car (the page shows the others' as locked; its own as its own).
  const cars = Object.values(store.chars.byId).filter((c) => c.data?.car && num(c.data.car.x) && num(c.data.car.z))
    .map((c) => ({ char: c.id, name: c.name, flag: c.flag, car: { t: c.data.car.type, x: c.data.car.x, z: c.data.car.z, h: c.data.car.h ?? 0, c: c.data.car.paint ?? '#6a2a1a', hp: c.data.car.hp ?? null, seed: c.data.car.seed ?? null } }));
  return { interiors: W.interiors, deadNpcs: W.deadNpcs, claims: W.claims, takenVehicles: W.takenVehicles, cars, chronicle: W.chronicle.slice(-30), created: W.created };
}

// ---- messages -------------------------------------------------------------------------------------------------------
async function handle(S, msg) {
  const t = msg?.t;
  if (t === 'p') return presence(S, msg);
  switch (t) {
    case 'register': {
      const user = cleanUser(msg.user), pass = cleanPass(msg.pass);
      const wait = throttle.check(user, S.ip); throttle.attempt(S.ip);
      if (wait) return err(S, 'slow', `too many tries - wait ${wait}s`, t);
      if (!user) return err(S, 'user', `username: ${LIMITS.userMin}-${LIMITS.userMax} lowercase letters, digits or _`, t);
      if (!pass) return err(S, 'pass', `password: ${LIMITS.passMin}-${LIMITS.passMax} characters`, t);
      if (store.user(user)) return err(S, 'taken', 'that username is taken', t);
      store.accounts.users[user] = { pw: await hashPassword(pass), created: new Date().toISOString(), chars: [] };
      store.mark('accounts.json');
      log(`register ${user}`);
      return startSession(S, user);
    }
    case 'login': {
      const user = cleanUser(msg.user);
      const wait = throttle.check(user, S.ip); throttle.attempt(S.ip);
      if (wait) return err(S, 'slow', `too many tries - wait ${wait}s`, t);
      const u = user && store.user(user);
      const ok = u ? await checkPassword(String(msg.pass ?? ''), u.pw) : await burnHash(msg.pass);
      if (!ok) { if (user) throttle.fail(user); log(`login refused for ${user ?? '(bad name)'} from ${S.ip}`); return err(S, 'bad', 'wrong username or password', t); }
      throttle.ok(user);
      return startSession(S, user);
    }
    case 'resume': {
      const k = tokenKey(msg.token ?? ''), s = store.sessions[k];
      if (!s || !(s.exp > Date.now()) || !store.user(s.user)) return err(S, 'token', 'that session has ended - log in again', t);
      S.user = s.user; S.tokenKey = k;
      send(S, { t: 'auth', user: s.user, token: null, chars: store.charsOf(s.user).map(charSummary), resumed: true });
      return log(`resume ${s.user} from ${S.ip}`);
    }
    case 'signout': {
      leaveWorld(S, 'signed out');
      if (S.tokenKey) { delete store.sessions[S.tokenKey]; store.mark('sessions.json'); }
      S.user = null; S.tokenKey = null;
      return send(S, { t: 'signedout' });
    }
  }
  if (!S.user) return err(S, 'auth', 'log in first', t);
  switch (t) {
    case 'chars': return send(S, { t: 'chars', chars: store.charsOf(S.user).map(charSummary) });
    case 'newChar': {
      const u = store.user(S.user), name = cleanName(msg.name), flag = cleanFlag(msg.flag);
      if (u.chars.length >= LIMITS.charsPerAccount) return err(S, 'full', `${LIMITS.charsPerAccount} characters to an account`, t);
      if (!name) return err(S, 'name', `name: ${LIMITS.nameMin}-${LIMITS.nameMax} letters (a letter first; digits, spaces, ' and - allowed)`, t);
      if (!flag) return err(S, 'flag', 'pick a flag', t);
      if (store.charByName(name)) return err(S, 'taken', `somebody on this shard is already called ${name}`, t);
      const c = { id: newId('ch'), account: S.user, name, flag, look: Math.floor(Math.random() * 1e9), created: new Date().toISOString(), lastSeen: null, played: 0, data: null };
      store.chars.byId[c.id] = c; u.chars.push(c.id);
      store.mark('characters.json', 'accounts.json');
      log(`new character ${name} (${flag}) for ${S.user}`);
      return send(S, { t: 'chars', chars: store.charsOf(S.user).map(charSummary), made: c.id });
    }
    case 'enter': {
      const c = store.charsOf(S.user).find((x) => x.id === msg.char || x.name.toLowerCase() === String(msg.char ?? '').toLowerCase());
      if (!c) return err(S, 'char', 'no such character on this account', t);
      for (const o of inWorld()) if (o !== S && o.char.id === c.id) { send(o, { t: 'kicked', why: `${c.name} logged in somewhere else` }); leaveWorld(o, 'logged in elsewhere'); }
      leaveWorld(S, 'switched character');
      S.char = c; S.enteredAt = Date.now(); S.pres = c.data?.pos ? { x: c.data.pos.x, z: c.data.pos.z, y: c.data.pos.gy ?? 0, f: c.data.pos.face ?? 0, s: 0, w: null, a: 0, hp: c.data.hp ?? 100, d: 0 } : null; S.presAt = Date.now();
      S.warps = 0;
      send(S, { t: 'entered', char: { id: c.id, name: c.name, flag: c.flag, look: c.look, house: c.house ?? null, data: c.data }, world: worldView(), players: inWorld().filter((o) => o !== S).map(playerView), shard: NAME, serverTime: Date.now() });
      for (const o of inWorld()) if (o !== S) send(o, { t: 'join', player: playerView(S) });
      return log(`enter ${c.name} (${S.user})`);
    }
    case 'who': return send(S, { t: 'who', players: inWorld().map((o) => ({ name: o.char.name, flag: o.char.flag })) });
  }
  if (!S.char) return err(S, 'world', 'enter the world with a character first', t);
  switch (t) {
    case 'leave': leaveWorld(S, 'logged out'); return send(S, { t: 'left' });
    case 'save': {
      const d = msg.data;
      if (!d || typeof d !== 'object' || Array.isArray(d)) return err(S, 'save', 'save needs a data object', t);
      if (sizeOf(d) > LIMITS.saveBytes) return err(S, 'save', `a character save is ${LIMITS.saveBytes} bytes at most`, t);
      if (!d.pos || !num(d.pos.x) || !num(d.pos.z)) return err(S, 'save', 'save needs pos {x, z}', t);
      S.char.data = d; S.char.lastSeen = new Date().toISOString();
      if (d.standing && typeof d.standing === 'object') {
        const st = {};
        for (const [f, v] of Object.entries(d.standing)) if (id40(f) && num(v, 1000)) st[f] = Math.round(v * 10) / 10;
        store.world.standings[S.char.id] = { name: S.char.name, standing: st };
      }
      store.world.stats.saves++;
      store.mark('characters.json', 'world.json');
      return send(S, { t: 'saved', at: S.char.lastSeen, seq: msg.seq ?? null });
    }
    case 'world': {
      if (sizeOf(msg.patch) > LIMITS.patchBytes) return err(S, 'world', `a world change is ${LIMITS.patchBytes} bytes at most`, t);
      const out = applyPatch(S, msg.patch);
      for (const o of inWorld()) if (o !== S) send(o, { t: 'world', patch: out, by: S.char.name });
      return send(S, { t: 'worldOk', seq: msg.seq ?? null });
    }
    case 'claim': {
      const key = cleanClaimKey(msg.key);
      if (!key || !num(msg.x) || !num(msg.z)) return err(S, 'claim', 'claim needs a building key and where it is', t);
      const W = store.world, had = W.claims[key];
      if (had && had.char !== S.char.id) return err(S, 'claimed', `${had.name} already claims ${had.label ?? 'this place'}`, t);
      for (const [k, c] of Object.entries(W.claims)) if (c.char === S.char.id && k !== key) { delete W.claims[k]; for (const o of inWorld()) send(o, { t: 'claimed', key: k, claim: null }); }
      W.claims[key] = { char: S.char.id, name: S.char.name, flag: S.char.flag, label: String(msg.label ?? 'a house').slice(0, 40), x: Math.round(msg.x), z: Math.round(msg.z), at: new Date().toISOString() };
      S.char.house = key;
      store.mark('world.json', 'characters.json');
      for (const o of inWorld()) send(o, { t: 'claimed', key, claim: W.claims[key] });
      return log(`claim ${S.char.name} -> ${key}`);
    }
    case 'unclaim': {
      const W = store.world;
      for (const [k, c] of Object.entries(W.claims)) if (c.char === S.char.id) { delete W.claims[k]; for (const o of inWorld()) send(o, { t: 'claimed', key: k, claim: null }); }
      S.char.house = null;
      store.mark('world.json', 'characters.json');
      return;
    }
  }
  return err(S, 'unknown', `unknown message type ${t}`, t);
}

function presence(S, msg) {
  if (!S.char) return;
  const p = cleanPresence(msg);
  if (!p) return;
  const now = Date.now();
  if (S.pres) {
    const dt = Math.max(0.001, (now - S.presAt) / 1000), d = Math.hypot(p.x - S.pres.x, p.z - S.pres.z);
    if (d > 5 && d / dt > WARP) { S.warps = (S.warps ?? 0) + 1; if (S.warps <= 5 || S.warps % 50 === 0) log(`warp ${S.char.name}: ${d.toFixed(0)} m in ${dt.toFixed(2)} s (${S.warps})`); }
  }
  S.pres = p; S.presAt = now; S.presDirty = true;
}

// ---- the relay: everyone else's presence, ~15 Hz --------------------------------------------------------------------
setInterval(() => {
  const list = inWorld();
  if (list.length < 2) { for (const S of list) S.presDirty = false; return; }
  const ts = Date.now();
  for (const S of list) {
    const p = [];
    for (const o of list) {
      if (o === S || !o.pres) continue;
      if (S.pres && Math.hypot(o.pres.x - S.pres.x, o.pres.z - S.pres.z) > AOI) continue;
      p.push({ id: o.char.id, ...o.pres, at: o.presAt });
    }
    if (p.length) send(S, { t: 's', ts, p });
  }
  for (const S of list) S.presDirty = false;
}, Math.round(1000 / LIMITS.presenceHz));

// Dead connections (a closed laptop) are found within 30 s.
setInterval(() => {
  for (const S of sessions) { if (!S.alive) { S.ws.terminate(); continue; } S.alive = false; try { S.ws.ping(); } catch {} }
}, 15000);

// ---- the server ----------------------------------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (code, body, cors = false) => { res.writeHead(code, { 'content-type': 'application/json', ...(cors ? { 'access-control-allow-origin': '*' } : {}) }); res.end(JSON.stringify(body)); };
  if (url.pathname === '/health') return json(200, { ok: true, shard: NAME, v: PROTOCOL, online: inWorld().length, uptimeS: Math.round((Date.now() - started) / 1000) }, true);
  if (url.pathname === '/who' || url.pathname === '/world') {
    if (!isLocal(req)) return json(403, { ok: false, error: 'this machine only' });
    if (url.pathname === '/who') return json(200, { ok: true, shard: NAME, online: inWorld().map((S) => ({ user: S.user, id: S.char.id, name: S.char.name, flag: S.char.flag, x: S.pres?.x ?? null, z: S.pres?.z ?? null, weapon: S.pres?.w ?? null, vehicle: S.pres?.v?.t ?? null, hp: S.pres?.hp ?? null, since: new Date(S.enteredAt).toISOString(), warps: S.warps ?? 0 })),
      connections: sessions.size, accounts: Object.keys(store.accounts.users).length, characters: Object.keys(store.chars.byId).length });
    const W = store.world;
    return json(200, { ok: true, shard: NAME, data: DATA, doors: Object.keys(W.interiors.d).length, windows: Object.keys(W.interiors.w).length, interiors: W.interiors, deadNpcs: W.deadNpcs, claims: W.claims, takenVehicles: W.takenVehicles, standings: W.standings, chronicle: W.chronicle.slice(-20), stats: W.stats });
  }
  json(404, { ok: false, error: 'not here', hint: `the shard speaks WebSocket at ${SHARD_PATH}; GET /health, /who, /world` });
});

const wss = new WebSocketServer({ server, path: SHARD_PATH, maxPayload: LIMITS.messageBytes });
wss.on('connection', (ws, req) => {
  const origin = req.headers.origin ?? '';
  if (ORIGINS.length && !ORIGINS.includes(origin)) { ws.close(1008, 'origin not allowed'); return; }
  const S = { id: newId('s'), ws, ip: req.socket.remoteAddress, user: null, char: null, pres: null, alive: true, budget: 60, budgetAt: Date.now() };
  sessions.add(S);
  ws.on('pong', () => { S.alive = true; });
  ws.on('message', async (raw) => {
    // 60 messages a second at most (presence is 15): a flood is dropped, not queued.
    const now = Date.now();
    S.budget = Math.min(60, S.budget + ((now - S.budgetAt) / 1000) * 60); S.budgetAt = now;
    if (S.budget < 1) return;
    S.budget -= 1;
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return err(S, 'json', 'messages are JSON objects'); }
    try { await handle(S, msg); } catch (e) { log(`error handling ${msg?.t}: ${e.stack ?? e}`); err(S, 'server', 'the shard tripped on that one', msg?.t); }
  });
  ws.on('close', () => { leaveWorld(S, 'disconnected'); sessions.delete(S); });
  send(S, { t: 'hello', shard: NAME, v: PROTOCOL, online: inWorld().length });
});

server.on('error', (e) => { log(`[shard] ${e.code === 'EADDRINUSE' ? `port ${PORT} is taken - is a shard already running?` : e.message}`); process.exit(1); });
server.listen(PORT, () => log(`[shard] ${NAME} up on ws://localhost:${PORT}${SHARD_PATH} - data in ${DATA} - ${Object.keys(store.accounts.users).length} accounts, ${Object.keys(store.chars.byId).length} characters`));

// The world is also written every 30 s whatever happened (a kill -9 loses at most that much).
setInterval(() => { store.mark('world.json', 'characters.json'); }, 30000);

let stopping = false;
function shutdown(why) {
  if (stopping) return;
  stopping = true;
  log(`[shard] going down (${why})`);
  for (const S of sessions) { send(S, { t: 'kicked', why: 'the shard is going down for a moment' }); leaveWorld(S, 'shard down'); }
  const n = store.flushAll();
  log(`[shard] wrote ${n} files; bye`);
  for (const S of sessions) try { S.ws.close(1001, 'shard down'); } catch {}
  wss.close(); server.close();
  setTimeout(() => process.exit(0), 150);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGBREAK', () => shutdown('SIGBREAK'));
process.on('message', (m) => { if (m === 'shutdown' || m?.t === 'shutdown') shutdown('ipc'); });
process.stdin.on('data', (b) => { if (/^\s*stop\s*$/m.test(b.toString())) shutdown('stdin'); });
process.stdin.on('error', () => {});
