// LOOK-FEEL's commands and checks (systems/lookfeel.js, data/looks.js, docs/design/WEB_LOOK_FEEL.md).
import * as THREE from 'three';
import { LOOK_REGIONS, TIME_GRADES, HORIZONS, WIND, DECALS, IMPACT, LAMPS, validateLooks, applyGrade, composeGrade, hueOf } from '../data/looks.js';
import { regionOfState, timeWeights, windOffset, WIND_UNIFORMS } from '../systems/lookfeel.js';
import { lampAt } from '../systems/lamplight.js';
import { CAMERA } from '../data/camera.js';
import { RAY_BULLET } from '../engine/collision.js';
import { outfit } from '../systems/characters.js';
import { roadLines } from '../world/city.js';
import { devtoolsCommands } from './devtools.js'; // `look` is the observer's command: look-feel answers it only when action= is given

const KIND_OF = ['skid', 'scorch', 'oil', 'bonfire', 'blood'];
const r3 = (v) => (v === null || v === undefined ? v : +(+v).toFixed(3));

// A clear strip of the Phoenix island's flats `len` m long heading +x (no box within w m of it, dry): staging for the car checks.
function clearStrip(g, len, w = 6) {
  const S = g.statics;
  for (let z = 300; z <= 430; z += 9) for (let x = -440; x + len <= 440; x += 30) {
    if (roadLines.some((c) => Math.abs(z - c) < 30)) continue; // well off the island's streets (sand, not paving; no convoy crossing)
    let ok = true;
    for (const b of S.boxes) if (b.maxX > x - 4 && b.minX < x + len && b.maxZ > z - w && b.minZ < z + w) { ok = false; break; }
    if (ok && g.water.depthAt(x, z) <= 0 && g.water.depthAt(x + len, z) <= 0) { clearCars(g, x - 6, z - w - 4, x + len + 6, z + w + 4); return { x, z }; }
  }
  return null;
}
// Parked cars in a staging box (left by earlier checks) go away first; the player's own is left out of it.
function clearCars(g, x0, z0, x1, z1) {
  for (const v of [...g.vehicles]) if (v !== g.player.inVehicle && v.x > x0 && v.x < x1 && v.z > z0 && v.z < z1) g.vehiclesSys.remove(v);
}
const mine = [];
const spawnMine = async (C, g, a) => { const r = await C('spawnVehicle', a); const v = g.vehicles.find((q) => q.id === r.id); if (v) mine.push(v); return r; };
const dropMine = (g) => { for (const v of mine.splice(0)) if (g.vehicles.includes(v)) g.vehiclesSys.remove(v); };
// The first clear strip at or north of z0.
function clearStripAt(g, len, z0) { for (let z = z0; z <= 430; z += 9) { const L = clearStripRow(g, len, z); if (L) return L; } return null; }
function clearStripRow(g, len, z, w = 6) {
  const S = g.statics;
  if (roadLines.some((c) => Math.abs(z - c) < 30)) return null;
  for (let x = -440; x + len <= 440; x += 30) {
    let ok = true;
    for (const b of S.boxes) if (b.maxX > x - 4 && b.minX < x + len && b.maxZ > z - w && b.minZ < z + w) { ok = false; break; }
    if (ok && g.water.depthAt(x, z) <= 0 && g.water.depthAt(x + len, z) <= 0) { clearCars(g, x - 6, z - w - 4, x + len + 6, z + w + 4); return { x, z }; }
  }
  return null;
}
// A building wall on the island with `run` m of open ground south of it (the car drives north, -z, into it).
function wallAhead(g, run = 34) {
  const S = g.statics;
  for (const b of S.boxes) {
    if (b.maxX - b.minX < 8 || (b.h ?? b.maxY ?? 3) < 2 || Math.abs(b.minZ) > 420 || Math.abs(b.minX) > 420) continue;
    const x = (b.minX + b.maxX) / 2, z0 = b.maxZ + 1;
    let ok = true;
    for (const o of S.boxes) if (o !== b && o.maxX > x - 3.5 && o.minX < x + 3.5 && o.minZ < z0 + run && o.maxZ > z0) { ok = false; break; }
    if (ok && g.water.depthAt(x, z0 + run) <= 0) { clearCars(g, x - 4, b.maxZ, x + 4, z0 + run + 6); return { x, z: z0 + run, wallZ: b.maxZ }; }
  }
  return null;
}

export function lookfeelCommands(api) {
  const g = api.g;
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };
  const L = () => { need(g.look, 'no look-feel system'); return g.look; };
  const obs = devtoolsCommands(api, need).look; // the observer's look (agent/devtools.js): a screenshot and what is in it
  return {
    look: {
      group: 'observe', desc: `${obs.desc} WITH action= it is LOOK-FEEL instead (docs/design/WEB_LOOK_FEEL.md, rows in src/data/looks.js): the region colour grade, the horizon rows, the wind, the history decals and the impact feel. action=grade (default): the grade in force (regions blended round the view, the time-of-day weights, the composed numbers, the 16^3 LUT and its rebuilds); x,z,hour preview the blend somewhere else without moving anything; on=false turns the pass off (true back); strength= sets the pause menu\'s Colour grade (0..1). action=region: every look row (states, grade, horizon, wind, decal mix) and which row x,z (or you) is in. action=horizon: each region\'s band row and the camera law\'s verdict (whether a horizon can ever be on screen). action=wind: the wind in force (region x weather) and how far a vertex h m up a plant (default 10) moves now. action=decals: history decal counts, the seeded stories near you, the last one laid; kind=skid|scorch|oil|bonfire|blood with x,z lays one (a history hook). action=impact: hit-stop and kick state; stop=<ms> triggers a hit-stop (testing). action=lamps: the headlamps and the torch lighting the bodies in their cones this frame (systems/lamplight.js), how much reaches x,z (chest high) and how many materials wear the layer; on=false turns the body light off (the before shot), true back. on=/strength= alone set the pass and return the grade.`,
      args: { ...obs.args, action: { type: 'string', enum: ['grade', 'region', 'horizon', 'wind', 'decals', 'impact', 'lamps'] }, hour: { type: 'number' }, on: { type: 'boolean' }, strength: { type: 'number' }, h: { type: 'number', default: 10 }, kind: { type: 'string' }, stop: { type: 'number' } },
      run: async (a) => {
        const { action, x, z, hour, on, strength, h, kind, stop } = a;
        if (!action && on === undefined && strength === undefined) return obs.run(a); // the observer's look
        const F = L(), W = g.streamer?.W;
        if (action === 'lamps') { if (on !== undefined) { F.lamps.on = on ? 1 : 0; F.lamps.update(); } const v = F.lamps.view(); if (x !== undefined && z !== undefined) v.at = { x, z, light: r3(lampAt(x, (g.player?.gy ?? 0) + 1.2, z)) }; return { ...v, rows: LAMPS }; }
        if (on !== undefined) F.on = !!on;
        if (strength !== undefined) { need(strength >= 0 && strength <= 1, 'strength 0..1'); F.settings.grade = strength; }
        if (!action || action === 'grade') {
          if (x !== undefined || z !== undefined || hour !== undefined) {
            const px = x ?? g.player.x, pz = z ?? g.player.z, hr = hour ?? g.sky.time;
            const w = F.regionWeights(px, pz, {}), G = F.gradeAt(px, pz, hr, undefined, w);
            return { at: { x: px, z: pz, hour: hr }, state: W?.stateAt?.(px, pz) ?? null, regions: Object.entries(w).filter(([, v]) => v > 0).map(([k, v]) => ({ region: k, w: r3(v) })), time: Object.fromEntries(Object.entries(timeWeights(hr, {})).map(([k, v]) => [k, r3(v)])), params: { temp: r3(G.temp), tint: r3(G.tint), sat: r3(G.sat), con: r3(G.con), gamma: r3(G.gamma), bleach: r3(G.bleach), lift: G.lift.map(r3), gain: G.gain.map(r3) } };
          }
          F.updateGrade(0, true);
          return F.view().grade;
        }
        if (action === 'region') {
          const px = x ?? g.player.x, pz = z ?? g.player.z, st = W?.stateAt?.(px, pz) ?? null;
          return { here: { state: st, region: regionOfState(st) }, rows: Object.fromEntries(Object.entries(LOOK_REGIONS).map(([k, R]) => [k, { name: R.name, states: R.states, horizon: R.horizon, wind: R.wind, decals: R.decals, grade: R.grade }])), valid: validateLooks() };
        }
        if (action === 'horizon') {
          return { law: F.horizonVisible(CAMERA), note: 'the camera law keeps the frame\'s top edge on the ground (data/camera.js thetaSum): no band is drawn while visible is false', rows: Object.fromEntries(Object.keys(LOOK_REGIONS).map((k) => [k, F.horizonOf(k)])) };
        }
        if (action === 'wind') {
          const p = g.player, u = WIND_UNIFORMS.uWind.value;
          return { ...F.view().wind, dir: [r3(u.x), r3(u.y)], time: r3(u.w), offsetAt: { h, m: r3(windOffset(WIND_UNIFORMS, h, p.x, p.z)) }, rows: WIND };
        }
        if (action === 'decals') {
          if (kind) { need(DECALS[kind]?.cell !== undefined, `kind: ${Object.keys(DECALS).filter((k) => DECALS[k]?.cell !== undefined).join('|')}`); const i = F.history(kind, x ?? g.player.x, z ?? g.player.z); return { laid: kind, slot: i }; }
          F.updateSeeds(0, true);
          return F.view().decals;
        }
        if (action === 'impact') { if (stop) F.stop(stop, 'command'); return { ...F.view().impact, rows: IMPACT }; }
        return F.view();
      },
    },
    wear: {
      group: 'vehicle', desc: 'VEHICLE WEAR (systems/lookfeel.js, rows in src/data/looks.js WEAR): dust and mud on the paint by what is under the wheels and the weather (rain washes it), scraped bright metal along walls (with sparks), the dent tint per zone, the glass. action=show (default): your car (or id=); action=clean: wash it (a garage repair does this too). dust=, mud= set them (0..1; testing, shots).',
      args: { action: { type: 'string', default: 'show', enum: ['show', 'clean'] }, id: { type: 'string' }, dust: { type: 'number' }, mud: { type: 'number' } },
      run: async ({ action, id, dust, mud }) => {
        const F = L(), v = id ? api.findVeh(id) : g.player.inVehicle ?? g.lastVehicle;
        need(v && !v.dead, 'no live vehicle (id=, or get in one)');
        F.dress(v);
        if (dust !== undefined) v.grime.dust = Math.max(0, Math.min(1, dust));
        if (mud !== undefined) v.grime.mud = Math.max(0, Math.min(1, mud));
        if (action === 'clean') F.clean(v);
        F.updateWear(0.25);
        return F.wearView(v);
      },
    },
  };
}

export async function lookfeelChecks({ g, api, C, check }) {
  const F = g.look;
  const meanAt = (w = 96) => { // the mean colour of the middle w x w px of what is on the canvas right now
    const gl = g.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(w * w * 4);
    gl.readPixels(Math.floor(W / 2 - w / 2), Math.floor(H / 2 - w / 2), w, w, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let r = 0, gg = 0, b = 0; for (let i = 0; i < px.length; i += 4) { r += px[i]; gg += px[i + 1]; b += px[i + 2]; }
    const n = px.length / 4; return [r / n, gg / n, b / n];
  };

  await check('look-feel: every look row validates, every state resolves to a region with a grade and a horizon, and no grade turns anything purple', async () => {
    const V = validateLooks();
    const legend = Object.values(g.streamer?.W?.data?.state_legend ?? {});
    const missing = legend.filter((s) => !Object.values(LOOK_REGIONS).some((R) => R.states.includes(s)));
    const unresolved = Object.keys(LOOK_REGIONS).filter((k) => !LOOK_REGIONS[k].grade || !HORIZONS[LOOK_REGIONS[k].horizon] || !F.horizonOf(k));
    // The LUT itself: every region x time of day, every one of the 4096 lattice colours that is not already purple must not
    // come out purple (hue 270-320 with any saturation to speak of).
    const o = [0, 0, 0], c = { lift: [0, 0, 0], gain: [0, 0, 0] }, N = 16; let purple = null, n = 0;
    for (const [rk, R] of Object.entries(LOOK_REGIONS)) for (const [tk, T] of Object.entries(TIME_GRADES)) {
      composeGrade(R.grade, T.grade, 1, c);
      for (let b = 0; b < N && !purple; b++) for (let gg = 0; gg < N && !purple; gg++) for (let r = 0; r < N; r++) {
        const ir = r / 15, ig = gg / 15, ib = b / 15, hi = hueOf(ir, ig, ib);
        if (hi.s > 0.06 && hi.h >= 255 && hi.h <= 335) continue; // already purple in: not the grade's doing
        applyGrade(c, ir, ig, ib, o); n++;
        const h = hueOf(o[0], o[1], o[2]);
        if (h.s > 0.08 && Math.max(o[0], o[1], o[2]) > 0.08 && h.h >= 270 && h.h <= 320) { purple = { region: rk, time: tk, in: [ir, ig, ib].map(r3), out: o.map(r3), hue: Math.round(h.h) }; break; }
      }
    }
    return V.ok && !missing.length && !unresolved.length && !purple && legend.length >= 48 ? true : JSON.stringify({ errors: V.errors.slice(0, 6), missing, unresolved, purple, probed: n, states: legend.length });
  });

  await check('look-feel: the horizon is never on screen in any view (the camera law), so no band is drawn and none is needed', async () => {
    const v = F.horizonVisible(CAMERA);
    // And the live camera agrees: at the widest, most tilted view the game allows (ANGLED close on foot), the frame's top
    // corners still meet the ground (viewRadius finds a ground point, never the far plane's sky).
    await C('camera', { view: 'ANGLED', settle: true });
    g.updateCamera(0.016);
    const cam = g.camera, d = new cam.position.constructor(), ok = [];
    for (const [nx, ny] of [[-1, 1], [1, 1]]) { d.set(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize(); ok.push(d.y < -0.05); }
    await C('camera', { view: 'TOPDOWN', settle: true });
    return !v.visible && v.aboveHorizontal < 0 && ok.every(Boolean) ? true : JSON.stringify({ law: v, topCornersOnGround: ok });
  });

  await check('look-feel: the grade blends across a state line and through dusk, and the pass changes what is on screen (+1 draw call)', async () => {
    const W = g.streamer.W, cl = W.cl;
    // Walk I-10 from Los Angeles until the look region changes (California -> the desert): the line.
    let sB = null, rPrev = regionOfState(W.stateAt(cl.x[0], cl.z[0]));
    for (let s = 0; s < cl.s[cl.n - 1]; s += 400) { const f = W.at(s), r = regionOfState(W.stateAt(f.x, f.z)); if (r !== rPrev) { sB = s; break; } rPrev = r; }
    if (sB === null) return 'no region change along I-10';
    const at = (ds) => { const f = W.at(sB + ds); return F.regionWeights(f.x, f.z, {}); };
    const a = at(-6000), m = at(0), b = at(6000);
    const ka = Object.keys(a).find((k) => a[k] > 0.99), kb = Object.keys(b).find((k) => b[k] > 0.99);
    const mixed = ka && kb && ka !== kb && m[ka] > 0.05 && m[kb] > 0.05 && m[ka] < 0.95;
    // The numbers move smoothly across: no step bigger than a fifth of the whole change, sampled every 300 m.
    let worst = 0; const f0 = W.at(sB - 6000), f1 = W.at(sB + 6000);
    const T0 = F.gradeAt(f0.x, f0.z, 12).temp, T1 = F.gradeAt(f1.x, f1.z, 12).temp; let prevT = T0;
    for (let ds = -6000; ds <= 6000; ds += 300) { const f = W.at(sB + ds), t = F.gradeAt(f.x, f.z, 12).temp; worst = Math.max(worst, Math.abs(t - prevT)); prevT = t; }
    const smooth = Math.abs(T1 - T0) > 0.01 && worst <= Math.abs(T1 - T0) * 0.25 + 1e-6;
    // Dusk: 17:00 -> 20:00 the temperature rises then the night pulls it cold, in small steps.
    let dWorst = 0, pv = F.gradeAt(0, 0, 17).temp; for (let h = 17; h <= 20.01; h += 0.1) { const t = F.gradeAt(0, 0, h).temp; dWorst = Math.max(dWorst, Math.abs(t - pv)); pv = t; }
    const tw = timeWeights(18.6, {}), dusk = tw.dusk > 0.3 && tw.day > 0.05 && tw.night > 0.05 && dWorst < 0.1;
    // On screen: Florida at noon, the pass on vs off: the mean colour moves (warmer: R - B up), and the pass is one draw call.
    await C('teleport', { town: 'meridian' }); await C('setTime', { hour: 12 }); await C('setWeather', { key: 'CLEAR', instant: true }); await api._step(20);
    const on0 = F.on, s0 = F.settings.grade;
    F.on = false; F.render(); const plain = meanAt(), callsPlain = g.renderer.info.render.calls;
    F.on = true; F.settings.grade = 1; F.updateGrade(0, true); F.render(); const graded = meanAt(), callsGraded = g.renderer.info.render.calls;
    F.on = on0; F.settings.grade = s0;
    const warm = (graded[0] - graded[2]) - (plain[0] - plain[2]);
    const onScreen = warm > 1.5 && callsGraded === callsPlain + 1;
    return mixed && smooth && dusk && onScreen ? true : JSON.stringify({ line: { s: sB, from: ka, to: kb, mid: Object.fromEntries(Object.entries(m).filter(([, v]) => v > 0).map(([k, v]) => [k, r3(v)])) }, smooth: { T0: r3(T0), T1: r3(T1), worst: r3(worst) }, dusk: { tw, dWorst: r3(dWorst) }, plain: plain.map(Math.round), graded: graded.map(Math.round), warm: r3(warm), callsPlain, callsGraded });
  });

  await check('look-feel: wind moves a tree vertex over time, a storm bends it harder, and the flora compiled with the wind', async () => {
    await C('setWeather', { key: 'CLEAR', instant: true }); await api._step(240); // the wind eases to the weather (2.5 s)
    const U = WIND_UNIFORMS, p = g.player, clearS = F.windStrength;
    const a0 = windOffset(U, 10, p.x, p.z); await api._step(45); const a1 = windOffset(U, 10, p.x, p.z);
    const moves = Math.abs(a1 - a0) > 0.003;
    const sweep = () => { const w = U.uWind.value, t0 = w.w; let m = 0; for (let t = 0; t <= 10; t += 0.05) { w.w = t; m = Math.max(m, Math.abs(windOffset(U, 10, p.x, p.z))); } w.w = t0; return m; }; // the same 10 s of wind time for both weathers
    const clearMax = sweep();
    await C('setWeather', { key: 'STORM', instant: true }); await api._step(600);
    const stormS = F.windStrength, stormMax = sweep();
    const foot = Math.abs(windOffset(U, 0, p.x, p.z)) < 1e-6; // a trunk's foot never moves
    await C('setWeather', { key: 'CLEAR', instant: true });
    // The GPU side: the flora pools wear the wind material and a program with it compiled.
    const fl = g.world.flora, kinds = Object.keys(fl.pools), patched = kinds.filter((k) => fl.pools[k].mesh.material.customProgramCacheKey().includes('wind-flora')).length;
    g.render(0.016);
    const progs = (g.renderer.info.programs ?? []).filter((pr) => String(pr.cacheKey).includes('wind-'));
    const bad = progs.filter((pr) => pr.diagnostics && pr.diagnostics.runnable === false);
    return moves && stormS > clearS * 2 && stormMax > clearMax * 2 && foot && patched === kinds.length && progs.length > 0 && !bad.length ? true
      : JSON.stringify({ a0: r3(a0), a1: r3(a1), clearS: r3(clearS), stormS: r3(stormS), clearMax: r3(clearMax), stormMax: r3(stormMax), foot, patched, kinds: kinds.length, progs: progs.length, bad: bad.length });
  });

  await check('look-feel: a hard stop lays skid decals behind the wheels, a crash into a wall freezes 40-80 ms, throws dirt on the screen and cracks the glass', async () => {
    // Up to speed on a clear strip of the flats (the island's patrols and convoys cross it: a run they hit is run again on
    // the next strip), then the brakes: a hard stop lays its skids behind the rear wheels as it goes.
    let v = null, sp = 0, b0 = null, skids = 0, last = null, tries = 0;
    for (let z0 = 340; tries < 4 && z0 <= 430; z0 += 22, tries++) {
      const L0 = clearStripAt(g, 140, z0);
      if (!L0) continue;
      if (g.player.inVehicle) g.exitVehicle(true);
      await C('teleport', { x: L0.x - 6, z: L0.z + 4 });
      const car = await spawnMine(C, g, { type: 'interceptor', x: L0.x, z: L0.z, heading: Math.PI / 2 });
      await C('enterVehicle', { id: car.id, force: true });
      v = g.player.inVehicle; const n0 = F.counts.skid, d0 = v.dmg.zones.front + v.dmg.zones.rear + v.dmg.zones.left + v.dmg.zones.right;
      for (let k = 0; k < 16 && Math.hypot(v.vx, v.vz) < 22; k++) await C('drive', { throttle: 1, seconds: 0.25 });
      sp = Math.hypot(v.vx, v.vz); b0 = { x: v.x, z: v.z };
      await C('drive', { throttle: -1, handbrake: false, seconds: 0.5 });
      skids = F.counts.skid - n0; last = F.lastDecal;
      const hit = v.dmg.zones.front + v.dmg.zones.rear + v.dmg.zones.left + v.dmg.zones.right > d0 + 0.01;
      if (sp > 18 && !hit) break;
    }
    if (!v) return 'no clear strip on the flats';
    // Laid on the braking path: within a car's width of the line from where the brakes went on to where it is now.
    const segD = (px, pz) => { const dx = v.x - b0.x, dz = v.z - b0.z, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - b0.x) * dx + (pz - b0.z) * dz) / l2)); return Math.hypot(px - b0.x - dx * t, pz - b0.z - dz * t); };
    const lastD = last ? r3(segD(last.x, last.z)) : null, path = [r3(b0.x), r3(b0.z), r3(v.x), r3(v.z)];
    const behind = last && last.kind === 'skid' && lastD < 3;
    // The crash: a wall ahead, full throttle into it, the stop measured in fixed 1/60 frames.
    g.exitVehicle(true);
    const Wl = wallAhead(g);
    if (!Wl) return JSON.stringify({ skids, sp: r3(sp), wall: null });
    await C('teleport', { x: Wl.x + 5, z: Wl.z });
    const c2 = await spawnMine(C, g, { type: 'interceptor', x: Wl.x, z: Wl.z, heading: Math.PI });
    await C('enterVehicle', { id: c2.id, force: true });
    const w = g.player.inVehicle; g.carCombat.ensure(w);
    const glass0 = w.windows ? w.windows.front.hp : null, stops0 = F.stops; F.stopT = 0; F.dirt = 0;
    let frozenFrames = 0, simDuring = 0, hitSpeed = 0, dirtMax = 0;
    for (let k = 0; k < 300 && F.stops === stops0; k++) { hitSpeed = Math.max(hitSpeed, Math.hypot(w.vx, w.vz)); await C('drive', { throttle: 1, seconds: 1 / 60 }); }
    const stopMs = F.lastStop?.ms ?? 0, t0 = g.time;
    while (F.stopT > 0 && frozenFrames < 30) { await api._step(1); frozenFrames++; dirtMax = Math.max(dirtMax, F.dirt); }
    simDuring = g.time - t0;
    const frozenMs = frozenFrames * 1000 / 60;
    const stopped = F.stops > stops0 && stopMs >= 40 && stopMs <= 80 && frozenMs >= 30 && frozenMs <= 100 && simDuring < frozenMs / 1000 * 0.1;
    const cracked = glass0 !== null && w.windows.front.hp < glass0;
    g.exitVehicle(true); dropMine(g);
    return skids >= 6 && behind && sp > 12 && stopped && dirtMax > 0.2 && cracked ? true
      : JSON.stringify({ skids, sp: r3(sp), last, lastD, path, hitSpeed: r3(hitSpeed), stop: F.lastStop, frozenFrames, simDuring: r3(simDuring), dirtMax: r3(dirtMax), glass0, glass1: w.windows?.front.hp });
  });

  await check('look-feel: a big hit freezes 40-80 ms and a small one does not; the camera kicks harder for a shotgun than an SMG', async () => {
    const p = g.player; if (p.inVehicle) g.exitVehicle(true);
    const L0 = clearStrip(g, 40); await C('teleport', { x: L0.x, z: L0.z }); await api._step(2);
    const d = g.addChar({ x: p.x + 6, z: p.z, faction: 'drifter', weapon: null, colors: outfit('drifter'), name: 'Target (look-feel)', flag: 'US', hp: 5000 }); d.hold = true;
    const s0 = F.stops, w0 = p.weapon; F.stopT = 0;
    p.weapon = 'shotgun'; g.combat.damage(d, 12, p, 1, 0, 'bullet'); const small = F.stops === s0;
    g.combat.damage(d, 48, p, 1, 0, 'bullet');
    const ms = F.lastStop?.ms ?? 0, big = F.stops === s0 + 1 && ms >= 40 && ms <= 80;
    let frames = 0; const t0 = g.time; while (F.stopT > 0 && frames < 30) { await api._step(1); frames++; }
    const frozenMs = frames * 1000 / 60, slow = g.time - t0 < frozenMs / 1000 * 0.1;
    g.removeChar(d); p.weapon = w0;
    F.kick.x = F.kick.z = 0; F.onShot(p, 'smg', 0); const kSmg = Math.hypot(F.kick.x, F.kick.z);
    F.kick.x = F.kick.z = 0; F.onShot(p, 'shotgun', 0); const kSg = Math.hypot(F.kick.x, F.kick.z);
    // The rig carries it: the camera stands off by the kick this frame.
    const cx0 = g.camera.position.z; g.updateCamera(0); const moved = Math.abs(g.camera.position.z - cx0) > 0.05 || kSg > 0;
    F.kick.x = F.kick.z = 0;
    return small && big && frozenMs >= 30 && frozenMs <= 100 && slow && kSg > kSmg * 2 && moved ? true : JSON.stringify({ small, big, ms, frames, slow, kSmg: r3(kSmg), kSg: r3(kSg) });
  });

  await check('look-feel: at night a person in front of a car is lit by its headlights (the real colours on screen, falling off with distance), one behind is not, and the torch lights who it points at', async () => {
    const p = g.player; if (p.inVehicle) g.exitVehicle(true);
    await C('setWeather', { key: 'CLEAR', instant: true }); await C('setTime', { hour: 0 });
    const L0 = clearStrip(g, 60); if (!L0) return 'no clear strip';
    await C('teleport', { x: L0.x - 6, z: L0.z + 4 });
    const car = await spawnMine(C, g, { type: 'interceptor', x: L0.x, z: L0.z, heading: Math.PI / 2 });
    await C('enterVehicle', { id: car.id, force: true });
    const v = g.player.inVehicle;
    const mk = (dx, name) => { const d = g.addChar({ x: v.x + dx, z: v.z, faction: 'drifter', weapon: null, colors: outfit('drifter'), name, flag: 'US', hp: 5000 }); d.hold = true; d.face = Math.atan2(v.x - d.x, 0); return d; };
    const near = mk(7, 'Lit (look-feel)'), far = mk(20, 'Far (look-feel)'), back = mk(-8, 'Behind (look-feel)');
    F.lamps.patch(); await api._step(12);
    const chest = (d) => lampAt(d.x, (d.gy ?? 0) + 1.2, d.z);
    const lNear = chest(near), lFar = chest(far), lBack = chest(back), head = F.lamps.view().lamps.some((l) => l.kind === 'head' && l.id === v.id);
    // On screen: the pixels over the lit man's chest with the body light on vs off (the before/after in one frame).
    const at = (d, on, w = 8) => {
      F.lamps.on = on; F.lamps.update(); F.render();
      const q = new THREE.Vector3(d.x, (d.gy ?? 0) + 1.15, d.z).project(g.camera), gl = g.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(w * w * 4);
      gl.readPixels(Math.round((q.x * 0.5 + 0.5) * W - w / 2), Math.round((q.y * 0.5 + 0.5) * H - w / 2), w, w, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0; for (let i = 0; i < px.length; i += 4) s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      return s / (w * w);
    };
    const off = at(near, 0), on = at(near, 1);
    const compiled = !!g.charR.meshes.torso.material.userData.lampCompiled && F.lamps.patched >= 6;
    // The torch: on foot, facing the man, the cone reaches him.
    g.exitVehicle(true); await C('teleport', { x: near.x - 5, z: near.z }); await api._step(6);
    p.face = Math.atan2(near.x - p.x, near.z - p.z); F.lamps.update(); // the aim follows the mouse in a frame: point it now
    const torch = F.lamps.view().lamps.some((l) => l.kind === 'torch'), lTorch = chest(near), tAt = [r3(p.x), r3(p.z), r3(near.x), r3(near.z)];
    for (const d of [near, far, back]) g.removeChar(d);
    dropMine(g); await C('setTime', { hour: 12 });
    const ok = head && lNear > 0.6 && lFar > 0 && lFar < lNear * 0.6 && lBack === 0 && on > off + 6 && on > off * 1.4 && compiled && torch && lTorch > 0.3;
    return ok ? true : JSON.stringify({ head, lNear: r3(lNear), lFar: r3(lFar), lBack: r3(lBack), off: r3(off), on: r3(on), compiled, patched: F.lamps.patched, torch, lTorch: r3(lTorch), tAt, lamps: F.lamps.view().lamps });
  });

  await check('look-feel: a site the site-story system marks as raided shows it on the ground (scorch, blood, tyre tracks), and a camp has its bonfire ring', async () => {
    const S = g.stories; if (!S?.places?.size) S?.ensure?.();
    const places = [...(S?.places?.values() ?? [])].filter((q) => !q.beyond && g.streamer.W.inWorld(q.x, q.z, -200));
    const p = places.find((q) => !q.fallen && q.kind !== 'refuge' && !q.camp) ?? null;
    if (!p) return 'no site-story place in the streamed world';
    const was = p.raidedAt;
    await C('teleport', { x: p.x + 30, z: p.z + 30 }); await api._step(2);
    p.raidedAt = S.hours(); F.updateSeeds(0, true); // staged: the state a fought raid leaves (sitestories.js battle)
    const st = F.stories.get(`site:${p.id}`), kinds = st ? st.slots.map((i) => KIND_OF[F.dKind[i] - 1]) : [];
    const near = st ? st.slots.every((i) => Math.hypot(F.dX[i] - p.x, F.dZ[i] - p.z) < 90) : false;
    const raided = !!st && kinds.includes('scorch') && kinds.includes('blood') && kinds.includes('skid') && near;
    p.raidedAt = was; F.updateSeeds(0, true);
    const gone = !F.stories.get(`site:${p.id}`);
    // A camp: the place made the way makeCamp makes it (kind refuge), its ring laid.
    const cp = S.addPlace({ id: 'refuge_lookfeel', name: 'Look-Feel Camp', kind: 'refuge', x: p.x + 60, z: p.z + 60, half: 30, holder: 'site:refuge_lookfeel', walls: 'none' });
    F.updateSeeds(0, true);
    const cs = F.stories.get('site:refuge_lookfeel'), ring = !!cs && cs.slots.some((i) => KIND_OF[F.dKind[i] - 1] === 'bonfire');
    S.places.delete('refuge_lookfeel'); F.updateSeeds(0, true);
    return raided && gone && ring ? true : JSON.stringify({ place: p.id, kinds, near, gone, ring });
  });

  await check('look-feel: a car gets dustier off-road than on the road, rain washes some off, and a garage repair cleans it', async () => {
    const L0 = clearStrip(g, 150);
    if (!L0) return 'no clear strip';
    if (g.player.inVehicle) g.exitVehicle(true);
    await C('setWeather', { key: 'CLEAR', instant: true });
    await C('teleport', { x: L0.x - 6, z: L0.z + 4 });
    const car = await spawnMine(C, g, { type: 'interceptor', x: L0.x, z: L0.z, heading: Math.PI / 2 });
    await C('enterVehicle', { id: car.id, force: true });
    const v = g.player.inVehicle; F.dress(v); F.clean(v); F.wearRate = 25;
    await C('drive', { throttle: 1, seconds: 3 });
    const offRoad = v.grime.dust, surf = v.grime.surface;
    // The same drive down an island street (paved).
    g.exitVehicle(true);
    await C('teleport', { x: -120, z: 4 });
    const car2 = await spawnMine(C, g, { type: 'interceptor', x: -100, z: 0, heading: Math.PI / 2 });
    await C('enterVehicle', { id: car2.id, force: true });
    const v2 = g.player.inVehicle; F.dress(v2); F.clean(v2);
    await C('drive', { throttle: 1, seconds: 3 });
    const onRoad = v2.grime.dust, surf2 = v2.grime.surface;
    // The material carries it (the wear program compiled), rain takes some, the garage takes all.
    g.render(0.016);
    const u = v2.mesh.material.userData.wear, inU = !!u && Math.abs(u.uWear.value.x - v2.grime.dust) < 1e-6;
    const progs = (g.renderer.info.programs ?? []).filter((pr) => String(pr.cacheKey).includes('dsoa-wear'));
    v2.grime.dust = 0.6; await C('setWeather', { key: 'RAIN', instant: true }); g.exitVehicle(true); await api._step(240);
    const washed = v2.grime.dust < 0.6;
    await C('setWeather', { key: 'CLEAR', instant: true });
    v2.grime.mud = 0.5; g.vehDamage.repair(v2); const clean = v2.grime.dust === 0 && v2.grime.mud === 0;
    F.wearRate = 1; if (g.player.inVehicle) g.exitVehicle(true); dropMine(g);
    return offRoad > onRoad * 3 && offRoad > 0.05 && surf === 'sand' && surf2 === 'road' && inU && progs.length > 0 && washed && clean ? true
      : JSON.stringify({ offRoad: r3(offRoad), onRoad: r3(onRoad), surf, surf2, inU, progs: progs.length, washed, clean });
  });
}
