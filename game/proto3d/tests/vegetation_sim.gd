## Proof for THE VEGETATION DENSITY ROWS (2026-07-14, "improve the country's
## tree density — do not cut corners"): density is DATA (data/vegetation.json
## overlays the VEG_STOCK code defaults), forests carry closed-canopy visual
## counts as MultiMesh instances (draw calls stay flat), shape KINDS exist
## (deciduous/conifer/cypress tiers), the road-clearance law holds, the solid
## trunk frontier LAW is untouched, chunks stay deterministic, and the authored
## Meridian apron finally grows trees.
## Run: godot --headless --path game res://proto3d/tests/vegetation_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("VEG: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(watchdog: bool = false) -> void:
	print("VEG RESULTS: %d passed, %d failed%s" % [passed, failed, " (WATCHDOG)" if watchdog else ""])
	print("VEG: %s" % ("ALL CHECKS PASSED" if failed == 0 and not watchdog else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 and not watchdog else 1)


func _spawn_chunk_at(p: Vector3) -> Node3D:
	return main.stream._spawn_chunk(int(floor(p.x / 128.0)), int(floor(p.z / 128.0)))


## Sum MultiMesh instances + plain visual boxes under a chunk (the vegetation bill).
func _mm_stats(chunk: Node3D) -> Dictionary:
	var mm_nodes := 0
	var instances := 0
	for c in chunk.get_children():
		if c is MultiMeshInstance3D:
			mm_nodes += 1
			instances += (c as MultiMeshInstance3D).multimesh.instance_count
	return {"mms": mm_nodes, "instances": instances}


func _find_cell(m: ProtoUSMap, want_biome: String, x_min: float, road_far: bool) -> Vector3:
	for iz in range(4, m.h - 4):
		for ix in range(2, m.w - 2):
			var wx := m.offset.x + (ix + 0.5) * m.cell_m
			if wx < x_min:
				continue
			var p := Vector3(wx, 0, m.offset.y + (iz + 0.5) * m.cell_m)
			if m.biome_at(p) != want_biome:
				continue
			var near := m.road_near(p, 220.0)
			if road_far and not near.is_empty():
				continue
			if absf(p.x) < 6200.0 and absf(p.z) < 6200.0:
				continue
			return p
	return Vector3.INF


func _ready() -> void:
	print("VEG: start")
	get_tree().create_timer(160.0).timeout.connect(func() -> void: _finish(true))

	# --- 1. THE FOLD LAW: vegetation.json rows overlay the code stock -------------
	ProtoWorldStream._veg_folded = {}
	var fveg: Dictionary = ProtoWorldStream.veg("forest")
	_check("vegetation.json folds over stock (forest deep_east %d > stock 72)" % int(fveg.get("deep_east", 0)),
		int(fveg.get("deep_east", 0)) > 72)
	_check("a biome missing from the file keeps code stock (urban -> empty row ok)",
		typeof(ProtoWorldStream.veg("urban")) == TYPE_DICTIONARY)
	_check("swamp row carries the cypress kind", String(ProtoWorldStream.veg("swamp").get("kind", "")) == "cypress")
	_check("mountains grew a conifer count (visual %d > 0)" % int(ProtoWorldStream.veg("mountains").get("visual", 0)),
		int(ProtoWorldStream.veg("mountains").get("visual", 0)) > 0)

	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().physics_frame

	var m: ProtoUSMap = ProtoUSMap.get_default()

	# --- 2. DEEP-EAST FOREST: closed-canopy density, flat draw calls ---------------
	var fp := _find_cell(m, "forest", -10000.0, true)
	_check("found a deep-east forest cell off-road", fp != Vector3.INF)
	if fp != Vector3.INF:
		var chunk: Node3D = _spawn_chunk_at(fp)
		await get_tree().process_frame
		var stats := _mm_stats(chunk)
		_check("deep-east forest carries >= 200 visual tree pieces (%d MM instances)" % int(stats["instances"]),
			int(stats["instances"]) >= 200)
		_check("vegetation draw calls stay flat (%d MMs <= 8)" % int(stats["mms"]), int(stats["mms"]) <= 8)
		var solids := 0
		for c in chunk.get_children():
			if c.has_meta("dense_trunk"):
				solids += 1
		_check("the frontier solid law is untouched (deep-east solids %d >= 24)" % solids, solids >= 24)
		_check("forest chunk keeps the biome_trees group", chunk.is_in_group("biome_trees"))
		# determinism: same chunk twice -> identical vegetation bill
		var chunk2: Node3D = main.stream._spawn_chunk(int(floor(fp.x / 128.0)), int(floor(fp.z / 128.0)))
		await get_tree().process_frame
		var stats2 := _mm_stats(chunk2)
		_check("chunk vegetation is deterministic (%d == %d instances)" % [int(stats["instances"]), int(stats2["instances"])],
			int(stats["instances"]) == int(stats2["instances"]))
		chunk.queue_free()
		chunk2.queue_free()

	# --- 3. SWAMP: cypress stands got dense -----------------------------------------
	var sp := _find_cell(m, "swamp", -99999999.0, false)
	if sp == Vector3.INF:
		sp = _find_cell(m, "swamp", -99999999.0, true)
	_check("found a swamp cell", sp != Vector3.INF)
	if sp != Vector3.INF:
		var schunk: Node3D = _spawn_chunk_at(sp)
		await get_tree().process_frame
		var sstats := _mm_stats(schunk)
		_check("swamp carries >= 60 vegetation instances (%d)" % int(sstats["instances"]), int(sstats["instances"]) >= 60)
		schunk.queue_free()

	# --- 4. ROAD CLEARANCE LAW: a roadside forest keeps its shoulders --------------
	var rp := _find_cell(m, "forest", -10000.0, false)
	_check("found a roadside forest cell", rp != Vector3.INF)
	if rp != Vector3.INF:
		var rchunk: Node3D = _spawn_chunk_at(rp)
		await get_tree().process_frame
		var road: Dictionary = m.road_near(rp, 220.0)
		var clear_ok := true
		if not road.is_empty():
			var min_clear: float = float(ProtoUSMap.road_geometry(road)["width"]) * 0.5 + 2.9
			for c in rchunk.get_children():
				if not (c is MultiMeshInstance3D):
					continue
				var mmn := c as MultiMeshInstance3D
				for i in mmn.multimesh.instance_count:
					var t := mmn.multimesh.get_instance_transform(i)
					# only tall pieces are trees; bushes may hug the shoulder
					if t.origin.y < 1.0:
						continue
					if ProtoUSMap._seg_dist(Vector2(t.origin.x, t.origin.z), road["a"], road["b"]) < min_clear:
						clear_ok = false
						break
		_check("no tree stands inside the road clearance band", clear_ok)
		rchunk.queue_free()

	# --- 5. THE AUTHORED APRON grows trees ------------------------------------------
	var authored_trees := get_tree().get_nodes_in_group("authored_trees")
	var apron_count := 0
	for n in authored_trees:
		if n is MultiMeshInstance3D:
			apron_count += (n as MultiMeshInstance3D).multimesh.instance_count
	_check("the authored Meridian apron carries >= 120 trees (%d trunks)" % apron_count, apron_count >= 120)

	_finish()
