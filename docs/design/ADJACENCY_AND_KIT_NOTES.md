# Adjacency Auto-Join & Kit-of-Parts — clean-room notes

**Status:** design notes, not built. **Source:** a fresh-context evaluation of
`github.com/jasonkneen/tiny-world-builder` (TWB) — verdict: do NOT adopt it (AGPL-3.0,
Three.js/JS with ~0% Godot reuse, a 20×20-cell diorama paradigm vs our 60×-compressed
continent). See the verdict in the session record. These are the *ideas* worth reusing,
reimplemented from our own words with the AGPL source closed (idea, not expression —
Google v. Oracle covers schema/interface shape; a 1:1 port would carry the license).

Each idea below is mapped to a gap DRIVN already named for itself. Build order deferred
to the owner (map-first stands).

---

## 1. Draw-time adjacency auto-join — the top one (targets the AMERICAN_ROAD junction gap)

**Our gap (already named in `docs/design/THE_AMERICAN_ROAD.md`):** roads "don't connect."
Junctions are a *post-hoc* bake (`/api/junctions/bake` in MapForge; `graph_health`
exists only because connectivity breaks). Placements never snap or auto-orient to the
road they serve. Connectivity is a repair pass, not an authoring affordance.

**The idea (TWB proves it live):** pick a piece's variant from its neighbors at *edit
time*, via a 4-neighbor bitmask — fences choose n/s/e/w, houses choose L/T/+/square. So
authoring is "place it and it fits."

**How we'd reimplement it (clean-room, in MapForge over Godot primitives):**
- When a road vertex is dragged near another road's endpoint, **snap + auto-orient**
  and **mint the junction inline** (not on the next bake). The bake becomes a
  verification/lint, not the thing that creates connectivity.
- Placements gain an optional "faces_road" flag: on drop, auto-rotate to the nearest
  road's tangent so a gas station's forecourt faces the highway without hand-rotation.
- Reuse Godot's own autotile/`AStarGrid2D` thinking for the algorithm; don't rebuild it.

**Watch-out (from the evaluation):** Godot ships autotiling (TileMap/GridMap) and grid
A* already, and our junction bake already approximates the road case. The *real* value
here is the **authoring-time affordance** (snap-as-you-draw), not the algorithm — don't
rebuild an engine primitive.

## 2. Per-placement interactable hook — targets the 26/53 loot-less catalog rows

**Our gap:** 26 of 53 `DrivnStructure` rows still have no loot path; the room-kit/loot
layers are specced (`THE_BUILDING_BOOK_ROOMS_AND_LOOT.md`) but partly unbuilt.

**The idea (TWB's `economy{resource, action, charges, label}`):** any placed cell becomes
harvestable/interactable from a *pure data row*, zero per-object code.

**How we'd reimplement it:** an optional `interact{verb, resource, charges, label}` field
shape on `DrivnStructure` (or on a placement), read by one generic interact handler.
This fits our one-signature-container / "no box without a purpose" law and is the missing
bridge from a placed pin to a validated interactable. **Adopt the field SHAPE only** as a
data format (interface, not code).

## 3. Kit-of-parts primitive composer — targets the "every shell is the same box" gap

**Our gap:** every building shell today is the same 4-walls-plus-front-door box from
`footprint_m`; `THE_BUILDING_BOOK` specs a modular composer that was never shipped
(`room_kits.json`/`region_loot.json` don't exist yet).

**The idea (TWB's `customParts[]`):** compose a prop/structure from low-poly primitive
rows — box / cylinder / cone / sphere / cable, each with material / size / pos. This is
conceptually identical to our own box-puppet rig ethos.

**How we'd reimplement it:** a data-driven `parts[]` on a structure row, materialized by
`ProtoStructureBuilder` the way the puppet rig reads its box rows — so shells stop being
one fixed recipe.

## 4. Cheap per-instance variation (trivial, do-anytime)

`transform{rotationY, offset}` + `appearance{bodyColor, topColor, scale}` on PLACEMENT
rows, so identical catalog rows read as unique placements. Near-zero cost visual richness.

## 5. A future Godot-native 3D editor viewport (architecture note, NOT a browser app)

**Our gap:** MapForge is 2D-plan-only — you place a building as a pin and can't see its
massing/walls/interior until you round-trip to Godot.

**The idea (TWB's clean model/render split):** intent keyed by cell vs scene-node keyed
by string, with a single `setCell()`-style write path ("never mutate the model dict
directly; rebuild only the dirty cell + re-render adjacency neighbors").

**Our answer is a Godot editor PLUGIN over our own `usmap.json` rows — NOT a browser tool.**
The license and paradigm both point away from adopting TWB itself; it's only the concept
car showing a WYSIWYG editor is achievable. (This is UI — the owner's lane.)

---

## The clean-room discipline (do this if any of the above is built)

Read TWB to learn the *idea*, write notes in our own words (this file), then implement
from the notes **with the AGPL source closed**. Do not transliterate its functions,
names, or control flow. A "port dressed as inspiration" carries the AGPL. Document the
process. Nothing here reuses TWB code — only ideas already reduced to our own words.
