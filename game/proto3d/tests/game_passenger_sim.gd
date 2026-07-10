## Passenger handheld proof through real DRIVN bodies: ordinary driven-car E
## entry, real autopilot motion, live cartridge input, damage close, exit stop,
## and driver refusal.
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_PASSENGER: %s - %s" % ["PASS" if ok else "FAIL", label])


func _key(code: Key, pressed: bool) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.physical_keycode = code
	event.pressed = pressed
	Input.parse_input_event(event)


func _ready() -> void:
	print("GAME_PASSENGER: start")
	get_tree().create_timer(100.0).timeout.connect(func() -> void:
		print("GAME_PASSENGER: WATCHDOG")
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 10:
		await get_tree().process_frame
	# The passenger test owns the two physical firmware wafers it exercises.
	main.game_deck.ledger.unlock("last_mile")
	main.game_deck.ledger.unlock("radworm")
	main._exit_car()

	var car := ProtoCar3D.create("van", Color(0.44, 0.4, 0.32))
	main.add_child(car)
	car.global_position = Vector3(6, 1.0, 360)
	car.engine_on = true
	main.cars.append(car)
	var pilot := ProtoAutopilot.attach(car)
	pilot.target_pos = car.global_position + Vector3(0, 0, -220)
	pilot.arrive_dist = 2.0
	pilot.aggression = 1.0
	car.ai_driver = pilot
	main.player.global_position = car.global_position + Vector3(2, 0.3, 0)
	car.interact(main)
	_check("ordinary E contract enters a genuinely driven passenger seat",
		main.passenger_of_ai and main.active_car == car and car.ai_driver == pilot)

	_check("passenger can draw the reusable handheld", not main.use_item("game_handheld")
		and main.game_shell.is_open and main.game_handheld.visible)
	_check("passenger launches a landscape cartridge through the same deck",
		main.game_shell.open_game("last_mile", {"source": "passenger", "device": "handheld"})
		and main.game_deck.start(515, [{"seat": 0, "device": -1, "profile_id": "passenger"}]))
	var start_pos: Vector3 = car.global_position
	var hour_before: float = main.daynight.hour
	_key(KEY_W, true)
	for _i in 180:
		await get_tree().physics_frame
	_key(KEY_W, false)
	for _i in 4:
		await get_tree().physics_frame
	_check("autopilot vehicle keeps moving while the passenger plays",
		car.global_position.distance_to(start_pos) > 2.0)
	_check("passenger cartridge changes state during the trip",
		float(main.game_deck.cartridge.distance) > 0.0)
	_check("world clock remains live during handheld play", main.daynight.hour > hour_before)
	_check("held physical screen follows the moving cab",
		main.game_handheld.global_position.distance_to(car.global_position) < 3.0)

	main.player.take_damage(5.0)
	for _i in 3:
		await get_tree().physics_frame
	_check("damage drops fullscreen to the physical handheld", not main.game_shell.is_open
		and main.game_deck.cartridge != null and main.game_handheld.visible)

	main.game_handheld.open(main)
	main.game_shell.show_view("play")
	main._exit_car()
	for _i in 3:
		await get_tree().physics_frame
	_check("passenger exit stops the body-bound handheld session",
		main.mode == main.Mode.FOOT and main.game_deck.state == "OFF"
		and main.game_deck.cartridge == null and not main.game_handheld.visible)

	var driver_car: ProtoCar3D = main.cars[0]
	main.enter_car(driver_car)
	main.game_shell.close_to_device()
	_check("active driver is refused handheld play", not main.use_item("game_handheld")
		and not main.game_shell.is_open and not main.game_handheld.visible)
	main._exit_car()

	main.use_item("game_handheld")
	main.game_shell.open_game("radworm", {"source": "on_foot", "device": "handheld"})
	main.game_deck.start(516, [{"seat": 0, "device": -1, "profile_id": "walker"}])
	main._on_death()
	_check("death closes and stops handheld play", main.game_deck.state == "OFF"
		and not main.game_shell.is_open and not main.game_handheld.visible)
	_check("passenger lifecycle never changes world time scale", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("GAME_PASSENGER RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_PASSENGER: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
