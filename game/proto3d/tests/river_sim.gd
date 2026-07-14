## Proof for RIVERS WITH REAL BRIDGES (THE_COUNTRY_PLAN 1B): rivers carve real
## channels into the land, water_depth_at IS the one water authority (deep in the
## channel, zero on land, the ford law feeds surface_at), water sheets render the
## surface, and a road crossing a river gets a REAL bridge deck a driven car
## crosses without falling or drowning.
## Run: godot --headless --path game res://proto3d/tests/river_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D

const MISS_X := -15737.0 ## I-90 x MISSISSIPPI (surveyed crossing)
const MISS_Z := -10966.0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RIVER: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(watchdog: bool = false) -> void:
	print("RIVER RESULTS: %d passed, %d failed%s" % [passed, failed, " (WATCHDOG)" if watchdog else ""])
	print("RIVER: %s" % ("ALL CHECKS PASSED" if failed == 0 and not watchdog else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 and not watchdog else 1)


func _ready() -> void:
	print("RIVER: start")
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
	_check("map booted with cached river segments (%d)" % m._river_segs.size(), m._river_segs.size() >= 6)

	# --- 1. THE CARVE + THE WATER AUTHORITY ------------------------------------------
	# a mid-river point AWAY from the bridge (upstream along the Mississippi row)
	var mid := Vector2(-15250.0, 9500.0) # a Mississippi polyline vertex (surveyed)
	var carve := ProtoWorldBuilder.river_carve(mid.x, mid.y)
	_check("the river carves a real channel (%.1f m deep >= 3)" % carve, carve >= 3.0)
	var depth := ProtoWorldBuilder.water_depth_at(mid.x, mid.y)
	_check("water_depth_at reads DEEP mid-channel (%.1f m >= 1.5)" % depth, depth >= 1.5)
	var land := Vector2(mid.x + 400.0, mid.y)
	_check("water_depth_at reads ZERO on dry land 400m off (%.2f m)" % ProtoWorldBuilder.water_depth_at(land.x, land.y),
		ProtoWorldBuilder.water_depth_at(land.x, land.y) < 0.05)
	_check("the ford law: surface_at over the river reads WATER",
		ProtoWorldBuilder.surface_at(Vector3(mid.x, 0, mid.y)) == "water")
	_check("ground under the river sits BELOW the banks (%.1f < %.1f)" %
		[ProtoWorldBuilder.ground_y(mid.x, mid.y), ProtoWorldBuilder.ground_y(land.x, land.y)],
		ProtoWorldBuilder.ground_y(mid.x, mid.y) < ProtoWorldBuilder.ground_y(land.x, land.y) - 2.0)

	# --- 2. THE BRIDGE at I-90 x MISSISSIPPI ------------------------------------------
	main.player.global_position = Vector3(MISS_X + 60.0, 2.0, MISS_Z + 60.0)
	for _i in 40:
		await get_tree().physics_frame
	var ck := "%d,%d" % [int(floor(MISS_X / 128.0)), int(floor(MISS_Z / 128.0))]
	_check("the crossing chunk streams in", main.stream.loaded.has(ck))
	var chunk: Node3D = main.stream.loaded.get(ck)
	var decks := 0
	var sheets := 0
	if chunk != null:
		for c in chunk.get_children():
			if c.has_meta("road_deck"):
				decks += 1
			if c.has_meta("river_sheet"):
				sheets += 1
	_check("a REAL bridge deck spans the crossing (%d deck bodies)" % decks, decks >= 1)
	_check("the water surface renders (%d river sheets)" % sheets, sheets >= 1)

	# --- 3. DRIVE ACROSS THE BRIDGE (held throttle, real physics) ----------------------
	var road: Dictionary = m.road_near(Vector3(MISS_X, 0, MISS_Z), 60.0)
	_check("found the crossing road (%s)" % String(road.get("id", "?")), not road.is_empty())
	if not road.is_empty():
		var a2: Vector2 = road["a"]
		var b2: Vector2 = road["b"]
		var dirv := (b2 - a2).normalized()
		var start := Vector2(MISS_X, MISS_Z) - dirv * 90.0
		var car := ProtoCar3D.create("scavenger", Color(0.4, 0.35, 0.3))
		main.add_child(car)
		car.surface_override = "road"
		car.is_active = true
		car.engine_on = true
		car.can_sleep = false
		car.sleeping = false
		var ab2 := b2 - a2
		var t2 := clampf((start - a2).dot(ab2) / maxf(ab2.length_squared(), 0.001), 0.0, 1.0)
		var road_h := lerpf(float(road.get("elev_a", 0.0)), float(road.get("elev_b", 0.0)), t2)
		car.global_position = Vector3(start.x, maxf(ProtoWorldBuilder.ground_y(start.x, start.y), road_h) + 1.2, start.y)
		car.global_rotation.y = atan2(-dirv.x, -dirv.y)
		var perp := Vector2(-dirv.y, dirv.x)
		# THE LANE LAW: a divided interstate carries a MEDIAN BARRIER on its
		# centerline — stage in a real lane like a motorist, never on the wall.
		var lane_off := ProtoUSMap.lane_offset(road, 0)
		car.global_position += Vector3(perp.x, 0, perp.y) * lane_off
		main.player.global_position = Vector3(start.x + perp.x * 30.0, 3.0, start.y + perp.y * 30.0)
		for _i in 40:
			await get_tree().physics_frame
		car.use_player_input = false
		var min_y := 999.0
		var t := 0.0
		var fi := 0
		while t < 8.0:
			car.input_throttle = 1.0
			car.input_steer = 0.0
			if fi % 20 == 0:
				var pp := car.global_position
				main.player.global_position = Vector3(pp.x + perp.x * 30.0, pp.y + 2.0, pp.z + perp.y * 30.0)
			fi += 1
			min_y = minf(min_y, car.global_position.y)
			await get_tree().physics_frame
			t += get_physics_process_delta_time()
		var crossed := Vector2(car.global_position.x - start.x, car.global_position.z - start.y).length()
		var q := PhysicsRayQueryParameters3D.create(car.global_position + Vector3(0, 0.5, 0), car.global_position + Vector3(0, -4, 0))
		q.exclude = [car.get_rid()]
		var hit := (main as Node3D).get_world_3d().direct_space_state.intersect_ray(q)
		if not hit.is_empty():
			var col: Node = hit["collider"]
			var metas := []
			for mk in col.get_meta_list():
				metas.append(String(mk))
			print("RIVER-DIAG3: resting on %s at y=%.2f metas=%s parentchunk=%s" % [col.get_class(), (hit["position"] as Vector3).y, str(metas), col.get_parent().name if col.get_parent() else "?"])
		else:
			print("RIVER-DIAG3: NOTHING under the car within 4m")
		print("RIVER-DIAG2: ground_start=%.1f road_h=%.1f speed=%.1f sleeping=%s vel=%s" % [
			ProtoWorldBuilder.ground_y(start.x, start.y), road_h, car.forward_speed, str(car.sleeping), str(car.linear_velocity)])
		print("RIVER-DIAG: crossed %.0fm, min y %.1f, end=(%.0f, %.1f, %.0f)" % [crossed, min_y,
			car.global_position.x, car.global_position.y, car.global_position.z])
		_check("the car CROSSED the river span (%.0f m > 130)" % crossed, crossed > 130.0)
		_check("...on the DECK, never into the channel (min y %.1f > -1.5)" % min_y, min_y > -1.5)
		car.queue_free()

	_finish()
