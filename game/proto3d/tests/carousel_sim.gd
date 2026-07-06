## Proof for THE CAROUSEL (rungs 1-3): bases load as rows and stand in the world,
## the POWER objective + SPIN-UP defense lights a gate, the reward pays out, and
## the JUMP obeys the law — flesh moves, the CAR STAYS, a cell burns, you arrive
## sick. THE PAIR: two active nodes link in ring order.
## Run: godot --headless --path game res://proto3d/tests/carousel_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CRSL: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("CRSL: start")
	get_tree().create_timer(130.0).timeout.connect(func() -> void:
		print("CRSL: WATCHDOG")
		print("CRSL: FAILURES PRESENT")
		get_tree().quit(1))
	Engine.time_scale = 3.0 # the spin-up is real-time; the sim needn't be
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- Rung 1: the ring loads from data ---------------------------------------
	var crsl: ProtoCarousel = main.carousel
	_check("carousel.json loads (%d bases)" % crsl.data.get("bases", []).size(),
		crsl.data.get("bases", []).size() >= 10)
	_check("every base stands as a GATE in the world", crsl.gates.size() == crsl.data["bases"].size())
	var bellamy: Variant = crsl.gates["camp_bellamy"]
	_check("the tutorial gate is DORMANT dead metal", bellamy.state == "dormant")

	# --- Rung 2: power objective → SPIN-UP → active + reward --------------------
	main._exit_car()
	main.player.global_position = bellamy.global_position + Vector3(4, 0.5, 0) # staging
	main.backpack.add("jerry_can", 1)
	bellamy.interact(main) # socket the can
	_check("power socketed → THE SPIN-UP begins (loud)", bellamy.state == "spinup")
	var t := 0.0
	while bellamy.state == "spinup" and t < 60.0:
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
	_check("the gate survives its waves and goes ACTIVE", bellamy.state == "active")
	_check("the node is PERMANENTLY yours", crsl.active.get("camp_bellamy", false))
	var reward_found := false
	for node in main.get_children():
		if node is ProtoChest and (node as ProtoChest).container.count("power_cell") > 0:
			reward_found = true
	_check("the room PAYS OUT (a cache with power cells)", reward_found)

	# --- Rung 3: THE JUMP — flesh, not steel ------------------------------------
	crsl.set_active("norfolk_yard") # the second door (staging; earning it = same loop)
	main.backpack.add("power_cell", 2)
	var car_pos: Vector3 = main.cars[0].global_position
	var stress0: float = main.stress
	var cells0: int = main.backpack.count("power_cell")
	bellamy.interact(main) # active gate → JUMP
	await get_tree().physics_frame
	var norfolk: Variant = crsl.gates["norfolk_yard"]
	_check("the ring SPUN you to the next active node (%.0fm away)" %
		main.player.global_position.distance_to(norfolk.global_position),
		main.player.global_position.distance_to(norfolk.global_position) < 15.0)
	_check("your RIG did not travel (three states behind)", main.cars[0].global_position.distance_to(car_pos) < 1.0)
	_check("a cell burned (%d → %d)" % [cells0, main.backpack.count("power_cell")],
		main.backpack.count("power_cell") == cells0 - 1)
	_check("you arrive SICK (stress %.0f → %.0f)" % [stress0, main.stress], main.stress > stress0 + 10.0)
	_check("the jump SICKNESS is on screen (white-tear flash live)", main.hud.jump_flash_active())

	# No second door beyond these two: jumping from norfolk lands back at bellamy (the PAIR loops).
	main.backpack.add("power_cell", 1)
	norfolk.interact(main)
	await get_tree().physics_frame
	_check("THE PAIR loops the other way", main.player.global_position.distance_to(bellamy.global_position) < 15.0)

	Engine.time_scale = 1.0
	print("CRSL RESULTS: %d passed, %d failed" % [passed, failed])
	print("CRSL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
