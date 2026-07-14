## DRONE PILOT (goal 2026-07-07) — the rules the owner spec'd for FLYING a drone yourself
## (distinct from the autonomous ROUTE SCOUT in drone.gd). You turn a bird on and fly it;
## your body stands immobile while you do. The catches, all modeled here:
##   • You can't just SWITCH IT OFF in the air — it'd fall. request_off() LANDS it first;
##     only once it's on the ground does it actually shut off.
##   • If your (immobile) body gets ATTACKED, you must bail to defend — but the bird can't
##     drop from the sky either, so it HOVERS in place, uncontrolled, and you snap back to
##     your body. Re-take it later, or send it to land().
##   • Your body is frozen ONLY while you're actively FLYING — in HOVER/LANDING/OFF you're
##     free (you bailed / it's coming down on its own).
## Pure logic + a driven Node3D; the split-screen view (split_view.gd) rides on top.
class_name ProtoDronePilot
extends Node

enum PState { OFF, FLYING, HOVER, LANDING }

const FLY_H: float = 8.0        ## cruise altitude — the target you take off to
const FLY_SPEED: float = 14.0   ## piloted horizontal speed (m/s), unboosted
const LAND_SPEED: float = 6.0   ## descent rate (m/s)
const GROUND_Y: float = 0.2     ## "landed" height
const AIRBORNE_EPS: float = 0.3

## Flight-feel arc (owner: "should be able to control drones — polish it, make it
## feel like a bird"): a HELD target altitude (climb/dive nudge it, ground+ceiling
## clamp it), gentle accel/decel (mass, not a teleporting cursor), and a boost tier.
const CLIMB_RATE: float = 6.0        ## m/s while ascend/descend is held
const MIN_ALT_ABOVE_GROUND: float = 2.5  ## never lets you auger into the terrain
const MAX_ALT: float = 40.0          ## the signal's vertical ceiling
const ACCEL_RATE: float = 2.5        ## 1/s — time-to-full-speed ≈ 0.4s (1/ACCEL_RATE)
const BOOST_SPEED_MULT: float = 1.6  ## SHIFT while flying = boost
const BOOST_DRAIN_MULT: float = 2.0  ## …and it drinks the battery twice as fast
const MAX_BANK: float = 0.35         ## rad — roll/pitch clamp, a bird not a plank
const YAW_RATE: float = 6.0          ## 1/s — how fast the nose chases the heading
const BANK_RATE: float = 5.0         ## 1/s — how fast the tilt eases toward its target
const LEVEL_RATE: float = 3.0        ## 1/s — how fast it levels out off the stick
const BANK_GAIN: float = 0.028       ## accel (m/s²) → bank angle (rad), pre-clamp

signal state_changed(state: PState)
signal shut_off()               ## fully landed + off — body has control again

var state: PState = PState.OFF
var drone: Node3D = null
var _move: Vector3 = Vector3.ZERO   ## desired horizontal pilot input this frame
var _vertical: float = 0.0         ## -1..1 climb/dive input this frame
var _boosting: bool = false        ## SHIFT held this frame
var _velocity: Vector3 = Vector3.ZERO      ## the bird's actual eased horizontal velocity
var _prev_velocity: Vector3 = Vector3.ZERO ## last frame's velocity, for the bank's accel read
var _target_alt: float = FLY_H     ## the HELD altitude — climb/dive nudge it, nothing else moves it
var _last_agl: float = FLY_H       ## last computed altitude-above-ground (HUD reads this)
## 🛸 PILOTING skill (goal): main sets these from the character on takeoff — a practiced
## hand flies faster and wastes less charge. 1.0 = unskilled.
var speed_mult: float = 1.0
var drain_mult: float = 1.0


## Your body is locked in place ONLY while you're actively flying.
func body_immobile() -> bool:
	return state == PState.FLYING


## The dynamic split view should be up while you're piloting the bird out.
func split_should_show() -> bool:
	return state == PState.FLYING


func is_active() -> bool:
	return state != PState.OFF


## Board the bird and take off. Fails if a session is already live.
func start(d: Node3D) -> bool:
	if state != PState.OFF or d == null:
		return false
	drone = d
	_move = Vector3.ZERO
	_vertical = 0.0
	_boosting = false
	_velocity = Vector3.ZERO
	_prev_velocity = Vector3.ZERO
	_target_alt = FLY_H
	_last_agl = FLY_H
	_goto(PState.FLYING)
	return true


## Steer input while flying: a horizontal move vector (WASD / left stick), a climb/dive
## axis (-1 dive..+1 climb: SPACE/CTRL or a pad face button), and boost (SHIFT/L3, ~1.6×
## speed for ~2× the battery). Ignored unless you're actually flying.
func pilot_input(move: Vector3, vertical: float = 0.0, boost: bool = false) -> void:
	if state == PState.FLYING:
		_move = Vector3(move.x, 0.0, move.z)
		_vertical = clampf(vertical, -1.0, 1.0)
		_boosting = boost


## The HUD's altitude readout — height above the ground directly below the bird, not
## raw world-Y (a hill under it shouldn't read as "the bird climbed").
func altitude_agl() -> float:
	return _last_agl


## Player asked to shut the drone OFF. You can't kill it mid-air — if it's up, this begins
## a LANDING; if it's already down, it shuts off now.
func request_off() -> void:
	if state == PState.OFF:
		return
	if _airborne():
		_goto(PState.LANDING)
	else:
		_finish_off()


## Your immobile body was hit — bail. The bird can't fall, so it HOVERS where it is and you
## get your body back to fight.
func on_attacked() -> void:
	if state == PState.FLYING:
		_move = Vector3.ZERO
		_vertical = 0.0
		_boosting = false
		_goto(PState.HOVER)


## Send a flying/hovering bird down to land and shut off.
func land() -> void:
	if state == PState.FLYING or state == PState.HOVER:
		_goto(PState.LANDING)


## RECALL hand-off (2026-07-09 playtest): drop the stick WITHOUT landing in place — the
## caller is sending the bird home under its own autonomy (drone.recall). Frees the body
## immediately and does NOT emit shut_off (that path PARKS the bird where it hovers; recall
## wants it to fly home). The caller lowers the split view + points the drone home.
func abort_to_autonomy() -> void:
	if state == PState.OFF:
		return
	_move = Vector3.ZERO
	_goto(PState.OFF)


## Advance the piloted body. Call every frame (deterministic — the sim drives it directly).
func update(delta: float) -> void:
	if drone == null or not is_instance_valid(drone):
		if state != PState.OFF:
			_finish_off()
		return
	# QoL: the battery keeps draining while YOU fly it (the drone's own tick stands down
	# when piloted) — and an empty battery brings the bird DOWN, never a vanish mid-air.
	# BOOST drinks it twice as fast (only while actually flying under it — hovering off
	# the stick after a bail never charges the boost rate).
	if state == PState.FLYING or state == PState.HOVER:
		if "battery" in drone:
			var boosting_now := _boosting and state == PState.FLYING
			var rate := drain_mult * (BOOST_DRAIN_MULT if boosting_now else 1.0)
			drone.set("battery", maxf(0.0, float(drone.get("battery")) - delta * rate))
			if float(drone.get("battery")) <= 0.0:
				_goto(PState.LANDING)
	var p := drone.global_position
	match state:
		PState.FLYING:
			# Mass, not a cursor: ease toward the desired velocity (accel/decel both ride
			# this one lerp) instead of snapping straight to top speed.
			var top_speed := FLY_SPEED * speed_mult * (BOOST_SPEED_MULT if _boosting else 1.0)
			var target_vel := (_move.normalized() * top_speed) if _move.length() > 0.01 else Vector3.ZERO
			_velocity = _velocity.lerp(target_vel, 1.0 - exp(-ACCEL_RATE * delta))
			p += _velocity * delta
			# The HELD altitude: climb/dive nudge the target, nothing else moves it — so
			# letting go of both HOLDS the sky exactly where you left it.
			if absf(_vertical) > 0.01:
				_target_alt += _vertical * CLIMB_RATE * delta
			var ground_y := _ground_y_below(p)
			_target_alt = clampf(_target_alt, ground_y + MIN_ALT_ABOVE_GROUND, MAX_ALT)
			p.y = lerpf(p.y, _target_alt, 1.0 - exp(-4.0 * delta))
			_last_agl = p.y - ground_y
			_update_bank(delta)
		PState.HOVER:
			var ground_y2 := _ground_y_below(p)
			p.y = lerpf(p.y, _target_alt, 1.0 - exp(-4.0 * delta))   # holds the sky, no drift
			_last_agl = p.y - ground_y2
			_level_out(delta)
		PState.LANDING:
			p.y = move_toward(p.y, GROUND_Y, LAND_SPEED * delta)
			_level_out(delta)
			if p.y <= GROUND_Y + 0.05:
				drone.global_position = Vector3(p.x, GROUND_Y, p.z)
				_last_agl = 0.0
				_finish_off()
				return
		PState.OFF:
			return
	drone.global_position = p


## Faces the bird into its velocity and BANKS it (roll into lateral accel, pitch into
## fore/aft accel) — the "feels like a bird" ask. Steering itself stays camera-relative
## top-down twin-stick; this is purely the visual read on top of that.
func _update_bank(delta: float) -> void:
	if drone == null or not is_instance_valid(drone):
		return
	var accel := (_velocity - _prev_velocity) / maxf(delta, 0.0001)
	_prev_velocity = _velocity
	if _velocity.length() > 0.6:
		var target_yaw := atan2(_velocity.x, _velocity.z)
		var diff := wrapf(target_yaw - drone.rotation.y, -PI, PI)
		drone.rotation.y += diff * (1.0 - exp(-YAW_RATE * delta))
	var yaw := drone.rotation.y
	var lateral := accel.x * cos(yaw) - accel.z * sin(yaw)   # sideways accel, nose-relative
	var fwd := accel.x * sin(yaw) + accel.z * cos(yaw)       # fore/aft accel, nose-relative
	var roll_target := clampf(-lateral * BANK_GAIN, -MAX_BANK, MAX_BANK)
	var pitch_target := clampf(fwd * BANK_GAIN, -MAX_BANK, MAX_BANK)
	drone.rotation.z = lerpf(drone.rotation.z, roll_target, 1.0 - exp(-BANK_RATE * delta))
	drone.rotation.x = lerpf(drone.rotation.x, pitch_target, 1.0 - exp(-BANK_RATE * delta))


## Off the stick (hovering after a bail, or coming down) — level the wings and bleed
## the velocity so a re-take doesn't inherit a stale lean or a phantom drift.
func _level_out(delta: float) -> void:
	if drone == null or not is_instance_valid(drone):
		return
	var t := 1.0 - exp(-LEVEL_RATE * delta)
	drone.rotation.z = lerpf(drone.rotation.z, 0.0, t)
	drone.rotation.x = lerpf(drone.rotation.x, 0.0, t)
	_velocity = _velocity.lerp(Vector3.ZERO, t)
	_prev_velocity = _velocity


## The ground directly below a world position (a raycast, same tool every other system
## uses for a terrain read — steering.gd, ground_integrity, weapon LOS). No hit (open
## sky over an uncollided sim stage) falls back to sea-level so the clamp still holds.
func _ground_y_below(pos: Vector3) -> float:
	if drone == null or not is_instance_valid(drone):
		return 0.0
	var world := drone.get_world_3d()
	if world == null:
		return 0.0
	var from := Vector3(pos.x, pos.y + 4.0, pos.z)
	var to := Vector3(pos.x, pos.y - 200.0, pos.z)
	var hit: Dictionary = world.direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(from, to))
	if hit.is_empty():
		return 0.0
	return float((hit["position"] as Vector3).y)


func _airborne() -> bool:
	return drone != null and is_instance_valid(drone) and drone.global_position.y > GROUND_Y + AIRBORNE_EPS


func _finish_off() -> void:
	_goto(PState.OFF)
	_move = Vector3.ZERO
	_vertical = 0.0
	_boosting = false
	shut_off.emit()


func _goto(s: PState) -> void:
	state = s
	state_changed.emit(s)
