## Vision cone proof — input-driven: the cone follows your real facing, narrows
## through binoculars, widens in the car, and the dimmer layer sits under the HUD.
## Run: godot --headless --path game res://proto3d/tests/vision_sim.tscn
extends Node

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0


func _ready() -> void:
	var packed: PackedScene = load("res://proto3d/proto3d.tscn")
	main = packed.instantiate()
	add_child(main)
	print("VISION: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("VISION: PASS - %s" % name)
	else:
		failed += 1
		print("VISION: FAIL - %s" % name)


func _tap_interact() -> void:
	var ev := InputEventAction.new()
	ev.action = "interact"
	ev.pressed = true
	Input.parse_input_event(ev)


func _key(code: Key, down: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = code
	ev.physical_keycode = code
	ev.pressed = down
	Input.parse_input_event(ev)


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # driving: wide cone
			if phase_t > 2.0:
				_check("cone exists under the HUD (layers 1 < 2)", main.vision_cone != null and main.vision_cone.layer < main.hud.layer)
				_check("DRIVING cone is wide (%.2f rad)" % main.vision_cone.current_half_angle(), main.vision_cone.current_half_angle() > 1.38)
				_tap_interact()
				_next()
		1: # on foot: normal cone; walk EAST so facing flips
			if phase_t > 2.0:
				_check("FOOT cone narrows from drive (%.2f rad)" % main.vision_cone.current_half_angle(), main.vision_cone.current_half_angle() < 1.32)
				Input.action_press("move_right")
				_next()
		2:
			if phase_t > 1.2:
				Input.action_release("move_right")
				var d: Vector2 = main.vision_cone.current_dir()
				_check("cone FOLLOWS real facing (walked east: dir.x=%.2f)" % d.x, d.x > 0.8)
				_key(KEY_B, true)
				_next()
		3: # binoculars: narrow lens
			if phase_t > 1.6:
				_check("BINOCULARS narrow the cone (%.2f rad)" % main.vision_cone.current_half_angle(), main.vision_cone.current_half_angle() < 0.7)
				_key(KEY_B, false)
				_next()
		4:
			if phase_t > 1.6:
				_check("lowering the glass restores the cone (%.2f rad)" % main.vision_cone.current_half_angle(), main.vision_cone.current_half_angle() > 1.0)
				_next()
		5:
			print("VISION RESULTS: %d passed, %d failed" % [passed, failed])
			print("VISION: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 30.0:
		print("VISION: TIMEOUT in phase %d" % phase)
		print("VISION RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
