## Proof for CAROUSEL rungs 4-5: every base is a DUNGEON (the occupier wakes on
## approach; power/codes/purge gate the boot; a ruler's troops stand down for a
## trusted name), and the jump has TIERS — PAIR → ROULETTE (the ring chooses) →
## THE DIAL (Cheyenne's core + your map course picks the door).
## Run: godot --headless --path game res://proto3d/tests/carousel2_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CR2: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("CR2: start")
	get_tree().create_timer(110.0).timeout.connect(func() -> void:
		print("CR2: WATCHDOG")
		print("CR2: FAILURES PRESENT")
		get_tree().quit(1))
	Engine.time_scale = 2.5
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main._exit_car()
	var crsl: ProtoCarousel = main.carousel

	# --- THE APPROACH wakes the occupier (at NIGHT — daylight burns a warren off
	# the map, which is the real doctrine: raid howler bases by DAY) --------------
	main.daynight.hour = 0.0
	var bellamy: Variant = crsl.gates["camp_bellamy"] # howler_warren, difficulty 1
	main.player.global_position = bellamy.global_position + Vector3(100, 0.5, 0) # staging: the last mile
	for _i in 30:
		await get_tree().physics_frame
	_check("the WARREN wakes on approach (%d occupiers)" % bellamy.occupiers.size(),
		bellamy._spawned and bellamy.occupiers.size() >= 2)

	# --- CODES: earned, or bought ------------------------------------------------
	var norfolk: Variant = crsl.gates["norfolk_yard"] # objectives: ["codes"]
	norfolk.interact(main) # broke and unknown → refused
	_check("no standing + no scrip = NO CODES", "codes" in norfolk.objectives_left and norfolk.state == "dormant")
	main.backpack.add("scrip", 60)
	norfolk.interact(main) # buys them (nobody asks where they came from)
	_check("scrip BUYS the codes → the boot begins", not ("codes" in norfolk.objectives_left) and norfolk.state == "spinup")

	# --- PURGE: the room must be cleared ------------------------------------------
	var benning: Variant = crsl.gates["fort_benning"] # raider_garrison, ["purge"], diff 3
	benning._spawn_occupation(main)
	_check("the GARRISON holds the room (%d occupiers)" % benning.occupiers.size(), benning.occupiers.size() >= 4)
	benning.interact(main)
	_check("the boot refuses a held room", benning.state == "dormant")
	for o in benning.occupiers:
		if is_instance_valid(o):
			o.take_damage(999.0)
	await get_tree().physics_frame
	benning.interact(main)
	_check("PURGED → the spin-up begins", benning.state == "spinup")

	# --- RESPECT IS A KEY: a ruler's troops stand down ------------------------------
	var bragg: Variant = crsl.gates["fort_bragg"] # ruler_troops, ["codes","purge"], NORTH CAROLINA
	main.respect.add_esteem("NORTH CAROLINA", 300.0)
	bragg._spawn_occupation(main)
	_check("TRUSTED name → the troops STAND DOWN (no purge, no bodies)",
		bragg.occupiers.is_empty() and not ("purge" in bragg.objectives_left))
	bragg.interact(main) # codes earned by the same standing
	_check("…and the ruler VOUCHES the codes → boot", bragg.state == "spinup")

	# --- THE ROULETTE: 3+ doors, the ring chooses ------------------------------------
	crsl.set_active("fort_hood")
	crsl.set_active("nellis_grounds")
	crsl.set_active("bremerton_annex")
	crsl.rng.seed = 5
	main.backpack.add("power_cell", 3)
	_check("ROULETTE: the ring CHOOSES among the others",
		crsl.pick_destination("fort_hood") in ["nellis_grounds", "bremerton_annex"])
	crsl.jump("fort_hood")
	var near_n: float = main.player.global_position.distance_to(crsl.gates["nellis_grounds"].global_position)
	var near_b: float = main.player.global_position.distance_to(crsl.gates["bremerton_annex"].global_position)
	_check("…and the jump LANDS on a lit door (%.0fm / %.0fm)" % [near_n, near_b], minf(near_n, near_b) < 15.0)

	# --- THE DIAL: Cheyenne's core + the map course picks the door -------------------
	main.backpack.add("targeting_core", 1)
	main.set_map_course("🎯 TEST", crsl.gates["bremerton_annex"].global_position)
	_check("THE DIAL locks your course's door", crsl.pick_destination("fort_hood") == "bremerton_annex")
	crsl.jump("fort_hood")
	_check("…and the ring OBEYS the dial (%.0fm off)" % main.player.global_position.distance_to(crsl.gates["bremerton_annex"].global_position),
		main.player.global_position.distance_to(crsl.gates["bremerton_annex"].global_position) < 15.0)

	# --- The UNIQUE rides the reward chest --------------------------------------------
	crsl.gates["fort_hood"]._go_active()
	var found := false
	for n in main.get_children():
		if n is ProtoChest and (n as ProtoChest).container.count("mount_schematic") > 0:
			found = true
	_check("the room PAYS its unique (mount schematic in the cache)", found)

	Engine.time_scale = 1.0
	print("CR2 RESULTS: %d passed, %d failed" % [passed, failed])
	print("CR2: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
