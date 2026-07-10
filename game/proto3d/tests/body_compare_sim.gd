## Phase 1 of body comparison: keyboard/mouse and pad-shaped sources must
## collapse into the exact same immutable command packet and edge grammar.
## Run: Godot --headless --path game res://proto3d/tests/body_compare_sim.tscn
extends Node

const COMMAND_PATH := "res://proto3d/tools/physics_lab/lab_command.gd"
const INPUT_PATH := "res://proto3d/tools/physics_lab/lab_input.gd"

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("BODY_COMPARE: %s - %s" % ["PASS" if ok else "FAIL", label])


func _same(a: Variant, b: Variant) -> bool:
	for field in ["move", "aim_world", "sprint", "dive_pressed", "fire_pressed",
			"fire_held", "fire_released", "reload_pressed", "throw_pressed",
			"throw_held", "throw_released", "radial_pressed", "radial_held",
			"radial_released", "interact_pressed"]:
		if a.get(field) != b.get(field):
			print("BODY_COMPARE: mismatch %s: %s != %s" % [field, a.get(field), b.get(field)])
			return false
	return true


func _ready() -> void:
	print("BODY_COMPARE: start")
	get_tree().create_timer(15.0).timeout.connect(func() -> void:
		print("BODY_COMPARE: WATCHDOG")
		get_tree().quit(1))
	if not ResourceLoader.exists(COMMAND_PATH) or not ResourceLoader.exists(INPUT_PATH):
		_check("the shared lab command and input components exist", false)
		_finish()
		return

	var input_script: Script = load(INPUT_PATH) as Script
	var keyboard: Variant = input_script.new()
	var pad: Variant = input_script.new()
	var kb_raw := {"keyboard": {
		"move": Vector2(0.6, -0.8), "aim_world": Vector3(0.8, 0, -0.6),
		"sprint": true, "dive": true, "fire": true, "reload": true,
		"throw": true, "radial": true, "interact": true}}
	var pad_raw := {"pad": {
		"move": Vector2(0.6, -0.8), "aim_world": Vector3(0.8, 0, -0.6),
		"sprint": true, "dive": true, "fire": true, "reload": true,
		"throw": true, "radial": true, "interact": true}}
	keyboard.feed_for_test(kb_raw)
	pad.feed_for_test(pad_raw)
	var kb_first: Variant = keyboard.sample(null, Vector3.ZERO, 1.0 / 60.0)
	var pad_first: Variant = pad.sample(null, Vector3.ZERO, 1.0 / 60.0)
	_check("keyboard/mouse and pad normalize to identical commands", _same(kb_first, pad_first))
	_check("first held frame emits each pressed edge once",
		kb_first.fire_pressed and kb_first.throw_pressed and kb_first.radial_pressed
		and kb_first.dive_pressed and kb_first.reload_pressed and kb_first.interact_pressed)

	var held: Variant = keyboard.sample(null, Vector3.ZERO, 1.0 / 60.0)
	_check("held inputs persist without repeating press edges",
		held.fire_held and held.throw_held and held.radial_held
		and not held.fire_pressed and not held.throw_pressed and not held.radial_pressed)

	keyboard.feed_for_test({"keyboard": {"move": Vector2.ZERO,
		"aim_world": Vector3.FORWARD, "fire": false, "throw": false, "radial": false}})
	var released: Variant = keyboard.sample(null, Vector3.ZERO, 1.0 / 60.0)
	_check("release edges occur exactly once",
		released.fire_released and released.throw_released and released.radial_released)
	var after: Variant = keyboard.sample(null, Vector3.ZERO, 1.0 / 60.0)
	_check("release edges clear on the next frame",
		not after.fire_released and not after.throw_released and not after.radial_released)

	var copy: Variant = kb_first.duplicate_frame()
	kb_first.move = Vector3.ZERO
	_check("duplicate_frame is isolated from later mutation", copy.move != kb_first.move)
	_check("command stamps advance monotonically",
		int(held.stamp) == int(kb_first.stamp) + 1)
	_finish()


func _finish() -> void:
	print("BODY_COMPARE RESULTS: %d passed, %d failed" % [passed, failed])
	print("BODY_COMPARE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
