## L2 standalone bay: real cars, one impact law, readable facts, clean reset.
## Run: Godot --headless --path game res://proto3d/tests/impact_bay_sim.tscn
extends Node

const SAVE_PATH := "user://drivn.save"

var passed: int = 0
var failed: int = 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("IMPACT_BAY: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("IMPACT_BAY: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("IMPACT_BAY: WATCHDOG")
		get_tree().quit(1))
	var save_existed: bool = FileAccess.file_exists(SAVE_PATH)
	var save_stamp: int = FileAccess.get_modified_time(SAVE_PATH) if save_existed else -1
	var lab: Node3D = (load("res://proto3d/tools/physics_combat_lab.tscn") as PackedScene).instantiate()
	add_child(lab)
	for _i in 8:
		await get_tree().physics_frame
	var bay: Node = lab.get("impact_bay")
	if bay == null or not bay.has_method("apply_selected"):
		_check("standalone lab owns the playable L2 Impact Bay", false)
		_finish()
		return
	_check("bay stages a light car and armored SUV as real collision-active vehicles",
		bay.cars.size() == 2 and bay.cars.all(func(car: Variant) -> bool:
			return car is ProtoCar3D and (car as ProtoCar3D).collision_layer != 0)
		and bool((bay.cars[1] as ProtoCar3D).get_meta("lab_armored", false)))
	lab.current_station = "VEHICLE DAMAGE BAY"
	var before_controls: Array[int] = [bay.vehicle_index, bay.zone_index, bay.preset_index,
		int((bay.selected_car() as ProtoCar3D).impact_events)]
	for key in [KEY_Z, KEY_X, KEY_P, KEY_C]:
		var key_event := InputEventKey.new()
		key_event.keycode = key
		key_event.pressed = true
		lab._unhandled_input(key_event)
	_check("Z/X/P/C controls cycle vehicle, face, energy, and apply through the bay",
		bay.vehicle_index != before_controls[0] and bay.zone_index != before_controls[1]
		and bay.preset_index != before_controls[2]
		and int((bay.selected_car() as ProtoCar3D).impact_events) > before_controls[3])
	bay.reset()

	var light_result: Dictionary = bay.apply_selected()
	var light_facts: Dictionary = bay.facts()
	bay.cycle_vehicle()
	var armored_result: Dictionary = bay.apply_selected()
	_check("same 9mm pulse dents light sheet more than armored SUV",
		String(light_facts["preset"]) == "9mm"
		and float(light_result["zone_severity"]) > float(armored_result["zone_severity"])
		and float(armored_result["resistance"]) > float(light_result["resistance"]))
	bay.cycle_zone()
	bay.cycle_preset()
	bay.cycle_preset()
	var heavy: Dictionary = bay.apply_selected()
	_check("vehicle/face/energy controls drive the same resolver and surface costs",
		String(heavy["zone"]) == "rear" and String(bay.facts()["preset"]) == "heavy"
		and float(heavy["remaining_energy"]) > 0.0
		and int(bay.facts()["impact_us"]) >= 0)

	bay.reset()
	var target: ProtoCar3D = bay.selected_car()
	var gun := ProtoWeapon.new("pistol")
	lab.shot_spread_deg = 0.0
	var ray_origin: Vector3 = target.global_position + Vector3(0, 0, 7)
	gun.fire(lab, ray_origin, (target.global_position - ray_origin).normalized())
	await get_tree().physics_frame
	_check("real lab pistol ray creates the pooled mark through ProtoCar3D.take_impact",
		String((target.last_impact.get("packet", {}) as Dictionary).get("weapon_id", "")) == "pistol"
		and int(target.damage_visual.facts()["mark_count"]) == 1)
	while String(bay.facts()["preset"]) != "crash":
		bay.cycle_preset()
	var marks_before_crash: int = int(target.damage_visual.facts()["mark_count"])
	var crash: Dictionary = bay.apply_selected()
	_check("crash reproducer dents through the same packet without inventing a bullet hole",
		String((crash["packet"] as Dictionary)["source"]) == "crash"
		and int(target.damage_visual.facts()["mark_count"]) == marks_before_crash)

	var hud_text: String = lab.hud.impact_text() if lab.hud.has_method("impact_text") else ""
	_check("HUD names rig/face/preset, armor, energy, severity, marks, panels, and cost",
		hud_text.contains("ARMOR") and hud_text.contains("ENERGY")
		and hud_text.contains("SEVERITY") and hud_text.contains("MARKS")
		and hud_text.contains("PANELS") and hud_text.contains("µs"))
	bay.reset()
	var clean: bool = true
	for car in bay.cars:
		clean = clean and int((car as ProtoCar3D).damage_visual.facts()["mark_count"]) == 0
		clean = clean and ((car as ProtoCar3D).damage_visual.facts()["zones"] as Dictionary).values().all(
			func(value: Variant) -> bool: return is_zero_approx(float(value)))
	_check("one bay reset restores both exact clean snapshots", clean)

	# Full authored presentation soak: twenty real rigs, each driven beyond the
	# sixteen-mark cap so slot reuse and event-only dent work are observable.
	var soak_root := Node3D.new()
	soak_root.name = "ImpactBudgetSoak"
	lab.add_child(soak_root)
	var soak_cars: Array[ProtoCar3D] = []
	for i in 20:
		var soak_car := ProtoCar3D.create("scavenger", Color("#605044"))
		soak_root.add_child(soak_car)
		soak_car.position = Vector3(float(i % 5) * 5.0, 4.0, 560.0 + float(i / 5) * 7.0)
		soak_car.axis_lock_linear_x = true
		soak_car.axis_lock_linear_y = true
		soak_car.axis_lock_linear_z = true
		soak_car.axis_lock_angular_x = true
		soak_car.axis_lock_angular_y = true
		soak_car.axis_lock_angular_z = true
		soak_cars.append(soak_car)
		for hit_index in 20:
			soak_car.take_impact({"world_pos":soak_car.global_position + Vector3(0, 0.3, -1.5),
				"world_normal":Vector3.FORWARD, "incoming_dir":Vector3.FORWARD,
				"energy":90.0, "penetration":75.0, "source":"bullet",
				"weapon_id":"budget_probe_%d" % hit_index})
			# The soak measures the bounded presentation pool, not the unrelated
			# component death spiral/husk material swap.
			for component in soak_car.components.values():
				component.hp = component.max_hp
	var mark_resources_before: Array[Dictionary] = []
	var total_marks: int = 0
	var total_events: int = 0
	var panels_at_full_severity: bool = true
	for soak_car in soak_cars:
		var visual_facts: Dictionary = soak_car.damage_visual.facts()
		total_marks += int(visual_facts["mark_count"])
		total_events += int(visual_facts["deform_events"])
		panels_at_full_severity = panels_at_full_severity \
			and float((visual_facts["zones"] as Dictionary)["front"]) >= 0.99
		mark_resources_before.append(soak_car.damage_visual.mark_resource_ids())
	_check("twenty damaged cars hold exactly 320 marks at maximum authored dent severity",
		soak_cars.size() == 20 and total_marks == 320 and total_events == 400
		and panels_at_full_severity)
	for _idle_frame in 12:
		await get_tree().physics_frame
	var idle_stable: bool = true
	var idle_event_total: int = 0
	var stable_resource_sets: int = 0
	for i in soak_cars.size():
		var soak_car: ProtoCar3D = soak_cars[i]
		idle_event_total += int(soak_car.damage_visual.facts()["deform_events"])
		var resources_after: Dictionary = soak_car.damage_visual.mark_resource_ids()
		var resources_stable: bool = _same_resource_ids(resources_after, mark_resources_before[i])
		stable_resource_sets += 1 if resources_stable else 0
		idle_stable = idle_stable and int(soak_car.damage_visual.facts()["deform_events"]) == 20
		idle_stable = idle_stable and resources_stable
	_check("idle frames allocate no new damage nodes/resources or deformation work (%d events, %d/20 stable pools)" % [
		idle_event_total, stable_resource_sets], idle_stable)
	var performance: Dictionary = lab.chaos.performance_facts(true)
	_check("telemetry reports honest impact/deform/reuse/car/panel facts without auto-degrading",
		performance.has_all(["impact_us", "deform_events", "mark_reuses",
			"damaged_cars", "damage_panels"])
		and int(performance.get("damaged_cars", 0)) == 20
		and int(performance.get("deform_events", 0)) == 400
		and int(performance.get("mark_reuses", 0)) == 80
		and int(performance.get("damage_panels", 0)) > 0
		and not bool(performance.get("auto_degraded", true)))
	var damage_samples_before: int = int(performance.get("damage_samples", -1))
	for _poll in 120:
		lab.chaos.performance_facts()
	var damage_samples_after: int = int(lab.chaos.performance_facts().get("damage_samples", -2))
	_check("per-frame HUD polling reuses bounded damage telemetry instead of walking every mark",
		damage_samples_before >= 1 and damage_samples_after == damage_samples_before)
	_check("budget telemetry names only the first authored pressure boundary",
		String(performance.get("first_exceeded", "")) in ["", "frame_cpu_ms",
			"script_estimate_ms", "physics_ms", "render_draw_calls", "load_nodes"])
	soak_root.queue_free()
	await get_tree().process_frame
	var save_untouched: bool = FileAccess.file_exists(SAVE_PATH) == save_existed
	if save_existed:
		save_untouched = save_untouched and FileAccess.get_modified_time(SAVE_PATH) == save_stamp
	_check("Impact Bay never touches the campaign save", save_untouched)
	lab.queue_free()
	_finish()


func _same_resource_ids(after: Dictionary, before: Dictionary) -> bool:
	if after.size() != before.size():
		return false
	for slot in before:
		if not after.has(slot):
			return false
		var after_ids: Array = after[slot]
		var before_ids: Array = before[slot]
		if after_ids.size() != before_ids.size():
			return false
		for i in before_ids.size():
			if int(after_ids[i]) != int(before_ids[i]):
				return false
	return true


func _finish() -> void:
	print("IMPACT_BAY RESULTS: %d passed, %d failed" % [passed, failed])
	print("IMPACT_BAY: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
