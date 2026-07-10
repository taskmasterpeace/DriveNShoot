## One weapon-wheel grammar on mouse and pad: tap cycles, hold opens, direction
## selects, center means fists, and closing restores the exact prior time scale.
## Run: Godot --headless --path game res://proto3d/tests/weapon_radial_sim.tscn
extends Node

const WHEEL_PATH := "res://proto3d/weapon_wheel.gd"

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RADIAL: %s - %s" % ["PASS" if ok else "FAIL", label])


func _mouse(right_down: bool) -> InputEventMouseButton:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_RIGHT
	event.pressed = right_down
	return event


func _rb(down: bool) -> InputEventJoypadButton:
	var event := InputEventJoypadButton.new()
	event.button_index = JOY_BUTTON_RIGHT_SHOULDER
	event.pressed = down
	return event


func _ready() -> void:
	print("RADIAL: start")
	get_tree().create_timer(20.0).timeout.connect(func() -> void:
		Engine.time_scale = 1.0
		print("RADIAL: WATCHDOG")
		get_tree().quit(1))

	if not ResourceLoader.exists(WHEEL_PATH):
		_check("the reusable weapon wheel exists", false)
		_finish()
		return
	var script: Script = load(WHEEL_PATH) as Script
	var wheel: Variant = script.create()
	add_child(wheel)
	var ids: Array[String] = ["fists", "pistol", "scrap_smg", "shotgun"]
	wheel.configure(ids, "pistol")
	_check("tap cycles to the next weapon", wheel.tap_cycle() == "scrap_smg")

	wheel.configure(ids, "pistol")
	wheel.begin_hold()
	wheel.advance_hold(0.10)
	_check("a sub-threshold hold stays closed", not wheel.is_open)
	_check("releasing a short hold remains a tap", wheel.release() == "scrap_smg")

	Engine.time_scale = 0.73
	wheel.configure(ids, "pistol")
	wheel.begin_hold()
	wheel.advance_hold(0.19)
	_check("holding beyond 0.18 seconds opens the radial", wheel.is_open)
	var right_index: int = wheel.selection_for(Vector2.RIGHT)
	wheel.update_pointer(Vector2.RIGHT)
	_check("a rightward pointer selects the right wedge",
		wheel.release() == ids[right_index])
	_check("release closes the wheel", not wheel.is_open)
	_check("closing restores the exact prior time scale",
		absf(Engine.time_scale - 0.73) < 0.001)

	wheel.configure(ids, "shotgun")
	wheel.begin_hold()
	wheel.advance_hold(0.19)
	wheel.update_pointer(Vector2.ZERO)
	_check("the radial center selects fists", wheel.release() == "fists")
	Engine.time_scale = 1.0

	# The real input rows and main action path give RMB and RB identical taps.
	var main: Node3D = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main.set_physics_process(false)
	if main.active_car != null:
		main._exit_car()
	main.mode = main.Mode.FOOT
	main.weapons = [ProtoWeapon.new("pistol"), ProtoWeapon.new("scrap_smg")]
	main.equipped = 0
	main._unhandled_input(_mouse(true))
	main._unhandled_input(_mouse(false))
	_check("RMB tap cycles through the real main input path", main.equipped == 1)
	main.equipped = 0
	main._unhandled_input(_rb(true))
	main._unhandled_input(_rb(false))
	_check("RB tap has parity with RMB", main.equipped == 1)

	_stop_audio(main)
	await get_tree().create_timer(0.12, true, false, true).timeout
	main.queue_free()
	wheel.queue_free()
	await get_tree().process_frame
	await get_tree().process_frame
	call_deferred("_finish")


func _stop_audio(root: Node) -> void:
	for node in root.find_children("*", "AudioStreamPlayer", true, false):
		var player := node as AudioStreamPlayer
		player.stop()
		player.stream = null
	for node in root.find_children("*", "AudioStreamPlayer3D", true, false):
		var player := node as AudioStreamPlayer3D
		player.stop()
		player.stream = null


func _finish() -> void:
	Engine.time_scale = 1.0
	print("RADIAL RESULTS: %d passed, %d failed" % [passed, failed])
	print("RADIAL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
