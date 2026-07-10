## L2 cosmetic deformation must be event-driven, bounded, deterministic, and
## unable to mutate the stable VehicleBody collision hull.
## Run: Godot --headless --path game res://proto3d/tests/vehicle_deform_sim.tscn
extends Node3D

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("VEH_DEFORM: %s - %s" % ["PASS" if ok else "FAIL", label])


func _car(x: float) -> ProtoCar3D:
	var car := ProtoCar3D.create("scavenger", Color("#765338"))
	add_child(car)
	car.position = Vector3(x, 0.6, 0)
	car.freeze = true
	return car


func _impact(car: ProtoCar3D, zone: String, energy: float = 90.0) -> Dictionary:
	var half: Vector3 = car.spec["hull"] * 0.5
	var local_pos := Vector3(0, 0.45, -half.z) if zone == "front" \
		else Vector3(0, 0.45, half.z)
	var local_normal := Vector3.FORWARD if zone == "front" else Vector3.BACK
	return car.take_impact({"world_pos":car.global_transform * local_pos,
		"world_normal":car.global_basis * local_normal,
		"incoming_dir":-(car.global_basis * local_normal), "energy":energy,
		"penetration":18.0, "source":"bullet", "weapon_id":"test_rifle"})


func _ready() -> void:
	print("VEH_DEFORM: start")
	get_tree().create_timer(25.0).timeout.connect(func() -> void:
		print("VEH_DEFORM: WATCHDOG")
		get_tree().quit(1))
	DrivnData.ensure()
	var car := _car(-3.0)
	var visual: Node = car.get("damage_visual")
	if visual == null or not visual.has_method("panel_transforms"):
		_check("real vehicles own the focused damage-visual component", false)
		_finish()
		return
	if not visual.has_method("add_mark"):
		_check("damage visual exposes the fixed bullet-mark pool", false)
		_finish()
		return
	var shape := car.get_children().filter(func(node: Node) -> bool:
		return node is CollisionShape3D).front() as CollisionShape3D
	var collision_resource_id: int = shape.shape.get_instance_id()
	var collision_transform: Transform3D = shape.transform
	var rest_all: Dictionary = visual.panel_transforms()
	var rest_front: Dictionary = visual.panel_transforms("front")
	var rest_rear: Dictionary = visual.panel_transforms("rear")
	_check("setup registers named modular panels on multiple faces",
		int(visual.facts()["panel_count"]) >= 4 and not rest_front.is_empty()
		and not rest_rear.is_empty())
	for _i in 12:
		await get_tree().physics_frame
	_check("idle frames never rewrite panel transforms",
		visual.panel_transforms() == rest_all and int(visual.facts()["deform_events"]) == 0)

	var result: Dictionary = _impact(car, "front")
	var after_front: Dictionary = visual.panel_transforms("front")
	var after_rear: Dictionary = visual.panel_transforms("rear")
	var front_changed: bool = false
	var bounded: bool = true
	for panel_name in rest_front:
		var before: Transform3D = rest_front[panel_name]
		var after: Transform3D = after_front[panel_name]
		front_changed = front_changed or before != after
		bounded = bounded and before.origin.distance_to(after.origin) \
			<= float(car.impact_profile["max_shift"]) + 0.01 and after.is_finite()
	_check("front event changes only bounded front panel transforms (zone %s changed %s bounded %s rear %s)" % [
		String(result.get("zone", "")), front_changed, bounded, after_rear == rest_rear],
		front_changed and bounded and after_rear == rest_rear
		and float(result["zone_severity"]) > 0.0 and float(result["zone_severity"]) <= 1.0)
	_check("cosmetic dent leaves collision resource and transform untouched",
		shape.shape.get_instance_id() == collision_resource_id and shape.transform == collision_transform)

	for _i in 20:
		_impact(car, "front", 180.0)
	_check("repeated events clamp zone severity and keep every transform finite (%s)" %
		str(visual.facts()["zones"]),
		is_equal_approx(float(visual.facts()["zones"]["front"]), 1.0)
		and (visual.panel_transforms("front") as Dictionary).values().all(
			func(value: Transform3D) -> bool: return value.is_finite()))

	var snapshot: Dictionary = visual.snapshot()
	var fresh := _car(3.0)
	var fresh_visual: Node = fresh.get("damage_visual")
	var restored: bool = fresh_visual.restore(snapshot)
	_check("compact seeded snapshot regenerates identical local panel transforms",
		restored and fresh_visual.panel_transforms() == visual.panel_transforms())

	var mark_car := _car(9.0)
	var mark_visual: Node = mark_car.get("damage_visual")
	for _i in 40:
		_impact(mark_car, "front", 5.0)
	var mark_facts: Dictionary = mark_visual.facts()
	_check("forty bullets cap at the authored sixteen reusable marks",
		int(mark_facts["mark_count"]) == 16 and int(mark_facts["mark_cap"]) == 16
		and int(mark_facts["mark_reuses"]) == 24)
	var resources_before: Dictionary = mark_visual.mark_resource_ids()
	for _i in 160:
		_impact(mark_car, "rear", 5.0)
	_check("post-cap bullet holes reuse the same nodes, meshes, and materials",
		mark_visual.mark_resource_ids() == resources_before
		and int(mark_visual.facts()["mark_reuses"]) == 184)
	var mark_count_before: int = int(mark_visual.facts()["mark_count"])
	var rejected: bool = mark_visual.add_mark({"world_pos":mark_car.global_position,
		"world_normal":Vector3.UP, "energy":0.0, "source":"miss"},
		{"mark_allowed":false})
	_check("failed/non-bullet hit never creates a mark",
		not rejected and int(mark_visual.facts()["mark_count"]) == mark_count_before)
	_check("mark summaries stay finite and surface-aligned",
		bool(mark_visual.facts()["marks_finite"]) and bool(mark_visual.facts()["marks_aligned"]))
	var marked_snapshot: Dictionary = mark_visual.snapshot()
	var marked_fresh := _car(15.0)
	var marked_fresh_visual: Node = marked_fresh.get("damage_visual")
	_check("mark summary round-trip regenerates the capped pool deterministically",
		marked_fresh_visual.restore(marked_snapshot)
		and marked_fresh_visual.facts()["mark_summaries"] == marked_snapshot.get("marks", []))
	var car_snapshot: Dictionary = mark_car.snapshot_damage()
	_check("car damage snapshot carries compact zones, armor durability, seed, and marks",
		car_snapshot.has("impact") and (car_snapshot["impact"] as Dictionary).has_all([
			"version", "zones", "armor_durability", "deformation_seed", "marks"]))
	var roundtrip_car := _car(21.0)
	roundtrip_car.restore_damage(car_snapshot)
	_check("car-level damage restore regenerates the same impact state",
		roundtrip_car.damage_visual.snapshot() == mark_car.damage_visual.snapshot()
		and roundtrip_car.impact_armor_durability == mark_car.impact_armor_durability)
	var old_record: Dictionary = car_snapshot.duplicate(true)
	old_record.erase("impact")
	var old_save_car := _car(27.0)
	_impact(old_save_car, "front", 90.0)
	old_save_car.restore_damage(old_record)
	_check("pre-L2 damage record restores as a clean finite impact presentation",
		int(old_save_car.damage_visual.facts()["mark_count"]) == 0
		and (old_save_car.damage_visual.facts()["zones"] as Dictionary).values().all(
			func(value: Variant) -> bool: return is_zero_approx(float(value))))
	_finish()


func _finish() -> void:
	print("VEH_DEFORM RESULTS: %d passed, %d failed" % [passed, failed])
	print("VEH_DEFORM: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
