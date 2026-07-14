## Proof for ARC 2 — THE READABLE ROAD (THE_COUNTRY_PLAN): the country tells
## you where you are without a GPS. A generated town RAISES its baked landmark
## silhouette; interstate billboards advertise the REAL next exit's services at
## its REAL distance in the mileposts' own game-miles; and biome seams BLEND —
## an ecotone edge chunk carries visibly thinner vegetation than the interior.
## Run: godot --headless --path game res://proto3d/tests/readable_road_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D

const SEATTLE := Vector2(-56500.0, -18000.0) ## a generated water_tower town (surveyed)


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("READROAD: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(watchdog: bool = false) -> void:
	print("READROAD RESULTS: %d passed, %d failed%s" % [passed, failed, " (WATCHDOG)" if watchdog else ""])
	print("READROAD: %s" % ("ALL CHECKS PASSED" if failed == 0 and not watchdog else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 and not watchdog else 1)


## Teleport the ONE streaming center (the player — photobooth law) and let the
## world materialize around it.
func _go(pos: Vector3, frames: int = 45) -> void:
	main.player.global_position = pos + Vector3(0, 2.0, 0)
	for _i in frames:
		main.stream.update_stream(main.player.global_position, main)
		await get_tree().physics_frame


func _chunk_at(x: float, z: float) -> Node3D:
	return main.stream.loaded.get("%d,%d" % [int(floor(x / 128.0)), int(floor(z / 128.0))])


## Walk a road's polyline from its vertex nearest `anchor` (THE DENSIFY LAW —
## survey by coordinates, never index), teleporting every 1200m, collecting
## every road_billboard the stream raises along the way.
func _collect_boards(road_row: Dictionary, anchor: Vector2, hops: int) -> Array:
	var out: Array = []
	if road_row.is_empty():
		return out
	var pts: PackedVector2Array = road_row["pts"]
	var start_i := 0
	var bd := 1e18
	for i in range(pts.size() - 1):
		var d := pts[i].distance_to(anchor)
		if d < bd:
			bd = d
			start_i = i
	var seen: Dictionary = {}
	for k in hops:
		var walk := 1200.0 * float(k)
		var spot := pts[pts.size() - 1]
		var acc := 0.0
		for i in range(start_i, pts.size() - 1):
			var l := pts[i].distance_to(pts[i + 1])
			if acc + l >= walk:
				spot = pts[i] + (pts[i + 1] - pts[i]) * ((walk - acc) / maxf(l, 0.001))
				break
			acc += l
		await _go(Vector3(spot.x, 0, spot.y), 25)
		for ck in main.stream.loaded:
			var chunk: Node3D = main.stream.loaded[ck]
			for c in chunk.get_children():
				if (c as Node).has_meta("road_billboard") and not seen.has(c.get_instance_id()) \
						and String(c.get_meta("road_billboard")) == String(road_row.get("id", "")):
					seen[c.get_instance_id()] = true
					for sub in (c as Node3D).get_children():
						if sub is Label3D:
							out.append({"pos": Vector2((c as Node3D).global_position.x, (c as Node3D).global_position.z),
								"rid": String(c.get_meta("road_billboard")), "text": (sub as Label3D).text})
	return out


## Sum every MultiMesh instance in a chunk — the vegetation read (trunks +
## canopy tiers all scale with the veg count, so the total IS the density).
func _veg_instances(chunk: Node3D) -> int:
	var n := 0
	if chunk == null:
		return 0
	for c in chunk.get_children():
		if c is MultiMeshInstance3D and (c as MultiMeshInstance3D).multimesh != null:
			n += (c as MultiMeshInstance3D).multimesh.instance_count
	return n


func _ready() -> void:
	print("READROAD: start")
	get_tree().create_timer(150.0).timeout.connect(func() -> void: _finish(true))

	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().physics_frame
	if "menu_open" in main and main.menu_open:
		main.menu_open = false
	if main.get("mode") == 0 and main.get("active_car") != null:
		main._exit_car()
		await get_tree().physics_frame
	var m: ProtoUSMap = main.stream.usmap

	# --- 1. TOWN IDENTITY MATERIALIZES: Seattle raises its rusted water tower ----
	var town: Dictionary = m.town_near(Vector3(SEATTLE.x, 0, SEATTLE.y), 200.0)
	_check("the surveyed town exists (%s)" % String(town.get("name", "?")), not town.is_empty())
	if not town.is_empty():
		_check("...and carries baked identity rows (%s / %s)" % [town.get("landmark_kind", ""), town.get("landmark", "")],
			String(town.get("landmark_kind", "")) != "" and String(town.get("landmark", "")).begins_with("THE "))
		var tp: Vector2 = town["pos"]
		await _go(Vector3(tp.x, 0, tp.y))
		var tc := _chunk_at(tp.x, tp.y)
		var lm_node: Node3D = null
		if tc != null:
			for c in tc.get_children():
				if (c as Node).has_meta("town_landmark"):
					lm_node = c
		_check("the town chunk RAISES the landmark structure", lm_node != null)
		if lm_node != null:
			_check("...of the baked kind (%s)" % String(lm_node.get_meta("town_landmark")),
				String(lm_node.get_meta("town_landmark")) == String(town.get("landmark_kind", "")))
			var top := 0.0
			for part in lm_node.get_children():
				if part is Node3D:
					top = maxf(top, (part as Node3D).position.y)
			_check("...tall enough to navigate by (%.1f m >= 12)" % top, top >= 12.0)

	# --- 2. BILLBOARDS NAME THE REAL NEXT EXIT ------------------------------------
	# 2a. THE RISK LAW: I-95 is the country's danger-3 corridor — every board on
	# it keeps the wasteland warning, never an advert.
	var i95_boards := await _collect_boards(m.road_by_id("I-95"), Vector2(1500, -250), 4)
	var wasteland_ok := i95_boards.size() >= 1
	for b in i95_boards:
		if not String(b["text"]).begins_with("KEEP DRIVING"):
			wasteland_ok = false
	_check("the danger corridor keeps its WARNING boards (%d on I-95, all KEEP DRIVING)" % i95_boards.size(),
		wasteland_ok)

	# 2b. THE SERVICE LAW on calm I-40: boards advertise the real next exit.
	var boards := await _collect_boards(m.road_by_id("I-40"), Vector2(-7000.0, 2796.88), 6)
	_check("billboards stand the calm corridor (%d found on I-40)" % boards.size(), boards.size() >= 1)
	for b in boards:
		print("READROAD-DIAG board on %s at %s: %s" % [b["rid"], b["pos"], String(b["text"]).replace(char(10), " / ")])
	var rx := RegEx.new()
	rx.compile("^EXIT (\\d+) — (\\d+) MI$")
	var parsed := 0
	var named_real := 0
	var distance_honest := 0
	var words_legal := 0
	for b in boards:
		var lines: PackedStringArray = String(b["text"]).split("\n")
		var mt := rx.search(lines[0])
		if mt == null:
			continue # the wasteland variant ("KEEP DRIVING") is legal — skip
		parsed += 1
		var exit_no := int(mt.get_string(1))
		var mi := int(mt.get_string(2))
		var road_row: Dictionary = m.road_by_id(String(b["rid"]))
		var board_arc := m.arc_from_origin(road_row, b["pos"])
		# the billboard's exit must be a REAL exit row on ITS road...
		var found: Dictionary = {}
		for ea in m.exit_arcs(String(b["rid"])):
			if int(((ea as Dictionary)["row"] as Dictionary).get("exit_number", -1)) == exit_no:
				found = ea
		if not found.is_empty():
			named_real += 1
			# ...at its REAL distance in milepost miles (±1 for rounding + board offset)
			var true_mi := absf(float(found["arc"]) - board_arc) / ProtoUSMap.EXIT_MILE_M
			if absf(float(mi) - true_mi) <= 1.0:
				distance_honest += 1
			# ...advertising only that exit's own services, in the sign vocabulary
			var tags: Array = (found["row"] as Dictionary).get("service_tags", [])
			var legal := true
			if lines.size() > 1 and lines[1] != "SERVICES":
				for w in lines[1].split(" — "):
					var w_ok := false
					for tg in tags:
						if ProtoWorldStream.SERVICE_WORDS.get(String(tg), "") == String(w):
							w_ok = true
					if not w_ok:
						legal = false
			if legal:
				words_legal += 1
	_check("boards parse the ARC 2 format (%d of %d)" % [parsed, boards.size()], parsed >= 1)
	_check("every parsed board names a REAL exit on its road (%d/%d)" % [named_real, parsed],
		parsed > 0 and named_real == parsed)
	_check("every distance is HONEST milepost miles (%d/%d)" % [distance_honest, parsed],
		parsed > 0 and distance_honest == parsed)
	_check("every service word is the exit's own (%d/%d)" % [words_legal, parsed],
		parsed > 0 and words_legal == parsed)

	# --- 3. THE ECOTONE: a forest edge chunk is thinner than the interior --------
	# Scan for two DEEP east-forest chunk centers (no road, no town): one whose
	# 4 chunk-neighbors are all forest, one bordering a different biome.
	var chunk_m := ProtoWorldStream.CHUNK
	var interior := Vector2.ZERO
	var edge := Vector2.ZERO
	for cy in range(-160, 160, 4):
		for cx in range(-160, 160, 4):
			if interior != Vector2.ZERO and edge != Vector2.ZERO:
				break
			var p := Vector2((float(cx) + 0.5) * chunk_m, (float(cy) + 0.5) * chunk_m)
			if p.x < -10000.0: # stay in the DEEP-EAST forest band (one density law)
				continue
			if m.biome_at(Vector3(p.x, 0, p.y)) != "forest":
				continue
			if not m.road_near(Vector3(p.x, 0, p.y), 250.0).is_empty():
				continue
			if not m.town_near(Vector3(p.x, 0, p.y), 400.0).is_empty():
				continue
			var same_n := 0
			for d4 in [Vector2(chunk_m, 0), Vector2(-chunk_m, 0), Vector2(0, chunk_m), Vector2(0, -chunk_m)]:
				if m.biome_at(Vector3(p.x + (d4 as Vector2).x, 0, p.y + (d4 as Vector2).y)) == "forest":
					same_n += 1
			if same_n == 4 and interior == Vector2.ZERO:
				interior = p
			elif same_n <= 2 and edge == Vector2.ZERO:
				edge = p
	_check("found an interior and an edge forest chunk (%s / %s)" % [interior, edge],
		interior != Vector2.ZERO and edge != Vector2.ZERO)
	if interior != Vector2.ZERO and edge != Vector2.ZERO:
		await _go(Vector3(interior.x, 0, interior.y), 30)
		var n_int := _veg_instances(_chunk_at(interior.x, interior.y))
		await _go(Vector3(edge.x, 0, edge.y), 30)
		var n_edge := _veg_instances(_chunk_at(edge.x, edge.y))
		_check("the interior stands dense (%d instances > 0)" % n_int, n_int > 0)
		_check("the ECOTONE thins the seam (edge %d < interior %d)" % [n_edge, n_int], n_edge < n_int)
		_check("...meaningfully (edge <= 85%% of interior)", float(n_edge) <= float(n_int) * 0.85)

	_finish()
