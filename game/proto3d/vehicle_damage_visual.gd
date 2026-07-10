## Event-only cosmetic damage for modular vehicle panels. The VehicleBody hull
## remains the authoritative collision shape; this node never processes idle
## frames and never rewrites mesh vertices.
class_name ProtoVehicleDamageVisual
extends Node3D

const ZONES: Array[String] = ["front", "rear", "left", "right", "top", "wheel"]
const EXCLUDED_HINTS: Array[String] = ["frame", "cross", "light", "seat", "glass",
	"window", "tire", "wheel", "fork", "handlebar", "roll", "rack", "mirror",
	"vent", "crate", "mount", "stack", "exhaust", "fuel", "hitch", "landing",
	"rail", "step", "split"]

var car: ProtoCar3D = null
var visual_root: Node3D = null
var profile: Dictionary = {}
var panels: Dictionary = {}
var rest_transforms: Dictionary = {}
var zone_state: Dictionary = {}
var deformation_seed: int = 1001
var deform_events: int = 0


func setup(car_in: ProtoCar3D, visual_root_in: Node3D, profile_in: Dictionary) -> void:
	car = car_in
	visual_root = visual_root_in
	profile = profile_in.duplicate(true)
	deformation_seed = int(profile.get("deformation_seed", 1001))
	for zone in ZONES:
		panels[zone] = []
		zone_state[zone] = 0.0
	if visual_root == null:
		return
	for node in visual_root.find_children("*", "MeshInstance3D", true, false):
		var panel := node as MeshInstance3D
		if not _eligible(panel):
			continue
		var zone: String = _zone_for_panel(panel)
		(panels[zone] as Array).append(panel)
		rest_transforms[panel.name] = panel.transform
	_apply_all()


func _eligible(panel: MeshInstance3D) -> bool:
	var id: String = panel.name.to_lower()
	for hint in EXCLUDED_HINTS:
		if id.contains(hint):
			return false
	return panel.mesh != null


func _zone_for_panel(panel: MeshInstance3D) -> String:
	var id: String = panel.name.to_lower()
	if id.ends_with("_l") or id.contains("side_l") or id.contains("bed_l"):
		return "left"
	if id.ends_with("_r") or id.contains("side_r") or id.contains("bed_r"):
		return "right"
	for hint in ["front", "hood", "nose", "grille", "brush", "tank"]:
		if id.contains(hint):
			return "front"
	for hint in ["rear", "tailgate", "back", "bed_"]:
		if id.contains(hint):
			return "rear"
	for hint in ["roof", "cabin", "top"]:
		if id.contains(hint):
			return "top"
	var hull: Vector3 = car.spec.get("hull", car.spec.get("chassis", Vector3(2, 1, 4)))
	var x_ratio: float = absf(panel.position.x) / maxf(0.01, hull.x * 0.5)
	var z_ratio: float = absf(panel.position.z) / maxf(0.01, hull.z * 0.5)
	if x_ratio > 0.52 and x_ratio > z_ratio:
		return "left" if panel.position.x < 0.0 else "right"
	if panel.position.y > hull.y * 0.72:
		return "top"
	return "front" if panel.position.z < 0.0 else "rear"


func apply_impact(_packet: Dictionary, resolution: Dictionary) -> void:
	var zone: String = String(resolution.get("zone", "front"))
	if not panels.has(zone):
		return
	zone_state[zone] = clampf(float(resolution.get("zone_severity",
		zone_state.get(zone, 0.0))), 0.0, 1.0)
	_apply_zone(zone)
	deform_events += 1


func _apply_all() -> void:
	for zone in ZONES:
		_apply_zone(zone)


func _apply_zone(zone: String) -> void:
	var severity: float = clampf(float(zone_state.get(zone, 0.0)), 0.0, 1.0)
	var inward: Vector3 = {"front":Vector3.BACK, "rear":Vector3.FORWARD,
		"left":Vector3.RIGHT, "right":Vector3.LEFT, "top":Vector3.DOWN,
		"wheel":Vector3.ZERO}.get(zone, Vector3.ZERO)
	for raw_panel in (panels.get(zone, []) as Array):
		var panel := raw_panel as MeshInstance3D
		if panel == null or not is_instance_valid(panel) or not rest_transforms.has(panel.name):
			continue
		var rest: Transform3D = rest_transforms[panel.name]
		panel.transform = rest
		if severity <= 0.0001:
			continue
		var rng := RandomNumberGenerator.new()
		rng.seed = deformation_seed + absi(hash(panel.name))
		var weight: float = rng.randf_range(0.72, 1.0)
		var shift: float = float(profile.get("max_shift", 0.16)) * severity * weight
		panel.position += inward * shift
		var squash: float = clampf(1.0 - float(profile.get("max_dent", 0.22))
			* severity * weight, 0.62, 1.0)
		var scale_mult := Vector3.ONE
		if zone in ["front", "rear"]:
			scale_mult.z = squash
		elif zone in ["left", "right"]:
			scale_mult.x = squash
		elif zone == "top":
			scale_mult.y = squash
		panel.scale *= scale_mult
		var max_rot: float = deg_to_rad(float(profile.get("max_rotation_deg", 10.0)))
		var signed: float = rng.randf_range(-1.0, 1.0) * max_rot * severity
		panel.rotation += Vector3(signed * 0.35, signed * 0.22, signed)


func panel_transforms(zone: String = "") -> Dictionary:
	var out: Dictionary = {}
	var selected: Array = []
	if zone == "":
		for id in ZONES:
			selected.append_array(panels.get(id, []))
	else:
		selected = (panels.get(zone, []) as Array).duplicate()
	for raw_panel in selected:
		var panel := raw_panel as MeshInstance3D
		if panel != null and is_instance_valid(panel):
			out[panel.name] = panel.transform
	return out


func facts() -> Dictionary:
	return {"panel_count":rest_transforms.size(), "deform_events":deform_events,
		"zones":zone_state.duplicate(true), "deformation_seed":deformation_seed}


func snapshot() -> Dictionary:
	return {"version":1, "zones":zone_state.duplicate(true),
		"deformation_seed":deformation_seed}


func restore(state: Dictionary) -> bool:
	if int(state.get("version", 0)) != 1 or not state.has("zones"):
		return false
	deformation_seed = int(state.get("deformation_seed", deformation_seed))
	var restored_zones: Dictionary = state["zones"]
	for zone in ZONES:
		zone_state[zone] = clampf(float(restored_zones.get(zone, 0.0)), 0.0, 1.0)
	_apply_all()
	return true
