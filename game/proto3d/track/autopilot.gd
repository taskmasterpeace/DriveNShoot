## THE AUTOPILOT — a steering brain for any ProtoCar3D (Proving Grounds, and the
## groundwork for vehicle AI everywhere: chase, race, patrol). It drives the SAME
## input fields a player does (input_throttle/input_steer — the input-packet law),
## seeks a target point/node, and dodges obstacles with three raycast whiskers.
## No pathfinding yet — this is the reflex layer real navigation will sit on.
class_name ProtoAutopilot
extends Node

var car: ProtoCar3D = null
var target_node: Node3D = null     ## chase THIS (a ghost, a player, a rabbit)
var target_pos: Vector3 = Vector3.ZERO ## …or drive to a fixed point
var arrive_dist: float = 6.0       ## how close counts as "there"
var aggression: float = 1.0        ## throttle scale (a cautious driver < 1)

var _whisker_hit: Array = [false, false, false] ## L, C, R (sim/debug readout)
var _stuck_t: float = 0.0    ## seconds of full-throttle-going-nowhere
var _reverse_t: float = 0.0  ## >0 → backing out of a wedge (steer mirrored)
var _last_steer: float = 0.0
## COMMITMENT: a lateral bias that persists a beat. Pure per-frame reflexes
## DITHER against a wall face (steer flips every sample — the gauntlet proved
## it); picking a side and holding it is what threads the gap.
var _dodge: float = 0.0


static func attach(car_in: ProtoCar3D) -> ProtoAutopilot:
	var a := ProtoAutopilot.new()
	a.car = car_in
	car_in.use_player_input = false
	car_in.is_active = true
	car_in.add_child(a)
	return a


func target() -> Vector3:
	return target_node.global_position if (target_node != null and is_instance_valid(target_node)) else target_pos


func _physics_process(delta: float) -> void:
	if car == null or car.dead:
		return
	# STUCK RECOVERY: wedged against a wall at full throttle → back out with the
	# wheel mirrored, then resume the hunt. (The gauntlet taught us this one.)
	if _reverse_t > 0.0:
		_reverse_t -= delta
		car.input_throttle = 0.0
		car.input_brake = 1.0 # at a standstill this is REVERSE
		car.input_steer = -_last_steer
		return
	if car.input_throttle > 0.3 and absf(car.forward_speed) < 0.5:
		_stuck_t += delta
		if _stuck_t > 1.0:
			_stuck_t = 0.0
			_reverse_t = 1.3
			# Commit to the freer flank for the NEXT approach — don't re-ram.
			_dodge = 1.6 if not _whisker_hit[0] else (-1.6 if not _whisker_hit[2] else -signf(_last_steer) * 1.6)
	else:
		_stuck_t = 0.0
	_dodge = move_toward(_dodge, 0.0, delta * 0.55)
	var to_t := target() - car.global_position
	to_t.y = 0.0
	var dist := to_t.length()
	if dist < arrive_dist:
		car.input_throttle = 0.0
		car.input_brake = 1.0
		car.input_steer = 0.0
		return
	var fwd := -car.global_basis.z
	fwd.y = 0.0
	var angle := fwd.normalized().signed_angle_to(to_t.normalized(), Vector3.UP)

	# WHISKERS: three rays fan out ahead; a blocked side pushes the wheel away.
	# Length grows with speed — you look further down the road the faster you go.
	var space := car.get_world_3d().direct_space_state
	var reach := 6.0 + absf(car.forward_speed) * 1.1
	var origin := car.global_position + Vector3(0, 0.6, 0)
	var avoid := 0.0
	for i in 3:
		var ang: float = [-0.42, 0.0, 0.42][i]
		var dir := fwd.rotated(Vector3.UP, ang)
		var q := PhysicsRayQueryParameters3D.create(origin, origin + dir * reach)
		q.exclude = [car.get_rid()]
		var hit := space.intersect_ray(q)
		_whisker_hit[i] = not hit.is_empty()
		if not hit.is_empty():
			var w := 1.0 - origin.distance_to(hit["position"]) / reach # closer = stronger
			match i:
				0: avoid -= w * 1.4 # blocked LEFT → steer right
				1:
					# Dead ahead blocked: swerve toward the freer side (side states
					# are one frame stale for index 2 — fine at 60 Hz reflexes) —
					# and REFRESH the commitment so the choice sticks past the wall.
					var side := 1.0 if not _whisker_hit[0] else (-1.0 if not _whisker_hit[2] else (signf(_dodge) if absf(_dodge) > 0.05 else 1.0))
					avoid += side * 1.6 * w
					if absf(_dodge) < 0.05:
						_dodge = side * 1.1
				2: avoid += w * 1.4 # blocked RIGHT → steer left

	# input_steer: +1 = LEFT; positive signed angle = target on the left. Seek +
	# avoid blend, avoidance wins close-in.
	car.input_steer = clampf(angle * 1.5 + avoid + _dodge, -1.0, 1.0)
	_last_steer = car.input_steer
	# Throttle eases through hard turns; a blocked NOSE means lift and thread.
	var straightness := 1.0 - clampf(absf(angle) / PI, 0.0, 1.0)
	car.input_throttle = clampf(0.35 + 0.65 * straightness, 0.0, 1.0) * aggression
	if _whisker_hit[1]:
		car.input_throttle *= 0.45
	car.input_brake = 1.0 if (absf(angle) > 1.9 and absf(car.forward_speed) > 8.0) else 0.0
	car.input_handbrake = false
