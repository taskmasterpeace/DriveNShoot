## Proof for PAINTED RELIEF + CLIMBING ROADS (THE_COUNTRY_PLAN 1A): the relief
## grid folds and reads bilinearly, FLORIDA and the authored MERIDIAN slab stay
## byte-flat, painted mountains carry real macro height, every baked road obeys
## the 6% grade cap, THE ROAD MEETS THE LAND (terrain at a climbing road equals
## the road's own height), and a REAL DRIVEN CAR climbs a Colorado interstate on
## held keys — the country is vertical now.
## Run: godot --headless --path game res://proto3d/tests/relief_paint_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D
var _prev_time_scale := 1.0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RELIEF: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(watchdog: bool = false) -> void:
	Engine.time_scale = _prev_time_scale
	print("RELIEF RESULTS: %d passed, %d failed%s" % [passed, failed, " (WATCHDOG)" if watchdog else ""])
	print("RELIEF: %s" % ("ALL CHECKS PASSED" if failed == 0 and not watchdog else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 and not watchdog else 1)


func _ready() -> void:
	print("RELIEF: start")
	_prev_time_scale = Engine.time_scale
	get_tree().create_timer(150.0).timeout.connect(func() -> void: _finish(true))

	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().physics_frame
	# clear the BOOT state: the menu swallows updates and the boot car owns the
	# streaming center (body_pos = active_car in DRIVE) — the photobooth law.
	if "menu_open" in main and main.menu_open:
		main.menu_open = false
	if main.get("mode") == 0 and main.get("active_car") != null:
		main._exit_car()
		await get_tree().physics_frame
	var m: ProtoUSMap = main.stream.usmap
	_check("the map booted with a painted relief grid (%d rows)" % m.relief_grid.size(),
		m.ok and m.relief_grid.size() == m.h)

	# --- 1. THE FOLD + BILINEAR READ ------------------------------------------------
	var deep_mtn := Vector3(-53750, 0, -19250) # the surveyed deep-mountain cell
	_check("painted mountains read high (relief01 %.2f >= 0.5 at the ridge)" % m.relief01(deep_mtn.x, deep_mtn.z),
		m.relief01(deep_mtn.x, deep_mtn.z) >= 0.5)
	var fla := Vector3(-2500, 0, 12000) # painted-flat Florida swamp
	_check("Florida reads flat (relief01 == 0)", is_zero_approx(maxf(m.relief01(fla.x, fla.z), 0.0)))
	# bilinear: midway between two cells never exceeds the larger neighbor
	var a01 := m.relief01(deep_mtn.x, deep_mtn.z)
	var b01 := m.relief01(deep_mtn.x + 500.0, deep_mtn.z)
	var mid01 := m.relief01(deep_mtn.x + 250.0, deep_mtn.z)
	_check("bilinear midpoint sits between its neighbors (%.2f in [%.2f..%.2f])" % [mid01, minf(a01, b01), maxf(a01, b01)],
		mid01 >= minf(a01, b01) - 0.001 and mid01 <= maxf(a01, b01) + 0.001)

	# --- 2. BYTE-FLAT REGRESSIONS ---------------------------------------------------
	_check("FLORIDA ground stays 0.0 (%.2f m)" % ProtoWorldBuilder.ground_y(fla.x, fla.z),
		absf(ProtoWorldBuilder.ground_y(fla.x, fla.z)) < 0.01)
	_check("the authored MERIDIAN slab stays 0.0 (%.2f m at the safehouse)" % ProtoWorldBuilder.ground_y(110.0, -320.0),
		absf(ProtoWorldBuilder.ground_y(110.0, -320.0)) < 0.01)
	_check("painted mountain macro carries real height (%.1f m > 5)" % ProtoWorldBuilder.ground_y(deep_mtn.x + 40.0, deep_mtn.z + 40.0),
		ProtoWorldBuilder.ground_y(deep_mtn.x + 40.0, deep_mtn.z + 40.0) > 5.0)

	# --- 3. THE GRADE CAP on every baked road ---------------------------------------
	var worst_grade := 0.0
	var climbing_roads := 0
	var structure_roads := 0
	for road in m.roads:
		var elev: PackedFloat32Array = road["elev"]
		var pts: PackedVector2Array = road["pts"]
		var mode := String(road.get("elev_mode", ""))
		if mode == "structure":
			structure_roads += 1
			continue # ramps/humps are STRUCTURES — they ride pillars, not grades
		var climbs := false
		for i in range(pts.size() - 1):
			var run := pts[i].distance_to(pts[i + 1])
			if run < 1.0:
				continue
			var g := absf(elev[i + 1] - elev[i]) / run
			# overpass hump spans carry +6.2m clearance over ~110m approaches —
			# the honest ceiling for GROUND roads is the cap plus the hump term.
			worst_grade = maxf(worst_grade, g)
			if elev[i] > 0.5 or elev[i + 1] > 0.5:
				climbs = true
		if climbs:
			climbing_roads += 1
	_check("the country actually climbs (%d ground roads carry baked elevation)" % climbing_roads, climbing_roads >= 80)
	_check("ramps ride as structures (%d structure roads)" % structure_roads, structure_roads >= 150)
	_check("every GROUND grade obeys the cap (worst %.2f%% <= 6.01%%)" % (worst_grade * 100.0), worst_grade <= 0.0601)

	# --- 4. THE ROAD MEETS THE LAND -------------------------------------------------
	var co := Vector3(-35125, 0, 0) # I-25 through Colorado (surveyed)
	var co_road: Dictionary = m.road_near(co, 60.0)
	_check("found I-25 at the Colorado stage", not co_road.is_empty())
	if not co_road.is_empty():
		var a2: Vector2 = co_road["a"]
		var b2: Vector2 = co_road["b"]
		var ab := b2 - a2
		var t2 := clampf((Vector2(co.x, co.z) - a2).dot(ab) / maxf(ab.length_squared(), 0.001), 0.0, 1.0)
		var road_h := lerpf(float(co_road.get("elev_a", 0.0)), float(co_road.get("elev_b", 0.0)), t2)
		var q := a2 + ab * t2
		var land_h := ProtoWorldBuilder.ground_y(q.x, q.y)
		_check("terrain at the climbing road EQUALS the road height (road %.1f vs land %.1f)" % [road_h, land_h],
			absf(road_h - land_h) < 0.35)
		_check("...and that height is a real climb (%.1f m > 2)" % road_h, road_h > 2.0)

	# --- 5. A REAL DRIVE ON THE VERTICAL COUNTRY (held throttle, real physics):
	# the car rides a climbing interstate and TRACKS the land the whole way —
	# never floating off it, never falling through it. (The steep-deck climb is
	# elevation_sim's own proof; this is the country-scale one.)
	if not co_road.is_empty():
		var a3: Vector2 = co_road["a"]
		var b3: Vector2 = co_road["b"]
		var ab3 := b3 - a3
		var t3 := clampf((Vector2(co.x, co.z) - a3).dot(ab3) / maxf(ab3.length_squared(), 0.001), 0.0, 1.0)
		var q3 := a3 + ab3 * t3
		var dirv := ab3.normalized()
		var start := q3 + dirv * 10.0
		var car := ProtoCar3D.create("scavenger", Color(0.5, 0.4, 0.3))
		main.add_child(car)
		car.surface_override = "road"
		car.is_active = true
		car.engine_on = true # sim staging: the ignition law is proven elsewhere
		car.can_sleep = false
		car.sleeping = false
		var start_y := ProtoWorldBuilder.ground_y(start.x, start.y) + 1.2
		car.global_position = Vector3(start.x, start_y, start.y)
		car.global_rotation.y = atan2(-dirv.x, -dirv.y)
		var perp3 := Vector2(-dirv.y, dirv.x)
		var lane_off := ProtoUSMap.lane_offset(co_road, 0)
		car.global_position += Vector3(perp3.x, 0, perp3.y) * lane_off
		main.player.global_position = Vector3(start.x + perp3.x * 30.0, start_y + 2.0, start.y + perp3.y * 30.0)
		for _i in 40:
			await get_tree().physics_frame
		car.use_player_input = false
		var p0 := car.global_position
		var worst_dev := 0.0
		var t := 0.0
		var fi := 0
		while t < 7.0:
			car.input_throttle = 1.0
			car.input_steer = 0.0
			if fi % 20 == 0:
				var pp := car.global_position
				main.player.global_position = Vector3(pp.x + perp3.x * 30.0, pp.y + 2.0, pp.z + perp3.y * 30.0)
			if fi % 10 == 0:
				worst_dev = maxf(worst_dev, absf(car.global_position.y - ProtoWorldBuilder.ground_y(car.global_position.x, car.global_position.z)))
			fi += 1
			await get_tree().physics_frame
			t += get_physics_process_delta_time()
		var dist := Vector2(car.global_position.x - p0.x, car.global_position.z - p0.z).length()
		print("RELIEF-DIAG: drove %.0fm, worst land deviation %.1fm, end y %.1f" % [dist, worst_dev, car.global_position.y])
		_check("the car DROVE the vertical interstate (%.0f m > 120)" % dist, dist > 120.0)
		_check("...TRACKING the land the whole way (worst deviation %.1f m < 4)" % worst_dev, worst_dev < 4.0)
		_check("...and never fell through (y %.1f > -2)" % car.global_position.y, car.global_position.y > -2.0)
		car.queue_free()

	_finish()
