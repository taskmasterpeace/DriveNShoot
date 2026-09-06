# Direction-correct diamond interchanges

## Authority and current evidence

Implements the approved autonomous world-build request and THE_AMERICAN_ROAD
0.2, 0.5, 0.12 and 0.18. This is an architectural road-system repair within
the full-game goal, not a redefinition of the goal as a road demo.

At source `ad0f6f7`, a fresh isolated `road_surface_sim` fails 15/2 in
`build/road-surface-7a9e54a24b344d07a201c922b0ac36a7`: mirrored Seattle ramps
cross physical median bodies. The v1 generator sends both carriageways to the
same destination and infers roles from distance to one anchor. The source
destination is 525.75m behind and 73.40m to one side of Seattle's anchor.
Its highway is otherwise unchanged and its repaired height profiles are valid.

## Selected layout

Use a four-ramp diamond, with one separate two-way crossing road and a town
feeder. Each off-ramp starts on its own right shoulder upstream of the crossing;
each on-ramp returns to the same carriageway downstream. The crossroad passes
over the highway on a real collision deck. It never opens the median or shares
a traversable graph node with the road below. Ramp/crossroad junctions are
outside the bridge approaches, where rail gaps are not needed to turn.

Other considered layouts were paired flyover loops and a large cloverleaf.
They demand more land and elevated turning geometry. The diamond gives a clear
American road silhouette, one deliberate crossing and simple signed decisions.

The first integration targets the three explicitly generated city-exit POCs:
Seattle, San Francisco and Atlanta. The generator is reusable and data-driven;
other exits are not automatically bulldozed to make a country-wide claim.
Expansion follows per-site obstacle, grade and driving checks. Unmodified
exits and unrelated authored geometry remain authoritative.

## Data contract

- Stable exit IDs, display numbers, names, destinations, service/risk metadata,
  town IDs and existing ramp IDs are retained. Main-highway XZ/elevation rows
  and town streets/placements are not redrawn by the selective migration.
- Explicitly opted-in generated ramps use `geom: "diamond_v2"`,
  `interchange_id: <exit id>`, `ramp_role: "off" | "on"`, `side: -1 | 1`
  (highway point-order direction), and `one_way: true`. Their point order is
  always their permitted driving direction. Existing character fields survive.
- The exit carries `interchange: {layout: "diamond_v2", approach_m: 260,
  junction_offset_m: 180, bridge_clearance_m: 6.2}` and
  `connector_ids: [<exit id>-crossroad, <exit id>-town-link]`.
- Crossroad and town-link are two-way `state_road` rows, two lanes, undivided,
  asphalt, carrying `interchange_id`, with meaningful names and existing exit
  danger. Both endpoints and height profiles are real rows, never draw-only.
- All six managed road rows use `elev_mode: "structure"`. This preserves their
  explicit physical profiles without ground-road blending lifting terrain
  underneath the crossing deck; local junction endpoints still meet terrain.
- Four port junctions use stable IDs based on the exit and ramp ID, retain
  `control: "riro"`, and join the actual highway projection to the actual
  ramp terminal. The highway leg is first for existing consumers.
- Two local ramp junctions join each same-side on/off pair to the crossroad.
  A separate `grade: "deck", control: "none"` crossing row records the
  crossroad/highway crossing. A local feeder junction connects to the existing
  destination street. Exact arcs are recomputed from emitted geometry.
- All ramp resolution is by owned IDs and explicit roles; no suffix guessing.
  Legacy data retains a contained fallback until migrated, without borrowing
  another exit's ramp when a valid ownership list exists.

## Geometry and heights

Default mouth distance is 260m either side of the crossing; local junctions
are 180m from its highway centreline. At each actual highway mouth, a 70m
straight peel departs at 12 degrees from the local tangent. A sampled smooth
curve completes the departure. On-ramps reverse the corresponding reflected
shape, ending with the matching 12-degree merge. Every off/on path stays on
its own side of the highway; neither its centre nor full pavement may cross
the median. Selected sites must have enough highway length for both mouths.

The feeder leaves the town-side crossroad junction in the outward direction
before turning parallel to the highway toward the retained destination. Use
smooth bends, not coincident ramp/feeder centre lines. If the destination is
behind the anchor, the feeder handles that turn outside the diamond.

The crossing deck clears the highway top by at least 6.2m at its centre and
maintains its crest across the full underlying pavement plus 6m each side.
Approach grades must remain at or below 6% plus centimetre-rounding allowance
(0.061), with endpoints meeting local physical terrain. Fail closed for an
infeasible grade, missing highway/owned ramp, invalid role or short highway.
Do not silently flatten terrain, shift the highway, or raise endpoint junctions
into unturnable guardrails. Interpolate ramp endpoints to the actual highway
and crossroad profiles and sample interior terrain closely enough for physics
clearance; reuse the proven relief field rather than inventing a new one.

## Runtime integration

`ProtoUSMap` folds the new fields and provides one owned port query. Traffic
selects the correct departure for its direction and triggers at that mouth,
not the obsolete shared centre anchor. Directed ramp graph edges prohibit
reverse on/off traversal; direction-aware highway port transfers must not
offer a cross-median shortcut. Grade-separated roads have no direct transfer.

Road meshes, grip and physics use the same rows. One-way ramp centre markings
are white, not opposing-traffic yellow. Gores/crash barrels occupy the clear
wedge between the highway and ramp, never the drivable ramp centre. Signs and
deceleration/acceleration strips are placed per actual port and follow the
correct height. Crossroad decks/rails end before the ground-level junctions.
No new Blender asset is necessary for this geometric correction.

## Acceptance

1. Pure production-path tests prove both directions, reversed/diagonal highway
   coordinates, a behind-anchor destination, exact endpoint/role ownership,
   full-width median avoidance, curve continuity, grades, retained fields and
   no input mutation. Negative fixtures reject insufficient road length/grade.
2. Selective migration is dry-run by default, exact-scope, repeat-idempotent,
   and refuses stale writes or unsupported authored edits. Full MapForge
   rebakes retain the managed layouts, profiles, IDs and port junctions.
3. Runtime tests prove folded roles reach traffic, geometry and graph consumers,
   missing/ambiguous ownership does not select a neighbour, and four actual
   mouth/merge ports are placed on their serving shoulders.
4. Real physics and real input traverse both off-ramps to the retained town
   destination and both on-ramps back onto the correct highway carriageway.
   No transform steering, post-start teleports, disabled median, or collision
   exceptions may make this pass. Initial per-route staging is disclosed.
5. Unedited real-camera screenshots show approaches, crossing/deck, town feeder
   and completed traversal. Inspect them against the road spec, not test counts.
6. Re-run road lanes, ramp profile, broad obstruction, junction, traffic, town,
   atlas/navigation and synthetic elevation checks with isolated profiles.
   Preserve baseline billboard failures and other unrelated diagnostics.

Every engine run isolates both APPDATA and LOCALAPPDATA under this worktree's
build directory. Preserve the open normal-save incident. No push, merge,
public deployment, new release claim or full-game completion follows from
this road milestone alone.
