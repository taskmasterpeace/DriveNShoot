import { BINDINGS, PAD, RUMBLE } from '../data/controls.js';
import { angleLerp } from './rng.js';

// THE CONTROLLER (docs/design/WEB_CONTROLLER.md). Folds the binding rows (data/controls.js) and the player's rebinds into
// the input layer, polls the gamepad (twin-stick: left stick moves, right stick aims, RT fires and is the gas at the wheel,
// LT brakes), and answers the verbs that have no legacy key code (holster, grip, fire mode, melee, the weapon wheel).
//
//   poll(dt)       top of every frame: the pad's buttons become the canonical codes main.js reads, its sticks the
//                  analog move/aim/drive values below, the context (foot, drive, ride, talk, menu, radial) picks the rows
//   aimAt(p, dt)   main.js after the mouse ray: with the pad in hand, the aim point comes from the right stick
//   held/hit/tap   a verb's state this frame, from any of its keys, mouse buttons or pad buttons
//   rumble(kind)   dual-rumble on the pad (and the record a test reads: lastRumble)
//   bind/reset     rebinding (the CONTROLS panel, the `controls` command); persisted to localStorage
//
// The pad can be a real one (navigator.getGamepads) or `virtual` ({ axes: [lx, ly, rx, ry], buttons: { a: 1, rt: 0.8 } }),
// which the `pad` command and the selftest set: the same path from there on.
const STORE = 'dsoa.bindings';
export const BUTTONS = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15 };
const NB = 17;
export const CONTEXTS = ['foot', 'drive', 'ride', 'talk', 'menu', 'radial'];
const STICK_KEYS = [['KeyW', 1, -1], ['KeyS', 1, 1], ['KeyA', 0, -1], ['KeyD', 0, 1]]; // [code, axis, sign] for ride/menu

function load() { try { return JSON.parse(localStorage.getItem(STORE) ?? '{}') ?? {}; } catch { return {}; } }
function save(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch { /* private window */ } }

// Radial dead zone then a response curve, along the stick's own direction (a diagonal is never faster).
export function shape(x, y, Z) {
  const m = Math.hypot(x, y);
  if (!(m > Z.inner)) return { x: 0, y: 0, mag: 0 };
  const t = Math.min(1, (m - Z.inner) / (Z.outer - Z.inner)), mag = Math.pow(t, Z.curve);
  return { x: (x / m) * mag, y: (y / m) * mag, mag };
}

export class Controls {
  constructor(game) {
    this.g = game; this.I = game.input;
    this.overrides = load();
    this.rows = []; this.byId = {};
    this.virtual = null;
    this.pad = { connected: false, id: '', index: -1, axes: [0, 0, 0, 0], v: new Float32Array(NB), mapping: '' };
    this.prev = new Float32Array(NB);
    this.device = 'kb'; this.padT = -1e9;
    this.ctx = 'foot';
    this.move = { x: 0, z: 0, mag: 0 };
    this.aimStick = { x: 0, z: 0, mag: 0 };
    this.drive = { throttle: 0, steer: 0, rt: 0, lt: 0 };
    this.aimAng = 0; this.aimReach = PAD.aim.rest; this.assisted = null;
    this.trig = { rt: false, lt: false };
    this.st = {};            // id -> { held, hit, up, t, pad, padHit }
    this.padCodes = new Map(); // row id -> canonical code the pad holds for it
    this.stickHeld = new Set();
    this.spent = new Set();    // buttons held across a context change: dead until let go
    this.backUsed = false; this.backWas = false;
    this.sprintLatch = false; this.latchIdle = 0;
    this.lastRumble = null; this.rumbles = 0;
    this.seq = 0;
    this.fold();
  }

  // ---- the rows -------------------------------------------------------------------------------------------------
  fold() {
    this.rows = BINDINGS.map((r) => {
      const o = this.overrides[r.id];
      return { ...r, keys: [...(o?.keys ?? r.keys)], pad: { ...r.pad, ...(o?.pad ?? {}) } };
    });
    this.byId = Object.fromEntries(this.rows.map((r) => [r.id, r]));
    for (const r of this.rows) this.st[r.id] ??= { held: false, hit: false, up: false, t: 0, pad: false, padHit: false };
    // Physical key -> the canonical codes it emits: every row that binds it emits its code; a key that is nobody's
    // canonical code also passes through as itself (F3, Escape's neighbours, a key a new verb took).
    const canon = new Set(this.rows.filter((r) => r.code).map((r) => r.code)), map = new Map();
    for (const r of this.rows) if (r.code) for (const k of r.keys) {
      if (k.startsWith('mouse:') || k === 'wheel') continue;
      if (!map.has(k)) map.set(k, []);
      if (!map.get(k).includes(r.code)) map.get(k).push(r.code);
    }
    this.I.remap = (P) => { const out = [...(map.get(P) ?? [])]; if (!canon.has(P) && !out.includes(P)) out.push(P); return out; };
    this.version = (this.version ?? 0) + 1;
  }

  // Rebind a verb: keys (physical codes / mouse:left / mouse:right) and/or its pad button for one context.
  bind(id, { keys, pad, ctx = 'foot' } = {}) {
    const r = this.byId[id];
    if (!r) return { ok: false, why: `no action "${id}"` };
    const o = (this.overrides[id] ??= {});
    if (keys) o.keys = keys.filter(Boolean);
    if (pad !== undefined) { o.pad = { ...(o.pad ?? {}) }; o.pad[ctx] = pad || undefined; }
    save(this.overrides); this.fold();
    return { ok: true, action: this.view(id), clashes: this.clashes(id) };
  }
  reset(id) { if (id) delete this.overrides[id]; else this.overrides = {}; save(this.overrides); this.fold(); return { ok: true }; }
  // Other verbs on the same key, or the same pad button in the same context (allowed - E is talk and horn - but shown).
  clashes(id) {
    const r = this.byId[id], out = [];
    for (const o of this.rows) {
      if (o === r) continue;
      const keys = o.keys.filter((k) => r.keys.includes(k));
      const pads = Object.keys(r.pad).filter((c) => r.pad[c] && o.pad[c] === r.pad[c]);
      if (keys.length || pads.length) out.push({ id: o.id, keys, pad: pads });
    }
    return out;
  }
  view(id) { const r = this.byId[id]; return r && { id: r.id, label: r.label, group: r.group, code: r.code, keys: r.keys, pad: Object.fromEntries(Object.entries(r.pad).filter(([, v]) => v)), rebound: !!this.overrides[id] }; }

  // ---- per frame ---------------------------------------------------------------------------------------------------
  readPad() {
    const P = this.pad;
    let src = this.virtual;
    if (!src && typeof navigator !== 'undefined' && navigator.getGamepads) {
      const list = navigator.getGamepads();
      for (const gp of list) if (gp?.connected) { src = gp; break; }
    }
    this.prev.set(P.v);
    if (!src) { P.connected = false; P.v.fill(0); P.axes[0] = P.axes[1] = P.axes[2] = P.axes[3] = 0; return; }
    P.connected = true; P.id = src.id ?? 'virtual pad'; P.index = src.index ?? -1; P.mapping = src.mapping ?? 'standard'; P.real = src !== this.virtual ? src : null;
    for (let i = 0; i < 4; i++) P.axes[i] = +(src.axes?.[i] ?? 0) || 0;
    const B = src.buttons;
    if (Array.isArray(B) || (B && typeof B.length === 'number')) for (let i = 0; i < NB; i++) { const b = B[i]; P.v[i] = typeof b === 'number' ? b : b ? (b.pressed ? Math.max(b.value ?? 1, 0.99) : b.value ?? 0) : 0; }
    else { P.v.fill(0); for (const k in B ?? {}) if (k in BUTTONS) P.v[BUTTONS[k]] = +B[k] || 0; }
  }

  context() {
    const g = this.g, p = g.player;
    if (g.invUI?.open || g.workshopUI?.open) return 'menu'; // the PACK screen, the WORKSHOP screen
    if (g.dialogue?.active) return 'talk';
    if (g.arms?.radialOpen) return 'radial';
    if (p?.inVehicle) return p.inVehicle.driver === p ? 'drive' : 'ride';
    if (p?.grabbing || p?.onTrain) return 'ride';
    return 'foot';
  }

  // A pad button's state: triggers with hysteresis, the rest at half travel.
  btn(name) {
    const i = BUTTONS[name], v = this.pad.v[i];
    if (this.spent.has(i)) return false;
    if (name === 'rt' || name === 'lt') { const T = PAD.trigger; this.trig[name] = this.trig[name] ? v > T.release : v > T.press; return this.trig[name]; }
    return v > 0.5;
  }
  was(name) { const i = BUTTONS[name], v = this.prev[i]; return name === 'rt' || name === 'lt' ? v > PAD.trigger.press : v > 0.5; }

  poll(dt) {
    const I = this.I, now = performance.now();
    this.readPad();
    const P = this.pad;
    // Who has the hands: a pad touched recently, until a key or the mouse is used again.
    let touched = false;
    if (P.connected) {
      for (let i = 0; i < NB; i++) if (P.v[i] > 0.3) touched = true;
      if (Math.hypot(P.axes[0], P.axes[1]) > PAD.move.inner || Math.hypot(P.axes[2], P.axes[3]) > PAD.aim.inner) touched = true;
    }
    if (touched) this.padT = now;
    this.device = P.connected && this.padT > I.lastKbT - PAD.idleSwitch * 1000 && now - this.padT < 60000 ? 'pad' : 'kb';
    const ctx = this.context();
    // A button held across a change of context (Y gets you out of the car, and Y on foot gets you back in) means nothing
    // in the new one until it is let go.
    if (ctx !== this.ctx) { const wheel = ctx === 'radial' || this.ctx === 'radial'; this.ctx = ctx; this.sprintLatch = false; if (!wheel) for (let i = 0; i < NB; i++) if (P.v[i] > 0.3) this.spent.add(i); } // the wheel keeps RB
    for (const i of this.spent) if (P.v[i] <= 0.3) this.spent.delete(i);

    // Sticks.
    const m = shape(P.axes[0], P.axes[1], PAD.move), a = shape(P.axes[2], P.axes[3], PAD.aim);
    this.move.x = m.x; this.move.z = m.y; this.move.mag = ctx === 'foot' ? m.mag : 0;
    if (ctx !== 'foot') { this.move.x = 0; this.move.z = 0; }
    this.aimStick.x = a.x; this.aimStick.z = a.y; this.aimStick.mag = a.mag;
    const T = PAD.trigger, rt = Math.max(0, (P.v[BUTTONS.rt] - T.inner) / (1 - T.inner)), lt = Math.max(0, (P.v[BUTTONS.lt] - T.inner) / (1 - T.inner));
    this.drive.rt = rt; this.drive.lt = lt;
    this.drive.throttle = ctx === 'drive' ? rt - lt : 0;
    this.drive.steer = ctx === 'drive' ? -m.x : 0; // + steers left on screen

    // VIEW is a modifier: held, the face buttons and the D-pad read their back+ chords; tapped alone, it is the map.
    const back = this.btn('back');
    if (back && !this.backWas) this.backUsed = false;

    for (const r of this.rows) {
      const s = this.st[r.id];
      let desc = r.pad[ctx];
      if (desc && ctx === 'drive') { // the Whaler's RB is the harpoon; any other car's RB cycles the guns
        const harp = !!this.g.player?.inVehicle?.harpoon;
        if ((r.id === 'harpoon' && !harp) || (r.id === 'wheel' && harp)) desc = null;
      }
      let on = false, rose = false;
      if (desc === 'back') {
        // The map on a clean tap of VIEW (no chord was used while it was down).
        rose = !back && this.backWas && !this.backUsed; on = rose;
      } else if (desc) {
        const chord = desc.startsWith('back+'), name = chord ? desc.slice(5) : desc;
        on = this.btn(name) && (chord ? back : !back);
        rose = on && !(s.pad);
        if (chord && on) this.backUsed = true;
      }
      // Pad Y on foot is the smart USE: the car in reach (and nobody to talk to) means F.
      if (r.id === 'interact' && ctx === 'foot' && on && rose && this.carInReach()) { this.pulse('KeyF'); on = false; rose = false; }
      s.padHit = rose; s.pad = on;
      const code = r.code;
      if (code) {
        // The sprint latch: L3 clicks running on; it drops when the stick comes home (or the throttle at the wheel).
        if (r.id === 'sprint') {
          if (rose) this.sprintLatch = !this.sprintLatch;
          const idle = ctx === 'drive' ? this.drive.throttle <= 0.05 : this.move.mag < 0.15;
          this.latchIdle = idle ? this.latchIdle + dt : 0;
          if (this.latchIdle > 0.35) this.sprintLatch = false;
          on = this.sprintLatch; rose = false;
        }
        const tag = `pad:${r.id}`;
        if (on && !this.padCodes.has(r.id)) { I.hold(code, tag); I.pressed.add(code); this.padCodes.set(r.id, code); }
        else if (!on && this.padCodes.has(r.id)) { I.release(this.padCodes.get(r.id), tag); this.padCodes.delete(r.id); }
        else if (rose) I.pressed.add(code);
      }
    }
    this.backWas = back;

    // Ride and menus walk on the left stick as if it were WASD (the train roof, the PACK list).
    for (const [code, ax, sign] of STICK_KEYS) {
      const v = ctx === 'ride' || ctx === 'menu' ? P.axes[ax] * sign : 0, on = v > 0.55, was = this.stickHeld.has(code);
      if (on && !was) { I.hold(code, 'stick'); I.pressed.add(code); this.stickHeld.add(code); }
      else if (!on && was && v < 0.4) { I.release(code, 'stick'); this.stickHeld.delete(code); }
    }

    // The trigger: the pad's fire is the left mouse button to the guns (handleShooting, the hood gun).
    const fire = this.st.fire, keyFire = this.anyKey(this.byId.fire);
    const padFire = !!fire.pad || keyFire;
    if (padFire && !I.mouse.padLeft) I.mouse.leftPressed = true;
    I.mouse.padLeft = padFire;
    I.mouse.left = I.mouse.physLeft || padFire;

    // Every verb's state from all its sources (the new verbs read these; the legacy ones read their codes).
    for (const r of this.rows) {
      const s = this.st[r.id];
      const held = this.anyKey(r) || s.pad;
      const hit = this.anyHit(r) || s.padHit;
      s.up = s.held && !held;
      s.tapUp = s.up && s.t < PAD.holdTime;
      s.t = held ? (s.held ? s.t + dt : 0) : s.t;
      s.held = held; s.hit = hit;
    }
    this.watchEvents();
  }

  anyKey(r) {
    const I = this.I;
    for (const k of r.keys) {
      if (k === 'mouse:left') { if (r.id !== 'fire' && I.mouse.physLeft) return true; continue; }
      if (k === 'mouse:right') { if (I.mouse.physRight) return true; continue; }
      if (k === 'wheel') continue;
      if (I.phys.has(k)) return true;
    }
    return false;
  }
  anyHit(r) {
    const I = this.I;
    for (const k of r.keys) {
      if (k === 'mouse:left') { if (r.id !== 'fire' && I.mouse.leftPressed && I.mouse.physLeft) return true; continue; }
      if (k === 'mouse:right') { if (I.mouse.rightPressed) return true; continue; }
      if (k === 'wheel') continue;
      if (I.physHit.has(k)) return true;
    }
    return false;
  }
  held(id) { return !!this.st[id]?.held; }
  hit(id) { return !!this.st[id]?.hit; }
  heldFor(id) { const s = this.st[id]; return s?.held ? s.t : 0; }
  tapped(id) { return !!this.st[id]?.tapUp; } // let go before it counted as a hold
  released(id) { return !!this.st[id]?.up; }
  padHeld(id) { return !!this.st[id]?.pad; }

  // A one-frame press of a canonical code (smart USE, the map on a VIEW tap).
  pulse(code) { this.I.pressed.add(code); }

  carInReach() {
    const g = this.g, p = g.player;
    for (const c of g.chars) {
      if (c === p || !c.alive || c.inVehicle || c.faction === 'raider') continue;
      if (Math.abs(c.x - p.x) < 2.8 && Math.abs(c.z - p.z) < 2.8 && Math.hypot(c.x - p.x, c.z - p.z) < 2.8) return false;
    }
    for (const v of g.vehicles) if (!v.dead && Math.hypot(v.x - p.x, v.z - p.z) - v.len * 0.3 < 4.2) return true;
    return false;
  }

  // ---- the aim -------------------------------------------------------------------------------------------------------
  // With the pad in hand: the right stick points the aim, its tilt sets the reach; at rest the aim keeps its line (or
  // follows where you walk). Aim assist bends it a few degrees toward a person on the line - the pad only, never the mouse.
  aimAt(p, dt, origin = p) {
    if (this.device !== 'pad' || this.g.arms?.radialOpen) { this.assisted = null; return false; } // the wheel has the stick
    const A = PAD.aim, s = this.aimStick;
    if (s.mag > 0) {
      const want = Math.atan2(s.x, s.z);
      const diff = Math.abs(angleLerp(this.aimAng, want, 1) - this.aimAng);
      this.aimAng = diff > 1.4 ? want : angleLerp(this.aimAng, want, 1 - Math.exp(-dt * A.turn)); // a flick snaps
      this.aimReach = A.reach[0] + (A.reach[1] - A.reach[0]) * s.mag;
    } else if (this.move.mag > 0.3) {
      this.aimAng = angleLerp(this.aimAng, Math.atan2(this.move.x, this.move.z), 1 - Math.exp(-dt * A.turn * 0.5));
      this.aimReach += (A.rest - this.aimReach) * Math.min(1, dt * 4);
    } else this.aimReach += (A.rest - this.aimReach) * Math.min(1, dt * 2);
    let ang = this.aimAng;
    const t = this.assistTarget(origin, ang);
    this.assisted = t?.c ?? null;
    if (t) {
      const d = angleLerp(ang, t.ang, 1) - ang, max = (PAD.assist.maxDeg * Math.PI) / 180;
      ang += Math.max(-max, Math.min(max, d * PAD.assist.pull));
    }
    const g = this.g;
    g.aim.x = origin.x + Math.sin(ang) * this.aimReach;
    g.aim.z = origin.z + Math.cos(ang) * this.aimReach;
    return true;
  }

  assistTarget(o, ang) {
    const g = this.g, w = g.arms?.row?.(g.inv.current), range = w?.range ?? 40, cone = (PAD.assist.cone * Math.PI) / 180;
    let best = null, bd = Infinity;
    for (const c of g.chars) {
      if (c === g.player || !c.alive || c.inVehicle || c.hidden || c.faction === 'ally') continue;
      const dx = c.x - o.x, dz = c.z - o.z;
      if (Math.abs(dx) > range || Math.abs(dz) > range) continue;
      const d = Math.hypot(dx, dz);
      if (d < PAD.assist.minRange || d > range) continue;
      const a = Math.atan2(dx, dz), off = Math.abs(angleLerp(ang, a, 1) - ang);
      if (off > cone) continue;
      if (!g.storeys.sameFloor(g.player, c) || !g.los(o.x, o.z, c.x, c.z)) continue;
      const score = off * 20 + d * 0.05;
      if (score < bd) { bd = score; best = { c, ang: a }; }
    }
    return best;
  }

  // ---- rumble ----------------------------------------------------------------------------------------------------------
  rumble(kind, amount = 0) {
    const R = RUMBLE[kind];
    if (!R) return;
    const strong = Math.min(1, R.strong + (R.strong ? R.per * amount : 0)), weak = Math.min(1, R.weak + (R.strong ? 0 : R.per * amount));
    this.lastRumble = { kind, strong: +strong.toFixed(2), weak: +weak.toFixed(2), ms: R.ms, t: +this.g.time.toFixed(2) };
    this.rumbles++;
    const act = this.pad.real?.vibrationActuator;
    if (act?.playEffect) try { act.playEffect('dual-rumble', { duration: R.ms, strongMagnitude: strong, weakMagnitude: weak }); } catch { /* not every pad rumbles */ }
  }
  watchEvents() {
    const g = this.g, E = g.events;
    if (!E.length) return;
    const last = E[E.length - 1].seq;
    if (last <= this.seq) return;
    for (let i = E.length - 1; i >= 0 && E[i].seq > this.seq; i--) {
      const e = E[i];
      if (e.type === 'hurt') this.rumble('hurt', e.amount ?? 10);
      else if (e.type === 'detonated' && Math.hypot(e.x - g.player.x, e.z - g.player.z) < 28) this.rumble('blast');
      else if (e.type === 'vehicleDamage') this.rumble('crash');
    }
    this.seq = last;
  }

  // ---- for the agent API ---------------------------------------------------------------------------------------------
  state() {
    const P = this.pad, r2 = (v) => +v.toFixed(2);
    return {
      device: this.device, context: this.ctx,
      pad: { connected: P.connected, id: P.id, virtual: !!this.virtual, axes: P.axes.map(r2), buttons: Object.fromEntries(Object.entries(BUTTONS).filter(([, i]) => P.v[i] > 0.05).map(([k, i]) => [k, r2(P.v[i])])) },
      move: { x: r2(this.move.x), z: r2(this.move.z), mag: r2(this.move.mag) }, aim: { ang: r2(this.aimAng), reach: r2(this.aimReach), assisted: this.assisted?.id ?? null },
      drive: { throttle: r2(this.drive.throttle), steer: r2(this.drive.steer) }, sprintLatch: this.sprintLatch,
      held: Object.keys(this.st).filter((k) => this.st[k].held), lastRumble: this.lastRumble, rumbles: this.rumbles,
    };
  }
}
