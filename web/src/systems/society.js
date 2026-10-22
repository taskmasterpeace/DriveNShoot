import { Chronicle } from './chronicle.js';
import { Factions } from './factions.js';
import { Deeds } from './deeds.js';
import { Memory } from './memory.js';
import { Director } from './director.js';
import { FactionSim } from './factionsim.js';
import { TOWN, districtName } from '../world/city.js';

// The society facade (docs/design/WEB_WORLD_MEMORY.md): owns the chronicle, the factions and the deeds, keeps the
// day count and the places deeds are filed under, ticks standing decay hourly, and saves/loads them as one block.
// update() runs inside the sim step, so an open dialogue freezes rumors like everything else.
const COMPASS = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'];

export class Society {
  constructor(game) {
    this.g = game;
    this.chronicle = new Chronicle();
    this.factions = new Factions(game);
    this.deeds = new Deeds(game, this.chronicle, this.factions);
    this.memory = new Memory(game, this.factions);
    this.director = new Director(game);
    this.sim = new FactionSim(game, this.factions, this);
    this.day = 0;
    this.lastHour = null;
    this.hourAcc = 0;
    this.places = {};
  }

  // Places deeds are filed under: each raider camp (named by its bearing from town), then the world's districts -
  // Rust Haven, the Old Phoenix ruins round it, the Glass Flats beyond. Packs and streamed regions add rows.
  initPlaces() {
    this.places = {};
    const camps = this.g.world?.spawns?.camps ?? [];
    const used = {};
    camps.forEach((c, i) => {
      const dir = COMPASS[(Math.round(Math.atan2(c.x, -c.z) / (Math.PI / 4)) + 8) % 8];
      used[dir] = (used[dir] ?? 0) + 1;
      this.places[`camp_${i}`] = { name: `${dir} Camp${used[dir] > 1 ? ` ${used[dir]}` : ''}`, circle: [c.x, c.z, 60], owner: 'dustwolves', yield: 0.5 };
    });
    this.places.rust_haven = { name: 'Rust Haven', rect: [-TOWN, -TOWN, TOWN, TOWN], owner: 'rusthaven', yield: 3 }; // water, trade, the gate toll
    // Military bases (systems/bases.js): the ground inside the wire, held by whoever built it.
    for (const s of this.g.bases?.sites ?? []) this.places[s.row.place] = { name: s.row.spoken, rect: [s.fence.x0, s.fence.z0, s.fence.x1, s.fence.z1], owner: s.faction, yield: 0 };
    this.places.old_phoenix = { name: 'the Old Phoenix ruins', owner: null };
    this.places.glass_flats = { name: 'the Glass Flats', owner: null };
    const dw = this.factions.row('dustwolves');
    if (dw && !dw.hub && camps.length) dw.hub = [camps[0].x, camps[0].z];
  }

  placeAt(x, z) {
    for (const id in this.places) {
      const p = this.places[id];
      if (p.rect && x > p.rect[0] && z > p.rect[1] && x < p.rect[2] && z < p.rect[3]) return id;
      if (p.circle && Math.hypot(x - p.circle[0], z - p.circle[1]) < p.circle[2]) return id;
    }
    return { 'RUST HAVEN': 'rust_haven', 'OLD PHOENIX RUINS': 'old_phoenix' }[districtName(x, z)] ?? 'glass_flats';
  }

  update(dt = 0) {
    const h = this.g.sky.time;
    if (this.lastHour === null) this.lastHour = h;
    let dh = h - this.lastHour;
    if (dh < -12) { dh += 24; this.day++; this.g.emit('newDay', { day: this.day }); this.sim.tickDay(); this.director.newDay(this.day); }
    this.lastHour = h;
    if (dh > 0) {
      this.hourAcc += dh;
      if (this.hourAcc >= 1) { this.factions.tickHours(this.hourAcc); this.sim.advance(this.hourAcc); this.hourAcc = 0; }
    }
    this.deeds.update();
    if (dt > 0) this.director.update(dt);
  }

  save() { return { day: this.day, chronicle: this.chronicle.save(), factions: this.factions.save(), rumors: this.deeds.save(), memory: this.memory.save(), director: this.director.save(), sim: this.sim.save() }; }

  load(s) {
    if (!s) return;
    this.day = s.day ?? 0;
    this.lastHour = null;
    this.chronicle.load(s.chronicle);
    this.factions.load(s.factions);
    for (const c of this.g.chars) this.factions.assign(c);
    this.deeds.load(s.rumors);
    this.memory.load(s.memory);
    this.director.load(s.director);
    this.sim.load(s.sim);
  }

  view() {
    const F = this.factions;
    return {
      day: this.day,
      tiers: Object.fromEntries(F.ids.map((id, i) => [id, F.tiers[i]])),
      standing: Object.fromEntries(F.ids.map((id, i) => [id, +F.standing[i].toFixed(1)])),
      rumors: this.deeds.pending, deeds: this.deeds.deeds, chronicle: this.chronicle.size,
    };
  }
}
