# WEB_BREEDS — the three breeds told apart

**Status:** BUILT 2026-11-12 on `feat/web-zed-breeds` (stacked on `feat/web-zed-pound`).
**Code:** rows `BREED_VOICE` and `BREED_CARDS` in `web/src/data/infected.js` (checked by `validateInfected`); the voices
are played by `web/src/systems/zombies.js` (the groan pick, the notice, the Echo's hands) through
`web/src/systems/audio.js` (`groan(pan, dist, voice)`, `murmur`); the cards are read by `zombies cards=true`
(`web/src/agent/zombies-api.js`); two Test Lab scenarios, `web/src/scenarios/three-breeds.js` and `door-siege.js`.
**Builds on:** the canon `THE_INFECTED.md` (taxonomy §3.1, the counterplay matrix §3.4, ruling 0.8; ruling 0.12 is
NOT followed yet: see §5),
`WEB_INFECTED.md` and `WEB_ZOMBIES.md` (the three breeds as rows, their minds), `WEB_DOOR_POUND.md` (the made sounds).
**Source of the ask:** Robert's playtest, 2026-11-12: "Remember, we got three different types of zombie".

## 1. Overview
The docs already name three breeds and the engine already runs them: the **Shambler** (the herd: answer by crowd
control), the **Sprinter** (a shambler until it breaks: answer by reflex and a door) and the **Echo** (a worker at your
walls that stalks instead of charging: answer by watching it). `WEB_DEPTH_PLAN.md` decision D1 fixes the count at three;
the Choir-Touched is a site special, not a breed. So no new type is proposed here.

What was missing is that a player could not TELL them apart, or find out what each wants:
- All three made the same sound. The groan clock played the shambler's take for whoever was nearest, the Echo included.
- Nothing announced the moment one of them noticed you (only the sprinter had its scream).
- The Echo's work at your boards was silent.
- What each breed is, how you know it and what to do about it was written only in design docs.

This slice gives each breed its own voice, a tell at the moment it notices you, and a card with a source on every line.

## 2. Player fantasy
You hear a low groan from the next street and know it is a herd: walk. You hear the same groan, and then one of them
screams, and you know which kind that one was. At home at night there is a murmur outside the east wall, the same half
sentence again and again, and a small creak of a nail: something is at the boards, and it stops when you look.

## 3. Detailed rules
### 3.1 Voices (`BREED_VOICE`)
| | Shambler | Sprinter | Echo |
|---|---|---|---|
| idle (the nearest one you cannot see, every 1.4–3 s, to `WARNINGS.groan.range` 50 m) | `shambler/groan` (5 takes) | `shambler/groan`: it hides in the herd | never groans |
| notice (it first perceives one of the living) | `shambler/notice` (3), heard to 50 m; the same body at most once every 8 s, any two bodies at least 0.35 s apart | its scream, `sprinter/scream` (5), heard to 70 m | none: it does not announce itself |
| on the move | — | `sprinter/chase` (4) every 1.3–2.2 s of its run, to 45 m | — |
| at your door or boards | the fist takes (`WEB_DOOR_POUND.md`) | `sprinter/rage` (3) on the slam, to 50 m, then the fist takes | `echo/work` (3) on every strike, to 26 m |
| its phrase | — | — | `echo/murmur` (4) every 5.5 s while it works, to its `hear` (25 m), with the barked line over its head |

- Each voice is a `[set, kind]` pair resolved by `data/audiosets.js`. `audio.groan` asks for the breed's own take
  first, then the library's shambler takes, then the synthesized groan. `audio.murmur` asks for `echo/murmur`, then
  `echo/idle`, then the synth.
- **The notice** fires on the sense tick where a shambler perceives someone and perceived nobody the tick before
  (`infectedNotice`, counted in `counts.notices`). It is a sound at the shambler's position, heard to 50 m.
- **An Echo and a Choir-Touched are left out of the groan pick.** Before, the nearest unseen infected groaned whatever
  it was, so an Echo behind your wall gave itself away as a shambler.
- A dormant sprinter is voiced as a shambler on purpose (canon: the uncertainty is the point).
- **An Echo that knows of you stops its murmur while it stalks** (`echomind.js`, WEB_DEATHS.md), apart from the lure it
  copies. In ambush at a door the phrase starts again, and calls the herd to that door. So the murmur means an Echo at
  work or an Echo waiting for you.
- Every take id above is read from `BREED_VOICE`. Ranges: the shambler's notice, the sprinter's run and slam and the
  Echo's work creak are its rows; the sprinter's scream carries to the smaller of `BREED_VOICE.sprinter.range` and the
  warning row `WARNINGS.scream.range` (both 70 m); the Echo's phrase is gated by `INFECTED.echo.hear` (25 m) and its
  loudness falls to nothing at 26 m (`audio.murmur`).

### 3.2 Cards (`BREED_CARDS`)
One card per breed: `name`, `is`, `tell`, `wants`, `do`, `source`. The Echo's card says both halves of it: at its work it
freezes when watched; once it knows of you it keeps out of your sight and waits at a door (it is not a charger, but it
does come for you). The lines are the game's own words (no real film or
game is named), and `source` names the design document and section each line comes from. A card's text may be shown on screen, so it never
uses the word the canon keeps off screen: the Wave 2 lane doc is cited as "WEB_INFECTED.md Wave 2" (`tools/ip-lint.mjs` denies it otherwise). `validateInfected` refuses a
breed without a card, a card with an empty line and a source that names no document. Read them with
`node tools/dl.mjs zombies cards=true` (with each voice's shipped take count and the breed's pace and door numbers) or in
the `three-breeds` scenario's summary.

### 3.3 The Test Lab
- **The three breeds** (`three-breeds`, LOOK): a herd of five shamblers, a sprinter reared back in its scream and an
  Echo standing at its post, 9 m apart on open ground, west to east, frozen in photo mode. Photo mode hides the HUD,
  so nothing is written over them: the Test Lab card itself says which is which in one line each, and the full cards
  are in the scenario's summary and in `cards=true`. `photo on=false` lets them loose.
- **A sprinter at your door** (`door-siege`, PLAY): you stand in an open doorway in the ruins with a pistol and one set
  of planks; a sprinter 16 m out has seen you and two shamblers will follow the noise. No god mode.

## 4. Formulas
| Name | Formula | Variables | Example |
|---|---|---|---|
| Groan heard | `d < WARNINGS.groan.range`, loudness `0.16 × (1 − d × (32 / range) / 32)` | range 50 m | a shambler 25 m off behind a wall: half loudness |
| Notice | `zsee ≠ null ∧ ztarget = null ∧ kind = shambler ∧ t > noticeAt`; then `noticeAt = t + noticeEvery` | noticeEvery 8 s | it sees you at 20 m: one moan; you stay in sight 30 s: no second one |
| Voice pick | first of `[breed take, library shambler take, synth]` that plays | — | samples off: the synth, as before |

## 5. Edge cases
- **Samples off or still loading:** the old takes or the synth play; nothing is silent.
- **A herd with a hidden sprinter:** it groans like the rest until it screams.
- **A crawler:** keeps its breed's voice.
- **Many shamblers notice you at once:** the first moans; any other whose sense tick lands inside `noticeGap` (0.35 s)
  of another's moan does not, and it does not moan later for that sighting (it has already taken you as its target).
  A herd of thirty gives a handful of moans over a second, not thirty.
- **An Echo that has gone hunting** (`echomind.js`): no murmur while it stalks (only its lure); the murmur starts again
  in ambush at a door. It never groans.
- **Canon ruling 0.12 is not followed yet.** The canon says the herd's voice is a murmur of broken word fragments, not a
  moan. The web engine already groaned before this slice (`WARNINGS.groan`, WEB_DEATHS.md), and this slice keeps that
  with better takes and adds a rising moan on notice. Moving the shambler to the canon's murmur is a sound and writing
  job of its own (phrase rows per state); it is listed here so nobody takes the groan for canon.
- **A shambler pointed at you by another system** (the director's night, a nest) that already had a target does not
  moan: the notice is for one that picks you out by its own senses from nothing.
- **The lineup run before the door scenario:** `door-siege` turns photo mode and god mode off itself.
- **A fourth breed:** refused by `validateInfected` (D1), as before.

## 6. Dependencies
| System | What it needs from this | What this needs from it |
|---|---|---|
| `systems/zombies.js` (WEB_ZOMBIES.md) | `BREED_VOICE` for the groan pick, the notice and the Echo's work sound | `sense` (who it perceives), `echo()` strikes, `counts` |
| `systems/audio.js`, `data/audiosets.js` (WEB_SOUND.md) | — | `sample`, `resolve`, the made manifest (`tools/audio-make.mjs`) |
| `data/hordes.js` `WARNINGS.groan` (WEB_DEATHS.md) | the groaner's breed in `groanHeard` | the groan clock and its range |
| `agent/zombies-api.js` | `BREED_CARDS`, `BREED_VOICE` for `zombies cards=true` and three checks | — |
| `testlab.html` (WEB_TESTLAB) | two cards: `door-siege`, `three-breeds` | the scenario command |
| `WEB_DOOR_POUND.md` | the sprinter's card sends you to a door | `shutDoor`, `pound` for `door-siege` |

## 7. Tuning knobs
| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `BREED_VOICE.shambler.range` | 50 m | 20–80 | How far a notice carries |
| `BREED_VOICE.shambler.noticeEvery` / `noticeGap` | 8 s / 0.35 s | 3–30 / 0.1–2 | How often one shambler may announce you; how tightly a herd's moans may come |
| `BREED_VOICE.sprinter.range` / `chaseRange` / `rageRange` | 70 / 45 / 50 m | 40–70 (capped by `WARNINGS.scream.range`, 70) / 20–70 / 30–80 | How far the scream, the run and the slam carry |
| `BREED_VOICE.echo.range` | 26 m | 15–40 | How far the creak of its hands carries (its phrase: `INFECTED.echo.hear`, 25 m) |
| `WARNINGS.groan.every` | 1.4–3 s | 0.8–6 | How busy a herd sounds |
| take counts (`tools/audio-make.mjs` ROWS) | 3–5 | 2 or more | Repetition |

## 8. Acceptance criteria (selftest, `node tools/dl.mjs selftest only="breeds:"`)
1. **Voice and card for each:** `validateInfected` is clean; every voice id resolves to two or more shipped takes; the
   three tells and the three voices differ; a card whose source names no document and a breed with no idle voice are
   each caught; the Test Lab page's inline script parses and lists both scenarios.
2. **They sound apart:** a shambler facing you 18 m off emits `infectedNotice` once in 2.5 s and not again in the next
   9 s of unbroken sight (past the 8 s per-body gap: it has not lost you); it groans (`groanHeard`, breed `shambler`); `audio.groan` with the shambler's voice asks for `shambler/groan`
   first and `audio.murmur` for `echo/murmur`; an Echo alone for 7 s produces no `groanHeard`.
3. **The scenarios:** `three-breeds` stands five shamblers, a sprinter out of its dormant state and an Echo, and returns three
   cards whose sources name documents; `door-siege` leaves an open, unlocked, unbroken wooden door within your reach,
   a sprinter that is not dormant, two shamblers, the prompt "Shut the door" and god mode off.

Picture: `docs/renders/web/breeds/zed-breeds-after-lineup-cards.jpg` (the lineup from the game camera with each card
under its lane). Before this slice there was no card and one groan for all three.

Critic review 2026-11-12, first pass FAIL, four items, fixed in the next commit: an unescaped apostrophe in the Test Lab
page blanked every card; the Echo's card said it does not chase (it stalks and ambushes once it knows of you); this doc
misstated the sprinter's ranges and a hunting Echo's murmur and cited ruling 0.12 while not following it; the lineup
claimed an Echo at a boarded window and cards on screen (now: an Echo at its post, and the one-line tells on the Test Lab
card, since photo mode hides the HUD).
