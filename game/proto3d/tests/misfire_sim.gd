## Proof for DRIVABLE DAMAGE you FEEL (HANDOFF #6 coverage): a CRITICAL engine
## MISFIRES (coughs, cutting power) and a wounded chassis WANDERS (steer_slop) —
## the audit flagged these as "likely works but unproven." Isolated so it can't
## destabilize the phase-based car_sim. Run:
##   godot --headless --path game res://proto3d/tests/misfire_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("MISFIRE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("MISFIRE: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("MISFIRE: WATCHDOG"); print("MISFIRE: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	var car = main.cars[0]
	car.use_player_input = false
	car.input_throttle = 1.0
	# CRITICAL engine, but chassis + tank intact so it can't enter the fire spiral.
	car.components["engine"].hp = car.components["engine"].max_hp * 0.12
	_check("engine is CRITICAL (misfire tier)", car.components["engine"].tier() >= Damageable.Tier.CRITICAL)

	# Drive on the bad engine — it must cough. (Shorten the first cough's countdown
	# so the test doesn't ride the full 1.8–4.2s cycle.)
	car._misfire_cd = 0.2
	var saw_misfire := false
	for _i in 300: # ~5s, plenty for at least one cough
		await get_tree().physics_frame
		if car.misfiring:
			saw_misfire = true
	_check("a CRITICAL engine MISFIRES (coughs, cuts power)", saw_misfire)

	# A wounded chassis makes the rig WANDER (steer_slop) at speed.
	car.components["engine"].hp = car.components["engine"].max_hp # heal so it drives clean
	car.components["chassis"].hp = car.components["chassis"].max_hp * 0.25 # CRITICAL chassis
	for _i in 30:
		await get_tree().physics_frame
	_check("a wounded chassis adds steer SLOP (wander %.3f)" % car.steer_slop, car.steer_slop > 0.0)

	print("MISFIRE RESULTS: %d passed, %d failed" % [passed, failed])
	print("MISFIRE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
