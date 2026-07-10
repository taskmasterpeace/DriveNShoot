## Proof for CAROUSEL GARAGES (the killer wrinkle): jump OUT and the rig parked
## at the gate is STORED — jump back IN and it rolls out to meet you, fuel,
## wounds, and cargo intact. And the garage SURVIVES a save/load.
## Run: godot --headless --path game res://proto3d/tests/garage_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAR: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("GAR: start")
	get_tree().create_timer(80.0).timeout.connect(func() -> void:
		print("GAR: WATCHDOG")
		print("GAR: FAILURES PRESENT")
		get_tree().quit(1))
	Engine.time_scale = 2.5
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main._exit_car()
	var crsl: ProtoCarousel = main.carousel
	crsl.set_active("camp_bellamy")
	crsl.set_active("norfolk_yard")
	main.backpack.add("power_cell", 4)

	# --- Park a marked rig at Bellamy, jump out --------------------------------
	var bellamy: Variant = crsl.gates["camp_bellamy"]
	var rig := ProtoCar3D.create("buggy", Color(0.3, 0.5, 0.3))
	main.add_child(rig)
	rig.global_position = bellamy.global_position + Vector3(10, 1, 0)
	rig.fuel = 42.0
	rig.trunk.add("medkit", 3)
	rig.puncture_tire(0)
	rig.take_impact({"world_pos":rig.global_position + Vector3(0, 0.4, -1.5),
		"world_normal":Vector3.FORWARD, "incoming_dir":Vector3.FORWARD,
		"energy":50.0, "penetration":35.0, "source":"bullet", "weapon_id":"garage_probe"})
	var parked_damage: Dictionary = rig.snapshot_damage()
	main.cars.append(rig)
	main.player.global_position = bellamy.global_position + Vector3(3, 0.5, 0)
	crsl.jump("camp_bellamy") # → norfolk (THE PAIR)
	for _i in 3:
		await get_tree().physics_frame # queue_free clears at frame end
	_check("jump OUT stores the parked rig (%d in Bellamy's garage)" % bellamy.garage.size(),
		bellamy.garage.size() == 1 and not is_instance_valid(rig))
	_check("…and you LANDED at the other door",
		main.player.global_position.distance_to(crsl.gates["norfolk_yard"].global_position) < 15.0)

	# --- The garage persists through SAVE/LOAD -----------------------------------
	main.save_game()
	bellamy.garage.clear() # wreck it
	main.load_game()
	_check("the garage SURVIVES a save/load", bellamy.garage.size() == 1)

	# --- Jump back: the rig rolls out to meet you ----------------------------------
	var cars0: int = 0
	for c in main.cars:
		if is_instance_valid(c):
			cars0 += 1
	crsl.jump("norfolk_yard") # → bellamy
	var delivered: ProtoCar3D = null
	for c in main.cars:
		if c is ProtoCar3D and is_instance_valid(c) and c.vclass == "buggy" \
				and c.global_position.distance_to(bellamy.global_position) < 30.0:
			delivered = c
	_check("jump IN delivers the rig at the gate", delivered != null and bellamy.garage.is_empty())
	_check("fuel, cargo — INTACT (%.0f fuel, %d medkits)" % [delivered.fuel if delivered else -1.0, delivered.trunk.count("medkit") if delivered else -1],
		delivered != null and is_equal_approx(delivered.fuel, 42.0) and delivered.trunk.count("medkit") == 3)
	var delivered_damage: Dictionary = delivered.snapshot_damage() if delivered != null else {}
	_check("puncture, face armor, dents, fire state, and pooled marks survive garage save/delivery",
		delivered != null and delivered_damage.get("punctured", []) == parked_damage["punctured"]
		and delivered_damage.get("fire_state", -1) == parked_damage["fire_state"]
		and _same_impact_state(delivered_damage.get("impact", {}), parked_damage["impact"]))

	Engine.time_scale = 1.0
	print("GAR RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAR: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	main.queue_free()
	await get_tree().process_frame
	await get_tree().process_frame
	get_tree().quit(0 if failed == 0 else 1)


func _same_impact_state(after: Dictionary, before: Dictionary) -> bool:
	if after.get("zones", {}) != before.get("zones", {}) \
			or after.get("armor_durability", {}) != before.get("armor_durability", {}):
		return false
	var after_marks: Array = after.get("marks", [])
	var before_marks: Array = before.get("marks", [])
	if after_marks.size() != before_marks.size():
		return false
	for i in before_marks.size():
		var a: Dictionary = after_marks[i]
		var b: Dictionary = before_marks[i]
		for key in ["zone", "local_pos", "local_normal", "radius", "serial"]:
			var same: bool = is_equal_approx(float(a.get(key)), float(b.get(key))) \
				if key == "radius" else a.get(key) == b.get(key)
			if not same:
				return false
	return true
