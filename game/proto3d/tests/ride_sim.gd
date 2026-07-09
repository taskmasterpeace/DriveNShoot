## THE RIDE (SEABOARD goal R5) — board at the depot with a REAL E through the stop
## post, T-skip the legs with REAL key presses (each pays its route time into the
## clock, 60× law), and step off onto MIAMI CENTRAL's platform with a REAL E.
## Staging (documented exception): scrip in the bag, the train parked at the depot
## with a long dwell so the walk-up can't race the timetable.
## Run: Godot_console --headless --path game res://proto3d/tests/ride_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D
var _prev_ts: float = 1.0


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RIDE: %s - %s" % ["PASS" if ok else "FAIL", n])


func _tap(code: Key) -> void:
	for pressed in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = code
		ev.physical_keycode = code
		ev.pressed = pressed
		Input.parse_input_event(ev)
		for _i in 3:
			await get_tree().physics_frame


func _ready() -> void:
	print("RIDE: start")
	get_tree().create_timer(110.0).timeout.connect(func() -> void:
		print("RIDE: WATCHDOG")
		print("RIDE RESULTS: %d passed, %d failed" % [passed, failed + 1])
		print("RIDE: FAILURES PRESENT")
		Engine.time_scale = _prev_ts
		get_tree().quit(1))
	_prev_ts = Engine.time_scale
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 10:
		await get_tree().process_frame
	main.mode = main.Mode.FOOT
	main.active_car = null

	var train: ProtoTrain = main.train
	_check("THE SEABOARD LINE's train spawned at boot", train != null and is_instance_valid(train))
	if train == null:
		print("RIDE RESULTS: %d passed, %d failed" % [passed, failed])
		print("RIDE: FAILURES PRESENT")
		get_tree().quit(1)
		return
	_check("stop posts stand on every platform (%d)" % _stops().size(), _stops().size() >= 3)

	# Stage: parked at the depot, doors held; fare money in the bag.
	train._arrive(0)
	train.dwell = 9999.0
	train._pose()
	main.backpack.add("scrip", 20)
	var scrip0: int = main.backpack.count("scrip")
	var hour0: float = main.daynight.hour
	var day0: int = main.daynight.day

	# Walk up to the depot post and BOARD with a real E.
	var depot_stop: Node3D = _stop_for(0)
	_check("the depot has its stop post", depot_stop != null)
	main.player.global_position = depot_stop.global_position + Vector3(1.0, 0.35, 0.6)
	for _i in 8:
		await get_tree().physics_frame
	await _tap(KEY_E)
	_check("E at the post BOARDS the train", main.riding_train)
	_check("the conductor took the fare (%d → %d)" % [scrip0, main.backpack.count("scrip")],
		main.backpack.count("scrip") == scrip0 - ProtoTrain.FARE_SCRIP)
	_check("your body rides the seat", main.player.global_position.distance_to(train.seat_pos()) < 3.0)

	# T-skip the three legs to MIAMI CENTRAL — each pays its real time into the clock.
	var expected_h := 0.0
	for leg in 3:
		var before: float = train.dist
		await _tap(KEY_T)
		for _i in 4:
			await get_tree().physics_frame # let the edge land before the next tap
		print("RIDE:   skip %d → station %d (dist %.0f, moved %.0f m)" %
			[leg + 1, train.dwelling_station(), train.dist, absf(train.dist - before)])
		expected_h += absf(train.dist - before) / ProtoTrain.SPEED / 60.0
	_check("three skips end at MIAMI CENTRAL", train.dwelling_station() == 3)
	var advanced: float = (float(main.daynight.day - day0) * 24.0 + main.daynight.hour - hour0)
	_check("the clock PAID the route (%.1f h advanced ≈ %.1f h expected)" % [advanced, expected_h],
		absf(advanced - expected_h) < 0.6 and advanced > 8.0)

	# Step off with a real E — onto the PLATFORM, not the void.
	await _tap(KEY_E)
	_check("E steps off at the platform", not main.riding_train)
	var mc: Vector2 = train.stations[3]["pos"]
	var pxz := Vector2(main.player.global_position.x, main.player.global_position.z)
	_check("you stand ON Miami Central's platform (%.1f m)" % pxz.distance_to(mc),
		pxz.distance_to(mc) < 15.0)
	_check("your body is yours again", main.player.visible and main.player.is_active)

	# --- THE RETURN (the stop condition's literal direction: board at MIAMI →
	# arrive at MERIDIAN DEPOT, clock advanced, exit lands on the platform) --------
	train.dwell = 9999.0 # hold the doors while we walk to the post
	main.backpack.add("scrip", 10)
	var miami_stop: Node3D = _stop_for(3)
	_check("Miami Central has its stop post", miami_stop != null)
	main.player.global_position = miami_stop.global_position + Vector3(1.0, 0.35, 0.6)
	for _i in 8:
		await get_tree().physics_frame
	await _tap(KEY_E)
	_check("E at MIAMI boards the return run", main.riding_train)
	var hour1: float = main.daynight.hour
	var day1: int = main.daynight.day
	for _leg in 3:
		await _tap(KEY_T)
		for _i in 4:
			await get_tree().physics_frame
	_check("three skips home end at MERIDIAN DEPOT", train.dwelling_station() == 0)
	var back_h: float = float(main.daynight.day - day1) * 24.0 + main.daynight.hour - hour1
	_check("the return PAID the clock too (%.1f h)" % back_h, back_h > 8.0)
	await _tap(KEY_E)
	var dep: Vector2 = train.stations[0]["pos"]
	var pxz2 := Vector2(main.player.global_position.x, main.player.global_position.z)
	_check("you stand on the DEPOT platform (%.1f m)" % pxz2.distance_to(dep),
		not main.riding_train and pxz2.distance_to(dep) < 15.0)

	Engine.time_scale = _prev_ts
	print("RIDE RESULTS: %d passed, %d failed" % [passed, failed])
	print("RIDE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _stops() -> Array:
	var out: Array = []
	for n in get_tree().get_nodes_in_group("interactable"):
		if "station_i" in n and "train" in n:
			out.append(n)
	return out


func _stop_for(idx: int) -> Node3D:
	for n in _stops():
		if int(n.station_i) == idx:
			return n
	return null
