# THE MAP-FIRST PLAN — the consultant's full memo, ruled, and the build order around the road

**Date:** 2026-07-10 · **Status:** FOR OWNER REVIEW — nothing new greenlit here until you say so
**What this is:** the owner's directive ("organize the map first — none of this matters until we get a map")
turned into a concrete order, plus honest verdicts on the consultant's detailed memo (the 10-priority list,
the item tables, factions/heat, missions, locations, extraction pressure) and the owner's vehicle-damage
approach — every verdict checked against the actual code, not the pitch.
**Companions:** `THE_AMERICAN_ROAD.md` (the canonical road ladder — this doc is its status/priority view) ·
`PLAYTEST_SPEC_2026-07-10.md` §C (first-pass verdicts on the consultant's 9 headlines) ·
`THE_BUILDING_BOOK.md` (53-row catalog) · `docs/DIVIDED_STATES.md` (the lore bible the factions come from).

---

## 0. The verdict

**You're right, and the codebase agrees with you.** The consultant's ten priorities are all *pressure*
systems — heat, roles, missions, mods, escalation. Pressure needs geography: a toll raider needs a bridge,
a convoy raid needs a route, faction heat needs territory, a mission needs an address. Today roads still
don't fully connect (M1 part 2 is the next rung), addresses don't exist until M3, and buildings are shapes
without verbs. Build his systems now and they'd float in space.

Two sharpenings of "map first":

1. **"The map" is not new work — it's THE AMERICAN ROAD ladder, already ratified and two rungs in.**
   M0 shipped, M1 part 1 shipped (junction bake, road_graph, GPS routing). "Organize the map" = keep
   climbing that ladder, not redraw usmap. The finish line for this phase is M3: *signs, atlas, and radio
   can all answer "how do I get to Rosewood?"*
2. **One exception earns a parallel lane: enemy roles (#6).** Bandits-who-won't-dismount was your own
   loudest playtest complaint, it lives in NPC files (not `world_stream.gd`, the map arc's hot file), and
   it needs no addresses. It should not wait for the map.

And one honest count: **four of the consultant's ten already exist in the codebase** (dog commands
wholesale; the creature/infected sound-AI layer; deployables; the faction-memory ledger). The memo's
instincts are excellent; its inventory of what DRIVN already has is ~60% current. Verify before building —
half this plan is *surfacing*, not construction.

---

## 1. Where the map actually is (the ladder, status view)

Canonical definitions live in `THE_AMERICAN_ROAD.md` §2. This is the status + what each rung unlocks
from the consultant memo.

| Rung | State | The player gets | Unlocks from the memo |
|---|---|---|---|
| M0 true-up + free wins | ✅ shipped | placements materialize; FLORIDA relief 0 | — |
| M1 pt 1 — junction bake + `road_graph` | ✅ shipped | GPS routing, atlas fastest-way | — |
| **M1 pt 2 — junction/exit GEOMETRY** | **◐ NEXT** | drive I-80→I-95 through a real median gap; angled exit ramps past painted gores | chase/escape driving; chokepoints exist at all |
| M2 — ground integrity | open | can't fall through the highway; real bridge decks | **bridges = toll/ambush anchors** (his Tollkeepers) |
| M3 — ADDRESS LAW + two-tier towns | open | "MIAMI — I-95 EXIT 21" on signs/atlas/radio; exits grow real towns | **missions (#9)** need addresses; your parked GPS-device gating idea slots here |
| M3b — network fill + DIRT DISCOVERY | open | county roads + dirt spurs with payloads | "three ways to get there, all bad" — his §12 route thesis |
| M4a/b — corridor look kit, mile markers | open | Florida reads as Florida | night driving/spotlight gameplay has a stage |
| M5 — catalog + 5 core enterables | open | walk into the Hollowpoint diner | **his §12 location list lands here** (see §2) |
| M6 — ecosystem phase 1 | ✅ effectively shipped (the living-world loop, iters 1–8) | the Alley is alive | his §5 creature-roles column, largely done |
| M7 — interiors wave 2 + library shelves | open | room kits, findable books | hospital-ruin / clinic fantasy |
| M8 — mountains | open | Colorado is climbs | — |
| MT — traffic returns | PARKED (owner-gated) | strangers use the same road graph | convoy raids at full fidelity |

**Discipline that binds this plan:** `world_stream.gd` is the hot file — map rungs run in sequence, never
two in parallel. Everything in Lane C (§6) was chosen because it *doesn't* touch that file.

---

## 2. The consultant's memo, ruled item by item

Verdicts: **BUILD** (agree, it's new) · **WIRE** (exists — surface/extend, don't rebuild) ·
**COUNTER** (right instinct, wrong shape) · **ADOPT-AS-LAW** (design principle, not a feature) ·
**SKIP** (owner ruling or bloat).

### The ten priorities

| # | Item | Verdict | The truth on the ground |
|---|---|---|---|
| 1 | Vehicle armor/mod system | **BUILD** — car identity is the game | Directional armor is **already in the schema** (`data_vehicle.gd`: `armor_front/rear/side`, VehicleForge edits all three) — the runtime just collapses to the front value (`car_3d.gd:690`). §3 below is the architecture. Mods: adopt ~6 of his 16 as garage-fitted rows, each with a verb (ram bar, plow, spotlight, siren, winch, run-flats — run-flat tires already exist as a tire row). |
| 2 | Armor paperdoll | **BUILD (cheap)** | 6-part paperdoll + wound taxes exist; the eyepatch already proves the tradeoff pattern (−50% vision arc, `character.gd:83`). Wearables = rows that eat part-damage first and charge a tax. Dog vest joins (bond/down states already exist). Adopt his tradeoff column, not all 10 pieces. |
| 3 | Sound/light AI response | **WIRE** | The ear layer shipped: creatures flee the loudest noise (`creature.gd:285`), infected steer to it (`infected.gd:213`), howlers investigate, the apex widens on your racket, birds are a tell. Missing: **bandit ears** and a **light layer** (manual headlights — playtest A4 — then headlight discipline, flares, spotlight). Extend, don't build. |
| 4 | Faction heat system | **WIRE, after territory** | `respect.gd` (per-faction/state ledger → prices, refusals, border bounty-hunters) has existed for weeks; the LOOT/WANTED spec is banked. His five heat *types* are a good decomposition to fold in when that spec executes — after M3 gives heat somewhere to live. ⚠ Your wanted-level UI has **no wanted backend yet** — bind v1 to respect standing + ruler bounty. |
| 5 | Field deployables | **WIRE + extend** | Mines, motion sensors, cameras, bait are shipped items. Add road spikes + scrap barricade once M1p2/M3b make routes worth denying. His own anti-Minecraft warning is right — fast ugly tactical, no base-building bloat. |
| 6 | Enemy roles | **BUILD NOW** — the rightest item | = playtest A9. Howlers already prove the pattern (circler/charger/screamer); bandits have driver brains and no dismount-and-fight. Rusher/flanker/suppressor on the existing pack framework. Map-independent → parallel lane. |
| 7 | Voxel destruction | **COUNTER** | DRIVN is not a voxel game — box-rig + data rows is the identity; a voxel pipeline is an art rebuild for a look we don't have. The salvage: **breachable parts as rows** (walls/fences take damage → new entry paths) and his "cars lose doors/hoods," which lands in §3's panel tiers instead. |
| 8 | Dog command system | **EXISTS — wholesale** | C ×1 heel · ×2 guard · ×3 seek · hold SIC · ×4 SHIELD, plus auto-jump, pounce, Hunter dig, horn recall, bond gating. The consultant recommending we build what shipped is the surfacing crisis, exhibit A (§5). Cost: hint line + book row + a TEST GROUNDS station. Bark modes/scent-trails = later extensions. |
| 9 | Mission templates | **BUILD, after M3** | The glue — agreed completely. But a contract must *send you somewhere*, which is literally what M3 addresses provide. Radio contracts, ring events, and convoys are the seeds. Wave 1: convoy raid, fuel run, night extraction, car-theft contract. |
| 10 | Death Lance | **BUILD LAST — the treat** | Genuinely good signature-mechanic thinking: one weapon row + a mount + a speed gate + a stuck-risk. Cheap once #1's mount system exists. It should joust on connected roads, so it ships after the substrate. |

### The rest of the memo

- **§12 map locations** — **FOLD into M5.** Half his list already exists (drive-in: live, plays trailers;
  "Carousel bunker": there are ten; radio tower ≈ the Newsroom); the rest are Building Book rows (dead
  mall, motel strip, hospital ruin, rail yard, fairground — the catalog is at 53 rows). The real work is
  *placement along corridors*, which **is** the map arc.
- **§14 extraction pressure** — **ADOPT-AS-LAW.** The best idea in the memo. THE CIRCUIT + the noise bus +
  respect already form the loop; the missing rung is **local response escalation** — a director that
  converts your racket into hunters and blocked roads, then lets you buy your way out by leaving. Working
  name: THE RESPONSE LADDER. Needs its own 8-section design doc; slots after enemy roles (it composes
  them). This also answers his "quiet entry → escalation → ugly exit" curve without any new content.
- **§13 dog mechanics** — mostly exists (tracking = seek, guard-car ≈ guard, fear = headlight/pack fear
  already in howler/dog code). Adopt: dog vest (→ #2), fetch (later).
- **§9 survival items** — **SKIP most.** Hunger stays light (his own "hunger as accounting is boring"
  warning — agreed). Cherry-pick splint + tourniquet: they fit the existing wound/bleed system.
  **NO CIGARETTES — owner ruling 2026-07-10.** Dirty water/filters only if water survival ever matters.
- **§11 weapons** — role-fillers later, and his own bar is the law: *if it's "pistol but 23 damage," cut
  it.* Pass the bar today: revolver (stagger), sawed-off (burst), crossbow (quiet + retrievable bolts),
  flare gun (feeds the light layer). Harpoon/scrap cannon ride the vehicle-mounts arc.
- **§6 faction roster** — **use OUR lore.** DIVIDED STATES rulers + the respect ledger *are* the faction
  system; his "The Choir" already exists as THE FIRST CHOIR (THE_INFECTED arc). Adopt his identities as
  *flavor* for existing states/rulers where they fit (Tollkeepers, Gas Saints, Scrap Union are good coats
  of paint) — do not build a parallel faction system.

---

## 3. The vehicle damage architecture (your approach — endorsed)

Your 8-point plan (stable hull · dent visible panels only · pooled decals · directional armor ·
penetration vs resistance · event-driven updates · simplified distant damage · no soft-body) is the right
call, and the codebase is already most of the way there:

- The **collision hull is already separate from the visuals** — cars are assembled from discrete style
  blocks (`car_3d.gd _style_block`): hood, roof, trim, front_armor. **The "panels" already exist as
  boxes.** Denting = offsetting/rotating/compressing existing nodes, not new geometry.
- **Armor faces are already data** (front/rear/side in the schema + VehicleForge); only the runtime
  collapse to a single value needs replacing.
- **Damage is already event-driven and saveable** (5 parts + per-wheel punctures round-trip via
  `snapshot_damage`), and **traffic is already two-tier** (ambient lane-followers vs promoted ProtoCar3D)
  — your "distant cars get simplified damage" is the current architecture.

Phases (each lands with a sim):

| Phase | Work | Size |
|---|---|---|
| **D1** | Per-face armor resolution: hit direction → front/rear/side lookup in `take_combat_damage`; penetration = weapon damage vs face resistance (weak hit = mark, heavy = part damage). | ~1 day |
| **D2** | Panel response: on part damage, dent/rotate/compress the style block nearest the impact, 3 visual tiers; tier 3 can shed the panel (doors/hood — consultant #7's instinct landing in the right place). Derived from the damage snapshot → saves for free. | ~2–3 days |
| **D3** | Bullet-mark decal pool (cap ~24/vehicle, oldest recycled), promoted vehicles only. | ~1–2 days |

Zero per-frame cost, no soft-body, VehicleBody3D untouched. This *is* consultant #1's foundation — mods
(ram bar, plow, armor plate) then become rows that modify face values and add mount points.

---

## 4. Owner rulings (2026-07-10 — recorded so nothing re-litigates them)

1. **MAP FIRST.** The road ladder is the spine; each system attaches only after its map dependency exists.
2. **UI is the owner's lane** (the pixel HUD 6-system wire-up: gauges, plates, GPS, wanted). Agents flag
   findings with measurements (the A5 protocol) — never edit the lane.
3. **No cigarettes as meds.** Ever.
4. **No item warehouse.** Every adopted item needs a distinct behavior/verb — the consultant's own bar,
   now binding.
5. **Pixel-generated art now; authored art later.** The file-swap laws (SFX drop-in over synth, texture
   rows, the moving-part law) exist precisely so that upgrade is a re-skin, never a rebuild.

---

## 5. The surfacing crisis (the flat-tire anecdote)

On 2026-07-07 you asked for tire punctures; they shipped that day (`car_3d.gd:498` — "owner ask
2026-07-07", per-wheel flats, top-speed tax, saved). On 2026-07-10: *"I didn't know we had flat tires."*
If a system is invisible to its **owner** in three days, it does not exist for a player at all — the
CLAUDE.md surfacing law, proven on us.

Also shipped and invisible: tire wear tiers (black→shredded, grip + drag taxes) · fuel-tank leak + the
other damage feels · the whole dog whistle ladder · deployables (mines/sensors/cams/bait) · the car entry
ladder (quiet pick vs loud smash) · the respect ledger's price/refusal consequences.

The fix is three moves, all cheap, two already specced:
1. **Dash warning lights** — your gauge lane is *exactly* where leak/flat/misfire/flicker belong (the
   80-icon library already has candidates). This is the ask from Lane B to Lane A.
2. **Signs speak verbs** (playtest B2) — "💰 LOOT · 🏁 RACE: E at the board."
3. **The testing ledger board** (playtest B1) — every testable system, its location, its DO→EXPECT line.

---

## 6. The build order

**Lane A — owner (untouched by agents):** the pixel HUD wire-up (plates ✅, GPS ✅, four systems to go).
One flag: wanted-level UI should bind to respect standing + ruler bounty for now (no heat backend yet —
it arrives with #4 after M3). One ask: reserve dash slots for the damage warning lights (§5).

**Lane B — the spine (sequential, owns `world_stream.gd`):**
1. The standing fix queue first — it never ran; the loop closed the ecosystem audits instead. A1 lurker
   sprawl (one line) · A3 voidnet permanent log · A4 headlight toggle row · A6 hum pitch cap · A7 shotgun
   feel rows · the audit-4 wildlife re-mint gate. ~1 day total.
2. **M1 part 2** — median gaps, slabs, exit peel geometry (the "roads finally connect" moment).
3. **M2** ground integrity → **M3** THE ADDRESS LAW + towns → **M3b** county/dirt net → **M4** the look
   → **M5** enterables + §12 locations placed.

**Lane C — parallel systems (never touches `world_stream.gd`):**
1. **#6 enemy roles** — bandit dismount + rusher/flanker/suppressor (your A9).
2. **B1 Proving-Grounds expansion** — danger room lever, race loop, god shelf ("test stuff faster").
3. **D1–D3** directional armor + panel damage (§3), then mod rows (#1) and paperdoll (#2).

**After M3 unlocks addresses:** #9 mission templates → #4 heat v2 (his five heat types fold into the
banked WANTED spec) → THE RESPONSE LADDER (§14, needs its design doc) → #5 deployables extension →
#11 role-filler weapons → **#10 Death Lance** as the closer.

---

## 7. Acceptance — what "the map is organized" means (testable)

Straight from the ladder's definitions of done, all headless-sim + drive-it-yourself provable:

- Turn from I-80 onto I-95 through a **real gap in the median**, down a **real angled ramp** (M1p2).
- Cross the canal on a **bridge deck**; never fall through the highway at any speed (M2).
- Ask "how do I get to Rosewood?" and get the same answer from a **sign**, the **atlas**, and the
  **radio**: highway + exit number (M3).
- Leave the interstate, follow a **dirt spur**, find something the map never marked (M3b).
- Walk into the Hollowpoint **diner**: roof hides, register loots (M5).

Per `.claude/rules/design-docs.md`, each *system* this plan greenlights still gets its own 8-section
design doc before build (vehicle mods, paperdoll, missions, THE RESPONSE LADDER); this document is the
roadmap that orders them.
