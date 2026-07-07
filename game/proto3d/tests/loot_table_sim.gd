## Proof for THE FURNISHER's data layer: furniture loot TABLES roll what their
## flavor promises. kitchen_cabinet skews food, never weapons; gun_safe skews
## guns/ammo; weights land within tolerance over a big seeded sample; the literal
## "empty" row is headroom the resolver drops, never a real drop.
## Run: godot --headless --path game res://proto3d/tests/loot_table_sim.tscn
extends Node

var passed := 0
var failed := 0
const N := 200


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("LOOT: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("LOOT: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("LOOT: WATCHDOG")
		print("LOOT: FAILURES PRESENT")
		get_tree().quit(1))

	# --- kitchen_cabinet: food-tagged, NEVER a weapon, over N seeded rolls -------
	var kitchen_food := 0
	var kitchen_weapon := 0
	var kitchen_empty_leaked := false
	for i in N:
		var rng := RandomNumberGenerator.new()
		rng.seed = hash("loot_table_sim:kitchen:%d" % i)
		var loot: Dictionary = ProtoLootResolver.resolve("kitchen_cabinet", "", "", null, rng)
		if loot.has("empty"):
			kitchen_empty_leaked = true
		for item_id in loot:
			var iid := String(item_id)
			if iid == "canned_food" or iid == "coffee":
				kitchen_food += 1
			if iid == "pistol" or iid == "shotgun" or iid == "9mm" or iid == "12ga":
				kitchen_weapon += 1
	_check("kitchen cabinet rolls food often (%d/%d rolls had food)" % [kitchen_food, N], kitchen_food > N / 4)
	_check("kitchen cabinet NEVER rolls a weapon (%d weapon hits/%d)" % [kitchen_weapon, N], kitchen_weapon == 0)
	_check("the literal 'empty' row never leaks into a real drop", not kitchen_empty_leaked)

	# --- gun_safe: guns/ammo skewed, over N seeded rolls ------------------------
	var safe_weapon := 0
	var safe_food := 0
	for i in N:
		var rng := RandomNumberGenerator.new()
		rng.seed = hash("loot_table_sim:safe:%d" % i)
		var loot: Dictionary = ProtoLootResolver.resolve("gun_safe", "", "", null, rng)
		for item_id in loot:
			var iid := String(item_id)
			if iid == "pistol" or iid == "shotgun" or iid == "9mm" or iid == "12ga" or iid == "gun_oil":
				safe_weapon += 1
			if iid == "canned_food":
				safe_food += 1
	_check("gun safe rolls guns/ammo often (%d/%d rolls had one)" % [safe_weapon, N], safe_weapon > N / 2)
	_check("gun safe never rolls food (%d hits/%d)" % [safe_food, N], safe_food == 0)

	# --- Building-type weight_mult: farmhouse should show MORE food than a bare
	# fridge with no building context (weight_mult.food = 1.4 in building_types.json) --
	var bare_food_hits := 0
	var farm_food_hits := 0
	for i in N:
		var rng_bare := RandomNumberGenerator.new()
		rng_bare.seed = hash("loot_table_sim:bare_fridge:%d" % i)
		var loot_bare: Dictionary = ProtoLootResolver.resolve("fridge", "", "", null, rng_bare)
		for item_id in loot_bare:
			if String(item_id) in ["canned_food", "water", "meat"]:
				bare_food_hits += 1
		var rng_farm := RandomNumberGenerator.new()
		rng_farm.seed = hash("loot_table_sim:farm_fridge:%d" % i)
		var loot_farm: Dictionary = ProtoLootResolver.resolve("fridge", "farmhouse", "", null, rng_farm)
		for item_id in loot_farm:
			if String(item_id) in ["canned_food", "water", "meat"]:
				farm_food_hits += 1
	_check("farmhouse weight_mult skews a fridge's food UP (bare %d vs farmhouse %d over %d)" %
		[bare_food_hits, farm_food_hits, N], farm_food_hits > bare_food_hits)

	# --- Deterministic: same seed -> identical roll (the fairness/debug law) ----
	var rng_a := RandomNumberGenerator.new()
	rng_a.seed = hash("loot_table_sim:determinism")
	var loot_a: Dictionary = ProtoLootResolver.resolve("closet", "house", "", null, rng_a)
	var rng_b := RandomNumberGenerator.new()
	rng_b.seed = hash("loot_table_sim:determinism")
	var loot_b: Dictionary = ProtoLootResolver.resolve("closet", "house", "", null, rng_b)
	_check("same seed -> BIT-IDENTICAL roll", loot_a.hash() == loot_b.hash())

	print("LOOT RESULTS: %d passed, %d failed" % [passed, failed])
	print("LOOT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
