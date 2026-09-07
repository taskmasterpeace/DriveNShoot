## Focused I-90_X11 regression: a destination agent begins on each real outer
## highway carriageway and reaches the first owned ramp segment only through
## ordinary 0.05s traffic ticks. The streamed world supplies the real pavement,
## shoulder and median colliders; the test stages only initial actor state.
extends Node3D

const STEP_S: float = 0.05
const STEP_BOUND_M: float = 0.62
const START_UPSTREAM_M: float = 40.0
const ACTOR_LENGTH_M: float = 4.4
const SHOULDER_SUPPORT_M: float = 1.0
const EXIT_ID: String = "I-90_X11"
const HIGHWAY_ID: String = "I-90"

var passed: int = 0
var failed: int = 0
var _finished: bool = false
var _stream: ProtoWorldStream
var _previous_map: ProtoUSMap
var _previous_rects: Dictionary


func _check(label: String, condition: bool) -> void:
	passed += int(condition)
	failed += int(not condition)
	print("TRAFFIC HANDOFF: %s - %s" % ["PASS" if condition else "FAIL", label])


func _exit(map: ProtoUSMap) -> Dictionary:
	for row: Dictionary in map.exits:
		if String(row["id"]) == EXIT_ID:
			return row
	return {}


func _port(map: ProtoUSMap, exit_row: Dictionary, ramp_id: String) -> Dictionary:
	for port: Dictionary in map.exit_ports(exit_row, "off"):
		if String(port["road"]["id"]) == ramp_id:
			return port
	return {}


func _station(road: Dictionary, arc: float) -> Dictionary:
	var points: PackedVector2Array = road["pts"]
	var walked := 0.0
	for segment: int in range(points.size() - 1):
		var length := points[segment].distance_to(points[segment + 1])
		if arc <= walked + length:
			return {"segment": segment, "station": clampf(arc - walked, 0.0, length)}
		walked += length
	return {"segment": points.size() - 2, "station": points[-2].distance_to(points[-1])}


func _road_point(road: Dictionary, station: Dictionary) -> Dictionary:
	var points: PackedVector2Array = road["pts"]
	var segment := int(station["segment"])
	var direction := (points[segment + 1] - points[segment]).normalized()
	return {"position": points[segment] + direction * float(station["station"]), "direction": direction}


func _project_arc(road: Dictionary, point: Vector2) -> float:
	var points: PackedVector2Array = road["pts"]
	var walked := 0.0
	var best_distance := INF
	var best_arc := 0.0
	for segment: int in range(points.size() - 1):
		var delta := points[segment + 1] - points[segment]
		var length := delta.length()
		var along := clampf((point - points[segment]).dot(delta) / maxf(length * length, 0.0001), 0.0, 1.0)
		var projected := points[segment] + delta * along
		var distance := point.distance_to(projected)
		if distance < best_distance:
			best_distance = distance
			best_arc = walked + length * along
		walked += length
	return best_arc


func _traffic(map: ProtoUSMap) -> ProtoTraffic:
	var traffic := ProtoTraffic.new()
	traffic.usmap = map
	traffic.rng.seed = 9062026
	traffic._maintain_t = 10000.0
	add_child(traffic)
	# Node entry auto-enables an overridden _physics_process. Disable only after
	# tree entry, matching traffic_sim, so the manual 0.05s tick is the sole clock.
	var enabled_on_entry := traffic.is_physics_processing()
	traffic.set_physics_process(false)
	var disabled_for_manual_clock := not traffic.is_physics_processing()
	print("TRAFFIC HANDOFF CLOCK enabled_on_entry=%s disabled_after_add=%s" % [enabled_on_entry, disabled_for_manual_clock])
	_check("fixture observes auto-enabled physics then owns one manual clock",
		enabled_on_entry and disabled_for_manual_clock)
	return traffic


func _settle_registration() -> void:
	await get_tree().physics_frame
	await get_tree().physics_frame


func _stable_tick(traffic: ProtoTraffic) -> void:
	traffic._tick(STEP_S)
	await get_tree().physics_frame


func _body_registered(traffic: ProtoTraffic, agent: ProtoTraffic.TrafficAgent) -> bool:
	return is_instance_valid(agent) and agent.is_inside_tree() and agent.get_rid().is_valid() and traffic.agents.has(agent)


func _spawn_approach(traffic: ProtoTraffic, map: ProtoUSMap, port: Dictionary, direction: int) -> ProtoTraffic.TrafficAgent:
	var highway: Dictionary = map.road_by_id(HIGHWAY_ID)
	var raw_arc := float(port["highway_arc_m"]) - START_UPSTREAM_M * float(direction)
	var start := _station(highway, raw_arc)
	var outer_lane := int(ProtoUSMap.road_geometry(highway)["per_side"]) - 1
	var agent := traffic.spawn_agent(HIGHWAY_ID, int(start["segment"]), float(start["station"]), outer_lane, direction) as ProtoTraffic.TrafficAgent
	if agent != null:
		traffic.set_agent_speed(agent, 12.0)
		traffic.set_agent_trip(agent, EXIT_ID)
	return agent


func _spawn_at_upstream(traffic: ProtoTraffic, map: ProtoUSMap, port: Dictionary, direction: int, upstream: float) -> ProtoTraffic.TrafficAgent:
	var highway: Dictionary = map.road_by_id(HIGHWAY_ID)
	var raw_arc := float(port["highway_arc_m"]) - upstream * float(direction)
	var start := _station(highway, raw_arc)
	var outer_lane := int(ProtoUSMap.road_geometry(highway)["per_side"]) - 1
	return traffic.spawn_agent(HIGHWAY_ID, int(start["segment"]), float(start["station"]), outer_lane, direction) as ProtoTraffic.TrafficAgent


func _stream_owns(collider: Node) -> bool:
	var current := collider
	while current != null:
		if current == _stream:
			return true
		current = current.get_parent()
	return false


func _road_support_measure(road: Dictionary, point: Vector2) -> Dictionary:
	var points: PackedVector2Array = road["pts"]
	var geometry := ProtoUSMap.road_geometry(road)
	var best_distance := INF
	var best_lateral := 0.0
	for segment: int in range(points.size() - 1):
		var delta := points[segment + 1] - points[segment]
		var length := delta.length()
		if length <= 0.001:
			continue
		var direction := delta / length
		var along := clampf((point - points[segment]).dot(direction), 0.0, length)
		var projected := points[segment] + direction * along
		var offset := point - projected
		if offset.length() < best_distance:
			best_distance = offset.length()
			best_lateral = absf(offset.dot(Vector2(direction.y, -direction.x)))
	var limit := float(geometry["width"]) * 0.5 + SHOULDER_SUPPORT_M
	var inside := best_distance <= limit
	var median_min := 0.0
	if bool(geometry["divided"]):
		median_min = float(geometry["median_w"]) * 0.5 - 0.2
		inside = inside and best_lateral >= median_min
	return {"inside": inside, "distance": best_distance, "lateral": best_lateral,
		"limit": limit, "median_min": median_min, "road": String(road["id"])}


func _footprint_support(agent: ProtoTraffic.TrafficAgent, highway: Dictionary, ramp: Dictionary, first_failure: Dictionary) -> bool:
	var basis := Basis(Vector3.UP, agent.rotation.y)
	var samples: Array[Vector3] = [Vector3.ZERO, Vector3(-0.95, 0, -2.2), Vector3(0.95, 0, -2.2),
		Vector3(0.95, 0, 2.2), Vector3(-0.95, 0, 2.2)]
	for sample_index: int in samples.size():
		var local: Vector3 = samples[sample_index]
		var point := agent.global_position + basis * local
		var point_2d := Vector2(point.x, point.z)
		var highway_measure := _road_support_measure(highway, point_2d)
		var ramp_measure := _road_support_measure(ramp, point_2d)
		var query := PhysicsRayQueryParameters3D.create(point + Vector3.UP, point - Vector3.UP * 2.0, 1)
		query.exclude = [agent.get_rid()]
		var hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(query)
		var collider := hit.get("collider") as Node
		var collider_label := "none" if collider == null else "%s:%s" % [collider.get_class(), collider.get_path()]
		var common := {"sample": sample_index, "position": point, "collider": collider_label,
			"highway": highway_measure, "ramp": ramp_measure}
		if not bool(highway_measure["inside"]) and not bool(ramp_measure["inside"]):
			if first_failure.is_empty():
				first_failure.merge(common)
				first_failure["reason"] = "outside folded pavement plus 1m shoulder"
			return false
		if hit.is_empty():
			if first_failure.is_empty():
				first_failure.merge(common)
				first_failure["reason"] = "no layer-1 floor ray hit"
			return false
		if (hit["normal"] as Vector3).y <= 0.7:
			if first_failure.is_empty():
				first_failure.merge(common)
				first_failure["reason"] = "support normal is not upward"
				first_failure["normal"] = hit["normal"]
			return false
		if collider == null or not _stream_owns(collider):
			if first_failure.is_empty():
				first_failure.merge(common)
				first_failure["reason"] = "layer-1 support is not owned by streamed world"
			return false
		var deck_id := String(collider.get_meta("road_deck", ""))
		if deck_id != "" and deck_id != HIGHWAY_ID and deck_id != String(ramp["id"]):
			if first_failure.is_empty():
				first_failure.merge(common)
				first_failure["reason"] = "tagged deck belongs to another road"
				first_failure["deck"] = deck_id
			return false
	return true


func _leader_clearance(highway: Dictionary, agent: ProtoTraffic.TrafficAgent, leader: ProtoTraffic.TrafficAgent, direction: int) -> float:
	var actor_arc := _project_arc(highway, Vector2(agent.global_position.x, agent.global_position.z))
	var leader_arc := _project_arc(highway, Vector2(leader.global_position.x, leader.global_position.z))
	return (leader_arc - actor_arc) * float(direction) - ACTOR_LENGTH_M


func _median_intact(map: ProtoUSMap, highway: Dictionary, port: Dictionary) -> bool:
	var arc := float(port["highway_arc_m"])
	var station := _station(highway, arc)
	var road_point := _road_point(highway, station)
	var point: Vector2 = road_point["position"]
	var direction: Vector2 = road_point["direction"]
	var perpendicular := Vector2(direction.y, -direction.x)
	var geometry := ProtoUSMap.road_geometry(highway)
	var reach := float(geometry["carriage_w"]) + float(geometry["median_w"])
	var height := ProtoUSMap.elev_at(highway, arc) + 0.4
	var from := Vector3(point.x + perpendicular.x * reach, height, point.y + perpendicular.y * reach)
	var to := Vector3(point.x - perpendicular.x * reach, height, point.y - perpendicular.y * reach)
	for _probe: int in 8:
		var query := PhysicsRayQueryParameters3D.create(from, to, 1)
		var hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(query)
		if hit.is_empty():
			break
		var collider := hit["collider"] as Node
		if collider != null and String(collider.get_meta("road_barrier", "")) == HIGHWAY_ID:
			return true
		from = hit["position"] + (to - from).normalized() * 0.6
	return false


func _assert_outer_carriageway(label: String, map: ProtoUSMap, agent: ProtoTraffic.TrafficAgent, port: Dictionary, direction: int) -> void:
	var highway: Dictionary = map.road_by_id(HIGHWAY_ID)
	var raw_arc := float(port["highway_arc_m"]) - START_UPSTREAM_M * float(direction)
	var center := _road_point(highway, _station(highway, raw_arc))
	var heading: Vector2 = (center["direction"] as Vector2) * float(direction)
	var right := Vector2(-heading.y, heading.x)
	var lateral := (Vector2(agent.global_position.x, agent.global_position.z) - (center["position"] as Vector2)).dot(right)
	var mouth: Vector2 = port["pos"]
	var outer_lane := int(ProtoUSMap.road_geometry(highway)["per_side"]) - 1
	_check("%s begins 40m upstream outside the trigger" % label,
		Vector2(agent.global_position.x, agent.global_position.z).distance_to(mouth) > ProtoTraffic.EXIT_TRIGGER_M)
	var expected_lateral := ProtoUSMap.lane_offset(highway, outer_lane)
	# At |x|≈56km a standard-precision Vector3 stores 3.90625mm-spaced X/Z
	# values. The derived dot product is therefore checked to a local 5mm bound,
	# not a global tolerance and not a motion-budget relaxation.
	_check("%s begins on the correct outer carriageway (actual=%.6f expected=%.6f error=%.6f)" % [label, lateral, expected_lateral, lateral - expected_lateral],
		agent.dir == direction and agent.lane == outer_lane and absf(lateral - expected_lateral) <= 0.005)
	_check("%s retains ordinary body collision layers" % label, agent.collision_layer == 1 and agent.collision_mask == 1)


func _taking_case(map: ProtoUSMap, exit_row: Dictionary, ramp_id: String, direction: int) -> void:
	var port := _port(map, exit_row, ramp_id)
	var ramp: Dictionary = map.road_by_id(ramp_id)
	_check("%s is the actual owned departure for side %d" % [ramp_id, direction],
		not port.is_empty() and int(port.get("side", 0)) == direction
		and String(ramp.get("ramp_role", "")) == "off" and bool(ramp.get("one_way", false)))
	if port.is_empty() or ramp.is_empty():
		return
	var traffic := _traffic(map)
	var agent := _spawn_approach(traffic, map, port, direction)
	_check("%s approach actor spawns" % ramp_id, agent != null)
	if agent == null:
		traffic.free()
		return
	await _settle_registration()
	_check("%s approach is a registered physics body before manual ticks" % ramp_id, _body_registered(traffic, agent))
	_assert_outer_carriageway(ramp_id, map, agent, port, direction)
	var bounded := true
	var highway: Dictionary = map.road_by_id(HIGHWAY_ID)
	var support_failure: Dictionary = {}
	var supported := _footprint_support(agent, highway, ramp, support_failure)
	var total_motion := 0.0
	var max_displacement := 0.0
	var ticks := 0
	var reached_first_segment := false
	var actor_live := true
	while ticks < 600:
		ticks += 1
		var before := agent.global_position
		await _stable_tick(traffic)
		if not is_instance_valid(agent) or not traffic.agents.has(agent):
			actor_live = false
			break
		var displacement := before.distance_to(agent.global_position)
		bounded = bounded and displacement <= STEP_BOUND_M
		max_displacement = maxf(max_displacement, displacement)
		total_motion += displacement
		if supported:
			supported = _footprint_support(agent, highway, ramp, support_failure)
		if agent.road_id == ramp_id and agent.seg_i >= 1:
			reached_first_segment = true
			break
	_check("%s every handoff displacement through ramp segment zero is <=0.62m (max=%.6f)" % [ramp_id, max_displacement], bounded)
	_check("%s makes nontrivial progress through the first emitted ramp segment" % ramp_id,
		actor_live and reached_first_segment and total_motion > 10.0)
	var state_ok := actor_live and agent.dest_exit_id == EXIT_ID and agent.road_id == ramp_id \
		and agent.dir == 1 and agent.lane == 0 and agent._exit_rolled == EXIT_ID
	_check("%s keeps destination, correct ramp direction, and one-roll state" % ramp_id, state_ok)
	_check("%s keeps all five footprint samples on streamed pavement/shoulder support" % ramp_id, actor_live and supported)
	if not supported:
		print("TRAFFIC HANDOFF SUPPORT ramp=%s first_failure=%s" % [ramp_id, var_to_str(support_failure)])
	if actor_live:
		print("TRAFFIC HANDOFF TAKE ramp=%s ticks=%d motion=%.3f road=%s seg=%d s=%.3f" % [ramp_id, ticks, total_motion, agent.road_id, agent.seg_i, agent.s_ab])
	else:
		print("TRAFFIC HANDOFF TAKE ramp=%s ticks=%d motion=%.3f actor=missing" % [ramp_id, ticks, total_motion])
	traffic.free()


func _through_case(map: ProtoUSMap, exit_row: Dictionary, ramp_id: String, direction: int) -> void:
	var port := _port(map, exit_row, ramp_id)
	if port.is_empty():
		return
	var traffic := _traffic(map)
	var agent := _spawn_approach(traffic, map, port, direction)
	if agent == null:
		_check("%s through-highway actor spawns" % ramp_id, false)
		traffic.free()
		return
	agent.dest_exit_id = "I-90_X10"
	await _settle_registration()
	_check("%s through control is a registered physics body" % ramp_id, _body_registered(traffic, agent))
	var target_arc := float(port["highway_arc_m"]) + START_UPSTREAM_M * float(direction)
	var planar_bounded := true
	var highway: Dictionary = map.road_by_id(HIGHWAY_ID)
	var ramp: Dictionary = map.road_by_id(ramp_id)
	var support_failure: Dictionary = {}
	var supported := _footprint_support(agent, highway, ramp, support_failure)
	var reached_target := false
	var actor_live := true
	var total_motion := 0.0
	var max_displacement := 0.0
	var max_xz_displacement := 0.0
	var max_before := Vector3.ZERO
	var max_after := Vector3.ZERO
	for _tick_index: int in 300:
		var before := agent.global_position
		await _stable_tick(traffic)
		if not is_instance_valid(agent) or not traffic.agents.has(agent):
			actor_live = false
			break
		var after := agent.global_position
		var displacement := before.distance_to(after)
		var horizontal := Vector2(after.x - before.x, after.z - before.z).length()
		planar_bounded = planar_bounded and horizontal <= STEP_BOUND_M
		max_xz_displacement = maxf(max_xz_displacement, horizontal)
		if displacement > max_displacement:
			max_displacement = displacement
			max_before = before
			max_after = after
		total_motion += displacement
		if supported:
			supported = _footprint_support(agent, highway, ramp, support_failure)
		var raw_arc := _project_arc(highway, Vector2(agent.global_position.x, agent.global_position.z))
		if (raw_arc - target_arc) * float(direction) >= 0.0:
			reached_target = true
			break
	_check("%s through-highway control does not take the owned ramp" % ramp_id,
		actor_live and agent.road_id == HIGHWAY_ID and agent._exit_rolled == EXIT_ID and agent.dest_exit_id == "I-90_X10")
	_check("%s through-highway control reaches 40m downstream with nontrivial progress" % ramp_id,
		actor_live and reached_target and total_motion > 70.0)
	_check("%s through-highway control keeps every planar displacement <=0.62m (max_xz=%.6f)" % [ramp_id, max_xz_displacement],
		actor_live and planar_bounded)
	print("TRAFFIC HANDOFF THROUGH MOTION ramp=%s max3d=%.6f max_xz=%.6f before=%s after=%s delta=%s" % [ramp_id,
		max_displacement, max_xz_displacement, max_before, max_after, max_after - max_before])
	_check("%s through-highway control keeps five-point streamed support" % ramp_id,
		actor_live and supported)
	if not supported:
		print("TRAFFIC HANDOFF THROUGH SUPPORT ramp=%s first_failure=%s" % [ramp_id, var_to_str(support_failure)])
	traffic.free()


func _blocked_case(map: ProtoUSMap, exit_row: Dictionary, ramp_id: String, direction: int) -> void:
	var port := _port(map, exit_row, ramp_id)
	if port.is_empty():
		return
	var highway: Dictionary = map.road_by_id(HIGHWAY_ID)
	var traffic := _traffic(map)
	var agent := _spawn_approach(traffic, map, port, direction)
	var leader_arc := float(port["highway_arc_m"]) - 25.0 * float(direction)
	var leader_station := _station(highway, leader_arc)
	var outer_lane := int(ProtoUSMap.road_geometry(highway)["per_side"]) - 1
	var leader := traffic.spawn_agent(HIGHWAY_ID, int(leader_station["segment"]), float(leader_station["station"]), outer_lane, direction) as ProtoTraffic.TrafficAgent
	if agent == null or leader == null:
		_check("%s blocked-leader actors spawn" % ramp_id, false)
		traffic.free()
		return
	traffic.set_agent_speed(leader, 0.0)
	traffic.set_agent_trip(leader, "I-90_X10")
	await _settle_registration()
	_check("%s blocked actor and leader are registered physics bodies" % ramp_id,
		_body_registered(traffic, agent) and _body_registered(traffic, leader))
	var bounded := true
	var support_failure: Dictionary = {}
	var supported := _footprint_support(agent, highway, map.road_by_id(ramp_id), support_failure)
	var actor_live := true
	var leader_present := true
	var never_passed := true
	var min_clearance := INF
	var stopped_during_take := false
	var held_after_stop := true
	var stopped_at := Vector3.ZERO
	for _tick_index: int in 240:
		var before := agent.global_position
		await _stable_tick(traffic)
		if not is_instance_valid(agent) or not traffic.agents.has(agent):
			actor_live = false
			break
		if not is_instance_valid(leader) or not traffic.agents.has(leader):
			leader_present = false
			break
		var displacement := before.distance_to(agent.global_position)
		bounded = bounded and displacement <= STEP_BOUND_M
		if supported:
			supported = _footprint_support(agent, highway, map.road_by_id(ramp_id), support_failure)
		var clearance := _leader_clearance(highway, agent, leader, direction)
		min_clearance = minf(min_clearance, clearance)
		never_passed = never_passed and clearance >= -0.02
		if agent._exit_rolled == EXIT_ID and agent.speed <= 0.001:
			if not stopped_during_take:
				stopped_during_take = true
				stopped_at = agent.global_position
			else:
				held_after_stop = held_after_stop and agent.global_position.distance_to(stopped_at) <= 0.0001
	_check("%s actual stopped leader remains registered throughout the handoff" % ramp_id,
		actor_live and leader_present)
	_check("%s actor never passes or escapes its leader (minimum longitudinal clearance %.3fm)" % [ramp_id, min_clearance],
		actor_live and leader_present and never_passed)
	_check("%s leader holds the taking actor at zero without later movement" % ramp_id,
		actor_live and stopped_during_take and held_after_stop and agent.speed <= 0.001
		and agent._exit_rolled == EXIT_ID and agent.dest_exit_id == EXIT_ID)
	_check("%s blocked handoff never exceeds the same 0.62m tick budget" % ramp_id, actor_live and bounded)
	_check("%s blocked handoff retains five-point streamed road support" % ramp_id, actor_live and supported)
	traffic.free()


## Explicit fixture exception: a zero-speed actor starts 30m upstream, inside
## the 34m trigger, because an actor at zero cannot naturally enter the trigger.
## Both it and its stopped leader are real registered TrafficAgent bodies.
func _zero_speed_take_case(map: ProtoUSMap, exit_row: Dictionary, ramp_id: String, direction: int) -> void:
	var port := _port(map, exit_row, ramp_id)
	if port.is_empty():
		return
	var traffic := _traffic(map)
	var agent := _spawn_at_upstream(traffic, map, port, direction, 30.0)
	var leader := _spawn_at_upstream(traffic, map, port, direction, 25.0)
	if agent == null or leader == null:
		_check("%s zero-speed fixture actors spawn" % ramp_id, false)
		traffic.free()
		return
	traffic.set_agent_speed(agent, 0.0)
	agent.cruise = 12.0
	traffic.set_agent_trip(agent, EXIT_ID)
	traffic.set_agent_speed(leader, 0.0)
	traffic.set_agent_trip(leader, "I-90_X10")
	await _settle_registration()
	_check("%s zero-speed actor and leader are registered physics bodies" % ramp_id,
		_body_registered(traffic, agent) and _body_registered(traffic, leader))
	var initial := agent.global_position
	await _stable_tick(traffic)
	if not is_instance_valid(agent) or not traffic.agents.has(agent) or not is_instance_valid(leader) or not traffic.agents.has(leader):
		_check("%s zero-speed actors remain registered on the take tick" % ramp_id, false)
		traffic.free()
		return
	var take_clearance := _leader_clearance(map.road_by_id(HIGHWAY_ID), agent, leader, direction)
	var take_tick_still := agent.global_position.distance_to(initial) <= 0.0001 and agent.speed <= 0.001 \
		and take_clearance >= -0.02
	var took_once := agent._exit_rolled == EXIT_ID and agent.dest_exit_id == EXIT_ID
	var held := true
	for _tick_index: int in 40:
		var before := agent.global_position
		await _stable_tick(traffic)
		if not is_instance_valid(agent) or not traffic.agents.has(agent) or not is_instance_valid(leader) or not traffic.agents.has(leader):
			held = false
			break
		held = held and agent.speed <= 0.001 \
			and agent.global_position.distance_to(before) <= 0.0001 \
			and agent.global_position.distance_to(initial) <= 0.0001 \
			and _leader_clearance(map.road_by_id(HIGHWAY_ID), agent, leader, direction) >= -0.02
	_check("%s zero-speed fixture starts inside the actual trigger with a real leader" % ramp_id,
		Vector2(initial.x, initial.z).distance_to(port["pos"] as Vector2) < ProtoTraffic.EXIT_TRIGGER_M
		and traffic.agents.has(leader))
	_check("%s zero-speed take preserves position, leader clearance, destination and one-roll behavior" % ramp_id,
		take_tick_still and took_once)
	_check("%s pending handoff cannot accelerate through its still-present leader" % ramp_id, held)
	traffic.free()


func _run() -> void:
	var map := ProtoUSMap.get_default()
	_check("real US map loads", map != null and map.ok)
	if map == null or not map.ok:
		_finish()
		return
	var exit_row := _exit(map)
	_check("actual Seattle diamond exit loads", not exit_row.is_empty())
	if exit_row.is_empty():
		_finish()
		return
	ProtoWorldBuilder.usmap = map
	_stream = ProtoWorldStream.new()
	_stream.usmap = map
	add_child(_stream)
	var anchor: Vector2 = exit_row["pos"]
	_stream.update_stream(Vector3(anchor.x, 0.0, anchor.y), self)
	for _frame: int in 6:
		await get_tree().physics_frame
	_check("actual Seattle entry corridor streams with body layers", not _stream.loaded.is_empty())
	var highway: Dictionary = map.road_by_id(HIGHWAY_ID)
	for row: Array in [["I-90_X11-off-r", 1], ["I-90_X11-off", -1]]:
		var port := _port(map, exit_row, String(row[0]))
		_check("%s keeps the physical highway median intact" % String(row[0]),
			not port.is_empty() and _median_intact(map, highway, port))
		await _taking_case(map, exit_row, String(row[0]), int(row[1]))
		await _through_case(map, exit_row, String(row[0]), int(row[1]))
		await _blocked_case(map, exit_row, String(row[0]), int(row[1]))
		await _zero_speed_take_case(map, exit_row, String(row[0]), int(row[1]))
	_finish()


func _ready() -> void:
	var owned := ProjectSettings.globalize_path("res://../build/").replace("\\", "/").simplify_path().to_lower().trim_suffix("/") + "/"
	var profile := OS.get_user_data_dir().replace("\\", "/").simplify_path().to_lower()
	if not profile.begins_with(owned):
		print("TRAFFIC HANDOFF: REFUSED non-build save profile")
		get_tree().quit(2)
		return
	_previous_map = ProtoWorldBuilder.usmap
	_previous_rects = ProtoWorldBuilder.extra_road_rects.duplicate(true)
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		_check("focused handoff gate finishes before watchdog", false)
		_finish())
	_run.call_deferred()


func _finish() -> void:
	if _finished:
		return
	_finished = true
	if is_instance_valid(_stream):
		_stream.free()
	ProtoWorldBuilder.usmap = _previous_map
	ProtoWorldBuilder.extra_road_rects = _previous_rects
	print("TRAFFIC HANDOFF RESULTS: %d passed, %d failed" % [passed, failed])
	print("TRAFFIC HANDOFF: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
