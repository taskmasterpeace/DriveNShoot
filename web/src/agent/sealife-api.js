// COMMANDS rows and selftest checks for WAVES, SEA LIFE, DIVING and WATER-PLACE (docs/design/WEB_WATER_LIFE.md §8).
// `water action=wave|current` extends the water command (agent/water-api.js answers action=depth, the default);
// `sealife` lists, spawns and inspects what lives in the water. The checks stage the real path: a boat driven, a swimmer
// wounded, a dive held, a raft on the river - and read what the systems did.
import { SEALIFE, WATER_PLACES, validateSealife } from '../data/sealife.js';
import { SWELL, WAVES, validateWaves } from '../data/waves.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

export function waveAnswer(g, action, px, pz) {
  const W = g.waves;
  if (action === 'wave') {
    const w = W.waveAt(px, pz, W.t, {});
    const boats = g.vehicles.filter((v) => v.boat && Math.hypot(v.x - px, v.z - pz) < 60).map((v) => ({ id: v.id, type: v.type, heave: r2(v.waveH ?? 0), pitch: r2(v.wavePitch ?? 0), roll: r2(v.waveRoll ?? 0), air: !!v.waveAir, felt: r2(v.waveFelt ?? 0) }));
    return { action, x: r1(px), z: r1(pz), kind: w.kind, depth: r2(w.depth), amp: r2(w.amp), height: r2(w.h), slope: [r2(w.sx), r2(w.sz)], pinch: r2(w.j), breaking: w.j < WAVES.whitecap, rising: r2(w.vy), sea: r2(W.sea), boats, ...W.summary() };
  }
  const c = W.currentAt(px, pz, {});
  return { action, x: r1(px), z: r1(pz), current: { vx: r2(c.vx), vz: r2(c.vz), speed: r2(c.speed), heading: c.speed > 0 ? r2(Math.atan2(c.vx, c.vz)) : null } };
}

export function sealifeCommands(api, need) {
  const g = api.g, S = () => g.sealife, P = () => g.player;
  return {
    sealife: {
      group: 'world',
      desc: `What lives in the water (data/sealife.js; systems/sealife.js; docs/design/WEB_WATER_LIFE.md). action=list (default): every creature - species, state (cruise | investigate | search | circle | strike | flee; the deep one: patrol | rise | reach | hold | sink | away), depth, whether its fin is up, how its shape shows from above (alpha, blur), what it last sensed and how long ago. action=near: within r= (default 80) of you, nearest first. action=spawn species=<${Object.keys(SEALIFE).join('|')}> at x,z (default: out of the camera's view, in water it can live in). action=places: THE DEEP WATER, THE DROWNED BLOCKS, GULL KEY and the ferries. action=stim kind=blood|splash|shot str= at x,z: put a sense in the water (testing). action=dive: the diver's view (darkness, the clear circle, gasps). on=false/true switches the creatures (spawning=false: the director rolls nothing).`,
      args: { action: { type: 'string', enum: ['list', 'near', 'spawn', 'places', 'stim', 'dive'], default: 'list' }, species: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' }, r: { type: 'number', default: 80 },
        kind: { type: 'string', enum: ['blood', 'splash', 'kick', 'engine', 'shot'] }, str: { type: 'number', default: 1 }, on: { type: 'boolean' }, spawning: { type: 'boolean' } },
      run: async ({ action = 'list', species, x, z, r = 80, kind, str = 1, on, spawning }) => {
        const sl = S();
        need(sl, 'no sea life system');
        if (on !== undefined) sl.enabled = !!on;
        if (spawning !== undefined) sl.spawning = !!spawning;
        const p = P(), px = p.inVehicle?.x ?? p.x, pz = p.inVehicle?.z ?? p.z;
        if (action === 'places') return g.waterplace.summary();
        if (action === 'dive') return { ...g.diving.view(), diveDepth: r2(p.diveD ?? 0), breath: r2(p.breath ?? 1), underwater: !!p.underwater, muffleHz: g.audio?.muffleHz ?? 0 };
        if (action === 'stim') {
          need(kind, 'kind= blood | splash | kick | engine | shot');
          const sx = Number.isFinite(x) ? x : px, sz = Number.isFinite(z) ? z : pz;
          sl.stimulus(sx, sz, kind, str, null);
          return { put: { kind, x: r1(sx), z: r1(sz), str } };
        }
        if (action === 'spawn') {
          need(SEALIFE[species], `unknown species ${species}; one of ${Object.keys(SEALIFE).join(', ')}`);
          const Sp = SEALIFE[species];
          let sx = x, sz = z;
          if (!Number.isFinite(sx) || !Number.isFinite(sz)) {
            for (let k = 0; k < 60; k++) {
              const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 120, tx = px + Math.sin(a) * d, tz = pz + Math.cos(a) * d, w = g.waves.kindAt(tx, tz);
              if (!sl.inView(tx, tz) && w.kind && Sp.waters.includes(w.kind) && w.depth >= (Sp.minDepth ?? 0)) { sx = tx; sz = tz; break; }
            }
            need(Number.isFinite(sx), `no water for a ${species} near you out of view (it lives in ${Sp.waters.join(', ')}, ${Sp.minDepth ?? 0} m deep)`);
          }
          const place = Sp.form === 'leviathan' ? (g.waterplace.resolve() ?? []).find((q) => q.species === species) : null;
          const a = sl.spawn(species, sx, sz, place ? { place, hx: place.x, hz: place.z, r: place.r } : {});
          return { spawned: sl.view(a), inView: sl.inView(sx, sz) };
        }
        let list = sl.live.map((a) => ({ ...sl.view(a), dist: Math.round(Math.hypot(a.x - px, a.z - pz)) }));
        if (action === 'near') list = list.filter((a) => a.dist <= r).sort((a, b) => a.dist - b.dist);
        return { ...sl.summary(), creatures: list, drawn: sl.r?.counts ?? null, problems: validateSealife() };
      },
    },
  };
}

// ---- the checks ------------------------------------------------------------------------------------------------------
export async function sealifeChecks(api, check, C) {
  const g = api.g, sl = g.sealife, W = g.waves;
  if (!sl || !W) { await check('sealife: the water life systems exist', async () => 'no g.sealife / g.waves'); return; }
  const was = { en: sl.enabled, sp: sl.spawning };
  const home = async () => {
    const v = g.player.inVehicle;
    if (v) { g.exitVehicle(true); g.vehiclesSys.remove(v); }
    if (g.player.onDeck) g.decks.dismount(g.player, 'walked', true);
    g.crouchOverride = null; g.driveOverride = null;
    await C('teleport', { x: 0, z: -40 });
  };
  const clear = () => { for (const a of [...sl.live]) sl.remove(a); for (const s of sl.stim) s.kind = null; };
  const quiet = () => { const w = { z: g.zombies.enabled, r: g.raiderTimer }; g.zombies.enabled = false; g.raiderTimer = 1e9; return () => { g.zombies.enabled = w.z; g.raiderTimer = w.r; }; };
  const restoreQ = quiet();
  // Open sea off Meridian (Florida's Atlantic): nine metres of water 600 m out.
  const H = g.streamer?.W?.holdouts?.find((h) => h.id === 'meridian'), FL = g.streamer?.W?.regions?.florida;
  const sh = FL && H ? FL.shoreAt(H.cz) : null;
  const SEA = sh ? { x: sh.x + 650, z: H.cz } : null;
  const heal = () => { g.player.hp = g.player.maxHp; g.player.alive = true; g.player.breath = 1; };
  let arrived = false; // the first jump to Florida: let its chunks stream in before anything is staged on the water
  const atSea = async (dx = 0, dz = 0) => { await C('teleport', { x: SEA.x + dx, z: SEA.z + dz }); await C('setWeather', { key: 'CLEAR', instant: true }); await C('step', { seconds: arrived ? 0.3 : 2.5 }); arrived = true; heal(); };
  const boatAt = async (type, x, z, h) => { const r = await C('spawnVehicle', { type, x, z, heading: h }); return g.vehicles.find((v) => v.id === r.id); };
  try {
    sl.enabled = true; sl.spawning = false; clear();
    await check('water: the rows are valid (validateWaves, validateSealife: no purple, the deep one is announced), waveAt is a pure function of place and time, and the island river runs downstream', async () => {
      const bad = [...validateWaves({ SWELL, WAVES }), ...validateSealife()];
      if (!SEA) bad.push('no Florida sea');
      const a = W.waveAt(SEA.x, SEA.z, 12.5, {}), b = W.waveAt(SEA.x, SEA.z, 12.5, {}), c = W.waveAt(SEA.x, SEA.z, 14, {});
      if (a.h !== b.h || a.kind !== 'ocean' || !(a.amp > 0.3) || a.h === c.h) bad.push(`waveAt ${JSON.stringify({ a: a.h, b: b.h, c: c.h, kind: a.kind, amp: a.amp })}`);
      const cur = W.currentAt(416, -150, {}), lake = W.currentAt(390, 398, {}), dry = W.waveAt(0, -40, 1, {});
      if (!(cur.vz > 0.3) || lake.speed !== 0 || dry.kind !== null) bad.push(`current ${JSON.stringify({ cur, lake: lake.speed, dry: dry.kind })}`);
      return bad.length ? JSON.stringify(bad.slice(0, 6)) : true;
    });

    await check('water: a boat\'s heave, pitch and roll follow waveAt under its hull (the gunboat on the open sea rises and falls with the swell)', async () => {
      await atSea();
      const v = await boatAt('gunboat', SEA.x + 10, SEA.z, 0);
      for (let i = 0; i < 10 && v.waveH === undefined; i++) await C('step', { seconds: 0.3 });
      const bad = [], hs = [];
      for (let i = 0; i < 12; i++) {
        await C('step', { seconds: 0.35 });
        const L = v.len * WAVES.ride.sample, fx = Math.sin(v.h), fz = Math.cos(v.h);
        const hb = W.waveAt(v.x + fx * L, v.z + fz * L, W.t, {}).h, hst = W.waveAt(v.x - fx * L, v.z - fz * L, W.t, {}).h;
        const pitch = Math.atan2(hb - hst, 2 * L) - Math.min(0.12, Math.hypot(v.vx, v.vz) * 0.004);
        if (Math.abs(pitch - v.wavePitch) > 0.03) bad.push(`pitch ${r2(pitch)} vs ${r2(v.wavePitch)}`);
        const base = g.water.surfaceAt(v.x, v.z, 0) - 0.18 + v.waveH;
        if (Math.abs(v.group.position.y - base) > 0.25) bad.push(`heave y ${r2(v.group.position.y)} vs ${r2(base)}`);
        hs.push(v.waveH);
      }
      const span = Math.max(...hs) - Math.min(...hs);
      g.vehiclesSys.remove(v);
      if (!(span > 0.15)) bad.push(`the hull barely moved: heave span ${r2(span)}`);
      return bad.length ? JSON.stringify(bad.slice(0, 5)) : true;
    });

    await check('water: a wake trails a moving boat (foam puffs behind its track, none ahead of it) and a waterbike leaves a crest in the air', async () => {
      await atSea(0, 60);
      const v = await boatAt('jetski', SEA.x, SEA.z + 60, Math.PI / 2);
      await C('enterVehicle', { id: v.id, force: true });
      const air0 = W.stats.airs;
      await C('drive', { throttle: 1, seconds: 4 });
      const P = W.pf, fx = Math.sin(v.h), fz = Math.cos(v.h);
      let behind = 0, ahead = 0;
      for (let i = 0; i < P.life.length; i++) {
        if (P.life[i] <= 0) continue;
        const along = (P.x[i] - v.x) * fx + (P.z[i] - v.z) * fz, side = Math.abs((P.x[i] - v.x) * fz - (P.z[i] - v.z) * fx);
        if (along < -1 && along > -120 && side < 20) behind++; else if (along > 6 && side < 6) ahead++;
      }
      await C('drive', { throttle: 1, steer: 0.05, seconds: 6 });
      const airs = W.stats.airs - air0, alive = W.pAlive;
      g.exitVehicle(true); g.vehiclesSys.remove(v);
      return behind >= 20 && ahead === 0 && alive > 0 && airs >= 1 ? true : JSON.stringify({ behind, ahead, alive, airs, speed: r1(Math.hypot(v.vx, v.vz)) });
    });

    await check('water: a swimmer\'s view darkens and closes in with depth, the sound goes thick, breath drains faster deeper, and coming up short of air you gasp', async () => {
      await atSea(0, -40);
      const p = g.player;
      g.crouchOverride = true;
      await C('step', { seconds: 1.2 });
      const a = { dark: g.diving.dark, r: g.diving.radius, d: p.diveD, b: p.breath, mu: g.audio?.muffleHz ?? 0 };
      await C('step', { seconds: 4 });
      const b = { dark: g.diving.dark, r: g.diving.radius, d: p.diveD, b: p.breath, mu: g.audio?.muffleHz ?? 0 };
      await C('step', { seconds: 6 });
      const gasps0 = g.diving.gasps, breathAtTop = p.breath;
      g.crouchOverride = false;
      await C('step', { seconds: 2 });
      const c = { dark: g.diving.dark, d: p.diveD, gasped: g.diving.gasps - gasps0, mu: g.audio?.muffleHz ?? 0 };
      g.crouchOverride = null; heal();
      const ok = p.underwater === false && b.d > a.d + 2 && b.dark > a.dark + 0.15 && b.r < a.r && a.b - b.b > 0.15 && a.mu > 0 && b.mu < a.mu && c.dark < 0.05 && c.mu === 0 && (breathAtTop >= 0.7 || c.gasped === 1);
      return ok ? true : JSON.stringify({ a, b, c, breathAtTop: r2(breathAtTop) });
    });

    await C('god', { on: false });
    await check('sealife: a shark is drawn to blood within its smell range and not from beyond it (a still, wounded swimmer: no splash, nothing in sight)', async () => {
      const S = SEALIFE.shark, out = [];
      for (const [d, want] of [[S.smell * 1.6, false], [S.smell * 0.6, true]]) {
        await atSea(0, -120); clear();
        const p = g.player, a = sl.spawn('shark', p.x + d, p.z, { h: 0, hx: p.x + d + 40, hz: p.z, r: 30 });
        await C('step', { seconds: 0.5 });
        g.combat.damage(p, 14, null, 0, 0, 'bullet');
        let drawn = false, kinds = [];
        for (let i = 0; i < 8 && !drawn; i++) { await C('step', { seconds: 1 }); kinds.push(a.mem.kind); drawn = a.mem.kind === 'blood' && (a.state === 'investigate' || a.state === 'circle' || a.state === 'search'); }
        out.push({ d: Math.round(d), want, drawn, state: a.state, kinds: [...new Set(kinds)], hp: Math.round(p.hp) });
        heal();
      }
      clear();
      return out.every((o) => o.drawn === o.want) ? true : JSON.stringify(out);
    });
    await check('sealife: a shark circles a swimmer it has found, then strikes; its bite draws blood; shot near the surface it bleeds and flees', async () => {
      await atSea(0, -200); clear();
      const p = g.player, a = sl.spawn('shark', p.x + 6, p.z + 6, { h: 0, hx: p.x, hz: p.z, r: 20 });
      const seen = new Set(); let bit = 0;
      for (let i = 0; i < 26 && !bit; i++) { await C('step', { seconds: 1 }); seen.add(a.state); bit = sl.stats.bites; heal(); }
      const bites = sl.stats.bites;
      // Shoot it at the surface: the water eats part of each round, enough of them and it runs.
      for (let k = 0; k < 14 && !a.dead && a.state !== 'flee'; k++) { sl.hurt(a, 30, p, 1, 0, 'bullet'); await C('step', { seconds: 0.1 }); }
      const ok = seen.has('circle') && bites > 0 && (a.state === 'flee' || a.dead) && a.hp < a.maxHp;
      clear(); heal();
      return ok ? true : JSON.stringify({ seen: [...seen], bites, state: a.state, hp: a.hp });
    });
    await C('god', { on: true }); // the battery runs in god mode

    await check('sealife: a cruising shark shows its fin above the surface and its silhouette under it (drawn: one fin, one shape, dark enough to read)', async () => {
      await atSea(0, -260); clear();
      const p = g.player, a = sl.spawn('shark', p.x + 8, p.z + 4, { h: 1, hx: p.x + 30, hz: p.z + 30, r: 40 });
      a.target = null; await C('step', { seconds: 0.6 });
      const v = sl.view(a), R = sl.r, m = R.fin, M = R.sil;
      let finY = -9;
      if (R.counts.fin) { const e = m.instanceMatrix.array; finY = e[13]; }
      const surf = g.water.surfaceAt(a.x, a.z, 0) + W.sheetAt(a.x, a.z);
      const ok = v.finUp && R.counts.fin >= 1 && finY > surf - 0.2 && R.counts.sil >= 1 && M.visible && v.shape.alpha > 0.55;
      clear();
      return ok ? true : JSON.stringify({ v, fins: R.counts.fin, sil: R.counts.sil, finY: r2(finY), surf: r2(surf) });
    });

    const place = (g.waterplace.resolve() ?? []).find((q) => q.kind === 'leviathan');
    await check('sealife: THE DEEP ONE is announced - its shape is under you, growing, for its whole rise before an arm reaches; a swimmer held is hurt and let go of', async () => {
      if (!place) return 'no leviathan place';
      await C('teleport', { x: place.x, z: place.z }); heal(); clear();
      const S = SEALIFE.leviathan, p = g.player;
      const a = sl.spawn('leviathan', place.x + 55, place.z + 30, { place, hx: place.x, hz: place.z, r: place.r });
      sl.stimulus(p.x, p.z, 'splash', 1.2, p);
      let minA = 1, riseFrames = 0, armsBefore = 0;
      for (let i = 0; i < 70 && !sl.lastGrab; i++) {
        await C('step', { seconds: 0.4 }); heal();
        if (a.state === 'rise') { riseFrames++; minA = Math.min(minA, a.alphaLog ?? 0); }
        if (!sl.lastGrab && a.arms > 0.3 && a.state !== 'reach') armsBefore++;
      }
      const G = sl.lastGrab;
      for (let i = 0; i < 25 && a.state === 'hold'; i++) { await C('step', { seconds: 0.5 }); heal(); }
      const ok = G && !G.boat && G.riseSecs >= S.rise && riseFrames * 0.4 >= S.rise - 0.5 && minA > 0.3 && armsBefore === 0 && a.state !== 'hold';
      clear(); heal();
      return ok ? true : JSON.stringify({ G, riseFrames, minA: r2(minA), armsBefore, state: a.state });
    });

    await check('sealife: an airboat outruns THE DEEP ONE to shallow water (it rises under the engine, the boat runs for the shore, it never gets a grip)', async () => {
      if (!place) return 'no leviathan place';
      await C('teleport', { x: place.x, z: place.z }); heal(); clear();
      const v = await boatAt('airboat', place.x, place.z, -Math.PI / 2);
      await C('enterVehicle', { id: v.id, force: true });
      const a = sl.spawn('leviathan', place.x + 55, place.z, { place, hx: place.x, hz: place.z, r: place.r }); // within earshot of an idling engine
      const grabs0 = sl.stats.grabs, seen = new Set();
      await C('drive', { throttle: 0.35, seconds: 3 }); seen.add(a.state);
      for (let i = 0; i < 10; i++) { await C('drive', { throttle: 1, seconds: 3 }); seen.add(a.state); }
      const depth = g.water.depthAt(v.x, v.z, false, -Infinity), off = Math.hypot(v.x - place.x, v.z - place.z);
      const ok = sl.stats.grabs === grabs0 && seen.has('rise') && (depth < SEALIFE.leviathan.minDepth || off > place.r + 30) && (a.state === 'sink' || a.state === 'patrol') && !v.sunk;
      g.exitVehicle(true); g.vehiclesSys.remove(v); clear();
      return ok ? true : JSON.stringify({ grabs: sl.stats.grabs - grabs0, seen: [...seen], state: a.state, depth: r2(depth), off: Math.round(off), sunk: !!v.sunk });
    });

    await check('water: a raft carries a standing rider down a river\'s current (the island\'s Colorado Remnant): the raft drifts downstream, the rider stays on its deck and goes with it', async () => {
      await home();
      await C('teleport', { x: 412, z: -140 });
      const v = await boatAt('raft', 417, -140, Math.PI / 2);
      await C('step', { seconds: 0.3 });
      await C('deck', { id: v.id, mount: 'player', lx: 0, lz: 0.5, force: true });
      const z0 = v.z, pz0 = g.player.z;
      await C('step', { seconds: 8 });
      const on = g.player.onDeck?.v === v, dz = v.z - z0, pdz = g.player.z - pz0;
      g.decks.dismount(g.player, 'walked', true); g.vehiclesSys.remove(v);
      await home();
      return on && dz > 3 && Math.abs(pdz - dz) < 1.2 ? true : JSON.stringify({ on, dz: r2(dz), pdz: r2(pdz) });
    });

    await check('sealife: nothing spawns in view - the director puts every creature out past the camera\'s view, over water it can live in', async () => {
      await atSea(0, 300); clear();
      sl.spawning = true;
      const before = sl.stats.spawned, bad = [];
      const seen = [];
      for (let i = 0; i < 6; i++) { sl.tickT = 0; await C('step', { seconds: 0.5 }); for (const a of sl.live) if (!seen.includes(a)) { seen.push(a); if (sl.inView(a.x, a.z, 0) && a.born > sl.t - 0.6) bad.push({ id: a.id, x: Math.round(a.x), z: Math.round(a.z) }); } }
      sl.spawning = false;
      const n = sl.stats.spawned - before;
      clear();
      return n >= 2 && !bad.length ? true : JSON.stringify({ spawned: n, inView: bad.slice(0, 3) });
    });

    await check('water: the water places stand where their rows put them - THE DROWNED BLOCKS\' walls stop a boat, GULL KEY is dry ground in calm water, a cable ferry shuttles the river', async () => {
      const P = g.waterplace.resolve() ?? [], fl = P.find((q) => q.kind === 'flooded'), key = P.find((q) => q.kind === 'ruins');
      const bad = [];
      if (!fl || !key || P.length !== WATER_PLACES.length) return JSON.stringify({ places: P.map((q) => q.id) });
      await C('teleport', { x: key.x, z: key.z }); await C('step', { seconds: 0.5 });
      if (g.water.depthAt(key.x, key.z) !== 0 || g.water.stateAt(key.x, key.z) !== 'dry') bad.push('the key is wet');
      if (!(W.waveAt(key.x + key.r * 0.5, key.z, W.t, {}).amp < 0.02)) bad.push('waves on the key');
      await C('teleport', { x: fl.x, z: fl.z - fl.d / 2 - 40 }); await C('step', { seconds: 0.5 });
      if (!fl.built || !(fl.boxes?.length >= 6)) bad.push(`blocks not built: ${fl.boxes?.length}`);
      else {
        const b = fl.boxes[0], cx = (b.minX + b.maxX) / 2, cz = b.minZ - 12;
        const v = await boatAt('airboat', cx, cz, 0);
        await C('enterVehicle', { id: v.id, force: true });
        await C('drive', { throttle: 1, seconds: 3 });
        if (v.z > b.minZ + 0.5 && v.x > b.minX && v.x < b.maxX) bad.push(`the airboat drove into a drowned wall (z ${r1(v.z)} > ${r1(b.minZ)})`);
        g.exitVehicle(true); g.vehiclesSys.remove(v);
      }
      // The ferry: near the island river it comes, crosses and lands.
      g.waterplace.enabled = true;
      await home(); await C('teleport', { x: 395, z: -250 });
      let trips = 0, F = null;
      for (let i = 0; i < 14 && trips < 1; i++) { await C('step', { seconds: 2 }); F = g.waterplace.ferries[0]; trips = F?.trips ?? 0; }
      if (!F?.v || trips < 1) bad.push(`ferry trips ${trips}`);
      if (F?.v) { g.vehiclesSys.remove(F.v); F.v = null; }
      g.waterplace.enabled = false;
      await home();
      return bad.length ? JSON.stringify(bad) : true;
    });
  } finally {
    sl.enabled = was.en; sl.spawning = was.sp; clear(); restoreQ();
    g.crouchOverride = null;
    await home();
  }
}
