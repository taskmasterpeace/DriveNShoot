## Proof for THE FIRST RUN: the onboarding chain arms on NEW GAME, advances beat
## by beat on REAL game state (distance driven, out of the car, pack grew, home),
## retires itself at the end, and survives a save/load round-trip. Staging the
## car/player position is the documented sim exception; every ADVANCE is the real
## completion check firing, not a forced index.
## Run: godot --headless --path game res://proto3d/tests/objective_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("OBJ: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("OBJ: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("OBJ: WATCHDOG")
		print("OBJ: FAILURES PRESENT")
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	var o = main.objectives
	_check("objectives node exists, dormant until NEW GAME", o != null and not o.active)

	# --- NEW GAME arms the first beat -------------------------------------------
	main.begin_new_game()
	_check("begin_new_game arms beat 0 (DRIVE)", o.active and o.index == 0)
	_check("HUD shows the guiding line", main.hud._objective_label != null and not main.hud._objective_label.text.is_empty())

	# --- Beat 0: DROVE (car travels past the threshold) -------------------------
	main.mode = main.Mode.DRIVE
	main.active_car.global_position += Vector3(0, 0, -60) # 60 m down the road
	o.tick(0.3)
	_check("drove 60 m → advance to PULL OVER", o.index == 1)

	# a fresh check must NOT advance without the condition
	o.tick(0.3)
	_check("still on PULL OVER while in the car", o.index == 1)

	# --- Beat 1: ON FOOT --------------------------------------------------------
	main.mode = main.Mode.FOOT
	o.tick(0.3)
	_check("stepped out → advance to SCAVENGE", o.index == 2)

	# --- Beat 2: LOOTED (the pack grows) ----------------------------------------
	o.tick(0.3)
	_check("no advance until the pack grows", o.index == 2)
	main.backpack.add("scrap", 1)
	o.tick(0.3)
	_check("scavenged → advance to GO HOME", o.index == 3)

	# --- Beat 3: AT HOME → the whole arc retires --------------------------------
	main.player.global_position = ProtoObjectives.HOME
	o.tick(0.3)
	_check("reached the safehouse → chain RETIRES", not o.active and o.index >= ProtoObjectives.BEATS.size())
	_check("HUD line cleared when done", main.hud._objective_label.text.is_empty())

	# --- Save/load round-trip mid-onboarding ------------------------------------
	o.arm()
	main.mode = main.Mode.FOOT
	o.tick(0.3) # kick it off PULL OVER... it's on beat 0 (drove); force to a mid beat
	o.index = 2
	o._enter_beat()
	var rec: Dictionary = o.to_record()
	o.active = false
	o.index = -1
	o.from_record(rec)
	_check("save/load restores mid-onboarding beat", o.active and o.index == 2)

	print("OBJ RESULTS: %d passed, %d failed" % [passed, failed])
	print("OBJ: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
