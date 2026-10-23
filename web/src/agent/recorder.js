// THE RECORDER (docs/design/WEB_OBSERVER.md §3.3): a compact ring buffer of where the player was, what they held down,
// and everything the game said happened (g.events), sampled on the GAME clock at a coarse rate (REC.rate, 4 Hz).
//
//   tick()        main.js, once per simulated frame (after the systems, before input.endFrame): a time check, and on a
//                 sample frame ~16 numbers written into preallocated Float32Arrays. Taps between samples are OR-ed
//                 from input.pressed (usually empty). Nothing allocates unless an event happened.
//   session()     the ring as plain JSON (columns, rounded), the shape saved to web/sessions/<id>.json
//   parse(s)      any saved session back to typed columns; at(S, t) interpolates; heat(S, layer, cell) bins it
//
// Replays are reads of a session, never a re-simulation: AI and spread use Math.random, so inputs alone cannot
// reproduce a run. The positions are the truth; inputs and events say why.

export const REC = {
  rate: 4,          // samples per game second
  cap: 36000,       // samples kept (2.5 game hours at 4 Hz, ~1.6 MB of Float32)
  evCap: 6000,      // events kept
  autosaveS: 120,   // a person's tab (not ?agent=1) writes its session to disk this often, once it has a minute in it
  minAutosave: 60,  // game seconds recorded before the first autosave
  heatCell: 8,      // metres per heatmap cell
};

export const COLS = ['t', 'x', 'z', 'h', 'hp', 'spd', 'flags', 'keys', 'aim', 'gy'];
export const FLAG = { veh: 1, dead: 2, fire: 4, sprint: 8, crouch: 16, inside: 32, auto: 64, swim: 128, hurt: 256, throw: 512 };
// Keys worth knowing about, one bit each (held at the sample, or tapped since the last one).
const KEY_LIST = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Shift', 'Control', 'Space', 'KeyE', 'KeyF', 'KeyR', 'KeyG', 'KeyV', 'KeyQ', 'Tab', 'MouseL', 'MouseR'];
export const KEYS = Object.fromEntries(KEY_LIST.map((k, i) => [k, 1 << i]));
const KEYBIT = { ...KEYS, ShiftLeft: KEYS.Shift, ShiftRight: KEYS.Shift, ControlLeft: KEYS.Control, ControlRight: KEYS.Control, KeyI: KEYS.Tab };
// Payload keys an event keeps in the recording (the rest are dropped to keep sessions small).
const KEEP = ['victim', 'victimName', 'by', 'byFaction', 'faction', 'cause', 'verb', 'target', 'targetName', 'id', 'name', 'tpl', 'event', 'phase', 'outcome',
  'role', 'from', 'to', 'item', 'n', 'side', 'trader', 'amount', 'witness', 'witnessName', 'kind', 'house', 'vehicle', 'vehicleType', 'msg', 'text', 'standing', 'delta', 'mag', 'weapon', 'level', 'state'];
// Events placed at someone else's position when they carry no x,z of their own.
const WHO = ['victim', 'id', 'witness', 'npc'];

const r2 = (v) => Math.round(v * 100) / 100;
const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export class Recorder {
  constructor(g, { cap = REC.cap, rate = REC.rate } = {}) {
    this.g = g;
    this.cap = cap;
    this.col = Object.fromEntries(COLS.map((k) => [k, new Float32Array(cap)]));
    this.events = [];
    this.on = true;
    this.id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    this.started = new Date().toISOString();
    this.setRate(rate);
    this.reset(false);
    this.saved = null; // { at, path } of the last write to disk
  }

  setRate(rate) { this.rate = Math.max(0.5, Math.min(30, rate)); this.period = 1 / this.rate; }

  reset(newId = true) {
    this.head = 0; this.n = 0; this.total = 0;
    this.events.length = 0; this.evDropped = 0;
    this.nextT = this.g.time ?? 0;
    this.lastSeq = this.g.eventSeq ?? 0;
    this.tap = 0; this.wasAlive = true; this.lastMag = -1; this.lastWeapon = null; this.lastThrow = -1; this.lastHp = this.g.player?.hp ?? 100;
    if (newId) { this.id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`; this.started = new Date().toISOString(); }
  }

  // ---- per frame (main.js) --------------------------------------------------------------------------------------
  tick() {
    if (!this.on) return;
    const I = this.g.input;
    if (I.pressed.size) for (const k of I.pressed) { const b = KEYBIT[k]; if (b) this.tap |= b; }
    if (I.mouse.leftPressed) this.tap |= KEYS.MouseL;
    if (this.g.time < this.nextT) return;
    // Far behind (a long pause in step, a load): one sample now, not a burst of identical ones.
    this.nextT = this.g.time - this.nextT > this.period * 4 ? this.g.time + this.period : this.nextT + this.period;
    this.sample();
  }

  sample() {
    const g = this.g, p = g.player, v = p.inVehicle, I = g.input, i = this.head, C = this.col;
    let flags = 0, keys = this.tap;
    this.tap = 0;
    for (const k in KEYBIT) if (I.down.has(k)) keys |= KEYBIT[k]; // a dozen Set lookups, four times a second
    if (I.mouse.left) keys |= KEYS.MouseL;
    if (I.mouse.right) keys |= KEYS.MouseR;
    if (v) flags |= FLAG.veh;
    if (!p.alive) flags |= FLAG.dead;
    if (p.sprinting || ((I.down.has('ShiftLeft') || I.down.has('ShiftRight')) && !v)) flags |= FLAG.sprint;
    if (p.crouch) flags |= FLAG.crouch;
    if (g.insideBuilding) flags |= FLAG.inside;
    if (g.autopilot || g.driveOverride || g.aimOverride) flags |= FLAG.auto;
    if (p.underwater || g.lastWet === 'swim') flags |= FLAG.swim;
    // Fired since the last sample: the rounds in the gun in hand went down (a reload only ever raises it).
    const w = g.inv.current, mag = g.inv.mag?.[w] ?? 0;
    if (w === this.lastWeapon && mag < this.lastMag) flags |= FLAG.fire;
    this.lastWeapon = w; this.lastMag = mag;
    let thr = 0; for (const k in g.inv.throwables) thr += g.inv.throwables[k];
    if (this.lastThrow >= 0 && thr < this.lastThrow) flags |= FLAG.throw;
    this.lastThrow = thr;
    if (p.hp < this.lastHp - 0.5) flags |= FLAG.hurt;
    this.lastHp = p.hp;
    C.t[i] = g.time; C.x[i] = v ? v.x : p.x; C.z[i] = v ? v.z : p.z; C.h[i] = v ? v.h : p.face; C.hp[i] = p.hp;
    C.spd[i] = v ? Math.hypot(v.vx, v.vz) : Math.hypot(p.vx ?? 0, p.vz ?? 0);
    C.flags[i] = flags; C.keys[i] = keys;
    C.aim[i] = Math.atan2(g.aim.x - p.x, g.aim.z - p.z);
    C.gy[i] = p.gy ?? 0;
    this.head = (i + 1) % this.cap; if (this.n < this.cap) this.n++; this.total++;
    // What happened since the last sample (g.events is a 500-ring; at 4 Hz it never laps between samples).
    if (g.eventSeq !== this.lastSeq) {
      const E = g.events;
      let j = E.length - 1;
      while (j >= 0 && E[j].seq > this.lastSeq) j--;
      for (j++; j < E.length; j++) this.keep(E[j]);
      this.lastSeq = g.eventSeq;
    }
    if (!p.alive && this.wasAlive) this.keep({ seq: 0, t: +g.time.toFixed(2), type: 'playerDied', x: p.x, z: p.z, by: p.lastAttacker?.id ?? null });
    this.wasAlive = p.alive;
  }

  keep(e) {
    const g = this.g, p = g.player;
    const o = { s: e.seq, t: e.t, y: e.type };
    for (const k of KEEP) if (e[k] !== undefined && e[k] !== null && typeof e[k] !== 'object') o[k] = e[k];
    let x = e.x, z = e.z;
    if (Array.isArray(e.hub) && x === undefined) { x = e.hub[0]; z = e.hub[1]; }
    if (!Number.isFinite(x)) for (const k of WHO) {
      const id = e[k]; if (typeof id !== 'string') continue;
      const c = g.chars.find((q) => q.id === id || q.npc?.id === id);
      if (c) { x = c.x; z = c.z; break; }
    }
    if (!Number.isFinite(x)) { x = p.x; z = p.z; o.at = 'player'; }
    o.x = r2(x); o.z = r2(z);
    o.px = r2(p.x); o.pz = r2(p.z);
    if (e.victim === p.id || e.id === p.id) o.you = 1; // done to the player
    if (e.by === p.id) o.byYou = 1;                    // done by the player
    this.events.push(o);
    if (this.events.length > REC.evCap) { this.events.splice(0, this.events.length - REC.evCap); this.evDropped++; }
  }

  // ---- reading the ring -----------------------------------------------------------------------------------------
  index(k) { return (this.head - this.n + k + this.cap) % this.cap; } // k-th oldest sample

  // The ring as plain JSON. last=<seconds> keeps only the tail.
  session({ last } = {}) {
    const n = this.n, C = this.col;
    let k0 = 0;
    if (last > 0 && n) { const tEnd = C.t[this.index(n - 1)]; while (k0 < n && C.t[this.index(k0)] < tEnd - last) k0++; }
    const cols = {};
    for (const key of COLS) {
      const a = new Array(n - k0), src = C[key], round = key === 'flags' || key === 'keys' ? (v) => v : key === 'h' || key === 'aim' ? (v) => Math.round(v * 1000) / 1000 : r2;
      for (let k = k0; k < n; k++) a[k - k0] = round(src[this.index(k)]);
      cols[key] = a;
    }
    const t0 = cols.t[0] ?? 0, t1 = cols.t[cols.t.length - 1] ?? 0;
    const g = this.g;
    return {
      v: 1, kind: 'dsoa-session', id: this.id, started: this.started, savedAt: new Date().toISOString(), rate: this.rate,
      agentTab: new URLSearchParams(location.search).has('agent'), n: n - k0, t0, t1, seconds: r2(t1 - t0), samplesTotal: this.total,
      cols, flagBits: FLAG, keyBits: KEYS,
      events: this.events.filter((e) => e.t >= t0 - 0.5), eventsDropped: this.evDropped,
      end: { day: g.society?.day ?? 0, clock: g.sky?.clock, cash: g.cash, wanted: g.wanted, kills: g.stats?.kills ?? 0 },
    };
  }

  view() {
    const n = this.n, C = this.col, last = n ? this.index(n - 1) : -1;
    return { on: this.on, id: this.id, started: this.started, rate: this.rate, samples: n, cap: this.cap, samplesTotal: this.total,
      seconds: n ? r2(C.t[last] - C.t[this.index(0)]) : 0, events: this.events.length, eventsDropped: this.evDropped,
      memKB: Math.round((COLS.length * this.cap * 4) / 1024), last: n ? { t: r2(C.t[last]), x: r2(C.x[last]), z: r2(C.z[last]) } : null, saved: this.saved };
  }
}

// ---- sessions as data (shared by the game's replay command and the observer page) -----------------------------
export function parseSession(s) {
  if (!s || s.v !== 1 || !s.cols?.t) throw new Error('not a dsoa session (v1)');
  const n = s.cols.t.length, cols = {};
  for (const k of COLS) cols[k] = Float32Array.from(s.cols[k] ?? new Array(n).fill(0));
  return { ...s, n, cols };
}

// The player at game time t: positions and heading interpolated between the two samples around it.
export function sessionAt(S, t) {
  const T = S.cols.t, n = S.n;
  if (!n) return null;
  if (t <= T[0]) return frame(S, 0, 0, 0);
  if (t >= T[n - 1]) return frame(S, n - 1, n - 1, 0);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
  const span = T[hi] - T[lo];
  return frame(S, lo, hi, span > 0 ? (t - T[lo]) / span : 0);
}
function frame(S, a, b, k) {
  const C = S.cols, L = (q) => C[q][a] + (C[q][b] - C[q][a]) * k;
  return { t: r2(L('t')), x: r2(L('x')), z: r2(L('z')), h: +lerpAng(C.h[a], C.h[b], k).toFixed(3), hp: Math.round(L('hp')), spd: r2(L('spd')), gy: r2(L('gy')),
    flags: C.flags[k < 0.5 ? a : b], keys: C.keys[k < 0.5 ? a : b], aim: +lerpAng(C.aim[a], C.aim[b], k).toFixed(3), i: k < 0.5 ? a : b };
}

export const HEAT_LAYERS = ['went', 'died', 'fought'];
const FOUGHT = new Set(['kill', 'hurt', 'downed', 'thrown', 'detonated', 'fire', 'convoyEngaged', 'windowShot']);
const DIED = new Set(['playerDied']);

// Bin a session (or several) into cells: went = game seconds spent there, died = deaths, fought = shots, hits taken,
// kills and blasts (a kill counts where the victim fell, a hit where you stood).
export function heatmap(list, layer = 'went', cell = REC.heatCell) {
  const bins = new Map();
  const add = (x, z, w) => { const k = `${Math.floor(x / cell)},${Math.floor(z / cell)}`; bins.set(k, (bins.get(k) ?? 0) + w); };
  for (const S of Array.isArray(list) ? list : [list]) {
    const C = S.cols, n = S.n;
    if (layer === 'went') for (let i = 0; i < n; i++) add(C.x[i], C.z[i], i + 1 < n ? Math.min(2, C.t[i + 1] - C.t[i]) : 1 / (S.rate || REC.rate));
    if (layer === 'fought') for (let i = 0; i < n; i++) if (C.flags[i] & (FLAG.fire | FLAG.hurt | FLAG.throw)) add(C.x[i], C.z[i], 1);
    for (const e of S.events ?? []) {
      if (layer === 'died' && DIED.has(e.y)) add(e.x, e.z, 1);
      if (layer === 'fought' && FOUGHT.has(e.y) && (e.y !== 'kill' || e.byYou || e.you)) add(e.x, e.z, e.y === 'kill' ? 2 : 1);
    }
  }
  let max = 0, total = 0;
  for (const v of bins.values()) { if (v > max) max = v; total += v; }
  return { layer, cell, bins, max, total };
}
