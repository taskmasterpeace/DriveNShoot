# Combat Spectacles L3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one standalone, visible, nonlethal four-entrant shootout tournament with WATCH, honest BET, and player ENTER modes.

**Architecture:** A focused `ProtoLabSpectacle` owns seeded card/bracket/ticket/bankroll state and advances the existing `ProtoLabRound`. `ProtoLabOpponent` gains arbitrary scoring identities so the same real combat body supports AI-versus-AI and player-versus-AI. A separate CanvasLayer panel calls the runtime’s public operations and the main lab only adapts physical fighters/command suppression.

**Tech Stack:** Godot 4.5.1, typed GDScript 2.0, JSON data rows, existing `ProtoBetting`, `ProtoLabRound`, `ProtoLabOpponent`, `ProtoWeapon`, headless Godot sims.

## Global Constraints

- Standalone lab only; never read or write `user://drivn.save`.
- Four entrants; semifinal A, semifinal B, final; each bout first to two nonlethal rounds.
- WATCH and ENTER use real collision-active combat bodies, weapon rays, muzzle effects, and round damage.
- BET uses `ProtoBetting` unchanged, one pre-start ticket, integer stakes 10–250 in steps of 10.
- Lab bankroll starts at 1,000 credits and resets/disappears with the lab.
- Dogs and infected are rejected by row validation and runtime validation.
- Same card id, seed, and mode produces identical entrants, strengths, bracket, and equipment.
- No campaign calendar, scrip, law, crime, crowd, or save integration in L3.
- No sound asset or voice-id changes. No purple UI.

---

### Task 1: Spectacle row, validation, bracket, and betting state

**Files:**
- Create: `game/data/spectacles.json`
- Create: `game/proto3d/tools/physics_lab/lab_spectacle.gd`
- Create: `game/proto3d/tests/combat_spectacle_sim.gd`
- Create: `game/proto3d/tests/combat_spectacle_sim.tscn`

**Interfaces:**
- Consumes: `ProtoBetting.open_card/place/settle`, `ProtoLabRound` later through `setup()`.
- Produces: `ProtoLabSpectacle.setup(lab, card_id, seed)`, `select_mode`, `cycle_entrant`, `change_stake`, `place_bet`, `start_tournament`, `record_match_winner`, `reset_tournament`, `facts`, `readout`.

- [ ] **Step 1: Write the failing pure-state sim**

Create the sim with a 45-second watchdog. Assert the row loads exactly four unique entrants, is
nonlethal, has WATCH/BET/ENTER, known weapons/opponent rows, and no prohibited groups. Add invalid-row
fixtures in the test and call `validate_row(row)` for lethal, dog, infected, duplicate-id, bad weapon,
and three-entrant rejection. Assert same seed/mode produces identical bracket data.

```gdscript
var runtime := ProtoLabSpectacle.new()
add_child(runtime)
_check("valid seeded card", runtime.setup(null, "wasteland_shootout", 8401))
var opening := runtime.facts()
_check("four unique legal entrants", opening["entrants"].size() == 4
	and not runtime.validate_row(_dog_fixture())["ok"])
var twin := ProtoLabSpectacle.new()
add_child(twin)
twin.setup(null, "wasteland_shootout", 8401)
_check("same seed reproduces bracket", twin.facts()["matches"] == opening["matches"])
```

- [ ] **Step 2: Run RED**

Run:
`Godot_console --headless --path game res://proto3d/tests/combat_spectacle_sim.tscn`

Expected: parse/load failure because the runtime and row do not exist.

- [ ] **Step 3: Add the exact row and validator**

Create version-1 JSON with `wasteland_shootout`, four entrants (`ash`, `brick`, `vesper`, `half_stack`),
strengths, `duel`/`hunter` opponent rows, pistol/SMG/shotgun weapons, two arena spawns, spectator spawn,
stake 10/250/10, round health 100, two wins, and prohibited dog/infected groups.

In the runtime, load once from `res://data/spectacles.json`. `validate_row(row)` returns
`{ok: bool, error: String}` and checks every Global Constraint before state is mutated.

- [ ] **Step 4: Implement deterministic field, bracket, and bet operations**

Use the seed only to deterministically rotate the legal source entrants; never generate hidden
strength. Build matches:

```gdscript
matches = [
	{"id":"semi_a", "round":"SEMIFINAL", "left":ids[0], "right":ids[3], "winner":""},
	{"id":"semi_b", "round":"SEMIFINAL", "left":ids[1], "right":ids[2], "winner":""},
	{"id":"final", "round":"FINAL", "left":"", "right":"", "winner":""},
]
```

`select_mode("enter")` replaces seed 0 with a visible `player` entrant before any ticket/start.
`place_bet()` validates phase, entrant, one-ticket rule, stake band/step/bankroll, deducts stake once,
and calls `ProtoBetting.place`. `record_match_winner(id)` accepts only the current pair, fills final
slots, settles the betting card once on the champion, and credits `paid` once.

- [ ] **Step 5: Extend GREEN state assertions**

Assert honest shares sum to 1, favorite/longshot order, stake/duplicate/late failures leave bankroll
unchanged, semifinal winners populate the final, invalid winner does not advance, champion settles
once, vig payout matches `ProtoBetting`, and reset returns exact opening bankroll/bracket.

- [ ] **Step 6: Run GREEN and betting regression**

Run `combat_spectacle_sim` and `betting_sim`. Expected: both exit 0, zero engine errors/warnings.

- [ ] **Step 7: Commit**

```powershell
git add game/data/spectacles.json game/proto3d/tools/physics_lab/lab_spectacle.gd game/proto3d/tests/combat_spectacle_sim.*
git commit -m "feat: add combat spectacle bracket"
```

---

### Task 2: Arbitrary fighter identities and real WATCH combat

**Files:**
- Modify: `game/proto3d/tools/physics_lab/lab_opponent.gd`
- Modify: `game/proto3d/tools/physics_lab/lab_spectacle.gd`
- Modify: `game/proto3d/tools/physics_combat_lab.gd`
- Modify: `game/proto3d/tests/combat_spectacle_sim.gd`
- Modify: `game/proto3d/tests/sparring_sim.gd`

**Interfaces:**
- Produces: `ProtoLabOpponent.configure_identity(fighter_id, opponent_id)`.
- Produces: `ProtoPhysicsCombatLab.configure_spectacle_match(left, right, mode)` and `clear_spectacle_fighters()`.
- Consumes: Task 1 current match and `record_match_winner`.

- [ ] **Step 1: Extend RED with real WATCH assertions**

After `runtime.select_mode("watch")` and `start_tournament()`, assert two enabled
`ProtoLabOpponent` nodes exist, their bodies are collision-active, their fighter ids equal the current
bracket pair, their targets are reciprocal bodies, and their weapons match entrant rows. Emit real
body damage into the left fighter and assert only the left arbitrary round fighter loses health.

- [ ] **Step 2: Run RED**

Expected: only the existing hardcoded opponent/player identity exists.

- [ ] **Step 3: Generalize opponent scoring without breaking defaults**

Add:

```gdscript
var fighter_id: String = "opponent"
var opponent_id: String = "player"

func configure_identity(fighter: String, opponent: String) -> void:
	fighter_id = fighter
	opponent_id = opponent
```

Replace hardcoded ids in `_on_body_damaged` with those fields. Defaults preserve every L1 caller.

- [ ] **Step 4: Add the lab physical-match adapter**

WATCH clears old temporary scenario fighters, configures `lab_round` with the bracket pair, reuses the
primary opponent for left, spawns one extra opponent for right, assigns reciprocal target bodies,
sets both to authored behavior/weapon, stores spawn metadata at the Killhouse, and moves the player to
the spectator transform. Register the extra in `scenario_opponents` so existing reset/cleanup owns it.

Expose `spectacle_fighter_count()` and `spectacle_facts()` for tests/HUD; do not inspect node names in
the panel.

- [ ] **Step 5: Connect physical match completion**

The runtime connects once to `lab.lab_round.match_ended`. Map the physical winner id to
`record_match_winner`, then defer `start_current_match()` until after the round signal returns. After
semifinal A, configure semifinal B; after semifinal B, configure the final; after final, clear
temporary fighters and leave the champion card visible.

- [ ] **Step 6: Run GREEN and L1 regressions**

Run `combat_spectacle_sim`, `sparring_sim`, `physics_lab_sim`, `lab_scenario_sim`, and `gunfeel_sim`.

- [ ] **Step 7: Commit**

```powershell
git add game/proto3d/tools/physics_lab/lab_opponent.gd game/proto3d/tools/physics_lab/lab_spectacle.gd game/proto3d/tools/physics_combat_lab.gd game/proto3d/tests/combat_spectacle_sim.gd game/proto3d/tests/sparring_sim.gd
git commit -m "feat: add watchable combat spectacles"
```

---

### Task 3: Player ENTER path and exact tournament reset

**Files:**
- Modify: `game/proto3d/tools/physics_lab/lab_spectacle.gd`
- Modify: `game/proto3d/tools/physics_combat_lab.gd`
- Modify: `game/proto3d/tests/combat_spectacle_sim.gd`

**Interfaces:**
- Consumes: `select_mode("enter")` field containing `player`.
- Produces: player/attacker round identity fields in the lab and exact reset/cleanup.

- [ ] **Step 1: Extend RED for ENTER**

Reset, select ENTER, capture the current adapter/body id/mode/surface/condition, and start. Assert the
first seed is `player`, exactly one AI targets the existing player body, no replacement player is
spawned, mode/surface/condition are unchanged, and the round ids are `player` plus the bracket rival.
Drive `lab._on_player_damaged(8)` and the rival body damage signal; assert each arbitrary fighter loses
the correct nonlethal health. Force two player round wins and assert bracket advancement without death.

- [ ] **Step 2: Run RED**

Expected: player damage still assumes hardcoded `opponent` and no ENTER configuration exists.

- [ ] **Step 3: Generalize player round identity**

Add `_player_round_id` and `_player_attacker_id`, default `player`/`opponent`. Set them per ENTER match,
and use them in `_on_player_damaged`. WATCH restores defaults and suppresses player commands without
disabling the rendered spectator body.

- [ ] **Step 4: Implement reset ownership**

`reset_tournament()` calls lab cleanup, restores default round identities, deterministic card/field,
bankroll 1000, stake minimum, no ticket/champion, no extra AI, and the opening player transform. It
does not write disk or change `Engine.time_scale`.

- [ ] **Step 5: Run GREEN plus body modes**

Run `combat_spectacle_sim`, `body_compare_sim`, `sparring_sim`, and `physics_lab_sim`.

- [ ] **Step 6: Commit**

```powershell
git add game/proto3d/tools/physics_lab/lab_spectacle.gd game/proto3d/tools/physics_combat_lab.gd game/proto3d/tests/combat_spectacle_sim.gd
git commit -m "feat: let players enter combat spectacles"
```

---

### Task 4: Spectacles panel, controls, and broadcast presentation

**Files:**
- Create: `game/proto3d/tools/physics_lab/lab_spectacle_panel.gd`
- Modify: `game/proto3d/tools/physics_combat_lab.gd`
- Modify: `game/proto3d/tools/physics_lab/lab_hud.gd`
- Modify: `game/proto3d/tests/combat_spectacle_sim.gd`
- Modify: `docs/PHYSICS_LAB_PLAYTEST.md`

**Interfaces:**
- Consumes runtime public operations/facts only.
- Produces `setup(runtime)`, `toggle`, `open`, `close`, `is_open`, `refresh`, `panel_facts`.

- [ ] **Step 1: Extend RED UI assertions**

Assert `J` opens the panel; readout contains event, venue, WATCH/BET/ENTER, four names, strengths,
odds, weapons, stake, bankroll, bracket, health/round, ticket/payout/status. Simulate `1`, `2`, arrows,
`B`, and Enter events and assert the same runtime mutations as buttons. While open, feed movement/fire
commands and assert the body/ammo stay unchanged; `Engine.time_scale` stays exact.

- [ ] **Step 2: Run RED**

Expected: panel and J controls do not exist.

- [ ] **Step 3: Build the panel**

Use a dark brown/black translucent panel, amber event/bracket headers, teal selected mode, bone text,
10 px corners, bordered cards, and hoverable real Buttons. No purple. Keep the large panel under 760 ×
650 at 1400 × 900 and a compact top-center strip under 720 × 90 during active bouts.

Buttons call only runtime methods. `refresh(facts)` is event-driven from runtime `changed`; no per-frame
tree or entrant scanning.

- [ ] **Step 4: Integrate input and command suppression**

Preload/create runtime and panel in `_ready`. `J` toggles. When open, replace the sampled lab command
with an aim-only empty command, as Verdict/Calibration already do. Panel `_unhandled_input` consumes
its exact parity keys. Active WATCH also suppresses player movement/fire while the panel is closed.

- [ ] **Step 5: Visible QA**

Launch `PHYSICS_LAB.bat`. Capture WATCH semifinal/final and ENTER views in day/night with the Camera
Truth Wall. Verify names do not overlap fighters, bracket/readout is legible at gameplay distance,
muzzle flashes are visible, and closing the panel exposes the full fight.

- [ ] **Step 6: Run GREEN**

Run `combat_spectacle_sim`, `physics_lab_sim`, `lab_scenario_sim`, `weapon_radial_sim`, and
`automatic_fire_sim`.

- [ ] **Step 7: Commit**

```powershell
git add game/proto3d/tools/physics_lab/lab_spectacle_panel.gd game/proto3d/tools/physics_combat_lab.gd game/proto3d/tools/physics_lab/lab_hud.gd game/proto3d/tests/combat_spectacle_sim.gd docs/PHYSICS_LAB_PLAYTEST.md
git commit -m "feat: add spectacles tournament panel"
```

---

### Task 5: L3 integration, performance, documentation, and review

**Files:**
- Modify: `game/proto3d/tools/physics_lab/lab_spectacle.gd`
- Modify: `game/proto3d/tests/combat_spectacle_sim.gd`
- Modify: `docs/design/PHYSICS_COMBAT_LAB.md`
- Modify: `docs/PHYSICS_LAB_PLAYTEST.md`

**Interfaces:**
- Produces the complete L3 milestone; L4 may consume `facts().champion` and the settled ticket only.

- [ ] **Step 1: Add final isolation/performance assertions**

Record campaign save existence/timestamp and prior time scale before lab boot. Run/reset two complete
tournaments and assert no save mutation, no corpse/dead character, bounded two AI max, temporary body
count returns to zero, odds/bracket reads allocate no nodes during idle, and time scale restores on exit.

- [ ] **Step 2: Update docs**

Set design status to `L1–L3 SHIPPED · L4 PLANNED`. Document panel/keyboard controls, WATCH visual
acceptance, lab-credit BET math, ENTER/nonlethal reset, same-seed repeatability, dog/infected law, and
the campaign boundary.

- [ ] **Step 3: Full verification**

Run `combat_spectacle_sim`, `betting_sim`, `sparring_sim`, `physics_lab_sim`, `lab_scenario_sim`,
`body_compare_sim`, `gunfeel_sim`, `automatic_fire_sim`, `muzzle_visibility_sim`, `weapon_radial_sim`,
`save_sim`, and `stage4_sim` alone. Require exit 0 and zero engine errors/warnings; rerun any known
timing flake alone. Run `git diff --check`, untracked artifact scan, and debug-marker scan.

- [ ] **Step 4: Independent review**

Request a read-only review against this plan. Fix every Critical/Important item, add a regression, and
rerun affected suites. Re-review until Ready: Yes.

- [ ] **Step 5: Commit**

```powershell
git add game/proto3d/tools/physics_lab/lab_spectacle.gd game/proto3d/tests/combat_spectacle_sim.gd docs/design/PHYSICS_COMBAT_LAB.md docs/PHYSICS_LAB_PLAYTEST.md
git commit -m "feat: complete combat spectacles l3"
```

---

## Plan self-review

- **Spec coverage:** Task 1 covers row/bracket/bet; Task 2 real WATCH; Task 3 ENTER/reset; Task 4
  panel/controls/visible broadcast; Task 5 isolation/performance/docs/review.
- **Placeholder scan:** no TBD/TODO, unnamed error handling, or deferred test steps.
- **Type consistency:** runtime operations and lab adapter names are defined once and consumed by later
  tasks unchanged; opponent identity defaults preserve L1.
- **Scope:** one shootout card proves the runtime. Campaign venues and BACKROOMS remain separate slices.

## Execution handoff

Execute inline in this session with `superpowers:executing-plans`, per the owner’s standing instruction
to build the approved full lab. Stop at each commit for focused verification and use the final review
gate before beginning L4.
