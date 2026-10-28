// The AUDIO + LLM TALK + DEEP SHEET lane's COMMANDS rows (docs/design/WEB_VOICE_STATS.md §7). buildCommands() in api.js
// spreads these into COMMANDS, so help, the CLI, the MCP tools and docs/COMMANDS.md see them like any other row.
//   audio      the sound sets: what is loaded, playing, the bed, the engine; set= one set's kinds and how each resolves
//   audioTest  play one kind of one faction/set at a position and report what was decided (file, gain, low-pass)
//   bark       make a character bark a combat line (data/barks.js)
//   llm        the local model: status, on/off, a test talk with a stranger, the endpoint (mock= for the offline proof)
//   deep       the deep sheet: view, set attributes/traits/tags, teach a skill, wound a zone, stress, live on/off
//   perk       pick a waiting perk               check   test a dialogue gate         journal   the journal
//   charsheet  open/close the character sheet (` key)
import { resolve, SETS, FACTIONS, FACTION_KINDS, CREATURES, CREATURE_KINDS, AUDIO_MANIFEST, ENGINES, ENGINE_KINDS, BEDS } from '../data/audiosets.js';
import { spatial } from '../systems/audio.js';
import { COMBAT_KEYS } from '../data/barks.js';
import { ATTRIBUTES, SKILLS, TRAITS } from '../data/stats.js';
import { journal } from '../systems/journal.js';
import { STATIONS, RADIO } from '../data/radio.js';

export function voiceStatsCommands(api, need) {
  const g = api.g, C = (cmd, a) => api.call(cmd, a);
  const P = () => g.player;
  const byId = (id) => (id === 'player' || id === 'c1' ? g.player : g.chars.find((c) => c.id === id || c.npc?.id === id || c.name === id) ?? null);
  const nearest = (pred) => { let b = null, bd = Infinity; for (const c of g.chars) { if (!c.alive || c === P() || !pred(c)) continue; const d = Math.hypot(c.x - P().x, c.z - P().z); if (d < bd) { bd = d; b = c; } } return b; };
  const man = () => { const sets = AUDIO_MANIFEST.sets ?? {}; let files = 0; for (const k of Object.values(sets)) for (const x of Object.values(k)) files += x.files.length; return { sets: Object.keys(sets).length, files, mb: +((AUDIO_MANIFEST.bytes ?? 0) / 1048576).toFixed(2) }; };

  return {
    audio: {
      group: 'world', desc: 'The recorded sound sets (data/audiosets.js, public/audio/, SOUNDS-LICENSES.md): what the manifest holds, the soundscape now (place, bed, weather layer, sampled engine, listener, voices playing, samples played / synthesized / capped / failed, recent barks). set=<id> lists that set\'s kinds and how each resolves (own files, an alias, inherited, a fallback). samples=false turns recorded sound off (the synth plays everything, as before); on=false stops the soundscape (beds, engine, barks). start=true starts the audio context (a headless page never clicked PLAY).',
      args: { set: { type: 'string' }, samples: { type: 'boolean' }, on: { type: 'boolean' }, start: { type: 'boolean' } },
      run: async ({ set, samples, on, start }) => {
        if (start) g.audio.start();
        if (samples !== undefined) g.audio.useSamples = samples;
        if (on !== undefined) g.soundscape.on = on;
        if (set) {
          need(SETS[set] || AUDIO_MANIFEST.sets?.[set], `unknown set ${set}; sets: ${[...new Set([...Object.keys(SETS), ...Object.keys(AUDIO_MANIFEST.sets ?? {})])].join(', ')}`);
          const kinds = new Set([...Object.keys(AUDIO_MANIFEST.sets?.[set] ?? {}), ...Object.keys(SETS[set]?.alias ?? {}), ...(FACTIONS.includes(set) ? FACTION_KINDS : []), ...(CREATURES.includes(set) ? CREATURE_KINDS : [])]);
          return { set, kinds: [...kinds].map((k) => { const r = resolve(set, k); return { kind: k, files: r?.files.length ?? 0, via: r?.via ?? null, pitch: r ? +r.pitch.toFixed(3) : null }; }) };
        }
        return { manifest: man(), soundscape: g.soundscape.view(), useSamples: g.audio.useSamples, ctx: g.audio.ctx?.state ?? 'not started', lastSample: g.audio.lastSample };
      },
    },
    audioTest: {
      group: 'world', desc: `Play one kind from a sound set and report the decision: faction=<${FACTIONS.join('|')}> (or set=<any set>, or id=<character>: their own set), kind=<e.g. shot.rifle, bark.pain, step.road, idle, engine.idle>. At x,z (default 10 m east of you) or dist=; indoor=true puts the source inside (a wall between it and you closes the low-pass when you are out). Returns the resolution (files, via, pitch), the spatial numbers (gain, cutoff) and what audio.sample decided (played, file, why not). wait=true waits for the files to load (up to 3 s) and plays again.`,
      args: { faction: { type: 'string' }, set: { type: 'string' }, id: { type: 'string' }, kind: { type: 'string', required: true }, x: { type: 'number' }, z: { type: 'number' }, dist: { type: 'number' }, indoor: { type: 'boolean' }, range: { type: 'number' }, wait: { type: 'boolean', default: true } },
      run: async ({ faction, set, id, kind, x, z, dist, indoor, range, wait }) => {
        const c = id ? byId(id) : null;
        if (id) need(c, `no character ${id}`);
        const s = set ?? (faction ? (FACTIONS.includes(faction) ? faction : { warden: 'rusthaven', raider: 'dustwolves', soldier: 'remnant', drifters: 'drifter' }[faction] ?? faction) : null) ?? (c ? (await import('../data/audiosets.js')).setFor(c) : 'common');
        const r = resolve(s, kind);
        need(r, `${s} has no sound for ${kind} (audio set=${s} lists what it has)`);
        if (!g.audio.ctx) g.audio.start();
        const at = dist !== undefined ? { dist, indoor, range } : { x: x ?? P().x + 10, z: z ?? P().z, indoor, range };
        let played = g.audio.sample(s, kind, at);
        if (!played && wait) { await Promise.race([Promise.all(g.audio.preload(s, kind).map((b) => (b && typeof b.then === 'function' ? b : null)).filter(Boolean)), new Promise((ok) => setTimeout(ok, 3000))]); played = g.audio.sample(s, kind, at); }
        const d = dist ?? Math.hypot(at.x - g.audio.listener.x, at.z - g.audio.listener.z);
        return { set: s, kind, resolved: { files: r.files.length, via: r.via, pitch: +r.pitch.toFixed(3), first: r.files[0].f, license: r.files[0].lic }, spatial: spatial(d, range ?? 60, !!indoor !== !!g.audio.listener.indoor), decision: g.audio.lastSample, ctx: g.audio.ctx?.state ?? null };
      },
    },
    bark: {
      group: 'npc', desc: `Make someone bark a combat line now (data/barks.js; systems/soundscape.js): id=<character | nearest> key=<${COMBAT_KEYS.join('|')}>. Their rendered voice if the forge made the clip, else the subtitle over their faction's own wordless bark. Returns the line, whether it was voiced, and the soundscape's bark counts.`,
      args: { id: { type: 'string', default: 'nearest' }, key: { type: 'string', default: 'combat.alert' } },
      run: async ({ id, key }) => {
        need(COMBAT_KEYS.includes(key), `key: ${COMBAT_KEYS.join(', ')}`);
        const c = id === 'nearest' ? nearest((x) => x.faction !== 'zombie') : byId(id);
        need(c, `no character ${id}`);
        c.barkAt = -9;
        const r = g.soundscape.bark(c, key);
        return { id: c.id, faction: c.faction, key, said: r?.text ?? null, voiced: !!r?.played, why: r?.why ?? null, wordless: g.voice?.log?.at(-1)?.wordless ?? null, barks: g.soundscape.stats };
      },
    },
    llm: {
      group: 'npc', desc: 'The local model for strangers\' talk (systems/llmtalk.js; vite /llm proxy to Ollama qwen3.5 on the studio Mac Mini, think:false, num_ctx 8192, 7 s timeout). No args: status (enabled, reachable, the stats: asked/ok/cached/rejected/timeout/offline/fallback, recent answers). on=true|false: the settings toggle (persists). check=true: ask the server if the model is up now. test=true: talk a while with npc=<id | nearest> and return the grounded facts, the validated answer (line, mood, choices with effects) or why it fell back. mock=<good|bad|refuse|slow|off>: point the asking at the dev server\'s canned answers (the offline proof) or back at the model. validate=<json string>: run the validator alone.',
      args: { on: { type: 'boolean' }, check: { type: 'boolean' }, test: { type: 'boolean' }, npc: { type: 'string', default: 'nearest' }, topic: { type: 'string', default: 'small talk' }, mock: { type: 'string' }, validate: { type: 'string' }, fresh: { type: 'boolean', default: true } },
      run: async ({ on, check, test, npc, topic, mock, validate, fresh }) => {
        const L = g.llmtalk;
        if (on !== undefined) L.setEnabled(on);
        if (mock) { L.endpoint = mock === 'off' ? `${L.base}/chat` : `${L.base}/mock/${mock}`; if (mock !== 'off') L.reachable = true; else L.reachable = null; }
        if (validate !== undefined) return { validate: L.validate(validate) };
        let status = null;
        if (check) status = await L.status(true);
        if (test) {
          const c = npc === 'nearest' ? nearest((x) => !x.npc && x.faction !== 'zombie') : byId(npc);
          need(c, `no stranger ${npc}; spawn one (spawn kind=drifter)`);
          if (fresh) L.cache.clear();
          const ans = await L.ask(c, topic);
          return { npc: c.id, name: c.name, facts: L.lastPrompt?.facts ?? null, answer: ans, fellBack: !ans, last: L.log.at(-1) ?? null, ...L.view() };
        }
        return { ...L.view(), status };
      },
    },
    deep: {
      group: 'player', desc: `The deep sheet (data/stats.js, systems/stats.js): attributes (${Object.keys(ATTRIBUTES).join(', ')}), derived stats, 36 skills, perks waiting, traits, conditions, injuries by zone, stress, morale, reputation, and fx (the folded numbers the engine reads). attr=<id> value=<1..10> sets one. traits=<a,b> sets your made-with traits (budget-checked; force=true skips it). tags=<a,b,c> tags skills. gain=<skill> amount= teaches one (as doing it would). wound=<amount> cause= lands a wound on a zone (seeded). stress=<n> adds stress. live=true|false: transient state moving the fold. reset=true: an ordinary untrained survivor again. crew=<id>: that character's sheet from the same rows (the crew lane's hook).`,
      args: { attr: { type: 'string' }, value: { type: 'number' }, traits: { type: 'string' }, tags: { type: 'string' }, force: { type: 'boolean' }, gain: { type: 'string' }, amount: { type: 'number', default: 10 }, wound: { type: 'number' }, cause: { type: 'string', default: 'bullet' }, seed: { type: 'number', default: 1 }, stress: { type: 'number' }, live: { type: 'boolean' }, reset: { type: 'boolean' }, crew: { type: 'string' } },
      run: async ({ attr, value, traits, tags, force, gain, amount, wound, cause, seed, stress, live, reset, crew }) => {
        const D = g.deep;
        if (reset) D.reset();
        if (live !== undefined) { D.live = live; D.recompute(); }
        if (attr) { need(ATTRIBUTES[attr], `attr: ${Object.keys(ATTRIBUTES).join(', ')}`); need(value >= 1 && value <= 10, 'value 1..10'); D.attrs[attr] = Math.round(value); D.recompute(); }
        if (traits !== undefined) { const r = D.setTraits(traits ? traits.split(',').map((s) => s.trim()) : [], force); need(r.ok, r.why ?? 'bad traits', `traits: ${Object.keys(TRAITS).filter((t) => TRAITS[t].cost !== null).join(', ')}`); }
        if (tags !== undefined) { const r = D.setTags(tags ? tags.split(',').map((s) => s.trim()) : []); need(r.ok, r.why); }
        let taught = null, wounded = null;
        if (gain) { need(SKILLS[gain], `skill: ${Object.keys(SKILLS).join(', ')}`); taught = +D.gain(gain, amount, 'command').toFixed(3); D.recompute(); }
        if (wound) { wounded = D.wound(wound, cause, seed); D.recompute(); }
        if (stress) { D.stressAdd(stress, 'command'); D.recompute(); }
        if (crew) { const c = byId(crew); need(c, `no character ${crew}`); return { crew: c.id, sheet: D.sheetFor(c, c.slot ?? 0) }; }
        return { ...D.view(), taught, wounded, skillsEngine: { spreadMul: +g.skills.spreadMul.toFixed(3), reloadMul: +g.skills.reloadMul.toFixed(3), carryKg: +g.skills.carryKg.toFixed(1), speedMul: +g.skills.speedMul.toFixed(3), sprintDrainMul: +g.skills.sprintDrainMul.toFixed(3) } };
      },
    },
    perk: {
      group: 'player', desc: 'Pick a perk a skill tier has waiting (the deep sheet: a skill crossing 20/40/60/80 offers two): skill=<id> pick=a|b. No args: what is waiting.',
      args: { skill: { type: 'string' }, pick: { type: 'string' } },
      run: async ({ skill, pick }) => {
        if (!skill) return { pending: g.deep.view().pending };
        const r = g.deep.pickPerk(skill, pick);
        need(r.ok, r.why);
        return { picked: r.perk, fx: g.deep.view().fx };
      },
    },
    check: {
      group: 'npc', desc: 'Test a dialogue gate against you now (G5; ui/dialogue.js greys a failed one with this reason): skill=<id>:<min> stat=<attr|derived|mercy|fame|law|fear|stress|morale>:<min> trait=<id | !id> item=<id> trust=<n> crew=<id | true>. Returns ok and why.',
      args: { skill: { type: 'string' }, stat: { type: 'string' }, trait: { type: 'string' }, item: { type: 'string' }, trust: { type: 'number' }, crew: { type: 'string' } },
      run: async (a) => {
        const req = {};
        if (a.skill) req.skill = a.skill; if (a.stat) req.stat = a.stat; if (a.trait) req.trait = a.trait; if (a.item) req.item = a.item;
        if (a.trust !== undefined) req.trust = a.trust; if (a.crew) req.crew = a.crew === 'true' ? true : a.crew;
        return { req, ...g.deep.check(req) };
      },
    },
    journal: {
      group: 'player', desc: 'The journal (data/quests.js rows over g.quests; the chronicle\'s lines about you): quests active, offered, done, failed (title, giver, the live objective, reward, map pin, how it fails) and what people say you did. open=true shows it on the character sheet.',
      args: { open: { type: 'boolean' } },
      run: async ({ open }) => { if (open) g.charSheet?.toggle(true, 'journal'); return journal(g); },
    },
    radio: {
      group: 'world', desc: `The radio (data/radio.js, systems/radio.js; , and . on the keyboard): ${STATIONS.filter((s) => s.freq).map((s) => `${s.id} ${s.freq}`).join(', ')}. No args: what is on (station, the song and where in it, the last line on the air, today's emergency shelter and whether it is a lure, counts). station=<id|off> tunes; next=true / prev=true walk the dial; volume=0..1 (persists). portable=true puts a portable radio in your pack (you hear it on foot). spring=true walks the lure: puts you at today's shelter (forcing a trap with trap=true) and runs a frame.`,
      args: { station: { type: 'string' }, next: { type: 'boolean' }, prev: { type: 'boolean' }, volume: { type: 'number' }, portable: { type: 'boolean' }, spring: { type: 'boolean' }, trap: { type: 'boolean' } },
      run: async ({ station, next, prev, volume, portable, spring, trap }) => {
        const Rd = g.radio;
        if (portable) g.inventory.add(g.inventory.carried, RADIO.item, 1);
        if (volume !== undefined) Rd.setVolume(volume);
        if (!g.audio.ctx) g.audio.start();
        if (station) { const i = STATIONS.findIndex((s) => s.id === station); need(i >= 0, `station: ${STATIONS.map((s) => s.id).join(', ')}`); need(Rd.canHear() || i === 0, 'no radio here', 'get in a vehicle, or portable=true'); Rd.tune(i); }
        if (next) Rd.step(1); if (prev) Rd.step(-1);
        let sprung = null;
        if (spring) {
          const s = Rd.shelterNow(); if (trap) { s.trap = true; s.sprung = false; }
          await C('teleport', { x: Math.round(s.x), z: Math.round(s.z) });
          Rd.update(0); sprung = { trap: s.trap, sprung: s.sprung, raiders: g.chars.filter((c) => c.alive && c.faction === 'raider' && Math.hypot(c.x - s.x, c.z - s.z) < 30).length };
        }
        return { ...Rd.view(), sprung };
      },
    },
    charsheet: {
      group: 'player', desc: 'Open or close the character sheet (the ` key): open=true|false, tab=attributes|skills|perks|traits|body|standing|journal.',
      args: { open: { type: 'boolean', default: true }, tab: { type: 'string', default: 'attributes', enum: ['attributes', 'skills', 'perks', 'traits', 'body', 'standing', 'journal'] } },
      run: async ({ open, tab }) => ({ open: g.charSheet?.toggle(open, tab) ?? false, tab }),
    },
  };
}

// For the selftest and the docs: what every engine class and bed must resolve.
export const ENGINE_CHECK = { ENGINES, ENGINE_KINDS, BEDS };
