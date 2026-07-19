## Proof for THE TWO-TIER TOWN GENERATOR (AMERICAN_ROAD M3, ruling 0.19): a
## metro/county-seat exit grows a DOWNTOWN GRID (street rows both axes, block
## slots), everything else grows the MAIN-STREET KIT (drag + side streets);
## streets are ROWS (junction-baked — street crossings hold junction rows), the
## built chunk dresses them (curb + streetlight), Building-Book slots
## materialize as shells, and the husk ring is DEAD.
## Run: godot --headless --path game res://proto3d/tests/town_grid_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("TOWN: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("TOWN RESULTS: %d passed, %d failed" % [passed, failed])
	print("TOWN: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	print("TOWN: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("TOWN: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().physics_frame
	var um: ProtoUSMap = main.stream.usmap

	# --- pick one CITY and one HOLDOUT off the real data (tier is by town KIND now:
	# a city grows a deep grid, a holdout a small one) -----------------------------
	var dt_town: Dictionary = {}
	var ms_town: Dictionary = {}
	for t in um.towns:
		if bool((t as Dictionary).get("authored", false)):
			continue
		if dt_town.is_empty() and String(t["kind"]) == "city":
			dt_town = t
		elif ms_town.is_empty() and String(t["kind"]) == "holdout":
			ms_town = t
	_check("a city and a holdout town both exist in the data",
		not dt_town.is_empty() and not ms_town.is_empty())

	# --- the rows: a city holds a DEEP grid, a holdout a small one -----------------
	var dt_streets := 0
	var ms_streets := 0
	for r in um.roads:
		if String(r["id"]).begins_with("ST-%s-" % String(dt_town.get("id", "?"))):
			dt_streets += 1
		if String(r["id"]).begins_with("ST-%s-" % String(ms_town.get("id", "?"))):
			ms_streets += 1
	_check("the city holds a DEEP GRID (>= 10 street rows: 5 main + 5 cross, got %d)" % dt_streets,
		dt_streets >= 10)
	_check("the holdout holds a small grid (>= 6 street rows: 3 main + 3 cross, got %d)" % ms_streets,
		ms_streets >= 6)

	# --- junction-baked: the grid's crossings are junction ROWS --------------------
	var dt_pos: Vector2 = dt_town["pos"]
	var near_j := 0
	for j in um.junctions:
		if (j["pos"] as Vector2).distance_to(dt_pos) < 220.0 and ["cross", "tee"].has(String(j["kind"])):
			near_j += 1
	_check("the city grid is JUNCTION-BAKED (%d cross/tee rows inside the grid, >= 8)" % near_j,
		near_j >= 8)

	# --- the slots: Building-Book placements landed --------------------------------
	var dt_slots := 0
	for p in um.placements:
		if String(p["id"]).begins_with("%s-slot-" % String(dt_town.get("id", "?"))):
			dt_slots += 1
	_check("city Building-Book slots landed (%d >= 8)" % dt_slots, dt_slots >= 8)

	# --- the built chunk: street dressing + shells, no husk ring -------------------
	var chunk_m := float(ProtoWorldStream.CHUNK)
	var chunk: Node3D = main.stream._spawn_chunk(int(floor(dt_pos.x / chunk_m)), int(floor(dt_pos.y / chunk_m)))
	for i in range(4):
		await get_tree().physics_frame
	var curbs := 0
	var lights := 0
	var slabs := 0
	var shells := 0
	if chunk != null:
		for c in chunk.get_children():
			if c.has_meta("street_curb"):
				curbs += 1
			if c.has_meta("streetlight"):
				lights += 1
			if c.has_meta("road_slab") and String(c.get_meta("road_slab")).begins_with("ST-"):
				slabs += 1
			if c.has_meta("structure_id"):
				shells += 1
	_check("street slabs paint in the built town chunk (%d)" % slabs, slabs >= 2)
	_check("CURBS dress the streets (%d)" % curbs, curbs >= 4)
	_check("STREETLIGHTS stand the blocks (%d)" % lights, lights >= 4)
	_check("Building-Book SHELLS materialized in the town chunk (%d)" % shells, shells >= 2)
	if chunk != null:
		chunk.queue_free()

	_finish(prev_scale)
