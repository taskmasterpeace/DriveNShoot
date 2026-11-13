// The agent's side of THE MAKER (systems/crafting.js, ui/craft.js; docs/design/WEB_CRAFTING.md): the `craft` COMMANDS row
// (spread into api.js's table) and the selftest checks (called from api.js runSelfTest after the workshop's).
import { ITEMS } from '../data/items.js';
import { RECIPES, RECIPE_BY_ID, GROUPS, CRAFT_RULES, validateRecipes, validateManuals, matterOf } from '../data/recipes.js';
import { BENCHES, TOWN_BENCHES, validateBenches } from '../data/benches.js';
import { CREW_JOB_BY_ID } from '../data/crewjobs.js';
import { SKILLS } from '../data/stats.js';
import { NPCS } from '../data/npcs.js';

const r2 = (v) => Math.round(v * 100) / 100;
const SKILL_IDS = Object.keys(SKILLS);

export function craftingCommands(api) {
  const g = api.g;
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };
  return {
    craft: {
      group: 'player', desc: 'THE MAKER (docs/design/WEB_CRAFTING.md; rows in src/data/recipes.js, src/data/benches.js, src/data/makeritems.js): one engine, every maker item a row. action=list (default: every recipe with what is missing for it right now; group= known=true|false can=true|false filter) | known (what you can make now or know) | make id=<recipe> (inputs are eaten at once, tools wear, the clock runs: instant=true passes the hours now, else it queues and works on the game clock at the bench) | queue (the queue and its progress) | cancel index= (inputs come back) | assess id= (the whole verdict and every miss) | benches (what is in reach) | place item=<workbench|forge_kit|sewing_table|camp_stove|reload_press|chem_set> (sets a bench you carry down where you stand) | pickup | learn id=<recipe> (the books lane\'s hook: knowRecipe) | forget id= | rows (every row, validated, with the matter rule) | stats. In the game: I (pack) then Q (pad LB) opens the CRAFT tab.',
      args: { action: { type: 'string', default: 'list', enum: ['list', 'known', 'make', 'queue', 'cancel', 'assess', 'benches', 'place', 'pickup', 'learn', 'forget', 'rows', 'stats'] }, id: { type: 'string' }, group: { type: 'string' }, known: { type: 'boolean' }, can: { type: 'boolean' },
        instant: { type: 'boolean', default: false }, pay: { type: 'boolean', default: true }, index: { type: 'number', default: 0 }, item: { type: 'string' } },
      run: async ({ action, id, group, known, can, instant, pay, index, item }) => {
        const C = g.crafting;
        if (action === 'rows') {
          const v = validateRecipes(RECIPES, { items: ITEMS, skills: SKILL_IDS, benches: BENCHES });
          return { ...v, manuals: validateManuals(ITEMS), benches: validateBenches(BENCHES, { items: ITEMS, npcs: NPCS.map((n) => n.id) }), groups: GROUPS, rules: CRAFT_RULES, rows: RECIPES.map((r) => ({ id: r.id, group: r.group, bench: r.bench, skill: `${r.skill} ${r.minSkill}`, hours: r.hours, learnedFrom: r.learnedFrom, matter: matterOf(r, ITEMS) })) };
        }
        if (action === 'list') return { benches: C.view().benches, recipes: C.list({ group, known: known ?? null, can: can ?? null }).map((r) => ({ id: r.id, name: r.name, group: r.group, known: r.known, can: r.can, bench: r.bench, hours: r.hours, missing: r.missing, teaches: r.teaches || undefined })) };
        if (action === 'known') return { known: C.list({ known: true }).map((r) => ({ id: r.id, name: r.name, group: r.group, can: r.can })), learned: [...C.learned] };
        if (action === 'assess') { need(id, 'id=<recipe>'); const A = C.assess(id); return A; }
        if (action === 'make') { need(id, 'id=<recipe>'); const r = C.make(id, { instant, pay }); need(r.ok, `${r.why}${r.missing?.length > 1 ? ` (also: ${r.missing.slice(1).join('; ')})` : ''}`); return { ...r, clock: g.sky.time }; }
        if (action === 'queue') return C.view().queue;
        if (action === 'cancel') { const r = C.cancel(index); need(r.ok, r.why); return r; }
        if (action === 'benches') return C.view();
        if (action === 'place') { need(item, 'item=<a bench item you carry>'); const r = C.place(item); need(r.ok, r.why); return r; }
        if (action === 'pickup') { const r = C.pickup(); need(r.ok, r.why); return r; }
        if (action === 'learn') { need(id, 'id=<recipe>'); const r = C.knowRecipe(id, 'agent'); need(r.ok, r.why); return r; }
        if (action === 'forget') { need(id, 'id=<recipe>'); return C.forgetRecipe(id); }
        return C.view().stats;
      },
    },
  };
}

// ---- the selftest checks ------------------------------------------------------------------------------------------------
export async function craftingChecks({ g, api, C, check, stage }) {
  const inv = () => g.inventory, K = () => g.crafting;
  const kgNow = () => inv().carried.kg();
  const pack = () => Object.fromEntries(inv().carried.slots.map((s) => [s.id, 0]).concat([]).map(([k]) => [k, inv().carried.count(k)]));
  // A clean bench-top: empty pockets with room to spare, an ordinary hand, nothing queued, no benches down.
  const clean = () => {
    const c = inv().carried; c.slots = []; c.cap = 9999;
    const k = K(); k.queue = []; k.learned.clear(); k.providers = []; for (const b of k.placed) k.meshes.get(b.id)?.parent?.remove(k.meshes.get(b.id)); k.placed = []; k.meshes.clear();
    for (const id of SKILL_IDS) g.deep.skill[id] = 0;
    g.cash = 500; inv().changed();
  };
  const give = (id, n = 1, state = {}) => inv().add(inv().carried, id, n, state);
  const hrs = () => inv().hours();
  const fireHere = () => g.throwables.startFire(g.player.x + 0.5, g.player.z, 1.2, 600, g.player);
  const prep = async (fn) => { const S = { cap: inv().carried.cap, slots: inv().carried.slots, cash: g.cash, skills: { ...g.deep.skill }, learned: [...K().learned], placed: K().placed, providers: K().providers, queue: K().queue, noise: g.noise };
    try { clean(); return await fn(); } finally { const c = inv().carried; c.cap = S.cap; c.slots = S.slots; g.cash = S.cash; Object.assign(g.deep.skill, S.skills); const k = K(); for (const b of k.placed) k.meshes.get(b.id)?.parent?.remove(k.meshes.get(b.id)); k.meshes.clear(); k.learned = new Set(S.learned); k.placed = S.placed; k.providers = S.providers; k.queue = S.queue; g.noise = S.noise; inv().changed(); } };

  await check('crafting: the rows validate (60+ recipes, benches, manuals) and the matter rule holds for every one', async () => {
    const v = validateRecipes(RECIPES, { items: ITEMS, skills: SKILL_IDS, benches: BENCHES });
    if (!v.ok) return v.errors.join(' | ');
    if (RECIPES.length < 55) return `only ${RECIPES.length} recipes`;
    if (!validateManuals(ITEMS).ok) return validateManuals(ITEMS).errors.join(' | ');
    const b = validateBenches(BENCHES, { items: ITEMS, npcs: NPCS.map((n) => n.id) });
    if (!b.ok) return b.errors.join(' | ');
    const bad = RECIPES.filter((r) => !r.effect && matterOf(r, ITEMS).net > CRAFT_RULES.slack);
    if (bad.length) return `matter from nothing: ${bad.map((r) => r.id).join(', ')}`;
    const groups = new Set(RECIPES.map((r) => r.group));
    return groups.size >= 8 && Object.keys(GROUPS).every((x) => groups.has(x)) ? true : `groups used: ${[...groups]}`;
  });

  await check('crafting: the validator catches bad rows (unknown item, no time, matter from nothing, matter gained, bad learning, an untaught book, an unknown tool)', async () => {
    const base = RECIPES.find((r) => r.id === 'make_rag');
    const bads = [
      ['unknown item', { ...base, outputs: [['no_such_thing', 1]] }, /not an item/],
      ['no time', { ...base, hours: 0 }, /hours/],
      ['from nothing', { ...base, inputs: [], outputs: [['rag', 1]] }, /matter from nothing/],
      ['matter gained', { ...base, outputs: [['rag', 90]] }, /MATTER/],
      ['bad learning', { ...base, learnedFrom: 'a dream' }, /learnedFrom/],
      ['untaught book', { ...base, learnedFrom: 'book:manual_smith' }, /does not teach/],
      ['unknown tool', { ...base, tools: [['sonic_screwdriver', 0.1]] }, /neither a tag nor an item/],
      ['unknown bench', { ...base, bench: 'moon' }, /bench moon unknown/],
      ['unknown skill', { ...base, skill: 'telekinesis' }, /skill telekinesis/],
      ['no output', { ...base, outputs: [] }, /makes nothing/],
      ['fractional input', { ...base, inputs: [['cloth_scrap', 1.5]] }, /whole n/],
    ];
    for (const [what, row, re] of bads) {
      const v = validateRecipes([row], { items: ITEMS, skills: SKILL_IDS, benches: BENCHES });
      if (v.ok || !v.errors.some((e) => re.test(e))) return `${what}: not caught (${v.errors.join(' | ') || 'passed'})`;
    }
    const dup = validateRecipes([base, base], { items: ITEMS });
    return dup.ok ? 'a duplicate id was not caught' : true;
  });

  await check('crafting: a make eats exactly its inputs, wears the tool by exactly its wear, passes the clock and leaves the byproducts; the pack weighs no more', () => stage(() => prep(async () => {
    give('cloth_scrap', 5); give('knife'); const t0 = hrs(), kg0 = kgNow();
    const r = K().make('make_rag', { instant: true });
    if (!r.ok) return r.why;
    const knife = inv().carried.slots.find((s) => s.id === 'knife');
    const wear = RECIPE_BY_ID.make_rag.tools[0][1];
    if (inv().carried.count('cloth_scrap') !== 4) return `cloth_scrap ${inv().carried.count('cloth_scrap')} (want 4)`;
    if (inv().carried.count('rag') !== 3) return `rags ${inv().carried.count('rag')} (want 3)`;
    if (Math.abs((knife.cond ?? 1) - (1 - wear)) > 1e-6) return `knife cond ${knife.cond} (want ${1 - wear})`;
    if (!(hrs() - t0 > 0.05)) return `no time passed (${hrs() - t0} h)`;
    if (kgNow() > kg0 + 1e-6) return `the pack grew: ${kg0} -> ${kgNow()} kg`;
    // a byproduct recipe: arrow shafts leave a rag, and the shafts weigh what the timber does not
    clean(); give('wood_scrap', 1); give('cloth_scrap', 1); give('knife'); g.deep.skill.carpentry = 40;
    const a = K().make('arrow_shafts', { instant: true });
    return a.ok && inv().carried.count('arrow_shaft') === 10 && inv().carried.count('rag') === 1 && inv().carried.count('wood_scrap') === 0 ? true : `arrow shafts ${JSON.stringify(a)} / ${JSON.stringify(pack())}`;
  })));

  await check('crafting: it refuses with the exact miss - input, tool, skill, bench, knowledge - and a refusal costs nothing', () => stage(() => prep(async () => {
    const miss = (id) => { const before = JSON.stringify(inv().carried.slots), r = K().make(id); if (r.ok) return 'made it'; if (JSON.stringify(inv().carried.slots) !== before) return 'a refusal changed the pack'; return r.missing.join(' | '); };
    give('cloth_scrap', 1);
    const noTool = miss('make_rag'); if (!/a tool: .*(knife|blade|folding)/i.test(noTool)) return `tool: ${noTool}`;
    give('knife'); clean(); give('knife');
    const noInput = miss('make_rag'); if (!/1 more cloth scrap/i.test(noInput)) return `input: ${noInput}`;
    clean(); give('wood_scrap', 3); give('nails', 6); give('hand_saw'); give('hammer');
    const noBench = miss('make_planks'); if (!/at a workbench/i.test(noBench)) return `bench: ${noBench}`;
    clean(); give('scrap', 1); give('charcoal', 1); give('hammer'); give('metal_file'); K().providers.push(() => [{ bench: 'forge', x: g.player.x, z: g.player.z }]);
    const noSkill = miss('forge_machete'); if (!/comes with Mechanics 30/i.test(noSkill)) return `knowledge: ${noSkill}`;
    K().learned.add('forge_machete'); const lowSkill = miss('forge_machete'); if (!/Mechanics 30 \(you have 0\)/i.test(lowSkill)) return `skill: ${lowSkill}`;
    const noKnow = K().assess('load_rifle'); if (!noKnow.missing.some((m) => /you do not know it: read Gunsmith/i.test(m))) return `knowledge: ${noKnow.missing}`;
    return true;
  })));

  await check('crafting: a tool breaks when its condition runs out and is gone from the pack, and a recipe that needs it is then refused', () => stage(() => prep(async () => {
    give('cloth_scrap', 3); give('knife', 1, { cond: 0.003 });
    const broke = []; const off = g.on?.('toolBroke', (e) => broke.push(e)); const n0 = K().stats.wornOut;
    const r = K().make('make_rag', { instant: true });
    if (!r.ok) return r.why;
    if (inv().carried.count('knife') !== 0) return 'the worn-out knife is still in the pack';
    if (K().stats.wornOut !== n0 + 1) return 'wornOut not counted';
    const again = K().make('make_rag');
    off?.();
    return !again.ok && /a tool/.test(again.why) && inv().carried.count('rag') === 3 ? true : `again: ${JSON.stringify(again)}`;
  })));

  await check('crafting: quality scales with skill and a proper bench - the same hatchet at skill 20 and at skill 100, by the formula', () => stage(() => prep(async () => {
    const R = RECIPE_BY_ID.forge_hatchet, outs = [];
    K().providers.push(() => [{ bench: 'forge', x: g.player.x, z: g.player.z }]);
    K().learned.add('forge_hatchet');
    for (const sk of [20, 60, 100]) {
      clean(); K().providers.push(() => [{ bench: 'forge', x: g.player.x, z: g.player.z }]); K().learned.add('forge_hatchet');
      g.deep.skill.mechanics = sk; give('scrap', 1); give('wood_scrap', 1); give('charcoal', 1); give('hammer'); give('metal_file');
      const want = K().qualityFor(R, { id: 'forge' }, 1), r = K().make('forge_hatchet', { instant: true });
      if (!r.ok) return `skill ${sk}: ${r.why}`;
      const h = inv().carried.slots.find((s) => s.id === 'hatchet');
      outs.push([sk, h.cond, want]);
      if (Math.abs(h.cond - want) > 0.005) return `skill ${sk}: cond ${h.cond} vs formula ${want}`;
    }
    const [a, b, c] = outs.map((o) => o[1]);
    const f = (sk) => Math.min(1, (sk - R.minSkill) / CRAFT_RULES.qSpan);
    if (!(a < b && b < c)) return `not increasing: ${a} ${b} ${c}`;
    return Math.abs(a - (CRAFT_RULES.qMin + (1 - CRAFT_RULES.qMin) * f(20) + CRAFT_RULES.qBench)) < 0.01 && c >= 0.99 ? true : `ends ${a} ${c}`;
  })));

  await check('crafting: benches - a set-down workbench is the only thing that lets planks happen; walk off and the work waits; pick it up and it is in the pack again; the table stands in the world', () => stage(() => prep(async () => {
    give('workbench'); give('wood_scrap', 3); give('nails', 6); give('hand_saw'); give('hammer'); g.deep.skill.carpentry = 10;
    if (K().assess('make_planks').ok) return 'planks without a bench';
    const p = K().place('workbench'); if (!p.ok) return p.why;
    if (inv().carried.count('workbench') !== 0) return 'the bench is still in the pack';
    if (!K().meshes.size) return 'nothing stands in the world';
    const hold = K().make('make_planks'); if (!hold.ok) return hold.why;
    const j = K().queue[0], d0 = j.done;
    const x = g.player.x; g.player.x += 12; g.sky.time = (g.sky.time + 0.4) % 24; K().update();
    const paused = j.paused && j.done === d0;
    g.player.x = x; g.sky.time = (g.sky.time + 0.4) % 24; K().update();
    if (!paused) return 'the work went on with nobody at the bench';
    if (!(K().queue[0] ? K().queue[0].done > d0 : true)) return 'the work did not resume at the bench';
    K().skip(); // finish it
    if (inv().carried.count('planks') !== 1) return 'no planks';
    const pk = K().pickup(); if (!pk.ok) return pk.why;
    return inv().carried.count('workbench') === 1 && !K().placed.length && !K().meshes.size ? true : 'the bench did not come back';
  })));

  await check('crafting: a town bench is a keeper\'s - Kenji\'s yard lends the forge for a fee; asleep or gone, it is closed; a tool roll in the trunk stands in for a bench on the simple jobs only', () => stage(() => prep(async () => {
    const k = g.chars.find((c) => c.npc?.id === 'kenji');
    if (!k) return 'kenji is not in the world';
    const was = { x: g.player.x, z: g.player.z, asleep: k.asleep, sleeping: k.sleeping };
    try {
      g.player.x = k.x + 2; g.player.z = k.z; k.asleep = false; k.sleeping = false;
      let here = K().benchesHere();
      if (here.forge?.via !== 'town' || !(here.forge.fee > 0)) return `forge via ${here.forge?.via} fee ${here.forge?.fee}`;
      give('scrap', 1); give('charcoal', 1); give('hammer'); g.deep.skill.mechanics = 10;
      const cash = g.cash, r = K().make('forge_nails', { instant: true });
      if (!r.ok) return r.why;
      const fee = cash - g.cash;
      if (!(fee > 0)) return 'the keeper charged nothing';
      if (inv().carried.count('nails') !== 100) return 'no nails';
      k.asleep = true; here = K().benchesHere();
      if (here.forge) return 'the forge is open with Kenji asleep';
    } finally { g.player.x = was.x; g.player.z = was.z; k.asleep = was.asleep; k.sleeping = was.sleeping; }
    clean(); give('wood_scrap', 1); give('nails', 4); give('hammer'); give('hand_saw'); give('tool_roll'); g.deep.skill.carpentry = 10;
    const roll = K().assess('rehaft_tool'), plank = K().assess('make_planks');
    give('wood_scrap', 3); give('nails', 6);
    return roll.bench === null && /workbench/.test(roll.missing.join()) && plank.bench === null ? true : `roll stood in for a non-mobile recipe: ${JSON.stringify(roll.bench)} ${JSON.stringify(plank.bench)}`;
  })));

  await check('crafting: knowledge - a recipe from a book is greyed with what teaches it, a manual teaches it once read (and stays), knowRecipe is the books lane\'s hook, and a skill tier unlocks one', () => stage(() => prep(async () => {
    g.deep.skill.mechanics = 40;
    const row = K().list().find((r) => r.id === 'load_rifle');
    if (row.known || !/Gunsmith/.test(row.teaches)) return `load_rifle: known ${row.known} teaches "${row.teaches}"`;
    give('manual_gunsmith');
    const slot = inv().carried.slots.findIndex((s) => s.id === 'manual_gunsmith');
    const u = inv().use(slot);
    if (!u.ok) return u.why;
    if (!K().knows('load_rifle') || !K().knows('load_shells') || !K().knows('cast_shot')) return 'the manual did not teach its recipes';
    if (inv().carried.count('manual_gunsmith') !== 1) return 'the manual was used up';
    if (inv().use(slot).ok) return 'reading it twice taught something';
    if (K().knows('forge_hatchet')) return 'knew a smith recipe unread';
    const hook = K().knowRecipe('forge_hatchet', 'test'); if (!hook.ok || !K().knows('forge_hatchet')) return 'knowRecipe hook failed';
    if (K().knowRecipe('no_such').ok) return 'taught a recipe that does not exist';
    // skill tier: make_hand_saw 'skill' at carpentry 10
    g.deep.skill.carpentry = 9; const lo = K().knows('make_hand_saw'); g.deep.skill.carpentry = 10; const hi = K().knows('make_hand_saw');
    return !lo && hi ? true : `skill gate ${lo} ${hi}`;
  })));

  await check('crafting: known recipes ride a save and a load (learned, benches down, the queue), and the full save carries the section', () => stage(() => prep(async () => {
    K().knowRecipe('forge_barricade'); K().knowRecipe('load_rifle'); give('workbench'); K().place('workbench');
    give('cloth_scrap', 1); give('knife'); K().make('make_rag'); // queued, not finished
    const s = JSON.parse(JSON.stringify(K().save()));
    K().learned.clear(); for (const b of K().placed) K().meshes.get(b.id)?.parent?.remove(K().meshes.get(b.id)); K().placed = []; K().queue = [];
    K().load(s);
    const ok = K().knows('forge_barricade') && K().knows('load_rifle') && K().placed.length === 1 && K().placed[0].bench === 'workbench' && K().queue.length === 1 && K().queue[0].rid === 'make_rag' && K().meshes.size === 1;
    if (!ok) return `after load: ${JSON.stringify(K().view())}`;
    const { snapshot } = await import('./api.js');
    const snap = snapshot(g);
    return snap.crafting && snap.crafting.learned.includes('load_rifle') ? true : 'snapshot has no crafting section';
  })));

  await check('crafting: the queue is on the game clock - progress is the clock\'s hours, a make cancelled hands the very same inputs back, a loud recipe is heard', () => stage(() => prep(async () => {
    give('wood_scrap', 1); fireHere(); g.deep.skill.fabrication = 3;
    const r = K().make('make_charcoal'); if (!r.ok) return r.why;
    if (inv().carried.count('wood_scrap') !== 0) return 'inputs not taken at once';
    const j = K().queue[0], need = j.need; K().update(); const d0 = j.done;
    g.sky.time = (g.sky.time + 1) % 24; K().update();
    const dh = j.done - d0;
    if (Math.abs(dh - 1) > 0.05) return `one clock hour moved the job ${dh} h`;
    const c = K().cancel(0);
    if (!c.ok || inv().carried.count('wood_scrap') !== 1 || K().queue.length) return `cancel: ${JSON.stringify(c)}`;
    // noise
    clean(); give('wood_scrap', 3); give('nails', 6); give('hand_saw'); give('hammer'); g.deep.skill.carpentry = 5; K().providers.push(() => [{ bench: 'workbench', x: g.player.x, z: g.player.z }]);
    let heard = 0; const real = g.noise; g.noise = (x, z, rad) => { heard = Math.max(heard, rad); return real?.call(g, x, z, rad); };
    const m = K().make('make_planks'); g.noise = real;
    return m.ok && heard === RECIPE_BY_ID.make_planks.noise && need > 0 ? true : `noise heard ${heard} (want ${RECIPE_BY_ID.make_planks.noise}) ${JSON.stringify(m)}`;
  })));

  await check('crafting: repair rows mend and sharpen - a whetstone puts an edge back on the most worn blade and wears itself; nothing worn, nothing to do', () => stage(() => prep(async () => {
    give('whetstone'); give('knife', 1, { cond: 0.4 }); g.deep.skill.mechanics = 0;
    const r = K().make('sharpen_blade', { instant: true }); if (!r.ok) return r.why;
    const k = inv().carried.slots.find((s) => s.id === 'knife'), st = inv().carried.slots.find((s) => s.id === 'whetstone');
    if (Math.abs(k.cond - 0.75) > 1e-6) return `knife ${k.cond} (want 0.75)`;
    if (Math.abs(st.cond - 0.96) > 1e-6) return `whetstone ${st.cond} (want 0.96)`;
    k.cond = 1; const again = K().assess('sharpen_blade');
    return !again.ok && /worn/.test(again.missing.join()) ? true : `a sharp blade still wants sharpening: ${JSON.stringify(again.missing)}`;
  })));

  await check('crafting: NO recipe creates net matter - every row, run for real with its tools, a bench and full skill, leaves the pack no heavier', () => stage(() => prep(async () => {
    const bad = [];
    for (const R of RECIPES) {
      clean(); K().providers = [() => Object.keys(BENCHES).filter((b) => b !== 'hand' && b !== 'mobile').map((b) => ({ bench: b, x: g.player.x, z: g.player.z }))];
      for (const id of SKILL_IDS) g.deep.skill[id] = 100;
      K().learned.add(R.id);
      for (const [id, n] of R.inputs) give(id, n);
      for (const [spec] of R.tools) { const alt = spec.split('|')[0]; const id = ITEMS[alt] ? alt : Object.keys(ITEMS).find((i) => ITEMS[i].tags?.includes(alt) && ITEMS[i].kind === 'tool') ?? Object.keys(ITEMS).find((i) => ITEMS[i].tags?.includes(alt)); if (id) give(id); }
      if (R.effect) { const [k, a] = R.effect; if (k === 'mendgear') give('soft_vest', 1, { cond: 0.3 }); else give(Object.keys(ITEMS).find((i) => ITEMS[i].kind === 'tool' && ITEMS[i].tags?.includes(a) && ITEMS[i].stack === 1), 1, { cond: 0.3 }); }
      const kg0 = kgNow(), r = K().make(R.id, { instant: true });
      if (!r.ok) { bad.push(`${R.id}: refused (${r.why})`); continue; }
      if (kgNow() > kg0 + CRAFT_RULES.slack + 1e-6) bad.push(`${R.id}: ${kg0.toFixed(3)} -> ${kgNow().toFixed(3)} kg`);
    }
    return bad.length ? bad.slice(0, 6).join(' | ') : true;
  })));

  await check('crafting: a crew job runs a recipe row - the base\'s CRAFT AMMO eats brass, powder, primer and lead and loads eight rounds; with only scrap it makes none (the old scrap-to-ammo hole is closed)', () => stage(() => prep(async () => {
    const J = CREW_JOB_BY_ID.ammo, m = { id: 'tester', name: 'Tester', row: { skills: { gunsmith: 3 } } };
    if (J.recipe !== 'load_pistol') return `the job names ${J.recipe}`;
    give('scrap', 3);
    const a = g.crew.jobCycle(m, J);
    if (a !== false || inv().carried.count('ammo_pistol') !== 0) return `scrap alone made ${inv().carried.count('ammo_pistol')} rounds (${a})`;
    for (const [id, n] of RECIPE_BY_ID.load_pistol.inputs) give(id, n);
    const r0 = inv().carried.count('ammo_pistol'), b = g.crew.jobCycle(m, J);
    const made = inv().carried.count('ammo_pistol') - r0;
    return b === true && made === 8 && inv().carried.count('brass_case') === 0 && inv().carried.count('gunpowder') === 0 ? true : `job returned ${b}, ${made} rounds, brass ${inv().carried.count('brass_case')}`;
  })));

  await check('crafting: the CRAFT tab opens from the PACK screen (Q), files every recipe by group, marks what you can make, shows missing things and what teaches the rest, and queues with a progress bar', () => stage(() => prep(async () => {
    const UI = g.craftUI;
    give('cloth_scrap', 4); give('knife'); give('workbench');
    g.invUI.toggle(true); UI.setTab(true);
    if (!UI.active || UI.el.craft.classList.contains('hidden')) return 'the tab did not open';
    const can = UI.rows.filter((r) => r.can).map((r) => r.id);
    if (!can.includes('make_rag')) return `make_rag not makeable (${can})`;
    if (UI.el.groups.children.length !== Object.keys(GROUPS).length + 1) return 'group chips missing';
    UI.group = 0; UI.render();
    const idx = UI.rows.findIndex((r) => r.id === 'load_rifle'); if (idx < 0) return 'no unknown row listed';
    UI.sel = idx; UI.render();
    if (!/UNKNOWN/.test(UI.el.detail.textContent)) return 'an unknown recipe is not greyed with what teaches it';
    UI.sel = UI.rows.findIndex((r) => r.id === 'make_planks'); UI.render();
    if (!UI.el.detail.querySelector('li.no')) return 'missing inputs are not marked';
    UI.sel = UI.rows.findIndex((r) => r.id === 'make_rag'); UI.render();
    UI.make();
    const q = UI.el.queue.querySelector('.qj.head i em');
    const queued = K().queue.length === 1 || inv().carried.count('rag') === 3;
    g.invUI.toggle(false);
    return q && queued && !UI.active ? true : `queue bar ${!!q} queued ${queued} closed ${!UI.active}`;
  })));
}
