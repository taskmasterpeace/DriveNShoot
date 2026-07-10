# THE BUILDING BOOK II — ROOMS & LOOT (every building, every room, every table)

**Date:** 2026-07-10 · **Status:** SPEC — owner-requested ("all the buildings that need to be
created… all of the rooms… the loot table for each building… regional and faction specific")
**Parent:** `THE_BUILDING_BOOK.md` (the canonical 53-row catalog — this doc gives every row its
INSIDE). **Executes at:** M5 (5 core enterables) → M7 (room kits) on the AMERICAN ROAD ladder.
**Editor:** MapForge v4.1 already places catalog rows with true footprints and shows regions/
ecology — this spec is what fills the footprints.

---

## 1. Overview

Buildings today are lawful SHELLS: 53 catalog rows with footprints, sign glyphs, jobs, and a
flat `loot_table` field — but only `walkin` interiors (7 rows), no rooms, and **26 of 53 rows
have no loot path at all**. Meanwhile the loot engine is already three layers deep
(`loot_resolver.gd`: furniture base table → building-type weight mult by tags → **state-LAW
override**), and furniture is already the loot carrier (15 tables, 10 furniture rows).

**The architectural law of this spec:** rooms are FURNITURE-BEARING KITS. A room never owns a
loot table — it owns furniture, and furniture already owns tables. Loot design therefore means:
(a) a room-kit vocabulary (reusable, data rows), (b) a kit manifest per building, (c) ~14 new
furniture rows + their tables, (d) a fourth resolver layer for REGION, and (e) ruler/faction
skins on top. Nothing here invents a second loot system.

**The faction answer (owner asked):** factions-as-organizations are NOT built. What IS live:
per-state RULERS with attitude mechanics (`rulers.json` — Bridger's Council, King Sawyer, CEO
Marrow, the Admiral of the Reef Fleet + default Barons), state LAW profiles that already rewrite
loot (`guns_banned` → confiscation notices), the respect ledger, and per-state bandit strength.
This spec binds variants to **rulers + laws + biome regions** (all live today) and reserves a
`faction_overrides` hook (already a field on every catalog row: paint/guards/prices) for when
the banked faction arc executes. Nothing waits on factions; nothing fights them later.

## 2. Player Fantasy

You pull off EXIT 9 into a town you've never seen. The gas station's sign says fuel; inside,
the register is picked clean but the tool rack behind the counter isn't. The clinic two doors
down has a medicine cabinet worth the noise it takes to reach it — and a ward with a body you
shouldn't have looked at. In Georgia the same clinic is a Peach Combine dispensary: cleaner,
guarded, and the medicine costs scrip instead of courage. In the swamp parish the shelves run
to snake antivenom and dry socks. Every building answers three questions at a glance: *what is
this place, what's worth taking, and who says so.*

## 3. Detailed Rules

### 3.1 The ROOM KIT vocabulary (new data: `game/data/room_kits.json`)

A kit is a reusable interior module: `{id, name, size_class S|M|L, furniture: [furniture_id…],
wall_rule: open|partition|secure, door_rule: front|internal|locked_internal}`. The footprint
furnisher (shipped) places kit furniture against walls; `interior_skin` (shipped) keeps
roof-hide/front-fade. **Kits, one row each:**

| kit | size | furniture (existing → NEW*) | notes |
|---|---|---|---|
| lobby | S | desk, closet | every civic front door |
| office | S | desk, file_cabinet* | paperwork + keys |
| storeroom | S | warehouse_crate, tool_rack | the workhorse |
| kitchen | S | fridge, kitchen_cabinet | homes + diners |
| dining | M | (props only — tables/booths) | diners, bars |
| bedroom | S | closet, medicine_cabinet | homes, motel units |
| ward | M | medicine_cabinet ×2, medical_fridge* | clinic/hospital |
| cell_block | M | police_locker, cell props | police, courthouse holding |
| sales_floor | M | cash_register, display_counter* | every shop front |
| back_room | S | warehouse_crate, safe_small* | behind every sales_floor |
| garage_bay | L | tool_rack, parts_bin* | auto shop, fire station |
| chapel | M | altar_box*, pew props | church |
| classroom | M | desk ×2, book_shelf* | school |
| stacks | M | book_shelf* ×3 | library — THE LIBRARY's shelves live here |
| vault | S | gun_safe OR safe_small* (locked_internal) | the jackpot room |
| workshop | M | tool_rack, parts_bin* | workbench-adjacent |
| radio_booth | S | radio_console*, desk | radio station, newsroom hooks |
| bar_front | M | bar_shelf*, cash_register | roadhouse |
| barracks | M | closet ×2, ammo_locker* | military shell, checkpoint |
| freezer_room | S | freezer* | grocery/diner cold storage |

*NEW furniture rows (15): file_cabinet, medical_fridge, display_counter, safe_small,
parts_bin, altar_box, book_shelf, radio_console, bar_shelf, ammo_locker, freezer,
jewelry_case, evidence_locker, mail_slots, vending_machine — each with a loot table (§3.4).*

### 3.2 The kit manifest — every building, its rooms (the owner's table)

`structure_profiles.json` rows gain `rooms: [kit ids]` (order = door-to-back). Signature rule
(§4.2): **every building has exactly ONE signature container** — its jackpot, listed in bold.

**CIVIC** — Bridger-country flavor: order, records, keys
| building | rooms | signature | loot flavor |
|---|---|---|---|
| police_station | lobby, office, cell_block, vault | **gun_safe** | weapons/ammo, evidence |
| courthouse | lobby, office ×2, cell_block | **file_cabinet** (deeds) | scrip, records, keys |
| city_hall | lobby, office ×2 | **safe_small** | scrip, town ledger books |
| fire_station | garage_bay, barracks, kitchen | **tool_rack** | tools, medical, axes |
| school_small | classroom ×2, office | **book_shelf** | books (skill Vol I), food |
| library_small | stacks ×2, office | **book_shelf** | THE LIBRARY: skim/study books |
| hospital_lobby | lobby, ward ×2, storeroom | **medical_fridge** | meds jackpot, infection risk |
| clinic_small | lobby, ward | **medicine_cabinet** | bandages, antibiotics |
| ranger_station | office, storeroom | **gun_safe** | rifle, maps, flares |
| checkpoint_road | barracks, office | **ammo_locker** | ammo, standing-gated |

**COMMERCE** — sales_floor + back_room is the law
| building | rooms | signature | loot flavor |
|---|---|---|---|
| market_general | sales_floor, back_room, freezer_room | **cash_register** | food, goods |
| gas_station_small | sales_floor, back_room | **cash_register** | fuel cans, snacks, maps |
| diner_roadside | dining, kitchen, freezer_room | **fridge** | food, coffee, tips jar |
| bar_roadhouse | bar_front, back_room, office | **bar_shelf** | booze, brawl loot, rumors |
| restaurant_fancy | dining, kitchen, office | **safe_small** | scrip, fancy food |
| jeweler | sales_floor, vault | **jewelry_case** | valuables → fence NPC |
| pawn_gun_shop | sales_floor, vault | **gun_safe** | weapons, barter goods |
| truck_stop | sales_floor, dining, storeroom | **cash_register** | fuel, parts, CB radio |
| rest_stop | lobby, storeroom | **vending machine (prop+table)** | snacks, traveler caches |
| motel_strip | office, bedroom ×4 | **mail_slots** (keys) | per-room traveler loot |

**SERVICE / INDUSTRIAL** — tools and parts country
| building | rooms | signature | loot flavor |
|---|---|---|---|
| auto_shop | garage_bay, office, storeroom | **parts_bin** | car parts (panel-damage arc feeds here) |
| warehouse | storeroom ×3 | **warehouse_crate** | bulk scrap, crate lottery |
| factory_shell | storeroom ×2, workshop, office | **parts_bin** | machine parts, danger |
| grain_elevator | storeroom ×2 | **warehouse_crate** | food bulk, rats |
| substation_power | workshop | **tool_rack** | wire, fuses — Carousel power ties |
| weigh_station | office | **file_cabinet** | manifests, toll ledgers |
| quarry_pit | workshop (open) | **tool_rack** | explosives hints, stone |
| junkyard | workshop, office | **parts_bin** | scrap jackpot, dog country |
| radio_station | radio_booth, office | **radio_console** | broadcast hooks, batteries |

**HOUSING** — the quiet loot
| building | rooms | signature | loot flavor |
|---|---|---|---|
| house_small | kitchen, bedroom | **medicine_cabinet** | domestic scatter |
| house_two_story | kitchen, bedroom ×2, office | **closet** | domestic + attic chance |
| apartment_block | lobby, bedroom ×4 | **mail_slots** | per-unit rolls, neighbors |
| trailer_single | kitchen+bedroom (combined S) | **kitchen_cabinet** | poverty loot, shotgun chance |
| farmhouse_field | kitchen, bedroom ×2, storeroom | **freezer** | food richness, shells |
| safehouse | (player-ownable — no loot rooms) | — | claim law, not loot |
| ruined_house | bedroom (collapsed) | **closet** | picked-over scatter |

**FAITH / RUIN / SPECIAL**
| building | rooms | signature | loot flavor |
|---|---|---|---|
| church_small | chapel, office | **altar_box** | offerings, sanctuary lore |
| cemetery_old | (open ground) | **buried_cache** (existing table — Hunter DIG) | dig verb payoff |
| monument_plaza | (open) | — | lore plaques, no loot |
| military_base_shell | barracks ×2, vault, office | **ammo_locker** | the big gun jackpot, FIRST CHOIR adjacency |
| drive_in_theater | office, storeroom | **cash_register** | media reels (found_* pickups) |
| hunting_stand | (single S room) | **gun_safe** (light) | rifle chance, jerky |
| still_shack | workshop | **bar_shelf** | moonshine — trade good |
| kennel_small | office, storeroom | **tool_rack** | dog supplies, BOND items |
| water_tower / derby_bowl / fight_pit / grandstand / drone_ring / clone_wing / blackmarket_vat | (venue rows — props + one office each) | **safe_small** | event-driven, not scavenge |

**NEW BUILDINGS to create (10 — the catalog's real gaps, each passes the §9 JOB rule):**
| new row | why | rooms | signature |
|---|---|---|---|
| grocery_big | food economy anchor for metros | sales_floor ×2, freezer_room, back_room | **freezer** |
| hardware_store | tools/deployables shop | sales_floor, back_room | **tool_rack** |
| bank_branch | the vault fantasy; scrip economy | lobby, office, vault | **safe_small** (locked 3) |
| motel_office_diner | pairs with motel_strip corridors | office, dining | **cash_register** |
| sheriff_substation | rural law w/o full station | office, cell_block | **evidence_locker** |
| feed_store | farm-belt flavor | sales_floor, storeroom | **warehouse_crate** |
| bait_shop | swamp/water edge; gator country | sales_floor | **freezer** (bait!) |
| bus_depot | travelers, lockers, routes lore | lobby, storeroom | **mail_slots** (lockers) |
| dead_mall_wing | the consultant's dead mall, as a WING row (compound) | sales_floor ×3, back_room ×2 | **display_counter** |
| chop_shop | stolen-car economy (Scrap Union hook) | garage_bay ×2, office | **parts_bin** (rich) |

### 3.3 Regional variants (live: biome + state → the REGION layer)

Five REGION PROFILES (`game/data/region_loot.json`), resolved from the building's cell:
state → region. A fourth resolver layer multiplies entry weights by TAG:

| region | states (by state_legend) | tag shifts (×) | skin notes |
|---|---|---|---|
| DIXIE_SWAMP | FL, LA, MS, AL, GA coast | water 0.75 (ground water everywhere — canned is an afterthought), food 1.2, fuel 0.8, antivenom NEW | rot wood, tin roofs, gator trophies |
| RUST_NORTHEAST | NY→ME belt | parts 1.4, tools 1.2, food 0.8 | brick, boarded glass |
| BREADBASKET | midwest plains | food 1.6, fuel 1.1, meds 0.8 | grain dust, big sky props |
| DUST_SOUTHWEST | AZ, NM, NV, TX west | water 1.8, ammo 1.2, food 0.7 | sun-bleach, bones |
| HIGH_MOUNTAIN | CO, MT, WY, ID | meds 1.2, tools 1.2, fuel 1.3 | snow kits, wood stoves |

Regional SPECIFIC items ride tags: `antivenom` (swamp wards), `snow_chains` (mountain auto
shops), `salt_tabs` (desert gas stations) — items are rows; regions only shift weights.

### 3.4 Ruler / faction variants (live: rulers + laws; hook: faction_overrides)

Per-ruler building skins bind to the AUTHORED rulers (and default Barons elsewhere):

| ruler (state) | building behavior deltas |
|---|---|
| Bridger's Council (VIRGINIA) | civic rows staffed (guard NPC), clinic meds +20% stocked, police gun_safe locked tier 3 — order country |
| King Sawyer (NORTH CAROLINA) | toll_booth rows active on county lines, courthouse holds CONFISCATED goods (jackpot for outlaws), attitude 1.2 = heat fast |
| CEO Marrow / Peach Combine (GEORGIA) | market/grocery = COMPANY STORES: prices +30%, back_room stock ×1.5, registers drop scrip premiums, guards at commerce not civic |
| Admiral of the Reef Fleet (FLORIDA) | occupied: checkpoints everywhere, fuel rationed (gas station fuel 0.6×), military rows hostile, curfew law hooks — the Four Days Later slice |
| default Barons | vanilla tables; bandit_strength drives guard/ambush pressure instead |

Law profiles keep working underneath (guns_banned states already confiscate rolled weapons —
shipped). When the faction arc lands, `faction_overrides: [paint, guards, prices]` re-skins the
same rows — the manifest never changes.

## 4. Formulas

- **Roll chain (extends the shipped resolver):**
  `w_final = w_base × building_mult(building_type, tags) × region_mult(region, tags) × ruler_mult(state, tags)`
  then per-entry roll `rng.randf() < min(w_final, 1)`, count `randi_range(min, max)`, then the
  LAW override pass (unchanged, still last). All mults default 1.0; range clamp [0.25, 3.0].
  *Example:* desert gas station, water can entry: `0.5 × 1.0 × 1.8 × 1.0 = 0.9` → near-certain;
  same entry in swamp: `0.5 × 1.0 × 0.75(water-rich land, canned water scarce…) = 0.38`.
- **Rooms per building:** `n_rooms = clamp(round(footprint_area_m2 / 30), 1, 8)`; kits fill in
  manifest order; L kits count double. *Example:* police_station 16×12 = 192 m² → 6 slots →
  lobby, office, cell_block(×2 slots), vault, storeroom.
- **Signature lock:** signature container locked at Scavenging tier = `clamp(danger, 0, 5)`
  (the shipped lock law); exactly ONE signature per building — the furnisher enforces it.
- **Expected value guard:** a building's summed expected scrip value must land in its tier
  band: T1 20–60 · T2 40–120 · T3 80–240 · T4 150–400 (tune §7). The loot-coverage sim
  computes EV from tables and FAILS rows outside band ×1.5.

## 5. Edge Cases

- **Shell with no rooms** (open-top venue rows): keep flat `loot_table` fallback — the chest
  law. A row may have BOTH (rooms win when interiors materialize; chest when LOD-shelled).
- **Region border cell:** the building's OWN cell decides its region — never blend two tables.
- **Unauthored state ruler:** `rulers.default` (Baron) + bandit_strength pressure; never null.
- **Locked signature + no Scavenging:** container stays, shows the shipped "locked — need
  Scavenging N" line; never silently empty.
- **Furniture persistence:** looted-state must round-trip the save (M7's known gap — this spec
  makes it MANDATORY at M7, listed in §6 dependencies).
- **Law confiscation inside a vault:** law pass runs AFTER region/ruler mults — a guns_banned
  state's gun_safe rolls weapons then converts: the confiscation-notice drop is the tell.
- **dead_mall_wing compounds:** each wing is its own row instance — no cross-wing signature
  duplication (furnisher's one-signature law is per PLACEMENT).

## 6. Dependencies (bidirectional)

- **M5/M7 (AMERICAN ROAD ladder):** M5 generalizes the walk-in laws (`ProtoInteriorSkin` +
  footprint furnisher — shipped foundations); M7 executes `room_kits.json` + this manifest.
  This spec IS M7's content contract; M7's doc must point here.
- **`loot_resolver.gd`:** gains region_mult + ruler_mult layers (§4) — additive, law pass last.
- **THE LIBRARY:** `book_shelf` furniture is its findable-books surface (stacks/classroom) —
  THE_LIBRARY.md §shelves binds to this spec's kit table.
- **Panel-damage / vehicle mods arc:** `parts_bin` tables carry car parts — the garage economy.
- **THE INFECTED arc:** hospital/military rows are its loot theaters (fort_benning adjacency).
- **MapForge v4.1:** places rows with true footprints; the state card shows the ruler whose
  variants apply — the editor is where region/ruler skins get eyeballed.
- **bandit_regions.json:** default-Baron pressure scaler (guards/ambush hooks).

## 7. Tuning Knobs

| knob | range | affects |
|---|---|---|
| region_mult per tag | 0.25–3.0 (ship ≤1.8) | regional flavor strength |
| ruler stock/price mults | 0.5–1.5 / ±40% | how loud a ruler reads in loot |
| EV tier bands | ±50% | scavenge economy pace |
| signature lock tier | 0–5 | Scavenging skill's value |
| rooms-per-30m² divisor | 22–40 | interior density everywhere |
| new-furniture table weights | per entry | each container's identity |

## 8. Acceptance Criteria (headless, real inputs)

1. **Coverage:** `loot_coverage_sim` — EVERY catalog row (53+10) resolves a non-empty loot
   path: rooms manifest OR flat table. The 26-row gap = 0. EV per row inside tier band ×1.5.
2. **Rooms:** `room_kit_sim` — every row with `rooms` furnishes exactly its manifest (kit
   count, one signature, lock tier = danger) on a REAL walk-in (player enters, opens, loots).
3. **Region:** `region_loot_sim` — the same gas_station_small staged in DUST_SOUTHWEST rolls
   `water` ≥2× as often as in DIXIE_SWAMP over 200 seeded rolls.
4. **Ruler:** `ruler_loot_sim` — GEORGIA market prices +30% ±5 vs default; FLORIDA gas station
   fuel rolls ≤0.65× default; law confiscation still fires in guns_banned states (regression:
   `law_loot_override_sim` stays green).
5. **Persistence:** loot a signature container, F5/F9 — it stays looted (M7 gap closed).
6. **Editor:** MapForge state card shows the ruler whose mults applied (spot check VIRGINIA/
   GEORGIA/FLORIDA); placements of all 10 NEW rows validate against the §9 JOB rule.
