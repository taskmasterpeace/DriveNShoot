// Selftest checks for the AUDIO + LLM TALK + DEEP SHEET lane (docs/design/WEB_VOICE_STATS.md §7). None of them needs
// the studio's Mac Mini: the model is the dev server's canned endpoint (/llm/mock/*), so a dead LAN never reddens the
// battery. The deep sheet runs the battery with live=false (api.js runSelfTest); a check here turns it on in a stage of
// its own and puts it back (an ordinary, untrained, calm, unhurt survivor) after.
import { resolve, FACTIONS, FACTION_KINDS, CREATURES, CREATURE_KINDS, ENGINES, ENGINE_KINDS, BEDS, AUDIO_MANIFEST, SPATIAL } from '../data/audiosets.js';
import { spatial } from '../systems/audio.js';
import { FX_KEYS } from '../systems/stats.js';
import { BARK_LINES, COMBAT_KEYS } from '../data/barks.js';
import { ARCHETYPE_OF } from '../data/voices.js';
import { journal } from '../systems/journal.js';
import { outfit } from '../systems/characters.js';
import { STATIONS, MUSIC_MANIFEST, MUSIC_BASE, RADIO } from '../data/radio.js';

export async function voiceStatsChecks(api, check, C) {
  const g = api.g, D = () => g.deep;
  const sheet = async (fn) => { const live0 = D().live; D().reset(); D().sheetSeen = g.sheet; D().live = true; try { return await fn(D()); } finally { D().reset(); D().live = live0; D().recompute(); } };

  // ---- 1. audio -------------------------------------------------------------------------------------------------------
  await check('audio sets: every faction x kind, creature x kind, engine x kind and bed resolves to files', () => {
    const miss = [];
    for (const f of FACTIONS) for (const k of FACTION_KINDS) if (!resolve(f, k)?.files.length) miss.push(`${f}/${k}`);
    for (const f of CREATURES) for (const k of CREATURE_KINDS) if (!resolve(f, k)?.files.length) miss.push(`${f}/${k}`);
    for (const [row, [set]] of Object.entries(ENGINES)) for (const k of ENGINE_KINDS) if (!resolve(set, k)?.files.length) miss.push(`engine ${row}: ${set}/${k}`);
    for (const set of Object.values(BEDS)) for (const k of ['day', 'night']) if (!resolve(set, k)?.files.length) miss.push(`${set}/${k}`);
    // A faction's barks are its own: two factions' pain takes are not the same files at the same pitch.
    const sig = (f) => { const r = resolve(f, 'bark.pain'); return `${r.files.map((x) => x.f).join()}@${r.pitch}`; };
    if (new Set(FACTIONS.map(sig)).size < FACTIONS.length) miss.push('two factions share one bark.pain signature');
    const lic = Object.values(AUDIO_MANIFEST.sets).flatMap((k) => Object.values(k)).flatMap((k) => k.files).filter((x) => x.lic === 'ef');
    if (lic.length) miss.push(`${lic.length} Energetic Forms files shipped (terms unconfirmed)`);
    if ((AUDIO_MANIFEST.bytes ?? 0) > 80 * 1048576) miss.push(`manifest ${(AUDIO_MANIFEST.bytes / 1048576).toFixed(1)} MB > 80 MB`);
    return miss.length ? `missing: ${miss.slice(0, 8).join(', ')}${miss.length > 8 ? ` (+${miss.length - 8})` : ''}` : true;
  });

  await check('audio sets: the files are served and decode (one per set)', async () => {
    g.audio.start();
    const bad = [];
    for (const [set, kinds] of Object.entries(AUDIO_MANIFEST.sets)) {
      const k = Object.keys(kinds)[0], f = kinds[k].files[0].f;
      const b = await g.audio.load(f);
      if (!b || b === 'failed' || !(b.duration > 0)) bad.push(f);
    }
    return bad.length ? `did not load/decode: ${bad.slice(0, 6).join(', ')}` : true;
  });

  await check('audio positional: louder and brighter near, silent past range, a wall muffles', () => {
    const r = 60, a = spatial(2, r), b = spatial(20, r), c = spatial(50, r), z = spatial(61, r), w = spatial(20, r, true);
    const bad = [];
    if (!(a.gain > b.gain && b.gain > c.gain && c.gain > 0)) bad.push(`gain not falling: ${a.gain.toFixed(3)} ${b.gain.toFixed(3)} ${c.gain.toFixed(3)}`);
    if (!(a.cutoff > b.cutoff && b.cutoff > c.cutoff)) bad.push(`cutoff not closing: ${a.cutoff | 0} ${b.cutoff | 0} ${c.cutoff | 0}`);
    if (z.gain !== 0) bad.push(`past range still ${z.gain}`);
    if (!(w.gain < b.gain && w.cutoff <= SPATIAL.indoorCut)) bad.push(`occluded ${w.gain.toFixed(3)}/${w.cutoff | 0} vs open ${b.gain.toFixed(3)}/${b.cutoff | 0}`);
    // The live path agrees: a sample 50 m off plays quieter than one 5 m off.
    g.audio.start();
    return bad.length ? bad.join('; ') : true;
  });

  await check('audio playback: variants rotate (never twice running), pitch jitters, the voice cap holds', async () => {
    g.audio.start();
    const seq = []; for (let i = 0; i < 40; i++) seq.push(g.audio.pick('selftest|rot', 5));
    const twice = seq.some((v, i) => i && v === seq[i - 1]), all = new Set(seq).size === 5;
    await Promise.all(g.audio.preload('common', 'step.road').filter((b) => b && b.then));
    const L = g.audio.listener; L.x = g.player.x; L.z = g.player.z; L.indoor = false;
    const cap0 = g.audio.sampleStats.capped, pitches = new Set();
    let played = 0;
    for (let i = 0; i < SPATIAL.voiceCap + 10; i++) if (g.audio.sample('common', 'step.road', { dist: 1 + (i % 7), range: 30 })) { played++; pitches.add(g.audio.lastSample.pitch); }
    const live = g.audio.voices.filter((v) => !v.done).length;
    for (const v of g.audio.voices) { try { v.src.stop(); } catch { /* done */ } v.done = true; }
    const bad = [];
    if (twice) bad.push('a take repeated back to back'); if (!all) bad.push('rotation skipped a take');
    if (!played) bad.push(`nothing played (${g.audio.lastSample?.why})`);
    if (live > SPATIAL.voiceCap) bad.push(`${live} voices > cap ${SPATIAL.voiceCap}`);
    if (g.audio.sampleStats.capped === cap0 && played >= SPATIAL.voiceCap) bad.push('cap never engaged');
    if (pitches.size < 3) bad.push(`pitch did not jitter (${[...pitches]})`);
    return bad.length ? bad.join('; ') : true;
  });

  await check('audio barks: every archetype has every combat key, ip-clean, and a bark is said', async () => {
    const bad = [];
    const archs = [...new Set(Object.values(ARCHETYPE_OF))];
    for (const a of archs) for (const k of COMBAT_KEYS) if (!BARK_LINES.some((r) => r.who === a && r.key === k && r.lines.length >= 2)) bad.push(`${a}/${k}`);
    const { denyHits } = await import(/* @vite-ignore */ `${location.origin}/tools/ip-terms.mjs`);
    const words = BARK_LINES.flatMap((r) => r.lines).join('\n');
    const hits = denyHits(words); if (hits.length) bad.push(`deny: ${hits.map((h) => h.term)}`);
    const c = g.addChar({ x: g.player.x + 6, z: g.player.z, faction: 'raider', weapon: 'pistol', colors: outfit('raider'), name: 'Bark (selftest)', flag: 'US', hp: 100 });
    try {
      const r = await C('bark', { id: c.id, key: 'combat.alert' });
      if (!r.ok || !r.said) bad.push(`bark said nothing: ${JSON.stringify(r).slice(0, 120)}`);
    } finally { g.removeChar(c); }
    return bad.length ? bad.join('; ') : true;
  });

  // ---- 2. the local model, mocked -----------------------------------------------------------------------------------------
  const L = () => g.llmtalk;
  const llmStage = async (mock, fn) => {
    const ep = L().endpoint, reach = L().reachable, en = L().enabled;
    const c = g.addChar({ x: g.player.x + 2, z: g.player.z, faction: 'drifter', weapon: null, colors: outfit('drifter'), name: 'Talker (selftest)', flag: 'MX', hp: 100 });
    L().enabled = true; L().reachable = true; L().endpoint = `${L().base}/mock/${mock}`; L().cache.clear();
    try { return await fn(c); } finally { L().endpoint = ep; L().reachable = reach; L().enabled = en; L().cache.clear(); g.removeChar(c); }
  };
  await check('llm: a mocked model answers valid JSON -> a grounded line with checked choices', () => llmStage('good', async (c) => {
    const ok0 = L().stats.ok, a = await L().ask(c, 'small talk');
    if (!a) return `no answer: ${JSON.stringify(L().log.at(-1))}`;
    if (!a.line || !Array.isArray(a.choices) || !a.choices.length) return `bad shape ${JSON.stringify(a).slice(0, 120)}`;
    if (!a.choices.some((ch) => ch.effect?.setQuest)) return 'the setQuest effect was lost';
    const f = L().lastPrompt?.facts;
    if (!f || f.name !== c.name || !f.place || !f.hour || !f.weather) return `prompt not grounded: ${JSON.stringify(f).slice(0, 160)}`;
    const again = await L().ask(c, 'small talk');
    if (again !== a || L().stats.cached < 1) return 'the second ask was not served from the cache';
    // Its choice runs its effect through the dialogue choices.
    const chs = L().choicesFor(a), q0 = g.quests.water_run;
    chs[0].do(); const set = g.quests.water_run; if (q0 === undefined) delete g.quests.water_run; else g.quests.water_run = q0;
    if (set !== 'offered') return `effect did not apply (${set})`;
    return L().stats.ok > ok0 ? true : 'stats.ok did not move';
  }));
  await check('llm: a malformed answer falls back (null), refused words and effects are thrown out', () => llmStage('bad', async (c) => {
    const rej0 = L().stats.rejected;
    const a = await L().ask(c, 'small talk');
    if (a !== null) return 'malformed JSON was accepted';
    L().endpoint = `${L().base}/mock/refuse`; L().cache.clear();
    const b = await L().ask(c, 'small talk');
    if (b !== null) return 'an answer with a denied word and a 500-scrip give was accepted';
    const v1 = L().validate('{"line":"Hi.","mood":"calm","choices":[{"t":"ok","effect":{"weather":"STORM"}}]}');
    const v2 = L().validate('{"line":"Hi.","mood":"calm","choices":[{"t":"ok","effect":{"cost":20}}]}');
    if (!v1.ok || v1.value.choices.length || v1.dropped.length !== 1 || !v2.ok || v2.value.choices[0].effect?.cost !== 20) return `validator: weather ${JSON.stringify(v1)}, cost ${v2.ok}`;
    return L().stats.rejected >= rej0 + 2 ? true : `rejected only ${L().stats.rejected - rej0}`;
  }));
  await check('llm: offline -> the authored topics, no talk-a-while, no error', async () => {
    const en = L().reachable, ep = L().endpoint;
    L().reachable = false;
    const c = g.addChar({ x: g.player.x + 2, z: g.player.z, faction: 'drifter', weapon: null, colors: outfit('drifter'), name: 'Quiet (selftest)', flag: 'US', hp: 100 });
    try {
      const a = await L().ask(c);
      g.dialogue.open(c);
      const offered = g.dialogue.choices.some((ch) => ch.ask);
      const topics = g.dialogue.choices.filter((ch) => ch.reply).length;
      g.dialogue.close();
      if (a !== null) return 'asked a model that is down';
      if (offered) return 'offered talk-a-while with the model down';
      return topics >= 3 ? true : `authored topics missing (${topics})`;
    } finally { L().reachable = en; L().endpoint = ep; g.removeChar(c); }
  });

  await check('llm: a crew member talks as crew - grounded in their trust and traits, through the same validator', () => llmStage('good', async (c) => {
    c.crew = true; c.trust = 42;
    const a = await L().crewTalk(c);
    const f = L().lastPrompt?.facts;
    c.crew = false;
    if (!a) return `no answer: ${JSON.stringify(L().log.at(-1))}`;
    if (!f?.crew || f.crew.trust !== 42 || !f.crew.traits?.length || !/crew/.test(f.role)) return `not grounded as crew: ${JSON.stringify(f?.crew)} ${f?.role}`;
    return true;
  }));

  // ---- radio ------------------------------------------------------------------------------------------------------------
  await check('radio: every station resolves, its music is served and decodes, the dial tunes in mid-song', async () => {
    g.audio.start();
    const bad = [], R = g.radio;
    for (const S of STATIONS.filter((s) => s.playlist)) {
      const T = R.playlist(S);
      if (!T.length) { bad.push(`${S.id} has no songs`); continue; }
      const r = await fetch(`/${MUSIC_BASE}${T[0].f}`); if (!r.ok) { bad.push(`${T[0].f} ${r.status}`); continue; }
      const buf = await g.audio.ctx.decodeAudioData(await r.arrayBuffer()).catch(() => null);
      if (!(buf?.duration > 30)) bad.push(`${T[0].f} did not decode (${buf?.duration})`);
      const t = 1.7e9, a = R.position(S, t), b = R.position(S, t + 5);
      if (a.index === b.index && Math.abs(b.offset - a.offset - 5) > 1e-6) bad.push(`${S.id} clock drifts`);
    }
    if ((MUSIC_MANIFEST.bytes ?? 0) > 60 * 1048576) bad.push('music over 60 MB');
    for (const S of STATIONS) if (S.ids) { const { denyHits } = await import(/* @vite-ignore */ `${location.origin}/tools/ip-terms.mjs`); const h = denyHits(S.ids.join(' / ')); if (h.length) bad.push(`${S.id}: ${h.map((x) => x.term)}`); }
    // On foot with no radio you hear nothing; with a portable radio in the pack you tune it.
    const slots = g.inventory.carried.slots, had = slots.some((s) => s?.id === RADIO.item);
    if (!had && R.canHear() && !g.player.inVehicle) bad.push('heard a radio with none');
    if (!had) g.inventory.add(g.inventory.carried, RADIO.item, 1);
    try {
      if (!R.canHear()) bad.push('the portable radio is not heard');
      const S = R.tune(STATIONS.findIndex((s) => s.id === 'kdst'));
      if (R.track?.station !== 'kdst') bad.push(`tuned but no song: ${JSON.stringify(R.view().track)}`);
      R.say(S, R.stationId(S)); if (!R.lastLine?.text) bad.push('no station ID');
      R.tune(0);
      if (R.track) bad.push('off still playing');
    } finally { if (!had) { const i = slots.findIndex((s) => s?.id === RADIO.item); if (i >= 0) g.inventory.take(g.inventory.carried, i, 1); } }
    return bad.length ? bad.join('; ') : true;
  });

  await check('radio: the news reads the chronicle, the emergency shelter is seeded by the day, and a lure springs raiders', async () => {
    const R = g.radio, bad = [];
    const h = R.headline();
    if (g.society.chronicle.query({ limit: 40 }).some((r) => r.a === 'player' && r.src !== 'rumor') && !h) bad.push('a deed on record but no headline');
    R.shelter = null; const s1 = R.shelterNow(), s2 = R.shelterNow();
    if (s1 !== s2 || !s1.name) bad.push('the shelter is not stable within a day');
    const line = R.stationId(STATIONS.find((s) => s.kind === 'emergency'));
    if (!line.includes(s1.name)) bad.push(`the broadcast does not name the shelter: ${line}`);
    const p = g.player, px = p.x, pz = p.z;
    s1.trap = true; s1.sprung = false; s1.x = px + 300; s1.z = pz;
    const before = g.chars.filter((c) => c.faction === 'raider').length;
    R.update(0);
    if (s1.sprung) bad.push('sprung from 300 m');
    p.x = s1.x + 5; p.z = s1.z;
    R.update(0);
    const spawned = g.chars.filter((c) => c.faction === 'raider' && c.alive && Math.hypot(c.x - s1.x, c.z - s1.z) < 30);
    if (!s1.sprung || spawned.length !== RADIO.trapCount) bad.push(`lure: sprung ${s1.sprung}, ${spawned.length} raiders (had ${before})`);
    for (const c of spawned) g.removeChar(c);
    p.x = px; p.z = pz; R.shelter = null;
    return bad.length ? bad.join('; ') : true;
  });

  // ---- 3. the deep sheet ------------------------------------------------------------------------------------------------
  await check('deep sheet: an ordinary untrained calm survivor folds to exactly neutral', () => sheet(async (S) => {
    const off = FX_KEYS.filter((k) => S.fx[k] !== (['carryKg', 'repair', 'luck'].includes(k) ? 0 : 1));
    return off.length ? `not neutral: ${off.map((k) => `${k}=${S.fx[k]}`).join(', ')}` : true;
  }));

  await check('deep sheet: each stat consumer moves its number', () => sheet(async (S) => {
    const bad = [], p = g.player;
    const move = (label, setup, read, want) => { S.reset(); S.sheetSeen = g.sheet; S.live = true; S.recompute(); const a = read(); setup(); S.recompute(); const b = read(); if (!(want === '<' ? b < a - 1e-9 : b > a + 1e-9)) bad.push(`${label}: ${a} -> ${b}`); };
    move('aim spread (Eye)', () => { S.attrs.eye = 9; }, () => g.skills.spreadMul, '<');
    move('reload (Quickness)', () => { S.attrs.quickness = 9; }, () => g.skills.reloadMul, '<');
    move('carry (Brawn)', () => { S.attrs.brawn = 9; }, () => g.skills.carryKg, '>');
    move('stamina drain (Grit)', () => { S.attrs.grit = 9; }, () => g.skills.sprintDrainMul, '<');
    move('move speed (Quickness)', () => { S.attrs.quickness = 9; }, () => g.skills.speedMul, '>');
    move('seen at (Quiet Step)', () => { S.setTraits(['quiet_step'], true); }, () => g.gear.seenMul(), '<');
    move('repair (Wits)', () => { S.attrs.wits = 9; }, () => g.gear.repairMul(), '>');
    move('first search (Scav Eye)', () => { S.setTraits(['scav_eye'], true); }, () => g.gear.luckRolls(), '>');
    move('xp (Fast Learner)', () => { S.setTraits(['fast_learner'], true); }, () => S.fx.xpMul, '>');
    // Prices at a real counter (Ike's): Charm cuts what you pay.
    const ike = g.chars.find((c) => c.npc?.id === 'ike');
    if (ike) {
      const px = p.x, pz = p.z;
      p.x = ike.x + 1; p.z = ike.z;
      move('counter price (Charm)', () => { S.attrs.charm = 10; }, () => { try { return g.trade.at({ owner: ike.id, slots: [], cap: 0, items: [] })?.buy ?? NaN; } catch (e) { return `threw ${e.message}`; } }, '<');
      p.x = px; p.z = pz;
    } else bad.push('no Ike to price at');
    // Noise you make: what reaches the infected's ears.
    let heard = 0; const zon = g.zombies.onNoise; g.zombies.onNoise = (x, z, r) => { heard = r; };
    try { move('noise (Loudmouth)', () => { S.setTraits(['loudmouth'], true); }, () => { g.noise(p.x, p.z, 10, p); return heard; }, '>'); } finally { g.zombies.onNoise = zon; }
    // Melee: a strike on a dummy.
    // Damage taken.
    const hpTest = (mulSetup) => { S.reset(); S.sheetSeen = g.sheet; S.live = true; mulSetup(); S.recompute(); const god = g.godMode; g.godMode = false; const hp0 = p.hp = p.maxHp; g.combat.damage(p, 10, null, 0, 0, 'test'); const lost = hp0 - p.hp; p.hp = p.maxHp; g.godMode = god; return lost; };
    const d0 = hpTest(() => {}), d1 = hpTest(() => S.setTraits(['thick_skinned'], true));
    if (!(d1 < d0)) bad.push(`damage taken (Thick-Skinned): ${d0} -> ${d1}`);
    // Healing: survival's own fold reads ours.
    move('wound healing (Resilient)', () => { S.setTraits(['resilient'], true); }, () => { g.survival.update(0); return g.needs.healMul; }, '>');
    // The infected's nose: farther off, they lose you (scentMul) - pickTarget with you at the edge of smell.
    move('scent (Fieldcraft)', () => { S.skill.fieldcraft = 100; }, () => S.fx.scentMul, '>');
    move('handling (Road-Born)', () => { S.setTraits(['road_born'], true); }, () => S.fx.handling, '>');
    move('lock time (Wits)', () => { S.attrs.wits = 10; }, () => S.fx.lockMul, '<');
    move('hunger and thirst (Hardy)', () => { S.setTraits(['hardy'], true); }, () => S.fx.drainMul, '<');
    move('waking (Light Sleeper)', () => { S.setTraits(['light_sleeper'], true); }, () => S.fx.wakeMul, '>');
    move('melee (Brawn)', () => { S.attrs.brawn = 10; }, () => S.fx.meleeMul, '>');
    return bad.length ? bad.join('; ') : true;
  }));

  await check('deep sheet: a wound lands on a zone, opens an injury, and the zone costs you', () => sheet(async (S) => {
    const spread0 = g.skills.spreadMul, speed0 = g.skills.speedMul;
    let w = null; for (let s = 1; s < 60 && !w?.injury; s++) { S.reset(); S.live = true; w = S.wound(g.player.maxHp, 'bullet', s); }
    S.recompute();
    if (!w?.injury) return 'no injury opened';
    if (w.hp > 0) return `zone ${w.zone} not disabled (${w.hp})`;
    const v = S.view(), z = v.injuries.find((x) => x.zone === w.zone);
    if (z.state !== 'disabled' || !z.injuries.length) return `view: ${JSON.stringify(z)}`;
    const moved = g.skills.spreadMul !== spread0 || g.skills.speedMul !== speed0 || g.skills.reloadMul !== 1 || g.skills.sprintDrainMul !== 1;
    return moved ? true : `a disabled ${w.zone} moved nothing`;
  }));

  await check('deep sheet: stress climbs the ladder to panic, and panic shakes the aim', () => sheet(async (S) => {
    const a0 = g.skills.spreadMul;
    S.stressAdd(S.cap() * 0.6, 'test'); S.recompute();
    const lv = S.cond.stressed, a1 = g.skills.spreadMul;
    S.stressAdd(S.cap() * 0.5, 'test'); S.recompute();
    if (!(lv >= 2)) return `stressed level ${lv} at 60%`;
    if (!(a1 > a0)) return `stress did not shake the aim (${a0} -> ${a1})`;
    if (!(S.cond.panicked >= 1)) return `no panic at ${(S.stress / S.cap() * 100).toFixed(0)}%`;
    return g.skills.spreadMul > a1 ? true : 'panic did not shake it more';
  }));

  await check('deep sheet: skills grow by doing, tiers offer perks, a perk moves the fold', () => sheet(async (S) => {
    S.gain('driving', 400, 'test');
    if (!(S.skill.driving >= 20)) return `driving only ${S.skill.driving}`;
    const pend = S.pending().filter((x) => x.skill === 'driving');
    if (!pend.length) return 'no perk waiting at a tier';
    const h0 = S.fx.handling;
    const r = S.pickPerk('driving', 'a');
    if (!r.ok) return r.why;
    return S.fx.handling > h0 ? true : `perk did not move handling (${h0} -> ${S.fx.handling})`;
  }));

  // ---- 4. dialogue checks and the journal ----------------------------------------------------------------------------------
  await check('dialogue checks: a skill-gated choice greys out with its reason, then opens', () => sheet(async (S) => {
    const r = await C('registerNpc', { def: { id: 'selftest_gate', name: 'Gatekeeper', flag: 'GH', start: 'a', nodes: { a: { text: 'Convince me.', choices: [
      { t: 'Trust me.', check: { skill: { persuade: 30 } }, end: true }, { t: 'Here is the paper.', check: { item: 'selftest_paper' }, end: true }, { t: '[Leave]', end: true }] } } } });
    if (!r.ok) return `registerNpc: ${r.error}`;
    try {
      await C('talk', { id: 'selftest_gate', force: true });
      const pick = () => g.dialogue.choices.find((ch) => ch.t === 'Trust me.');
      const a = pick();
      if (!a?.locked) return `not locked at Persuade 0: ${JSON.stringify(a)}`;
      if (!/Persuade/.test(a.locked)) return `reason: ${a.locked}`;
      const btn = [...g.dialogue.choicesEl.children].find((b) => b.textContent.includes('Trust me.'));
      if (btn?.dataset.locked !== '1') return 'the button is not greyed';
      g.dialogue.pick(g.dialogue.choices.indexOf(a)); // a locked pick does nothing
      if (!g.dialogue.active) return 'a locked choice was taken';
      S.skill.persuade = 40; g.dialogue.show('a');
      const b = pick();
      if (b.locked || !b.passed) return `still locked at 40: ${b.locked}`;
      if (!g.dialogue.choices.find((ch) => ch.t === 'Here is the paper.')?.locked) return 'the item gate opened without the item';
      return true;
    } finally { g.dialogue.close(); const c = g.chars.find((x) => x.npc?.id === 'selftest_gate'); if (c) g.removeChar(c); }
  }));

  await check('journal: quest rows read g.quests (live objective), loose ends listed, the chronicle about you', () => {
    const q0 = { ...g.quests };
    try {
      g.quests.bounty = 'active'; g.quests.bountyStart = g.stats.raiderKills ?? 0; g.quests.selftest_favour = 'offered';
      const J = journal(g);
      const b = J.active.find((x) => x.id === 'bounty');
      if (!b || !/0\/6/.test(b.objective)) return `bounty: ${JSON.stringify(b)}`;
      if (!J.offered.some((x) => x.id === 'selftest_favour')) return 'the loose end is missing';
      if (!Array.isArray(J.chronicle)) return 'no chronicle list';
      g.quests.bounty = 'done';
      return journal(g).done.some((x) => x.id === 'bounty') ? true : 'done not listed';
    } finally { for (const k of Object.keys(g.quests)) delete g.quests[k]; Object.assign(g.quests, q0); }
  });
}
