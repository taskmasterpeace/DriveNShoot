// THE WORK OF A SETTLEMENT (docs/design/WEB_OCCUPATIONS.md; rows in data/occupations.js). Pure: who works at what in a
// planned settlement is a function of its plan record (systems/citygen.js planWorld), its SITE row if it has one, and
// the occupation rows. No randomness that is not seeded; no allocation concerns (it runs once per settlement, not per
// frame). systems/workforce.js turns a roster into people; tools/role-diversity.mjs scores every settlement's mix.
import { OCCUPATIONS, MIX, GOAL, ARCH_TAGS, BIOME_TAGS, SITE_KIND_TAGS, MAKES_TAGS, HERO_TAGS, FACTION_CLASS, TOWN_CLASS, SITE_WEALTH } from '../data/occupations.js';
import { ARCHETYPES } from '../data/citygen.js';
import { SITES_BY_ID } from '../data/sites/index.js';
import { LAYOUT_ARCH, LAYOUT_NEW_ARCH, kindOf } from './citygen/site.js';

// [0, 1) from a seed and a label (FNV-1a over the label, mixed with the seed)
export function hashU(seed, label) {
  let h = (0x811c9dc5 ^ (seed >>> 0)) >>> 0;
  for (let i = 0; i < label.length; i++) { h ^= label.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
const BASE_KINDS = ['barracks', 'hq', 'guardhouse', 'warehouse', 'quonset', 'auto_shop', 'house', 'bungalow'];
const lerp = (r, u) => Math.round(r[0] + (r[1] - r[0]) * u);

// Everything the mix reads about a settlement: { id, kind, key (same-kind neighbours share it), arch, tags (Set), cls,
// wealth, pop, n (its workforce), kinds (Set of building kinds it has), heroes (its hero structure names), spots (Set) }.
// null for what is nobody's workplace (a homestead, a dead ruin, a base without a site row).
export function profileOf(rec) {
  if (!rec || (rec.kind !== 'town' && rec.kind !== 'site')) return null;
  const tags = new Set(), add = (L) => { for (const t of L ?? []) tags.add(t); };
  const seed = rec.seed >>> 0;
  let arch, pop, wealth, cls = 'free', kinds = new Set(), heroes = [], walls = rec.walls ?? 'none', key, row = null;
  if (rec.kind === 'town') {
    arch = rec.arch;
    const A = ARCHETYPES[arch]; if (!A) return null;
    pop = lerp(A.pop, hashU(seed, 'pop'));
    wealth = A.wealth + (hashU(seed, 'wealth') - 0.5) * 0.3;
    cls = TOWN_CLASS[arch] ?? (hashU(seed, 'raiders') < (TOWN_CLASS.raiderChance[arch] ?? 0) ? 'raider' : 'free');
    for (const z of Object.values(A.kinds ?? {})) for (const k of Object.keys(z)) kinds.add(k);
    walls = A.walls ?? walls;
    key = `town:${arch}`;
  } else {
    row = SITES_BY_ID.get(rec.site); if (!row) return null;
    const tpl = row.layout_new && LAYOUT_NEW_ARCH[row.layout_new];
    arch = row.kind === 'military' ? 'military_base' : tpl ? tpl[0] : LAYOUT_ARCH[row.layout] ?? 'county_seat';
    const P = row.society?.pop ?? [0, 0];
    pop = lerp(P, hashU(seed, 'pop'));
    if ((P[1] ?? 0) < MIX.minPop) return null;
    wealth = (SITE_WEALTH[row.kind] ?? 0.35) + (hashU(seed, 'wealth') - 0.5) * 0.3;
    const f = String(row.society?.faction ?? 'none');
    for (const [re, c] of FACTION_CLASS) if (re.test(f)) { cls = c; break; }
    if (arch === 'military_base') for (const k of BASE_KINDS) kinds.add(k);
    else for (const z of Object.values(ARCHETYPES[arch]?.kinds ?? {})) for (const k of Object.keys(z)) kinds.add(k);
    for (const s of row.structures ?? []) { heroes.push(s.kind); const k = kindOf(s.kind); if (k) kinds.add(k); }
    add(SITE_KIND_TAGS[row.kind]);
    for (const m of row.economy?.makes ?? []) for (const [re, t] of MAKES_TAGS) if (re.test(m)) tags.add(t);
    for (const h of heroes) for (const [re, t] of HERO_TAGS) if (re.test(h)) tags.add(t);
    for (const w of row.terrain?.water ?? []) { tags.add('water'); if (w === 'sea') { tags.add('sea'); tags.add('coast'); } else if (/river|creek/.test(w)) tags.add('river'); else if (/lake|reservoir/.test(w)) tags.add('lake'); }
    walls = row.walls?.type ?? walls;
    key = `site:${row.kind}`;
  }
  add(ARCH_TAGS[arch]); add(BIOME_TAGS[rec.biome ?? row?.biome]);
  if ((row?.region ?? rec.region) === 'FL' || rec.region === 'florida') tags.add('florida');
  if (cls === 'raider') tags.add('raiding');
  const n = Math.max(MIX.minWorkers, Math.min(MIX.maxWorkers, Math.round(pop * MIX.workShare)));
  const spots = new Set(['street', 'edge']);
  if ((walls && walls !== 'none') || ['holdout', 'walled', 'camp', 'military'].some((t) => tags.has(t)) || ['raider', 'warlord', 'garrison'].includes(cls)) spots.add('gate');
  if (tags.has('water')) spots.add('dock');
  if (['farm', 'ranch', 'plains', 'pueblo', 'oasis', 'river', 'salt', 'desert'].some((t) => tags.has(t))) spots.add('field');
  return { id: rec.id, kind: rec.kind, key, arch, site: rec.site ?? null, tags, cls, wealth: +wealth.toFixed(3), pop, n, kinds, heroes, spots, x: rec.x, z: rec.z, seed };
}

// Where a job is worked in this settlement: { at: building kind } | { hero: structure name } | { out: spot } | null
export function workplaceOf(o, P) {
  for (const k of o.at ?? []) if (P.kinds.has(k)) return { at: k };
  if (o.hero) { const re = new RegExp(o.hero); const h = P.heroes.find((s) => re.test(s)); if (h) return { hero: h }; }
  if (o.out && P.spots.has(o.out)) return { out: o.out };
  return null;
}

// A job's score in this settlement (0: not here)
export function scoreOf(id, o, P, mix = MIX) {
  if (o.needs?.length && !o.needs.some((t) => P.tags.has(t))) return 0;
  if (o.bans?.some((t) => P.tags.has(t))) return 0;
  if (o.minN && P.n < o.minN) return 0;
  if (!workplaceOf(o, P)) return 0;
  let w = o.base;
  for (const t of P.tags) w += o.fit?.[t] ?? 0;
  w *= o.fac?.[P.cls] ?? 1;
  if (o.wealth && (P.wealth < o.wealth[0] || P.wealth > o.wealth[1])) w *= mix.offWealth;
  if (w <= 0) return 0;
  return w * Math.exp(mix.jitter * (hashU(P.seed, id) * 2 - 1));
}

// How strongly a job fits a place: the sum of its fit over the place's tags
export function fitOf(o, P) { let f = 0; for (const t of P.tags) f += o.fit?.[t] ?? 0; return f; }

// The mix: [{ id, n, share }] by count (desc, then id), summing to P.n. Shares go by score, a job never past its cap
// (row `max`, else MIX.cap; `one` = a single worker) unless every job is capped and people are left over.
export function mixOf(P, rows = OCCUPATIONS, mix = MIX) {
  let ids = [], w = [], cap = [];
  for (const [id, o] of Object.entries(rows)) {
    const s = scoreOf(id, o, P, mix);
    if (s > 0) { ids.push(id); w.push(s); cap.push(o.one ? 1 / P.n : Math.max(1 / P.n, o.max ?? mix.cap)); }
  }
  if (!ids.length) return [];
  // THE TAIL: a trade that would keep fewer than MIX.tailN people here is here only by the seed's say (MIX.tailKeep): not
  // every farm town has a beekeeper. One-of-a-kind posts (`one`) are a town's or not by their own rows, and a CORE trade (its fit to
  // the place times its holder factor at least MIX.tailCore: the mine's diggers, the base's sentries) is never left to the seed.
  if (mix.tailN > 0 && mix.tailKeep < 1 && P.n >= mix.tailFrom) {
    const sh0 = waterFill(w, cap), keep = ids.map((id, i) => rows[id].one || sh0[i] * P.n >= mix.tailN || fitOf(rows[id], P) * (rows[id].fac?.[P.cls] ?? 1) >= mix.tailCore || hashU(P.seed, `${id}|tail`) < mix.tailKeep);
    if (keep.some(Boolean)) { ids = ids.filter((_, i) => keep[i]); w = w.filter((_, i) => keep[i]); cap = cap.filter((_, i) => keep[i]); }
  }
  const sh = waterFill(w, cap);
  return apportion(P, ids, w, cap, sh);
}
// Shares under the caps (water-filling); if every job is capped and people are left over, the best fit takes them.
function waterFill(w, cap) {
  const sh = new Array(w.length).fill(0), fixed = new Array(w.length).fill(false);
  let left = 1;
  for (let it = 0; it < w.length && left > 1e-9; it++) {
    let tw = 0; for (let i = 0; i < w.length; i++) if (!fixed[i]) tw += w[i];
    if (tw <= 0) break;
    let over = false;
    for (let i = 0; i < w.length; i++) if (!fixed[i] && left * w[i] / tw > cap[i]) { sh[i] = cap[i]; fixed[i] = true; over = true; }
    if (!over) { for (let i = 0; i < w.length; i++) if (!fixed[i]) sh[i] = left * w[i] / tw; left = 0; break; }
    left = 1 - sh.reduce((a, b, i) => a + (fixed[i] ? b : 0), 0);
  }
  if (left > 1e-9) { const top = w.indexOf(Math.max(...w)); sh[top] += left; } // everyone capped: the rest go to the best fit
  return sh;
}
function apportion(P, ids, w, cap, sh) {
  // whole people: floors, then the largest remainders, never past a cap's whole count unless nothing else can take one
  const N = P.n, cnt = sh.map((s) => Math.floor(s * N + 1e-9)), maxN = cap.map((c) => Math.max(1, Math.floor(c * N + 1e-9)));
  let rest = N - cnt.reduce((a, b) => a + b, 0);
  const order = ids.map((_, i) => i).sort((a, b) => (sh[b] * N - cnt[b]) - (sh[a] * N - cnt[a]) || (ids[a] < ids[b] ? -1 : 1));
  for (let pass = 0; pass < 2 && rest > 0; pass++) for (const i of order) { if (rest <= 0) break; if (pass === 0 && cnt[i] >= maxN[i]) continue; cnt[i]++; rest--; }
  return ids.map((id, i) => ({ id, n: cnt[i], share: +(cnt[i] / N).toFixed(3) })).filter((j) => j.n > 0).sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1));
}

// Shannon diversity (natural log) of a mix
export function shannon(jobs) {
  const N = jobs.reduce((a, j) => a + j.n, 0); let H = 0;
  for (const j of jobs) if (j.n > 0) { const p = j.n / N; H -= p * Math.log(p); }
  return H;
}
export function jaccardDistance(a, b) {
  const A = new Set(a), B = new Set(b); let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  return uni ? 1 - inter / uni : 0;
}

// Score every settlement against the goal (data/occupations.js GOAL). recs: plan records (towns and sites; the rest are
// skipped). Returns { towns: [{ id, key, n, H, maxShare, top, nb, jd, pass: { H, cap, jac }, jobs }], summary }.
export function evaluate(recs, rows = OCCUPATIONS, mix = MIX, goal = GOAL) {
  const out = [];
  for (const rec of recs) {
    const P = profileOf(rec); if (!P) continue;
    const jobs = mixOf(P, rows, mix);
    const H = shannon(jobs), maxShare = jobs.length ? Math.max(...jobs.map((j) => j.share)) : 1;
    out.push({ id: P.id, name: rec.name ?? null, key: P.key, cls: P.cls, x: P.x, z: P.z, n: P.n, H: +H.toFixed(3), maxShare, top: jobs[0]?.id ?? null, kinds: jobs.length, jobs, set: jobs.map((j) => j.id) });
  }
  const R = mix.neighbourKm * 1000;
  for (const t of out) {
    let best = null, bd = R;
    for (const u of out) if (u !== t && u.key === t.key) { const d = Math.hypot(u.x - t.x, u.z - t.z); if (d < bd) { bd = d; best = u; } }
    t.nb = best?.id ?? null; t.nbKm = best ? +(bd / 1000).toFixed(1) : null;
    t.jd = best ? +jaccardDistance(t.set, best.set).toFixed(3) : 1;
    t.pass = { H: t.H >= goal.shannon, cap: t.maxShare <= goal.maxShare + 1e-9, jac: t.jd >= goal.jaccard };
  }
  const N = out.length || 1, k = (f) => out.filter((t) => t.pass[f]).length;
  const passH = k('H'), passCap = k('cap'), passJac = k('jac'), all = out.filter((t) => t.pass.H && t.pass.cap && t.pass.jac).length;
  const minH = out.length ? Math.min(...out.map((t) => t.H)) : 0;
  return {
    towns: out,
    summary: { settlements: out.length, passH, passCap, passJac, passAll: all, minH: +minH.toFixed(3), meanH: +(out.reduce((a, t) => a + t.H, 0) / N).toFixed(3),
      worstShare: out.length ? Math.max(...out.map((t) => t.maxShare)) : 0, score: +((passH + passCap + passJac) / (3 * N)).toFixed(4) },
  };
}

// The roster: one entry per worker, in a stable order: { n (0..), occ, shift, makes, work (workplace) }
export function rosterOf(rec, rows = OCCUPATIONS) {
  const P = profileOf(rec); if (!P) return { P: null, workers: [] };
  const workers = [];
  for (const j of mixOf(P, rows)) for (let i = 0; i < j.n; i++) { const o = rows[j.id]; workers.push({ n: workers.length, occ: j.id, k: i, shift: o.shift, work: workplaceOf(o, P) }); }
  return { P, workers };
}
// Is game hour h inside a shift [from, to] (to < from runs past midnight)?
export function onShift(shift, h) { const [a, b] = shift; return a < b ? h >= a && h < b : h >= a || h < b; }
