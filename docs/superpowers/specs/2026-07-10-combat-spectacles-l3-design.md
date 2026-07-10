# Combat Spectacles L3 Design

**Status:** Approved for implementation from the owner’s standing “build all of it” direction and
the accepted `PHYSICS_COMBAT_LAB.md` L3 contract. **Date:** 2026-07-10.

## 1. Outcome

Add one complete, repeatable combat Spectacle to the standalone Physics & Combat Lab. The player can
WATCH a visible AI-versus-AI tournament, BET lab credits through the existing honest odds/vig law,
or ENTER with the currently selected lab body. Every bout is nonlethal and uses real lab combat,
weapons, muzzle effects, cover, health, round cards, and resets.

This slice proves the reusable Spectacle runtime and shootout card. It does not implement every race,
derby, pit, beast, drone, calendar, law, or campaign venue from `docs/design/SPECTACLES.md`.

## 2. Approaches considered

1. **Reuse the real lab round and combat bodies — selected.** Extend `ProtoLabOpponent` with explicit
   fighter/opponent ids, then run the existing `ProtoLabRound` with either two AI bodies or the player
   and one AI. This gives honest visible fights and keeps nonlethal/save-isolated laws in one place.
2. **Abstract deterministic scoreboard.** Cheap and easy to test, but WATCH would be fake and would
   not exercise grip, aim, cover, automatic weapons, or muzzle presentation.
3. **Campaign venue first.** Correct eventual destination, but it couples calendar, law, scrip,
   navigation, crowds, and save migration before the combat event itself is proven.

## 3. Scope and immutable laws

- Standalone lab only; never read or write `user://drivn.save`.
- Lab bankroll starts at 1,000 test credits and disappears when the lab closes.
- Four entrants, seeded single-elimination: semifinal A, semifinal B, final.
- Each bout is first to two nonlethal rounds. Health depletion produces a card/reset, never a corpse.
- WATCH uses two real `ProtoLabOpponent` bodies targeting one another.
- ENTER replaces the first seed with `player`; the current F1/F2/F3 body, surface, and condition stay.
- BET is an action available before the bracket starts, not a mutually exclusive simulation mode.
- Odds, tickets, deterministic settlement, and 10% vig use `ProtoBetting` unchanged.
- Stakes are integers from 10–250 in steps of 10 and cannot exceed the lab bankroll.
- One ticket per bracket in L3. Invalid entrant, late bet, duplicate ticket, or unaffordable stake is
  rejected with a visible status and no bankroll mutation.
- Dogs and infected are forbidden by both row validation and runtime validation.
- Same card id + seed + mode produces the same field, strengths, bracket, and AI equipment.
- No sound assets or voice identities change.

## 4. Data contract

Create `game/data/spectacles.json` with version 1 and one `wasteland_shootout` row:

- `name`, `venue`, `kind`, `nonlethal`, `modes`;
- `round_health`, `rounds_to_win`, `stake_min`, `stake_max`, `stake_step`;
- four entrants with `id`, `name`, `strength`, `opponent_row`, and `weapon_id`;
- two spawn transforms and a spectator transform;
- `prohibited_groups: ["dog", "infected"]`;
- broadcast copy for semifinal/final/winner cards.

The runtime rejects malformed rows, fewer/more than four unique entrants, nonpositive strengths,
unknown opponent/weapon ids, lethal rows, or prohibited entrant groups. Unknown additive fields are
ignored.

## 5. Runtime boundaries

### `ProtoLabSpectacle`

A focused `Node` owns card selection, lab bankroll, selected entrant/stake, ticket, bracket matches,
champion, and current phase. Public operations:

- `setup(lab: Node3D, card_id: String, seed: int) -> bool`
- `select_mode(mode: String) -> bool`
- `cycle_entrant(step: int)`, `change_stake(step: int)`
- `place_bet() -> Dictionary`
- `start_tournament() -> bool`, `reset_tournament()`
- `facts() -> Dictionary`, `readout() -> String`

The bracket is plain data: `{round, left, right, winner, state}`. Starting a match calls one lab
adapter method with entrant rows. `ProtoLabRound.match_ended` advances the bracket. The final winner
settles the one `ProtoBetting` card exactly once, credits `ticket.paid`, and emits a champion card.

### Combat identity

`ProtoLabOpponent` gains `fighter_id` and `opponent_id`, defaulting to the existing
`opponent`/`player`. Damage events score those ids. Existing L1 callers remain source compatible.

The main lab gains `configure_spectacle_match(left, right, mode)` and
`clear_spectacle_fighters()`. WATCH reuses the primary opponent plus one temporary opponent, gives
them reciprocal targets, and moves the player to the spectator transform. ENTER uses the player and
primary opponent. Temporary fighters use the existing scenario-opponent cleanup/reset path.

## 6. Player flow and interface

Press `J` to open a polished amber/teal Spectacles panel. It shows:

- event/venue and WATCH · BET · ENTER law;
- four entrants, visible strengths, decimal odds, weapons, and bracket slots;
- selected mode, entrant, stake, bankroll, and ticket status;
- current semifinal/final, round score/health, winner, payout, and status message;
- buttons for WATCH, ENTER, previous/next entrant, stake −/+, BET, START/RESET, and CLOSE.

Opening the panel freezes lab movement/fire commands but does not change `Engine.time_scale`. Closing
it returns control. Once START is pressed, the compact bracket strip remains visible while the large
panel closes so WATCH and ENTER are playable. `J` can reopen it during a bout without resetting.

Keyboard parity while the panel is open: `1` WATCH, `2` ENTER, left/right entrant, down/up stake,
`B` BET, `Enter` START/RESET, `J/Escape` close. Mouse buttons expose the same runtime methods.

## 7. Error and reset behavior

- A bad card leaves Spectacles disabled and reports the row error; the rest of the lab still boots.
- A failed bet never deducts credits or creates a ticket.
- Closing the panel never abandons the tournament.
- Backspace resets the current physical bout but not the bracket or ticket.
- The panel’s RESET starts the same deterministic bracket from semifinal A, restores the 1,000-credit
  lab bankroll, clears the ticket/payout, and frees temporary AI bodies.
- Exiting the lab frees all temporary bodies and restores the prior time scale through the existing
  lab boundary.

## 8. Verification

`combat_spectacle_sim` must prove:

- valid data and rejection of dogs/infected/lethal/malformed cards;
- seeded four-entrant bracket and same-seed reproducibility;
- honest shares/odds, stake bounds, bankroll deduction, duplicate/late-bet rejection, vig payout;
- WATCH spawns two real collision-active AI bodies with reciprocal targets and real weapons;
- a real damage signal changes the correct arbitrary fighter id;
- two semifinal winners create the correct final; final settles exactly once;
- ENTER uses the current player body against one AI and remains nonlethal;
- panel controls/readout expose modes, odds, bracket, health, bankroll, ticket, and payout;
- reset frees temporary bodies and exactly restores deterministic state;
- campaign save timestamp and `Engine.time_scale` remain unchanged.

Run existing `sparring_sim`, `physics_lab_sim`, `lab_scenario_sim`, `betting_sim`, `gunfeel_sim`,
`automatic_fire_sim`, and `stage4_sim` as regressions. Perform visible QA in WATCH and ENTER modes at
day/night with the broadcast Camera Truth Wall.

## 9. Explicit non-goals

- No lethal bouts, permanent fighter records, campaign purses, crime/fixing resolution, or venue law.
- No races, derbies, beast pits, drone duels, dogs, or infected entrants.
- No campaign calendar/crowd/radio integration.
- No local two-player.
- No BACKROOMS ’84; that is L4 and consumes this runtime only after L3 is complete.

## 10. Self-review

- Placeholder scan: no TBD/TODO or deferred unnamed behavior.
- Consistency: BET is an action layered onto WATCH/ENTER; the bracket and settlement have one owner.
- Scope: one event card and one four-entrant tournament prove the runtime without campaign expansion.
- Ambiguity: reset, bankroll, ticket timing, nonlethal rules, ids, controls, and invalid rows are exact.
