# DSOA web engine — the Deathlands gap analysis (what stands between today and "the vast world")

**Status:** analysis + plan, 2026-10-27. Written for Robert by a fresh audit of the code on `dsa2/ike-counter` (`2626eb3e`),
the docs (`docs/WEB_ENGINE_PLAN.md`, `docs/RESUME_WEB_ENGINE.md`, `docs/design/WEB_*.md`, `web/AGENTS.md`) and a live
play-through of `localhost:3141` (screenshots below). **Owner of every call marked ☐: Robert.**
**IP law (binding):** `WEB_FAN_SERVICE_BIBLE.md` §1 — we borrow the books' *shapes, verbs, loops and counts*, never their
names, slang, characters or plot. Everything below is written in house vocabulary and must pass `node tools/ip-lint.mjs`.

**Pictures that go with this doc** (`docs/renders/gap-2026-10-27/`):

| File | What it is |
|---|---|
| `01_onfoot_meridian.png` | TODAY on foot, Rust Haven, 08:25, STREET zoom (33 m), camera ~8° off vertical |
| `02_driving_lawman.png` | TODAY in the LAWMAN on Central Ave, STREET zoom (40 m + speed lift) |
| `target_drive_day.png` | DREAM (Directors Palette, nano-banana-2.1, from 02): tilted 3/4 camera, 2–6 storey facades, crew on foot |
| `target_drive_dusk.png` | DREAM: same street at dusk — headlight cones, lit windows, rooftop sentries, burning drums |
| `target_foot_party.png` | DREAM (from 01): close third-person/iso, the player with a revolver at the side, a five-person crew with flags |
| `target_town_wide.png` | DREAM: FAR zoom — a holdout walled with stacked car husks and containers, a war rig at the gate, a dust wall |

The dream frames' HUD text is AI-garbled ("BUST HAVEN"); the shipped HUD is the reference, the frames are targets for the
**world** only.

---

## 1. Overview

### 1.1 What "Deathlands" is (the source, in shapes)
James Axler's *Deathlands* (Gold Eagle, 1986–2016, 125+ paperbacks) is set about a century after a nuclear exchange
ended the old United States. What the reader *feels*, book after book, comes from nine repeating shapes:

| # | The shape | Why it makes the world feel vast |
|---|---|---|
| D1 | **The band.** A small, fixed crew of 6–8 specialists — a one-eyed leader, an armorer who maintains every gun, a medic out of time, a feral kid tracker, a strange man from the past, a partner with a gift — who argue, bleed, and never leave each other behind | you are never alone in a huge empty country; the *crew* is the home you carry |
| D2 | **The machine in the ground.** Sealed pre-war military bunkers hide a teleport chamber. You jump blind, arrive sick, and don't know which corner of the continent you are in | every arc opens in a brand-new region — this is *the* engine of vastness |
| D3 | **Tyrant towns.** Every walled settlement is a little kingdom ruled by one strongman and his enforcers, each with a twisted local law | a hundred small worlds, each with its own rules |
| D4 | **The road and the convoy.** Armored trade wagons crossing the wastes under a hard code of honor | distance is real, travel is a job |
| D5 | **Scarcity you count.** Every round, every meal, clean water, a working gun | small numbers make big spaces feel dangerous |
| D6 | **A poisoned land.** Radiation hot spots you read off a badge, chemical storms that rain acid, ruined cities | the map itself is an enemy |
| D7 | **Mutated life.** Twisted people and beasts, each region with its own | every region feels like a different planet |
| D8 | **Pre-war relics.** Old tech is worth killing for; most of it barely works | the past is a dungeon you loot |
| D9 | **Violence and loyalty.** Grim, fast, frequent gunfights, and an iron code inside the crew | stakes |

DSOA already translates most of these on paper (bible §3.2: ROULETTE + BACKSPIN, HOUSE RULES, FLANK PAY, COLD DEPOTS,
HOT GROUND, CREW CARDS, FIFTY PAPERS) and in the Godot reference build (THE CAROUSEL, rulers, scrip, holdouts).
**The web engine — the mainline since 2026-10-21 — has built the survival, memory and driving spine extremely well, but
has built almost none of D1, D2 and D3, the three shapes that create the "vast world" feeling.**

### 1.2 Where the game is (verified 2026-10-27)
DIVIDED STATES OF AMERICA lives in `D:/git/DriveNShoot/web` (three.js 0.170 + Vite, ~63k lines, 184 agent commands,
selftest 120/120 → ~280 checks, ip-lint 0 deny). The Godot build in `D:/git/carworld` / `DriveNShoot/game` is the
**old** reference and data source only.

### 1.3 Scorecard (code ground truth)
| System | State | Deathlands shape | Grade |
|---|---|---|---|
| Driving, vehicle damage, seats, decks, RV, WHALER harpoon, bikes, ATV, jumps | built deep | D4 | **A** |
| Survival (food, water, rest, bite fever, climate, wounds), HOT GROUND | built deep | D5 D6 | **A** |
| Guns & rounds as things (wear, jams, cleaning, the dead keep guns), 6 guns + 7 throwables | built | D5 D9 | **A−** (gun is held *centered*) |
| Inventory (litres + kg, 81 items, 19-slot paperdoll, trunks, bodies, theft) | built | D5 | **A−** (lists, not grid; no party share) |
| World memory (deeds, witnesses who run home, word that hops, roles ×10) | built, best in class | D3 D9 | **A** |
| Infected kinds, fauna, Howlers, Greyborn/Grapevine | built | D7 | **B+** (few regional mutants) |
| Camera | one rig, ~8° off vertical, north-up, 5 Z-key levels | — | **C** |
| Buildings | walk-in everywhere; storeys only on 18 island buildings, max 4 storeys | D3 | **C** |
| Dialogue | node trees + strangers' 3 live topics + voice groundwork | D3 D9 | **C+** (no checks, no journal) |
| **Party / crew** | followers only reachable from the agent API; no UI, orders, loyalty | **D1** | **D** |
| **The Carousel** (teleport network) | **not built in web** (Godot only) | **D2** | **F** |
| **Tyrant holdouts** | Rust Haven + Meridian (hand-made); no generator, no HOUSE RULES | **D3** | **D** |
| **Breadth of the country** | Arizona I-10 + Florida box; 46 states are atlas rows | D2 D7 | **D** |
| Look | stamped-steel HUD is superb; world is flat-shaded, no post-FX, box people | — | **B−** |

---

## 2. Player Fantasy

*You come to in the cold dark of a ring platform, ring-sick, with five people you would die for groaning on the steel
around you. The blast door grinds open on a state none of you has seen. A one-eyed scout takes the high ground; your
quartermaster counts the rounds you have left out loud — nineteen. Down the mesa a walled holdout of stacked car husks
smokes in the heat: a Keyholder rules it, his bulls check guns at the gate, and his law says no dogs inside after dark.
You have a rig with half a tank and a week of water. Tonight you'll sit around a drum fire on a six-storey rooftop and
argue about whether to sell the crate you found in the cold depot or keep it — and tomorrow somebody in this town will
know your face.*

What the player must feel, and the system that delivers it:

| Feeling | Delivered by (§3) |
|---|---|
| "This is MY crew" — named people with flags, faces, signature guns and opinions about me | G3 Party |
| "I have no idea where I am" — and it's thrilling | G6 Carousel + G8 breadth |
| "Every town is its own little kingdom" | G7 Holdouts |
| "I can climb that ruin and fight floor by floor" | G4 Buildings |
| "It looks like the picture" | G1 Camera + G9 Look |
| "My hero handles a gun like a gunfighter" | G2 Gun carry |

---

## 3. Detailed Rules — the gaps, one by one, each with its plan

Each gap: **HAVE** (code, with refs) → **NEED** → **PLAN** (rows first, then code; each step lands with an agent
command, a selftest check and a scenario — the house rule).

### G1. Camera — angled, wheel-zoomed, mode-aware  (Robert asked for this directly)
**HAVE.** `main.js:1052-1084` `updateCamera`: perspective 42° FOV, near 1, far 600 (`main.js:99`); position
`(look.x, H, look.z + 0.14·H)` → **~8° off vertical, always north-up**. `data/camera.js` ZOOM levels CLOSE/STREET/WIDE/
FAR/HIGH = foot 22/33/55/86/130 m, drive 30/40/64/96/140 m, start STREET, indoor cap 26 m, speed lift 0.75 m per m/s to
175 m. **Zoom is Z / Shift+Z / − / = only. The mouse wheel cycles weapons on foot and does nothing in a car**
(`engine/input.js:33`, `main.js:875-877`). The only tilt is a debug screenshot argument (`agent/api.js:474`).
Consequence (see `02_driving_lawman.png`): buildings read as flat roof rectangles; there is no horizon, no facade, no sense
of height — the single biggest reason the world doesn't feel like the dream frames.

**NEED (Robert's words → rules).**
1. In the car the camera sits **further out by default**; the wheel zooms **in and out**.
2. Getting **out** of the car eases the camera **in** by default; the wheel zooms back out.
3. A **"little angle"** — closer zoom = more third-person/isometric; further zoom = more top-down map.
4. North stays up (WEB_CONTROLLER §3.7: no yaw). Q/E 90° snaps are an optional later knob ☐.

**PLAN.** Replace the 5 fixed heights with one continuous **boom**: distance `D` along a pitched arm, pitch `θ` derived
from `D` (§4.1). Rows in `data/camera.js`:
- `foot: { dMin: 9, dMax: 140, dStart: 20, thetaClose: 50°, thetaFar: 10° }`
- `drive: { dMin: 24, dMax: 175, dStart: 70, thetaClose: 36°, thetaFar: 8°, speedLift: 0.75 }`
- `indoor: { dMax: 26, thetaMax: 42° }`
- `wheelStep: 1.15` (one notch = ×1.15 distance), `remember: true` (each mode remembers the player's last D;
  getting in/out eases to that mode's remembered or start D at `heightRate`).
- **The wheel becomes zoom everywhere.** Weapon cycling moves to **Alt+wheel** (plus the existing 1–6 keys and the pad
  RB). Z / Shift+Z stay as coarse steps over the same continuous D (they jump to the old five named stops).
- **Occluder cutaway** (mandatory once tilted): anything between the camera and the player — wall, roof, upper
  storeys, trees — dither-fades inside a screen circle around the player (shader `discard` on a Bayer pattern, no
  transparency sort). Indoors the walls on the camera side of your room drop to knee height (classic iso cutaway).
- **Spawners stay honest.** `g.viewR` becomes the true ground footprint of a tilted frustum (§4.2), so night hordes,
  clean-ups and the shadow box (`sky.js:128`) never pop in sight.
- **A horizon.** At θ ≥ 30° the top of the frame can show sky: raise `far` to ~1200 at FAR, add the sky gradient + a
  distant-ridge card per region and height fog so the edge of the streamed world never shows.
- **Aim is unchanged in feel:** the cursor still casts to the ground plane (`main.js:395-398`); the "lean toward the
  cursor" moves into screen space so it works at every pitch.
- Agent surface: `camera d= theta= mode=` + `zoom` keeps its five names; selftest checks: wheel zooms in a car; exit car
  eases D from drive to foot; viewR covers the frustum corners; no draw-call regression at the widest tilt.

### G2. The gun at the side  (Robert asked for this directly)
**HAVE.** `systems/characters.js:555-562`: aimed, the firing hand goes to `x=-0.03`, the support hand forward, and the gun
mesh sits on the **centreline** (`:652`) — a gun held dead-center in front of the chest. One-handed, the support hand
just drops. Low-ready long guns lie across the body (`:580-586`). Revolvers swing in the right fist at the side when not
aimed (`:636-649`).
**NEED.** A gunfighter's carry that reads from above and at an angle: pistols **at the hip/side, arm extended from the
shoulder**, long guns **shouldered on the dominant side** (stock in the shoulder pocket, cheek on the stock), and a
**handedness** row (Robert: "left must be left").
**PLAN.** Rows in `data/arms.js`: `carry: { pistolOneHand: { lateral: 0.20, height: 1.35, reach: 0.55 },
pistolTwoHand: { lateral: 0.10 }, longGun: { lateral: 0.16, stockAtShoulder: true } }` and `hand: 'R'|'L'` per
character (5–10% left-handed, stable from the name seed; the player picks in the creator). The IK targets move off the
centreline to the dominant shoulder line; the muzzle ray still converges on the cursor (yaw correction ≤ 4°), so aim
does not change. Barrel visibility from the tilted camera is the acceptance test (§8).

### G3. The crew — party and party management (D1, the heart of Deathlands)
**HAVE.** `systems/seats.js:106-160`: `recruit(c)` makes someone an ally follower with a 99-round pistol; followers trail
(4 m walk / 12 m run), board your vehicle and decks, shoot from their windows within 32 m, and chauffeur. **Nothing in
the game calls `recruit` — only the agent API does.** No roster, cap, UI, orders, roles, loyalty, shared inventory or
save. Dogs are fully built (`dogs.js`, 1181 lines: bond, whistle orders, down/bandage/grave) and are the model to copy.
The cast exists as **design rows**: eight CREW CARDS in `WEB_ATLAS.md` §3.3 (the Wheel Boss, the Static-Ear, the
Quartermaster, the Marsh Kid, the Sleeper, the Thrown Man, the Prospect, the Scrap Smith), each with a signature item, a
flaw, a movement style, cover rule, retreat rule and ammo habit. Robert's decision: **party up to 6**
(`WEB_WORLD_EDITOR_PLAN` §1.1). IP rule: **no more than 4 of the 8 archetypes recruitable into one crew**
(`WEB_FAN_SERVICE_BIBLE` §3.5 row 13) so the set never mirrors the books' band.
**NEED.** A crew you *assemble*, *lead* and *lose*.
**PLAN — CREW v1 (one lane).**
1. **Rows** `data/crew.js`: the 8 CREW CARDS as data (name pool, flag, look, hand, signature item, flaw, skills, AI
   style, values). Plus ~20 generic hireables (drifters, sutlers' guards, freed captives) built from the same schema.
2. **Recruit in play, four ways:** talk (a dialogue `do:` → `crew.join`), hire (scrip/day at a sutler's board), rescue
   (a captive you free asks to come), earn (a role's renowned tier attracts a matching card). Cap 6 + dogs.
3. **The CREW panel (U):** cards with portrait + flag watermark (Robert's flag law: the flag is the card's backdrop),
   health/food/water/rest, gun + rounds, trust bar, flaw, current order. Drag gear between members and the trunk (the
   pack screen gains a CREW column).
4. **Orders (hold U = radial; pad: hold LB + right stick):** FOLLOW · HOLD HERE · TAKE COVER · WEDGE / FILE / SPREAD ·
   FOCUS MY TARGET · FREE FIRE / HOLD FIRE · FALL BACK TO THE RIG · MAN THE GUN · LOOT THIS · STAND WATCH (camp).
5. **Combat brain:** each card's AI style row drives the WarWorld `tactician` port planned in `WEB_ENGINE_PLAN`
   Phase 3 (bounds, peel back, grenade into cover); the existing window-shooting stays for vehicles.
6. **Trust** (§4.4): every deed the world memory already records (`deeds.js`, 17 verbs) moves each member's trust by
   their own values. Low trust = refuses orders, then leaves at dawn with a share; very low + a rival's offer = betrays.
   High trust = a "last stand" (shields you, drags you out when downed).
7. **Mortality:** members go down (bleed-out timer, carry/drag — the drag verb exists), die for good; graves, a memorial
   at your safehouse, the radio obituary (bible PZ row: THE OBITUARY) names them. Same as dogs.
8. **Talk:** barks in fights; **camp talk** at night (sit at a fire or in the RV: 1–2 lines per member drawn from real
   deeds and the chronicle — "you left that man in the canal"); members **interject** in dialogues when their values are
   touched (the Sleeper speaks up for a wounded stranger).
9. **Save/load, shard-safe:** the crew is player-owned state in the save (and in the shard snapshot).

### G4. Buildings up to six storeys
**HAVE.** `data/storeys.js`: storey 3.2 m; town buildings rise by exactly +1 on 30%; ruins rise 1–3 on 45% (≥220 m²) →
**max 4 storeys**, and only the **18 island buildings** get any (`world/storeys.js:47-50`). The builder has no hard cap.
Stairs switch back along a wall, railed holes, floors are separate places for sight/bullets/bites/witnesses, `setView`
hides floors above you. The **ring (2,477 walk-ins) and streamed chunks are single-storey**. `WEB_STOREYS` §0.4 lists
v1 omissions: basements, shooting through windows between floors, noise/blasts through floors, ruined slabs, fire escapes.
The underground lane (`feat/web-underground`, basements + storeys v2) exists on origin, **unmerged**.
**NEED.** A skyline of 2–6 storey buildings you can climb, fight through and stand on — and that *look* tall (G1 tilt).
**PLAN — STOREYS v2 (one lane, after G1).**
1. Merge `feat/web-underground` first (rebase, selftest on the merged tree twice — `dsoa-land`).
2. Rows: `RISE` per zone with a 6-storey cap (`maxAbove: 5`): downtown hotel/office kinds 4–6, the Strip 1–3, houses 1–2,
   industrial 1 + mezzanine. Enable storeys for **ring** and **streamed** chunks, not just the island.
3. **Facade kit** (instanced, per chunk, ~6–10 draw calls total): window bays per storey (glass / boarded / blown /
   lit), ledges, cornices, fire escapes (walkable as an outside stair), hand-painted signs, rebar-and-hole damage
   decals, rooftop water tanks / HVAC / sandbag nests, tin lean-to additions and laundry lines.
4. **Roofs are places:** rooftop access, rope/plank bridges between adjacent roofs (D9 verticality), snipers on roofs
   (the sight-by-floor law already exists).
5. Fights between floors: shoot out of a window at the street and back (v1 omission), noise and blasts carry one floor.
6. Per-floor loot and floorplans (`world/floorplan.js`) — upper floors richer, more dangerous.
7. Camera: indoor D is measured from the *current floor* (`camFloor` exists) and the cutaway hides floors above (exists)
   plus camera-side walls (G1).

### G5. Dialogue, quests and the journal
**HAVE.** `ui/dialogue.js` (portrait + flag, typewriter, numbered choices, refusal by opinion/role), node trees in
`data/npcs.js` (8 named) and `data/meridian-talk.js`, strangers' three live topics (`systems/talk.js`), voice rows +
~40 rendered clips. `req` checks quest state, role tier, money, car nearby. **No stat/skill checks, no journal, quests are
a flat `g.quests` object**, two authored quest lines (Dustwolf bounty, canal job) + the letter pack + role jobs.
**PLAN.** (a) Choice `req` gains `skill:`, `stat:`, `crew:` (a member present), `item:`, `trust:`; failed checks show
greyed with the reason. (b) **Quest rows** (`data/quests.js`: stages, objectives, map pins, rewards, fail states) and a
**JOURNAL** tab in the pause menu (active / done / failed + the chronicle lines that mention you). (c) Crew interjections
and camp talk (G3.8). (d) Gate interviews for HOUSE RULES (G7). (e) Keep the strangers' live topics — they are a gem.

### G6. THE CAROUSEL — the machine in the ground (D2, the engine of vastness)
**HAVE.** Built in Godot (`carousel.gd`: 10 stations, occupiers, power/codes/purge ladder, PAIR → ROULETTE → THE DIAL,
node garages, ring sieges). **In web: atlas rows only** (`data/atlas.js:29, 68`). WEB_ENGINE_PLAN Phase 5 lists it.
**NEED.** Sealed stations under ruined forts; a ring that throws you (and your crew, never your rig) a thousand miles;
ring-sickness; the risk of a bad throw; the arrival in an unknown region as the game's signature beat.
**PLAN.** (1) Station = an underground interior (uses the underground/basement lane) with blast door, dead status boards,
power and code puzzles, occupiers. (2) Jumps: **PAIR** (a known destination), **ROULETTE** (random among stations of
streamed regions; the arrival cold-open), **BACKSPIN** (no-key return to your last ring + one stack of ring-sick:
blurred edges, sway, aim spread — reuses the REST microsleep FX). (3) Access keys as items (traded, looted, forged by a
keycutter). (4) A **new-game option "Ring-born"**: start mid-jump in a random station with the crew (the Deathlands
cold-open). (5) Rigs don't jump: you rebuild or steal a ride in each region — this is what makes each region a fresh
survival problem.

### G7. Tyrant holdouts (D3)
**HAVE.** Two hand-built settlements (Rust Haven, Meridian), one military base (Outpost Nine), factions ×5 with a sim,
roles, witnesses, word-that-hops. `data/holdouts.js` has one row.
**NEED.** Dozens of walled holdouts, each ruled by a **Keyholder** with **bulls** and **HOUSE RULES**.
**PLAN — HOLDOUT GENERATOR.** Rows: wall kit (stacked car husks, containers, tin, sandbags — `target_town_wide.png`),
gate + towers, a market (the Swap), a saloon, a clinic, a jail, a pit/arena, a water tower; a Keyholder card (title,
vice, law), 1–2 HOUSE RULES from a table (guns checked at the gate, dogs leashed after dark, a water tithe, no
strangers after curfew, a toll in scrip of the house only…), each rule enforced by the existing witness/deed system →
locally wanted. Each holdout gets its own scrip (FIFTY PAPERS: bad paper discounted by distance). Seed one per exit
town in the streamed regions; hand-polish the first five.

### G8. Breadth — the country
**HAVE.** Arizona (Phoenix island ±464 m, ring metro to ~1.5 km, I-10 LA→El Paso streamed, dust wall at 45 km) and a
Florida box (I-95, I-75, Meridian at exit 9, start region). `usmap.json` holds 48 states; streaming P2–P5 are spec.
People/traffic/loot/saves past Phoenix are P1 omissions (`WEB_STREAMING` §1.2).
**PLAN.** Finish streaming P1 omissions → P2 (people and loot everywhere streamed) → one new region per wave, chosen for
contrast (a swamp, a mountain, a frozen north, a drowned coast), each with: a ruler from `DIVIDED_STATES.md`, 3–5
holdouts, one Carousel station, a regional creature, a regional hazard. The Carousel (G6) means regions need not be
connected by road on day one.

### G9. The look — closing the gap to the dream frames
**HAVE.** Superb stamped-steel HUD. World: procedural canvas textures, flat-shaded low-poly, hemisphere 0.9 + sun 2.5
with 2048 PCF-soft shadows, ACES at 1.2, **no post-processing** (no SSAO, bloom, grade), headlights painted on the road,
4 pooled lights, procedural box people (160 instanced), 19 GLB flora. Look debts per `dsoa-look`: palms read as spiky
stars, gem forest crowns, crows as planks, Meridian is a grid.
**NEED / PLAN** (judge every step with the dream loop against the four target frames):
1. G1 tilt first — without it no facade work is visible.
2. Post stack (budget ≤ 1.5 ms at 1080p): N8AO-class SSAO (half-res), selective bloom on emissives (lamps, fire,
   neon, headlights), a LUT grade per time-of-day (warm dust day, amber dusk, blue-black night), vignette + fine grain.
3. Light: headlights as two pooled SpotLights for the player car (others keep the painted cones), emissive window
   bays at night, fire light from drums (pooled point lights by distance).
4. Facades + roof clutter (G4.3), sidewalks with curbs, crack decals, car-husk barricades, burnt bus and the dust-trail
   particles.
5. **People** at close tilt are the weakest element: the Phase 6 pipeline (skinned GLB → vertex-animation textures,
   instanced) for crew and named NPCs; keep the procedural crowd as the far LOD.
6. Atmosphere: height fog, blowing dust sprites, a dust-wall horizon card for storms (`target_town_wide.png`).

### G10. Housekeeping that blocks clean work
8 unmerged fix worktrees (`.worktrees/dsafix1-*`), 4 unmerged origin branches (`feat/web-bases`, `feat/web-roadside`,
`feat/web-underground`, `dsa2/play-link`), and the current branch `dsa2/ike-counter` 5 commits ahead of `main`. Land or
retire them before the new lanes branch off, or every lane pays the merge cost.

---

## 4. Formulas

### 4.1 Camera boom (G1)
`D` = boom length (m), `θ` = pitch from vertical, `L` = look point on the ground, `s` = zoom fraction.
- `s = (ln D − ln dMin) / (ln dMax − ln dMin)` ∈ [0, 1]
- `θ = θclose + (θfar − θclose) · smoothstep(s)` — closer is more third-person, further is more map
- camera = `L + (0, D·cos θ, D·sin θ)` (offset south; north stays up). Today's rig equals `θ = atan 0.14 = 8.0°`.
- wheel: `D' = clamp(D · wheelStep^(±1), dMin, dMax)`, `wheelStep = 1.15`; in a car `Ddrive = D + speedLift·v`.
- **Example (foot start):** D = 20, θclose 50°, θfar 10°, dMin 9, dMax 140 → s = ln(20/9)/ln(140/9) = 0.29,
  smoothstep 0.205 → θ = 41.8°; camera height 14.9 m, 13.3 m south of the player.
- **Example (car start, 60 km/h = 16.7 m/s):** D = 70 + 0.75·16.7 = 82.5 → s = ln(82.5/24)/ln(175/24) = 0.62,
  smoothstep 0.68 → θ = 36 − 28·0.68 = 17.0°; height 78.9 m.

### 4.2 True view radius for spawners (G1)
Vertical half-FOV `φ = 21°`, horizontal half-FOV `ψ = atan(tan φ · aspect)` (16:9 → 34.3°), camera height
`h = D cos θ`. Far ground edge from the camera's ground point: `ffar = h · tan(θ + φ)`, valid only while
`θ + φ < 80°` (cap θ so the frame top stays on the ground or hits the horizon card). Near edge `fnear = h · tan(θ − φ)`.
`viewR = max over the 4 frustum ground corners of |corner − L|`.
**Example:** D = 20, θ = 41.8°: h = 14.9, ffar = 14.9·tan 62.8° = 29.0 → 15.7 m north of L; slant = 14.9/cos 62.8° = 32.6,
half-width = 32.6·tan 34.3° = 22.3 → viewR ≈ √(15.7² + 22.3²) = **27.3 m** (STREET today: 51.7 m).

### 4.3 Storey budget (G4)
Height of storey k: `y = 3.2·k`. A 6-storey roof is 19.2 m. From the foot start (camera height 14.9 m), a 6-storey
building south of the player sits between camera and player → the cutaway (G1) is required, not optional.
Draw calls: facade kit instanced per chunk ≈ `kinds(≈8) + glass(1) + lit(1)` ≈ 10 per chunk; 3×3 hot chunks share
instance buffers → +10–12 total, inside the 150 budget (stress sits ~70 today).

### 4.4 Crew trust (G3)
`T` ∈ [−100, 100], start = card's `trustStart` (hires 10, rescued 35, sworn 50).
Per deed: `ΔT = weight(deed) · value(member, deed.kind) · witnessed` where `weight` is the world-memory deed weight
(1–4), `value` ∈ [−5, +5] per card (the Sleeper: heal stranger +4, kill unarmed −5; the Wheel Boss: abandon crew −5,
win a fight outnumbered +3), `witnessed` = 1 if the member saw it, 0.4 if they heard it in camp talk.
Daily drift toward 0 by 2/day. **Thresholds:** T < −25 refuses risky orders; T < −40 at dawn → leaves with a 1/N share
of the trunk; T < −80 and a rival offer → betrays; T > 60 → "last stand" perk.
**Example:** the Sleeper (T 50) watches you execute a disarmed raider (weight 3, value −5): ΔT = −15 → 35. Two more →
5; she still follows, but if you then leave a wounded stranger (weight 2, −4, heard in camp 0.4): ΔT = −3.2 → 1.8.

### 4.5 Ring-sickness (G6)
Stacks `n` (0–5), each adds aim spread +6%, sway amplitude +0.15, edge blur +8%; decays one stack per 20 game-min of
rest. BACKSPIN adds 1 stack; ROULETTE adds `1 + (bad throw ? 2 : 0)`; bad throw chance `p = 0.04 + 0.08·damagedRing`.

---

## 5. Edge Cases
- **Tilt + inside a car under an overpass / bridge deck:** the cutaway treats overpass decks as occluders → dither-fade
  them in the player circle; never hide the deck the player is driving on (`elev` check).
- **Wheel over the pause menu / pack / map / dialogue:** the UI consumes it; zoom never changes while a panel is open.
- **Pad has no wheel:** right-stick click + right stick vertical = continuous zoom; Back+Up/Down stays as steps.
- **Agent scripts calling `zoom level=2`:** maps to the old stop's D at the mode's θ — old checks keep passing.
- **Horizon at max tilt in a streamed edge:** the dust-wall/ridge card and fog cover the edge; θ is clamped so
  `θ + φ ≤ 80°`.
- **Crew in a 2-seat vehicle:** the extra members take the deck/bed if there is one, else they're told "WAIT HERE" and
  hold at the spot (a map pin); they never teleport.
- **Crew member killed while carrying the only key / quest item:** the item drops as a body container (existing law).
- **Recruit cap reached:** the dialogue choice shows greyed "the crew is full (6)" — swap a member out at the CREW panel.
- **IP cap:** offering a 5th archetype from the 8 CREW CARDS → the recruit option doesn't appear; generics are unlimited.
- **Carousel jump with a dog:** dogs jump (they're crew); vehicles never do; a jump with a member downed leaves them
  behind unless carried (drag verb).
- **Shard play:** crew is per-player; other players' crews are ghosts on the wire (v0 is client-authoritative).
- **Storey stairs blocked by a ruin collapse:** a fire escape or a rope is the alternate route; the walkability audit
  (selftest) must find at least one route to every floor that has loot.
- **Left-handed character in a vehicle window:** shoots from the window on their dominant side first, then switches.

## 6. Dependencies (bidirectional — the named docs gain a back-reference when each lane lands)
| This gap | Depends on | Must be noted in |
|---|---|---|
| G1 camera | `data/camera.js`, `sky.js` shadow box, spawners' `viewR`, `engine/input.js` wheel | `WEB_CONTROLLER` §3.7, `WEB_LOOK` |
| G2 gun carry | `systems/characters.js`, `data/arms.js`, creator | `WEB_CONTROLLER`, `WEB_CREATOR` |
| G3 crew | `seats.js`, `deeds.js`, `memory.js`, `dogs.js` (pattern), `ui/inventory.js`, WarWorld tactician (Phase 3) | `WEB_WORLD_MEMORY`, `WEB_ATLAS` §3.3, `WEB_DOGS`, `WEB_INVENTORY` |
| G4 storeys v2 | `feat/web-underground`, `world/storeys.js`, ring, streamer, floorplans | `WEB_STOREYS`, `WEB_STREAMING`, `WEB_FLOORPLANS` |
| G5 dialogue/quests | `ui/dialogue.js`, skills, roles, G3 | `WEB_ROLES`, `WEB_VOICE` |
| G6 Carousel | underground lane, G3 (crew jumps), regions | `DIVIDED_STATES.md`, `WEB_CLONE_TRAVEL`, `WEB_ATLAS` |
| G7 holdouts | factions sim, witnesses, trade, G5 | `WEB_TRADE`, `WEB_WORLD_MEMORY` |
| G8 breadth | streaming P2–P5, terrain | `WEB_STREAMING`, `WEB_TERRAIN` |
| G9 look | G1, G4 facades, Phase 6 characters | `WEB_LOOK`, `WEB_MATERIALS` |

## 7. Tuning Knobs
| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `camera.foot.dStart` | 20 m | 12–33 | how close you start on foot (lower = more third-person) |
| `camera.foot.thetaClose` | 50° | 35–58° | how "isometric" the closest zoom looks; > 58° shows too little ground ahead |
| `camera.drive.dStart` | 70 m | 45–100 | how far out the car view starts (Robert: "further than today", today ≈ 40–52) |
| `camera.drive.thetaFar` | 8° | 0–20° | road readability at speed |
| `camera.wheelStep` | 1.15 | 1.08–1.3 | zoom speed per notch |
| `camera.cutawayRadius` | 5.5 m | 3–9 | how much wall disappears around you |
| `arms.carry.pistolOneHand.lateral` | 0.20 m | 0.12–0.28 | how far to the side the pistol sits |
| `crew.cap` | 6 | 4–6 (Robert: 6) | party size; draw calls are free (instanced) but AI cost ~0.05 ms each |
| `crew.archetypeCap` | 4 | ≤ 4 (IP law) | how many of the 8 CREW CARDS one crew may hold |
| `crew.trustDecayPerDay` | 2 | 0–5 | how forgiving the crew is over time |
| `storeys.maxAbove` | 5 | 3–7 | skyline height; above 5 the tilted camera needs ≥ 60 m D to see roofs |
| `ring.sickStack` | as §4.5 | — | the price of a jump |

## 8. Acceptance Criteria (each a selftest check or a judged render)
1. **Wheel zoom:** in a car, 3 wheel-up notches reduce D by 1.15³ ± 2%; on foot the same; Alt+wheel cycles weapons; Z
   still steps the five stops.
2. **Mode defaults:** spawn in a car → D settles to drive.dStart ± 3 m within 2 s; `exitVehicle` → D settles to the foot
   remembered/start D within 2 s; θ follows §4.1 within 1°.
3. **Cutaway:** with a 6-storey building between camera and player, ≥ 90% of the player's screen-space circle shows the
   player (pixel test on a staged render).
4. **viewR:** at every zoom, every staged spawn "out of sight" lands outside the rendered frustum (frustum test).
5. **Perf:** `scenario name=stress` at the widest tilt stays < 150 draw calls and does not regress ms/frame beyond noise
   (ABBA A/B per `RESUME` gotchas); post stack ≤ 1.5 ms.
6. **Gun carry:** with a revolver raised, the muzzle sits ≥ 0.15 m lateral of the chest centre on the dominant side; a
   left-handed character mirrors it; hit rate in `scenario` combat checks unchanged ± 3%.
7. **Crew:** a fresh game can recruit a member through dialogue (no agent call); the CREW panel lists them with flag
   backdrop; the 10 orders each have a check; trust moves per §4.4 on a staged deed; a dead member leaves a grave and an
   obituary line; save → load keeps the crew.
8. **Storeys:** ≥ 1 six-storey building exists in Phoenix downtown and in the ring; every floor is reachable
   (walkability audit); a window shot from floor 4 hits a staged target in the street.
9. **Carousel:** ROULETTE from Phoenix lands the player + crew in a station in another region, rig stays behind,
   ring-sick stacks apply and decay per §4.5.
10. **Look (dream loop):** an independent judge scores the live frame vs `target_drive_day.png` ≥ 8/10 (composition,
    lighting, materials, details), then `target_foot_party.png`, `target_town_wide.png`, `target_drive_dusk.png`.
11. **IP:** `node tools/ip-lint.mjs` → 0 deny, 0 new review.
