## THE WATER'S EDGE — the HARD WATER LAW (SEABOARD goal W1+W3). Proves:
## §data — water_depth_at: dry inland, a SHALLOW ford band at the shore, DEEP open sea
##   (found by scanning east of Miami into the real Atlantic cells).
## §stall — a car in deep water DROWNS its engine, refuses to crank, and floods toward
##   dead; the player thrown into the same water SWIMS (the existing moveset law).
## §overfly — the drone doesn't care: it holds its patrol altitude over the sea.
## Staging positions is the documented exception; the stall/refuse path is the REAL
## car physics loop, the swim is the REAL water tick.
## Run: Godot_console --headless --path game res://proto3d/tests/water_hard_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D
var _prev_ts: float = 1.0


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("WATER: %s - %s" % ["PASS" if ok else "FAIL", n])


func _ready() -> void:
	print("WATER: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("WATER: WATCHDOG")
		print("WATER RESULTS: %d passed, %d failed" % [passed, failed + 1])
		print("WATER: FAILURES PRESENT")
		Engine.time_scale = _prev_ts
		get_tree().quit(1))
	_prev_ts = Engine.time_scale

	# --- §data: the ONE water authority --------------------------------------
	var usmap := ProtoUSMap.get_default()
	_check("usmap loads", usmap.ok)
	_check("Meridian is dry land", usmap.water_depth_at(110.0, -325.0) == 0.0)
	# Scan east of Miami into the Atlantic: first water is the FORD, open sea is DEEP.
	var first_shallow := -1.0
	var first_deep := -1.0
	for dx in range(0, 12000, 250):
		var d := usmap.water_depth_at(-2000.0 + float(dx), 20500.0)
		if d > 0.0 and first_shallow < 0.0 and d <= ProtoUSMap.WATER_SHALLOW_M:
			first_shallow = float(dx)
		if d >= ProtoUSMap.WATER_DEEP_M and first_deep < 0.0:
			first_deep = float(dx)
	_check("the Atlantic exists east of Miami (deep at +%.0f m)" % first_deep, first_deep > 0.0)
	_check("a SHALLOW ford band rings the shore (at +%.0f m)" % first_shallow,
		first_shallow >= 0.0 and (first_deep < 0.0 or first_shallow < first_deep))
	var deep_pt := Vector3(-2000.0 + first_deep, 0.3, 20500.0)

	# --- §stall: deep water drowns the drive ----------------------------------
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 10:
		await get_tree().process_frame
	main.mode = main.Mode.FOOT
	main.active_car = null
	var car: Node = main.cars[0]
	car.engine_on = true
	car.global_position = deep_pt + Vector3(0, 0.6, 0)
	car.linear_velocity = Vector3.ZERO
	var eng0: float = car.components["engine"].hp
	for _i in 30:
		await get_tree().physics_frame
	_check("the engine DROWNS in deep water", not car.engine_on)
	_check("a sunk rig FLOODS toward dead (%.1f → %.1f hp)" % [eng0, car.components["engine"].hp],
		car.components["engine"].hp < eng0 - 0.5)
	# It will not crank with the intake under.
	main.active_car = car
	car.is_active = true
	car.input_throttle = 1.0
	for _i in 60:
		await get_tree().physics_frame
	_check("it will NOT crank underwater", not car.engine_on)
	car.input_throttle = 0.0
	main.active_car = null
	car.is_active = false

	# --- the player SWIMS the same water (the shipped moveset law) -------------
	main.player.global_position = deep_pt
	for _i in 40:
		await get_tree().physics_frame
	_check("the player SWIMS where the car drowned (state '%s')" % main.water_state,
		main.water_state == "swim")

	# --- §look (W2): the sea has a SURFACE + a surf line where it meets land -----
	# The player stands at the shore (streamed above) — scan the streamed chunks.
	var sheet := false
	var foam := false
	var stack: Array = [main.stream]
	while not stack.is_empty():
		var nd: Node = stack.pop_back()
		if nd.has_meta("water_sheet"):
			sheet = true
		if nd.has_meta("water_foam_edge"):
			foam = true
		for c in nd.get_children():
			stack.push_back(c)
	_check("the WATER SHEET streams over the sea", sheet)
	_check("EDGE FOAM marks the shoreline", foam)

	# --- §overfly: the drone holds the sky over the sea ------------------------
	main.player.global_position = Vector3(6, 0.35, 388) # back on land — swim tax off
	for _i in 10:
		await get_tree().physics_frame
	var drone := ProtoDrone.create(main, deep_pt)
	main.add_child(drone)
	drone.global_position = deep_pt + Vector3(0, 2.0, 0)
	for _i in 80:
		await get_tree().physics_frame
	_check("the drone OVERFLIES deep water (alt %.1f m)" % drone.global_position.y,
		is_instance_valid(drone) and drone.global_position.y > 4.0)

	Engine.time_scale = _prev_ts
	print("WATER RESULTS: %d passed, %d failed" % [passed, failed])
	print("WATER: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
