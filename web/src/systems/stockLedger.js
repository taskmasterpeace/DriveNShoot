// THE STOCK LEDGER (docs/design/WEB_SUPPLY_LAW.md; WEB_LIVING_WORLD_GOAL T8: "world stock of a good may rise only by a
// traced amount each hour"; G0(d) the stock ledger and the cheat audit). Two halves:
//   stamps   every place goods come into being says so: stamp(item, n, origin, src). An origin is one of ORIGINS.
//   census   once a game hour every good in the world's holders is counted (CENSUS_SCOPE below). A good whose count
//            rose by more than its stamps account for gained untraced stock: a flag. A stamp whose origin is one the
//            law forbids ('minted': a reward or refill from nowhere) is a flag too, traced or not.
// Moving a thing between holders (a box to your pack, a trader's shelf to your pack, a gun to your hands) changes no
// count, so it needs no stamp. Eating, firing and breaking lower counts; only rises are judged.
// The census scope: your pack and the pack you wear, the gear you wear, the guns in your hands and the rounds in them,
// every registered container (shelves, crates, trunks, the dead, the ground, the crew stash), every ring box kept while
// its chunk is away, and the rounds your crew carry. A box nobody has opened holds nothing yet: its contents come into
// being when it is first opened ('roll'), the world's one honest source of found goods.
// Pure (no three.js): tools/supply-law.test.mjs runs it in node with a fake game.

export const ORIGINS = {
  roll: 'a container opened for the first time (its seed, once)',
  body: 'a dead person\'s own gun and rounds, on the body',
  opening: 'a trader\'s opening stock (once per trader)',
  delivery: 'a delivery a courier, caravan, producer or the player brought',
  recipe: 'made from inputs that were eaten (crew ammo, cooking)',
  harvest: 'grown from sown seed and water, or butchered from a kill',
  forage: 'picked, caught or caught in a catcher (plants grow, rain falls, fish swim)',
  salvage: 'stripped from a wreck or a structure that exists',
  start: 'a new character\'s starting kit',
  crew_kit: 'a crew member\'s own gun and rounds, handed over',
  minted: 'FORBIDDEN: a reward or refill from nowhere (still open in data/rites.js LOOT_LAW)',
};
export const FORBIDDEN = new Set(['minted']);

// Count every good in a set of holders. holders: { slots: [[slot...]...], ids: [item ids, one each], rounds: [[item, n]] }.
// A gun slot's loaded rounds count as its rounds' item (gunAmmo: gun item id -> rounds item id).
export function census(holders, gunAmmo = () => null) {
  const c = new Map(), add = (id, n) => { if (id && n > 0) c.set(id, (c.get(id) ?? 0) + n); };
  for (const slots of holders.slots ?? []) for (const s of slots) { add(s.id, s.n); if (s.loaded > 0) add(gunAmmo(s.id), s.loaded); }
  for (const id of holders.ids ?? []) add(id, 1);
  for (const [id, n] of holders.rounds ?? []) add(id, n);
  return c;
}

// Judge a window: before and after counts and the stamps between. Returns { rises, flags } where a flag is
// { item, n, origin: 'untraced' | <forbidden origin>, src }.
export function reconcile(before, after, stamps) {
  const traced = new Map(), flags = [], rises = {};
  for (const s of stamps) {
    traced.set(s.item, (traced.get(s.item) ?? 0) + s.n);
    if (FORBIDDEN.has(s.origin)) flags.push({ item: s.item, n: s.n, origin: s.origin, src: s.src ?? null });
  }
  for (const [id, n] of after) {
    const rise = n - (before.get(id) ?? 0);
    if (rise <= 0) continue;
    rises[id] = rise;
    const over = rise - (traced.get(id) ?? 0);
    if (over > 1e-6) flags.push({ item: id, n: +over.toFixed(3), origin: 'untraced', src: null });
  }
  return { rises, flags };
}

export class StockLedger {
  // ammoOf: loadout weapon key -> rounds item id (systems/combat.js WEAPONS x data/items.js AMMO_ITEM, given by main.js)
  // items: the ITEMS table (for a gun item's rounds)
  // gunItem: loadout weapon key -> its gun item (data/items.js GUN_ITEM)
  constructor(game, { ammoOf = () => null, items = {}, gunItem = {} } = {}) {
    this.g = game; this.ammoOf = ammoOf; this.items = items; this.gunItemOf = gunItem;
    this.seq = 0;
    this.stamps = [];     // since the last census
    this.log = [];        // the last LOG stamps, for the ledger command
    this.flags = [];      // the last FLAGS flags
    this.mark = null;     // the game hour of the last census
    this.last = null;     // its counts
    this.stats = { censuses: 0, stamped: 0, flagged: 0 };
  }

  hours() { const g = this.g; return (g.society?.day ?? 0) * 24 + (g.sky?.time ?? 0); }

  stamp(item, n, origin, src = null) {
    if (!item || !(n > 0)) return;
    if (!ORIGINS[origin]) origin = 'minted'; // an origin nobody wrote down is no origin
    const s = { seq: ++this.seq, item, n, origin, src, hour: +this.hours().toFixed(2) };
    this.stamps.push(s); this.log.push(s); this.stats.stamped++;
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
  }
  // Stamp what a container gained between two snapshots (snap: a census of that one box's slots).
  stampGain(box, before, origin, src = box?.id) {
    const after = census({ slots: [box.slots] }, (id) => this.gunAmmo(id));
    for (const [id, n] of after) { const d = n - (before.get(id) ?? 0); if (d > 0) this.stamp(id, d, origin, src); }
  }
  snap(box) { return census({ slots: [box.slots] }, (id) => this.gunAmmo(id)); }
  gunAmmo(id) { const w = this.items[id]?.weapon; return w ? this.ammoOf(w) : null; }

  // Every holder in the census scope.
  holders() {
    const g = this.g, inv = g.inventory, slots = [], ids = [], rounds = [];
    if (inv) {
      slots.push(inv.carried.slots);
      for (const b of inv.boxes.values()) slots.push(b.slots);
      for (const [id, s] of inv.ringKept ?? []) if (!inv.boxes.has(id)) slots.push(s); // a registered ring box shares its kept array
      for (const t of inv.trunks?.values?.() ?? []) slots.push(t.slots);
      if (inv.worn) ids.push(inv.worn);
      // the dead residents whose chunk is away: their body's contents wait on the record (systems/residents.js m.body)
      for (const rec of g.residents?.recs?.values?.() ?? []) for (const m of rec.members ?? []) if (m.dead && m.body && !inv.boxes.has(m.bodyId)) slots.push(m.body);
    }
    for (const id of Object.values(g.gear?.worn ?? {})) if (id) ids.push(typeof id === 'string' ? id : id.id);
    const L = g.inv;
    if (L) for (const k of L.weapons ?? []) { const gi = this.gunItem(k); if (gi) ids.push(gi); if (L.mag?.[k] > 0) rounds.push([this.ammoOf(k), L.mag[k]]); }
    for (const m of g.crew?.members ?? []) if (m.rounds > 0) rounds.push([this.ammoOf(m.c?.weapon ?? m.row?.weapon), m.rounds]);
    return { slots, ids, rounds };
  }
  gunItem(k) { return this.gunItemOf[k] ?? null; }
  count() { return census(this.holders(), (id) => this.gunAmmo(id)); }

  // The hourly census: judge the hour that ended, start the next.
  update() {
    const h = Math.floor(this.hours());
    if (this.mark === null) { this.rebase(); return; }
    if (h === this.mark) return;
    this.close(h);
  }
  close(h = Math.floor(this.hours())) {
    const now = this.count(), r = reconcile(this.last, now, this.stamps);
    for (const f of r.flags) { this.flags.push({ ...f, hour: h }); this.stats.flagged++; this.g.emit?.('stockFlag', { ...f, hour: h }); }
    if (this.flags.length > 200) this.flags.splice(0, this.flags.length - 200);
    this.stamps = []; this.last = now; this.mark = h; this.stats.censuses++;
    return r;
  }
  // A save loaded, a world rebuilt, a test staged: the count starts again from what is there (nothing judged).
  rebase() { this.stamps = []; this.last = this.count(); this.mark = Math.floor(this.hours()); }

  // THE CHEAT AUDIT: run fn and judge exactly what it did (a check's window, not the hour). Returns { rises, flags,
  // stamps }: flags empty = every gain was traced to an allowed origin.
  async audit(fn) {
    const before = this.count(), seq0 = this.seq;
    await fn();
    const stamps = this.log.filter((s) => s.seq > seq0);
    const r = reconcile(before, this.count(), stamps);
    return { ...r, stamps: stamps.map((s) => ({ item: s.item, n: s.n, origin: s.origin, src: s.src })) };
  }

  view({ items = false } = {}) {
    const by = {};
    for (const s of this.log) { const o = (by[s.origin] ??= {}); o[s.item] = (o[s.item] ?? 0) + s.n; }
    return { hour: this.mark, stats: { ...this.stats }, origins: ORIGINS, stampedBy: by, flags: this.flags.slice(-40), ...(items ? { counts: Object.fromEntries(this.count()) } : {}) };
  }
}
