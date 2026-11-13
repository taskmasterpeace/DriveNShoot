// THE CAVALRY COMPANY (VEHICLES V2 slice 6; rows in data/cavalry.js). A mercenary company on real horses: its post (low
// adobe walls round a yard, a gate, a corral rail, the company's flag on a pole), a garrison whose horses stand tied at the
// rail, and patrols that ride a loop out of the gate in file and shoot what the company is paid to shoot.
// The horses are the horses ledger's (systems/horses.js mk / spawnBody / moveFree): a company horse is owner
// 'company:<post>', and while a rider sits it (H.npcRider) the horses system leaves its steering to this one. A rider is an
// ordinary character (faction 'soldier', society faction 'company'), drawn in the saddle by the same seat pose the player
// rides with (horses.riderPose); ai.js leaves a mounted rider to this system (one line). When a rider dies the horse is a
// loose company horse (yours to catch and ride off, a theft); when a horse dies its rider fights on foot.
// Placed ONCE: the dead stay dead, a taken horse stays taken; nothing regenerates. Away from you the people are records
// (hp, the patrol's place on its loop, which ran forward on the clock); near you they are bodies.
import * as THREE from 'three';
import { COMPANY, RIDER, CAVALRY_POSTS, CAVALRY } from '../data/cavalry.js';
import { WEAPONS } from './combat.js';
import { outfit } from './characters.js';
import { makeRng } from '../engine/rng.js';

const ADOBE = '#9a6646', ADOBE_DARK = '#5a3a26', RAIL = '#4a3624', POLE = '#2e2a26', FLAG = '#7a3a1e', CANVAS = '#cfc4a4', CANVAS_DARK = '#9a8f72';
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Cavalry {
  constructor(game) {
    this.g = game;
    game.cavalry = this;
    this.posts = CAVALRY_POSTS.map((P) => ({ row: P, built: false, live: false, people: [], boxes: [] }));
    this.counts = { placed: 0, riderKills: 0, ridersDown: 0, horsesTaken: 0, shots: 0 };
    this.registered = false;
    if (game.scene) {
      this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), 64);
      this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.name = 'cavalry-post';
      game.scene.add(this.mesh);
    }
  }
  F() { return this.g.society?.factions; }
  register() { if (this.registered || !this.F()) return; this.F().register('company', COMPANY); this.registered = true; }

  // ---- the post ------------------------------------------------------------------------------------------------------------
  // Walls: four sides of a square, the gate a gap in its side; collision boxes in statics.extra, drawn in one mesh.
  build(S) {
    const P = S.row, h = P.half, t = 0.9, ht = 2.2, g = this.g, gap = 5;
    const sides = [
      ['N', -h, h - t / 2, h, h + t / 2], ['S', -h, -h - t / 2, h, -h + t / 2],
      ['E', h - t / 2, -h, h + t / 2, h], ['W', -h - t / 2, -h, -h + t / 2, h],
    ];
    const pieces = [];
    for (const [side, x0, z0, x1, z1] of sides) {
      if (side === P.gate) { // two stubs either side of the gate
        const horiz = side === 'N' || side === 'S';
        if (horiz) { pieces.push([x0, z0, -gap / 2, z1], [gap / 2, z0, x1, z1]); } else { pieces.push([x0, z0, x1, -gap / 2], [x0, gap / 2, x1, z1]); }
      } else pieces.push([x0, z0, x1, z1]);
    }
    for (const [x0, z0, x1, z1] of pieces) {
      const b = { minX: P.x + x0, minZ: P.z + z0, maxX: P.x + x1, maxZ: P.z + z1, tag: 'cav-wall', height: ht, mark: 0, op: null, holes: null, holeX: false, sill: 0, base: 0, owner: null };
      g.statics.extra.push(b); g.statics.rayExtra?.push(b); S.boxes.push(b); // movers meet it; bullets and sight stop at it (engine/collision.js rayExtra)
    }
    S.walls = pieces; S.built = true;
    this.dirty = true;
  }

  // ---- the people ------------------------------------------------------------------------------------------------------------
  // The records, made once (the first time you come near): garrison riders by the rail, patrols on their loops.
  place(S) {
    const P = S.row, Hs = this.g.horses, rng = makeRng(0xc4a1 ^ P.x ^ P.z);
    let n = 0;
    const person = (o) => ({ name: RIDER.names[n % RIDER.names.length], flag: RIDER.flags[n++ % RIDER.flags.length], hp: RIDER.hp, alive: true, weapon: pickW(rng), c: null, ...o });
    const rail = { x: P.x - P.half + 4, z: P.z + P.half - 3 }; // the corral rail inside the north-west corner
    P.garrison.forEach((h, i) => {
      const H = Hs.mk(h.breed, { x: rail.x + i * 2.4, z: rail.z, owner: `company:${P.id}`, saddle: true, bond: 0.4 });
      H.tied = { x: H.x, z: H.z }; // tied at the rail; fed from the company's hay (it grazes nothing there)
      S.people.push(person({ kind: 'garrison', horse: H.id, x: rail.x + i * 2.4, z: rail.z - 2.2 }));
    });
    for (const T of P.patrols) {
      const pat = { id: T.id, row: T, s: rng() * loopLen(T.route), riders: [] };
      T.riders.forEach((h, i) => {
        const at = along(T.route, pat.s - i * CAVALRY.fileGap, P);
        const H = Hs.mk(h.breed, { x: at.x, z: at.z, owner: `company:${P.id}`, saddle: true, bond: 0.4 });
        const r = person({ kind: 'patrol', horse: H.id, patrol: T.id, slot: i });
        pat.riders.push(r); S.people.push(r);
      });
      (S.patrols ??= []).push(pat);
    }
    S.placed = true; this.counts.placed += S.people.length;
    this.g.emit?.('cavalryPlaced', { post: P.id, people: S.people.length });
  }

  // A rider's body: an ordinary character, the company's, in the saddle of its horse if the horse is alive.
  spawn(S, r) {
    const g = this.g, H = g.horses.get(r.horse);
    const at = H && H.alive && !H.stolen ? H : r;
    const c = g.addChar({ x: at.x, z: at.z, faction: 'soldier', weapon: r.weapon, hp: r.hp, name: r.name, flag: r.flag, colors: { ...outfit('soldier'), ...RIDER.colors } });
    if (!c) return null;
    c.fid = 'company'; this.F()?.assign(c);
    c.cavalry = { post: S.row.id, rec: r }; c.maxHp = RIDER.hp; c.hp = r.hp;
    r.c = c;
    if (H && H.alive && !H.stolen && H.owner === `company:${S.row.id}` && r.kind === 'patrol') {
      const pat = r.pat ?? (r.pat = S.patrols.find((p) => p.id === r.patrol));
      if (pat) { const at = along(pat.row.route, pat.s - (r.slot ?? 0) * CAVALRY.fileGap, S.row); H.x = at.x; H.z = at.z; const a = g.horses.bodyOf(H); if (a) { a.x = at.x; a.z = at.z; } c.x = at.x; c.z = at.z; } // where the loop's clock has them
      this.seat(c, H);
    }
    return c;
  }
  seat(c, H) { c.mount = H; H.rider = c.id; H.npcRider = c; H.tied = null; H.mountT = 0; this.g.horses.riderPose(c); }
  unseat(c, why) { const H = c.mount; if (!H) return; H.rider = null; H.npcRider = null; c.mount = null; c.seatPose = null; this.g.emit?.('cavalryUnseated', { id: c.id, horse: H.id, why }); }

  // Near you: bodies; away: records (written back).
  live(S, on) {
    const g = this.g;
    if (on === S.live) return;
    S.live = on;
    for (const r of S.people) {
      if (on) { if (r.alive && !r.c) this.spawn(S, r); continue; }
      const c = r.c; if (!c) continue;
      r.hp = c.alive ? c.hp : 0; r.alive = c.alive; r.x = c.x; r.z = c.z;
      if (c.mount) this.unseat(c, 'away');
      if (g.chars.includes(c)) g.removeChar(c);
      r.c = null;
    }
  }

  update(dt) {
    const g = this.g, P = g.player;
    if (!g.horses?.enabled) return;
    this.register();
    for (const S of this.posts) {
      const R = S.row, d = Math.hypot(P.x - R.x, P.z - R.z);
      if (!S.built) this.build(S);
      if (!S.placed && d < CAVALRY.liveR) this.place(S);
      if (S.placed) this.live(S, d < CAVALRY.liveR ? true : d > CAVALRY.dropR ? false : S.live);
      // The patrols' place on their loops runs on whether you watch or not (the lead's progress; the file keeps its gap).
      for (const pat of S.patrols ?? []) {
        const v = gaitSpeed(g, pat);
        if (!S.live) pat.s = (pat.s + v * dt) % loopLen(pat.row.route);
      }
      if (S.live) for (const r of S.people) if (r.c) this.think(S, r, dt);
    }
    if (this.dirty) this.draw();
  }

  // A rider's beat: in the saddle, ride the loop (or hold at the rail), turn on what the company shoots, shoot from horseback.
  think(S, r, dt) {
    const g = this.g, c = r.c, Hs = g.horses;
    if (!c.alive) { if (r.alive) { r.alive = false; this.counts.ridersDown++; g.emit?.('cavalryDown', { id: c.id, post: S.row.id }); } if (c.mount) this.unseat(c, 'killed'); return; }
    const H = c.mount;
    if (H && (!H.alive || H.stolen || g.player.mount === H)) { this.unseat(c, H.alive ? 'taken' : 'horse down'); return; }
    if (!H) return; // on foot: ai.js has them (a dismounted trooper fights like any soldier)
    const a = Hs.bodyOf(H) ?? (H.alive && this.g.fauna?.enabled ? Hs.spawnBody(H) : null); // his horse is a body while he sits it
    if (!a) { this.unseat(c, 'no horse here'); return; } // never a rider hanging in the air: on his feet, ai.js has him
    const B = Hs.breed(H);
    // What to shoot: the nearest the company is at war with, in sight.
    c.scanT = (c.scanT ?? 0) - dt;
    if (c.scanT <= 0) { c.scanT = 0.4; c.target = this.pick(c); }
    let tx, tz, v;
    const t = c.target && c.target.alive ? c.target : null;
    if (t) {
      const tpx = t.inVehicle ? t.inVehicle.x : t.x, tpz = t.inVehicle ? t.inVehicle.z : t.z, d = Math.hypot(tpx - a.x, tpz - a.z);
      // close to the near edge of `keep`, back off past its far edge, circle between
      const [k0, k1] = RIDER.keep, ang = Math.atan2(a.x - tpx, a.z - tpz) + (d < k0 ? 0 : 0.9);
      const want = d < k0 ? k1 : d > k1 ? k0 + 4 : (k0 + k1) / 2;
      tx = tpx + Math.sin(ang) * want; tz = tpz + Math.cos(ang) * want; v = B.speed.canter;
      this.fire(c, t, tpx, tpz, dt);
    } else if (r.kind === 'patrol') {
      const pat = r.pat ?? (r.pat = S.patrols.find((p) => p.id === r.patrol));
      let lead = r; for (const q of pat.riders) if (q.c?.alive && q.c.mount) { lead = q; break; }
      if (lead === r) { // the lead rides the loop; the rest follow it in file
        const at = along(pat.row.route, pat.s + CAVALRY.arrive, S.row);
        tx = at.x; tz = at.z; v = gaitSpeed(g, pat);
        const here = along(pat.row.route, pat.s, S.row);
        const dHere = Math.hypot(here.x - a.x, here.z - a.z);
        if (dHere < CAVALRY.arrive + 2) { pat.s = (pat.s + v * dt) % loopLen(pat.row.route); pat.stuckT = 0; }
        else { pat.stuckT = (pat.stuckT ?? 0) + (a.speed < 0.5 ? dt : 0); if (pat.stuckT > 3) { pat.s = (pat.s + 12) % loopLen(pat.row.route); pat.stuckT = 0; } } // no headway (a wall, deep water): on round the loop
      } else { const la = Hs.bodyOf(lead.c.mount) ?? lead.c; tx = la.x - Math.sin(la.face ?? 0) * CAVALRY.fileGap; tz = la.z - Math.cos(la.face ?? 0) * CAVALRY.fileGap; v = Math.hypot(tx - a.x, tz - a.z) > 3 ? B.speed.canter : gaitSpeed(g, pat); }
    } else { tx = a.x; tz = a.z; v = 0; }
    Hs.moveFree(H, a, dt, tx, tz, v);
    H.gait = v >= B.speed.canter - 0.1 ? 'canter' : v > B.speed.walk + 0.1 ? 'trot' : v > 0 ? 'walk' : 'stand';
    c.x = a.x; c.z = a.z; c.speed = 0; c.aiming = !!t;
    c.face = t ? Math.atan2((t.inVehicle ?? t).x - a.x, (t.inVehicle ?? t).z - a.z) : a.face;
    Hs.riderPose(c);
  }
  pick(c) {
    const g = this.g; let best = null, bd = RIDER.sight;
    for (const o of g.chars) {
      if (o === c || !o.alive || o.hidden || !g.ai.hostile(c, o)) continue;
      const ox = o.inVehicle ? o.inVehicle.x : o.x, oz = o.inVehicle ? o.inVehicle.z : o.z, d = Math.hypot(ox - c.x, oz - c.z);
      if (d < bd && g.statics.lineOfSight(c.x, c.z, ox, oz)) { best = o; bd = d; }
    }
    return best;
  }
  fire(c, t, tx, tz, dt) {
    const g = this.g, W = WEAPONS[c.weapon];
    if (!W) return;
    c.cool = (c.cool ?? 0) - dt;
    if (c.mag === undefined) c.mag = W.mag ?? 8;
    if (c.cool > 0) return;
    if (c.mag <= 0) { c.mag = W.mag ?? 8; c.cool = CAVALRY.reloadSecs; return; }
    const ang = Math.atan2(tx - c.x, tz - c.z), spread = RIDER.spread * (g.horses.aimTax?.(c) ?? 1);
    if (g.ai.clearShot && !g.ai.clearShot(c, t, ang, Math.hypot(tx - c.x, tz - c.z))) { c.cool = 0.3; return; } // a comrade in the line: hold fire
    if (g.combat.fire(c, c.weapon, ang + (Math.random() - 0.5) * spread)) { c.mag--; this.counts.shots++; }
    c.cool = (W.rate ?? 0.4) * 2.4 + Math.random() * 0.4;
  }

  // ---- drawing: walls, the rail, the flagpole and its flag (one instanced mesh) -----------------------------------------------
  draw() {
    const M = this.mesh; this.dirty = false;
    if (!M) return;
    let n = 0;
    const put = (x, y, z, sx, sy, sz, col) => { if (n >= 64) return; _p.set(x, y, z); _q.identity(); _s.set(sx, sy, sz); M.setMatrixAt(n, _m.compose(_p, _q, _s)); M.setColorAt(n++, _c.set(col)); };
    for (const S of this.posts) {
      if (!S.built) continue;
      const P = S.row, y0 = this.g.stunts?.heightAt?.(P.x, P.z, 0) ?? 0;
      for (const [x0, z0, x1, z1] of S.walls) {
        put(P.x + (x0 + x1) / 2, y0 + 1.1, P.z + (z0 + z1) / 2, x1 - x0, 2.2, z1 - z0, ADOBE);
        put(P.x + (x0 + x1) / 2, y0 + 2.25, P.z + (z0 + z1) / 2, x1 - x0 + 0.16, 0.14, z1 - z0 + 0.16, ADOBE_DARK); // the cap
      }
      const rx = P.x - P.half + 4, rz = P.z + P.half - 3; // the corral rail
      put(rx + 2.4, y0 + 1.0, rz + 0.6, 8, 0.1, 0.1, RAIL); put(rx + 2.4, y0 + 0.6, rz + 0.6, 8, 0.1, 0.1, RAIL);
      for (let k = 0; k < 4; k++) put(rx - 1.6 + k * 2.6, y0 + 0.6, rz + 0.6, 0.14, 1.2, 0.14, RAIL);
      put(P.x, y0 + 4, P.z, 0.16, 8, 0.16, POLE); put(P.x + 1.1, y0 + 7.2, P.z, 2.2, 1.3, 0.05, FLAG); put(P.x + 1.1, y0 + 7.2, P.z + 0.03, 2.2, 0.22, 0.05, '#c8a24a'); // the company's colours, a brass stripe
      for (const [dx, dz] of [[P.half - 6, -P.half + 6], [P.half - 6, -P.half + 12]]) { put(P.x + dx, y0 + 0.9, P.z + dz, 3.4, 1.8, 4.2, CANVAS); put(P.x + dx, y0 + 1.85, P.z + dz, 0.25, 0.14, 4.3, CANVAS_DARK); } // the troopers' tents
    }
    M.count = n; M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true;
  }

  view() {
    return this.posts.map((S) => ({ id: S.row.id, built: S.built, placed: !!S.placed, live: S.live,
      people: S.people.map((r) => ({ name: r.name, kind: r.kind, alive: r.c ? r.c.alive : r.alive, id: r.c?.id ?? null, mounted: !!r.c?.mount, horse: r.horse })),
      patrols: (S.patrols ?? []).map((p) => ({ id: p.id, s: +p.s.toFixed(1) })) }));
  }
  save() { return this.posts.map((S) => ({ id: S.row.id, placed: !!S.placed, people: S.people.map((r) => ({ name: r.name, flag: r.flag, kind: r.kind, horse: r.horse, patrol: r.patrol ?? null, slot: r.slot ?? null, weapon: r.weapon, hp: r.c ? (r.c.alive ? Math.round(r.c.hp) : 0) : r.hp, alive: r.c ? r.c.alive : r.alive, x: r.c?.x ?? r.x, z: r.c?.z ?? r.z })), patrols: (S.patrols ?? []).map((p) => ({ id: p.id, s: p.s })) })); }
  load(s) {
    for (const S of this.posts) { for (const r of S.people) if (r.c) { if (r.c.mount) this.unseat(r.c, 'load'); if (this.g.chars.includes(r.c)) this.g.removeChar(r.c); r.c = null; } S.live = false; }
    if (!Array.isArray(s)) { for (const S of this.posts) { S.placed = false; S.people = []; S.patrols = []; } return; } // a save from before the company: not yet met (the horses' load dropped its horses too)
    for (const rec of s) {
      const S = this.posts.find((q) => q.row.id === rec.id); if (!S) continue;
      S.placed = rec.placed; S.people = rec.people.map((r) => ({ ...r, c: null }));
      S.patrols = (S.row.patrols ?? []).map((T) => ({ id: T.id, row: T, s: rec.patrols.find((p) => p.id === T.id)?.s ?? 0, riders: S.people.filter((r) => r.patrol === T.id).sort((a, b) => a.slot - b.slot) }));
    }
  }
}

function pickW(rng) { let x = rng(); for (const [w, p] of Object.entries(RIDER.weapons)) { x -= p; if (x <= 0) return w; } return 'rifle'; }
const GAIT_V = { walk: 1.9, trot: 4.9, canter: 8.2 }; // a patrol's pace on its loop (data/horses.js mustang-ish gaits; a faster breed waits in file)
function gaitSpeed(g, pat) { return GAIT_V[pat.row.gait] ?? 4.9; }
export function loopLen(route) { let L = 0; for (let i = 0; i < route.length; i++) { const a = route[i], b = route[(i + 1) % route.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); } return L; }
// The point s metres round the loop (wrapping, negatives too), in the world (offset by the post).
const _A = { x: 0, z: 0 };
export function along(route, s, P, out = _A) { // out: a shared scratch by default (read it now)
  const L = loopLen(route); s = ((s % L) + L) % L;
  for (let i = 0; i < route.length; i++) {
    const a = route[i], b = route[(i + 1) % route.length], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= seg) { const k = seg ? s / seg : 0; out.x = P.x + a[0] + (b[0] - a[0]) * k; out.z = P.z + a[1] + (b[1] - a[1]) * k; return out; }
    s -= seg;
  }
  out.x = P.x + route[0][0]; out.z = P.z + route[0][1]; return out;
}
