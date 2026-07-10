## Playable L2 vehicle damage station. Synthetic pulses are explicit diagnostic
## reproducers; real bullets and physics contacts still use the same car entry.
class_name ProtoLabImpactBay
extends Node3D

const ZONES: Array[String] = ["front", "rear", "left", "right", "top", "wheel"]
const PRESETS: Dictionary = {
	"9mm": {"energy":18.0, "penetration":10.0, "source":"bullet", "weapon_id":"pistol"},
	"rifle": {"energy":45.0, "penetration":35.0, "source":"bullet", "weapon_id":"rifle_probe"},
	"heavy": {"energy":90.0, "penetration":75.0, "source":"bullet", "weapon_id":"heavy_probe"},
	"crash": {"energy":70.0, "penetration":0.0, "source":"crash", "weapon_id":""},
}
const PRESET_ORDER: Array[String] = ["9mm", "rifle", "heavy", "crash"]

var lab: Node3D = null
var cars: Array[ProtoCar3D] = []
var clean_snapshots: Array[Dictionary] = []
var vehicle_index: int = 0
var zone_index: int = 0
var preset_index: int = 0
var last_result: Dictionary = {}
var impact_us: int = 0
var _selection_label: Label3D = null
var _readout_cache: String = "IMPACT BAY READY"
var _cached_impact_events: int = -1
var _last_result_event: int = -1


func setup(lab_in: Node3D, origin: Vector3) -> void:
	lab = lab_in
	position = origin
	DrivnData.ensure()
	_spawn_car("scavenger", Vector3(-4.2, 0.6, 2.0), Color("#805333"), false)
	_spawn_car("suv", Vector3(4.2, 0.7, 2.0), Color("#4b5c50"), true)
	_selection_label = Label3D.new()
	_selection_label.font_size = 34
	_selection_label.pixel_size = 0.009
	_selection_label.outline_size = 8
	_selection_label.modulate = Color("#e8a33a")
	add_child(_selection_label)
	_build_sign("LIGHT SHEET", Vector3(-4.2, 2.5, 2.0), Color("#e8a33a"))
	_build_sign("ARMORED SUV", Vector3(4.2, 2.7, 2.0), Color("#35b6a6"))
	reset()


func _spawn_car(vclass: String, at: Vector3, color: Color, armored: bool) -> void:
	var car := ProtoCar3D.create(vclass, color)
	car.name = "ImpactBay_%s" % vclass
	add_child(car)
	car.position = at
	# Keep the display targets stationary while leaving the real physics body
	# awake long enough for VehicleWheel3D suspension to initialize correctly.
	car.axis_lock_linear_x = true
	car.axis_lock_linear_y = true
	car.axis_lock_linear_z = true
	car.axis_lock_angular_x = true
	car.axis_lock_angular_y = true
	car.axis_lock_angular_z = true
	car.can_sleep = false
	car.add_to_group("lab_impact_car")
	car.set_meta("lab_armored", armored)
	cars.append(car)
	clean_snapshots.append(car.snapshot_damage())


func _build_sign(text: String, at: Vector3, color: Color) -> void:
	var label := Label3D.new()
	label.text = text
	label.font_size = 30
	label.pixel_size = 0.008
	label.modulate = color
	label.outline_size = 7
	label.position = at
	add_child(label)


func selected_car() -> ProtoCar3D:
	return cars[vehicle_index] if not cars.is_empty() else null


func cycle_vehicle(step: int = 1) -> void:
	vehicle_index = posmod(vehicle_index + step, cars.size())
	last_result.clear()
	_last_result_event = -1
	_update_label()


func cycle_zone(step: int = 1) -> void:
	zone_index = posmod(zone_index + step, ZONES.size())
	last_result.clear()
	_last_result_event = -1
	_update_label()


func cycle_preset(step: int = 1) -> void:
	preset_index = posmod(preset_index + step, PRESET_ORDER.size())
	last_result.clear()
	_last_result_event = -1
	_update_label()


func apply_selected() -> Dictionary:
	var car: ProtoCar3D = selected_car()
	if car == null:
		return {}
	var zone: String = ZONES[zone_index]
	var preset_id: String = PRESET_ORDER[preset_index]
	var preset: Dictionary = PRESETS[preset_id]
	var local: Dictionary = _local_hit(car, zone)
	var packet: Dictionary = {"world_pos":car.global_transform * (local["pos"] as Vector3),
		"world_normal":car.global_basis * (local["normal"] as Vector3),
		"incoming_dir":-(car.global_basis * (local["normal"] as Vector3)),
		"energy":float(preset["energy"]), "penetration":float(preset["penetration"]),
		"source":String(preset["source"]), "weapon_id":String(preset["weapon_id"])}
	var started: int = Time.get_ticks_usec()
	last_result = car.take_impact(packet)
	last_result["lab_vehicle_index"] = vehicle_index
	last_result["lab_preset"] = preset_id
	_last_result_event = car.impact_events
	impact_us = Time.get_ticks_usec() - started
	_update_label()
	return last_result.duplicate(true)


func _local_hit(car: ProtoCar3D, zone: String) -> Dictionary:
	var hull: Vector3 = car.spec.get("hull", car.spec["chassis"])
	var half: Vector3 = hull * 0.5
	match zone:
		"front": return {"pos":Vector3(0, 0.35, -half.z), "normal":Vector3.FORWARD}
		"rear": return {"pos":Vector3(0, 0.35, half.z), "normal":Vector3.BACK}
		"left": return {"pos":Vector3(-half.x, 0.35, 0), "normal":Vector3.LEFT}
		"right": return {"pos":Vector3(half.x, 0.35, 0), "normal":Vector3.RIGHT}
		"top": return {"pos":Vector3(0, half.y, 0), "normal":Vector3.UP}
		_: return {"pos":Vector3(-half.x, 0.12, -half.z * 0.68), "normal":Vector3.LEFT}


func reset() -> void:
	for i in cars.size():
		if is_instance_valid(cars[i]):
			cars[i].restore_damage(clean_snapshots[i])
	vehicle_index = 0
	zone_index = 0
	preset_index = 0
	last_result.clear()
	_last_result_event = -1
	impact_us = 0
	_update_label()


func facts() -> Dictionary:
	var car: ProtoCar3D = selected_car()
	if car == null:
		return {}
	var result_matches_selection: bool = not last_result.is_empty() \
		and _last_result_event == car.impact_events \
		and int(last_result.get("lab_vehicle_index", -1)) == vehicle_index \
		and String(last_result.get("zone", "")) == ZONES[zone_index] \
		and String(last_result.get("lab_preset", "")) == PRESET_ORDER[preset_index]
	var live_matches_selection: bool = not car.last_impact.is_empty() \
		and String(car.last_impact.get("zone", "")) == ZONES[zone_index]
	var result: Dictionary = last_result if result_matches_selection \
		else (car.last_impact if live_matches_selection else {})
	var visual: Dictionary = car.damage_visual.facts()
	var preset_id: String = PRESET_ORDER[preset_index]
	var zone: String = ZONES[zone_index]
	var authored_resistance: float = float((car.impact_profile.get("armor", {}) as Dictionary).get(zone, 0.0))
	var current_armor: float = float(car.impact_armor_durability.get(zone, 0.0))
	return {"vehicle":car.vclass, "vehicle_name":car.display_name,
		"armored":bool(car.get_meta("lab_armored", false)), "zone":zone,
		"preset":preset_id, "energy":float(PRESETS[preset_id]["energy"]),
		"penetration":float(PRESETS[preset_id]["penetration"]),
		"resistance":float(result.get("resistance", authored_resistance)),
		"armor_before":float(result.get("armor_before", current_armor)),
		"armor_after":float(result.get("armor_after", current_armor)),
		"absorbed":float(result.get("absorbed", 0.0)),
		"remaining":float(result.get("remaining_energy", 0.0)),
		"severity":float((visual["zones"] as Dictionary).get(zone, 0.0)),
		"marks":int(visual["mark_count"]), "mark_cap":int(visual["mark_cap"]),
		"panels":int(visual["panel_count"]), "source":String((result.get("packet", {}) as Dictionary).get("source", "ready")),
		"impact_us":maxi(impact_us, car.last_impact_us), "impact_events":car.impact_events}


func readout() -> String:
	var car: ProtoCar3D = selected_car()
	if car != null and car.impact_events != _cached_impact_events:
		_rebuild_readout()
	return _readout_cache


func _rebuild_readout() -> void:
	var f: Dictionary = facts()
	var preset_label: String = "CRASH (CONTACT REPRO)" if String(f.get("preset", "")) == "crash" \
		else String(f.get("preset", "9mm")).to_upper()
	_readout_cache = "IMPACT BAY  %s%s  ·  FACE %s  ·  PRESET %s\nENERGY %.0f / PEN %.0f  ·  ARMOR %.0f → %.0f  ·  ABSORB %.0f / PASS %.0f\nSEVERITY %.2f  ·  MARKS %d/%d  ·  PANELS %d  ·  %s  ·  %d µs" % [
		String(f.get("vehicle_name", "CAR")).to_upper(), " [ARMORED]" if bool(f.get("armored", false)) else "",
		String(f.get("zone", "front")).to_upper(), preset_label,
		float(f.get("energy", 0.0)), float(f.get("penetration", 0.0)),
		float(f.get("armor_before", 0.0)), float(f.get("armor_after", 0.0)),
		float(f.get("absorbed", 0.0)), float(f.get("remaining", 0.0)),
		float(f.get("severity", 0.0)), int(f.get("marks", 0)), int(f.get("mark_cap", 16)),
		int(f.get("panels", 0)), String(f.get("source", "ready")).to_upper(),
		int(f.get("impact_us", 0))]
	var car: ProtoCar3D = selected_car()
	_cached_impact_events = car.impact_events if car != null else -1


func _update_label() -> void:
	if _selection_label == null or cars.is_empty():
		return
	var car: ProtoCar3D = selected_car()
	_selection_label.position = car.position + Vector3(0, 3.35, 0)
	_selection_label.text = "▼ %s / %s / %s" % [car.display_name.to_upper(),
		ZONES[zone_index].to_upper(), PRESET_ORDER[preset_index].to_upper()]
	_rebuild_readout()
