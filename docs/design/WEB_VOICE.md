# WEB_VOICE: living characters, spoken lines, the voice pipeline

## 1. Overview

Robert, EM3 Briefing, 2026-10-23:
> "we must have dialog... living characters... generate stuff beforehand... production level variations... generate the audio... production level... but I don't want you to go crazy with spending time on that. But they gotta be done. So set the groundwork for that."

This is that groundwork. It has four parts:

| Part | Where | What it is |
|---|---|---|
| Dialogue as data | `web/src/data/dialogue.js` | Every spoken line is a row: a situation key, who may say it, conditions, 3 to 8 variations, a performance direction. |
| Voice casting as rows | `web/src/data/voices.js` | Each named person has a voice row; everyone else is cast from an archetype and the accent of their flag, seeded by their name. |
| The batch pipeline | `web/tools/voiceforge/` | Turns rows into audio clips, caches by text plus voice, writes the manifest the game loads, QC-checks every clip and guards the budget. |
| The runtime | `web/src/systems/voice.js` | Picks a variation, fills it from the live world, plays the clip at the speaker in 3D, and falls back to the subtitle. |

The API the gunpoint state calls is one function: `game.voice.say(c, key, vars)`.

## 2. Player fantasy

The people of the Divided States talk like people:
- The sheriff at the gate sounds like a Nigerian woman who has run the wall for ten years.
- A raider on the highway tells you the road is a toll road, in a voice you will learn to dread.
- A drifter you hold at gunpoint begs, and never in the same words twice.
- A stranger warns you about the road north of here, because there really is something to the north.

You hear a voice from the left of the screen and quieter behind a wall of distance. Gunfire cuts a story short. Somebody
who is dying says something, and it is short.

## 3. Detailed rules

### 3.1 Dialogue rows (`data/dialogue.js`)

```js
{ id: 'gp.rob', key: 'gunpoint.rob', who: ['raider', 'drifter'], when: { mood, tier, night },
  direction: 'Menacing and calm...', kind: 'gunpoint', lines: ['Toll road, {you}. Empty your pockets.', ...] }
```

- **key**: the situation. The new situations are `greet`, `refuse`, `under_fire`, `gunpoint.aimed`, `gunpoint.surrender`, `gunpoint.plead`, `gunpoint.handover`, `gunpoint.defiant`, `gunpoint.rob`, `gunpoint.rob_warn`, `gunpoint.rob_paid`, `standoff.open`, `standoff.hold`, `standoff.back_down`, `standoff.break`, `trade.hello`, `trade.deal`, `trade.broke`, `rumour`, `road.warning`, `death` and `thanks` (the `SITUATIONS` table).
- **who**: `'*'`, an archetype (`drifter`, `warden`, `raider`, `soldier`), a named npc id, or `'radio'`. The most specific match wins: a named row, then an archetype row, then `'*'`.
- **when** (optional), all of which must hold:
  - `mood`: `calm`, `scared` (a shot within 16 m in the last 10 s), `hurt` (under 40% hp or downed), or `angry` (a vendetta, or their people read you hostile);
  - `tier`: how their faction reads you;
  - `night`.

  A row whose conditions hold beats a row with none at the same level.
- **lines**: the variations. Tokens fill from the live world (3.4).
- **direction**: the performance (the Breeze and Gemini instruction). A key's default is in `DIRECTION`.
- **kind**: `bark`, `talk`, `radio`, `gunpoint` or `death`. It sets who may cut whom (3.5).

**Ported, not rewritten.** Today's talk (`data/talk.js` NEWS/ROAD/YOU), the strangers' small talk (`npcs.js` BARKS),
the memory barks (`society.js` MEMORY_KINDS), the radio (`events.js`), the role lines and every fixed line of the named
cast's dialogue trees are BUILT into rows from those tables at load. Their words are unchanged and single-sourced:
`talk.js` now asks for `talk.news.saw.kill` through the row and gets the same sentence. 172 rows, 138 keys, 299 lines.

### 3.2 Casting (`data/voices.js`)

- **Named people** have a `VOICES` row: gender, age, flag, pitch, style, and a recipe per provider.
  - The Breeze recipe is a voice design (the formula: gender and age, role, pitch and timbre, texture, accent, pace, register, personality, plus a clarity term) and a ledger seed.
  - The Gemini recipe is one of its 30 named voices plus a persona.
  - The flite recipe is a placeholder voice.

  | Who | Flag | Accent | Ledger seed |
  |---|---|---|---|
  | Okonkwo | NG | Nigerian English, low alto | 101 |
  | Reyes | MX | Mexican Spanish-accented, warm mezzo | 202 |
  | Ike | US | Southern drawl, gravel baritone | 303 |
  | Kenji | JP | Japanese-accented, light tenor | 404 |
  | Mags | HT | Haitian Creole-accented contralto | 505 |
  | Saoirse | IE | Irish radio soprano; she is also STATIC 1660 AM | 606 |
  | Tomás | CU | Cuban, old and slow | 707 |
  | Vo | VN | Vietnamese-accented, jumpy | 808 |

- **Everyone else**: `castVoice(c)` returns `<archetype>.<gender><variant>.<flag>`, for example `raider.m0.US`.
  - The archetype comes from the faction (`ARCHETYPE_OF`). The infected and the player have no voice.
  - The gender comes from the first name (a table over `npcs.js` FIRST; names that could go either way go by hash).
  - The variant is `hash(name) % 2`.
  - The accent is `ACCENTS[flag]`, a real accent for the flag on their chest.

  Seeded by name, the same stranger sounds the same every time you meet them, across saves and chunk evictions.
  `voiceRow(id)` builds the full recipe for any such id from `TEMPLATES` (two variants per gender per archetype,
  each with its own seed base offset by the flag).
- A pack NPC may carry `voice: '<id>'` or an inline voice row.
- **Never change a shipped voice's id or seed.** Clips and frozen references hang off them. To recast, add a row.

### 3.3 The pipeline (`web/tools/voiceforge/`)

```
node tools/voiceforge/voiceforge.mjs list                                   # rows, keys, batches
node tools/voiceforge/voiceforge.mjs plan   --batch proof --provider breeze # what would render, the estimate
node tools/voiceforge/voiceforge.mjs render --batch proof --provider breeze --max 40
node tools/voiceforge/voiceforge.mjs check  --batch proof                   # QC every clip again
node tools/voiceforge/voiceforge.mjs audition --voice okonkwo               # design + freeze a Breeze reference
node tools/voiceforge/voiceforge.mjs render --voice raider.m1.MX --key gunpoint.rob --provider breeze --max 8
```

- **Selection.** Use a named batch (`batches.mjs`), or `--voice` with `--key` or `--text`.
  - A key selection takes the rows that voice's speaker could say, at most `take` variations.
  - A tree selection reads a named person's nodes. A line written as a function of the game is read out of two probe states, and probe lines with numbers in them are skipped.
- **Variable-free lines** render as they are.
- **Template lines** render a few inserts:
  - `{you}` is always "stranger";
  - `{dir}`, `{place}`, `{who}`, `{n}` and `{about}` take at most two values each from `INSERTS`, or the batch's own.

  Any other filled value finds no clip and plays as text only. The game looks a clip up by the exact filled words, so a rendered insert just works.
- **Cache.** A clip is filed under `clipKey(voice, text)`, the same function the game uses to look it up. Its manifest entry also records the recipe hash (provider, the voice's recipe for it, the direction). A re-run renders only lines that are new, or whose recipe changed. The manifest is written after every clip, so an interrupted run resumes.
- **Finish.** Each clip has its ends trimmed (−50 dB), is levelled (loudnorm −18 LUFS, −2 dBTP) and is encoded as mono mp3 at 64 kbps, 24 kHz, to `public/voice/clips/<voice>/<key>.mp3`.
- **QC** (`qc.mjs`), measured from the samples. A line is flagged for any of:
  - duration against words at 150 wpm (too short under 35%, too long over 2.6x + 1 s);
  - clipped samples, or a peak over −0.3 dBFS;
  - RMS under −38 dBFS (near silence);
  - more than 0.35 s of silence at the start, or 0.6 s at the end;
  - a silence over 1.2 s inside the line.

  Flags print and are stored on the entry (`qc`). `check` re-measures every clip from disk.
- **Budget guard.**
  - `plan` prints the count, the cached count, the seconds of speech and the cost.
  - `render` refuses more than `--max` lines (default 40) and refuses to spend money without `--yes`.
  - A missing key or an unreachable box stops the run at once; it never hammers.
- **ip-lint.** A batch with a DENY term in any line is refused before anything renders. It uses `tools/ip-terms.mjs`, the lint's own lists.

### 3.4 The runtime (`systems/voice.js`)

- `say(c, key, vars, opts)`:
  - picks the rows (3.1);
  - deals a variation from a **shuffled deck per speaker and key** (every variation once before any comes round again, never the same line twice running; another person's deck is shuffled differently);
  - fills the tokens;
  - puts the line on the subtitle when it is within 18 m (a bark at most every 1.5 s);
  - speaks it.

  It returns `{ key, row, text, voice, played, why }`.
- `line(c, key, vars)`: the same pick and fill, text only. `talk.js` uses it.
- `speak(c, text, opts)`: voices an exact line if `manifest.clips[clipKey(castVoice(c), text)]` exists.
  - The clip is fetched and decoded once, with a small cache.
  - The graph is BufferSource → lowpass → gain → stereo panner → the master bus.
  - The voice is placed every frame from where the speaker stands relative to the player (3.5).
- `radio(text)`: STATIC 1660 AM in Saoirse's voice, through a bandpass, at the same level everywhere.
- **The live world's words.** Tokens are filled only when the line has them:
  - `{place}` is the society place the speaker stands in;
  - `{dir}` is the compass word toward the nearest raider or infected within 300 m, else the nearest raider camp, else the player;
  - `{n}` is the infected within 150 m;
  - `{you}` is "stranger";
  - `{me}` is the speaker's first name;
  - `{who}` and `{about}` are passed by the caller.
- **Wired today:**
  - every line of the dialogue panel, a stranger's three topics and the remark on the way in;
  - the named cast's memory and role barks (`memory.js`);
  - STATIC 1660 AM (`director.js`);
  - a death cry from anyone who dies within 42 m (read from the `kill` events);
  - an `under_fire` shout from the nearest person within 16 m of a shot (`combat.js` calls `voice.onShot`).
- **Placeholder clips.** A clip whose provider is `flite` plays only with `?voicedev` in the URL or `voice dev=true`. Players hear the cast or the subtitle, never the robot.
- **Agents.** `node tools/dl.mjs voice` shows what is being said now, with each line's gain, distance and pan, the counts and the log. `voice id=<id> key=<key> vars={...}` says a situation line; `voice id=<id> text="..."` speaks one exact line; `voice radio=true text="..."` speaks on the radio.

### 3.5 Who talks when

- **Nobody talks over themselves.** While a person speaks:
  - a new line of theirs is dropped (`busy`);
  - a line asked for with `after` waits its turn (one waiting line per person; the dialogue panel uses this, so the remark on the way in finishes before the greeting starts);
  - a line asked for with `interrupt`, or with a higher priority, cuts their own line first.
- **Priorities:** bark 0, talk 1, radio 1, gunpoint 2, death 3.
- **Choosing a dialogue option** hushes them: they stop mid-line to listen.
- **Gunfire.** A shot within 35 m of a speaker cuts any line under gunpoint priority. Gunpoint and death lines are never cut.
- **At most 6 voices at once.** The farthest is dropped first.

## 4. Formulas

- Gain = `0.95 · max(0, 1 − d / 42)`, where `d` is the speaker-to-player distance in metres. It is silent past 42 m, and silent for a speaker who has died, except for their death line.
- Air = `max(0.35, 1 − d / 60)`. Lowpass cutoff = `600 + 7400 · air²` Hz, which dulls the high end with distance, as gunshots do.
- Pan = `clamp((x − camera.x) / 28, −1, 1)`, the same law as every other sound (`game.pan`).
- Clip key = `fnv1a32(voice + '\u0001' + text) ‖ fnv1a32'(same, seed 0x9747b28c)`, as 16 hex digits.
- Deck order = a Fisher-Yates shuffle seeded by `hash(speaker | key | round)`, with the first card swapped if it would repeat the last.
- Estimated speech length = `0.4 + words / 2.5` s.
- **Costs, per line (estimates):**

  | Provider | Cost | Notes |
  |---|---|---|
  | `breeze` (self-hosted on cupcake) | $0 | GPU time only |
  | `breeze_hosted` (paid plan) | about $0.021 per minute of speech | the $19 Creator plan, about 900 minutes a month |
  | `gemini` (Replicate) | about $0.005 | |
  | `flite` | $0 | |

  The proof batch is 40 lines, about 200 s of speech: $0 on cupcake, about $0.07 hosted, about $0.20 on Gemini.
  A full first cast is about 700 lines: the eight named people's trees, roles and barks, and 12 archetype voices × ~22 situations × ~4 variations. That is about 1 hour of speech: $0 on cupcake, about $1.30 hosted.

## 5. Edge cases

- **No clip for a line**, or a filled insert that was never rendered: text only (`why: 'no clip'`). Not an error.
- **A clip file missing or corrupt**: the fetch or decode fails once and is remembered as failed. That line plays as text from then on (`why: 'load failed'`).
- **Audio not started** (no click yet): text only (`why: 'audio off'`).
- **A speaker dies mid-line**: the gain goes to zero on the next frame. The death cry has priority 3 and cuts it.
- **The speaker is removed** (recycled, a chunk evicted): their line keeps its last position and ends on its own.
- **Two people with the same name** share a deck. Names are unique in a town (`npcs.js` USED), so only test dummies do this.
- **Accent fidelity.** The open Breeze model only knows some accents as words (american, us_southern, irish, canadian, japanese, korean). Nigerian, Mexican, Haitian, Cuban, Vietnamese and the rest are written out in the design. **Audition each voice (`audition --voice <id>`) and listen before rendering a batch with it.** Re-roll by changing its seed (+1) and log it in the row.
- **Breeze design re-samples identity on every call.** That is why the forge designs a reference once into `tools/voiceforge/refs/<voice>.wav` and `.ref.txt`, then clones every line from it: cfg 1 for a plain read, cfg 4 with the situation's direction. Commit the refs; they are the voice lock.
- **The GPU is busy with a video render.** The forge polls `/v1/health` until `running:false && queue_depth:0`, and waits out a 409.
- **Gemini takes can read the direction aloud.** Transcribe-check a Gemini batch (the `gemini-fast-tts` skill's `transcribe.mjs`) before shipping it.
- **Licence.** Self-hosted Breeze outputs are research and non-commercial only. Prototype on cupcake; render the ship set through a paid hosted plan (outputs made while subscribed are cleared for commercial use). The recipes transfer: the frozen refs become hosted voice ids.

## 6. Dependencies

- `data/talk.js`, `data/npcs.js`, `data/society.js` (MEMORY_KINDS) and `data/events.js` are ported into rows.
- `systems/talk.js` builds the voice system and resolves its lines through rows. `ui/dialogue.js` ticks the voice system every frame. Neither needs anything in `main.js`.
- Calls into voice: `systems/memory.js`, `systems/director.js` (radio) and `systems/combat.js` (`onShot`).
- `systems/audio.js` supplies the context, the master bus and the `voice` count.
- `tools/ip-terms.mjs` holds the lint's lists, split out of `tools/ip-lint.mjs` so the selftest and the forge read them.
- ffmpeg on PATH for the forge (decode, trim, level, encode; flite for the placeholder).
- The keys come from the environment only and are never printed or committed:
  - Breeze: `CUPCAKE_GATEWAY_KEY` (and `BREEZE_URL`, default `http://192.168.1.249:8700`);
  - Gemini: `REPLICATE_API_TOKEN`.
- **State of the proof batch (2026-10-23).** It is rendered with **flite placeholders**, because the cupcake gateway key was not available to the agent that built this. Rendering the cast is one command once the key is in the environment: `node tools/voiceforge/voiceforge.mjs render --batch proof --provider breeze --max 40`. It designs and freezes each voice's reference first, and replaces each placeholder in place (same clip key, new recipe).

## 7. Tuning knobs

| Knob | Where | Default |
|---|---|---|
| Hearing range, subtitle range, gunfire cut range | `voice.js` RANGE / SUB_RANGE / CUT_RANGE | 42 / 18 / 35 m |
| Voices at once | `voice.js` MAX_LINES | 6 |
| Priorities | `voice.js` PRIO | bark 0, talk 1, radio 1, gunpoint 2, death 3 |
| Under-fire shout radius, per-person cooldown, global cooldown | `voice.js onShot` | 16 m, 7 s, 1.2 s |
| A situation's performance | `dialogue.js` DIRECTION, or a row's `direction` | |
| Accents by flag | `voices.js` ACCENTS | |
| Archetype voices | `voices.js` TEMPLATES | 2 per gender (soldier: 1) |
| Batch cap | `voiceforge --max` | 40 |
| Inserts per token | `voiceforge` INSERTS, selector `per` | 2 |
| QC thresholds | `tools/voiceforge/qc.mjs` qc() | |
| Loudness | `voiceforge.mjs` finish() | −18 LUFS, −2 dBTP |

## 8. Acceptance criteria

`node tools/dl.mjs selftest only=voice` runs six checks:
1. Every situation gives a drifter, a warden and a raider 3+ variations (wardens never rob); no new row has more than 8; no row carries an ip-lint DENY term.
2. The same key on the same speaker deals a different variation each time, every one before any comes round again, never twice running; another person's order is their own.
3. `{dir}`, `{place}` and `{you}` fill from the live world: a raider 60 m north makes the road warning say "north of here"; the plea names the place the speaker stands; the robber calls you "stranger"; no braces are left.
4. A rendered line plays at the speaker:
   - 3 m away, the gain is over 0.8;
   - 30 m away, the gain is lower than 0.6 of that and still above 0, the lowpass is lower, and it pans hard to the speaker's side;
   - `audio.counts.voice` rises.
5. A clip whose file is missing falls back to the subtitle (`load failed`); a line nobody rendered is text only (`no clip`), with the subtitle showing it.
6. A second line while someone talks is dropped (`busy`), or waits its turn (`after`) and starts once the first is gone; a shot 6 m away cuts the calm line (`gunfire`).

Besides those six:
- The existing talk check still passes word for word.
- The full battery is green twice on fresh pages.
- `node tools/ip-lint.mjs` reports 0 deny.
- `voiceforge check --batch proof` flags 0.
