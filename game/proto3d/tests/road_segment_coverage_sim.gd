## Regression: a road vertex inside a chunk must not discard either adjoining
## segment. Inspect the REAL streamer's pitched asphalt meshes, not just data
## counts or terrain collision (terrain can hide a missing visual road).
## Synthetic rows are in memory; the real map and normal save profile are never
## written. Staging is geometry-only, not a claim of an input-driven playthrough.
extends Node3D

var passed: int = 0
var failed: int = 0
var _finished: bool = false
var _previous_map: ProtoUSMap
var _previous_rects: Dictionary
var _stream: ProtoWorldStream


func _check(label: String, condition: bool) -> void:
	passed += 1 if condition else 0
	failed += 0 if condition else 1
	print("ROAD_SEGMENTS: %s - %s" % ["PASS" if condition else "FAIL", label])


func _ready() -> void:
	_previous_map = ProtoWorldBuilder.usmap
	_previous_rects = ProtoWorldBuilder.extra_road_rects.duplicate(true)
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		_check("geometry regression finishes before watchdog", false)
		_finish())
	_run.call_deferred()


## Intersect a vertical line with an instantiated BoxMesh's TOP face. The
## independent oracle uses its full global transform, including pitch, and
## therefore catches absent slabs, wrong yaw, and wrong endpoint elevation.
func _slab_height(node: Node, road_id: String, at: Vector2, expected_elev: float) -> float:
	if node is MeshInstance3D and String(node.get_meta("road_slab", "")) == road_id:
		var mesh := node as MeshInstance3D
		if mesh.mesh is BoxMesh:
			var half: Vector3 = (mesh.mesh as BoxMesh).size * 0.5
			var top := Vector3(at.x, expected_elev + 2.0, at.y)
			var bottom := Vector3(at.x, expected_elev - 2.0, at.y)
			var start: Vector3 = mesh.to_local(top)
			var delta: Vector3 = mesh.to_local(bottom) - start
			if absf(delta.y) > 0.0001:
				var t: float = (half.y - start.y) / delta.y
				var point: Vector3 = start + delta * t
				if t >= 0.0 and t <= 1.0 and absf(point.x) <= half.x and absf(point.z) <= half.z:
					return top.lerp(bottom, t).y
	for child: Node in node.get_children():
		var height := _slab_height(child, road_id, at, expected_elev)
		if is_finite(height):
			return height
	return INF


func _coverage(label: String, root: Node, road_id: String, at: Vector2, expected_elev: float) -> void:
	var height := _slab_height(root, road_id, at, expected_elev)
	_check("%s: actual asphalt covers the carriageway" % label, is_finite(height))
	# Paint is 70-86mm above its row, plus the mesh's 25mm top half-thickness.
	_check("%s: asphalt keeps its own segment elevation" % label,
		is_finite(height) and height - expected_elev > 0.04 and height - expected_elev < 0.14)


func _fixture_map() -> ProtoUSMap:
	var map := ProtoUSMap.new()
	map.ok = true
	map.offset = Vector2(768.0, 768.0)
	map.cell_m = 500.0
	map.w = 4
	map.h = 4
	map.legend = {"d": "desert"}
	map.state_legend = {"V": "VIRGINIA"}
	map.grid = PackedStringArray(["dddd", "dddd", "dddd", "dddd"])
	map.states_grid = PackedStringArray(["VVVV", "VVVV", "VVVV", "VVVV"])
	map.roads = [{"id": "coverage-bend", "kind": "exit", "lanes": 2, "divided": false,
		"pts": PackedVector2Array([Vector2(1000, 1064), Vector2(1080, 1064), Vector2(1140, 1124)]),
		"elev": PackedFloat32Array([0.0, 4.0, 10.0]), "elev_mode": "structure",
		"surface": "asphalt", "danger": 0, "family": "fixture", "nickname": "BEND",
		"toll": 0, "side": 0, "leads_to": {}}]
	map._build_seg_grid()
	return map


func _query_contract(map: ProtoUSMap, label: String) -> void:
	var center := Vector3(1088, 0, 1088)
	# GPS/traffic still request one nearest segment PER ROAD. Making the old
	# API return duplicates is not an acceptable renderer fix.
	var nearest: Array = map.roads_near(center, 220.0)
	_check("%s: legacy road query retains one nearest segment" % label,
		nearest.size() == 1 and nearest[0]["a"] == Vector2(1080, 1064))
	_check("%s: rendering has an all-segment query" % label, map.has_method("road_segments_near"))
	if not map.has_method("road_segments_near"):
		return
	var segments: Array = map.call("road_segments_near", center, 220.0)
	var first: bool = false
	var second: bool = false
	for row: Dictionary in segments:
		if row["a"] == Vector2(1000, 1064) and row["b"] == Vector2(1080, 1064):
			first = is_equal_approx(float(row["elev_a"]), 0.0) and is_equal_approx(float(row["elev_b"]), 4.0)
		if row["a"] == Vector2(1080, 1064) and row["b"] == Vector2(1140, 1124):
			second = is_equal_approx(float(row["elev_a"]), 4.0) and is_equal_approx(float(row["elev_b"]), 10.0)
	_check("%s: both bend segments retain distinct endpoints and heights" % label,
		segments.size() == 2 and first and second)
	var distant: Array = map.call("road_segments_near", Vector3(1600, 0, 1600), 20.0)
	_check("%s: segments outside query radius are excluded" % label, distant.is_empty())


func _synthetic() -> void:
	var map := _fixture_map()
	_query_contract(map, "indexed")
	map._seg_grid.clear()
	_query_contract(map, "unindexed fallback")
	map._build_seg_grid()
	ProtoWorldBuilder.usmap = map
	_stream = ProtoWorldStream.new()
	_stream.usmap = map
	add_child(_stream)
	# Real _spawn_at includes ground/content draping, not a hand-built road.
	_stream._spawn_at(8, 8)
	var chunk: Node3D = _stream.loaded.get("8,8")
	_check("synthetic bend chunk materializes", chunk != null)
	if chunk != null:
		# First leg: x=1050 is 50/80 along 0->4m; lane 3.6m from center.
		_coverage("bend incoming", chunk, "coverage-bend", Vector2(1050, 1067.6), 2.5)
		# Second leg: midpoint 4->10m, 3.6m to its right, away from center paint.
		_coverage("bend outgoing", chunk, "coverage-bend", Vector2(1112.545584, 1091.454416), 7.0)
	_clear_stream()


func _appalachian() -> void:
	var map := ProtoUSMap.get_default()
	_check("real US map loads", map != null and map.ok)
	if map == null or not map.ok:
		return
	ProtoWorldBuilder.usmap = map
	_stream = ProtoWorldStream.new()
	_stream.usmap = map
	add_child(_stream)
	# Fresh-arrival path loads the REAL ring, including neighboring chunks whose
	# 6m clip margins could otherwise disguise a single-chunk coverage failure.
	_stream.update_stream(Vector3(-6500, 5.6, 2875), self)
	_check("actual stream loads the Appalachian vertex chunk", _stream.loaded.has("-51,22"))
	var road: Dictionary = map.road_by_id("I-40")
	_check("Appalachian fixture remains a divided I-40 road", not road.is_empty() and bool(road.get("divided", false)))
	# Surveyed I-40 incoming: (-6750,2835.94,9.43m)->(-6500,2875,4.58m).
	# The old nearest-only build omits the portion near x=-6510. Probe BOTH
	# carriageways at a 7.4m lane offset, never the physical median barrier.
	var incoming_normal := Vector2(39.06, -250.0).normalized()
	var incoming := Vector2(-6510, 2873.4376)
	for side: float in [-1.0, 1.0]:
		_coverage("I-40 incoming lane %d" % int(side), _stream, "I-40",
			incoming + incoming_normal * (7.4 * side), 4.774)
	# Existing outgoing segment is the control; preserving its elevation matters.
	var outgoing_normal := Vector2(39.07, -250.0).normalized()
	_coverage("I-40 outgoing control", _stream, "I-40",
		Vector2(-6475, 2878.907) + outgoing_normal * 7.4, 4.122)
	_clear_stream()


func _clear_stream() -> void:
	if is_instance_valid(_stream):
		for key: String in _stream.loaded:
			ProtoWorldBuilder.extra_road_rects.erase(key)
		_stream.free()
	_stream = null


func _run() -> void:
	_synthetic()
	_appalachian()
	ProtoWorldBuilder.usmap = _previous_map
	ProtoWorldBuilder.extra_road_rects = _previous_rects
	# Release this coroutine's local resources before engine shutdown.
	_finish.call_deferred()


func _finish() -> void:
	if _finished:
		return
	_finished = true
	_clear_stream()
	ProtoWorldBuilder.usmap = _previous_map
	ProtoWorldBuilder.extra_road_rects = _previous_rects
	print("ROAD_SEGMENTS RESULTS: %d passed, %d failed" % [passed, failed])
	print("ROAD_SEGMENTS: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
