# WEB GADGETS-2: the kit you wear and look through

**Date:** 2026-10-29 · **Lane:** GADGETS-2 (`feat/web-gadgets2`, harness :3486) · **Status:** built, sim-proven (10 named selftest checks)
**Rows:** `web/src/data/gadgets.js` (KIT, CELLS, KIT_LOOT_ADD, HEAT, AIR_ZONES, CHEM_ZONES, CHATTER, `validateKit`), `web/src/data/workshop.js` (UTILITY `hubspikes`, `spotlight`, `winch`), `web/src/data/dogs.js` (DOG_GEAR, `validateDogGear`), `web/src/data/pulls.js` (CHANNELS `scanner`, FACT_KINDS `chatter`)
**System:** `web/src/systems/kit.js` (`g.kit`) · **Command:** `kit` (`web/src/agent/kit-api.js`) · **Renders:** `docs/renders/web/gadgets2/`

Robert (2026-10-29): *"Nothing clean or military-new: everything rebuilt, taped together and running on batteries you have to find."* On night vision: *"Fog plus dark nights make this the most valuable gadget in the game."* On the glass: *"Because NPCs don't cheat, scouting matters."*

## 1. Overview
The first gadgets lane built what you set and throw (`WEB_GADGETS.md`). This lane builds what you **wear and look through**, plus the car and dog kit that was missing:

| Piece | Slot | What it does | Feeds on |
|---|---|---|---|
| Night goggles (`nvg`) | eyes | green, grainy, amplified picture; whites out in a bright light | battery cells, 240 s each |
| Heat scope (`thermal_scope`, rare) | eyes | white-hot ramp drawn over brush; the living are warm, the infected cold, corpses cool | cells, 150 s each |
| Binoculars / rifle scope | glass | camera rises and leans out along your aim; marks what is in the cone **and in line of sight** | nothing |
| Flashlight / headlamp | beam | the existing cone, now a carried thing; a lit body is seen further at night | cells, 1500 / 2100 s |
| Radio scanner | ears | a knowledge-model **channel**: hears only real key-ups (a convoy's lead, the bulls' dispatcher) | cells, 1200 s |
| Gas mask | face | breathes for you in smoke, on chemical ground and in dead air below the street | filters, 300 s each |
| Hub spikes, roof spotlight, harpoon winch | car (Workshop UTILITY) | shred the tyres of a car alongside; light the road (and you); pull doors off cars and doors or gates down | the car's power (spotlight) |
| Nitrous (existing row) | car | the burst now burns a flame out of the tail | its bottles |
| Dog vest, lamp, bark collar | dog | soaks 45% of each hurt; lights the ground around it; marks what **the dog** sensed | cells (lamp) |

It makes **scarcity** bite (every hour of sight is a cell found in a box, never regenerated) and **distance** (scouting from 150 to 220 m before you commit).

## 2. Player Fantasy
It is 1 a.m. in fog. You thumb a sun-bleached cell into the goggles you taped into a welding mask, and the street comes up green and crawling with grain. A raider's flare goes up and the tubes white out; you are blind for two seconds you can't afford. On the ridge you hold the cracked binoculars on the camp: three marks, but the man behind the water tank stays unmarked because you can't see him. The scanner on your belt crackles: *convoy chatter: Route 66, eastbound, 3 rigs rolling.* You heard it because they said it, and you were close enough. Through the heat scope a white shape crouches in the brush, and a cold one walks toward it.

EM3 checks: **cost** (cells, filters, weight, scrip; a lit torch gets you seen; the goggles blind; the spotlight eats car power), **interaction** (switch on and off on the PACK screen, keys 7/8/9, dress the dog, fit at the Workshop), **proof** (§8), **IP** (our own names: heat scope, night goggles, hub spikes, harpoon winch; `ip-lint` 0 deny).

## 3. Detailed Rules
### 3.1 Power
- A piece works only while it is **carried** and switched on in its slot (`g.kit.on`: an item id, `'auto'` for the first carried one, or `null`).
- Powered pieces hold a charge in seconds (`g.kit.charge[id]`). When it reaches 0, a fresh `battery_cell` (or `mask_filter`) is taken from the pack and spent (event `kitCell`). With none left, the piece is dead.
- Cells and filters, the goggles, the mask, the glass and the scope turn up only in loot tables (`KIT_LOOT_ADD`: garage, office, pumps, wreck, bedroom, military, soldier, raider). The heat scope is a 0.25-weight roll on the military table. The start kit carries one flashlight with a cell already in it, plus one spare cell.
- **The battery is staged:** `runSelfTest` sets `g.kit.staged = true` (cells don't drain, the beam needs no torch), because unrelated checks force the flashlight on with an emptied pack. The kit's own checks clear it.

### 3.2 Night goggles
- Overlay = a fullscreen triangle in clip space (it ignores the camera, so `screenshot` gets it too):
  - a **multiply pass** (CustomBlending `dst·src + src·dst`): the green tint, grain, vignette and scanlines;
  - the renderer's `toneMappingExposure × (1 + (gain − 1)·night)` for the amplification;
  - an **additive glare pass**: whiteout × `blind`, plus up to 8 halos round bright things on screen.
- **Blind** rises at `blind.rate`/s toward the glare in view and falls by `1/recover` per second once it is gone. The glare sums:
  - burning flares within `flare` m: 1.4·(1 − d/r);
  - fires within `fire` m: 0.8·(…);
  - at night, headlights of a driven car within `headlights` m pointed at you (dot > `cone`): 1.2·(…).
- No light is added; the scene light count never changes.

### 3.3 Heat scope
- The world is multiplied to a dim amber (`HEAT.world`, exposure × `HEAT.gain` at night), with a warm additive floor (`HEAT.floor`). Then one instanced mesh of soft blobs draws every body within `range`, `depthTest: false` (over brush and smoke), coloured on `HEAT.ramp`.
- A body is drawn only if `statics.lineOfSight` reaches it: leaves and smoke don't stop heat, walls do.
- Temperatures (°C):
  - living: 37 (dogs 38.5);
  - the infected: air + 1.5, alive or put down;
  - a corpse: `air + (37 − air)·e^(−deadTime/tau)`;
  - burning: 300;
  - a driven car's engine: 70.
- Air is 31 by day and 14 by night (blended by `sky.night`). Cold bodies are drawn wider, so the hole reads.

### 3.4 Glass
- `look` (key 8, `kit look=true`) is refused at the wheel or while flying a drone.
- While held, `g.droneCam` (the follow the camera already honours) moves to `player + aim·lean` at height `h`.
- Every `every` s, each person and car is marked for `mark` s (`c.marked`, `v.kitMarked`: minimap rings and triangles) when it is:
  - within `range` and the `cone` of your aim;
  - on your floor or level;
  - in `g.los` from your eyes (walls and smoke block it).

### 3.5 Beam and being seen
- `main.js` lights the cone only if `kit.beamOk()` (a carried light with charge), and scales its reach by the row's `reach` (headlamp 0.78).
- Raiders' `scan` multiplies the range they pick you out at by `kit.seenMul()`, at night only:
  - lit on foot: flashlight 1.7×, headlamp 1.5×;
  - in a car with the roof spotlight burning: 1.8×;
  - otherwise 1.
- The dead already read the beam (`zombies.js lit`, `seekLight`).

### 3.6 Scanner
- `CHANNELS.scanner`: conf 0.8, range 1800 m. The scanner row's own range is also 1800 m.
- **Sources:**
  - a convoy's lead checks in 2 s after the convoy sets off, then every `CHATTER.convoy.every` (40 s), from where the lead really is;
  - the bulls' dispatcher keys up from the station whenever security dispatches a car;
  - a SITE STORIES party on the road in a car (traders, raiders; `systems/sitestories.js` movers) keys up every `CHATTER.party.every` (90 s) from the record's own spot.
- Each key-up records a `chatter` fact and calls `keyUp`. The player gets a copy only with a live scanner switched on and within range (`factHeard`, `scannerHeard`).
- **One broadcast source (WORLD VOICE, `WEB_WORLD_VOICE.md` §3.3).** `keyUp` sends the key-up on THE AIRWAVES (`g.airwaves`, `systems/airwaves.js`) as one `scanner` row; the scanner hears it from there (`hearKey`). The feed stations' lines are rows on the same airwaves, so the scanner and the radio share one source and one log (`airwaves` command).
- The fact is recorded whether or not anyone hears it, so the world still said it (`kit.lastKeyUp`).

### 3.7 Bad air
Every 0.25 s the kit checks the air where you stand, worst first:
1. **under:** below the street, a site of kind `drains` (the UNDERSTREET storm drains under every town), sewer or facility, or a site whose generator is off;
2. **chem:** inside a `CHEM_ZONES` row (THE TANK FARM, (−215, −330), r 22 m);
3. **smoke:** inside 85% of a live smoke cloud (canisters, the smoke layer, choke gas).

With a carried mask and a filter it breathes for you, and the filter drains. Without, you take `dps`, your aim shakes, and a cough every `cough` s carries 9 m (`kitChoke`).

### 3.8 Dog gear
- `doggear` from the PACK screen puts the gear on your nearest dog within 8 m (`kit dog=`). One of each part per dog.
- **Vest:** `dogs.hurt` multiplies the damage by `1 − soak`.
- **Lamp:** a ground pool ahead of the dog at night, while its cell lasts.
- **How it looks:** the gear is part of the dog's own model (`dogs.js gear`): an olive vest wrapping the barrel from the ribs to the loin with a dark plate along the back, a red collar at the base of the neck, the lamp on top of the collar. It poses with the dog: walking, sitting, lying.
- **Collar:** when `dogs.sense` sets a new `d.threat` (the dog's own threat reach round you), that target is marked for `mark` s (`barkMark`). Nothing outside the dog's senses is ever marked.

### 3.9 Car kit
- **Hub spikes:** every 0.4 s at over 2 m/s, a car overlapping you along the length, and within the two half-widths + 1.1 m across, loses the first whole tyre on its side facing you (`hubSlash`).
- **Spotlight:**
  - on at night with a driver (`kit spot=`);
  - a ground pool ahead of the car;
  - drains `v.power` 1.5/s;
  - you are seen 1.8× further.
- **Winch:** needs a harpoon (the WHALER's own, or a harpoon mount; the counter refuses it otherwise).
  - The yank on a hooked car tears its near door off (`winchDoor`) instead of the sideways throw.
  - A harpoon that strikes a wall within 2.5 m of a door, or `kit winch=door`, hooks that door or gate. Drive away until the cable passes its length + `slack`, and it comes down (`gadgets.breach`, `winchPulled`).
- **Nitrous:** the burst (`v.nitroUntil`) is drawn as two flames out of the tail.

## 4. Formulas
Variables: `d` (m) distance; `r` a row's radius; `night` = `sky.night` 0..1; `t` sim seconds since death; `air` °C.

| Formula | Range | Example |
|---|---|---|
| Cell life: `charge −= dt` while on; a flat one takes one cell (+`life`) | 0..life | goggles (240 s) with 3 cells on you: 4 min now + 12 min carried |
| Goggles' gain: `exposure = base · (1 + (gain − 1)·night)` | 1..4.2× | at 1 a.m. (night 1): 1.2 → 5.04 |
| Blind target: `Σ 1.4(1 − d/30)` flares + `0.8(1 − d/18)` fires + `1.2(1 − d/22)` headlights at you, ≤ 1 | 0..1 | a flare 6 m off: 1.12 → capped 1; reached in 0.42 s at rate 2.4; gone 1.6 s after |
| Corpse heat `air + (37 − air)·e^(−t/420)` | air..37 | at night (14): after 10 s 36.5; after 7 min 22.5; after 30 min 14.3 |
| Infected heat `air + 1.5` | | at night 15.5 °C: black on the ramp |
| Seen at night `range · seen` | 1..1.8× | a raider's 34 m becomes 57.8 m with a lit torch: the 46 m raider spots you |
| Glass mark: `d ≤ range ∧ cos∠ ≥ cos(cone) ∧ los` | | binoculars 150 m, ±31.5°; scope 220 m, ±17° |
| Bad air `dps · 0.25` a tick | | chem 6 hp/s: 12 hp in 2 s without a mask |
| Dog vest `hurt · (1 − 0.45)` | | a 20 hp bite: 11 |
| Hub spikes reach `|lx| < (W₁ + W₂)/2 + 1.1`, `|lz| < 0.42(L₁ + L₂)` | | two 2.0 m cars 2.6 m apart (centres): 2.6 < 3.1 → a tyre every 0.4 s |
| Winch pull: `d > len₀ + slack` | | hooked from 7 m: down at 8.2 m |

## 5. Edge Cases
- At the wheel the glass is refused; a drone in the air wins the camera (`droneCam` is released only if no drone flies).
- Goggles and the heat scope share the eyes slot: key 7 cycles goggles → scope → off. With no cell the toggle refuses and says why.
- `staged` (the battery) keeps unrelated checks' `flashOverride = true` lighting the cone with an emptied pack. Outside the battery the cone needs a torch.
- The scanner hears nothing while the convoy is still forming (2 s), nothing past 1800 m, and nothing while switched off. The convoy still said it (`lastKeyUp`).
- Heat is drawn only for bodies on your floor or level and in line of sight past walls. A zombie in deep shade under leaves is barely visible: the leaves are near air temperature too. That is physical, and the reason the scope shines on open ground.
- The mask goes on by itself in bad air. A dry mask says so (`THE MASK IS DRY`).
- Dog gear is not in the save yet (the dog records don't carry `d.kit`); neither are cell charges or the winch line.
- Hub spikes need speed (over 2 m/s): parked cars never shred each other.

## 6. Dependencies (both ways)
**This lane uses:** `throwables.smokes`/`fires`, `gadgets.list` (flares), `gadgets.breach`, `vehDamage.popTyre`/`detach`, `garage.addUtility`, `convoy.active`/`lead()`, `security.counts.dispatched`/`stationOf`, `pulls.k` (`knowledge.record`/`put`/`holder`), `dogs.mine()`/`d.threat`, `under.A` (site kind, `rec.power`), `g.los`, `statics.lineOfSight`, `g.droneCam`, `g.flashMat`, `renderer.toneMappingExposure`, `world/textures.radialGlow`.

**Used by:** the smart Echo (`systems/echomind.js`, WEB_DEATHS.md §3.6b) reads the beam main.js draws (`g.flashMat` opacity, `g.flashlight.scale`): a lit beam tells it where you stand and which way you face, and at night the cone is your eyes to it. WEB_DEATHS.md's heat check holds the death library's bodies (crawlers, the dropped infected) to `heatOf`'s cold.

**Shared-file hooks (each one line unless noted):**

| File | Hook |
|---|---|
| `main.js` | import `Kit`; `this.kit = new Kit(this)` before gadgets; `this.kit.update(simDt)` after `gadgets.update`; `flashOn &&= this.kit.beamOk()`; the cone's z-scale `× this.kit.beamReach()`; `this.kit.frame(dt)` before `charR.sync` |
| `systems/ai.js` | `scan`: the player's seen multiplier also `× g.kit.seenMul()` |
| `systems/dogs.js` | `hurt`: `dmg *= g.kit?.dogSoak(d) ?? 1`; `pose`: `if (d.kit) this.gear(...)`, a `gear()` method that draws the vest (wrapping the barrel), its back plate, the collar and the lamp as four more limb segments of the dog's own model (LIMBS 11 → 15, no new mesh or draw call) |
| `systems/vehicles.js` | `yank()`: `if (g.kit?.winchYank(h)) …return`; the harpoon's wall-hit branch: `if (g.kit?.hookDoor(v, h.x, h.z)) …return` |
| `systems/kit.js` (read by the faceted bodies) | `frame()` keeps `this.eyes`, the optic live this frame; `main.js` turns it into `charR.lsw.heat`, so the vein glow (light, not heat) goes dark under the heat scope (`WEB_LSW_BODIES.md`) |
| `systems/gadgets.js` | `drawMinimap`: `g.kit?.drawMinimap(...)` (cars the glass marked) |
| `systems/garage.js` | `addUtility`: a row with `needs` refuses without that gun (the winch) |
| `systems/inventory.js` | `act`: `kit` / `doggear` route to `g.kit.useItem` |
| `data/items.js` | import KIT, CELLS, KIT_LOOT_ADD, DOG_GEAR; fold them into ITEMS and LOOT (4 lines); START_KIT + flashlight and a cell |
| `data/pulls.js` | CHANNELS `scanner`; FACT_KINDS `chatter` |
| `data/controls.js` | rows `optics` (7), `glass` (8), `scanner` (9), group WORLD, no pad binding yet |
| `data/hudlayout.js` | row `kit` (`.kit-chip`, top right under the pulls chip) |
| `data/workshop.js` | UTILITY `hubspikes`, `spotlight`, `winch`; `validateWorkshop` checks `needs`, `slash`, `beam` |
| `data/dogs.js` | DOG_GEAR + `validateDogGear` (appended) |
| `systems/lookfeel.js` | `strength()`: `× g.kit?.gradeMul()`: the world's colour grade steps aside while the goggles or the heat scope draw their own picture (lens dirt still shows) |
| `agent/api.js` | import and spread `kitCommands`; `g.kit.staged = true` for the battery (restored before the runtime-errors check); `kitChecks` after `gadgetsChecks` |

**Others may use:** `g.kit.seenMul()` (any sight model), `g.kit.heatOf(c)` (any heat-seeking thing), `g.kit.keyUp(fact, x, z, from)` (any new transmitter: a faction's patrol radio when factionsim speaks), `g.kit.airAt(c)` (any breathing NPC), `AIR_ZONES.under.kinds` (the UNDERSTREET storm drains, kind `drains`, are listed). **This lane uses** SITE STORIES' `movers` (`state`, `car`, `kind`, `to`, `x`, `z`) and `place(id)` for the scanner's party chatter.

## 7. Tuning Knobs
| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `KIT.nvg.power.life` | 240 s | 120-600 | how precious night is |
| `KIT.nvg.gain` | 4.2 | 2.5-6 | how much the goggles show (clipping past 6) |
| `KIT.nvg.blind.flare / headlights` | 30 / 22 m | 10-40 | how easily a light kills your night |
| `KIT.nvg.blind.recover` | 1.6 s | 0.8-4 | how long the blindness lasts |
| `KIT.thermal_scope.range` / `power.life` | 70 m / 150 s | 40-120 / 60-300 | the rare piece's reach |
| `HEAT.tau` | 420 s | 120-1800 | how long a body stays warm (a fresh kill vs an old one) |
| `HEAT.world / floor / gain` | amber / 0.09 / 4 | | how the cold reads against the world |
| `KIT.binoculars.range / cone / mark` | 150 m / 0.55 rad / 30 s | 80-250 / 0.2-0.8 / 10-60 | scouting reach and memory |
| `KIT.flashlight.seen` / `headlamp.seen` | 1.7 / 1.5 | 1.2-2.2 | the price of light |
| `KIT.radio_scanner.range`, `CHANNELS.scanner.range` | 1800 m | 800-2600 | how far chatter carries |
| `CHATTER.convoy.every` | 40 s | 20-120 | how often a convoy talks |
| `AIR_ZONES.*.dps` | smoke 1.6, chem 6, under 2.5 | 0.5-10 | how much a mask matters |
| `KIT.gas_mask.power.life` | 300 s | 120-900 | filter value |
| `DOG_GEAR.dog_vest.soak` | 0.45 | 0.2-0.7 | your dog's toughness |
| `UTILITY.hubspikes.slash.r / every` | 1.1 m / 0.4 s | 0.6-1.6 / 0.2-1 | how hard a side-swipe bites |
| `UTILITY.winch.pull.slack` | 1.2 m | 0.5-4 | how far you drive before the door goes |
| `UTILITY.spotlight.beam.seen / power` | 1.8 / 1.5 | 1.2-2.5 / 0-5 | the spotlight's trade |

## 8. Acceptance Criteria (named selftest checks, `web/src/agent/kit-api.js`)
| Check | Proves |
|---|---|
| `kit: every row is whole...` | `validateKit` (slots, power rows, ramp climbing, no purple hue in the ramp or the chem looks), `validateDogGear`, `validateWorkshop` (the winch needs a harpoon row), `validateKnowledge` (the scanner channel); every piece is an item with the right use act; cells, filters, goggles, scope, mask, glass and torch are all in some loot table (law 2) |
| `kit: night goggles drain their cell...` | 3 s on takes ~3 s of charge; past it the spare cell is spent from the pack; the overlay is up and the exposure raised; a flare 6 m off takes blind ≥ 0.6 within 1.5 s; 4 s after the flare is gone blind < 0.15; flat with no cells the picture goes; the scene light count is unchanged |
| `kit: a lit flashlight at night makes a raider 46 m off spot you...` | unlit he never targets you in 2 s; lit he does; `seenMul` > 1.4; with no torch carried the cone's opacity is 0 |
| `kit: binoculars mark the raider in the open...` | a raider in the cone in the open is marked; one behind a building (no line of sight) is not; the camera's follow rose to the glass height and leaned > 30 m out; it is released after |
| `kit: the radio scanner hears a convoy only after its lead actually keys up...` | 0 copies before the first key-up; exactly 1 `scanner` copy about the convoy after it; switched off, the next key-up (which happened) adds none; exactly one cell was spent |
| `kit: the heat scope shows a shambler COLD...` | shambler < air + 3; raider ≥ 36.5; a corpse 10 s dead > 34; one 4000 s dead < air + 1; ≥ 5 blobs drawn; the raider's colour is bright (luma > 0.6), the shambler's dark (< 0.25); light count unchanged |
| `kit: a gas mask with a filter keeps you breathing on chemical ground...` | at THE TANK FARM without a mask you lose > 5 hp in 2 s; with a mask and one filter, no hp is lost, the filter is spent from the pack and drains |
| `kit: the nitrous burst spends a bottle...` | the tank goes 3 → 2; the burst is on and its flame drawn; the car is faster after; with the tank empty, Shift does nothing |
| `kit: the harpoon winch pulls the hooked car's near door off...` | a WHALER with the winch harpoons a sedan; the yank tears off a door panel; hooked to a building door and driven away, the door comes down |
| `kit: hub spikes shred the tyre of a car you rub alongside` | driving past a parked car 2.6 m off, at least one tyre goes, all on the side facing you |
| `kit: the bark collar marks the raider your dog actually sensed...` | the raider inside the dog's threat reach is marked; one 25 m past it is not; a 20 hp hurt on the vested dog takes 11 |

**Renders** (`docs/renders/web/gadgets2/`, from the game camera):
- `nvg-night-street`, with `-naked-eye` for comparison;
- `nvg-flare-blinds`;
- `thermal-through-brush` (a raider glowing under a palm canopy, a cooling corpse, a cold shambler on the street), with `-naked-eye`;
- `flashlight-alley`;
- `car-plow-nitrous` (cowcatcher, hub spikes, roof spotlight, two nitrous flames);
- `dog-vest-lamp-collar`.

**Not done:**
- Saves for cell charges, dog gear and the winch line.
- Pad bindings for 7/8/9.
- Trader shelves stocking kit (`source.buy` is the price a row would use).
- The rifle scope isn't tied to holding a rifle.
- Faction patrol chatter (factionsim has no transmitter yet; `keyUp` is the hook).
- NPCs wearing masks or goggles.
- A drawn harpoon cable to a door: the winch draws its own thin line.
- Smoke screen out of the tailpipe and the oil slick are the existing SMOKE LAYER and OIL SPRAYER rows (`MOUNT_WEAPONS`), unchanged.
