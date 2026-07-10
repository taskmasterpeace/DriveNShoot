## GAME DECK input proof: semantic snapshots keep hardware seats isolated,
## preserve pad B for active-play stance, expose wheel weapon cycling, and build
## HELP labels from the live rebindable InputMap instead of hard-coded copy.
## Run: Godot --headless --path game res://proto3d/tests/game_input_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_INPUT: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_INPUT: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("GAME_INPUT: WATCHDOG")
		get_tree().quit(1))
	ProtoInputMap._folded = false
	ProtoInputMap.ensure()

	var router_script: GDScript = load("res://proto3d/games/arcade_input_router.gd") as GDScript
	_check("the shared input router exists", router_script != null)
	if router_script == null:
		_finish()
		return
	var router: RefCounted = router_script.new()
	router.assign_keyboard(0)
	router.assign_device(1, 1)
	router.assign_device(2, 2)

	var w := InputEventKey.new()
	w.physical_keycode = KEY_W
	w.keycode = KEY_W
	w.pressed = true
	router.feed_event(w)
	var keyboard: Dictionary = router.snapshot_for_seat(0)
	_check("keyboard is isolated to seat zero", (keyboard["move"] as Vector2).y < -0.9
		and (router.snapshot_for_seat(1)["move"] as Vector2).is_zero_approx())

	var stick := InputEventJoypadMotion.new()
	stick.device = 1
	stick.axis = JOY_AXIS_LEFT_Y
	stick.axis_value = -1.0
	router.feed_event(stick)
	var pad_one: Dictionary = router.snapshot_for_seat(1)
	var pad_two: Dictionary = router.snapshot_for_seat(2)
	_check("joypad device 1 drives only seat one", (pad_one["move"] as Vector2).y < -0.9
		and (pad_two["move"] as Vector2).is_zero_approx())

	var stance := InputEventJoypadButton.new()
	stance.device = 1
	stance.button_index = JOY_BUTTON_B
	stance.pressed = true
	router.feed_event(stance)
	pad_one = router.snapshot_for_seat(1)
	_check("active-play pad B reaches semantic stance", bool((pad_one["pressed"] as Dictionary).get("stance", false)))
	var next_frame: Dictionary = router.snapshot_for_seat(1)
	_check("pressed is one-shot while held persists", not (next_frame["pressed"] as Dictionary).has("stance")
		and bool((next_frame["held"] as Dictionary).get("stance", false)))

	stance.pressed = false
	router.feed_event(stance)
	var released: Dictionary = router.snapshot_for_seat(1)
	_check("release is reported once and clears held", bool((released["released"] as Dictionary).get("stance", false))
		and not bool((released["held"] as Dictionary).get("stance", false)))

	var wheel := InputEventMouseButton.new()
	wheel.button_index = MOUSE_BUTTON_WHEEL_UP
	wheel.pressed = true
	var wheel_descriptor := ProtoInputMap.event_to_descriptor(wheel)
	_check("mouse wheel descriptors round-trip", wheel_descriptor == "mouse:wheel_up"
		and ProtoInputMap.descriptor_to_event(wheel_descriptor).button_index == MOUSE_BUTTON_WHEEL_UP)
	router.feed_event(wheel)
	keyboard = router.snapshot_for_seat(0)
	_check("wheel up is shared weapon next", bool((keyboard["pressed"] as Dictionary).get("weapon_next", false)))

	var help: Array = router.help_labels("shared_shooter")
	_check("shooter HELP lists the shared stance action", help.any(func(row: Dictionary) -> bool:
		return row.get("semantic") == "stance" and String(row.get("pad", "")).contains("B / ◯")))
	_check("all ARCADE actions folded into InputMap", InputMap.has_action("arcade_primary")
		and InputMap.has_action("arcade_pause") and InputMap.has_action("arcade_scoreboard"))
	var handheld_profiles := {
		"pointer_grid": 8,
		"paddle": 5,
		"racer": 6,
		"pointer_fire": 8,
		"lander": 5,
		"pinball": 6,
	}
	var exact_profiles := true
	for profile: String in handheld_profiles:
		exact_profiles = exact_profiles and router.PROFILES.has(profile) \
			and (router.PROFILES[profile] as Array).size() == int(handheld_profiles[profile])
	_check("handheld HELP profiles expose only their real controls", exact_profiles)
	var console_profiles := {
		"board_cursor": 8,
		"twin_stick": 13,
		"artillery": 8,
		"arena_grid": 8,
		"physics_sport": 8,
		"capture_racer": 8,
		"aerial_duel": 8,
		"fighter": 10,
		"tactics_grid": 8,
	}
	var exact_console_profiles := true
	for profile: String in console_profiles:
		exact_console_profiles = exact_console_profiles and router.PROFILES.has(profile) \
			and (router.PROFILES[profile] as Array).size() == int(console_profiles[profile])
	_check("console HELP profiles expose only their real controls", exact_console_profiles)
	var registry := ProtoGameRegistry.load_catalog()
	var console_rows: Array = registry.phase_rows(1).filter(func(row: Dictionary) -> bool:
		return String(row.get("platform", "")) == "console")
	_check("every console row names one exact installed HELP profile", console_rows.all(func(row: Dictionary) -> bool:
		return router.PROFILES.has(String(row.get("controls_profile", ""))))
		and String(registry.get_game("fuel_run").get("controls_profile", "")) == "capture_racer")
	_finish()


func _finish() -> void:
	print("GAME_INPUT RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_INPUT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
