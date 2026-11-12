// TOWN LIFE, RUN (docs/design/WEB_TOWNS_ROADS.md; rows in data/towns.js). Citygen stamps a town or a peopled SITE when you
// come near and releases it when you leave (systems/citygen.js stamp / release call onBuilt / onReleased here). This puts
// in it what makes it a place you stop at:
//   counters  fuel, food and ammo. Each is kept by the town's OWN worker of a fitting job (systems/workforce.js: their name,
//             flag and record; they do not also walk their ordinary shift while they keep it), else a hand the town took on
//             for it (seeded name and flag). The keeper stands behind the counter in its hours and not in the curfew; the
//             counter is the keeper's box (systems/trade.js: with them there taking is buying, putting is selling; with them
//             gone it is stealing). The box's opening stock is rolled ONCE (inventory.registerRing keeps it across stamps
//             and saves); after that only what the town's workers made (systems/workforce.js stock, moved on as it is made)
//             or a delivery brought (systems/rites.js takeDelivery) goes on it. Prices carry the region (REGION_ECON).
//   rulers    a SITE row with society.ruler stands that ruler (named, flagged, armed, of the site) and two guards at its
//             biggest building; they hold their spot and speak the row's house rules. Killed, they stay dead (this.recs).
// Everything that persists is in this.recs (the save): who of the keepers, rulers and guards is dead.
import { COUNTERS, COUNTER_KINDS, REGION_ECON, RULER } from '../data/towns.js';
import { OCCUPATIONS } from '../data/occupations.js';
import { TRADERS } from '../data/trade.js';
import { LOOT } from '../data/items.js';
import { SITES_BY_ID } from '../data/sites/index.js';
import { makeRng } from '../engine/rng.js';
import { outfit } from './characters.js';
import { randomName } from '../data/npcs.js';
import { townFacts, curfewText } from '../world/townroads.js';

const hashS = (s) => { let v = 2166136261; for (let i = 0; i < s.length; i++) { v ^= s.charCodeAt(i); v = Math.imul(v, 16777619); } return v >>> 0; };
const hh = (h) => `${String(h % 24).padStart(2, '0')}:00`;
const inSpan = (h, [a, b]) => (a < b ? h >= a && h < b : h >= a || h < b);
const SKIN = ['#9a6a44', '#c08a62', '#6a4a32', '#e0b48a', '#8a5a3a'];
export const TOWNLIFE = { tick: 1, reach: 2.4 };

export class TownLife {
  constructor(g) {
    this.g = g;
    this.live = new Map();  // rec id -> { t, rec, facts, counters: [{ kind, keeper: rec, c, box, spot }], ruler, guards }
    this.recs = new Map();  // rec id -> { dead: [keys] }
    this.t = 0;
    this.counts = { built: 0, keepers: 0, rulers: 0, delivered: 0, opened: 0 };
    // the counters' opening stock tables, one per counter kind and region (rolled once per box: LOOT[...].all)
    for (const k of COUNTER_KINDS) for (const [r, E] of Object.entries(REGION_ECON)) {
      const id = `tl_${k}_${r}`, f = E.stock[k];
      if (!LOOT[id]) LOOT[id] = { all: true, rolls: [1, 1], none: 0, rows: COUNTERS[k].stock.map(([it, lo, hi]) => [it, 1, Math.round(lo * f), Math.max(Math.round(lo * f), Math.round(hi * f))]).filter((q) => q[3] > 0) };
    }
  }
  rec(id) { let r = this.recs.get(id); if (!r) this.recs.set(id, (r = { dead: [] })); return r; }

  // ---- citygen's hooks ----------------------------------------------------------------------------------------------
  onBuilt(t) {
    const rec = t.rec;
    if ((rec.kind !== 'town' && rec.kind !== 'site') || t.T.mb || rec.state === 'overrun') return;
    const g = this.g, R = this.rec(rec.id), facts = townFacts(rec, t.T);
    const s = { t, rec, facts, counters: [], ruler: null, guards: [], used: new Set() };
    this.live.set(rec.id, s);
    this.counts.built++;
    const B = g.workforce?.book(t) ?? null;
    for (const kind of COUNTER_KINDS) this.counter(s, kind, B, R);
    const row = rec.kind === 'site' ? SITES_BY_ID.get(rec.site) : null;
    if (row?.society?.ruler) this.ruler(s, row, R);
    this.sync(s, true);
  }
  onReleased(t) {
    const s = this.live.get(t.rec.id);
    if (!s) return;
    const g = this.g, R = this.rec(s.rec.id);
    for (const k of s.counters) { this.dismiss(k, R); if (k.box) g.inventory?.unregisterRing([k.q]); if (k.keeper.w) k.keeper.w.counter = null; }
    for (const c of [s.ruler, ...s.guards]) if (c) { if (!c.alive && !R.dead.includes(c.tlKey)) R.dead.push(c.tlKey); if (g.chars.includes(c)) g.removeChar(c); }
    this.live.delete(t.rec.id);
  }

  // ---- counters -----------------------------------------------------------------------------------------------------
  // Who keeps it (the town's worker of the first fitting job, else a hired hand), where (a fitting building's front door,
  // else the main street's kerb), and its box.
  counter(s, kind, B, R) {
    const g = this.g, C = COUNTERS[kind], rec = s.rec, t = s.t;
    let w = null;
    if (B) for (const o of C.occ) { w = B.workers.find((q) => q.occ === o && !q.counter && !s.counters.some((k) => k.keeper.w === q)); if (w) break; }
    const key = `${kind}`;
    const rng = makeRng(hashS(`${rec.id}:${kind}:keeper`));
    const keeper = w ? { id: `tl.${w.id}`, name: w.name, flag: w.flag, w, occ: w.occ, key, hired: false }
      : { id: `tl.${rec.id}.${kind}`, name: randomName(rng), flag: rng() < 0.55 ? 'US' : g.randomFlag(rng), w: null, occ: null, key, hired: true };
    if (w) w.counter = kind; // the workforce leaves them to the counter
    const spot = this.spotFor(s, C, kind);
    const region = s.facts.region, E = REGION_ECON[region];
    TRADERS[keeper.id] = { name: keeper.name.split(' ')[0], deals: C.deals, keeps: [], priceMul: E?.price[kind] ?? 1, counter: kind, town: rec.id };
    // the counter box: in front of where they stand, toward the street (registerRing: kept and saved once opened)
    const q = { id: `tl:${rec.id}:${kind}`, table: `tl_${kind}_${region}`, x: spot.x + spot.ox * 1.1, z: spot.z + spot.oz * 1.1, cap: 40, label: `${C.label} · ${keeper.name.toUpperCase()}` };
    const inv = g.inventory;
    if (inv) { inv.registerRing([q]); const box = inv.boxes.get(q.id); if (box) box.y = t.built.y0 ?? rec.y ?? 0; }
    const k = { kind, C, keeper, spot, q, box: inv?.boxes.get(q.id) ?? null, c: null, dead: R.dead.includes(`keeper:${kind}`) || (w && !w.alive) };
    s.counters.push(k);
    this.counts.keepers++;
    return k;
  }
  spotFor(s, C, kind) {
    const t = s.t, T = t.T;
    const L = t.blds.map((r) => r.B).filter((b) => !b.ruined && C.at.includes(b.kind) && !s.used.has(b.id)).sort((a, b) => C.at.indexOf(a.kind) - C.at.indexOf(b.kind));
    const b = L[0];
    if (b) {
      s.used.add(b.id);
      const d = b.doors?.find((q) => q.side === b.front) ?? b.doors?.[0];
      const [x, z, nx, nz] = !d ? [(b.x0 + b.x1) / 2, b.z1, 0, 1] : d.side === 'N' ? [d.at, b.z0, 0, -1] : d.side === 'S' ? [d.at, b.z1, 0, 1] : d.side === 'W' ? [b.x0, d.at, -1, 0] : [b.x1, d.at, 1, 0];
      return { x: x + nx * 1.3, z: z + nz * 1.3, ox: nx, oz: nz, face: Math.atan2(nx, nz), label: (b.hero ?? b.name ?? b.kind).replace(/_/g, ' '), bid: b.id };
    }
    // the main street's kerb, a stall a third of the way along (fuel, food, ammo spread apart)
    const r = (T.roads ?? []).find((q) => q.main) ?? T.roads?.[0];
    const u = { fuel: 0.3, food: 0.5, ammo: 0.7 }[kind] ?? 0.5;
    if (!r) return { x: t.rec.x + (u - 0.5) * 30, z: t.rec.z, ox: 0, oz: 1, face: 0, label: 'the street', bid: null };
    if (r.axis === 'x') { const x = r.x0 + (r.x1 - r.x0) * u; return { x, z: r.z0 - 1.6, ox: 0, oz: 1, face: 0, label: 'the street', bid: null }; }
    const z = r.z0 + (r.z1 - r.z0) * u; return { x: r.x0 - 1.6, z, ox: 1, oz: 0, face: Math.PI / 2, label: 'the street', bid: null };
  }
  isOpen(s, k, h = this.g.sky?.time ?? 12) { return inSpan(h, k.C.hours) && !(s.facts.curfew && inSpan(h, s.facts.curfew)); }
  // The keeper in when the counter is open, out when it shuts (they go home: the counter is shut, not robbed of its keeper).
  sync(s) {
    for (const k of s.counters) {
      if (k.c && !k.c.alive) { this.died(s, k); continue; }
      const open = !k.dead && this.isOpen(s, k);
      if (open && !k.c) this.seat(s, k);
      else if (!open && k.c) this.dismiss(k, this.rec(s.rec.id));
    }
  }
  seat(s, k) {
    const g = this.g, rng = makeRng(hashS(k.keeper.id)), o = k.keeper.occ ? OCCUPATIONS[k.keeper.occ] : null;
    const gun = o?.carry?.find((i) => i.startsWith('gun_'));
    const weapon = k.kind === 'ammo' ? 'shotgun' : gun ? { gun_pistol: 'pistol', gun_smg: 'smg', gun_shotgun: 'shotgun', gun_rifle: 'rifle' }[gun] ?? null : null;
    const title = `${k.C.title} · ${s.rec.name}`;
    const c = g.addChar({ x: k.spot.x, z: k.spot.z, faction: 'drifter', weapon, hp: k.keeper.w?.hp ?? 100, colors: outfit('drifter', rng), name: k.keeper.name, flag: k.keeper.flag,
      npc: { id: k.keeper.id, name: k.keeper.name, title, flag: k.keeper.flag, faction: 'drifter', portrait: { seed: hashS(k.keeper.id) % 997, skin: rng.pick(SKIN), hair: '#2a1e18', hat: 'none', mood: 'neutral', shirt: '#6a5a44', gear: 'none' }, ...this.keeperTalk(s, k) } });
    if (!c) return null;
    c.townlife = s.rec.id; c.title = title; c.face = k.spot.face; c.hold = true; c.post = { x: k.spot.x, z: k.spot.z, face: k.spot.face, role: 'counter' };
    if (k.box) k.box.owner = c.id;
    k.c = c;
    return c;
  }
  dismiss(k) {
    const g = this.g, c = k.c;
    if (!c) return;
    if (k.keeper.w) { k.keeper.w.hp = c.alive ? c.hp : 0; if (!c.alive) k.keeper.w.alive = false; }
    if (g.chars.includes(c)) g.removeChar(c);
    k.c = null;
  }
  died(s, k) {
    const R = this.rec(s.rec.id), key = `keeper:${k.kind}`;
    if (!R.dead.includes(key)) R.dead.push(key);
    if (k.keeper.w) k.keeper.w.alive = false;
    k.dead = true; k.c = null; // the body stays where it fell (the world's own death path); the counter is nobody's now
    this.g.emit?.('keeperDied', { town: s.rec.id, kind: k.kind, name: k.keeper.name });
  }
  keeperTalk(s, k) {
    const sys = this, f = s.facts;
    const who = () => { const r = s.ruler; return r?.alive ? `"${r.name}. ${r.title}. Go and see." ` : '"Nobody, and we like it."'; };
    return { start: 'hi', nodes: {
      hi: { text: () => `"${k.C.label}. Open ${hh(k.C.hours[0])} to ${hh(k.C.hours[1])}. ${REGION_ECON[f.region]?.note ?? ''}"`, choices: [
        { t: 'Let me see the counter.', do: (g) => { const c = sys.live.get(s.rec.id)?.counters.find((q) => q.kind === k.kind)?.c; if (c) { const r = g.trade?.openCounter(c); if (r?.ok) sys.counts.opened++; } }, end: true },
        { t: 'Where does the stock come from?', reply: () => `"${k.C.takes.length ? 'What the town makes comes here when it is made.' : ''} The rest comes up the road on a truck, when a truck comes. Nothing grows back on its own."` },
        { t: 'What are the rules here?', reply: () => `"${f.rules.join('. ')}. Curfew ${curfewText(f.curfew)}."` },
        { t: 'Who runs this place?', reply: who },
        { t: '[Leave]', end: true },
      ] },
    } };
  }
  // What the town's workers made goes on the counter that sells it (law 2: worked for, then sold; never rolled again).
  deliver(s) {
    const B = this.g.workforce?.towns.get(s.rec.id), inv = this.g.inventory;
    if (!B || !inv) return;
    for (const k of s.counters) {
      if (!k.box || k.dead) continue;
      for (const st of Object.values(B.stock)) {
        if (st.n <= 0 || !k.C.takes.includes(st.item)) continue;
        const n = inv.add(k.box, st.item, st.n, { made: inv.hours?.() });
        if (n > 0) { st.n -= n; this.counts.delivered += n; this.g.emit?.('restocked', { trader: k.keeper.id, from: 'worker', item: st.item, n, at: st.at, town: s.rec.id }); }
      }
    }
  }

  // ---- rulers -------------------------------------------------------------------------------------------------------
  ruler(s, row, R) {
    const g = this.g, t = s.t, rng = makeRng(hashS(`${row.id}:ruler`));
    const bl = t.blds.map((r) => r.B).filter((b) => !b.ruined);
    const big = bl.filter((b) => b.hero).sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0))[0] ?? bl.sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0))[0];
    if (!big) return;
    const d = big.doors?.find((q) => q.side === big.front) ?? big.doors?.[0];
    const [x, z, nx, nz] = !d ? [(big.x0 + big.x1) / 2, big.z1, 0, 1] : d.side === 'N' ? [d.at, big.z0, 0, -1] : d.side === 'S' ? [d.at, big.z1, 0, 1] : d.side === 'W' ? [big.x0, d.at, -1, 0] : [big.x1, d.at, 1, 0];
    const name = randomName(rng), flag = row.region === 'INTL' ? g.randomFlag(rng) : rng() < 0.6 ? 'US' : g.randomFlag(rng), title = row.society.rulerTitle ?? 'the boss';
    const seatAt = { x: x + nx * 2.2, z: z + nz * 2.2, face: Math.atan2(nx, nz) };
    const at = (big.hero ?? big.name ?? big.kind).replace(/_/g, ' ');
    if (!R.dead.includes('ruler')) {
      const npcId = `tl.ruler.${row.id}`;
      const c = g.addChar({ x: seatAt.x, z: seatAt.z, faction: 'drifter', weapon: RULER.weapon, hp: RULER.hp, colors: outfit('drifter', rng), name, flag,
        npc: { id: npcId, name, title: `${title} · ${row.name}`, flag, faction: 'drifter', portrait: { seed: hashS(npcId) % 997, skin: rng.pick(SKIN), hair: '#1e1612', hat: 'none', mood: 'stern', shirt: '#4a3a2a', gear: 'none' }, ...this.rulerTalk(s, row, name, title) } });
      if (c) {
        Object.assign(c, { townlife: s.rec.id, tlKey: 'ruler', title: `${title} of ${row.name}`, rulerOf: row.id, handle: row.society.ruler, face: seatAt.face, hold: true, post: { ...seatAt, role: 'ruler' }, seat: at });
        s.ruler = c; this.counts.rulers++;
      }
    }
    for (let k = 0; k < RULER.guards; k++) {
      const key = `guard${k}`; if (R.dead.includes(key)) continue;
      const gx = seatAt.x + nz * (k ? 2.4 : -2.4), gz = seatAt.z - nx * (k ? 2.4 : -2.4);
      const c = g.addChar({ x: gx, z: gz, faction: 'drifter', weapon: RULER.guardWeapon, hp: 110, colors: outfit('drifter', rng), name: randomName(rng), flag: rng() < 0.6 ? 'US' : g.randomFlag(rng) });
      if (c) { Object.assign(c, { townlife: s.rec.id, tlKey: key, title: `${title}'s guard`, face: seatAt.face, hold: true, post: { x: gx, z: gz, face: seatAt.face, role: 'guard' } }); s.guards.push(c); }
    }
  }
  rulerTalk(s, row, name, title) {
    const f = s.facts;
    const fill = (L) => L.replace('{site}', row.name).replace('{title}', title);
    return { start: 'hi', nodes: {
      hi: { text: () => `"${fill(RULER.lines[0])}"`, choices: [
        { t: 'What are your rules?', reply: () => `"${f.rules.map((r) => r[0] + r.slice(1).toLowerCase()).join('. ')}. Curfew ${curfewText(f.curfew)}. Break one and you deal with me."` },
        { t: 'Who are you?', reply: () => `"${name}. They call me ${row.society.ruler}. ${title[0].toUpperCase()}${title.slice(1)} of ${row.name}."` },
        { t: 'Where do I buy fuel, food, ammo?', reply: () => `"The counters on the street. ${s.counters.filter((k) => !k.dead).map((k) => `${k.C.label} at ${k.spot.label}`).join('; ') || 'Nobody is selling today'}."` },
        { t: '[Leave]', end: true },
      ] },
    } };
  }

  // ---- the clock ------------------------------------------------------------------------------------------------------
  update(dt) {
    if ((this.t -= dt) > 0 || !this.live.size) return;
    this.t = TOWNLIFE.tick;
    for (const s of this.live.values()) {
      this.sync(s);
      this.deliver(s);
      for (const c of [s.ruler, ...s.guards]) if (c && !c.alive && c.tlKey) { const R = this.rec(s.rec.id); if (!R.dead.includes(c.tlKey)) R.dead.push(c.tlKey); }
    }
  }

  // ---- views ---------------------------------------------------------------------------------------------------------
  view(id) {
    const s = this.live.get(id); if (!s) return null;
    const p = this.g.player, inv = this.g.inventory;
    return { id, name: s.rec.name, kind: s.rec.kind, facts: s.facts,
      counters: s.counters.map((k) => ({ kind: k.kind, keeper: k.keeper.name, flag: k.keeper.flag, job: k.keeper.occ ?? 'hired hand', hired: k.keeper.hired, open: this.isOpen(s, k), dead: !!k.dead, char: k.c?.id ?? null, at: k.spot.label,
        x: +k.spot.x.toFixed(1), z: +k.spot.z.toFixed(1), box: k.q.id, rolled: !!k.box?.rolled, stock: k.box?.rolled ? k.box.slots.map((q) => `${q.id}x${q.n}`) : 'not opened yet', priceMul: TRADERS[k.keeper.id]?.priceMul ?? 1, dist: p ? +Math.hypot(k.spot.x - p.x, k.spot.z - p.z).toFixed(1) : null })),
      ruler: s.ruler ? { name: s.ruler.name, title: s.ruler.title, handle: s.ruler.handle, flag: s.ruler.flag, alive: s.ruler.alive, at: s.ruler.seat, x: +s.ruler.x.toFixed(1), z: +s.ruler.z.toFixed(1), char: s.ruler.id } : null,
      guards: s.guards.map((c) => ({ name: c.name, flag: c.flag, alive: c.alive })), registered: !!inv };
  }
  list() { return [...this.live.keys()].map((id) => this.view(id)); }
  save() { const out = {}; for (const [id, r] of this.recs) if (r.dead.length) out[id] = { dead: [...r.dead] }; return out; }
  load(S) { this.recs.clear(); for (const [id, r] of Object.entries(S ?? {})) this.recs.set(id, { dead: [...(r.dead ?? [])] }); }
}
