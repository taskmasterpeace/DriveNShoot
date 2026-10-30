// THE MOVES (data/moves.js; docs/design/WEB_MOVE_TOW.md): dive to prone, combat roll, slide, vault, climb over, running
// jump, drop-hang. One verb (SPACE, pad A) reads the ground ahead and picks the move; CTRL at a sprint slides.
//   probe(c, dx, dz)   what is ahead: { kind: 'vault'|'climb'|'jump'|null, h, depth, x1, z1, what }
//   start(c, kind, dx, dz, probe?)   commit c to a move (the player or anyone: an NPC can dive too); false if it can't
//   step(c, dt)        carry a committed body; true while it is still in the move
//   hitShare(c, d)     LOW_BODY: the share of rounds that line up with c that actually meet it at range d (1 = all)
//   moveRoot(...)      the pose solver's hook: the root frame through the move (systems/characters.js)
// No allocation per frame: one probe result and one scratch point, reused.
import { MOVES, LOW_BODY, PROBE } from '../data/moves.js';
import { RAY_SOLID } from '../engine/collision.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (k) => k * k * (3 - 2 * k);
const _t = { x: 0, z: 0 };
const EDGES = ['front', 'rear', 'left', 'right'];
const NORMAL = { front: [0, 1], rear: [0, -1], left: [1, 0], right: [-1, 0] };

// Entry distance of the ray (x, z) + t (dx, dz) into box b, or -1.
function rayBox(b, x, z, dx, dz) {
  const ix = dx ? 1 / dx : 1e9, iz = dz ? 1 / dz : 1e9;
  const a1 = (b.minX - x) * ix, a2 = (b.maxX - x) * ix, b1 = (b.minZ - z) * iz, b2 = (b.maxZ - z) * iz;
  const t0 = Math.max(Math.min(a1, a2), Math.min(b1, b2)), t1 = Math.min(Math.max(a1, a2), Math.max(b1, b2));
  return t1 >= Math.max(0, t0) ? Math.max(0, t0) : -1;
}

export class Moves {
  constructor(game) {
    this.g = game;
    this.res = { kind: null, h: 0, depth: 0, x1: 0, z1: 0, what: '', t: 0 };
    this.counts = { dive: 0, roll: 0, slide: 0, vault: 0, climb: 0, jump: 0, hang: 0, refused: 0 };
    this.last = null; // the last move that finished: { kind, by, x, z, ends }
  }

  // ---- reading the ground ahead -----------------------------------------------------------------------------------
  // The first thing within reach along (dx, dz): a vehicle body (its hood or tail is low, its cabin is a roof), or a static
  // box (a wall, a fence, a barrier, a wreck). Then: is it low enough, thin enough, and is there room on the far side?
  probe(c, dx, dz) {
    const g = this.g, R = this.res, r = c.radius ?? 0.4, reach = PROBE.reach + r;
    R.kind = null; R.h = 0; R.depth = 0; R.what = ''; R.t = Infinity;
    const l = Math.hypot(dx, dz); if (!l) return R;
    dx /= l; dz /= l;
    // vehicles (they are not in the static grid): the chord the line cuts through the body's rectangle
    for (const v of g.vehicles) {
      if (v.dead && v.sunk) continue;
      if (Math.abs(v.x - c.x) > 8 || Math.abs(v.z - c.z) > 8 || g.vehiclesSys.speed(v) > 2 || v.boat && (v.depth ?? 0) > 0.3) continue;
      const cs = Math.cos(v.h), sn = Math.sin(v.h), ox = c.x - v.x, oz = c.z - v.z;
      const lx = ox * cs - oz * sn, lz = ox * sn + oz * cs, ddx = dx * cs - dz * sn, ddz = dx * sn + dz * cs; // the car's frame (+x left, +z forward)
      const hw = v.wid / 2, hl = v.len / 2;
      let t0 = -Infinity, t1 = Infinity;
      for (const [o, d, h] of [[lx, ddx, hw], [lz, ddz, hl]]) {
        if (Math.abs(d) < 1e-6) { if (Math.abs(o) > h) { t0 = Infinity; break; } continue; }
        const a = (-h - o) / d, b = (h - o) / d;
        t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
      }
      if (!(t1 > t0) || t0 < 0 || t0 > reach || t0 >= R.t) continue;
      const midZ = lz + ddz * (t0 + t1) / 2, cabin = !v.open && !v.boat && Math.abs(midZ) < hl * 0.3; // across the cabin: a roof, not a hood
      R.t = t0; R.h = cabin ? v.tall : v.tall * PROBE.hoodH; R.depth = t1 - t0; R.what = `${v.type}:${v.id}`;
      R.x1 = c.x + dx * (t1 + r + 0.3); R.z1 = c.z + dz * (t1 + r + 0.3);
    }
    // the static world: the box the line meets first, its height off the ground it stands on, and its depth along the line
    const S = g.statics;
    let ts = S.raycast(c.x, c.z, dx, dz, reach, RAY_SOLID), b = S.hit.box;
    for (const e of S.extra) { // the few boxes outside the hashes (an entrance's collar, a staged barrier): the raycast never meets them
      if (e.op || e.base > 0.5) continue;
      const t = rayBox(e, c.x, c.z, dx, dz);
      if (t >= 0 && t < ts) { ts = t; b = e; }
    }
    if (b && ts < reach && ts < R.t && !b.op && !(b.base > 0.5)) {
      const ix = dx ? 1 / dx : 1e9, iz = dz ? 1 / dz : 1e9;
      const a1 = (b.minX - c.x) * ix, a2 = (b.maxX - c.x) * ix, b1 = (b.minZ - c.z) * iz, b2 = (b.maxZ - c.z) * iz;
      const out = Math.min(Math.max(a1, a2), Math.max(b1, b2));
      R.t = ts; R.h = b.height - (b.base > 0 ? b.base : 0); R.depth = Math.max(0.05, out - ts); R.what = b.tag ?? 'wall';
      R.x1 = c.x + dx * (out + r + 0.3); R.z1 = c.z + dz * (out + r + 0.3);
    }
    if (R.t < Infinity) {
      const V = MOVES.vault, C = MOVES.climb;
      if (R.h <= V.maxH && R.depth <= V.maxDepth) R.kind = 'vault';
      else if (R.h <= C.maxH && R.depth <= C.maxDepth) R.kind = 'climb';
      if (R.kind && this.blocked(R.x1, R.z1, r)) R.kind = null; // nowhere to land: a wall, a car, a crate on the far side
      return R;
    }
    // nothing in the way: a gap ahead (a channel of deep water, a drop) the running jump can clear?
    const gap = this.gapAhead(c, dx, dz);
    if (gap) { R.kind = 'jump'; R.depth = gap.w; R.x1 = gap.x; R.z1 = gap.z; R.what = gap.what; R.t = gap.t0; }
    return R;
  }
  // Somewhere a body can stand: no box, no vehicle.
  blocked(x, z, r) {
    const g = this.g;
    if (g.statics.pointBlocked(x, z, r * 0.9)) return true;
    for (const v of g.vehicles) {
      if (Math.abs(v.x - x) > v.len || Math.abs(v.z - z) > v.len) continue;
      const cs = Math.cos(v.h), sn = Math.sin(v.h), ox = x - v.x, oz = z - v.z;
      if (Math.abs(ox * cs - oz * sn) < v.wid / 2 + r * 0.8 && Math.abs(ox * sn + oz * cs) < v.len / 2 + r * 0.8) return true;
    }
    return false;
  }
  // Ground you can't run across: deep water or a drop. Returns { t0, w, x, z, what } for a gap the jump clears, else null.
  bad(x, z, y0) {
    const g = this.g, d = g.water?.depthAt ? g.water.depthAt(x, z) : 0;
    if (d > PROBE.wadeMax) return 'water';
    const h = g.stunts?.heightAt ? g.stunts.heightAt(x, z, y0) : 0;
    return y0 - h > PROBE.dropMin ? 'drop' : null;
  }
  gapAhead(c, dx, dz) {
    const y0 = c.gy ?? 0, J = MOVES.jump;
    let t0 = -1, what = null;
    for (let t = 0.4; t <= PROBE.gapLook; t += PROBE.gapStep) {
      const why = this.bad(c.x + dx * t, c.z + dz * t, y0);
      if (t0 < 0) { if (why) { if (t > 1.6) return null; t0 = t; what = why; } continue; } // the lip must be at your feet
      if (!why) {
        const w = t - t0;
        if (w > J.maxGap) return null;
        const x = c.x + dx * (t + 0.5), z = c.z + dz * (t + 0.5);
        return this.blocked(x, z, c.radius ?? 0.4) || this.bad(x, z, y0) ? null : { t0, w, x, z, what };
      }
    }
    return null;
  }

  // ---- doing it ---------------------------------------------------------------------------------------------------
  // The verb: what SPACE does here (the player's on-foot frame calls it). dx,dz: where you are heading (or facing).
  // Returns the kind started, or null.
  verb(c, dx, dz, sprinting) {
    if (!dx && !dz) { dx = Math.sin(c.face); dz = Math.cos(c.face); }
    if (c.onDeck) return this.edgeOfRoof(c) ? (this.start(c, 'hang', dx, dz) ? 'hang' : null) : this.start(c, 'dive', dx, dz) ? 'dive' : null;
    const P = this.probe(c, dx, dz);
    if (P.kind === 'vault' || P.kind === 'climb') return this.start(c, P.kind, dx, dz, P) ? P.kind : null;
    if (P.kind === 'jump' && sprinting && (c.speed ?? 0) > MOVES.jump.minSpeed) return this.start(c, 'jump', dx, dz, P) ? 'jump' : null;
    if (c.crouch) return this.start(c, 'roll', dx, dz) ? 'roll' : null;
    return this.start(c, 'dive', dx, dz) ? 'dive' : null;
  }

  start(c, kind, dx, dz, P = null) {
    const M = MOVES[kind], g = this.g;
    if (!M || !c.alive || c.inVehicle || c.mv || c.vault || c.knockT > 0 || c.swim || (c.moveCool ?? 0) > g.time) return false;
    if ((c.stamina ?? 1) < M.stamina) { this.counts.refused++; if (c === g.player) g.hud?.toast?.('TOO WINDED', 'warn'); return false; }
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (c.prone) { c.prone = false; c.proneT = 0; }
    const mv = c.mv = { kind, t: 0, dur: M.dur, dx, dz, x0: c.x, z0: c.z, x1: c.x + dx * (M.dist ?? 0), z1: c.z + dz * (M.dist ?? 0), h: 0, y0: c.gy ?? 0, arms: null, from: null };
    if (P && (kind === 'vault' || kind === 'climb' || kind === 'jump')) { mv.x1 = P.x1; mv.z1 = P.z1; mv.h = P.h; mv.what = P.what; }
    if (kind === 'climb') mv.arms = 'handsUp';
    if (kind === 'hang') {
      const o = c.onDeck, v = o.v, e = this.edgeOfRoof(c), n = NORMAL[e], cs = Math.cos(v.h), sn = Math.sin(v.h);
      const lx = o.lx + n[0] * 0.75, lz = o.lz + n[1] * 0.75; // over the edge, hands on the lip
      mv.x1 = v.x + lx * cs + lz * sn; mv.z1 = v.z - lx * sn + lz * cs; mv.h = c.perchY ?? 0; mv.arms = 'handsUp'; mv.from = v.id;
      g.decks.dismount(c, 'hang', true, mv.x1, mv.z1);
      c.x = mv.x0 = mv.x1; c.z = mv.z0 = mv.z1;
    }
    if (kind === 'dive') { c.dive = M.dur; c.diveDx = dx; c.diveDz = dz; } // the old dive flag: doors shoulder open, a deck's rail goes over
    c.stamina = Math.max(0, (c.stamina ?? 1) - M.stamina);
    c.face = Math.atan2(dx, dz);
    g.noise(c.x, c.z, M.noise, c);
    g.audio?.throwWhoosh?.(g.pan ? g.pan(c.x) : 0);
    this.counts[kind]++;
    g.emit('moveStart', { id: c.id, kind, what: mv.what ?? null, h: +mv.h.toFixed(2) });
    return true;
  }

  // On a roof deck within reach of an edge you could hang off: which edge (or null).
  edgeOfRoof(c) {
    const o = c.onDeck;
    if (!o || o.D !== o.v.roofDeck) return null;
    const F = o.D.floor;
    const d = { front: F[3] - o.lz, rear: o.lz - F[2], left: F[1] - o.lx, right: o.lx - F[0] };
    let best = null, bd = 0.7;
    for (const e of EDGES) if (d[e] < bd) { bd = d[e]; best = e; }
    return best;
  }

  step(c, dt) {
    const mv = c.mv, M = MOVES[mv.kind], g = this.g;
    mv.t += dt;
    const k = clamp01(mv.t / mv.dur);
    c.speed = 0; c.aiming = false;
    if (mv.kind === 'vault' || mv.kind === 'climb' || mv.kind === 'jump') {
      // over the top on a fixed line: the probe found the landing free before it started
      const e = mv.kind === 'climb' ? smooth(clamp01((k - 0.25) / 0.65)) : smooth(k);
      c.x = mv.x0 + (mv.x1 - mv.x0) * e; c.z = mv.z0 + (mv.z1 - mv.z0) * e;
      c.vaultY = mv.kind === 'jump' ? Math.sin(Math.PI * k) * 0.7 : mv.kind === 'climb' ? Math.min(mv.h + 0.05, mv.h * 1.6 * Math.sin(Math.PI * Math.min(1, k * 1.15))) : Math.sin(Math.PI * k) * Math.max(0.35, mv.h * 0.7);
    } else if (mv.kind === 'hang') {
      // hanging by the hands (the first half), then the drop: the feet start ~1.9 m under the lip, so a 3 m roof is a 1 m drop
      const hang = Math.max(0, mv.h - 1.9);
      c.vaultY = k < 0.55 ? hang : hang * (1 - smooth((k - 0.55) / 0.45));
      if (k > 0.55) mv.arms = null;
    } else {
      // dive, roll, slide: along the line through the world's boxes (a wall stops you, a door gives)
      const sp = mv.kind === 'dive' ? (k < 0.62 ? 1.35 : 0.42) : mv.kind === 'slide' ? 1.5 - k : 1;
      const v = (M.dist / mv.dur) * sp;
      _t.x = c.x + mv.dx * v * dt; _t.z = c.z + mv.dz * v * dt;
      g.statics.resolveBody(_t, c.radius ?? 0.4, c);
      c.x = _t.x; c.z = _t.z;
      if (mv.kind === 'dive') c.dive = Math.max(0.001, mv.dur - mv.t);
      g.standOn(c);
      if (c.vault) { c.mv = null; c.dive = 0; return false; } // dove into a window: through it (interiors' vault takes over)
      if (c.onDeck) { c.mv = null; c.dive = 0; return false; } // into an open bed
    }
    if (k < 1) return true;
    this.finish(c, mv);
    return false;
  }

  finish(c, mv) {
    const g = this.g, M = MOVES[mv.kind];
    c.mv = null; c.vaultY = 0; c.dive = 0; c.moveCool = g.time + M.cool;
    g.standOn(c);
    let ends = M.ends;
    if (ends === 'prone') { const r = g.stance.setProne(c, true); if (!r.ok) ends = 'stand'; else c.proneT = 0.25; } // a dive lands you flat (in water: on your feet)
    if (mv.kind === 'dive' || mv.kind === 'slide' || mv.kind === 'roll') g.fx?.dust?.(c.x, c.z, mv.kind === 'dive' ? 3 : 2);
    this.last = { kind: mv.kind, by: c.id, x: +c.x.toFixed(2), z: +c.z.toFixed(2), ends, what: mv.what ?? null };
    g.emit(mv.kind === 'dive' ? 'dived' : 'moveDone', { id: c.id, kind: mv.kind, x: +c.x.toFixed(1), z: +c.z.toFixed(1), ends });
  }

  // CTRL pressed at a sprint: the slide.
  slide(c, dx, dz) { return (c.speed ?? 0) > MOVES.slide.minSpeed && this.start(c, 'slide', dx, dz); }

  // ---- being hard to hit, honestly ------------------------------------------------------------------------------
  bodyH(c) {
    if (c.mv) return MOVES[c.mv.kind].bodyH;
    if (c.dive > 0) return MOVES.dive.bodyH;
    if (c.prone) return LOW_BODY.prone;
    return LOW_BODY.standH;
  }
  hitShare(c, d) {
    const h = this.bodyH(c);
    if (h >= LOW_BODY.standH) return 1;
    const low = Math.max(LOW_BODY.floor, h / LOW_BODY.standH);
    return low + (1 - low) * clamp01((LOW_BODY.close - d) / LOW_BODY.close);
  }

  view() { return { counts: this.counts, last: this.last }; }
}

// The pose solver's hook (systems/characters.js, root frame): the body through the move. T, Rm: scratch matrices.
export function moveRoot(ch, root, T, Rm) {
  const mv = ch.mv, k = clamp01(mv.t / mv.dur);
  if (mv.kind === 'roll') root.multiply(T.makeTranslation(0, 0.42, 0)).multiply(Rm.makeRotationX(Math.PI * 2 * smooth(k))).multiply(T.makeTranslation(0, -0.42 - 0.25 * Math.sin(Math.PI * k), 0));
  else if (mv.kind === 'slide') { const s = Math.sin(Math.PI * Math.min(1, k * 1.4)); root.multiply(T.makeTranslation(0, -0.2 * s, 0)).multiply(Rm.makeRotationX(-1.0 * s)); }
  else if (mv.kind === 'vault') { root.multiply(Rm.makeRotationZ(0.55 * Math.sin(Math.PI * k))).multiply(Rm.makeRotationX(0.25 * Math.sin(Math.PI * k))); }
  else if (mv.kind === 'climb') root.multiply(Rm.makeRotationX(0.45 * Math.sin(Math.PI * k)));
  else if (mv.kind === 'jump') root.multiply(Rm.makeRotationX(0.3 * Math.sin(Math.PI * k)));
}
