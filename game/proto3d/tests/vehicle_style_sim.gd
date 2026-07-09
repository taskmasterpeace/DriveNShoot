## Production vehicle visual proof:
## every loaded ProtoCar3D row builds the modular low-poly style, keeps the live
## physics footprint, uses low-poly tires, and chars nested parts when destroyed.
## Run: Godot_console --headless --path game res://proto3d/tests/vehicle_style_sim.tscn
extends Node3D

var passed: int = 0
var failed: int = 0


func _ready() -> void:
	print("VEHICLE_STYLE_SIM: start")
	DrivnData.ensure()
	var ids: Array = []
	for key in ProtoCar3D.VEHICLES.keys():
		ids.append(String(key))
	ids.sort()
	for vehicle_id in ids:
		_check_vehicle(vehicle_id)
	_finish()


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("VEHICLE_STYLE_SIM: PASS - %s" % name)
	else:
		failed += 1
		print("VEHICLE_STYLE_SIM: FAIL - %s" % name)


func _finish() -> void:
	print("VEHICLE_STYLE_SIM RESULTS: %d passed, %d failed" % [passed, failed])
	print("VEHICLE_STYLE_SIM: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _check_vehicle(vehicle_id: String) -> void:
	var car := ProtoCar3D.create(vehicle_id, Color(0.10, 0.28, 0.62))
	add_child(car)
	var style := car.get_node_or_null("ModularVehicleStyle")
	var part_count := _mesh_count(style)
	_check("%s uses modular production style (%d parts)" % [vehicle_id, part_count],
		style != null and part_count >= 8 and part_count <= 72)

	var bounds := _visual_bounds(car)
	var target := _vehicle_visual_target_size(vehicle_id)
	_check("%s visual footprint matches live rig scale (got %.1fx%.1f, want %.1fx%.1f)" %
		[vehicle_id, bounds.size.x, bounds.size.z, target.x, target.z],
		absf(bounds.size.x - target.x) <= 0.45 and absf(bounds.size.z - target.z) <= 0.55)

	_check("%s tires are low-poly cylinders" % vehicle_id, _low_poly_tires(car))
	_check("%s nested parts char when wrecked" % vehicle_id, _nested_parts_char(car))
	car.queue_free()


func _mesh_count(root: Node) -> int:
	if root == null:
		return 0
	var count := 1 if root is MeshInstance3D else 0
	for child in root.get_children():
		count += _mesh_count(child)
	return count


func _visual_bounds(root: Node3D) -> AABB:
	var has_bounds := false
	var bounds := AABB()
	for child in root.get_children():
		if child is Node3D:
			var n := child as Node3D
			if n is CollisionShape3D or n is VehicleWheel3D or n is SpotLight3D or n is OmniLight3D:
				continue
			var child_bounds := _visual_bounds_for_node(n, n.transform)
			if child_bounds.size != Vector3.ZERO:
				bounds = bounds.merge(child_bounds) if has_bounds else child_bounds
				has_bounds = true
	return bounds


func _visual_bounds_for_node(node: Node3D, xform: Transform3D) -> AABB:
	var has_bounds := false
	var bounds := AABB()
	if node is MeshInstance3D:
		var mesh_node := node as MeshInstance3D
		var aabb := mesh_node.get_aabb()
		for i in range(8):
			var p := xform * aabb.get_endpoint(i)
			var point_box := AABB(p, Vector3.ZERO)
			bounds = bounds.merge(point_box) if has_bounds else point_box
			has_bounds = true
	for child in node.get_children():
		if child is Node3D:
			var child_3d := child as Node3D
			var child_bounds := _visual_bounds_for_node(child_3d, xform * child_3d.transform)
			if child_bounds.size != Vector3.ZERO:
				bounds = bounds.merge(child_bounds) if has_bounds else child_bounds
				has_bounds = true
	return bounds


func _vehicle_visual_target_size(vehicle_id: String) -> Vector3:
	var spec: Dictionary = ProtoCar3D.VEHICLES[vehicle_id]
	var chassis: Vector3 = spec["chassis"]
	var half_x := chassis.x * 0.5
	var half_z := chassis.z * 0.5
	var wheels: Array = spec.get("wheels", [])
	for wheel in wheels:
		var w: Array = wheel
		var visible := true if w.size() < 5 else bool(w[4])
		if not visible:
			continue
		var wx := absf(float(w[0]))
		var wz := absf(float(w[1]))
		var radius := float(w[5]) if w.size() > 5 else 0.35
		half_x = maxf(half_x, wx + radius)
		half_z = maxf(half_z, wz + radius)
	return Vector3(half_x * 2.0, chassis.y, half_z * 2.0)


func _low_poly_tires(car: ProtoCar3D) -> bool:
	var saw_tire := false
	for wheel in car.get_children():
		if not (wheel is VehicleWheel3D):
			continue
		for child in wheel.get_children():
			if child is MeshInstance3D:
				var mesh := (child as MeshInstance3D).mesh
				if mesh is CylinderMesh:
					saw_tire = true
					if (mesh as CylinderMesh).radial_segments > 10:
						return false
	return saw_tire


func _nested_parts_char(car: ProtoCar3D) -> bool:
	var style := car.get_node_or_null("ModularVehicleStyle")
	if style == null:
		return false
	var sample := _first_mesh(style)
	if sample == null:
		return false
	car._become_husk(false)
	var mat := sample.material_override as StandardMaterial3D
	if mat == null:
		return false
	return mat.albedo_color.r < 0.14 and mat.albedo_color.g < 0.14 and mat.albedo_color.b < 0.14


func _first_mesh(root: Node) -> MeshInstance3D:
	if root is MeshInstance3D:
		return root as MeshInstance3D
	for child in root.get_children():
		var found := _first_mesh(child)
		if found != null:
			return found
	return null
