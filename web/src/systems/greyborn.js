import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { outfit } from './characters.js';
import { GREYBORN, GREYBORN_TOWNS } from '../data/greyborn.js';
import { hash32, rngOf } from '../world/geo.js';

// THE GREYBORN (docs/design/WEB_GREYBORN_GRAPEVINE.md §3.2; rows in data/greyborn.js). Infected that kept a society: a
// nest-town with an elder at the fire, watchers on the edge, trappers who lay and re-lay a ring of traps, and kin.
// A settlement is a RECORD (the ring households' pattern, systems/residents.js): who lives there is a pure function of
// the row and its seed; what happened to them (hp, deaths, where they fell, what they remember of you) is kept on the
// record. Promoted to characters when you come within promoteR, written back and taken out past demoteR (never from under
// you mid-fight). They remember intruders a watcher SAW, and a known intruder finds them waiting next time.
const ROLES = GREYBORN.roles;

export class Greyborn {
  constructor(game) {
    this.g = game;
    this.enabled = true;
    this.recs = GREYBORN_TOWNS.map((row) => this.make(row));
    this.scanT = 0;
    this.stats = { promoted: 0, demoted: 0, alarms: 0, relaid: 0, deaths: 0 };
    this.build();
  }

  make(row) {
    const g = this.g, seed = hash32(row.id.length * 977, row.x | 0, row.z | 0), rng = rngOf(seed);
    const rec = { id: row.id, row, seed, members: [], traps: [], mem: {}, alarmT: 0, alarmOn: null, alert: false, live: false, broken: false, extra: null, session: false };
    let n = 0;
    for (const [role, count] of Object.entries(row.members)) for (let k = 0; k < count; k++) {
      const ms = hash32(seed, n, 0x47524559), mr = rngOf(ms), R = ROLES[role];
      rec.members.push({ n, role, seed: ms, name: R.name, flag: g.randomFlag(mr), maxHp: R.hp, hp: R.hp, dead: false, x: 0, z: 0, face: 0, c: null });
      n++;
    }
    // The ring of traps (traps.js), owned by the settlement.
    for (const [kind, deg, dist] of row.traps) {
      // On open ground in sight of the fire (a spot inside a ridge is pulled in toward the fire, or dropped).
      const a = (deg * Math.PI) / 180;
      let r = dist;
      while (r > 24 && !(g.nav.foot.free(row.x + Math.sin(a) * r, row.z + Math.cos(a) * r) && g.los(row.x, row.z, row.x + Math.sin(a) * r, row.z + Math.cos(a) * r))) r -= 4;
      if (r <= 24) continue;
      const t = g.traps.place(kind, row.x + Math.sin(a) * r, row.z + Math.cos(a) * r, row.id, a + rng() * 0.6);
      if (t) rec.traps.push(t.id);
    }
    return rec;
  }

  // Where a member belongs (pure: from the row and their seed).
  spot(rec, m) {
    const row = rec.row, mr = rngOf(m.seed ^ 0x5eed), idx = rec.members.filter((q) => q.role === m.role).indexOf(m);
    if (m.role === 'elder') return { x: row.x + 1.9, z: row.z + 0.7, face: Math.atan2(-1.9, -0.7) };
    if (m.role === 'watcher') {
      // A post with a view: on open ground, in sight of the fire, looking out over 25 m of open ground (not into a ridge).
      const g = this.g, a0 = (idx / Math.max(1, row.members.watcher)) * Math.PI * 2 + 3.6, r = row.territory * 0.45;
      for (let k = 0; k < 18; k++) {
        const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.3, x = row.x + Math.sin(a) * r, z = row.z + Math.cos(a) * r;
        if (g.nav.foot.free(x, z) && g.los(row.x, row.z, x, z) && g.los(x, z, x + Math.sin(a) * 25, z + Math.cos(a) * 25)) return { x, z, face: a };
      }
      return { x: row.x + Math.sin(a0) * r, z: row.z + Math.cos(a0) * r, face: a0 };
    }
    if (m.role === 'trapper') { const a = idx * 2.4 + 1.1, r = 12.5; return { x: row.x + Math.sin(a) * r, z: row.z + Math.cos(a) * r, face: a + Math.PI }; }
    const a = mr() * Math.PI * 2, r = 3.6 + mr() * 3; return { x: row.x + Math.sin(a) * r, z: row.z + Math.cos(a) * r, face: a + Math.PI };
  }

  // ---- the place itself: one merged mesh (lean-tos, the fire ring, the stake fence, bone totems, racks, trampled
  // earth) and one ember mesh that glows by night. Built once; its huts are statics you walk round.
  build() {
    const g = this.g, geos = [], embers = [];
    const tint = (geo, hex) => { const n = geo.attributes.position.count, c = new THREE.Color(hex), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; };
    const box = (x, y, z, sx, sy, sz, col, ry = 0, rx = 0, rz = 0, into = geos) => {
      let b = new THREE.BoxGeometry(sx, sy, sz); b = b.toNonIndexed();
      b.rotateZ(rz); b.rotateX(rx); b.rotateY(ry); b.translate(x, y, z); into.push(tint(b, col));
    };
    const open = (x, z, r = 1.2) => g.nav.foot.free(x, z) && g.nav.foot.free(x + r, z) && g.nav.foot.free(x - r, z) && g.nav.foot.free(x, z + r) && g.nav.foot.free(x, z - r); // not inside a ridge
    for (const rec of this.recs) {
      const R = rec.row, rng = rngOf(rec.seed ^ 0xb1d), X = R.x, Z = R.z;
      // Trampled earth: ragged patches, thicker toward the fire (not one flat plate), and the ash bed.
      for (let k = 0; k < 22; k++) {
        const a = rng() * 6.28, r = k < 8 ? rng() * 5 : 4 + rng() * 14, p = new THREE.CircleGeometry(0.9 + rng() * 1.8, 9).toNonIndexed();
        p.scale(1, 0.45 + rng() * 0.55, 1); p.rotateZ(rng() * 3); p.rotateX(-Math.PI / 2); p.translate(X + Math.sin(a) * r, 0.03 + k * 0.0004, Z + Math.cos(a) * r);
        geos.push(tint(p, k % 3 === 0 ? '#b0855a' : k % 3 === 1 ? '#a87e55' : '#9c744d'));
      }
      const ash = new THREE.CircleGeometry(1.0, 9).toNonIndexed(); ash.rotateX(-Math.PI / 2); ash.translate(X, 0.07, Z); geos.push(tint(ash, '#2a2522'));
      // The fire ring and its embers.
      for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; box(X + Math.sin(a) * 1.25, 0.14, Z + Math.cos(a) * 1.25, 0.42, 0.28, 0.36, k % 2 ? '#4b4744' : '#5d5853', a); }
      for (let k = 0; k < 7; k++) { const a = rng() * 6.28, r = rng() * 0.6; box(X + Math.sin(a) * r, 0.1, Z + Math.cos(a) * r, 0.22, 0.08, 0.14, k % 2 ? '#ff7a1c' : '#ffb347', a, 0, 0, embers); }
      box(X - 0.3, 0.16, Z + 0.1, 1.3, 0.14, 0.16, '#2e2218', 0.6); box(X + 0.2, 0.16, Z - 0.2, 1.1, 0.14, 0.16, '#2e2218', -0.9);
      // Shelters round the fire: hide-wrapped pole cones (every other one), lean-tos with their open sides facing in.
      for (let h = 0; h < R.huts; h++) {
        const a = (h / R.huts) * Math.PI * 2 + 0.3, r = 10.5 + rng() * 2.5, hx = X + Math.sin(a) * r, hz = Z + Math.cos(a) * r, len = 3.6;
        if (!open(hx, hz, 2.4)) continue;
        if (h % 2 === 0) {
          const cone = new THREE.ConeGeometry(1.9, 2.9, 7, 1, true).toNonIndexed(); cone.rotateY(rng() * 3); cone.translate(hx, 1.45, hz); geos.push(tint(cone, rng() < 0.5 ? '#8a6c4c' : '#7d6046'));
          for (let j = 0; j < 6; j++) { const pa = (j / 6) * Math.PI * 2, pole = new THREE.CylinderGeometry(0.035, 0.05, 3.6, 4).toNonIndexed(); pole.translate(0, 1.8, 0); pole.rotateZ(0.56); pole.rotateY(pa - Math.PI / 2); pole.translate(hx + Math.sin(pa) * 1.95, 0, hz + Math.cos(pa) * 1.95); geos.push(tint(pole, '#3a2a1c')); }
          const door = new THREE.PlaneGeometry(0.9, 1.3).toNonIndexed(); door.translate(0, 0.65, 1.62); door.rotateY(a + Math.PI); door.translate(hx, 0, hz); geos.push(tint(door, '#1c1510'));
          g.statics.addCentered(hx, hz, 2.6, 2.6, 'hut', 2.6);
          continue;
        }
        for (const side of [-1, 1]) {
          const ox = Math.sin(a) * side * 0.55, oz = Math.cos(a) * side * 0.55;
          box(hx + ox, 0.95, hz + oz, len, 0.08, 1.5, side > 0 ? '#5a4632' : '#4e3d2b', a + Math.PI / 2, side * 0.62);
        }
        box(hx, 1.75, hz, len + 0.3, 0.12, 0.12, '#3d2e20', a + Math.PI / 2); // the ridge pole
        box(hx + Math.sin(a) * 0.9, 0.7, hz + Math.cos(a) * 0.9, 1.2, 1.3, 0.05, rng() < 0.5 ? '#7a6248' : '#6a5a46', a + Math.PI / 2); // a hide over the back
        box(hx - Math.sin(a) * 0.6, 0.05, hz - Math.cos(a) * 0.6, 1.6, 0.08, 1.0, '#5e4c36', a); // a bedding pallet
        g.statics.addCentered(hx, hz, 2.4, 2.4, 'hut', 1.8);
      }
      // The stake fence: sharpened stakes leaning out, a gap on the side facing the road (north).
      for (let k = 0; k < 64; k++) {
        const a = (k / 64) * Math.PI * 2; if (Math.abs(Math.sin(a / 2)) < 0.14) continue;
        const r = 21 + rng() * 0.6, sx = X + Math.sin(a) * r, sz = Z + Math.cos(a) * r, ht = 1.3 + rng() * 0.7;
        if (!open(sx, sz, 1)) continue;
        box(sx, ht / 2, sz, 0.12, ht, 0.12, rng() < 0.3 ? '#4a3a2a' : '#5e4a34', 0, Math.cos(a) * 0.35, -Math.sin(a) * 0.35);
      }
      // Bone totems at the edge: a pole, a crossbar, pale things hanging off it.
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.5, r = 24, tx = X + Math.sin(a) * r, tz = Z + Math.cos(a) * r;
        if (!open(tx, tz, 1)) continue;
        box(tx, 1.4, tz, 0.16, 2.8, 0.16, '#3e3024');
        box(tx, 2.4, tz, 1.2, 0.1, 0.1, '#3e3024', a);
        box(tx, 2.85, tz, 0.34, 0.3, 0.36, '#d6cdb4', a); // a skull-pale knot
        for (let j = 0; j < 3; j++) box(tx + Math.cos(a) * (j - 1) * 0.45, 2.0 - j * 0.05, tz - Math.sin(a) * (j - 1) * 0.45, 0.06, 0.5 + rng() * 0.3, 0.06, '#cfc6ad', a);
      }
      // Drying racks with hides.
      for (let k = 0; k < 3; k++) {
        const a = rng() * 6.28, r = 6.5 + rng() * 2, cx = X + Math.sin(a) * r, cz = Z + Math.cos(a) * r;
        box(cx - Math.cos(a), 0.8, cz + Math.sin(a), 0.08, 1.6, 0.08, '#3d2e20'); box(cx + Math.cos(a), 0.8, cz - Math.sin(a), 0.08, 1.6, 0.08, '#3d2e20');
        box(cx, 1.55, cz, 2.2, 0.07, 0.07, '#3d2e20', a + Math.PI / 2);
        box(cx, 1.05, cz, 1.0, 0.9, 0.04, rng() < 0.5 ? '#8a6a4a' : '#7a5e44', a + Math.PI / 2);
      }
      // A junk pile: tyres and cans.
      for (let k = 0; k < 5; k++) {
        const a = 4.2 + rng() * 0.6, r = 15 + rng() * 2, t = new THREE.TorusGeometry(0.38, 0.14, 6, 12).toNonIndexed();
        t.rotateX(Math.PI / 2 + (rng() - 0.5) * 0.5); t.translate(X + Math.sin(a) * r, 0.14 + k * 0.12, Z + Math.cos(a) * r); geos.push(tint(t, '#1e1c1a'));
      }
    }
    if (geos.length) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
      mesh.castShadow = true; mesh.receiveShadow = true;
      g.scene.add(mesh); this.mesh = mesh;
    }
    if (embers.length) {
      this.emberMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6 });
      this.embers = new THREE.Mesh(mergeGeometries(embers), this.emberMat);
      g.scene.add(this.embers);
    }
  }

  // ---- promote / demote (the residents' pattern) ----------------------------------------------------------------
  promote(rec) {
    const g = this.g, P = g.player, day = g.society?.day ?? 0;
    const fresh = !rec.live, known = fresh && rec.mem.player && day - rec.mem.player.lastDay <= GREYBORN.rememberDays;
    if (fresh) { rec.alert = !!known; rec.session = false; rec.entrySet = false; }
    for (const m of rec.members) {
      if (m.c) continue;
      // Their dead lie where they fell - put back only within sight (main.js tidies bodies long dead out past 70 m).
      if (m.dead && Math.hypot(m.x - P.x, m.z - P.z) > 65) continue;
      if (!g.wilds.room(1)) break;
      const s = m.dead ? { x: m.x, z: m.z, face: m.face } : m.x || m.z ? { x: m.x, z: m.z, face: m.face } : this.spot(rec, m);
      const colors = outfit('zombie', rngOf(m.seed));
      colors.skin = GREYBORN.skin[m.seed % GREYBORN.skin.length];
      if (m.role === 'elder') { colors.hatStyle = 'long'; colors.hair = '#c9c4b6'; colors.shirt = '#4a3e32'; }
      if (m.role === 'watcher') { colors.hatStyle = 'wrap'; colors.hat = '#5a5046'; }
      const R = ROLES[m.role], c = g.addChar({ x: s.x, z: s.z, faction: 'zombie', weapon: null, hp: m.maxHp, colors, name: R.name, flag: m.flag });
      if (!c) break;
      c.maxHp = m.maxHp; c.hp = m.hp; c.face = s.face; c.zkind = 'greyborn'; c.zSpeed = R.pace; c.wild = true; c.timer = 0;
      c.gb = { rec, m, role: m.role, town: rec.id, seeT: 0, look: 0, task: null, workT: 0 };
      c.blood = 0.15;
      if (m.dead) { c.alive = false; c.hp = 0; c.deadTime = 30; c.blood = 0.8; }
      g.standOn(c); g.charR.paint(c);
      m.c = c; this.stats.promoted++;
    }
    rec.live = rec.members.some((m) => m.c);
    if (!fresh) return;
    // A known intruder: the watchers are up, and a fresh snare waits on the line you came in by last time.
    if (known && rec.mem.player.entry) {
      const e = rec.mem.player.entry, T = g.traps;
      let t = rec.extra && T.byId(rec.extra);
      if (!t) { t = T.place('snare', e.x, e.z, rec.id, 0.3); rec.extra = t?.id ?? null; if (t) rec.traps.push(t.id); }
      else { t.x = e.x; t.z = e.z; T.relay(t); }
      g.emit('greybornRemember', { town: rec.id, visits: rec.mem.player.visits, trap: rec.extra });
    }
    g.emit('greybornPromoted', { town: rec.id, members: rec.members.filter((m) => m.c?.alive).length, alert: rec.alert });
  }
  engaged(rec) { const P = this.g.player; return rec.alarmT > 0 && rec.alarmOn === P && P.alive && Math.hypot(P.x - rec.row.x, P.z - rec.row.z) < rec.row.leash; }
  writeBack(m, c) {
    if (!c.alive && !m.dead) { m.dead = true; this.stats.deaths++; }
    m.hp = c.alive ? Math.max(1, Math.round(c.hp)) : 0;
    if (m.dead || c.gb.moved) { m.x = +c.x.toFixed(2); m.z = +c.z.toFixed(2); m.face = +c.face.toFixed(3); }
  }
  demote(rec, force = false) {
    const g = this.g;
    if (!force && this.engaged(rec)) return false;
    for (const m of rec.members) if (m.c) { this.writeBack(m, m.c); if (g.chars.includes(m.c)) g.removeChar(m.c); m.c = null; this.stats.demoted++; }
    rec.live = false; rec.alarmT = 0; rec.alarmOn = null;
    g.emit('greybornDemoted', { town: rec.id, alive: rec.members.filter((m) => !m.dead).length, dead: rec.members.filter((m) => m.dead).length });
    return true;
  }

  // ---- the alarm and memory --------------------------------------------------------------------------------------
  alarm(rec, who, by = null) {
    const g = this.g, R = rec.row, first = rec.alarmT <= 0;
    rec.alarmT = 45; rec.alarmOn = who;
    if (!first) return;
    this.stats.alarms++;
    const at = by ?? { x: R.x, z: R.z }, P = g.player, d = Math.hypot(at.x - P.x, at.z - P.z);
    // A long call, falling at the end: every one of them looks up.
    if (d < 140) { g.audio.tone?.(330, 1.6, Math.max(0.02, 0.14 * (1 - d / 140)), 'sawtooth', 0.6, g.pan(at.x)); g.audio.tone?.(220, 1.9, Math.max(0.02, 0.1 * (1 - d / 140)), 'triangle', 0.7, g.pan(at.x)); }
    if (by) g.feedback?.floater(by.x, by.z, 'a long, falling call', 'bark');
    g.zombies?.onNoise(at.x, at.z, GREYBORN.call / 2); // the herd hears it too
    if (who === P) this.know(rec);
    g.emit('greybornAlarm', { town: rec.id, by: by?.id ?? null, on: who?.id ?? null, known: rec.alert });
  }
  // A watcher saw you: the settlement knows you (the memory is theirs, on the record).
  know(rec) {
    const g = this.g, day = g.society?.day ?? 0, P = g.player;
    const e = rec.mem.player ?? (rec.mem.player = { visits: 0, lastDay: day, killed: 0, entry: null });
    if (!rec.session) { e.visits++; rec.session = true; }
    e.lastDay = day;
    void P;
  }
  onTrap(t, c) {
    const rec = this.recs.find((r) => r.id === t.owner);
    if (!rec) return;
    t.relayAt = this.g.time + GREYBORN.relay;
    if (c && c.alive && !c.gb && c.faction !== 'zombie' && rec.live && Math.hypot(c.x - rec.row.x, c.z - rec.row.z) < rec.row.leash) this.alarm(rec, c);
  }

  // ---- what they do (zombies.think hands zkind greyborn here) -----------------------------------------------------
  think(c, dt) {
    const g = this.g, S = c.gb, rec = S.rec, R = rec.row, P = g.player, role = ROLES[S.role];
    c.aiming = false;
    if (rec.broken && S.role !== 'elder') { c.zkind = 'shambler'; c.name = 'Shambler'; c.zSpeed = 2.2; return; } // no elder, no society: the herd again
    // Struck: whoever did it is the intruder.
    if (c.hitAt > g.time - 0.2 && c.lastAttacker?.alive && !c.lastAttacker.gb) this.alarm(rec, c.lastAttacker, c);
    const foe = rec.alarmT > 0 ? rec.alarmOn : null;
    if (foe && foe.alive && Math.hypot(foe.x - R.x, foe.z - R.z) < R.leash && (S.role !== 'elder' || Math.hypot(foe.x - c.x, foe.z - c.z) < 12)) {
      S.moved = true;
      const tx = foe.inVehicle ? foe.inVehicle.x : foe.x, tz = foe.inVehicle ? foe.inVehicle.z : foe.z, d = Math.hypot(tx - c.x, tz - c.z);
      if (d < 1.25 && !foe.inVehicle) {
        c.speed = 0; c.face = Math.atan2(tx - c.x, tz - c.z);
        if ((c.cool -= dt) <= 0) {
          c.cool = 0.9 + Math.random() * 0.3;
          g.combat.damage(foe, role.claw, c, (tx - c.x) / (d || 1), (tz - c.z) / (d || 1), 'bite');
          if (foe === P && P.alive && !g.godMode) g.survival?.bitten();
        }
      } else if (foe.inVehicle && d < 3) { c.speed = 0; g.carCombat.zombieAttack(c, foe.inVehicle, dt); }
      else g.ai.move(c, tx - c.x, tz - c.z, role.run, dt);
      return;
    }
    // Home: back to where they belong, then their work.
    const home = S.home ?? (S.home = this.spot(rec, S.m));
    if (S.role === 'trapper' && !rec.broken) {
      // A sprung or disarmed trap of theirs, past its wait: walk out and lay it again.
      if (!S.task) for (const id of rec.traps) { const t = g.traps.byId(id); if (t && t.state !== 'armed' && t.relayAt <= g.time && !this.claimed(rec, t)) { S.task = t; break; } }
      if (S.task) {
        const t = S.task, d = Math.hypot(t.x - c.x, t.z - c.z);
        if (t.state === 'armed') { S.task = null; return; }
        S.moved = true;
        if (d > 1.1) { c.crouch = false; g.ai.move(c, t.x - c.x, t.z - c.z, role.pace + 0.5, dt); return; }
        c.speed = 0; c.crouch = true; c.handsUp = true; c.face = Math.atan2(t.x - c.x, t.z - c.z);
        if ((S.workT += dt) > 3) { S.workT = 0; c.crouch = false; c.handsUp = false; g.traps.relay(t); S.task = null; this.stats.relaid++; }
        return;
      }
    }
    const d = Math.hypot(home.x - c.x, home.z - c.z);
    if (d > 0.6) { c.crouch = false; c.handsUp = false; g.ai.move(c, home.x - c.x, home.z - c.z, role.pace, dt); return; }
    c.speed = 0; S.moved = false; m0(c, S, home);
    if (S.role === 'watcher') this.watch(c, rec, dt);
    else if (S.role === 'elder' || S.role === 'kin') { c.crouch = S.role === 'kin' && (S.m.seed & 1) === 1; c.face = Math.atan2(R.x - c.x, R.z - c.z); }
  }
  claimed(rec, t) { for (const m of rec.members) if (m.c?.gb?.task === t) return true; return false; }

  // A watcher on the edge: sees you (inside its eye, a clear line) long enough, and calls.
  watch(c, rec, dt) {
    const g = this.g, P = g.player, S = c.gb;
    if ((S.look -= dt) > 0) return;
    S.look = 0.25;
    if (!P.alive || P.hidden || P.underwater) { S.seeT = 0; return; }
    const night = g.sky?.night ?? 0, lit = night > 0.3 && g.flashMat?.opacity > 0;
    const eye0 = GREYBORN.watchR * (rec.alert ? 1.5 : 1) * (lit ? 1 : 1 - 0.55 * night);
    const eye = P.prone && g.stance ? g.stance.seenRange(P, eye0, 0.7, c.x, c.z, c) : eye0 * (P.crouch ? 0.7 : 1); // prone: systems/stance.js (D2)
    const px = P.inVehicle ? P.inVehicle.x : P.x, pz = P.inVehicle ? P.inVehicle.z : P.z, d = Math.hypot(px - c.x, pz - c.z);
    if (d < eye && (P.inVehicle ? g.los(c.x, c.z, px, pz) : g.sees(c, P))) {
      S.seeT += 0.25;
      c.face = Math.atan2(px - c.x, pz - c.z);
      if (S.seeT >= (rec.alert ? 0 : GREYBORN.alarmFor)) this.alarm(rec, P, c);
    } else S.seeT = Math.max(0, S.seeT - 0.25);
  }

  update(dt) {
    const g = this.g, P = g.player;
    if (!this.enabled) return;
    for (const rec of this.recs) {
      if (rec.alarmT > 0) rec.alarmT -= dt;
      // The elder's death breaks them.
      if (rec.live && !rec.broken) { const e = rec.members.find((m) => m.role === 'elder'); if (e?.c && !e.c.alive) { rec.broken = true; g.emit('greybornBroken', { town: rec.id }); g.feedback?.floater(e.c.x, e.c.z, 'the fire goes quiet', 'bark'); } }
      if (rec.live) for (const m of rec.members) if (m.c && !m.c.alive && !m.dead) { m.dead = true; m.x = m.c.x; m.z = m.c.z; m.face = m.c.face; this.stats.deaths++; if (m.c.lastAttacker === P && rec.mem.player) rec.mem.player.killed++; }
      // Where you crossed their line (remembered if a watcher sees you this visit).
      const d = Math.hypot(P.x - rec.row.x, P.z - rec.row.z);
      if (d < rec.row.territory && !rec.entryNow) rec.entryNow = { x: +P.x.toFixed(1), z: +P.z.toFixed(1) };
      if (d > rec.row.territory + 20) { rec.entryNow = null; rec.entrySet = false; }
      if (rec.session && rec.entryNow && rec.mem.player && !rec.entrySet) { rec.mem.player.entry = { ...rec.entryNow }; rec.entrySet = true; }
    }
    if ((this.scanT -= dt) > 0) return;
    this.scanT = 0.5;
    const fx = P.inVehicle ? P.inVehicle.x : P.x, fz = P.inVehicle ? P.inVehicle.z : P.z;
    for (const rec of this.recs) {
      for (const m of rec.members) if (m.c && !g.chars.includes(m.c)) { this.writeBack(m, m.c); m.c = null; }
      rec.live = rec.members.some((m) => m.c);
      const d = Math.hypot(fx - rec.row.x, fz - rec.row.z);
      if (!rec.live && d < rec.row.promoteR) this.promote(rec);
      else if (rec.live && d > rec.row.demoteR) this.demote(rec);
      else if (rec.live && rec.members.some((m) => m.dead && !m.c && Math.hypot(m.x - fx, m.z - fz) < 65)) this.promote(rec); // a body you've come near
    }
    const night = g.sky?.night ?? 0;
    if (this.emberMat) this.emberMat.opacity = 0.35 + 0.6 * night * (0.85 + 0.15 * Math.sin(g.time * 7));
    // The fire lights the ring of shelters after dark (a flicker from the effects' light pool, only when you're near).
    if (night > 0.3 && (this.fireT = (this.fireT ?? 0) - 0.5) <= 0) {
      this.fireT = 0.25;
      for (const rec of this.recs) if (!rec.broken && Math.hypot(fx - rec.row.x, fz - rec.row.z) < 110) g.fx.light(rec.row.x, 1.4, rec.row.z, '#ff8a3a', (16 + Math.random() * 8) * night, 0.8);
    }
  }

  view(rec) {
    const P = this.g.player;
    return {
      id: rec.id, name: rec.row.name, x: rec.row.x, z: rec.row.z, d: +Math.hypot(P.x - rec.row.x, P.z - rec.row.z).toFixed(1), promoted: rec.live, alarm: rec.alarmT > 0 ? +rec.alarmT.toFixed(1) : 0,
      alert: rec.alert, broken: rec.broken, remembers: rec.mem.player ? { ...rec.mem.player } : null,
      members: rec.members.map((m) => ({ role: m.role, hp: m.c ? Math.round(m.c.hp) : m.hp, dead: m.c ? !m.c.alive : m.dead, id: m.c?.id ?? null, task: m.c?.gb?.task?.id ?? null })),
      traps: rec.traps.map((id) => this.g.traps.byId(id)).filter(Boolean).map((t) => `${t.id}:${t.kind}:${t.state}${t.spotted ? '*' : ''}`),
    };
  }
  save() { return this.recs.map((r) => ({ id: r.id, broken: r.broken, mem: r.mem, extra: r.extra, traps: r.traps, members: r.members.map((m) => { if (m.c) this.writeBack(m, m.c); return { n: m.n, hp: m.hp, dead: m.dead, x: m.x, z: m.z, face: m.face }; }) })); }
  load(s) {
    for (const rec of this.recs) this.demote(rec, true);
    if (!Array.isArray(s)) return;
    for (const d of s) {
      const rec = this.recs.find((r) => r.id === d.id);
      if (!rec) continue;
      rec.broken = !!d.broken; rec.mem = d.mem ?? {}; rec.extra = d.extra ?? null; if (d.traps) rec.traps = d.traps;
      for (const sm of d.members ?? []) { const m = rec.members[sm.n]; if (m) Object.assign(m, { hp: sm.hp, dead: sm.dead, x: sm.x, z: sm.z, face: sm.face }); }
    }
  }
}

// Settled at home: stand where they belong.
function m0(c, S, home) { if (home.face !== undefined && S.role !== 'kin' && S.role !== 'elder') c.face = home.face; }
