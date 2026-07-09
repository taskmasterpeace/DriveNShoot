## THE LOOK AS A SIM (SEABOARD goal L1) — the whole journey in one unbroken run:
## stand at MERIDIAN DEPOT → board with a REAL E → T-skip the line → step onto MIAMI
## CENTRAL's platform → take a rig to the shore → DRIVE it into the Atlantic under
## REAL throttle → the engine drowns while you swim out. Staging: teleports position
## actors between beats (the documented exception); every VERB is the real input path.
## Run: Godot_console --headless --path game res://proto3d/tests/seaboard_walkthrough_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D
var _prev_ts: float = 1.0


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SEAB: %s - %s" % ["PASS" if ok else "FAIL", n])


func _tap(code: Key) -> void:
	for pressed in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = code
		ev.physical_keycode = code
		ev.pressed = pressed
		Input.parse_input_event(ev)
		for _i in 3:
			await get_tree().physics_frame
	for _i in 4:
		await get_tree().physics_frame


func _ready() -> void:
	print("SEAB: start")
	get_tree().create_timer(110.0).timeout.connect(func() -> void:
		print("SEAB: WATCHDOG")
		print("SEAB RESULTS: %d passed, %d failed" % [passed, failed + 1])
		print("SEAB: FAILURES PRESENT")
		Engine.time_scale = _prev_ts
		get_tree().quit(1))
	_prev_ts = Engine.time_scale
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 10:
		await get_tree().process_frame
	main.mode = main.Mode.FOOT
	main.active_car = null

	# --- BEAT 1: the depot — board with a real E --------------------------------
	var train: ProtoTrain = main.train
	_check("the SEABOARD runs at boot", train != null and is_instance_valid(train))
	if train == null:
		print("SEAB RESULTS: %d passed, %d failed" % [passed, failed])
		print("SEAB: FAILURES PRESENT")
		get_tree().quit(1)
		return
	train._arrive(0)
	train.dwell = 9999.0
	train._pose()
	main.backpack.add("scrip", 12)
	var stop0: Node3D = null
	for n in get_tree().get_nodes_in_group("interactable"):
		if "station_i" in n and "train" in n and int(n.station_i) == 0:
			stop0 = n
			break
	_check("the depot stop post stands", stop0 != null)
	main.player.global_position = stop0.global_position + Vector3(1.0, 0.35, 0.6)
	for _i in 8:
		await get_tree().physics_frame
	await _tap(KEY_E)
	_check("E boards at the depot", main.riding_train)

	# --- BEAT 2: ride the line — T-skips, the clock pays ------------------------
	var day0: int = main.daynight.day
	var hour0: float = main.daynight.hour
	for _leg in 3:
		await _tap(KEY_T)
	_check("three skips call at MIAMI CENTRAL", train.dwelling_station() == 3)
	var advanced: float = float(main.daynight.day - day0) * 24.0 + main.daynight.hour - hour0
	_check("the ride COST the day its hours (%.1f h)" % advanced, advanced > 8.0)

	# --- BEAT 3: step off onto the platform -------------------------------------
	await _tap(KEY_E)
	var mc: Vector2 = train.stations[3]["pos"]
	var pxz := Vector2(main.player.global_position.x, main.player.global_position.z)
	_check("you stand on Miami Central's platform", not main.riding_train and pxz.distance_to(mc) < 15.0)

	# --- BEAT 4: drive into the Atlantic under REAL throttle --------------------
	var usmap := ProtoUSMap.get_default()
	var deep_x := -2000.0
	for dx in range(0, 12000, 250):
		if usmap.water_depth_at(-2000.0 + float(dx), 20500.0) >= ProtoUSMap.WATER_DEEP_M:
			deep_x = -2000.0 + float(dx)
			break
	# Stage the rig IN the ford aimed at open water, player at the wheel — the ford
	# tax is real (~8 m/s through shallow), so start 150 m from the deep edge or the
	# drive beat spends a minute wading (the first runs proved the crawl).
	var car: Node = main.cars[0]
	car.global_position = Vector3(deep_x - 150.0, 0.6, 20500.0)
	car.linear_velocity = Vector3.ZERO
	car.rotation.y = -PI * 0.5 # nose +X (forward is -Z local → -Z world maps... drive proves it)
	main.player.global_position = car.global_position + Vector3(0, 0.2, 0)
	main.enter_car(car) # the real boarding path (proto3d.gd)
	car.engine_on = true
	# DRIVE with the REAL KEY — in DRIVE mode the input poller owns car.input_throttle
	# every frame (a direct write gets stomped; the first run proved it). Hold W.
	var w_down := InputEventKey.new()
	w_down.keycode = KEY_W
	w_down.physical_keycode = KEY_W
	w_down.pressed = true
	Input.parse_input_event(w_down)
	var reached_deep := false
	for _i in 2400: # the ford tax is ~8 m/s — give the 150 m wade its honest 20-40 s
		await get_tree().physics_frame
		if usmap.water_depth_at(car.global_position.x, car.global_position.z) >= ProtoUSMap.WATER_DEEP_M:
			reached_deep = true
			break
	var w_up := InputEventKey.new()
	w_up.keycode = KEY_W
	w_up.physical_keycode = KEY_W
	w_up.pressed = false
	Input.parse_input_event(w_up)
	await get_tree().physics_frame
	_check("the rig DROVE into deep water (%.0f, %.0f)" % [car.global_position.x, car.global_position.z], reached_deep)
	for _i in 40:
		await get_tree().physics_frame
	_check("the engine DROWNED where it swam", not car.engine_on)

	# --- BEAT 5: abandon ship — the walker swims --------------------------------
	main._exit_car()
	main.player.global_position = Vector3(car.global_position.x, 0.3, car.global_position.z)
	for _i in 40:
		await get_tree().physics_frame
	_check("and YOU swim out (state '%s')" % main.water_state, main.water_state == "swim")

	Engine.time_scale = _prev_ts
	print("SEAB RESULTS: %d passed, %d failed" % [passed, failed])
	print("SEAB: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
