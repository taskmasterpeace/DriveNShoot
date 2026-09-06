extends "res://proto3d/tests/road_surface_sim.gd"
## One independent, fresh-engine route selected by --route=<exact owned ramp>.
## Initial location, car heading and 11:00 clock are staged. Thereafter ONLY
## bound pad events steer/throttle/brake; no transform/velocity/input-field writes.

var route_id := "I-90_X11-off"
var route: Array[Vector3] = []
var landmarks: Dictionary = {}
var driven_car: ProtoCar3D
var route_index := 1
var driving := false
var elapsed := 0.0
var event_count := 0
var max_deviation := 0.0
var finite := true
var capture_pending := false
var next_trace := 5.0
var start_position := Vector3.ZERO
var progress_position := Vector3.ZERO
var last_progress_time := 0.0


func run_checks(_slabs: Array[MeshInstance3D], _at: Vector3) -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--route="):
			route_id = argument.trim_prefix("--route=")
	if route_id not in ["I-90_X11-off", "I-90_X11-off-r", "I-90_X11-on", "I-90_X11-on-r"]:
		check("exact owned route selector", false)
		return
	var canonical: Dictionary = {}
	for road: Dictionary in main.stream.usmap.roads:
		if String(road.get("interchange_id", "")) == "I-90_X11":
			canonical[String(road["id"])] = [(road["pts"] as PackedVector2Array).duplicate(), (road["elev"] as PackedFloat32Array).duplicate()]
	_build_route()
	var unchanged := true
	for id: String in canonical:
		var road: Dictionary = main.stream.usmap.road_by_id(id)
		var retained: bool = road["pts"] == canonical[id][0] and road["elev"] == canonical[id][1]
		unchanged = unchanged and retained
		if not retained:
			print("DRIVE CANONICAL MUTATION road=%s original_first=%s current_first=%s" % [id, canonical[id][0][0], road["pts"][0]])
	check("building a reversed drive route preserves canonical points and heights", unchanged)
	if not unchanged:
		return # Never continue a route on a map invalidated by its own harness.
	check("route includes required ramp and complete town feeder", route.size() > 100 and landmarks.size() >= 3)
	if route.size() < 2:
		return
	driven_car = ProtoCar3D.create("scavenger", Color(0.55, 0.42, 0.30))
	driven_car.freeze = true
	main.add_child(driven_car)
	main.cars.append(driven_car)
	# Only staging writes. Settling and real E entry happen BEFORE the start.
	driven_car.global_position = route[0] + Vector3.UP * 0.8
	var direction := route[1] - route[0]
	driven_car.rotation.y = atan2(-direction.x, -direction.z)
	main.player.global_position = route[0] + driven_car.global_basis.x * 2.0 + Vector3.UP
	main.player.velocity = Vector3.ZERO
	for i: int in 70:
		main.stream.update_stream(route[0], main)
		await frames(1)
	driven_car.freeze = false
	await frames(20)
	await key(KEY_E, true)
	await key(KEY_E, false)
	check("real E enters staged car", main.active_car == driven_car and main.mode == main.Mode.DRIVE)
	check("production player-input path enabled", driven_car.use_player_input)
	if main.active_car != driven_car:
		return
	main.cam_rig.snap_to_target()
	await capture("drive_00_" + route_id + "_approach")
	print("DRIVE START route=%s pos=%s points=%d; staging ended, pad events only" % [route_id, driven_car.global_position, route.size()])
	print("DRIVE BINDINGS move_up=%s move_left=%s" % [InputMap.action_get_events("move_up"), InputMap.action_get_events("move_left")])
	start_position = driven_car.global_position
	progress_position = start_position
	driving = true
	while driving:
		await get_tree().physics_frame
	_pad(JOY_AXIS_LEFT_X, 0.0)
	_pad(JOY_AXIS_TRIGGER_RIGHT, 0.0)
	_pad(JOY_AXIS_TRIGGER_LEFT, 1.0)
	var end_distance := Vector2(driven_car.global_position.x - route[-1].x, driven_car.global_position.z - route[-1].z).length()
	check("all ordered route landmarks and final position reached", route_index >= route.size() - 1 and end_distance <= 5.0)
	check("finite real vehicle physics throughout", finite)
	check("positive driver and chassis hp retained", main.character.hp > 0 and driven_car.components["chassis"].hp > 0 and not driven_car.dead)
	check("bound input events were dispatched throughout attempt", event_count > 100 and elapsed > 5.0)
	check("car remained within route travel corridor", max_deviation < 8.0)
	var final_dir := (route[-1] - route[-2]).normalized()
	check("completion in intended driving direction", (-driven_car.global_basis.z).dot(final_dir) > 0.6)
	print("DRIVE END route=%s index=%d/%d elapsed=%.2f deviation=%.2f hp=%.1f chassis=%.1f events=%d pos=%s" % [route_id, route_index, route.size(), elapsed, max_deviation, main.character.hp, driven_car.components["chassis"].hp, event_count, driven_car.global_position])
	var reached := route_index >= route.size() - 1 and end_distance <= 5.0
	await capture("drive_99_" + route_id + ("_completion" if reached else "_failed_attempt"))
	_pad(JOY_AXIS_TRIGGER_LEFT, 0.0)


func capture(id: String) -> void:
	await super.capture(id)
	if not captures.is_empty():
		captures[-1]["note"] = "Unedited game camera. 11:00 and pre-route car/player staging disclosed; all movement after DRIVE START is real bound pad input. No transform/velocity steering."
		captures[-1]["route"] = route_id
		captures[-1]["route_index"] = route_index
		captures[-1]["elapsed_s"] = elapsed


func _append_road(road: Dictionary, reverse: bool, label: String) -> void:
	var points: PackedVector2Array = (road["pts"] as PackedVector2Array).duplicate()
	if reverse:
		points.reverse()
	var lane_offset := 0.0 if bool(road.get("one_way", false)) else 1.8
	for i: int in points.size():
		var dir: Vector2 = (points[mini(i + 1, points.size() - 1)] - points[maxi(i - 1, 0)]).normalized()
		var point := points[i] + Vector2(-dir.y, dir.x) * lane_offset
		var position := Vector3(point.x, _height_at(road, points[i]) + 0.09, point.y)
		if route.is_empty() or route[-1].distance_to(position) > 1.0:
			route.append(position)
		if String(road["id"]) == "I-90_X11-crossroad" and i == points.size() / 2:
			landmarks[route.size() - 1] = "bridge_crossing"
	landmarks[route.size() - 1] = label


func _build_route() -> void:
	var map: ProtoUSMap = main.stream.usmap
	var ramp: Dictionary = map.road_by_id(route_id)
	var off := String(ramp["ramp_role"]) == "off"
	var points: PackedVector2Array = ramp["pts"]
	var feeder: Dictionary = map.road_by_id("I-90_X11-town-link")
	var cross: Dictionary = map.road_by_id("I-90_X11-crossroad")
	var town_junction: Vector2 = (feeder["pts"] as PackedVector2Array)[0]
	var local: Vector2 = points[-1] if off else points[0]
	var mouth: Vector2 = points[0] if off else points[-1]
	var highway: Dictionary = map.road_by_id("I-90")
	var projected: Dictionary = ProtoUSMap._project_road(highway, mouth)
	var travel: Vector2 = (projected["dir"] as Vector2) * int(ramp["side"])
	var right := Vector2(-travel.y, travel.x)
	var geometry := ProtoUSMap.road_geometry(highway)
	var outer_lane := ProtoUSMap.lane_offset(highway, int(geometry["per_side"]) - 1)
	var highway_port: Vector2 = projected["pos"]
	if off:
		for distance: float in [60.0, 40.0, 20.0]:
			# Legal outer travel lane -> speed-change lane -> ramp terminal.
			# Extrapolating the ramp shoulder upstream staged the car on a rail.
			var lateral := lerpf(outer_lane, float(geometry["width"]) * 0.5 - 1.5, 1.0 - distance / 60.0)
			var point := highway_port - travel * distance + right * lateral
			route.append(Vector3(point.x, _height_at(highway, point) + 0.09, point.y))
		landmarks[route.size() - 1] = "mouth"
		_append_road(ramp, false, "off_ramp")
		if local.distance_to(town_junction) > 20.0:
			_append_road(cross, (cross["pts"] as PackedVector2Array)[0].distance_to(local) > 20.0, "crossing")
		_append_road(feeder, false, "town_feeder")
	else:
		_append_road(feeder, true, "town_feeder")
		if local.distance_to(town_junction) > 20.0:
			_append_road(cross, (cross["pts"] as PackedVector2Array)[0].distance_to(town_junction) > 20.0, "crossing")
		_append_road(ramp, false, "on_ramp")
		for distance: float in [20.0, 40.0, 60.0, 80.0]:
			var point := highway_port + travel * distance + right * outer_lane
			route.append(Vector3(point.x, _height_at(highway, point) + 0.09, point.y))
		landmarks[route.size() - 1] = "highway_direction"


func _pad(axis: JoyAxis, value: float) -> void:
	var event := InputEventJoypadMotion.new()
	event.device = 0
	event.axis = axis
	event.axis_value = value
	Input.parse_input_event(event)
	event_count += 1


func _physics_process(delta: float) -> void:
	if not driving or not is_instance_valid(driven_car):
		return
	elapsed += delta
	var pos := driven_car.global_position
	if pos.distance_to(progress_position) >= 2.0:
		progress_position = pos
		last_progress_time = elapsed
	if elapsed - last_progress_time > 12.0:
		check("ongoing drive makes at least 2m progress every 12 seconds", false)
		driving = false
		return
	if elapsed >= next_trace:
		print("DRIVE PROGRESS %s time=%.1f point=%d/%d speed=%.2f pos=%s hp=%.1f" % [route_id, elapsed, route_index, route.size(), driven_car.linear_velocity.length(), pos, driven_car.components["chassis"].hp])
		print("DRIVE INPUT axis=%.2f gas_action=%.2f brake_action=%.2f gas_car=%.2f brake_car=%.2f blocked=%s active=%s frozen=%s ignition=%s engine=%s force=%.1f fuel=%.1f" % [Input.get_joy_axis(0, JOY_AXIS_TRIGGER_RIGHT), Input.get_action_strength("move_up"), Input.get_action_strength("move_down"), driven_car.input_throttle, driven_car.input_brake, driven_car.player_input_blocked, driven_car.is_active, driven_car.freeze, driven_car.ignition, driven_car.engine_on, driven_car.engine_force, driven_car.fuel])
		_contact_diagnostic()
		next_trace += 5.0
	if elapsed > 12.0 and pos.distance_to(start_position) < 1.0:
		check("actual bound input begins moving within 12 seconds", false)
		driving = false
		return
	finite = finite and pos.is_finite() and driven_car.linear_velocity.is_finite()
	if not finite or driven_car.dead or elapsed > 110.0:
		driving = false
		return
	var flat := Vector2(pos.x, pos.z)
	while route_index < route.size() - 1 and flat.distance_to(Vector2(route[route_index].x, route[route_index].z)) < 6.0:
		var incoming := Vector2(route[route_index].x - route[route_index - 1].x, route[route_index].z - route[route_index - 1].z).normalized()
		var outgoing := Vector2(route[route_index + 1].x - route[route_index].x, route[route_index + 1].z - route[route_index].z).normalized()
		var corner_angle := acos(clampf(incoming.dot(outgoing), -1.0, 1.0))
		if corner_angle > PI * 0.25:
			var entry_speed := driven_car.linear_velocity.length()
			print("DRIVE CORNER vertex=%d deflection=%.2fdeg real_entry_speed=%.3fm/s pos=%s" % [route_index, rad_to_deg(corner_angle), entry_speed, pos])
			check("real sharp-junction entry speed is at most 7m/s", entry_speed <= 7.0)
		if landmarks.has(route_index):
			print("DRIVE LANDMARK %s %s elapsed=%.2f pos=%s" % [route_id, landmarks[route_index], elapsed, pos])
			if String(landmarks[route_index]) == "crossing":
				for agent: Node in main.traffic.agents:
					if is_instance_valid(agent) and agent is ProtoTraffic.TrafficAgent and agent.global_position.distance_to(pos) <= 25.0:
						_traffic_diagnostic(agent, "crossing-nearby")
			if String(landmarks[route_index]) == "bridge_crossing":
				var deck_height := _height_at(main.stream.usmap.road_by_id("I-90_X11-crossroad"), flat) + 0.09
				var deck_contacts := 0
				for child: Node in driven_car.get_children():
					if child is VehicleWheel3D and child.is_in_contact():
						var support: Node3D = child.get_contact_body()
						if support != null and String(support.get_meta("road_deck", "")) == "I-90_X11-crossroad":
							deck_contacts += 1
				print("DRIVE DECK chassis_y=%.3f deck_y=%.3f real_deck_wheels=%d" % [pos.y, deck_height, deck_contacts])
				check("bridge landmark is traversed ON real collision deck", pos.y >= deck_height + 0.1 and pos.y <= deck_height + 2.5 and deck_contacts >= 1)
			if not capture_pending and not output.is_empty():
				capture_pending = true
				_capture_landmark(String(landmarks[route_index]))
		route_index += 1
	var a := Vector2(route[route_index - 1].x, route[route_index - 1].z)
	var b := Vector2(route[route_index].x, route[route_index].z)
	max_deviation = maxf(max_deviation, ProtoUSMap._seg_dist(flat, a, b))
	var toward := (route[route_index] - pos)
	toward.y = 0.0
	var forward := -driven_car.global_basis.z
	forward.y = 0.0
	var angle := forward.normalized().signed_angle_to(toward.normalized(), Vector3.UP)
	var speed := driven_car.linear_velocity.length()
	var target_speed := 15.0 if absf(angle) < 0.16 else 7.0
	target_speed = minf(target_speed, _corner_speed_limit(flat))
	var steer := clampf(angle * 2.0, -1.0, 1.0)
	_pad(JOY_AXIS_LEFT_X, -steer)
	_pad(JOY_AXIS_TRIGGER_RIGHT, clampf((target_speed - speed) * 0.3, 0.0, 1.0))
	_pad(JOY_AXIS_TRIGGER_LEFT, clampf((speed - target_speed - 0.5) * 0.25, 0.0, 1.0))
	if route_index == route.size() - 1 and flat.distance_to(Vector2(route[-1].x, route[-1].z)) < 5.0:
		driving = false


## Brake through real bound trigger events before reaching a sharp route vertex.
## The reach buffer matches waypoint advancement; steering and the route stay unchanged.
func _corner_speed_limit(flat: Vector2) -> float:
	var limit := 15.0
	var distance := flat.distance_to(Vector2(route[route_index].x, route[route_index].z))
	for index: int in range(route_index, route.size() - 1):
		if distance > 40.0:
			break
		var before := Vector2(route[index - 1].x, route[index - 1].z)
		var vertex := Vector2(route[index].x, route[index].z)
		var after := Vector2(route[index + 1].x, route[index + 1].z)
		var incoming := (vertex - before).normalized()
		var outgoing := (after - vertex).normalized()
		if acos(clampf(incoming.dot(outgoing), -1.0, 1.0)) > PI * 0.25:
			limit = minf(limit, sqrt(25.0 + 4.0 * maxf(distance - 6.0, 0.0)))
		distance += vertex.distance_to(after)
	return limit


func _contact_diagnostic() -> void:
	for node: Node in driven_car.get_children():
		if node is VehicleWheel3D:
			print("DRIVE WHEEL %s contact=%s pos=%s body=%s" % [node.name, node.is_in_contact(), node.global_position, node.get_contact_body()])
		if node is CollisionShape3D:
			var query := PhysicsShapeQueryParameters3D.new()
			query.shape = node.shape
			query.transform = node.global_transform
			query.collision_mask = driven_car.collision_mask
			query.exclude = [driven_car.get_rid()]
			var hits: Array[Dictionary] = main.get_world_3d().direct_space_state.intersect_shape(query, 16)
			for hit: Dictionary in hits:
				var body: Node = hit["collider"]
				print("DRIVE BODY OVERLAP %s pos=%s meta=%s" % [body.get_path(), body.global_position, body.get_meta_list()])
				if body is ProtoTraffic.TrafficAgent:
					_traffic_diagnostic(body, "body-overlap")


func _traffic_diagnostic(agent: ProtoTraffic.TrafficAgent, phase: String) -> void:
	var traffic_owner := agent.traffic
	var registered := traffic_owner != null and traffic_owner.agents.has(agent)
	var leader: Node3D = traffic_owner._car_ahead(agent) if registered else null
	print("DRIVE TRAFFIC phase=%s body=%s pos=%s registered=%s road=%s seg=%d s_ab=%.3f dir=%d lane=%d speed=%.3f cruise=%.3f arrived=%s promoted=%d leader=%s" % [phase, agent.get_path(), agent.global_position, registered, agent.road_id, agent.seg_i, agent.s_ab, agent.dir, agent.lane, agent.speed, agent.cruise, agent.arrived, traffic_owner._promoted.size() if traffic_owner != null else -1, leader.get_path() if leader != null else "none"])


func _capture_landmark(label: String) -> void:
	await capture("drive_" + route_id + "_" + label)
	capture_pending = false
