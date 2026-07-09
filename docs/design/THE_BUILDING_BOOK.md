# THE BUILDING BOOK — every building, its interior, its job, and its part in the game

**Status:** GREENLIT canonical spec (owner ask 2026-07-09: *"do we need a spec document for the
buildings themselves?"* — yes; promoted from THE_AMERICAN_ROAD §4, which now points here). **This doc
is THE definition for every structure/furniture row** (AMERICAN_ROAD ruling 0.6); other specs cite ids
only. Everything is build-ourselves box construction (the banked no-asset-packs verdict). A building
row without a JOB is rejected by `DrivnStructure.validate()` — no box without a purpose.

## 1. The catalog (42 rows: 19 exist [E], 23 new)

Tiers: **walkin** (full interior, the generalized house recipe) · **lobby** (ground floor real, upper
implied) · **solid** (shell/landmark/compound) · **portal** (M8+ backlog only — AMERICAN_ROAD 0.9).

**RESIDENTIAL** — house_small E (10×12 walkin) · house_two_story (10×9×2, walkin, can_be_safehouse) ·
ruined_house (migrated, walkin — corpse loot, squatters) · trailer_single (4×11 walkin — the rural
workhorse) · apartment_block (20×14×3, lobby) · farmhouse_field E (22×16 walkin).
**COMMERCIAL** — gas_station_small E · market_general E · market_stall (migrated, solid) ·
diner_roadside E · motel_strip E (walkin room doors — **the paid BED on the road**; LIBRARY study
comfort) · bar_roadhouse (brawls, informants) · pawn_gun_shop (contraband law_hook) · auto_shop E.
**CIVIC** — police_station E (wanted/evidence/impound) · courthouse E (lobby; the interim city SEAT) ·
clinic_small E · hospital_lobby (26×18×3) · church_small E (**wedding venue** — §4; sanctuary-or-law
by faction) · school_small (lobby) · library_small (walkin — bookshelf rows, LIBRARY study site) ·
fire_station · radio_station E (**pirate-transmitter backroom** joins the real dial) · monument_plaza
E · water_tower (solid landmark — the town's name, read via binoculars/atlas).
**INDUSTRIAL** — warehouse E · junkyard E (compound) · factory_shell (lobby, garrison) ·
substation_power (blackout events — **the city-takeover POWER objective**) · grain_elevator (landmark).
**ROAD-SERVICE** — rest_stop (16×10 walkin, can_be_safehouse, bed=bench) · truck_stop (30×20 core+lot
— **the freight job board**, convoy anchor) · weigh_station (cargo inspection) · toll_booth (consumes
the road row's `toll`) · checkpoint_road E.
**SPECIAL** — military_base_shell E (danger 5 — the Hood-style capital assault stage) ·
drive_in_theater E · kennel_small E · ranger_station (mountains hook) · **city_hall (NEW — the city
SEAT row, M3 towns)** · **capital seat compounds (NEW, M9 — per-ruler flavor: corporate tower /
casino / military base reuse; three states' rulers are CEOs — GA/NV/NY — `seat_roster_sim` asserts
all three resolve)** · *backlog (portal):* mall_dead, bunker_survivalist · howler_den (SURFACE den
P2 per AMERICAN_ROAD 0.9; ECOSYSTEM owns behavior).
Clusters (trailer park, main-street row, farm compound) are **stamp templates of these rows** — one
vocabulary, composed. Dirt-spur payload structures (hermit shack, still, hunting stand, quarry,
cemetery) live in AMERICAN_ROAD §9.6 and follow this doc's row laws.

## 2. The interiors law (three tiers, one recipe)

The five proven house.gd laws generalize into `ProtoStructureBuilder` v2 + one shared component
**`ProtoInteriorSkin`** (roof-hide AABB test · front-fade alpha · per-floor slab fade) + RAMP-not-steps
circulation + a **footprint-driven furnisher** (room roles from the floorplan grammar → `furniture_set`
rows → containers/loot; the `bookshelf` furniture row is THE LIBRARY's world presence). Open-top shells
stay the honest default (true to the top-down camera); `roof:true` is earned (safehouses, motel rooms,
police). **The LOD law (AMERICAN_ROAD 0.11):** chunk-spawn builds shell+sign+chest only; partitions +
furniture wake on approach (~40 m) and free on exit; ≤2–3 full interiors per chunk (benchmark: the
measured worst chunk holds 8 placements). Enterable-% targets key to **placement instances**, never
type counts; wave 1 = the five types chosen by instance count.

## 3. The mission schema (NEW fields — what FAMILY_EMPIRE and NAVIGATION consume)

Every row MAY carry; rows with jobs/residents MUST carry `entrances`:
- **`entrances: [{side, off, kind: door|bay|gate}]`** — the walk-graph's door nodes (*a workplace
  without a door is a lie*); `door_class: open | business_hours | locked`. NPCs open unlocked doors
  with the player's own audio/anim; they KNOCK on player-locked ones (NAVIGATION §2).
- **work spots:** `counter_anchor`, `safe_spot`, `patrol_anchors[]`, `venue_anchors[]` — where an
  arriving NPC does the verb (man the counter, stand the altar, guard the door).
- **`parking: [{off, heading}]`** — reserved spots for DRIVE legs (two couriers never share one).
- **the business block** (FAMILY_EMPIRE 0.1): `base_profit`, `protection_tier: none|thug|guard`,
  `extortable: bool`, `buyable: bool`, `backroom_type` (bar→still · auto_shop→chop_shop ·
  pawn_gun_shop→book_maker · clinic→clinic_back · radio_station→pirate_tx), `recruit_pool`,
  `safe_anchor: bool`. **World profit is this doc's law** (`profit_day = base_profit × TIER_MULT ×
  risk` off the exit rows' tier/risk); ownership/till/burn live ONLY in the save
  (`structures_state`) — world JSON never stores ownership.
- **`event_hooks[]`** — `wedding_venue` (church_small: altar/pew anchors + the vestry rear entrance),
  `job_board` (truck_stop), `seat` (city_hall/courthouse; capital compounds), `show_night` (drive-in).

**The extort/own table (v1):** extortable+buyable = every commercial row except market_stall;
civic/road-service are never extortable (they're law/venue surfaces — the city SEAT is *taken*, not
squeezed); backrooms per the map above; `diner_roadside` is the HOLLOWPOINT SLICE's business.

## 3b. THE MULTI-USE LAW (owner, 2026-07-09: *"I want every building to have multiple uses — not just
a jeweler where the only thing you can do is buy a ring"*)

**Binding: every catalog row must carry ≥3 distinct player verbs** (`structure_data_sim` counts them —
a one-verb building fails validation like a jobless one). The verbs come from the systems already
specced; a row lists which it hooks. The jeweler, done right, is the template:

**`jeweler` (NEW row, commercial, walkin):** buy the `gold_ring` (courtship) · **fence** jewelry-class
loot at real prices (the hot-goods channel — heat if the piece is traceable) · **appraise** unknown
valuables (what IS this Carousel trinket worth?) · commission pieces (anniversary gifts — the bond
calendar) · extortable/buyable with a lapidary backroom (fencing at scale). Five verbs, one box.
More NEW venue rows this pass (all obey the law): **`restaurant_fancy`** (the romantic dinner —
date venue tier 2, private-booth meets, launder-friendly buy-in) · **`race_track_grandstand`**
(SPECTACLES: race day, betting window, pit-lane wrenching jobs, derby conversions — the LARGE venue
structure the owner asked for) · **`fight_pit`** / **`drone_ring`** (fight night, betting, sponsor a
fighter, enter yourself) · **`clone_wing`** + **`blackmarket_vat`** (CLONING.md: scan, vat visit,
wake point; the vat is hidden, raidable, and illegal under faith law). Existing rows gain their verb
lists in the same pass — the drive-in was always a date; the school now schedules your kid
(FAMILY_EMPIRE §2.2b); the church marries, buries, AND sanctuaries.

## 4. Building strategies (what each building is FOR — the owner's "building strategies")

- **HOME:** house_two_story / rest_stop / motel room (`can_be_safehouse`) — beds (save/rest/LIBRARY
  study comfort), the SAFE (build-board row; deposited scrip ducks the death tax — FAMILY_EMPIRE 0.7),
  walls vs metaworld raids, the memorial wall. *"A house in the middle of nowhere"* = any remote
  can_be_safehouse row: city heat can't find it; the ecosystem can.
- **MONEY:** the business block rows — extort/own/backroom; truck_stop freight boards; collectors walk
  the entrances this doc defines.
- **POWER:** city_hall (the seat), substation_power (the POWER objective), police_station (bribes,
  impound, evidence), radio_station (the dial), capital compounds (the finals).
- **KNOWLEDGE:** library_small + bookshelf furniture (THE LIBRARY), school, ranger_station (maps).
- **EVENTS:** church_small (weddings, funerals — the memorial arc), drive_in (show night), bar
  (brawls/informants), the dead-exit ghost kits (AMERICAN_ROAD 0.15).
- **DEFENSE:** walls/guard dogs at home; protection tiers on businesses; stationed underbosses; the
  garrison rows (factory_shell, military_base_shell).

## 5. Dependencies · Sims

**Consumed by:** THE_AMERICAN_ROAD (milestones M0/M3c/M5/M7/M9 build from this catalog) · NAVIGATION
(entrances/work spots/parking ARE the walk graph's data) · THE_FAMILY_EMPIRE (the business block,
venues, seats) · THE LIBRARY (library_small, bookshelf, motel/rest-stop study comfort) · ECOSYSTEM
(culvert den anchors, rodent anchors, corpse economy props). **Sims:** `structure_data_sim` (every
row validates; JOB rule; entrances present where jobs exist) · `shell_recipe_sim` (the five laws by
real walk-in) · `furnisher_sim` · `business_row_sim` (profit law; extort/own table; backroom map) ·
`venue_sim` (church anchors host a staged ceremony) · plus the interiors LOD assert on the measured
worst chunk. **Milestone map:** M0 wire+migrations · M3c the mission schema fields (entrances/work
spots/business blocks on live rows — the FAMILY_EMPIRE gate) · M5 five walk-ins + catalog
reconciliation · M7 wave 2 + bookshelf · M9 capital seats.
