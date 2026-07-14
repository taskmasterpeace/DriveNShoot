## Proof for THE 60 OVERPASSES (THE_COUNTRY_PLAN 1B): every separated_pending
## crossing is now a REAL grade separation — deck junctions map-wide, the over
## road humps with honest clearance, the deck-zone law keeps the land at grade,
## and a driven car passes UNDER a marquee interstate overpass without a wall.
## Run: godot --headless --path game res://proto3d/tests/overpass_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D

const OP_X := -7006.0 ## I-40 x I-75 (a marquee blind crossing, surveyed)
const OP_Z := 2796.0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("OVERPASS: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(watchdog: bool = false) -> void:
	print("OVERPASS RESULTS: %d passed, %d failed%s" % [passed, failed, " (WATCHDOG)" if watchdog else ""])
	print("OVERPASS: %s" % ("ALL CHECKS PASSED" if failed == 0 and not watchdog else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 and not watchdog else 1)


func _elev_at_point(road: Dictionary, p: Vector2) -> float:
	var pts: PackedVector2Array = road["pts"]
	var el: PackedFloat32Array = road["elev"]
	var bd := 1e18
	var bh := 0.0
	for i in range(pts.size() - 1):
		var d := ProtoUSMap._seg_dist(p, pts[i], pts[i + 1])
		if d < bd:
			bd = d
			var ab := pts[i + 1] - pts[i]
			var t := clampf((p - pts[i]).dot(ab) / maxf(ab.length_squared(), 0.001), 0.0, 1.0)
			bh = lerpf(el[i], el[i + 1], t)
	return bh


func _ready() -> void:
	print("OVERPASS: start")
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

	# --- 1. THE LEDGER: no crossing left pending, 60 decks stand ---------------------
	var pending := 0
	var decks := 0
	for j in m.junctions:
		match String(j.get("grade", "")):
			"separated_pending":
				pending += 1
			"deck":
				decks += 1
	_check("NO crossing is left pending (%d)" % pending, pending == 0)
	_check("the 60 overpasses stand (%d decks)" % decks, decks >= 55)

	# --- 2. THE MARQUEE SITE: I-40 x I-75 -------------------------------------------
	var site: Dictionary = {}
	for j in m.junctions:
		if String(j.get("grade", "")) == "deck" and (j["pos"] as Vector2).distance_to(Vector2(OP_X, OP_Z)) < 60.0:
			site = j
	_check("I-40 x I-75 is a DECK junction", not site.is_empty())
	if not site.is_empty():
		var over_id := String(site.get("deck_road", ""))
		var over: Dictionary = m.road_by_id(over_id)
		var under_id := ""
		for l in site["legs"]:
			if String(l["road"]) != over_id:
				under_id = String(l["road"])
		var under: Dictionary = m.road_by_id(under_id)
		_check("the deck names its over road (%s over %s)" % [over_id, under_id],
			not over.is_empty() and not under.is_empty())
		if not over.is_empty() and not under.is_empty():
			var jp: Vector2 = site["pos"]
			var over_h := _elev_at_point(over, jp)
			var under_h := _elev_at_point(under, jp)
			_check("clearance is real (%.1f m >= 5.0)" % (over_h - under_h), over_h - under_h >= 5.0)
			# the land holds grade in the deck zone (no hump under the hump)
			var land := ProtoWorldBuilder.ground_y(jp.x, jp.y)
			_check("the LAND stays at grade under the deck (land %.1f vs under road %.1f, within 2.5)" % [land, under_h],
				absf(land - under_h) < 2.5)

			# --- 3. DRIVE UNDER IT (held throttle) ------------------------------------
			var pts_u: PackedVector2Array = under["pts"]
			var bd := 1e18
			var dirv := Vector2.RIGHT
			for i in range(pts_u.size() - 1):
				var d := ProtoUSMap._seg_dist(jp, pts_u[i], pts_u[i + 1])
				if d < bd:
					bd = d
					dirv = (pts_u[i + 1] - pts_u[i]).normalized()
			var start := jp - dirv * 110.0
			var car := ProtoCar3D.create("scavenger", Color(0.35, 0.4, 0.3))
			main.add_child(car)
			car.surface_override = "road"
			car.is_active = true
			car.engine_on = true
			car.can_sleep = false
			car.sleeping = false
			var sh := _elev_at_point(under, start)
			car.global_position = Vector3(start.x, maxf(ProtoWorldBuilder.ground_y(start.x, start.y), sh) + 1.2, start.y)
			car.global_rotation.y = atan2(-dirv.x, -dirv.y)
			var perp := Vector2(-dirv.y, dirv.x)
			var lane_off := ProtoUSMap.lane_offset(under, 0)
			car.global_position += Vector3(perp.x, 0, perp.y) * lane_off
			main.player.global_position = Vector3(start.x + perp.x * 35.0, 3.0, start.y + perp.y * 35.0)
			for _i in 40:
				await get_tree().physics_frame
			car.use_player_input = false
			var t := 0.0
			var fi := 0
			var max_y := -999.0
			while t < 8.0:
				car.input_throttle = 1.0
				car.input_steer = 0.0
				if fi % 20 == 0:
					var pp := car.global_position
					main.player.global_position = Vector3(pp.x + perp.x * 35.0, pp.y + 2.0, pp.z + perp.y * 35.0)
				fi += 1
				max_y = maxf(max_y, car.global_position.y)
				await get_tree().physics_frame
				t += get_physics_process_delta_time()
			var through := (Vector2(car.global_position.x, car.global_position.z) - start).dot(dirv)
			print("OVERPASS-DIAG: drove %.0fm along the under road, max y %.1f, end=(%.0f, %.1f, %.0f)" % [through, max_y,
				car.global_position.x, car.global_position.y, car.global_position.z])
			_check("the car passed UNDER the overpass (%.0f m along, past the node at 110)" % through, through > 150.0)
			_check("...at grade, never lifted onto the hump (max y %.1f < under+3.5 = %.1f)" % [max_y, under_h + 3.5],
				max_y < under_h + 3.5)
			car.queue_free()

	_finish()
