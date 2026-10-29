import * as THREE from 'three';
import { MIGRATION as MG, WARNINGS } from '../data/hordes.js';
import { radialGlow } from '../world/textures.js';
import { CHANNELS } from '../data/pulls.js';
import { STATIONS } from '../data/radio.js';

// HORDES AS EVENTS (docs/design/WEB_DEATHS.md §3.4; rows data/hordes.js MIGRATION). Every so often a horde MIGRATES down
// a highway: an overrun.js horde record (strength = bodies) that walks the corridor's centreline on the world clock. Near
// you its bodies stand up and walk the road themselves (overrun's materialize); at any distance its dust rises over it.
// Nobody knows it is coming until someone SEES it (law 6): a witness with a set (a town's lookouts, a road person, a
// radio man) inside MIGRATION.witness m records it, broadcasts it MIGRATION.report game minutes later, and you hear it
// only with a radio inside the broadcast's range (systems/knowledge.js broadcast). You go round it, lure it off the road
// with a noise (its record drifts to a big noise like any horde's), or break it with the car.
// Also here: DUST OVER CROWDS (WARNINGS.dust), a pale haze over any crowd of the infected on the move.
const PUFFS = 120;
const _o = new THREE.Object3D(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Migrations {
  constructor(game) {
    this.g = game;
    this.list = [];          // the migrations: { H (the overrun record), cor, s, dir, s0, end, fact, seen: [], reported, reportAt }
    this.auto = true;        // rise on the world clock (the battery switches it off)
    this.nextAt = null;      // game hours of the next one
    this.counts = { migrations: 0, witnessed: 0, reported: 0, heardByYou: 0, ended: 0, dustPuffs: 0, crowdDust: 0 };
    this.dustT = 0; this.scanT = 0; this.witT = 0;
    // the dust: one InstancedMesh of soft quads facing up (one draw call), puffs that rise, grow and thin to nothing
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: radialGlow(), color: '#d9c7a0', transparent: true, opacity: 0.34, depthWrite: false, fog: true }), PUFFS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    for (let i = 0; i < PUFFS; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.count = 0; this.mesh.visible = false;
    game.scene.add(this.mesh);
    this.puffs = Array.from({ length: PUFFS }, () => ({ on: false, x: 0, y: 0, z: 0, s0: 1, s1: 1, t: 0, life: 1, vy: 0 }));
    this.pNext = 0;
  }
  hours() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }
  W() { return this.g.streamer?.W ?? null; }
  corLen(cor) { return cor.L ?? cor.cl?.L ?? 0; }

  // ---- a migration -----------------------------------------------------------------------------------------------------
  // Start one on the corridor nearest (x, z) (default: ahead of you, out of sight), walking dir (+1 / -1 along the road).
  start({ x, z, size, dir, road, ahead } = {}) {
    const g = this.g, W = this.W(), O = g.citygen?.overrun;
    if (!W || !O) return null;
    const P = g.player;
    let cor = road ? W.corridors.find((c) => c.id === road) : null;
    const q0 = cor ? cor.project(x ?? P.x, z ?? P.z) : W.projectAny(x ?? P.x, z ?? P.z);
    cor = cor ?? q0.cor ?? W.i10;
    const L = this.corLen(cor);
    let s = q0.s;
    if (x === undefined) { const a = ahead ?? MG.from[0] + Math.random() * (MG.from[1] - MG.from[0]); s = Math.max(50, Math.min(L - 50, q0.s + (Math.random() < 0.5 ? -1 : 1) * a)); }
    dir = dir ?? (s > q0.s ? -1 : 1); // toward you by default: a horde coming down the road
    const at = cor.at(s), n = Math.round(size ?? MG.size[0] + Math.random() * (MG.size[1] - MG.size[0]));
    const H = O.spawnHorde({ x: at.x, z: at.z, size: n, force: true });
    H.migrate = true; H.state = 'migrate'; H.target = null;
    const M = { H, cor, road: cor.id ?? 'I-10', s, s0: s, dir, end: Math.max(0, Math.min(L, s + dir * MG.length)), fact: null, seen: [], reported: false, reportAt: null, born: this.hours(), heard: false };
    H.route = M;
    const k = g.pulls?.k;
    if (k) M.fact = k.record({ what: 'horde', subject: H.id, text: `A horde of about ${Math.round(n / 10) * 10} on ${M.road}, walking ${this.heading(cor, s, dir)}`, where: { x: at.x, z: at.z, place: g.streamer?.W?.nameAt?.(at.x, at.z) ?? null }, life: 12 });
    this.list.push(M);
    this.counts.migrations++;
    g.emit('hordeMigrating', { id: H.id, road: M.road, x: Math.round(at.x), z: Math.round(at.z), size: n, dir });
    return M;
  }
  heading(cor, s, dir) {
    const f = cor.at(s), tx = f.tx * dir, tz = f.tz * dir;
    return Math.abs(tx) > Math.abs(tz) ? (tx > 0 ? 'east' : 'west') : (tz > 0 ? 'south' : 'north');
  }

  // overrun.update's hook, once a second per migrating record: true = handled (overrun skips its own walk). A drift to a
  // noise (a lure) is overrun's: it walks there, lingers, and then comes back to the road and walks on.
  step(H, tick, live) {
    const M = H.route, g = this.g;
    if (!M) return false;
    if (H.drift) return false;
    const cor = M.cor, L = this.corLen(cor);
    H.state = 'migrate';
    if (live.length) {
      // the bodies walk the road: the record follows their middle (overrun set H.x/z), the road position from that
      const q = cor.project(H.x, H.z, 400);
      if (q.d < 400) M.s = q.s;
      const a = cor.at(Math.max(0, Math.min(L, M.s + M.dir * 30)));
      for (const c of live) if (!c.zsee && !g.zombies?.fresh(c)) { c.wx = a.x + a.nx * (Math.random() - 0.5) * MG.lane; c.wz = a.z + a.nz * (Math.random() - 0.5) * MG.lane; c.timer = 6; }
    } else {
      // a record on the world clock: back to the road if a lure drew it off, then along it
      const q = cor.project(H.x, H.z, 600);
      if (q.d > MG.lane) { const k = Math.min(1, (MG.speed * tick) / q.d); H.x += (q.x - H.x) * k; H.z += (q.z - H.z) * k; M.s = q.s; }
      else { M.s = Math.max(0, Math.min(L, M.s + M.dir * MG.speed * tick)); const a = cor.at(M.s); H.x = a.x; H.z = a.z; }
    }
    if ((M.dir > 0 && M.s >= M.end) || (M.dir < 0 && M.s <= M.end) || M.s <= 0 || M.s >= L) this.end(M, 'road walked');
    return true;
  }
  end(M, why) {
    const H = M.H;
    H.route = null; H.migrate = false; H.state = 'walk';
    this.list.splice(this.list.indexOf(M), 1);
    this.counts.ended++;
    this.g.emit('migrationEnded', { id: H.id, why });
  }

  // ---- who saw it (law 6) ----------------------------------------------------------------------------------------------
  // A town (its lookouts) or a living person inside the witness range sees it; with a set they put it on the air.
  witness(M) {
    const g = this.g, k = g.pulls?.k, H = M.H, night = (g.sky?.night ?? 0) > 0.55, R = MG.witness * (night ? 0.45 : 1);
    if (!k || !M.fact) return;
    const P = g.player;
    // you: inside your sight (the bodies) or, by day, its dust on the horizon
    const dP = Math.hypot(H.x - P.x, H.z - P.z);
    if (!M.seen.includes('player') && (dP < CHANNELS.saw.range * (night ? 0.4 : 1) || (!night && dP < MG.dustSeen))) {
      k.holder('player', { x: P.x, z: P.z }); k.see('player', M.fact, { x: H.x, z: H.z }); M.seen.push('player'); g.emit('hordeSeen', { id: H.id, by: 'player' });
    }
    for (const h of k.holders.values()) {
      if (h.id === 'player' || M.seen.includes(h.id) || !h.radio) continue;
      if (Math.abs(h.x - H.x) > R || Math.abs(h.z - H.z) > R || Math.hypot(h.x - H.x, h.z - H.z) > R) continue;
      this.saw(M, h.id, h.name);
    }
    for (const c of g.chars) {
      if (!c.alive || c.faction === 'zombie' || c === P || c.fauna || !c.radio) continue;
      const id = `w:${c.id}`;
      if (M.seen.includes(id) || Math.abs(c.x - H.x) > R || Math.abs(c.z - H.z) > R || Math.hypot(c.x - H.x, c.z - H.z) > R) continue;
      k.holder(id, { name: c.name ?? 'a road person', kind: 'person', x: c.x, z: c.z, radio: true });
      this.saw(M, id, c.name ?? 'a road person');
    }
  }
  saw(M, hid, name) {
    const g = this.g, k = g.pulls.k, H = M.H;
    k.see(hid, M.fact, { x: H.x, z: H.z });
    M.seen.push(hid); this.counts.witnessed++;
    if (M.reportAt === null) { M.reportAt = this.hours() + MG.report / 60; M.reporter = { id: hid, name }; }
    g.emit('hordeSeen', { id: H.id, by: hid });
  }
  // The report goes out on the air from the witness's set; it lands with every set in range (you, only with a radio).
  report(M) {
    const g = this.g, k = g.pulls.k, h = k.holders.get(M.reporter.id), P = g.player, v = P.inVehicle;
    if (!h) { M.reportAt = null; return; }
    const f = k.fact(M.fact.id);
    f.where = { x: Math.round(M.H.x), z: Math.round(M.H.z), place: f.where?.place ?? null }; f.when = this.hours();
    k.holder('player', { x: v ? v.x : P.x, z: v ? v.z : P.z });
    const heard = k.broadcast(f, h.x, h.z, CHANNELS.radio.range, `${M.reporter.name}'s set`);
    M.reported = true; this.counts.reported++;
    const you = heard.includes('player');
    if (you) {
      M.heard = true; this.counts.heardByYou++;
      const S = STATIONS.find((s) => s.kind === 'news') ?? STATIONS[0];
      g.radio?.say?.(S, `${M.reporter.name} reports a horde on ${M.road}, a few hundred strong, walking ${this.heading(M.cor, M.s, M.dir)}. Keep off the road.`);
    }
    g.emit('hordeReported', { id: M.H.id, by: M.reporter.id, heardBy: heard.length, you });
  }

  // ---- the dust --------------------------------------------------------------------------------------------------------
  puff(x, y, z, s0, s1, life, vy) {
    const p = this.puffs[this.pNext]; this.pNext = (this.pNext + 1) % PUFFS;
    p.on = true; p.x = x; p.y = y; p.z = z; p.s0 = s0; p.s1 = s1; p.t = 0; p.life = life; p.vy = vy;
    this.counts.dustPuffs++;
  }
  // A crowd of the infected on the move kicks up dust over its middle (WARNINGS.dust): a herd reads at a distance.
  crowdDust() {
    const g = this.g, D = WARNINGS.dust, P = g.player, far = (g.viewR ?? 80) + 120;
    const r2 = D.radius * D.radius;
    for (const c of g.chars) c._dust = 0;
    for (const c of g.chars) {
      if (!c.alive || c.faction !== 'zombie' || c.wild || c._dust || !(c.speed > 0.5)) continue;
      if (Math.abs(c.x - P.x) > far || Math.abs(c.z - P.z) > far) continue;
      let n = 0, sx = 0, sz = 0;
      for (const o of g.chars) {
        if (!o.alive || o.faction !== 'zombie' || o.wild || !(o.speed > 0.5)) continue;
        const dx = o.x - c.x, dz = o.z - c.z;
        if (dx * dx + dz * dz > r2) continue;
        n++; sx += o.x; sz += o.z;
      }
      if (n < D.crowd) continue;
      for (const o of g.chars) if (o.alive && o.faction === 'zombie' && (o.x - c.x) ** 2 + (o.z - c.z) ** 2 <= r2) o._dust = 1; // one cloud per crowd
      const x = sx / n, z = sz / n, gy = g.stunts?.heightAt(x, z, 0) ?? 0, s = D.size[0] + Math.random() * (D.size[1] - D.size[0]);
      this.puff(x + (Math.random() - 0.5) * 6, gy + 0.6, z + (Math.random() - 0.5) * 6, s * 0.5, s * (1.4 + n * 0.03), 2.4, 0.5);
      this.counts.crowdDust++;
    }
  }
  drawDust(dt) {
    const M = this.mesh;
    let n = 0;
    for (const p of this.puffs) {
      if (!p.on) continue;
      p.t += dt;
      if (p.t >= p.life) { p.on = false; continue; }
      const u = p.t / p.life, s = (p.s0 + (p.s1 - p.s0) * u) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
      p.y += p.vy * dt;
      _o.position.set(p.x, p.y, p.z); _o.rotation.set(0, p.x * 0.3 + p.t * 0.2, 0); _o.scale.set(s, 1, s); _o.updateMatrix();
      M.setMatrixAt(n++, _o.matrix);
    }
    M.count = n; M.visible = n > 0;
    if (n) M.instanceMatrix.needsUpdate = true;
  }

  // ---- per frame -----------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g;
    if (!dt) return;
    // the world clock: the next migration (never in the battery's way: auto off there)
    if (this.auto && g.citygen?.overrun?.auto) {
      const h = this.hours();
      if (this.nextAt === null) this.nextAt = h + MG.every[0] + Math.random() * (MG.every[1] - MG.every[0]);
      if (h >= this.nextAt && this.list.length < MG.maxLive) { this.nextAt = h + MG.every[0] + Math.random() * (MG.every[1] - MG.every[0]); this.start(); }
    }
    for (let i = this.list.length - 1; i >= 0; i--) { const M = this.list[i]; if (!g.citygen?.overrun?.hordes.includes(M.H)) this.list.splice(i, 1); }
    this.witT -= dt;
    if (this.witT <= 0) {
      this.witT = 1;
      for (const M of this.list) { this.witness(M); if (M.reportAt !== null && !M.reported && this.hours() >= M.reportAt) this.report(M); }
    }
    // the plume over every migrating horde near enough to matter to the view, and dust over crowds near you
    this.dustT -= dt;
    if (this.dustT <= 0) {
      this.dustT = WARNINGS.dust.every;
      const P = g.player, far = (g.viewR ?? 80) + 400;
      for (const M of this.list) {
        const H = M.H;
        if (Math.abs(H.x - P.x) > far || Math.abs(H.z - P.z) > far) continue;
        const gy = g.stunts?.heightAt(H.x, H.z, 0) ?? 0, k = Math.min(1.6, 0.6 + H.strength / 200);
        this.puff(H.x + (Math.random() - 0.5) * 30, gy + 2 + Math.random() * 4, H.z + (Math.random() - 0.5) * 30, 14 * k, 34 * k, 6, 1.6);
      }
    }
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = WARNINGS.dust.scan; this.crowdDust(); }
    this.drawDust(dt);
  }

  clear() { for (const M of [...this.list]) this.end(M, 'cleared'); }
  view() {
    const k = this.g.pulls?.k;
    return this.list.map((M) => ({
      id: M.H.id, road: M.road, x: Math.round(M.H.x), z: Math.round(M.H.z), s: Math.round(M.s), walked: Math.round(Math.abs(M.s - M.s0)), dir: M.dir,
      strength: Math.round(M.H.strength), bodies: M.H.bodies.filter((c) => c.alive).length, state: M.H.state, drift: !!M.H.drift,
      seenBy: [...M.seen], reported: M.reported, reportAt: M.reportAt, youHeard: M.heard, youKnow: k && M.fact ? !!k.copyOf('player', M.fact.id) : false,
    }));
  }
}
