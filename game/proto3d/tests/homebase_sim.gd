## Proof for HOME BASE: the ladder buys with scrap/scrip, walls RISE (and thin the
## metaworld's raid odds), the garage + kennel earn on the game clock, the
## workbench is scrap's sink, and the bed sleeps you to dawn.
## Run: godot --headless --path game res://proto3d/tests/homebase_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("HOME: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("HOME: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("HOME: WATCHDOG")
		print("HOME: FAILURES PRESENT")
		get_tree().quit(1))
	Engine.time_scale = 2.5
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	var hb: ProtoHomebase = main.homebase

	# --- The LADDER buys with the raw material -------------------------------
	_check("the board stands at home", hb != null and hb.interact_prompt(main).contains("WALLS I"))
	hb.interact(main) # broke — refused
	_check("no scrap = no walls (the sink pulls you OUT to scavenge)", hb.walls_tier() == 0)
	main.backpack.add("scrap", 80)
	main.backpack.add("scrip", 150)
	main.backpack.add("car_parts", 1)
	for _i in 7:
		hb.interact(main)
	_check("the whole ladder BUILT (walls %d, %d upgrades)" % [hb.walls_tier(), hb.owned.size()],
		hb.owned.size() == 7 and hb.walls_tier() == 3)
	_check("the costs were REAL (scrap spent: %d left)" % main.backpack.count("scrap"),
		main.backpack.count("scrap") < 80 - 60)

	# --- WORKBENCH: scrap in, gear out ----------------------------------------
	var bench: Variant = null
	var bed: Variant = null
	for n in main.get_children():
		if n is ProtoHomebase.Workbench:
			bench = n
		elif n is ProtoHomebase.Bed:
			bed = n
	main.backpack.add("scrap", 2)
	var bandages0: int = main.backpack.count("bandage")
	bench.interact(main)
	_check("the WORKBENCH turns scrap into a bandage", main.backpack.count("bandage") == bandages0 + 1)

	# --- BED: dawn + the weight drops ------------------------------------------
	main.stress = 70.0
	main.daynight.hour = 22.0
	var day0: int = main.daynight.day
	bed.interact(main)
	_check("the BED sleeps you to DAWN (day %d, %02.0f:00)" % [main.daynight.day, main.daynight.hour],
		main.daynight.day == day0 + 1 and is_equal_approx(main.daynight.hour, 6.0))
	_check("…and the weight drops (stress 70 → %.0f)" % main.stress, main.stress <= 40.0)

	# --- GARAGE + KENNEL earn on the clock ---------------------------------------
	var car: ProtoCar3D = main.cars[1] # the parked one
	car.global_position = ProtoHomebase.HOME + Vector3(5, 1, 0)
	car.components["engine"].hp = 40.0
	var dog := ProtoDog.create(ProtoDog.DogType.SECURITY, "Home", "Shepherd")
	main.add_child(dog)
	dog.global_position = ProtoHomebase.HOME + Vector3(3, 0.4, 3)
	dog.adopted = true
	dog._main = main
	dog.hp = 20.0
	for _i in 3:
		await get_tree().physics_frame
	main.daynight.hour += 1.0
	for _i in 10:
		await get_tree().physics_frame
	_check("the GARAGE works the parked rig (engine 40 → %.0f)" % car.components["engine"].hp,
		car.components["engine"].hp > 40.0)
	_check("the KENNEL heals the home dog (20 → %.0f)" % dog.hp, dog.hp > 20.0)

	# --- The metaworld respects the walls ------------------------------------------
	var rec := {"name": "Home", "pos": ProtoHomebase.HOME + Vector3(2, 0, 2), "hp": 20.0}
	main.metaworld.force_raid(rec, 30.0)
	_check("KENNEL law: a home dog gets HURT, never taken (hp %.0f)" % rec["hp"],
		rec["wounded"] and not rec.get("killed", false) and rec["hp"] >= 8.0)
	main.metaworld._rng.seed = 99
	var raids_walled := 0
	for _i in 100:
		var r := {"name": "x", "pos": ProtoHomebase.HOME, "hp": 999.0}
		main.metaworld.offscreen_event(r)
		raids_walled += 1 if r.get("wounded", false) else 0
	hb.owned.clear() # tear the walls down, same seed, same dice
	main.metaworld._rng.seed = 99
	var raids_bare := 0
	for _i in 100:
		var r2 := {"name": "x", "pos": ProtoHomebase.HOME, "hp": 999.0}
		main.metaworld.offscreen_event(r2)
		raids_bare += 1 if r2.get("wounded", false) else 0
	_check("WALLS III thin the raids (%d/100 walled vs %d/100 bare)" % [raids_walled, raids_bare],
		raids_walled < raids_bare / 2)

	Engine.time_scale = 1.0
	print("HOME RESULTS: %d passed, %d failed" % [passed, failed])
	print("HOME: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
