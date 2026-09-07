## Real JSON -> ProtoUSMap -> public ProtoRoadGraph.route regression.
## Catches a shared flat node joining pavement that does not physically meet.
## Fixtures live only in the parent's disposable user:// profile. No main scene.
extends Node

var passed: int = 0
var failed: int = 0
var fixture_path: String = ""


func _check(label: String, condition: bool) -> void:
	passed += int(condition)
	failed += int(not condition)
	print("JCONNECT: %s - %s" % ["PASS" if condition else "FAIL", label])


func _road(id: String, points: Array, extra: Dictionary = {}) -> Dictionary:
	var row: Dictionary = {"id": id, "kind": "street", "pts": points, "lanes": 2, "divided": false}
	row.merge(extra, true)
	return row


func _junction(id: String, position: Array, legs: Array, grade: String = "flat", control: String = "none") -> Dictionary:
	return {"id": id, "pos": position, "legs": legs, "grade": grade, "control": control}


func _fold(data: Dictionary, label: String) -> ProtoUSMap:
	var map := ProtoUSMap.new()
	var file := FileAccess.open(fixture_path, FileAccess.WRITE)
	_check(label + " isolated fixture opens", file != null)
	if file == null:
		return map
	file.store_string(JSON.stringify(data))
	file.close()
	_check(label + " real JSON folds", map.load_file(fixture_path))
	return map


## No graph edits or substitute search. Reconstruct the edges of the path
## returned by the PUBLIC time-cost route. Equal-cost parallel road choices
## would be ambiguous, so fail rather than pretend we know which was selected.
func _query(graph: ProtoRoadGraph, label: String, start: Vector2, finish: Vector2, source: String = "", target: String = "") -> Dictionary:
	var resolved_start := graph.nearest_node(start)
	var resolved_finish := graph.nearest_node(finish)
	if source != "":
		_check(label + " nearest start is " + source, resolved_start == source)
	if target != "":
		_check(label + " nearest finish is " + target, resolved_finish == target)
	var result := graph.route(start, finish)
	var chain: Array = result.get("nodes", [])
	var edges: Array[Dictionary] = []
	var total_time := 0.0
	var unambiguous := true
	for i: int in range(chain.size() - 1):
		var best: Dictionary = {}
		var ties := 0
		for candidate: Dictionary in graph.adj.get(String(chain[i]), []):
			if String(candidate["to"]) != String(chain[i + 1]):
				continue
			if best.is_empty() or float(candidate["time_s"]) < float(best["time_s"]) - 0.000001:
				best = candidate
				ties = 1
			elif absf(float(candidate["time_s"]) - float(best["time_s"])) <= 0.000001:
				ties += 1
		if best.is_empty():
			unambiguous = false
			continue
		unambiguous = unambiguous and ties == 1
		total_time += float(best["time_s"])
		edges.append({"from": String(chain[i]), "to": String(best["to"]), "road": String(best["road"]), "len_m": float(best["len_m"]), "time_s": float(best["time_s"])})
	var transitions: Array[Dictionary] = []
	for i: int in range(1, edges.size()):
		if String(edges[i - 1]["road"]) != String(edges[i]["road"]):
			var node_id := String(edges[i]["from"])
			var node: Dictionary = graph.nodes[node_id]
			var junction: Dictionary = node.get("junction", {})
			transitions.append({"node": node_id, "junction": String(junction.get("id", "")), "from_road": String(edges[i - 1]["road"]), "to_road": String(edges[i]["road"])})
	if not result.is_empty():
		_check(label + " selected public path resolves both requested nodes", not chain.is_empty() and String(chain[0]) == resolved_start and String(chain[-1]) == resolved_finish)
		_check(label + " selected directed edges are unambiguous and match route time", unambiguous and edges.size() == chain.size() - 1 and absf(total_time - float(result["time_s"])) < 0.001)
	print("JCONNECT ROUTE ", JSON.stringify({"label": label, "start": str(start), "finish": str(finish), "resolved_start": resolved_start, "resolved_finish": resolved_finish, "reachable": not result.is_empty(), "selected": result, "edges": edges, "transitions": transitions}))
	return {"route": result, "edges": edges, "transitions": transitions}


func _only_road(trace: Dictionary, road_id: String, length: float) -> bool:
	var result: Dictionary = trace["route"]
	var edges: Array = trace["edges"]
	if result.is_empty() or edges.is_empty() or absf(float(result["len_m"]) - length) > 0.05:
		return false
	for edge: Dictionary in edges:
		if String(edge["road"]) != road_id:
			return false
	return true


func _has_transition(trace: Dictionary, junction_id: String) -> bool:
	for transition: Dictionary in trace["transitions"]:
		if String(transition["junction"]) == junction_id:
			return true
	return false


## Independent literal geometry cases. The proposed shared production helper
## is NOT used to compute any of these expected connectivity outcomes.
func _flat_and_grade_cases() -> void:
	var cases: Array[Dictionary] = [
		{"name": "flat 40m lateral gap", "points": [[-100, 40], [100, 40]], "arc": 100.0, "length": 200.0, "want_transfer": false},
		{"name": "finite end 4m beyond legacy cap", "points": [[0, 4], [0, 104]], "arc": 0.0, "length": 100.0, "want_transfer": false},
		{"name": "finite end 1m beyond managed cap", "points": [[0, 1], [0, 101]], "arc": 0.0, "length": 100.0, "extra": {"interchange_id": "managed"}, "want_transfer": false},
		{"name": "missing listed road cannot authorize transfer", "points": [[0, -100], [0, 100]], "arc": 100.0, "length": 200.0, "missing": true, "want_transfer": false},
		{"name": "legitimate flat cross", "points": [[0, -100], [0, 100]], "arc": 100.0, "length": 200.0, "want_transfer": true},
		{"name": "wide pavement overlap at 12m", "points": [[-100, 12], [100, 12]], "arc": 100.0, "length": 200.0, "extra": {"lanes": 8, "divided": false}, "want_transfer": true},
		{"name": "legitimate diagonal cross", "points": [[-60, -80], [60, 80]], "arc": 100.0, "length": 200.0, "want_transfer": true},
		{"name": "legacy endpoint inside 3m cap", "points": [[0, 2.9], [0, 102.9]], "arc": 0.0, "length": 100.0, "want_transfer": true},
		{"name": "managed endpoint inside 0.03m cap", "points": [[0, 0.02], [0, 100.02]], "arc": 0.0, "length": 100.0, "extra": {"interchange_id": "managed"}, "want_transfer": true},
		{"name": "separated crossing", "points": [[0, -100], [0, 100]], "arc": 100.0, "length": 200.0, "grade": "separated_pending", "want_transfer": false},
		{"name": "deck crossing even with stale gap control", "points": [[0, -100], [0, 100]], "arc": 100.0, "length": 200.0, "grade": "deck", "want_transfer": false},
		{"name": "one-way along nonmeeting road", "points": [[-100, 40], [100, 40]], "arc": 100.0, "length": 200.0, "extra": {"one_way": true}, "want_transfer": false}]
	for row: Dictionary in cases:
		var label := String(row["name"])
		var points: Array = row["points"]
		var extra: Dictionary = row.get("extra", {})
		var legs: Array = [{"road": "A", "arc_m": 100}, {"road": "B", "arc_m": row["arc"]}]
		if bool(row.get("missing", false)):
			legs.append({"road": "absent", "arc_m": 0})
		var map := _fold({"w": 1, "h": 1, "grid": ["."], "roads": [_road("A", [[-100, 0], [100, 0]]), _road("B", points, extra)], "junctions": [
			_junction("a0", [-100, 0], [{"road": "A", "arc_m": 0}]),
			_junction("a1", [100, 0], [{"road": "A", "arc_m": 200}]),
			_junction("b0", points[0], [{"road": "B", "arc_m": 0}]),
			_junction("b1", points[1], [{"road": "B", "arc_m": row["length"]}]),
			_junction("cross", [0, 0], legs, String(row.get("grade", "flat")), "gap")]}, label)
		var graph := ProtoRoadGraph.build(map)
		var b0 := Vector2(float(points[0][0]), float(points[0][1]))
		var b1 := Vector2(float(points[1][0]), float(points[1][1]))
		var cross := _query(graph, label + " A to B", Vector2(-100, 0), b1, "a0", "b1")
		var want_transfer := bool(row["want_transfer"])
		_check(label + " literal transfer outcome", (not (cross["route"] as Dictionary).is_empty()) == want_transfer)
		_check(label + " actual chosen edge transition", _has_transition(cross, "cross") == want_transfer)
		var reverse_cross := _query(graph, label + " B to A", b1, Vector2(-100, 0), "b1", "a0")
		_check(label + " reverse transfer outcome", (not (reverse_cross["route"] as Dictionary).is_empty()) == want_transfer)
		for direction: int in [1, -1]:
			var along_a := _query(graph, label + " A along %d" % direction, Vector2(-100 * direction, 0), Vector2(100 * direction, 0), "a0" if direction == 1 else "a1", "a1" if direction == 1 else "a0")
			_check(label + " A same-road length preserved %d" % direction, _only_road(along_a, "A", 200.0))
		var along_b := _query(graph, label + " B forward", b0, b1, "b0", "b1")
		_check(label + " B same-road length preserved", _only_road(along_b, "B", float(row["length"])))
		var reverse_b := _query(graph, label + " B reverse", b1, b0, "b1", "b0")
		if bool(extra.get("one_way", false)):
			_check(label + " reverse one-way remains unreachable", (reverse_b["route"] as Dictionary).is_empty())
		else:
			_check(label + " B reverse same-road length preserved", _only_road(reverse_b, "B", float(row["length"])))


## Directed owned ports use their real public routes, not a constrained BFS.
func _ramp_cases() -> void:
	var ramp_length: float = Vector2(300, 152).length()
	var map := _fold({"w": 1, "h": 1, "grid": ["."], "roads": [
		_road("H", [[0, 0], [1000, 0]], {"kind": "interstate", "lanes": 4, "divided": true}),
		_road("off+", [[200, 8], [500, 160]], {"kind": "exit", "ramp_role": "off", "side": 1, "one_way": true, "interchange_id": "X"}),
		_road("off-", [[800, -8], [500, -160]], {"kind": "exit", "ramp_role": "off", "side": -1, "one_way": true, "interchange_id": "X"}),
		_road("on+", [[500, 160], [800, 8]], {"kind": "exit", "ramp_role": "on", "side": 1, "one_way": true, "interchange_id": "X"}),
		_road("on-", [[500, -160], [200, -8]], {"kind": "exit", "ramp_role": "on", "side": -1, "one_way": true, "interchange_id": "X"}),
		_road("C", [[500, -160], [500, 160], [500, 300]]),
		_road("D", [[0, 40], [200, 40]])], "exits": [
		{"id": "X", "highway_id": "H", "pos": [500, 0], "dest": [500, 300], "ramp_ids": ["off+", "off-", "on+", "on-"], "connector_ids": ["C"], "interchange": {"layout": "diamond_v2"}}], "junctions": [
		_junction("start", [0, 0], [{"road": "H", "arc_m": 0}]),
		_junction("end", [1000, 0], [{"road": "H", "arc_m": 1000}]),
		_junction("north", [500, -160], [{"road": "C", "arc_m": 0}, {"road": "off-", "arc_m": ramp_length}, {"road": "on-", "arc_m": 0}]),
		_junction("south", [500, 160], [{"road": "C", "arc_m": 320}, {"road": "off+", "arc_m": ramp_length}, {"road": "on+", "arc_m": 0}]),
		_junction("town", [500, 300], [{"road": "C", "arc_m": 460}]),
		_junction("deck", [500, 0], [{"road": "H", "arc_m": 500}, {"road": "C", "arc_m": 160}], "deck"),
		_junction("d0", [0, 40], [{"road": "D", "arc_m": 0}]),
		_junction("d1", [200, 40], [{"road": "D", "arc_m": 200}]),
		_junction("phantom-gap", [100, 0], [{"road": "H", "arc_m": 100}, {"road": "D", "arc_m": 100}], "flat", "gap")]}, "owned ramps")
	var graph := ProtoRoadGraph.build(map)
	for side: int in [1, -1]:
		var approach := Vector2(0, 3.8) if side == 1 else Vector2(1000, -3.8)
		var departure := Vector2(1000, 3.8) if side == 1 else Vector2(0, -3.8)
		var source := "start@H:1" if side == 1 else "end@H:-1"
		var target := "end@H:1" if side == 1 else "start@H:-1"
		var off := "off+" if side == 1 else "off-"
		var on := "on+" if side == 1 else "on-"
		var entering := _query(graph, "owned departure %d" % side, approach, Vector2(500, 300), source, "town")
		_check("public approach uses correct owned off ramp %d" % side, (entering["route"] as Dictionary).get("roads", []) == ["H", off, "C"])
		_check("no cross-road transfer at deck %d" % side, not _has_transition(entering, "deck"))
		var leaving := _query(graph, "owned return %d" % side, Vector2(500, 300), departure, "town", target)
		_check("public return uses correct owned on ramp %d" % side, (leaving["route"] as Dictionary).get("roads", []) == ["C", on, "H"])
		var through := _query(graph, "carrier through %d" % side, approach, departure, source, target)
		_check("carrier direction through single-leg endpoints preserved %d" % side, _only_road(through, "H", 1000.0))
		var wrong_way := _query(graph, "cannot reverse to approach %d" % side, Vector2(500, 300), approach, "town", source)
		_check("no wrong-way ramp/carrier route %d" % side, (wrong_way["route"] as Dictionary).is_empty())
	var turnaround := _query(graph, "no phantom-gap cross-median shortcut", Vector2(0, 3.8), Vector2(0, -3.8), "start@H:1", "start@H:-1")
	_check("public turnaround must use off ramp, connector, and opposing on ramp", (turnaround["route"] as Dictionary).get("roads", []) == ["H", "off+", "C", "on-", "H"])
	var separated_street := _query(graph, "carrier cannot transfer to offset street", Vector2(0, 3.8), Vector2(200, 40), "start@H:1", "d1")
	_check("nonmeeting carrier gap cannot authorize street transfer", (separated_street["route"] as Dictionary).is_empty())
	_check("inactive deck placeholder cannot capture nearest query", graph.nearest_node(Vector2(500, 0)) != "deck")


## Additional renderer/graph consistency audit, not the literal fixture oracle.
## Inspect every REAL selected road change, including alternatives around J135.
func _nonphysical_transitions(graph: ProtoRoadGraph, stream: ProtoWorldStream, trace: Dictionary) -> Array:
	var invalid: Array = []
	for transition: Dictionary in trace["transitions"]:
		var node: Dictionary = graph.nodes[String(transition["node"])]
		var junction: Dictionary = node.get("junction", {})
		if junction.is_empty():
			continue # explicit directed ramp ports are not baked flat transfers
		if String(junction.get("grade", "flat")) in ["deck", "separated_pending"] or not stream._junction_roads_meet(junction):
			invalid.append(transition)
	return invalid


func _actual_cases() -> void:
	var map := ProtoUSMap.new()
	_check("actual map folds read-only", map.load_file(ProtoUSMap.PATH))
	if not map.ok:
		return
	var graph := ProtoRoadGraph.build(map)
	var stream := ProtoWorldStream.new()
	stream.usmap = map
	var target: Dictionary = {}
	var affected: Array = []
	var affected_by_kind: Dictionary = {}
	var renderer_eligible := 0
	for junction: Dictionary in map.junctions:
		if String(junction["id"]) == "J-tee-135":
			target = junction
		if (junction["legs"] as Array).size() >= 2 and String(junction["grade"]) == "flat" and not stream._junction_roads_meet(junction):
			affected.append(String(junction["id"]))
			var kind := String(junction["kind"])
			affected_by_kind[kind] = int(affected_by_kind.get(kind, 0)) + 1
			renderer_eligible += int(kind in ["tee", "cross"])
	# This is a geometry census, NOT a count of changed graph transfers. Owned
	# ports have separate directed attachment handling and need their own audit.
	print("JCONNECT AFFECTED ", JSON.stringify({"flat_nonmeeting_count": affected.size(), "by_kind": affected_by_kind, "renderer_eligible_tee_cross": renderer_eligible, "other_kinds": affected.size() - renderer_eligible, "changed_transfer_count": "not_measured", "ids": affected, "read_only": true}))
	_check("actual J135 exists", not target.is_empty())
	if target.is_empty():
		stream.free()
		return
	var street := map.road_by_id("ST-seattle-main")
	var projection := ProtoUSMap._project_road(street, target["pos"])
	_check("actual measured J135 street gap is 38.71m, not pavement", absf(float(projection["dist"]) - 38.7109375) < 0.02 and absf(float(ProtoUSMap.road_geometry(street)["width"]) * 0.5 - 4.6) < 0.001)
	# Literal printed coordinates and node IDs from the parent's read-only
	# dd1e973703e346769c5e64b13e036a7d diagnostic: do not relocate these probes.
	var cases: Array[Dictionary] = [
		{"name": "actual J135 attempt 1", "start": Vector2(-56435.0, -18000.0), "finish": Vector2(-56434.18, -17986.94), "source": "J-cross-486", "target": "J-cross-373@I-90:-1"},
		{"name": "actual J135 attempt 2", "start": Vector2(-56435.0, -18000.0), "finish": Vector2(-56316.97, -17948.84), "source": "J-cross-486", "target": "port@I-90_X11-off-r@I-90:1"},
		{"name": "actual J135 attempt 3", "start": Vector2(-56436.07, -17979.58), "finish": Vector2(-56435.0, -18000.0), "source": "J-cross-373@I-90:1", "target": "J-cross-486"},
		{"name": "actual J135 attempt 4", "start": Vector2(-56315.07, -17956.2), "finish": Vector2(-56435.0, -18000.0), "source": "port@I-90_X11-off-r@I-90:-1", "target": "J-cross-486"}]
	var reachable := 0
	var legal_alternatives := 0
	for row: Dictionary in cases:
		var label := String(row["name"])
		var trace := _query(graph, label, row["start"], row["finish"], String(row["source"]), String(row["target"]))
		var invalid := _nonphysical_transitions(graph, stream, trace)
		var exists := not (trace["route"] as Dictionary).is_empty()
		var phantom := _has_transition(trace, "J-tee-135")
		reachable += int(exists)
		legal_alternatives += int(exists and not phantom and invalid.is_empty())
		_check(label + " rejects selected cross-road transfer across 38.71m gap", not phantom)
		_check(label + " any returned alternative uses physically meeting transfers", invalid.is_empty())
		print("JCONNECT ALTERNATIVE ", JSON.stringify({"label": label, "reachable": exists, "legal_alternative": exists and not phantom and invalid.is_empty(), "invalid_transitions": invalid, "endpoint_substitution": false}))
	print("JCONNECT ACTUAL SUMMARY ", JSON.stringify({"attempts": 4, "reachable": reachable, "legal_alternatives": legal_alternatives, "unreachable": 4 - reachable}))
	# Preserve both same-road directions THROUGH the exact nonmeeting junction.
	var positive := _query(graph, "actual I90 positive through J135", Vector2(-56436.07, -17979.58), Vector2(-56316.97, -17948.84), "J-cross-373@I-90:1", "port@I-90_X11-off-r@I-90:1")
	_check("actual I90 positive stays on same road for 123.003m", _only_road(positive, "I-90", 123.0033782707119))
	var negative := _query(graph, "actual I90 negative through J135", Vector2(-56315.07, -17956.2), Vector2(-56434.18, -17986.94), "port@I-90_X11-off-r@I-90:-1", "J-cross-373@I-90:-1")
	_check("actual I90 negative stays on same road for 123.003m", _only_road(negative, "I-90", 123.0033782707119))
	# A separate real, directed Seattle town route is a preservation control,
	# not a replacement for any of the four original requested endpoints.
	# Both authored nodes have these exact coordinates. Public nearest-node
	# selection resolves the earlier end cap; the legal path still must pass
	# through the town-link destination before its zero-length side-street edge.
	var town := _query(graph, "actual owned off-r to Seattle", Vector2(-56316.97, -17948.84), Vector2(-56555, -18090), "port@I-90_X11-off-r@I-90:1", "J-end_cap-813")
	_check("real Seattle town destination remains reachable", not (town["route"] as Dictionary).is_empty())
	_check("real Seattle selected path passes authored town-link destination", ((town["route"] as Dictionary).get("nodes", []) as Array).has("I-90_X11-destination"))
	_check("real Seattle public route actually uses owned off-r", ((town["route"] as Dictionary).get("roads", []) as Array).has("I-90_X11-off-r"))
	_check("real Seattle selected route has no phantom road change", _nonphysical_transitions(graph, stream, town).is_empty())
	stream.free()


func _ready() -> void:
	fixture_path = "user://junction-connectivity-%d.json" % Time.get_ticks_usec()
	get_tree().create_timer(45.0).timeout.connect(func() -> void:
		print("JCONNECT: WATCHDOG")
		get_tree().quit(1))
	_flat_and_grade_cases()
	_ramp_cases()
	await get_tree().process_frame
	_actual_cases()
	_check("isolated fixture removed", DirAccess.remove_absolute(ProjectSettings.globalize_path(fixture_path)) == OK)
	print("JCONNECT RESULTS: %d passed, %d failed" % [passed, failed])
	print("JCONNECT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
