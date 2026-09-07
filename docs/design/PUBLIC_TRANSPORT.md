# Public transport — ongoing implementation contract

Status: design and asset construction, **not yet a playable service**.
The complete game goal remains unchanged. This subsystem adds to the existing
continuous America, enterable homes, road jobs, encounters, and passenger games;
it does not replace those with a menu-only travel game.

## Player promise

LASTLINE is a survivor-run road coach service. KESTREL is a costly salvaged
utility-helicopter courier. Both carry the actual character through the streamed
world. Coaches follow legal road routes; helicopters visibly board, take off,
cruise, land, and discharge passengers. Neither is a renamed Carousel teleport.

Fares, next departure, destination, estimated duration, baggage rules, and route
risk are visible before purchase. Keyboard/mouse and controller use the same
interaction/menu actions. A rider can inspect the map or play a Game Deck
handheld while the journey and world clock continue. Combat, arrival, and
emergency disembarkation terminate incompatible handheld sessions safely.

Buses are slower and cheaper, with road danger and breakdown pressure. Rotor
flights are faster and more expensive; severe weather grounds departures and
emergencies require a physical landing. Stops offer shelter, information and
encounter choices, not merely a marker. Decisions must affect supplies, standing,
time or safety, without granting invulnerable travel or pausing the wider world.

## Required delivery sequence

1. Original coach/helicopter art with metre-scale bounds, grounded wheels/skids,
   animated-part pivots, separate cabin roof and usable boarding/seat anchors.
   Verify exported geometry and real Godot import; inspect rendered silhouettes.
2. Authored stop/route rows, timetable, fare/ticket state, capacity, denial/refund
   rules and save/restart continuity. Transactions must not double-charge or
   duplicate tickets; failed writes must not publish partial state.
3. Real coach boarding and driver-controlled road traversal, obstacle handling,
   physical arrival and on-foot exit. Prove trips through input, not teleports.
4. Physical helicopter travel with collision, clearance, weather/landing rules,
   safe passenger recovery and genuine flight screenshots.
5. Shared keyboard/pad/mouse service UI and readable in-world stops. Verify the
   carried Game Deck session, input ownership and interruption transitions.
6. Host-authoritative shared service state, seats and boarding requests; later
   authenticated realm integration. Local/offline evidence is never MMO proof.
7. Route encounter choices and persistent consequences, full-loop regression,
   screenshot-led polish and long-session/load validation.

This is dependency order, not a reduction of acceptance to item 1. None of items
2–7 is claimed implemented by producing assets. No release export follows from
this document. Current native-stability and save-recovery gates remain open.

## First asset decision

Use the existing original BlenderForge pipeline and installed Blender MCP stdio
adapter, with a new disposable loopback-only Blender session. No user scene or
preferences are overwritten. Coach palette: faded cream, oxidized green, amber
route board, patched steel, baggage rack, visible cabin. Helicopter: weathered
olive, cream courier marks, safety orange, narrow utility cabin and exposed tail.
Keep functional glazing, doors, skids/wheels and attachment points distinct;
damage/weathering supports the silhouette instead of hiding it. Godot front is
-Z, up +Y, right +X. Source art is editable and independent of gameplay code.

Alternatives considered: adapting a featureless van would save authoring time
but fail the bus silhouette; downloaded models would add uncertain matching and
licensing work. Original assets through the established pipeline are selected.

## Verification boundaries

Every engine/import run isolates APPDATA and LOCALAPPDATA under this worktree's
build directory. No normal player profile, production service, or public port.
Asset previews are labeled studio renders, never gameplay evidence. Tests inspect
actual embedded GLB vertices/hierarchy and imported meshes; metadata alone is not
proof of geometry. Runtime delivery also requires boarding clearance, collision,
save, input and network tests beyond the asset checks.
