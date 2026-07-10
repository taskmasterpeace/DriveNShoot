## A driver's sight is a HUMAN HEAD, not the car's unbounded world yaw.
## The resolver owns one vehicle-local neck angle: turn anticipation nudges it,
## active mouse/pad look temporarily owns it, and a damped spring returns it.
class_name ProtoDriveGaze
extends RefCounted

const TURN_LIMIT: float = deg_to_rad(35.0)
const AIM_LIMIT: float = deg_to_rad(80.0)
const LOOK_AHEAD_S: float = 0.55
const OMEGA: float = 9.0

var local_yaw: float = 0.0
var yaw_velocity: float = 0.0
var idle_s: float = 99.0
var source: String = "returning"


func reset() -> void:
	local_yaw = 0.0
	yaw_velocity = 0.0
	idle_s = 99.0
	source = "returning"


## Returns the resolved WORLD gaze. `aim_world` is never returned as weapon
## aim; the caller keeps that independent and uses this vector for sight only.
func update(delta: float, car_basis: Basis, yaw_rate: float, aim_world: Vector3,
		aim_active: bool, source_in: String) -> Vector3:
	idle_s = 0.0 if aim_active else idle_s + delta
	var target: float = clampf(yaw_rate * LOOK_AHEAD_S, -TURN_LIMIT, TURN_LIMIT)
	source = "turn" if absf(target) > 0.01 else "returning"
	if aim_active and aim_world.length_squared() > 0.001:
		var local: Vector3 = car_basis.inverse() * aim_world.normalized()
		target = clampf(atan2(-local.x, -local.z), -AIM_LIMIT, AIM_LIMIT)
		source = source_in
	var accel: float = OMEGA * OMEGA * (target - local_yaw) \
		- 2.0 * OMEGA * yaw_velocity
	yaw_velocity += accel * delta
	local_yaw = clampf(local_yaw + yaw_velocity * delta, -AIM_LIMIT, AIM_LIMIT)
	return (car_basis * Vector3(-sin(local_yaw), 0.0, -cos(local_yaw))).normalized()
