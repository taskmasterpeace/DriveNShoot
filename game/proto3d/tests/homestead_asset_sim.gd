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
			check("house width remains metre scale", box.size.x > 9.5 and box.size.x < 12.0)
			check("front porch faces positive Z", box.end.z > 6.0 and box.position.z < -3.8)
			var solid := StaticBody3D.new()
			var shape := CollisionShape3D.new()
			shape.shape = body.mesh.create_trimesh_shape()
			solid.add_child(shape)
			add_child(solid)
			solid.global_transform = body.global_transform
			await get_tree().physics_frame
			await get_tree().physics_frame
			for x in [-0.60, 0.0, 0.60]:
				for y in [0.60, 1.40, 2.25]:
					var query := PhysicsRayQueryParameters3D.create(Vector3(x,y,4.4), Vector3(x,y,3.65))
					var hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(query)
					check("real doorway clear at %.2f, %.2f" % [x,y], hit.is_empty())
			var wall_query := PhysicsRayQueryParameters3D.create(Vector3(1.5,1.4,4.4), Vector3(1.5,1.4,3.65))
			check("door test actually detects adjacent wall", not get_world_3d().direct_space_state.intersect_ray(wall_query).is_empty())
			solid.queue_free()
	for instance in instances:
		instance.queue_free()
	await get_tree().process_frame
	await get_tree().process_frame
	print("HOMESTEAD RESULTS: %d passed, %d failed" % [passed,failed])
	get_tree().quit(0 if failed == 0 else 1)
