# Claude AI Development Guide for CarWorld / DRIVN

**Last Updated:** 2026-07-06
**Project Status:** 🚗 3D mainline (`game/proto3d/`) — deep vertical slice, all systems live
**Master spec:** `docs/ENGINE.md` · **Vision:** Autoduel × GTA2 in the DIVIDED STATES OF AMERICA (`docs/DIVIDED_STATES.md`)

---

## 🎯 What this is

Top-down 3D vehicular combat + survival in a compressed USA (60×: 4 real hours of driving = 4 in-game minutes).
**Godot 4.5+, GDScript 2.0, static typing.** Everything is data rows + one engine — adding content ≠ code.

- **res:// = `game/`** (never `res://game/`). Godot exe:
  `C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64.exe` (+ `_console.exe` for headless).
- **Run the game:** `Godot --path game res://proto3d/proto3d.tscn`
- **Legacy 2D game is QUARANTINED** in `legacy-2d/` at the repo root (2026-07-06) — OUTSIDE res://, so it can never load, launch, or hijack input again (it once F2-swapped a live playtest into the 2D start screen). Reference only; docs in `docs/legacy-2d/`. res:// now holds ONLY `addons/ assets/ data/ proto3d/`.

## 🕹 Controls (current)

**Front door:** a real launch opens on the DRIVN title (`menu.gd`, ProtoMenu) — NEW GAME / CONTINUE (save-gated) / HOST / JOIN(IP) / QUIT. `main.menu_open` swallows gameplay input while up; sims skip it (they run proto3d under a harness, so it checks `current_scene == self`). NEW GAME arms **THE FIRST RUN** (`objectives.gd`) — a guided drive→pull-over→scavenge→home chain that teaches THE CIRCUIT then retires; a veteran never sees it.

**EVERY BIND IS A ROW + REBINDABLE** (`data/input_bindings.json` → `ProtoInputMap` fold; **F11 = CONTROLS panel**, press-to-capture for key AND pad slots, persists to user://). **FULL PAD SUPPORT** (Xbox + PS-family; PS2-via-adapter same buttons): left stick move/steer · right stick AIM (twin-stick) · RT fire (tap punch/hold shove parity; becomes the GAS at the wheel, LT brake) · A/✕ dive-handbrake · B/◯ crouch · X/▢ reload · Y/△ interact · LB whistle · RB weapon cycle · D-pad radio/pack/views/sheet · START map · L3 sprint/horn · R3 binoculars · RUMBLE on hits/blasts.

Keyboard (stock): WASD move · SHIFT sprint · **CTRL hold = CROUCH (sprint+tap = SLIDE)** · SPACE dive/handbrake · **E interact** (in car: driver taps out; passenger taps out / **holds to take the wheel**; chest/body: tap opens, **hold = GRAB & DRAG**, E drops) · **LMB unarmed: tap PUNCH combo · hold SHOVE · sprint+tap TACKLE** (MARTIAL ARTS skill: lv2 kicks, lv4 throws, lv6 finishers) · **C whistle ×1 heel ×2 guard ×3 seek hold SIC ×4 SHIELD** · **Y radio scan** (music stations on the dial) · TAB pack/trunk · **K character sheet** · **M map/atlas** · T wait · B binoculars · V views · G grenade · R reload (death: wake at the safehouse — beside your PARTNER in co-op) · H horn (carries over the net) · P pet · J character creation · F home beacon · N waypoints (partner arrow / 🛸 drone marks live here) · ` weapon cycle · **F5/F9 save · F6 PvP rules · F7 host · F8 join** · **F10 DEV MODE** (FORGE live-reload incl. motions) · **F11 controls**

## 🧩 The systems (all live, all sim-proven)

| System | File(s) | The one-liner |
|---|---|---|
| Puppet rig | `puppet.gd`, `quadruped.gd` | ONE sin()-driven box rig: players/NPCs/crew (rows), dogs/howlers; shoulder joint, wound wobble, death flop |
| Vehicles | `car_3d.gd` + `data/vehicles.json` | VehicleBody3D; 10 rigs as DATA (DrivnData folds JSON→engine); 5-part damage you FEEL (misfire/slop/flicker/leak) |
| Dogs | `dog.gd` | 4 types × breeds; per-dog BOND (STRAY→SOULBOUND); down→bandage save or grave+collar+memorial; metaworld records |
| Crew | `companion.gd` | CREW rows (gunner/mechanic/medic), game-hour job ticks, MORTAL (corpse chest) |
| Motorists/traffic | `motorist.gd`, `track/autopilot.gd` | NPCs drive interstates city-to-city; ambient traffic; player rides shotgun; SEAT ANCHORS (`seats` rows) show riders |
| Combat | `weapon.gd` | data rows; melee scans combatant∪threat; wall-law (`melee_clear`); crit-kill slow-mo; wound taxes |
| Threats | `howler.gd`, `lurker.gd` | pack ROLES (circler/charger/SCREAMER summons), headlight fear, stagger; road pirates (`_update_pirates`) |
| World | `world_stream.gd`, `usmap.gd` | streamed chunks off `data/usmap.json`; authored placements; biomes; states |
| Weather | `weather.gd` | dust kills the cone, rain kills grip, heat cooks engines — biome-weighted |
| Day/night | `daynight.gd` | 24-min days, moon = night floor, T-wait sprint, `dev_mult` |
| Radio | `radio.gd` | Y scans: distress caches, trade runs, howler warnings, lore; night-weighted |
| Carousel | `carousel.gd` + `data/carousel.json` | 10 DUNGEON bases (occupiers wake on approach); power/codes/purge ladder; PAIR→ROULETTE→THE DIAL; NODE GARAGES; RING EVENTS (nodes besieged — relieve or lose); flesh not steel |
| Events | `events.gd` | deterministic daily roll: caravan / blood moon / STATE AT WAR (weekly) |
| Rulers | `data/rulers.json` | states react to standing at the border: bounty hunters vs hero's welcome |
| THE CIRCUIT | `proto3d.gd` | the named loop: scavenge→upgrade→push→node; HUD pips; cycle payoff |
| First run | `objectives.gd` | NEW-GAME-only onboarding chain: data-row beats that complete on REAL state (drove 60m / out of car / pack grew / at home), one HUD line, then retires; in the save |
| Home base | `homebase.gd` | build board: walls I-III (thin metaworld raids), garage, kennel, workbench, bed |
| RV / camp | `camp.gd` + `character.hunger` | camper rigs grow a camp kit (bed/stove/light); hunger drains on the clock, food_val feeds |
| Metaworld | `metaworld.gd` | off-screen records (dogs) roll raids vs walls; come_home narratives |
| Respect | `respect.gd` | per-faction/state ledger → prices, standing, refusals, market growth |
| Character | `character.gd` | 10 skills level-by-doing; 6-part paper-doll; hp cap; wound taxes |
| Save/load | `save_game()` (F5/F9) | one file: player/dogs/ring/home/ledger/clock/circuit/objectives/deaths |
| Death | `respawn_at_home()` | going down is NOT permadeath (that's the dogs): wake at the safehouse mended, world persists, wasteland takes a cut of scrap/scrip, rig left where it fell; R respawns; deaths counter |
| Multiplayer | `net.gd` (F7/F8) | ENet co-op: remote players+VEHICLES sync (client-authoritative 20Hz, seq-interpolated), HOST-authoritative enemies (clients ghost, suppress own sim); net_loopback.sh live proof |
| Co-op/PvP pass | `net.gd` + `proto3d.gd` | partner NAME TAGS + follow-arrow waypoint, respawn-at-partner, co-op bed rig, net horn pings; F6 peace/duel/ffa, SAFEHOUSE BUBBLE, victim-authoritative PvP damage, kill toast + session bounty on the tag |
| The moveset | `player_3d.gd`, `weapon.gd` | CTRL crouch/slide (noise ×0.55, low capsule); fists/shove WEAPON ROWS + MARTIAL ARTS skill; sprint-tackle knockdown; hold-E drag; auto wade/swim/drown off the real map |
| Dog verbs | `dog.gd`, `buried_cache.gd` | auto-JUMP (fences/gaps, leap row), POUNCE on SIC, Hunter DIG on ProtoBuriedCache → loot_tables |
| Media layer | `media_registry.gd` `tv.gd` `media_panel.gd` `drive_in.gd` `media_pickup.gd` `public_screen.gd` `newsroom.gd` `music.gd` | docs/cinema.md COMPLETE: manifest rows → safehouse TV (time passes, save persists) · drive-in (trailers→feature) · found_* pickups · channel-row public screens + event-clip preempts · Newsroom (takeover→TV, bounty→radio) · radio mp3 music stations |
| Scout drone | `drone.gd`, `drone_dock.gd` | safehouse dock → ROUTE SCOUT flies your course (body stays home), 🛸 map marks, returns/recharges, shoot-down-able; AI-collapse boot line |
| Input map | `input_map.gd`, `controls_panel.gd` + `data/input_bindings.json` | every verb = an ACTION row (key+mouse+pad on one action); twin-stick pad driver (right stick → aim_override, trigger job-swap at the wheel, rumble); F11 press-to-capture rebinds persist to user:// |
| Audio/VO | `audio.gd` + `tools/soundforge/` | 57 SFX + 11 TTS lines in 4 LOCKED voices (`voices.json` — never change a voice_id) |

## 🛠 The tool suite (the strategy: models/humans tune content, never code)

- **VehicleForge** `node tools/vehicleforge/server.mjs` (:8898) — fleet editor, armor-forward, TEST DRIVE, best-lap compare
- **MapForge v3** `node tools/mapforge/server.mjs` (:8899) — biomes, roads (character-preserving edits), **EXIT NODES** (spec §5: click-to-place w/ archetype+tier, auto off/return ramps, per-highway numbering, canvas diamonds + list), **STRUCTURE CATALOG** (spec §7 rows, §9 JOB-rule validation — created ≠ placed), authored placements, town templates
- **SoundForge** `tools/soundforge/` — `generate.mjs` (ElevenLabs SFX), `voices.mjs` (TTS, consistent voices)
- **MotionForge** `node tools/motionforge/server.mjs` (:8896) — procedural-motion ROWS (`data/motions.json` overlays code stock), sliders + describe-it NL endpoint; treadmill stage `res://proto3d/tools/motion_stage.tscn`
- **MediaForge** `node tools/mediaforge/server.mjs` (:8897; `npm i` once for ffmpeg-static) — drop MP4s → Theora .ogv + poster + runtime → manifest ROW; test-reel/test-music generators; music mp3 shelves in `game/media/music/`
- **Proving Grounds** `res://proto3d/track/track.tscn` — lap timing, ghosts, chase-AI testbed
- **Data spine** — `Drivn*` schemas (`game/proto3d/data/`), JSON→.tres stamper, `reload_content()` live re-fold (F10 FORGE)

## ✅ Testing (the iron rule)

**Headless sims must exercise the REAL path — inputs, never teleports** (staging positions is the documented exception).
60 sims + net_loopback.sh (full suite green). Run one:
```
Godot_console --headless --path game res://proto3d/tests/<name>.tscn
```
Key sims: `world_sim`, `threat_sim`, `spine_sim`, `signature_sim`, `crew_sim`, `homebase_sim`, `npc_drive_sim`, `carousel_sim`, `carousel2_sim`, `pvp_prep_sim`, `save_sim`, `garage_sim`, `rv_camp_sim`, `visibility_sim`, `data_sim`, `track_sim` — plus the 2026-07-06 arc: `crouch_sim`, `unarmed_sim`, `drag_sim`, `water_sim`, `dogverb_sim`, `motion_sim`, `media_registry_sim`, `tv_sim`, `unlock_media_sim`, `drive_in_sim`, `news_media_sim`, `music_sim`, `drone_scout_sim`, `coop_fun_sim`.

### Paid-for gotchas (do not re-pay)
- New `class_name` scripts need `--headless --path game --import` before headless runs.
- `get_tree().current_scene` is the SIM in harnesses — fall back to `get_parent()` for main.
- First headless frame can be >100 ms; tweens run on real frames; input events need several `process_frame`s to land; give every main-scene sim a WATCHDOG timer.
- Cinematics/sims must restore the PREVIOUS `Engine.time_scale`, never blindly 1.0.
- `take_wound` drains core hp too — top hp between staged wounds or the character dies mid-test.
- Chassis-critical + breached tank = fire spiral — separate damage phases in tests.
- Positive `engine_force` pushes +Z (forward is negative). Wheel damping k*2*sqrt(stiffness).
- Kill zombie `*_console.exe` processes if a headless run hangs a port/lock.
- `DataVehicle`/`DataItem` class names are TAKEN by legacy 2D code — the spine uses `Drivn*`.
- Dictionary element access needs explicit types (`var x: float = dict["k"]`) or the parser fails.
- Retargeting a group (e.g. `threat`→`combatant`) can orphan test dummies — melee scans the UNION so any hostile is meleeable however tagged.

## 📏 House rules

- Data-driven everything: new vehicle/item/NPC/base/upgrade = a ROW.
- Signals over coupling; components over inheritance; `Damageable` is the one damage class.
- Every feature lands with a sim; every bug fix leaves a regression check.
- Commit after every feature (`.claude/rules/git-workflow.md`); push to origin main.
- Surface every system: if the player can't see it, it doesn't exist (sheet K / HUD / prompts).
- No purple. Ever.

## 📚 Doc map

- `docs/ENGINE.md` — master spec · `docs/STAGES.md` — roadmap · `docs/MASTER_PLAN.md` — the toolification plan (done)
- `docs/DIVIDED_STATES.md` — lore bible (rulers, THE CAROUSEL) · `docs/WORLD_PILLARS.md` — the five world pillars + eight laws (what the game is ABOUT; P3 = Pillars 1+2+5, road rows first) · `docs/CAROUSEL.md` + `docs/RV_PLAN.md` — next big builds
- `docs/systems/*` — per-system design · `docs/legacy-2d/` — the old 2D game's docs · `docs/setup/` — MCP/editor setup
