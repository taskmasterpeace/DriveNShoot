## Proof for GET-UP STAMINA SCALING (HANDOFF #6 last gap): a shootdodge landed while
## GASSED leaves you on the ground LONGER (getup_time × 1.0..1.9) — vulnerable when
## you're spent. Drives the REAL dive path (exit car, SPACE), isolated from dive_sim.
## Run: godot --headless --path game res://proto3d/tests/getup_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GETUP: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _dive_at(p, stam: float) -> float:
	# Stand up, set stamina, SPACE — liftoff sets _getup_dur from stamina-after-cost.
	p.move_state = ProtoPlayer3D.FootState.NORMAL
	Engine.time_scale = 1.0
	await get_tree().physics_frame
	p.stamina = stam
	Input.action_press("jump")
	await get_tree().physics_frame
	Input.action_release("jump")
	await get_tree().physics_frame
	return p._getup_dur


func _ready() -> void:
	print("GETUP: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("GETUP: WATCHDOG"); print("GETUP: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	main._exit_car()
	var p = main.player
	p.global_position = Vector3(6, 0.35, 388) # open shoulder, like dive_sim
	p.velocity = Vector3.ZERO
	for _i in 4:
		await get_tree().physics_frame

	var fresh: float = await _dive_at(p, p.max_stamina) # full tank → fastest up (×1.0)
	_check("a FRESH dive fired and set a get-up (%.2fs)" % fresh, fresh > 0.0)
	var gassed: float = await _dive_at(p, 3.0) # nearly spent → slowest up (→×1.9)
	_check("a GASSED dive keeps you down LONGER (%.2fs > %.2fs)" % [gassed, fresh], gassed > fresh + 0.05)
	_check("get-up stays in the ×1.0–1.9 band", fresh >= p.getup_time - 0.001 and gassed <= p.getup_time * 1.9 + 0.001)

	Engine.time_scale = 1.0
	print("GETUP RESULTS: %d passed, %d failed" % [passed, failed])
	print("GETUP: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
