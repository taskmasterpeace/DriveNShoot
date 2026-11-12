// COMMANDS rows and selftest checks for THE SUPPLY LAW and THE STOCK LEDGER (docs/design/WEB_SUPPLY_LAW.md).
//   ledger   the stock ledger: origins, what each origin stamped, the flags (untraced gains and forbidden origins);
//            close=true runs the census now, rebase=true starts the count again, counts=true lists every good's count
// The checks are THE CHEAT AUDIT (G0(d)): each crew job runs inside ledger.audit(), and every gain it made must trace to
// an allowed origin. A crew job that makes goods from nothing fails here by name.
import { CREW_RUN, validateSupply } from '../data/supply.js';
import { CREW_JOB_BY_ID } from '../data/crewjobs.js';
import { RECIPE_BY_ID } from '../data/recipes.js';
import { LOOT_LAW } from '../data/rites.js';
import { ITEMS } from '../data/items.js';

export function supplyCommands(api, need) {
  const g = api.g;
  return {
    ledger: {
      group: 'world', desc: 'THE STOCK LEDGER (systems/stockLedger.js, docs/design/WEB_SUPPLY_LAW.md): every good that comes into being is stamped with its origin (roll, body, opening, delivery, recipe, harvest, forage, salvage, start, crew_kit; minted is the forbidden one), and once a game hour every good in the world\'s holders is counted: a rise its stamps do not cover is an untraced gain, a flag. No args: the hour, stats, the origins, what each origin stamped, the last flags. close=true runs the census now (its flags in the reply); rebase=true starts the count again from what is there; counts=true adds every good\'s count; validate=true checks the supply rows.',
      args: { close: { type: 'boolean' }, rebase: { type: 'boolean' }, counts: { type: 'boolean' }, validate: { type: 'boolean' } },
      run: async ({ close, rebase, counts, validate }) => {
        const L = g.ledger; need(L, 'no stock ledger (g.ledger)');
        if (validate) return { supply: validateSupply(), lootLaw: LOOT_LAW.map((r) => ({ path: r.path, state: r.state })) };
        if (rebase) { L.rebase(); return { rebased: true, hour: L.mark }; }
        if (close) { const r = L.close(); return { closed: L.mark, rises: r.rises, flags: r.flags }; }
        return L.view({ items: !!counts });
      },
    },
  };
}

const STAGE = { x: 240, z: -330 }; // the north-east glass flats on the island (crew-api.js STAGE): open ground, no town
export async function supplyChecks(api, check, C) {
  const g = api.g, K = g.crew, L = g.ledger, inv = () => g.inventory;
  if (!L) { await check('supply law: the stock ledger is live (g.ledger)', async () => 'no g.ledger'); return; }
  const since = (seq, type) => g.events.filter((e) => e.seq > seq && e.type === type);
  const clearCrew = () => { for (const m of [...K.members]) { K.leave(m, 'dismissed', false); if (m.c) g.removeChar(m.c); } K.drag = null; K.camp = null; K.base = null; };
  // Staged: quiet ground, an empty pack (put back after), a base claimed where you stand, the crew stash emptied.
  const stage = async (fn) => {
    const zOn = g.zombies.enabled, rt = g.raiderTimer, wOn = g.wilds?.enabled, reach = CREW_RUN.reach;
    g.zombies.enabled = false; g.raiderTimer = 1e9; if (g.wilds) g.wilds.enabled = false;
    if (g.player.inVehicle) g.exitVehicle(true);
    await C('teleport', STAGE);
    const I = inv(), keep = I.carried.slots.splice(0), placed = [], stash0 = I.boxes.get('crew:stash'), stashKeep = stash0?.slots.splice(0) ?? [], stashAt = stash0 && { x: stash0.x, z: stash0.z };
    try {
      clearCrew();
      await C('crewJob', { claimBase: true });
      I.boxes.get('crew:stash')?.slots.splice(0);
      return await fn({ I, placed });
    } finally {
      CREW_RUN.reach = reach;
      for (const id of placed) I.boxes.delete(id);
      I.carried.slots.length = 0; I.carried.slots.push(...keep); I.dirty = true;
      clearCrew();
      const st = I.boxes.get('crew:stash'); // the battery's stash as it was (its things and where it stood)
      if (st) { st.slots.length = 0; st.slots.push(...stashKeep); if (stashAt) { st.x = stashAt.x; st.z = stashAt.z; } }
      g.zombies.enabled = zOn; g.raiderTimer = rt; if (g.wilds) g.wilds.enabled = wOn;
      L.rebase(); // the staging moved stock about (a pack set aside and put back): count afresh
    }
  };
  const join = async (row) => { const r = await C('crewJoin', { spawn: row }); return r.ok ? K.byAny(String(r.rec)) : null; };
  // The job clock run forward in day-sized steps, the crew fed between (a long advance otherwise starves them off).
  const advance = async (h) => { for (let t = 0; t < h; t += 24) { for (const m of K.members) m.needs.food = m.needs.water = m.needs.rest = 1; await C('crewJob', { advance: Math.min(24, h - t) }); } };
  const stock = (id) => inv().carried.count(id) + (inv().boxes.get('crew:stash')?.count(id) ?? 0);
  const clean = (r) => (r.flags.length ? `flags ${JSON.stringify(r.flags)}` : null);

  await check('supply law: the rows validate; CRAFT AMMO runs the load_pistol recipe (brass, powder, primer, lead in, 8 rounds out); the farm job has no outputs of its own; no crew job is still on the LOOT_LAW todo list', async () => {
    const v = validateSupply(), A = CREW_JOB_BY_ID.ammo, R = RECIPE_BY_ID[A.recipe], F = CREW_JOB_BY_ID.farm, S = CREW_JOB_BY_ID.scav_run;
    const ins = Object.fromEntries(R?.inputs ?? []), crewTodo = LOOT_LAW.filter((r) => /crew/i.test(r.path) && r.state === 'todo');
    const ok = v.ok && R && ins.brass_case > 0 && ins.gunpowder > 0 && ins.primer > 0 && ins.lead_shot > 0 && !A.outputs && !F.outputs && !S.outputs?.table && !crewTodo.length;
    return ok ? true : JSON.stringify({ bad: v.bad, recipe: R?.inputs, ammo: A, farm: F.outputs, run: S.outputs, crewTodo });
  });

  await check('supply law: CRAFT AMMO eats 8 brass + 8 primers + powder + lead per 8 rounds (the load_pistol row) - nothing without them, never more for skill; the ledger traces every round to its recipe', () => stage(async ({ I }) => {
    const m = await join('gun_tinker'); if (!m) return 'no gun tinker joined';
    await C('crewJob', { id: String(m.id), job: 'ammo' });
    let seq = g.eventSeq;
    const dry = await L.audit(() => advance(12));
    if (stock('ammo_pistol') > 0 || !since(seq, 'crewJobShort').length) return `rounds from nothing: ${stock('ammo_pistol')} (short said: ${since(seq, 'crewJobShort').length})`;
    if (clean(dry)) return `dry bench: ${clean(dry)}`;
    I.add(I.carried, 'brass_case', 16); I.add(I.carried, 'primer', 16); I.add(I.carried, 'gunpowder', 2); I.add(I.carried, 'lead_shot', 2);
    L.rebase();
    seq = g.eventSeq;
    const wet = await L.audit(() => advance(24));
    const made = stock('ammo_pistol'), left = { brass: stock('brass_case'), primer: stock('primer'), powder: stock('gunpowder'), lead: stock('lead_shot') };
    const ok = made === 16 && left.brass === 0 && left.primer === 0 && left.powder === 0 && left.lead === 0 && wet.stamps.every((s) => s.origin === 'recipe') && !clean(wet);
    return ok ? true : JSON.stringify({ made, left, flags: wet.flags, stamps: wet.stamps });
  }));

  await check('supply law: TEND THE GARDEN makes no food without a garden, and its pick off a real ripe bed is traced as a harvest (no ration from nowhere)', () => stage(async ({ I }) => {
    const F = g.farming; if (!F) return 'no g.farming';
    const m = await join('drifter_cook'); if (!m) return 'no cook joined';
    await C('crewJob', { id: String(m.id), job: 'farm' });
    const near = () => F.plots.filter((q) => Math.hypot(q.x - K.base.x, q.z - K.base.z) < 160);
    if (near().length) return `staging: beds already near the flats ${near().map((q) => q.id)}`;
    const coops = F.coops.splice(0); // the hens elsewhere count as the base's (crewTend): set aside
    try {
      const none = await L.audit(() => advance(24));
      if (stock('ration') || Object.keys(none.rises).some((id) => ITEMS[id]?.kind === 'food')) return `food from no garden: ${JSON.stringify(none.rises)}`;
      if (clean(none)) return `no garden: ${clean(none)}`;
      const p = g.player, bed = { id: 'Gsupplytest', x: p.x + 3, z: p.z + 3, face: 0, bk: null, owner: 'player', crop: 'tomato', state: 'ripe', sownAt: 0, progress: 1, water: 0.8, fert: 0.6, health: 1, blight: false, fenced: false, scarecrow: false, loss: 0, last: null, restUntil: 0, why: null, ripeAt: F.hours(), dryH: 0 };
      F.plots.push(bed);
      const exp = F.expected(bed);
      const pick = await L.audit(() => C('crewJob', { advance: 4 }));
      F.plots.splice(F.plots.indexOf(bed), 1);
      const got = stock('tomato');
      return got === exp && pick.stamps.some((x) => x.item === 'tomato' && x.origin === 'harvest') && pick.stamps.every((x) => x.origin === 'harvest') && !clean(pick) && !stock('ration') ? true : JSON.stringify({ got, exp, stamps: pick.stamps, flags: pick.flags });
    } finally { F.coops.push(...coops); }
  }));

  await check('supply law: a SCAVENGE RUN opens the real unopened boxes near the base (rolled once, traced as rolls) and leaves a far one shut; the next run finds nothing left and comes back empty-handed', () => stage(async ({ I, placed }) => {
    CREW_RUN.reach = 40; // the staged houses only (the flats hold nothing else this close)
    const p = g.player, ids = ['supplytest:a', 'supplytest:b', 'supplytest:c'];
    ids.forEach((id, i) => { I.place(id, 'kitchen', p.x + 6 + i * 4, p.z + 5, 40, 'TEST CUPBOARD', 9001 + i); placed.push(id); });
    I.place('supplytest:far', 'kitchen', p.x + 900, p.z, 40, 'FAR CUPBOARD', 9100); placed.push('supplytest:far');
    for (const b of I.boxes.values()) if (!b.rolled && !placed.includes(b.id) && Math.hypot(b.x - p.x, b.z - p.z) < CREW_RUN.reach * 2.5) return `staging: another unopened box ${b.id} in reach`; // 2.5: past the best runner's skill multiplier (0.5 + 0.25 x 5 = 1.75)
    const m = await join('drifter_scav'); if (!m) return 'no scavenger joined';
    let seq = g.eventSeq;
    const run = await L.audit(async () => { await C('crewJob', { id: String(m.id), job: 'scav_run' }); await C('crewJob', { advance: 12 }); });
    const back = since(seq, 'crewRunBack')[0], died = since(seq, 'crewDied')[0];
    const opened = ids.filter((id) => I.boxes.get(id).rolled), far = I.boxes.get('supplytest:far').rolled;
    if (opened.length !== 3 || far) return `opened ${opened.length}/3, far opened ${far}`;
    if (clean(run)) return `run: ${clean(run)}`;
    if (run.stamps.some((s) => s.origin !== 'roll' || !ids.includes(s.src))) return `stamps not the staged boxes' rolls: ${JSON.stringify(run.stamps)}`;
    if (died) return true; // the wastes kept them: a legal outcome of the risk roll; the boxes were still opened and traced
    if (!back || back.searched !== 3) return `back ${JSON.stringify(back)}`;
    // A second run: nothing unopened is left in reach.
    for (const id of ids) I.boxes.get(id).slots.splice(0); // and nothing left in the opened ones either
    L.rebase();
    seq = g.eventSeq;
    const again = await L.audit(async () => { await C('crewJob', { id: String(m.id), job: 'scav_run' }); await C('crewJob', { advance: 12 }); });
    const back2 = since(seq, 'crewRunBack')[0];
    if (since(seq, 'crewDied')[0]) return true;
    return back2 && back2.empty && back2.searched === 0 && !back2.loot.length && !Object.keys(again.rises).length && !clean(again) ? true : JSON.stringify({ back2, flags: again.flags, rises: again.rises });
  }));

  await check('supply law: THE CHEAT AUDIT catches a leak - goods added with no stamp are an untraced gain (in a window and at the hourly census), and a minted stamp is flagged though traced', () => stage(async ({ I }) => {
    const leak = await L.audit(() => { I.add(I.carried, 'ammo_pistol', 50); });
    const f1 = leak.flags.find((f) => f.item === 'ammo_pistol' && f.origin === 'untraced' && f.n === 50);
    const mint = await L.audit(() => { I.add(I.carried, 'scrap', 2); L.stamp('scrap', 2, 'minted', 'test'); });
    const f2 = mint.flags.find((f) => f.item === 'scrap' && f.origin === 'minted');
    L.rebase(); I.add(I.carried, 'rag', 3);
    const hour = L.close();
    const f3 = hour.flags.find((f) => f.item === 'rag' && f.origin === 'untraced');
    const ok = f1 && f2 && f3 && !mint.flags.some((f) => f.origin === 'untraced');
    return ok ? true : JSON.stringify({ leak: leak.flags, mint: mint.flags, hour: hour.flags });
  }));
}
