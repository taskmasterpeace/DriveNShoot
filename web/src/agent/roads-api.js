// THE ROAD GRAPH as COMMANDS rows and selftest checks (src/world/roadgraph.js; docs/status/WORLD_CONNECTED.md).
//   roads action=audit            every place in the streamed world: reached by road from its region's start or not; dead
//                                 ends; roads through water with no deck; places that reach the interstate only through a
//                                 city; lanes against the rule
//   roads action=trip to=<place>  DRIVE there for real, on roads only: the shortest road route (one-way roads the right way
//                                 round), followed by the car at road speeds; every metre off the pavement is counted
//   roads action=map              a picture of it (green: reached, red: not), as a PNG data URL
import { buildRoadGraph, nearestNode, shortest, pathTo, destinations, auditWorld } from '../world/roadgraph.js';

const r1 = (v) => Math.round(v * 10) / 10;
export const ROAD_STARTS = { arizona: { x: 0, z: -470, name: 'Rust Haven, Phoenix (the island\'s south gate)' }, florida: null };

export function roadsCommands(api, need) {
  const g = api.g;
  const W = () => g.streamer?.W;
  const starts = () => {
    const w = W(), M = w.holdouts?.find((H) => /meridian/i.test(H.row?.id ?? H.id ?? '')) ?? w.holdouts?.[0];
    return { arizona: ROAD_STARTS.arizona, ...(M ? { florida: { x: (M.approach ?? { x: M.cx }).x, z: (M.approach ?? { z: M.cz }).z, name: 'Meridian, Florida (the new-game start)' } } : {}) };
  };
  const graph = () => (g.roadGraph && g.roadGraph.ribbons === W().ribbons ? g.roadGraph.G : (g.roadGraph = { ribbons: W().ribbons, G: buildRoadGraph(W()) }).G);
  return {
    roads: {
      group: 'world', desc: 'THE ROAD GRAPH (src/world/roadgraph.js): the streamed world\'s roads as one graph built from the ribbons the chunks pave. action: audit (from each region\'s start - Rust Haven in Arizona, Meridian in Florida - which towns, sites, bases, cities, holdouts and exit communities you reach by road; dead ends; roads through water with no deck; places that reach the interstate only through a city; lanes that break the lane rule) | trip to=<place id or name> (DRIVE there on roads only, the car following the shortest road route at road speeds; reports arrived, km, minutes, metres off the pavement; spawns a car at you if you are on foot; max= km of road to try) | map (a picture: green reached, red not; returns a PNG data URL) | places (the destination list).',
      args: { action: { type: 'string', default: 'audit', enum: ['audit', 'trip', 'map', 'places'] }, to: { type: 'string' }, max: { type: 'number', default: 80 }, speed: { type: 'number', default: 30 }, quiet: { type: 'boolean', default: true }, leg: { type: 'number', default: 0 } },
      run: async ({ action, to, max, speed, quiet, leg }) => {
        const w = W(); need(w, 'no streamed world');
        if (action === 'places') return destinations(w, g.citygen?.plan).map((q) => ({ id: q.id, name: q.name, kind: q.kind, region: q.region, x: Math.round(q.x), z: Math.round(q.z) }));
        if (action === 'audit') {
          const A = auditWorld(w, g.citygen?.plan, starts());
          g.roadGraph = { ribbons: w.ribbons, G: A.G };
          return { graph: A.graph, starts: A.starts, places: A.places.length, reached: A.places.filter((q) => q.reached).length,
            byRegion: Object.fromEntries(['arizona', 'florida'].map((rg) => [rg, { places: A.places.filter((q) => q.region === rg).length, reached: A.places.filter((q) => q.region === rg && q.reached).length }])),
            crossRegion: A.places.filter((q) => q.reached && q.from !== q.region).map((q) => q.name),
            unreachable: A.unreachable.map((q) => ({ id: q.id, name: q.name, kind: q.kind, region: q.region, onRoad: q.onRoad })),
            deadEnds: A.deadEnds.filter((d) => d.kind === 'dead end'), stubs: A.deadEnds.filter((d) => d.kind === 'stub').length, wet: A.wet, onlyThroughCity: A.onlyCity, laneBreaks: A.laneBreaks, laneHeld: A.laneHeld,
            list: A.places.map((q) => ({ id: q.id, name: q.name, kind: q.kind, region: q.region, reached: q.reached, km: q.km, toInterstate: q.toInterstate ?? null, exit: q.exit ?? null, x: Math.round(q.cx), z: Math.round(q.cz) })) };
        }
        if (action === 'trip') return trip(api, need, graph(), to, max, speed, quiet, leg);
        if (action === 'map') return { png: drawMap(w, auditWorld(w, g.citygen?.plan, starts())) };
        return null;
      },
    },
  };
}

// ---- the drive ------------------------------------------------------------------------------------------------------
async function trip(api, need, G, to, maxKm, top, quiet = true, legKm = 0) {
  const g = api.g, w = g.streamer.W, P = g.player;
  const D = destinations(w, g.citygen?.plan), q = D.find((d) => d.id === to || d.name === String(to ?? '').toUpperCase());
  need(q, `no place ${to}; roads action=places lists them`);
  let v = P.inVehicle, fresh = false;
  if (!v) {
    fresh = true;
    // this command's own earlier cars (a wreck of one blocks the road for the next): gone first
    for (const old of g.vehicles.filter((q) => q.roadTrip && q !== P.inVehicle)) g.vehiclesSys.remove(old);
    const n0 = G.nodes[nearestNode(G, P.x, P.z, 900)]; need(n0, 'no road within 900 m of you');
    const r = await api.call('spawnVehicle', { type: 'interceptor', x: n0.x, z: n0.z, heading: 0, ai: 'none' });
    await api.call('enterVehicle', { id: r.id ?? r.vehicle?.id, force: true });
    v = P.inVehicle; need(v, 'could not get into a car');
    v.roadTrip = true;
  }
  const s = nearestNode(G, v.x, v.z, 900), dn = nearestNode(G, q.x, q.z, q.reach);
  need(s >= 0, 'you are not near a road'); need(dn >= 0, `${q.name} has no road at it`);
  const S = shortest(G, [s]);
  if (!(S.dist[dn] < Infinity)) return { to: q.name, arrived: false, why: 'no road route from here', routeKm: null };
  const path = pathTo(S, dn), pts = path.map((i) => G.nodes[i]);
  const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
  const L = cum[cum.length - 1];
  if (L / 1000 > maxKm) return { to: q.name, arrived: false, why: `route is ${r1(L / 1000)} km (max ${maxKm})`, routeKm: r1(L / 1000) };
  if (fresh && pts.length > 3) { v.x = pts[0].x; v.z = pts[0].z; v.h = Math.atan2(pts[3].x - pts[0].x, pts[3].z - pts[0].z); v.vx = 0; v.vz = 0; }
  // the question is the road, not the car: it is made tough for the trip and the damage it took is reported instead
  const hp0 = v.hp; v.hp = 1e6;
  if (fresh || !(v.fuel > 5)) v.fuel = v.fuelCap ?? 60; // a full tank (the road, not the fuel, is the question)
  const wrongWay = path.filter((i, k) => k && G.adj[path[k - 1]].find(([j]) => j === i)?.[1] > 2 * Math.hypot(G.nodes[i].x - G.nodes[path[k - 1]].x, G.nodes[i].z - G.nodes[path[k - 1]].z) + 2).length;
  let engHeat = 0, i = 0, t = 0, off = 0, offMax = 0, driven = 0, best = 0, bestT = 0, lx = v.x, lz = v.z, streamAt = -1e9, unstick = 0, stuckT = 0;
  const budget = L / 9 + 180;
  g.driveOverride = null;
  // quiet: the road is the question, not a fight. The director's events, the convoy, the road people and the police beats
  // hold off for the trip (the battery's own switches) and come back after it
  const was = { dir: g.society?.director?.paused, pulls: g.pulls?.enabled, beats: g.police?.beatsOn, lr: g.longroad?.enabled, conv: g.convoy?.next };
  // ...and the raider factions hold their fire for the trip (their standing is put back after): a Dustwolves camp at an exit
  // shoots a car's engine out, which says nothing about the road
  const RAIDERS = ['dustwolves', 'raiders', 'pirates'], stand0 = {};
  if (quiet) for (const f of RAIDERS) { const st = await api.call('standing', { faction: f }); if (st?.ok !== false && st?.standing !== undefined) { stand0[f] = st.standing; await api.call('standing', { faction: f, set: 70 }); } }
  if (quiet) { if (g.society?.director) g.society.director.paused = true; if (g.pulls) g.pulls.enabled = false; if (g.police) g.police.beatsOn = false; if (g.longroad) g.longroad.enabled = false; if (g.convoy) { g.convoy.despawn?.(); g.convoy.next = 1e9; } }
  // the sim runs at its own 60 Hz with a frame drawn every 30th (streamer.runFrames: same physics, the page stays live);
  // the driver's decisions every 0.1 s, as before
  let done = false, legDone = false;
  const each = (f) => {
    if (done) return false;
    if (f % 6) return true;
    if (t >= budget) return false;
    if (legKm && cum[i] > legKm * 1000) { legDone = true; return false; } // a long trip goes in legs (each command under the bridge's 15 min)
    // where along the route the car is (search a little ahead of the last index)
    let bi = i, bd = Infinity;
    for (let k = i; k < Math.min(pts.length, i + 40); k++) { const d = Math.hypot(pts[k].x - v.x, pts[k].z - v.z); if (d < bd) { bd = d; bi = k; } }
    i = bi;
    if (cum[i] > best + 1) { best = cum[i]; bestT = t; }
    if (L - cum[i] < 14 && Math.hypot(pts[pts.length - 1].x - v.x, pts[pts.length - 1].z - v.z) < 18) return false;
    if (cum[i] - streamAt > 150) { g.streamer.ensureSpan(v.x, v.z, pts[Math.min(pts.length - 1, i + 40)].x, pts[Math.min(pts.length - 1, i + 40)].z); streamAt = cum[i]; }
    const sp = g.vehiclesSys.speed(v);
    // the pavement: off it when farther from the route's line than its half width (plus the car's)
    const h = pts[i].h + 1.2, lat = bd;
    // off the road: more than 2 m past the paint (a shoulder, a ramp's taper, is road)
    if (lat > h + 2) off += Math.hypot(v.x - lx, v.z - lz);
    offMax = Math.max(offMax, lat - h);
    // look ahead along the route, and slow for what bends there
    // how much the road turns in the next stretch (a junction at a stop line is a right angle: slow, short look-ahead)
    let bend = 0, near = 0; for (let k = i + 1; k < Math.min(pts.length - 1, i + 14); k++) { const a1 = Math.atan2(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z), a2 = Math.atan2(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z), d = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))); bend += d; if (k < i + 5) near += d; }
    const look = near > 0.6 ? 6 : bend > 0.6 ? 9 : 12 + sp * 0.9;
    let j = i; while (j < pts.length - 1 && cum[j] - cum[i] < look) j++;
    const vWant = Math.min(top, near > 0.6 ? 5 : bend > 1.2 ? 8 : bend > 0.6 ? 14 : bend > 0.3 ? 22 : top, (L - cum[i]) * 0.5 + 4);
    const want = Math.atan2(pts[j].x - v.x, pts[j].z - v.z), diff = Math.atan2(Math.sin(want - v.h), Math.cos(want - v.h));
    if (stuckT > 0) { g.driveOverride = { throttle: -0.8, steer: -Math.sign(diff) }; stuckT -= 0.1; }
    else g.driveOverride = { throttle: sp < vWant - 1 ? 1 : sp > vWant + 1.5 ? -0.7 : 0.15, steer: Math.max(-1, Math.min(1, diff * 2.2)), handbrake: Math.abs(diff) > 1.4 && sp > 10 };
    t += 0.1;
    // the driver stays fed, watered and awake on a test trip (a blacked-out driver gives no input)
    // ...and the car stays whole and cool: desert heat at full throttle cooks an engine and raiders shoot one out, which
    // the trip reports (worst engine heat) but does not let end the test of the road
    if (quiet && v.dmg) { engHeat = Math.max(engHeat, v.dmg.temp ?? 0); v.dmg.temp = Math.min(v.dmg.temp ?? 0, 0.5); v.dmg.engine = 1; v.dmg.radiator = Math.max(v.dmg.radiator ?? 1, 0.9); if (v.dmg.tyres) for (const k of Object.keys(v.dmg.tyres)) v.dmg.tyres[k] = 1; }
    if (quiet && g.needs) { g.needs.water = Math.max(g.needs.water ?? 1, 0.9); g.needs.food = Math.max(g.needs.food ?? 1, 0.9); g.needs.rest = Math.max(g.needs.rest ?? 1, 0.9); g.needs.blackout = 0; }
    driven += Math.hypot(v.x - lx, v.z - lz); lx = v.x; lz = v.z;
    if (v.dead || !P.inVehicle || !P.alive) return false;
    if (t - bestT > 12 && unstick < 4) { stuckT = 1.5; unstick++; bestT = t; }
    if (t - bestT > 25) return false;
    return true;
  };
  await g.streamer.runFrames(budget + 5, each, { renderEvery: 6 });

  g.driveOverride = { throttle: -1, steer: 0 }; await api._step(20); g.driveOverride = null;
  for (const [f, v0] of Object.entries(stand0)) await api.call('standing', { faction: f, set: v0 });
  if (quiet) { if (g.society?.director) g.society.director.paused = was.dir; if (g.pulls) g.pulls.enabled = was.pulls; if (g.police) g.police.beatsOn = was.beats; if (g.longroad) g.longroad.enabled = was.lr; if (g.convoy) g.convoy.next = was.conv; }
  const end = pts[pts.length - 1], left = Math.hypot(end.x - v.x, end.z - v.z), took = Math.round(1e6 - v.hp); v.hp = Math.max(1, hp0 - took);
  return { to: q.name, kind: q.kind, region: q.region, arrived: left < 25, legDone, routeKm: r1(L / 1000), drivenKm: r1(driven / 1000), minutes: r1(t / 60), offRoadM: Math.round(off), worstOffM: r1(offMax), wrongWaySteps: wrongWay, metresLeft: Math.round(left), debug: { i, along: Math.round(cum[i]), next: pts.slice(Math.max(0, i - 3), i + 8).map((n) => [n.rib.id, Math.round(n.x), Math.round(n.z), +n.y.toFixed(1)]) }, car: { damageTaken: took, dead: !!v.dead, hottestEngine: +engHeat.toFixed(2) }, at: [Math.round(v.x), Math.round(v.z)] };
}

// ---- the picture ----------------------------------------------------------------------------------------------------
function drawMap(w, A) {
  const C = document.createElement('canvas'); C.width = 1800; C.height = 1000;
  const c = C.getContext('2d');
  c.fillStyle = '#17130f'; c.fillRect(0, 0, 1800, 1000);
  const panels = [{ rg: 'arizona', title: 'ARIZONA · I-10 (the Phoenix circle)', x0: 20, w: 1060 }, { rg: 'florida', title: 'FLORIDA · I-95 and I-75', x0: 1100, w: 680 }];
  for (const P of panels) {
    const pl = A.places.filter((q) => q.region === P.rg);
    if (!pl.length) continue;
    const rbs = A.G.ribs.filter((rb) => (w.regionOf?.(rb.x[0], rb.z[0])?.id === 'florida' ? 'florida' : 'arizona') === P.rg);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of pl) { x0 = Math.min(x0, q.cx); x1 = Math.max(x1, q.cx); z0 = Math.min(z0, q.cz); z1 = Math.max(z1, q.cz); }
    for (const rb of rbs) if (rb.mainline) for (let i = 0; i < rb.n; i += 20) { x0 = Math.min(x0, rb.x[i]); x1 = Math.max(x1, rb.x[i]); z0 = Math.min(z0, rb.z[i]); z1 = Math.max(z1, rb.z[i]); }
    const top = 90, H = 880, k = Math.min((P.w - 40) / (x1 - x0), (H - 40) / (z1 - z0)), ox = P.x0 + 20 + ((P.w - 40) - (x1 - x0) * k) / 2, oz = top + 20 + ((H - 40) - (z1 - z0) * k) / 2;
    const T = (x, z) => [ox + (x - x0) * k, oz + (z - z0) * k];
    c.strokeStyle = 'rgba(240,226,196,0.25)'; c.strokeRect(P.x0, top, P.w, H);
    c.fillStyle = '#f2e6d0'; c.font = '700 26px Barlow Condensed, Arial Narrow, sans-serif'; c.fillText(P.title, P.x0 + 12, top - 16);
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const rb of rbs) {
      c.strokeStyle = rb.mainline ? '#d8b066' : rb.band === 'ramp' || rb.band === 'aux' ? '#a8905e' : '#8a7a62'; c.lineWidth = rb.mainline ? 3 : 1.4;
      c.beginPath(); for (let i = 0; i < rb.n; i += Math.max(1, Math.floor(rb.n / 400))) { const [x, y] = T(rb.x[i], rb.z[i]); if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke();
    }
    const st = A.starts[P.rg];
    if (st) { const [x, y] = T(st.x, st.z); c.fillStyle = '#f5b21a'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 6 : 15; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); c.fill(); c.strokeStyle = '#1b1410'; c.lineWidth = 2; c.stroke(); }
    c.font = '600 15px Barlow Condensed, Arial Narrow, sans-serif';
    const placed = [];
    for (const q of pl.sort((a, b) => (a.kind === 'exit community') - (b.kind === 'exit community'))) {
      const [x, y] = T(q.cx, q.cz), r = q.kind === 'city' || q.kind === 'metro' ? 8 : q.kind === 'exit community' ? 3.5 : 6;
      c.fillStyle = q.reached ? '#4fbf5a' : '#e0503a'; c.strokeStyle = '#0e0c0a'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
      if (q.kind === 'exit community') continue;
      const tw = c.measureText(q.name).width, bx = [x + 9, y - 9, x + 11 + tw, y + 6];
      if (placed.some((b) => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1])) continue;
      placed.push(bx); c.fillStyle = q.reached ? '#cfe8c0' : '#ffb0a0'; c.fillText(q.name, x + 10, y + 5);
    }
  }
  c.font = '600 18px Barlow Condensed, Arial Narrow, sans-serif'; c.fillStyle = '#f2e6d0';
  c.fillText(`ROADS OF THE DIVIDED STATES · ${A.places.filter((q) => q.reached).length} of ${A.places.length} places reached by road from the start of their region · ★ start · ● green reached · ● red not`, 20, 40);
  c.fillText('The two regions are not joined to each other: nothing (road, rail or air) runs between Arizona and Florida yet.', 20, 64);
  return C.toDataURL('image/png');
}

export async function roadsChecks(api, check, C) {
  const g = api.g, W = g.streamer?.W;
  if (!W) return;
  let A = null;
  await check('roads: every town, site, base, city, holdout and exit community in the streamed world is reached by road from its region\'s start', async () => {
    A = (await C('roads', { action: 'audit' }));
    return A.unreachable.length === 0 ? true : A.unreachable.map((q) => q.name).join(', ');
  });
  await check('roads: no road end goes nowhere, no road runs through deep water with no deck, no place reaches the interstate only through a city', async () => {
    if (!A) return 'no audit';
    return !A.deadEnds.length && !A.wet.length && !A.onlyThroughCity.length ? true : `dead ends ${A.deadEnds.length}, wet ${A.wet.length}, only through a city ${A.onlyThroughCity.length}`;
  });
  await check('roads: the lanes keep the lane rule (every difference is one held back on record: an interchange, a pinned chunk, the island)', async () => (A && !A.laneBreaks.length ? true : JSON.stringify(A?.laneBreaks.slice(0, 4))));
}
