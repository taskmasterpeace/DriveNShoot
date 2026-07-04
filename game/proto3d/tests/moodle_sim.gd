## Moodle system proof — the emoji ARE the meters (PZ-style corner).
## Input-driven: actually SPRINTS to get tired, gets stalked to get stressed,
## stands with the Cuddle dog to get happy, and exercises the condition API.
## Run: godot --headless --path game res://proto3d/tests/moodle_sim.tscn
extends Node

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _cud: ProtoDog


func _ready() -> void:
	var packed: PackedScene = load("res://proto3d/proto3d.tscn")
	main = packed.instantiate()
	add_child(main)
	print("MOODLE: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("MOODLE: PASS - %s" % name)
	else:
		failed += 1
		print("MOODLE: FAIL - %s" % name)


func _tap_interact() -> void:
	var ev := InputEventAction.new()
	ev.action = "interact"
	ev.pressed = true
	Input.parse_input_event(ev)
	var ev2 := InputEventAction.new()
	ev2.action = "interact"
	ev2.pressed = false
	Input.parse_input_event(ev2)


func _key(code: Key, down: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = code
	ev.physical_keycode = code
	ev.pressed = down
	Input.parse_input_event(ev)


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(_delta: float) -> void:
	t += _delta
	phase_t += _delta
	match phase:
		0: # settle; no moodles at rest (fresh character)
			if phase_t > 0.6:
				_check("meters are GONE (no bar nodes on HUD)", not ("_stamina_fill" in main.hud and main.hud.get("_stamina_fill") != null))
				_check("rested character shows no tired moodle", not main.hud.active_moodles.has("tired"))
				_tap_interact() # out of the car
				_next()
		1: # SPRINT until winded -> tired moodle by tiers
			if phase_t > 0.5:
				_key(KEY_SHIFT, true)
				Input.action_press("move_up")
				_next()
		2:
			if main.hud.active_moodles.get("tired", 0) >= 2:
				_check("sprinting -> tired moodle escalates (tier %d, stamina %.0f)" % [main.hud.active_moodles["tired"], main.player.stamina], true)
				_key(KEY_SHIFT, false)
				Input.action_release("move_up")
				_next()
			elif phase_t > 8.0:
				_check("sprinting -> tired moodle escalates (stamina %.0f)" % main.player.stamina, false)
				_key(KEY_SHIFT, false)
				Input.action_release("move_up")
				_next()
		3: # stress moodle tiers
			if phase_t > 0.4:
				main.stress = 85.0
				_next()
		4:
			if phase_t > 0.3:
				_check("stress 85 -> panic moodle (tier 3)", main.hud.active_moodles.get("stress", 0) == 3)
				main.stress = 40.0
				_next()
		5:
			if phase_t > 0.3:
				_check("stress 40 -> worried moodle (tier 1)", main.hud.active_moodles.get("stress", 0) == 1)
				main.stress = 5.0
				_next()
		6: # happy: adopt the Cuddle dog and stand with her
			if phase_t > 0.3:
				for d in main.all_dogs:
					if d.dog_type == ProtoDog.DogType.CUDDLE:
						_cud = d
						break
				main.player.global_position = _cud.global_position + Vector3(1.0, 0, 0)
				main.player.velocity = Vector3.ZERO
				_next()
		7:
			if phase_t > 0.5:
				_tap_interact()
				_next()
		8:
			if main.hud.active_moodles.get("happy", 0) >= 2:
				_check("Cuddle dog at your side + calm mind -> 😊 happy moodle", true)
				_next()
			elif phase_t > 4.0:
				_check("Cuddle dog at your side + calm mind -> 😊 happy moodle", false)
				_next()
		9: # condition API: one call = one feeling (drunk/sick/high future hooks)
			if phase_t > 0.3:
				main.hud.set_condition("drunk", 2)
				main.hud.set_condition("sick", 3)
				_next()
		10:
			if phase_t > 0.3:
				_check("set_condition: drunk tier 2 shows 🥴", main.hud.active_moodles.get("drunk", 0) == 2)
				_check("set_condition: sick tier 3 shows 🤮", main.hud.active_moodles.get("sick", 0) == 3)
				main.hud.set_condition("drunk", 0)
				_next()
		11:
			if phase_t > 0.3:
				_check("clearing a condition hides its moodle", not main.hud.active_moodles.has("drunk"))
				_next()
		12:
			print("MOODLE RESULTS: %d passed, %d failed" % [passed, failed])
			print("MOODLE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 40.0:
		print("MOODLE: TIMEOUT in phase %d" % phase)
		print("MOODLE RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
