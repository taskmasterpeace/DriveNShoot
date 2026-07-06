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
- **Legacy 2D game** (`game/scenes`, `game/entities`, …) is the systems donor — docs in `docs/legacy-2d/`. Don't build on it.

## 🕹 Controls (current)

WASD move · SHIFT sprint · SPACE dive/handbrake · **E interact** (in car: driver taps out; passenger taps out / **holds to take the wheel**) · **C whistle ×1 heel ×2 guard ×3 seek hold SIC ×4 SHIELD** · **Y radio scan** · TAB pack/trunk · **K character sheet** (narrates every system) · **M map/atlas** (Carousel layer) · T wait · B binoculars · V views · G grenade · R reload/restart · H horn · P pet · J character creation · F home beacon · N waypoints · **F5/F9 save · F7 host · F8 join** · **F10 DEV MODE** (time/teleport/spawn/give/heal + FORGE live-reload)

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
| Home base | `homebase.gd` | build board: walls I-III (thin metaworld raids), garage, kennel, workbench, bed |
| RV / camp | `camp.gd` + `character.hunger` | camper rigs grow a camp kit (bed/stove/light); hunger drains on the clock, food_val feeds |
| Metaworld | `metaworld.gd` | off-screen records (dogs) roll raids vs walls; come_home narratives |
| Respect | `respect.gd` | per-faction/state ledger → prices, standing, refusals, market growth |
| Character | `character.gd` | 10 skills level-by-doing; 6-part paper-doll; hp cap; wound taxes |
| Save/load | `save_game()` (F5/F9) | one file: player/dogs/ring/home/ledger/clock/circuit |
| Multiplayer | `net.gd` (F7 host/F8 join) | ENet co-op: remote players are real combatants, client-authoritative state sync ~20Hz; net_loopback.sh = live 2-process proof |
| Audio/VO | `audio.gd` + `tools/soundforge/` | 57 SFX + 11 TTS lines in 4 LOCKED voices (`voices.json` — never change a voice_id) |

## 🛠 The tool suite (the strategy: models/humans tune content, never code)

- **VehicleForge** `node tools/vehicleforge/server.mjs` (:8898) — fleet editor, armor-forward, TEST DRIVE, best-lap compare
- **MapForge v2** `node tools/mapforge/server.mjs` (:8899) — biomes, roads, EXITS, authored placements, town templates
- **SoundForge** `tools/soundforge/` — `generate.mjs` (ElevenLabs SFX), `voices.mjs` (TTS, consistent voices)
- **Proving Grounds** `res://proto3d/track/track.tscn` — lap timing, ghosts, chase-AI testbed
- **Data spine** — `Drivn*` schemas (`game/proto3d/data/`), JSON→.tres stamper, `reload_content()` live re-fold (F10 FORGE)

## ✅ Testing (the iron rule)

**Headless sims must exercise the REAL path — inputs, never teleports** (staging positions is the documented exception).
60 sims + net_loopback.sh (full suite green). Run one:
```
Godot_console --headless --path game res://proto3d/tests/<name>.tscn
```
Key sims: `world_sim`, `threat_sim`, `spine_sim`, `signature_sim`, `crew_sim`, `homebase_sim`, `npc_drive_sim`, `carousel_sim`, `carousel2_sim`, `pvp_prep_sim`, `save_sim`, `garage_sim`, `rv_camp_sim`, `visibility_sim`, `data_sim`, `track_sim`.

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
- `docs/DIVIDED_STATES.md` — lore bible (rulers, THE CAROUSEL) · `docs/CAROUSEL.md` + `docs/RV_PLAN.md` — next big builds
- `docs/systems/*` — per-system design · `docs/legacy-2d/` — the old 2D game's docs · `docs/setup/` — MCP/editor setup
