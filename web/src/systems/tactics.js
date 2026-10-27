// TACTICS: one fighting brain that uses the environment, shared by the crew and every hostile faction
// (docs/design/WEB_CREW.md §6; rows in data/doctrine.js). It owns where a fighter STANDS; systems/ai.js still owns when
// they shoot. Per unit (c.tac, made once):
//   - a distance BAND from the weapon (shotgun close, rifle long) x the doctrine's and the card's bandMul;
//   - COVER: a plan casts probe rays from the threat through points round the unit (or round an anchor); a ray that hits
//     something short of its point means there is a thing between the threat and that spot, and the spot just behind
//     its face is a cover point. Each candidate scores
//       S = w.exposure·exposure·coverPref + w.band·bandFit − w.travel·walk + w.elevation·rise·highGround
//           − w.crowd·(a squadmate already going there) + w.flank·flankFit (flankers) + w.vehicle (a parked car, if liked)
//     exposure 1 = low cover (hidden crouched, can shoot standing), 0.7 = full cover (hidden standing), 0 = open;
//   - ROLES in a squad (same side, same target, within squadR): PIN (hold a cover point in band and keep the target's
//     head down: suppressive fire at cover they cannot see past), FLANK (a point 60-120° off the target's facing at
//     band range, by cover where there is some), BOUND / OVERWATCH (half move up cover to cover while half shoot, swap
//     every boundS), RETREAT (morale broke: back away to cover, regroup after regroupS), HOLD (a post: never past holdR);
//   - SUPPRESSION: rounds passing close (a shooter facing within coneDeg of a unit) raise c.tac.supp; it decays; it
//     widens the unit's aim, hugs them to cover (crouched) and counts against morale;
//   - MORALE = 1 − 1.2·(the squad's fallen share) − 0.4·supp − 0.3·(own wounds): under breakAt, the unit falls back.
// Cost: a plan is ~20 raycasts; at most perFrame plans a frame, each unit re-plans at thinkHz. Steering is per frame,
// allocation-free (the nav path array is made at plan rate, never per frame).
import { DOCTRINE, BANDS, TACTICS as T } from '../data/doctrine.js';
import { RAY_SIGHT, RAY_SOLID } from '../engine/collision.js';

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const CAND = { x: 0, z: 0, s: -1e9, cover: 0, veh: false };
const NEAR = [];  // the boxes round a search (reused: no allocation per plan)
const NEAR_MAX = 10;
const P = { x: 0, z: 0 };

export class Tactics {
  constructor(game) {
    this.g = game;
    this.budget = T.perFrame;
    this.on = true;            // false: every faction back on the plain ai.js fight (an A/B for perf or a test)
    this.stats = { plans: 0, paths: 0, raycasts: 0, flanks: 0, breaks: 0, suppressed: 0, maxPlanMs: 0, maxPathMs: 0, planMs: 0, boxCover: 0 };
    this.mark = 0;

  }

  beginFrame() { this.budget = T.perFrame; }

  doctrineOf(c) {
    const D = DOCTRINE[c.faction];
    return D && D.on ? D : null;
  }

  unit(c) {
    return (c.tac ??= { role: 'pin', gx: 0, gz: 0, goal: false, cover: 0, inCover: false, supp: 0, think: Math.random() / T.thinkHz,
      side: 0, morale: 1, roleT: 0, squad: 1, idx: 0, fallen: 0, path: null, pi: 0, pathAt: -1e9, why: '', band0: 0, band1: 0, force: null,
      fx: 0, fz: 0, fr: 0, lastX: 0, lastZ: 0, d: 0, plans: 0, holdFire: false });
  }

  band(c, D) {
    const b = BANDS[c.weapon ?? 'none'] ?? BANDS.pistol, m = (D?.bandMul ?? 1) * (c.crewRec?.row.ai.bandMul ?? 1);
    return [b[0] * m, b[1] * m];
  }

  // Called from ai.js's fight branch for a unit with a target. Returns true when it moved the unit (ai.js then skips its
  // own strafe/approach). los: ai.js's line of sight to the target this frame.
  fight(c, t, tx, tz, d, los, dt) {
    if (!this.on) return false;
    const D = this.doctrineOf(c);
    if (!D || c.perch || c.baseId && c.post && !c.tac) return false; // a sentry on a tower deck keeps its deck
    const U = this.unit(c);
    U.d = d;
    if (los) { U.lastX = tx; U.lastZ = tz; }
    U.supp = Math.max(0, U.supp - T.suppress.decay * dt);
    if (U.roleT > 0) U.roleT -= dt;
    if ((U.think -= dt) <= 0 && this.budget > 0) { this.budget--; U.think = 1 / T.thinkHz; this.plan(c, t, tx, tz, d, D, U); }
    return this.steer(c, U, dt);
  }

  // ---- the plan ----------------------------------------------------------------------------------------------------
  plan(c, t, tx, tz, d, D, U) {
    const t0 = performance.now(), g = this.g;
    this.stats.plans++; U.plans++;
    const [b0, b1] = this.band(c, D); U.band0 = b0; U.band1 = b1;
    // The squad: my side, fighting the same target, close by. Fallen: my side's dead near here (the last minute).
    let n = 1, idx = 0, fallen = 0;
    for (const o of g.chars) {
      if (o === c || o.faction !== c.faction) continue;
      const dx = o.x - c.x, dz = o.z - c.z;
      if (Math.abs(dx) > T.squadR || Math.abs(dz) > T.squadR) continue;
      if (!o.alive) { if (o.deadTime < 60) fallen++; continue; }
      if (o.target !== t || o.inVehicle) continue;
      n++; if (o.slot < c.slot) idx++;
    }
    U.squad = n; U.idx = idx; U.fallen = fallen;
    const wound = 1 - (c.hp / (c.maxHp || 100));
    U.morale = 1 - 1.2 * (fallen / (n + fallen)) - 0.4 * U.supp - 0.3 * wound;
    const card = c.crewRec?.row.ai;
    const breakAt = card ? card.breakAt : D.breakAt;
    // Role.
    let role;
    if (U.force) role = U.force;
    else if (U.role === 'retreat' && U.roleT > 0) role = 'retreat';
    else if (U.morale < breakAt) { role = 'retreat'; U.roleT = D.regroupS; this.stats.breaks++; g.emit('tacBreak', { id: c.id, faction: c.faction, morale: +U.morale.toFixed(2) }); }
    else if (D.holdR > 0 && c.home && Math.hypot(c.x - c.home.x, c.z - c.home.z) > D.holdR) role = 'hold';
    else {
      const flankShare = card ? (D.flank + card.flank) / 2 : D.flank;
      const flankers = n >= 2 ? Math.max(1, Math.round(n * flankShare)) : (flankShare >= 0.75 ? 1 : 0);
      if (idx >= n - flankers) role = 'flank';
      else if (D.bound && n >= 2) role = ((idx + Math.floor(g.time / D.boundS)) & 1) ? 'bound' : 'overwatch';
      else role = 'pin';
    }
    if (role !== U.role) { U.role = role; if (role === 'flank') this.stats.flanks++; }
    // Anchor and search.
    const mid = (b0 + b1) / 2, R = T.coverR;
    let ax = c.x, az = c.z, r = R;
    if (role === 'flank') {
      const tf = t.inVehicle ? t.inVehicle.h : t.face ?? 0;
      if (!U.side) { const off = angDiff(Math.atan2(c.x - tx, c.z - tz), tf); U.side = off >= 0 ? 1 : -1; }
      const a = tf + U.side * T.flank.goalDeg * DEG, rr = clamp(mid * D.flankWide, b0, b1 * 1.2);
      ax = tx + Math.sin(a) * rr; az = tz + Math.cos(a) * rr; r = R * 0.6;
      U.fx = ax; U.fz = az; U.fr = rr;
    } else if (role === 'retreat') {
      const dd = d || 1; ax = c.x + ((c.x - tx) / dd) * T.retreat.dist; az = c.z + ((c.z - tz) / dd) * T.retreat.dist;
    } else if (role === 'bound') {
      const dd = d || 1, step = clamp(d - mid, -8, 8); ax = c.x - ((c.x - tx) / dd) * step; az = c.z - ((c.z - tz) / dd) * step; r = R * 0.7;
    } else if (role === 'hold') { ax = c.home.x; az = c.home.z; r = Math.min(R, D.holdR * 0.6); }
    else if (U.force === 'cover' || U.force === 'holdpos') { ax = U.anchorX ?? c.x; az = U.anchorZ ?? c.z; r = U.force === 'holdpos' ? 3.5 : R * 0.8; }
    this.search(c, t, tx, tz, ax, az, r, b0, b1, D, U, role);
    U.gx = CAND.x; U.gz = CAND.z; U.cover = CAND.cover; U.goal = true; U.veh = CAND.veh;
    // A cover point with no line on the target gets a PEEK spot: a step to one side where the eye clears the edge.
    // (On the street every box stops a round, low or not, so a fighter in cover leans out to shoot and ducks back.)
    U.peek = false;
    if (U.cover > 0 && role !== 'retreat') {
      const dx = tx - U.gx, dz = tz - U.gz, L = Math.hypot(dx, dz) || 1, px = dz / L, pz = -dx / L, S = g.statics;
      for (let k = 0; k < 4 && !U.peek; k++) {
        const s = (k & 1 ? -1 : 1) * (k < 2 ? 1.3 : 2.4), qx = U.gx + px * s, qz = U.gz + pz * s;
        this.stats.raycasts++;
        if (!S.pointBlocked(qx, qz, 0.4) && g.los(qx, qz, tx, tz)) { U.peek = true; U.peekX = qx; U.peekZ = qz; }
      }
    }
    U.why = `${role}${CAND.cover ? (CAND.veh ? ' behind a car' : CAND.cover >= 1 ? ' low cover' : ' full cover') : ' open'} band ${b0.toFixed(0)}-${b1.toFixed(0)}`;
    // A path when the goal is far or not in a straight line (re-planned at most every repathS).
    const ms0 = performance.now() - t0;
    this.stats.planMs += ms0;
    if (ms0 > this.stats.maxPlanMs) this.stats.maxPlanMs = ms0; // the plan itself (raycasts and scoring); the path below is counted apart
    const gd = Math.hypot(U.gx - c.x, U.gz - c.z);
    U.path = null; U.pi = 0;
    if (gd > 1.5 && (gd > T.pathR || !g.statics.lineOfSight(c.x, c.z, U.gx, U.gz, RAY_SOLID)) && g.time - U.pathAt > T.repathS && g.nav?.foot) {
      U.pathAt = g.time;
      const t1 = performance.now(), p = g.nav.foot.find(c.x, c.z, U.gx, U.gz, 1500); // a tactical move is short: a small search budget
      this.stats.paths++;
      const pm = performance.now() - t1; if (pm > this.stats.maxPathMs) this.stats.maxPathMs = pm;
      if (p && p.length) { U.path = p; U.pi = 0; }
    }
  }

  // The best point round (ax, az) within r for this role. Result in CAND (module scratch: no allocation).
  search(c, t, tx, tz, ax, az, r, b0, b1, D, U, role) {
    const g = this.g, S = g.statics, W = T.w, card = c.crewRec?.row.ai;
    const coverPref = card ? (card.coverPref + D.coverPref) / 2 : D.coverPref, hi = card?.highGround ? 1 : D.highGround;
    const mid = (b0 + b1) / 2, half = Math.max(2, (b1 - b0) / 2);
    const bandW = role === 'retreat' ? 0.3 : U.force === 'holdpos' || U.force === 'cover' ? 0.2 : 1;
    const tf = t.inVehicle ? t.inVehicle.h : t.face ?? 0;
    const base = g.stunts?.heightAt ? g.stunts.heightAt(c.x, c.z, 0) : 0;
    CAND.s = -1e9; CAND.x = ax; CAND.z = az; CAND.cover = 0; CAND.veh = false;
    const score = (px, pz, cover, veh, stay) => {
      const dT = Math.hypot(px - tx, pz - tz);
      const bandFit = clamp(1 - Math.abs(dT - mid) / half, -3, 1); // out of band counts more the further out
      const walk = Math.hypot(px - c.x, pz - c.z);
      let crowd = 0;
      for (const o of g.chars) { if (o === c || !o.tac?.goal || !o.alive || o.faction !== c.faction) continue; if (Math.abs(o.tac.gx - px) < 1.6 && Math.abs(o.tac.gz - pz) < 1.6) { crowd = 1; break; } }
      let flankFit = 0;
      if (role === 'flank') { const off = Math.abs(angDiff(Math.atan2(px - tx, pz - tz), tf)) / DEG; flankFit = off >= T.flank.minDeg && off <= T.flank.maxDeg ? 1 : -Math.min(1, Math.min(Math.abs(off - T.flank.minDeg), Math.abs(off - T.flank.maxDeg)) / 45); }
      let rise = 0;
      if (hi > 0 && g.stunts?.heightAt) rise = clamp((g.stunts.heightAt(px, pz, 0) - base) / 3, 0, 1);
      const s = W.exposure * cover * coverPref + W.band * bandFit * bandW - W.travel * walk + W.elevation * rise * hi - W.crowd * crowd
        + W.flank * flankFit + (veh ? W.vehicle * (card?.vehicleCover ? 2 : 1) : 0) + (stay ? W.stay : 0);
      if (s > CAND.s) { CAND.s = s; CAND.x = px; CAND.z = pz; CAND.cover = cover; CAND.veh = veh; }
    };
    // Where they stand now (a little loyalty: no jitter between equal spots), then the anchor itself.
    if (role !== 'flank' && role !== 'retreat' && role !== 'bound') score(c.x, c.z, this.coverAt(tx, tz, c.x, c.z), false, true);
    if (!S.pointBlocked(ax, az, 0.45)) score(ax, az, this.coverAt(tx, tz, ax, az), false, false);
    const n = T.probes, spin = (c.slot * 0.618) % 1;
    for (let i = 0; i < n; i++) {
      const a = (i / n + spin) * TAU, rr = r * (0.35 + 0.65 * (((i * 7) % n) / n));
      const px = ax + Math.sin(a) * rr, pz = az + Math.cos(a) * rr;
      // From the threat toward the probe: something short of it is a wall between; stand just behind its face.
      const dx = px - tx, dz = pz - tz, L = Math.hypot(dx, dz);
      if (L < 2) continue;
      const ux = dx / L, uz = dz / L;
      this.stats.raycasts++;
      const hit = S.raycast(tx, tz, ux, uz, L + 2, RAY_SIGHT, T.crouchY);
      let cx = px, cz = pz, cover = 0;
      if (hit > 2 && hit < L + 2 - 0.05) {
        cx = tx + ux * (hit + 0.95); cz = tz + uz * (hit + 0.95);
        P.x = cx; P.z = cz;
        if (S.resolveCircle(P, 0.45) > 0) { cx = P.x; cz = P.z; }
        this.stats.raycasts++;
        cover = S.lineOfSight(tx, tz, cx, cz, RAY_SIGHT, T.crouchY) ? 0 : S.lineOfSight(tx, tz, cx, cz, RAY_SIGHT, T.standY) ? 1 : 0.7;
        if (card?.hardCoverOnly && cover === 1) cover = 0.85; // the Wheel Boss: hard cover, never a car door
      } else if (S.pointBlocked(px, pz, 0.45)) continue;
      if (Math.hypot(cx - ax, cz - az) > r * 1.6) continue;
      score(cx, cz, cover, false, false);
    }
    // The things standing round the anchor (walls, crates, sandbags, wrecks: the collision grid's boxes): the spot just
    // behind each one from the threat's side.
    this.gather(ax, az, r);
    for (let i = 0; i < NEAR.length; i++) {
      const b = NEAR[i], bx = (b.minX + b.maxX) / 2, bz = (b.minZ + b.maxZ) / 2;
      const dx = bx - tx, dz = bz - tz, L = Math.hypot(dx, dz);
      if (L < 2) continue;
      const ux = dx / L, uz = dz / L, ext = Math.abs(ux) * (b.maxX - b.minX) / 2 + Math.abs(uz) * (b.maxZ - b.minZ) / 2;
      P.x = bx + ux * (ext + 0.75); P.z = bz + uz * (ext + 0.75);
      S.resolveCircle(P, 0.45);
      const cover = this.coverAt(tx, tz, P.x, P.z);
      if (!cover) continue;
      this.stats.boxCover++;
      score(P.x, P.z, card?.hardCoverOnly && cover === 1 ? 0.85 : cover, false, false);
    }
    // Parked vehicles are cover too (the Scrap Smith likes them best).
    for (const v of g.vehicles) {
      if (v.dead && !v.mesh) continue;
      if (Math.abs(v.x - ax) > r || Math.abs(v.z - az) > r) continue;
      if (Math.hypot(v.vx ?? 0, v.vz ?? 0) > 1.5 || v.trundle) continue;
      if (card?.hardCoverOnly) continue;
      const dx = v.x - tx, dz = v.z - tz, L = Math.hypot(dx, dz) || 1, off = Math.max(v.len ?? 4, v.wid ?? 2) * 0.5 + 0.9;
      P.x = v.x + (dx / L) * off; P.z = v.z + (dz / L) * off;
      S.resolveCircle(P, 0.45);
      score(P.x, P.z, 0.9, true, false);
    }
  }

  // The nearest few boxes within r of (x, z) into NEAR: the island's grid or the streamed ring's cells (engine/collision.js).
  gather(x, z, r) {
    const S = this.g.statics, cell = S.cell;

    NEAR.length = 0;
    const x0 = Math.floor((x - r) / cell), x1 = Math.floor((x + r) / cell), z0 = Math.floor((z - r) / cell), z1 = Math.floor((z + r) / cell);
    const island = Math.abs(x) < 456 && Math.abs(z) < 456;
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const list = island ? S.cells[S.ci(gz * cell + cell / 2) * S.n + S.ci(gx * cell + cell / 2)] : (S.chunkBoxes > 0 ? S.chunkCell(gx, gz) : null);
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.op || b.base > 0 || NEAR.includes(b)) continue; // (no mark on the box: the collision boxes keep one shape)
        const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
        if (w > 40 || d > 40 || w * d < 0.25 || b.height < 0.8) continue; // the ground, a kerb, a hairline: not cover
        const cx = (b.minX + b.maxX) / 2 - x, cz = (b.minZ + b.maxZ) / 2 - z;
        if (cx * cx + cz * cz > r * r) continue;
        if (NEAR.length < NEAR_MAX) NEAR.push(b);
        else { // keep the nearest NEAR_MAX
          let far = 0, fd = -1;
          for (let k = 0; k < NEAR.length; k++) { const o = NEAR[k], ex = (o.minX + o.maxX) / 2 - x, ez = (o.minZ + o.maxZ) / 2 - z, e = ex * ex + ez * ez; if (e > fd) { fd = e; far = k; } }
          if (cx * cx + cz * cz < fd) NEAR[far] = b;
        }
      }
    }
    return NEAR;
  }

  // How well a spot hides from (tx, tz): 1 low cover, 0.7 full cover, 0 open (two raycasts).

  coverAt(tx, tz, x, z) {
    const S = this.g.statics;
    this.stats.raycasts += 2;
    if (S.lineOfSight(tx, tz, x, z, RAY_SIGHT, T.crouchY)) return 0;
    return S.lineOfSight(tx, tz, x, z, RAY_SIGHT, T.standY) ? 1 : 0.7;
  }

  // ---- per frame: walk to the goal --------------------------------------------------------------------------------
  steer(c, U, dt) {
    if (!U.goal) return false;
    const g = this.g;
    // The peek cycle: in cover with a peek spot and not pinned down, out to shoot for peekOut s, back for peekIn s.
    let sx = U.gx, sz = U.gz;
    if (U.peek && U.inCover !== null && U.role !== 'retreat' && U.role !== 'flank' && U.role !== 'bound') {
      U.peekT = (U.peekT ?? Math.random() * 2) + dt;
      const cyc = T.peek.out + T.peek.in, ph = U.peekT % cyc, pinned = U.supp > T.suppress.hugAt;
      U.peeking = !pinned && ph < T.peek.out && Math.hypot(U.gx - c.x, U.gz - c.z) < 3.5;
      if (U.peeking) { sx = U.peekX; sz = U.peekZ; }
    } else U.peeking = false;
    let wx = sx, wz = sz;
    if (U.path && U.pi < U.path.length) {
      const w = U.path[U.pi];
      if (Math.hypot(w.x - c.x, w.z - c.z) < 1.1) U.pi++;
      if (U.pi < U.path.length) { wx = U.path[U.pi].x; wz = U.path[U.pi].z; }
    }
    const dx = wx - c.x, dz = wz - c.z, gd = Math.hypot(sx - c.x, sz - c.z);
    if (gd < T.arrive) {
      c.speed = 0;
      U.inCover = U.cover > 0 && !U.peeking;

      c.crouch = U.inCover && (U.supp > T.suppress.hugAt || U.cover >= 1 || U.role === 'overwatch');
      return true;
    }
    U.inCover = false; c.crouch = false;
    const sp = U.role === 'retreat' ? T.speed.retreat : U.role === 'bound' ? T.speed.bound : U.role === 'flank' ? T.speed.run : U.supp > T.suppress.hugAt ? T.speed.creep : T.speed.run;
    g.ai.move(c, dx, dz, sp * (c.crewRec ? 1 : 1), dt);
    return true;
  }

  // ---- suppression: a shot from src, its rounds going along src.face --------------------------------------------------
  onShot(src) {
    if (!this.on || !src) return;
    const g = this.g, a = src.face ?? 0, S = T.suppress, cone = S.coneDeg * DEG;
    for (const c of g.chars) {
      const U = c.tac;
      if (!U || c === src || !c.alive) continue;
      const dx = c.x - src.x, dz = c.z - src.z;
      if (Math.abs(dx) > S.r || Math.abs(dz) > S.r) continue;
      const off = Math.abs(angDiff(Math.atan2(dx, dz), a));
      if (off > cone) continue;
      if (c.target !== src && !g.ai.hostile(c, src)) continue;
      U.supp = Math.min(1, U.supp + S.add * (1 - off / cone));
      this.stats.suppressed++;
    }
  }

  // The aim and rate penalties ai.js asks for.
  aimMul(c) { return c.tac ? 1 + c.tac.supp * T.suppress.aimMul : 1; }
  // Pinning element: shoot at the cover the target went behind (suppressive fire).
  suppressive(c) { const U = c.tac, D = U && this.doctrineOf(c); return !!U && !!D && (U.role === 'pin' || U.role === 'overwatch') && Math.random() < D.suppress; }

  // A unit's tactical picture (the `tactics` command).
  view(c) {
    const U = c.tac, g = this.g;
    if (!U) return { id: c.id, name: c.npc?.name ?? c.name, faction: c.faction, tactics: null, why: this.doctrineOf(c) ? 'not fighting yet (a plan starts with a target)' : 'this side keeps its own brain' };
    const t = c.target, off = t ? Math.abs(angDiff(Math.atan2(c.x - (t.inVehicle?.x ?? t.x), c.z - (t.inVehicle?.z ?? t.z)), t.inVehicle ? t.inVehicle.h : t.face ?? 0)) / DEG : null;
    return { id: c.id, name: c.npc?.name ?? c.name, faction: c.faction, doctrine: this.doctrineOf(c)?.name ?? null, role: U.role, why: U.why,
      goal: { x: +U.gx.toFixed(1), z: +U.gz.toFixed(1) }, inCover: U.inCover, peeking: !!U.peeking, peekSpot: U.peek ? { x: +U.peekX.toFixed(1), z: +U.peekZ.toFixed(1) } : null, cover: U.cover, behindCar: !!U.veh, band: [+U.band0.toFixed(1), +U.band1.toFixed(1)],
      distance: +U.d.toFixed(1), offFacingDeg: off === null ? null : +off.toFixed(0), suppression: +U.supp.toFixed(2), morale: +U.morale.toFixed(2),
      squad: U.squad, fallen: U.fallen, path: U.path ? U.path.length - U.pi : 0, forced: U.force, plans: U.plans, target: t?.id ?? null, at: { x: +c.x.toFixed(1), z: +c.z.toFixed(1) } };
  }
}
