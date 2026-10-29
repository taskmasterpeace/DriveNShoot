# WEB_WATER_LIFE — waves, the things under them, and the places in them

**Status:** v1 built on `feat/web-water` (2026-10-28). Owner: the WATER lane.
**Code:** `web/src/world/waves.js` (the surface), `web/src/systems/sealife.js` (the creatures), `web/src/systems/diving.js`
(how deep a breath goes), `web/src/systems/waterplace.js` (the places, the ferry). **Rows:** `web/src/data/waves.js`
(SWELL, WAVES, DIVE), `web/src/data/sealife.js` (SEALIFE, SEA_RULES, WATER_PLACES, FLOODED, FERRIES).
**Agent:** `water action=depth|wave|current`, `sealife action=list|near|spawn|places|stim|dive` (`web/src/agent/sealife-api.js`).
**Renders:** `docs/renders/web/water/` (game camera).

Robert (2026-10-28): *"sharks underwater... the leviathan like octopus thing... maybe just got to run from it... simulate
depth. Since we're looking down... you just saw something large coming from underneath the water, and of course the
sharks have the shark fin and you can see the silhouette sharp from up above... waves and all that good stuff... jet ski...
swimming... hold your breath, it gets darker... I want foam."*

## 1. Overview

Water was a flat, tinted sheet with a scrolling ripple map. Now:

- **The surface moves.** One sum of six Gerstner waves (rows) lifts every water sheet on the GPU and shades every pixel.
  - The streamed world's region and L1 sheets and the island's river and lake all move.
  - The kind sets the scale: sea swell, lagoon chop, lake chop, a river that barely heaves and runs with its current.
  - Whitecaps break where the surface pinches; surf bands run up the shallows; colour deepens by Beer-Lambert absorption.
- **The same sum answers `waveAt(x, z, t)`.** Hulls sample it at bow, stern, port and starboard to heave, pitch and roll.
  A waterbike flies off a steep crest. A deck rider feels the swell through `decks.feel()`.
- **Wakes and splashes** are one pooled InstancedMesh of foam puffs; blood in the water is the same pool, tinted.
- **Depth you can see.** Anything below the surface is a silhouette, faded and blurred by its depth (a mip-bias blur).
  A big thing rising is a growing, sharpening shadow.
- **Diving** has a depth now. Held under, you sink. The view darkens and closes in, sound goes thick, breath drains
  faster the deeper you are, and you gasp coming up short.
- **Creatures that sense, never know:** sharks (fin, silhouette, blood, circle, strike), THE DEEP ONE (a vast shape that
  rises under what it heard, arms that reach for swimmers and small boats), bait-fish schools that scatter, gulls over them.
- **Water places:** THE DEEP WATER, THE DROWNED BLOCKS (a beach town's roofs and water tower out of the swell), GULL KEY
  (dry ground in calm water), rafts, and a cable ferry on the island's river. River current carries drifting hulls and
  swimmers.

`depthAt` stays THE water authority (dry | wade | swim). Waves only say how the surface over that depth is moving.

**Ultra-Water licence decision.** `Humpalumps/Ultra-Water` is MIT (Copyright 2026 Humpalumps); copying with credit would
be allowed. We did **not** copy code. Its architecture doesn't fit ours:
- it uses a 4-cascade Tessendorf FFT on a camera-centred polar grid with planar reflections and caustics;
- we have per-chunk 4 m sheets seen from straight above, a 150 draw-call budget, and gameplay that must read the same
  surface on the CPU.

We re-implemented three of its ideas in our own code:
- the Gerstner pinch budget (steepness shared so a crest never folds);
- foam from the surface's Jacobian;
- Beer-Lambert absorption by depth.

The sine-free hash in the shader follows Dave Hoskins' "hash without sine" (MIT), credited in a comment.
The reference video (Dan Greenheck's three.js ocean) set the look: teal water, white streaks on the crests, a V of foam
behind a boat.

## 2. Player Fantasy

- You open the throttle on a waterbike off Meridian's beach. The sea is teal and alive: whitecaps along the swell, the bike
  slapping crest to crest, sometimes clear of the water, a white V spreading behind you.
- You swim out past the break. A fin cuts the surface twenty metres off. It came because you're bleeding.
  - It circles, close and closer, then comes at you.
  - You can put rounds into its back while it's near the surface; the water eats the rest.
  - Or you can swim for the shallows, where it won't follow.
- You cross THE DEEP WATER in an airboat. The water under you goes dark, and the dark is a SHAPE, growing.
  - You have seconds. Run for the shore: it can't follow into shallow water.
  - Or stay and watch the arms come up.
- You dive for something on the bottom. Every metre the light closes in and the world goes muffled. You come up gasping.
- You pole a raft across the Colorado Remnant. The current takes you downstream while you push for the far bank.

## 3. Detailed Rules

**Waves (`world/waves.js`).**
- **The rows.** `SWELL` holds six components: direction, wavelength (4.9-62 m), amplitude share and steepness q.
  `WAVES.kind` holds amp, chop, shoal and foam per water kind:
  - ocean 0.62 m · lagoon 0.16 · lake 0.12 · river 0.05 · canal 0.035 · swamp 0.012.
- **The kind at a point:**
  - the island's lake or river (an analytic depth for the lake);
  - else the region's water kind (Florida's WK: swamp, canal, lagoon, ocean);
  - else L1's row kind (river, creek, canal, lake, reservoir).
  - The deeper source wins, as in depthAt.
- **The sheet:**
  - The vertex shader lifts the sheet by `amp` plus the long components (L >= 16 m), so troughs rest at the old level.
    A region's sea lies on flat ground, so a trough below it showed sand.
  - The fragment shader recomputes all six components plus eight analytic fine ripples for the normal, so the chop has no
    lattice at any zoom.
  - It also computes crest light and trough dark, whitecaps (Jacobian under `whitecap` x a lace streaked along the swell
    x the kind's foam), surf bands where depth < `shoreFoam`, and Beer-Lambert colour for a region's water.
- **Precision.** Florida is 225 km from Phoenix.
  - Wave phases are taken relative to a snapped origin (`uWO`), and each component's phase there is worked out on the
    CPU in doubles (`uWP`).
  - Noise uses a sine-free hash on a 289-cell wrapped lattice.
  - Without this the GPU's `sin()` of huge arguments smeared the sea to blur.
- **Calm discs.** Up to four: `waves.calm`, the shader's `uCalm`. They still the water round a key, so a mound
  0.12 m above rest stays dry.
- **Hulls (`ride`).** Called from vehicles.js for a boat each frame:
  - It samples four points to get heave, pitch and roll, and adds speed squat and lean into turns.
  - A waterbike faster than `airSpeed` whose face rose faster than `airVy` leaves the water at `airLift` x that speed.
    It lands with a splash and a `waveLand` jolt that `decks.carry` feels as a landing.
  - `waveFelt` (vertical acceleration and roll/pitch rate) adds to a deck rider's felt force: a big swell staggers a
    standing rider, using the existing `decks.feel` thresholds.
- **Current (`currentAt`).**
  - Island river: downstream along its polyline, `WATER.flow` x (edgeK + (1-edgeK) x depth/2.8).
  - L1 river or creek: along its own points (canals 0.3x).
  - A drifting hull takes all of it, a driven hull 60%, a swimmer all of it.
- **Wakes.** A boat under way lays a stern churn (stretched along its heading) and two V arms running out sideways, every
  `wake.every` s. A swimmer kicking lays small puffs. A puff fades in within 0.06 s and out over its life, drifts and
  spreads. A splash is a ring of puffs plus spray, and is also a `splash` stimulus in the water.

**Sea life (`systems/sealife.js`).**
- **The director** runs every `tick`. It samples a 9x9 grid over the spawn square for water each species can live in
  (kind, minDepth), and keeps `perKm2 x area` (capped at `max`) of each. Spawns land only outside `inView` (the camera's
  view x 1.8 + `spawnPad`). Creatures past `despawn` and out of view are put away.
- **Stimuli** live in a fixed 96-slot ring:
  - blood: a wound taken by anyone in the water, scaled by the damage; a body keeps bleeding;
  - kick: a swimmer moving at the surface;
  - splash: anything going in, or a hull landing;
  - engine: a boat under way, every second;
  - shot: main.js `noise()` over water.
- **Sense:** within `smell x sqrt(str)` for blood, `hear x sqrt(str)` (x `engineHear` for engines) for the rest, and
  `see` m of sight for a person in the water. A creature acts on the strongest by str/distance, or on what it sees. It
  never reads the player's position.
- **Shark:**
  - cruise (fin up, 0.32 m) → investigate (to the sense) → search (circles the spot `search` s) → circle (a target in
    reach: laps tighten from r0 to r1, fin up) → strike (bite, blood, splash, back off a lap) → flee (under `flee` of its
    hp, deep).
  - It never follows into water shallower than `minDepth x 0.75`, and never takes someone on a deck or in a boat.
  - Rounds hit it only within 1.6 m of the surface, with damage x e^(-bulletDepthK x depth). A blast hurts it too.
- **The deep one** lives only in its place's disc and in water at least `minDepth` (6 m) deep:
  - patrol (6.5 m deep, a slow loop) → rise (it heard something in its water: it swims under it while rising to 3.2 m
    over `rise` s; the shape grows the whole time) → reach (arms up through the surface) → hold → sink → patrol.
  - Hold: a swimmer is dragged and drowned (`grab` dps, breath) and let go after `grabHold` s. A small boat (`boatMax`)
    is hauled and pulled under (vehiclesSys.sink). A bigger hull is only shaken.
  - Out of its water (shallower than minDepth, or off its disc) it lets go and sinks.
  - Fire on the water over it, and blasts in reach, add to `hurtFire`. At `driveOff` it goes `away` for `away` s.
  - Rounds into an arm make that arm let go at `armHp`. Small arms never kill it (hp null).
- **School:** silhouettes swirling round a centre. Anything moving within `scatter` (a kicking swimmer, a hull under way,
  a shark) scatters it.
- **Gulls** wheel over a school (half the sea schools get a flock) and flush when you come within 6 m.

**Drawing.** All of it is pooled InstancedMeshes, hidden when empty:
- one silhouette mesh with a four-shape atlas;
- fins;
- the deep one's arms (8 x 8 segments);
- gulls;
- the wake puffs.

A diver (characters.js sinks their body under the sheet) is drawn as a fading silhouette. Swimmers ride the drawn
swell (`waveY`). The water, fins, arms and gulls opt out of the cutaway (it was dithering the lifted sea away round the
player).

**Diving (`systems/diving.js`).** Ctrl while swimming (the existing dive under):
- `diveD` grows at `descend` to min(`maxDive`, bottom - `floor`); letting go, you rise at `ascend`.
- Breath drains 1/20 per s x (1 + `drainPerM` x diveD).
- A full-screen quad in the scene darkens and narrows the view by depth (so a world screenshot shows it).
- `audio.muffle()` puts a lowpass on everything.
- Surfacing with breath under `gaspBelow`, you gasp (a sound and a `gasp` event).
- Swimmers still can't shoot (main.js, unchanged).

**THE NASTY WATER (`systems/swamp.js`, rows `SWAMP`; Robert, 2026-10-28: "alligators, swamps, piranhas, seaweed.
Like the nasty looking water.").** Swamp-class water is a region's slough or a canal.
- **Its surface** (world/waves.js): duckweed and scum in drifting rafts, algae clouds under them, oily black slicks on a
  canal. The film flattens the ripples, kills the shine and takes the whitecaps. The masks are two noises on rotated
  lattices, so no grid shows.
- **Round you** (one instanced mesh each, rolled per 6 m cell as a pure function of the cell, so it never reshuffles):
  lily pads, cypress knees (sloughs only), weed strands swaying just under the surface, rot bubbles coming up, and low fog
  lying on the water (opacity rises with the night and peaks at first light, about 06:00).
- **Murk:** a silhouette's 63% depth is x `murk` (0.14) in it, so nothing shows until it is right at the top.
- **The survival cost:** wading or swimming in it with an open, unclean wound adds `dirtPerSec` of dirt (x1.6 swimming);
  survival.js turns dirt 1 into an infection. You wade at `wadeSlow` speed.
- **Oil "near industry":** there is no industry map in the web engine yet, so slicks ride canals (the roadside water).

**Piranhas** (`SEALIFE.piranha`, form `swarm`, warm still water: swamp and canal).
- Idle: a few dark flecks deep in the murk.
- It senses blood (`smell` x sqrt(str)) and kicks and splashes (`hear`). It ignores engines and shots (`ignore`) and has
  no sight in that water.
- Frenzy: it races to the sense, rises to 0.12 m, boils the surface (foam and spray every 0.12 s), and nips everyone in
  the water within `reach` every `biteCd` s. Each nip is more blood, so it feeds itself while you stay in.
- It calms `frenzy` s after its last sense. It never bites a hull or a deck rider.

**Alligators: built on, not forked.** Florida's gator is a FAUNA row (data/regions.js, taken over by systems/fauna.js
`brainGator`). It already:
- basks on the bank by day and lies at the edge by night with just its eyes out;
- hisses and slides in when you come near on land;
- lunges only at something on the bank within `lungeRange`, then death-rolls and drags it toward the water;
- is slow on land (`land` 3.2 m/s).

This lane adds the check that it never strikes from beyond that range.

**Senses with memory** (the pattern the zombies use): every creature keeps `mem` (where, what, when). A shark searches the
remembered spot for `search` s; the deep one gives up 12 s after its last sense; a swarm calms `frenzy` s after.

**Water places (`systems/waterplace.js`).**
- **Placement.** Rows are placed off a region's coast: `near` a holdout, `dz` along the coast, `off` metres seaward of
  the shore.
- **Building.** Each place's mesh is one merged, vertex-coloured mesh, built within 900 m and dropped past 1200 m. Its
  walls go into `statics.extra`: boats meet them, while the island hash and nav grids never see them.
- **THE DROWNED BLOCKS:** a street grid of lots, walls from 6 m under to 5-14 m over, window bands, roof sheds, a water
  tower.
- **GULL KEY:** a sand mound, wreck boards, a ruined bait shack, a fallen mast.
  - It is dry ground through `EXT.dry` in world/water.js, so depthAt is 0 there and you stand on it.
  - It sits in a calm disc.
- **Rafts** and the **ferry** are vehicle rows (`raft`, `ferry`, `noEngine`) with deck rows (`raftDeck`, `ferryDeck`).
  - The ferry shuttles its two landings on its own, waits `wait` s at each, and holds its cable line against the current.
  - A raft drifts with the current unless you pole it.

## 4. Formulas (with an example)

- **Wave height:**
  `h(x,z,t) = amp + Σ amp·a_i·(short_i ? chop : 1)·sin(k_i·(p − O) + φ_i(O,t))`, with
  `φ_i = (k_i·O + ph_i − ω_i·t) mod 2π` and `ω_i = sqrt(9.81·k_i)·speedK`.
- **Shoaling:** `amp = kind.amp · sea · smoothstep(depth / kind.shoal) · calm`, where
  `sea = 1 + storm·1.5 + rain·0.35 + clouds·0.15`.
- **Pinch:** `J = 1 − Σ st_i·(amp/0.62)·sin(θ_i)`, with `st_i = q_i·a_i·0.85 / Σ q·a`. A whitecap is
  `(1 − smoothstep(white − 0.1, white, J))` x lace.
- **Silhouette:** `alpha = a0·e^(−depth/d63)`, `blur(mip bias) = depth·b·4.5`. The rows are:

  | Shape | a0 | d63 | b |
  |---|---|---|---|
  | shark | 0.85 | 2.6 | 0.55 |
  | deep one | 1.0 | 6.5 | 0.2 |
  | fish | 0.75 | 1.6 | 0.6 |
  | swimmer | 0.85 | 1.8 | 0.6 |

- **Example, a shark smelling blood.** A swimmer takes a 14-point wound, so blood `str = 0.5 + 14/12 = 1.67` and the
  smell range is `70·sqrt(1.67) = 90 m`.
  - A shark 42 m off investigates within a second (the selftest's near case).
  - One 112 m off never knows (the far case).
  - At cruise depth 0.32 m its silhouette alpha is `0.85·e^(−0.32/2.6) = 0.75`, sharp, with the fin up.
- **Example, the deep one.**
  - At patrol depth 6.5 m its shape alpha is `e^(−1) = 0.37`; risen to 3.2 m it is `0.61`.
  - From the first sense to the first reach is at least `rise` = 5 s (measured: 11 s from 70 m out).
  - An airboat at 34 m/s against its 6.5 m/s leaves the 420 m disc in about 13 s.

## 5. Edge Cases

- **A boat under a bridge deck:** depthAt is asked with y = -Infinity (as before), so a hull rides under a deck.
- **Shallows:** amp fades to 0 over `shoal` m of depth, so nothing lifts through the sand. Surf bands take over.
- **A key in open water:** dry patch plus calm disc. The chunk's nav grid still thinks it is sea (walkers don't path
  there; you can walk it).
- **Teleporting 220 km:** the first frames there have no chunk yet; depthAt falls back to the pure function. The selftest
  waits 2.5 s on arrival.
- **Battery isolation:** sea life and the ferry are off for the battery (like fauna). Their own checks switch them on.
  God mode is lifted only for the two shark checks.
- **The player in god mode** isn't hurt, so there is no blood stimulus. Blood comes from a real hp drop, never a flag.
- **Bullets** don't hit drowned walls (statics.extra is a movers-only list), and don't reach a shark deeper than 1.6 m.
- **Night:** silhouettes are dark on dark water: at night you see the fin, not the shape. Wake foam is dimmed by the sky.
- **Precision:** see §3. Wave phases are exact anywhere in the country.

## 6. Dependencies (both ways)

**Uses:**
- world/water.js: depthAt (the authority), surfaceAt, streamMat, mat, the new `EXT.dry`, the exported `RIVER`;
- world/regions.js: regionAt and regionWater for the kind;
- world/rivers.js: sample, for the L1 kind and the flow tangent;
- systems/sky.js (`cur` weather, `night`), systems/decks.js (feel, carry), systems/combat.js (damage),
  systems/throwables.js (fires, blast), systems/vehicles.js (spawn, sink, remove), systems/audio.js (burst, the new
  muffle), engine/collision.js (`StaticWorld.box`, `statics.extra`).

**Shared-file hooks (exact):**

| File | Hook |
|---|---|
| `main.js` | 3 imports (+1 Waves); `this.waves = new Waves(this)` after the Water; `this.sealife`, `this.waterplace`, `this.diving` before the fauna; `waves.update`, `waterplace.update`, `sealife.update` after `water.update`; `sealife?.onNoise` in `noise()`; `waves.swimmer` and `diving.step` after `p.underwater` is set; the breath drain `x diving.drainMul(p)` |
| `world/water.js` | `export` on RIVER; `EXT.dry` (two checks); a `waveAt()` method |
| `systems/vehicles.js` | the boat bob replaced by `g.waves.ride(...)` (old code kept as the fallback); `raft` and `ferry` rows |
| `systems/vehiclebodies.js` | `raftBody` and its dispatch; no lamps on a raft or ferry |
| `systems/decks.js` | `+ waveFelt` in the felt force; `waveLand` counted as a landing |
| `data/decks.js` | `raftDeck`, `ferryDeck` |
| `systems/combat.js` | `sealife.raycast` after the fauna's; a `kind === 'sea'` branch |
| `systems/throwables.js` | `sealife?.blast` |
| `systems/audio.js` | a master lowpass (`muffleF`) and `muffle(hz)` |
| `main.js` (swamp) | `import { Swamp }`; `this.swamp = new Swamp(this)`; `swamp.update`; walking speed `x (p.swampSlow ?? 1)` |
| `systems/characters.js` | the swim pose rides `waveY` (and sits 0.45 m higher, so a swimmer's back shows) |
| `systems/vehicledamage.js` | `noEngine` hulls aren't stopped by an empty tank |
| `data/water.js` | the ocean's region colour, teal |
| `agent/api.js` | import, `...sealifeCommands`, `sealifeChecks` before `waterChecks`, sea life and the ferry off for the battery and restored |
| `agent/water-api.js` | `action=` on `water` |

**Used by:** the selftest; the World Forge can call `validateWaves` and `validateSealife`. The z-fight lane's depth
layers: the wake (renderOrder 3, +0.06 m over the drawn sheet, polygonOffset) and the silhouettes (renderOrder 2,
+0.05 m) follow its law of a layer drawn on the water. When WEB_DEPTH_LAYERS lands, map them to its named bands.

## 7. Tuning Knobs (safe ranges)

**`data/waves.js`:**
- swell: SWELL rows; `qBudget` 0.6-0.95;
- kind amps and chop: ocean 0.3-1.2, lagoon 0.05-0.3, lake 0.05-0.3, river 0-0.12; `sea.storm` 1-2.5; `speedK` 0.6-1.4;
- look: `whitecap` 0.45-0.75 (lower: fewer caps); `crestLift` 0-0.4; `shoreFoam` 0.4-1.5;
- ride: `airSpeed` 8-18, `airVy` 0.8-2.5, `airLift` 1-2.5, `feltK` 0.5-3;
- wake: `pool` 128-512, `every` 0.04-0.15, `life` 2-7, `vee` 0.3-1.6;
- `DIVE`: descend 0.6-2, maxDive 4-15, drainPerM 0-0.2, dark (surface, per m, most), narrow, muffle Hz, gaspBelow 0.3-0.9.

**`data/sealife.js`:**
- shark: smell 0-300, hear, see, bite, circle, flee, bulletDepthK 0.8-3;
- the deep one: rise >= 3 (validated), reach, grab, grabHold, drag, armHp, driveOff, away, boatMax;
- `SEA_RULES`: tick 0.5-4, spawnPad 12-60, spawnFar 120-400, despawn 200-600, bloodLife 20-120;
- places: dz, off, r / w / d;
- `FLOODED`: lots, sizes, heights, colours;
- `FERRIES`: a, b, speed 0-8, wait.

## 8. Acceptance Criteria (the named selftest checks: `web/src/agent/sealife-api.js`)

1. **water: the rows are valid...** validateWaves and validateSealife are clean (no purple, the deep one's rise is at
   least 3 s). waveAt is pure (same place and time, same answer; a different time, a different answer). The island
   river's current runs downstream, the lake has none, dry land has no kind.
2. **water: a boat's heave, pitch and roll follow waveAt...** Over 12 samples a gunboat on the open sea matches pitch
   from waveAt (0.03 rad) and height (0.25 m), and its heave spans more than 0.15 m.
3. **water: a wake trails a moving boat... and a waterbike leaves a crest in the air.** After 4 s flat out, at least 20
   puffs lie behind the track and none ahead. Within 10 s at least one wave-air.
4. **water: a swimmer's view darkens and closes in with depth...** The dive deepens by more than 2 m; darkness rises by
   more than 0.15 and the clear circle shrinks; breath drains by more than 0.15 in 4 s; the sound is muffled under, and
   lower deeper; it clears on surfacing; a gasp when short of air.
5. **sealife: a shark is drawn to blood within its smell range and not from beyond it.** Still, wounded swimmer: at
   1.6x smell, nothing; at 0.6x smell, it investigates the blood.
6. **sealife: a shark circles... then strikes...** It circles, bites, and flees when shot near the surface.
7. **sealife: a cruising shark shows its fin above the surface and its silhouette under it.** A fin drawn above the
   drawn sheet, a silhouette drawn with alpha above 0.55.
8. **sealife: THE DEEP ONE is announced...** The grab comes at least `rise` s after the rise began. Its shape never
   drops below 0.3 alpha during the rise. No arm shows before the reach. A held swimmer is let go.
9. **sealife: an airboat outruns THE DEEP ONE to shallow water.** It rises under the engine, the airboat runs, no grab,
   and the boat ends shallower than minDepth or off the disc.
10. **water: a raft carries a standing rider down a river's current.** The raft drifts more than 3 m downstream in 8 s
    and the rider stays on its deck, moving with it.
11. **sealife: nothing spawns in view.** At least 2 spawns, none inside the camera's view.
12. **sealife: piranhas swarm only on blood or splashing.** A still swimmer in the I-95 canal and an engine plus a shot
    stimulus beside the swarm: it stays idle. A 10-point wound: frenzy within 4 s, at least one nip, the swimmer hurt.
13. **sealife: a gator strikes only what is within its edge-ambush range.** A man on the bank `lungeRange` + 5 m out:
    no lunge from beyond range (it may stalk closer on land). At 2.5 m: it lunges. Every lunge's distance is at most
    `lungeRange` + 0.6.
14. **water: THE NASTY WATER.** In the canal at 05:54: the dressing is near (pads, fog). An open laceration takes dirt in
    4 s. A fish 0.8 m down is under 0.05 alpha (it is over 0.3 in the sea). You wade at `wadeSlow`.
15. **water: the water places stand where their rows put them.** Gull Key is dry and calm; the drowned blocks are built
    with at least 6 walls and stop an airboat; the ferry makes a crossing.

**Also:**
- `scenario name=stress` doesn't regress: before 7.51 / 6.86 ms, 90 / 89 draw calls; after 6.84 / 7.11 ms, 88.
- Draw calls stay under 150 at sea with sharks, gulls, the deep one and a wake.
- `ip-lint` reports 0 deny.

**Not done (follow-ups):**
- a speargun item, and harpoon hits on sharks;
- standing on the drowned roofs (they are walls in the water, not floors);
- shark meat;
- a river-row ferry outside the island;
- the deep one dragging a swimmer under with the camera following;
- caustics on the shallow bottom.
