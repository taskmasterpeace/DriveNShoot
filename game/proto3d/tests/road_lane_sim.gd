## Proof for the ROAD OVERHAUL (docs/design/ROAD_TRAFFIC_OVERHAUL.md §3.1-3.3):
## lane counts + median division are ROW DATA (6/4/2, divided), ONE geometry law
## (ProtoUSMap.road_geometry) shared by renderer/traffic/grip, the streamer
## renders the row (twin carriageways + a PHYSICAL median barrier on divided
## roads; double-yellow on two-lanes), ALL roads near a chunk materialize (an
## exit ramp no longer displaces its own interstate), and the grip footprint is
## the row's REAL width. Chunk probes call the streamer's own _spawn_chunk —
## the real builder, real data, real world coordinates off usmap.json.
## Run: godot --headless --path game res://proto3d/tests/road_lane_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("ROADLANE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Children of a chunk carrying a given meta tag (the streamer tags its road pieces).
func _tagged(chunk: Node3D, tag: String, road_id: String = "") -> Array:
	var out: Array = []
	if chunk == null:
		return out
	for c in chunk.get_children():
		if c.has_meta(tag) and (road_id == "" or String(c.get_meta(tag)) == road_id):
			out.append(c)
	return out


func _ready() -> void:
	print("ROADLANE: start")
	get_tree().create_timer(100.0).timeout.connect(func() -> void:
		print("ROADLANE: WATCHDOG")
		print("ROADLANE: FAILURES PRESENT")
		get_tree().quit(1))

	# === 1. THE ROWS PARSE, WITH DEFAULTS (fixture — never guesses at real data) ==
	var fixture: Dictionary = {
		"name": "fixture", "compression": 60, "cell_m": 500.0, "world_offset": [0, 0],
		"w": 2, "h": 1, "legend": {"p": "plains"}, "state_legend": {"V": "VIRGINIA"},
		"grid": ["pp"], "states_grid": ["VV"],
		"roads": [
			{"id": "R-bare", "kind": "interstate", "pts": [[0, 0], [1000, 0]]},
			{"id": "R-six", "kind": "interstate", "pts": [[0, 0], [1000, 0]], "lanes": 6},
			{"id": "R-ramp", "kind": "exit", "pts": [[0, 0], [200, 0]]},
			{"id": "R-split", "kind": "interstate", "pts": [[0, 0], [1000, 0]], "lanes": 4, "divided": true},
		],
	}
	var f := FileAccess.open("user://test_roadlane_map.json", FileAccess.WRITE)
	f.store_string(JSON.stringify(fixture))
	f.close()
	var m := ProtoUSMap.new()
	m.load_file("user://test_roadlane_map.json")
	DirAccess.remove_absolute("user://test_roadlane_map.json")
	var bare: Dictionary = m.roads[0]
	var six: Dictionary = m.roads[1]
	var ramp: Dictionary = m.roads[2]
	var split: Dictionary = m.roads[3]
	_check("a bare interstate row defaults to 4 lanes, undivided",
		int(bare.get("lanes", -1)) == 4 and bool(bare.get("divided", true)) == false)
	_check("6 lanes defaults divided (a six-lane without a median is a death trap)",
		int(six.get("lanes", -1)) == 6 and bool(six.get("divided", false)) == true)
	_check("an exit ramp defaults to 2 lanes", int(ramp.get("lanes", -1)) == 2)
	_check("divided is an explicit row override too", bool(split.get("divided", false)) == true)

	# === 2. ONE GEOMETRY LAW (the §4 worked numbers, exactly) =====================
	var g6: Dictionary = ProtoUSMap.road_geometry(six)
	var g4d: Dictionary = ProtoUSMap.road_geometry(split)
	var g4: Dictionary = ProtoUSMap.road_geometry(bare)
	var g2: Dictionary = ProtoUSMap.road_geometry(ramp)
	_check("6-lane divided is 27.2m wide (got %.1f)" % float(g6["width"]), is_equal_approx(float(g6["width"]), 27.2))
	_check("4-lane divided is 20.0m", is_equal_approx(float(g4d["width"]), 20.0))
	_check("4-lane undivided is 16.4m", is_equal_approx(float(g4["width"]), 16.4))
	_check("2-lane is 9.2m", is_equal_approx(float(g2["width"]), 9.2))
	_check("6-div carriageway is 12.4m with a 2.0m center gap",
		is_equal_approx(float(g6["carriage_w"]), 12.4) and is_equal_approx(float(g6["center_gap"]), 2.0))
	_check("lane_offset: 6-div lane 1 sits 7.4m out", is_equal_approx(ProtoUSMap.lane_offset(six, 1), 7.4))
	_check("lane_offset: 4-undiv lane 0 sits 1.8m out", is_equal_approx(ProtoUSMap.lane_offset(bare, 0), 1.8))

	# === 3. THE REAL MAP CARRIES THE SPREAD (6/4/2, some divided, some not) =======
	var real: ProtoUSMap = ProtoUSMap.get_default()
	var by_id: Dictionary = {}
	for r in real.roads:
		by_id[String(r["id"])] = r
	_check("I-95 (THE CRIMSON MILE) is a 6-lane divided interstate",
		by_id.has("I-95") and int(by_id["I-95"]["lanes"]) == 6 and bool(by_id["I-95"]["divided"]))
	_check("I-35 is a 2-lane country interstate",
		by_id.has("I-35") and int(by_id["I-35"]["lanes"]) == 2 and not bool(by_id["I-35"]["divided"]))
	_check("a 4-lane UNDIVIDED highway exists too (I-5)",
		by_id.has("I-5") and int(by_id["I-5"]["lanes"]) == 4 and not bool(by_id["I-5"]["divided"]))
	var lane_kinds: Dictionary = {}
	for r2 in real.roads:
		if String(r2["kind"]) == "interstate":
			lane_kinds[int(r2["lanes"])] = true
	_check("all three widths exist on the real map (6/4/2)",
		lane_kinds.has(6) and lane_kinds.has(4) and lane_kinds.has(2))

	# === 4. roads_near returns EVERY road in range (plural — the junction fix) ====
	var junction := Vector3(1216.0, 0.0, 320.0) # chunk center where I-95 meets its Meridian ramp
	var near: Array = real.roads_near(junction, 220.0)
	var ids: Array = []
	for n in near:
		ids.append(String(n["id"]))
	_check("the Meridian junction sees BOTH the interstate and its ramp (%s)" % [ids],
		ids.has("I-95") and ids.has("EXIT-meridian"))

	# === Boot the real game for the chunk probes ==================================
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# === 5. A 6-LANE DIVIDED CHUNK: two carriageways + a physical median ==========
	# Probe point: mid-segment of I-95 [2250,-2500]->[1500,-250], far from AUTHORED.
	var c6: Node3D = main.stream._spawn_chunk(14, -11) # center (1856, -1344), ~9m off I-95's centerline
	var slabs6: Array = _tagged(c6, "road_slab", "I-95")
	_check("a divided highway lays TWO carriageway slabs (got %d)" % slabs6.size(), slabs6.size() == 2)
	_check("...and raises a PHYSICAL median barrier", _tagged(c6, "road_barrier", "I-95").size() >= 1)
	if slabs6.size() == 2:
		var w6: float = (slabs6[0].get_child(0).mesh as BoxMesh).size.x if slabs6[0].get_child_count() > 0 and slabs6[0].get_child(0) is MeshInstance3D else ((slabs6[0] as MeshInstance3D).mesh as BoxMesh).size.x
		_check("each carriageway slab is the row's carriage width 12.4m (got %.1f)" % w6, is_equal_approx(w6, 12.4))
	# Grip: the OUTER lane center of a 27.2m road is asphalt (the old 13m slab said dirt).
	var seg_a := Vector2(2250, -2500)
	var seg_b := Vector2(1500, -250)
	var seg_dir := (seg_b - seg_a).normalized()
	var perp := Vector2(seg_dir.y, -seg_dir.x)
	var mid_pt := seg_a + (seg_b - seg_a) * 0.515 # ~the chunk's stretch of road
	var outer := mid_pt + perp * 11.0  # lane 2's center on a 6-div: 2.0 + 2.5*3.6 = 11.0
	var beyond := mid_pt + perp * 16.0 # past the 13.6 half-width + margin
	_check("grip reaches the OUTER lane (surface 'road' 11m out)",
		ProtoWorldBuilder.surface_at(Vector3(outer.x, 0.2, outer.y)) == "road")
	_check("grip ENDS at the shoulder (surface 'dirt' 16m out)",
		ProtoWorldBuilder.surface_at(Vector3(beyond.x, 0.2, beyond.y)) == "dirt")

	# === 6. A 2-LANE CHUNK: one slab, double-yellow, honest width ==================
	var c2: Node3D = main.stream._spawn_chunk(-155, -65) # center (-19776, -8256), ~26m off I-35
	var slabs2: Array = _tagged(c2, "road_slab", "I-35")
	# A BEND VERTEX INSIDE THE CHUNK IS TWO SEGMENTS. Counting MESHES encoded the very
	# bug the per-segment fix removed: a chunk holding a bend drew ONE of its segments and
	# silently dropped the other (459 segments were never drawn map-wide, and main's I-35
	# bends at (-19750,-8250) — inside this chunk). What makes a road UNDIVIDED is one
	# carriageway at the honest width with no median, not the mesh count.
	_check("a 2-lane lays a carriageway per segment (got %d, >= 1)" % slabs2.size(),
		slabs2.size() >= 1)
	var w2_bad := 0
	for sl in slabs2:
		var sn := sl as Node3D
		var mi: MeshInstance3D = sn as MeshInstance3D
		if sn.get_child_count() > 0 and sn.get_child(0) is MeshInstance3D:
			mi = sn.get_child(0) as MeshInstance3D
		if mi == null or not (mi.mesh is BoxMesh):
			w2_bad += 1
		elif not is_equal_approx((mi.mesh as BoxMesh).size.x, 9.2):
			w2_bad += 1
	_check("...each at the UNDIVIDED width 9.2m (2*3.6 + 2.0 shoulders), never a twin carriageway",
		w2_bad == 0)
	_check("...with a YELLOW center line and NO median barrier",
		_tagged(c2, "road_center", "I-35").size() >= 1 and _tagged(c2, "road_barrier", "I-35").is_empty())

	# === 7. THE JUNCTION CHUNK: both roads materialize + register grip ============
	var cj: Node3D = main.stream._spawn_chunk(9, 2)
	var jslabs_hwy: Array = _tagged(cj, "road_slab", "I-95")
	var jslabs_ramp: Array = _tagged(cj, "road_slab", "EXIT-meridian")
	_check("the junction chunk materializes the INTERSTATE (%d slabs)" % jslabs_hwy.size(), jslabs_hwy.size() >= 1)
	_check("...AND the exit ramp beside it (%d slabs — the old code picked one road only)" % jslabs_ramp.size(),
		jslabs_ramp.size() >= 1)
	var jrects: Array = ProtoWorldBuilder.extra_road_rects.get("9,2", [])
	_check("both roads registered grip rects (%d >= 2)" % jrects.size(), jrects.size() >= 2)

	print("ROADLANE RESULTS: %d passed, %d failed" % [passed, failed])
	print("ROADLANE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
