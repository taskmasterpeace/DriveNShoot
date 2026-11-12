// WAGONS (VEHICLES V2 slice 7; rows in data/wagons.js). A covered wagon is a vehicle row with no engine (noEngine): its
// pace is its team's. A horse from the horses ledger (yours, standing near) is hitched at the tongue; while hitched the
// horse's body walks at the tongue, nose ahead, at the wagon's speed (the horses system leaves it be: H.hitched), and the
// wagon's maxSpeed/accel are the team's (data/wagons.js teamPace). Nothing hitched: it does not move.
// You drive it from the box (its seats); you walk into its covered bed by the open back (data/wagons.js WAGON_DECK, the
// decks system). The bonnet is the body's roof (vehiclebodies ROOF): cut away while you are inside, as a van's is.
// Placed once, the first time you come near (data/wagons.js WAGONS); a hitched team rides the save (horse ids by wagon id).
import { VEHICLES } from './vehicles.js';
import { HULLS } from './movetowbodies.js';
import { DECKS } from '../data/decks.js';
import { BREEDS } from '../data/horses.js';
import { WAGON_ROW, WAGON_DECK, TEAM, WAGONS, teamPace } from '../data/wagons.js';

VEHICLES.wagon ??= WAGON_ROW;
DECKS.wagonBed ??= WAGON_DECK;
HULLS.wagon ??= wagonBody;

const STILL = 0.01; // a wagon with no team: a top speed of (almost) nothing, never 0
const WOOD = '#6b4a2e', WOOD_DARK = '#4a3220', CANVAS = '#d8cfb4', CANVAS_SHADE = '#b9ae92', IRON = '#2a2826', SPOKE = '#5a3e26';

export class Wagons {
  constructor(game) {
    this.g = game;
    game.wagons = this;
    this.placed = new Set();
    this.teams = new Map(); // wagon id -> [horse id, ...]
    this.vref = new Map();  // wagon id -> its vehicle (a cache: the vehicles list is not searched every frame)
    this.counts = { placed: 0, hitched: 0, unhitched: 0 };
    this._spot = null;
  }
  // The wagons the world has, put down once (the first frame; far ones are just parked vehicles).
  place() {
    const P = this.g.player;
    for (const w of WAGONS) {
      if (this.placed.has(w.id) || Math.hypot(P.x - w.x, P.z - w.z) > 300) continue; // put down when you first come near
      if (this.g.vehicles.some((q) => q.wagonRow === w.id)) { this.placed.add(w.id); continue; } // already standing (a load brought it back)
      const v = this.g.vehiclesSys.spawn('wagon', w.x, w.z, w.h, w.paint);
      if (v) { v.wagonRow = w.id; this.counts.placed++; }
      this.placed.add(w.id);
    }
  }
  teamOf(v) { return (this.teams.get(v.id) ?? []).map((id) => this.g.horses.get(id)).filter((H) => H && H.alive); }
  // The tongue's end in the world, and where the n-th horse of a team of `count` stands.
  tongue(v, out) { const o = v.len / 2 + TEAM.tongue; out.x = v.x + Math.sin(v.h) * o; out.z = v.z + Math.cos(v.h) * o; return out; }
  slot(v, i, count, out) {
    const o = v.len / 2 + TEAM.ahead, side = count > 1 ? (i === 0 ? TEAM.pair : -TEAM.pair) : 0, c = Math.cos(v.h), s = Math.sin(v.h);
    out.x = v.x + s * o + c * side; out.z = v.z + c * o - s * side; return out;
  }
  // Re-set the wagon's pace from what is hitched (data/wagons.js teamPace).
  // The team's pace, worked out when the team changes and kept on the wagon (re-applied every frame without allocating: the
  // garage's retune and a net ghost reset the row's numbers). Never a top speed of 0: vehicles.drive divides by it.
  pace(v) { const t = teamPace(this.teamOf(v).map((H) => H.breed), BREEDS); v.wagonPace = { maxSpeed: Math.max(STILL, t.maxSpeed), accel: t.accel }; v.maxSpeed = v.wagonPace.maxSpeed; v.accel = v.wagonPace.accel; return t; }

  hitch(v, H) {
    const team = this.teams.get(v.id) ?? [];
    if (team.length >= TEAM.max) return { ok: false, why: 'the tongue takes two' };
    if (H.hitched || H.npcRider || this.g.player.mount === H) return { ok: false, why: `${H.name} is not free to hitch` };
    team.push(H.id); this.teams.set(v.id, team);
    H.hitched = v.id; H.tied = null;
    this.pace(v); this.counts.hitched++;
    this.g.emit?.('wagonHitched', { wagon: v.id, horse: H.id, team: team.length });
    return { ok: true, text: `${H.name.toUpperCase()} HITCHED · THE WAGON GOES AT ${Math.round(v.maxSpeed * 3.6)} KM/H` };
  }
  unhitch(v) {
    const team = this.teams.get(v.id) ?? []; if (!team.length) return { ok: false, why: 'nothing hitched' };
    const H = this.g.horses.get(team.pop());
    if (!team.length) this.teams.delete(v.id);
    if (H) { H.hitched = null; const t = this.tongue(v, { x: 0, z: 0 }); H.tied = { x: t.x, z: t.z }; } // left tied at the tongue
    this.pace(v); this.counts.unhitched++;
    this.g.emit?.('wagonUnhitched', { wagon: v.id, horse: H?.id ?? null });
    return { ok: true, text: `${H?.name?.toUpperCase() ?? 'THE HORSE'} UNHITCHED · TIED AT THE TONGUE` };
  }
  // Your free horse nearest the tongue (a horse you own, not ridden, not hitched), within TEAM.lead of it.
  freeHorse(v) {
    const t = this.tongue(v, this._t ??= { x: 0, z: 0 });
    let best = null, bd = TEAM.lead;
    for (const H of this.g.horses.list) {
      if (!H.alive || H.owner !== 'player' || H.hitched || H.npcRider || this.g.player.mount === H) continue;
      const d = Math.hypot(H.x - t.x, H.z - t.z); if (d < bd) { bd = d; best = H; }
    }
    return best;
  }
  // E on foot at a wagon's tongue: hitch your horse that stands near, or unhitch. { verb, v, h, text } or null.
  footSpot(p) {
    if (p.inVehicle || p.mount || p.onDeck || !p.alive) return null; // in the bed: E is the bed's (the chest)
    const t = this._p ??= { x: 0, z: 0 };
    for (const v of this.g.vehicles) {
      if (v.type !== 'wagon' || v.dead || Math.abs(v.x - p.x) > 10 || Math.abs(v.z - p.z) > 10) continue;
      this.tongue(v, t);
      if (Math.hypot(t.x - p.x, t.z - p.z) > TEAM.reach) continue;
      const team = this.teams.get(v.id) ?? [], H = team.length < TEAM.max ? this.freeHorse(v) : null;
      if (H) return this.spot('hitch', v, H, `<kbd>E</kbd> Hitch ${H.name} to the wagon`);
      if (team.length) return this.spot('unhitch', v, null, `<kbd>E</kbd> Unhitch the team (${team.length})`);
      return this.spot('none', v, null, 'The wagon\'s tongue · bring a horse of yours alongside to hitch it');
    }
    return null;
  }
  spot(verb, v, h, text) { const c = this._spot; if (c && c.verb === verb && c.v === v && c.h === h) return c; return (this._spot = { verb, v, h, text }); }
  use(s) { if (!s || s.verb === 'none') return { ok: false, why: s?.text ?? 'nothing here' }; return s.verb === 'hitch' ? this.hitch(s.v, s.h) : this.unhitch(s.v); }

  // Every frame: the team walks at the tongue (its body placed and moving with the wagon), the wagon keeps the team's pace.
  update(dt) {
    if (!this.g.horses?.enabled) return;
    if (this.placed.size < WAGONS.length) this.place();
    const Hs = this.g.horses, o = this._o ??= { x: 0, z: 0 }, vs = this.g.vehicles;
    for (const [id, team] of this.teams) {
      let v = this.vref.get(id); if (!v || v.id !== id || !vs.includes(v)) { v = null; for (const q of vs) if (q.id === id) { v = q; break; } if (v) this.vref.set(id, v); }
      if (!v || v.dead) { for (const hid of team) { const H = Hs.get(hid); if (H) H.hitched = null; } this.teams.delete(id); continue; }
      let lost = false;
      for (let i = 0; i < team.length; i++) {
        const H = Hs.get(team[i]);
        if (!H || !H.alive) { lost = true; continue; }
        const a = Hs.bodyOf(H);
        this.slot(v, i, team.length, o);
        H.x = o.x; H.z = o.z; H.face = v.h; H.v = Math.hypot(v.vx, v.vz);
        if (a) { a.x = o.x; a.z = o.z; a.face = v.h; a.vx = v.vx; a.vz = v.vz; a.speed = H.v; a.y = this.g.stunts?.heightAt?.(a.x, a.z, a.y) ?? a.y; a.state = H.v > 0.3 ? 'roam' : 'idle'; }
        H.gait = H.v > 6 ? 'canter' : H.v > 2.2 ? 'trot' : H.v > 0.2 ? 'walk' : 'stand';
      }
      if (lost) { this.teams.set(id, team.filter((hid) => Hs.get(hid)?.alive)); for (const hid of team) { const H = Hs.get(hid); if (H && !H.alive) H.hitched = null; } this.pace(v); }
      if (v.wagonPace) { v.maxSpeed = v.wagonPace.maxSpeed; v.accel = v.wagonPace.accel; }
    }
    // A wagon with no team: it does not move under its own power, and rolling it slows to a stop (the wheel brake).
    for (const v of vs) if (v.type === 'wagon' && !this.teams.has(v.id) && !v.towLine) { // (a wagon on a tow line rolls free behind its puller)
      v.maxSpeed = STILL; v.accel = 0;
      const k = Math.max(0, 1 - dt * 1.6); v.vx *= k; v.vz *= k;
    }
  }

  view() { return this.g.vehicles.filter((v) => v.type === 'wagon').map((v) => ({ id: v.id, x: Math.round(v.x), z: Math.round(v.z), team: (this.teams.get(v.id) ?? []).slice(), maxSpeed: +(v.maxSpeed ?? 0).toFixed(2), accel: +(v.accel ?? 0).toFixed(2), driver: v.driver?.id ?? null })); }
  save() { return { placed: [...this.placed], teams: [...this.teams].map(([id, t]) => [id, t.slice()]), rows: this.g.vehicles.filter((v) => v.wagonRow).map((v) => [v.id, v.wagonRow]) }; }
  load(s) {
    for (const [, team] of this.teams) for (const hid of team) { const H = this.g.horses.get(hid); if (H) H.hitched = null; }
    this.teams.clear(); this.vref.clear();
    this.placed = new Set(s?.placed ?? []);
    if (!s) { this.placed = new Set(WAGONS.map((w) => w.id)); return; } // an old save: the wagons are whatever the save's vehicles hold (none placed again)
    for (const [id, row] of s.rows ?? []) { const v = this.g.vehicles.find((q) => q.id === id); if (v) v.wagonRow = row; } // which row each wagon is
    for (const [id, team] of s.teams ?? []) { this.teams.set(id, team.slice()); for (const hid of team) { const H = this.g.horses.get(hid); if (H) H.hitched = id; } }
    for (const v of this.g.vehicles) if (v.type === 'wagon') this.pace(v);
  }
}

// ---- the body: a box bed on spoked wheels, a canvas bonnet on hoops (the roof, cut away inside), the box seat, the tongue
function wagonBody(parts, s, paint, K) {
  const { slab, beam, PART } = K, L = s.len, hw = s.wid / 2, yF = WAGON_DECK.y, z0 = -L / 2 + 0.2, z1 = L / 2 - 1.35;
  const roof = K.roofOr ? K.roofOr(parts) : parts; // the bonnet hides while you are under it (vehiclebodies ROOF)
  // The bed: floor, sides, a tailboard down at the back (the way in), the front board behind the box.
  parts.push(slab(-hw + 0.08, hw - 0.08, yF - 0.12, yF, z0, z1, WOOD_DARK));
  for (const sd of [1, -1]) {
    parts.push(slab(sd * (hw - 0.08), sd * hw, yF - 0.12, yF + 0.5, z0, z1, paint ?? WOOD, sd > 0 ? PART.doorL : PART.doorR));
    for (const z of [z0 + 0.6, (z0 + z1) / 2, z1 - 0.6]) parts.push(slab(sd * (hw - 0.02), sd * (hw + 0.03), yF - 0.12, yF + 0.5, z - 0.05, z + 0.05, IRON)); // the irons
  }
  parts.push(slab(-hw + 0.08, hw - 0.08, yF - 0.12, yF + 0.5, z1 - 0.08, z1, paint ?? WOOD));
  parts.push(slab(-hw + 0.1, hw - 0.1, yF - 0.5, yF - 0.42, z0 - 0.62, z0, WOOD, PART.bumperR)); // the tailboard, let down
  // The bonnet: hoops and canvas, gathered at the back round the opening.
  const yT = s.tall - 0.05;
  for (const z of [z0 + 0.05, z0 + 1.0, (z0 + z1) / 2, z1 - 0.9, z1 - 0.05]) {
    for (const sd of [1, -1]) roof.push(beam([sd * (hw - 0.04), yF + 0.5, z], [sd * (hw * 0.7), yT, z], 0.05, '#5a4a36', PART.frame));
    roof.push(beam([hw * 0.7, yT, z], [-hw * 0.7, yT, z], 0.05, '#5a4a36', PART.frame));
  }
  for (const sd of [1, -1]) roof.push(slab(sd * (hw * 0.78), sd * (hw - 0.02), yF + 0.5, yT - 0.05, z0, z1, sd > 0 ? CANVAS : CANVAS_SHADE));
  roof.push(slab(-hw * 0.72, hw * 0.72, yT - 0.06, yT + 0.03, z0, z1, CANVAS));
  roof.push(slab(-hw * 0.78, hw * 0.78, yF + 0.5, yT, z1 - 0.06, z1, CANVAS_SHADE)); // the front, closed
  // The box seat, the footboard, the brake lever.
  parts.push(slab(-hw + 0.05, hw - 0.05, 1.35, 1.45, z1 + 0.05, z1 + 0.75, WOOD));
  parts.push(slab(-hw + 0.05, hw - 0.05, 1.45, 1.85, z1 + 0.05, z1 + 0.12, WOOD_DARK));
  parts.push(slab(-hw + 0.15, hw - 0.15, 0.95, 1.02, z1 + 0.9, z1 + 1.3, WOOD_DARK));
  parts.push(beam([hw - 0.08, 1.0, z1 + 0.3], [hw + 0.05, 1.9, z1 + 0.25], 0.05, IRON, PART.frame));
  // Running gear: the axles, big spoked wheels behind, smaller ones in front, the tongue out to the team.
  const r0 = 0.62, r1 = 0.5, zr = z0 + 0.9, zf = z1 - 0.2;
  K.axle(parts, zr, r0, 0.12, hw + 0.05, false);
  K.axle(parts, zf, r1, 0.12, hw + 0.05, true);
  for (const [z, r] of [[zr, r0], [zf, r1]]) for (const sd of [1, -1]) for (let k = 0; k < 6; k++) { const a = k * Math.PI / 6; parts.push(beam([sd * (hw + 0.05), r + Math.cos(a) * r * 0.9, z + Math.sin(a) * r * 0.9], [sd * (hw + 0.05), r - Math.cos(a) * r * 0.9, z - Math.sin(a) * r * 0.9], 0.03, SPOKE, PART.frame)); }
  parts.push(slab(-0.06, 0.06, 0.55, 0.65, zf, L / 2 + TEAM.tongue, WOOD_DARK, PART.bumperF)); // the tongue
  parts.push(slab(-0.7, 0.7, 0.58, 0.66, L / 2 + TEAM.tongue - 0.15, L / 2 + TEAM.tongue - 0.05, WOOD_DARK, PART.bumperF)); // the doubletree
}
