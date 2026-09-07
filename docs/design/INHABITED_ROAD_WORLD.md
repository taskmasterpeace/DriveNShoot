# Inhabited road world — next delivery contract

Status: design/preflight, not implemented acceptance. Continues the owner's
September 7 instruction to build an Autoduel / Deathlands / Mad Max / Ultima
Online-inspired DRIVN world autonomously. Original characters, names and art;
these references describe vehicle danger, strange wilderness, scavenged survival
and persistent everyday life, not copied settings or assets.

Authorities: `ENGINE.md`, `WORLD_PILLARS.md`, `THE_BUILDING_BOOK.md`,
`THE_BUILDING_BOOK_ROOMS_AND_LOOT.md`, `PUBLIC_TRANSPORT_RUNTIME.md` and current
`HANDOFF.md`. Existing transport execution continues first; this document keeps
the next building/content work from becoming a disconnected feature list.

## The playable promise

Drive or ride into a place, understand what it offers from the street, walk
through its real doorway, choose what risk to take, and leave with a consequence
that survives returning. Home provides useful continuity between trips. Routes
connect these places and create uncertain situations; neither transport nor
opening a menu makes the player invulnerable.

The first acceptance circuit is Roadstead → Meridian LASTLINE → Richmond:
ordinary driving, cheap coach travel, expensive weather-limited KESTREL flights,
local work and owned-home use. The country remains continuous; this circuit is
a testable initial delivery, not a claim that the entire USA is finished.

## Source-confirmed gaps

- `structure_builder.gd` constructs real front-door openings for enterable rows,
  but most such rows have `interior_template: none`. Seven templates currently
  apply the interior skin; a boolean enterable flag is not a furnished room.
- `furnisher.gd` places a small furniture set along west/back walls. It has no
  room-kit or signature-container orchestration. Furniture sleeps past55m and
  wakes within40m subject to the three-per-chunk cap.
- `furniture.gd` explicitly holds rolled contents only on its live instance.
  Sleeping/recreating a piece or loading a run can reroll the same original
  contents. Existing save fields for dragged furniture store transforms, not
  these fixed cabinets' contents. New content must not amplify this loophole.
- `road_life.gd` spawns one lurker for the last-light job attempt. It does not
  yet provide the varied, persistent road situations requested by the owner.
- Roadstead cottages have real floor/doorway/porch collision, roof cutaway and
  practical lights. Ownership/storage/pantry actions exist on the parcel panel;
  the interior still needs stronger spatial identity and useful in-room verbs.

The first four focal types already have authored Meridian placements in the
current national map. Their identity and profile preflight is below; these
coordinates are source data, **not** a passed doorway/footprint inspection.

| Placement ID | Type / footprint | World X,Z | Current interior skin |
| --- | --- | --- | --- |
| meridian-gas | gas_station_small /12×9m |140,-302.5 | walkin |
| meridian-clinic | clinic_small /12×10m |52,-277 | none |
| meridian-motel | motel_strip /22×8m |166,-277 | walkin_roofed |
| meridian-auto | auto_shop /15×12m |38,-303 | none |

All four rows are one-floor and enterable. Do not invent duplicate landmark
placements to make a demo easier. Clinic and auto-shop skin activation, genuine
room paths, garage access and motel bedroom separation need their own physical
layout checks. The existing single front-door shell is not proof of a usable
garage bay or several accessible motel units.

## Delivery order and boundaries

1. Close the current transport integration review; complete physical flights,
   shared service authority and the approved route encounter/handheld pass.
   No replica flight built as a map teleport; no lifecycle bugs carried forward.
2. Add durable fixed-furniture contents and exact placement identity. Test
   returning after LOD sleep, actual chunk regeneration and save/reload before
   expanding room density. Preserve the existing container and loot resolver.
3. Materialize the room-kit vocabulary from the Building Book, starting with
   gas station, clinic, motel and auto shop as distinct usable places. Use
   existing authored placements after full approach/footprint inspection; new
   placements require explicit validated rows, never guessed coordinate changes.
4. Add building decisions and a bounded regional road-encounter director using
   existing enemies, damage, respect and inventory. Continue the transport
   encounter journal where its semantics match; do not introduce a second
   competing combat or quest-reward engine.
5. Finish a real-input circuit covering home use, a building visit, road danger,
   transport, return and reload. Capture day/night and each interaction phase.
   Then extend verified content rows region by region, measuring performance.

Each delivery gets a concrete implementation plan and independent review before
the next depends on it. Building persistence and encounter schema details must
be settled in those plans before code; this is the umbrella contract, not a
dispatch brief containing invented interfaces.

## Building rules

Rooms contain furniture, not independent loot tables. Follow the canonical
room manifests and exactly one signature container per placement. Preserve
law-last loot resolution and the existing Scavenging lock rules. A late or
regenerated interior must expose the same remaining contents, never a second
jackpot. Building placement IDs already exist on authored roots; use them for
identity instead of relying solely on rounded XZ coordinates. Standalone
safehouse/property pieces need explicit stable IDs in their owning rows.

Retain visible roof/front-wall cutaways, walkable door clearances and genuine
floor support. Partitions must leave reachable paths to every required room and
container. Furniture must not obstruct entry, stairs or exit. The current
bounded interior LOD is a budget, not permission to leave the player's occupied
building permanently empty; nearest/occupied-room admission needs an explicit
deterministic policy and coverage when a dense chunk exceeds its cap.

Every delivered focal building has at least three real verbs. Proposed mappings
must use the existing spec and available systems:

| Place | Physical rooms | Useful decisions |
| --- | --- | --- |
| Gas station | sales floor, back room | scavenge supplies, obtain fuel, risk the exposed forecourt |
| Clinic | lobby, ward | seek treatment, obtain meds, choose aid versus keeping scarce supplies |
| Motel | office, separate bedrooms | rent/rest, investigate a room, keep or avoid a dangerous guest encounter |
| Auto shop | garage bay, office, storeroom | repair, search for parts, accept a supply job |
| Owned cottage | living/kitchen and sleeping/storage areas | use owned storage, prepare supplies, rest between runs |

Labels describing verbs do not count as delivery. Each accepted verb changes
real inventory, clock, condition, standing or state through its shared system.
Civilian aid is never secretly a guaranteed ambush; danger has readable tells.

## Encounter rules

Use seeded choices with recorded outcomes, not a fresh reward roll every time
the player crosses a trigger. Quiet travel is a valid result. Bound concurrent
encounters, minimum spacing and cooldown; suppress incompatible setups in roads,
boarding/landing clearances, occupied homes and already-active encounters.

The first variety target is stranded traveler, salvage opportunity and hostile
road interception, plus the approved transport aid/attack situation. Provide
an understandable choice and a real way to leave. Hostiles use existing AI and
weapons, respect real collision, and do not spawn directly on the player. Aid
consumes an actual item and grants a bounded once-only consequence. Refusing aid
does not conjure enemies from nowhere; any attack needs an authored eligible
situation. Resume/reload must not double-pay or reroll a resolved choice.

The exact event schemas, weights, spacing, cooldowns, identifiers and save
validation belong in the implementation plan after checking the live director
and transit journal. No runtime code is authorized by an unspecified threshold.
Online encounter ownership must use host facts; single-player persistence is
not authenticated MMO persistence.

## Presentation and proof

Use original Blender-authored props through the established safe MCP pipeline
where the bitmap/box stand-ins fail the visual bar; preserve editable sources,
metre scale, clearance and asset provenance. Ink/bone/amber interfaces and worn
cream/green/olive/rust world art, no purple. Keep the shared input actions,
controller focus, visible close paths and readable small-viewport layout.

Evidence requires actual walking through doors and room paths, real item
transfers, actual driving/riding, persistent outcomes and ordinary-camera
screenshots. Initial scene placement is labeled setup, never traversal proof.
Inspect entry, room overview, interaction, exit and night views personally.
Fix blocked sightlines, bare rooms, floating objects, wall text occlusion and
unreadable controls with before/after images and regressions.

All engine/import runs isolate both APPDATA and LOCALAPPDATA under this
worktree's build directory. Preserve the unrecovered normal save. Scoped local
commits only; no shared-branch push, public service, external deployment or new
release export. Native crashes, full-suite failures, national content coverage,
authenticated servers and long-session production gates remain open until
independently evidenced; never substitute a self-assigned quality score.
