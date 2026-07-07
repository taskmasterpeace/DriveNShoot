## THE MOTORIST (goal: NPCs drive the highway, city to city, and LIVE). A person
## on the puppet rig who walks to a rig, gets in, and drives the interstate's own
## polyline to a destination — then parks, gets out, and stands like somebody who
## just finished a drive. The player can ride SHOTGUN (E) and even take the wheel
## (hold E). Ambient traffic = the world driving itself.
class_name ProtoMotorist
extends CharacterBody3D

enum MState { WALK_TO_CAR, DRIVE, WANDER }

var state: MState = MState.WALK_TO_CAR
var car: ProtoCar3D = null
var dest: Vector3 = Vector3.ZERO
var pilot: ProtoAutopilot = null
var puppet: ProtoPuppet = null
var moto_name: String = "Motorist"
var _main: Node = null


static func create(main: Node, car_in: ProtoCar3D, dest_in: Vector3, look: String = "drifter", name_in: String = "Motorist") -> ProtoMotorist:
	var m := ProtoMotorist.new()
	m._main = main
	m.car = car_in
	m.dest = dest_in
	m.moto_name = name_in
	m.add_to_group("npc")
	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.33
	cap.height = 1.7
	shape.shape = cap
	shape.position.y = 0.85
	m.add_child(shape)
	m.puppet = ProtoPuppet.create(ProtoPuppet.look(look))
	m.add_child(m.puppet)
	return m


## ROUTE PLANNING (the highway's own bones): project onto the nearest interstate,
## walk its points toward the end that closes on the destination, then leave the
## road at the point nearest the destination. City-to-city = the road, followed.
static func plan_route(usmap: ProtoUSMap, from: Vector3, dest_in: Vector3) -> Array:
	var out: Array = []
	if usmap == null or not usmap.ok:
		out.append(dest_in)
		return out
	# Prefer a real INTERSTATE (exit ramps are 2-point stubs — a trip needs bones).
	var road: Dictionary = {}
	var best_rd := 4000.0
	var f2 := Vector2(from.x, from.z)
	for r in usmap.roads:
		if String(r.get("kind", "interstate")) != "interstate":
			continue
		var rpts: PackedVector2Array = r["pts"]
		for i in range(rpts.size() - 1):
			var seg_d := ProtoUSMap._seg_dist(f2, rpts[i], rpts[i + 1])
			if seg_d < best_rd:
				best_rd = seg_d
				road = r
	if road.is_empty():
		out.append(dest_in)
		return out
	var pts: PackedVector2Array = road["pts"]
	var start_i := 0
	var best_d := 1e18
	for i in pts.size():
		var d := pts[i].distance_to(Vector2(from.x, from.z))
		if d < best_d:
			best_d = d
			start_i = i
	# Find the EXIT: the road point closest to the destination, searched in BOTH
	# directions (endpoint heuristics lie on kinked interstates — walk the line).
	var d2 := Vector2(dest_in.x, dest_in.z)
	var best_exit_i := start_i
	var best_exit_d := pts[start_i].distance_to(d2)
	for i2 in pts.size():
		if pts[i2].distance_to(d2) < best_exit_d:
			best_exit_d = pts[i2].distance_to(d2)
			best_exit_i = i2
	var step := 1 if best_exit_i > start_i else -1
	var i3 := start_i
	while i3 != best_exit_i:
		var prev := i3
		i3 += step
		# RIGHT-HAND LANE (ROAD_TRAFFIC_OVERHAUL.md §3.5): waypoints offset to the
		# innermost right-hand lane of the travel direction, off the same geometry
		# law the streamer paints — a motorist no longer drives the centerline
		# into oncoming traffic (or into a divided road's median barrier).
		var d := (pts[i3] - pts[prev]).normalized()
		var right := Vector2(-d.y, d.x)
		var off := right * ProtoUSMap.lane_offset(road, 0)
		out.append(Vector3(pts[i3].x + off.x, 0, pts[i3].y + off.y))
	out.append(dest_in)
	return out


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity += get_gravity() * delta
	match state:
		MState.WALK_TO_CAR:
			if car == null or not is_instance_valid(car) or car.dead:
				state = MState.WANDER
				move_and_slide()
				return
			var to_c := car.global_position - global_position
			to_c.y = 0.0
			if to_c.length() > 2.6:
				var dir := to_c.normalized()
				velocity.x = move_toward(velocity.x, dir.x * 3.6, 12.0 * delta)
				velocity.z = move_toward(velocity.z, dir.z * 3.6, 12.0 * delta)
				puppet.rotation.y = lerp_angle(puppet.rotation.y, atan2(-dir.x, -dir.z), 10.0 * delta)
			else:
				_board()
		MState.DRIVE:
			# Riding invisible in the seat; the pilot does the work. Arrive → park.
			if car != null and is_instance_valid(car):
				global_position = car.global_position + Vector3(0, 0.5, 0) # the body rides the seat
			if car == null or not is_instance_valid(car) or car.dead:
				_unboard(global_position)
			elif pilot != null and pilot.route_done() and absf(car.forward_speed) < 1.5:
				var out := car.global_position - car.global_basis.x * 2.3
				_unboard(Vector3(out.x, car.global_position.y + 0.3, out.z))
				if _main and _main.has_method("notify") and global_position.distance_to(_main.player.global_position) < 40.0:
					_main.notify("🚗 %s pulls over and steps out — end of the run" % moto_name)
		MState.WANDER:
			velocity.x = move_toward(velocity.x, 0.0, 10.0 * delta)
			velocity.z = move_toward(velocity.z, 0.0, 10.0 * delta)
	if state != MState.DRIVE and puppet:
		puppet.animate(delta, Vector2(velocity.x, velocity.z).length(), 0.0, false, 0.0, false)
	if state != MState.DRIVE:
		move_and_slide()


func _board() -> void:
	state = MState.DRIVE
	visible = false # in the seat; processing stays ON so the arrival watch runs
	for c in get_children():
		if c is CollisionShape3D:
			(c as CollisionShape3D).disabled = true
	car.ai_driver = self
	pilot = ProtoAutopilot.attach(car)
	pilot.aggression = 0.8 # a motorist, not a pirate
	pilot.arrive_dist = 10.0
	var usmap: ProtoUSMap = _main.stream.usmap if (_main != null and "stream" in _main and _main.stream != null) else null
	pilot.set_route(ProtoMotorist.plan_route(usmap, car.global_position, dest))


func _unboard(pos: Vector3) -> void:
	state = MState.WANDER
	visible = true
	for c in get_children():
		if c is CollisionShape3D:
			(c as CollisionShape3D).disabled = false
	global_position = pos
	velocity = Vector3.ZERO
	if car != null and is_instance_valid(car):
		car.ai_driver = null
		car.is_active = false
		car.input_throttle = 0.0
		car.input_brake = 1.0
	if pilot != null and is_instance_valid(pilot):
		pilot.queue_free()
	pilot = null


## The player takes the wheel (hold E from the passenger seat): the brain lets go.
func yield_wheel() -> void:
	if pilot != null and is_instance_valid(pilot):
		pilot.queue_free()
	pilot = null
	if car != null and is_instance_valid(car):
		car.ai_driver = null
	state = MState.WANDER
	visible = false # rides shotgun silently until the next stop
	set_physics_process(false)
