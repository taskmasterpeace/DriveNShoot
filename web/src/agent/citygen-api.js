// PROCEDURAL CITIES for agents (docs/design/WEB_CITYGEN.md): the `citygen`, `site`, `overrun` and `cover` commands (the
// `horde` command's size=/toward= raise a migrating horde: agent/api.js), and the selftest's citygen checks (run inside
// runSelfTest with its check() and command caller; every check returns true or a JSON diagnostic).
import { ARCHETYPES, RURAL, KINDS, ROADS, MILITARY, OVERRUN, MAJOR_CITIES, validateCitygen } from '../data/citygen.js';
import { SITES, SITES_BY_ID, validateSites as validateSiteRows } from '../data/sites/index.js';
import { layoutTown } from '../world/citygen/layout.js';
import { layoutSite, validateSites, kindOf, respectful } from '../world/citygen/site.js';
import { buildTown } from '../world/citygen/build.js';
import { auditTown, TownProbe, auditBuilding } from '../world/citygen/audit.js';
import { genLevel } from '../world/undergen.js';
import { outfit } from '../systems/characters.js';

const r1 = (v) => Math.round(v * 10) / 10;
const xzOf = (at, x, z) => { if (at) { const [a, b] = at.split(',').map(Number); return [a, b]; } return [x, z]; };

// A free patch of the streamed world near (x, z) for a stamp of half-size `half`: in the world, dry, off every corridor,
// clear of the island, the plan's settlements and its exits.
export function freeSpot(g, x, z, half = 260) {
  const W = g.streamer.W, CG = g.citygen;
  const cors = [W.i10, ...Object.values(W.regions ?? {}).flatMap((R) => R.corridors ?? [])].filter(Boolean);
  for (let ring = 0; ring < 30; ring++) for (let k = 0; k < Math.max(1, ring * 6); k++) {
    const a = (k / Math.max(1, ring * 6)) * Math.PI * 2, px = Math.round(x + Math.cos(a) * ring * 400), pz = Math.round(z + Math.sin(a) * ring * 400);
    if (!W.inWorld(px, pz, -half - 200) || Math.hypot(px, pz) < 2400 + half) continue;
    if (cors.some((c) => (c.project?.(px, pz, half + 200)?.d ?? Infinity) < half + 150)) continue;
    if (CG.plan.some((r) => Math.abs(r.x - px) < r.half + half + 60 && Math.abs(r.z - pz) < r.half + half + 60)) continue;
    let wet = false; for (const [dx, dz] of [[0, 0], [-half, -half], [half, -half], [-half, half], [half, half]]) if ((W.depthAt?.(px + dx, pz + dz, 0) ?? 0) > 0.05) wet = true;
    if (wet) continue;
    return { x: px, z: pz };
  }
  return null;
}

export function citygenCommands(api, need) {
  const g = api.g, P = () => g.player;
  const CG = () => g.citygen;
  // stand the chunks a stamp covers anew (their wild scatter keeps off it now: world/chunkgen.js asks citygen.solid)
  const relay = (rec) => { const S = g.streamer; if (!S) return; for (let cx = Math.floor((rec.x - rec.half) / 256); cx <= Math.floor((rec.x + rec.half) / 256); cx++) for (let cz = Math.floor((rec.z - rec.half) / 256); cz <= Math.floor((rec.z + rec.half) / 256); cz++) { const k = `${cx},${cz}`; if (!S.pinned?.has(k)) S.evict(k); } };
  const view = (t) => CG().liveView(t);
  return {
    citygen: {
      group: 'world', budget: 120,
      desc: 'Procedural cities and buildings (docs/design/WEB_CITYGEN.md; rows in data/citygen.js: 26 city archetypes over 19 biomes, 35 building kinds, 8 road rows, 7 rural homesteads, the military base + vault). No args: the plan (every settlement the country holds: towns by archetype, homesteads, sites, bases), what is built now (live: buildings, storeyed, tallest, drive-ins, roofs, escapes, bridges, wall, loot, cover, residents, infestation) and the hordes. action=stamp archetype=<id> seed= at="x,z" (or x,z; default a free spot near you) [biome= walls= size= defense=]: stamp a city anywhere, pinned until action=remove id=. action=info id= (or x,z): one settlement, its buildings (kind, storeys, levels, roof, bays, escape, claimable). action=audit id= (default every live one): the walkability audit (every floor of every storeyed building reached on foot from its front door, every bay driven in and through by a car). action=claim x= z=: take the claimable building there as your home (the deed hook). action=marks: every settlement for the map (holding / overrun / retaken). action=release id=: tear one down now (it rebuilds when you come near).',
      args: { action: { type: 'string', default: 'list', enum: ['list', 'stamp', 'info', 'audit', 'remove', 'release', 'claim', 'marks'] }, archetype: { type: 'string' }, rural: { type: 'string' }, base: { type: 'boolean' }, seed: { type: 'number', default: 1 }, at: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' },
        id: { type: 'string' }, biome: { type: 'string' }, walls: { type: 'string' }, size: { type: 'number' }, defense: { type: 'number' }, teleport: { type: 'boolean', default: false } },
      run: async ({ action, archetype, rural, base, seed, at, x, z, id, biome, walls, size, defense, teleport }) => {
        const C = CG();
        [x, z] = xzOf(at, x, z);
        if (action === 'list') return C.status();
        if (action === 'marks') return { marks: C.marks() };
        if (action === 'stamp') {
          need(archetype ? ARCHETYPES[archetype] : rural ? RURAL[rural] : base, `archetype= one of ${Object.keys(ARCHETYPES).join(', ')} (or rural=${Object.keys(RURAL).join('|')}, or base=true)`);
          if (x === undefined) { const s = freeSpot(g, P().x, P().z, (ARCHETYPES[archetype]?.sizeM[1] ?? 300) / 2 + 40); need(s, 'no free ground near you (give at=x,z)'); x = s.x; z = s.z; }
          const t = C.stampAt({ arch: archetype ?? rural ?? 'military_base', rural, base, seed, x, z, biome, walls, size, defense, id });
          relay(t.rec);
          if (teleport) await api.call('teleport', { x: t.rec.x, z: t.rec.z + (t.T.z1 - t.T.z0) / 2 + 20 });
          return view(t);
        }
        if (action === 'remove') { need(id, 'id='); return { removed: C.remove(id) }; }
        if (action === 'release') { need(id && C.live.has(id), 'id= of a live settlement'); C.release(id); return { released: id }; }
        if (action === 'claim') { const R = C.buildingAt(x ?? P().x, z ?? P().z); need(R, 'no generated building there'); need(R.B.claimable, `${R.B.name} is not a home you can claim`); return { claimed: C.claim(R), building: R.B.id, kind: R.B.kind }; }
        const t = id ? C.live.get(id) : [...C.live.values()].find((q) => x !== undefined && Math.abs(q.rec.x - x) < q.rec.half && Math.abs(q.rec.z - z) < q.rec.half) ?? [...C.live.values()][0];
        if (action === 'audit') {
          const list = id ? [t] : [...C.live.values()];
          need(list.length && list[0], 'nothing built (stamp one, or go near one)');
          return { audits: list.map((q) => auditTown(q.built, q.T)) };
        }
        need(t, 'no such live settlement');
        return { ...view(t), buildings: t.built.blds.map((R) => ({ id: R.B.id, kind: R.B.kind, zone: R.B.zone, x: r1((R.B.x0 + R.B.x1) / 2), z: r1((R.B.z0 + R.B.z1) / 2), storeys: R.B.n, levels: R.S ? R.S.Y.map(r1) : [0], roof: !!(R.S && R.S.n === R.B.n), ruined: R.B.ruined, bays: R.B.doors.filter((d) => d.kind === 'bay').map((d) => `${d.side}@${d.at}`), escape: R.E ? R.B.escape?.side : null, claimable: R.B.claimable, owner: R.B.owner ?? null, hero: R.B.hero ?? null })) };
      },
    },
    site: {
      group: 'world', budget: 60,
      desc: 'SITE rows (docs/design/WEB_LOCATION_BIBLE.md §3.1; data/sites/*.js): the real places built small. No args: every row (id, our name, the real place, state, layout, kind) and the rows check. id=<row> at="x,z" (default a free spot near you): stamp that site there (its layout, footprint, walls, hero structures; a military row brings its vault), pinned until citygen action=remove.',
      args: { id: { type: 'string' }, at: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' }, seed: { type: 'number', default: 1 }, teleport: { type: 'boolean', default: false } },
      run: async ({ id, at, x, z, seed, teleport }) => {
        if (!id) return { check: validateSites(SITES), sites: SITES.map((s) => ({ id: s.id, name: s.name, real: `${s.real.place}, ${s.real.state}`, layout: s.layout, kind: s.kind, footprint: s.footprint })), placed: CG().plan.filter((r) => r.kind === 'site').map((r) => ({ id: r.id, site: r.site, x: r.x, z: r.z })) };
        const row = SITES_BY_ID.get(id);
        need(row, `no site "${id}" (site lists them)`);
        [x, z] = xzOf(at, x, z);
        if (x === undefined) { const s = freeSpot(g, P().x, P().z, Math.max(...row.footprint) / 2 + 40); need(s, 'no free ground near you'); x = s.x; z = s.z; }
        const t = CG().stampAt({ site: id, x, z, seed, id: `site-${id}` });
        relay(t.rec);
        if (teleport) await api.call('teleport', { x: t.rec.x, z: t.rec.z + (t.T.z1 - t.T.z0) / 2 + 20 });
        return { ...view(t), heroes: t.T.buildings.filter((B) => B.hero).map((B) => `${B.hero}:${B.kind}x${B.n}`) };
      },
    },
    overrun: {
      group: 'world',
      desc: 'A settlement\'s INFESTATION (systems/overrun.js; knobs data/citygen.js OVERRUN; docs/research/GENRE_DEPTH.md §4): read as a level 0-5 (CLEAR, STIRRING, INFESTED, SWARMED, OVERRUN, DEAD ZONE) with its noise HEAT. day=true runs one game day (spread from level 3+, recovery, the siege clock); siege=true brings a SIEGE NIGHT now (20 + 6 x week + 0.4 x wealth/100 + 8 x crew, 3 waves). town=<id> (default the nearest) level=<0..1>: set it - at 0.8 (level 4) or more the town FALLS (gates open, residents run or turn, loot picked over, the map marks it), under 0.2 a fallen one is RETAKEN. No level: its state, infestation, defense and the hordes walking at it. hordes=off|on: the dusk hordes that rise on their own.',
      args: { town: { type: 'string' }, level: { type: 'number' }, hordes: { type: 'string', enum: ['on', 'off'] }, day: { type: 'boolean', default: false }, siege: { type: 'boolean', default: false } },
      run: async ({ town, level, hordes, day, siege }) => {
        const C = CG(), O = C.overrun;
        if (hordes) O.auto = hordes === 'on';
        if (day) O.daily(++O.lastDay);
        if (siege) { const r = O.siegeNight(O.day(), town ? C.byId.get(town) : null); need(r, 'no settlement near you for a siege'); return { siege: r, hordes: O.view() }; }
        const rec = town ? C.byId.get(town) : C.plan.reduce((b, r) => (!b || Math.hypot(r.x - P().x, r.z - P().z) < Math.hypot(b.x - P().x, b.z - P().z) ? r : b), null);
        need(rec, `no settlement "${town}"`);
        if (level !== undefined) O.setLevel(rec, level);
        return { id: rec.id, name: rec.name, state: rec.state, infestation: +rec.infestation.toFixed(3), level: O.level(rec), levelName: O.levelName(rec), heat: +(rec.heat ?? 0).toFixed(1), defense: rec.defense ?? null, nextSiege: O.nextSiege, today: O.day(), live: C.live.has(rec.id), hordes: O.view().filter((H) => H.target === rec.id), auto: O.auto, counts: O.counts };
      },
    },
    cover: {
      group: 'world',
      desc: 'Cover points of the generated settlements (systems/citygen.js coverNear, the tactics lane\'s API): within r of x,z (default you), at floor height y (optional): each with its facing (nx, nz: the way out from behind it), height (1 full, 0.5 half: kneel behind it) and kind (wall, half_wall, window_frame, pump, parapet, crate, town_wall, wreck).',
      args: { x: { type: 'number' }, z: { type: 'number' }, r: { type: 'number', default: 20 }, y: { type: 'number' } },
      run: async ({ x, z, r, y }) => { const pts = CG().coverNear(x ?? P().x, z ?? P().z, r, y, []); const by = {}; for (const p of pts) by[p.kind] = (by[p.kind] ?? 0) + 1; return { n: pts.length, byKind: by, points: pts.slice(0, 24).map((p) => ({ ...p, x: r1(p.x), z: r1(p.z), y: r1(p.y) })) }; },
    },
  };
}

// ---- the selftest's checks ---------------------------------------------------------------------------------------------
export async function citygenChecks({ api, g, check, C }) {
  const p = g.player, CGs = g.citygen;
  const keyFor = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'KeyD' : 'KeyA') : dz > 0 ? 'KeyS' : 'KeyW');
  const was = { enabled: CGs.enabled, auto: CGs.overrun.auto };
  CGs.overrun.auto = false;
  let town = null;
  const stampTown = async () => {
    if (town && CGs.live.has(town.rec.id)) return town;
    const s = freeSpot(g, -4000, -9000, 280);
    if (!s) return null;
    town = CGs.stampAt({ id: 'cg-selftest', arch: 'sonoran_sprawl', seed: 9182, x: s.x, z: s.z });
    return town;
  };
  const stand = async (x, z, gy = 0) => {
    if (p.inVehicle) g.exitVehicle(true);
    if (Math.hypot(p.x - x, p.z - z) > 120) { await C('teleport', { x, z }); }
    p.x = x; p.z = z; p.gy = gy; g.standOn(p); p.vx = 0; p.vz = 0;
    g.camLook.x = p.x; g.camLook.z = p.z; g.camFloor = p.gy;
    await api._step(2);
  };
  const clearNear = (r = 40) => { for (const c of [...g.chars]) if (c !== p && !c.npc && (c.faction === 'zombie' || c.faction === 'raider' || c.cgTown) && Math.hypot(c.x - p.x, c.z - p.z) < r) g.removeChar(c); };

  await check('citygen: the rows validate - at least 24 city archetypes covering every one of the 19 biomes, building kinds capped at 6 storeys, road rows with grip, rural homesteads, walls on a minority, no purple; the SITE rows validate (real place, refs, layout, programmes)', async () => {
    const v = validateCitygen(), s = validateSites(SITES);
    return v.ok && v.archetypes >= 24 && v.biomes >= 19 && v.walled < v.archetypes / 2 && s.ok && s.rows >= 10 ? true : JSON.stringify({ v, s });
  });

  await check('citygen: 20 random archetype stamps build headless with 0 errors and pass the walkability audit - every floor of every storeyed building reached on foot from its front door (stairs, roof), every roll-up bay driven in (and through) by a car', async () => {
    const ids = Object.keys(ARCHETYPES), bad = [], seen = [];
    let floors = 0, bays = 0, n = 0;
    for (let i = 0; i < 20; i++) {
      const arch = ids[(i * 7 + 3) % ids.length], seed = 1000 + i * 37;
      try {
        const T = layoutTown({ arch, seed, x: 20000 + i * 1000, z: -20000 });
        const B = buildTown(T), A = auditTown(B, T);
        n += A.audited; floors += A.floors; bays += B.blds.filter((R) => R.B.drive).length;
        seen.push(`${arch}:${T.buildings.length}`);
        if (!A.ok) bad.push(`${arch}#${seed}: ${A.bad.slice(0, 2).join(' | ')}`);
        if (!T.buildings.length) bad.push(`${arch}#${seed}: empty`);
      } catch (e) { bad.push(`${arch}#${seed}: threw ${e.message}`); }
    }
    return !bad.length && n > 400 && floors > 600 && bays > 50 ? true : JSON.stringify({ bad: bad.slice(0, 6), audited: n, floors, bays, seen });
  });

  await check('citygen: sites, homesteads and the base - every SITE row and every rural homestead and the military base stamp headless and pass the audit; every rural main building is claimable; the base\'s vault plans 5-8 levels, each proved, the sealed ring-platform room on one', async () => {
    const bad = [];
    for (const row of SITES) { const T = layoutSite(row, { x: 30000, z: 30000, seed: 5 }); const A = auditTown(buildTown(T), T); if (!A.ok) bad.push(`${row.id}: ${A.bad[0]}`); }
    const { layoutRural, layoutBase } = await import('../world/citygen/layout.js');
    let claim = 0;
    for (const k of Object.keys(RURAL)) { const T = layoutRural({ kind: k, seed: 3, x: 0, z: 0, biome: RURAL[k].biome[0] }); const A = auditTown(buildTown(T), T); if (!A.ok) bad.push(`${k}: ${A.bad[0]}`); claim += T.buildings.filter((B) => B.claimable).length; if (!T.buildings.some((B) => B.claimable)) bad.push(`${k}: nothing claimable`); }
    const T = layoutBase({ seed: 11, x: 0, z: 0 }), A = auditTown(buildTown(T), T);
    if (!A.ok) bad.push(`base: ${A.bad[0]}`);
    const row = { id: 'st_vault', name: 'V', kind: 'vault', entrance: 'lift', x: 1000.5, z: 2000.5, dir: 'S', levels: T.bunker.levels, seed: 77 };
    let ring = 0;
    for (let k = 1; k <= row.levels; k++) { const L = genLevel(row, k); if (!L.proof.ok) bad.push(`vault level ${k}: ${L.proof.unreached.join(',')}`); if (L.rooms.some((r) => r.type === 'ringroom')) ring++; }
    return !bad.length && claim >= 7 && row.levels >= 5 && row.levels <= 8 && ring >= 1 && T.wall?.gates.length >= 2 && T.runway ? true : JSON.stringify({ bad: bad.slice(0, 6), claim, levels: row.levels, ring });
  });

  await check('citygen: 20 random SITE rows of the location bible (data/sites/*.js, 263 rows) stamp headless with 0 errors and pass the walkability audit; every row validates; a sacred, burial or living place (its `respect` note) carries no loot', async () => {
    const problems = validateSiteRows(SITES), bad = [], seen = [];
    let n = 0, h = 2166136261;
    for (let i = 0; i < 20; i++) {
      h = Math.imul(h ^ (i + 7), 16777619) >>> 0;
      const row = SITES[h % SITES.length];
      try {
        const T = layoutSite(row, { x: 40000 + i * 900, z: 40000, seed: 17 + i }), B = buildTown(T), A = auditTown(B, T);
        n += A.audited; seen.push(`${row.id}:${T.buildings.length}`);
        if (!A.ok) bad.push(`${row.id}: ${A.bad.slice(0, 2).join(' | ')}`);
        if (!T.buildings.length) bad.push(`${row.id}: empty`);
      } catch (e) { bad.push(`${row.id}: threw ${e.message}`); }
    }
    const sacred = SITES.find((r) => respectful(r));
    let sacredLoot = null;
    if (sacred) { const T = layoutSite(sacred, { x: 0, z: 0, seed: 3 }); sacredLoot = buildTown(T).loot.length; }
    const unmapped = new Set(); for (const r of SITES) for (const st of r.structures) if (kindOf(st.kind) === undefined) unmapped.add(st.kind);
    return !problems.length && !bad.length && n > 50 && sacredLoot === 0 ? true : JSON.stringify({ problems: problems.slice(0, 4), bad: bad.slice(0, 6), audited: n, sacred: sacred?.id, sacredLoot, seen: seen.slice(0, 8) });
  });

  await check('citygen: the law and the clone - towns of size have a police station (three in four with patrol bays a car drives into), every major-city archetype exactly one cloning center (4-6 storeys, fortified); citygen.cloneCenters() lists Los Angeles, Miami, Houston, New York and Chicago', async () => {
    const bad = [];
    let police = 0, withBays = 0;
    for (const a of Object.keys(ARCHETYPES)) {
      const T = layoutTown({ arch: a, seed: 404, x: 0, z: 0 }), cc = T.buildings.filter((B) => B.kind === 'cloning_center');
      if (ARCHETYPES[a].major && (cc.length !== 1 || cc[0].n < 4 || cc[0].n > 6 || !cc[0].fortified)) bad.push(`${a}: clone ${cc.length}`);
      if (!ARCHETYPES[a].major && cc.length) bad.push(`${a}: a clone center in a minor town`);
      const ps = T.buildings.find((B) => B.kind === 'police_station');
      if (T.buildings.length >= 30 && !ps) bad.push(`${a}: no police station`);
      if (ps) { police++; if (ps.doors.some((d) => d.kind === 'bay')) withBays++; } // a bay walled up for want of room parks at the curb
    }
    const list = CGs.cloneCenters(), cities = new Set(list.map((c) => c.city));
    const allCities = MAJOR_CITIES.every((M) => cities.has(M.city));
    const inWorldOk = list.filter((c) => c.inWorld).every((c) => c.door && Number.isFinite(c.x));
    return !bad.length && allCities && inWorldOk && withBays >= police * 0.75 ? true : JSON.stringify({ bad: bad.slice(0, 6), police, withBays, list });
  });

  await check('citygen: overrun levels - infestation reads as a level 0-5 (CLEAR..DEAD ZONE, falls at 4); a level-4 town spreads to a neighbour over the days; a quiet one recovers; a siege night sizes by the formula (20 + 6 x week + 0.4 x wealth/100 + 8 x crew) in 3 waves', async () => {
    const O = CGs.overrun, plan = CGs.plan.filter((r) => !r.adhoc);
    let a = null, b = null;
    for (const r of plan) { const n = CGs.near(r.x, r.z, OVERRUN.spread.reach).find((q) => q !== r && !q.adhoc && (q.defense ?? 0) < OVERRUN.spread.defended); if (n) { a = r; b = n; break; } }
    if (!a) return 'no neighbours in the plan';
    const keep = plan.map((r) => [r, r.infestation, r.state, r.quiet]);
    const names = [0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => { a.infestation = v; return O.levelName(a); });
    a.infestation = 0.8; a.state = 'holding'; O.setLevel(a, 0.85);
    const b0 = b.infestation;
    for (let d = 0; d < 12 && b.infestation <= b0; d++) O.daily(1000 + d, () => 0.01); // a sure roll each day
    const spread = b.infestation > b0;
    O.setLevel(a, 0.1); b.infestation = 0.4; b.state = 'holding'; b.quiet = 0;
    for (let d = 0; d < 2; d++) O.daily(2000 + d, () => 0.99); // no rolls land: b is quiet two days
    const recovered = b.infestation < 0.4;
    const sz = O.siegeSize(13, 3000, 5), want = Math.round(20 + 6 * 2 + 0.4 * 30 + 8 * 5);
    const sn = O.siegeNight(14, a);
    const waves = sn?.hordes.length ?? 0;
    O.clear();
    for (const [r, inf, st, q] of keep) { r.infestation = inf; r.state = st; r.quiet = q; }
    return names.join(',') === OVERRUN.levels.join(',') && spread && recovered && sz === want && waves === 3 ? true : JSON.stringify({ names, spread, recovered, sz, want, waves });
  });

  await check('citygen: the country\'s plan - settlements along every streamed corridor (towns of several archetypes, homesteads to live in outside a city, real sites), off the interstate and the island, none overlapping; military bases only at real base anchors and never closer than 40 km', async () => {
    const plan = CGs.plan.filter((r) => !r.adhoc);
    const towns = plan.filter((r) => r.kind === 'town'), rural = plan.filter((r) => r.kind === 'rural'), sites = plan.filter((r) => r.kind === 'site'), bases = plan.filter((r) => r.kind === 'base');
    const archs = new Set(towns.map((r) => r.arch)), overlap = [];
    for (let i = 0; i < plan.length; i++) for (let j = i + 1; j < plan.length; j++) { const a = plan[i], b = plan[j]; if (Math.abs(a.x - b.x) < a.half + b.half && Math.abs(a.z - b.z) < a.half + b.half) overlap.push(`${a.id}/${b.id}`); }
    let close = 0; for (let i = 0; i < bases.length; i++) for (let j = i + 1; j < bases.length; j++) if (Math.hypot(bases[i].x - bases[j].x, bases[i].z - bases[j].z) < MILITARY.spacing) close++;
    const island = plan.filter((r) => Math.hypot(r.x, r.z) < 2200).length;
    return towns.length >= 6 && archs.size >= 3 && rural.length >= 10 && !overlap.length && !close && !island && bases.every((b) => b.anchor) ? true : JSON.stringify({ towns: towns.length, archs: [...archs], rural: rural.length, sites: sites.length, bases: bases.length, overlap: overlap.slice(0, 4), close, island });
  });

  await check('citygen: a 6-storey building stands in Phoenix downtown (the Glass Flats\' tower: five floors above the street, every flight joining one floor to the next)', async () => {
    const S = g.storeys.list.find((q) => q.b.tower);
    if (!S) return JSON.stringify({ storeyed: g.storeys.list.length, max: Math.max(...g.storeys.list.map((q) => q.n)) });
    const joined = S.flights.every((f, i) => Math.abs(f.from - S.Y[i]) < 0.01 && Math.abs(f.to - S.Y[i + 1]) < 0.01);
    return S.n + 1 >= 6 && S.b.district === 'ruins' && joined && Math.abs(S.b.minX) < 464 ? true : JSON.stringify({ storeys: S.n + 1, district: S.b.district, joined });
  });

  // ---- live: a town stamped in the streamed world ----
  const T0 = await stampTown();
  await check('citygen: a stamped city stands in the streamed world - its buildings are solid (a person meets their walls), its storeyed buildings are the storeys law\'s (heightAt lifts you on a flight, a floor holds you upstairs), its loot sits floor by floor, its cover points exist', async () => {
    if (!T0) return 'no free ground for a stamp';
    const t = T0, R = t.blds.find((q) => q.S && q.S.n >= 3);
    if (!R) return JSON.stringify(CGs.liveView(t));
    await stand(t.rec.x, t.T.z1 + 15);
    const S = R.S, f = S.flights[0], wall = t.built.boxes.find((b) => b.tag === 'cg-wall' && b.base === 0);
    const solid = g.statics.pointBlocked((wall.minX + wall.maxX) / 2, (wall.minZ + wall.maxZ) / 2, 0.4);
    const mid = f.ax === 'x' ? { x: f.s0 + f.u * f.len * 0.5, z: (f.minZ + f.maxZ) / 2 } : { x: (f.minX + f.maxX) / 2, z: f.s0 + f.u * f.len * 0.5 };
    const onFlight = g.stunts.heightAt(mid.x, mid.z, 0.5), up = g.stunts.heightAt((S.ix0 + S.ix1) / 2 + 0.3, (S.iz0 + S.iz1) / 2 + 0.3, S.Y[2] + 0.1);
    const loot = t.built.loot.filter((q) => q.k >= 1).length, inv = t.built.loot.every((q) => g.inventory.boxes.has(q.id));
    const cover = CGs.coverNear(t.rec.x, t.rec.z, t.T.size, undefined, []).length;
    return solid && onFlight > 0.5 && onFlight < f.to && Math.abs(up - S.Y[2]) < 0.05 && loot > 5 && inv && cover > 20 && g.storeys.at(mid.x, mid.z) === S ? true : JSON.stringify({ solid, onFlight, up, want: S.Y[2], loot, inv, cover });
  });

  await check('citygen: draw calls stay under 150 standing in the densest part of a generated city (one instanced mesh for every live settlement)', async () => {
    if (!T0) return 'no town';
    const t = T0, core = t.T.buildings.filter((B) => B.zone === 'core');
    const cx = core.length ? core.reduce((a, B) => a + (B.x0 + B.x1) / 2, 0) / core.length : t.rec.x, cz = core.length ? core.reduce((a, B) => a + B.z1, 0) / core.length + 6 : t.rec.z;
    await stand(cx, cz);
    await api._step(30);
    g.render(0);
    const perf = await C('perf');
    return perf.drawCalls < 150 && CGs.mesh.count > 1000 ? true : JSON.stringify({ drawCalls: perf.drawCalls, instances: CGs.mesh.count });
  });

  await check('citygen: climb a generated building to its roof on held keys (the storeys law\'s steer finds every flight, as the infected would) and stand behind the parapet', async () => {
    if (!T0) return 'no town';
    const R = T0.blds.filter((q) => q.S && q.S.n === q.B.n && q.S.n >= 2 && !q.B.ruined).sort((a, b) => a.S.n - b.S.n)[0];
    if (!R) return 'no roof';
    const S = R.S, d = R.B.doors.find((q) => q.kind === 'door');
    const [dx, dz] = d.side === 'N' ? [d.at, R.B.z0 - 1.4] : d.side === 'S' ? [d.at, R.B.z1 + 1.4] : d.side === 'W' ? [R.B.x0 - 1.4, d.at] : [R.B.x1 + 1.4, d.at];
    await stand(dx, dz);
    clearNear(60);
    const top = S.Y[S.n], cx = (S.ix0 + S.ix1) / 2, cz = (S.ix0 + S.ix1) ? (S.iz0 + S.iz1) / 2 : 0;
    // into the building first (straight through the door), then up flight by flight on held keys
    const goal = { x: cx, z: cz };
    // both axes' keys held as the waypoint needs (a diagonal walk into a landing's corner)
    const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
    const hold = (dx, dz) => { const want = new Set(); if (dx > 0.25) want.add('KeyD'); if (dx < -0.25) want.add('KeyA'); if (dz > 0.25) want.add('KeyS'); if (dz < -0.25) want.add('KeyW'); if (!want.size) want.add(keyFor(dx, dz)); for (const q of KEYS) { if (want.has(q)) g.input.down.add(q); else g.input.down.delete(q); } };
    for (let f = 0; f < 60 * 70; f++) {
      if (Math.abs((p.gy ?? 0) - top) < 0.2 && g.storeys.at(p.x, p.z) === S) break;
      let wp = g.storeys.steer(p, goal.x, goal.z, top);
      if (!wp) wp = !g.storeys.at(p.x, p.z) ? { x: d.side === 'N' || d.side === 'S' ? d.at : cx, z: d.side === 'W' || d.side === 'E' ? d.at : cz } : goal;
      hold(wp.x - p.x, wp.z - p.z);
      await api._step(1);
    }
    for (const q of KEYS) g.input.down.delete(q);
    await api._step(2);
    const onRoof = Math.abs((p.gy ?? 0) - top) < 0.25 && g.storeys.at(p.x, p.z) === S;
    return onRoof ? true : JSON.stringify({ gy: r1(p.gy ?? 0), top: r1(top), at: [r1(p.x), r1(p.z)], inS: g.storeys.at(p.x, p.z) === S, levels: S.Y.map(r1), kind: R.B.kind });
  });

  await check('citygen: a shot out of a floor-4 window (and one over a roof parapet) hits a staged target in the street; the same target is not hit from floor 4 through the solid wall beside the window', async () => {
    if (!T0) return 'no town';
    const R = T0.blds.find((q) => q.S && q.S.n >= 4 && !q.B.ruined && !q.B.open && q.B.n >= 5);
    if (!R) return JSON.stringify({ tallest: Math.max(...T0.T.buildings.map((B) => B.n)) });
    const B = R.B, S = R.S, y4 = S.Y[3];
    // a window on the front wall, floor 4: the band box of that storey with holes on the front side
    const fixed = B.front === 'N' ? B.z0 : B.front === 'S' ? B.z1 : B.front === 'W' ? B.x0 : B.x1, horiz = B.front === 'N' || B.front === 'S';
    const band = T0.built.boxes.find((b) => b.tag === 'cg-wall' && Math.abs(b.base - y4) < 0.01 && b.holes && (horiz ? Math.abs((b.minZ + b.maxZ) / 2 - fixed) < 0.05 : Math.abs((b.minX + b.maxX) / 2 - fixed) < 0.05));
    if (!band) return 'no front window on floor 4';
    const wc = (band.holes[0] + band.holes[1]) / 2, out = B.front === 'N' || B.front === 'W' ? -1 : 1;
    const inX = horiz ? wc : fixed - out * 0.7, inZ = horiz ? fixed - out * 0.7 : wc;
    const tx = horiz ? wc : fixed + out * 14, tz = horiz ? fixed + out * 14 : wc;
    await stand(inX, inZ, y4);
    const atFloor = Math.abs((p.gy ?? 0) - y4) < 0.05 && p.storey === S;
    clearNear(80);
    await C('give', { weapon: 'rifle', rifle: 60 }); await C('equip', { weapon: 'rifle' });
    const dummy = g.addChar({ x: tx, z: tz, faction: 'drifter', weapon: null, hp: 400, colors: outfit('drifter'), name: 'Street target (selftest)', flag: 'US' });
    dummy.hold = true; dummy.timer = 99;
    const hp0 = dummy.hp;
    await C('fire', { id: dummy.id, shots: 6 });
    const hitWindow = dummy.hp < hp0 || !dummy.alive;
    // the solid pier beside the window: move along the wall to a stretch with no hole and fire at a target straight out
    let pier = null;
    for (let a = band.holeX ? band.minX + 0.6 : band.minZ + 0.6; a < (band.holeX ? band.maxX : band.maxZ) - 0.6; a += 0.25) { let inHole = false; for (let i = 0; i < band.holes.length; i += 2) if (a > band.holes[i] - 0.5 && a < band.holes[i + 1] + 0.5) inHole = true; if (!inHole) { pier = a; break; } }
    let blocked = null;
    if (pier !== null) {
      await stand(horiz ? pier : fixed - out * 0.9, horiz ? fixed - out * 0.9 : pier, y4);
      const dz2 = g.addChar({ x: horiz ? pier : fixed + out * 14, z: horiz ? fixed + out * 14 : pier, faction: 'drifter', weapon: null, hp: 400, colors: outfit('drifter'), name: 'Street target 2 (selftest)', flag: 'US' });
      dz2.hold = true;
      const h2 = dz2.hp;
      await C('fire', { id: dz2.id, shots: 3 });
      blocked = dz2.hp === h2;
      g.removeChar(dz2);
    }
    // over the parapet: the roof of the same building
    let hitRoof = null;
    if (S.n === B.n) {
      await stand(horiz ? wc : fixed - out * 1.0, horiz ? fixed - out * 1.0 : wc, S.Y[S.n]);
      const d3 = g.addChar({ x: tx + (horiz ? 2 : 0), z: tz + (horiz ? 0 : 2), faction: 'drifter', weapon: null, hp: 400, colors: outfit('drifter'), name: 'Street target 3 (selftest)', flag: 'US' });
      d3.hold = true; const h3 = d3.hp;
      await C('fire', { id: d3.id, shots: 3 });
      hitRoof = d3.hp < h3 || !d3.alive;
      g.removeChar(d3);
    }
    if (g.chars.includes(dummy)) g.removeChar(dummy);
    await stand(T0.rec.x, T0.T.z1 + 15);
    return atFloor && hitWindow && blocked !== false && hitRoof !== false ? true : JSON.stringify({ atFloor, hitWindow, blocked, hitRoof, y4: r1(y4), kind: B.kind });
  });

  await check('citygen: a car drives into a warehouse through its roll-up door and out through the far one (and the street\'s surface row sets its grip)', async () => {
    let t = CGs.live.get('cg-selftest-wh');
    if (!t) { const s = freeSpot(g, -9000, -6000, 230); if (!s) return 'no ground'; t = CGs.stampAt({ id: 'cg-selftest-wh', arch: 'port_wharf', seed: 33, x: s.x, z: s.z }); }
    const R = t.blds.find((q) => q.B.kind === 'warehouse' && q.B.doors.some((d) => d.kind === 'bay' && q.B.doors.some((o) => o.kind === 'bay' && o !== d && o.side !== d.side && Math.abs(o.at - d.at) < 0.5)));
    if (!R) return JSON.stringify({ kinds: t.T.buildings.filter((B) => B.drive).map((B) => B.kind) });
    const B = R.B, d = B.doors.find((q) => q.kind === 'bay' && B.doors.some((o) => o.kind === 'bay' && o.side !== q.side && Math.abs(o.at - q.at) < 0.5));
    const ax = d.side === 'N' || d.side === 'S', sgn = d.side === 'N' || d.side === 'W' ? -1 : 1; // outward from the bay
    const sx = ax ? d.at : (sgn < 0 ? B.x0 : B.x1) + sgn * 5.5, sz = ax ? (sgn < 0 ? B.z0 : B.z1) + sgn * 5.5 : d.at;
    const heading = ax ? (sgn < 0 ? 0 : Math.PI) : (sgn < 0 ? Math.PI / 2 : -Math.PI / 2); // facing in (forward = sin h, cos h)
    await stand(sx + (ax ? 3 : 0), sz + (ax ? 0 : 3));
    clearNear(60);
    for (const v of [...g.vehicles]) if (Math.hypot(v.x - sx, v.z - sz) < 40 && !v.parked) {} // leave the street as it is
    const car = await C('spawnVehicle', { type: 'pickup', x: sx, z: sz, heading });
    await C('enterVehicle', { id: car.id, force: true });
    const v = g.vehicles.find((q) => q.id === car.id);
    const far = ax ? (sgn < 0 ? B.z1 : B.z0) - sgn * 6 : (sgn < 0 ? B.x1 : B.x0) - sgn * 6;
    let inside = false, through = false, grip = null;
    for (let f = 0; f < 60 * 12; f++) {
      g.input.down.add('KeyW');
      await api._step(1);
      const a = ax ? v.z : v.x;
      if (v.x > B.x0 + 1 && v.x < B.x1 - 1 && v.z > B.z0 + 1 && v.z < B.z1 - 1) { inside = true; if (grip === null) grip = v.roadGrip; }
      if (inside && (sgn < 0 ? a > far : a < far)) { through = true; break; }
    }
    g.input.down.delete('KeyW');
    for (let f = 0; f < 60; f++) { g.input.down.add('Space'); await api._step(1); }
    g.input.down.delete('Space');
    // the street's grip: on a gravel or dirt row it is under 1
    const road = t.T.roads.find((r) => ROADS[r.row].grip < 1);
    const gr = road ? CGs.gripAt((road.x0 + road.x1) / 2, (road.z0 + road.z1) / 2) : null;
    g.exitVehicle(true);
    const vv = g.vehicles.find((q) => q.id === car.id); if (vv) g.vehiclesSys.remove?.(vv);
    return inside && through && (gr === null || gr < 1) ? true : JSON.stringify({ inside, through, car: [r1(v.x), r1(v.z)], box: [B.x0, B.z0, B.x1, B.z1], bay: d, grip, gr });
  });

  await check('citygen: doors, windows and roll-ups - a generated building near you hangs real doors (some back doors locked: kick, pick or pry) and glass windows (smash, climb, board) from the interiors pool; a roll-up bay rolls down (a car stops at it), up (it drives through), locks and picks open', async () => {
    if (!T0) return 'no town';
    const t = T0, R = t.blds.find((q) => q.B.doors.some((d) => d.kind === 'door') && t.built.windows.some((w) => w.b === q.B.id));
    if (!R) return 'no building with windows';
    await stand((R.minX + R.maxX) / 2, R.maxZ + 12);
    CGs.openings(p.x, p.z); // (the scan runs in update while settlements build themselves; the battery holds that off)
    await api._step(2);
    const rec = g.interiors.ringOpen.get(R.open), doors = rec?.doors.length ?? 0, wins = rec?.windows.length ?? 0;
    let locked = 0; for (const q of t.blds) { const r2 = q.open && g.interiors.ringOpen.get(q.open); if (r2) locked += r2.doors.filter((d) => d.locked).length; }
    // a bay: down, the box is solid; up, it passes; lock + pick
    const q = t.built.bays[0];
    if (!q) return 'no bay';
    CGs.setBay(t, q, false);
    const blockedDown = g.statics.pointBlocked(q.x, q.z, 0.4);
    CGs.setBay(t, q, true);
    const clearUp = !g.statics.pointBlocked(q.x + q.nx * 0.0, q.z + q.nz * 0.0, 0.3) || q.box.base > 10;
    CGs.setBay(t, q, false, true);
    const lockedNow = q.locked && !q.open;
    CGs.setBay(t, q, true, false);
    return doors >= 1 && wins >= 1 && locked >= 1 && blockedDown && clearUp && lockedNow ? true : JSON.stringify({ attached: !!rec, doors, wins, locked, blockedDown, clearUp, lockedNow });
  });

  await check('citygen: overrun - set a town\'s infestation past 0.75 and it falls (gates open, an event, the mark), drop it under 0.2 and it is retaken; a migrating horde record walks to a town and besieges it, standing bodies in the street only near you', async () => {
    if (!T0) return 'no town';
    const rec = T0.rec, O = CGs.overrun, s0 = g.eventSeq;
    await C('overrun', { town: rec.id, level: 0.9 });
    const fell = rec.state === 'overrun' && g.events.some((e) => e.seq > s0 && e.type === 'settlementOverrun' && e.id === rec.id) && CGs.marks().find((m) => m.id === rec.id)?.state === 'overrun';
    await C('overrun', { town: rec.id, level: 0.1 });
    const back = rec.state === 'retaken';
    // a horde 90 m outside the edge walks in (forced by day) and lays siege; you stand far off: it stays a number
    await stand(rec.x, rec.z - rec.half - 260);
    const H = O.spawnHorde({ x: rec.x + rec.half + 90, z: rec.z, size: 30, toward: rec.id, force: true });
    for (let i = 0; i < 90 && H.state !== 'siege'; i++) await api._step(30);
    const siege = H.state === 'siege' || H.strength < 30;
    const bodies = H.bodies.length;
    O.clear(); rec.infestation = 0; rec.state = 'holding';
    return fell && back && siege && bodies === 0 ? true : JSON.stringify({ fell, state: rec.state, back, siege, horde: O.view(), bodies });
  });

  await check('citygen: a full pool still sieges - the 160 slots held by ambient people 600 m behind you, a 120-strong horde at the gate 51 m off still stands bodies in the street near you (far ambient people fold into records, farthest first); someone not ambient is never folded; walk back and they unfold as they were', async () => {
    if (!T0) return 'no town';
    const rec = T0.rec, O = CGs.overrun, POP = g.population, popWas = POP.enabled;
    const gate = { x: rec.x, z: rec.z + rec.half + 12 };
    await stand(gate.x, gate.z + 51);
    const far = { x: rec.x + 700, z: rec.z + rec.half + 400 };
    const keep = g.addChar({ x: far.x + 30, z: far.z, faction: 'drifter', name: 'Pool Keeper', flag: 'MX' }); // no amb: some system's own
    const fill = [];
    while (g.freeSlots.length > 2) {
      const c = g.addChar({ x: far.x + (Math.random() - 0.5) * 60, z: far.z + (Math.random() - 0.5) * 60, faction: 'drifter', name: 'Far Drifter', flag: 'CA' });
      if (!c) break;
      c.amb = true; c.cgPoolFill = true; fill.push(c);
    }
    const npcs0 = g.chars.filter((c) => c.npc).length, free0 = g.freeSlots.length, s0 = { ...POP.stats };
    POP.enabled = true;
    const H = O.spawnHorde({ x: gate.x, z: gate.z, size: 120, toward: rec.id, force: true });
    for (let i = 0; i < 6; i++) await api._step(30);
    const near = H.bodies.filter((c) => c.alive && Math.hypot(c.x - p.x, c.z - p.z) < OVERRUN.horde.bodyR).length;
    const folded = POP.stats.folded - s0.folded, keptAlive = g.chars.includes(keep), npcs1 = g.chars.filter((c) => c.npc).length;
    // clear the horde, walk back: the far drifters unfold (room allowing), named, flagged and dressed as they left
    O.clear();
    const r0 = POP.recs[POP.recs.length - 1]; // the last folded: nearest of the batch
    if (r0) await stand(r0.x, r0.z + 20);
    for (let i = 0; i < 4; i++) await api._step(30);
    const unfolded = POP.stats.unfolded - s0.unfolded;
    const back = r0 && g.chars.find((c) => c.amb && c.name === r0.name && c.flag === r0.flag && c.colors === r0.colors && Math.hypot(c.x - r0.x, c.z - r0.z) < 3);
    for (const c of [...g.chars]) if (c.amb && c.name === 'Far Drifter') g.removeChar(c);
    POP.recs = POP.recs.filter((r) => r.name !== 'Far Drifter');
    if (g.chars.includes(keep)) g.removeChar(keep);
    POP.enabled = popWas; rec.infestation = 0; rec.state = 'holding';
    return free0 <= 2 && near >= 20 && folded >= 20 && keptAlive && npcs1 === npcs0 && unfolded >= 1 && !!back
      ? true : JSON.stringify({ free0, near, bodies: H.bodies.length, folded, keptAlive, npcs0, npcs1, unfolded, back: !!back, pop: POP.view() });
  });

  await check('citygen: the overrun-test scenario resolves - a mid-size town without walls falls to a 200-strong horde at dusk, a walled stronghold of the same size holds', async () => {
    const mod = await import('../scenarios/overrun-test.js');
    const r = await mod.default(api.bind ? api.bind() : null, g, { api });
    return r.weak?.outcome === 'fell' && r.strong?.outcome === 'held' ? true : JSON.stringify(r);
  });

  await check('citygen: living outside a city - a homestead off the road is built when you come near (its main building claimable as your home: the deed hook), and torn down when you leave', async () => {
    const recs = CGs.plan.filter((r) => r.kind === 'rural').sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    const rec = recs.find((r) => g.streamer.W.inWorld(r.x, r.z, -300));
    if (!rec) return 'no homestead in the plan';
    CGs.enabled = true;
    await stand(rec.x, rec.z + rec.half + 30);
    for (let i = 0; i < 6 && !CGs.live.has(rec.id); i++) await api._step(40);
    const t = CGs.live.get(rec.id);
    const R = t?.blds.find((q) => q.B.claimable);
    const s0 = g.eventSeq;
    const claimed = R ? CGs.claim(R) && g.events.some((e) => e.seq > s0 && e.type === 'deedClaimed') : false;
    await stand(rec.x + 2600, rec.z);
    for (let i = 0; i < 4 && CGs.live.has(rec.id); i++) await api._step(40);
    const gone = !CGs.live.has(rec.id);
    CGs.enabled = was.enabled;
    return t && claimed && gone ? true : JSON.stringify({ built: !!t, claimed, gone, rec: rec.id });
  });

  // clean up: the stamped towns go, the switches as they were
  for (const id of ['cg-selftest', 'cg-selftest-wh']) CGs.remove(id);
  CGs.overrun.clear();
  CGs.overrun.auto = was.auto; CGs.enabled = was.enabled;
  if (p.inVehicle) g.exitVehicle(true);
  p.gy = 0;
  await C('teleport', { x: 0, z: -40 });
  await api._step(3);
}
