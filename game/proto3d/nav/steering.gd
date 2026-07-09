## THE STEERING LAYER (NAVIGATION.md §2/§9.5 — extracted, not invented): the
## dog's proven walker laws ported to ALL walkers. Stateless statics; callers
## own the little state dicts. Donors cited per function — reuse, never a base
## class (the lurker lesson, LWE:197).
class_name ProtoSteering
extends RefCounted


## The dog accel law verbatim (dog.gd:586-589): ground-plane move_toward at
## 22 m/s², yaw lerp at 10/s. Returns the yaw so callers can face their visual.
static func walk_step(body: CharacterBody3D, target: Vector3, speed: float, delta: float) -> float:
	var dir := (target - body.global_position)
	dir.y = 0.0
	if dir.length() < 0.001:
		return body.rotation.y
	dir = dir.normalized()
	body.velocity.x = move_toward(body.velocity.x, dir.x * speed, 22.0 * delta)
	body.velocity.z = move_toward(body.velocity.z, dir.z * speed, 22.0 * delta)
	return atan2(-dir.x, -dir.z)


## THE STUCK-SIDESTEP (dog.gd:569-575 verbatim): pinned against a post/wall
## while trying to move → lateral impulse + re-roll. st = {"t": float}.
## Returns true the frame it fires (feeds the §5 failure ladder).
static func stuck_tick(st: Dictionary, body: CharacterBody3D, target: Vector3, speed: float, delta: float) -> bool:
	var dist := body.global_position.distance_to(target)
	if body.velocity.length() < 0.6 and dist > 2.0:
		st["t"] = float(st.get("t", 0.0)) + delta
		if float(st["t"]) > 0.35:
			st["t"] = 0.0
			var dir := (target - body.global_position).normalized()
			var side := Vector3(-dir.z, 0, dir.x) * (1.0 if randf() > 0.5 else -1.0)
			body.velocity += side * speed * 0.8
			return true
	else:
		st["t"] = 0.0
	return false


## THE STEP-UP (the dog's _leap_blocked idea, humans get a step not a leap —
## dog.gd:578-585): knee ray blocked + head ray clear = a low thing you can
## climb. Returns "step_up" | "blocked" | "clear".
static func clear_low_obstacle(body: CharacterBody3D, dir: Vector3) -> String:
	var space := body.get_world_3d().direct_space_state
	var from_knee := body.global_position + Vector3(0, 0.35, 0)
	var from_head := body.global_position + Vector3(0, 1.5, 0)
	var knee := space.intersect_ray(PhysicsRayQueryParameters3D.create(from_knee, from_knee + dir * 1.1, 0xFFFFFFFF, [body.get_rid()]))
	if knee.is_empty():
		return "clear"
	var head := space.intersect_ray(PhysicsRayQueryParameters3D.create(from_head, from_head + dir * 1.3, 0xFFFFFFFF, [body.get_rid()]))
	return "step_up" if head.is_empty() else "blocked"


## Whisker-lite (the autopilot idea at walking scale, track/autopilot.gd:105-141
## is the donor): two knee rays ±0.5 rad × 2.2 m → a steer blend away from the
## nearer wall. Returns a corrected direction.
static func whiskers(body: CharacterBody3D, dir: Vector3, bias: float = 1.0) -> Vector3:
	var space := body.get_world_3d().direct_space_state
	var from := body.global_position + Vector3(0, 0.35, 0)
	var l_dir := dir.rotated(Vector3.UP, 0.5)
	var r_dir := dir.rotated(Vector3.UP, -0.5)
	var l := space.intersect_ray(PhysicsRayQueryParameters3D.create(from, from + l_dir * 2.2, 0xFFFFFFFF, [body.get_rid()]))
	var r := space.intersect_ray(PhysicsRayQueryParameters3D.create(from, from + r_dir * 2.2, 0xFFFFFFFF, [body.get_rid()]))
	if not l.is_empty() and r.is_empty():
		return dir.rotated(Vector3.UP, -0.45)
	if not r.is_empty() and l.is_empty():
		return dir.rotated(Vector3.UP, 0.45)
	if not l.is_empty() and not r.is_empty():
		# flat against a wall: turn HARD along it (bias picks the consistent
		# side so the walker slides around, never grinds straight in)
		return dir.rotated(Vector3.UP, 0.95 * bias)
	return dir
