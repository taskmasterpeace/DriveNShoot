import { CAR_UPKEEP as U, GARAGE_BAYS as GB } from '../data/survival.js';

// Car upkeep (data/survival.js CAR_UPKEEP, GARAGE_BAYS; docs/design/WEB_SURVIVAL.md §3.12). Fuel, the radiator and the
// engine's heat were already vehicledamage.js's; this adds what a car costs to keep:
//   v.oil   0..1 of a full sump, burnt with the engine running; low, the engine runs hot and wears; dry, it dies
//   v.wear  { tyres, brakes, engine } 0 new .. 1 gone: tyres by the km (more sliding), brakes by the stop, the engine by
//           the hour (more boiling, more on low oil)
//   the desert's heat on the radiator: a car flat out at noon runs near the boil where at night it runs cool
//   garages: parked inside one, a car is out of the weather and put right over time; parked in the open, it weathers
// It reaches the car only through vehicledamage.effects' own modifiers (power, grip, top) and one braking multiplier
// (vehicles.js drive): the driving model itself is untouched.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const over = (x, from) => Math.max(0, (x - from) / (1 - from));
const hash01 = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };

export class Upkeep {
  constructor(game) { this.g = game; this.acc = 0; this.posts = {}; }
  on() { return this.g.survival?.prof?.upkeep !== false; }

  init(v) {
    if (v.wear) return;
    v.oil = U.oil.start[0] + (U.oil.start[1] - U.oil.start[0]) * hash01(String(v.id ?? v.type));
    v.wear = { tyres: 0, brakes: 0, engine: 0 };
    v.odo = 0; v.lastX = v.x; v.lastZ = v.z; v.warnedUp = {};
  }
  // The air's heat on a radiator: 0 on a cool night, ~1 at the afternoon high.
  heatK() {
    const N = this.g.needs, air = N?.air ?? 20;
    return clamp((air - U.ambient.from) / U.ambient.span, 0, 1.3) + (this.g.sky?.weatherKey === 'DUST' ? U.ambient.dust / U.ambient.load : 0);
  }

  // From vehicledamage.effects (every car, every frame it is simulated), after fuel and the radiator: the desert's heat,
  // the oil, the wear, and what they cost through the same modifiers (fx.power, grip, top; fx.brake for vehicles.js).
  tick(v, dt, fx) {
    this.init(v);
    const g = this.g, d = v.dmg, w = v.wear;
    const dist = Math.hypot(v.x - v.lastX, v.z - v.lastZ);
    v.lastX = v.x; v.lastZ = v.z;
    if (!this.on() || !d) return fx;
    const running = !!v.driver && !v.dead && v.fuel > 0 && d.engine > 0;
    const hours = dt * g.sky.timeScale * (g.sky.fast ? 40 : 1);
    const W = U.wear;
    if (dist < 5) { // (a teleport is not a drive)
      v.odo += dist;
      const skid = v.handbrake && dist / Math.max(dt, 1e-6) > 6;
      w.tyres = Math.min(1, w.tyres + W.tyresPerKm * (dist / 1000) * (skid ? W.skid : 1));
      if (v.throttle < 0 && dist / Math.max(dt, 1e-6) > 1) w.brakes = Math.min(1, w.brakes + W.brakesPerSec * dt * (dist / Math.max(dt, 1e-6)) / 20);
    }
    if (running) {
      const low = v.oil < U.oil.low;
      v.oil = Math.max(0, v.oil - (U.oil.burn + U.oil.wornBurn * w.engine) * hours);
      w.engine = Math.min(1, w.engine + W.enginePerHour * hours * (d.temp > 1 ? W.hot : 1) * (low ? U.oil.lowWear : 1));
      // The air's heat: extra heat under throttle, and a floor the engine can't cool below (heat soak); low oil cools worse.
      const k = this.heatK();
      if (v.throttle > 0) d.temp += dt * U.ambient.load * k * v.throttle;
      if (low) d.temp += dt * 0.05 * (1 - U.oil.lowCool) * d.temp * (v.throttle > 0 ? 1 : 0.5);
      d.temp = Math.max(d.temp, U.ambient.soak * Math.min(1, k));
      if (v.oil <= 0) { fx.power *= U.oil.dryPower; if (v.throttle > 0) d.engine = Math.max(0, d.engine - U.oil.dryEngine * dt * v.throttle); }
    }
    fx.grip *= 1 - W.tyres.grip * over(w.tyres, W.tyres.from);
    fx.brake = 1 - W.brakes.brake * over(w.brakes, W.brakes.from);
    const e = over(w.engine, W.engine.from);
    fx.power *= 1 - W.engine.power * e; fx.top *= 1 - W.engine.top * e;
    if (v.driver === g.player) this.warn(v);
    return fx;
  }
  warn(v) {
    const g = this.g, Wn = U.warn, f = v.warnedUp;
    const say = (key, on, text) => { if (on && !f[key]) { f[key] = true; g.hud?.toast?.(text, 'warn'); g.emit('upkeep', { vehicle: v.id, warn: key }); } else if (!on) f[key] = false; };
    say('oil', v.oil < Wn.oil, v.oil <= 0 ? 'OIL DRY · THE ENGINE IS EATING ITSELF' : 'OIL LOW · TOP IT UP');
    say('tyres', v.wear.tyres > Wn.tyres, 'TYRES WORN · LESS GRIP');
    say('brakes', v.wear.brakes > Wn.brakes, 'BRAKES WORN · STOPS LONGER');
    say('engine', v.wear.engine > Wn.engine, 'ENGINE WORN · A GARAGE CAN SEE TO IT');
  }

  // Twice a second: cars parked in a garage are put right; cars left out in the open weather.
  update(dt) {
    if ((this.acc += dt) < 0.5) return;
    const real = this.acc; this.acc = 0;
    if (!this.on()) return;
    const g = this.g, hours = real * g.sky.timeScale * (g.sky.fast ? 40 : 1);
    for (const v of g.vehicles) {
      if (v.dead || v.sunk || !v.dmg) continue;
      this.init(v);
      const parked = !v.driver && g.vehiclesSys.speed(v) < 0.3;
      if (!parked) { v.bay = null; continue; }
      const bay = this.bayAt(v.x, v.z);
      v.bay = bay?.name ?? null;
      if (bay) this.restore(v, hours);
      else for (const k of ['tyres', 'brakes', 'engine']) v.wear[k] = Math.min(1, v.wear[k] + U.parked.weather * hours);
    }
  }
  // Where a row's garage stands: a fixed spot, or the spot its mechanic works from (read once, where they started).
  post(P) {
    if (this.posts[P.id]) return this.posts[P.id];
    if (P.x !== undefined) return (this.posts[P.id] = { x: P.x, z: P.z });
    const c = this.g.chars.find((ch) => ch.npc?.id === P.npc);
    if (!c) return null;
    const x = c.home?.x ?? c.x, z = c.home?.z ?? c.z;
    // The yard is the mechanic's own building and `yard` m of ground round it (a car parks at the walls, not inside).
    const b = this.g.world?.buildings?.find((B) => x > B.minX && x < B.maxX && z > B.minZ && z < B.maxZ);
    return (this.posts[P.id] = { x, z, box: b ? { minX: b.minX - P.yard, maxX: b.maxX + P.yard, minZ: b.minZ - P.yard, maxZ: b.maxZ + P.yard } : null });
  }
  // The garage at (x, z), or null: a row's yard, or a WORKSHOP's bay out in the Phoenix ring.
  bayAt(x, z) {
    for (const P of GB.places) {
      const at = this.post(P);
      if (!at) continue;
      if (at.box ? x > at.box.minX && x < at.box.maxX && z > at.box.minZ && z < at.box.maxZ : Math.hypot(x - at.x, z - at.z) < P.yard) return P;
    }
    if ((Math.abs(x) > 464 || Math.abs(z) > 464) && GB.ringKinds.length) {
      const b = this.g.streamer?.ringBuildingAt?.(x, z);
      if (b && GB.ringKinds.includes(b.kind)) return { id: b.id, name: 'WORKSHOP BAY' };
    }
    return null;
  }
  // A garage's work over `hours`: wear back, oil topped up, the parts and the dents mended, the hull patched.
  restore(v, hours) {
    const R = GB.per, w = v.wear, d = v.dmg;
    for (const k of ['tyres', 'brakes', 'engine']) w[k] = Math.max(0, w[k] - R.wear * hours);
    v.oil = Math.min(1, v.oil + R.oil * hours);
    for (const k of ['engine', 'radiator', 'tank', 'lights']) d[k] = Math.min(1, d[k] + R.parts * hours);
    for (const t of Object.keys(d.tyres)) if (d.tyres[t] < 1) { d.tyres[t] = Math.min(1, d.tyres[t] + R.parts * hours); d.dirty = true; }
    for (const z of Object.keys(d.zones)) if (d.zones[z] > 0) { d.zones[z] = Math.max(0, d.zones[z] - R.dents * hours); d.dirty = true; d.deformT = 0; }
    d.temp = 0;
    if (v.maxHp) v.hp = Math.min(v.maxHp, v.hp + v.maxHp * R.parts * hours);
  }

  // Motor oil poured in (survival.useItem): the car you sit in or stand beside.
  oilUp(amount) {
    const g = this.g, P = g.player;
    const v = P.inVehicle ?? g.vehicles.find((c) => !c.dead && !c.sunk && Math.hypot(c.x - P.x, c.z - P.z) < Math.max(3.4, c.len * 0.65));
    if (!v) return { ok: false, why: 'no vehicle close enough to pour it into' };
    this.init(v);
    if (v.oil >= 0.97) return { ok: false, why: 'the oil is already full' };
    v.oil = Math.min(1, v.oil + amount);
    g.emit('upkeep', { vehicle: v.id, oil: +v.oil.toFixed(2) });
    return { ok: true, text: `OIL ${Math.round(v.oil * 100)}%` };
  }

  // The dash's warning lights for the car you are in (ui/telltales.js): oil, heat, tyres, brakes, engine, fuel.
  telltales(v, add) {
    if (!v?.dmg) return;
    this.init(v);
    const Wn = U.warn, w = v.wear, d = v.dmg;
    const lvl = (x, at) => (x >= at + (1 - at) * 0.66 ? 4 : x >= at + (1 - at) * 0.33 ? 3 : 2);
    if (v.oil < Wn.oil) add('c_oil', 'oil', v.oil <= 0 ? 'OIL DRY' : 'OIL LOW', v.oil <= 0 ? 4 : 3, `Oil ${Math.round(v.oil * 100)}%: motor oil tops it up`);
    if (d.temp > Wn.temp) add('c_temp', 'engineHot', d.temp > 1 ? 'BOILING' : 'RUNNING HOT', d.temp > 1 ? 4 : 2, `Engine ${Math.round(d.temp * 100)}°: ease off, it's the heat of the day`);
    if (w.tyres > Wn.tyres) add('c_tyres', 'tyre', 'TYRES WORN', lvl(w.tyres, Wn.tyres), `Tread ${Math.round((1 - w.tyres) * 100)}%`);
    if (w.brakes > Wn.brakes) add('c_brakes', 'brake', 'BRAKES WORN', lvl(w.brakes, Wn.brakes), `Pads ${Math.round((1 - w.brakes) * 100)}%`);
    if (w.engine > Wn.engine) add('c_engine', 'engine', 'ENGINE WORN', lvl(w.engine, Wn.engine), `Engine wear ${Math.round(w.engine * 100)}%`);
    if (v.fuelCap && v.fuel / v.fuelCap < Wn.fuel) add('c_fuel', 'fuel', v.fuel <= 0 ? 'NO FUEL' : 'FUEL LOW', v.fuel <= 0 ? 4 : 3, `${Math.round(v.fuel)} of ${v.fuelCap} L`);
    const bay = v.bay ?? this.bayAt(v.x, v.z)?.name;
    if (bay) add('c_bay', 'wrench', bay, 1, 'A garage: leave it parked here and it is put right over time', true);
  }

  view(v) {
    this.init(v);
    const r2 = (x) => Math.round(x * 100) / 100;
    return { oil: r2(v.oil), wear: { tyres: r2(v.wear.tyres), brakes: r2(v.wear.brakes), engine: r2(v.wear.engine) }, engineTemp: r2(v.dmg?.temp ?? 0), odoKm: r2(v.odo / 1000), bay: v.bay ?? this.bayAt(v.x, v.z)?.name ?? null, heatK: r2(this.heatK()) };
  }
  save() {
    const out = {};
    for (const v of this.g.vehicles) if (v.wear) out[v.id] = { oil: v.oil, wear: { ...v.wear }, odo: v.odo };
    return out;
  }
  load(s) {
    if (!s) return;
    for (const v of this.g.vehicles) { const r = s[v.id]; if (!r) continue; this.init(v); v.oil = r.oil ?? v.oil; Object.assign(v.wear, r.wear ?? {}); v.odo = r.odo ?? 0; v.lastX = v.x; v.lastZ = v.z; }
  }
}
