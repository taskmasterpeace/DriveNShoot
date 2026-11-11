// THE HOLDOUT GENERATOR (docs/design/WEB_HOLDOUTS.md): a seed and a few params in, a holdout out - a HOLDOUTS row
// (data/holdouts.js shape) that world/holdout.js lays out like Meridian, its people (data/holdouts.js PEOPLE shape plus
// gatemen and bulls), the Keyholder's card, its HOUSE RULES and its paper. Pure: the same spec gives the same holdout,
// byte for byte (hashHoldout). Rows: data/holdoutgen.js. No second layout system: world/holdout.js does the laying out.
//   generateHoldout(spec)  spec: { id, seed, size: small|medium|large, wealth 0..1, keyholder: kind, region: palette,
//                          side: W|E|N|S (which side of its road it stands), m (metres off the road), polish? }
//   validateHoldouts(rows, opts)  static checks a row must pass to lay out and play (see the function)
//   hashHoldout(gen)       FNV over the generated JSON: the determinism check
import { HOLDOUTS } from '../data/holdouts.js';
import { KINDS } from '../data/ring.js';
import { WALL_KIT, PALETTE, SIZES, KEYHOLDERS, HOUSE_RULES, NAMES, LIMITS, GATE, SCRIP } from '../data/holdoutgen.js';
import { ATLAS_SITES } from '../data/atlas.js';
import { hash32, rngOf } from './geo.js';

const pickW = (rng, rows) => { let t = 0; for (const r of rows) t += r[1]; let p = rng() * t; for (const r of rows) if ((p -= r[1]) < 0) return r[0]; return rows[rows.length - 1][0]; };
const strSeed = (s) => hash32(...[...String(s)].map((c) => c.charCodeAt(0)));
const AVENUES = ['FIRST AVENUE', 'WELL STREET', 'GATE STREET', 'KEY STREET', 'TIN ROW', 'BACK STREET'];
const SKIN = ['#e0b896', '#c8a07a', '#b07a52', '#9a6a44', '#7a4a2e', '#5a3420', '#4a2a18'];
const HAIR = ['#141010', '#2a1a12', '#3a2a20', '#7a5a3a', '#8a5a2a', '#7a7470', '#c8b89a'];
const SHIRT = ['#5a6a4a', '#7a3a2a', '#3f5a62', '#9a4a2e', '#d8d4c8', '#4a4440', '#2f7f8a', '#8a6a44', '#56603f', '#6a2a1a'];
const HATS = ['cowboy', 'cap', 'short', 'long', 'wrap', 'bald'];
const GEAR = ['none', 'none', 'bandolier', 'goggles', 'eyepatch'];

// One holdout from a spec. Returns { spec, row, people, card, rules, scrip }.
export function generateHoldout(spec) {
  const S = SIZES[spec.size] ?? SIZES.medium, K = KEYHOLDERS[spec.keyholder] ?? KEYHOLDERS.baron, Pal = PALETTE[spec.region] ?? PALETTE.florida;
  const pol = spec.polish ?? {}, seed = (spec.seed ?? strSeed(spec.id)) >>> 0, rng = rngOf(hash32(seed, 0x484f4c44));
  const wealth = Math.max(0, Math.min(1, (spec.wealth ?? 0.5) + (K.wealth ?? 0)));
  const id = spec.id, name = pol.name ?? id.replace(/_/g, ' ').toUpperCase();
  const side = spec.side ?? 'W', mainGate = side === 'W' ? 'E' : 'W';
  const [w, d] = S.size, cols = S.cols, t = 2.6, lane = 6, walk = 3;
  // The wall: the kit's weights, leaned by the Keyholder.
  const kit = Pal.kit.map(([k, wt]) => [k, +(wt * (K.kit?.[k] ?? 1)).toFixed(2)]);
  const wall = { h: +(4.6 + wealth * 0.6).toFixed(2), t, panel: 6.2, colors: WALL_KIT.tin.colors, cap: Pal.cap, post: Pal.post,
    tower: { size: 5.2, h: 8.6, roof: Pal.roof }, gate: 16, junk: 0.18, kit };
  // Streets: Main Street gate side to the far wall; N-S avenues evenly between.
  const hw = w / 2, ix0 = -hw + t + lane, ix1 = hw - t - lane, ns = [];
  for (let i = 1; i < cols; i++) ns.push({ at: Math.round(ix0 + ((ix1 - ix0) * i) / cols), w: 10, name: AVENUES[(i - 1 + (seed % 3)) % AVENUES.length] });
  const streets = { ew: [{ at: 0, w: 14, name: 'MAIN STREET', gates: true }], ns };
  // Blocks: column 0 (idx) is the one nearest the main gate.
  const colOf = (idx) => (mainGate === 'W' ? idx : cols - 1 - idx);
  const hall = { kind: 'townhall', label: K.hall ?? 'THE KEYHOLDER\'S HALL' };
  const jail = { kind: 'sheriff', label: 'THE JAIL' }, clinic = { kind: 'clinic', label: 'THE CLINIC' };
  const saloon = { kind: 'cantina', label: 'THE SALOON' }, sutler = { kind: 'store', label: 'THE SUTLER' }, water = { kind: 'water', label: 'WATER' };
  const homes = (n) => { const out = []; for (let k = 0; k < n; k++) out.push(pickW(rng, [['house', 4], ['bungalow', 2 + wealth * 2], ['duplex', 1 + wealth], ['boarding', 1]])); return out; };
  const blocks = [];
  if (cols === 2) blocks.push({ at: [colOf(0), 0], front: 'S', name: 'THE KEY ROW', lots: [hall, jail, clinic], open: 'tower' });
  else blocks.push({ at: [colOf(0), 0], front: 'S', name: 'THE KEY ROW', lots: [hall, jail, clinic], back: homes(5) });
  blocks.push({ at: [colOf(0), 1], front: 'N', name: 'MAIN STREET', lots: [saloon, sutler, water], back: homes(5) });
  blocks.push({ at: [colOf(1), 0], open: 'market', name: 'THE SWAP' });
  blocks.push({ at: [colOf(1), 1], open: 'arena', name: 'THE PIT' });
  if (cols >= 3) {
    blocks.push({ at: [colOf(2), 0], front: 'S', lots: ['gunsmith', 'boarding', 'house'], open: 'tower' });
    blocks.push({ at: [colOf(2), 1], front: 'N', name: 'THE GARAGE', lots: ['mechanic', 'diner'], open: 'yard' });
  }
  if (cols >= 4) {
    blocks.push({ at: [colOf(3), 0], open: 'garden', name: 'THE GARDENS' });
    blocks.push({ at: [colOf(3), 1], open: 'junk', name: 'THE BONEYARD' });
  }
  // The grit: Meridian's rows (REBUILT FROM WRECKAGE), a richer town burns less.
  const G0 = HOLDOUTS.meridian.grit;
  const grit = { ...G0, burn: +Math.max(0.04, 0.32 - wealth * 0.28).toFixed(3), fence: { ...G0.fence }, back: { ...G0.back }, burnt: { ...G0.burnt } };
  const row = {
    id, name, motto: pol.motto ?? `${K.title} KEEPS THE KEY`, generated: true, seed, size: [w, d], approach: 16, shoreGap: 140, mainGate,
    place: { side, m: spec.m ?? 600 }, region: spec.region ?? 'florida',
    faction: { id: 'holdfolk', name: 'The Holdouts', color: '#8a6a3a', start: 10 },
    wall, gates: [{ side: mainGate, at: 0, name: 'THE GATE', main: true }], streets, walk, lane, blocks,
    clinic: { lot: 'clinic', bay: null, fee: 0.2, doctor: `${id}_doc` },
    trees: { ...Pal.trees }, lamps: S.lamps, grit,
  };
  // HOUSE RULES: the polish's, else 1-2 from the table leaned by the Keyholder.
  let rules = pol.rules?.slice() ?? null;
  if (!rules) {
    const n = rng() < 0.55 ? 2 : 1, pool = Object.entries(HOUSE_RULES).map(([k, r]) => [k, r.w + (K.rules?.[k] ?? 0)]);
    rules = [];
    while (rules.length < n) { const k = pickW(rng, pool.filter(([q]) => !rules.includes(q))); rules.push(k); }
  }
  // The Keyholder's card: the polish's name and flag, else drawn; title, a vice, a law, a line the road tells of them.
  const lore = ATLAS_SITES.filter((s) => s.holder === 'keyholder').map((s) => s.what);
  const nm = () => `${rng.pick(NAMES.first)} ${rng.pick(NAMES.last)}`;
  const flag = () => pickW(rng, Pal.flags);
  const card = { name: pol.keyholder?.name ?? nm(), flag: pol.keyholder?.flag ?? flag(), title: K.title, kind: spec.keyholder ?? 'baron', hall: hall.label,
    vice: rng.pick(K.vices), law: rng.pick(K.laws), lore: lore.length ? lore[seed % lore.length] : '', motto: row.motto, incorruptible: !!K.incorruptible };
  // The paper: its name, a colour, the house's toll, the bribe and the lie the gatemen weigh.
  const scrip = { id, name: pol.scrip ?? K.scrip.replace('{TOWN}', name), short: name.slice(0, 3), face: SCRIP.face, color: rng.pick(['#7a8a4a', '#8a6a3a', '#3f6f6a', '#9a5a2a', '#5a7a8a']) };
  const toll = Math.round(GATE.tollPaper[0] + (GATE.tollPaper[1] - GATE.tollPaper[0]) * wealth);
  const gate = { toll, bribe: Math.round(GATE.bribe[0] + (GATE.bribe[1] - GATE.bribe[0]) * (0.4 + 0.6 * wealth)), lie: Math.round(GATE.lie[0] + (GATE.lie[1] - GATE.lie[0]) * (K.incorruptible ? 0.8 : rng() * 0.6)), incorruptible: !!K.incorruptible };
  // People: the Keyholder in the hall, a doctor, the saloon keeper, the sutler; gatemen either side of the gate, bulls on
  // the towers' feet, the Swap, Main Street and the pit; townsfolk at the Swap, the pit and on Main Street.
  const portrait = (s) => ({ seed: s, skin: rng.pick(SKIN), hair: rng.pick(HAIR), hat: rng.pick(HATS), mood: rng.pick(['neutral', 'neutral', 'smile']), shirt: rng.pick(SHIRT), gear: rng.pick(GEAR) });
  const pseed = (k) => (seed % 100000) * 10 + k;
  const named = [
    { id: `${id}_key`, name: card.name, title: `${card.title} · ${name}`, flag: card.flag, at: 'townhall', job: 'keyholder', weapon: 'pistol', essential: true, keyholder: true,
      portrait: { ...portrait(pseed(1)), hat: rng.pick(['cowboy', 'short', 'long']), gear: rng.pick(['bandolier', 'none', 'goggles']) } },
    { id: `${id}_doc`, name: nm(), title: `Doctor · ${name}`, flag: flag(), at: 'clinic', job: 'doctor', essential: true, trades: { deals: ['med'] }, portrait: portrait(pseed(2)) },
    { id: `${id}_bar`, name: nm(), title: `Keeper · The Saloon`, flag: flag(), at: 'cantina', job: 'barkeep', trades: { deals: ['food', 'water'] }, portrait: portrait(pseed(3)) },
    { id: `${id}_sut`, name: nm(), title: `Sutler · ${name}`, flag: flag(), at: 'store', job: 'trader', trades: { deals: ['food', 'water', 'tool', 'pack', 'valuable', 'paper', 'ammo'] }, portrait: portrait(pseed(4)) },
  ];
  const main = `gate:${mainGate}`;
  const people = {
    named,
    gatemen: { count: 2, spot: main, weapon: [['shotgun', 2], ['smg', 1]], hp: 130, rounds: [12, 24] },
    bulls: { count: S.bulls + Math.round(wealth * 2), spots: [main, 'market', 'main', 'pit', 'market', 'main', 'pit', 'main'], weapon: [['smg', 2], ['rifle', 1], ['shotgun', 2], ['pistol', 1]], hp: 130, rounds: [16, 40] },
    folk: [
      { job: 'stallkeeper', spot: 'market', count: 3 + Math.round(wealth * 2) }, { job: 'pit fighter', spot: 'pit', count: 2 },
      { job: 'townsfolk', spot: 'main', count: Math.max(4, S.folk - 10) }, { job: 'patient', spot: 'clinic', count: 1 },
      ...(cols >= 4 ? [{ job: 'farmer', spot: 'garden', count: 3 }, { job: 'scrapper', spot: 'junk', count: 2 }] : []),
      ...(cols >= 3 ? [{ job: 'mechanic hand', spot: 'yard', count: 1 }] : []),
    ],
    flags: Pal.flags, promoteR: 420, demoteR: 760,
  };
  return { spec: { ...spec, seed }, row, people, card, rules, scrip, gate, wealth: +wealth.toFixed(3) };
}

// FNV over the generated holdout's JSON (numbers to the millimetre): the same spec must give the same hash.
export function hashHoldout(gen) {
  const s = JSON.stringify(gen, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) : v));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// Hue 270-320 is purple: the art law bans it.
function purple(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return false;
  const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn;
  if (dd < 0.08) return false;
  let h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
  h = (h * 60 + 360) % 360;
  return h >= 270 && h <= 320;
}

// Validate holdout rows: a HOLDOUTS row (Meridian) or a generator's output ({ row, people, card, rules, scrip }).
// opts.flags: the real flag keys (ui/portrait.js). Returns { ok, checked, errors: [..], warnings: [..] }.
//   - ids unique; a name; the wall's size, height and gate width in LIMITS; at least one gate on a real side
//   - one Main Street through the gates; every block inside the street grid, no two on one cell
//   - every lot a KINDS kind; a generated town has the hall, the jail, the clinic, the saloon, the sutler, the Swap,
//     the pit and the water tower; each front row fits its block (widest buildings plus the gaps)
//   - no colour anywhere in the row is purple
//   - generated: 1-2 HOUSE RULES from the table; a Keyholder card (name, title, vice, law, a real flag); bulls in range;
//     every person's flag real; the paper named
export function validateHoldouts(rows, opts = {}) {
  const errors = [], warnings = [], seen = new Set(), flags = opts.flags ? new Set(opts.flags) : null;
  const list = Array.isArray(rows) ? rows : Object.values(rows);
  for (const it of list) {
    const gen = it.row ? it : null, R = gen ? it.row : it, tag = R?.id ?? '?';
    const E = (m) => errors.push(`${tag}: ${m}`);
    if (!R?.id) { E('no id'); continue; }
    if (seen.has(R.id)) E('duplicate id'); seen.add(R.id);
    if (!R.name) E('no name');
    const [w, d] = R.size ?? [0, 0];
    if (!(w >= LIMITS.wall[0] && w <= LIMITS.wall[1] && d >= LIMITS.wall[0] && d <= LIMITS.wall[1])) E(`wall size ${w}x${d} outside ${LIMITS.wall}`);
    if (!(R.wall?.h >= LIMITS.wallH[0] && R.wall?.h <= LIMITS.wallH[1])) E(`wall height ${R.wall?.h}`);
    if (!(R.wall?.gate >= LIMITS.gate[0] && R.wall?.gate <= LIMITS.gate[1])) E(`gate width ${R.wall?.gate}`);
    if (!R.gates?.length || R.gates.some((g) => !'NSEW'.includes(g.side))) E('gates');
    const ew = R.streets?.ew ?? [], ns = R.streets?.ns ?? [];
    if (ew.filter((s) => s.gates).length !== 1) E('Main Street: one E-W street must run gate to gate');
    const cells = new Set();
    for (const B of R.blocks ?? []) {
      const [c, r] = B.at ?? [-1, -1];
      if (!(c >= 0 && c <= ns.length && r >= 0 && r <= ew.length)) E(`block ${B.at} outside the ${ns.length + 1}x${ew.length + 1} grid`);
      if (cells.has(`${c},${r}`)) E(`two blocks on ${c},${r}`); cells.add(`${c},${r}`);
      for (const L of [...(B.lots ?? []), ...(B.back ?? [])]) { const k = Array.isArray(L) ? L[0] : typeof L === 'object' ? L.kind : L; if (!KINDS[k]) E(`lot kind ${k}`); }
      if (B.open && !['market', 'garden', 'arena', 'junk', 'tower', 'yard'].includes(B.open)) E(`open lot ${B.open}`);
      // The front row must fit its block (the layout drops what does not).
      if (B.lots && (B.front === 'N' || B.front === 'S')) {
        const hw = w / 2, t = R.wall.t, lane = R.lane ?? 6, walk = R.walk ?? 3, ix0 = -hw + t + lane, ix1 = hw - t - lane, xs = [ix0, ...ns.map((s) => s.at), ix1];
        const half = (i) => (i === 0 || i === xs.length - 1 ? 0 : ns[i - 1].w / 2 + walk), bw = xs[c + 1] - half(c + 1) - (xs[c] + half(c));
        const kinds = []; for (const L of B.lots) { if (Array.isArray(L)) for (let k = 0; k < L[1]; k++) kinds.push(L[0]); else kinds.push(typeof L === 'object' ? L.kind : L); }
        const need = kinds.reduce((s, k) => s + (KINDS[k]?.w[1] ?? 0), 0) + 3.2 * (kinds.length + 1);
        if (need > bw) (gen ? E : (m) => warnings.push(`${tag}: ${m}`))(`block ${B.at}: front row needs ${need.toFixed(1)} m, has ${bw.toFixed(1)}`);
      }
    }
    // No purple anywhere in the row.
    const walk = (v, path) => { if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) && purple(v)) E(`purple ${v} at ${path}`); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`); };
    walk(R, 'row');
    if (gen) {
      const kinds = new Set(), opens = new Set();
      for (const B of R.blocks) { for (const L of B.lots ?? []) kinds.add(typeof L === 'object' && !Array.isArray(L) ? L.kind : L); if (B.open) opens.add(B.open); }
      for (const k of ['townhall', 'sheriff', 'clinic', 'cantina', 'store']) if (!kinds.has(k)) E(`no ${k}`);
      for (const o of ['market', 'arena', 'tower']) if (!opens.has(o)) E(`no ${o}`);
      if (!(gen.rules?.length >= LIMITS.rules[0] && gen.rules.length <= LIMITS.rules[1])) E(`house rules ${gen.rules?.length}`);
      for (const r of gen.rules ?? []) if (!HOUSE_RULES[r]) E(`house rule ${r}`);
      const C = gen.card;
      if (!C?.name || !C.title || !C.vice || !C.law) E('Keyholder card incomplete');
      if (flags && !flags.has(C?.flag)) E(`Keyholder flag ${C?.flag}`);
      const P = gen.people;
      if (!(P?.bulls?.count >= LIMITS.bulls[0] && P.bulls.count <= LIMITS.bulls[1])) E(`bulls ${P?.bulls?.count}`);
      if (!(P?.gatemen?.count >= 1)) E('no gatemen');
      if (flags) { for (const n of P?.named ?? []) if (!flags.has(n.flag)) E(`flag ${n.id} ${n.flag}`); for (const [f] of P?.flags ?? []) if (!flags.has(f)) E(`flag mix ${f}`); }
      if (!gen.scrip?.name) E('no paper');
      if (!(gen.wealth >= LIMITS.wealth[0] && gen.wealth <= LIMITS.wealth[1])) E(`wealth ${gen.wealth}`);
    }
  }
  return { ok: !errors.length, checked: list.length, errors, warnings };
}
