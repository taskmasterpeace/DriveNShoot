# MUD & MONSTERS — terrain × weather × wheels (and the trucks that laugh at all of it)

**Status:** GREENLIT design spec (owner, 2026-07-09: *"terrain and weather for [tracked/tractor]
vehicles… monster trucks, the big wheels, that allows us to have mud"*). Owner rulings via Q&A:
**both** tracked vehicles AND tractors join the fleet · mud is **slow-but-never-stuck** (grip/speed
penalties only — no bog-down fail state, ever) · monster trucks are **BUILT** (chassis + found BIG
WHEELS + workbench). **Substrate (shipped/specced):** vehicles as rows + the 5-part damage law +
per-tire dirt handling (the knobby-vs-highway law is LIVE — book_driving canon) · `ProtoWeather`
grip_now · WEATHER's W-WET (rain wets CELLS regionally — mud happens where it actually rained) ·
AMERICAN_ROAD 0.17 (`surface` field: asphalt/concrete/gravel/dirt) · GROUND_INTEGRITY floors ·
junkyards/military bases/farm rows in the Building Book.

## 1. THE TRACTION MATRIX (one law, three inputs, two outputs)

`traction(surface, wetness, tire_class) → {speed_mult, grip_mult}` — a single data table
(`data/traction.json`), read where `grip_now` is read today.

- **Surfaces** (the road/ground truth): asphalt · concrete · gravel · dirt · grass/field · sand.
- **Wetness** per cell from the weather field: `dry` · `wet` (rain now or `water_rot ≥ 0.35`) ·
  **`MUD`** = dirt/grass/field surface AND `water_rot ≥ 0.55` (it rained HERE — regional, honest;
  the swamp band is muddy for days after a storm, the desert never is).
- **Tire classes** (vehicles.json rows — extends the shipped knobby law): `street` · `knobby` ·
  **`big` (monster)** · **`tread` (tracked)** · `farm` (tractor lugs).

**THE SLOW-NEVER-STUCK LAW (owner ruling):** the matrix floor is `speed_mult 0.25` — every vehicle
ALWAYS moves. Mud punishes with crawl + slide (low grip = the back end walks), never with a stop.
Worked row: street tires in MUD = 0.3 speed / 0.45 grip (a miserable, fishtailing crawl) · knobby =
0.55 / 0.7 · **big = 0.9 / 0.85** (the monster barely notices — THE reason to build one) · tread =
**1.0 flat everywhere** (nothing slows a dozer but its own top speed) · farm = 0.8 / 0.9 in mud+field.
Sand mirrors mud without the weather gate (dunes are always sand). Off-road noise: mud is QUIET
(×0.7 noise radius), treads are LOUD (×1.6 — the ecosystem hears a half-track coming; predators and
bandits both).

**Cheap rendering (the WEATHER §9 philosophy — at the camera, never the world):** mud = the SAME
wet-sheen uniform driving dirt darker + one camera-local wheel-spray emitter on YOUR vehicle
(≤60 quads, active when surface=mud and speed>threshold) + a **mud-skin material param** on the
vehicle body (accrues while driving mud, washes off in rain/water crossings — your rig *wears* the
trip; free storytelling, one uniform). No decals, no rut meshes, no terrain deformation.

## 2. THE NEW FAMILIES (vehicles.json rows — data, not code)

- **THE MONSTER TRUCK** — built, never bought: a truck chassis + **BIG WHEELS** (a rare item: junkyard
  deep-loot, derby-circuit prizes, and one legend set on a dead-exit ghost truck) + the workbench
  build (mechanics skill gate). Rows: huge wheel radius + suspension travel (VehicleBody3D params —
  the rig visibly towers), tire_class `big`, high fuel burn, terrible top speed on asphalt (the
  trade), and **THE CRUSH VERB**: driving over a wreck/car at speed deals the 5-part damage law from
  ABOVE (chassis-first) to the target and almost nothing to you — monster trucks treat stopped cars
  as terrain. (Crushing an OCCUPIED vehicle is very much a crime — the witnessed pipeline applies.)
- **TRACKED (military surplus)** — half-track and dozer rows found/won at military_base_shell sites
  (base loot ties): tire_class `tread` (flat traction everywhere), slow, LOUD, armored (damage-law
  resistances), rare fuel-hungry beasts. The dozer's blade shoves wrecks (a push-force row) — the
  road-clearing utility vehicle.
- **TRACTORS (farm rigs)** — bought cheap at farm towns / found in barns: tire_class `farm`, slow,
  exposed seat, and **THE TOW VERB**: hitch a DEAD rig (engine destroyed / out of fuel / abandoned)
  and haul it — to the junkyard for salvage scrip, to your garage for repair, or your buddy's wreck
  home in co-op. (No stuck state means tow = the salvage/recovery economy, not rescue.) Tow jobs
  join the freight board ("dead hauler on the shoulder at mile 30 — bring it in"). Tractors also own
  the farmland fiction (field-patch work jobs, a farm income line for the empire's rural blocks).

## 3. THE SPECTACLE — MONSTER TRUCK RALLY (SPECTACLES event #6)

At the `derby_bowl` / `race_track_grandstand`: **the crush show** — a line of junk cars, scored on
crush count + air + freestyle (the physics engine does the judging: height sensors + flips), betting
window like every spectacle, and **your built truck can enter**. **The mud course variant is the
headline**: when it rains on event day the bowl floods to MUD and the field separates — street-tire
entrants crawl while the big wheels fly (the traction matrix IS the drama). Purses pay in scrip +
rare parts (BIG WHEELS seed the loop: win wheels → build a truck → enter the rally).

## 4. Rows · Deps · Sims · Phases

**Rows:** `data/traction.json` (the matrix + noise mults) · vehicles.json `tire_class` on every rig +
3 new family rows (monster_truck_built, halftrack, dozer, tractor) · items: `big_wheels` (rare),
`tow_hitch` · SPECTACLES event row `monster_rally` (+ mud_variant flag) · Building Book: garage
build recipe row. **Deps:** WEATHER (W-WET wetness per cell; §9 render law) · AMERICAN_ROAD 0.17
(surface) + §9 assets (wrecks to crush) · SPECTACLES (the rally, betting) · FAMILY_EMPIRE (tow jobs
on the freight board; farm income) · ECOSYSTEM (noise mults — treads announce you) · GROUND_INTEGRITY
(floors under mud — mud is a MATERIAL state, never a collision change). **Sims:** `traction_sim`
(matrix applied per class; the 0.25 floor holds — nothing ever immobilizes; mud only where
water_rot ≥ 0.55 on dirt-class) · `monster_build_sim` (chassis+wheels+bench → the truck exists,
crush verb damages the wreck not the truck) · `tow_sim` (hitch a dead rig, haul, salvage pays) ·
`rally_sim` (crush scoring + betting + the mud variant separates tire classes). **Phases:** T1 the
matrix + mud wetness + cheap render (rides WEATHER's field) → T2 monster truck build + crush + the
rally → T3 tracked + tractors + tow economy. *Owner-flip flag: the stuck state stays OUT unless he
ever wants it back — the matrix floor is one number.*
