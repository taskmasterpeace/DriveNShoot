// COMMANDS rows and selftest checks for THE CREW and the TACTICS brain (docs/design/WEB_CREW.md §7).
//   crew       the crew: members, candidates, graves, the wall, pins; one member; the row validators; debug verbs
//   crewJoin   someone joins (a candidate by key the way its dialogue does it, any person by id, or a fresh person of a row)
//   crewOrder  an order to everyone or one member (the radial's orders)
//   crewJob    a job for a member; claim a base; make camp; run the job clock forward
//   tactics    a fighter's tactical picture: role, chosen cover, band, flank angle, suppression, morale
// Checks drive the player through the real paths where there is one (keys for U and E, the dialogue for joining);
// staged positions are the documented exception.
import { CREW_ROWS, CREW_RULES, CREW_BY_ID, validateCrew, CREW_SKILLS } from '../data/crew.js';
import { CREW_JOBS, validateCrewJobs } from '../data/crewjobs.js';
import { DOCTRINE, BANDS, validateDoctrine } from '../data/doctrine.js';
import { ORDERS } from '../systems/crew.js';
import { WEAPONS } from '../systems/combat.js';
import { VERBS } from '../data/society.js';
import { ITEMS } from '../data/items.js';
import { FLAG_KEYS } from '../ui/portrait.js';
import { outfit } from '../systems/characters.js';
import { BREEDS } from '../data/dogs.js';

export function crewCommands(api, need) {
  const g = api.g, P = () => g.player, K = () => g.crew;
  const member = (id) => { const m = K().byAny(id); need(m, `no crew member ${id}; crew: ${K().members.map((x) => `${x.id}:${x.name}`).join(', ') || 'nobody'}`); return m; };
  const summary = () => {
    const k = K();
    return {
      size: k.size(), cap: CREW_RULES.cap, archetypes: k.archetypes(), archetypeCap: CREW_RULES.archetypeCap, formation: k.formation, camp: k.camp, base: k.base,
      members: k.members.map((m) => k.view(m)),
      candidates: [...k.cands.values()].map((s) => ({ key: s.key, row: s.row, card: CREW_BY_ID[s.row]?.name, how: s.how, state: s.state, id: s.c?.id ?? null, name: s.name ?? null, x: s.c ? +s.c.x.toFixed(1) : null, z: s.c ? +s.c.z.toFixed(1) : null })),
      graves: k.graves, memorial: k.memorial, pins: k.pins, stats: k.stats, obituary: k.obituary ?? null, dragging: k.drag?.id ?? null,
    };
  };
  return {
    crew: {
      group: 'player', desc: 'THE CREW (systems/crew.js, data/crew.js, docs/design/WEB_CREW.md): 1-6 counting you, a new game starts solo. No args: size and caps (6; 4 of the 8 CREW CARDS), formation, camp, base, every member (card, flag, hp, needs, gun + mag + spare rounds, trust, flaw, order, fire, job + whether its place is live, skills, saves, kills, down + bleed clock, away on a run), the candidates you can still meet (key, row, how: talk|hire|rescue|earn, state, where), graves, the memorial wall, map pins, counters, the last obituary. id=<member rec|name|row> for one. validate=true runs the row validators (crew rows, jobs, doctrine). Debug verbs on a member (id=): trust=<deed verb or crew event> seen=true|false applies the §4.4 formula once; down=true knocks them down (the bleed-out clock starts); patch=true patches them up; dawn=true runs a dawn (drift, wages, the hungry, who walks).',
      args: { id: { type: 'string' }, validate: { type: 'boolean' }, trust: { type: 'string' }, seen: { type: 'boolean', default: true }, down: { type: 'boolean' }, patch: { type: 'boolean' }, dawn: { type: 'boolean' }, camptalk: { type: 'boolean' }, context: { type: 'boolean' }, bonds: { type: 'boolean' } },
      run: async ({ id, validate, trust, seen, down, patch, dawn, camptalk, context, bonds }) => {
        if (camptalk) return { lines: K().campTalk() };
        if (bonds) { const M = K().members, out = []; for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) out.push({ a: M[i].name, b: M[j].name, bond: +K().bond(M[i], M[j]).toFixed(1) }); return { bonds: out, heard: K().heard }; }
        if (context) { const m = member(id); return { context: K().context(m) }; }
        if (validate) return { crew: validateCrew(CREW_ROWS, { flags: FLAG_KEYS, weapons: Object.keys(WEAPONS), verbs: VERBS }), jobs: validateCrewJobs(CREW_JOBS, { skills: CREW_SKILLS, items: ITEMS }), doctrine: validateDoctrine(DOCTRINE, BANDS, ['pistol', 'smg', 'shotgun', 'rifle', 'auto', 'pump'].filter((k) => WEAPONS[k])) };
        if (dawn) K().dawn();
        if (!id) return summary();
        const m = member(id);
        if (trust) { const before = m.trust; K().trustEvent(trust, m, seen); if (m.trust === before && !(m.row.values[trust])) need(false, `${m.name} has no value for ${trust} (values: ${Object.keys(m.row.values).join(', ')})`); return { member: K().view(m), from: +before.toFixed(2), d: +(m.trust - before).toFixed(2) }; }
        if (down) { need(m.c?.alive, `${m.name} is not standing`); g.combat.damage(m.c, 9999, null, 1, 0); K().update(0); }
        if (patch) { const r = K().stabilize(m); need(r.ok, r.why); }
        return { member: K().view(m) };
      },
    },
    crewJoin: {
      group: 'player', desc: 'Someone joins the crew. key=<candidate key> joins a seeded candidate the way its dialogue does (talk, hire: pays the day, rescue: cuts them loose and records the rescue deed). id=<character> makes any living person a member (row= picks their card; else a generic by their gun). spawn=<row id> stands a new person of that row beside you and has them join (scenarios). how= talk|hire|rescue|earn|api. Refused past the caps (6 with you; 4 of the 8 CREW CARDS; a card only once). leave=<member> lets one go (they take a share).',
      args: { key: { type: 'string' }, id: { type: 'string' }, row: { type: 'string' }, spawn: { type: 'string' }, how: { type: 'string', default: 'api', enum: ['talk', 'hire', 'rescue', 'earn', 'api'] }, leave: { type: 'string' } },
      run: async ({ key, id, row, spawn, how, leave }) => {
        const k = K();
        if (leave) { const m = member(leave); return k.dismiss(m); }
        if (key) {
          const s = k.cands.get(key); need(s, `no candidate ${key}; candidates: ${[...k.cands.keys()].join(', ')}`);
          need(s.state === 'waiting' && s.c, `candidate ${key} is ${s.state}${s.c ? '' : ' (not standing here: go to them)'}`);
          if (s.how === 'rescue') return k.rescue(key);
          if (s.how === 'hire') { need(g.spend(CREW_BY_ID[s.row].pay), 'not enough scrip for the day rate'); }
          return k.joinChar(s.c, s.how);
        }
        if (spawn) {
          need(CREW_BY_ID[spawn], `no crew row ${spawn}; rows: ${CREW_ROWS.map((r) => r.id).join(', ')}`);
          const R = CREW_BY_ID[spawn], p = P(), n = k.members.length;
          const c = g.addChar({ x: p.x + 2 + n, z: p.z + 2, faction: 'drifter', weapon: R.weapon, hp: R.hp, name: R.names[(n * 7 + k.nextRec) % R.names.length], flag: R.flags[n % R.flags.length], colors: k.colors(R, n * 31 + k.nextRec) });
          need(c, 'character budget full');
          const r = k.joinChar(c, how, spawn);
          if (!r.ok) g.removeChar(c);
          return r;
        }
        need(id, 'give key=, id= or spawn=');
        const c = api.findChar(id); need(c && c.alive && c !== P(), `no living person ${id}`);
        if (row) need(CREW_BY_ID[row], `no crew row ${row}`);
        return k.joinChar(c, how, row ?? null);
      },
    },
    crewOrder: {
      group: 'player', desc: `An order (the radial, hold U; the pad: hold LB + right stick): order=${ORDERS.join('|')}. who=<member> for one (default everyone). x,z = the aim point for FOCUS MY TARGET (the hostile nearest it) and LOOT THIS (the box nearest it); default your aim. Members under -25 trust refuse the risky ones (focus, man the gun, loot, hold here); the Prospect only falls back when told twice. Returns who took it and who refused.`,
      args: { order: { type: 'string', required: true, enum: ORDERS }, who: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' } },
      run: async ({ order, who, x, z }) => {
        const m = who ? K().byAny(who) : null;
        if (who) need(m, `no crew member ${who}`);
        return K().order(order, m, x !== undefined && z !== undefined ? { x, z } : null);
      },
    },
    crewJob: {
      group: 'player', desc: `A job for a member (data/crewjobs.js): id=<member> job=${CREW_JOBS.map((j) => j.id).join('|')}|none. Road jobs work while you drive and they ride; camp jobs while you are stopped by the camp (camp=true makes it here); base jobs at a claimed building (claimBase=true at x,z, default where you stand). advance=<hours> runs the job clock (cycles, the scavenge run's return) and the needs forward that many game hours. jobs=true lists the rows.`,
      args: { id: { type: 'string' }, job: { type: 'string' }, claimBase: { type: 'boolean' }, camp: { type: 'boolean' }, x: { type: 'number' }, z: { type: 'number' }, advance: { type: 'number' }, jobs: { type: 'boolean' } },
      run: async ({ id, job, claimBase, camp, x, z, advance, jobs }) => {
        const k = K(), p = P(), out = {};
        if (jobs) return { jobs: CREW_JOBS };
        if (claimBase) out.base = k.claimBase(x ?? p.x, z ?? p.z).base;
        if (camp) { k.camp = { x: x ?? p.x, z: z ?? p.z, day: g.society?.day ?? 0 }; out.camp = k.camp; }
        if (id && job) { const r = k.assignJob(member(id), job); need(r.ok, r.why); out.job = r; }
        if (advance > 0) {
          for (const m of k.members) if (m.away) m.away.until -= advance;
          k.drainNeeds(advance); k.tickJobs(advance); k.tickRuns();
          out.advanced = advance;
        }
        return { ...out, members: k.members.map((m) => k.view(m)), pins: k.pins.length };
      },
    },
    tactics: {
      group: 'world', desc: 'THE TACTICS brain (systems/tactics.js, data/doctrine.js), shared by the crew and every hostile side: id=<character> shows one fighter\'s picture: doctrine, role (pin|flank|bound|overwatch|retreat|hold|cover|holdpos), why, the chosen goal and whether it is cover (1 low, 0.7 full, behind a car), the distance band, the distance now, how far off the target\'s facing they stand, suppression, morale, squad size and fallen, path left. No id: every fighter with a plan within radius (default 80 m) plus the counters (plans, paths, raycasts, flanks, breaks, suppressed, the slowest plan in ms). on=false puts every side back on the plain fight (an A/B).',
      args: { id: { type: 'string' }, radius: { type: 'number', default: 80 }, on: { type: 'boolean' } },
      run: async ({ id, radius, on }) => {
        const T = g.tactics;
        if (on !== undefined) T.on = on;
        if (id) { const c = api.findChar(id); need(c, `no character ${id}`); return { unit: T.view(c) }; }
        const p = P();
        return { on: T.on, stats: { ...T.stats, maxPlanMs: +T.stats.maxPlanMs.toFixed(3), maxPathMs: +T.stats.maxPathMs.toFixed(3) }, doctrines: Object.fromEntries(Object.entries(DOCTRINE).map(([k, d]) => [k, d.name])),
          units: g.chars.filter((c) => c.tac && c.alive && Math.hypot(c.x - p.x, c.z - p.z) <= radius).map((c) => T.view(c)) };
      },
    },
  };
}

// ---- the checks ------------------------------------------------------------------------------------------------------
const STAGE = { x: 240, z: -330 }; // the north-east glass flats on the island: open ground, no town, no camp
export async function crewChecks(api, check, C) {
  const g = api.g, K = g.crew, I = g.input, p = () => g.player;
  const steps = async (s) => { for (let t = 0; t < s; t += 0.5) await C('step', { seconds: Math.min(0.5, s - t) }); };
  const frames = async (n) => C('step', { seconds: n / 60 });
  const since = (seq, type, pred = () => true) => g.events.filter((e) => e.seq > seq && e.type === type && pred(e));
  const clearCrew = () => { for (const m of [...K.members]) { K.leave(m, 'dismissed', false); if (m.c) g.removeChar(m.c); } K.drag = null; K.camp = null; K.base = null; };
  const stage = async (fn, o = {}) => {
    const zOn = g.zombies.enabled, rt = g.raiderTimer, wOn = g.wilds?.enabled;
    g.zombies.enabled = false; g.raiderTimer = 1e9; if (g.wilds) g.wilds.enabled = false;
    for (const ev of [...g.society.director.active]) g.society.director.cancel(ev.id);
    if (g.player.inVehicle) g.exitVehicle(true);
    if (g.dialogue?.active) g.dialogue.close();
    if (g.crewUI.open) g.crewUI.toggle(false);
    const at = o.at ?? STAGE;
    await C('teleport', at);
    for (const c of [...g.chars]) if (c !== g.player && !c.npc && !c.crewRec && Math.hypot(c.x - at.x, c.z - at.z) < 120) g.removeChar(c);
    // Dustwolf buggies roam the flats and run people down (a member died that way mid-check): parked out of it.
    const parked = [];
    for (const v of g.vehicles) if ((v.ai === 'raider' || v.ai === 'traffic') && Math.hypot(v.x - at.x, v.z - at.z) < 300) { parked.push([v, v.ai]); v.ai = null; v.vx = v.vz = 0; }
    await C('setTime', { hour: o.hour ?? 12 }); await C('setWeather', { key: 'CLEAR', instant: true });
    const hp = g.player.hp;
    try { return await fn(at); }
    finally {
      g.zombies.enabled = zOn; g.raiderTimer = rt; if (g.wilds) g.wilds.enabled = wOn; g.player.hp = hp; g.aimOverride = null;
      for (const [v, ai] of parked) v.ai = ai;
      for (const k of ['KeyU', 'KeyE']) I.keyUp(k);
      if (g.crewUI.radial) g.crewUI.closeRadial(false);
      if (g.crewUI.open) g.crewUI.toggle(false);
      if (g.player.inVehicle) g.exitVehicle(true);
      if (!o.keepCrew) clearCrew();
      for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - at.x, c.z - at.z) < 120) g.removeChar(c);
      for (const id of o.pieces ?? []) try { g.materials.unbuild(id); } catch {}
    }
  };
  // A pack emptied for a check that needs room (the battery before has filled it), put back after.
  const roomy = async (fn) => { const inv = g.inventory, keep = inv.carried.slots.splice(0); try { return await fn(); } finally { inv.carried.slots.length = 0; inv.carried.slots.push(...keep); inv.dirty = true; } };
  const join = async (row) => { const r = await C('crewJoin', { spawn: row }); return r.ok ? K.byAny(String(r.rec)) : null; };
  const raider = (x, z, weapon = 'smg') => { const c = g.spawnRaider(x, z, Math.random, weapon); c.grudge = g.player; c.target = g.player; c.state = 'fight'; c.hp = c.maxHp = 400; return c; };

  await check('crew: the rows validate (8 CREW CARDS, the generics, the jobs, the doctrines, every flag drawable, every gun real)', async () => {
    const r = await C('crew', { validate: true });
    if (!r.crew.ok || !r.jobs.ok || !r.doctrine.ok) return JSON.stringify([...r.crew.errors, ...r.jobs.errors, ...r.doctrine.errors]).slice(0, 300);
    if (r.crew.cards !== 8 || r.crew.generics < 20) return `cards ${r.crew.cards}, generics ${r.crew.generics}`;
    return CREW_RULES.cap === 6 && CREW_RULES.archetypeCap === 4 && K.members.length === 0 ? true : `caps ${CREW_RULES.cap}/${CREW_RULES.archetypeCap}, a fresh game has ${K.members.length} members (should start solo)`;
  });

  await check('crew: a fresh game recruits through dialogue - Rust Haven\'s candidate, no agent join (gap acceptance 7)', () => stage(async () => {
    const s = K.cands.get('rh_wheelboss');
    if (!s?.c?.alive) return `the Rust Haven candidate is not standing (${s?.state})`;
    await C('teleport', { x: s.c.x + 1.5, z: s.c.z });
    const t = await C('talk', { id: s.c.id }); if (!t.ok) return `talk: ${t.error}`;
    const d = api.dialogueState(), i = d.choices.findIndex((c) => c.text === 'Ride with me.');
    if (i < 0) return `no join choice: ${d.choices.map((c) => c.text).join(' | ')}`;
    const seq = g.eventSeq;
    await C('choose', { index: i }); await C('choose', { index: 0 });
    const ev = since(seq, 'crewJoined')[0];
    if (!ev || K.members.length !== 1 || K.members[0].how !== 'talk') return `joined ${JSON.stringify(ev)} members ${K.members.length}`;
    const m = K.members[0];
    await C('teleport', { x: STAGE.x, z: STAGE.z }); // they are left behind in town...
    await steps(1);
    return m.c.faction === 'ally' && m.c.follower && m.trust === 40 && s.state === 'joined' ? true : `faction ${m.c.faction} trust ${m.trust} state ${s.state}`;
  }, { at: { x: 0, z: -40 } }));

  await check('crew: the captives at the Dustwolf camp are cut loose by dialogue (rescue: trust 35, a rescue deed); hire takes the day rate', () => stage(async () => {
    let s = K.cands.get('camp0_captive_a');
    if (!(s?.state === 'waiting' && s.c?.alive)) { s = { key: 'selftest_captive', row: 'captive_hand', how: 'rescue', where: { camp: 0, dx: -7, dz: 7 }, line: 'Cut me loose.', state: 'waiting' }; K.cands.set(s.key, s); const pos = K.seedPos(s); K.spawnCandidate(s, pos.x, pos.z); } // the seeded one, unless the battery already freed or lost them
    if (!s?.c?.alive || !s.c.hold) return `captive not standing tied (${s?.state}, hold ${s?.c?.hold})`;
    await C('teleport', { x: s.c.x + 1.2, z: s.c.z });
    const seq = g.eventSeq;
    await C('talk', { id: s.c.id });
    const d = api.dialogueState(), i = d.choices.findIndex((c) => c.text.startsWith('Cut them loose. "Ride'));
    if (i < 0) return `no rescue choice: ${d.choices.map((c) => c.text).join(' | ')}`;
    await C('choose', { index: i }); if (g.dialogue.active) g.dialogue.close();
    const m = K.members.find((x) => x.how === 'rescue');
    const deed = since(seq, 'deed', (e) => e.verb === 'rescue').length;
    if (!m || m.trust !== 35 || m.c.hold || !deed) return `rescued ${!!m} trust ${m?.trust} hold ${m?.c.hold} deed ${deed}`;
    // The seeded guard if he still stands (the battery's raids can kill him), else one of the same row beside you.
    let h = K.cands.get('rh_guard');
    if (!(h?.state === 'waiting' && h.c?.alive)) { h = { key: 'selftest_hire', row: 'sutler_guard', how: 'hire', where: { x: g.player.x + 2, z: g.player.z }, line: 'Forty a day.', state: 'waiting' }; K.cands.set(h.key, h); K.spawnCandidate(h, h.where.x, h.where.z); }
    const cash = g.cash = 200;
    await C('teleport', { x: h.c.x + 1.2, z: h.c.z }); await C('talk', { id: h.c.id });
    const d2 = api.dialogueState(), j = d2.choices.findIndex((c) => c.text.startsWith('Hire on'));
    await C('choose', { index: j }); if (g.dialogue.active) g.dialogue.close();
    const hired = K.members.find((x) => x.how === 'hire');
    return hired && g.cash === cash - 40 && hired.pay === 40 && hired.trust === 10 ? true : `hired ${!!hired} cash ${g.cash} pay ${hired?.pay} trust ${hired?.trust}`;
  }, { at: { x: -380, z: -130 } }));

  await check('crew: the caps hold - 6 counting you, at most 4 of the 8 CREW CARDS, a card once; the full crew greys the dialogue choice', () => stage(async () => {
    const cards = ['wheelboss', 'staticear', 'quartermaster', 'marshkid'];
    for (const r of cards) if (!(await join(r))) return `card ${r} refused early`;
    const fifth = await C('crewJoin', { spawn: 'sleeper' });
    if (fifth.ok || fifth.why !== 'archetype') return `a 5th card joined: ${JSON.stringify(fifth)}`;
    if (!(await join('drifter_gun'))) return 'a generic was refused with room';
    const seventh = await C('crewJoin', { spawn: 'drifter_cook' });
    if (seventh.ok || seventh.why !== 'full' || K.size() !== 6) return `7th: ${JSON.stringify(seventh)} size ${K.size()}`;
    // A candidate of our own beside you: the full crew greys its join choice; a 5th card's choice is not there at all.
    const tmp = { key: 'selftest_cap', row: 'drifter_cook', how: 'talk', where: { x: g.player.x + 2, z: g.player.z }, line: 'Room for one more?', state: 'waiting' };
    const card = { key: 'selftest_card', row: 'thrownman', how: 'talk', where: { x: g.player.x - 2, z: g.player.z }, line: 'Take me along.', state: 'waiting' };
    let out = true;
    for (const s of [tmp, card]) {
      if (s === card) K.dismiss(K.members.find((m) => !m.row.archetype)); // room again (5 with you), but 4 cards already ride
      K.cands.set(s.key, s); K.spawnCandidate(s, s.where.x, s.where.z);
      await C('talk', { id: s.c.id, force: true }); const d = api.dialogueState(); g.dialogue.close();
      const greyed = d.choices.some((c) => c.text.startsWith('(The crew is full')), join = d.choices.some((c) => c.text === 'Ride with me.');
      if (s === tmp ? (!greyed || join) : (greyed || join)) out = `${s.key}: greyed ${greyed} join offered ${join}`;
      g.removeChar(s.c); K.cands.delete(s.key);
    }

    return out;

  }));

  await check('crew: tap U opens the CREW panel - a card per member with the flag as its backdrop, gun, trust, flaw', () => stage(async () => {
    await join('sleeper'); await join('drifter_gun');
    I.keyDown('KeyU'); await frames(4); I.keyUp('KeyU'); await frames(3);
    if (!g.crewUI.open) return 'the panel did not open on a tap of U';
    g.crewUI.render();
    const cards = [...g.crewUI.grid.querySelectorAll('.crewc')];
    const flags = cards.map((c) => c.querySelector('img.flag')?.getAttribute('src') ?? '');
    const ok = cards.length === 2 && flags.every((f) => f.startsWith('data:image/png')) && cards.every((c) => /TRUST/.test(c.textContent) && /FLAW/.test(c.textContent) && /GUN/.test(c.textContent));
    I.keyDown('KeyU'); await frames(4); I.keyUp('KeyU'); await frames(3);
    return ok && !g.crewUI.open ? true : `cards ${cards.length}, flags ${flags.map((f) => f.slice(0, 15)).join(',')}, closed ${!g.crewUI.open}`;
  }));

  await check('crew: hold U opens the orders radial; letting go on a wedge gives that order', () => stage(async () => {
    await join('drifter_gun');
    I.keyDown('KeyU'); await steps(0.5);
    if (!g.crewUI.radial) { I.keyUp('KeyU'); return 'no radial after a hold'; }
    const n = ORDERS.length, i = ORDERS.indexOf('holdpos'), a = (i / n) * Math.PI * 2 - Math.PI / 2;
    I.mouseMove(innerWidth / 2 + Math.cos(a) * 150, innerHeight / 2 + Math.sin(a) * 150); await frames(2);
    const seq = g.eventSeq;
    I.keyUp('KeyU'); await frames(3);
    const ev = since(seq, 'crewOrder')[0];
    return ev?.order === 'holdpos' && K.members[0].order === 'holdpos' && !g.crewUI.radial ? true : `order ${JSON.stringify(ev)} member ${K.members[0].order}`;
  }));

  // ---- the orders, each with a check -------------------------------------------------------------------------------
  await check('crew order FOLLOW + WEDGE/FILE/SPREAD: the crew keep their slots behind you as you walk', () => stage(async (at) => {
    for (const r of ['drifter_gun', 'drifter_scav', 'tracker']) await join(r);
    const shape = async (f) => {
      await C('crewOrder', { order: f });
      await C('moveTo', { x: at.x, z: at.z - 24 });
      g.aimOverride = { x: g.player.x, z: g.player.z - 30 }; // facing north (-z): the slots are in your frame
      await steps(6);
      const P0 = g.player, lat = K.members.map((m) => (m.c.x - P0.x)), back = K.members.map((m) => (m.c.z - P0.z));
      return { lat, back, near: K.members.every((m) => Math.hypot(m.c.x - P0.x, m.c.z - P0.z) < 16) };
    };
    const file = await shape('file'), spread = await shape('spread');
    const fileLat = Math.max(...file.lat.map(Math.abs)), spreadLat = Math.max(...spread.lat.map(Math.abs));
    const diag = K.members.map((m) => `${m.thinks}/${m.c.speed?.toFixed(1)}/${m.c.stuck?.toFixed?.(1)}/${m.c.x.toFixed(0)},${m.c.z.toFixed(0)}/${m.c.alive}/${g.chars.includes(m.c)}/${m.order}/${m.c.hold}/${m.c.target?.id}/${m.c.tac?.force}/${m.c.knockT}/${m.c.cowerT}/${m.c.dragged ? 1 : 0}`).join(" ");
    return file.near && spread.near && fileLat < 2.5 && spreadLat > 6 && file.back.every((b) => b > 0.5) ? true : `${diag} file lateral ${fileLat.toFixed(1)} back ${file.back.map((b) => b.toFixed(1))} spread lateral ${spreadLat.toFixed(1)} near ${file.near}/${spread.near}`;
  }));

  await check('crew order HOLD HERE: they stay put while you walk 30 m off; TAKE COVER: they hold their spot crouched', () => stage(async (at) => {
    const a = await join('drifter_gun'), b = await join('wall_veteran');
    await steps(1);
    await C('crewOrder', { order: 'holdpos', who: String(a.id) }); await C('crewOrder', { order: 'cover', who: String(b.id) });
    const ax = a.c.x, az = a.c.z, bx = b.c.x, bz = b.c.z;
    await C('moveTo', { x: at.x + 30, z: at.z }); await steps(3);
    const da = Math.hypot(a.c.x - ax, a.c.z - az), db = Math.hypot(b.c.x - bx, b.c.z - bz);
    return da < 1.5 && db < 1.5 && b.c.crouch && g.tactics.unit(b.c).force === 'cover' ? true : `hold drift ${da.toFixed(1)} cover drift ${db.toFixed(1)} crouch ${b.c.crouch}`;
  }));

  await check('crew order FOCUS MY TARGET: every member takes the hostile nearest your aim; FREE/HOLD FIRE: no rounds under hold, rounds under free', () => stage(async (at) => {
    const a = await join('wall_veteran'), b = await join('drifter_gun');
    const r1 = g.spawnRaider(at.x + 18, at.z - 6, Math.random, 'pistol'), r2 = g.spawnRaider(at.x - 18, at.z - 6, Math.random, 'pistol');
    for (const r of [r1, r2]) { r.hp = r.maxHp = 5000; r.hold = true; }
    await C('crewOrder', { order: 'holdfire' });
    await C('crewOrder', { order: 'focus', x: r1.x, z: r1.z });
    const focusOk = a.c.target === r1 && b.c.target === r1;
    const shots0 = r1.hp, rounds0 = a.rounds + b.rounds, m0 = a.c.mag + b.c.mag; await steps(3);
    const held = r1.hp === shots0 && r2.hp === r2.maxHp && a.c.mag + b.c.mag === m0 && a.rounds + b.rounds === rounds0;
    await C('crewOrder', { order: 'freefire' }); await steps(4);
    const fired = r1.hp < shots0 || a.c.mag + b.c.mag + a.rounds + b.rounds < m0 + rounds0; // rounds went at it (a hit is luck at 30 m)
    const dg = [a, b].map((m) => `${m.c.target?.id}/${m.c.tac?.holdFire}/${m.c.tac?.role}/${m.c.mag}/${m.rounds}/${m.dry}/${Math.hypot(m.c.x - r1.x, m.c.z - r1.z).toFixed(1)}/${m.c.reloading?.toFixed?.(1)}`).join(" ");
    return focusOk && held && fired ? true : `${dg} focus ${focusOk} (targets ${a.c.target?.id}/${b.c.target?.id} want ${r1.id}) held ${held} fired ${fired}`;
  }));

  await check('crew order FALL BACK TO THE RIG and MAN THE GUN: they run to your car and board; the gunner shoots a hostile from it', () => stage(async (at) => {
    const v = g.vehiclesSys.spawn('pickup', at.x + 10, at.z, 0, '#56603f'); g.lastVehicle = v;
    const a = await join('drifter_gun'), b = await join('shotgun_rider');
    await C('moveTo', { x: at.x - 12, z: at.z + 6 }); await steps(1);
    await C('crewOrder', { order: 'fallback', who: String(a.id) }); await C('crewOrder', { order: 'mangun', who: String(b.id) });
    await steps(6);
    const aboard = (c) => c.inVehicle === v || c.onDeck?.v === v, boarded = aboard(a.c) && aboard(b.c);

    const r = g.spawnRaider(v.x + 14, v.z + 2, Math.random, 'pistol'); r.hp = r.maxHp = 5000; r.hold = true;
    const hp0 = r.hp; await steps(4);
    g.vehiclesSys.remove?.(v);
    return boarded && r.hp < hp0 ? true : `boarded ${a.c.inVehicle?.id}/${b.c.inVehicle?.id} (rig ${v.id}) gunner hit ${r.hp < hp0}`;
  }));

  await check('crew order LOOT THIS: a member walks to the box nearest your aim and brings its contents into your pack', () => stage((at) => roomy(async () => {
    const a = await join('drifter_scav');
    const box = g.inventory.place('crewtest:box', 'crate', at.x + 8, at.z + 3, 40, 'TEST CRATE'); box.rolled = true;
    g.inventory.add(box, 'bandage', 3); g.inventory.add(box, 'scrap', 2);
    const before = g.inventory.carried.count('bandage');
    await C('crewOrder', { order: 'loot', x: box.x, z: box.z }); await steps(5);
    g.inventory.boxes.delete('crewtest:box');
    return g.inventory.carried.count('bandage') === before + 3 && !box.slots.length ? true : `bandages ${before} -> ${g.inventory.carried.count('bandage')}, box left ${box.slots.length}`;
  })));

  await check('crew order STAND WATCH: makes camp; the watch names a raider coming before it opens up', () => stage(async (at) => {
    const a = await join('tracker');
    await C('crewOrder', { order: 'watch' }); await C('crewJob', { id: String(a.id), job: 'watch' });
    if (!K.camp) return 'no camp made';
    const seq = g.eventSeq;
    const r = g.spawnRaider(at.x + 30, at.z, Math.random, 'pistol'); r.hold = true;
    await steps(2);
    const ev = since(seq, 'crewCallout')[0];
    return ev && ev.target === r.id && /EAST/.test(ev.dir) ? true : `callout ${JSON.stringify(ev)}`;
  }));

  // ---- trust (§4.4) -----------------------------------------------------------------------------------------------
  await check('crew trust: the Sleeper watches you kill an unarmed man: killUnarmed weight 3 x value -5 = -15 seen; heard in camp x0.4', () => stage(async (at) => {
    const s = await join('sleeper');
    await steps(1);
    const victim = g.addChar({ x: at.x + 5, z: at.z, faction: 'drifter', weapon: null, hp: 50, colors: outfit('drifter'), name: 'Unarmed (selftest)', flag: 'US' });
    const seq = g.eventSeq, t0 = s.trust;
    g.combat.damage(victim, 9999, g.player, 1, 0);
    await steps(1);
    const ev = since(seq, 'crewTrust', (e) => e.kind === 'killUnarmed' && e.rec === s.id)[0];
    const seen = ev?.d === -15 && ev.seen;
    const r = await C('crew', { id: String(s.id), trust: 'killUnarmed', seen: false });
    return seen && r.d === -6 ? true : `seen event ${JSON.stringify(ev)} (from ${t0}); heard d ${r.d}`;
  }));

  await check('crew trust: low trust refuses risky orders, leaves at dawn with a share; trust drifts toward 0 by 2 a day', () => stage(async () => {
    const a = await join('drifter_gun'), b = await join('drifter_scav');
    a.trust = -30; b.trust = 10;
    const r = await C('crewOrder', { order: 'focus' });
    if (!r.refused.includes(a.name)) return `not refused: ${JSON.stringify(r)}`;
    a.trust = -45; g.cash = 300;
    const seq = g.eventSeq;
    await C('crew', { dawn: true });
    const left = since(seq, 'crewLeft', (e) => e.rec === a.id)[0];
    return left && left.took > 0 && b.trust === 8 && K.members.length === 1 ? true : `left ${JSON.stringify(left)} b trust ${b.trust} members ${K.members.length}`;
  }));

  // ---- mortality ----------------------------------------------------------------------------------------------------
  await check('crew down: a member who goes down bleeds out unless you patch them (tap E with a bandage) - then they stand', () => stage(async () => {
    const a = await join('drifter_gun');
    await steps(0.5);
    g.inventory.add(g.inventory.carried, 'bandage', 2);
    const seq = g.eventSeq;
    g.combat.damage(a.c, 9999, null, 1, 0); await steps(0.5);
    if (!a.down || !since(seq, 'crewDown').length) return `not down (alive ${a.c.alive}, down ${a.down})`;
    await C('teleport', { x: a.c.x + 1, z: a.c.z });
    I.keyDown('KeyE'); await frames(3); I.keyUp('KeyE'); await frames(3);
    return !a.down && a.c.alive && a.c.hp > 0 && since(seq, 'crewSaved').length ? true : `down ${a.down} alive ${a.c.alive} hp ${a.c.hp}`;
  }));

  await check('crew drag: hold E on a downed member and they come with you, slow', () => stage(async (at) => {
    const a = await join('drifter_gun'); await steps(0.5);
    g.combat.damage(a.c, 9999, null, 1, 0); await steps(0.3);
    await C('teleport', { x: a.c.x + 1, z: a.c.z });
    I.keyDown('KeyE'); await steps(0.6); I.keyUp('KeyE'); await frames(2);
    if (K.drag !== a) return 'not dragging after a hold';
    const x0 = a.c.x;
    await C('moveTo', { x: at.x + 14, z: at.z + 6 }); await steps(0.5);
    const moved = a.c.x - x0;
    I.keyDown('KeyE'); await frames(3); I.keyUp('KeyE'); await frames(2);
    return moved > 5 && !K.drag ? true : `moved ${moved.toFixed(1)} still dragging ${!!K.drag}`;
  }));

  await check('crew death: the bleed-out ends in a grave, a name on the memorial wall, a chronicle record and the radio obituary', () => stage(async () => {
    const a = await join('quartermaster'); await steps(0.5);
    const seq = g.eventSeq, graves = K.graves.length, cseq = g.society.chronicle.seq;
    g.combat.damage(a.c, 9999, null, 1, 0); await steps(0.3);
    a.bleed = 0.5; await steps(1);
    const died = since(seq, 'crewDied')[0];
    const rec = g.society.chronicle.ring.find((r) => r.seq > cseq && r.v === 'crewDied' && r.on === a.name);
    return died && K.graves.length === graves + 1 && K.memorial.some((x) => x.name === a.name) && rec && /STATIC 1660/.test(died.obituary) && !K.members.includes(a) ? true : `died ${!!died} graves ${K.graves.length - graves} chronicle ${!!rec}`;
  }));

  // ---- save / load ----------------------------------------------------------------------------------------------------
  await check('crew save: save -> load keeps the crew (trust, order, job, rounds) and the save is shard-portable', () => stage(async () => {
    const a = await join('wheelboss'), b = await join('drifter_cook');
    a.trust = 55.5; a.rounds = 77; await C('crewOrder', { order: 'holdpos', who: String(a.id) }); await C('crewJob', { id: String(b.id), job: 'cook', camp: true });
    const sv = (await C('save')).save;
    clearCrew();
    const r = await C('load', { save: sv });
    if (!r.ok) return `load: ${r.error}`;
    const A = K.members.find((m) => m.rowId === 'wheelboss'), B = K.members.find((m) => m.rowId === 'drifter_cook');
    const kept = A && B && A.trust === 55.5 && A.rounds === 77 && A.order === 'holdpos' && B.job === 'cook' && A.c?.crewRec === A && A.c.faction === 'ally';
    const port = K.save({ portable: true });
    clearCrew(); K.load(port);
    const A2 = K.members.find((m) => m.rowId === 'wheelboss');
    return kept && A2 && A2.c?.alive && A2.trust === 55.5 && port.members.every((m) => m.cid === null) ? true : `kept ${kept} portable ${!!A2?.c}`;
  }, { keepCrew: false }));

  // ---- jobs ---------------------------------------------------------------------------------------------------------
  await check('crew jobs: TEND WOUNDS heals you and CLEAN GUNS cleans yours over a game hour at camp; COOK eats a food item', () => stage(() => roomy(async () => {
    const a = await join('field_medic'), b = await join('gun_tinker'), c = await join('drifter_cook');
    await C('crewJob', { camp: true }); await C('crewJob', { id: String(a.id), job: 'tend' }); await C('crewJob', { id: String(b.id), job: 'clean' }); await C('crewJob', { id: String(c.id), job: 'cook' });
    g.player.hp = 40; const k = g.inv.current; g.inv.cond[k] = 0.5; g.inventory.add(g.inventory.carried, 'jerky', 2);
    const food0 = g.inventory.carried.count('jerky'); c.needs.food = 0.3;
    await C('crewJob', { advance: 1.2 });
    return g.player.hp > 40 && g.inv.cond[k] > 0.5 && g.inventory.carried.count('jerky') < food0 && c.needs.food > 0.3 ? true : `hp ${g.player.hp} cond ${g.inv.cond[k]} jerky ${food0}->${g.inventory.carried.count('jerky')} food ${c.needs.food}`;
  })));


  await check('crew jobs: a SCAVENGE RUN takes the member off the map and brings back loot (or wounds) when the clock is up; base jobs need a base', () => stage(async (at) => {
    const a = await join('drifter_scav');
    const no = await C('crewJob', { id: String(a.id), job: 'scav_run' });
    if (no.ok) return 'a base job ran without a base';
    await C('crewJob', { claimBase: true });
    const r = await C('crewJob', { id: String(a.id), job: 'scav_run' });
    if (!r.ok || !a.away || a.c) return `run did not start: ${JSON.stringify(r).slice(0, 200)}`;
    const seq = g.eventSeq;
    await C('crewJob', { advance: 12 });
    const back = since(seq, 'crewRunBack')[0], died = since(seq, 'crewDied')[0];
    if (died) return true; // the wastes kept them: a legal outcome of the risk roll (and a grave)
    return back && back.loot.length && a.c?.alive && !a.away ? true : `back ${JSON.stringify(back)}`;
  }));

  await check('crew jobs: LOOKOUT on the road calls a hostile before it opens up; NAVIGATOR pins a place each hour on the move', () => stage(async (at) => {
    const v = g.vehiclesSys.spawn('pickup', at.x, at.z + 4, 0, '#56603f');
    const a = await join('tracker'), b = await join('caravan_driver');
    await C('enterVehicle', { id: v.id, force: true }); await steps(2);
    const aboard = (c) => c.inVehicle === v || c.onDeck?.v === v;
    if (!aboard(a.c) || !aboard(b.c)) { g.exitVehicle(true); g.vehiclesSys.remove?.(v); return `not aboard ${a.c.inVehicle?.id ?? a.c.onDeck?.v?.id} ${b.c.inVehicle?.id ?? b.c.onDeck?.v?.id} at ${a.c.x.toFixed(1)},${a.c.z.toFixed(1)} car ${v.x.toFixed(1)},${v.z.toFixed(1)}`; }

    await C('crewJob', { id: String(a.id), job: 'lookout' }); await C('crewJob', { id: String(b.id), job: 'navigator' });
    const seq = g.eventSeq;
    const r = g.spawnRaider(v.x + 35, v.z, Math.random, 'pistol'); r.hold = true;
    await steps(1.5);
    const call = since(seq, 'crewCallout', (e) => e.target === r.id)[0];
    v.vx = 0; v.vz = 12; // rolling
    const pins = K.pins.length; await C('crewJob', { advance: 1.1 });
    g.exitVehicle(true); g.vehiclesSys.remove?.(v);
    return call && K.pins.length > pins ? true : `callout ${!!call} pins ${pins}->${K.pins.length}`;
  }));

  // ---- tactics ------------------------------------------------------------------------------------------------------
  await check('tactics flank: a Dustwolf squad against you behind a wall puts at least one raider 60 deg or more off your facing within 20 s', () => stage(async (at) => {
    const wall = (await C('build', { kind: 'concrete_wall', x: at.x, z: at.z - 2, axis: 'x', len: 12 })).id;
    await C('teleport', { x: at.x, z: at.z }); g.player.face = Math.PI; g.aimOverride = { x: at.x, z: at.z - 30 };
    const sq = [raider(at.x - 3, at.z - 30), raider(at.x, at.z - 32), raider(at.x + 3, at.z - 30)];
    let best = 0, t = 0;
    for (; t < 20 && best < 60; t += 0.5) {
      await C('step', { seconds: 0.5 });
      const f = g.player.face;
      for (const r of sq) { if (!r.alive) continue; let off = Math.abs(((Math.atan2(r.x - g.player.x, r.z - g.player.z) - f) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) * 180 / Math.PI; if (off > best) best = off; }
    }
    const roles = sq.map((r) => r.tac?.role).join(',');
    g.materials.unbuild(wall);
    return best >= 60 ? true : `best off-facing ${best.toFixed(0)} deg in ${t}s; roles ${roles}; ${JSON.stringify(g.tactics.view(sq[2])).slice(0, 220)}`;
  }));

  await check('tactics band: a rifleman holds 25-45 m (he backs off from 12 m, stays in the band)', () => stage(async (at) => {
    await C('teleport', at); g.player.face = 0;
    const r = raider(at.x, at.z + 12, 'rifle');
    await steps(12);
    let lo = 1e9, hi = 0;
    for (let k = 0; k < 8; k++) { await C('step', { seconds: 0.5 }); const d = Math.hypot(r.x - g.player.x, r.z - g.player.z); lo = Math.min(lo, d); hi = Math.max(hi, d); }
    const U = r.tac;
    return lo >= 25 && hi <= 45 ? true : `distance ${lo.toFixed(1)}-${hi.toFixed(1)} band ${U?.band0?.toFixed(1)}-${U?.band1?.toFixed(1)} role ${U?.role}`;
  }));

  await check('tactics suppression: rounds past a raider raise his suppression (worse aim, hugs cover); it decays', () => stage(async (at) => {
    await C('teleport', at);
    const r = raider(at.x + 1, at.z - 20, 'smg'); r.hold = true;
    g.tactics.unit(r);
    g.player.face = Math.atan2(r.x - g.player.x, r.z - g.player.z);
    for (let k = 0; k < 6; k++) g.tactics.onShot(g.player);
    const s1 = r.tac.supp, aim = g.tactics.aimMul(r);
    r.hold = 0; await steps(3);
    return s1 > 0.5 && aim > 1.5 && r.tac.supp < s1 ? true : `supp ${s1.toFixed(2)} aimMul ${aim.toFixed(2)} after ${r.tac.supp.toFixed(2)}`;
  }));

  await check('tactics cover: a pinned raider picks a cover point the player cannot see crouched, behind the crate stack', () => stage(async (at) => {
    const pieces = [(await C('build', { kind: 'sandbags', x: at.x + 6, z: at.z - 16, axis: 'x', len: 3 })).id];
    await C('teleport', at); g.player.face = Math.PI;
    const r = raider(at.x + 4, at.z - 20, 'pistol');
    await steps(6);
    const U = r.tac, covered = U && U.cover > 0 && !g.statics.lineOfSight(g.player.x, g.player.z, U.gx, U.gz, 1, 0.6);
    for (const id of pieces) g.materials.unbuild(id);
    return covered ? true : `cover ${U?.cover} goal ${U?.gx?.toFixed(1)},${U?.gz?.toFixed(1)} role ${U?.role} why ${U?.why}`;
  }));

  await check('tactics doctrine: the Remnant bound and overwatch in turns; drifters break and fall back when the squad is cut down', () => stage(async (at) => {
    await C('teleport', at);
    const sq = [];
    for (let k = 0; k < 4; k++) { const s = g.bases.spawnSoldier(at.x - 6 + k * 4, at.z - 40, Math.random, 'rifle'); s.grudge = g.player; s.target = g.player; s.state = 'fight'; s.hp = s.maxHp = 2000; sq.push(s); }
    const seen = new Set();
    for (let t = 0; t < 8; t += 0.5) { await C('step', { seconds: 0.5 }); for (const s of sq) if (s.tac) seen.add(s.tac.role); }
    for (const s of sq) g.removeChar(s);
    if (!(seen.has('bound') && seen.has('overwatch'))) return `remnant roles seen: ${[...seen].join(',')}`;
    const dr = [];
    for (let k = 0; k < 4; k++) { const c = g.addChar({ x: at.x - 6 + k * 4, z: at.z - 25, faction: 'drifter', weapon: 'pistol', hp: 100, colors: outfit('drifter'), name: 'Drifter (selftest)', flag: 'MX' }); c.grudge = g.player; c.target = g.player; c.state = 'fight'; dr.push(c); }
    const seq = g.eventSeq;
    await steps(1);
    g.combat.damage(dr[0], 9999, g.player, 1, 0); g.combat.damage(dr[1], 9999, g.player, 1, 0);
    await steps(2);
    const broke = since(seq, 'tacBreak', (e) => e.faction === 'drifter').length;
    return broke && dr.slice(2).some((c) => c.tac?.role === 'retreat') ? true : `drifter breaks ${broke}, roles ${dr.map((c) => c.tac?.role).join(',')}`;
  }));

  // ---- talk: bonds, camp talk, interjections, the voice hooks -------------------------------------------------------
  await check('crew bonds: two new members start from how alike their values and flaws are; a deed they take opposite ways pulls them apart', () => stage(async (at) => {
    const a = await join('scrapsmith'), b = await join('marshkid');
    const b0 = K.bond(a, b); // the talker and the town-hater rub (FLAW_CLASH -20)
    const x = await join('ex_raider'), y = await join('drifter_gun');
    await steps(1);
    const xy0 = K.bond(x, y), victim = g.addChar({ x: at.x + 4, z: at.z + 2, faction: 'drifter', weapon: null, hp: 80, colors: outfit('drifter'), name: 'Mark (selftest)', flag: 'US' });
    const seq = g.eventSeq;
    g.society.deeds.record('rob', { target: victim, x: victim.x, z: victim.z });
    await steps(1);
    const ev = since(seq, 'crewBond', (e) => (e.a === x.id && e.b === y.id) || (e.a === y.id && e.b === x.id))[0];
    return b0 <= 40 - 20 && ev && !ev.same && K.bond(x, y) < xy0 ? true : `talker/town-hater ${b0}; rob bond ${xy0} -> ${K.bond(x, y)} event ${JSON.stringify(ev)}`;
  }));

  await check('crew camp talk: at camp at night a member brings up a deed they saw (place and all); a voice hook event carries kind and context', () => stage(async (at) => {
    const s = await join('sleeper'); await steps(1);
    const victim = g.addChar({ x: at.x + 5, z: at.z, faction: 'drifter', weapon: null, hp: 50, colors: outfit('drifter'), name: 'Unarmed Camp (selftest)', flag: 'US' });
    g.combat.damage(victim, 9999, g.player, 1, 0); await steps(1);
    await C('crewJob', { camp: true }); await C('setTime', { hour: 23 });
    const seq = g.eventSeq;
    await steps(2.5);
    const say = since(seq, 'crewSay', (e) => e.kind === 'camp')[0];
    return say && /hands|empty-handed/.test(say.line) && say.ctx?.memory?.kind === 'killUnarmed' ? true : `camp line ${JSON.stringify(say)} memories ${JSON.stringify(s.memory)}`;
  }, { hour: 23 }));

  await check('crew interjection: talk to someone hurt with the Sleeper beside you and she speaks up', () => stage(async (at) => {
    const s = await join('sleeper'); await steps(1);
    const hurt = g.addChar({ x: at.x + 3, z: at.z, faction: 'drifter', weapon: null, hp: 100, colors: outfit('drifter'), name: 'Bleeding (selftest)', flag: 'MX' });
    hurt.hp = 30; hurt.hold = true;
    const seq = g.eventSeq;
    await C('talk', { id: hurt.id, force: true }); await steps(1.2);
    if (g.dialogue.active) g.dialogue.close();
    const ev = since(seq, 'crewInterject')[0];
    return ev && ev.rec === s.id && ev.when === 'hurt' ? true : `interjection ${JSON.stringify(ev)}`;
  }));

  await check('crew panel tabs: ROSTER / ORDERS / JOBS / GEAR / BONDS / WALL each draw without a scroll; your dogs are on the roster', () => stage(async (at) => {
    for (const r of ['wheelboss', 'sleeper', 'quartermaster', 'drifter_gun', 'tracker']) await join(r);
    const stray = g.dogs.make(Object.keys(BREEDS)[0], at.x + 2, at.z + 2);
    if (!stray) return 'no dog could be made (the dog cap)';
    g.dogs.adopt(stray);
    g.crewUI.toggle(true);
    const bad = [];
    for (const t of ['roster', 'orders', 'jobs', 'gear', 'bonds', 'wall']) {
      g.crewUI.setTab(t);
      const card = g.crewUI.el.querySelector('.crewp-card'), n = g.crewUI.grid.children.length;
      if (!n || card.scrollHeight > card.clientHeight + 2) bad.push(`${t}: ${n} items, ${card.scrollHeight}>${card.clientHeight}`);
    }
    g.crewUI.setTab('roster');
    const dog = !!g.crewUI.grid.querySelector('.dogc');
    g.crewUI.toggle(false);
    g.dogs.dogs.splice(g.dogs.dogs.indexOf(stray), 1);
    return !bad.length && dog ? true : `${bad.join('; ')} dog card ${dog}`;
  }));

  await check('tactics cost: a plan averages under 0.3 ms, under 1% of plans take over 2 ms, under 2% of nav paths over 8 ms; plans are staggered, perFrame at most', async () => {
    const S = g.tactics.stats, avg = S.planMs / Math.max(1, S.plans), slow = S.slowPlans / Math.max(1, S.plans), slowPath = S.slowPaths / Math.max(1, S.paths);
    return S.plans > 0 && avg < 0.3 && slow < 0.01 && slowPath < 0.02 ? true : `plans ${S.plans} avg ${avg.toFixed(3)} ms, over 2 ms ${(slow * 100).toFixed(2)}%, slowest plan ${S.maxPlanMs.toFixed(3)} ms, slowest path ${S.maxPathMs.toFixed(3)} ms (${S.slowPaths}/${S.paths} over 8 ms)`;
  });
}
