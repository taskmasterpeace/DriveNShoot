## Real JSON fold -> ports -> traffic and directed graph. No production mocks.
extends Node3D

var passed: int = 0
var failed: int = 0

## Test-only instrumentation delegates to the real resolver. A warm port query
## must avoid repeating the map scans, not merely return equivalent data.
class CountingMap extends ProtoUSMap:
	var lookups: int = 0

	func road_by_id(rid: String) -> Dictionary:
		lookups += 1
		return super.road_by_id(rid)

func _check(label: String, condition: bool) -> void:
	passed += int(condition)
	failed += int(not condition)
	print("PORTS: %s - %s" % ["PASS" if condition else "FAIL", label])

func _road(id: String, pts: Array, role: String = "", side: int = 0) -> Dictionary:
	var row: Dictionary = {"id": id, "kind": "exit", "pts": pts, "lanes": 2, "divided": false}
	if role != "":
		row.merge({"ramp_role": role, "side": side, "one_way": true, "interchange_id": "X"})
	return row

func _junction(id: String, pos: Array, legs: Array, grade: String = "flat", control: String = "none") -> Dictionary:
	return {"id": id, "pos": pos, "legs": legs, "grade": grade, "control": control}

func _fixture() -> Dictionary:
	var ramp_len: float = Vector2(300, 152).length()
	return {"w": 1, "h": 1, "grid": ["."], "roads": [
		{"id": "H", "kind": "interstate", "pts": [[0, 0], [1000, 0]], "lanes": 4, "divided": true},
		_road("off+", [[200, 8], [500, 160]], "off", 1),
		_road("off-", [[800, -8], [500, -160]], "off", -1),
		_road("on+", [[500, 160], [800, 8]], "on", 1),
		_road("on-", [[500, -160], [200, -8]], "on", -1),
		_road("C", [[500, -160], [500, 160], [500, 300]]),
		_road("neighbor", [[500, 0], [600, 80]]),
		_road("old+", [[150, 0], [150, 90]]),
		_road("old-", [[150, 0], [150, -90]])],
		"exits": [{"id": "X", "pos": [500, 0], "dest": [500, 300], "highway_id": "H",
			"ramp_ids": ["on+", "off-", "on-", "off+"], "connector_ids": ["C"],
			"interchange": {"layout": "diamond_v2"}},
			{"id": "old", "pos": [150, 0], "dest": [150, 90], "highway_id": "H", "ramp_ids": ["old+", "old-"]}],
		"junctions": [
			_junction("start", [0, 0], [{"road": "H", "arc_m": 0}]),
			_junction("end", [1000, 0], [{"road": "H", "arc_m": 1000}]),
			_junction("mouth-west", [200, 0], [{"road": "H", "arc_m": 200}, {"road": "off+", "arc_m": 0}, {"road": "on-", "arc_m": ramp_len}]),
			_junction("mouth-east", [800, 0], [{"road": "H", "arc_m": 800}, {"road": "off-", "arc_m": 0}, {"road": "on+", "arc_m": ramp_len}]),
			_junction("north", [500, -160], [{"road": "C", "arc_m": 0}, {"road": "off-", "arc_m": ramp_len}, {"road": "on-", "arc_m": 0}]),
			_junction("south", [500, 160], [{"road": "C", "arc_m": 320}, {"road": "off+", "arc_m": ramp_len}, {"road": "on+", "arc_m": 0}]),
			_junction("town", [500, 300], [{"road": "C", "arc_m": 460}]),
			_junction("deck", [500, 0], [{"road": "H", "arc_m": 500}, {"road": "C", "arc_m": 160}], "deck"),
			_junction("old-mouth", [150, 0], [{"road": "H", "arc_m": 150}, {"road": "old+", "arc_m": 0}, {"road": "old-", "arc_m": 0}]),
			_junction("old-south", [150, 90], [{"road": "old+", "arc_m": 90}]),
			_junction("old-north", [150, -90], [{"road": "old-", "arc_m": 90}])]}

func _fold(data: Dictionary) -> CountingMap:
	var file := FileAccess.open("user://interchange-ports-fixture.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(data))
	file.close()
	var map := CountingMap.new()
	_check("real JSON fixture folds", map.load_file("user://interchange-ports-fixture.json"))
	return map


func _port_position(ports: Array, rid: String) -> Vector2:
	for port: Dictionary in ports:
		if String(port["road"]["id"]) == rid:
			return port["pos"]
	return Vector2(INF, INF)


func _cache_cases() -> void:
	var map := _fold(_fixture())
	var descriptor: Dictionary = map.exits[0]
	var first: Array = map.call("exit_ports", descriptor, "off")
	var cold_lookups := map.lookups
	var repeated: Array = map.call("exit_ports", descriptor, "off")
	_check("warm descriptor reuses real road resolution", cold_lookups > 0 and map.lookups == cold_lookups and repeated.size() == 2)
	if not repeated.is_empty():
		var original_id: String = String(repeated[0]["road"]["id"])
		var original_pos: Vector2 = repeated[0]["pos"]
		repeated[0]["role"] = "corrupted"
		repeated[0]["pos"] = Vector2(999, 999)
		repeated[0]["road"]["id"] = "intruder"
		var edited_points: PackedVector2Array = repeated[0]["road"]["pts"]
		edited_points[0] = Vector2(999, 999)
		repeated[0]["road"]["pts"] = edited_points
		var canonical: Dictionary = map.road_by_id(original_id)
		_check("caller mutation cannot change canonical road ownership", not canonical.is_empty() and (canonical["pts"] as PackedVector2Array)[0].is_equal_approx(original_pos))
		var fresh: Array = map.call("exit_ports", descriptor, "off")
		_check("caller mutation cannot poison cached port payloads", fresh.size() == 2 and _port_position(fresh, original_id).is_equal_approx(original_pos) and String(first[0]["road"]["id"]) == original_id)
	_check("cache fixture reloads", map.load_file("user://interchange-ports-fixture.json"))
	descriptor = map.exits[0]
	map.call("exit_ports", descriptor, "off")
	var off: Dictionary = map.road_by_id("off+")
	var moved: PackedVector2Array = off["pts"]
	moved[0] = Vector2(240, 8)
	off["pts"] = moved
	map._build_seg_grid()
	var moved_ports: Array = map.call("exit_ports", descriptor, "off")
	_check("geometry-grid rebuild invalidates port geometry", _port_position(moved_ports, "off+").is_equal_approx(Vector2(240, 8)))
	var before_reload := map.lookups
	_check("same-file map reload succeeds", map.load_file("user://interchange-ports-fixture.json"))
	var reloaded: Array = map.call("exit_ports", map.exits[0], "off")
	_check("map reload invalidates warmed descriptor and geometry", map.lookups > before_reload and _port_position(reloaded, "off+").is_equal_approx(Vector2(200, 8)))

func _has_road_route(graph: ProtoRoadGraph, from: Vector2, to: Vector2, required: String) -> bool:
	var route: Dictionary = graph.route(from, to)
	return not route.is_empty() and (route["roads"] as Array).has(required)

func _reachable_on(graph: ProtoRoadGraph, from: String, to: String, road_ids: Array) -> bool:
	var pending: Array = [from]
	var seen: Dictionary = {}
	while not pending.is_empty():
		var current: String = String(pending.pop_back())
		if current == to:
			return true
		if seen.has(current):
			continue
		seen[current] = true
		for edge: Dictionary in graph.adj.get(current, []):
			if road_ids.has(String(edge["road"])):
				pending.append(edge["to"])
	return false

func _ready() -> void:
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("PORTS: WATCHDOG"); get_tree().quit(1))
	_cache_cases()
	var map := _fold(_fixture())
	var exit_row: Dictionary = map.exits[0]
	var traffic := ProtoTraffic.new()
	traffic.usmap = map
	traffic.set_physics_process(false)
	add_child(traffic)
	_check("displaced owned + off-ramp wins over unrelated ramp", String(traffic._ramp_for(exit_row, 1).get("id", "")) == "off+")
	_check("displaced owned - off-ramp wins", String(traffic._ramp_for(exit_row, -1).get("id", "")) == "off-")
	var missing: Dictionary = exit_row.duplicate(true)
	missing["ramp_ids"] = ["missing"]
	_check("owned list never falls back to neighbor", traffic._ramp_for(missing, 1).is_empty())
	missing["ramp_ids"] = ["on+"]
	_check("explicit on-ramp never departs as off", traffic._ramp_for(missing, 1).is_empty())
	_check("original descriptor remains correct after same-ID ownership changes", String(traffic._ramp_for(exit_row, 1).get("id", "")) == "off+")
	_check("shared port query exists", map.has_method("exit_ports"))
	if map.has_method("exit_ports"):
		var ports: Array = map.call("exit_ports", exit_row, "off")
		_check("two owned departure ports", ports.size() == 2)
		for port: Dictionary in ports:
			var positive: bool = int(port["side"]) == 1
			_check("port terminal and projected highway arc", (port["pos"] as Vector2).is_equal_approx(Vector2(200, 8) if positive else Vector2(800, -8)) and is_equal_approx(float(port["highway_arc_m"]), 200.0 if positive else 800.0))
	_check("connector and interchange metadata survive fold", (exit_row.get("connector_ids", []) as Array).has("C") and String((exit_row.get("interchange", {}) as Dictionary).get("layout", "")) == "diamond_v2")
	for radius: float in [20.0, 400.0]:
		var midpoint := Vector3(350, 0, 84)
		_check("nearest segment preserves one-way (radius %.0f)" % radius, bool(map.road_near(midpoint, radius).get("one_way", false)))
		for rows: Array in [map.roads_near(midpoint, radius), map.road_segments_near(midpoint, radius)]:
			for row: Dictionary in rows:
				if String(row["id"]) == "off+":
					_check("segment consumer sees one-way", bool(row.get("one_way", false)))
	for side: int in [1, -1]:
		var agent := ProtoTraffic.TrafficAgent.new()
		agent.sync_to_physics = false # production spawn_agent: the path owns transforms
		agent.road_id = "H"
		agent.dir = side
		agent.dest_exit_id = "X"
		agent.cruise = 25.0
		add_child(agent)
		agent.position = Vector3(500, 0, 8 * side)
		traffic._maybe_take_exit(agent, map.road_by_id("H"))
		_check("central anchor neither transfers nor consumes roll", agent.road_id == "H" and agent._exit_rolled == "")
		agent.position = Vector3(200 if side == 1 else 800, 0, 8 * side)
		_check("mouth staging reaches the real agent transform", agent.global_position.distance_to(Vector3(200 if side == 1 else 800, 0, 8 * side)) < 0.01)
		traffic._maybe_take_exit(agent, map.road_by_id("H"))
		_check("actual mouth transfers in legal direction", agent.road_id == ("off+" if side == 1 else "off-") and agent.dir == 1 and agent.seg_i == 0 and is_zero_approx(agent.s_ab))
		_check("destination, one-roll and cruise cap preserved", agent.dest_exit_id == "X" and agent._exit_rolled == "X" and agent.cruise <= 16.0)
		agent.free()
	var graph := ProtoRoadGraph.build(map)
	for side: int in [1, -1]:
		var approach := Vector2(0, 6) if side == 1 else Vector2(1000, -6)
		var departure := Vector2(1000, 6) if side == 1 else Vector2(0, -6)
		_check("town route uses serving off-ramp %d" % side, _has_road_route(graph, approach, Vector2(500, 300), "off+" if side == 1 else "off-"))
		_check("return uses serving on-ramp %d" % side, _has_road_route(graph, Vector2(500, 300), departure, "on+" if side == 1 else "on-"))
	_check("incoming-only destination remains selectable", (graph.nodes[graph.nearest_node(Vector2(1000, 6))]["pos"] as Vector2).distance_to(Vector2(1000, 6)) < 10.0)
	_check("unused deck placeholder cannot win nearest", graph.nearest_node(Vector2(500, 0)) != "deck")
	_check("no cross-median via old shared ramp mouth", not _reachable_on(graph, graph.nearest_node(Vector2(0, 6)), graph.nearest_node(Vector2(0, -6)), ["H", "old+", "old-"]))
	_check("no direct under-deck transfer", not _reachable_on(graph, graph.nearest_node(Vector2(0, 6)), graph.nearest_node(Vector2(500, 300)), ["H", "C"]))
	for rid: String in ["off+", "off-", "on+", "on-"]:
		var backward: bool = false
		var ramp: Dictionary = map.road_by_id(rid)
		var pts: PackedVector2Array = ramp["pts"]
		var direction: Vector2 = pts[1] - pts[0]
		for node_id: String in graph.adj:
			for edge: Dictionary in graph.adj[node_id]:
				if String(edge["road"]) == rid:
					var a: Vector2 = graph.nodes[node_id]["pos"]
					var b: Vector2 = graph.nodes[edge["to"]]["pos"]
					if (b - a).dot(direction) < -1.0:
						backward = true
		_check("no reverse on/off traversal on %s" % rid, not backward)
	# Existing legal flat gaps still permit transfers; time cost beats distance.
	var gap_data := _fixture()
	gap_data["junctions"][7]["grade"] = "flat"
	gap_data["junctions"][7]["control"] = "gap"
	var gap_graph := ProtoRoadGraph.build(_fold(gap_data))
	_check("flat control-gap retains legal transfer", _reachable_on(gap_graph, gap_graph.nearest_node(Vector2(0, 6)), gap_graph.nearest_node(Vector2(500, 300)), ["H", "C"]))
	var timed := _fold({"w": 1, "h": 1, "grid": ["."], "roads": [
		{"id": "short", "kind": "backroad", "pts": [[0, 0], [1000, 0]], "speed_mps": 10},
		{"id": "fast", "kind": "interstate", "pts": [[0, 0], [0, 100], [1000, 100], [1000, 0]], "speed_mps": 100}],
		"junctions": [_junction("s", [0, 0], [{"road": "short", "arc_m": 0}, {"road": "fast", "arc_m": 0}]),
		_junction("t", [1000, 0], [{"road": "short", "arc_m": 1000}, {"road": "fast", "arc_m": 1200}])]})
	var fastest: Dictionary = ProtoRoadGraph.build(timed).route(Vector2.ZERO, Vector2(1000, 0))
	_check("longer route wins by authored time cost", (fastest.get("roads", []) as Array) == ["fast"] and is_equal_approx(float(fastest.get("time_s", 0)), 12.0))
	# The actual managed Seattle rows must reach town from BOTH carriageways,
	# and return via the two ON ramps. Samples lie 90m outside each port.
	var actual := ProtoUSMap.new()
	_check("managed map folds", actual.load_file(ProtoUSMap.PATH))
	var seattle: Dictionary = {}
	for row: Dictionary in actual.exits:
		if String(row["id"]) == "I-90_X11":
			seattle = row
	_check("managed Seattle present", not seattle.is_empty())
	if not seattle.is_empty() and actual.has_method("exit_ports"):
		var actual_graph := ProtoRoadGraph.build(actual)
		var highway: Dictionary = actual.road_by_id("I-90")
		var actual_ports: Array = actual.call("exit_ports", seattle)
		_check("Seattle resolves four owned ports", actual_ports.size() == 4)
		for port: Dictionary in actual_ports:
			var side: int = int(port["side"])
			var off: bool = String(port["role"]) == "off"
			var arc: float = float(port["highway_arc_m"]) + (-90.0 if off else 90.0) * side
			var sample: Dictionary = _sample(highway, arc)
			var direction: Vector2 = sample["dir"]
			var location: Vector2 = sample["pos"] + Vector2(-direction.y, direction.x) * 6.0 * side
			var destination: Vector2 = seattle["dest"]
			var route_from: Vector2 = location if off else destination
			var route_to: Vector2 = destination if off else location
			var diagnostic: Dictionary = actual_graph.route(route_from, route_to)
			_check("Seattle unconstrained fastest route remains available", not diagnostic.is_empty())
			# Existing flat-gap ST-seattle-main can legitimately be faster. Prove
			# the required ramp path with ordered directed edges, not a speed bias.
			var local_roads: Array = ["I-90_X11-crossroad", "I-90_X11-town-link", "ST-seattle-side0"]
			_check("Seattle %s side %d has directed owned-ramp path" % [port["role"], side], _ordered_path(actual_graph, actual_graph.nearest_node(route_from), actual_graph.nearest_node(route_to), ["I-90"] if off else local_roads, String(port["road"]["id"]), local_roads if off else ["I-90"]))
	# Read-only hot-path diagnostic: 12 real I-95 agents over 30 physics frames.
	# This measures lookup work only, excluding scene/render/physics setup.
	var highway_exits: Array = actual.exits.filter(func(row: Dictionary) -> bool: return String(row["highway_id"]) == "I-95")
	var lookup_calls := 0
	var started_us := Time.get_ticks_usec()
	for _frame in 30:
		for _agent in 12:
			for row: Dictionary in highway_exits:
				actual.call("exit_ports", row, "off")
				lookup_calls += 1
	var elapsed_ms := float(Time.get_ticks_usec() - started_us) / 1000.0
	print("PORTS PERF calls=%d exits=%d agents=12 frames=30 elapsed_ms=%.3f per_frame_ms=%.3f" % [lookup_calls, highway_exits.size(), elapsed_ms, elapsed_ms / 30.0])
	traffic.free()
	print("PORTS RESULTS: %d passed, %d failed" % [passed, failed])
	print("PORTS: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _sample(road: Dictionary, arc: float) -> Dictionary:
	var pts: PackedVector2Array = road["pts"]
	var remaining := arc
	for i in range(pts.size() - 1):
		var delta := pts[i + 1] - pts[i]
		var length := delta.length()
		if remaining <= length or i == pts.size() - 2:
			return {"pos": pts[i] + delta.normalized() * clampf(remaining, 0.0, length), "dir": delta.normalized()}
		remaining -= length
	return {}


## Real directed graph search in three road phases: approach -> ramp -> exit.
## A path cannot pass this check by bypassing the ramp or reversing its edges.
func _ordered_path(graph: ProtoRoadGraph, from: String, to: String, before: Array, ramp: String, after: Array) -> bool:
	var pending: Array = [{"node": from, "phase": 0}]
	var seen: Dictionary = {}
	while not pending.is_empty():
		var state: Dictionary = pending.pop_back()
		var node: String = state["node"]
		var phase: int = state["phase"]
		var key := "%s|%d" % [node, phase]
		if seen.has(key):
			continue
		seen[key] = true
		if node == to and phase == 2:
			return true
		for edge: Dictionary in graph.adj.get(node, []):
			var road: String = edge["road"]
			var next_phase := -1
			if phase == 0 and before.has(road):
				next_phase = 0
			elif phase <= 1 and road == ramp:
				next_phase = 1
			elif phase >= 1 and after.has(road):
				next_phase = 2
			if next_phase >= 0:
				pending.append({"node": edge["to"], "phase": next_phase})
	return false
