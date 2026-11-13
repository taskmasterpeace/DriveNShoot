# THE CAROUSEL (web) — the machine in the ground

Lane: `feat/web-carousel`. Gap plan: `WEB_DEATHLANDS_GAP.md` G6, §4.5, §5, §8 #9. Rows: `web/src/data/carousel.js`.
Machine: `web/src/systems/carousel.js`. Panel and look: `web/src/ui/carousel.js`. Agent commands and checks:
`web/src/agent/carousel-api.js`. Scenario: `web/src/scenarios/ring-run.js`. Godot reference (rules only):
`game/proto3d/carousel.gd`, `game/data/carousel.json`, `docs/design/CAROUSEL_PORTAL.md`.

## 1. Overview

A **Carousel station** is a sealed two-level site under the ground: a hatch, a guard post and the generator on level 1;
on level 2 the **ring platform** behind a keyed blast door, and the command room where the ring's code card lies. The
underground lane builds and runs the site (`data/underground.js` kind `station`, room `ringdeck`); this lane is the ring:

- **The look.** One set of meshes (deck, edge strip, hanging ring, 8 pylons, vortex, 2 status boards: 6 draw calls, no
  lights) moved to the live station's ring room. It reads its state: **dormant** (no power) → **pending** (power, not
  armed) → **armed** → **building** → **frantic** → **live** (the vortex) → and **catching** on the far side.
- **The console.** E at either console opens the ring panel: ARM (the code), PAIR (a key you carry), ROULETTE,
  BACKSPIN, CUT A KEY, LEAVE.
- **The throw.** You, your crew and your dogs on the ring's level within 14 m go. **Vehicles never go.** Your rig stays
  where you parked it and its id, place, hp and fuel are recorded (`carousel.rig`).
- **Ring-sickness.** 0–5 stacks: aim spread, screen sway, swimming edges, the REST vignette, and microsleeps from 4.
- **Access keys** are items: found in ring rooms, kept on a trader's shelf, or cut from a blank at a console.
- **Ring-born** is a new-game option (title button, pad Y, or `?start=ringborn`). You open on black on a random lit ring
  with a starter crew of three, ring-sick 3. The ring hums, then the blast door grinds open.
- **The save** keeps the last ring, rings known, armed rings, ring-sick and its rest clock, the rig, Ring-born and the
  counters.

Stations today: **PAPAGO DEEP** (east of Phoenix, past the metro's edge), **GILA BEND ANNEX** (south-west, a worn ring),
**MERIDIAN DEEP** (Florida, east of Meridian). Three dark rows wait for their regions to stream: THE MOUNTAIN RING
(Colorado), KILLEEN RING (Texas) and CHATTAHOOCHEE RING (Georgia).

## 2. Player Fantasy

*You come to on the steel of a ring platform. It is dark and the air tastes of old oil. Three people you barely know are
groaning on the deck around you. A board on the console glows RECEIVING and then goes out. The blast door grinds open on
a corridor nobody has walked in years, and none of you knows what state is above you.*

The Carousel is what makes the country feel **vast**. A region does not need a road to the next one. The price of a throw
is everything you could not carry: your rig and its trunk, sitting a thousand miles away. You also come out of it sick,
and every new region is a fresh survival problem.

## 3. Detailed Rules

### 3.1 A station (the ladder)
1. **Get in.** Go down the hatch (companion stair) to level 1. Level 1's dead walk the rooms. The ring room is sealed
   to them: no infected spawn inside a `ringdeck` (`world/undergen.js`), so the ring catches you clean.
2. **Power.** The generator on level 1 (the underground lane's own: hold E, a fuel can fills a dry tank). Without power
   the keypads, boards and ring are dead, and the air is bad (`AIR_ZONES.under.unpowered`: 2.5 hp/s without a mask).
3. **The code.** The `ring_card` log (RING DUTY ROSTER) lies in the command room on level 2, outside the door it opens.
   Reading it teaches the site's `ring` code (`siteCodes`: appended last, so every older code stays as it was).
4. **The blast door.** A 2-leaf blast door with keypad `ring`: key in the code with power on, crank it with a crowbar
   with power off (loud), or blow it with a charge (the underground lane's `BLAST` rules).
5. **Arm.** At a console, ARM keys in the code. Arming holds while the station has power (`carousel.armed`).

### 3.2 The throw
| Kind | Needs | Lands | Ring-sick |
|---|---|---|---|
| **PAIR** | power, armed, the **destination's key** in your pack | that ring | +1 |
| **ROULETTE** | power, armed | a random lit ring; **in another region** while one answers | +1, +2 more on a bad throw |
| **BACKSPIN** | power only (no key, no code) | the last ring you came out of | +1 |

- Starting a throw: you must stand on the deck (`|you − centre| < platformR + 0.6`). The spin runs 4.2 s (60% building,
  40% frantic), the vortex holds 0.7 s, then it throws. If you step off the deck during the spin, it spins down
  (`ringAbort`) and you lose nothing.
- **Who goes:** you; every crew member standing on the ring's level within `crewR` = 14 m of the centre (a downed member
  only when you are dragging them); your dogs within 14 m. Never a vehicle and never anyone sitting in one.
- **The arrival:** the far site is made live and its ring level promoted. You stand between the core and the blast
  door, facing it; the crew are fanned out ahead of you inside your flashlight's cone, down on the steel (knockdown) until
  1.2 s after the door opens. The screen cuts to black (0.85) for `arrivalHold` = 2.4 s, then the ring room's door is
  unlocked and flung open. The arrival ring shows **catching** for 3.5 s.
- A **bad throw** (ROULETTE only): +2 extra stacks and 14 hp off you and each crew member who came (never below 1).
- `last` = the ring you left; the ring you land on joins `known`.

### 3.3 Ring-sickness
Stacks fold into the single consumers: `g.needs.sway` (aim spread, `systems/combat.js`), `g.needs.vignette` (the REST
look) and the REST microsleep (`systems/survival.js`; one line reads `carousel.sickFx()`). The screen sways (a CSS
transform on the game canvas, updated 10×/s) and its rim swims (a masked `backdrop-filter` blur under the HUD). One
stack goes every 20 game minutes of **rest**: not running (speed ≤ 5.5) and nobody targeting you within 40 m. Asleep
counts double.

### 3.4 Keys
- One item per station (`ringkey_<id>`, a tool): looted from `ring_keys` (the ring room's boxes), traded (Kenji deals in
  tools and keeps 2 blanks and a keycutter's kit on his shelf), or **cut**: a keycutter's kit + a blank at a powered
  console cuts that station's key (CUT A KEY).
- Blanks also turn up in vaults' vaults and comms rooms (`KEY_SEED`).

### 3.5 Ring-born
The title's **RING-BORN** button (or pad Y on the title, or `?start=ringborn`) starts the normal game, then throws you.
You land on a random lit ring (or `station=` from the agent) with a starter crew from `RINGBORN.crew` (the Thrown Man,
a retired wall guard and a field medic: real flags), the kit (`RINGBORN.kit`) and ring-sick 3. The station's generator is
on its last tank (`RINGBORN.fuel` = 0.12, about 8 game hours), so the air is good for now. You get full black for 3.2 s
and the hum (55 Hz + 82.5 Hz), then the door and the line *"Nobody knows where the ring threw you…"*. The normal Florida
start stays the default.

## 4. Formulas

Let `n` = ring-sick stacks (0..5), `d` = the ring's wear (`damaged`, 0..1).

- Aim spread multiplier: `s = 1 + 0.06·n` (folded into `needs.sway`, capped by `SWAY.cap` = 1.7 with the rest)
- Sway amplitude: `a = 0.15·n` (degrees of roll; drift `9a` px × `6a` px; zoom `1 + 0.012·n`)
- Edge blur: `b = 0.08·n` (the swimming share of the half-width); blur radius `1.5 + 14b` px; mask clear to
  `100 − 160b` %
- REST vignette: `v = max(v_rest, 0.08·n)`; microsleeps when `n ≥ 4`
- Decay: `restMin += Δh·60·(asleep ? 2 : 1)` while resting; every 20 min, `n ← n − 1`
- Gain: PAIR +1, BACKSPIN +1, ROULETTE `1 + (bad ? 2 : 0)`; `n` is clamped to 5
- Bad-throw chance: `p = 0.04 + 0.08·d`

**Example.** ROULETTE out of GILA BEND (d = 0.55): `p = 0.04 + 0.044 = 0.084`. On a bad throw `n` goes 0 → 3, so aim
spread ×1.18, roll ±0.45°, edge blur radius 4.9 px, vignette 0.24. You and each crew member take 14 hp. One quiet hour
underground (60 game min) takes 3 stacks off and leaves you at 0. The same hour asleep takes the same 3 off in
30 minutes.

## 5. Edge Cases

- **Throw from a car / a deck:** impossible underground. `arrive()` still gets you out of any vehicle or deck first.
- **The rig was destroyed or towed away** before the throw: `rig` keeps the last good record; a dead rig is not recorded.
- **Crew member downed on the deck:** left behind unless you are dragging them (the drag ends on arrival).
- **Crew member up on level 1 or outside:** stays there. They are not on the ring's level within 14 m.
- **Crew member in a car:** stays with the car.
- **Dogs:** yours within 14 m on the level go (dogs are crew).
- **Stepping off the deck mid-spin:** spins down (`ringAbort`), nothing lost, no sickness.
- **Power dies mid-spin** (the tank runs dry): the throw still completes. The spin was already paid for.
- **PAIR to a dark ring** (its region not streamed): refused with "nothing answers from <region>". ROULETTE skips dark
  rings. BACKSPIN to a ring that is now dark is refused.
- **PAIR to the ring you stand at:** refused ("that is this ring").
- **No other ring answers:** ROULETTE is refused before the spin.
- **ROULETTE with no other region lit:** it lands in the same region.
- **Arrival at an unpowered station:** bad air (2.5 hp/s without a mask) until you start its generator or get up the
  hatch. Ring-born never lands you in this (its station runs on its last tank).
- **Keypad door already open, cranked or blown:** the ring ladder only needs power and the code to ARM. The door's
  state is the underground lane's (saved per level).
- **Save mid-spin:** the spin is not saved. Loading leaves the ring armed and idle.
- **Load below in a station:** the underground lane makes the site live; the crew (respawned beside you on the street
  floor by `crew.load`) are moved onto your level.
- **Vault ring rooms** (`ringroom` in citygen vaults): the room is there, the ring is not live. Only `station` sites run.
- **Name tags underground** are drawn at street height (a pre-existing projection issue, not this lane's).

## 6. Dependencies (both ways)

| This depends on | How | Back-reference to add |
|---|---|---|
| `systems/underground.js`, `world/undergen.js`, `data/underground.js` | the site, levels, generator, keypad, logs, bad air; kind `station`, room `ringdeck`, logs `ring_power`/`ring_card`, code group `ring` | `WEB_UNDERGROUND.md`: the station kind and the console hook in `playerInteract` |
| `systems/crew.js`, `data/crew.js` | who goes, the starter crew, the knockdown on arrival | `WEB_CREW.md`: the crew jumps; `crew.load` then `carousel.load` |
| `systems/dogs.js` | your dogs go | `WEB_DOGS.md` |
| `systems/survival.js` | `sickFx()` folded into sway, vignette and microsleep | `WEB_SURVIVAL.md` |
| `engine/controls.js` | the panel is a pad `menu` context | `WEB_CONTROLLER.md` |
| `data/items.js` LOOT, `data/trade.js` | key items, `ring_keys`, Kenji's keeps | `WEB_INVENTORY.md`, `WEB_TRADE.md` |
| `world/worldindex.js` regions, `data/atlas.js` ATLAS_XZ | where a row stands; which rows are lit | `WEB_ATLAS.md` (the Carousel rows are live), `DIVIDED_STATES.md` |
| `agent/api.js` snapshot/restore | `carousel` in the save | — |

| Depends on this | How |
|---|---|
| G8 breadth (new regions) | a region that streams lights its station rows; no road needed between regions |
| `WEB_CLONE_TRAVEL.md` | another way across the map; the rig-stays rule is the Carousel's opposite of the trundle |
| Future: the ring's guardians, ring sieges, THE DIAL | the Godot reference's later ladder steps |

## 7. Tuning Knobs

| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `RING.platformR` | 3.6 m | 2.5–4.5 | how many fit on the deck; the deck must stay inside a 9–13 m room |
| `RING.crewR` | 14 m | 6–20 | how near the crew must be to come along |
| `RING.spin` / `build` | 4.2 s / 0.6 | 2.5–8 / 0.4–0.8 | how long the dread lasts; the build/frantic split |
| `RING.live` | 0.7 s | 0.3–1.5 | the vortex at full before the throw |
| `RING.arrivalHold` | 2.4 s | 1–5 | the black before the door |
| `RING.badHurt` | 14 hp | 0–30 | the cost of a bad throw |
| `SICK.spread` | 0.06 | 0.03–0.1 | aim spread per stack |
| `SICK.sway` | 0.15 | 0.05–0.3 | screen roll per stack (over 0.3 people get motion-sick) |
| `SICK.blur` | 0.08 | 0.04–0.12 | swimming edge per stack |
| `SICK.microAt` | 4 | 3–6 | when the microsleeps begin |
| `SICK.decayMin` | 20 | 10–40 | game minutes of rest per stack |
| `SICK.bad0` / `badDamaged` | 0.04 / 0.08 | 0–0.1 / 0–0.2 | ROULETTE's risk |
| `RINGBORN.sick` | 3 | 1–5 | how rough Ring-born opens |
| `RINGBORN.fuel` | 0.12 | 0.05–0.3 | how long a Ring-born start breathes before the generator needs you |

## 8. Acceptance Criteria (the selftest checks, `selftest only=carousel:`)

1. **Rows:** `validateCarousel` is clean. Every lit station's two levels are proved (NavProbe). Level 1 has the
   generator. Level 2 has a `ringdeck` behind a locked blast door with keypad `ring` and nobody inside it. The card lies
   on level 2. At least one Arizona row, one Florida row lit, and one dark row.
2. **Ladder:** at PAPAGO, the keypad is dead without power. The generator makes it **pending**, the card teaches `ring`,
   and the keypad opens the door. **E at a console opens the panel** and its first row arms it (**armed**). The ring is
   visible.
3. **Look:** after a 1 s spin the state is **building**, after 3 s **frantic**, and the vortex's opacity rises. Stepping
   off the deck spins it down with no throw.
4. **Acceptance 9:** ROULETTE from PAPAGO (Phoenix) lands you in a station in another region (Florida). Both crew stand
   on your level within 6 m. The parked pickup has not moved, kept its hp and is recorded as the rig. Ring-sick ≥ 1, and
   21 game minutes of rest take exactly one stack.
5. **PAIR:** refused without the key ("key"); with it, you are thrown to PAPAGO with +1 stack and the key is still in
   your pack.
6. **BACKSPIN:** with no key and no armed ring, you go back to the last ring with exactly +1 stack.
7. **Keys:** a key item for every row, plus blank and kit. `ring_keys` loot holds station keys and Kenji keeps blanks.
   CUT A KEY at a powered console turns a blank into that station's key.
8. **Ring-sick:** 4 stacks raise `needs.sway` ×1.24 (capped), the vignette is ≥ 0.32, the microsleep is on and the edge
   blur shows. 0 restores everything.
9. **Save/load:** last, known, sick, rig and site are equal after a load, and the key is back in the pack.
10. **Ring-born:** you are in MERIDIAN DEEP's ring on full black with 3 crew (flags) on your level, ring-sick 3 and the
    door locked. After the hold the door is open and you are on the deck.
- **Renders** (`docs/renders/web/carousel/`): `ring-dormant.png`, `ring-live.png`, `arrival-meridian.png`,
  `ringborn-papago.png`, judged against: amber/bone/steel, no purple, crew with flags on the deck.
- **Perf:** `scenario name=stress` unchanged (the ring is hidden away from a station). 6 draw calls while a ring is live.
- **IP:** `node tools/ip-lint.mjs` 0 deny.
