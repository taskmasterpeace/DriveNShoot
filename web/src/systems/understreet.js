import { StaticWorld } from '../engine/collision.js';
import { LOOT } from '../data/items.js';
import { DOOR_MATERIALS } from '../data/interiors.js';
import { UG, LOGS, NOISE } from '../data/underground.js';
import { SEWER, WAYS, FLOOD, CURRENT, LIFE, US_LOOT, US_LOGS, BARS, RING_DRAINS } from '../data/understreet.js';
import { drainSite, CLS, LIFT_OF, ringPlan, ringTileOf } from '../world/understreet.js';
import { planSite, OPEN } from '../world/undergen.js';
import { makeLookMaterials, buildWays, setLid, buildBelow, setWater, setDay, setRats } from './understreetlook.js';

// UNDER THE STREET at runtime (docs/design/WEB_UNDERSTREET.md). Every generated town gets a drain site when it is built
// (citygen's stamp calls onBuilt): a row of kind `drains` that the underground (systems/underground.js) treats as one of
// its own sites - the same `p.ug`, the same view going below with your head, the same UnderWorld, noise flood, walk grid,
// write-back and save - with this system as its `ext` for what only the drains have:
//   ways      many ways in, not one: lids you lift (a manhole, a loose grate), the outfall's bars you pry or cut, the
//             culvert's ramps, a breach up into a store; a shut lid is no way at all (heightAt asks isOpen)
//   water     the flood: rises with the sky's rain toward FLOOD.rain or FLOOD.storm, falls when it clears, a running pump
//             station pulls it down; a person's water state below is the drains' (the water lane's wade / swim, its
//             speeds, its breath), the current carries whoever stands in it toward the outfall, under the soffit you drown
//   sound     a pipe carries it (the level's `carry`), up every shaft it climbs to the street, a street noise goes down the
//             nearest open shafts; the dead on the street who hear one come up a shaft go down it to look
//   people    the level's record stands up near you only (LIFE: the whole world's 160 is the cap), folds back past dropR
//   rats      cosmetic and loud: they scatter from your light and your feet
// Nothing here regenerates: caches are the inventory's ring boxes (rolled once), the dead stay dead in the record.

const r1 = (v) => Math.round(v * 10) / 10;
const SHAFT_EAR = 9; // m: a sound the dead remember this near an open shaft's top is the one that came up it (a heard spot scatters 4-5 m)
const _t = { x: 0, z: 0 };
export class UnderStreet {
  constructor(g) {
    this.g = g;
    const U = this.U = g.under;
    U.ext = this;
    for (const [k, T] of Object.entries(US_LOOT)) if (!LOOT[k]) LOOT[k] = T;
    for (const [k, L] of Object.entries(US_LOGS)) if (!LOGS[k]) LOGS[k] = L;
    if (!DOOR_MATERIALS.bars) DOOR_MATERIALS.bars = { ...BARS };
    this.M = makeLookMaterials();
    if (g.water?.normal) { this.M.water.normalMap = g.water.normal; this.M.water.normalScale.set(0.5, 0.5); } // the water lane's ripples: your lamp glints off the flood
    this.byTown = new Map();   // citygen rec id -> its drain row
    this.collars = new Map();  // way id -> its collar boxes (an open manhole's lip) in the street's extra
    this.below = null;         // the live level's own meshes (buildBelow)
    this.rats = Array.from({ length: LIFE.rats }, () => ({ x: 0, z: 0, a: 0, vx: 0, vz: 0, t: 0, alive: false }));
    this.nRats = 0;
    this.shaftEv = [];         // recent noises that climbed a shaft: { f, x, z (where below), t }
    this.scanT = 0; this.lazyT = 0; this.downT = 0; this.drownT = 0; this.lastHour = null;
    this.counts = { sites: 0, lifted: 0, cut: 0, pried: 0, climbedDown: 0, followedDown: 0, rose: 0, stood: 0, folded: 0, swept: 0, cameUp: 0 };
    this.enabled = true;
    // The water lane's question below the street (world/water.js stateAt): the drains' water, not the river's over them.
    if (g.water) g.water.below = (x, z, y) => this.waterState(x, z, y);
  }

  // ---- sites ----------------------------------------------------------------------------------------------------------
  // citygen.stamp: a town (or a site's stamped town) gets its drains. A rural place or a base does not (a base has its vault).
  onBuilt(t) {
    const rec = t.rec;
    if (!this.enabled || rec.kind === 'rural' || rec.kind === 'base' || this.byTown.has(rec.id)) return;
    const g = this.g, W = g.streamer?.W, blds = t.built?.boxes ?? [];
    const world = {
      wet: (x, z) => g.water?.depthAt?.(x, z) ?? 0,
      // a breach's stair top inside a store: clear of everything built there but its outer walls (its stair core, counters)
      blocked: (R) => blds.some((b) => b.tag !== 'cg-wall' && (b.base ?? 0) < 1 && b.minX < R.x1 && b.maxX > R.x0 && b.minZ < R.z1 && b.maxZ > R.z0),
      ground: (x, z) => (W?.groundAt ? (Math.abs(x - rec.x) < rec.half && Math.abs(z - rec.z) < rec.half ? rec.y ?? 0 : W.groundAt(x, z)) : rec.y ?? 0),
    };
    let row;
    try { row = drainSite(rec, t.T, world); } catch (e) { console.warn('[understreet]', rec.id, e); return; }
    if (!row) return;
    row.attachR = row.half + SEWER.attachPad;
    const U = this.U;
    if (!U.byId.has(row.id)) { U.sites.push(row); U.byId.set(row.id, row); }
    this.byTown.set(rec.id, row);
    rec.drains = row.id;
    this.counts.sites++;
    g.emit('drainsMade', { town: rec.id, site: row.id, ways: row.net.ways.length, pipes: row.net.pipes.length });
  }
  // citygen.release: the town is gone from the world; its row goes (its record stays in the underground's recs: lids
  // you lifted, the water, who died down there come back with the town).
  onReleased(t) {
    const row = this.byTown.get(t.rec.id), U = this.U;
    if (!row) return;
    if (U.A?.site === row && this.g.player.ug === row.id) return; // you are down there: it stays
    U.detach(row.id);
    const i = U.sites.indexOf(row); if (i >= 0) U.sites.splice(i, 1);
    U.byId.delete(row.id);
    this.byTown.delete(t.rec.id);
  }
  // The Phoenix ring's districts round you (a row each, made when you come near, released when you are far): every 2 s.
  ringScan() {
    const g = this.g, W = g.streamer?.W, R = W?.ring, p = g.player, U = this.U;
    if (!R || !this.enabled) return;
    if (!R.inCity(p.x, p.z, 420)) { if (!this.ringRows?.size) return; }
    this.ringRows ??= new Map();
    const [k0, j0] = ringTileOf(p.x, p.z), N = RING_DRAINS.near;
    let made = 0;
    for (let k = k0 - N; k <= k0 + N; k++) for (let j = j0 - N; j <= j0 + N; j++) {
      const key = `${k},${j}`;
      if (this.ringRows.has(key)) continue;
      // one district a scan (a row is 10-40 ms to plan): yours first, then the rest as you stand there
      if (made++ && !(k === k0 && j === j0)) continue;
      const row = this.ringRow(k, j);
      this.ringRows.set(key, row);
      if (!row) continue;
      row.attachR = row.half + 24; // a district's ways come in as you near it (not all nine round you)
      if (!U.byId.has(row.id)) { U.sites.push(row); U.byId.set(row.id, row); }
      this.counts.ring = (this.counts.ring ?? 0) + 1;
    }
    for (const [key, row] of this.ringRows) {
      const [k, j] = key.split(',').map(Number);
      if (Math.max(Math.abs(k - k0), Math.abs(j - j0)) <= RING_DRAINS.keep) continue;
      if (row && (U.A?.site === row)) continue;
      if (row) { U.detach(row.id); const i = U.sites.indexOf(row); if (i >= 0) U.sites.splice(i, 1); U.byId.delete(row.id); }
      this.ringRows.delete(key);
    }
  }
  // District (k, j)'s row (pure of the ring's rows and the world's water and ground), or null: no streets there.
  ringRow(k, j) {
    const g = this.g, W = g.streamer?.W, R = W?.ring;
    if (!R) return null;
    const key = `${k},${j}`;
    {
      let T = null;
      try { T = ringPlan(R, k, j); } catch (e) { console.warn('[understreet] ring', key, e); }
      if (!T) return null;
      const cx = (T.x0 + T.x1) / 2, cz = (T.z0 + T.z1) / 2;
      let y0 = Infinity; for (const r of T.roads) y0 = Math.min(y0, W.groundAt ? W.groundAt((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2) : 0);
      if (!Number.isFinite(y0)) y0 = 0;
      const [ax, az, bx, bz] = RING_DRAINS.wash, wx = bx - ax, wz = bz - az, l2 = wx * wx + wz * wz;
      const washD = (x, z) => { const t = Math.max(0, Math.min(1, ((x - ax) * wx + (z - az) * wz) / l2)); return Math.hypot(x - ax - wx * t, z - az - wz * t); };
      const t = Math.max(0, Math.min(1, ((cx - ax) * wx + (cz - az) * wz) / l2)), nx = ax + wx * t - cx, nz = az + wz * t - cz;
      // where the water goes: the island's river, the old wash, or the dry desert past the city's edge (a district on the
      // edge empties there); a district that reaches none of them sends it on toward the nearer of the wash and the edge
      const I = R.I ?? 470, desert = (x, z) => !(Math.abs(x) <= I && Math.abs(z) <= I) && R.depth(x, z) < -RING_DRAINS.edgeIn;
      const out = Math.abs(cx) > Math.abs(cz) ? { x: Math.sign(cx), z: 0 } : { x: 0, z: Math.sign(cz) };
      const viaWash = Math.hypot(nx, nz) < RING_DRAINS.washReach;
      const mine = (x, z) => x >= T.x0 && x < T.x1 && z >= T.z0 && z < T.z1, other = (x, z) => !mine(x, z) && !(Math.abs(x) <= I && Math.abs(z) <= I) && R.inCity(x, z);
      const world = { wet: (x, z) => (other(x, z) ? -1 : Math.max(g.water?.depthAt?.(x, z) ?? 0, washD(x, z) < RING_DRAINS.washW || desert(x, z) ? 2 : 0)), ground: (x, z) => (W.groundAt ? W.groundAt(x, z) : y0), toward: viaWash ? (Math.abs(nx) > Math.abs(nz) ? { x: Math.sign(nx), z: 0 } : { x: 0, z: Math.sign(nz) }) : out, pump: false, culvert: false, search: RING_DRAINS.search };
      let row = null;
      try { row = drainSite({ id: T.id, seed: ((k * 73856093) ^ (j * 19349663)) >>> 0, y: y0, name: T.name }, T, world); } catch (e) { console.warn('[understreet] ring', key, e); }
      if (row) row.ring = [k, j];
      return row;
    }
  }
  isDrains(site) { return site?.kind === 'drains'; }
  rec(site) { const r = this.U.rec(site); if (!r.open) { r.open = []; r.water = FLOOD.dry; r.wh = null; } return r; }

  // ---- the underground's hooks ----------------------------------------------------------------------------------------
  // attach: the ways on the street (and the ramps' collars). Manholes' lips come and go with their lids.
  buildWays(row, plan) {
    const r = this.rec(row), E = buildWays(row, plan, this.M, (id) => r.open.includes(id));
    for (const w of plan.ways) if (r.open.includes(w.id)) this.setCollar(row, plan, w, true);
    return { group: E.group, collar: E.collar, E };
  }
  detached(id) { for (const [k, boxes] of this.collars) if (k.startsWith(`${id}|`)) { this.dropBoxes(boxes); this.collars.delete(k); } }
  dropBoxes(boxes) { const ex = this.g.statics.extra; for (const b of boxes) { const i = ex.indexOf(b); if (i >= 0) ex.splice(i, 1); } }
  setCollar(row, plan, w, on) {
    const key = `${row.id}|${w.id}`, had = this.collars.get(key);
    if (had) { this.dropBoxes(had); this.collars.delete(key); }
    if (!on || (w.kind !== 'manhole' && w.kind !== 'grate')) return;
    const f = plan.flights.find((q) => q.id === w.flight), R = f.rect, t = 0.18, h = 0.45, ax = f.axis === 'x';
    // the lip round the open shaft on its two long sides and its far end (the top end is the way in)
    const sides = ax ? [[R.minX, R.minZ - t, R.maxX, R.minZ], [R.minX, R.maxZ, R.maxX, R.maxZ + t], f.u > 0 ? [R.maxX, R.minZ - t, R.maxX + t, R.maxZ + t] : [R.minX - t, R.minZ - t, R.minX, R.maxZ + t]]
      : [[R.minX - t, R.minZ, R.minX, R.maxZ], [R.maxX, R.minZ, R.maxX + t, R.maxZ], f.u > 0 ? [R.minX - t, R.maxZ, R.maxX + t, R.maxZ + t] : [R.minX - t, R.minZ - t, R.maxX + t, R.minZ]];
    const boxes = sides.map(([x0, z0, x1, z1]) => StaticWorld.box(x0, z0, x1, z1, 'ug-collar', h));
    for (const b of boxes) this.g.statics.extra.push(b);
    this.collars.set(key, boxes);
  }
  // A shut lid is no way: heightAt, steer and the level's wants skip it.
  isOpen(f) { if (!f.lid) return true; const A = this.U.A; return !!A && this.rec(A.site).open.includes(f.way); }
  // The live site's switch: you stand within r of one of its ways' tops.
  nearWay(T, p, r = UG.promoteNear) {
    for (const w of T.plan.ways) if (Math.abs(w.top.x - p.x) < r && Math.abs(w.top.z - p.z) < r) return true;
    return false;
  }
  // A street noise: a share goes down the nearest open shafts (three at most), into the pipe at each foot.
  streetNoise(x, z, r, src) {
    const A = this.U.A;
    if (!A?.levels.has(1)) return;
    let n = 0;
    for (const f of A.plan.flights) {
      if (n >= 3) break;
      const d = Math.hypot(f.top.x - x, f.top.z - z);
      if (d >= r || !this.isOpen(f)) continue;
      n++;
      const share = (r - d) * NOISE.shaft, U = this.U, P = A.levels.get(1);
      U.levelNoise(1, f.bottom.x, f.bottom.z, share, src, true);
      // the dead below who heard it come down the shaft go up it to look (a horde can come up a manhole)
      for (const c of this.g.chars) {
        if (c.faction !== 'zombie' || !c.alive || c.ug !== A.site.id || c.zsee || c.usUp) continue;
        const q = U.cellOf(P, c.x, c.z);
        if (q >= 0 && U._dist[q] <= share) c.usUp = { f, x, z, until: this.g.time + 45 };
      }
    }
  }
  // A noise below climbed a shaft to the street (underground levelNoise): the dead up there who heard it will look down
  // it. (x, z): where it was made below.
  climbed(f, x, z, r) {
    if (!this.isOpen(f)) return;
    const t = this.g.time;
    if (this.shaftEv.length > 12) this.shaftEv.shift();
    this.shaftEv.push({ f, x, z, t, r });
  }
  // storeys.steer below or toward below: the nearest open way on the right side, weighted toward the target.
  steer(c, ck, tk, tx, tz) {
    const A = this.U.A;
    if (ck === tk) return null;
    let best = null, bd = Infinity;
    for (const f of A.plan.flights) {
      if (!this.isOpen(f)) continue;
      const end = ck === 0 ? f.top : f.bottom, d = Math.hypot(end.x - c.x, end.z - c.z) + 0.5 * Math.hypot(f.top.x - tx, f.top.z - tz);
      if (d < bd) { bd = d; best = f; }
    }
    if (!best) return null;
    const near = ck === 0 ? best.top : best.bottom, far = ck === 0 ? best.bottom : best.top;
    return Math.hypot(near.x - c.x, near.z - c.z) < 0.9 ? far : near;
  }
  // Promote: only the record's people near you stand up (the rest wait as a record).
  wantOcc(P, o) { const p = this.g.player; return Math.hypot(o.x - p.x, o.z - p.z) < SEWER.lazyR; }
  onPromote(P) {
    if (this.below) this.onDemote(null);
    const B = this.below = buildBelow(P.L, this.M);
    B.P = P;
    this.g.scene.add(B.group);
    for (const b of P.L.boxes) if (b.submerged) { const box = this.g.inventory.boxes.get(b.id); if (box) box.hidden = true; }
    this.spawnRats(P);
  }
  onDemote(P) {
    const B = this.below;
    if (!B || (P && B.P !== P)) return;
    this.g.scene.remove(B.group);
    for (const m of B.group.children) m.dispose?.();
    this.below = null; this.nRats = 0;
  }

  // ---- water ----------------------------------------------------------------------------------------------------------
  // Depth of the drains' water at (x, z) on the live level (0: dry or not ours).
  depthAt(x, z) {
    const A = this.U.A, P = A?.levels.get(1);
    if (!P || P.L.kind !== 'drains') return 0;
    const L = P.L, i = Math.floor(x - L.ox), j = Math.floor(z - L.oz);
    if (i < 0 || j < 0 || i >= L.W || j >= L.H) return 0;
    const q = j * L.W + i;
    if (L.cells[q] !== OPEN) return 0;
    return Math.max(0, this.rec(A.site).water - LIFT_OF[L.cls[q]]);
  }
  // world/water.js stateAt for someone below the street: the drains' water, or none (never the river over a bunker).
  waterState(x, z, y) {
    const U = this.U, A = U.A;
    if (!A || y === undefined || y > U.y0 - UG.below) return undefined;
    if (A.site.kind !== 'drains') return 'dry';
    const d = this.depthAt(x, z);
    return d <= FLOOD.wade ? 'dry' : d < FLOOD.swim ? 'wade' : 'swim';
  }
  // Where the flood is going: the dry trickle, a rain's knee-deep run, an acid storm's flood to the soffit.
  target() { const c = this.g.sky?.cur; if (!c) return FLOOD.dry; const rain = Math.min(1, c.rain ?? 0), storm = Math.min(1, c.storm ?? 0); return FLOOD.dry + (FLOOD.rain - FLOOD.dry) * rain + (FLOOD.storm - FLOOD.rain) * storm; }
  // Move a site's water on the game clock: toward the target (rise or fall), a running pump station pulls it down.
  flood(site, mins) {
    const r = this.rec(site), want = this.target();
    if (mins <= 0) return r.water;
    const was = r.water;
    if (r.water < want) r.water = Math.min(want, r.water + FLOOD.rise * mins);
    else r.water = Math.max(want, r.water - FLOOD.fall * mins);
    if (r.power) r.water = Math.max(FLOOD.dry, r.water - FLOOD.pump * mins);
    if (r.water > was + 1e-4) this.counts.rose++;
    return r.water;
  }

  // ---- the E key ------------------------------------------------------------------------------------------------------
  // main.js asks first on the street (after doors and windows), the underground asks first below. Returns a ring or null.
  interact(p, I, dt) {
    const U = this.U, A = U.A;
    if (!A || A.site.kind !== 'drains' || p.inVehicle) { this.holdOn = null; return null; }
    const g = this.g, r = this.rec(A.site), down = I.key('KeyE'), hit = I.hit('KeyE'), below = p.ug === A.site.id;
    const ring = this._ring ?? (this._ring = { x: 0, z: 0, len: 1.6 });
    const hold = (key, need, label, done) => {
      if (this.holdOn !== key) { this.holdOn = key; this.holdT = 0; }
      if (down && this.holdT >= 0) { this.holdT += dt; const k = Math.min(1, this.holdT / need); g.hud.prompt(`${label}… ${Math.round(k * 100)}%`); if (k >= 1) { this.holdT = -1; done(); } return true; }
      if (!down) this.holdT = 0;
      return false;
    };
    const inv = g.inventory, bar = inv.hasTag('pry'), saw = inv.hasTag('cut');
    // a lid: from the street at its top, from below at its foot
    let way = null, bd = 1.5;
    for (const w of A.plan.ways) {
      if (w.kind !== 'manhole' && w.kind !== 'grate') continue;
      const e = below ? w.bottom : w.top, d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < bd && (!below || Math.abs((p.gy ?? 0) - A.plan.Y[1]) < 0.6)) { bd = d; way = w; }
    }
    if (way) {
      const open = r.open.includes(way.id), W = WAYS[way.kind], e = below ? way.bottom : way.top;
      ring.x = e.x; ring.z = e.z; ring.len = 1.4;
      if (open) {
        g.hud.prompt(below ? `The ${way.kind === 'grate' ? 'grate' : 'manhole'} above is open · walk up the iron rungs` : `<kbd>E</kbd> Drag the ${way.kind === 'grate' ? 'grate' : 'lid'} back over · walk on to climb down`);
        if (hit && !below) this.setOpen(A, way, false, p);
        return ring;
      }
      if (way.kind === 'grate' && !bar && !below) { g.hud.prompt('A loose kerb grate · a crowbar would prise it up'); return ring; }
      const need = way.kind === 'grate' ? W.prise : bar ? W.bar : W.hand;
      const label = below ? 'Shouldering it up' : way.kind === 'grate' ? 'Prising the grate up' : bar ? 'Levering the lid' : 'Dragging the lid by its pick hole';
      if (!hold(`lid:${way.id}`, need, label, () => this.setOpen(A, way, true, p))) g.hud.prompt(`hold <kbd>E</kbd> ${below ? 'Push the lid up' : way.kind === 'grate' ? 'Prise the grate up (loud)' : `Lift the lid${bar ? ' with the crowbar' : ' by hand (slow)'}`} · heard ${W.noise} m`);
      return ring;
    }
    if (!below) return null;
    // the outfall's bars
    const P = A.levels.get(1);
    for (const d of P?.doors ?? []) {
      if (!d.bars || !d.locked || Math.hypot(d.x - p.x, d.z - p.z) > 2.2) continue;
      ring.x = d.x; ring.z = d.z; ring.len = 2.4;
      const O = WAYS.outfall;
      if (saw && hold(`cut:${d.id}`, O.cut, 'Sawing through a bar (quiet)', () => this.openBars(d, p, 'cut'))) return ring;
      if (!saw && bar && hold(`pry:${d.id}`, O.pry, 'Prying the grille off its pins (loud)', () => this.openBars(d, p, 'pry'))) return ring;
      g.hud.prompt(`An iron grille across the outfall · ${saw ? 'hold <kbd>E</kbd> Cut a bar (hacksaw, quiet)' : bar ? 'hold <kbd>E</kbd> Pry it (crowbar, loud)' : 'a crowbar pries it, a hacksaw cuts it'}`);
      return ring;
    }
    return null;
  }
  setOpen(A, way, open, by) {
    const g = this.g, r = this.rec(A.site), W = WAYS[way.kind];
    const i = r.open.indexOf(way.id);
    if (open && i < 0) r.open.push(way.id); else if (!open && i >= 0) r.open.splice(i, 1);
    r.touched = true;
    const T = this.U.attached.get(A.site.id);
    if (T?.ent.E) setLid(T.ent.E, way.id, open);
    this.setCollar(A.site, A.plan, way, open);
    const at = by?.ug ? way.bottom : way.top;
    g.audio.burst?.({ dur: 0.5, freq: 240, type: 'bandpass', q: 1.5, vol: 0.6, decay: 0.45, pitchDrop: 0.5 }); // iron on concrete
    g.noise(at.x, at.z, open ? W.noise : W.noise * 0.6, by ?? null);
    if (open) this.counts.lifted++;
    g.emit(open ? 'drainOpened' : 'drainClosed', { site: A.site.id, way: way.id, kind: way.kind });
    return true;
  }
  openBars(d, by, how) {
    const g = this.g;
    if (how === 'cut') { g.audio.burst?.({ dur: 0.3, freq: 2600, type: 'bandpass', q: 5, vol: 0.12, decay: 0.25 }); g.interiors.unlock(d, 'cut', by, false); this.counts.cut++; }
    else { g.audio.burst?.({ dur: 0.6, freq: 400, type: 'bandpass', q: 2, vol: 0.7, decay: 0.5, pitchDrop: 0.6 }); g.noise(d.x, d.z, WAYS.outfall.noise, by); g.interiors.unlock(d, 'pried', by, true); this.counts.pried++; }
    g.emit('drainBars', { door: d.id, how });
    return { ok: true, how };
  }
  // Agent / script: lift or drop a lid by way id.
  lid(id, open, by = null) {
    const A = this.U.A, w = A?.plan.ways?.find((q) => q.id === id);
    if (!w) return { ok: false, why: `no way "${id}" on the live drains` };
    if (!WAYS[w.kind].lid) return { ok: true, always: true };
    this.setOpen(A, w, open, by);
    return { ok: true, way: id, open };
  }

  // ---- every frame ----------------------------------------------------------------------------------------------------
  update(simDt, dt) {
    if (!this.enabled) return;
    const g = this.g, U = this.U, A = U.A, p = g.player;
    if ((this.scanT -= dt) <= 0) { this.scanT = 0.5; this.ringScan(); }
    const hour = (g.society?.day ?? 0) * 24 + (g.sky?.time ?? 12);
    const mins = this.lastHour === null ? 0 : Math.max(0, Math.min(600, (hour - this.lastHour) * 60));
    this.lastHour = hour;
    // every attached drain's water (the live one each frame, the others with it: the sky is the same sky)
    for (const [id] of U.attached) { const s = U.byId.get(id); if (s?.kind === 'drains') this.flood(s, mins); }
    if (!A || A.site.kind !== 'drains') { this.onDemote(null); return; }
    const P = A.levels.get(1), r = this.rec(A.site), y = A.plan.Y[1];
    if (!P) return;
    if (!this.below || this.below.P !== P) this.onPromote(P);
    const B = this.below;
    B.group.visible = P.look.group.visible;
    setWater(B, r.water, y);
    setDay(B, this.daylight());
    if (simDt > 0) {
      this.current(A, P, simDt);
      this.lazy(A, P, simDt);
      this.followDown(A, simDt);
      if (B.group.visible) this.stepRats(P, simDt);
    }
    if (B.group.visible) setRats(B, this.rats, this.nRats, y, r.water);
    void dt; void p;
  }
  // The day through a grate: the sun's share (dark at night, dimmer in a storm).
  daylight() { const S = this.g.sky; if (!S) return 0.6; const c = S.cur ?? {}; return Math.max(0, (1 - (S.night ?? 0)) * (1 - 0.5 * Math.min(1, c.clouds ?? 0)) * 0.9); }

  // The water carries whoever stands in it toward the outfall (down the flow field), a swimmer at full pace; under the
  // soffit there is no air. The dead in a flood are swept and drown too.
  current(A, P, dt) {
    const g = this.g, L = P.L, r = this.rec(A.site), lv = r.water, S = g.statics;
    if (lv <= FLOOD.wade) return;
    for (const c of g.chars) {
      if (!c.alive || c.ug !== A.site.id || c.inVehicle || c.drone) continue;
      if (Math.abs((c.gy ?? 0) - L.y) > 0.4) continue; // on a flight: holding the rungs
      const i = Math.floor(c.x - L.ox), j = Math.floor(c.z - L.oz);
      if (i < 1 || j < 1 || i >= L.W - 1 || j >= L.H - 1) continue;
      const q = j * L.W + i;
      if (L.cells[q] !== OPEN) continue;
      const d = lv - LIFT_OF[L.cls[q]];
      if (d <= FLOOD.wade) continue;
      // downhill on the flow field (steps to the outfall's foot)
      const D = L.dist, here = D[q];
      let bx = 0, bz = 0, bv = here;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = q + di + dj * L.W, v = D[n]; if (v >= 0 && v < bv) { bv = v; bx = di; bz = dj; } }
      if (!bx && !bz) continue;
      const sp = Math.min(CURRENT.max, CURRENT.k * d) * (d >= FLOOD.swim ? 1 : CURRENT.wade);
      _t.x = c.x + bx * sp * dt; _t.z = c.z + bz * sp * dt;
      S.resolveBody(_t, c.radius ?? 0.4, c);
      c.x = _t.x; c.z = _t.z;
      if (d >= FLOOD.swim) this.counts.swept += dt;
      if (d > UG.wallH - FLOOD.air) {
        g.combat.damage(c, FLOOD.drown * dt, null, 0, 0, 'drown');
        if (c === g.player && (this.drownT -= dt) <= 0) { this.drownT = 3; g.hud.toast('NO AIR · THE PIPE IS FULL · GET TO A SHAFT', 'hot'); }
      }
    }
  }

  // Stand up the record's people who are near you; fold back the far ones nobody is chasing.
  lazy(A, P, dt) {
    if ((this.lazyT -= dt) > 0) return;
    this.lazyT = 1;
    const g = this.g, p = g.player, lr = P.lr, U = this.U;
    const live = new Set(P.occ.map((c) => c.ugOcc?.i));
    (lr.occ ?? []).forEach((o, i) => {
      if (o.alive === false || o.gone || live.has(i)) return;
      if (Math.hypot(o.x - p.x, o.z - p.z) > SEWER.lazyR) return;
      if (U.spawnOcc(P, o, P.L.spawns[o.i] ?? null, i)) this.counts.stood++;
    });
    for (let k = P.occ.length - 1; k >= 0; k--) {
      const c = P.occ[k];
      if (!g.chars.includes(c) || !c.alive) continue;
      if (c.target === p || c.ztarget === p || c.zsee === p) continue;
      if (Math.hypot(c.x - p.x, c.z - p.z) < SEWER.dropR) continue;
      const o = lr.occ[c.ugOcc.i];
      if (o) { o.x = r1(c.x); o.z = r1(c.z); o.hp = Math.round(c.hp); o.face = +(c.face ?? 0).toFixed(2); }
      P.occ.splice(k, 1); g.removeChar(c); this.counts.folded++;
    }
  }

  // The dead on the street who heard a noise come up an open shaft go to its top, then down it, then to where it was made.
  followDown(A, dt) {
    if ((this.downT -= dt) > 0) return;
    this.downT = 0.25;
    const g = this.g, t = g.time;
    while (this.shaftEv.length && t - this.shaftEv[0].t > 40) this.shaftEv.shift();
    for (const c of g.chars) {
      if (c.faction !== 'zombie' || !c.alive) continue;
      const Up = c.usUp;
      if (Up) {
        if (t > Up.until || c.zsee) { c.usUp = null; continue; }
        if (!c.ug) { g.zombies.remember(c, Up.x, Up.z, 'sound'); c.wx = Up.x; c.wz = Up.z; c.timer = 10; c.usUp = null; this.counts.cameUp = (this.counts.cameUp ?? 0) + 1; g.emit('drainCameUp', { id: c.id, way: Up.f.way }); continue; }
        if (!this.isOpen(Up.f)) { c.usUp = null; continue; } // the lid went back on: they mill at the foot
        const aim = Math.hypot(Up.f.bottom.x - c.x, Up.f.bottom.z - c.z) < 1.4 || Math.abs((c.gy ?? 0) - A.plan.Y[1]) > 0.3 ? Up.f.top : Up.f.bottom;
        g.zombies.remember(c, aim.x, aim.z, 'sound'); c.wx = aim.x; c.wz = aim.z; c.timer = 10;
        continue;
      }
      const D = c.usDown;
      if (D) {
        if (t > D.until) { c.usDown = null; continue; }
        if (c.ug === A.site.id) { g.zombies.remember(c, D.x, D.z, 'sound'); c.wx = D.x; c.wz = D.z; c.timer = 10; c.usDown = null; this.counts.followedDown++; g.emit('drainFollowed', { id: c.id, way: D.f.way }); continue; }
        const dt2 = Math.hypot(D.f.top.x - c.x, D.f.top.z - c.z);
        const aim = dt2 < 1.4 ? D.f.bottom : D.f.top;
        g.zombies.remember(c, aim.x, aim.z, 'sound'); c.wx = aim.x; c.wz = aim.z; c.timer = 10;
        continue;
      }
      if (c.ug || c.zsee) continue;
      const m = c.zm;
      if (!m || m.src !== 'sound' || t - m.t > 6) continue;
      for (const E of this.shaftEv) {
        if (t - E.t > 8 || !this.isOpen(E.f)) continue;
        if (Math.hypot(m.x - E.f.top.x, m.z - E.f.top.z) < SHAFT_EAR && Math.hypot(c.x - E.f.top.x, c.z - E.f.top.z) < E.r * 2.5) { c.usDown = { f: E.f, x: E.x, z: E.z, until: t + 45 }; break; } // a heard spot is off by its scatter (data/infected.js): near enough the open shaft
      }
    }
  }

  // ---- rats -------------------------------------------------------------------------------------------------------------
  spawnRats(P) {
    const L = P.L, p = this.g.player;
    this.nRats = 0;
    for (let i = 0; i < this.rats.length; i++) { const R = this.rats[i]; if (this.placeRat(L, R, p.x, p.z, 28)) this.nRats = i + 1; }
  }
  placeRat(L, R, cx, cz, rad) {
    for (let t = 0; t < 30; t++) {
      const x = cx + (Math.random() - 0.5) * 2 * rad, z = cz + (Math.random() - 0.5) * 2 * rad, i = Math.floor(x - L.ox), j = Math.floor(z - L.oz);
      if (i < 0 || j < 0 || i >= L.W || j >= L.H || L.cells[j * L.W + i] !== OPEN) continue;
      R.x = x; R.z = z; R.a = Math.random() * 6.28; R.t = Math.random() * 3; R.alive = true; R.v = 0;
      return true;
    }
    return false;
  }
  stepRats(P, dt) {
    const L = P.L, p = this.g.player, lit = this.g.flashMat?.opacity > 0, lv = this.rec(this.U.A.site).water;
    let squeak = false;
    for (let i = 0; i < this.nRats; i++) {
      const R = this.rats[i];
      const dx = R.x - p.x, dz = R.z - p.z, d = Math.hypot(dx, dz);
      if (d > 34 || lv > 1.0) { this.placeRat(L, R, p.x, p.z, 28); continue; } // out of sight (or drowned out): somewhere else near you
      // scatter from you (and from your light, further), else nose about
      let flee = d < LIFE.ratFlee || (lit && d < LIFE.ratFlee * 1.8 && Math.abs(((Math.atan2(dx, dz) - p.face + 9.42) % 6.28) - 3.14) < 0.6);
      if (flee) { R.a = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.8; R.v = 3.2; if (d < 3 && Math.random() < dt * 2) squeak = true; }
      else if ((R.t -= dt) <= 0) { R.t = 0.6 + Math.random() * 2.4; R.v = Math.random() < 0.4 ? 0 : 0.6 + Math.random() * 1.2; R.a += (Math.random() - 0.5) * 2.4; }
      const nx = R.x + Math.sin(R.a) * R.v * dt, nz = R.z + Math.cos(R.a) * R.v * dt, i2 = Math.floor(nx - L.ox), j2 = Math.floor(nz - L.oz);
      if (i2 >= 0 && j2 >= 0 && i2 < L.W && j2 < L.H && L.cells[j2 * L.W + i2] === OPEN) { R.x = nx; R.z = nz; } else { R.a += 1.6 + Math.random(); }
    }
    if (squeak) this.g.audio.burst?.({ dur: 0.06, freq: 4200, type: 'bandpass', q: 9, vol: 0.08, decay: 0.05 });
  }

  // ---- for the agent ----------------------------------------------------------------------------------------------------
  rows() { const out = [...this.byTown.values()]; for (const r of this.ringRows?.values() ?? []) if (r) out.push(r); return out; }
  siteFor(x, z) {
    for (const row of this.rows()) { const F = row.net.frame; if (x > F.x0 && x < F.x1 && z > F.z0 && z < F.z1) return row; }
    return null;
  }
  status() {
    const A = this.U.A, live = A?.site.kind === 'drains' ? A.site : null, r = live ? this.rec(live) : null;
    return { sites: this.byTown.size, ring: [...(this.ringRows?.values() ?? [])].filter(Boolean).length, live: live ? { id: live.id, water: +r.water.toFixed(2), target: +this.target().toFixed(2), open: r.open.length, power: !!r.power, people: A.levels.get(1)?.occ.length ?? 0, rats: this.nRats } : null, counts: { ...this.counts, swept: +this.counts.swept.toFixed(1) } };
  }
  plan(row) { return planSite(row); }
}
void CLS;
