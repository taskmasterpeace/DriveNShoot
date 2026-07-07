## Proof for ⚒ THE TEST GROUNDS (owner: "rebuild the starting location — EVERYTHING
## there for me to test, lay it out, name it useful"): boots the real game and
## asserts the whole fairground stands on the south field — every drivable rig in
## the motor pool, the full armory + stocked supply, self-healing range dummies
## that take real damage, the saddled horse, the penned gator (and that the pen
## HOLDS), the Hunter dig spot, readable Label3D names on everything, and the
## N-menu waypoint. One walk = the whole game.
## Run: godot --headless --path game res://proto3d/tests/test_grounds_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GROUNDS: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _in_rect(p: Vector3) -> bool:
	return ProtoTestGrounds.GROUNDS_RECT.has_point(Vector2(p.x, p.z))


func _ready() -> void:
	print("GROUNDS: start")
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("GROUNDS: WATCHDOG")
		print("GROUNDS: FAILURES PRESENT")
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	var g: ProtoTestGrounds = main.test_grounds
	_check("the TEST GROUNDS stand at boot", g != null)

	# --- 🚗 the motor pool: one of EVERY drivable rig, inside the grounds --------
	var classes: Dictionary = {}
	for car in g.pool_cars:
		if is_instance_valid(car) and _in_rect((car as Node3D).global_position):
			classes[String((car as ProtoCar3D).vclass)] = true
	for want in ["scavenger", "motorcycle", "buggy", "pickup", "van", "semi", "pickup_truck", "rv", "suv"]:
		if not classes.has(want):
			print("GROUNDS:   missing rig: %s" % want)
	_check("the MOTOR POOL parades every drivable class (%d/9)" % classes.size(), classes.size() == 9)
	_check("...and they are REAL cars (enterable — registered in main.cars)",
		main.cars.has(g.pool_cars[0]))

	# --- 🔫 the armory + 🧰 supply: every weapon row + the stock to live on -------
	var have: Dictionary = {}
	for node in g.get_children():
		if node is ProtoChest:
			for id in ["pistol", "shotgun", "pipe_rocket", "wrench", "machete", "axe", "bat",
					"grenade", "mine", "9mm", "12ga", "rocket", "jerry_can", "car_parts",
					"bandage", "meat", "scrip", "drone", "power_cell", "mount_schematic"]:
				if (node as ProtoChest).container.count(id) > 0:
					have[id] = true
	_check("the ARMORY carries EVERY weapon row + its ammo (%d/12)" % [
		int(have.has("pistol")) + int(have.has("shotgun")) + int(have.has("pipe_rocket"))
		+ int(have.has("wrench")) + int(have.has("machete")) + int(have.has("axe"))
		+ int(have.has("bat")) + int(have.has("grenade")) + int(have.has("mine"))
		+ int(have.has("9mm")) + int(have.has("12ga")) + int(have.has("rocket"))],
		have.has("pistol") and have.has("shotgun") and have.has("pipe_rocket") and have.has("wrench")
		and have.has("machete") and have.has("axe") and have.has("bat") and have.has("grenade")
		and have.has("mine") and have.has("9mm") and have.has("12ga") and have.has("rocket"))
	_check("the SUPPLY DEPOT stocks fuel/repair/meds/food/scrip/gadgets",
		have.has("jerry_can") and have.has("car_parts") and have.has("bandage")
		and have.has("meat") and have.has("scrip") and have.has("drone")
		and have.has("power_cell") and have.has("mount_schematic"))

	# --- 🎯 the range: dummies take REAL damage and never wear out ----------------
	_check("the RANGE stands 4 dummies", g.range_targets.size() == 4)
	var t0: Node = g.range_targets[0]
	var hp0: float = t0.hp
	t0.take_damage(18.0)
	_check("a dummy takes real damage (%.0f -> %.0f)" % [hp0, t0.hp], t0.hp == hp0 - 18.0)
	_check("...is MELEEABLE (combatant union)", t0.is_in_group("combatant"))
	t0.take_damage(999.0)
	_check("...and self-heals instead of dying (the range never wears out)", t0.hp > 0.0 and not t0.dead)

	# --- 🐴 the stable + 🐊 the pen ------------------------------------------------
	_check("the STABLE holds a horse", g.horse != null and _in_rect(g.horse.global_position))
	_check("the GATOR waits in its pen", g.gator != null and not g.gator.dead
		and g.gator.state == ProtoGator.GState.AMBUSH)
	# Poke the pen: trigger a lunge from inside knowledge, let it play out, and
	# assert the WALLS held (it can never roam the fairground).
	var pen_center := Vector3(170, 0.15, 266)
	g.gator._linger.clear()
	for _i in 400:
		await get_tree().physics_frame
		if g.gator.state != ProtoGator.GState.AMBUSH:
			continue
	_check("...and the pen HOLDS it (%.1fm from center)" % g.gator.global_position.distance_to(pen_center),
		g.gator.global_position.distance_to(pen_center) < 12.0)

	# --- 🦴 the dig spot + the NAMES + the waypoint --------------------------------
	_check("the HUNTER DIG SPOT is buried on the field", g.dig_spot != null and _in_rect(g.dig_spot.global_position))
	var labels := 0
	var texts: Array = []
	for c in g.get_children():
		if c is Label3D:
			labels += 1
			texts.append(String((c as Label3D).text))
	var named_ok := false
	var joined := " ".join(texts)
	named_ok = joined.contains("TEST GROUNDS") and joined.contains("MOTOR POOL") \
		and joined.contains("ARMORY") and joined.contains("SUPPLY") and joined.contains("RANGE") \
		and joined.contains("STABLE") and joined.contains("GATOR") and joined.contains("DIG")
	_check("every station is NAMED USEFUL in-world (%d signs)" % labels, labels >= 8 and named_ok)
	_check("...and the signs point to what can't move here (I-95 / SAFEHOUSE / MERIDIAN)",
		joined.contains("I-95") and joined.contains("SAFEHOUSE") and joined.contains("MERIDIAN"))
	var wp_found := false
	for w in main.waypoints:
		if String(w[0]).contains("TEST GROUNDS"):
			wp_found = true
	_check("N carries the ⚒ TEST GROUNDS waypoint", wp_found)

	print("GROUNDS RESULTS: %d passed, %d failed" % [passed, failed])
	print("GROUNDS: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
