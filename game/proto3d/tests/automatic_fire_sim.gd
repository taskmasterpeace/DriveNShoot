## Automatic weapons use the real fire latch and the weapon's one cooldown gate.
## A held automatic repeats; a held semi fires once; release stops immediately.
## Run: Godot --headless --path game res://proto3d/tests/automatic_fire_sim.tscn
extends Node

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("AUTOFIRE: %s - %s" % ["PASS" if ok else "FAIL", label])


func _fire_event(pressed: bool) -> InputEventAction:
	var event := InputEventAction.new()
	event.action = "drivn_fire"
	event.pressed = pressed
	return event


func _ready() -> void:
	print("AUTOFIRE: start")
	get_tree().create_timer(20.0).timeout.connect(func() -> void:
		print("AUTOFIRE: WATCHDOG")
		get_tree().quit(1))

	if not ProtoWeapon.WEAPONS.has("scrap_smg"):
		_check("the Scrap SMG weapon row exists", false)
		_finish()
		return
	_check("the Scrap SMG declares automatic fire",
		ProtoWeapon.new("scrap_smg").is_automatic())
	_check("the pistol remains semi automatic",
		not ProtoWeapon.new("pistol").is_automatic())

	var main: Node3D = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main.set_physics_process(false)
	if main.active_car != null:
		main._exit_car()
	main.mode = main.Mode.FOOT
	main.aim_override = Vector3.FORWARD

	var smg := ProtoWeapon.new("scrap_smg")
	main.weapons = [smg]
	main.equipped = 0
	main._unhandled_input(_fire_event(true))
	for _i in 37: # 0.617 s at the same fixed cadence as gameplay
		main._physics_process(1.0 / 60.0)
	main._unhandled_input(_fire_event(false))
	var smg_used: int = 30 - smg.mag
	_check("a 0.62 second SMG hold fires 4-7 rounds (%d)" % smg_used,
		smg_used >= 4 and smg_used <= 7)
	var released_mag: int = smg.mag
	for _i in 24:
		main._physics_process(1.0 / 60.0)
	_check("release stops automatic fire immediately", smg.mag == released_mag)

	var pistol := ProtoWeapon.new("pistol")
	main.weapons = [pistol]
	main.equipped = 0
	main._unhandled_input(_fire_event(true))
	for _i in 37:
		main._physics_process(1.0 / 60.0)
	main._unhandled_input(_fire_event(false))
	_check("holding a semi-auto pistol consumes exactly one round", pistol.mag == 11)

	_stop_audio(main)
	# Give the MP3 mixer a real-time drain window before freeing its owners. A
	# single render frame is occasionally too short in a long sequential suite.
	await get_tree().create_timer(0.12, true, false, true).timeout
	main.queue_free()
	await get_tree().process_frame
	await get_tree().process_frame
	main = null
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
	print("AUTOFIRE RESULTS: %d passed, %d failed" % [passed, failed])
	print("AUTOFIRE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
