## L2 directional armor: identical energy must care which face was hit.
## Run: Godot --headless --path game res://proto3d/tests/directional_armor_sim.tscn
extends Node3D

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DIR_ARMOR: %s - %s" % ["PASS" if ok else "FAIL", label])


func _car(vclass: String, x: float) -> ProtoCar3D:
	var car := ProtoCar3D.create(vclass, Color("#6f5944"))
	add_child(car)
	car.position = Vector3(x, 0.6, 0)
	car.freeze = true
	return car


func _packet(car: ProtoCar3D, zone: String, energy: float = 50.0,
		penetration: float = 12.0) -> Dictionary:
	var half: Vector3 = car.spec["hull"] * 0.5
	var local_pos: Vector3
	var local_normal: Vector3
	match zone:
		"front": local_pos = Vector3(0, 0.45, -half.z); local_normal = Vector3.FORWARD
		"rear": local_pos = Vector3(0, 0.45, half.z); local_normal = Vector3.BACK
		"left": local_pos = Vector3(-half.x, 0.45, 0); local_normal = Vector3.LEFT
		_: local_pos = Vector3(half.x, 0.45, 0); local_normal = Vector3.RIGHT
	return {"world_pos":car.global_transform * local_pos,
		"world_normal":car.global_basis * local_normal,
		"incoming_dir":-(car.global_basis * local_normal), "energy":energy,
		"penetration":penetration, "source":"bullet", "weapon_id":"test_rifle"}


func _ready() -> void:
	print("DIR_ARMOR: start")
	get_tree().create_timer(25.0).timeout.connect(func() -> void:
		print("DIR_ARMOR: WATCHDOG")
		get_tree().quit(1))
	DrivnData.ensure()
	var probe := _car("suv", -12.0)
	if not probe.has_method("take_impact"):
		_check("ProtoCar3D exposes the directional impact entry point", false)
		_finish()
		return
	probe.queue_free()

	var front_car := _car("suv", -8.0)
	var rear_car := _car("suv", -4.0)
	var side_car := _car("suv", 0.0)
	var front: Dictionary = front_car.take_impact(_packet(front_car, "front"))
	var rear: Dictionary = rear_car.take_impact(_packet(rear_car, "rear"))
	var side: Dictionary = side_car.take_impact(_packet(side_car, "left"))
	_check("same hit resolves the authored face and resistance",
		String(front["zone"]) == "front" and String(rear["zone"]) == "rear"
		and String(side["zone"]) == "left"
		and float(front["resistance"]) > float(rear["resistance"])
		and float(side["resistance"]) > float(rear["resistance"]))
	_check("stronger face passes less energy into components",
		float(front["component_damage"]) < float(side["component_damage"])
		and float(side["component_damage"]) < float(rear["component_damage"]))

	var shallow_car := _car("humvee", 4.0)
	var shallow: Dictionary = shallow_car.take_impact(_packet(shallow_car, "front", 8.0, 0.0))
	_check("energy below resistance makes a shallow accepted scuff without penetration",
		bool(shallow["accepted"]) and not bool(shallow["penetrated"])
		and float(shallow["component_damage"]) <= 0.1
		and float(shallow["severity_delta"]) > 0.0)

	var fresh_car := _car("suv", 8.0)
	var depleted_car := _car("suv", 12.0)
	depleted_car.impact_armor_durability["front"] = 0.0
	var fresh: Dictionary = fresh_car.take_impact(_packet(fresh_car, "front", 55.0, 5.0))
	var depleted: Dictionary = depleted_car.take_impact(_packet(depleted_car, "front", 55.0, 5.0))
	_check("depleted front armor allows more damage from the same packet",
		float(depleted["component_damage"]) > float(fresh["component_damage"])
		and float(depleted["armor_before"]) == 0.0)

	var legacy_car := _car("scavenger", 16.0)
	var legacy_before: float = (legacy_car.components["chassis"] as Damageable).hp
	var expected: float = 20.0 * clampf(1.0 - legacy_car.armor / 140.0, 0.25, 1.0)
	legacy_car.take_damage(20.0)
	var legacy_got: float = legacy_before - (legacy_car.components["chassis"] as Damageable).hp
	_check("take_damage compatibility wrapper preserves the previous armor band",
		absf(legacy_got - expected) < 0.01)
	_finish()


func _finish() -> void:
	print("DIR_ARMOR RESULTS: %d passed, %d failed" % [passed, failed])
	print("DIR_ARMOR: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
