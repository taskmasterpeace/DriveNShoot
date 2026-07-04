# DRIVN — Build Playbook (the loop's operating manual)

**Purpose:** lets a /goal loop work for hours uninterrupted without drifting from the vision.
**Read order at session start:** `CLAUDE.md` (pivot block) → this file → `STAGES.md` → the stage's
deep-dive doc. **Created:** 2026-07-04.

---

## 1. The document map (what governs what)

| Doc | Governs |
|---|---|
| `STAGES.md` ⭐ | build ORDER — beginning→end master map |
| `DESIGN_PILLARS.md` | tiebreaker — when designs compete, more pillars wins |
| `ENGINE.md` | the 8 engine pillars + milestone acceptance |
| `loops/LOOP2_LIVING_CAR.md` | Stage 2 deep-dive (car damage/HUD/arsenal) |
| `systems/INTERFACE_AND_BODY.md` | UI, body/injury, inventory, nav, SecondaryView, aim-cone |
| `systems/COMBAT_AND_GEAR.md` | melee/ranged/throwables/car weapons/loadout |
| `systems/EQUIPMENT_PAPERDOLL.md` | the 19-slot wearable item DB (verbatim user design) |
| `systems/DOGS.md` | dog types/breeds/stress-morale |
| `systems/WORLD_NPCS.md` | PCAS living world, factions, Respect Ledger |
| `systems/TRAVEL_AND_NETCODE.md` | 24× scale, travel modes, MP architecture |
| `systems/CONTENT_PIPELINE.md` | bulk-content: data stamper → AI rows → WFC towns |
| `PROGRESSION.md` | skills/attributes/robotics/taming/farming |

## 2. The iteration protocol (every unit of work)
1. **Pick** the next item: current stage in `STAGES.md` → its deep-dive's acceptance list.
2. **Build** in `game/proto3d/` (until Stage-5 restructure) following `.claude/rules/*`:
   static typing, tabs, data-driven values, signals not UI-reach-ins.
3. **Prove headless** — a sim in `proto3d/tests/` that presses INPUTS (iron rule: no teleporting
   past the mechanic under test; positioning teleports allowed).
4. **Regress**: `drive_sim` + `m1_sim` + `dog_sim` + `walkthrough_sim` must stay green.
   New `class_name`s need `--headless --path game --import` first.
5. **Commit + push** (conventional message; no Co-Authored-By). Never >30 min uncommitted.
6. **Surface**: update `FEATURES.md` (player-facing), the stage checklist in `STAGES.md`,
   and the bug ledger (§4). Launch + screenshot at hand-off points.

## 3. Verification commands
```
IMPORT:  <godot-console> --headless --path game --import
SIMS:    <godot-console> --headless --path game res://proto3d/tests/<name>.tscn
         (drive_sim · walkthrough_sim · m1_sim · dog_sim — grep RESULTS/PASS/FAIL/SCRIPT ERROR)
BOOT:    <godot-console> --headless --path game res://proto3d/proto3d.tscn --quit-after 180
PLAY:    <godot> --path game res://proto3d/proto3d.tscn        (leave running for the user)
godot-console = C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64_console.exe
```

## 4. Bug ledger (append; strike when fixed + sim-covered)
1. ~~Stairs unclimbable~~ — fixed M1, walk-up sim-tested.
2. ~~World-edge fall~~ — fixed M1 (12 km + last-safe respawn); real fix = Stage 5 streaming.
3. ~~Binoculars snap~~ — fixed (eased view + wheel magnification).
4. ~~Wrong-side car exit~~ — fixed (driver's side).
5. ~~Handbrake 180-spin~~ — fixed 2026-07-04 (slide grip 1.1→2.4 + steer trim 0.55); drive_sim
   handbrake target: yaw 60–120° in 1.6 s, never flip.
6. Grip baseline: user says "slides a little too much" even after first raise — watch on next
   playtest; baseline is the number tire-damage modifies (LOOP2 §Handling baseline).

## 5. Feel targets (sim-checked numbers)
0-60: 3.0–5.5 s · top ~76 mph · 60-0: 40–50 m · steer @15 m/s: 90–130° in 2.5 s (no spin-out) ·
handbrake: 60–120° in 1.6 s (drift, not a 180) · flips: NEVER · stairs walkable · dive lunge >2 m.

## 6. Vision guardrails (drift check before each commit)
Gritty permadeath (PZ tone) · top-down 3D, readable at a glance · emoji/glyph HUD, amber/bone/
blood/rust, **no purple ever** · data-driven everything (adding content ≠ code) · multi-use
components (ask "what are its 3 uses?") · inputs-only sims · the drive is the game — never make
driving skippable-by-default · every activity feeds the Respect Ledger (Pillar 1) once factions land.

## 7. Current state pointer (update each session)
**2026-07-04:** Stage 0+1 SHIPPED (M1 21/21) · dogs live (11/11) + Stress vital · handbrake fixed
(102° drift, sim-proven) · **moodle corner live** (emoji ARE the meters — stamina/stress bars
deleted; `set_condition()` API for sick/drunk/high/hurt/cold/hungry) · NEXT: Stage 2 The Living
Car (`loops/LOOP2_LIVING_CAR.md` §8 acceptance) → then Stage 3 (Character/UI) per `STAGES.md`.
Sims now: drive · walkthrough · m1 · dog · moodle.
