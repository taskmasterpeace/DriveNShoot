// THE FAR FOLD: ambient people you left behind fold into records, and unfold when you come back.
// The 160-character pool (systems/characters.js MAX_CHARS) is shared by the whole country, but the island's ambient
// drifters, wardens and Dustwolves are spawned once at boot and never hand their slots back. After a long trip (a bus, a
// teleport, a clone wake) they stand 400 m+ behind you holding the pool, and a sieging horde (systems/overrun.js) or
// the night's ambient infected (systems/zombies.js) find no room. Here a person tagged `amb` (spawned by main.js's
// ambient sources only) folds into a plain record once the pool runs low and they are FAR from every eye (you, a drone
// you fly), farthest first; within RETURN of a record with room to spare, they walk back out as they were: same name,
// flag, clothes, weapon, wounds. Named people (c.npc), residents (c.res), crew, horde bodies, anyone seated or riding a
// deck are never folded: those belong to systems that keep their own books.
import { AMBIENT_RESERVE } from './zombies.js';

export const FOLD = {
  far: 400,     // m from every eye before an ambient person may fold
  ret: 300,     // m: a record this close unfolds (the gap is the hysteresis)
  floor: 40,    // free slots the fold keeps when it can (above AMBIENT_RESERVE 16 plus a horde's street share)
  room: 8,      // an unfold leaves at least floor + room free
  tick: 1,      // s between passes
  max: 400,     // records kept (the oldest drop: they wandered off)
};

export class Population {
  constructor(g) {
    this.g = g;
    this.enabled = true;
    this.recs = [];
    this.t = 0;
    this.stats = { folded: 0, unfolded: 0, evicted: 0 };
  }
  eyes() {
    const g = this.g, P = g.player, out = [P.x, P.z];
    if (g.droneCam?.active) out.push(g.droneCam.x, g.droneCam.z);
    return out;
  }
  // Far enough from every eye: the squared distance to the nearest, or -1 when someone can see them.
  farness(c, eyes) {
    let best = Infinity;
    for (let i = 0; i < eyes.length; i += 2) { const dx = c.x - eyes[i], dz = c.z - eyes[i + 1], d = dx * dx + dz * dz; if (d < best) best = d; }
    return best > FOLD.far * FOLD.far ? best : -1;
  }
  foldable(c) {
    return c.amb && c.alive && c !== this.g.player && !c.npc && !c.res && !c.crewRec && !c.crewCand && !c.horde && !c.inVehicle && !c.onDeck && !c.hold;
  }
  // Fold up to n far ambient people, farthest first. Returns how many folded.
  evict(n) {
    if (n <= 0) return 0;
    const g = this.g, eyes = this.eyes(), pick = [];
    for (const c of g.chars) { if (!this.foldable(c)) continue; const d = this.farness(c, eyes); if (d > 0) pick.push([d, c]); }
    if (!pick.length) return 0;
    pick.sort((a, b) => b[0] - a[0]);
    let k = 0;
    for (; k < n && k < pick.length; k++) this.fold(pick[k][1]);
    return k;
  }
  fold(c) {
    const g = this.g;
    this.recs.push({ x: c.x, z: c.z, face: c.face, faction: c.faction, weapon: c.weapon ?? null, hp: c.hp, maxHp: c.maxHp, colors: c.colors, name: c.name, flag: c.flag, grenades: c.grenades ?? 0 });
    if (this.recs.length > FOLD.max) this.recs.shift();
    g.removeChar(c);
    this.stats.folded++;
  }
  unfold(i) {
    const g = this.g, r = this.recs[i];
    const c = g.addChar({ x: r.x, z: r.z, faction: r.faction, weapon: r.weapon, hp: r.maxHp, colors: r.colors, name: r.name, flag: r.flag });
    if (!c) return false;
    this.recs.splice(i, 1);
    c.hp = r.hp; c.maxHp = r.maxHp; c.face = r.face ?? c.face; c.grenades = r.grenades; c.amb = true;
    this.stats.unfolded++;
    return true;
  }
  update(dt) {
    if (!this.enabled) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = FOLD.tick;
    const g = this.g, P = g.player;
    if (!P) return;
    const free = g.freeSlots.length;
    if (free < FOLD.floor) this.evict(FOLD.floor - free);
    // Back where they were: unfold while there is room to spare (nearest records first is not needed: few at a time).
    for (let i = this.recs.length - 1; i >= 0; i--) {
      if (g.freeSlots.length < FOLD.floor + FOLD.room) break;
      const r = this.recs[i];
      if (Math.abs(r.x - P.x) < FOLD.ret && Math.abs(r.z - P.z) < FOLD.ret && Math.hypot(r.x - P.x, r.z - P.z) < FOLD.ret) this.unfold(i);
    }
  }
  // A system that needs n bodies now (a horde in the street): room above the ambient reserve, folding far people for it.
  make(n) {
    const g = this.g, short = n + AMBIENT_RESERVE + 4 - g.freeSlots.length;
    if (short <= 0 || !this.enabled) return 0;
    const k = this.evict(short);
    this.stats.evicted += k;
    return k;
  }
  view() { return { enabled: this.enabled, records: this.recs.length, free: this.g.freeSlots.length, chars: this.g.chars.length, ...this.stats }; }
  clear() { this.recs.length = 0; }
}
