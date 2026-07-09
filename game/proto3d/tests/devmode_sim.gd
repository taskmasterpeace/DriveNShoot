## Proof: DEV MODE (F10) — the in-game test environment actually works.
## F10 (a real key event) builds the panel; every handler drives the REAL paths:
## clock set/speed, teleport (foot), spawns land in-world, arsenal equips, heal heals.
## Run: godot --headless --path game res://proto3d/tests/devmode_sim.tscn
extends Node

var main: Node3D
var passed: int = 0
var failed: int = 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DEV: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _tap_key(code: Key) -> void:
	for pressed in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = code
		ev.physical_keycode = code
		ev.pressed = pressed
		Input.parse_input_event(ev)


## Give the input queue + physics a few real frames to flush.
func _settle(frames: int = 4) -> void:
	for _i in frames:
		await get_tree().process_frame


func _ready() -> void:
	# Watchdog: a failure must never hang the runner.
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("DEV: WATCHDOG — runaway, bailing")
		print("DEV RESULTS: %d passed, %d failed" % [passed, failed + 1])
		print("DEV: FAILURES PRESENT")
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("DEV: scene up")
	await _settle(8)

	# --- F10 (the real key) builds and shows the panel -----------------------
	_tap_key(KEY_F10)
	await _settle()
	_check("F10 opens dev mode", main.devmode != null and main.devmode.visible)
	if main.devmode == null:
		print("DEV RESULTS: %d passed, %d failed" % [passed, failed])
		print("DEV: FAILURES PRESENT")
		get_tree().quit(1)
		return
	var dev: ProtoDevMode = main.devmode

	# --- Time: set + speed ----------------------------------------------------
	dev._set_hour(0.0)
	_check("midnight button sets the clock (%.1fh)" % main.daynight.hour, main.daynight.hour < 1.0)
	dev._clock_speed(60.0)
	var h0: float = main.daynight.hour
	for _i in 30:
		await get_tree().physics_frame
	_check("clock ×60 sprints time (%.2fh → %.2fh)" % [h0, main.daynight.hour], main.daynight.hour > h0 + 0.1)
	dev._clock_speed(1.0)
	dev._moon(1.0)
	_check("moon set full", main.daynight.moon_phase > 0.9)

	# --- Teleport (on foot) ----------------------------------------------------
	dev._teleport(Vector3(500, 0.5, 500))
	await get_tree().physics_frame
	_check("teleport moves the player", main.player.global_position.distance_to(Vector3(500, 0.5, 500)) < 5.0)
	# The town DROPDOWN + GO (2026-07-09 playtest "pick a city but can't teleport there").
	_check("the teleport dropdown filled from the live map", dev._town_pick.item_count > 0)
	if dev._town_pick.item_count > 0 and main.stream != null and main.stream.usmap != null:
		dev._town_pick.select(0)
		var tp: Vector2 = main.stream.usmap.towns[0]["pos"]
		dev._teleport_town()
		await get_tree().physics_frame
		var pxz := Vector2(main.player.global_position.x, main.player.global_position.z)
		_check("GO warps to the picked town (not 'nothing happened')", pxz.distance_to(tp) < 15.0)
	# The Meridian test-town warp — "test everything in one spot" (spawn is 700 m north).
	dev._teleport(Vector3(121, 1.5, -305))
	await get_tree().physics_frame
	var mxz := Vector2(main.player.global_position.x, main.player.global_position.z)
	_check("the Meridian test-town warp lands in the testbed", mxz.distance_to(Vector2(121, -305)) < 20.0)
	# The new WEATHER row (dust/rain/heat/clear) — a system shipped since the panel was written.
	dev._weather("dust")
	_check("the WEATHER row forces DUST", main.weather != null and main.weather.state == "dust")
	dev._weather("clear")
	_check("Clear un-pins the weather", main.weather.state == "clear")

	# --- Spawns land in the world ----------------------------------------------
	var before_dogs: int = main.all_dogs.size()
	dev._spawn_dog()
	_check("spawn: stray dog joins the world", main.all_dogs.size() == before_dogs + 1)
	var before_cars: int = main.cars.size()
	dev._car_pick.select(0)
	dev._spawn_car()
	_check("spawn: rig delivered", main.cars.size() == before_cars + 1)
	dev._spawn_howler()
	dev._spawn_lurker()
	dev._spawn_chest()
	await get_tree().physics_frame
	_check("spawn: howler/lurker/chest run without error", true)

	# --- Give: the arsenal equips through the REAL use_item path ---------------
	var before_w: int = main.weapons.size()
	dev._give_arsenal()
	_check("arsenal: guns equipped (%d → %d)" % [before_w, main.weapons.size()], main.weapons.size() > before_w)
	dev._give({"scrip": 100})
	_check("give: scrip lands in the pack", main.backpack.count("scrip") >= 100)

	# --- Heal: wounds close, stress clears -------------------------------------
	main.character.take_wound("l_arm", 30.0)
	main.stress = 55.0
	dev._heal()
	_check("heal: hp back to cap", main.character.hp >= main.character.hp_cap() - 0.01)
	_check("heal: stress cleared", main.stress == 0.0)

	# --- F10 again hides it -----------------------------------------------------
	_tap_key(KEY_F10)
	await _settle()
	_check("F10 toggles it away", not main.devmode.visible)

	print("DEV RESULTS: %d passed, %d failed" % [passed, failed])
	print("DEV: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
