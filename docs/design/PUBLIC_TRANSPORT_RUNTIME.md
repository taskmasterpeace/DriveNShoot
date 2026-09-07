# Public transport runtime

This implements the runtime half of `PUBLIC_TRANSPORT.md`. Asset delivery is
already committed; this document does not claim the service or MMO is finished.
The design decision is to reuse the real passenger mode and vehicle damage path,
with a small service controller, rather than build a second travel screen.

## Route and price

The first corridor is Meridian East to Richmond on the existing
`CR-meridian-richmond` road. Road points remain authoritative and unmodified.
Stop positions are derived from distances along that road and its shared lane
geometry. LASTLINE has six passenger seats, costs 2 carried scrip, travels at a
12 m/s service cap, and accepts the existing backpack without extra baggage fees.
KESTREL has three passenger seats, costs 15 carried scrip, cruises at 28 m/s,
and uses pads beside the road stops, outside the coach's turning area.

Timetables are game-clock minutes, not wall-clock timestamps. The first service
uses a 360-minute headway and a 30-minute boarding window. A vehicle must really
be at the origin before a ticket can be sold; the board reports unavailable if
it is travelling or recovering. A ticket is for the next physically available
departure, never an invisible duplicate vehicle. The simulation's 60x clock
continues during travel; duration is an estimate, not a guaranteed teleport time.

## Responsibilities

- `transit/catalog.gd`: validate stop/service rows, derive actual road anchors,
  report prices, destinations, schedules, capacity, and world-space routes.
- `transit/ticket_state.gd`: validate and atomically checkpoint a single local
  player's ticket and carried wallet with the rest of the run. Monotonic ticket
  serials prevent replay, even after a ticket has ended.
- `transit/vehicle.gd`: a `ProtoCar3D` service vehicle, preserving the existing
  combat, passenger, container and camera contracts. Original GLBs provide
  doors, seats and moving-part anchors; collision uses explicit vehicle rows.
- `transit/coach_driver.gd` and `transit/flight_driver.gd`: controls that move the
  real body. No transform-driven traversal, hidden teleport, or disabled world.
- `transit/service.gd`, `stop.gd`, `panel.gd`: visible service orchestration,
  proximity checks, boarding, passenger exit, prompts and input ownership.
- `transit/network.gd`: host-owned seats/vehicles and validated requests over the
  existing session. This is not account authentication or a persistent MMO realm.

## Ticket lifecycle and failures

One active ticket per player: reserved -> aboard -> ended. Buying, boarding,
cancelling, arrival, and service failure use the same atomic full-run checkpoint
writer as housing. Candidate ticket state and candidate carried scrip are written
together; neither is published if the write fails. Serial numbers increment only
on a successful purchase. Reusing a consumed serial cannot buy or refund again.

Cancellation before boarding refunds the full fare. An involuntary breakdown,
weather grounding, or interrupted save/restart refunds the full fare once. A
normal arrival or voluntary early exit receives no refund. All refunds are
bounded by the recorded paid fare. No online client writes a local authority
checkpoint, and client-supplied price, position, capacity or seat claims are not
trusted by the host.

On restart, a reserved or aboard ticket is recovered at its recorded last safe
stop and refunded atomically before the player is released on foot. This is
explicit service-interruption recovery, not a completed trip. If writing fails,
show the failure and keep the pending recovery safe and retryable; never spawn
the player airborne or silently consume the fare. Old saves without transit
start with an empty ticket; malformed transit records reject the whole restore
before any other run state changes.

## Passenger and world rules

Service boarding requires a valid ticket, free seat, stopped/open vehicle and
the character within 3 metres of the boarding anchor. The player uses the
existing passenger mode, with the authored seat rather than the generic cabin
offset. Driving inputs cannot steer public transport; hold-interact requests an
early stop instead of taking the driver's seat. Exit requires speed below
0.5 m/s and a tested clear standing location. Aircraft also require a safe
landing; no airborne exits. Death/combat, arrival, emergency and disconnection
close incompatible handheld sessions and clear stale input.

The bus brakes for obstructions and can wait or enter service failure; it cannot
phase through an obstacle to satisfy an arrival timer. The aircraft uses forces,
gravity, collision and bounded attitude control through takeoff/cruise/approach/
landing. Dust intensity >= 0.55 or rain intensity >= 0.85 at either pad grounds
departure. A mid-flight grounding condition redirects to the nearest tested safe
pad. No invulnerability is granted to vehicle or rider.

## Visible quality gates

Shared key/pad/mouse actions and focusable controls, controls help, readable
destination/next departure/fare/duration/risk/baggage/refund copy. Stops have
shelter, light and an actual boarding zone, with map waypoints. At least one
route encounter uses the existing combatants and changes supplies or standing.
Capture the ordinary gameplay camera at a stop, the open door and boarding,
road travel with a passenger, helicopter takeoff/cruise/landing, and arrival.
Label authored studio views separately. Inspect every capture personally; fix
clipping, unreadable UI, wrong seat placement and implausible motion before
claiming the corresponding gate.

Every engine/import run isolates APPDATA and LOCALAPPDATA under this worktree's
build directory. No normal player profile, production service, or public port.
Full-game completion additionally requires the still-open stability, content,
national-world, authenticated-server, and long-session gates in HANDOFF.
