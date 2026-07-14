## Proof for ARC 3 — DISTRICTS FEED THE ENGINE (THE_COUNTRY_PLAN): painted
## district polygons fold as typed rows, district_at() joins the query family,
## the ground TINTS per district kind (you feel the block change), and the v2
## generator fills a district's EMPTY ground from its own pool — additively,
## never touching a hand placement (the Meridian unification seam).
## Run: godot --headless --path game res://proto3d/tests/district_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DISTRICT: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(watchdog: bool = false) -> void:
	print("DISTRICT RESULTS: %d passed, %d failed%s" % [passed, failed, " (WATCHDOG)" if watchdog else ""])
	print("DISTRICT: %s" % ("ALL CHECKS PASSED" if failed == 0 and not watchdog else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 and not watchdog else 1)


func _poly_center(poly: PackedVector2Array) -> Vector2:
	var c := Vector2.ZERO
	for p in poly:
		c += p
	return c / float(poly.size())


func _ready() -> void:
	print("DISTRICT: start")
	get_tree().create_timer(120.0).timeout.connect(func() -> void: _finish(true))

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
	DrivnData.ensure_structures()

	# --- 1. THE FOLD -------------------------------------------------------------
	_check("districts fold as rows (%d >= 3)" % m.districts.size(), m.districts.size() >= 3)
	var kinds_ok := true
	var polys_ok := true
	for d in m.districts:
		if String(d.get("kind", "")) == "":
			kinds_ok = false
		if (d["poly"] as PackedVector2Array).size() < 3:
			polys_ok = false
	_check("every district carries a kind", kinds_ok)
	_check("every district carries a real polygon", polys_ok)

	# --- 2. district_at joins the query family ------------------------------------
	var dt: Dictionary = {}
	for d in m.districts:
		if String(d["id"]) == "meridian_downtown":
			dt = d
	_check("meridian_downtown row exists", not dt.is_empty())
	if not dt.is_empty():
		var c := _poly_center(dt["poly"])
		_check("district_at HITS inside the poly (%s)" % String(m.district_at(Vector3(c.x, 0, c.y)).get("id", "?")),
			String(m.district_at(Vector3(c.x, 0, c.y)).get("id", "")) == "meridian_downtown")
	_check("district_at MISSES the open wasteland",
		m.district_at(Vector3(-30000, 0, -10000)).is_empty())

	# --- 3. THE GROUND TINT: you feel the block change -----------------------------
	# Stream the fairgrounds chunk (a generated-slot district) and find its quad.
	var fair: Dictionary = {}
	for d in m.districts:
		if String(d["id"]) == "meridian_fairgrounds":
			fair = d
	_check("meridian_fairgrounds row exists", not fair.is_empty())
	if not fair.is_empty():
		var fc := _poly_center(fair["poly"])
		main.player.global_position = Vector3(fc.x, 2.0, fc.y)
		for _i in 40:
			main.stream.update_stream(main.player.global_position, main)
			await get_tree().physics_frame
		# authored land tints at BOOT (stream children); streamed chunks tint
		# per-chunk (grandchildren) — one meta, either owner satisfies the law.
		var tinted := false
		var fair_tinted := false
		for c2 in main.stream.get_children():
			if (c2 as Node).has_meta("district_tint"):
				tinted = true
				if String((c2 as Node).get_meta("district_tint")) == "meridian_fairgrounds":
					fair_tinted = true
			for c3 in (c2 as Node).get_children():
				if (c3 as Node).has_meta("district_tint"):
					tinted = true
		_check("district ground TINTS (quads laid)", tinted)
		_check("...including the fairgrounds' own", fair_tinted)

	# --- 4. THE UNIFICATION SEAM: generated slots fill EMPTY district ground -------
	var dslots: Array = []
	for p in m.placements:
		if String(p["id"]).contains("-dslot-"):
			dslots.append(p)
	_check("the generator filled district ground (%d slots >= 4)" % dslots.size(), dslots.size() >= 4)
	var pools: Dictionary = {
		"downtown": ["market_general", "bar_roadhouse", "pawn_gun_shop", "diner_roadside", "library_small"],
		"industrial": ["warehouse", "factory_shell", "junkyard", "auto_shop", "substation_power"],
		"commercial": ["market_stall", "diner_roadside", "bar_roadhouse"],
	}
	var pool_ok := true
	var inside_ok := true
	var clear_ok := true
	for p in dslots:
		var did := String(p["id"]).split("-dslot-")[0]
		var drow: Dictionary = {}
		for d in m.districts:
			if String(d["id"]) == did:
				drow = d
		if drow.is_empty():
			inside_ok = false
			continue
		var pos: Vector2 = p["pos"]
		if not Geometry2D.is_point_in_polygon(pos, drow["poly"]):
			inside_ok = false
		if String(p["building"]) not in (pools.get(String(drow["kind"]), []) as Array):
			pool_ok = false
		# never crowding a HAND placement (footprints + air)
		for q in m.placements:
			if String(q["id"]).contains("-dslot-") or String(q["id"]).begins_with("GR-"):
				continue
			var my_row: DrivnStructure = DrivnData.structures.get(String(p["building"]))
			var their_row: DrivnStructure = DrivnData.structures.get(String(q["building"]))
			if my_row == null or their_row == null:
				continue
			var need := maxf(my_row.footprint_m.x, my_row.footprint_m.y) * 0.5 \
				+ maxf(their_row.footprint_m.x, their_row.footprint_m.y) * 0.5 + 2.0
			if pos.distance_to(q["pos"]) < need:
				clear_ok = false
	_check("every slot sits INSIDE its district polygon", inside_ok)
	_check("every slot draws from its district's OWN pool", pool_ok)
	_check("no slot crowds a hand placement (the Meridian guard)", clear_ok)

	_finish()
