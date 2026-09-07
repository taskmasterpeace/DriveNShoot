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
LASTLINE uses one physical shuttle with a stable vehicle identity, shared by the
two directional route rows. Arrival enables the reverse route at the place the
coach actually reached; it does not spawn a second bus in the same bay.
The full-run sibling `transit_fleet` records its last safe stop without changing
the ticket record. Arrival commits fleet location and ticket completion together.
Normal reload preserves the destination/reverse availability; pending-ticket
recovery instead uses that ticket's recorded safe stop. Malformed present fleet
state rejects restoration before live mutation; old saves omitting it use the
initial Meridian location.

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

For a wrecked or otherwise failed road service, safe physical roadside egress is
distinct from an arrival: after real braking, grounding and exit clearance,
checkpoint the actual roadside player position and one full refund before
releasing the passenger. The ticket's safe-stop metadata remains the last
verified terminal for fleet recovery, not the player's claimed destination.
Emergency egress additionally waits for completed driver parking and actual
speed below 0.1m/s; the normal 0.5m/s terminal exit gate is not enough for a
still-rolling wreck. No brake/velocity shortcut is used to satisfy that gate.
The wreck stays roadside and out of service in that session. Reloading this
offline run may reconstruct one replacement coach at the recorded terminal;
disclose this interruption-recovery behavior. No player teleport, extra healing,
or invulnerability is granted. Failed writes must remain safe and retryable.

Passenger death uses the existing explicit R-respawn flow, not roadside egress.
Before changing the live death count, wallet, character or passenger ownership,
stage one full-run checkpoint with the existing safehouse/clone wake location
and revived-character semantics, deaths+1, the ordinary 40% scrap/30% scrip toll
on the pre-refund carried wallet, then one full fare refund. End the ticket as
`service_failed`; retain the fleet's last verified terminal. The fare was already
paid to the operator, so it is not carried inventory for the death toll. A denied
write leaves respawn-owned dead-rider fields, ticket, wallet, deaths, clone
backup/journal and ownership unchanged; R retries without another tax or refund.
Ordinary world time still advances: the existing hunger cadence may drain hunger
while dead, so input-driven failure checks must account for that independent
clock effect without ignoring other character differences. Successful commit
restores player processing/collision/camera at the explicit respawn location and
discloses interrupted travel. Preserve/halt the coach and disable sales for that
session; replacement remains reload recovery. Ordinary non-transit death behavior
and the clone record schema are unchanged. Share clone wake preparation rather
than maintaining a copied revival/defect policy in transit.

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

Partial engine damage reduces powered flight capability. Total engine loss,
exhausted fuel or a dead body removes propulsive lift/thrust; gravity, drag and
impact damage remain. A safe pad arrival is not guaranteed after catastrophe.
A surviving passenger may leave only after actual supported, upright, low-speed
and clear egress, checkpointing the real forced-landing position and one full
service-failure refund. The last verified terminal remains fleet-recovery
metadata. Fatal outcomes retain explicit R-respawn and its atomic death contract.
When both known pads are obstructed, the pilot holds tested clear airspace only
while real fuel and power permit, shows the delay and retries clearance. No
airborne release or refund occurs. Departure-grounding weather does not prohibit
an otherwise physically safe emergency landing.

An authoritative service keeps a bounded3x3 real chunk neighborhood while its
driver is running, including after an explicit passenger death/respawn, or while
a failed body is preserved away from its terminal. Two stable service bodies
request at most18 additional chunks, deduplicated with normal player streaming.
Waiting terminal bodies retain their constructed support. Interest comes from
actual service bodies each frame, never a client request or the whole route;
replacement/teardown releases it. Preserve live chunk identity and normal load
budgets, with immediate missing center support before physical advance.
Service-only loading does not reveal unexplored player map areas. This is local
physical support reused by later host-session travel, not nationwide MMO AOI.

Constructed service pavement shares the existing road-grip registry with other
vehicles, using stop-owned lifetime entries. Procedural trees, scatter and
anonymous neighborhood house/roof/driveway filler reserve its full footprint
without shifting outside generation draws. Late clearance removes only tagged
intersecting filler; it never rebuilds live chunks or removes authored buildings,
actors or loot. Teardown removes only that stop's grip entries, preserving any
replacement stop. Physical clearance and normal grip must survive chunk reload.

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
