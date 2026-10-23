// THE MAP'S CHECKS (docs/design/WEB_FORGE.md §3.3): what is wrong with the national map's rows, as a list a person or an
// agent can walk. Pure (rows in, findings out), in usmap metres, so the forge page, the `mapCheck` command and the
// selftest agree. The engine's own word comes on top: WorldIndex.warnings (an exit too far off I-10, one without a
// destination) are what the game itself skips, and the forge shows them beside these.
//   dead ends   an interstate or county road that stops short of any other road, town, exit or the coast
//   orphans     rows the engine cannot use: a street or placement no town claims, an exit off its highway (the engine's
//               400 m rule) or on a highway that does not exist, a town street network nothing reaches
//   crossings   a road over a river or a water cell with no bridge row (the rivers-and-bridges layer, L1/L2, builds them)
export const RULES = {
  snap: 70,          // usmap m: two road ends this close meet
  townReach: 1600,   // usmap m: a road ending this close to a town ends IN the town
  exitReach: 200,    // usmap m: ... or at an exit
  exitOff: 400,      // WORLD m: the engine skips an exit farther than this off its highway (worldindex.js buildExits)
  waterStep: 125,    // usmap m: how finely a road is walked over the water grid
};

const segD = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
};
function segX(a, b, c, d) { // segment ab x segment cd: the point, or null
  const r1 = b[0] - a[0], r2 = b[1] - a[1], s1 = d[0] - c[0], s2 = d[1] - c[1], den = r1 * s2 - r2 * s1;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s2 - (c[1] - a[1]) * s1) / den, u = ((c[0] - a[0]) * r2 - (c[1] - a[1]) * r1) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r1 * t, a[1] + r2 * t] : null;
}
export const LINE_COLLS = ['interstates', 'roads', 'streets'];

export function checkMap(doc, { K = 5.2, engineWarnings = [] } = {}) {
  const t0 = Date.now();
  const lines = [];
  for (const coll of LINE_COLLS) for (const r of doc[coll] ?? []) if (Array.isArray(r.pts) && r.pts.length >= 2) lines.push({ coll, r });
  // Segment buckets (2 km) for the near-road queries.
  const B = 2000, buckets = new Map();
  const bk = (x, y) => `${Math.floor(x / B)},${Math.floor(y / B)}`;
  for (const L of lines) for (let i = 1; i < L.r.pts.length; i++) {
    const a = L.r.pts[i - 1], b = L.r.pts[i];
    for (let gx = Math.floor(Math.min(a[0], b[0]) / B); gx <= Math.floor(Math.max(a[0], b[0]) / B); gx++) for (let gy = Math.floor(Math.min(a[1], b[1]) / B); gy <= Math.floor(Math.max(a[1], b[1]) / B); gy++) {
      const k = `${gx},${gy}`; let l = buckets.get(k); if (!l) buckets.set(k, (l = [])); l.push({ L, i });
    }
  }
  const nearRoad = (p, self, reach) => {
    for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
      for (const { L, i } of buckets.get(`${Math.floor(p[0] / B) + gx},${Math.floor(p[1] / B) + gy}`) ?? []) {
        if (L.r === self) continue;
        const a = L.r.pts[i - 1], b = L.r.pts[i];
        if (segD(p[0], p[1], a[0], a[1], b[0], b[1]) <= reach) return L;
      }
    }
    return null;
  };
  // The grids: which cell, what is in it.
  const cell = (p) => { const i = Math.floor((p[0] - doc.world_offset[0]) / doc.cell_m), j = Math.floor((p[1] - doc.world_offset[1]) / doc.cell_m); return i < 0 || j < 0 || i >= doc.w || j >= doc.h ? null : [i, j]; };
  const biome = (p) => { const c = cell(p); return c ? doc.grid[c[1]][c[0]] : null; };
  const coastal = (p) => { const c = cell(p); if (!c) return true; for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const row = doc.grid[c[1] + dj]; if (!row || row[c[0] + di] === undefined || row[c[0] + di] === '.') return true; } return false; };
  const towns = doc.towns ?? [], exits = doc.exits ?? [];
  const nearTown = (p, reach = RULES.townReach) => towns.find((t) => Math.hypot(t.pos[0] - p[0], t.pos[1] - p[1]) <= reach) ?? null;
  const nearExit = (p) => exits.find((e) => Math.hypot(e.pos[0] - p[0], e.pos[1] - p[1]) <= RULES.exitReach || (e.dest && Math.hypot(e.dest[0] - p[0], e.dest[1] - p[1]) <= RULES.exitReach)) ?? null;

  // ---- dead ends
  const deadEnds = [];
  for (const L of lines) {
    if (L.coll === 'streets') continue; // a town's side streets may end; the network check below catches what matters
    for (const end of [0, 1]) {
      const p = end ? L.r.pts[L.r.pts.length - 1] : L.r.pts[0];
      if (nearRoad(p, L.r, RULES.snap) || nearTown(p) || nearExit(p) || coastal(p)) continue;
      deadEnds.push({ coll: L.coll, id: L.r.id, end, pt: p, why: `${L.coll === 'interstates' ? 'the interstate' : 'the road'} stops short of any road, town, exit or coast` });
    }
  }

  // ---- orphans
  const orphans = [];
  const townIds = new Set(towns.map((t) => t.id));
  const roadById = new Map(lines.filter((L) => L.coll !== 'streets').map((L) => [L.r.id, L.r]));
  for (const s of doc.streets ?? []) {
    const m = /^ST-(.+)-[^-]+$/.exec(s.id);
    if (m && !townIds.has(m[1])) orphans.push({ coll: 'streets', id: s.id, pt: s.pts[0], why: `no town "${m[1]}" claims it` });
  }
  // A town's street network that touches no other road (the engine still builds it, but nothing drives there).
  const byTown = new Map();
  for (const s of doc.streets ?? []) { const m = /^ST-(.+)-[^-]+$/.exec(s.id); if (m && townIds.has(m[1])) { let l = byTown.get(m[1]); if (!l) byTown.set(m[1], (l = [])); l.push(s); } }
  for (const [tid, list] of byTown) {
    const reached = list.some((s) => s.pts.some((p) => { const L = nearRoad(p, s, RULES.snap * 2); return L && L.coll !== 'streets'; }) || nearExit(s.pts[0]) || nearExit(s.pts[s.pts.length - 1]));
    if (!reached) { const t = towns.find((x) => x.id === tid); orphans.push({ coll: 'towns', id: tid, pt: t?.pos ?? list[0].pts[0], why: `its ${list.length} street(s) touch no highway, county road or exit` }); }
  }
  for (const p of doc.placements ?? []) {
    if ([...townIds].some((t) => p.id.startsWith(`${t}-`))) continue;
    const road = [...roadById.keys()].find((id) => p.id.startsWith(`${id}-`));
    orphans.push({ coll: 'placements', id: p.id, pt: p.pos, why: road ? `a ghost-site payload of ${road}: the web engine places none yet` : 'no town claims it (the engine places a town\'s slots by id prefix)' });
  }
  for (const e of exits) {
    const hw = roadById.get(e.highway_id);
    if (!hw) { orphans.push({ coll: 'exits', id: e.id, pt: e.pos, why: `highway ${e.highway_id} does not exist` }); continue; }
    let d = Infinity; for (let i = 1; i < hw.pts.length; i++) d = Math.min(d, segD(e.pos[0], e.pos[1], hw.pts[i - 1][0], hw.pts[i - 1][1], hw.pts[i][0], hw.pts[i][1]));
    if (d * K > RULES.exitOff) orphans.push({ coll: 'exits', id: e.id, pt: e.pos, why: `${Math.round(d * K)} m off ${e.highway_id} (the engine skips exits past ${RULES.exitOff} m)` });
    if (!e.dest) orphans.push({ coll: 'exits', id: e.id, pt: e.pos, why: 'no dest: the engine skips it' });
  }

  // ---- water crossings
  const bridged = (road, what) => (road.bridges ?? []).some((b) => b === what || b?.over === what) || (doc.bridges ?? []).some((b) => b.road === road.id && (b.over === what || b.river === what));
  const crossings = [];
  for (const L of lines) {
    if (L.coll === 'streets') continue;
    for (const R of doc.rivers ?? []) for (let i = 1; i < L.r.pts.length; i++) for (let j = 1; j < R.pts.length; j++) {
      const x = segX(L.r.pts[i - 1], L.r.pts[i], R.pts[j - 1], R.pts[j]);
      if (x && !crossings.some((c) => c.id === L.r.id && c.over === R.id && Math.hypot(c.pt[0] - x[0], c.pt[1] - x[1]) < 5)) crossings.push({ coll: L.coll, id: L.r.id, over: R.id, kind: 'river', pt: [Math.round(x[0]), Math.round(x[1])], bridged: bridged(L.r, R.id) });
    }
    // Water cells along the road (lakes, the sea): one finding per run of wet samples.
    let run = null;
    for (let i = 1; i < L.r.pts.length; i++) {
      const a = L.r.pts[i - 1], b = L.r.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / RULES.waterStep));
      for (let k = 0; k < n; k++) {
        const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n], wet = ['w', '.'].includes(biome(p));
        if (wet && !run) run = { from: p, len: 0, kind: biome(p) };
        if (wet && run) { run.len += len / n; run.to = p; }
        if (!wet && run) { if (run.len >= RULES.waterStep * 2) crossings.push({ coll: L.coll, id: L.r.id, over: run.kind === '.' ? 'the sea' : 'open water', kind: 'water', pt: [Math.round((run.from[0] + run.to[0]) / 2), Math.round((run.from[1] + run.to[1]) / 2)], span: Math.round(run.len), bridged: bridged(L.r, run.kind === '.' ? 'sea' : 'water') }); run = null; }
      }
    }
  }
  const open = crossings.filter((c) => !c.bridged);
  return {
    deadEnds, orphans, crossings, engine: engineWarnings,
    counts: { deadEnds: deadEnds.length, orphans: orphans.length, crossings: crossings.length, unbridged: open.length, engine: engineWarnings.length, rows: lines.length },
    ok: !deadEnds.length && !orphans.length && !open.length && !engineWarnings.length,
    ms: Date.now() - t0,
  };
}
