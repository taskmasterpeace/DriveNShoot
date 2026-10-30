# WEB_MOVE_TOW — the moves, better boats, towing

Lane: MOVE-AND-TOW. Branch `feat/web-move-tow`. Port 3510.
Code: `web/src/data/moves.js` + `web/src/systems/moves.js` (the moves); `web/src/data/towing.js` + `web/src/systems/towing.js`
(lines, the winch, mud, the boat trailer); `web/src/systems/movetowbodies.js` (the boats, the trailer, the wrecker);
`web/src/agent/movetow-api.js` (the `move` and `tow` commands, the checks).

## 1. Overview

Robert, 2026-10-29: *"for the movements, we're supposed to have the diving and all that stuff. So it might be cool to be
able to do some cool stuff there. And we need the boats to look a little better... And we need towing and all that stuff."*

This lane adds three things.

- **Moves.** SPACE (pad A) is one verb that reads the ground ahead. A waist-high wall, a fence rail or a car's hood: **vault**.
  Chest high: **climb over** (slower). At a sprint at the lip of a gap: a **running jump**. Crouched: a **combat roll**.
  On a roof deck's edge: **drop-hang**. Anything else: a **dive** that lands you **prone**. CTRL at a sprint is a **slide**.
  Every move is a row: its time, distance, stamina, noise, body height and what you are at the end.
- **Better boats.** The airboat, the waterbike and the raider gunboat are rebuilt on lofted hulls: real cross-sections with
  a raked bow, chines, flared sides, a gunwale cap and rub rail, a transom and an open cockpit sole. Their wear is painted
  in: anti-fouling under the waterline, a boot stripe, oxidised and rust-streaked topsides. Two new boats: a **fishing skiff**
  and a **pontoon barge**. They share one builder with a **boat trailer** and a **wrecker** (a tow truck with a boom).
- **Towing.** A tow rope and a tow chain are items you carry. The winch is part of a vehicle (the wrecker's, or the
  workshop's). Lines are springs that only pull: slack, taut, and they part over their break load. The wrecker's boom and
  a trailer's hitch are rigid bars: the towed body swings on the pivot. Mud pits hold a car that spins in them, and a pull
  frees it. A gate or a static wreck can be dragged off the road. A boat trailer launches its boat at any shore deep enough,
  and hauls one back up.

## 2. Player fantasy

Rounds kick up dust. You throw yourself flat behind the low wall, and two of the next five go over you. You roll to the
car, vault its hood and run. When the truck dies in the river mud, you don't despawn it. You walk back with a chain, or you
bring the wrecker, hold G and listen to the winch take the strain. You pull it out and tow it home behind you, slow and
careful, because the rope you brought last time snapped when you gunned it. At the lake you back the trailer down the bank
until its tail is wet, tap G, and the skiff floats off.

Scarcity, distance and consequence all bite harder. A line is a thing you have to find and carry, and it can break. A dead
car isn't lost any more, but getting it home costs a trip, fuel and time on the road.

## 3. Detailed rules

### 3.1 The verb (systems/moves.js `verb`)
1. On a deck: at a roof deck's edge (within 0.7 m), drop-hang. Anywhere else on a deck, dive (an open bed's rail goes over, as before).
2. Probe ahead along your movement (or facing) for `PROBE.reach + radius` (1.3 m):
   - vehicles (not in the static grid): the chord through the body's rectangle. Across the front or rear 35% it is the hood
     or tail (`tall x 0.62`); across a closed cabin it is the roof (`tall`).
   - static boxes (the raycast, plus `statics.extra`): the first box, its height above its own base, its depth along the line.
   - `vault` if h <= 1.25 and depth <= 2.6; `climb` if h <= 1.75 and depth <= 1.2. The landing must be free (no box, no
     vehicle), or there is nothing to go over.
3. Nothing ahead: a gap (water deeper than 0.7 m, or ground more than 0.8 m lower) that starts within 1.6 m and ends within
   3.2 m is a `jump` if you are sprinting faster than 5.5 m/s.
4. Crouched: a roll. Otherwise a dive.
5. CTRL pressed while SHIFT is held and you run faster than 5.5 m/s: a slide.

### 3.2 A committed body
`c.mv = { kind, t, dur, ... }` holds the body for the row's `dur`. It doesn't shoot or turn, except during a dive, which still
shoots (the old dive did). Vault, climb and jump move along a fixed line to the landing the probe found. Dive, roll and
slide move through the world's boxes, so a wall stops you and a door gives. A dive into a window goes through it (the
interiors' vault takes over). A dive keeps the old `c.dive` flag so doors, windows and deck rails answer it as before. At the
end: `ends` (a dive tries `setProne`; in water or a cabin you land on your feet), a cooldown, the `dived` / `moveDone` event.

### 3.3 Honest cover from being low (`LOW_BODY`, combat.js `segment`)
A round whose line crosses a body's circle meets it with probability `share`. A standing or crouched body is always 1.
A prone, diving, rolling or sliding body uses its row's `bodyH`. There are no i-frames anywhere: the old "60% of rounds miss
mid-dive" coin is gone. It is replaced by this rule, which treats a prone man and a diving man the same way.

### 3.4 The boats (systems/movetowbodies.js)
- `loft()`: stations from stern to bow. Each station is the profile `prof(u)`: sheer half-beam and height, chine half-beam
  and height, keel height. From these it builds the outer skin (four panels per station pair), the transom, and inside the
  `open` stretch the side's inner face, a gunwale cap and the sole (else a deck at the sheer). Triangles are wound outward
  against a reference point. Vertex colours run through `wear()`.
- airboat: a flat-bottomed scow with a blunt raked bow; the raised chair on a tube stand; the engine on its stand (block,
  heads, radiator, stacks, air cleaner); a cage of two hoops, eight spokes and a mesh of chords; a two-blade prop with gold
  tips; twin rudders on a tie bar; a push pole and a gas can.
- waterbike: a deep-V decked hull; the nose cowl, the handlebar pod with its gauge; a stepped saddle, footwells, the pump nozzle, a stripe.
- gunboat: a deep-V work hull, plate welded on with rivet rows, the wheelhouse under the old greenhouse, a pintle gun with a
  shield in a ring of sandbags, twin outboards, drums, the lockbox, tyre fenders, a spotlight and a whip aerial.
- skiff (new row): a planing V hull, two thwarts, a side console with a wheel and a windscreen, a tiller outboard, a fish box,
  a coil of net, oars, rods.
- barge (new row): two pontoon tubes with nose cones, a plank deck, rails with a bow gap, a bimini canopy, benches, a helm,
  crates, a drum, an outboard.
- boattrailer (new row): rails, an A-frame tongue and coupler, a jack, chains, an axle under fenders, carpeted bunks, keel
  rollers, the winch post with its drum, crank and strap, a light bar.
- towtruck (new row, `look: 'wrecker'` over the pickup body): an A-frame mast, the boom, its ram, sheave, cable and hook,
  the wheel-lift, toolboxes, a coil of chain, an amber beacon bar, a heavy front bumper with the winch drum.
Each is ONE merged mesh (1 draw call), with every deck height and seat kept where `data/decks.js` and `seatLocal` already expect it.

### 3.5 Lines (systems/towing.js)
- A line joins `a`'s end (`aEnd`: -1 its tail, +1 its nose) to `b`'s nearest end, or to a gate or a wreck.
- Rope and chain are tied off with `tieSlack` (0.4 m): you take up the slack as you hook on.
- `pre(dt)` runs before anything drives. For each non-rigid line:
  - stretch = span - len. If it is positive, F = max(0, k x stretch + damp x separating speed).
  - F changes both velocities by F/m. On a driverless towed body it also gives a turn: torque = r x F, inertia
    m x len² x 0.09.
  - Past `maxStretch` the line is a hard stop.
  - `loadS` is F smoothed at `filter`. When it passes `breakLoad` the line parts (`towSnapped`): sparks, a noise, the item gone.
- `post(dt)` runs after everything drives.
  - Bars place their body on the pivot behind the puller, nose first, swinging no further than 1.35 rad.
  - The boom lifts the front (two wheels down, `liftedDrag`).
  - Boats ride their trailers, a haul winches a boat up the bunks, and every line is drawn: one InstancedMesh of
    segments that sag when slack.
- A towed body rolls in neutral (`towedDrag`, x`deadDrag` for a burned-out car). It is never on its park brake.
- The linked pair never collides with itself.
- At the wheel:
  - Tap G: hitch what is behind. A trailer takes the hitch; the wrecker uses its boom; otherwise it takes the chain if you
    carry one, else the rope, from your pack or the trunk. Tap G again to drop it, and the line goes back in your pack.
  - Hold G (>0.4 s) with a winch: the cable to the nearest thing ahead within 30 m, reeling in while held. The puller's
    brakes hold. The drum stalls over `stallLoad`.
  - With a boat trailer at the water, tap G: launch the boat, or haul up a boat at the tail.
- A gate on a line comes down past `gateLoad` (the kit's breach). A static wreck on a line becomes a live dead car: its
  batched instance and collider go, the record is marked `gone`, and the line holds it.

### 3.6 Mud
Only a pit (a row `{ x, z, r, depth }`) holds a car. The lake's south-west shore has one, and `tow action=mud` stages more.
In a pit the engine loses `softPower` and the wheels drag `soft`. Spinning there (throttle held under 3 m/s), bog grows at
`sink`. Past `stuckAt` the car is BOGGED: a toast, the prompt, `bogged`. A line's tension lowers bog by
`F / (m x pullFree)` a second. Under `freeAt` the car is out (`unbogged`). On firm ground bog drains at `firm`.

### 3.7 The ramp
A ramp is any shore where the trailer's tail stands in at least 0.3 m of water while its middle is no deeper than 0.95 m. At
a ramp a carried boat floats off backward (`launch`, pushed at 2.2 m/s). A boat at the tail, slow (< 2.5 m/s) and lined up
(< 0.55 rad), is winched up at 1.2 m/s until it sits on the bunks (`haul`).

## 4. Formulas

- **Low body:** share = lerp(max(0.3, bodyH / 1.8), 1, clamp01((4 - d) / 4)).
  - Prone (0.45 m) at 20 m: max(0.3, 0.25) = **0.30**. At 2 m: 0.3 + 0.7 x 0.5 = **0.65**.
  - Mid-dive (0.75 m) at 20 m: **0.42**.
- **Line tension:** F = max(0, k·s + c·ṡ). A rope tied 0.4 m slack behind a pickup (mass 1.8) towing a dead sedan (1.5) at
  full throttle: F ~ 17 / (1/1.8 + 1/1.5) = **13.9** steady, under the rope's **21**. The same pull on a dead armored carrier
  (6.0): F ~ 17 / (1/1.8 + 1/6) = **23.5**. The rope parts; a chain (100) holds.
- **Bog:** at depth 1 and full throttle, bog grows 0.55/s, so a car is stuck about a second after it stops making headway.
  A winch at F = 30 on a sedan (1.5) frees it at 30 / (1.5 x 22) = 0.9/s: about a second of real pull.

## 5. Edge cases

- A dive that would land prone in water or in a cabin lands you on your feet.
- A probe that finds a fence with a car parked right behind it finds nothing to vault. You can't vault into a car.
- A moving vehicle (> 2 m/s) is never vaulted, and it still hits you.
- Bodies that go away mid-tow release their line (`gone`, nothing returned).
- A line on a gate whose door broke some other way releases.
- A boat on its trailer can't be driven or entered, and neither can a trailer.
- A boat being hauled doesn't collide with its trailer.
- The `dive` command keeps its old contract for agents: it gets you back up after unless `up=false`. The key lands you prone.
- Rain never bogs the road. Only pits do: an earlier draft used the "mud" wear surface and every car in the rain stuck.

## 6. Dependencies

- Uses:
  - `statics` (raycast, `extra`, `pointBlocked`, `resolveBody`), `stance.setProne`, `decks` (roof decks, `dismount`)
  - combat `segment`, `interiors.doors` (gates), `gadgets.breach`, `wrecks` (records, the batched mesh)
  - `inventory` (pack, trunk), `water.depthAt`, the workshop's winch utility (`v.utility.winch`), `vehiclebodies` helpers.
- Shared-file hooks (each one line or a few):
  - `main.js`: construct `moves` and `towing`; `p.mv` steps before the on-foot frame; SPACE goes through `moves.verb`, CTRL at a
    sprint through `moves.slide`; at the wheel `towing.driveInput`; trailers and carried boats are not Drive targets; `startDive`
    delegates; help text.
  - `vehicles.js`: `towing.pre` / `towing.post` around the loop; `towing.ground` (mud) and `towing.drag` (rolling in
    neutral) in `drive`; linked pairs skip vehicle-vs-vehicle collision; a person mid-move isn't shoved by a parked car.
  - `characters.js`: `moveRoot` in the root frame, `ch.mv` in `moving` / `crouch` / the arms mode.
  - `combat.js`: the LOW_BODY share in `segment` (the old dive coin removed).
  - `vehiclebodies.js`: HULLS / LOOKS dispatch, `hullLamps`, `boatBody` removed.
  - `controls.js`: the dive and crouch labels.
  - `agent/api.js`: the import, the commands, the checks, and the `dive` command's new contract.
- Wanted by:
  - The SEMIS lane's hitch, when it lands. `towing.js`'s bar is a self-contained articulated hitch. When `g.semis` arrives,
    a fifth-wheel link can be one more LINES row (`rigid`), or semis can call `towing.hitch(a, b, 'hitch')` for a boat trailer.
  - WATER-PLACE (rafts and ferries can ride a trailer the same way).
  - ZOMBIES (they could vault the same fences through `moves.start`).

## 7. Tuning knobs (safe ranges)

| Knob | Default | Safe range | What it does |
|---|---|---|---|
| `MOVES.dive.dist` / `dur` | 4.0 m / 0.62 s | 3-5 / 0.5-0.8 | how far a dive carries |
| `MOVES.vault.maxH` = `climb.minH` | 1.25 m | 1.1-1.35 | what counts as waist high |
| `MOVES.*.stamina` | 0.08-0.22 | 0.05-0.3 | how many moves a tank buys |
| `LOW_BODY.floor` / `close` | 0.3 / 4 m | 0.2-0.5 / 2-6 | how much being low saves you |
| `LINES.rope.breakLoad` | 21 | 18-26 | under 18 a dead sedan snaps it; over 24 an armored carrier doesn't |
| `LINES.chain.breakLoad` | 100 | 60-150 | |
| `TOW.tieSlack` | 0.4 m | 0.2-1 | longer: snatches part ropes |
| `TOW.towedDrag` / `deadDrag` | 0.3 / x1.8 | 0.15-0.6 | how much a tow slows you |
| `TOW.reelSpeed` / `stallLoad` | 1.3 m/s / 44 | 0.8-2 / 35-48 | the winch |
| `MUD.sink` / `stuckAt` / `pullFree` | 0.55 / 0.55 / 22 | 0.3-1 / 0.4-0.7 / 10-40 | how fast mud holds you, how hard it lets go |
| `TRAILER.tailDepth` / `wheelMax` | 0.3 / 0.95 | 0.2-0.5 / 0.7-1.2 | what counts as a ramp |

## 8. Acceptance criteria (checks in `agent/movetow-api.js`)

1. The rows validate. Every move costs stamina and has a body height above 0. A chain holds more than a rope. The new
   vehicle rows and items exist.
2. A dive on held keys (W + SPACE) carries you 3-6 m and lands you **prone**. From a shooter's line 20 m off, rounds meet
   a standing body ~100%, a prone one ~30%, and a diving one 25-70% (never 0). At 2 m, prone is > 55%.
3. Walking into a 1.05 m fence stops you; W + SPACE **vaults** it (0.3-0.9 s, the event, the far side). A 1.5 m wall is a slower
   climb. A 2.4 m wall offers nothing to go over.
4. W + SPACE beside a sedan's nose vaults its **hood**. Beside its cabin, nothing.
5. Crouched SPACE is a roll (> 1.6 m). SHIFT + CTRL at a sprint is a slide (> 2.5 m). On the RV's roof edge, SPACE
   drop-hangs you to the ground, unhurt and on your feet.
6. G at a pickup's wheel hitches a burned-out sedan with the rope from your pack (it leaves the pack). Held W tows it
   20 m+, slower than the pickup alone. The rope is taut under its break load, and G again gives the rope back.
7. A rope on a dead armored carrier parts (peak over 21). A chain on the same pull holds and drags it more than 6 m.
8. A sedan driven into a mud pit bogs, and held throttle can't get it out. From the wrecker's wheel 12 m off, holding G runs
   the cable and reels it in until it is free (`unbogged`).
9. Backing the rig (pickup, trailer, skiff) into the lake on held S: G on dry land never launches. At the water G floats
   the skiff off, and G again hauls it back onto the bunks.
10. The five boats, the trailer and the wrecker are each one mesh with part ids, under 12000 vertices (the RV is 11820).
    The boats have more than 600. All of them beside a sedan stay under 150 draw calls.

Renders: `docs/renders/web/move-tow/` (from the game camera).
