# WEB_FIRST_MINUTE — the start: where you are, a house, a door, a goal

**Status:** the small part is BUILT 2026-11-12 on `feat/web-zed-start` (stacked on `feat/web-zed-interiors`). The
threat within the first minute is a PROPOSAL (§5): it changes what Meridian is, so it is Robert's call.
**Code:** rows `web/src/data/firstminute.js` (`FIRST_MINUTE`, `validateFirstMinute`); the rule in
`web/src/systems/regions.js` (`armFirstMinute`, `firstMinute`, `firstMinuteDoor`, `stepFirstMinute`); hooks in
`web/src/main.js` (the title's PLAY arms it; the taught door gets E) and `web/src/ui/qol.js` (`objective`); agent
surface `web/src/agent/firstminute-api.js` (the `firstMinute` command and two checks).
**Builds on:** `WEB_FLORIDA.md` §3.5 (the start), `WEB_START_DOORS.md` (the clinic has a real door now),
`WEB_DOOR_POUND.md` (what the door is for).
**Source of the ask:** Robert's playtest, 2026-11-12: "the way that it starts off, it seems like we start off in this
random place, this random city or whatever."

## 1. Overview
**Why the start feels random** (found in the running game, a Florida new game):
- The title's tag line names the place ("MERIDIAN, FLORIDA"), then one toast says "You wake up in Meridian, Florida.
  Sheriff Duarte keeps the peace from the office on Main Street." It is gone in a few seconds.
- After that the only standing words are the tracker's "Talk to Sheriff Duarte". Nothing says what Meridian is, why you
  are on this street, or what the buildings are for.
- From the game camera the street is roofs. Nothing says you can walk in. The clinic you woke outside had no door.
- There is no threat. Meridian is a walled holdout and the infected never spawn inside one (`REGIONS.florida.life`).
  The game's whole danger is outside a wall the player has not seen.

**Built (small):** a brand-new Florida game now opens with three beats on the objective tracker, each with a pin and
each completed only by something you really do:
1. *where* — "You are in MERIDIAN, a walled town on the Florida coast that still stands. Dr. Kwame Asante patched you up.
   Go back inside: the door behind you." Done when you stand inside the clinic.
2. *door* — "Pull the door shut behind you: stand by the open door and press E. The infected cannot work a latch." Done
   when the clinic's front door is shut and it was your hand.
3. *out* — "That door is what stands between you and them out there. Walk into it to open it, and step back out." Done
   when you are in the street again. Then the sheriff's job takes the tracker, as before.

That gives an explained place, an enterable house and a first goal inside the first minute, and teaches the one verb
the infected slices are built on. It does not put a threat there (§5).

## 2. Player fantasy
You know where you are in one sentence. You turn round, walk into the building you were lying outside, and find out it
has rooms. You shut a door for the first time and are told what a door is worth. Then you go and find the sheriff.

## 3. Detailed rules
- **Armed** by the title's PLAY on a Florida start (`regions.armFirstMinute`), once: `g.quests.firstminute = 0`. Never by
  the agent harness or the battery (they start in Phoenix and click no title), never by a load (the save carries the
  beat it was on), never twice.
- **The tracker.** `qol.objective()` asks `regions.firstMinute()` first in Florida. While a beat runs it returns that
  beat's line and pin (the clinic's door), and the GPS line points at it like any objective.
- **Each beat completes on real state** (`stepFirstMinute`, every frame while it runs): `insideClinic` (you stand inside
  the clinic lot's footprint, on foot), `shutClinicDoor` (the clinic's front door `isShut` and `door.shutBy` is you),
  `leftClinic` (outside the footprint, within 12 m of the door). No timer advances it.
- **The taught door is E's.** The doctor stands just inside that door, and E beside him is "Talk". While the *door* beat
  runs, the clinic's open door in your reach takes E first (`regions.firstMinuteDoor`, read by the E chain exactly as
  the door-first rule reads the infected being near).
- **A toast as each beat begins** (the row's `say`), and `firstMinute { beat }` / `firstMinuteDone` events.
- **Rows.** `FIRST_MINUTE` is data: id, text (with `{town}` and `{clinic}` filled from the holdout's rows), pin, done,
  say. `validateFirstMinute` refuses an unknown condition, a line too long for the tracker (over 170 characters) and
  more than six beats.

## 4. Formulas
| Name | Formula | Variables | Example |
|---|---|---|---|
| Inside the clinic | `x0 + 0.3 < px < x1 − 0.3 ∧ z0 + 0.3 < pz < z1 − 0.3 ∧ on foot` | the clinic lot's footprint | 1.5 m in from the door: inside |
| Out again | `¬inside ∧ dist(player, door) < 12` | — | 3 m out in the street: done |
| Length | 3 beats, each one walk of under 10 m plus one key | — | about 40 s at a walk |

## 5. Edge cases, and the proposal
- **You walk off without doing it:** the tracker keeps the beat's line and its pin. Nothing is locked; the sheriff, the
  store and the gate all work. Come back and it carries on.
- **Somebody of the town stands in the doorway:** the door will not shut on them ("someone is in the doorway"); the beat
  waits.
- **The door was shut by somebody else:** the beat wants your hand (`shutBy`): open it (walk into it) and shut it.
- **A save and a load:** `g.quests` is in the save; the beat comes back.
- **The harness, the battery, an old save:** `g.quests.firstminute` is undefined, and everything reads as before.
- **You die in the first minute:** the clinic wakes you at its door as always; the beat is unchanged.
- **The shard (playing online):** logging in presses PLAY and then lays the character's saved data over the game. A
  character the shard has never saved gets the boot baseline, which has no quests, so the first minute is armed again
  after that (`shard.newCharacter`). A returning character keeps whatever beat its save holds.
- **The clinic door is off its hinges** (blows or fire): there is nothing to shut. The door beat is skipped and E goes
  back to the doctor.
- **You shut the door from the street:** the beat wants you inside with the door shut behind you. Walk into the door
  (it opens), step in, shut it.
- **You are far away** (past `FIRST_MINUTE_AWAY.dist`, 60 m from the clinic door): the tracker says "Unfinished in
  Meridian: go back to the clinic door, where you woke." with the same pin, not "the door behind you".
- **The title's own toast** is the short one ("You wake up in Meridian, Florida.") while the first minute runs; the
  sheriff is named when it ends.
- **Known and left:** waking at the clinic door after a death on beat 3 completes beat 3 (you are in the street). A door
  keeps its `shutBy` after it is pushed open again, so a door you shut earlier still counts as yours if it settles
  back onto its latch. The first tracker line is 144 characters filled, about twice the usual; it wraps to four lines
  on the card (see the render). No check presses the title's PLAY itself (the harness has no title).

**PROPOSAL (not built): a threat inside the first minute.** Three options, cheapest first. Each needs a yes, because
each changes what the first town is.
1. **Something at the gate (recommended).** As you step out on beat 3, the west gate's bell rings: one of the infected,
   a sprinter, is throwing itself at the gate and the deputies are shouting. The tracker's next line is "The west gate.
   Go and see." You watch the wall do its job (or help), 90 m from where you woke. It keeps Meridian safe, shows the
   breed Robert asked about beating on something, and costs one staged spawn outside the gate plus two rows. The gate
   is not a door today, so it needs the gate to take blows the way a door does.
2. **Wake in a house outside the wall.** Start in a dead house 200 m up the road with the door shut and something
   already beating on it; the first goal is "get to Meridian's gate". This is the strongest opening and the biggest
   change: a new start point, a staged house, and the save/respawn rules must still send you to the clinic afterwards.
3. **The first night.** Leave the day safe; at the first dusk a herd comes to the wall and the tracker says so. Cheap,
   but it is not in the first minute.

## 6. Dependencies
| System | What it needs from this | What this needs from it |
|---|---|---|
| `systems/regions.js` (WEB_FLORIDA.md §3.5) | the four methods above | `clinic(id)`, `start`, the holdout's rows |
| `ui/qol.js` | `regions.firstMinute()` before the sheriff's line | `objective()` |
| `main.js` | `armFirstMinute()` at the title's PLAY; `firstMinuteDoor()` in the E chain | the E chain's door-first rule (WEB_DOOR_POUND.md) |
| `systems/interiors.js` (WEB_START_DOORS.md) | — | the clinic's front door as a record (`shutBy`, `isShut`) |
| the save (`agent/api.js snapshot`) | — | `g.quests` |
| `data/quests.js`, `systems/journal.js` | — | a number in `g.quests` is not listed as a quest (only strings are) |

## 7. Tuning knobs
| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `FIRST_MINUTE` rows | 3 beats | 1–6 | How long before the sheriff's job; past 6 it is a tutorial |
| a beat's `text` | 100–150 characters | 20–170 | One line on the tracker |
| inside margin | 0.3 m | 0.1–1 | How far in counts as inside |
| out radius | 12 m | 5–30 | How near the door "stepped back out" means |

## 8. Acceptance criteria (selftest, `only="first minute:"`)
1. **Rows and the harness:** `validateFirstMinute` is clean; an unknown condition, a 200-character line and seven beats
   are each caught; on the harness's Phoenix start `armFirstMinute()` refuses and `g.quests.firstminute` is untouched.
2. **A new Florida game:** before arming, the tracker reads the sheriff's line. Armed: beat 0, the line names Meridian
   and says to go inside, its pin within 1 m of the clinic door. Twenty seconds standing in the street changes nothing.
   Inside the clinic: beat 1, the line asks for the door, the prompt reads "Shut the door" (with the doctor beside you),
   E shuts it and `shutBy` is you: beat 2. A save taken on beat 1 and loaded puts you on beat 1. Out in the street: the
   chain is over, `firstMinuteDone` fired, the three beats fired in order, and the tracker reads the sheriff's line.

Critic review 2026-11-12, first pass FAIL, two items, fixed in the next commit: a brand-new shard character lost the
first minute (the baseline laid over it has no quests); a broken clinic door stranded the tracker on the door beat.
Also taken from that review: the far-away line, the door beat wants you inside, the shorter title toast.
