// DAMAGE YOU FEEL (rows and the why: data/damagefeel.js). vehicledamage.js keeps the parts; this turns them into what the
// driver feels and everyone sees and hears, with the HUD off:
//   apply(v, dt, fx)  from vehicledamage.effects every frame: the flats (pull, shimmy, tail swing, sag and shudder, the rim
//                     wearing), alignment, brakes, a seized engine, a dragging bumper, constant smoke; it changes fx
//                     (power, grip, pull, top, brake) and sets fx.yaw (vehicles.js adds it to the turn) and v.dmgRoll (the
//                     body's roll, vehicles.js render)
//   onHit(...)        from vehicledamage.hit: a hard front hit bends the alignment, beats the brakes, cracks the glass
//   sounds            the car you are in (driving or riding): flap / scrape / drag / steam loops, a grind when the bad
//                     brakes bite, the misfire and the blowout (ElevenLabs takes, public/audio/vehdmg, made offline)
//   fixKey(...)       on foot at a car (main.js E chain): hold E at the flat wheel, the bent front or the hanging bumper
//                     and the fix runs as a timed action (systems/actions.js) - only with the parts in your pack
//   encode / decode   the state in one integer on the presence sample: a passenger on a friend's page feels and hears it
// Horses are not vehicles (left out on purpose); boats have no tyres; a tracked hull has no air to lose.
import { ACTIONS } from '../data/actions.js';
import { ITEMS, LOOT } from '../data/items.js';
import { FLAT, RIM, ALIGN, BRAKES, HEAT, DRAG, SMOKE, GLASS, FIXES, COOLANT, FEEL_ITEMS, FEEL_LOOT, encodeDm, decodeDm } from '../data/damagefeel.js';

// The parts are items, found in the world (never handed out): registered here, seeded into the loot tables.
for (const [id, it] of Object.entries(FEEL_ITEMS)) ITEMS[id] ??= it;
for (const [t, rows] of Object.entries(FEEL_LOOT)) if (LOOT[t]) for (const r of rows) if (!LOOT[t].rows.some((q) => q[0] === r[0])) LOOT[t].rows.push(r);
for (const [k, F] of Object.entries(FIXES)) ACTIONS[`car_${k}`] ??= { label: F.label, dur: F.secs, per: 'once', noise: [3, 1.5], bang: 0, pose: 'kneel', stop: { damage: true, move: 0.7, threat: 14 }, keep: true, tool: null };

const TYRES = ['FL', 'FR', 'RL', 'RR'], BIKE_TYRES = ['FL', 'RL'];
const LOOPS = ['flap', 'scrape', 'drag', 'steam'], LOOP_KIND = { flap: 'tyre.flap', scrape: 'rim.scrape', drag: 'bumper.drag', steam: 'steam.hiss' };
const ENDS = [['F', 'front', 'bumperF', 0.5], ['R', 'rear', 'bumperR', -0.5]], WORK_ENDS = [['front', 'front', 'bumperF'], ['rear', 'rear', 'bumperR']];
const NEED = {}; for (const id of ['spare_tyre', 'car_jack', 'tyre_plug', 'brake_pads', 'wrench']) NEED[id] = `no ${(ITEMS[id] ?? FEEL_ITEMS[id])?.name.toLowerCase() ?? id}`; // the missing-part words, made once
const SPOT = { x: 0, z: 0 }; // spot()'s scratch (jobAt reads it before the next call)
const VERB = { tyre: 'Change the tyre', plug: 'Plug the tyre', align: 'Straighten the front', bumper: 'Pull the hanging bumper', brakes: 'Fit the brake pads' };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const r2 = (x) => Math.round(x * 100) / 100;

export class DamageFeel {
  constructor(game) {
    this.g = game; game.dmgFeel = this;
    this.loops = {}; for (const k of LOOPS) this.loops[k] = { node: null, want: 0, file: null };
    this.counts = { blowouts: 0, rimsGone: 0, seized: 0, bumpersTorn: 0, fixes: 0, grinds: 0, misfires: 0 };
    this.jobs = new Map(); // job key -> the one job object (the held-E logic knows a target by identity)
    this.st = { flat: {}, rimGone: {}, smoke: false, steam: false, leak: false, dragF: false, dragR: false, seized: false, pullL: false, pullR: false, brakes: false }; // encode scratch
  }
  tyresOf(v) { return v.bike ? BIKE_TYRES : TYRES; }
  // Which vehicles have air in their tyres to lose.
  tyred(v) { return !v.boat && !v.tracked && !v.trailer; }
  // The extra damage state, on the car's own dmg record.
  ensure(d) { d.rim ??= { FL: 1, FR: 1, RL: 1, RR: 1 }; d.align ??= 0; d.brakes ??= 1; d.drag ??= { F: 0, R: 0 }; d.phase ??= 0; d.trail ??= { FL: 0, FR: 0, RL: 0, RR: 0 }; d.netDrag ??= { F: false, R: false }; return d; }

  // ---- a hit (vehicledamage.hit): what a crash bends beyond the dent ------------------------------------------------
  onHit(v, zone, k, kind, lx) {
    const d = this.ensure(v.dmg), g = this.g;
    if (kind === 'crash' && zone === 'front' && k > 0.12) {
      d.align = clamp(d.align + Math.sign(lx || (Math.random() - 0.5)) * k * ALIGN.perHit, -1, 1); // pulled toward the struck side
      d.brakes = Math.max(0, d.brakes - k * BRAKES.perHit);
      if (g.carCombat?.layout?.(v)) g.carCombat.damageWindow(v, 'front', k * GLASS.perHit, null); // the windshield cracks (carcombat shows the web)
    }
  }
  // A tyre gone (vehicledamage.popTyre): the bang you hear.
  onBlowout(v) { this.counts.blowouts++; return this.near(v) && !!this.g.audio?.sample?.('vehdmg', 'tyre.blowout', { x: v.x, z: v.z, range: 60 }); } // true: the recorded bang played (no synth one on top)
  onMisfire(v) { this.counts.misfires++; return !!this.g.audio?.sample?.('vehdmg', 'engine.misfire', { x: v.x, z: v.z, range: 45 }); }
  near(v) { const p = this.g.player; return Math.hypot(v.x - p.x, v.z - p.z) < 80; }

  // ---- every frame (vehicledamage.effects): the feel ------------------------------------------------------------------
  apply(v, dt, fx) {
    const g = this.g, d = this.ensure(v.dmg), ghost = !!v.netGhost; // a friend's car: its state is their page's (decode); here it is only shown
    // Its speed from its own motion (a friend's car on this page is moved, not driven: the same answer for both).
    const mv = Math.hypot(v.x - (v.fpx ?? v.x), v.z - (v.fpz ?? v.z)) / Math.max(dt, 1e-3); v.fpx = v.x; v.fpz = v.z;
    const sp = v.fsp = (v.fsp ?? 0) * 0.8 + Math.min(mv, 60) * 0.2, spK = clamp(sp / 12, 0, 1.5);
    d.phase += sp / FLAT.wheelR * dt; // the wheel's turning: the shudder keeps time with it
    let roll = 0, yaw = 0, nFlat = 0, scrape = false, flap = false;
    v.feelFlats = 0;
    if (this.tyred(v)) {
      const k = v.utility?.runflat ? FLAT.runflat : 1;
      for (const t of this.tyresOf(v)) {
        if (d.tyres[t] > 0) continue;
        nFlat++;
        const front = t[0] === 'F', side = t[1] === 'L' ? 1 : -1, F = front ? FLAT.front : FLAT.rear, R = d.rim[t];
        const gone = R <= 0;
        fx.grip -= (F.grip + (gone ? RIM.gone.grip : 0)) * k;
        fx.top -= (F.top + (gone ? RIM.gone.top : 0)) * k;
        fx.pull += (v.bike ? 0 : side) * F.pull * k;
        if (front) fx.pull += Math.sin(d.phase * 1.3) * F.shimmy * k * spK * (v.bike ? 2.5 : 1);                        // the steering shimmies
        else yaw += Math.sin(d.phase * 0.9 + 1.7) * F.tail * k * spK * (v.bike ? 1.6 : 1);                              // the tail walks
        roll += (v.bike ? 0 : side * FLAT.sag) + Math.sin(d.phase + (front ? 0 : 1.3)) * FLAT.shudder * spK;            // sags onto it, shudders with it
        // Driven on, the rim wears (faster on the throttle); with nothing left the wheel is gone.
        if (sp > 0.5 && R > 0 && !ghost) {
          d.rim[t] = Math.max(0, R - sp * dt / RIM.life * (1 + Math.max(0, v.throttle ?? 0) * 0.6) * k);
          if (d.rim[t] <= 0) { this.counts.rimsGone++; d.dirty = true; g.emit?.('rimGone', { vehicle: v.id, tyre: t }); }
        }
        if (sp > 1 && Math.random() < dt * (gone ? RIM.sparks[1] : RIM.sparks[0] * spK)) this.spark(v, front ? 0.42 : -0.42, side);
        // What it leaves on the road: torn rubber smeared behind a flat, a scored groove behind a bare rim.
        if (sp > 1.5) { d.trail[t] -= sp * dt; if (d.trail[t] <= 0) { d.trail[t] = gone ? 0.35 : 0.6; this.mark(v, front ? 0.32 : -0.32, side, gone); } }
        if (gone || R < RIM.scrapeAt || sp > FLAT.flapBelow) scrape = true; else flap = true;
      }
      if (nFlat >= 4) fx.top = Math.min(fx.top, FLAT.allFour);
    }
    v.feelFlats = nFlat;
    // Alignment: a steady pull, tyres or not.
    if (Math.abs(d.align) > ALIGN.min) fx.pull += d.align * ALIGN.pull;
    // Brakes (with upkeep's wear already in fx.brake): long stops, then a fading pedal, then next to nothing.
    const b = d.brakes;
    let bm = b > BRAKES.fadeAt ? 0.6 + 0.4 * b : b > BRAKES.failAt ? 0 : BRAKES.failed;
    if (b <= BRAKES.fadeAt && b > BRAKES.failAt) { d.fadeT = (d.fadeT ?? 0) - dt; if (d.fadeT <= 0) { d.fadeT = 0.6 + Math.random() * 0.8; d.fadeK = BRAKES.fade[0] + Math.random() * (BRAKES.fade[1] - BRAKES.fade[0]); } bm = d.fadeK ?? BRAKES.fade[0]; }
    fx.brake = (fx.brake ?? 1) * bm;
    const braking = (v.throttle ?? 0) < 0 && sp > 2;
    v.feelBrake = bm; // what the pedal gives this frame (the checks read the fade)
    if (braking && b < BRAKES.grindBelow && this.inside(v)) { d.grindT = (d.grindT ?? 0) - dt; if (d.grindT <= 0) { d.grindT = 1.1; this.counts.grinds++; g.audio?.sample?.('vehdmg', 'brake.grind', { dist: 1.5, vol: 0.8 }); } }
    // Heat: past the seize point the engine locks up and gives nothing until it has cooled right down.
    if (!v.noEngine && !ghost) {
      if (!d.seized && d.temp > HEAT.seize) { d.seized = true; this.counts.seized++; g.emit?.('engineSeized', { vehicle: v.id }); }
      if (d.seized) { fx.power = 0; d.temp = Math.max(0, d.temp - (HEAT.cool + (v.throttle > 0 ? 0.02 + (1 - d.radiator) * 0.09 : 0)) * dt); /* locked up: no heat made, throttle or not */ if (d.temp < HEAT.restart) { d.seized = false; g.emit?.('engineFreed', { vehicle: v.id }); } }
      // A wrecked engine smokes all the time, black near the end.
      if (d.engine < SMOKE.below && d.engine > 0) { d.smokeT = (d.smokeT ?? 0) - dt; if (d.smokeT <= 0) { d.smokeT = SMOKE.every; g.fx?.smoke?.(v.x + Math.sin(v.h) * v.len * 0.38, 1.3, v.z + Math.cos(v.h) * v.len * 0.38, d.engine < 0.15); } }
    }
    if (ghost && d.engine < SMOKE.below) { d.smokeT = (d.smokeT ?? 0) - dt; if (d.smokeT <= 0) { d.smokeT = SMOKE.every; g.fx?.smoke?.(v.x + Math.sin(v.h) * v.len * 0.38, 1.3, v.z + Math.cos(v.h) * v.len * 0.38, d.engine < 0.15); } }
    // Boiling or seized: a white plume off the hood you can read from anywhere (vehicledamage adds its own wisps).
    if (!v.noEngine && (d.temp > 1 || d.seized)) { d.steamT = (d.steamT ?? 0) - dt; if (d.steamT <= 0) { d.steamT = 0.1; g.fx?.spawn?.(2, v.x + Math.sin(v.h) * v.len * 0.4, 1.5, v.z + Math.cos(v.h) * v.len * 0.4, (Math.random() - 0.5) * 1.2, 1.3, (Math.random() - 0.5) * 1.2, 2.4, 1.7, '#8c9498', -0.5); } }
    // A caved-in end with its bumper still on: it hangs and drags until it tears off.
    let dragging = false;
    for (let i = 0; i < ENDS.length; i++) {
      const E = ENDS[i], end = E[0], zone = E[1], part = E[2], lz = E[3];
      const hang = !v.boat && (ghost ? d.netDrag[end] : d.zones[zone] >= DRAG.from && !d.off[part]);
      if (!hang) { d.drag[end] = 0; continue; }
      d.drag[end] += sp * dt; fx.top *= DRAG.top; dragging = dragging || sp > 1.5;
      if (sp > 1.5 && Math.random() < dt * DRAG.sparks) this.spark(v, lz, 0);
      if (!ghost && d.drag[end] > DRAG.tearAfter) { g.vehDamage.detach(v, part, zone, 4); this.counts.bumpersTorn++; d.drag[end] = 0; }
    }
    fx.yaw = yaw; v.dmgRoll = roll;
    // Someone else's car going by hurt: you hear it too (a take now and then, from where it is).
    if (!this.inside(v) && sp > 2 && (nFlat || dragging)) {
      d.outT = (d.outT ?? 0) - dt;
      if (d.outT <= 0) { d.outT = 1.7; const p = g.player; if (Math.hypot(v.x - p.x, v.z - p.z) < 40) g.audio?.sample?.('vehdmg', dragging ? 'bumper.drag' : scrape ? 'rim.scrape' : 'tyre.flap', { x: v.x, z: v.z, range: 40, vol: 0.6 }); }
    }
    // The car you are in: its loops.
    if (this.inside(v)) {
      const L = this.loops;
      L.flap.want = flap ? clamp(0.25 + sp / 14, 0, 1) : 0;
      L.scrape.want = scrape && sp > 0.8 ? clamp(0.3 + sp / 20, 0, 1) : 0;
      L.drag.want = dragging ? clamp(0.3 + sp / 18, 0, 1) : 0;
      L.steam.want = d.temp > 1 || d.seized ? 0.7 : 0;
      L.rate = clamp(0.7 + sp / 30, 0.7, 1.6);
      this.inCar = v;
    }
  }
  inside(v) { const p = this.g.player; return p?.inVehicle === v; }
  mark(v, lz, side, groove) {
    const c = Math.cos(v.h), s = Math.sin(v.h), lx = side * v.wid * 0.42, z = lz * v.len;
    this.g.fx?.decal?.(v.x + lx * c + z * s, v.z - lx * s + z * c, groove ? 0.22 : 0.42 + Math.random() * 0.15, groove ? '#5d5852' : '#1a1816');
  }
  spark(v, lz, side) {
    const c = Math.cos(v.h), s = Math.sin(v.h), lx = side * v.wid * 0.45, z = lz * v.len;
    this.g.fx?.spawn?.(1, v.x + lx * c + z * s, 0.15, v.z - lx * s + z * c, (Math.random() - 0.5) * 5, 1.6, (Math.random() - 0.5) * 5, 0.32, 0.09, '#ffd060', 14);
  }

  // ---- the loops (once a frame, main.js) -------------------------------------------------------------------------------
  update() {
    const g = this.g, A = g.audio, p = g.player;
    if (this.inCar && p.inVehicle !== this.inCar) { for (const k of LOOPS) this.loops[k].want = 0; this.inCar = null; }
    if (!A?.ctx) return;
    for (const k of LOOPS) {
      const L = this.loops[k];
      if (L.want > 0.01 && !L.node) {
        if (!L.file) { const r = A.preload ? A.preload('vehdmg', LOOP_KIND[k]) : []; const f = r.find((b) => b && typeof b.then !== 'function' && b !== 'failed'); if (!f) continue; L.buf = f; }
        L.node = A.loopNode(L.buf, 0, this.loops.rate ?? 1); L.on = true;
      }
      if (L.node) {
        L.node.g.gain.setTargetAtTime(L.want * 0.55, A.ctx.currentTime, 0.12);
        L.node.src.playbackRate.setTargetAtTime(this.loops.rate ?? 1, A.ctx.currentTime, 0.2);
        if (L.want <= 0.01) { A.fadeOut(L.node, 0.4); L.node = null; L.buf = null; }
      }
    }
  }
  // What the loops are doing (the agent; the checks read it with audio off).
  sound() { const o = {}; for (const k of LOOPS) o[k] = r2(this.loops[k].want); return o; }

  // ---- the fixes, on foot at the car -----------------------------------------------------------------------------------
  // The spot to kneel at for each job: a wheel (by tyre), the front, an end with a hanging bumper.
  spot(v, at, t = null, out = SPOT) {
    const c = Math.cos(v.h), s = Math.sin(v.h);
    const lx = at === 'wheel' ? (t[1] === 'L' ? 1 : -1) * (v.wid / 2 + 0.3) : 0, lz = at === 'wheel' ? (t[0] === 'F' ? 1 : -1) * v.len * 0.32 : (at === 'rear' ? -1 : 1) * (v.len / 2 + 0.5);
    out.x = v.x + lx * c + lz * s; out.z = v.z - lx * s + lz * c; return out;
  }
  // A part on you or in that car's trunk (a spare lives in the trunk: it does not fit a pocket).
  has(id, v = null) { const I = this.g.inventory; if (!id) return true; return (I?.carried?.count(id) ?? 0) > 0 || (id === 'wrench' && !!I?.hasTag?.('wrench')) || (!!v && (I?.trunk?.(v)?.count(id) ?? 0) > 0); }
  spend(id, v) {
    const I = this.g.inventory;
    if ((I.carried.count(id) ?? 0) > 0) { I.spend(id, 1); return; }
    const T = v && I.trunk(v), i = T ? T.slots.findIndex((q) => q.id === id) : -1;
    if (i >= 0) { I.take(T, i, 1); I.changed?.(); }
  }
  // What can be done from where you stand: the first job whose spot is in reach. { job, t, x, z, why (missing part) }.
  job(v, o) {
    const key = `${v.id}:${o.job}:${o.t ?? o.end ?? ''}`;
    let J = this.jobs.get(key); if (!J) { J = { key }; this.jobs.set(key, J); if (this.jobs.size > 64) this.jobs.delete(this.jobs.keys().next().value); }
    return Object.assign(J, o);
  }
  jobAt(v, p) {
    const d = v.dmg; if (!d || v.dead || v.netGhost) return null; // a friend's car is theirs to fix
    this.ensure(d);
    const g = this.g;
    if (this.jobV === v && g.time - (this.jobT ?? -9) < 0.2 && Math.abs(p.x - this.jobX) + Math.abs(p.z - this.jobZ) < 0.25) return this.jobLast; // asked a few times a second while you stand still
    this.jobV = v; this.jobT = g.time; this.jobX = p.x; this.jobZ = p.z; this.jobLast = this.findJob(v, p, d);
    return this.jobLast;
  }
  findJob(v, p, d) {
    const near = (q) => Math.hypot(q.x - p.x, q.z - p.z) < 1.7;
    if (this.tyred(v)) for (const t of this.tyresOf(v)) {
      if (d.tyres[t] > 0) continue;
      const q = this.spot(v, 'wheel', t); if (!near(q)) continue;
      const plug = d.rim[t] >= FIXES.plug.rimMin && this.has('tyre_plug', v) && !(this.has('spare_tyre', v) && this.has('car_jack', v));
      const job = plug ? 'plug' : 'tyre', F = FIXES[job];
      const why = !this.has(F.item, v) ? NEED[F.item] : !this.has(F.tool, v) ? NEED[F.tool] : null;
      return this.job(v, { job, t, x: q.x, z: q.z, why });
    }
    for (const [end, zone, part] of WORK_ENDS) {
      const q = this.spot(v, end); if (!near(q)) continue;
      if (d.zones[zone] >= DRAG.from && !d.off[part]) return this.job(v, { job: 'bumper', end, part, zone, x: q.x, z: q.z, why: !this.has('wrench') ? NEED.wrench : null });
      if (end === 'front' && Math.abs(d.align) > ALIGN.min) return this.job(v, { job: 'align', x: q.x, z: q.z, why: !this.has('wrench') ? NEED.wrench : null });
      if (end === 'front' && d.brakes < 0.7) return this.job(v, { job: 'brakes', x: q.x, z: q.z, why: !this.has('brake_pads', v) ? NEED.brake_pads : !this.has('wrench') ? NEED.wrench : null });
    }
    return null;
  }
  // main.js E chain, on foot beside a car: true when it took the key (a job here).
  // Only E is the job's: without it held (or the job running) it only leaves a hint for the car's own prompt (main.js
  // shows F / C / G with it), so the driver's door still opens beside a flat front wheel.
  fixKey(p, v, I, dt) {
    const g = this.g, A = g.actions; this.hint = '';
    if (!A || p.inVehicle) return false;
    const J = this.jobAt(v, p); if (!J) return false;
    const F = FIXES[J.job], key = `fix:${J.key}`, busy = A.cur?.target === J;
    this.hint = J.why ? ` · ${VERB[J.job]}: <b class="warn">${J.why}</b>` : ` · hold <kbd>E</kbd> ${VERB[J.job]}`;
    if (J.why || (!I.key('KeyE') && !busy)) return false;
    A.touch?.();
    const k = A.press(J, I, dt);
    if (k === 'hold') {
      const c = A.start(`car_${J.job}`, { key, target: J, x: J.x, z: J.z, label: F.label, onDone: () => this.finish(v, J) });
      if (c) A.tick(dt, true);
      if (A.cur) g.hud.prompt(`${F.label}… ${Math.round(Math.min(1, A.cur.t / A.cur.need) * 100)}%`);
      return true;
    }
    if (A.cur?.target === J) A.tick(dt, false);
    g.hud.prompt(`hold <kbd>E</kbd> ${VERB[J.job]}`);
    return true;
  }
  // The job done: the parts spent, the car put right where that job reaches.
  finish(v, J) {
    const g = this.g, d = this.ensure(v.dmg), F = FIXES[J.job], inv = g.inventory;
    if ((F.item && !this.has(F.item, v)) || (F.tool && !this.has(F.tool, v))) { g.hud.toast(`${F.label.toUpperCase()} · THE PARTS ARE GONE`, 'warn'); return; }
    if (F.item) this.spend(F.item, v);
    if (F.tool) g.actions?.wear?.(F.tool, 0.05); // the jack, the wrench: they wear with use
    if (J.job === 'tyre') { d.tyres[J.t] = 1; d.rim[J.t] = 1; }        // a spare on its own rim
    else if (J.job === 'plug') d.tyres[J.t] = FIXES.plug.gives;
    else if (J.job === 'align') d.align = 0;
    else if (J.job === 'brakes') d.brakes = 1;
    else if (J.job === 'bumper') { g.vehDamage.detach(v, J.part, J.zone, 2); d.drag[J.end === 'front' ? 'F' : 'R'] = 0; } // it comes off in your hands
    d.dirty = true; this.counts.fixes++;
    g.emit('carFixed', { vehicle: v.id, job: J.job, tyre: J.t ?? null });
    g.hud.toast(`${F.label.replace(/ing\b/, 'ed').toUpperCase()}`, 'job');
  }
  // A jug of coolant poured (inventory act 'coolant'): into the car you are in or beside.
  coolant(v) {
    const d = v?.dmg; if (!d || v.noEngine) return { ok: false, why: v ? 'it has no engine to cool' : 'no vehicle close enough' };
    if (d.temp < 0.3 && d.radiator > 0.95) return { ok: false, why: 'it is running cool already' };
    d.temp = Math.max(0, Math.min(d.temp - COOLANT.drop, HEAT.restart - 0.05)); d.radiator = Math.max(d.radiator, Math.min(COOLANT.leakCap, d.radiator + COOLANT.radiator)); // cooled under the restart line; the stop-leak slows a hole, it does not mend it
    if (d.seized) { d.seized = false; this.g.emit('engineFreed', { vehicle: v.id }); }
    return { ok: true, text: 'COOLANT IN' };
  }

  // ---- multiplayer -----------------------------------------------------------------------------------------------------
  encode(v) {
    const d = v.dmg; if (!d) return 0;
    this.ensure(d); const s = this.st;
    for (const t of TYRES) { s.flat[t] = d.tyres[t] <= 0; s.rimGone[t] = d.tyres[t] <= 0 && d.rim[t] <= 0; }
    s.smoke = !v.noEngine && d.engine < SMOKE.below; s.steam = d.temp > 1 || !!d.seized; s.leak = d.tank < 0.65;
    s.dragF = v.netGhost ? d.netDrag.F : d.zones.front >= DRAG.from && !d.off.bumperF; s.dragR = v.netGhost ? d.netDrag.R : d.zones.rear >= DRAG.from && !d.off.bumperR;
    s.seized = !!d.seized; s.pullL = d.align > ALIGN.min; s.pullR = d.align < -ALIGN.min; s.brakes = d.brakes < BRAKES.fadeAt;
    return encodeDm(s);
  }
  // A friend's car on this page takes the state their page sends: what you see from outside, and feel riding in it.
  decode(v, n) {
    const d = v.dmg; if (!d || v.lastDm === n) return; v.lastDm = n;
    this.ensure(d); const s = decodeDm(n);
    for (const t of TYRES) { d.tyres[t] = s.flat[t] ? 0 : Math.max(d.tyres[t], 0.5); d.rim[t] = s.rimGone[t] ? 0 : s.flat[t] ? Math.min(d.rim[t], 0.9) : 1; }
    d.engine = s.smoke ? Math.min(d.engine, 0.25) : Math.max(d.engine, 0.5);
    d.temp = s.steam ? Math.max(d.temp, 1.05) : Math.min(d.temp, 0.6); d.seized = s.seized;
    d.tank = s.leak ? Math.min(d.tank, 0.5) : Math.max(d.tank, 0.7);
    d.netDrag.F = s.dragF; d.netDrag.R = s.dragR; // a hanging bumper as their page has it (the dents stay what this page saw)
    d.align = s.pullL ? 0.4 : s.pullR ? -0.4 : 0; d.brakes = s.brakes ? 0.3 : 1;
    d.dirty = true;
  }

  view(v) {
    const d = v?.dmg; if (!d) return null;
    this.ensure(d);
    return { flats: TYRES.filter((t) => d.tyres[t] <= 0), rim: Object.fromEntries(TYRES.map((t) => [t, r2(d.rim[t])])), align: r2(d.align), brakes: r2(d.brakes), seized: !!d.seized, temp: r2(d.temp),
      drag: { F: Math.round(d.drag.F), R: Math.round(d.drag.R) }, roll: r2(v.dmgRoll ?? 0), speed: r2(v.fsp ?? 0), sound: this.inside(v) ? this.sound() : null, dm: this.encode(v) };
  }
}
