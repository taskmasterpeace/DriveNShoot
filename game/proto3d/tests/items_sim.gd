## Headless proof for the inventory expansion (2026-07-05): 12 new items with
## REAL effects through existing systems (fuel, car Damageables, body/treat,
## stress, stamina, night light, fog-of-war map), catalog/price integrity, and
## the container panel's category QoL (headers, tooltips, honest load line).
## Run: godot --headless --path game res://proto3d/tests/items_sim.tscn
extends Node

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0


func _ready() -> void:
	var packed: PackedScene = load("res://proto3d/proto3d.tscn")
	main = packed.instantiate()
	add_child(main)
	print("ITM: scene up")


func _check(check_name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("ITM: PASS - %s" % check_name)
	else:
		failed += 1
		print("ITM: FAIL - %s" % check_name)


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # catalog + price integrity (data discipline: a row is COMPLETE or it doesn't ship)
			if phase_t > 0.6:
				var items: Dictionary = ProtoContainer.ITEMS
				_check("catalog grew to a real arsenal (%d items, want >=27)" % items.size(), items.size() >= 27)
				var complete := true
				var priced := true
				for id in items:
					if not items[id].has("cat") or String(items[id].get("desc", "")) == "":
						complete = false
					if id != "scrip" and not ProtoNPC.PRICES.has(id):
						priced = false
				_check("every item has a category + a tooltip desc", complete)
				_check("every tradeable item has a PRICE (Mercy can stock anything)", priced)
				# THE DATA-SPINE READ-BACK (roadmap #3): 'field_ration' exists ONLY in
				# data/items.json — its presence proves a JSON row becomes a real item.
				_check("a JSON-only row folded in ('field_ration' from items.json)",
					items.has("field_ration") and String(items["field_ration"].get("cat", "")) == "food" and bool(items["field_ration"].get("usable", false)))
				# …and the code floor is authoritative — JSON can't corrupt an existing id.
				_check("code stays the floor (pistol still weapon, 1.1kg)",
					String(items["pistol"]["cat"]) == "weapon" and absf(float(items["pistol"]["w"]) - 1.1) < 0.01)
				# LOOT read-back: chests can ROLL from data/loot_tables.json (was hardcoded).
				_check("loot table 'chest_common' loads from data", ProtoContainer.has_loot_table("chest_common"))
				var rngA := RandomNumberGenerator.new(); rngA.seed = 42
				var rngB := RandomNumberGenerator.new(); rngB.seed = 42
				var rollA: Dictionary = ProtoContainer.roll_loot("chest_common", rngA)
				var rollB: Dictionary = ProtoContainer.roll_loot("chest_common", rngB)
				_check("a seeded loot roll is DETERMINISTIC", rollA == rollB)
				var all_real := true
				for lid in rollA:
					if not items.has(lid):
						all_real = false
				_check("every rolled item is a real catalog row (%s)" % str(rollA.keys()), all_real and not rollA.is_empty())
				# PRICES read-back: field_ration is priced ONLY in data/prices.json now.
				_check("a JSON price folded in (field_ration = 6 scrip from prices.json)",
					ProtoNPC.PRICES.get("field_ration", -1) == 6)
				_check("Mercy actually stocks the new goods", ProtoNPC.ARCHETYPES["trader"]["stock"].has("medkit")
					and ProtoNPC.ARCHETYPES["trader"]["stock"].has("jerry_can"))
				_next()
		1: # water + coffee + whiskey (body & mind through existing vitals)
			if phase_t > 0.2:
				main.player.stamina = 10.0
				main.backpack.add("water", 1)
				_check("canteen refills stamina", main.use_item("water") and main.player.stamina >= main.player.max_stamina - 0.01)
				main.stress = 60.0
				main.backpack.add("whiskey", 1)
				var torso_before: float = main.character.body["torso"].ratio()
				_check("whiskey calms hard (60->%.0f) but the torso pays" % maxf(0.0, 60.0 - 30.0),
					main.use_item("whiskey") and main.stress <= 30.5 and main.character.body["torso"].ratio() < torso_before)
				_next()
		2: # medkit treats EVERYTHING (vs the bandage's one part)
			if phase_t > 0.2:
				main.character.body["l_arm"].damage(30.0)
				main.character.body["r_leg"].damage(40.0)
				main.bleeding = 2
				var arm: float = main.character.body["l_arm"].ratio()
				var leg: float = main.character.body["r_leg"].ratio()
				_check("medkit stops bleeding + treats every part",
					main.use_item("medkit") and main.bleeding == 0
					and main.character.body["l_arm"].ratio() > arm and main.character.body["r_leg"].ratio() > leg)
				_next()
		3: # the garage in a bag: fuel, parts, rubber (player boots INSIDE the car)
			if phase_t > 0.2:
				var rig: ProtoCar3D = main.active_car
				_check("booted at the wheel (rig in reach)", rig != null)
				rig.fuel = 45.0
				_check("jerry can pours 40%% in (45->%d)" % int(minf(100.0, 85.0)), main.use_item("jerry_can") and absf(rig.fuel - 85.0) < 0.01)
				rig.components["engine"].damage(60.0)
				var eng: float = rig.components["engine"].ratio()
				_check("car parts rebuild the worst component", main.use_item("car_parts") and rig.components["engine"].ratio() > eng)
				rig.components["tires"].damage(55.0)
				var tir: float = rig.components["tires"].ratio()
				_check("tire kit patches the rubber", main.use_item("tire_kit") and rig.components["tires"].ratio() > tir)
				_check("duct tape holds the chassis together", (func() -> bool:
					rig.components["chassis"].damage(20.0)
					var ch: float = rig.components["chassis"].ratio()
					return main.use_item("duct_tape") and rig.components["chassis"].ratio() > ch).call())
				_next()
		4: # flare = 30 s of light; map fragment = somebody's road knowledge
			if phase_t > 0.2:
				_check("flare drops a burning light", main.use_item("flare")
					and get_tree().get_nodes_in_group("flare_light").size() == 1)
				var seen_before: int = main.stream.visited.size()
				_check("map fragment marks a town on YOUR map (+%d chunks)" % 49,
					main.use_item("map_fragment") and main.stream.visited.size() >= seen_before + 40)
				_next()
		5: # panel QoL: category headers, tooltips, honest load line
			if phase_t > 0.2:
				main.backpack.add("pistol", 1)
				main.backpack.add("9mm", 12)
				main.backpack.add("bandage", 2)
				main.backpack.add("water", 1)
				main.backpack.add("duct_tape", 1)
				main.backpack.add("scrap", 3)
				main.panel.open(main.backpack)
				var headers := 0
				var tooltips := 0
				for child in main.panel._left_box.get_children():
					if child is Label and (child as Label).text.begins_with("—"):
						headers += 1
					if child is HBoxContainer:
						for sub in child.get_children():
							if sub is Button and (sub as Button).tooltip_text != "":
								tooltips += 1
								break
				_check("the pack reads as a KIT LIST (%d category headers, want >=4)" % headers, headers >= 4)
				_check("rows carry tooltips (%d)" % tooltips, tooltips >= 5)
				_check("load line is honest kg", main.panel._load_label.text.contains("kg"))
				main.panel.close()
				_next()
		6:
			print("ITM RESULTS: %d passed, %d failed" % [passed, failed])
			print("ITM: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 30.0:
		print("ITM: TIMEOUT in phase %d" % phase)
		print("ITM RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
