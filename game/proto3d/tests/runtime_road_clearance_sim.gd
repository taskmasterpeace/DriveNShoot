## Runtime filler must leave the full road / authored building footprint clear.
## Uses the real stampers and their instantiated BoxShape3D transforms. Polygon
## clipping is an independent oracle, not the production clearance helper.
## Run: Godot --headless --path game res://proto3d/tests/runtime_road_clearance_sim.tscn
extends Node3D

const SEED := 7193
var passed: int = 0
var failed: int = 0
var stream: ProtoWorldStream
var baseline: Array[Dictionary] = []
var baseline_state: int = 0
var baseline_loot: Array = []


func _check(label: String, condition: bool) -> void:
	passed += 1 if condition else 0
	failed += 0 if condition else 1
	print("ROAD_CLEARANCE: %s - %s" % ["PASS" if condition else "FAIL", label])


func _finish() -> void:
	print("ROAD_CLEARANCE RESULTS: %d passed, %d failed" % [passed, failed])
	print("ROAD_CLEARANCE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _polygon(transform: Transform3D, half: Vector2) -> PackedVector2Array:
	var points := PackedVector2Array()
	for corner: Vector2 in [Vector2(-half.x, -half.y), Vector2(half.x, -half.y),
			Vector2(half.x, half.y), Vector2(-half.x, half.y)]:
		var world := transform * Vector3(corner.x, 0.0, corner.y)
		points.append(Vector2(world.x, world.z))
	return points


func _rect(pos: Vector2, half: Vector2, yaw: float) -> PackedVector2Array:
	return _polygon(Transform3D(Basis(Vector3.UP, yaw), Vector3(pos.x, 0.0, pos.y)), half)


func _overlaps(poly: PackedVector2Array, obstacles: Array) -> bool:
	for obstacle: PackedVector2Array in obstacles:
		if not Geometry2D.intersect_polygons(poly, obstacle).is_empty():
			return true
	return false


## Only the direct, large box colliders are filler: authored shells nest their
## walls, ground is much larger, and ruin stashes are less than 2m across.
func _fillers(chunk: Node3D) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for body: Node in chunk.get_children():
		if not body is StaticBody3D or body.is_in_group("placement"):
			continue
		for child: Node in body.get_children():
			if not child is CollisionShape3D or not child.shape is BoxShape3D:
				continue
			var size: Vector3 = child.shape.size
			if size.x < 7.0 or size.x > 14.7 or size.z < 7.0 or size.z > 14.7:
				continue
			var shape := child as CollisionShape3D
			result.append({"pos": Vector2(shape.global_position.x, shape.global_position.z),
				"size": size, "yaw": (body as Node3D).global_rotation.y,
				"poly": _polygon(shape.global_transform, Vector2(size.x, size.z) * 0.5)})
	return result


func _loot(chunk: Node3D) -> Array:
	var result: Array = []
	for child: Node in chunk.get_children():
		if child is ProtoChest:
			result.append([child.position, child.container.slots.duplicate()])
	return result


func _row(id: String, points: PackedVector2Array, lanes: int = 2, divided: bool = false) -> Dictionary:
	return {"id": id, "kind": "street", "pts": points, "lanes": lanes, "divided": divided}


## Widths in these fixtures are hand-derived: 2 * 3.6 + 2 = 9.2m,
## and two (3 * 3.6 + 1.6) carriageways + 2.4 median = 27.2m.
func _road_polygons(rows: Array) -> Array:
	var result: Array = []
	for row: Dictionary in rows:
		var points: PackedVector2Array = row["pts"]
		var width: float = 27.2 if bool(row["divided"]) else 9.2
		for i in range(points.size() - 1):
			var delta := points[i + 1] - points[i]
			result.append(_rect((points[i] + points[i + 1]) * 0.5,
				Vector2(width * 0.5, delta.length() * 0.5 + 3.0), atan2(delta.x, delta.y)))
	return result


func _fixture(label: String, roads: Array, local_rects: Array = [], placements: Array = []) -> void:
	var map := ProtoUSMap.new()
	map.ok = true
	map.roads = roads
	map.placements = placements
	stream.usmap = map
	var key := "road-clearance-fixture"
	ProtoWorldBuilder.extra_road_rects[key] = local_rects.duplicate(true)
	var chunk := Node3D.new()
	add_child(chunk)
	for placement: Dictionary in placements:
		stream._spawn_placement(chunk, placement)
	var obstacles := _road_polygons(roads)
	for rect: Array in local_rects:
		obstacles.append(_rect(Vector2(rect[0], rect[1]), Vector2(rect[2], rect[3]), rect[4]))
	for placement: Dictionary in placements:
		# This fixture deliberately uses the real gas station's 12x9m catalog row.
		obstacles.append(_rect(placement["pos"], Vector2(6.0, 4.5), placement["rot"]))
	var rng := RandomNumberGenerator.new()
	rng.seed = SEED
	stream._stamp_ruined_block(chunk, Vector3.ZERO, rng, key)
	var actual := _fillers(chunk)
	var expected_count: int = 0
	for building: Dictionary in baseline:
		if not _overlaps(building["poly"], obstacles):
			expected_count += 1
	var collisions: int = 0
	var changed: int = 0
	for building: Dictionary in actual:
		if _overlaps(building["poly"], obstacles):
			collisions += 1
		var matched := false
		for original: Dictionary in baseline:
			if building["pos"] == original["pos"] and building["size"] == original["size"] and building["yaw"] == original["yaw"]:
				matched = true
		if not matched:
			changed += 1
	_check("%s: real colliders clear obstacles (%d overlaps)" % [label, collisions], collisions == 0)
	_check("%s: clear candidates retained (%d/%d)" % [label, actual.size(), expected_count], actual.size() == expected_count)
	_check("%s: rejected candidates do not reshuffle geometry or loot" % label,
		changed == 0 and rng.state == baseline_state and _loot(chunk) == baseline_loot)
	if not placements.is_empty():
		var authored: int = 0
		for child: Node in chunk.get_children():
			if child.is_in_group("placement"):
				authored += 1
		_check("named, loot-bearing authored placement survives", authored == placements.size())
	chunk.free()
	ProtoWorldBuilder.extra_road_rects.erase(key)


func _seattle() -> void:
	var map := ProtoUSMap.get_default()
	stream.usmap = map
	var previous_map := ProtoWorldBuilder.usmap
	ProtoWorldBuilder.usmap = map
	var camera := Vector3(-56064.0, 0.0, -17888.0)
	var cx := int(floor(camera.x / ProtoWorldStream.CHUNK))
	var cz := int(floor(camera.z / ProtoWorldStream.CHUNK))
	var chunk := stream._spawn_chunk(cx, cz)
	_check("Seattle camera chunk builds through real streaming path", chunk != null)
	if chunk != null:
		var obstacles: Array = []
		var slabs: int = 0
		# Observe the actual materialized asphalt, not a nearest-road approximation.
		for child: Node in chunk.get_children():
			if child is MeshInstance3D and child.has_meta("road_slab") and child.mesh is BoxMesh:
				var size: Vector3 = child.mesh.size
				obstacles.append(_polygon(child.global_transform, Vector2(size.x, size.z) * 0.5))
				slabs += 1
		var collisions: int = 0
		var buildings := _fillers(chunk)
		for building: Dictionary in buildings:
			if _overlaps(building["poly"], obstacles):
				collisions += 1
		_check("Seattle regression probes real asphalt (%d slabs)" % slabs, slabs > 0)
		_check("Seattle filler leaves instantiated asphalt clear (%d colliders, %d overlaps)" % [buildings.size(), collisions], collisions == 0)
		chunk.free()
	ProtoWorldBuilder.extra_road_rects.erase("%d,%d" % [cx, cz])
	ProtoWorldBuilder.usmap = previous_map


func _ready() -> void:
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		failed += 1
		print("ROAD_CLEARANCE: WATCHDOG")
		_finish())
	stream = ProtoWorldStream.new()
	add_child(stream)
	var chunk := Node3D.new()
	add_child(chunk)
	var rng := RandomNumberGenerator.new()
	rng.seed = SEED
	stream._stamp_ruined_block(chunk, Vector3.ZERO, rng, "road-clearance-baseline")
	baseline = _fillers(chunk)
	baseline_state = rng.state
	baseline_loot = _loot(chunk)
	_check("unobstructed urban block still supplies buildings", baseline.size() >= 4)
	var target: Vector2 = baseline[0]["pos"]
	chunk.free()
	ProtoWorldBuilder.extra_road_rects.erase("road-clearance-baseline")

	var diagonal := Vector2(0.6, 0.8)
	var normal := Vector2(diagonal.y, -diagonal.x)
	var corner_line := target + normal * 5.0 # center clears 4.6m; box corner does not.
	_fixture("diagonal full footprint", [_row("diagonal", PackedVector2Array([
		corner_line - diagonal * 160.0, corner_line + diagonal * 160.0]))])
	_fixture("crossing road, not only nearest", [
		_row("nearest", PackedVector2Array([Vector2(0, -200), Vector2(0, 200)])),
		_row("crossing", PackedVector2Array([Vector2(-200, target.y), Vector2(200, target.y)]))])
	_fixture("second segment of one road", [_row("hairpin", PackedVector2Array([
		Vector2(0, -200), Vector2(0, 200), Vector2(target.x, 200), Vector2(target.x, -200)]))])
	_fixture("divided highway outer lane", [_row("six-lane", PackedVector2Array([
		Vector2(target.x - 17.0, -200), Vector2(target.x - 17.0, 200)]), 6, true)])
	_fixture("rotated local street", [], [[target.x, target.y, 4.0, 90.0, 0.65]])
	_fixture("authored footprint", [], [], [{"id": "named-gas-station", "building": "gas_station_small",
		"pos": target, "rot": 0.65, "label": "KEEP THIS STATION"}])
	# A narrow gap is genuinely legal: a bounding-circle/AABB shortcut must not
	# discard the target beside a diagonal road when its rotated corners are clear.
	var support: float = -INF
	for point: Vector2 in baseline[0]["poly"]:
		support = maxf(support, (point - target).dot(normal))
	var clear_line := target + normal * (support + 4.6 + 0.25)
	_fixture("diagonal near miss retained", [_row("clear", PackedVector2Array([
		clear_line - diagonal * 160.0, clear_line + diagonal * 160.0]))])
	_seattle()
	_finish()
