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
	var save_untouched: bool = FileAccess.file_exists(SAVE_PATH) == save_existed
	if save_existed:
		save_untouched = save_untouched and FileAccess.get_modified_time(SAVE_PATH) == save_stamp
	_check("Impact Bay never touches the campaign save", save_untouched)
	lab.queue_free()
	_finish()


func _finish() -> void:
	print("IMPACT_BAY RESULTS: %d passed, %d failed" % [passed, failed])
	print("IMPACT_BAY: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
