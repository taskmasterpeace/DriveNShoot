import { FACTION_SIM } from '../data/society.js';
import { K } from './chronicle.js';

// The world moves without you (docs/design/WEB_WORLD_MEMORY.md phase 4). Factions with a `sim` row have fighters
// (strength) and stores (resources), 0..100. Hourly: the places they hold pay income, and stores buy recruits. Daily:
// every pair at war may skirmish off-screen - casualties on both sides, a chronicle line the radio can read - and a
// side broken below the line loses a place to the other. Deaths you see on-screen cost strength too, so killing
// Dustwolves for a week starves their camps for real. Seeded, so a sim tick replays the same way.
export class FactionSim {
  constructor(game, factions, society) {
    this.g = game; this.F = factions; this.S = society;
    this.strength = new Float32Array(16); this.resources = new Float32Array(16);
    this.seed = 1337; this.hourAcc = 0; this.skirmishes = 0; this.flips = 0;
    for (let i = 0; i < factions.ids.length; i++) this.init(i);
  }

  init(i) { const s = this.F.rows[i]?.sim; if (s) { this.strength[i] = s.strength ?? 50; this.resources[i] = s.resources ?? 50; } }
  rng() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  simmed(i) { return !!this.F.rows[i]?.sim; }
  idx(fid) { return this.F.index[fid]; }
  str(fid) { const i = this.idx(fid); return i === undefined ? 0 : this.strength[i]; }

  placesOf(fid) { const out = []; for (const id in this.S.places) if (this.S.places[id].owner === fid) out.push(id); return out; }
  yieldOf(fid) { let y = 0; for (const id in this.S.places) { const p = this.S.places[id]; if (p.owner === fid) y += p.yield ?? 1; } return y; }

  // A fighter of this faction died (on screen or off).
  lost(fid, n = 1) {
    const i = this.idx(fid);
    if (i === undefined || !this.simmed(i)) return;
    this.strength[i] = Math.max(0, this.strength[i] - FACTION_SIM.perDeath * n);
  }

  // Advance the off-screen world by `hours` game hours (days roll as the clock passes midnight).
  advance(hours) {
    this.hourAcc += hours;
    let ticks = 0;
    while (this.hourAcc >= 1 && ticks < 240) { this.hourAcc -= 1; this.tickHour(); ticks++; }
    return ticks;
  }

  tickHour() {
    const C = FACTION_SIM;
    for (let i = 0; i < this.F.ids.length; i++) {
      if (!this.simmed(i)) continue;
      // Income from what they hold, then the mouths to feed; a side that can't feed itself loses fighters.
      this.resources[i] = Math.min(C.cap, this.resources[i] + C.income * this.yieldOf(this.F.ids[i]) - C.upkeep * this.strength[i]);
      if (this.resources[i] < 0) { this.strength[i] = Math.max(0, this.strength[i] + this.resources[i] / C.recruitCost); this.resources[i] = 0; }
      if (this.resources[i] >= C.reserve + C.recruitCost && this.strength[i] < C.cap) {
        this.strength[i] = Math.min(C.cap, this.strength[i] + C.recruit);
        this.resources[i] -= C.recruitCost;
      }
    }
  }

  tickDay() {
    const C = FACTION_SIM, F = this.F, n = F.ids.length, out = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      if (!this.simmed(a) || !this.simmed(b) || F.rel[a * 16 + b] > -50) continue;
      const bold = Math.max(F.rows[a].sim.aggression ?? 0.5, F.rows[b].sim.aggression ?? 0.5);
      if (this.rng() > bold) continue;
      const sa = this.strength[a], sb = this.strength[b], tot = Math.max(1, sa + sb);
      const la = C.skirmishLoss * (sb / tot) * (0.5 + this.rng()), lb = C.skirmishLoss * (sa / tot) * (0.5 + this.rng());
      this.strength[a] = Math.max(0, sa - la); this.strength[b] = Math.max(0, sb - lb);
      this.skirmishes++;
      const winner = la < lb ? a : b, loser = winner === a ? b : a;
      const contested = this.placesOf(F.ids[loser]).find((p) => p !== F.rows[loser].home) ?? null;
      this.record('skirmish', winner, loser, contested, la + lb);
      out.push({ a: F.ids[a], b: F.ids[b], losses: { [F.ids[a]]: +la.toFixed(1), [F.ids[b]]: +lb.toFixed(1) } });
      // A broken side gives ground (never its home).
      if (contested && this.strength[loser] < C.breakAt && this.strength[winner] > C.holdAt) {
        this.S.places[contested].owner = F.ids[winner];
        this.flips++;
        this.record('took', winner, loser, contested, 8);
        this.g.emit('territory', { place: contested, name: this.S.places[contested].name, from: F.ids[loser], to: F.ids[winner] });
      }
    }
    return out;
  }

  record(verb, a, b, place, m) {
    const g = this.g, F = this.F, p = place ? this.S.places[place] : null;
    const at = p?.circle ?? p?.rect ?? [0, 0];
    this.S.chronicle.add({ t: +g.time.toFixed(2), day: this.S.day, hr: +(g.sky.time ?? 0).toFixed(2), a: F.ids[a], af: F.ids[a], v: verb, o: place ?? '', on: p?.name ?? '', of: F.ids[b],
      p: place ?? '', x: +(at[0] ?? 0).toFixed(1), z: +(at[1] ?? 0).toFixed(1), m: +m.toFixed(1), w: [], ws: 0, un: 0, k: verb === 'took' ? K.director : 0, src: 'sim' });
  }

  view() {
    return Object.fromEntries(this.F.ids.map((id, i) => [id, this.simmed(i) ? { strength: +this.strength[i].toFixed(1), resources: +this.resources[i].toFixed(1), places: this.placesOf(id) } : null]).filter(([, v]) => v));
  }

  save() { return { strength: Array.from(this.strength), resources: Array.from(this.resources), seed: this.seed, hourAcc: this.hourAcc, owners: Object.fromEntries(Object.entries(this.S.places).map(([k, p]) => [k, p.owner ?? null])) }; }

  load(s) {
    if (!s) return;
    s.strength?.forEach((v, i) => { this.strength[i] = v; });
    s.resources?.forEach((v, i) => { this.resources[i] = v; });
    this.seed = s.seed ?? this.seed; this.hourAcc = s.hourAcc ?? 0;
    for (const [k, o] of Object.entries(s.owners ?? {})) if (this.S.places[k]) this.S.places[k].owner = o;
  }
}
