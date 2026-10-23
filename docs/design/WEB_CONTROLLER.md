# WEB_CONTROLLER — the pad, the hands and the gun (web engine)

**Status:** SHIPPED 2026-10-23 on `feat/web-controller` (web/). **Owner of the call:** Robert ("Prioritize a controller.
First."). **Engine:** the three.js web engine (`web/`, see `web/AGENTS.md`).
**Files:** `web/src/data/controls.js` (binding rows, pad tuning, rumble), `web/src/engine/controls.js` (the fold, the pad
poll, the aim), `web/src/engine/input.js` (physical and canonical keys), `web/src/data/arms.js` (stance, grip, gunpoint,
melee numbers), `web/src/systems/arms.js`, `web/src/systems/gunpoint.js`, `web/src/systems/melee.js`,
`web/src/ui/weaponbar.js` + `weaponbar.css` + `weaponart.js` (the bar, the wheel, the gunpoint plate, the CONTROLS panel),
fire modes on the rows in `web/src/systems/combat.js`. Agent: `web/src/agent/controller-api.js`.

---

## 1. Overview

Six pieces, in the order Robert asked for them:

| # | Piece | One line |
|---|---|---|
| 1 | **The controller** | Full twin-stick gamepad: left stick moves, right stick aims, RT fires (the gas at the wheel, LT the brake), every verb reachable; keyboard and mouse stay first-class; every binding a data row, rebindable (F2) |
| 2 | **The grip** | One hand (quick, works from a car window, wild) or two (steady, slow); a toggle (J / LB) and rules that force one hand when the other is busy |
| 3 | **The holster** | Raised / lowered / holstered. Free hands open doors ahead of you and climb faster; a raised gun is read: guards tense, traders shut the counter; busy hands put the gun down |
| 4 | **The weapon bar** | Silhouettes of the guns you carry along the bottom; the live slot raises 2-4 mode boxes (SEMI / BURST / AUTO, BUCK / SLUG, SINGLE / FAN); the number again steps them; on the pad, RB held opens a weapon wheel |
| 5 | **Gunpoint** | A raised gun held steadily on a person is a state: they comply, plead, run or draw on you by their nerve; robbery, a door opened, a prisoner, standoffs nobody fires first in, all in the world's memory |
| 6 | **Melee** | Strike (fists, gun butt, knife), kick, shove: contact-timed, stamina-paid, combos; a shambler can be put down without a round |

## 2. Player fantasy

GTA2's camera with a pad in your hands that feels like a twin-stick shooter: the left thumb walks (a light touch creeps),
the right thumb points, and the view leans the way you look. The gun is a thing you carry, not a cursor: you put it away
to walk into a trader's shop, you raise it and the room changes. Point it at a man and he decides, by his nerve, whether
you are worth dying over. Two guns come up on you and nobody wants to be first. You lower yours, and they lower theirs.
And when the rounds are short, you use your hands.

## 3. Detailed rules

### 3.1 The controller (data/controls.js, engine/controls.js)

- **Bindings are rows.** Each verb has `keys` (physical codes, `mouse:left`, `mouse:right`, `wheel`) and `pad` buttons
  per context: `foot`, `drive` (at the wheel), `ride` (passenger seat, hanging on, the train roof), `talk`, `menu` (the
  PACK screen), `radial` (the weapon wheel). A verb the engine already read by key code keeps that `code`; a rebound key
  emits the code, so no verb was rewritten. Rebinds persist (localStorage `dsoa.bindings`) and win over the rows (the
  Godot build's `input_bindings.json` + `user://input_overrides.json`, ported).
- **Input layer.** `engine/input.js` keeps the physical keys the hands hold (`phys`) apart from the canonical codes the
  game reads (`down`); each canonical code remembers its holders, so a key and a pad button on one verb never release
  each other. Tests write `down` directly as before; the new verbs read `phys` (and `Input.keyDown/keyUp`,
  `mouseButton`, `mouseMove` are the same calls a DOM event makes).
- **The pad (standard mapping, Xbox names; PS-family pads read the same).**

| | On foot | At the wheel | Riding / hanging on |
|---|---|---|---|
| Left stick | move (analog: a light tilt creeps) | steer | walk the roof (as W/S) |
| Right stick | aim (tilt = reach) | aim out of the window | aim |
| RT / LT | fire / throw (hold to cook) | gas / brake, reverse | fire / throw |
| A | dive roll | handbrake | |
| B | crouch (hold) | drop oil, caltrops, smoke | |
| X | reload / clear a jam | reload | reload |
| Y | use: talk, door, box, bed - or the car in reach | get out | get out / let go |
| LB | one hand / two hands | fire out of the window (hood gun) | one hand / two |
| RB | next gun (tap) / weapon wheel (hold) | harpoon (Whaler) else next gun | next gun / wheel |
| L3 | sprint (click on, stop to drop) | boost (latch) | |
| R3 | melee (tap strike, hold kick, sprinting: shove) | horn | |
| D-pad | up holster, down pack, left next throwable, right patch up | up throw, down pack, left change seat, right patch up | left change seat |
| VIEW tap / chords | map; +A ride along, +B hang on, +X flashlight, +Y sleep, +D-up/down zoom, +LB fast time, +RB weather, +R3 photo, +MENU save, +D-left CONTROLS | | |
| MENU | pause | pause | pause |

  In a conversation the D-pad picks answers 1-4 (LB/RB 5-6), A goes on, B leaves. In the PACK, the D-pad and left stick
  walk the list, A uses, Y moves, X drops, RB wears, B closes.
- **Who has the hands.** The pad has them from the moment a stick or button is touched until a key or the mouse is used
  again (`PAD.idleSwitch`); the mouse ray aims only when the keyboard has the hands.
- **The aim (pad).** The right stick's direction is the aim's bearing; its tilt sets how far out the aim point sits
  (`PAD.aim.reach`), so the camera's existing lean toward the aim (main.js `updateCamera`) leads the view. A flick snaps;
  otherwise it turns at `PAD.aim.turn`. At rest the aim keeps its line, or follows where you walk.
- **Aim assist, pad only and small.** A living person within `assist.cone` degrees of the stick's line and in the gun's
  reach bends the aim by `assist.pull` of the gap, never more than `assist.maxDeg`. The mouse's existing snap setting
  (pause menu) is unchanged.
- **Rumble.** Dual-rumble on the pad for a hit taken (scaled by damage), a blast within 28 m, a crash at the wheel, each
  shot (weak motor, by the gun's shake) and each blow landed. `controls.lastRumble` records it for tests.
- **A button held across a change of context does nothing until let go** (Y gets you out of a car; Y on foot would get
  you back in). The wheel's RB is exempt.
- **CONTROLS panel (F2, pad VIEW + D-left).** Every row: label, keys, pad buttons by context; click, then press the new
  key, mouse button or pad button. Clashes show in rust. RESET ALL.

### 3.2 The grip (systems/arms.js, GRIP)

- **Choice:** two hands by default; J (pad LB on foot) toggles.
- **Forced one hand:** any vehicle seat (you shoot out of the window), hanging on, cooking a throw, sprinting, carrying.
  The weapon bar's grip tag says why (VEHICLE, RUNNING...).
- **Effect:** one hand widens the cone by `GRIP.one.spread` and kicks by `GRIP.one.kick`, both scaled by the gun's
  `oneHand` (a revolver 1.0, a rifle 2.0); two hands slow your walk with the gun up by `GRIP.moveTwo x heft`. The pose
  shows it: one hand, the support arm hangs.

### 3.3 The holster (STANCE)

- **Raised** (aimed) / **lowered** (in hand, muzzle down; the start) / **holstered** (put away).
- **H tap** (pad D-up): up or down; from holstered, draw. **H hold**: holster (or draw).
- **Automatic:** a pull of the trigger raises a lowered gun and fires at once; on a holstered one it draws (`STANCE.draw`,
  per gun) and fires after. A strong right-stick throw raises it. A raised gun drops after `calm` s with no shot, nobody
  covered and nobody hunting you within `calmR`.
- **Hands free (holstered):** a closed, unlocked door you walk into is pushed open ahead of you (`doorHand`), so you keep
  your stride; windows are climbed x`vault.holstered`; you move x1.05 and sprints cost x0.85 stamina.
- **Busy hands:** while both hands are on something - the E-hold ring at a window or a lock, a box or body being
  searched, something carried or dragged - a raised gun comes down, both arms do the work and the body faces it; the gun
  goes back up when the work ends (if it was up), or the moment you fire.
- **Read by the world:** within `seeR` m, a guard (warden, soldier) or a trader who sees your raised gun for `notice` s
  is **tense** for `relax` s after it goes down. A tense guard stands, turns to you, says so, and draws the instant the
  muzzle comes round to him. A tense trader will not open the counter (trade.js refuses; a toast says holster it). The
  agent's `trade` verb puts the gun away first, as a person would.

### 3.4 The weapon bar and fire modes

- **Fire modes are data on the weapon rows** (`combat.js` WEAPONS `modes`): `burst` (1 single, n a burst, 0 automatic),
  `rate` (cyclic s), `spread` (x the row's), `kick` (recoil bloom), `after` (s after a burst), and for an alternate use
  `dmg`/`pellets`/`range`. Shipped: revolver SINGLE / FAN (three fanned rounds, wide); Rust-9 SMG and the service rifle
  SEMI / BURST / AUTO; sawn-off BUCK / SLUG (one heavy, tight round from the same shells). A content-pack gun without
  modes gets one from `auto`.
- **The trigger:** semi wants a fresh pull; a burst, once pulled, finishes on its own (held or not) then waits `after`;
  auto fires while held. A pull during the cool-down is kept, not lost. Switching guns cancels a burst.
- **Recoil bloom:** each round adds `kick x grip kick`; it bleeds off at the grip's `recover`/s; the cone is x(1 + bloom).
- **The bar:** bottom right, left of the weapon plate (the middle stays clear). Each slot a stencilled silhouette, its
  number, its loaded rounds and the active mode's name. Selecting a slot raises its mode boxes above **that slot only**
  for 4 s; the number again steps them (held, they keep stepping every `PAD.repeat` s); B also steps. Above the slots: the
  stance tag (RAISED - THEY SEE IT / LOWERED / HOLSTERED - HANDS FREE) and the grip tag.
- **The wheel (pad):** hold RB; a fan of wedges opens over the bar, one per slot with its silhouette; the right stick
  picks a wedge, the D-pad left/right steps that gun's modes on the inner arc; letting go of RB takes both. A tap of RB
  is just the next gun.

### 3.5 Gunpoint (systems/gunpoint.js, GUNPOINT)

- **Held:** with the gun raised and the aim inside `slack + slackPerM x d` m of a person within `range`, on your floor,
  in sight, for `aimFor` s (a tense guard: 0.15 s). People running home to tell on you belong to witnesses.js (its cow
  rule). An agent's raw `aim` override never holds anybody; the `gunpoint` command does.
- **The answer, by nerve** (formula §4): **draw** (armed, or any guard) - a standoff; **run**; **plead** (on their knees,
  hands up); **comply** (hands up). Each is a `threaten` deed through deeds.js (the witness pass, rumors, runners home,
  a named person's `threatened` memory).
- **Verbs on a held person in reach (E):** tap - hand it over (a robbery: their cash to you, what they carry in a pile at
  their feet, a `rob` deed with a star for a lawful witness, a named person's `robbedMe` memory); tap again - make them
  open the locked door near them; hold - walk with me (a prisoner who follows with hands up until you holster, or bolts if
  you get `leash` m ahead).
- **Kept** while the gun stays up, within `keep` m, and you don't look away for more than `lapse` s; let go, a timid one
  runs, the rest stand shaking.
- **The standoff:** everyone drawn on you aims and holds fire. Their tension climbs while your aim is on someone else and
  eases while it is on them; at `1 + nerve` they fire. A guard you keep covering fires after `guardFireAfter` s. Lower
  or holster your gun: after `standDown` s they lower theirs ("Smart."). Fire, and every drawn gun opens up. The
  GUNPOINT plate under the compass lists who you hold (flag, name, HANDS UP / BEGGING / RUNNING / DRAWN ON YOU) and each
  drawn gun's tension.

### 3.6 Melee (systems/melee.js, MELEE)

- **Tap** RMB / R3: a strike with what is in your hand - the gun's butt when it is raised, a knife you carry when it is
  not, else fists. **Hold** past `heavyAt`: a kick (heavier, knocks down). **Sprinting into it:** a shoulder shove
  (knockdown, a push, little damage).
- **Contact-timed:** a windup, then the blow lands on the nearest person in reach and in the arc in front of you, then a
  recovery. You step into it (`lunge`). Damage is `combat.damage(..., 'bash')`, so the hurt deed, witnesses and the AI's
  anger follow as for a shot; a knockdown is `knockT` (ai.js already honours it); a knife opens a bleed.
- **Stamina:** each blow costs its `stamina`; spent, the blow is weak (x0.5) and slow (x1.4).
- **Combo:** strikes landed within `combo.window` s chain; the third lands x`combo.mul` and puts them down. The infected
  stagger x`infectedKnock` as long.

### 3.7 Robert's follow-ups (2026-10-23)

- **"Make sure left is left":** steering is car-relative, as GTA2 is: A / the stick pushed left turn the car to **its
  own** left - west when it faces north, east when it faces south. The camera never yaws, so no camera angle can invert
  it; keys and pad agree (selftest).
- **"Reverse is super slow":** reverse now pulls away at 0.95 x the rig's acceleration (was 0.6) up to 0.45 x its top
  speed (was 0.35) (`vehicles.js` REVERSE).
- **"On a motorcycle you can shoot in all directions":** it could already fire every way; now the rider is seen to do
  it: the upper body twists at the waist toward the aim and sits up out of the tuck while aiming.

## 4. Formulas

| What | Formula | Example |
|---|---|---|
| Stick shape | `m = |v|`; 0 inside `inner`; else `((m - inner) / (outer - inner))^curve` along v | move: tilt 0.32 -> 0.14 |
| Walk speed (pad) | `4.6 x skills x arms.moveMul x max(walkMin, mag)` (sprint ignores tilt) | tilt 0.32 -> 1.5 m/s; full -> 4.6 |
| Pad aim reach | `reach0 + (reach1 - reach0) x mag` | full throw: 17 m |
| Aim assist | `ang += clamp(gap x pull, ±maxDeg)` for the best target in `cone` | 4° off -> 1.8° pulled |
| Fired spread | `row.spread x mode.spread x grip x (1 + bloom)` (then skills, sway in combat.fire) | revolver one hand: 0.025 x 1.7 = 0.0425 |
| One-hand grip | `1 + (GRIP.one.x - 1) x gun.oneHand` | rifle spread x2.4, kick x2.5 |
| Two-hand walk | `1 - GRIP.moveTwo x heft` | rifle 0.78, revolver 0.90 |
| Bloom | `+= kick x gripKick` per round; `-= recover x dt` | SMG auto two hands: 0.18 a round, -4.2/s |
| Gunpoint score | `nerve + armed x 0.25 + backup x 0.12 x friends(<=3) - close x 0.25 x (1 - d/13) ± 0.08` | timid drifter at 2.4 m: 0.02 - 0.20 = plead |
| Reaction | armed and score >= 0.7, or a guard: draw; score >= 0.62: run; < 0.15: plead; else comply | |
| Standoff tension | `+0.32/s` uncovered, `-0.5/s` covered; fires at `1 + nerve` | nerve 0.9: ~6 s with your aim elsewhere |
| Melee damage | `dmg x (weak ? 0.5 : 1) x (combo ? 1.6 : 1) x (1 + 0.05 x strength)` | knife combo: 41.6 |

## 5. Edge cases

- **Two pads:** the first connected one is used. **No pad:** everything on keys and mouse as before.
- **A held key when a rebind lands:** the old mapping releases on key-up (each physical key remembers what it emitted).
- **Canonical clashes:** a key may serve several verbs by context (E: talk, horn, kick; H: holster on foot, harpoon at the
  wheel); the panel shows clashes and allows them.
- **Burst into an empty magazine:** the burst stops at the empty click; a jam ends it; switching guns cancels it.
- **Holstered in a car:** the first pull draws, then fires out of the window, one-handed.
- **Gunpoint on someone already shooting at you:** not a hold (they are fighting). On a witness running home: witnesses.js's
  cow rule, not this. On the infected: never.
- **The aim moves off a pleader for over 1.6 s:** they are let go. A prisoner across 14 m: bolts.
- **A standoff and a shot from anyone:** your own shot breaks it (they fire); a stray shot from elsewhere does not.
- **Selftest staging:** staged people stand with `hold = true`; a tense guard is only turned to face you when he is not
  held, so staged witnesses keep looking where the check put them.
- **Save/load:** stance (a raised gun saves as lowered), grip choice and each gun's mode ride the save (`arms`). Held
  people and standoffs are not saved (a load clears them).

## 6. Dependencies

- **Shared files, small bounded edits:** `main.js` (construction, the pad aim after the mouse ray, analog drive and move,
  `tilt`, the stance's speed and sprint drain, `p.aiming` by stance, slot keys -> `arms.slotKeys`, gunpoint E before the
  others, the trigger -> `arms.trigger` / `afterShot`, the work-facing, the frame order, title keys), `combat.js` (modes on
  the rows; `fire(..., w)` takes the row as fired; `arms.onShot`), `carcombat.js` (`fireFromVehicle` passes the row),
  `characters.js` (holstered/busy hands hide the gun, one-hand aim, the melee and work poses, the bike rider's twist),
  `trade.js` (one refusal clause), `vehicles.js` (REVERSE), `agent/api.js` (import, commands merge, checks call, `arms` in
  snapshot/restore, the `trade` verb holsters first), `engine/input.js` (rewritten, same API plus the physical layer).
- **Read, not edited:** `systems/interiors.js` (door leaves' `w`, `wake`, `hold`/`holdOn`, `unlock`), `systems/inventory.js`
  (`place`, `opened`, `carried`), deeds.js, memory.js, witnesses.js, ai.js (`hold`, `knockT`, `flee`, `target`).
- **World memory:** `threaten` and `rob` deeds via `deeds.record`; memories `threatened`, `robbedMe`.

## 7. Tuning knobs

| Knob | Where | Value | Range | What it changes |
|---|---|---|---|---|
| PAD.move / aim inner, outer, curve | data/controls.js | 0.18/0.94/1.15; 0.2/0.92/1.6 | 0.05-0.3 / 0.85-1 / 1-2.5 | dead zones and response |
| PAD.aim.reach / turn / raiseAt | data/controls.js | [4.5, 17] / 26 / 0.55 | | how far the stick looks, how fast it turns, when aiming raises the gun |
| PAD.walkMin | data/controls.js | 0.32 | 0.2-0.6 | the creep |
| PAD.assist cone / pull / maxDeg | data/controls.js | 7° / 0.45 / 4.5° | 0-12 / 0-0.8 / 0-8 | pad aim assist (0 turns it off) |
| PAD.holdTime / repeat | data/controls.js | 0.32 / 0.38 s | | tap vs hold; mode stepping |
| RUMBLE.* | data/controls.js | | 0-1 | rumble strength by event |
| STANCE.calm / draw / notice / relax / seeR | data/arms.js | 6 s / 0.28-0.55 s / 0.6 s / 3 s / 14 m | | the gun dropping by itself, drawing, being noticed |
| STANCE.doorHand reach / spin | data/arms.js | 1.25 m / 5.5 rad/s | | free hands on doors |
| GRIP.one / two / moveTwo / guns | data/arms.js | 1.7, 1.75 / 1, 1 / 0.22 | | the one- and two-handed trade |
| GRIP.bloomMax | data/arms.js | 2.2 | 1-4 | recoil cap |
| WEAPONS[k].modes | systems/combat.js | | | burst counts, cyclic rates, spread per mode |
| GUNPOINT.* | data/arms.js | §4 | | holds, nerve, standoffs, cash taken |
| MELEE.* | data/arms.js | | | each blow's damage, timing, reach, stamina, knockdown; combo |
| REVERSE.accel / top | systems/vehicles.js | 0.95 / 0.45 | 0.5-1.5 / 0.3-0.6 | reverse gear |

## 8. Acceptance criteria (selftest, real input paths)

All driven by physical keys (`Input.keyDown/keyUp`), mouse buttons and moves (`mouseButton`, `mouseMove` through the
camera), and the virtual pad's axes and buttons through `Controls.poll`:

1. **controller:** the pad moves (a light tilt slower than a full one) and the right stick aims south then west; RT is the
   gas, LT the brake, Y gets out; a hit rumbles the pad.
2. **bindings:** a rebound key emits its verb, the old key goes quiet, a clash is listed, reset brings it back.
3. **weapon bar:** the slot again steps the boxes; SEMI fires 1 a pull, BURST 3 (held or tapped), AUTO keeps going; the
   boxes stand over the live slot only and show BURST.
4. **grip:** one hand's cone (measured from the rounds' directions) is >1.35x two hands', kicks harder; J toggles; a car
   seat forces one hand.
5. **holster:** H taps up, held holsters, tapped draws; holstered, the door's leaf is wider open when you reach it and you
   are through sooner than with the gun up.
6. **gunpoint:** a timid unarmed man puts his hands up (plead/comply), a threaten deed is in the book, E robs him (cash,
   a pile at his feet, a rob deed); a man with nerve runs.
7. **standoff:** two armed men draw; nobody fires while you cover them; holster and they stand down (outcome `stood
   down`, no rounds spent); a second pair and you fire: outcome `fired`, both target you.
8. **guards and traders:** a guard tenses at a raised gun and draws when you point it at him; Ike's counter is refused
   with the gun up and open once it is holstered.
9. **melee:** a strike lands after its windup (not on the click), a held button kicks a man down, a sprint shoves, three
   strikes chain into a knockdown, a shambler beaten to death costs no rounds.
10. **weapon wheel:** RB held opens it (shown), the stick picks the smg's wedge, the D-pad steps its mode, letting go takes
    both; a tap of RB is the next gun.
11. **busy hands:** holding E at a broken window to board it: while the ring is up the gun is down, the arms' pose is
    `work`, the body faces the window (not the aim); boarded, the gun comes back up.
12. **driving:** A and stick-left turn the car to its own left (west facing north, east facing south), D and stick-right
    to its right; reverse reaches > 0.3 x top speed in 1.5 s.
13. **motorcycle:** the pad's aim and LB fire out in all eight directions within 0.25 rad of the aim, the rider in the aim
    pose.

Gate: full `selftest` green twice on fresh pages; under 150 draw calls (the bar and wheel are DOM, the poses reuse the
instanced body: +0 draw calls); `node tools/ip-lint.mjs` 0 deny. Screenshots: `docs/renders/web/controller/`
(`weapon-bar-modes.png`, `pad-weapon-wheel.png`, `gunpoint-standoff.png`, `one-hand-car-window.png`).
