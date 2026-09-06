extends Node
## Real-parcel regression: cottage practicals are runtime OmniLight3D nodes owned
## by their site, cover the lived-in anchors, and are authored by property rows.

const INTERIOR_ANCHOR := Vector3(0.0, 1.2, 0.0)
const PORCH_ANCHOR := Vector3(0.0, 1.2, 5.0)

var main: Node
var passed: int = 0
var failed: int = 0


func _ready() -> void:
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		push_error("PROPERTY LIGHT: TIMEOUT")
		get_tree().quit(1)
	)
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	await _frames(10)
	main.daynight.set_physics_process(false)
	main.daynight.hour = 0.0
	main.daynight.moon_phase = 0.5
	main.daynight._apply()
	await _frames(3)

	var site: ProtoPropertySite = main.road_life.sites[0]
	var lights: Array[OmniLight3D] = _site_lights(site)
	_check("night practical lights exist on the real Roadstead parcel", lights.size() >= 2)
	_check("runtime practicals are direct children of the parcel site", _all_owned_by(lights, site))
	_check("night practicals are visibly energized", _all_energized(lights))
	_check("practical light is warm, not blue ambient fill", _all_warm(lights))
	_check("practical lights cast shadows so cottage walls still matter", _all_shadowed(lights))
	_check("a local practical covers the cottage interior anchor", _anchor_is_lit(lights, INTERIOR_ANCHOR))
	_check("a local practical covers the porch anchor", _anchor_is_lit(lights, PORCH_ANCHOR))
	main.daynight.hour = 12.0
	main.daynight._apply()
	await _frames(3)
	_check("noon suppresses parcel practical energy", _all_suppressed(lights))
	main.daynight.hour = 0.0
	main.daynight._apply()
	await _frames(2)

	var content: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/properties.json"))
	var custom_row: Dictionary = (content as Dictionary).properties[0].duplicate(true)
	custom_row.position = [120.0, -363.0]
	custom_row.lights = [{
		"id": "row_probe",
		"position": [1.25, 2.75, 3.5],
		"color": "ffd08a",
		"energy": 2.35,
		"range": 6.75
	}]
	var custom_site: ProtoPropertySite = ProtoPropertySite.new()
	main.road_life.add_child(custom_site)
	custom_site.setup(main.road_life, custom_row)
	await _frames(2)
	var custom_lights: Array[OmniLight3D] = _site_lights(custom_site)
	var row_applied: bool = custom_lights.size() == 1
	if row_applied:
		var actual: OmniLight3D = custom_lights[0]
		row_applied = actual.position.is_equal_approx(Vector3(1.25, 2.75, 3.5)) \
			and is_equal_approx(actual.light_energy, 2.35) \
			and is_equal_approx(actual.omni_range, 6.75) \
			and actual.light_color.is_equal_approx(Color("ffd08a"))
	_check("varying a property light row changes the actual runtime light", row_applied)

	var omitted_row: Dictionary = (content as Dictionary).properties[0].duplicate(true)
	omitted_row.position = [138.0, -363.0]
	omitted_row.erase("lights")
	var omitted_site: ProtoPropertySite = ProtoPropertySite.new()
	main.road_life.add_child(omitted_site)
	omitted_site.setup(main.road_life, omitted_row)
	await _frames(2)
	_check("omitting the optional lights row creates no extra practicals without fault",
		_site_lights(omitted_site).is_empty())

	main.queue_free()
	await _frames(4)
	print("PROPERTY LIGHT RESULTS: %d passed, %d failed" % [passed, failed])
	get_tree().quit(0 if failed == 0 else 1)


func _site_lights(site: ProtoPropertySite) -> Array[OmniLight3D]:
	var found: Array[OmniLight3D] = []
	for child: Node in site.get_children():
		if child is OmniLight3D:
			found.append(child as OmniLight3D)
	return found


func _all_owned_by(lights: Array[OmniLight3D], site: ProtoPropertySite) -> bool:
	if lights.is_empty():
		return false
	for light: OmniLight3D in lights:
		if light.get_parent() != site:
			return false
	return true


func _all_energized(lights: Array[OmniLight3D]) -> bool:
	if lights.is_empty():
		return false
	for light: OmniLight3D in lights:
		if not light.visible or light.light_energy <= 0.05:
			return false
	return true


func _all_warm(lights: Array[OmniLight3D]) -> bool:
	if lights.is_empty():
		return false
	for light: OmniLight3D in lights:
		if light.light_color.r <= light.light_color.b * 1.15 or light.light_color.g <= light.light_color.b:
			return false
	return true


func _all_shadowed(lights: Array[OmniLight3D]) -> bool:
	if lights.is_empty():
		return false
	for light: OmniLight3D in lights:
		if not light.shadow_enabled:
			return false
	return true


func _all_suppressed(lights: Array[OmniLight3D]) -> bool:
	if lights.is_empty():
		return false
	for light: OmniLight3D in lights:
		if light.light_energy > 0.001:
			return false
	return true


func _anchor_is_lit(lights: Array[OmniLight3D], anchor: Vector3) -> bool:
	for light: OmniLight3D in lights:
		if light.light_energy > 0.05 and light.position.distance_to(anchor) < light.omni_range:
			return true
	return false


func _frames(count: int) -> void:
	for _i: int in count:
		await get_tree().physics_frame


func _check(label: String, result: bool) -> void:
	passed += int(result)
	failed += int(not result)
	print("PROPERTY LIGHT: %s %s" % ["PASS" if result else "FAIL", label])
