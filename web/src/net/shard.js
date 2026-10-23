// The page's side of the shard (docs/design/WEB_SHARD.md): log in, pick a character, walk into a world other people
// are in. Authority model (a): the shard owns accounts, characters and the shared world; this page simulates its own
// surroundings and reports its own player. Without a shard (no login) nothing here runs and the game is the same
// single-player game it always was.
//
// What it does once you are in:
//   - sends your presence ~15 times a second (position, facing, gun, aim, hp, the car you are in);
//   - draws everyone else as a real body (the same character model, their own look from their seed) with a name plate
//     and their real flag, interpolated ~120 ms behind, in a car if they are in one;
//   - saves your character (where you stand, the pack, needs, money, standing, your car, your house) every 10 s, on
//     leaving and when the page goes away;
//   - reports what you change in the shared world (a lock kicked in, a window broken or boarded, a named person killed,
//     a town car driven off, your deeds) and applies what others change.
import { outfit, stridePhase } from '../systems/characters.js';
import { makeRng, angleLerp } from '../engine/rng.js';
import { VEHICLES } from '../systems/vehicles.js';
import { FLAGS } from '../ui/portrait.js';
import { LIMITS, SHARD_PORT, SHARD_PATH } from './protocol.js';
import { ShardUI } from './login.js';
import { shardCommands } from './commands.js';

const DELAY = 120;                 // ms behind the newest sample: two samples to interpolate between at 15 Hz
const SEND_MS = Math.round(1000 / LIMITS.presenceHz);
const SAVE_MS = 10000;
const STALE_MS = 5000;             // a remote with no sample this long (out of range, or gone quiet) is put away
const CAR_NEAR = 400, CAR_FAR = 500; // parked cars of other players are shown within CAR_NEAR, put away past CAR_FAR
const REMOTE_HP = 100000;          // a stranger's body on your screen cannot be killed by your copy of the world

export function defaultShardUrl() {
  const q = new URLSearchParams(location.search).get('shard');
  if (q) return q;
  try { const s = localStorage.getItem('dl.shard.url'); if (s) return s; } catch {}
  return `ws://${location.hostname || 'localhost'}:${SHARD_PORT}${SHARD_PATH}`;
}

export class Shard {
  constructor(g) {
    this.g = g;
    this.url = defaultShardUrl();
    this.ws = null;
    this.state = 'offline';        // offline | connecting | open | authed | inworld
    this.shardName = null;
    this.user = null;
    this.token = null;
    this.chars = [];
    this.char = null;              // { id, name, flag, look, house }
    this.remotes = new Map();      // char id -> { id, name, flag, look, user, buf: [], avatar, car, carInfo, last }
    this.parked = new Map();       // char id -> { name, flag, car } other players' cars as the shard last had them
    this.claims = {};
    this.deadNpcs = {};
    this.taken = {};
    this.chronicle = [];
    this.waiters = [];
    this.offset = null;            // shard clock - this clock (ms), best estimate
    this.sentAt = 0; this.saveAt = 0; this.tickAt = 0;
    this.sentI = { d: {}, w: {} };
    this.stats = { sent: 0, recv: 0, saves: 0, patchesOut: 0, patchesIn: 0, reconnects: 0 };
    this.myCar = null;
    this.saveSeq = 0;
    this.wantReconnect = false;
    // What a brand-new character starts with: the game as it booted, before anybody played it.
    this.baseline = this.personal();
    this.seedVehicles = new Set(g.vehicles.map((v) => v.id)); // the town's own cars (same ids on every page)
    const frame = g.frame.bind(g);
    g.frame = (dt) => { this.pre(dt); frame(dt); this.post(dt); };
    addEventListener('pagehide', () => this.flushOnExit());
    addEventListener('beforeunload', () => this.flushOnExit());
  }

  // ---- connection -------------------------------------------------------------------------------------------------
  connect(url = this.url) {
    if (this.ws && this.ws.readyState <= 1 && this.url === url) return this.hello ?? Promise.resolve();
    this.url = url;
    try { localStorage.setItem('dl.shard.url', url); } catch {}
    this.state = 'connecting';
    const ws = this.ws = new WebSocket(url);
    this.hello = new Promise((ok, fail) => {
      const t = setTimeout(() => { fail(new Error(`no shard answered at ${url}`)); try { ws.close(); } catch {} }, 5000);
      ws.onopen = () => { this.state = 'open'; };
      ws.onerror = () => { clearTimeout(t); fail(new Error(`no shard at ${url} - is it running? (npm run shard)`)); };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        this.stats.recv++;
        if (m.t === 'hello') { clearTimeout(t); this.shardName = m.shard; ok(m); }
        this.onMessage(m);
      };
      ws.onclose = () => { clearTimeout(t); this.onClose(ws); fail(new Error('the shard closed the connection')); };
    });
    this.hello.catch(() => {});
    return this.hello;
  }

  send(msg) { if (this.ws?.readyState === 1) { this.ws.send(JSON.stringify(msg)); this.stats.sent++; return true; } return false; }

  // Send and wait for the first reply that matches (or an err about this message type).
  request(msg, types, ms = 8000) {
    return new Promise((ok, fail) => {
      if (!this.send(msg)) return fail(new Error('not connected to a shard (shardConnect first)'));
      const w = { types, re: msg.t, ok, fail, timer: setTimeout(() => { this.waiters.splice(this.waiters.indexOf(w), 1); fail(new Error(`the shard did not answer ${msg.t}`)); }, ms) };
      this.waiters.push(w);
    });
  }

  onMessage(m) {
    for (const w of [...this.waiters]) {
      if (w.types.includes(m.t) || (m.t === 'err' && m.re === w.re)) {
        this.waiters.splice(this.waiters.indexOf(w), 1); clearTimeout(w.timer);
        if (m.t === 'err') w.fail(Object.assign(new Error(m.msg), { code: m.code })); else w.ok(m);
        break;
      }
    }
    switch (m.t) {
      case 'auth': this.user = m.user; if (m.token) this.token = m.token; this.chars = m.chars; this.state = 'authed';
        try { localStorage.setItem('dl.shard.session', JSON.stringify({ url: this.url, user: m.user, token: this.token })); } catch {}
        break;
      case 'chars': this.chars = m.chars; break;
      case 's': this.onSnapshot(m); break;
      case 'join': this.addRemote(m.player); this.toast(`${m.player.name.toUpperCase()} IS IN THE WASTE`, 'job'); break;
      case 'gone': this.dropRemote(m.id); this.toast(`${String(m.name).toUpperCase()} ${m.why === 'disconnected' ? 'DROPPED OFF THE SHARD' : 'LOGGED OUT'}`); break;
      case 'world': this.stats.patchesIn++; this.applyPatch(m.patch, m.by); break;
      case 'claimed': if (m.claim) this.claims[m.key] = m.claim; else delete this.claims[m.key]; break;
      case 'kicked':
        this.toast(`SHARD: ${String(m.why).toUpperCase()}`, 'hot');
        if (/elsewhere/.test(m.why)) { this.wantReconnect = false; this.clearRemotes(); this.char = null; this.state = 'authed'; this.ui?.updateRoster(); }
        break;
      case 'signedout': this.user = null; this.token = null; this.state = 'open'; break;
    }
  }

  onClose(ws) {
    if (ws !== this.ws) return;
    const was = this.state;
    this.ws = null;
    for (const w of this.waiters.splice(0)) { clearTimeout(w.timer); w.fail(new Error('the shard closed the connection')); }
    if (this.wantReconnect) {
      if (was === 'inworld') this.toast('LOST THE SHARD - RECONNECTING', 'hot');
      this.state = 'reconnecting';
      if (!this.reconnecting) this.reconnectLoop();
    } else this.state = 'offline';
    this.ui?.updateRoster();
  }

  // The shard went away while you were in the world (a restart, a dropped line): keep playing; come back in as the
  // same character when it answers again. Your own state here is newer than the shard's copy, so it is sent, not read.
  async reconnectLoop() {
    const charId = this.char?.id;
    this.reconnecting = true;
    try {
      for (let i = 0; this.wantReconnect && charId; i++) {
        await new Promise((r) => setTimeout(r, Math.min(5000, 1000 + i * 500)));
        if (!this.wantReconnect) return;
        try {
          await this.connect(this.url);
          await this.request({ t: 'resume', token: this.token }, ['auth']);
          await this.enter(charId, { apply: false });
          this.stats.reconnects++;
          this.toast('BACK ON THE SHARD', 'job');
          return;
        } catch { if (this.state !== 'inworld') this.state = 'reconnecting'; }
      }
    } finally { this.reconnecting = false; }
  }

  // ---- account ----------------------------------------------------------------------------------------------------
  async login(user, pass, create = false) {
    await this.connect();
    const m = await this.request({ t: create ? 'register' : 'login', user, pass }, ['auth']);
    return { user: m.user, chars: m.chars };
  }
  async resume(token) {
    await this.connect();
    const m = await this.request({ t: 'resume', token }, ['auth']);
    this.token = token;
    return { user: m.user, chars: m.chars };
  }
  async newChar(name, flag) { const m = await this.request({ t: 'newChar', name, flag }, ['chars']); return { chars: m.chars, made: m.chars.find((c) => c.id === m.made) }; }
  async listChars() { return (await this.request({ t: 'chars' }, ['chars'])).chars; }

  // ---- in and out of the world ------------------------------------------------------------------------------------
  // apply: the shard's copy of the character becomes this page's player (a login). false: this page's player is
  // newer (coming back after the shard restarted) - only the world and the people are taken.
  async enter(char, { apply = true } = {}) {
    const m = await this.request({ t: 'enter', char }, ['entered'], 15000);
    const g = this.g;
    this.clearRemotes();
    this.char = m.char; this.shardName = m.shard;
    this.offset = m.serverTime - Date.now();
    if (document.querySelector('.title .play')) document.querySelector('.title .play').click(); // into the game
    g.paused = false;
    // Who you are: your name over your head, your flag on the HUD, your look on the body.
    const p = g.player;
    p.name = m.char.name; p.flag = m.char.flag;
    p.colors = outfit('player', makeRng(m.char.look)); g.charR.paint(p);
    g.hud.paintFlag?.(m.char.flag);
    if (apply) this.applyPersonal(m.char.data ?? this.baseline, m.char.id);
    // A brand-new character (the shard has a name and a flag, nothing else): THE CREATOR opens on it, and BEGIN saves it.
    if (apply && (!m.char.data || m.char.data.sheetPending) && g.creator) g.creator.forShard(m.char, () => this.save().catch(() => {}));
    this.applyWorld(m.world);
    for (const pl of m.players) this.addRemote(pl);
    this.state = 'inworld';
    this.wantReconnect = true;
    this.lastEvent = g.eventSeq;
    this.lastChron = g.society.chronicle.seq;
    this.sentI = this.interiorKeys(g.interiors.save());
    this.saveAt = performance.now();
    g.emit('shardEnter', { char: m.char.name, shard: m.shard, players: m.players.length });
    if (apply) this.toast(`${m.shard} · ${m.char.name.toUpperCase()}${m.players.length ? ` · ${m.players.length} MORE IN THE WASTE` : ''}`, 'job');
    await this.save();
    return { char: { id: m.char.id, name: m.char.name, flag: m.char.flag, house: m.char.house }, shard: m.shard, at: { x: +p.x.toFixed(1), z: +p.z.toFixed(1) }, fresh: !m.char.data, players: m.players.map((x) => x.name) };
  }

  async leave() {
    if (this.state !== 'inworld') return { left: false };
    this.wantReconnect = false;
    await this.save();
    await this.request({ t: 'leave' }, ['left']);
    this.clearRemotes();
    const name = this.char?.name;
    this.char = null; this.myCar = null;
    this.state = 'authed';
    this.ui?.updateRoster();
    this.g.emit('shardLeave', { char: name });
    return { left: true, char: name };
  }

  async signout() {
    if (this.state === 'inworld') await this.leave();
    if (this.ws) await this.request({ t: 'signout' }, ['signedout']).catch(() => {});
    try { localStorage.removeItem('dl.shard.session'); } catch {}
    this.user = null; this.token = null; this.chars = [];
    return { signedOut: true };
  }

  async save() {
    if (this.state !== 'inworld') return null;
    const seq = ++this.saveSeq;
    const data = this.personal();
    this.saveAt = performance.now();
    const m = await this.request({ t: 'save', data, seq }, ['saved']);
    this.stats.saves++;
    this.lastSaved = m.at;
    return { at: m.at, bytes: JSON.stringify(data).length };
  }

  flushOnExit() { if (this.state === 'inworld') try { this.send({ t: 'save', data: this.personal() }); } catch {} }

  // ---- the character: everything that is yours ----------------------------------------------------------------------
  personal() {
    const g = this.g, p = g.player, F = g.society.factions, inv = g.inventory.save();
    const v = this.myCar && g.vehicles.includes(this.myCar) && !this.myCar.dead ? this.myCar : null;
    return {
      v: 1,
      pos: { x: +(p.inVehicle?.x ?? p.x).toFixed(2), z: +(p.inVehicle?.z ?? p.z).toFixed(2), gy: +(p.gy ?? 0).toFixed(2), face: +p.face.toFixed(3) },
      hp: Math.round(p.hp), alive: p.alive,
      cash: g.cash, inv: JSON.parse(JSON.stringify(g.inv)), quests: JSON.parse(JSON.stringify(g.quests)), stats: { ...g.stats },
      pack: { worn: inv.worn, carried: inv.carried },
      needs: g.survival.save(), skills: g.skillsSys.save(), roles: g.roles.save(),
      society: { factions: F.save(), memory: g.society.memory.save() },
      standing: Object.fromEntries(F.ids.map((id, i) => [id, +F.standing[i].toFixed(1)])),
      car: v ? { type: v.type, paint: v.paint, x: +v.x.toFixed(2), z: +v.z.toFixed(2), h: +v.h.toFixed(3), hp: Math.round(v.hp), seed: v.shardSeed ?? null,
        plates: v.plates ? { ...v.plates } : undefined, mounts: v.mounts ? JSON.parse(JSON.stringify(v.mounts)) : undefined } : null,
      house: this.char?.house ?? null,
      sheet: g.creator?.save() ?? null, gear: g.gear?.save(), // who you were made as (data/creator.js) and what you wear (additive: an older record has neither)
      ...(g.creator?.pending ? { sheetPending: true } : {}), // made on the shard, the creator not finished yet: it opens again at the next login
    };
  }

  applyPersonal(d, charId) {
    const g = this.g, p = g.player;
    if (p.inVehicle) g.exitVehicle(true);
    g.cash = d.cash ?? g.cash;
    if (d.inv) g.inv = JSON.parse(JSON.stringify(d.inv));
    if (d.quests) g.quests = JSON.parse(JSON.stringify(d.quests));
    if (d.stats) g.stats = { ...d.stats };
    Object.assign(p, { x: d.pos.x, z: d.pos.z, gy: d.pos.gy ?? 0, face: d.pos.face ?? p.face, hp: d.hp ?? p.maxHp, alive: (d.hp ?? 1) > 0, inVehicle: null, knockT: 0, vault: null, vaultY: 0 });
    if (!p.alive) { p.alive = true; p.hp = p.maxHp; }
    g.standOn(p);
    p.weapon = g.inv.current;
    if (d.sheet !== undefined) g.creator?.load(d.sheet); // before skills and gear: their numbers fold the sheet's
    if (d.needs) g.survival.load(d.needs);
    if (d.skills) g.skillsSys.load(d.skills);
    // The pack is yours; every crate and shelf in the world stays as this page has it.
    if (d.pack) g.inventory.load({ ...g.inventory.save(), worn: d.pack.worn, carried: d.pack.carried });
    g.inventory.bindAmmo();
    if (d.gear) g.gear?.load(d.gear);
    if (d.roles) g.roles.load(d.roles);
    if (d.society?.factions) { g.society.factions.load(d.society.factions); for (const c of g.chars) g.society.factions.assign(c); }
    if (d.society?.memory) g.society.memory.load(d.society.memory);
    g.camLook.x = p.x; g.camLook.z = p.z;
    g.streamer?.ensureHot(p.x, p.z, 'load');
    // Your car, where you left it.
    this.myCar = null;
    const c = d.car;
    if (c && VEHICLES[c.type]) {
      const v = g.vehiclesSys.spawn(c.type, c.x, c.z, c.h ?? 0, c.paint ?? '#6a2a1a', { ai: null });
      v.id = `own:${charId}`; v.shardSeed = c.seed ?? null; v.owner = this.char?.name;
      if (Number.isFinite(c.hp)) v.hp = Math.max(1, c.hp);
      if (c.plates) v.plates = { ...c.plates };
      if (c.mounts) v.mounts = JSON.parse(JSON.stringify(c.mounts));
      g.garage.retune?.(v);
      this.myCar = v;
    }
  }

  // ---- the shared world ---------------------------------------------------------------------------------------------
  applyWorld(W) {
    const g = this.g;
    this.claims = { ...W.claims };
    this.deadNpcs = { ...W.deadNpcs };
    this.taken = { ...W.takenVehicles };
    this.chronicle = W.chronicle ?? [];
    this.mergeInteriors(W.interiors, true);
    for (const id of Object.keys(this.deadNpcs)) this.layDead(id);
    // The town cars somebody drove off in are gone from where they stood.
    for (const seed of Object.keys(this.taken)) this.dropSeedVehicle(seed);
    this.parked.clear();
    for (const r of W.cars ?? []) if (r.char !== this.char.id) this.parked.set(r.char, { name: r.name, flag: r.flag, car: r.car });
    this.updateParked(true);
  }

  applyPatch(P, by) {
    if (!P) return;
    if (P.interiors) this.mergeInteriors(P.interiors, false);
    if (P.deadNpc) { this.deadNpcs[P.deadNpc.id] = P.deadNpc; this.layDead(P.deadNpc.id); }
    if (P.takeVehicle) { this.taken[P.takeVehicle.seed] = P.takeVehicle.by; this.dropSeedVehicle(P.takeVehicle.seed); }
    for (const d of P.deeds ?? []) {
      this.chronicle.push(d);
      if (d.verb === 'kill' && d.target) this.toast(`WORD ON THE SHARD: ${d.name.toUpperCase()} KILLED ${d.target.toUpperCase()}`, 'warn');
    }
    if (this.chronicle.length > 60) this.chronicle.splice(0, this.chronicle.length - 60);
    if (P.interiors && by) this.g.emit('shardWorld', { by, doors: Object.keys(P.interiors.d ?? {}).length, windows: Object.keys(P.interiors.w ?? {}).length });
  }

  // Doors: their locks (kicked in, how much is left). Windows: glass, boards, which side. The leaves keep the angle
  // this page has them at: a door swinging is this page's business, a lock broken is the world's.
  mergeInteriors(I, whole) {
    const g = this.g, cur = g.interiors.save();
    const angles = (id) => { const d = g.interiors.byId?.get(id) ?? g.interiors.doors.find((x) => String(x.id) === id); return d ? d.leaves.map((L) => +L.th.toFixed(3)) : [0, 0]; };
    let n = 0;
    for (const [id, v] of Object.entries(I?.d ?? {})) {
      if (v === null) { delete cur.d[id]; n++; continue; }
      cur.d[id] = { a: cur.d[id]?.a ?? angles(id), l: v.l, h: v.h, k: v.k }; n++;
    }
    for (const [id, v] of Object.entries(I?.w ?? {})) {
      if (v === null) delete cur.w[id]; else cur.w[id] = { s: v.s, hp: v.hp, b: v.b, sd: v.sd };
      n++;
    }
    if (!n && !whole) return;
    g.interiors.load(cur);
    // What the world just told us is not news to send back.
    const k = this.interiorKeys(g.interiors.save());
    for (const id of Object.keys(I?.d ?? {})) this.sentI.d[id] = k.d[id];
    for (const id of Object.keys(I?.w ?? {})) this.sentI.w[id] = k.w[id];
  }

  // The world's view of a door is its lock, not its swing: a door counts when its lock is not as it was built
  // (kicked in, picked, damaged, or locked since). A door that only swings is this page's business.
  interiorKeys(s) {
    const out = { d: {}, w: {} }, I = this.g.interiors;
    for (const [id, v] of Object.entries(s.d)) {
      const door = I.byId?.get(id) ?? I.doors.find((x) => String(x.id) === id);
      const built = door ? (door.row.locked ? 1 : 0) : 0;
      if (v.l !== built || (v.l && door && (v.h !== Math.round(door.mat.lockHp) || v.k !== door.mat.kicks))) out.d[id] = `${v.l}|${v.h}|${v.k}`;
    }
    for (const [id, v] of Object.entries(s.w)) out.w[id] = `${v.s}|${v.hp}|${v.b}|${v.sd}`;
    return out;
  }

  // Once a second: what changed here that the world should keep.
  diffInteriors() {
    const s = this.g.interiors.save(), k = this.interiorKeys(s), patch = { d: {}, w: {} };
    let n = 0;
    for (const [id, key] of Object.entries(k.d)) if (this.sentI.d[id] !== key) { const v = s.d[id]; patch.d[id] = { l: v.l, h: v.h, k: v.k }; n++; }
    for (const id of Object.keys(this.sentI.d)) if (this.sentI.d[id] !== undefined && !(id in k.d)) { patch.d[id] = null; n++; }
    for (const [id, key] of Object.entries(k.w)) if (this.sentI.w[id] !== key) { patch.w[id] = s.w[id]; n++; }
    for (const id of Object.keys(this.sentI.w)) if (this.sentI.w[id] !== undefined && !(id in k.w)) { patch.w[id] = null; n++; }
    if (!n) return null;
    this.sentI = k;
    return patch;
  }

  layDead(npcId) {
    const c = this.g.chars.find((x) => x.npc?.id === npcId);
    if (!c || !c.alive || c.npc.essential) return;
    Object.assign(c, { alive: false, hp: 0, deadTime: 999, downedT: 0, target: null, grudge: null, sleeping: false });
    this.g.charR.paint(c);
  }

  dropSeedVehicle(seed) {
    const v = this.g.vehicles.find((x) => x.id === seed);
    if (v && v !== this.myCar && !(v.occ ?? []).some((o) => o && o.alive)) this.g.vehiclesSys.remove(v);
  }

  // ---- everyone else ---------------------------------------------------------------------------------------------------
  addRemote(pl) {
    if (!pl || pl.id === this.char?.id) return;
    let r = this.remotes.get(pl.id);
    if (!r) { r = { id: pl.id, buf: [], avatar: null, car: null }; this.remotes.set(pl.id, r); }
    Object.assign(r, { name: pl.name, flag: FLAGS[pl.flag] ? pl.flag : 'US', look: pl.look, user: pl.user });
    if (pl.p) this.pushSample(r, { ...pl.p, at: Date.now() + (this.offset ?? 0) - DELAY });
  }

  dropRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.putAway(r);
    this.remotes.delete(id);
  }

  clearRemotes() { for (const id of [...this.remotes.keys()]) this.dropRemote(id); for (const id of [...this.parked.keys()]) this.parkAway(id); this.parked.clear(); this.ui?.clearTags(); this.ui?.updateRoster(); }

  onSnapshot(m) {
    // The shard's clock against ours: the snapshot that arrived fastest says the most (slow ones only add latency).
    const est = m.ts - Date.now();
    this.offset = this.offset === null ? est : Math.max(est, this.offset - 2);
    for (const s of m.p) {
      let r = this.remotes.get(s.id);
      if (!r) continue; // a join we have not heard yet arrives first
      this.pushSample(r, s);
    }
  }

  pushSample(r, s) {
    const last = r.buf[r.buf.length - 1];
    if (last && s.at <= last.at) { r.seen = Date.now(); return; }
    r.buf.push(s);
    if (r.buf.length > 30) r.buf.shift();
    r.seen = Date.now();
  }

  // Where a remote is at this moment, as drawn: DELAY ms in the past, between the two samples that bracket it.
  sampleAt(r, t = Date.now() + (this.offset ?? 0) - DELAY) {
    const b = r.buf;
    if (!b.length) return null;
    if (t <= b[0].at) return b[0];
    for (let i = b.length - 1; i > 0; i--) {
      const A = b[i - 1], B = b[i];
      if (t >= A.at && t <= B.at) {
        const k = (t - A.at) / Math.max(1, B.at - A.at);
        const out = { ...B, x: A.x + (B.x - A.x) * k, z: A.z + (B.z - A.z) * k, y: A.y + (B.y - A.y) * k, f: angleLerp(A.f, B.f, k) };
        if (A.v && B.v) out.v = { ...B.v, x: A.v.x + (B.v.x - A.v.x) * k, z: A.v.z + (B.v.z - A.v.z) * k, h: angleLerp(A.v.h, B.v.h, k) };
        return out;
      }
    }
    return b[b.length - 1];
  }

  makeAvatar(r, s) {
    const g = this.g;
    const c = g.addChar({ x: s.x, z: s.z, faction: 'drifter', weapon: s.w && g.combat && this.weaponOk(s.w) ? s.w : null, hp: REMOTE_HP, name: r.name, flag: r.flag, colors: outfit('player', makeRng(r.look ?? 1)) });
    if (!c) return null;
    c.id = `net:${r.id}`;
    c.maxHp = REMOTE_HP;
    c.hold = true;            // the AI leaves them be: their own page moves them
    c.remote = { char: r.id, name: r.name };
    c.face = s.f ?? 0;
    return c;
  }

  weaponOk(w) { return !!(this.g.combat && (w in (this.g.charR.weapons ?? {}))); }

  putAway(r) {
    const g = this.g;
    if (r.avatar) { if (r.avatar.inVehicle) g.seats.leave(r.avatar, true); if (g.chars.includes(r.avatar)) g.removeChar(r.avatar); r.avatar = null; }
    if (r.car && !this.parked.has(r.id)) { g.vehiclesSys.remove(r.car); }
    r.car = null;
  }

  ghostCar(id, info, x, z, h) {
    const g = this.g;
    if (!VEHICLES[info.t]) return null;
    let v = g.vehicles.find((x) => x.id === `netv:${id}`);
    if (v && (v.type !== info.t || v.paint !== info.c)) { g.vehiclesSys.remove(v); v = null; }
    if (!v) {
      v = g.vehiclesSys.spawn(info.t, x, z, h, info.c ?? '#6a2a1a', { ai: 'net' });
      v.id = `netv:${id}`;
      v.netGhost = { char: id };
    }
    return v;
  }

  // Every frame, before the sim: the remotes are where their pages say they were DELAY ms ago.
  pre(dt) {
    if (this.state !== 'inworld' && this.state !== 'reconnecting') return;
    const g = this.g, now = Date.now(), t = now + (this.offset ?? 0) - DELAY;
    for (const r of this.remotes.values()) {
      if (now - (r.seen ?? 0) > STALE_MS || !r.buf.length) { if (r.avatar || r.car) this.putAway(r); continue; }
      const s = this.sampleAt(r, t);
      let c = r.avatar;
      if (!c || !g.chars.includes(c)) c = r.avatar = this.makeAvatar(r, s);
      if (!c) continue;
      if (s.v) {
        const v = r.car = this.ghostCar(r.id, s.v, s.v.x, s.v.z, s.v.h);
        if (v) {
          Object.assign(v, { x: s.v.x, z: s.v.z, h: s.v.h, vx: 0, vz: 0, av: 0, throttle: 0, hp: v.maxHp, onFire: 0 });
          if (c.inVehicle !== v) g.seats.board(c, v, 0);
          this.parked.set(r.id, { name: r.name, flag: r.flag, car: { ...s.v } });
        }
      } else if (c.inVehicle) g.seats.leave(c, true);
      if (!c.inVehicle) {
        const px = c.x, pz = c.z;
        c.x = s.x; c.z = s.z; c.gy = s.y ?? 0;
        const sp = Math.hypot(c.x - px, c.z - pz) / Math.max(dt, 1e-3);
        c.speed = c.speed * 0.7 + Math.min(sp, 12) * 0.3;
        c.walk = (c.walk ?? 0) + stridePhase(c.speed, dt);
      }
      c.face = s.f;
      c.aiming = !!s.a;
      const w = s.w && this.weaponOk(s.w) ? s.w : null;
      if (c.weapon !== w) { c.weapon = w; g.charR.paint?.(c); }
      if (s.d) { if (c.alive) { c.alive = false; c.deadTime = 0.01; } }
      else { if (!c.alive) { c.alive = true; c.deadTime = 0; } c.hp = REMOTE_HP; }
      c.target = null; c.grudge = null;
    }
  }

  // Every frame, after the sim: send, save, notice.
  post() {
    if (this.state === 'reconnecting') { this.ui?.update(); return; }
    if (this.state !== 'inworld') return;
    const g = this.g, now = performance.now();
    // Nobody drives another player's car off: it is locked on your screen.
    const pv = g.player.inVehicle;
    if (pv?.netGhost) { g.exitVehicle(true); this.toast(`LOCKED - ${this.nameOf(pv.netGhost.char).toUpperCase()}'S CAR`, 'warn'); }
    if (now - this.sentAt >= SEND_MS) { this.sentAt = now; this.sendPresence(); }
    if (now - this.tickAt >= 1000) { this.tickAt = now; this.tick(); }
    if (now - this.saveAt >= SAVE_MS) { this.saveAt = now; this.save().catch(() => {}); }
    this.ui?.update();
  }

  sendPresence() {
    const g = this.g, p = g.player, v = p.inVehicle;
    const m = { t: 'p', x: +(v ? v.x : p.x).toFixed(2), z: +(v ? v.z : p.z).toFixed(2), y: +(p.gy ?? 0).toFixed(2), f: +p.face.toFixed(3), w: p.weapon ?? null, a: p.aiming ? 1 : 0, hp: Math.round(p.hp), d: p.alive ? 0 : 1 };
    if (v) m.v = { t: v.type, x: +v.x.toFixed(2), z: +v.z.toFixed(2), h: +v.h.toFixed(3), c: /^#[0-9a-f]{6}$/i.test(v.paint ?? '') ? v.paint : '#6a2a1a', seat: p.seat ?? 0 };
    this.send(m);
  }

  tick() {
    const g = this.g;
    // Your car: the one you drive is yours (a town car you take is gone from the town for everyone).
    const v = g.player.inVehicle;
    if (v && v.driver === g.player && !v.netGhost && v !== this.myCar && !v.dead && !v.boat) {
      this.myCar = v; v.owner = this.char.name;
      if (this.seedVehicles.has(v.id) && !this.taken[v.id]) { v.shardSeed = v.id; this.taken[v.id] = this.char.id; this.sendWorld({ takeVehicle: { seed: v.id } }); }
      this.toast(`THE ${String(v.name ?? v.type).toUpperCase()} IS YOURS NOW`, 'job');
    }
    // The world: doors and windows changed here, named people killed for good, your deeds.
    const patch = {};
    const I = this.diffInteriors();
    if (I) patch.interiors = I;
    for (const e of g.events) {
      if (e.seq <= this.lastEvent) continue;
      if (e.type === 'kill' && e.by === g.player.id && !e.downed) {
        const c = g.chars.find((x) => x.id === e.victim);
        if (c?.npc && !c.npc.essential && !this.deadNpcs[c.npc.id]) { patch.deadNpc = { id: c.npc.id, name: c.npc.name }; this.deadNpcs[c.npc.id] = patch.deadNpc; }
      }
    }
    this.lastEvent = g.eventSeq;
    const C = g.society.chronicle;
    if (C.seq > this.lastChron) {
      const mine = C.query({ since: this.lastChron, actor: 'player', limit: 40 }).filter((r) => r.a === 'player');
      if (mine.length) patch.deeds = mine.reverse().map((r) => ({ verb: r.v, target: r.on || r.of || '', place: g.society.places[r.p]?.name ?? r.p ?? '', x: r.x, z: r.z, seen: r.w?.length ?? 0 }));
      this.lastChron = C.seq;
    }
    if (Object.keys(patch).length) this.sendWorld(patch);
    // Others' parked cars near you; strays from a local load swept up.
    this.updateParked(false);
    for (const c of [...g.chars]) if (typeof c.id === 'string' && c.id.startsWith('net:') && ![...this.remotes.values()].some((r) => r.avatar === c)) g.removeChar(c);
    for (const v of [...g.vehicles]) {
      if (typeof v.id !== 'string' || !v.id.startsWith('netv:')) continue;
      const id = v.id.slice(5), r = this.remotes.get(id);
      if (!v.netGhost || (!(r?.car === v) && !this.parked.has(id))) g.vehiclesSys.remove(v);
    }
    // Walking into somebody's house.
    const b = g.insideBuilding, key = b ? this.buildingKey(b) : null;
    if (key !== this.lastHouse) {
      this.lastHouse = key;
      const cl = key && this.claims[key];
      if (cl) this.toast(cl.char === this.char.id ? 'HOME' : `${cl.name.toUpperCase()}'S PLACE - CLAIMED`, cl.char === this.char.id ? 'job' : 'warn');
    }
  }

  sendWorld(patch) { this.stats.patchesOut++; this.send({ t: 'world', patch }); }

  updateParked(force) {
    const g = this.g, p = g.player;
    for (const [id, rec] of this.parked) {
      const r = this.remotes.get(id);
      if (r?.car) continue; // being driven: the presence moves it
      const d = Math.hypot(rec.car.x - p.x, rec.car.z - p.z);
      const have = g.vehicles.find((x) => x.id === `netv:${id}`);
      if (!have && d < CAR_NEAR) {
        const v = this.ghostCar(id, rec.car, rec.car.x, rec.car.z, rec.car.h);
        if (v) Object.assign(v, { x: rec.car.x, z: rec.car.z, h: rec.car.h, vx: 0, vz: 0 });
      } else if (have && d > CAR_FAR) this.parkAway(id);
      else if (have) Object.assign(have, { vx: 0, vz: 0, av: 0, hp: have.maxHp, onFire: 0 });
    }
    // A remote that parked and walked off: the car stays where they left it.
    for (const r of this.remotes.values()) if (r.car && r.avatar && !r.avatar.inVehicle) r.car = null;
  }

  parkAway(id) { const v = this.g.vehicles.find((x) => x.id === `netv:${id}`); if (v) this.g.vehiclesSys.remove(v); }

  nameOf(charId) { return this.remotes.get(charId)?.name ?? this.parked.get(charId)?.name ?? 'somebody'; }

  // ---- houses -----------------------------------------------------------------------------------------------------------
  buildingKey(b) {
    if (b.ring) return `ring:${b.id}`;
    const i = this.g.world.buildings.indexOf(b);
    return i >= 0 ? `isle:${i}` : null;
  }

  async claim() {
    const g = this.g, b = g.insideBuilding;
    if (this.state !== 'inworld') throw new Error('log in to a shard first');
    if (!b) throw new Error('stand inside the building you want to claim');
    if (b.shopName) throw new Error(`${b.shopName} is a trader's place - claim a house`);
    const key = this.buildingKey(b);
    if (!key) throw new Error('this building cannot be claimed');
    const where = (await g.api.call('state')).player?.location ?? 'a house';
    const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2;
    const m = await this.request({ t: 'claim', key, label: where, x, z }, ['claimed']);
    this.char.house = key;
    this.toast(`CLAIMED: ${String(where).toUpperCase()}`, 'job');
    return { key, claim: m.claim };
  }

  async unclaim() {
    if (this.state !== 'inworld') throw new Error('log in to a shard first');
    const key = this.char.house;
    this.send({ t: 'unclaim' });
    this.char.house = null;
    if (key) delete this.claims[key];
    return { unclaimed: key ?? null };
  }

  // ---- views for the agent API ---------------------------------------------------------------------------------------
  who() {
    const out = [];
    for (const r of this.remotes.values()) {
      const s = this.sampleAt(r), last = r.buf[r.buf.length - 1], c = r.avatar;
      out.push({ id: r.id, name: r.name, flag: r.flag, user: r.user,
        shown: c ? { x: +(c.inVehicle?.x ?? c.x).toFixed(2), z: +(c.inVehicle?.z ?? c.z).toFixed(2), face: +c.face.toFixed(2), weapon: c.weapon, alive: c.alive, vehicle: c.inVehicle?.type ?? null, avatar: c.id } : null,
        interpolated: s ? { x: +s.x.toFixed(2), z: +s.z.toFixed(2) } : null,
        latest: last ? { x: last.x, z: last.z, weapon: last.w, vehicle: last.v?.t ?? null, ageMs: Date.now() + (this.offset ?? 0) - last.at } : null,
        samples: r.buf.length });
    }
    return out;
  }

  status() {
    return { state: this.state, url: this.url, shard: this.shardName, user: this.user, char: this.char ? { id: this.char.id, name: this.char.name, flag: this.char.flag, house: this.char.house ?? null } : null,
      online: this.who().map((r) => ({ name: r.name, flag: r.flag, shown: r.shown })), parkedCars: [...this.parked].map(([id, r]) => ({ char: id, name: r.name, type: r.car.t, x: Math.round(r.car.x), z: Math.round(r.car.z) })),
      myCar: this.myCar ? { id: this.myCar.id, type: this.myCar.type } : null, claims: Object.keys(this.claims).length, deadNpcs: Object.keys(this.deadNpcs), lastSaved: this.lastSaved ?? null, stats: this.stats, clockOffsetMs: this.offset };
  }

  toast(text, kind) { try { this.g.hud.toast(text, kind); } catch {} }
}

// The boot hook (main.js): one call, after the game and its agent API exist.
export function attachShard(g) {
  const shard = new Shard(g);
  g.shard = shard;
  Object.assign(g.api.COMMANDS, shardCommands(g, shard));
  shard.ui = new ShardUI(g, shard);
  return shard;
}
