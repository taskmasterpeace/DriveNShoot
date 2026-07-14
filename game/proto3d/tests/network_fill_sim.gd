## Proof for THE NETWORK FILL + DIRT DISCOVERY LAYER (AMERICAN_ROAD M3b,
## rulings 0.17/0.19): every road carries a `surface` from the six-class
## hierarchy; the county net links towns off-highway; THE PAYLOAD LAW holds —
## every dirt spur leads_to a REAL placement with a materializable catalog row
## (a dead dirt road is a lie the map tells; this sim rejects it); dirt tracks
## build UNPAINTED with twin ruts; and the surface field prices grip (gravel
## between asphalt and dirt, dirt at the tire's dirt law).
## Run: godot --headless --path game res://proto3d/tests/network_fill_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("NETF: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("NETF RESULTS: %d passed, %d failed" % [passed, failed])
	print("NETF: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	print("NETF: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("NETF: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().physics_frame
	var um: ProtoUSMap = main.stream.usmap
	DrivnData.ensure_structures()

	# --- 1) the six-class hierarchy + surface on EVERY road ----------------------
	var bad_kind := 0
	var bad_surface := 0
	var kinds := ["interstate", "us_route", "state_road", "county", "street", "dirt", "exit", "backroad"]
	var surfaces := ["asphalt", "concrete", "gravel", "dirt"]
	for r in um.roads:
		if not kinds.has(String(r["kind"])):
			bad_kind += 1
		if not surfaces.has(String(r.get("surface", ""))):
			bad_surface += 1
	_check("every road's kind is in the 0.17 hierarchy", bad_kind == 0)
	_check("every road carries a surface (asphalt|concrete|gravel|dirt)", bad_surface == 0)

	# --- 2) the county net links towns off-highway --------------------------------
	var towns_by_id: Dictionary = {}
	for t in um.towns:
		towns_by_id[String(t["id"])] = t
	var cr := 0
	var cr_anchored := true
	for r in um.roads:
		if not String(r["id"]).begins_with("CR-"):
			continue
		cr += 1
		var pts: Array = r["pts"]
		for endp in [pts[0], pts[pts.size() - 1]]:
			var near_town := false
			for t in um.towns:
				if (t["pos"] as Vector2).distance_to(endp) < 300.0:
					near_town = true
			# amended (v4 MAP-FIRST pass): a county link may also TEE INTO the
			# network — a farm-to-market road ending on a highway is lawful
			# (CR-saint-regis-i75 ties the Saint Regis island to I-75). Lawful
			# tee = a baked junction within 60 m listing this road as a leg.
			var tees_in := false
			if not near_town:
				for j in um.junctions:
					var jd: Dictionary = j
					var jp: Vector2 = jd["pos"]
					if jp.distance_to(endp) < 60.0:
						for l in (jd["legs"] as Array):
							var ld: Dictionary = l
							if String(ld["road"]) == String(r["id"]):
								tees_in = true
			if not near_town and not tees_in:
				cr_anchored = false
	_check("the county net links >= 10 town pairs off-highway (%d links)" % cr, cr >= 10)
	_check("every county link ends AT a town or TEES INTO the net (300 m town / 60 m junction leg)", cr_anchored)

	# --- 3) THE PAYLOAD LAW --------------------------------------------------------
	var spurs := 0
	var lawless := 0
	var pl_ids: Dictionary = {}
	for p in um.placements:
		pl_ids[String(p["id"])] = String(p["building"])
	var probe_spur: Dictionary = {}
	for r in um.roads:
		if String(r["kind"]) != "dirt":
			continue
		spurs += 1
		var lead: Dictionary = r.get("leads_to", {})
		var plid := String(lead.get("placement", ""))
		if plid == "" or not pl_ids.has(plid) or not DrivnData.structures.has(String(pl_ids[plid])):
			lawless += 1
			print("NETF: LAWLESS dirt spur %s (leads_to=%s)" % [r["id"], lead])
		elif probe_spur.is_empty():
			probe_spur = r
	_check("THE PAYLOAD LAW: all %d dirt spurs lead to a real, materializable payload (0 lawless)" % spurs,
		spurs >= 40 and lawless == 0)

	# --- 4) the dirt look + the payload materializes -------------------------------
	if not probe_spur.is_empty():
		var pts2: Array = probe_spur["pts"]
		var mid2: Vector2 = ((pts2[0] as Vector2) + (pts2[1] as Vector2)) * 0.5
		var chunk_m := float(ProtoWorldStream.CHUNK)
		var c1: Node3D = main.stream._spawn_chunk(int(floor(mid2.x / chunk_m)), int(floor(mid2.y / chunk_m)))
		for i in range(3):
			await get_tree().physics_frame
		var slab := false
		var painted := false
		var ruts := 0
		if c1 != null:
			for c in c1.get_children():
				if c.has_meta("road_slab") and String(c.get_meta("road_slab")) == String(probe_spur["id"]):
					slab = true
				if c.has_meta("road_center") and String(c.get_meta("road_center")) == String(probe_spur["id"]):
					painted = true
				if c.has_meta("road_rut") and String(c.get_meta("road_rut")) == String(probe_spur["id"]):
					ruts += 1
		_check("the dirt spur BUILDS (slab present)", slab)
		_check("...UNPAINTED (no center line — nobody paints a dirt track)", not painted)
		_check("...with the twin ruts (%d >= 2)" % ruts, ruts >= 2)
		# surface plumbing: standing on the spur reads dirt_road
		_check("surface_at on the spur reads 'dirt_road' (the grip law's input)",
			ProtoWorldBuilder.surface_at(Vector3(mid2.x, 0.2, mid2.y)) == "dirt_road")
		# the payload shell materializes in ITS chunk
		var plid2 := String((probe_spur["leads_to"] as Dictionary)["placement"])
		var ppos: Vector2 = Vector2.ZERO
		for p in um.placements:
			if String(p["id"]) == plid2:
				ppos = p["pos"]
		var c2: Node3D = main.stream._spawn_chunk(int(floor(ppos.x / chunk_m)), int(floor(ppos.y / chunk_m)))
		for i in range(3):
			await get_tree().physics_frame
		var shell_found := false
		for s in get_tree().get_nodes_in_group("structure"):
			if String(s.get_meta("placement_id", "")) == plid2:
				shell_found = true
		_check("the spur's PAYLOAD materializes (the hermit's shack the map never marked)", shell_found)
		if c1 != null:
			c1.queue_free()
		if c2 != null:
			c2.queue_free()

	# --- 4b) ARC 3 GHOST SITES: decayed Americana under the SAME payload law -------
	var ghost_kinds: Array[String] = ["dead_motel", "dead_gas", "drive_in_ruin", "roadside_attraction"]
	var ghosts := 0
	var ghost_kind_ok := true
	var ghost_probe: Dictionary = {}
	var cluster_ok := true
	for r in um.roads:
		if not String(r["id"]).begins_with("GR-"):
			continue
		ghosts += 1
		var gkind := String((r.get("leads_to", {}) as Dictionary).get("kind", ""))
		if gkind not in ghost_kinds:
			ghost_kind_ok = false
		var members := 0
		for p in um.placements:
			if String(p["id"]).begins_with(String(r["id"]) + "-p"):
				members += 1
		if members < 3:
			cluster_ok = false
		if ghost_probe.is_empty():
			ghost_probe = r
	_check("GHOST SITES haunt the county net (%d >= 12)" % ghosts, ghosts >= 12)
	_check("every ghost kind is in the Americana vocabulary", ghost_kind_ok)
	_check("every ghost is a CLUSTER (>= 3 shells), never a lone prop", cluster_ok)
	if not ghost_probe.is_empty():
		var g_anchor_id := String((ghost_probe["leads_to"] as Dictionary)["placement"])
		var g_pos := Vector2.ZERO
		for p in um.placements:
			if String(p["id"]) == g_anchor_id:
				g_pos = p["pos"]
		var chunk_m2 := float(ProtoWorldStream.CHUNK)
		var gc: Node3D = main.stream._spawn_chunk(int(floor(g_pos.x / chunk_m2)), int(floor(g_pos.y / chunk_m2)))
		for i in range(3):
			await get_tree().physics_frame
		var g_shell := false
		for s in get_tree().get_nodes_in_group("structure"):
			if String(s.get_meta("placement_id", "")) == g_anchor_id:
				g_shell = true
		var g_cache := false
		if gc != null:
			for c in gc.get_children():
				if c is ProtoChest and (c as Node3D).position.distance_to(Vector3(g_pos.x, 0, g_pos.y)) < 12.0:
					g_cache = true
		_check("the ghost anchor (%s) MATERIALIZES" % String((ghost_probe["leads_to"] as Dictionary)["kind"]), g_shell)
		_check("...and buries its THEMED CACHE (the scavenge promise)", g_cache)
		if gc != null:
			gc.queue_free()

	# --- 5) the grip law prices the surfaces ---------------------------------------
	# (asserts flipped with MUD_AND_MONSTERS T1 in the same commit — the matrix
	# now owns off-asphalt grip; gravel still sits between dirt and asphalt.)
	var car: ProtoCar3D = ProtoCar3D.create("scavenger", Color(0.4, 0.4, 0.4))
	var dm := float(car.spec["tires"]["dirt_mult"])
	var tire := car.tire_class()
	car.surface_override = "gravel"
	var ggrip := car.surface_grip_mult()
	var want_g := float(ProtoTraction.traction("gravel", "dry", tire)["grip"])
	_check("gravel grip is the MATRIX row (%.2f) and sits between dirt (%.2f) and 1.0" % [want_g, dm],
		is_equal_approx(ggrip, want_g) and ggrip > dm + 0.01 and ggrip < 1.0)
	car.surface_override = "dirt_road"
	var want_d := float(ProtoTraction.traction("dirt", "dry", tire)["grip"])
	_check("a dry dirt track grips at the MATRIX dirt row (%.2f)" % want_d,
		is_equal_approx(car.surface_grip_mult(), want_d))
	car.free()

	_finish(prev_scale)
