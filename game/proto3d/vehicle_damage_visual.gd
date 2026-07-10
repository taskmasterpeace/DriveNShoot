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
var marks: Array[MeshInstance3D] = []
var mark_summaries: Array[Dictionary] = []
var mark_reuses: int = 0
var _mark_serial: int = 0
var _mark_material: StandardMaterial3D = null


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
	add_mark(_packet, resolution)


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


func add_mark(packet: Dictionary, resolution: Dictionary) -> bool:
	if not bool(resolution.get("mark_allowed", false)) or car == null:
		return false
	var world_pos: Vector3 = packet.get("world_pos", Vector3.ZERO)
	var world_normal: Vector3 = packet.get("world_normal", Vector3.UP)
	if not world_pos.is_finite() or not world_normal.is_finite():
		return false
	if world_normal.length_squared() < 0.0001:
		world_normal = Vector3.UP
	var local_pos: Vector3 = car.to_local(world_pos)
	var local_normal: Vector3 = (car.global_basis.inverse() * world_normal).normalized()
	var cap: int = clampi(int(profile.get("mark_cap", 16)), 1, 16)
	var slot_index: int = marks.size()
	if marks.size() < cap:
		marks.append(_new_mark())
		mark_summaries.append({})
	else:
		slot_index = _oldest_mark_index()
		mark_reuses += 1
	_mark_serial += 1
	var summary: Dictionary = {"zone":String(resolution.get("zone", "front")),
		"local_pos":local_pos, "local_normal":local_normal,
		"radius":clampf(0.035 + float(packet.get("energy", 0.0)) * 0.0002, 0.035, 0.08),
		"serial":_mark_serial}
	mark_summaries[slot_index] = summary
	_place_mark(slot_index, summary)
	return true


func _new_mark() -> MeshInstance3D:
	if _mark_material == null:
		_mark_material = StandardMaterial3D.new()
		_mark_material.albedo_color = Color("#181512")
		_mark_material.roughness = 0.96
	var mark := MeshInstance3D.new()
	mark.name = "ImpactMark_%02d" % marks.size()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.04
	mesh.bottom_radius = 0.052
	mesh.height = 0.012
	mesh.radial_segments = 10
	mark.mesh = mesh
	mark.material_override = _mark_material
	mark.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mark.add_to_group("vehicle_damage_mark")
	add_child(mark)
	return mark


func _oldest_mark_index() -> int:
	var oldest_index: int = 0
	var oldest_serial: int = int(mark_summaries[0].get("serial", 0))
	for i in range(1, mark_summaries.size()):
		var serial: int = int(mark_summaries[i].get("serial", 0))
		if serial < oldest_serial:
			oldest_serial = serial
			oldest_index = i
	return oldest_index


func _place_mark(index: int, summary: Dictionary) -> void:
	var mark: MeshInstance3D = marks[index]
	var normal: Vector3 = summary.get("local_normal", Vector3.UP)
	if normal.length_squared() < 0.0001:
		normal = Vector3.UP
	normal = normal.normalized()
	mark.position = (summary.get("local_pos", Vector3.ZERO) as Vector3) + normal * 0.012
	mark.quaternion = Quaternion(Vector3.UP, normal)
	var radius: float = float(summary.get("radius", 0.04))
	var mesh := mark.mesh as CylinderMesh
	mesh.top_radius = radius * 0.78
	mesh.bottom_radius = radius
	mark.set_meta("serial", int(summary.get("serial", 0)))
	mark.visible = true


func _ordered_mark_summaries() -> Array[Dictionary]:
	var ordered: Array[Dictionary] = []
	for summary in mark_summaries:
		if not summary.is_empty():
			ordered.append(summary.duplicate(true))
	ordered.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return int(a.get("serial", 0)) < int(b.get("serial", 0)))
	return ordered


func mark_resource_ids() -> Dictionary:
	var out: Dictionary = {}
	for i in marks.size():
		var mark: MeshInstance3D = marks[i]
		out[i] = [mark.get_instance_id(), mark.mesh.get_instance_id(),
			mark.material_override.get_instance_id()]
	return out


func facts() -> Dictionary:
	var finite: bool = true
	var aligned: bool = true
	for i in mark_summaries.size():
		var summary: Dictionary = mark_summaries[i]
		if summary.is_empty():
			continue
		var local_pos: Vector3 = summary.get("local_pos", Vector3.ZERO)
		var normal: Vector3 = summary.get("local_normal", Vector3.UP)
		finite = finite and local_pos.is_finite() and normal.is_finite()
		aligned = aligned and marks[i].global_basis.y.normalized().dot(
			(car.global_basis * normal).normalized()) > 0.96
	return {"panel_count":rest_transforms.size(), "deform_events":deform_events,
		"zones":zone_state.duplicate(true), "deformation_seed":deformation_seed,
		"mark_count":mark_summaries.size(), "mark_cap":clampi(int(profile.get("mark_cap", 16)), 1, 16),
		"mark_reuses":mark_reuses, "mark_summaries":_ordered_mark_summaries(),
		"marks_finite":finite, "marks_aligned":aligned}


func snapshot() -> Dictionary:
	return {"version":1, "zones":zone_state.duplicate(true),
		"deformation_seed":deformation_seed, "marks":_ordered_mark_summaries()}


func restore(state: Dictionary) -> bool:
	if int(state.get("version", 0)) != 1 or not state.has("zones"):
		return false
	deformation_seed = int(state.get("deformation_seed", deformation_seed))
	var restored_zones: Dictionary = state["zones"]
	for zone in ZONES:
		zone_state[zone] = clampf(float(restored_zones.get(zone, 0.0)), 0.0, 1.0)
	_apply_all()
	_clear_marks()
	for raw_summary in (state.get("marks", []) as Array):
		if raw_summary is not Dictionary:
			continue
		var summary: Dictionary = (raw_summary as Dictionary).duplicate(true)
		if marks.size() >= clampi(int(profile.get("mark_cap", 16)), 1, 16):
			break
		marks.append(_new_mark())
		mark_summaries.append(summary)
		_mark_serial = maxi(_mark_serial, int(summary.get("serial", 0)))
		_place_mark(marks.size() - 1, summary)
	return true


func _clear_marks() -> void:
	for mark in marks:
		mark.queue_free()
	marks.clear()
	mark_summaries.clear()
	_mark_serial = 0
	mark_reuses = 0
