# DSOA web engine — studio sound, voiced barks, local-model talk and the deep sheet

**Status:** built 2026-10-27 on `feat/web-voice-stats` (lane 3404), from `dsa2/ike-counter` @ 9a9c66b4.
**Implements:** G5 of `WEB_DEATHLANDS_GAP.md` (dialogue checks, quest rows, the journal) and the stat-system half of
`docs/research/GENRE_DEPTH.md` §1. **Reads with:** `WEB_VOICE.md` (the voice forge), `WEB_WORLD_MEMORY.md` (deeds,
the chronicle), `WEB_ROLES.md`, `WEB_CREATOR.md` (point-buy), `WEB_SURVIVAL.md` (needs, wounds), `WEB_FAN_SERVICE_BIBLE.md` (IP law).

---

## 1. Overview

Four layers, each data first, each with commands and selftest checks:

| Layer | Data | Live | Commands |
|---|---|---|---|
| **Sound sets** — recorded sound from the studio library per faction, creature, vehicle and place | `data/audiosets.js`, `data/audio-manifest.json`, `public/audio/<set>/<kind>.<n>.ogg`, `SOUNDS-LICENSES.md` | `systems/audio.js` (sample layer over the synth), `systems/soundscape.js` | `audio`, `audioTest` |
| **Combat barks** — the fight turning, called out per faction | `data/barks.js` (+ rows in `data/dialogue.js`, the `meridian` archetype in `data/voices.js`) | `systems/soundscape.js` bark director, `systems/voice.js` | `bark` |
| **Local-model talk** — strangers' small talk from qwen3.5 on the studio Mac Mini | prompt + validator in `systems/llmtalk.js` | `vite.config.js` `/llm` proxy, `ui/dialogue.js` "Talk a while." | `llm` |
| **The deep sheet** — 7 attributes, 21 derived stats, 36 skills, 288 perks, 44 traits, 24 conditions, 6 body zones × 7 injury types, stress, morale, 4 reputation axes | `data/stats.js` | `systems/stats.js` (`g.deep`), `ui/charsheet.js` (\` key) | `deep`, `perk`, `check`, `charsheet` |
| **Dialogue checks + journal** (G5) | `data/quests.js` | `ui/dialogue.js` gate, `systems/journal.js` | `journal`, `check` |

The tool that feeds the first layer: `tools/audio-pick.mjs` (`plan` / `build [--only re]` / `size`).

## 2. Player Fantasy

You hear who is shooting before you see them: a warden's revolver cracks flat and dry, a Dustwolf AK chatters, the
Remnant's belt-fed thumps from the ridge, and a shot from a mile off arrives as a rolling thud. Step under a roof and the
street goes muffled. The market at Rust Haven murmurs by day; the desert hums with insects at night. The pickup idles
rough, the bike screams, the APC grinds. A raider spots you and yells it to his pack; three of them on you and one
shouts to go wide; you drop one and his friend howls a name. A stranger by the pump talks to you in their own words
about the water and the relay mast and what they've heard you did — and sometimes asks a small favour that lands in
your journal. Your hands shake when you've been shot at too long; a broken left arm doubles your reload; you learn to
drive by driving. Your sheet says who you are, and every number on it changes something you can feel.

## 3. Detailed Rules

### 3.1 Sound sets (studio audio)
- **Source:** the NAS library `N:\assets\audio\library\<category>\<subcategory>\<file>` (13,868 files indexed by UCS
  category). `audio-pick.mjs` queries it by `[category, subcategory, name regex]`, sorts, spreads its picks evenly through
  the matches (deterministic: a rebuild picks the same files), **copies** (never moves) and cuts:
  - `shot` one take from its first onset, `dur` max, faded, peak-normalised to −1 dBFS, mono Opus 40 kb/s;
  - `slice` a file of many hits (bursts, footsteps, a take of shouts) split on its silences (threshold = its own peak − 24 dB),
    each hit keeping its tail up to the next onset, dealt round-robin across files;
  - `loop` (engines) a steady 2–3 s stretch, its last 0.25 s crossfaded over its first (seamless), mono;
  - `bed` (ambience) 30–36 s stereo, 2 s crossfade loop, loudness-normalised to −26 LUFS, Opus 56 kb/s.
  A cut that comes out silent is refused, never shipped.
- **License law** (traced per file by name and pack folder, see `SOUNDS-LICENSES.md`): `*_PSE_BBC-*` = Pro Sound Effects
  BBC (1-user royalty-free commercial; **never used to train a model**); the Gamemaster gun pack (same terms); Kenney /
  OpenGameArt = CC0; everything else in the library was routed in from the Sonniss GDC bundles (royalty-free, no credit,
  never redistributed raw, never used for training). **Energetic Forms (`*_EF`) is excluded until its terms are confirmed.**
- **Sets:** 5 factions (`rusthaven`, `dustwolves`, `remnant`, `drifter`, `meridian`) with their own guns (pistol, smg,
  rifle, shotgun, mg; indoor tails), 4 infected kinds + Greyborn, howlers, 7 fauna voices, 5 engine classes × idle/rev/strain
  mapped onto all 14 vehicle rows with their own pitch, 8 beds × day/night (desert, ruins, swamp, forest, coast, plains,
  market, gate) + rain and wind layers, and `common`: footsteps on 6 surfaces, impacts on 6 materials, doors (open, close,
  kick, metal), glass, explosions near/far, the distant shot, reload/dry/whiz/ricochet/shells, alarms (siren, bell, klaxon),
  radio static and stingers, vehicle doors/skids/crashes/horns, and the wordless bark beds (male pain/shout/death, female
  shout, crowd alert/retreat, whistle signals).
- **Resolution** (`resolve(set, kind)`): own files → the set's alias (another set's kind at its own pitch and subset — this
  is how each faction gets its *own* bark takes) → its inherit chain → `common` → `FALLBACK` (e.g. `shot.pump` → Meridian's
  shotgun). Unresolved = the synth plays it, exactly as before.
- **Playback** (`audio.sample(set, kind, at)`): positional from the listener (the player, moved each frame), pan by
  offset, `spatial()` gain + low-pass, a wall between source and listener (`indoor` ≠ listener's) muffles; a shuffled
  rotation per kind (every take once before any repeats, never twice running); ±6 % pitch jitter; a 24-voice cap where the
  quietest gives way. Files load lazily (first call warms the kind; the synth covers the first shot).
- **Who calls it:** every existing synth method asks for its sample first (`gun` with the shooter's faction, `step`,
  `glass`, `thud`, `groan`/`wheeze`/`murmur`/`hum` for the infected kinds, `dog`, `whiz`, `ricochet`, `explosion`, `bang`,
  `crash`, `reload`, `empty`, `siren`); `soundscape.js` runs the bed (once a second, by place + night + weather) and the
  sampled engine (idle/rev/strain crossfaded by rpm and load; the synth engine falls silent while it plays).

### 3.2 Combat barks
- **Keys:** `combat.alert`, `combat.flank`, `combat.reload`, `combat.man_down`, `combat.retreat`, `combat.taunt`,
  `combat.surrender` — 3–4 original lines each for the five archetypes (warden, raider, soldier, drifter, meridian).
- **Director** (`soundscape.barkPass`, 4 Hz, within 60 m of you): an AI's `state` turning to `fight` → alert; `reloading`
  starting → reload; armed and `flee` starting → retreat (or surrender under 30 % hp); a `kill` event → the nearest armed
  friend within 30 m → man down; a `hurt` event on you → the attacker taunts; three or more of one faction fighting you →
  one calls a flank (one per faction per 12 s). One bark per fighter per 3.5 s.
- **Voiced or wordless:** `voice.say(c, key)` — a rendered clip in their cast voice plays; a bark may borrow its voice's
  US-flag take whatever flag the speaker wears. With no clip: the subtitle, and the faction's own wordless bark sample
  (`BARK_SAMPLE`). Pain on any hp loss plays the faction's `bark.pain`.
- **Rendering:** `tools/voiceforge/batches.mjs` `barks`: 13 template voices × 7 keys = 286 lines.
  `node tools/voiceforge/voiceforge.mjs render --batch barks --provider breeze --max 400 --yes`.
  **Blocked 2026-10-27:** `CUPCAKE_GATEWAY_KEY` is not on this PC (no Bitwarden token here); Gemini needs
  `REPLICATE_API_TOKEN`. Until then the wordless faction beds carry the barks.

### 3.3 Local-model talk
- **Path:** page → `POST /llm/chat` (the dev server) → Ollama `http://192.168.1.238:11434/api/chat`, model `qwen3.5`,
  `think:false`, `format:json`, `num_ctx 8192`, `num_predict 170`, `keep_alive 30m`, abort at 7.5 s server / 8 s client.
  `GET /llm/status` (2.5 s). `LLM_URL` / `LLM_MODEL` override.
- **When:** talking to a stranger (no authored tree) while the model is enabled and not known down, a fourth topic
  "Talk a while." appears. Authored trees always win; named people never go to the model.
- **Grounding (real state):** name, faction, role, flag, the tier their people read you at, what they make of you
  (`talk.you`), their memory of you, the news their people have (`talk.news`), the road near them (`talk.road`), the place,
  the hour, the weather, what they sell, what you're known as, your cash/hurt/armed/fame/mercy, open quest keys.
- **Answer:** STRICT JSON `{line, mood, choices:[{t, effect}]}`. Validation: JSON (a fenced block tolerated); `line` 1–320
  chars; `mood` normalised to one of 7 (else calm); ≤ 3 choices, a bare string = a choice with no effect, each ≤ 90 chars;
  `effect` exactly one of `toast` (≤ 90), `setQuest` / `ifQuest` (one short key: value), `cost` (≤ 50), `give` (`{cash ≤ 20}`)
  or null — a choice with anything else is **dropped**; any IP deny-list term or the Z-word in the line or a kept choice
  rejects the **whole** answer. Cached per (person, topic, hash of the facts), 200 entries.
- **Offline / slow / refused:** `talk.js`'s authored road line + the three live topics; no error is ever shown.
- **Toggle:** the pause menu's `LOCAL TALK: ON/OFF` (persists in `localStorage dsoa.llm`); `llm on=`.

### 3.4 The deep sheet
- **Attributes** (1–10, 5 ordinary): BRAWN, GRIT, QUICKNESS, EYE, WITS, NERVE, CHARM. THE CREATOR's six ranks import as
  `3 + rank` (CHARM is ours); the fold counts only what moved **since** the creator's baseline, so a creator pick is never
  paid twice (the creator's own fx and skills.js levels already pay for it).
- **Derived** (21; formulas §4): carry, melee, aim, reload, pace, wind, mend, hide, haggle, fix, locks, learn, wake, tough,
  appetite, stress cap, panic at, pain tolerance, infection resistance, spot radius day/night.
- **Skills** (36 in 7 groups; 0–100; learned by doing from game events — `SKILLS[id].xp` maps event types to xp; driving
  and navigation per second at the wheel, fieldcraft per second crouched-moving, a gun's skill on every hit and kill):
  FIREARMS pistols, long guns, scatterguns, automatics, heavy, mounted · CLOSE blades, blunt, unarmed, thrown · ROAD driving,
  vehicle gunnery, mechanics, fabrication, navigation, salvage · SURVIVAL scavenging, foraging, hunting & trapping, cooking,
  farming, fishing, fieldcraft · TECH & MEDICAL first aid, surgery, electrics, electronics, chemistry, locks, carpentry ·
  SOCIAL & COMMAND barter, persuade, intimidate, leadership, tactics · BODY (hidden until they move) toughness, awareness.
  Tiers at 20/40/60/80 (NOVICE/COMPETENT/EXPERT/MASTER); 3 tag skills start +15 and learn ×1.5.
- **Perks:** two per tier per skill, pick one (288). Hand-written for driving, mechanics, long guns, first aid, leadership,
  barter, fieldcraft, locks; the rest from their group's template.
- **Traits:** 18 good (cost), 18 flaws (refund), 8 earned in play (road warrior at 100 car kills, butcher at 50 human
  kills, veteran at 30 fights, wheelman at 10 jumps, shell-shocked at 12 blasts, bitten survivor...). Budget: ≤ 4 good,
  ≤ 3 flaws, net within ±2.
- **Conditions** (24, ladders of 2–5): hungry, thirsty, tired, winded, stressed, panicked, bored, lonely, pain, bleeding,
  cold, hot, wet, sick, food poisoned, infected, drunk, withdrawal, concussed, encumbered, ringing ears, grieving, inspired,
  well fed. Those survival.js already prices (hunger, thirst, rest, bleeding, sickness, infection, encumbrance) are named
  and shown with their cure but cost nothing extra; the rest carry an fx per rung.
- **Injuries:** a `hurt` on you lands on a zone by weight (head 8, torso 40, arms 12, legs 14; seeded by the event); zone
  hp is its share of max hp; ≥ 25 % in one hit opens an injury typed by the cause (scratch, laceration, bite, gunshot,
  fracture, burn, concussion). Below half a zone hurts; at zero it is disabled (left arm: reload ×2; legs: −40 % speed...).
- **Stress & morale:** stress 0..cap from hits, blasts, a friend dying, the infected close; falls when nothing is on you;
  rungs at 30/50/70/85 % of cap; panic past `panicAt`. Morale = named modifiers with timeouts, banded HIGH..BROKEN.
- **Reputation axes:** mercy, fame, road law, fear — moved by your own deeds' verbs (the chronicle's last record, actor
  `player`).
- **`live`:** false holds stress/conditions/injuries/morale out of the fold (the selftest battery runs with it off).
- **Character sheet** (\` Backquote, a new `charsheet` row in `data/controls.js`): SHEET / SKILLS (click to pick a perk) /
  BODY / JOURNAL; your flag is the backdrop. The pause menu gains JOURNAL and LOCAL TALK buttons (injected at runtime).

### 3.5 Dialogue checks and the journal (G5)
- A choice may carry `check: { skill, stat, trait, item, trust, crew }` (or a `req` *object*; a `req` *function* keeps its
  old hide-when-false meaning). `g.deep.check(req)`: skill = level + 4 × (governing attribute − 5); stat = an attribute,
  derived stat, reputation axis, stress or morale; trait `id` / `!id`; item `id` or `{id: n}`; trust = their standing;
  crew = a crew member within 20 m. **Failed: shown greyed with the reason** ("Persuade 12/30") and unpickable;
  passed: tagged `[PERSUADE]`, and picking it teaches that skill. Pack/`registerNpc` choices carry `check` through.
- `data/quests.js` rows read the flat `g.quests` (bounty, canal, cache): title, giver, live objective ("3/6"), reward, pin,
  fail states. Unknown keys (a stranger's favour from the model) list as loose ends. The JOURNAL adds the chronicle's
  lines about you ("You robbed Ana at Rust Haven. (2 saw)").

## 4. Formulas

`d(a) = a − 5` (over the creator baseline). Multipliers fold as `1 + Σ deltas`, clamped to [0.2, 3]; adds sum.

| Derived | Formula | fx key → consumer |
|---|---|---|
| carry | `+2.5 kg × d(BRN)` | `carryKg` → `skills.js` |
| melee | `1 + 0.06 d(BRN)` | `meleeMul` → `melee.js` blow damage |
| aim | `1 − 0.03 d(EYE)` | `spreadMul` → `skills.js` → every shot's spread |
| reload | `1 − 0.04 d(QCK)` | `reloadMul` → `skills.js` |
| pace | `1 + 0.015 d(QCK)` | `speedMul` → `skills.js` → on-foot speed |
| wind | `1 − 0.035 d(GRT)` | `sprintDrainMul` → `skills.js` → stamina |
| mend | `1 + 0.06 d(GRT)` | `healMul` → `survival.js` wound healing |
| hide | `1 − 0.01 d(EYE)` | `seenMul` → `gear.js` → `ai.js` spotting |
| haggle | `1 − 0.025 d(CHA) − 0.01 d(WIT)` | `priceMul` → `trade.js` counter |
| fix | `+0.04 d(WIT)` | `repair` → `gear.js repairMul` |
| locks | `1 − 0.05 d(WIT) − 0.02 d(QCK)` | `lockMul` → `interiors.js` pick/pry time |
| learn | `1 + 0.06 d(WIT)` | `xpMul` → `skills.js` + `stats.js` learning |
| wake | `1 + 0.04 d(EYE)` | `wakeMul` → `survival.js` sleep wake radius |
| tough | `1 − 0.015 d(GRT)` | `damageMul` → `combat.js` damage you take |
| appetite | `1 − 0.02 d(GRT)` | `drainMul` → `survival.js` food + water drain |
| — | skill fx × level (e.g. driving `+0.003 × lvl` handling; scavenging `+0.01 × lvl` luck) | `handling` → `vehicles.js` steering (you driving); `luck` → `gear.js luckRolls`; `noiseMul` → `main.js noise()`; `scentMul` → `zombies.js` smell |
| stress cap | `60 + 8 NRV` · panic at `70 % + 2 % NRV` (+ trait panicAdd) | conditions |
| skill check | `skill + 4 (attr − 5) ≥ min` | dialogue gate |
| learning | `amount × xpMul × (tag 1.5) / (1 + level / 30)` | |
| spatial | `gain = 4/(4 + 0.9 (d − 4)) × (1 − (d/range)²)`; `cutoff = 650 + 17350 (1 − d/range)^1.6`; occluded ×0.55, ≤ 900 Hz | |

*Example:* EYE 8, Long guns 50, the Steady perk, Stressed 2 at night with Night Blind: spread
`1 − 0.09 − 0.125 − 0.05 + 0.07 + 0.15 = 0.955` × dexterity × gear × creator.

## 5. Edge Cases
- **Headless page never clicked PLAY:** no AudioContext → every `sample()` returns false and the synth (silent) path runs;
  `audio start=true` / `audioTest` start it.
- **A kind with no files** → the synth, as before; `audio set=<id>` shows how each kind resolves.
- **The Mac Mini down / slow:** `llm` status false → no "Talk a while"; mid-answer timeout → authored line; the selftest
  never touches the LAN (`/llm/mock/*`).
- **A model answer with one bad choice:** the choice is dropped, the line stands; a denied word anywhere kept → whole answer
  thrown out.
- **A save from before this lane:** no `deep` block → a neutral sheet re-imported from the creator.
- **Loading a save:** its own attributes win over a re-read of the creator sheet (`keepAttrs`).
- **The battery:** `g.deep.live = false` and a neutral sheet at its start, so stress from its gunfire never shakes another
  check's aim numbers; the lane's checks turn it on locally and reset after.
- **`g.stats`** is the engine's kill counters; the sheet lives on **`g.deep`**.

## 6. Dependencies
- **Reads:** `g.sheet` (THE CREATOR), `g.needs` (survival), `g.events` (every system's emits), the chronicle, factions,
  memory, roles, `talk.js`, `voice.js`, `g.skills.load`, the AI's `state/target/reloading/flee` fields.
- **Read by:** the crew lane (`g.deep.sheetFor(c)` — the same rows for a crew member; `check({crew})` waits on its
  `c.crew`/`c.follower` flags), the polish pass (the sheet's numbers for the HUD), G7 gate interviews (`check`).
- **Shared-file hooks** (each one line unless noted): `main.js` (4 imports + 4 construction lines, `deep.update`,
  `soundscape.update`, the `noise()` noiseMul); `api.js` (2 imports, the command spread, live=false + reset at battery start,
  the checks call + restore, save/load lines, `check:` passthrough in `compileNpc`); `combat.js` (shooter to `audio.gun`,
  damageMul ×2); `skills.js` (fold the deep fx, xpMul, onHit); `trade.js`, `gear.js` (3), `survival.js` (3), `melee.js`,
  `vehicles.js`, `interiors.js`, `zombies.js` (one multiplier each); `voice.js` (key passthrough, the bark clip fallback,
  the wordless bed); `dialogue.js` (barks rows + directions + situations); `voices.js` (the meridian archetype);
  `ui/dialogue.js` (the gate, async topics, locked picks); `data/controls.js` (the charsheet row); `vite.config.js`
  (the `/llm` plugin).

## 7. Tuning Knobs
| Knob | Where | Default |
|---|---|---|
| per-set picks, regexes, cut lengths | `tools/audio-pick.mjs SLOTS` | see file |
| range per sound class, voice cap, jitter, occlusion | `data/audiosets.js SPATIAL` | shot 220 m, mg 260, far 520, step 22; cap 24; ±6 %; ×0.55 / 900 Hz |
| bed gains | `BED_GAIN` | 0.4–0.55 |
| engine class + pitch per vehicle row | `ENGINES` | |
| bark radius / gaps | `soundscape.js` | 60 m, 3.5 s per fighter, flank 12 s, taunt 6 s |
| model, timeout, tokens | `vite.config.js llmProxy`, `llmtalk.js` | qwen3.5, 7.5/8 s, 170 tokens |
| effect caps | `llmtalk.js CAP` | cost ≤ 50, give ≤ 20, 3 choices |
| attribute → stat formulas | `data/stats.js DERIVED` | §4 |
| skill fx per level, xp per event | `SKILLS` | |
| tag bonus / learn curve | `TAGS`, `XP_CURVE` | +15, ×1.5, 30 |
| trait budget | `TRAIT_RULES` | 4 / 3 / ±2 |
| condition rungs | `CONDITIONS`, `STRESS.rungs` | 30/50/70/85 % |
| zone weights / shares / injury threshold | `ZONES`, `INJURY_AT` | 25 % |

## 8. Acceptance Criteria (selftest names; all mock the model)
1. `audio sets: every faction x kind, creature x kind, engine x kind and bed resolves to files` — 5 × 16 + 13 × 5 + 14 × 3 +
   8 × 2 resolve; the five factions' pain barks are five different signatures; no Energetic Forms file; ≤ 80 MB.
2. `audio sets: the files are served and decode (one per set)`.
3. `audio positional: louder and brighter near, silent past range, a wall muffles`.
4. `audio playback: variants rotate (never twice running), pitch jitters, the voice cap holds`.
5. `audio barks: every archetype has every combat key, ip-clean, and a bark is said`.
6. `llm: a mocked model answers valid JSON -> a grounded line with checked choices` (and the cache, and the effect applies).
7. `llm: a malformed answer falls back (null), refused words and effects are thrown out`.
8. `llm: offline -> the authored topics, no talk-a-while, no error`.
9. `deep sheet: an ordinary untrained calm survivor folds to exactly neutral` (the golden/stress guarantee).
10. `deep sheet: each stat consumer moves its number` — spread, reload, carry, stamina, speed, seen-at, repair, luck, xp,
    counter price (at Ike's), noise (what reaches the infected), damage taken, healing (survival's own fold), scent,
    handling, lock time, hunger/thirst, waking, melee.
11. `deep sheet: a wound lands on a zone, opens an injury, and the zone costs you`.
12. `deep sheet: stress climbs the ladder to panic, and panic shakes the aim`.
13. `deep sheet: skills grow by doing, tiers offer perks, a perk moves the fold`.
14. `dialogue checks: a skill-gated choice greys out with its reason, then opens`.
15. `journal: quest rows read g.quests (live objective), loose ends listed, the chronicle about you`.
