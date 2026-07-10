## Physical Game Deck proof through the real DRIVN main scene: E reaches the
## safehouse console, shell input locks the body without pausing/damage immunity,
## physical and handheld screens share the live texture, and power-off unwires it.
## Run: Godot --headless --path game res://proto3d/tests/game_device_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_DEVICE: %s - %s" % ["PASS" if ok else "FAIL", label])


func _e() -> void:
	for down in [true, false]:
		var event := InputEventKey.new()
		event.keycode = KEY_E
		event.physical_keycode = KEY_E
		event.pressed = down
		Input.parse_input_event(event)
		await get_tree().physics_frame
		await get_tree().physics_frame


func _ready() -> void:
	print("GAME_DEVICE: start")
	get_tree().create_timer(75.0).timeout.connect(func() -> void:
		print("GAME_DEVICE: WATCHDOG")
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	var console: Node3D = main.get("game_console") as Node3D
	var handheld: Node3D = main.get("game_handheld") as Node3D
	_check("main owns one physical console and handheld", console != null and handheld != null)
	if console == null or handheld == null:
		_finish()
		return
	var all_orientations := handheld.has_method("set_device")
	if all_orientations:
		all_orientations = handheld.set_device("handheld_square") \
			and handheld.screen_size() == Vector2(0.18, 0.18) \
			and handheld.set_device("handheld_portrait") \
			and handheld.screen_size() == Vector2(0.12, 0.213) \
			and handheld.set_device("handheld_landscape") \
			and handheld.screen_size() == Vector2(0.24, 0.135)
	_check("one handheld shell honors square, portrait, and landscape rows", all_orientations)
	main._exit_car()
	main._current_interactable = console
	_check("console uses the ordinary interactable law", console.is_in_group("interactable")
		and String(console.interact_prompt(main)).contains("GAME"))
	await _e()
	_check("real E input opens the shared console library", main.game_shell.is_open
		and main.game_shell.current_view == "library")
	for _i in 3:
		await get_tree().physics_frame
	_check("fullscreen shell locks the body", main.player.input_locked)
	var scale_before := Engine.time_scale
	var hour_before: float = main.daynight.hour
	main.game_shell.open_game("waste_heap", {"source": "solo", "device": "console"})
	main.game_deck.start(101, [{"seat": 0, "device": -1, "profile_id": "local"}])
	for _i in 8:
		await get_tree().process_frame
	_check("physical console screen receives the live deck texture", console.screen_texture() == main.game_deck.texture())
	var hp_before: float = main.character.hp
	main.player.take_damage(5.0)
	for _i in 3:
		await get_tree().physics_frame
	_check("playing grants no world-damage immunity", main.character.hp < hp_before)
	for _i in 30:
		await get_tree().physics_frame
	_check("world clock advances while playing", main.daynight.hour > hour_before)
	_check("device never changes Engine.time_scale", Engine.time_scale == scale_before)
	main.game_shell.close_to_device()
	for _i in 3:
		await get_tree().physics_frame
	_check("couch/device mode gives the body back", not main.player.input_locked
		and main.game_deck.cartridge != null)

	_check("starter handheld item opens without being consumed", not main.use_item("game_handheld")
		and main.game_shell.is_open and main.game_shell.current_view == "library")
	main.game_shell.open_game("waste_heap", {"source": "solo", "device": "handheld"})
	main.game_deck.start(202, [{"seat": 0, "device": -1, "profile_id": "local"}])
	for _i in 5:
		await get_tree().process_frame
	_check("handheld and shell consume the same live texture", handheld.screen_texture() == main.game_deck.texture()
		and main.game_shell.screen_texture() == main.game_deck.texture())
	main.game_shell.power_off()
	_check("power off clears both physical screens", not console.is_live() and not handheld.is_live())
	_finish()


func _finish() -> void:
	print("GAME_DEVICE RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_DEVICE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
