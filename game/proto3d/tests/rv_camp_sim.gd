## Proof for the RV CAMP + HUNGER (RV_PLAN rungs 1,3,4): hunger drains on the
## game clock and taxes your lungs, food (rows) feeds it, the Homestead grows a
## camp kit, camp deploys a bed + stove + light, the stove turns meat into a hot
## meal, and driving off stows the whole thing itself.
## Run: godot --headless --path game res://proto3d/tests/rv_camp_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RVC: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("RVC: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("RVC: WATCHDOG")
		print("RVC: FAILURES PRESENT")
		get_tree().quit(1))
	Engine.time_scale = 2.5
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main._exit_car()

	# --- HUNGER: the clock drains it, food feeds it, the lungs pay --------------
	main.character.hunger = 100.0
	main.daynight.hour += 3.0
	for _i in 5:
		await get_tree().physics_frame
	_check("HUNGER drains on the game clock (100 → %.0f)" % main.character.hunger,
		main.character.hunger < 95.0)
	main.character.hunger = 10.0
	for _i in 3:
		await get_tree().physics_frame
	_check("an empty belly EMPTIES the lungs (regen ×%.2f)" % main.character.hunger_stamina_mult(),
		main.character.hunger_stamina_mult() < 0.75)
	_check("…and the moodle column says so (hungry tier %d)" % main.hud._conditions.get("hungry", 0),
		main.hud._conditions.get("hungry", 0) >= 2)
	main.backpack.add("canned_food", 1)
	main.use_item("canned_food")
	_check("FOOD feeds it back (row's food_val: %.0f)" % main.character.hunger, main.character.hunger >= 40.0)

	# --- THE HOMESTEAD grows its camp kit ------------------------------------------
	var rv := ProtoCar3D.create("rv", Color(0.5, 0.46, 0.4))
	main.add_child(rv)
	rv.global_position = main.player.global_position + Vector3(8, 1.0, 0)
	main.cars.append(rv)
	var kit: ProtoCamp = null
	for _i in 10:
		await get_tree().physics_frame
		for n in main.get_children():
			if n is ProtoCamp:
				kit = n
	_check("the camper GROWS its kit (the RV law)", kit != null and kit.rv == rv)

	# --- MAKE CAMP: bed + stove + a light against the dark --------------------------
	kit.interact(main)
	await get_tree().physics_frame
	_check("camp DEPLOYS (bed + stove standing)", kit.deployed and kit._bed != null and kit._stove != null)
	main.backpack.add("meat", 1)
	kit._stove.interact(main)
	_check("the STOVE cooks (meat → hot camp meal)", main.backpack.count("cooked_meal") == 1
		and main.backpack.count("meat") == 0)
	main.character.hunger = 20.0
	main.use_item("cooked_meal")
	_check("the hot meal is the BEST meal (hunger 20 → %.0f)" % main.character.hunger,
		main.character.hunger >= 75.0)

	# --- Drive off: the camp stows itself ---------------------------------------------
	rv.linear_velocity = -rv.global_basis.z * 6.0
	for _i in 30:
		await get_tree().physics_frame
		if not kit.deployed:
			break
		rv.linear_velocity = -rv.global_basis.z * 6.0
	_check("driving off STOWS the camp itself", not kit.deployed)

	Engine.time_scale = 1.0
	print("RVC RESULTS: %d passed, %d failed" % [passed, failed])
	print("RVC: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
