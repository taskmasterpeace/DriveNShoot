## Foot/vehicle comparison rows plus the nonpersistent condition dial.
class_name ProtoLabSurface
extends RefCounted

const SURFACES: Dictionary = {
	"asphalt": {"name":"DRY ASPHALT", "stop_decel":14.0, "dive_slide_mult":1.0,
		"accel_mult":1.0, "body_friction":0.04, "traction_surface":"asphalt", "wetness":"dry", "color":Color("#45494a")},
	"dirt": {"name":"DIRT", "stop_decel":12.0, "dive_slide_mult":1.08,
		"accel_mult":0.9, "body_friction":0.045, "traction_surface":"dirt", "wetness":"dry", "color":Color("#76563a")},
	"wet": {"name":"WET PAVEMENT", "stop_decel":8.0, "dive_slide_mult":1.35,
		"accel_mult":0.78, "body_friction":0.022, "traction_surface":"asphalt", "wetness":"wet", "color":Color("#334e55")},
	"mud": {"name":"MUD", "stop_decel":16.0, "dive_slide_mult":0.72,
		"accel_mult":0.55, "body_friction":0.07, "traction_surface":"dirt", "wetness":"mud", "color":Color("#4d3828")},
	"gravel": {"name":"LOOSE GRAVEL", "stop_decel":10.0, "dive_slide_mult":1.15,
		"accel_mult":0.72, "body_friction":0.032, "traction_surface":"gravel", "wetness":"dry", "color":Color("#77736a")},
	"shallow_water": {"name":"SHALLOW WATER", "stop_decel":18.0, "dive_slide_mult":0.55,
		"accel_mult":0.48, "body_friction":0.08, "traction_surface":"dirt", "wetness":"wet", "color":Color("#376d70")},
	"low_friction_debug": {"name":"LOW-FRICTION DEBUG", "stop_decel":2.5, "dive_slide_mult":2.4,
		"accel_mult":0.3, "body_friction":0.004, "traction_surface":"asphalt", "wetness":"wet", "color":Color("#c07932")},
}

const CONDITIONS: Dictionary = {
	"fresh": {"speed_mult":1.0, "stamina":100.0, "carry_kg":0.0, "armor_mass":0.0,
		"hurt":0.0, "bad_leg":false, "bad_arm":false, "clarity":1.0, "stress":0.0,
		"strength":0, "marksmanship":0, "martial_arts":0, "driving":0, "recoil_mult":1.0},
	"overloaded": {"speed_mult":0.76, "stamina":72.0, "carry_kg":52.0, "armor_mass":18.0,
		"hurt":0.1, "bad_leg":false, "bad_arm":false, "clarity":0.94, "stress":0.25,
		"strength":1, "marksmanship":0, "martial_arts":0, "driving":0, "recoil_mult":1.12},
	"hurt": {"speed_mult":0.7, "stamina":55.0, "carry_kg":6.0, "armor_mass":4.0,
		"hurt":0.62, "bad_leg":true, "bad_arm":true, "clarity":0.78, "stress":0.65,
		"strength":0, "marksmanship":0, "martial_arts":0, "driving":0, "recoil_mult":1.35},
	"exhausted": {"speed_mult":0.84, "stamina":12.0, "carry_kg":8.0, "armor_mass":3.0,
		"hurt":0.2, "bad_leg":false, "bad_arm":false, "clarity":0.7, "stress":0.8,
		"strength":0, "marksmanship":0, "martial_arts":0, "driving":0, "recoil_mult":1.25},
	"late_game_specialist": {"speed_mult":1.06, "stamina":100.0, "carry_kg":14.0, "armor_mass":8.0,
		"hurt":0.0, "bad_leg":false, "bad_arm":false, "clarity":1.0, "stress":0.05,
		"strength":7, "marksmanship":8, "martial_arts":6, "driving":9, "recoil_mult":0.58},
}

const ORDER: Array[String] = ["asphalt", "dirt", "wet", "mud", "gravel",
	"shallow_water", "low_friction_debug"]
const CONDITION_ORDER: Array[String] = ["fresh", "overloaded", "hurt", "exhausted",
	"late_game_specialist"]

var active_id: String = "asphalt"
var active_condition: String = "fresh"
var panels: Dictionary = {}


func ids() -> Array[String]:
	return ORDER.duplicate()


func condition_ids() -> Array[String]:
	return CONDITION_ORDER.duplicate()


func row(id: String) -> Dictionary:
	var out: Dictionary = (SURFACES.get(id, SURFACES["asphalt"]) as Dictionary).duplicate(true)
	out["id"] = id if SURFACES.has(id) else "asphalt"
	out["vehicle_traction"] = ProtoTraction.traction(String(out["traction_surface"]),
		String(out["wetness"]), "street")
	return out


func condition(id: String) -> Dictionary:
	var resolved: String = id if CONDITIONS.has(id) else "fresh"
	var out: Dictionary = (CONDITIONS[resolved] as Dictionary).duplicate(true)
	out["id"] = resolved
	return out


func simulate_trace(id: String, initial_speed: float) -> Dictionary:
	var surface: Dictionary = row(id)
	var stop_distance: float = initial_speed * initial_speed \
		/ (2.0 * float(surface["stop_decel"]))
	var dive_slide: float = 9.5 * 0.35 * float(surface["dive_slide_mult"])
	return {"surface": String(surface["id"]), "stop_distance": stop_distance,
		"dive_slide_distance": dive_slide}


func select(id: String, adapter: Node = null) -> bool:
	if not SURFACES.has(id):
		return false
	active_id = id
	if adapter != null and adapter.has_method("set_surface"):
		adapter.set_surface(row(id))
	_update_panels()
	return true


func apply_condition(id: String, adapter: Node = null) -> bool:
	if not CONDITIONS.has(id):
		return false
	active_condition = id
	if adapter != null:
		adapter.set_condition(condition(id))
	return true


func build_panels(parent: Node3D, origin: Vector3) -> void:
	panels.clear()
	for i in ORDER.size():
		var id: String = ORDER[i]
		var data: Dictionary = SURFACES[id]
		var panel := ProtoWorldBuilder.box_visual(parent, Vector3(3.0, 0.08, 5.0),
			origin + Vector3((float(i) - 3.0) * 3.3, 0.08, 0), data["color"])
		panel.name = "Surface_%s" % id
		var label := Label3D.new()
		label.text = String(data["name"])
		label.font_size = 30
		label.pixel_size = 0.008
		label.position = Vector3(0, 0.12, 0)
		label.rotation_degrees.x = -90.0
		panel.add_child(label)
		panels[id] = panel
	_update_panels()


func _update_panels() -> void:
	for id in panels:
		var panel := panels[id] as MeshInstance3D
		var color: Color = SURFACES[id]["color"]
		panel.material_override = ProtoWorldBuilder.material(
			color.lightened(0.22) if id == active_id else color, 0.88)
		panel.scale.y = 1.5 if id == active_id else 1.0
