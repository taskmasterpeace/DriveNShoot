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

### Audit, before -> after (generated by scratchpad table script from the old and new manifests)

before: {"n":429,"bad":219,"by":{"sonniss":203,"gamemaster":54,"pse":165,"cc0":7}}
after: {"n":443,"bad":0,"by":{"sonniss":398,"cc0":45}}

| sound id | before | after | after licence | after sources (first two) |
|---|---|---|---|---|
| bark.crowd/alert | BANNED ×4 | real ×4 | sonniss | City Protest in street voices shouting and meg · Protests_Anticapitalista_02_Ravenswood |
| bark.crowd/retreat | BANNED ×3 | real ×3 | sonniss | Crowd Lutte  · WALLA - Crowd laugh and shout - Interior - Lou |
| bark.female/shout | real ×5 | real ×5 | sonniss | EMOTE Ashley, Woman, Anger Fight Grunt Big 02, · EMOTE Ashley, Woman, Anger Fight Grunt Big 02 |
| bark.male/death | 1 ok + 3 BANNED | real ×4 | sonniss | Scream,Male,Mid Thirties,Mouth Covered,Gasps,F · VOXScrm_Male in Shock 4_344 Audio_Screaming |
| bark.male/pain | real ×7 | real ×7 | sonniss | EMOTE David, Man, Anger Fight Grunt Special Po · EMOTE Joshua, Man, Pain Hurt Grunt Big 03 |
| bark.male/shout | real ×6 | real ×6 | sonniss | Battle Cry, Charge, Screams, Army Attacking, R · GAF SFX03 - War Unit - Small Crowd Men, Orcs,  |
| bark.whistle/signal | BANNED ×4 | real ×4 | sonniss | Whistle 9 |
| bed.coast/day | BANNED ×2 | real ×2 | sonniss | AMBNaut_Atmos, EXT Marina, boats, rope creakin · NS01_002_Nature ambience with seaguls |
| bed.coast/night | BANNED ×2 | real ×2 | sonniss | Port ambience, small waves hitting boats · South Pacific, Exterior, Atmosphere, Desert Is |
| bed.desert/day | real ×2 | real ×2 | sonniss | Bolivia_Uyuni_Desert_Amb_Ext_18_ST · Scotch - air tone quiet nature airy wind prese |
| bed.desert/night | real ×2 | real ×2 | sonniss | 09 vineyard evening ambience, hill, very quiet · forest_alpine_crickets_01_60_loop |
| bed.forest/day | real ×2 | real ×2 | sonniss | AMBForst_Forest08_InMotionAudio_TheForestSampl · AMBForst_Spring Afternoon Edge of Mixed Forest |
| bed.forest/night | real ×2 | real ×2 | sonniss | AMB_ErieValleyHowl_AMS_CA01_020 · JSE_Cicada Ambience Morning Jungle Thailand_02 |
| bed.gate/day | BANNED ×2 | real ×2 | sonniss | AMBInd_Industrial Warehouse Construction Ambie · Industrial Warehouse_Mid Perspective 1 |
| bed.gate/night | BANNED ×2 | real ×2 | sonniss | AMBInd_Industrial Town - Ambience - IT02, Clos · BM Ambient Machinery 08 |
| bed.market/day | BANNED ×2 | real ×2 | sonniss | AMBPubl_ShopAmbience04_InMotionAudio_UKShopSam · Market souk medium voices activity and vendor  |
| bed.market/night | BANNED ×2 | real ×2 | sonniss | AMBRest_Crowd Chattering Exterior Pedestrian Z · AMBRest_Rome_Indoor-PubCrowd-InteriorCrowd |
| bed.plains/day | BANNED ×2 | real ×2 | sonniss | AMBRurl_Ambience, Countryside, Quite Fields, S · AMBRurl_Field Wheat Dry Sizzle Insects Wind So |
| bed.plains/night | BANNED ×2 | real ×2 | sonniss | AMB_ErieValleyHowl_AMS_CA01_020 · Summer in the Fields - Evening-Night 002 - Cri |
| bed.ruins/day | real ×2 | real ×2 | sonniss | Wind,Ext,Alley,Whoosh,Fluctuating slightly,Wir · Wind,Ext,Urban,Plastic,Thin,Flutter,Violent.Mo |
| bed.ruins/night | real ×2 | real ×2 | sonniss | City Night Evening Ambience, Cicada Single, Di · City Night Evening Ambience, Single Cricket, C |
| bed.swamp/day | BANNED ×2 | real ×2 | sonniss | BG_SouthAfrica_Wetland_Park_Kosi_Forest_Lodge_ · TROPICAL Wetland swamp evening foaming frog du |
| bed.swamp/night | 1 ok + 1 BANNED | real ×2 | sonniss | 0457 - amazon jungle night · swamp_ambience_night_05_120_loop |
| bed.weather/rain | 1 ok + 1 BANNED | real ×2 | sonniss | PM_ECR_6 Rain, City, Medium, Drippy, Distant R · RAIN_Weather, Rain, Heavy with Distant Thunder |
| bed.weather/wind | 1 ok + 1 BANNED | real ×2 | sonniss | EFX SD Wind Soft Whistling Gusts 04 · Wind - Aspen - Gusts - Close - Inside Canopy - |
| choir/idle | 3 ok + 1 BANNED | real ×4 | sonniss | DSGNErie_Atmosphere Angst 006_MMSD · DSGNErie_Eerie23_InMotionAudio_SinisterTexture |
| common/alarm.bell | BANNED ×3 | real ×3 | sonniss | alarm_loops_08 · CSFX-2_Alarms_09 |
| common/alarm.klaxon | BANNED ×3 | real ×3 | sonniss | Alarm_Fast_DDM23_Wav · SmlAlarm6_Single_Fast_DDM_Loop |
| common/alarm.siren | BANNED ×3 | real ×3 | sonniss | EFX EXT Emergency Siren 02 A · gaz_69_t27_var_sfx_siren_modulation_x2_MKH8060 |
| common/bodyfall | 2 ok + 3 BANNED | real ×4 | sonniss | RL_bodyfall_Concrete_Generic_Feet_Mid_Mono_Med · RL_bodyfall_Dirt_M4_Close_Stereo_Hard_Impact_1 |
| common/door.close | real ×4 | real ×4 | sonniss+cc0 | door-household open close sliding 02 · doorClose_001 |
| common/door.kick | real ×4 | real ×4 | sonniss | BROKEN - DESIGNED - WOOD Break Small · wood_breaking_cracking_snapping_breaking_peeli |
| common/door.metal | 1 ok + 3 BANNED | real ×4 | sonniss | basement_parking_garage_gate_metal_general_per · Door - SpaceShip_hatchway_06 |
| common/door.open | real ×4 | real ×4 | sonniss+cc0 | door-household open close sliding 02 · DOORCreak_Wooden Door, Opening and Closing 09_ |
| common/dry | BANNED ×4 | real ×4 | sonniss | Steyr_TMP_9mm_foley_distant_MKH418S_S_cocking_ |
| common/explosion.far | 2 ok + 2 BANNED | real ×4 | sonniss | Distant Blast 05 · Distant Blast 17 |
| common/explosion.near | 3 ok + 2 BANNED | real ×5 | sonniss+cc0 | Explosion 8 · explosion_02 |
| common/glass.break | 1 ok + 5 BANNED | real ×6 | sonniss | Bluezone_BC0274_glass_impact_break_falling_deb · GLASBrk_Glass Break Hit_04_MWSFX_GL |
| common/impact.concrete | real ×5 | real ×5 | sonniss | Bluezone_BC0297_stone_impact_015 · Bluezone_BC0297_stone_impact_041 |
| common/impact.dirt | real ×4 | real ×4 | sonniss | dirt_collapse_05 · DIRTCrsh_Stone Sand Trickle Reverberant 01_JSE |
| common/impact.flesh | 1 ok + 5 BANNED | real ×6 | sonniss+cc0 | EFX SD GORE Punch 02 B.M · impactPunch_heavy_002 |
| common/impact.glass | real ×4 | real ×4 | sonniss+cc0 | Bluezone_BC0274_glass_impact_break_small_014 · impactGlass_heavy_000 |
| common/impact.metal | BANNED ×6 | real ×6 | sonniss+cc0 | EFX EXT Metal Impact Drop 01 A · impactMetal_002 |
| common/impact.wood | 2 ok + 3 BANNED | real ×5 | cc0 | impactWood_heavy_000 · impactWood_heavy_002 |
| common/melee.swing | real ×4 | real ×4 | sonniss | EFX SD Sliding Whoosh By 34 · Seq 2.27 whoosh #1 96 HK1 |
| common/radio.static | BANNED ×4 | real ×4 | sonniss | CB Radio_Freq 06_Static_Fienup_001 · OldRadioTuningStaticNoise_001 |
| common/radio.stinger | BANNED ×4 | real ×4 | sonniss | Bluezone_BC0266_radio_beep_walkie_talkie_002 · vintage_radio_button_006 |
| common/reload.pistol | BANNED ×4 | real ×3 | sonniss | EFX INT Unloading Magazine Singles 01 |
| common/reload.rifle | BANNED ×4 | real ×4 | sonniss | GUNMech_SVD Dragunov 7.62×54R SOURCE Magazine  · K98k, Handling, Various, t2, 1m, Right, MKH806 |
| common/reload.shotgun | BANNED ×4 | real ×4 | sonniss | 0019_Shotgun_Pump_Action_1 · GUNMech_Saiga 12 Cal.12 SOURCE Chamber Eject B |
| common/ricochet | real ×4 | real ×4 | sonniss | Bullet Impact 16 - Light Version · Bullet Impact 22 |
| common/shell | real ×3 | real ×3 | sonniss | bullet_shell_bounce_wood2_05 · Cartridges and Casings Shell - drop on Carpete |
| common/shot.far | real ×6 | real ×6 | sonniss | AK5_valley_field_forest_50m_behind_gun_off_axi · AKSD0854 AK-74 spot D far burst 03 rounds |
| common/step.carpet | missing (synth) | real ×3 | cc0 | footstep_carpet_000 · footstep_carpet_001 |
| common/step.dirt | missing (synth) | real ×8 | cc0 | footstep00 · footstep01 |
| common/step.floor | BANNED ×8 | real ×6 | sonniss | FS Wood Civilian Crouch N03 · FS Wood Civilian Crouch N05 |
| common/step.grass | real ×6 | real ×8 | sonniss+cc0 | 169_Foley_Footsteps_Grass_Sneaker_Walk_Fast_Ru · footstep_grass_001 |
| common/step.gravel | missing (synth) | real ×6 | sonniss | 289_Foley_Footsteps_Rocks_Sneaker_Jump_Land_On · S23_SFX_Footsteps_Gravel_Loafers_Loops_Walk_No |
| common/step.metal | 1 ok + 5 BANNED | real ×6 | sonniss | 237_Foley_Footsteps_Metal_Boot_Walk_Normal_Clo · FOOTSTEP - Metal Plate Walk Barefoot Male - 1 |
| common/step.road | BANNED ×8 | real ×8 | sonniss | 015_Foley_Footsteps_Asphalt_Boot_Walk_Fast_Run · FS Concrete Soldier Crouch N02 |
| common/step.sand | BANNED ×8 | missing (synth) |  |  |
| common/step.snow | missing (synth) | real ×6 | cc0+sonniss | footstep_snow_000 · footstep_snow_001 |
| common/step.water | real ×6 | real ×6 | sonniss | 0014_Footsteps_water_puddle_single_splashes · Bluezone_BC0256_water_splash_small_008 |
| common/vehicle.crash | 1 ok + 4 BANNED | real ×5 | sonniss | Car_Destruction_Damaged_Engine_t22_Ext_Heavy_D · DESTRCrsh_Designed Car Explosion With Metal Br |
| common/vehicle.door | BANNED ×4 | real ×4 | sonniss | EG_2007 Mini Cooper Sidewalk_Idle close door a · VEHDoor_1967 Corvette EXT-Drivers Door Open &  |
| common/vehicle.horn | BANNED ×3 | real ×3 | sonniss | Man Lions Coach - VAR SFX - Horn Various - Mon · VEHHorn_Renault R4 GTL Horn Signal 01 Interior |
| common/vehicle.skid | 1 ok + 2 BANNED | real ×3 | sonniss | BMW1104 BMW 520i Spot A Start Fast Drive with  · TC1701 Toyota Chaser Mark 2 ENGINE various ski |
| common/whiz | real ×3 | real ×3 | sonniss | bullet_flyby_fast_05 · bullet_flyby_fast_06 |
| drifter/shot.pistol | BANNED ×5 | real ×5 | sonniss | Beretta_93R_9mm_1m_left_on_ground_DPA4062_clea · Glock 17 - FIRING - Take 1 - 20m In Front - AB |
| drifter/shot.rifle | real ×4 | real ×4 | sonniss | EFX EXT .22 Long Rifle Shots 01 A · FN_FAL_7.62x51mm_1.5m_behind_right_clean_2_sho |
| drifter/shot.shotgun | real ×2 | real ×3 | sonniss | PM_FSSF_GUN_SHOTGUN_2 · Shotgun_Fire_Round Eject_01 |
| drifter/shot.smg | BANNED ×5 | real ×5 | sonniss | Steyr_TMP_9mm_1m_right_CS3_clean_Double_shots_ · STSRC_WoWW2_Wep_SMG_M3_GreaseGun_Submachine_Gu |
| dustwolves/shot.pistol | real ×3 | real ×3 | sonniss | Glock_18_1m_left_off_axis_MKH416_clean_Six_sho · Glock_18_75m_behind_Ehrlund_R2_clean_Six_shots |
| dustwolves/shot.rifle | real ×6 | real ×6 | sonniss | AK0405 AK-74 rear long distance burst 05 round · AK4_long_corridor_single_shots_blanks_behind_g |
| dustwolves/shot.shotgun | 1 ok + 4 BANNED | real ×5 | sonniss | GUNShotg_Saiga 12 Cal.12 SOURCE Single Shots 1 · SAIGA-12_12g_solid_slug_1m_left_off_axis_MKH41 |
| dustwolves/shot.smg | real ×6 | real ×6 | sonniss | Ingram_M10_9mm_1m_right_CS3_clean_Double_shots · Ingram_M10_9mm_50m_behind_RSM191_R_clean_Doubl |
| echo/idle | BANNED ×4 | real ×4 | sonniss | Bluezone-BC0223-noise-radio-signal-025 · Bluezone-BC0223-noise-radio-signal-029 |
| engine.boat/idle | BANNED ×2 | real ×2 | sonniss | boat Arvor 215 engine neutral gear than turn o · boat Arvor 215 exterior engine diesel on low r |
| engine.boat/rev | BANNED ×2 | real ×2 | sonniss | 0051 - motor boat ride · fishing_boat_trawler_t28_onbrd_various_speeds_ |
| engine.boat/strain | BANNED ×2 | real ×2 | sonniss | BOATMotr_Boat Mercury ONBOARD Ramp Up And Down · F2_Boat_t5_Ext_Away_Bys_Up_Stop_ORTF_CMC6 |
| engine.car/idle | BANNED ×2 | real ×2 | sonniss | BMW 114i Engine Start Idle Stop · Skoda_Octavia_1.6_t1_onboard_start_stop_idle_b |
| engine.car/rev | real ×2 | real ×2 | sonniss | Alfa_Romeo_159_SW_t2_onboard_driving_steady_rp · Porsche_911_SC_-81_t5_onboard_driving_constant |
| engine.car/strain | BANNED ×2 | real ×2 | sonniss | Dodge_Challenger_Hemi_-70_t3_onboard_driving_s · pontiac_gto_t13_onbrd_drive_steady_RPMs_stop_E |
| engine.heavy/idle | BANNED ×2 | real ×2 | sonniss | chaffee_m24_t6_onbrd_start_idle_blips_steady_i · T-34_t2_onboard_startup_driving_idle_int |
| engine.heavy/rev | 1 ok + 1 BANNED | real ×2 | sonniss | Pvpjbv 2062 - t9 - ONBRD - FAST - Drive Variou · Tankietka_t5_Onbrd_Slow_Drive_Various_Interior |
| engine.heavy/strain | BANNED ×2 | real ×2 | sonniss | excavator MF 860 exterior engine passby medium · VEHFarm_Tractor Magnum 7250 ONBOARD Driving Se |
| engine.moto/idle | real ×2 | real ×2 | sonniss | VEHMoto_BMW F800R EXTERIOR Approach Slow Decel · VEHMoto_KTM Super Duke R EXTERIOR Turn On Star |
| engine.moto/rev | 1 ok + 1 BANNED | real ×2 | sonniss | VEHMoto_Aprilia RS 125 EXTERIOR Pass By Fast A · VEHMoto_BMW F800R EXTERIOR Pass By Fast Accele |
| engine.moto/strain | 1 ok + 1 BANNED | real ×2 | sonniss | VEHMoto_Aprilia RS 125 EXTERIOR Pass By Fast A · VEHMoto_BMW F800R EXTERIOR Pass By Fast Accele |
| engine.truck/idle | BANNED ×2 | real ×2 | sonniss | M1_Corbitt_t1_onbrd_startup_idle_shutdown_inte · Volvo_dump_truck_t1_ext_startup_idle_blips_ste |
| engine.truck/rev | BANNED ×2 | real ×2 | sonniss | gaz_69_t21_onbrd_idle_steady_engine_gearbox_DP · Iveco_Daily_van_-12_t2_onboard_driving_steady_ |
| engine.truck/strain | BANNED ×2 | real ×2 | sonniss | chevrolet_silverado_tow_truck_t5_onbrd_start_s · Volvo_F12_truck_t2_onboard_slow_accel_through_ |
| fauna.bird/call | 1 ok + 2 BANNED | real ×3 | sonniss | BIRDPrey_Red Kite Call, Screech, Bird of Prey, · BIRDPrey_Spring Night Deciduous Forest Many Ta |
| fauna.cat/call | BANNED ×3 | real ×3 | sonniss | animals cat blue meow 14 mono 96kHz · animals cat Fiona 31 meow mono 192kHz |
| fauna.coyote/call | real ×3 | real ×3 | sonniss | Coyotes 2015.13.28_Sutton_CloseCoyoteNR1 · Coyotes 2016 Medlock Fall Gusts and Creaks Coy |
| fauna.dog/bark | BANNED ×5 | real ×5 | sonniss | Dog_big_close_barking_3-011 · Dog_Border Collie Mix_Whining and Bark_Fienup_ |
| fauna.dog/growl | BANNED ×3 | real ×3 | sonniss | EFX INT Dog Fight 01 A.M · EFX INT Dog Snarling 24 C |
| fauna.gator/call | real ×3 | real ×3 | sonniss | ANIMAL WILD Camel A, Grunt, Groan, Roar x13.wa · Dinosaur Growl 3_Mono |
| fauna.hog/call | BANNED ×4 | real ×4 | sonniss | EFX SD Pig 07 Squeal 08 · EFX SD Pig 07 Squeal 20 |
| fauna.snake/call | real ×3 | real ×3 | sonniss | JW4-WS_Rattle-Mechanics_ST_064 · snake_hiss_03 |
| howler/howl | BANNED ×4 | real ×4 | sonniss | Coyotes 2015.13.28_Sutton_CloseCoyoteNR1 |
| howler/snarl | BANNED ×4 | real ×4 | sonniss | Dinosaur Growl 3_Mono · EFX INT Dog Snarling 24 C |
| meridian/shot.pistol | real ×4 | real ×4 | sonniss | Desert Eagle - FIRING - Take 1 - 4m Left - CSS · Desert Eagle - FIRING - Take 2 - 65m Right - H |
| meridian/shot.rifle | real ×5 | real ×5 | sonniss | Barrett_M98B_.338_Lapua_2m_right_MKH60_clean_S · HK_G3_7.62x51mm_1m_left_off_axis_MKH418_clean_ |
| meridian/shot.shotgun | real ×4 | real ×4 | sonniss | SPAS-12 - FIRING - Pump Action - Take 1 - 20m  · SPAS-12 - FIRING - Semi Automatic - Take 1 - 3 |
| remnant/shot.mg | BANNED ×5 | real ×5 | sonniss | HK_MG4_5.56mm_1m_left_off_axis_MKH416_clean_Bu · L110A2_LMG_5.56mm_belt_fed_1m_right_MKH8040_1_ |
| remnant/shot.pistol | real ×4 | real ×4 | sonniss | Beretta_93R_9mm_1m_left_on_ground_DPA4062_clea · Beretta_93R_9mm_25m_behind_DPA4062_R_clean_Tri |
| remnant/shot.rifle | real ×6 | real ×6 | sonniss | Assault Rifle - M4 - 03 - Burst 03 · Enfield_L85_rifle_5.56mm_1m_left_off_axis_MKH4 |
| remnant/shot.rifle.in | real ×3 | real ×3 | sonniss | Audiobeast_Medium_Warehouse_Browning_M2_.50_Ma · Audiobeast_Small_Room_H&K_416_5.56_Assault_Rif |
| remnant/shot.smg | real ×4 | real ×4 | sonniss | FN_P90_5.7mm_1m_left_on_ground_DPA4062_clean_D · FN_P90_5.7mm_75m_behind_Ehrlund_R1_clean_Doubl |
| rusthaven/shot.pistol | 2 ok + 4 BANNED | real ×6 | sonniss | Colt Python 357 Magnum - FIRING - Take 1 - 4m  · Colt Python 357 Magnum - FIRING - Take 3 - 160 |
| rusthaven/shot.pistol.in | real ×4 | real ×4 | sonniss | Audiobeast_Large_Warehouse_Colt_M1911_.45_ACP_ · Glock 17 9mm - FIRING - Small Living Room - Si |
| rusthaven/shot.rifle | real ×5 | real ×5 | sonniss | K98k, Firing, t2, MKH416 · M1903A3, Firing, t2, 1m, Right, Above, MKH8060 |
| rusthaven/shot.shotgun | real ×4 | real ×4 | sonniss | 0003_Shotgun_Fire_3 · Audiobeast_Medium_Warehouse_Remington_870_12g_ |
| shambler/attack | real ×4 | real ×4 | sonniss | CREAHmn_Test Subject 2  12_344 Audio_Zombie Sp · CREAHmn_Test Subject 3 10_344 Audio_Zombie Spe |
| shambler/idle | real ×6 | real ×6 | sonniss | CREAHmn_Test Subject 2  12_344 Audio_Zombie Sp · CREAHmn_Test Subject 3 10_344 Audio_Zombie Spe |
| shambler/pain | real ×3 | real ×3 | sonniss | Creature_Monster_Pain_01 · TheLibrarybyMTC_GroanyMonster_Pain_118_96k |
| sprinter/alert | real ×4 | real ×4 | sonniss | Monster Within - Bearer - Vocal_TakeDamage03 · Monster Within - Hunter - Fley_Attack02 |
| sprinter/idle | BANNED ×4 | real ×4 | sonniss | Breathe 6 · Breaths,Male,Exhale,Ghost,Evil,Hostile,Snarl,1 |

Synthesized by design (no recording used): supersonic crack, heartbeat, fever breath, whistle commands, UI blips/pickups, harpoon/yank, hiss, whoomp, tyre pop, backfire, thunder, the engine's sawtooth fallback, rain/wind noise loops under the weather beds.
