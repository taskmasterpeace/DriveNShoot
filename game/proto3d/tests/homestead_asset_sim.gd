## Real imported meshes: correct scale, independent cutaway and clear doorway.
extends Node3D

var passed: int = 0
var failed: int = 0


func check(label: String, condition: bool) -> void:
	if condition:
		passed += 1
	else:
		failed += 1
	print("HOMESTEAD: %s - %s" % ["PASS" if condition else "FAIL", label])


func _ready() -> void:
	get_tree().create_timer(30.0).timeout.connect(func() -> void: get_tree().quit(2))
	var home: Node3D = null
	var instances: Array[Node3D] = []
	for asset in ["roadstead_cottage", "parcel_mailbox", "freight_kiosk", "delivery_crate"]:
		var path: String = "res://assets/models/homestead/%s.glb" % asset
		check("imported scene %s" % asset, ResourceLoader.exists(path))
		if not ResourceLoader.exists(path):
			continue
		var packed: PackedScene = load(path) as PackedScene
		check("loadable PackedScene %s" % asset, packed != null)
		if packed == null:
			continue
		var instance: Node3D = packed.instantiate() as Node3D
		add_child(instance)
		instances.append(instance)
		var meshes: Array[Node] = instance.find_children("*", "MeshInstance3D", true, false)
		check("compact draw hierarchy %s" % asset, meshes.size() >= 1 and meshes.size() <= 2)
		if asset == "roadstead_cottage":
			home = instance
			# Optional negative controls transform the real imported mesh, never its metadata.
			if "--probe-narrow" in OS.get_cmdline_user_args():
				home.scale.x = 0.90
			if "--probe-shrunken" in OS.get_cmdline_user_args():
				home.scale = Vector3.ONE * 0.80
			if "--probe-floating" in OS.get_cmdline_user_args():
				home.position.y = 0.20
		else:
			instance.position.x = 40.0 + float(instances.size()) * 10.0
	if home != null:
		var body: MeshInstance3D = null
		var roof: MeshInstance3D = null
		for node in home.find_children("*", "MeshInstance3D", true, false):
			if String(node.name).begins_with("Roof"):
				roof = node as MeshInstance3D
			else:
				body = node as MeshInstance3D
		check("body and cutaway roof imported separately", body != null and roof != null)
		if body != null and roof != null:
			roof.visible = false
			check("cutaway leaves the house visible", body.is_visible_in_tree() and not roof.is_visible_in_tree())
			roof.visible = true
			var box: AABB = body.global_transform * body.get_aabb()
			check("front porch faces positive Z", box.end.z > 6.0 and box.position.z < -3.8)
			var solid := StaticBody3D.new()
			var shape := CollisionShape3D.new()
			shape.shape = body.mesh.create_trimesh_shape()
			solid.add_child(shape)
			add_child(solid)
			solid.global_transform = body.global_transform
			await get_tree().physics_frame
			await get_tree().physics_frame
			check("body has grounded geometry", box.position.y >= -0.06 and box.position.y <= 0.02)
			var wall_probes: Array[Dictionary] = [
				{"label": "right", "from": Vector3(5.20, 3.0, 0.0), "to": Vector3(4.90, 3.0, 0.0), "axis": 0, "want": 5.05},
				{"label": "left", "from": Vector3(-5.20, 3.0, 0.0), "to": Vector3(-4.90, 3.0, 0.0), "axis": 0, "want": -5.05},
				{"label": "front", "from": Vector3(0.0, 3.0, 4.20), "to": Vector3(0.0, 3.0, 3.90), "axis": 2, "want": 4.05},
				{"label": "back", "from": Vector3(0.0, 3.0, -4.20), "to": Vector3(0.0, 3.0, -3.90), "axis": 2, "want": -4.05},
			]
			for probe: Dictionary in wall_probes:
				var wall_hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(
					PhysicsRayQueryParameters3D.create(probe["from"], probe["to"])
				)
				var wall_surface_ok: bool = not wall_hit.is_empty()
				if wall_surface_ok:
					var hit_position: Vector3 = wall_hit["position"] as Vector3
					wall_surface_ok = absf(hit_position[int(probe["axis"])] - float(probe["want"])) <= 0.06
				check("%s wall surface preserves 10x8 footprint" % probe["label"], wall_surface_ok)
			var outside_probes: Array[Array] = [
				[Vector3(5.30, 3.0, 0.0), Vector3(5.12, 3.0, 0.0)],
				[Vector3(-5.30, 3.0, 0.0), Vector3(-5.12, 3.0, 0.0)],
				[Vector3(0.0, 3.0, 4.30), Vector3(0.0, 3.0, 4.12)],
				[Vector3(0.0, 3.0, -4.30), Vector3(0.0, 3.0, -4.12)],
			]
			for index: int in range(outside_probes.size()):
				var outside_hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(
					PhysicsRayQueryParameters3D.create(outside_probes[index][0], outside_probes[index][1])
				)
				check("footprint exterior control %d stays empty" % index, outside_hit.is_empty())
			# Measure the finished floor, not the generator's declared dimension.
			var floor_hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(
				PhysicsRayQueryParameters3D.create(Vector3(0.10, 1.0, 3.70), Vector3(0.10, -0.1, 3.70)))
			check("finished floor exists below doorway", not floor_hit.is_empty())
			var floor_height: float = -1.0
			if not floor_hit.is_empty():
				floor_height = (floor_hit["position"] as Vector3).y
			check("finished floor is raised 0.355m above ground", absf(floor_height - 0.355) <= 0.01)
			# At Z=4.04 these rays lie within wall thickness, away from the open door.
			var opening_edges: Array[float] = []
			for side: float in [-1.0, 1.0]:
				var edge_hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(
					PhysicsRayQueryParameters3D.create(Vector3(0.0, 1.4, 4.04), Vector3(side, 1.4, 4.04)))
				check("door jamb measurement has solid control %.0f" % side, not edge_hit.is_empty())
				if not edge_hit.is_empty():
					opening_edges.append((edge_hit["position"] as Vector3).x)
			if opening_edges.size() == 2:
				var clear_width: float = opening_edges[1] - opening_edges[0]
				check("measured doorway width is at least 1.3m", clear_width >= 1.30 and clear_width <= 1.44)
				check("measured doorway is centered", absf(opening_edges[1] + opening_edges[0]) <= 0.02)
			var ceiling_hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(
				PhysicsRayQueryParameters3D.create(Vector3(0.0, 1.4, 4.04), Vector3(0.0, 3.0, 4.04)))
			check("door overhead measurement has solid control", not ceiling_hit.is_empty())
			if not ceiling_hit.is_empty():
				var clear_height: float = (ceiling_hit["position"] as Vector3).y - floor_height
				print("HOMESTEAD GEOMETRY: floor=%.3f doorway_height=%.3f jambs=%s" % [floor_height, clear_height, opening_edges])
				check("measured doorway clears 2.2m above actual floor", clear_height >= 2.20 and clear_height <= 2.35)
			for x in [-0.65, 0.0, 0.65]:
				for y in [floor_height + 0.01, 1.40, floor_height + 2.20]:
					# Lowest ray starts inside the porch step, never inside its wood.
					var start_z: float = 4.01 if y < floor_height + 0.02 else 4.4
					var query := PhysicsRayQueryParameters3D.create(Vector3(x,y,start_z), Vector3(x,y,3.65))
					var hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(query)
					check("real doorway clear at %.2f, %.2f" % [x,y], hit.is_empty())
			for x in [-0.72, 0.72]:
				var casing_query := PhysicsRayQueryParameters3D.create(Vector3(x,1.4,4.4), Vector3(x,1.4,3.65))
				check("door width control detects casing at %.2f" % x,
					not get_world_3d().direct_space_state.intersect_ray(casing_query).is_empty())
			var header_query := PhysicsRayQueryParameters3D.create(Vector3(0.0,2.70,4.4), Vector3(0.0,2.70,3.65))
			check("door height control detects header", not get_world_3d().direct_space_state.intersect_ray(header_query).is_empty())
			solid.queue_free()
	for instance in instances:
		instance.queue_free()
	await get_tree().process_frame
	await get_tree().process_frame
	print("HOMESTEAD RESULTS: %d passed, %d failed" % [passed,failed])
	get_tree().quit(0 if failed == 0 else 1)
