# WEB SOUND — the sound pass (DIVIDED STATES OF AMERICA, `web/`)

**Status:** shipped on `feat/web-sound-pass` (2026-10-29). Code: `src/systems/audio.js`, `src/data/audiosets.js`,
`src/systems/soundscape.js` (`footSurface`), `tools/audio-pick.mjs`. Proof: `src/agent/sound-api.js` (commands
`sound`, `stepTest`; five `sound pass:` selftest checks). Licences: `web/SOUNDS-LICENSES.md` (written by the picker).

## 1. Overview

Robert's playtest (2026-10-29): *"the audio was annoying as hell... step of walking... We got a whole bunch of audio.
I don't know why the audio sounds so bad."* He was right on both counts. The audit found:

- **Footsteps were broken four ways at once.** (a) Every outdoor step played `step.sand`, which was eight slices of a
  BBC *cave-caving* recording: the wrong surface, with a cave's reverb on it. (b) Road and floor steps were sliced from
  BBC *running* takes at a fixed 0.3 s, so a slice could hold half a step or two. (c) Every take was peak-normalised
  to -1 dBFS and played at 0.45-0.6, so **a footstep was nearly as loud as a gunshot**. (d) Until a file loaded, the
  fallback played a synthesized noise click. There was no crouch, prone or run variation: every step was the same.
- **219 of the 429 shipped files came from banned sources:** 165 Pro Sound Effects *BBC* files and 54 *Gamemaster*
  files. Robert's rule is never to use either. They are all gone. The picker now refuses them (`BANNED`), and a
  selftest re-checks every shipped file.
- **Several sounds were synthesized while a recording existed:** horns (square-wave chords, the shrillest thing in the
  mix), the train horn (three sawtooth notes), melee hits, deaths, clinks, clanks, parries, bone breaks, skids and dog
  yelps.

The pass rebuilds the whole library from **Sonniss GDC bundles and Kenney/OpenGameArt CC0 only**, adds a **mix table**
so each kind of sound sits at its own level, a **per-sound rate cap**, **footsteps by surface and gait** timed to the
real stride, the **calibre's own report** on every shot, the **tail rule** for automatic fire, and a **master / music /
effects volume row** in the settings.

## 2. Player Fantasy

You hear where you are and how you move. Boots crunch on gravel and scuff on dirt, knock on a wooden floor, ring on a
deck plate and splash in shallow water. Crouched you are a whisper; on your belly you are silent until you cross
gravel. A .22 pops, a .357 barks, a .50 slams. An MG rattles without turning to mud. Nothing is shrill, nothing
machine-guns your ear, and the guns are louder than your feet.

## 3. Detailed Rules

**Library.** `tools/audio-pick.mjs` reads the studio NAS index (`N:\assets\audio\_MASTER-INDEX.csv`, 13,867 rows),
matches 118 slots by category and filename, cuts, fades and peak-normalises each take, and encodes it as mono Opus
(`public/audio/<set>/<kind>.<n>.ogg`, `src/data/audio-manifest.json`, `web/SOUNDS-LICENSES.md`). Licences are traced
by name and folder: `*_PSE_BBC-*` is BBC, the Gamemaster pack and its `gun_*`/`explosion_large_*`-style names riding
inside the Sonniss 2017 bundle are Gamemaster, `*_EF` is Energetic Forms. **All three are refused.** Everything else
is a Sonniss GDC bundle file or Kenney/OpenGameArt CC0. A full build starts from an empty manifest and an empty
`public/audio`, so a retired or banned slot can never survive.

**Footsteps.** `main.js` plays one footfall every half-stride (`stridePhase`, the same clock as the walk animation)
while you move faster than 0.5 m/s and are not swimming. `soundscape.footSurface(p, wet)` decides the surface once
per footfall: a vehicle or boat deck is `metal`; wading is `water`; underground is `road` (concrete); inside a
building or up a storey is `floor` (wood); outdoors it asks `lookfeel.surfaceUnder` (the same reader the car grime
uses): pavement `road`, `mud`, `sand`, `grass`, else `dirt`; lying snow turns any unpaved ground to `snow`.
`audio.step(surface, pan, gait)` looks the surface up in `STEPS` and the gait in `GAIT` and plays one take.

| surface | takes | source |
|---|---:|---|
| dirt (sand reuses it, pitched 0.95) | 8 | Kenney RPG footsteps (CC0), Sonniss "FS Ground Civilian Walk", "PM_SDNG single step" |
| gravel | 6 | Sonniss "S23 Gravel Loafers walk", "289 Rocks sneaker" |
| road | 8 | Kenney concrete (CC0), Sonniss "015 Asphalt Boot Walk", "FS Concrete Soldier" |
| floor (wood) | 6 | Kenney wood (CC0), Sonniss "FS Wood Civilian", "wooden floor 1" |
| metal | 6 | Sonniss "FS Metal Soldier Walk", "237 Metal Boot", "S23 Metal Boots", "Metal Plate Walk" |
| grass | 8 | Kenney grass (CC0), Sonniss "PM_SDGS dry grass", "grass 3 single step", "169 Grass Sneaker" |
| water / mud (mud 0.85 pitch, softer) | 6 | Sonniss "0014 water puddle single splashes", "slush asphalt puddles", "Bluezone water splash small", "mud splat" |
| snow | 6 | Kenney snow (CC0), Sonniss "Snow Footstep Light Slow", "snow 7 single step" |
| carpet (no surface yet) | 3 | Kenney carpet (CC0) |

**Guns.** `combat.js` passes the round (`cal`) to `audio.gun`. The weapon's class (pistol, smg, rifle, shotgun, mg, heavy)
still picks the shot kind, so a 9mm pistol is a pistol. `CALIBER_SOUND` gives the round its own
set when the gun that fires it is distinctive (a .357 is Rust Haven's revolver, 7.62x39 the Dustwolves' AK, .308 and
.50 Meridian's marksman rifles), and a pitch and level. Otherwise the shooter's faction set speaks, as before. Each
round passes `choke: shooter`: the same gun's previous voice fades in 35 ms, so only the last round of a burst rings
out its full tail (the tail rule from the `game-gun-audio` skill).

**Foley.** Horns and the train horn are a recorded vehicle horn (the train's is pitched 0.55). Melee hits are
`impact.flesh`, deaths `bodyfall`, clinks `shell`, clanks and parries `impact.metal`, a bone break a low hard
`impact.flesh`, a door leaf starting to swing `door.open` (steel doors `door.metal`), big skids `vehicle.skid`, dog
yelps and whines `fauna.dog` pain. The synth stays as the quiet fallback for each, and as the designed sounds that have
no recording (the heartbeat, the fever breath, the whistle commands, UI blips, the supersonic crack).

**Buses.** `master` (the old volume) feeds the underwater muffle and the compressor. Under it: `sfx` (every effect,
bed, engine, far-sound and voice) and `music` (the radio). `audio.setVolumes({ master, music, sfx })`; the settings
menu has **Volume / Music / Effects** sliders (`qol.js` `volume`, `musicVol`, `sfxVol`).

## 4. Formulas

- level = spatial(dist).gain × vol × resolve.gain × **mixGain(kind)** (`MIX`, longest prefix wins, default 0.8).
- step vol = STEPS[surface].vol × GAIT[gait].vol (prone: `STEP_RULES.proneLoud[surface]` or 0).
- step pitch = resolve.pitch × STEPS.rate × GAIT.rate × (1 ± 0.04).
- a sound may start when the plays of its `set/kind` in the current second are below `rateCap(kind)` (`RATE_CAP`).

Variables: `dist` m (0..range), `vol` 0..1.4 (caller), `resolve.gain` 0.5..1.3 (set alias), `mixGain` 0.24..1.

**Example.** A walking step on road at 1.2 m: spatial gain 1.0 (inside the 4 m ref) × STEPS.road 0.9 × walk 1.0 ×
mix 0.24 = **0.22** of a -1 dBFS take (about -14 dB). A crouched step: 0.22 × 0.4 = 0.09 (-22 dB). A rifle shot by a
fighter 8 m off: inverse-distance 4/(4+0.9×4) = 0.53 × edge 0.999 × vol 1 × mix 1 = **0.53** (-6.5 dB). So a step
sits about 8 dB under a gunshot at 8 m (before: 0.6 × 1.0 = 0.6, *louder* than that shot).

| MIX | gain | | MIX | gain |
|---|---:|---|---|---:|
| shot.* | 1.0 | | impact.* | 0.5 |
| shot.far | 0.8 | | impact.flesh | 0.6 |
| explosion.* | 1.0 | | door.* / door.kick | 0.5 / 0.7 |
| step.* | **0.24** | | reload.* | 0.45 |
| vehicle.horn | 0.42 | | shell | 0.28 |
| vehicle.skid | 0.30 | | radio.* | 0.35 |
| alarm.* | 0.6 | | bark.* | 0.7 |

| GAIT | vol | rate | | RATE_CAP (a second) | |
|---|---:|---:|---|---|---:|
| walk | 1.0 | 1.00 | | default | 14 |
| run | 1.3 | 1.03 | | step.* | 6 |
| crouch | 0.4 | 0.97 | | shot.* | 22 |
| prone | 0 (gravel 0.3) | 0.95 | | impact.* / shell | 10 / 8 |

## 5. Edge Cases

- **Files still loading:** a footstep is silent rather than a synth click; every step surface and the small foley are
  preloaded when audio starts.
- **Samples switched off** (`audioTest samples=false`): footsteps fall back to a softer synth tick.
- **Swimming:** no footfalls. **Wading:** water steps. **On a deck:** metal, whatever the ground under the hull.
- **A burst from one gun:** each round chokes the last; two guns never choke each other.
- **A flood** (a 60-round MG burst in one frame, a crowd's clinks): the rate cap drops the excess, the voice cap still
  drops the quietest.
- **The voice-cap selftest** floods on purpose: it sets `audio.rateOff` for its loop and restores it.
- **Old saved settings** without `musicVol`/`sfxVol` read the defaults (0.8 / 1).

## 6. Dependencies

`systems/lookfeel.js surfaceUnder` (ground type), `systems/water.js stateAt` (wade/swim), `systems/characters.js
stridePhase` (the step clock), `data/ballistics.js ROUNDS` (the calibre), `systems/radio.js` (the music bus),
`systems/farsound.js` and `systems/voice.js` (the sfx bus), `ui/qol.js` (the volume row). The NAS
(`N:\assets\audio`) is needed only to rebuild the library, never to run the game.

## 7. Tuning Knobs

| knob | now | safe range | what it changes |
|---|---|---|---|
| `MIX['step.']` | 0.24 | 0.12..0.4 | how loud feet are against guns; past 0.4 steps compete with shots again |
| `GAIT.crouch.vol` | 0.4 | 0.2..0.6 | how stealthy a crouch sounds (sound only; AI hearing is `stance.js`) |
| `STEP_RULES.jitter` | 0.04 | 0.02..0.06 | pitch variety; past 0.06 steps wobble audibly |
| `RATE_CAP['step.']` | 6 | 4..8 | a sprint makes ~3.5 steps/s; under 4 starts dropping real steps |
| `RATE_CAP['shot.']` | 22 | 15..30 | how many shots of one set a second; an MG at 900 rpm is 15 |
| `MIX['vehicle.horn']` | 0.42 | 0.3..0.6 | horn level; the old synth horns were the shrillest thing |
| `VOLUME_DEFAULTS` | 0.55 / 0.8 / 1 | 0..1 | master, music, effects at first launch |

All in `src/data/audiosets.js`: `MIX`, `RATE_CAP`, `STEPS` (per-surface vol and rate), `GAIT`, `STEP_RULES` (jitter,
proneLoud, range, dist), `CALIBER_SOUND`, `VOLUME_DEFAULTS`, `SPATIAL`. The library: `SLOTS` in
`tools/audio-pick.mjs` (`node tools/audio-pick.mjs plan` to see the matches, `build` to rebuild, `--only <re>` for one
slot).

## 8. Acceptance Criteria (selftest names)

- `sound pass: every sound id the game asks for resolves to a real file, and no file is BBC, Gamemaster or unlicensed`
- `sound pass: footsteps vary per surface (4+ takes each, their own files), never the same take twice running, pitch within +-4%; crouch is softer, a prone crawl silent but on gravel`
- `sound pass: no sound plays more than its cap a second (an MG flood, a footstep flood, a clink flood)`
- `sound pass: the calibre picks the report (a .357 is Rust Haven's revolver, a .22 pops higher and softer) and an automatic chokes its last tail`
- `sound pass: the volume row drives the buses (master, music, sfx) and the settings menu has its three sliders`

Commands: `sound` (licence audit, every id, steps, mix, rate peaks, volumes; `action=volume`), `stepTest
surface= gait= n=`.

## Not found / not done

- **No BBC-free sand footsteps** in the library: desert sand reuses the dirt takes pitched down.
- **Carpet** has only 3 clean takes (Kenney) and no surface maps to it yet.
- **The supersonic crack** stays synthesized: no take in the library was a clean, short snap.
- **AI-generated sounds were not used** (the Godot build's ElevenLabs SFX in `game/assets/sfx/`, the football
  sound-batch tool): Robert's Sonniss note says "we don't do AI-made sound effects", and each is one take per sound.
- Engine loops are cut from "steady rpm" stretches by position, not by ear; a loop that pumps should get a new `at`.

## Every sound and its source

See the generated table below (and `web/SOUNDS-LICENSES.md` for every file's cut point).
