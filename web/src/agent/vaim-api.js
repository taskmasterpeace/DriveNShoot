// VERTICAL AIM checks (docs/design/WEB_VERTICAL_AIM.md; systems/camrig.js aimPoint3, systems/combat.js): in the body
// views the round goes where the view's centre line lands, up and down. The trigger is the real mouse button; where
// people stand and where the view points is staged. Every check puts the view back to TOPDOWN.
import { CAMERA } from '../data/camera.js';

const r1 = (v) => Math.round(v * 10) / 10;

export async function vaimChecks({ g, api, C, check, hush }) {
  const R = g.cam, P = () => g.player, I = g.input, K = g.combat;
  const back = async () => { R.setView('TOPDOWN', true); R.override = null; I.mouseButton(0, false); g.aimOverride = null; g.updateCamera(10); await api._step(2); };
  const dummy = (x, z, gy = null) => { const c = g.addChar({ x, z, faction: 'drifter', weapon: null, hp: 400, name: 'Aim target (selftest)', flag: 'US' }); c.hold = true; c.timer = 999; if (gy !== null) { c.gy = gy; g.standOn(c); } return c; };
  const aside = () => { const p = P(), moved = []; for (const c of g.chars) if (c !== p && Math.hypot(c.x - p.x, c.z - p.z) < 60) { moved.push([c, c.x, c.z]); c.x += 400; } for (const d of g.dogs?.dogs ?? []) if (Math.hypot(d.x - p.x, d.z - p.z) < 60) { moved.push([d, d.x, d.z]); d.x += 400; } return () => { for (const [c, x, z] of moved) { c.x = x; c.z = z; } }; };
  // Point the view at (x, z) and look for the pitch whose centre line lands on a body: returns that pitch (deg) or null.
  const face = (x, z) => { const p = P(); R.orbit = Math.atan2(-(x - p.x), -(z - p.z)); };
  const settle = async () => { g.updateCamera(0.5); g.updateCamera(0.5); await api._step(2); };
  // the pitch (deg) that puts the centre line on the MIDDLE of a body (the middle of the run of pitches that land on it), or null
  const pitchOnto = async (lo, hi) => { let a = null, b = null; for (let d = lo; d <= hi; d += 1) { R.pitch = (d * Math.PI) / 180; g.updateCamera(0.5); g.updateCamera(0.5); const on = R.aimPoint3(P()).hit === 'char'; if (on) { if (a === null) a = d; b = d; } else if (a !== null) break; } if (a === null) return null; const m = Math.round((a + b) / 2); R.pitch = (m * Math.PI) / 180; await settle(); return m; };
  // four pulls of the real trigger (the first raises the gun), then what the body lost and where the last round stopped
  const shoot = async (c) => { const h0 = c.hp; K.lastStop = null; g.inv.mag.rifle = 30; P().reloading = 0; g.arms.raise?.('test'); for (let k = 0; k < 4; k++) { I.mouseButton(0, true); await api._step(3); I.mouseButton(0, false); await api._step(14); } return { lost: Math.round(h0 - c.hp), stop: K.lastStop }; };
  const arm = async () => { await C('give', { weapon: 'rifle', rifle: 90 }); await C('equip', { weapon: 'rifle' }); g.arms.raise?.('test'); await api._step(30); }; // in the hands and up (a holstered gun's first pull only draws it)

  await check('vertical aim: on open ground - in SHOULDER the round goes where the view\'s centre line lands: on a body 10 m off it is hit; with the view tipped up over its head the round passes over and it is not; tipped down at the dirt in front of you the round stops in the ground; on TOPDOWN nothing has changed (no aim height, the old flat shot hits)', async () => hush(async () => {
    await C('start'); g.godMode = true;
    let d = null, put = () => {};
    try {
      await C('teleport', { x: 0, z: -40 }); await api._step(4);
      put = aside(); await arm();
      // a clear line of 12 m from where you stand (no wall, no parked car on it)
      const p = P(); let dir = null;
      for (let a = 0; a < 16 && !dir; a++) { const dx = Math.sin(a * 0.3927), dz = Math.cos(a * 0.3927); if (g.statics.raycast(p.x, p.z, dx, dz, 14, 0, -1) >= 14 && !g.vehicles.some((v) => { const rx = v.x - p.x, rz = v.z - p.z, al = rx * dx + rz * dz; return al > -3 && al < 16 && Math.abs(rx * dz - rz * dx) < 3.5; })) dir = { dx, dz }; }
      if (!dir) return 'no clear line at the start';
      d = dummy(p.x + dir.dx * 10, p.z + dir.dz * 10);
      R.setView('SHOULDER', true); face(d.x, d.z);
      const on = await pitchOnto(-25, 15); if (on === null) return 'no pitch puts the centre line on the body';
      const hit = await shoot(d);
      R.pitch = ((on + 22) * Math.PI) / 180; await settle();
      const overAim = g.aim3?.hit, over = await shoot(d);
      R.pitch = (-40 * Math.PI) / 180; await settle();
      const dirtAim = g.aim3?.hit, dirt = await shoot(d);
      // TOPDOWN: the mouse on the body, the old way
      await back();
      const flatAim = g.aim3; g.aimOverride = { x: d.x, z: d.z }; await api._step(3);
      const flat = await shoot(d);
      const ok = hit.lost > 0 && overAim !== 'char' && over.lost === 0 && dirtAim === 'ground' && dirt.lost === 0 && dirt.stop === 'ground' && flatAim === null && flat.lost > 0 && K.A === null;
      return ok || JSON.stringify({ on, hit, overAim, over, dirtAim, dirt, flatAim: flatAim === null, flat });
    } finally { if (d) g.removeChar(d); put(); g.godMode = false; await back(); }
  }));

  await check('vertical aim: between floors - from a third-floor window of the tower a body in the street below is NOT hit with the view level (the round passes over) and IS hit when you look down at it; from the street a body at that window is NOT hit with the view level and IS hit when you look up at it; a body on the floor below you, away from the stairs, is not hit through the floor (the round stops in your floor)', async () => hush(async () => {
    await C('start'); g.godMode = true;
    const made = []; let put = () => {};
    try {
      const S = g.storeys.list.slice().sort((x, y) => y.Y.length - x.Y.length)[0], b = S.b, y2 = S.Y[2];
      await C('teleport', { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, floor: 2 }); await api._step(6);
      // a window on the north wall (the rule the window exit uses finds it)
      const p = P(); let wx = null;
      // the MIDDLE of the first window opening (the run of positions the rule accepts)
      let w0 = null, w1 = null;
      for (let a = b.minX + 1; a < b.maxX - 1 && w1 === null; a += 0.1) { p.x = a; p.z = b.minZ + 1.0; p.gy = y2; p.face = Math.PI; g.standOn(p); const F = g.windowExit.find(p); if (F && !F.blocked) { if (w0 === null) w0 = a; } else if (w0 !== null) w1 = a; }
      if (w0 !== null) wx = (w0 + (w1 ?? w0)) / 2;
      if (wx === null) return 'no window on the north wall of floor 3';
      put = aside(); await arm();
      const stand = async (x, z, gy) => { p.x = x; p.z = z; p.gy = gy; p.vx = 0; p.vz = 0; g.standOn(p); await api._step(3); };
      // 1. down from the window
      await stand(wx, b.minZ + 1.0, y2);
      const low = dummy(wx, b.minZ - 9); made.push(low);
      R.setView('THIRD', true); face(low.x, low.z); // THIRD: the lens is on your own line (the shoulder view's is half a metre to one side of a narrow window)
      R.pitch = 0; await settle();
      const levelDown = await shoot(low);
      const onDown = await pitchOnto(-55, -5), hitDown = onDown === null ? null : await shoot(low);
      g.removeChar(low); made.length = 0;
      // 2. up from the street
      await stand(wx, b.minZ - 9, 0); // you first (two bodies on one spot push each other off it)
      const high = dummy(wx, b.minZ + 1.6, y2); made.push(high); await api._step(3);
      face(high.x, high.z);
      R.pitch = 0; await settle();
      const levelUp = await shoot(high);
      const onUp = await pitchOnto(5, 60), hitUp = onUp === null ? null : await shoot(high);
      g.removeChar(high); made.length = 0;
      // 3. through the floor: you on floor 3 mid-room, a body on floor 2 under and ahead of you, far from the stairs
      const fl = S.flights, far = (x, z) => !K.nearFlight(S, x, z, 3);
      let spot = null;
      for (let x = b.minX + 3; x < b.maxX - 6 && !spot; x += 1) for (let z = b.minZ + 3; z < b.maxZ - 3 && !spot; z += 1) if (far(x, z) && far(x + 4, z)) spot = { x, z };
      let floor = 'no spot away from the stairs';
      if (spot) {
        await stand(spot.x, spot.z, y2);
        const under = dummy(spot.x + 4, spot.z, S.Y[1]); made.push(under);
        face(under.x, under.z);
        // the view's line cannot even land on them (it meets your floor first): look straight at where they are and fire
        const on = await pitchOnto(-55, -10);
        R.pitch = -Math.atan2(y2 - S.Y[1], 4); await settle();
        floor = { on, aim: g.aim3?.hit, ...(await shoot(under)), stair: K.stairLine(p, under) };
      }
      const ok = levelDown.lost === 0 && onDown !== null && hitDown.lost > 0 && levelUp.lost === 0 && onUp !== null && hitUp.lost > 0
        && typeof floor === 'object' && floor.on === null && floor.aim === 'ground' && floor.lost === 0 && floor.stair === false && floor.stop === 'ground';
      return ok || JSON.stringify({ wx: r1(wx), levelDown, onDown, hitDown, levelUp, onUp, hitUp, floor, flights: fl.length });
    } finally { for (const c of made) if (g.chars.includes(c)) g.removeChar(c); put(); g.godMode = false; await back(); await C('teleport', { x: 0, z: -40 }); await api._step(3); }
  }));

  await check('vertical aim: the rows and the stairwell rule - the aim rows are sane; two people on different floors of one building are a line only when both stand at its stairs; a body is "at the height" of a round from its feet to its head by its stance (standing, crouched, prone)', async () => {
    const A = CAMERA.body.aim3, S = g.storeys.list.slice().sort((x, y) => y.Y.length - x.Y.length)[0], f = S.flights[1] ?? S.flights[0];
    const at = (x, z, gy) => ({ x, z, gy, storey: S });
    const mid = { x: (f.minX + f.maxX) / 2, z: (f.minZ + f.maxZ) / 2 };
    let away = null; for (let x = S.b.minX + 2; x < S.b.maxX - 2 && !away; x += 1) for (let z = S.b.minZ + 2; z < S.b.maxZ - 2 && !away; z += 1) if (!K.nearFlight(S, x, z, 3)) away = { x, z };
    const both = K.stairLine(at(mid.x, mid.z, S.Y[2]), at(mid.x + 0.5, mid.z, S.Y[1]));
    const one = away ? K.stairLine(at(mid.x, mid.z, S.Y[2]), at(away.x, away.z, S.Y[1])) : null;
    const other = K.stairLine(at(mid.x, mid.z, S.Y[2]), { x: mid.x, z: mid.z, gy: 0, storey: null });
    const body = { gy: 10 };
    const h = [K.atHeight(10.9, body), K.atHeight(12.2, body), K.atHeight(9.8, body), K.atHeight(11.5, { gy: 10, crouch: true }), K.atHeight(10.4, { gy: 10, prone: true }), K.atHeight(10.9, { gy: 10, prone: true })];
    const rows = A.reach >= 20 && A.reach <= 200 && A.step > 0.2 && A.step <= 3 && A.muzzle > 1 && A.muzzle < 1.8 && A.body.prone < A.body.crouch && A.body.crouch < A.body.stand && A.stair >= 0.5 && A.stair <= 4;
    return (rows && both === true && one === false && other === false && h.join() === 'true,false,false,false,true,false') || { rows, both, one, other, h };
  });
}
