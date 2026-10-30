// Selftest checks for SEMIS (docs/design/WEB_SEMIS.md §8): the rows and the bodies, hitching and leaving a trailer parked,
// reversing (the trailer goes the other way), the jackknife, a car driving up the ramp of a MOVING semi and riding it
// through a 50 km/h bend and back out, the RV that only the wide trailer takes, getting out and walking round the car in
// the hold, the road and clearance rules with the freight stopping short of a low bridge, and the draw calls of a convoy.
// runSelfTest calls this right after the decks-stance checks, with their helpers. The player acts on held keys; the
// rigs, their drivers and the test ground (the north-east flats, any cactus or tree on them lifted out of the way for the
// check; never a mesa or a camp) are staged.
import { VEHICLES } from '../systems/vehicles.js';
import { TRAILERS, HITCH, validateTrailers, fitsHold } from '../data/trailers.js';
import { validateDecks } from '../data/decks.js';
import { outfit } from '../systems/characters.js';
import { MOUNT_WEAPONS } from '../data/workshop.js';

const r2 = (v) => Math.round(v * 100) / 100;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// The ground: the north-east flats, x 130..400, z -464..-368 (flat, open: the mesa ends at x 128, the river starts at x 405,
// a camp's tents stand at x 164..191 north of z -395; the runs keep to z -400 and south of it there).
const SF = { x0: 130, x1: 400, z0: -464, z1: -368 };
const SCRUB = new Set(['cactus', 'tree', 'junk', 'crate', 'barrel']);

export async function semisChecks(api, check, C, H) {
  const g = api.g, { hush, wvClean, wvReady, hk, tk } = H;
  const S = () => g.semis, P = () => g.player;
  const vs = () => g.vehiclesSys;
  // Lift the flats' scrub (cacti, a tree) out of the way while a rig runs (their base above anything), and put it back.
  // The Phoenix ring's Dustwolf chop shop north of here promotes its crew within reach (systems/residents.js): for the
  // check they stay records (promotion paused), and anyone hostile already near the ground goes.
  const HOSTILE = new Set(['raider', 'dustwolves', 'zombie']);
  const clearGround = () => {
    const lifted = [], ru = g.residents?.update;
    if (g.residents) g.residents.update = () => {};
    const cx = (SF.x0 + SF.x1) / 2, cz = (SF.z0 + SF.z1) / 2;
    for (const c of [...g.chars]) if (c !== P() && HOSTILE.has(c.faction) && Math.hypot(c.x - cx, c.z - cz) < 420) { const v = c.inVehicle; if (v) g.seats.leave(c, true); g.removeChar(c); if (v && !v.occ?.some((o) => o && o.alive) && g.vehicles.includes(v) && !v.tractor && !v.trailer) vs().remove(v); }
    for (const v of [...g.vehicles]) if (v.ai === 'raider' && v.driver !== P() && Math.hypot(v.x - cx, v.z - cz) < 420) { for (const o of [...(v.occ ?? [])]) if (o && o !== P()) { g.seats.leave(o, true); g.removeChar(o); } vs().remove(v); }
    for (const b of g.statics.boxes) if (SCRUB.has(b.tag) && b.maxX > SF.x0 && b.minX < SF.x1 && b.maxZ > SF.z0 && b.minZ < SF.z1 && b.base === 0) { lifted.push(b); b.base = 99; }
    for (const v of [...g.vehicles]) if (!v.occ?.some(Boolean) && v.x > SF.x0 - 20 && v.x < SF.x1 + 20 && v.z > SF.z0 - 20 && v.z < SF.z1 + 20 && !v.tractor && !v.trailer) vs().remove(v);
    return () => { for (const b of lifted) b.base = 0; if (g.residents && ru) delete g.residents.update; };
  };
  const driver = (v) => { const d = g.addChar({ x: v.x, z: v.z + 4, faction: 'drifter', colors: outfit('drifter'), name: 'Hauler (selftest)', flag: 'US', hp: 400 }); g.seats.board(d, v, 0); v.ai = null; v.throttle = 0; return d; };
  const rig = (kind, x, z, h, withDriver = true) => { const r = S().spawnRig(kind, x, z, h); r.d = withDriver ? driver(r.K) : null; return r; };
  const gone = (r) => { if (!r) return; const T = r.T; for (const C0 of [...(T?.cargo ?? [])]) { C0.carriedBy = null; if (g.vehicles.includes(C0)) vs().remove(C0); } wvClean([r.d, r.K, T]); };
  const speedOf = (v) => vs().speed(v);
  // Into the driver's seat by reference (C('enterVehicle') finds by id, and a restored save can leave two vehicles one id).
  const enter = (v) => { if (P().inVehicle) g.exitVehicle(true); g.enterVehicle(v); };
  // Drive a staged (ai-less) driver: hold a speed along the current heading, with a steer.
  // The player eases a car along on held keys: W while it is slower than `rel` m/s over `ref`'s speed, S past `rel` + 2.
  const ease = (car, ref, rel) => { const h = ref ? ref.h : car.h, sp = (car.vx - (ref?.vx ?? 0)) * Math.sin(h) + (car.vz - (ref?.vz ?? 0)) * Math.cos(h); g.input.down.delete('KeyW'); g.input.down.delete('KeyS'); if (sp < rel) g.input.down.add('KeyW'); else if (sp > rel + 2) g.input.down.add('KeyS'); };
  const keysUp = () => { for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyG']) g.input.down.delete(k); };
  const holdSpeed = (v, want, steer = 0) => { const sp = speedOf(v), fwd = v.vx * Math.sin(v.h) + v.vz * Math.cos(v.h); v.steer = steer; v.throttle = fwd < want - 0.4 ? 0.8 : fwd > want + 0.8 ? -0.35 : 0.12; return sp; };

  await check('semis: the rows are valid (validateTrailers, the hold decks) and the LONGHAULER, the BOX TRAILER and the WIDE-LOAD LOWBOY are built by the vehicle body builders (thousands of triangles, wheels, glass in the cab, the ramp and the roll-up door their own pieces), never boxes', async () => hush(async () => {
    const bad = validateTrailers(VEHICLES, validateDecks);
    const r = rig('box', SF.x0 + 60, SF.z0 + 30, 0, false), w = rig('wide', SF.x0 + 120, SF.z0 + 30, 0, false);
    try {
      const tris = (m) => (m?.geometry.attributes.position.count ?? 0) / 3;
      const counts = { semi: tris(r.K.mesh), box: tris(r.T.mesh), wide: tris(w.T.mesh), ramp: tris(r.T.rampMesh), door: tris(r.T.doorMesh), wideRamp: tris(w.T.rampMesh) };
      if (!(counts.semi > 2500 && counts.box > 1500 && counts.wide > 1500 && counts.ramp > 60 && counts.door > 20 && counts.wideRamp > 60)) bad.push(`thin bodies ${JSON.stringify(counts)}`);
      const parts = new Set(r.K.mesh.geometry.attributes.part.array);
      for (const k of [10, 12, 8, 15]) if (k !== 8 && !parts.has(k)) bad.push(`tractor without part ${k}`);
      if (!r.T.roof) bad.push('the box has no roof to cut away');
      if (!w.T.banner || !r.K.banner === false) bad.push('WIDE LOAD banners');
      if (!w.K.banner) bad.push('the tractor pulling a wide load has no banner');
      return bad.length ? bad.join('; ') : true;
    } finally { gone(r); gone(w); }
  }));

  await check('semis: hitch and unhitch - backing the tractor under a parked trailer on held keys, [G] couples it; hold [G] and it uncouples and stays parked on its landing gear while the tractor drives off', async () => hush(async () => {
    wvClean([]); wvReady(); const put = clearGround();
    const r = rig('box', 300, -430, Math.PI / 2, false);
    let K = r.K;
    const T = r.T;
    S().unhitch(K);
    vs().remove(K);
    // A loose tractor 9 m ahead of the trailer's nose, square to it; the player backs it under.
    const kp = S().kingpin(T, { x: 0, z: 0 });
    K = vs().spawn('semi', kp.x + 9 + 2.35, kp.z, Math.PI / 2, '#6a3a22');
    try {
      enter(K);
      await api._step(10);
      // Back up slowly (S held while it creeps, let go when it rolls faster) until the fifth wheel is under the kingpin.
      const gapOf = () => { const a = S().fifth(K, { x: 0, z: 0 }), b = S().kingpin(T, { x: 0, z: 0 }); return Math.hypot(a.x - b.x, a.z - b.z); };
      const trace = [];
      for (let f = 0; f < 60 * 12 && gapOf() > 1.1; f++) { const back = -(K.vx * Math.sin(K.h) + K.vz * Math.cos(K.h)); if (back < 1.2) g.input.down.add('KeyS'); else g.input.down.delete('KeyS'); await api._step(1); if (f % 60 === 0) trace.push([r2(K.x), r2(gapOf()), P().inVehicle === K]); }
      keysUp();
      for (let f = 0; f < 30 && K.vx * Math.sin(K.h) + K.vz * Math.cos(K.h) < -0.15; f++) { g.input.down.add('KeyW'); await api._step(1); g.input.down.delete('KeyW'); await api._step(1); } // brake the roll (W while it still backs)
      keysUp();
      const why = S().canHitch(K, T);
      await tk('KeyG'); await api._step(2);
      const hitched = T.towedBy === K;
      const x0 = T.x;
      await hk('KeyW', 2.5);
      const pulled = Math.abs(T.x - x0) > 3 && T.towedBy === K;
      await hk([], 2);
      await hk('KeyG', 0.9);
      await api._step(90);
      const loose = !T.towedBy && T.parked;
      const tx = T.x, tz = T.z;
      await hk('KeyW', 2.5);
      const stayed = Math.hypot(T.x - tx, T.z - tz) < 0.5, away = Math.hypot(K.x - T.x, K.z - T.z) > 12;
      return hitched && pulled && loose && stayed && away ? true : JSON.stringify({ why, hitched, pulled, loose, stayed, away, gap: r2(Math.hypot(K.x - T.x, K.z - T.z)), trace: trace.slice(0, 6) });
    } finally { keysUp(); gone({ K, T }); put(); }
  }));

  await check('semis: reversing steers the trailer the other way - backing up with the wheel over, the tractor turns one way and the trailer swings the other (the articulation grows); driving forward the trailer follows the tractor round the same way', async () => hush(async () => {
    wvClean([]); wvReady(); const put = clearGround();
    const r = rig('box', 280, -420, Math.PI / 2);
    try {
      await api._step(5);
      const k0 = r.K.h, t0 = r.T.h;
      for (let f = 0; f < 150; f++) { r.K.throttle = -0.7; r.K.steer = 0.7; await api._step(1); }
      const dK = wrap(r.K.h - k0), dT = wrap(r.T.h - t0), phiR = r2(r.T.phi);
      r.K.throttle = -1; r.K.steer = 0; await api._step(60);
      // and forward: straighten out, then both turn the same way
      for (let f = 0; f < 200; f++) { r.K.throttle = 0.5; r.K.steer = 0; await api._step(1); }
      const k1 = r.K.h, t1 = r.T.h;
      for (let f = 0; f < 150; f++) { r.K.throttle = 0.5; r.K.steer = 0.6; await api._step(1); }
      const fK = wrap(r.K.h - k1), fT = wrap(r.T.h - t1);
      const ok = Math.abs(dK) > 0.1 && Math.sign(dK) !== Math.sign(dT) && Math.abs(dT) > 0.05 && Math.abs(phiR) > 0.2 && Math.sign(fK) === Math.sign(fT) && Math.abs(fT) > 0.1;
      return ok ? true : JSON.stringify({ reverse: { tractor: r2(dK), trailer: r2(dT), phi: phiR }, forward: { tractor: r2(fK), trailer: r2(fT) } });
    } finally { gone(r); put(); }
  }));

  await check('semis: braking hard at speed jackknifes an unloaded rig (the trailer folds round to the stop, a jackknife event); the same stop with a car chocked in the hold pulls up straight', async () => hush(async () => {
    wvClean([]); wvReady(); const put = clearGround();
    const out = {};
    try {
      for (const loaded of [false, true]) {
        const r = rig('box', 395, -430, -Math.PI / 2);
        if (loaded) { const car = vs().spawn('sedan', r.T.x, r.T.z, r.T.h, '#4a4a48'); S().load(car, r.T); }
        try {
          const seq = g.eventSeq;
          let top = 0;
          for (let f = 0; f < 60 * 12 && top < 15.5; f++) { r.K.throttle = 1; r.K.steer = 0; await api._step(1); top = speedOf(r.K); }
          let worst = 0;
          for (let f = 0; f < 60 * 4; f++) { r.K.throttle = -1; r.K.steer = 0; await api._step(1); worst = Math.max(worst, Math.abs(r.T.phi ?? 0)); }
          const jk = g.events.filter((e) => e.seq > seq && e.type === 'jackknife' && e.trailer === r.T.id).length;
          out[loaded ? 'loaded' : 'empty'] = { top: r2(top), worst: r2(worst), jk, x: Math.round(r.K.x) };
        } finally { gone(r); }
      }
      const e = out.empty, l = out.loaded;
      return e.top > 15 && e.jk > 0 && e.worst > HITCH.yawLimit - 0.05 && l.top > 15 && l.jk === 0 && l.worst < 0.3 ? true : JSON.stringify(out);
    } finally { put(); }
  }));

  await check('semis: a car drives up the ramp of a MOVING semi (the ramp down, the truck rolling, the car matching its speed on held keys), rides in the hold through a bend at 50 km/h without falling out (on the floor, inside the walls, the door shut behind it), then drives back down the ramp onto the road behind the moving truck', async () => hush(async () => {
    wvClean([]); wvReady(); const put = clearGround();
    const r = rig('box', 178, -452, Math.PI / 2);
    const car = vs().spawn('interceptor', 178 - 32, -452, Math.PI / 2, '#2a2a2a');
    const R = TRAILERS.box, out = {};
    try {
      S().setRamp(r.T, true);
      await api._step(Math.ceil(R.ramp.secs * 60) + 10);
      enter(car);
      await api._step(2);
      // The truck rolls at 4 m/s; the car closes on its ramp, never more than ~2 m/s faster.
      let boardAt = -1;
      for (let f = 0; f < 60 * 14 && !car.carriedBy; f++) {
        holdSpeed(r.K, 4);
        const rel = (car.vx - r.T.vx) * Math.sin(r.T.h) + (car.vz - r.T.vz) * Math.cos(r.T.h);
        g.input.down.delete('KeyW'); g.input.down.delete('KeyS');
        if (rel < 1.8) g.input.down.add('KeyW'); else if (rel > 3.5) g.input.down.add('KeyS');
        await api._step(1);
        if (car.carriedBy) boardAt = speedOf(r.T);
      }
      g.input.down.delete('KeyW'); g.input.down.delete('KeyS');
      out.boarded = !!car.carriedBy; out.boardAt = r2(boardAt);
      // Up the ramp and on into the hold, then stop against the floor (S); the door comes up behind it ([G] from the car).
      for (let f = 0; f < 60 * 10 && car.carry && car.carry.lz < R.hold.z0 + car.len / 2 + 2.5; f++) { holdSpeed(r.K, 4); g.input.down.delete('KeyW'); if (car.carry.lvz < 2) g.input.down.add('KeyW'); await api._step(1); }
      keysUp();
      for (let f = 0; f < 60; f++) { holdSpeed(r.K, 4); g.input.down.delete('KeyS'); if (car.carry && car.carry.lvz > 0.15) g.input.down.add('KeyS'); await api._step(1); if (car.carry && Math.abs(car.carry.lvz) < 0.15) break; }
      keysUp();
      await tk('KeyG');
      for (let f = 0; f < Math.ceil(R.ramp.secs * 60) + 20; f++) { holdSpeed(r.K, 5); await api._step(1); }
      out.shut = !r.T.rampDown && r.T.rampT === 0;
      // 50 km/h, then a long bend.
      let off = 0, outside = 0, low = 0, top = 0, turned = 0, prev = r.K.h, bendFrames = 0;
      for (let f = 0; f < 60 * 22; f++) {
        const sp = holdSpeed(r.K, 14, f > 60 * 4 && turned < 1.6 ? -0.34 : 0);
        if (f > 60 * 4 && turned < 1.6) bendFrames++;
        await api._step(1);
        top = Math.max(top, sp);
        turned += Math.abs(wrap(r.K.h - prev)); prev = r.K.h;
        const d = car.carry;
        if (car.carriedBy !== r.T || !d) { off++; break; }
        if (d.box[0] < R.hold.x0 - 0.01 || d.box[1] > R.hold.x1 + 0.01 || d.box[2] < R.hold.z0 - 0.01 || d.box[3] > R.hold.z1 + 0.01) outside++;
        if (Math.abs(car.y - (r.T.y + R.floorY)) > 0.25) low++;
        if (turned > 1.6 && f > 60 * 4 + bendFrames + 60) break;
      }
      Object.assign(out, { off, outside, low, top: r2(top), turned: r2(turned), damaged: r2(car.maxHp - car.hp), at: [Math.round(r.K.x), Math.round(r.K.z)] });
      // Slow to 4 m/s, drop the ramp ([G]), back down it (S) onto the road while the truck keeps rolling.
      for (let f = 0; f < 60 * 8 && speedOf(r.K) > 4.5; f++) { holdSpeed(r.K, 4); await api._step(1); }
      await tk('KeyG');
      for (let f = 0; f < Math.ceil(R.ramp.secs * 60) + 20; f++) { holdSpeed(r.K, 4); await api._step(1); }
      out.down = r.T.rampDown;
      const seq = g.eventSeq;
      for (let f = 0; f < 60 * 8 && car.carriedBy; f++) { holdSpeed(r.K, 4); g.input.down.add('KeyS'); await api._step(1); }
      g.input.down.delete('KeyS');
      for (let f = 0; f < 60; f++) { holdSpeed(r.K, 4); await api._step(1); }
      const un = g.events.find((e) => e.seq > seq && e.type === 'semiUnload' && e.vehicle === car.id);
      out.unloaded = !!un && !car.carriedBy; out.unloadSpeed = un?.speed; out.carY = r2(car.y);
      out.behind = r2(Math.hypot(car.x - r.T.x, car.z - r.T.z)); out.truckMoving = r2(speedOf(r.T));
      const ok = out.boarded && boardAt > 2.5 && out.shut && !off && !outside && !low && top > 13.3 && turned > 1.5 && out.down && out.unloaded && Math.abs(car.y) < 0.4 && out.behind > R.ramp.len + 6 && out.truckMoving > 2.5;
      return ok ? true : JSON.stringify(out);
    } finally { keysUp(); wvClean([car]); gone(r); put(); }
  }));

  await check('semis: the RV fits only the wide trailer - driven at a box trailer\'s ramp it is refused (too tall for the door) and never goes in; driven up the WIDE-LOAD LOWBOY\'s ramp it rides on the deck; a LAWMAN and a motorcycle fit the box', async () => hush(async () => {
    wvClean([]); wvReady(); const put = clearGround();
    const bad = [];
    for (const t of ['interceptor', 'bike', 'sedan']) if (fitsHold(TRAILERS.box, VEHICLES[t])) bad.push(`${t} should fit the box: ${fitsHold(TRAILERS.box, VEHICLES[t])}`);
    if (!fitsHold(TRAILERS.box, VEHICLES.rv)) bad.push('the RV fits the box');
    if (fitsHold(TRAILERS.wide, VEHICLES.rv)) bad.push(`the RV doesn't fit the wide trailer: ${fitsHold(TRAILERS.wide, VEHICLES.rv)}`);
    const out = {};
    for (const kind of ['box', 'wide']) {
      const r = rig(kind, 330, -420, -Math.PI / 2, false);
      const tip = S().tipZ(r.T), w = { x: r.T.x + Math.sin(r.T.h) * (tip - 7), z: r.T.z + Math.cos(r.T.h) * (tip - 7) };
      const rv = vs().spawn('rv', w.x, w.z, r.T.h, '#8a6a44');
      try {
        S().setRamp(r.T, true); await api._step(Math.ceil(TRAILERS[kind].ramp.secs * 60) + 10);
        enter(rv);
        const seq = g.eventSeq;
        for (let f = 0; f < 60 * 9 && !(rv.carry && rv.carry.lz > TRAILERS[kind].ramp.hinge + 4.5); f++) { ease(rv, null, 1.8); await api._step(1); }
        keysUp();
        for (let f = 0; f < 60; f++) { g.input.down.delete('KeyS'); if ((rv.carry?.lvz ?? 0) > 0.15) g.input.down.add('KeyS'); await api._step(1); }
        keysUp();
        out[kind] = { carried: rv.carriedBy === r.T, refused: g.events.some((e) => e.seq > seq && e.type === 'semiRefused' && e.vehicle === rv.id), y: r2(rv.y) };
      } finally { keysUp(); wvClean([rv]); gone(r); }
    }
    put();
    if (out.box?.carried || !out.box?.refused) bad.push(`box: ${JSON.stringify(out.box)}`);
    if (!out.wide?.carried || out.wide.y < 0.7) bad.push(`wide: ${JSON.stringify(out.wide)}`);
    return bad.length ? bad.join('; ') : true;
  }));

  await check('semis: out of the car inside the hold - F puts its driver on the trailer\'s floor beside the car (not out on the road); walking round it on held keys you never pass through it and never leave the floor; F at its door gets back in', async () => hush(async () => {
    wvClean([]); wvReady(); const put = clearGround();
    const r = rig('box', 300, -430, Math.PI / 2, false);
    const car = vs().spawn('interceptor', r.T.x, r.T.z, r.T.h, '#2a2a2a');
    try {
      S().load(car, r.T);
      enter(car); await api._step(5);
      await tk('KeyF'); await api._step(3);
      const onFloor = P().onDeck?.v === r.T, y0 = r2(P().gy);
      let inside = 0, offFloor = 0;
      const F = r.T.deck.floor;
      for (const keys of [['KeyW'], ['KeyD'], ['KeyS'], ['KeyA'], ['KeyW']]) {
        for (let f = 0; f < 70; f++) {
          for (const k of keys) g.input.down.add(k);
          await api._step(1);
          const d = P().onDeck;
          if (!d) { offFloor++; continue; }
          const b = car.carry.box;
          if (d.lx > b[0] + 0.05 && d.lx < b[1] - 0.05 && d.lz > b[2] + 0.05 && d.lz < b[3] - 0.05) inside++;
          if (d.lx < F[0] - 0.01 || d.lx > F[1] + 0.01 || d.lz < F[2] - 0.01 || d.lz > F[3] + 0.01) offFloor++;
        }
        for (const k of keys) g.input.down.delete(k);
      }
      // back to its door and in
      const b = car.carry.box, d = P().onDeck;
      if (d) { const lx = b[1] + 0.35, lz = (b[2] + b[3]) / 2; d.lx = lx; d.lz = lz; const c = Math.cos(r.T.h), s = Math.sin(r.T.h); P().x = r.T.x + lx * c + lz * s; P().z = r.T.z - lx * s + lz * c; }
      await api._step(2);
      await tk('KeyF'); await api._step(2);
      const back = P().inVehicle === car;
      return onFloor && y0 > 1.0 && !inside && !offFloor && back ? true : JSON.stringify({ onFloor, y0, inside, offFloor, back });
    } finally { wvClean([car]); gone(r); put(); }
  }));

  await check('semis: the road rules - a semi doesn\'t fit a dirt track and a wide load doesn\'t use a rural route (but both run the interstate), the RV rig is too tall for a low bridge; a wide-load freight run (pilot cars ahead and behind, escorted at its own pace) on Route 66 stops short of a beam lower than it', async () => hush(async () => {
    wvClean([]); wvReady();
    const bad = [];
    const fit = (await C('semi', { action: 'fit', trailer: 'box' })), wide = (await C('semi', { action: 'fit', trailer: 'wide', cargo: 'rv' }));
    if (fit.roads.dirt === 'fits' || fit.roads.interstate !== 'fits') bad.push(`box roads ${JSON.stringify(fit.roads)}`);
    if (wide.roads.rural === 'fits' || wide.roads.dirt === 'fits' || wide.roads.interstate !== 'fits') bad.push(`wide roads ${JSON.stringify(wide.roads)}`);
    if (wide.under.lowBridge === 'clears' || wide.under.overpass !== 'clears') bad.push(`wide under ${JSON.stringify(wide.under)}`);
    if (!(wide.dims.wid > 2 * 2.6)) bad.push(`wide load not two lanes wide (${wide.dims.wid})`);
    // The freight on Route 66 eastbound from the old town's west side, a low beam 120 m ahead of it.
    for (const v of [...g.vehicles]) if (v.x > -380 && v.x < 40 && Math.abs(v.z) < 14 && v.driver !== P()) { for (const o of [...(v.occ ?? [])]) if (o && o !== P()) g.removeChar(o); vs().remove(v); }
    await C('teleport', { x: -250, z: 30 });
    const F = S().spawnFreight('wideload', { dir: 1, near: true });
    const rigM = F.members.find((m) => m.role === 'rig'), K = rigM.v;
    const bx = K.x + 120, beam = { minX: bx, minZ: -10, maxX: bx + 1.5, maxZ: 10, tag: 'beam', height: 4.4, mark: 0, op: null, holes: null, holeX: false, sill: 0, base: 3.6, owner: null };
    g.statics.extra.push(beam); // a beam across the road 3.6 m up (the RV on the deck stands 4.2): staged, outside the island's boxes
    try {
      const seq = g.eventSeq;
      let minGap = Infinity;
      for (let f = 0; f < 60 * 25; f++) { await api._step(1); minGap = Math.min(minGap, bx - (K.x + K.len / 2)); }
      const blocked = g.events.some((e) => e.seq > seq && e.type === 'semiBlocked' && e.tractor === K.id);
      const pilots = F.members.filter((m) => m.role === 'pilot').length;
      const stopped = speedOf(K) < 1;
      if (!(blocked && stopped && minGap > 0 && pilots === 2 && K.towing?.cargo.length === 1)) bad.push(JSON.stringify({ blocked, stopped, minGap: r2(minGap), pilots, cargo: K.towing?.cargo.length, sp: r2(speedOf(K)), x: r2(K.x) }));
    } finally {
      const i = g.statics.extra.indexOf(beam); if (i >= 0) g.statics.extra.splice(i, 1);
      S().despawnFreight();
    }
    return bad.length ? bad.join('; ') : true;
  }));

  await check('semis: a convoy of semis stays under 150 draw calls - a wide-load run with its escort, two more box rigs with cars in their holds, ramps down, beside you', async () => hush(async () => {
    wvClean([]); wvReady();
    for (const v of [...g.vehicles]) if (v.x > -380 && v.x < 40 && Math.abs(v.z) < 14 && v.driver !== P()) { for (const o of [...(v.occ ?? [])]) if (o && o !== P()) g.removeChar(o); vs().remove(v); }
    await C('teleport', { x: -250, z: 18 });
    const rigs = [rig('box', -226, -3.5, Math.PI / 2, false), rig('box', -262, -3.5, Math.PI / 2, false)];
    for (const r of rigs) { const c0 = vs().spawn('sedan', r.T.x, r.T.z, r.T.h, '#4a4a48'); S().load(c0, r.T); S().setRamp(r.T, true); }
    const F = S().spawnFreight('wideload', { dir: 1, near: true });
    try {
      await api._step(120);
      const calls = (await C('perf', {})).drawCalls;
      const n = g.vehicles.filter((v) => v.tractor || v.trailer).length;
      return calls < 150 && n >= 6 && F ? true : JSON.stringify({ calls, rigs: n });
    } finally { S().despawnFreight(); for (const r of rigs) gone(r); }
  }));
  await check('semis: a rig takes the same road wear and the same mounts as any car - dust builds on the tractor and its trailer over open ground (a car in the box hold stays clean), the workshop fits a ram plate, nitrous and an oil sprayer to the LONGHAULER but no gun on its fifth-wheel point, and the oil falls behind the trailer, not under it', async () => hush(async () => {
    const back = clearGround(), L = g.look, rate0 = L.wearRate;
    const r = rig('box', SF.x0 + 40, -430, Math.PI / 2, false), car = vs().spawn('interceptor', SF.x0 + 10, -430, Math.PI / 2, '#2a2a2a');
    try {
      await api._step(5);
      const loaded = S().load(car, r.T);
      const W = g.workshop, fit = (part, face) => W.install(r.K, { part, face, n: 4, pay: false, time: false });
      const ram = fit('ram', 'front'), oil = fit('oil', 'rear'), gun = g.garage.canMount(r.K, 'rear', 'mg'), nos = W.install(r.K, { part: 'nitrous', pay: false, time: false });
      const trailerShop = g.garage.chassis(r.T);
      L.wearRate = 40;
      // The player drives (wear is laid within sight of the camera): out over the flats at a steady pace.
      enter(r.K); g.driveOverride = { throttle: 0.6, steer: 0 };
      for (let f = 0; f < 60 * 4; f++) await api._step(1);
      g.driveOverride = null; r.K.throttle = 0;
      const gK = r.K.grime ?? {}, gT = r.T.grime ?? {}, gC = car.grime ?? {};
      const dressed = !!r.K.mesh.material.userData.wear && !!r.T.mesh.material.userData.wear;
      const n0 = g.garage.hazards.length, m = r.K.mounts?.rear;
      const kind = m ? W.dropFrom(r.K, 'rear', m, MOUNT_WEAPONS[m.kind]) : null, h = g.garage.hazards[g.garage.hazards.length - 1];
      // How far behind the trailer's centre the slick lies (along the trailer's heading): past its tail, not under it.
      const behind = h ? -((h.x - r.T.x) * Math.sin(r.T.h) + (h.z - r.T.z) * Math.cos(r.T.h)) : 0;
      const out = { loaded: loaded.ok, ram: ram.ok, oil: oil.ok, gun, nos: nos.ok, trailerShop: !!trailerShop, dressed, dust: [r2(gK.dust ?? 0), r2(gT.dust ?? 0), r2(gC.dust ?? 0)], surface: gK.surface, kind, dropped: g.garage.hazards.length > n0, behind: r2(behind), tail: r2(r.T.len / 2) };
      return loaded.ok && ram.ok && oil.ok && !!gun && nos.ok && !trailerShop && dressed && gK.dust > 0.05 && gT.dust > 0.05 && (gC.dust ?? 0) === 0 && kind === 'oil' && behind > r.T.len / 2 ? true : JSON.stringify(out);
    } finally { g.driveOverride = null; if (P().inVehicle) g.exitVehicle(true); L.wearRate = rate0; if (car.carriedBy) car.carriedBy = null; gone(r); if (g.vehicles.includes(car)) vs().remove(car); back(); }
  }));
}
