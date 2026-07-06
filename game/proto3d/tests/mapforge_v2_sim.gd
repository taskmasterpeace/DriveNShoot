## Proof for MASTER_PLAN Goal 2 — MAPFORGE v2. The map now carries an authored
## placement layer + an exit-ramp network; the game reads both. THE PROOF CASE:
## the starting town (Meridian) connects to an interstate through an off-ramp.
## Run: godot --headless --path game res://proto3d/tests/mapforge_v2_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("MF2: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("MF2: start")
	var usmap := ProtoUSMap.new()
	usmap.load_file(ProtoUSMap.PATH)
	_check("usmap loads", usmap.ok)

	# --- THE PROOF CASE: the starting town connects to the interstate ---------
	var meridian := Vector3(110, 0, -325)
	var near := usmap.road_near(meridian, 5000.0)
	_check("Meridian reaches a road within 50 m (was 1252 m to I-95)",
		not near.is_empty() and near["dist"] < 50.0)
	var has_exit := false
	for r in usmap.roads:
		if r["id"] == "EXIT-meridian" and r["kind"] == "exit":
			has_exit = true
	_check("the connection is an EXIT ramp (kind:'exit')", has_exit)

	# --- The authored-placement layer loaded ---------------------------------
	_check("placements loaded from the map (%d, want >=1)" % usmap.placements.size(),
		usmap.placements.size() >= 1)
	var box := Rect2(80, -360, 80, 80) # a rect around Meridian
	_check("placements_in() finds the Meridian cluster", usmap.placements_in(box).size() >= 1)

	# --- The streamer SPAWNS a placement at its exact coords -----------------
	# Inject one OUTSIDE the authored zone (streaming skips authored chunks) and
	# stream the chunk that contains it.
	var stream := ProtoWorldStream.new()
	add_child(stream)
	stream.usmap = usmap
	stream.setup([], self)
	var far_pos := Vector2(9000.0, 9000.0) # deep in the procedural country
	usmap.placements.append({"id": "test-gas", "building": "gas_station", "pos": far_pos, "rot": 0.0})
	var cx := int(floor(far_pos.x / ProtoWorldStream.CHUNK))
	var cz := int(floor(far_pos.y / ProtoWorldStream.CHUNK))
	var chunk: Node3D = stream._spawn_chunk(cx, cz)
	await get_tree().physics_frame
	var spawned := 0
	var at_coords := false
	for n in get_tree().get_nodes_in_group("placement"):
		spawned += 1
		if (n as Node3D).global_position.distance_to(Vector3(far_pos.x, 0, far_pos.y)) < 1.0:
			at_coords = true
	_check("a pinned structure SPAWNED from the placement layer (%d)" % spawned, spawned >= 1)
	_check("it stands at its EXACT authored coordinates", at_coords)

	print("MF2 RESULTS: %d passed, %d failed" % [passed, failed])
	print("MF2: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
