# PLAYTEST SPEC — 2026-07-10

**Source:** Robert's live playtest, 2026-07-10 (shotgun/lurker fight, drone flight, building tour, drive w/ waypoint, fell through the ground).
**What this is:** every issue from the session root-caused against the actual code where possible, prioritized, effort-tagged — plus the requested assessment of the outside consultant's 9-item list against what already exists. Same format as the 2026-07-09 fix spec (which closed 15/18).

**Tags:** P0 broken-core · P1 core verb wrong · P2 surfacing/QoL · P3 arc-sized. ⚡ quick · 🔧 medium · 🏗 deep.

---

## A. THE BUGS (this session)

### A1. Dead lurker doesn't fall — "he doesn't look dead" **P0 ⚡ ROOT-CAUSED**
The 0.11 BODY LAW passes the lurker's own rig to the corpse — but the biped puppet's sprawl (`puppet.gd:1015 _pose_dead`) lerps every joint by `_dead_blend`, which only the puppet's own death-animation loop ramps. The corpse adopter calls it once at blend **0.0** → every lerp is a no-op → the body stands frozen upright. (The quadruped's `pose_dead` sets values directly — that's why animal carcasses read fine.)
**Fix:** in `corpse.gd _adopt_rig`, set `rig._dead_blend = 1.0` before the `_pose_dead` call. One line. Applies to lurker, companion, infected corpses.
**Sim:** corpse-rig check grows "the biped corpse SPRAWLS (torso rotated)".

### A2. Drone: "goes out, can't control it, can't deploy again" **P0 🔧**
Headless sims prove deploy→pilot→recall→land-as-pickup — but the live session says the stick is dead in real play. Suspects, in order: (1) the pilot's input path needs mouse-capture/focus the sim never exercises; (2) after one flight the REMOTE pairing folds and the landed pickup isn't findable/grabbable in the field ("can't deploy again" = the item never made it back to the pack); (3) the split-view opens but input routes to the body.
**Fix path:** reproduce windowed (not headless), instrument `drone_pilot.pilot_input` + the remote/pickup chain, then close the real-input gap. The 2026-07-09 lesson stands: *green director-sims ≠ walkable player verbs* — this needs a windowed acceptance pass, not another headless sim.

### A3. Fell through the ground (again) **P1 🔧 — log lost, report hardened**
The VOIDNET self-report fired (your toast: "the ground gave way — hauled back") and printed the full forensic line (position, chunk, loaded-state, child-count, speed, mode) to stdout — but Godot keeps only 5 rotated logs and the sim suite's boots consumed all 5 slots within seconds. Same loss as 2026-07-08.
**Fix:** (1) VOIDNET appends to its own `user://voidnet.log` (survives rotation, forever); (2) next fall = full diagnosis from that file. Until a repro: no guess-fixes.

### A4. Headlights — "you'd think L would do it, but it changes the radio" **P1 ⚡**
A bind expectation collision on L. Today: L3/pad has horn duties, radio owns its keys, headlights are automatic-at-dark only (`life_sim` proves auto-on). There is **no manual headlight toggle at all** — that's the real gap (light discipline is also consultant item 3's fuel: headlights OFF should matter to stealth).
**Fix:** add a `drivn_headlights` action row (suggest L), manual override cycle AUTO→ON→OFF, and move/confirm radio keys don't collide. Rows only + one toggle branch.

### A5. HUD hood — "everything is bunched up" **P1 (owner's pixel-HUD lane — coordinate, don't collide)**
Confirmed from the screenshot: speedo + heart/health plate + ammo plate + tach all overlap the hood art bottom-left. This is layout in the NEW pixel HUD arc (your commits: plates system 1/6, GPS 2/6). Flagging with measurements rather than editing your lane: the health/ammo plate cluster and the gauge cluster claim the same anchor region; the tach floats mid-right detached from the cluster.
**Suggest:** one shared bottom-left layout table (gauge row y, plate row y-offset above it) so the six-system wire-up lands on a grid instead of per-system absolute offsets.

### A6. The loud high-pitched noise **P1 ⚡ diagnosis-first**
Prime suspect: the engine hum loop's pitch scale — `proto3d.gd:1380` runs it to **2.25×** at top speed, and on the current mp3 that reads as a squeal, not a rev. Second suspect: a synth-fallback SFX (square-wave tails). 
**Fix:** cap hum pitch ~1.6 + re-cut the engine loop through SoundForge; A/B in a windowed run.

### A7. Shotgun: sounds horrible, feel is off, ammo drains too fast **P1 ⚡ data**
Three knobs, all rows: (1) the shotgun SFX is a synth fallback if no mp3 shipped — cut a real one via SoundForge (see D2 — you can also drop in your own); (2) feel = recoil/screen-kick rows already exist from the recoil-as-data work; (3) ammo economy = loot-table weights (shells are rare relative to the 6-shot mag). Balance pass with explicit before/after numbers.

### A8. Compass/waypoint reads wrong driving away **P2 ⚡**
The edge-pinned waypoint arrow + compass ribbon disagree when the target is behind you — the arrow pins to a screen edge that reads ambiguous at reverse headings.
**Fix:** behind-you states get an explicit ↓/turn-back read on the ribbon (bearing delta > 120° → "BEHIND" chip), and the pinned arrow gets a distance+name tag.

### A9. Raiders don't fight — "they show up but won't get out" **P1 🏗 = the ENEMY ROLES arc (consultant #6)**
True and root-known: convoy/bandit NPCs have driver brains and checkpoint scripts, but no **dismount-and-fight** behavior — the only real infantry threats are howlers/lurkers/infected. This is the consultant's "enemy roles" item and it's the right next combat arc: bandits need DISMOUNT → take-cover → role pressure (rusher/flanker/suppressor — mirror the howler circler/charger/screamer pattern that already works).

### A10. Dive feels wrong / wrong button **P2 ⚡**
Dive lives on SPACE (shared with handbrake context). Revisit the bind + the lunge feel numbers (m1 proves 5.9 m lunge mechanically; the FEEL is the complaint). Needs your word on which button.

### A11. Camera — a real third-person chase view **P2 🔧**
V cycles views today; the ask is a persistent behind-the-shoulder chase cam as a first-class mode alongside top-down. The camera rig already supports offsets/zoom states — this is a new rig mode + input polish, not a rebuild.

### A12. Crew should board vehicles/bikes with you **P2 🔧**
Companions ride cars via seat anchors (Sam fires from the truck bed — sim-proven) but don't AUTO-BOARD when you mount, and bikes have no pillion anchor. Fix: follow-state companions board on your mount (nearest free seat), bike gains a pillion seat row.

---

## B. THE STRUCTURE PROBLEM — "I need to test stuff faster"

This was the session's loudest theme and it's structural, not a bug:

### B1. ⚒ THE PROVING GROUNDS EXPANSION **P1 🔧 — the danger room + the racetrack**
TEST GROUNDS already consolidated the motor pool/armory/range. What it's missing is exactly what you named:
- **THE DANGER ROOM** — a fenced arena on the grounds with a LEVER: pull → pick a wave row (howler pack / lurker squad / bandit fireteam / the Knifeback) → they spawn INSIDE the fence and fight for real. Wave rows are data; the fence keeps the town clean; a second lever clears.
- **THE RACE LOOP** — a marked circuit (start gate + checkpoint waypoints) anchored at the grandstand, wired to the EXISTING race_controller/betting engine so the grandstand finally *does something you can see*. Map waypoints per lap leg.
- **GOD SHELF** — the armory gains one chest with every weapon + full ammo (the F10 GIVE-arsenal already exists; this makes it a walk-up shelf, no dev panel).
All three live inside the existing grounds so the walk between tests is seconds.

### B2. Buildings — "why do we have these? what do I do here?" **P1 🔧 surfacing**
Every catalog row carries jobs/loot/hooks by law (§9 multi-use), but the player can't SEE any of it — a jeweler is a case you open once, a grandstand is a shape. Fix in two cheap layers:
1. **The sign says the verb**: signs gain a second line from the row — "💰 LOOT: jewelry · 👥 fence NPC" / "🏁 RACE: E at the board".
2. **A TESTING LEDGER page** (M-map tab or a board at TEST GROUNDS): every testable system, its location, its DO→EXPECT line — generated from data so it can't go stale.

### B3. Meridian map — "just a straight line" **P2 🔧**
The Meridian local map read is thin. Tie to the GPS arc you're building (state zoom shipped): the local view needs the town's streets/placements painted, not just the interstate spine.

---

## C. MY ASSESSMENT OF THE CONSULTANT'S 9

Honest scoring against what exists. Verdicts: **BUILD** (agree, new), **WIRE** (agree, mostly exists — surface/extend it), **COUNTER** (right instinct, wrong shape).

| # | Item | Verdict | The truth on the ground |
|---|---|---|---|
| 1 | Vehicle armor/mod system | **BUILD** — agree, and it's the car-identity play | VehicleForge edits stats; 5-part damage exists. Missing: player-facing MOD slots (armor/ram/tires/engine as loot-able rows fitted at the garage). Strong pick — it makes every scavenged rig yours. |
| 2 | Armor paperdoll | **BUILD (cheap)** | The 6-part body paperdoll + wound taxes already exist; armor = per-part items that eat damage first. Natural, data-driven, ~1 arc. |
| 3 | Sound/light AI response | **WIRE** — half of it shipped this week | The noise bus is live: gunshots/engines/horns are events; howlers investigate; the ecosystem hears (the apex widens its ground on your racket, birds scatter on gunfire). Missing: RAIDER ears + a light layer (headlights/flares reveal you — pairs with A4's manual toggle). Extend, don't build. |
| 4 | Faction heat system | **WIRE** | respect.gd (per-faction/state ledger → prices/refusals/bounty-hunters) has existed for weeks, and the LOOT/WANTED spec is banked. What's missing is heat DECAY + visible consequences surfacing. Execute the existing spec before inventing a new one. |
| 5 | Field deployables | **WIRE + extend** | Mines, motion sensors, surveillance cams are shipped, sim-proven items. Missing: a placement UX pass + 2-3 more shapes (barricade, noisemaker lure — the bait-meat verb from this week is already one). |
| 6 | Enemy roles | **BUILD** — the single rightest item | = A9. Howlers already prove the pattern (circler/charger/screamer). Bandits need dismount + the same role treatment. This is why combat "isn't a thing" yet. |
| 7 | Voxel destruction | **COUNTER** | We are not a voxel game — box-rig + data rows are the identity, and a voxel art pipeline is a rebuild. The right-shaped version of the instinct: **breachable structure parts as rows** (walls take damage → hole → new entry path; cover degrades under fire). Destruction tied to gameplay: yes. Voxels: no. |
| 8 | Dog command system | **WIRE — it exists, you've never seen it** | C whistle ladder shipped: ×1 heel · ×2 guard · ×3 seek · hold = SIC · ×4 shield, plus auto-jump, pounce, Hunter dig, the horn recall. This is a pure surfacing failure — it needs the key-hint line, a book row, and one TEST GROUNDS station. |
| 9 | Mission templates | **BUILD** — the glue | Agree completely, and it answers B2: the FIRST RUN retires and nothing hands you reasons after it. Mission rows (radio contracts: deliver/clear/escort/race) make buildings, factions, heat, and combat collide on purpose. Should ride the radio + the atlas. |

**Recommended order:** A1/A3/A4/A6/A7 quick bugs → B1 Proving-Grounds expansion (danger room + race loop unblocks ALL future testing) → #6 enemy roles (A9) → #1 vehicle mods + #2 armor paperdoll → #9 mission templates → #3/#4/#5 wiring passes alongside.

---

## D. SELF-SERVE NOTES

### D1. God mode / weapons
F10 → GIVE → arsenal already stocks everything; B1's god shelf makes it diegetic.

### D2. "I thought I could make the sounds myself and upload"
You can — that's SoundForge. Two lanes, both live today:
- **Drop-in:** put any mp3 at `game/assets/sfx/<sound_id>.mp3` (e.g. `shotgun.mp3`) — the audio layer loads files OVER synth automatically; a new id needs only a file, never code. Restart or F10-reload.
- **Generate:** `node tools/soundforge/generate.mjs` cuts ElevenLabs SFX from a text prompt into the same folder.
The shotgun/engine sounds you hate are the synth fallbacks — replace the files and they're gone.

---

## E. STATUS LEDGER (filled as items land)

| id | item | status |
|----|------|--------|
| A1 | Lurker corpse sprawl (`_dead_blend`) | ROOT-CAUSED — fix queued behind the clean suite run |
| A3 | VOIDNET persistent log | queued (same batch) |
| A2/A4–A12, B1–B3 | — | OPEN |
