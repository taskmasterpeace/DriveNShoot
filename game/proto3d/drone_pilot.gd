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

const FLY_H: float = 8.0        ## cruise altitude
const FLY_SPEED: float = 14.0   ## piloted horizontal speed (m/s)
const LAND_SPEED: float = 6.0   ## descent rate (m/s)
const GROUND_Y: float = 0.2     ## "landed" height
const AIRBORNE_EPS: float = 0.3

signal state_changed(state: PState)
signal shut_off()               ## fully landed + off — body has control again

var state: PState = PState.OFF
var drone: Node3D = null
var _move: Vector3 = Vector3.ZERO   ## desired horizontal pilot input this frame


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
	_goto(PState.FLYING)
	return true


## Steer input while flying: a horizontal move vector (WASD / left stick). Ignored unless
## you're actually flying.
func pilot_input(move: Vector3) -> void:
	if state == PState.FLYING:
		_move = Vector3(move.x, 0.0, move.z)


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
		_goto(PState.HOVER)


## Send a flying/hovering bird down to land and shut off.
func land() -> void:
	if state == PState.FLYING or state == PState.HOVER:
		_goto(PState.LANDING)


## Advance the piloted body. Call every frame (deterministic — the sim drives it directly).
func update(delta: float) -> void:
	if drone == null or not is_instance_valid(drone):
		if state != PState.OFF:
			_finish_off()
		return
	# QoL: the battery keeps draining while YOU fly it (the drone's own tick stands down
	# when piloted) — and an empty battery brings the bird DOWN, never a vanish mid-air.
	if state == PState.FLYING or state == PState.HOVER:
		if "battery" in drone:
			drone.set("battery", maxf(0.0, float(drone.get("battery")) - delta))
			if float(drone.get("battery")) <= 0.0:
				_goto(PState.LANDING)
	var p := drone.global_position
	match state:
		PState.FLYING:
			if _move.length() > 0.01:
				p += _move.normalized() * FLY_SPEED * delta
			p.y = lerpf(p.y, FLY_H, 1.0 - exp(-4.0 * delta))
		PState.HOVER:
			p.y = lerpf(p.y, FLY_H, 1.0 - exp(-4.0 * delta))   # holds the sky, no drift
		PState.LANDING:
			p.y = move_toward(p.y, GROUND_Y, LAND_SPEED * delta)
			if p.y <= GROUND_Y + 0.05:
				drone.global_position = Vector3(p.x, GROUND_Y, p.z)
				_finish_off()
				return
		PState.OFF:
			return
	drone.global_position = p


func _airborne() -> bool:
	return drone != null and is_instance_valid(drone) and drone.global_position.y > GROUND_Y + AIRBORNE_EPS


func _finish_off() -> void:
	_goto(PState.OFF)
	_move = Vector3.ZERO
	shut_off.emit()


func _goto(s: PState) -> void:
	state = s
	state_changed.emit(s)
