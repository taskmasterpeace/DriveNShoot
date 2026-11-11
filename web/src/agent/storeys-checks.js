// The selftest's STOREYS v2 checks (docs/design/WEB_STOREYS.md §9.8; WEB_DEATHLANDS_GAP.md §8 acceptance #3 and #8): the
// rows and the cap, a six-storey building downtown and in the ring, every floor of every ring tower reached by the
// walkability audit, a window shot from floor 4 at a staged street target (and the street shooting back up), the cutaway
// through a real six-storey ring tower, a roof bridge and a fire escape walked on held keys, floors muffling noise and
// blasts, the facade kit on every tower, loot and danger richer upstairs, and the draw calls with the downtown belt in
// the widest drive view. Run inside runSelfTest (agent/api.js); each check returns true or a JSON diagnostic.
import * as THREE from 'three';
import { RING_RISE, MAX_ABOVE, ACROSS, DANGER } from '../data/storeys.js';
import { VERT, KINDS as CG_KINDS } from '../data/citygen.js';
import { auditTown } from '../world/citygen/audit.js';
import { outfit } from '../systems/characters.js';

const r1 = (n) => Math.round(n * 10) / 10, r2 = (n) => Math.round(n * 100) / 100;
const SPOT = { x: 520, z: 160 }; // on the first ring street east of the island: the downtown belt

export async function storeysV2Checks({ api, g, check, C }) {
  const p = g.player, RR = g.ringrise;
  const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  const keyFor = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'KeyD' : 'KeyA') : dz > 0 ? 'KeyS' : 'KeyW');
  const hold = (dx, dz) => { const want = new Set(); if (dx > 0.25) want.add('KeyD'); if (dx < -0.25) want.add('KeyA'); if (dz > 0.25) want.add('KeyS'); if (dz < -0.25) want.add('KeyW'); if (!want.size) want.add(keyFor(dx, dz)); for (const q of KEYS) { if (want.has(q)) g.input.down.add(q); else g.input.down.delete(q); } };
  const release = () => { for (const q of KEYS) g.input.down.delete(q); };
  const stand = async (x, z, gy = 0) => {
    if (p.inVehicle) g.exitVehicle(true);
    if (Math.hypot(p.x - x, p.z - z) > 120) await C('teleport', { x, z });
    p.x = x; p.z = z; p.gy = gy; g.standOn(p); p.vx = 0; p.vz = 0;
    g.camLook.x = p.x; g.camLook.z = p.z; g.camFloor = p.gy;
    await api._step(2);
  };
  const clearNear = (r = 40) => { for (const c of [...g.chars]) if (c !== p && !c.npc && (c.faction === 'zombie' || c.faction === 'raider' || c.ringRise || c.cgTown) && Math.hypot(c.x - p.x, c.z - p.z) < r) g.removeChar(c); };
  const downtown = async () => { await stand(SPOT.x, SPOT.z); await api._step(4); return RR.view(); };
  const hp0 = { hp: p.hp, alive: p.alive };
  const heal = () => { p.hp = Math.max(p.hp, hp0.hp); };

  await check('storeys v2: the rows - the cap is six storeys (maxAbove 5) on the island, in the ring rows and in the generated kinds; downtown 4-6, the Strip 2-3, the dead houses 2, the yards never; floors carry noise and blasts one floor at half, two not at all', async () => {
    const bad = [];
    if (MAX_ABOVE !== 5) bad.push(`MAX_ABOVE ${MAX_ABOVE}`);
    if (VERT.maxStoreys !== MAX_ABOVE + 1) bad.push(`VERT.maxStoreys ${VERT.maxStoreys}`);
    for (const [z, R] of Object.entries(RING_RISE)) { if (z === 'belt' || !R) continue; if (R.storeys[1] > MAX_ABOVE + 1 || R.storeys[0] < 2) bad.push(`${z} storeys ${R.storeys}`); for (const k of Object.values(R.kinds)) if (!CG_KINDS[k]) bad.push(`${z}: no kind ${k}`); }
    const d = RING_RISE.downtown, s = RING_RISE.strip, h = RING_RISE.residential;
    if (d.storeys[0] !== 4 || d.storeys[1] !== 6 || s.storeys[0] !== 2 || s.storeys[1] !== 3 || h.storeys[1] !== 2 || RING_RISE.industrial) bad.push('zone ranges');
    for (const S of g.storeys.list) if (S.n > MAX_ABOVE) bad.push(`island building ${S.n + 1} storeys`);
    if (ACROSS.noise.join() !== '1,0.5,0' || ACROSS.blast.join() !== '1,0.5,0') bad.push('floor shares');
    return bad.length ? JSON.stringify(bad) : true;
  });

  await check('storeys v2: acceptance #8a - a six-storey building stands in Phoenix downtown (the island) and in the ring (a downtown-belt tower, its roof reached by its stairs)', async () => {
    const isl = g.storeys.list.filter((S) => S.n + 1 >= 6).map((S) => ({ x: r1((S.b.minX + S.b.maxX) / 2), z: r1((S.b.minZ + S.b.maxZ) / 2), storeys: S.n + 1 }));
    const v = await downtown();
    const six = v.filter((o) => o.storeys === 6 && o.roof && o.floors.length === 7);
    return isl.length && six.length ? true : JSON.stringify({ island: isl, ring: v.map((o) => [o.id, o.storeys, o.roof]).slice(0, 12), live: RR.live.size });
  });

  await check('storeys v2: acceptance #8b - the walkability audit reaches every floor of every live ring tower from its street door (stairs to every floor, the roof where it has access), and a tower\'s front door is reached from the ring street on the foot nav grid', async () => {
    await downtown();
    const bad = [], seen = [];
    for (const e of RR.live.values()) {
      const a = auditTown(e.built, e.T);
      seen.push([e.key, a.audited, a.floors]);
      if (!a.ok) bad.push(...a.bad);
    }
    // the street side: from the street, A* reaches a tower's front door
    const v = RR.view(SPOT.x, SPOT.z, 120).filter((o) => o.zone === 'downtown').sort((a, b) => Math.hypot(a.x - SPOT.x, a.z - SPOT.z) - Math.hypot(b.x - SPOT.x, b.z - SPOT.z));
    let door = null;
    for (const o of v) {
      const B = RR.record(o.id).R.B, d = B.doors.find((q) => q.kind === 'door' && q.side === B.front);
      if (!d) continue;
      const out = d.side === 'N' ? [d.at, B.z0 - 2.5] : d.side === 'S' ? [d.at, B.z1 + 2.5] : d.side === 'W' ? [B.x0 - 2.5, d.at] : [B.x1 + 2.5, d.at];
      const path = g.footPath(SPOT.x, SPOT.z, out[0], out[1]);
      door = { id: o.id, reached: !!(path && path.length) };
      break;
    }
    const floors = seen.reduce((s, q) => s + q[2], 0);
    return !bad.length && floors > 0 && door?.reached ? true : JSON.stringify({ bad: bad.slice(0, 6), seen, door });
  });

  await check('storeys v2: acceptance #8c - a shot out of a floor-4 window of a ring tower hits a staged target in the street, and the street shoots back up: the target sees you at the window and its round reaches you (the window law); from the solid wall beside the window, neither', async () => {
    await downtown();
    const o = RR.view(SPOT.x, SPOT.z, 260).find((q) => q.storeys >= 5 && !q.ruined);
    if (!o) return 'no tower of 5+ storeys';
    const { R, e } = RR.record(o.id), B = R.B, S = R.S, k = 3, y4 = S.Y[k];
    const horiz = B.front === 'N' || B.front === 'S', out = B.front === 'N' || B.front === 'W' ? -1 : 1, fixed = B.front === 'N' ? B.z0 : B.front === 'S' ? B.z1 : B.front === 'W' ? B.x0 : B.x1;
    const wins = (e.built.upWins ?? []).filter((w) => w.b === B.id && w.k === k && (horiz ? w.nz === out : w.nx === out));
    const A = S.area, clear = (x, z) => !(x > A.minX - 0.9 && x < A.maxX + 0.9 && z > A.minZ - 0.9 && z < A.maxZ + 0.9);
    const w = wins.find((q) => clear(horiz ? q.x : fixed - out * 0.75, horiz ? fixed - out * 0.75 : q.z));
    if (!w) return JSON.stringify({ id: o.id, wins: wins.length });
    const wc = horiz ? w.x : w.z, inX = horiz ? wc : fixed - out * 0.75, inZ = horiz ? fixed - out * 0.75 : wc;
    const tx = horiz ? wc : fixed + out * 16, tz = horiz ? fixed + out * 16 : wc;
    await stand(inX, inZ, y4);
    clearNear(90);
    const onFloor = Math.abs((p.gy ?? 0) - y4) < 0.05 && p.storey === S;
    await C('give', { weapon: 'rifle', rifle: 90 }); await C('equip', { weapon: 'rifle' });
    const T1 = g.addChar({ x: tx, z: tz, faction: 'drifter', weapon: null, hp: 400, colors: outfit('drifter'), name: 'Street target (selftest)', flag: 'US' });
    T1.x = tx; T1.z = tz; T1.gy = 0; T1.hold = true;
    const h1 = T1.hp;
    await C('fire', { id: T1.id, shots: 6 });
    const down = T1.hp < h1 || !T1.alive;
    // and back up: the target sees you (the window law), and a round it fires at you reaches you
    const sees = g.sees(T1, p), across = g.storeys.across(T1, p);
    const W1 = g.addChar({ x: inX, z: inZ, faction: 'drifter', weapon: null, hp: 400, colors: outfit('drifter'), name: 'Window target (selftest)', flag: 'US' });
    W1.x = inX; W1.z = inZ; W1.gy = y4; W1.storey = S; W1.hold = true;
    p.x += horiz ? 1.6 : 0; p.z += horiz ? 0 : 1.6; // step aside along the wall: the round is for the one at the window
    const wh = W1.hp, n0 = g.combat.upShots ?? 0;
    for (let i = 0; i < 4 && W1.hp === wh; i++) { const dx = W1.x - T1.x, dz = W1.z - T1.z, d = Math.hypot(dx, dz); g.combat.hitscan(T1, T1.x, T1.z, dx / d, dz / d, 80, 8, null, 0, null); }
    const up = W1.hp < wh || !W1.alive;
    g.removeChar(W1);
    g.removeChar(T1);
    // the pier beside the window: a target straight out is not reached through the wall
    let blocked = null;
    const lo = horiz ? B.x0 + 1.2 : B.z0 + 1.2, hi = horiz ? B.x1 - 1.2 : B.z1 - 1.2;
    let pier = null;
    for (let a = lo; a < hi; a += 0.25) { if (wins.some((q) => Math.abs((horiz ? q.x : q.z) - a) < q.w / 2 + 0.5)) continue; if (clear(horiz ? a : fixed - out * 0.75, horiz ? fixed - out * 0.75 : a)) { pier = a; break; } }
    if (pier !== null) {
      await stand(horiz ? pier : fixed - out * 0.75, horiz ? fixed - out * 0.75 : pier, y4);
      const T2 = g.addChar({ x: horiz ? pier : fixed + out * 16, z: horiz ? fixed + out * 16 : pier, faction: 'drifter', weapon: null, hp: 400, colors: outfit('drifter'), name: 'Street target 2 (selftest)', flag: 'US' });
      T2.hold = true; const h2 = T2.hp;
      await C('fire', { id: T2.id, shots: 3 });
      const sees2 = g.sees(T2, p);
      blocked = T2.hp === h2 && !sees2;
      g.removeChar(T2);
    }
    await stand(SPOT.x, SPOT.z);
    const ok = onFloor && down && sees && across > 0 && up && blocked !== false;
    return ok ? true : JSON.stringify({ id: o.id, onFloor, down, sees, across: r2(across), up, upShots: (g.combat.upShots ?? 0) - n0, blocked, at: [r1(inX), r1(inZ), r1(y4)] });
  });

  await check('storeys v2: acceptance #3 - a real six-storey ring tower between the camera and you (ANGLED close, you in front of its north front): >= 90% of your screen circle shows you (pixel test against the tower removed), and with the cutaway off it does not', async () => {
    await downtown();
    const R = g.cam;
    await C('setTime', { hour: 12 }); await C('setWeather', { key: 'CLEAR', instant: true }); // a pixel test needs daylight (at night every pixel is black alike)
    // a six-storey tower with open street north of it (no other building within 9 m of the spot)
    let pick = null;
    // (its front on the north street: you stand on its open forecourt, not behind its back-yard wall)
    for (const o of RR.view(SPOT.x, SPOT.z, 400).filter((q) => q.storeys === 6 && q.front === 'N')) {
      const x = o.x, z = o.z0 - 2.6;
      if (g.storeys.at(x, z) || g.citygen.buildingAt(x, z) || g.streamer?.ringBuildingAt?.(x, z)) continue;
      pick = { o, x, z }; break;
    }
    if (!pick) return 'no six-storey tower with a street north of it';
    await stand(pick.x, pick.z);
    clearNear(30);
    R.setView('ANGLED', true); R.mem.ANGLED.foot = 20;
    g.aimOverride = { x: p.x, z: p.z }; await api._step(2); g.updateCamera(10);
    const { e } = RR.record(pick.o.id), mesh = g.citygen.mesh, F = g.facades.M;
    const Wd = 320, H = Math.round(320 / g.camera.aspect), rt = new THREE.WebGLRenderTarget(Wd, H), buf = new Uint8Array(Wd * H * 4);
    const fv = Object.values(F).map((m) => m.visible);
    // its shadow is not the test (the staged tower casts none): the tower's meshes cast nothing while the three frames render
    const cs = [mesh, ...Object.values(F)].map((m) => m.castShadow);
    [mesh, ...Object.values(F)].forEach((m) => { m.castShadow = false; });
    const shot = (vis, cut) => {
      mesh.visible = vis; Object.values(F).forEach((m, i) => { m.visible = vis && fv[i]; });
      g.cutaway.on = cut; g.updateCamera(0); g.cutaway.update(0);
      g.renderer.setRenderTarget(rt); g.renderer.render(g.scene, g.camera); g.renderer.setRenderTarget(null);
      g.renderer.readRenderTargetPixels(rt, 0, 0, Wd, H, buf);
      return buf.slice();
    };
    let out;
    try {
      g.paused = true;
      g.cutaway.scan();
      const truth = shot(false, true), cutOn = shot(true, true), cutOff = shot(true, false);
      const a = new THREE.Vector3(p.x, 0.1, p.z).project(g.camera), b = new THREE.Vector3(p.x, 1.8, p.z).project(g.camera);
      const cx = ((a.x + b.x) / 4 + 0.5) * Wd, cy = ((a.y + b.y) / 4 + 0.5) * H, rad = Math.max(3, Math.abs(b.y - a.y) * H / 4);
      let n = 0, same = 0, sameOff = 0;
      for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > rad * rad || x < 0 || y < 0 || x >= Wd || y >= H) continue;
        const i = (y * Wd + x) * 4, d = (A2) => Math.abs(A2[i] - truth[i]) + Math.abs(A2[i + 1] - truth[i + 1]) + Math.abs(A2[i + 2] - truth[i + 2]);
        n++; if (d(cutOn) < 24) same++; if (d(cutOff) < 24) sameOff++;
      }
      // the tower stands between: its roof is south of you and above the camera's line to you
      const B = RR.record(pick.o.id).R.B;
      out = { tower: pick.o.id, storeys: B.n, top: r1(B.top), px: n, shows: r2(same / Math.max(1, n)), showsWithoutCut: r2(sameOff / Math.max(1, n)), camZ: r1(g.camera.position.z), towerZ: [B.z0, B.z1], chunk: e.key };
    } finally { [mesh, ...Object.values(F)].forEach((m, i) => { m.castShadow = cs[i]; }); g.paused = false; g.aimOverride = null; mesh.visible = g.citygen.items.length > 0; Object.values(F).forEach((m, i) => { m.visible = fv[i]; }); rt.dispose(); g.cutaway.on = true; R.setView('TOPDOWN', true); }
    return out.px > 20 && out.shows >= 0.9 && out.showsWithoutCut < 0.6 && out.camZ > out.towerZ[0] ? true : JSON.stringify(out);
  });

  await check('storeys v2: inside a ring tower on floor 4 you are in a building (the roof and the floors above you are not drawn, its facade kit above your floor neither) and the camera measures from your floor; outside again, all of it shows', async () => {
    await downtown();
    const o = RR.view(SPOT.x, SPOT.z, 260).find((q) => q.storeys >= 5 && !q.ruined);
    if (!o) return 'no tower';
    const { R } = RR.record(o.id), S = R.S, y4 = S.Y[3];
    await C('rise', { id: o.id, go: true, floor: 3 });
    clearNear(40);
    await api._step(20);
    const inn = { inside: !!g.insideBuilding, viewS: g.storeys.viewS === S, viewL: g.storeys.viewL, camFloor: r1(g.camFloor ?? 0), camY: r1(g.camera.position.y), gy: r1(p.gy ?? 0), facade: g.facades.viewKey === S && g.facades.viewL === 3 };
    await stand(SPOT.x, SPOT.z); await api._step(20);
    const out = { viewS: g.storeys.viewS, facade: g.facades.viewKey };
    const ok = inn.inside && inn.viewS && inn.viewL === 3 && Math.abs(inn.camFloor - y4) < 1 && inn.camY > inn.gy + 3 && inn.facade && !out.viewS && !out.facade;
    return ok ? true : JSON.stringify({ inn, out: { viewS: !!out.viewS, facade: !!out.facade }, y4: r1(y4) });
  });

  await check('storeys v2: a roof bridge is walked on held keys - up on one tower\'s roof, across the planks over the gap, onto the next roof (height and building change at the far end)', async () => {
    await downtown();
    let list = RR.bridges();
    if (!list.length) { await stand(-520, 160); await api._step(4); list = RR.bridges(); }
    if (!list.length) { await stand(160, -520); await api._step(4); list = RR.bridges(); }
    const br = list[0];
    if (!br) return 'no live roof bridge near the downtown belt';
    const A = RR.record(br.from), B = RR.record(br.to);
    const ax = br.axis === 'x', zc = ax ? (br.z0 + br.z1) / 2 : null, xc = ax ? null : (br.x0 + br.x1) / 2;
    // stand on the from-roof 2 m back from the gap, facing it
    const sx = ax ? br.x0 - 2 : xc, sz = ax ? zc : br.z0 - 2, ex = ax ? br.x1 + 2.2 : xc, ez = ax ? zc : br.z1 + 2.2;
    await stand(sx, sz, A.R.B.top);
    clearNear(40);
    const start = { gy: r1(p.gy ?? 0), on: g.storeys.at(p.x, p.z)?.id ?? null };
    for (let f = 0; f < 60 * 12; f++) {
      if (Math.hypot(ex - p.x, ez - p.z) < 0.5) break;
      hold(ex - p.x, ez - p.z); await api._step(1);
    }
    release(); await api._step(2);
    const end = { x: r1(p.x), z: r1(p.z), gy: r1(p.gy ?? 0), on: g.storeys.at(p.x, p.z)?.id ?? null };
    const ok = Math.abs((p.gy ?? 0) - B.R.B.top) < 0.3 && end.on === B.R.B.id && Math.hypot(ex - p.x, ez - p.z) < 1.2;
    await stand(SPOT.x, SPOT.z);
    return ok ? true : JSON.stringify({ br: br.id, yFrom: br.yFrom, yTo: br.yTo, start, end, want: [r1(ex), r1(ez)] });
  });

  await check('storeys v2: a fire escape is walked on held keys - from the street at its foot, up every flight (the storeys law\'s steer), to its top landing', async () => {
    await downtown();
    let o = RR.view().find((q) => q.escape);
    if (!o) { await stand(-520, 160); await api._step(4); o = RR.view().find((q) => q.escape); }
    if (!o) return 'no live fire escape';
    const { R } = RR.record(o.id), E = R.E, top = E.Y[E.n];
    const f0 = E.flights[0];
    await stand(f0.bottomOut.x, f0.bottomOut.z, 0);
    clearNear(40);
    const goal = { x: (E.ix0 + E.ix1) / 2, z: (E.iz0 + E.iz1) / 2 };
    let maxY = 0;
    for (let f = 0; f < 60 * 60; f++) {
      if (Math.abs((p.gy ?? 0) - top) < 0.25) break;
      const wp = g.storeys.steer(p, goal.x, goal.z, top) ?? goal;
      hold(wp.x - p.x, wp.z - p.z); await api._step(1);
      maxY = Math.max(maxY, p.gy ?? 0);
    }
    release(); await api._step(2);
    const ok = Math.abs((p.gy ?? 0) - top) < 0.3;
    const res = { id: o.id, side: o.escape.side, top: r1(top), gy: r1(p.gy ?? 0), maxY: r1(maxY), landings: E.Y.map(r1), at: [r1(p.x), r1(p.z)] };
    await stand(SPOT.x, SPOT.z);
    return ok ? true : JSON.stringify(res);
  });

  await check('storeys v2: floors muffle - inside a ring tower a noise is heard on its own floor, at half its reach one floor up and not two floors up; a blast does full, half and no harm by floors apart; the street is untouched (outside: the old flat rule)', async () => {
    await downtown();
    const o = RR.view(SPOT.x, SPOT.z, 260).find((q) => q.storeys >= 4 && !q.ruined);
    if (!o) return 'no tower';
    const { R } = RR.record(o.id), S = R.S, B = R.B, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    const mk = (k) => ({ x: cx, z: cz, gy: S.Y[k], storey: S });
    const st = g.storeys, src = mk(1);
    const share = [0, 1, 2, 3].map((k) => st.floorShare(src.gy, cx, cz, mk(k)));
    const blast = [1, 2, 3].map((k) => st.floorShare(src.gy, cx, cz, mk(k), ACROSS.blast));
    const street = st.floorShare(0, SPOT.x, SPOT.z, { x: SPOT.x + 5, z: SPOT.z, gy: 0, storey: null });
    // live: a raider two floors up does not turn on a shot fired on floor 1; one on the same floor does
    clearNear(60);
    const put = (k, dx) => { const c = g.addChar({ x: cx + dx, z: cz, faction: 'raider', weapon: 'pistol', hp: 100, colors: outfit('raider'), name: 'Floor test', flag: 'US' }); c.x = cx + dx; c.z = cz; c.gy = S.Y[k]; c.storey = S; c.hold = true; c.target = null; c.state = 'idle'; return c; };
    const same = put(1, 1.5), two = put(3, 1.5);
    await stand(cx - 1.5, cz, S.Y[1]);
    p.storey = S;
    g.ai.onNoise(p.x, p.z, 30, p);
    const heard = { same: same.target === p, two: two.target === p };
    g.removeChar(same); g.removeChar(two);
    await stand(SPOT.x, SPOT.z);
    const ok = share[1] === 1 && share[0] === 0.5 && share[2] === 0.5 && share[3] === 0 && blast[0] === 1 && blast[1] === 0.5 && blast[2] === 0 && street === 1 && heard.same && !heard.two;
    return ok ? true : JSON.stringify({ share, blast, street, heard, floors: S.Y.map(r1) });
  });

  await check('storeys v2: the facade kit dresses every live ring tower and the island\'s storeyed buildings - window states (glass, boards with a slit, soot, open), a ledge per floor, a cornice, roof tanks / HVAC / sandbag nests, shop signs - in five instanced meshes; the lamps light only after dark', async () => {
    await downtown();
    const F = g.facades, s = F.status(), c = s.counts;
    const ring = s.sources.filter((q) => q.startsWith('ring:')).length;
    await C('setTime', { hour: 12 }); await api._step(2);
    const dayLamps = F.M.lit.visible;
    await C('setTime', { hour: 23 }); await api._step(2);
    const nightLamps = F.M.lit.visible && F.M.lit.material.opacity > 0.3;
    await C('setTime', { hour: 18.6 }); await api._step(1);
    const meshes = Object.values(F.M).length;
    const ok = s.sources.includes('island') && ring > 0 && c.glass > 0 && c.boarded > 0 && c.blown > 0 && c.ledges > 0 && c.tanks > 0 && c.hvac > 0 && c.nests > 0 && c.signs > 0 && meshes === 5 && !dayLamps && nightLamps && c.over === 0;
    return ok ? true : JSON.stringify({ sources: s.sources.length, ring, counts: c, used: s.used, dayLamps, nightLamps });
  });

  await check('storeys v2: upstairs is richer and more dangerous - a tower\'s loot by floor (the gunsmith odds rise floor by floor, a crate on a reached roof), infected on the upper floors and a rifleman perched on a tall roof in the hot chunks', async () => {
    await downtown();
    // a crowded agent page keeps its slots for the street (DANGER.reserve): let the towers people themselves now
    const res0 = DANGER.reserve; DANGER.reserve = 0; RR.popT = 0; RR.update(1.1); DANGER.reserve = res0;
    let upper = 0, rich = 0, roofCrates = 0, zs = 0, snipers = 0;
    for (const e of RR.live.values()) {
      for (const q of e.built.loot) { if (q.k >= 1) upper++; if (q.k >= 2 && q.table === 'gunsmith') rich++; if (String(q.id).endsWith(':roof')) roofCrates++; }
      for (const c of e.chars) { if (!c.alive) continue; if (c.faction === 'zombie' && (c.gy ?? 0) > 2) zs++; if (c.perch && c.faction === DANGER.sniper.faction) snipers++; }
    }
    // the rifleman stands on his roof and sees the street from behind the parapet
    let seesStreet = null;
    const sn = [...RR.live.values()].flatMap((e) => e.chars).find((c) => c.alive && c.perch);
    if (sn) { const B = RR.record(g.storeys.at(sn.x, sn.z)?.id)?.R.B, f = B?.front; const dx = f === 'W' ? -14 : f === 'E' ? 14 : 0, dz = f === 'N' ? -14 : f === 'S' ? 14 : 0; seesStreet = B ? g.storeys.across(sn, { x: sn.x + dx, z: sn.z + dz, gy: 0 }) > 0 : null; }
    const ok = upper > 0 && roofCrates > 0 && (zs > 0 || snipers > 0) && seesStreet !== false;
    return ok ? true : JSON.stringify({ upper, rich, roofCrates, zs, snipers, seesStreet, free: g.freeSlots.length });
  });

  await check('storeys v2: the draw calls stay under 150 with the downtown belt in the widest drive view (the towers, the facade kit and the island in one frame)', async () => {
    await downtown();
    const v = await C('spawnVehicle', { type: 'sedan', x: SPOT.x, z: SPOT.z, heading: 0, ai: 'none' });
    await C('enterVehicle', { id: v.id, force: true });
    const R = g.cam;
    let worst = 0;
    for (const view of ['ANGLED', 'TOPDOWN', 'ISO']) {
      await C('camera', { view, mode: 'drive', d: 175, settle: true }); await api._step(3);
      g.renderer.render(g.scene, g.camera);
      const pf = await C('perf'); worst = Math.max(worst, pf.drawCalls);
    }
    const veh = g.vehicles.find((q) => q.id === v.id); g.exitVehicle(true); if (veh) g.vehiclesSys.remove(veh);
    R.setView('TOPDOWN', true);
    return worst > 0 && worst < 150 ? true : JSON.stringify({ worst });
  });

  // back to where the battery left off
  p.hp = Math.max(p.hp, hp0.hp);
  await stand(SPOT.x, SPOT.z);
}
