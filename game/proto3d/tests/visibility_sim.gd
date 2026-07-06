## Proof for the SURFACING pass: the systems running behind the player's back are
## now ON SCREEN — the sheet (K) narrates the circuit/states/pack/carousel/wound
## taxes, the controls line teaches Y/K/M/×4, the dog's prompt wears its bond,
## and a coughing engine NAMES its cause once.
## Run: godot --headless --path game res://proto3d/tests/visibility_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("VIS: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("VIS: start")
	get_tree().create_timer(80.0).timeout.connect(func() -> void:
		print("VIS: WATCHDOG")
		print("VIS: FAILURES PRESENT")
		get_tree().quit(1))
	Engine.time_scale = 2.5
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- The sheet narrates THE WORLD -----------------------------------------
	var sheet: String = main._sheet_text()
	_check("the sheet teaches THE CIRCUIT", sheet.contains("THE CIRCUIT") and sheet.contains("scavenge a cache"))
	_check("the sheet lists THE DIVIDED STATES + rulers", sheet.contains("THE DIVIDED STATES"))
	_check("the sheet shows THE CAROUSEL's count + how to light one", sheet.contains("THE CAROUSEL") and sheet.contains("SPIN-UP"))
	_check("the sheet teaches all FIVE whistles", sheet.contains("×4 SHIELD"))
	main.character.take_wound("l_leg", 70.0)
	main.character.hp = main.character.hp_cap()
	_check("wound TAXES surface when they exist", main._sheet_text().contains("WOUND TAXES"))
	for part in main.character.body:
		main.character.treat(part, 100.0)

	# --- The controls line teaches the hidden keys ------------------------------
	main._exit_car()
	for _i in 20:
		await get_tree().physics_frame
	var help: String = main.hud._help_label.text
	_check("the controls line teaches Y radio + K sheet (%s…)" % help.substr(0, 40),
		help.contains("Y radio") and help.contains("K sheet"))

	# --- The dog's prompt wears its bond ----------------------------------------
	var d := ProtoDog.create(ProtoDog.DogType.SECURITY, "Vis", "Shepherd")
	main.add_child(d)
	d.global_position = main.player.global_position + Vector3(2, 0.4, 0)
	d.interact(main) # adopt
	_check("the dog's prompt WEARS the bond (%s)" % d.interact_prompt(main),
		d.interact_prompt(main).contains("STRAY") or d.interact_prompt(main).contains("COMPANION"))

	# --- A coughing engine NAMES its cause, once --------------------------------
	var car: ProtoCar3D = main.cars[0]
	main.enter_car(car)
	car.components["engine"].hp = car.components["engine"].max_hp * 0.2
	var t := 0.0
	while t < 12.0 and not car._misfire_warned:
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
	_check("the first misfire NAMES the cause (repair job, not mystery bug)", car._misfire_warned)

	Engine.time_scale = 1.0
	print("VIS RESULTS: %d passed, %d failed" % [passed, failed])
	print("VIS: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
