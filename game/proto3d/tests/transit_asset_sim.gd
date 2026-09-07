extends Node3D
## Real imported art contract / optional GPU art bench. Not a transport ride test.
var passed: int = 0
var failed: int = 0
var models: Array[Node3D] = []

func _check(label: String, result: bool) -> void:
	passed += 1 if result else 0
	failed += 0 if result else 1
	print("TRANSIT ASSET %s: %s" % ["PASS" if result else "FAIL", label])

func _ready() -> void:
	var owned: String = ProjectSettings.globalize_path("res://../build/").replace("\\", "/").simplify_path().to_lower().trim_suffix("/") + "/"
	var profile: String = OS.get_user_data_dir().replace("\\", "/").simplify_path().to_lower()
	if not profile.begins_with(owned):
		print("TRANSIT ASSET PROFILE REFUSED")
		get_tree().quit(2)
		return
	get_tree().create_timer(45.0).timeout.connect(func() -> void:
		print("TRANSIT ASSET WATCHDOG")
		get_tree().quit(1))
	for id: String in ["lastline_coach", "kestrel_courier"]:
		var resource: Resource = load("res://assets/models/transit/" + id + ".glb")
		_check(id + " imports as a real PackedScene", resource is PackedScene)
		if not resource is PackedScene:
			continue
		var model: Node3D = (resource as PackedScene).instantiate() as Node3D
		add_child(model)
		models.append(model)
		if "--probe-scale" in OS.get_cmdline_user_args():
			model.scale = Vector3.ONE * 0.5
		await get_tree().process_frame
		var bounds: AABB = _bounds(model)
		_check(id + " ground origin is actual mesh contact", absf(bounds.position.y) < 0.03)
		_check(id + " metres preserve full vehicle height", bounds.size.y > 3.0 and bounds.size.y < 3.8)
		_check(id + " full vehicle length survives import", bounds.size.z > 8.0 and bounds.size.z < 11.0)
		for part: String in ["Seat_driver", "Seat_passenger_01", "Boarding", "Exit", "Door_passenger"]:
			_check(id + " has usable " + part, model.find_child(part, true, false) is Node3D)
		var driver: Node3D = model.find_child("Seat_driver", true, false) as Node3D
		if driver != null:
			var p: Vector3 = model.to_local(driver.global_position)
			_check(id + " faces -Z with a left-hand driver", p.x < 0.0 and p.z < 0.0)
		var roof: Node3D = model.find_child("Roof_coach" if id == "lastline_coach" else "Roof_cabin", true, false) as Node3D
		_check(id + " has separately renderable roof", roof is MeshInstance3D)
		if roof is MeshInstance3D:
			roof.hide()
			_check(id + " cutaway preserves visible cabin body", not roof.is_visible_in_tree() and _visible_meshes(model) >= 4)
			roof.show()
		if id == "lastline_coach":
			for wheel: String in ["Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR"]:
				_probe_rotation(model, wheel, Vector3.RIGHT)
		else:
			_probe_rotation(model, "Rotor_main", Vector3.UP)
			_probe_rotation(model, "Rotor_tail", Vector3.RIGHT)
		# Fixed metre-space probes also fail if an exporter shrinks the whole model.
		if not "--probe-scale" in OS.get_cmdline_user_args():
			_probe_passenger_space(model, id)
	if DisplayServer.get_name() != "headless" and models.size() == 2:
		await _capture_bench()
	print("TRANSIT ASSET RESULTS: %d passed, %d failed" % [passed, failed])
	get_tree().quit(0 if failed == 0 else 1)

func _visible_meshes(node: Node) -> int:
	var count: int = 1 if node is MeshInstance3D and node.is_visible_in_tree() else 0
	for child: Node in node.get_children():
		count += _visible_meshes(child)
	return count

func _bounds(model: Node3D) -> AABB:
	var result: AABB = AABB()
	var first: bool = true
	for child: Node in model.find_children("*", "MeshInstance3D", true, false):
		var mesh: MeshInstance3D = child as MeshInstance3D
		var value: AABB = mesh.global_transform * mesh.get_aabb()
		result = value if first else result.merge(value)
		first = false
	return result

func _probe_rotation(model: Node3D, part: String, axis: Vector3) -> void:
	var mesh: MeshInstance3D = model.find_child(part, true, false) as MeshInstance3D
	_check(part + " remains a separate imported mesh", mesh != null and mesh.mesh != null)
	if mesh == null or mesh.mesh == null:
		return
	var faces: PackedVector3Array = mesh.mesh.get_faces()
	_check(part + " supplies real geometry", faces.size() > 12)
	if faces.is_empty():
		return
	var sample: Vector3 = faces[0]
	for vertex: Vector3 in faces:
		if vertex.cross(axis).length() > sample.cross(axis).length():
			sample = vertex
	var pivot: Vector3 = mesh.global_position
	var before: Vector3 = mesh.global_transform * sample
	var original: Transform3D = mesh.transform
	mesh.rotate_object_local(axis, PI / 4.0)
	var after: Vector3 = mesh.global_transform * sample
	_check(part + " rotates geometry around its fixed attachment pivot", pivot.distance_to(mesh.global_position) < 0.001 and before.distance_to(after) > 0.1)
	mesh.transform = original

func _ray_hits(mesh: MeshInstance3D, start: Vector3, finish: Vector3, opaque_only: bool = false) -> bool:
	if mesh == null or mesh.mesh == null:
		return true # Missing geometry must not be mistaken for an open cabin.
	for surface: int in mesh.mesh.get_surface_count():
		var material: BaseMaterial3D = mesh.mesh.surface_get_material(surface) as BaseMaterial3D
		if opaque_only and material != null and material.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED:
			continue
		var arrays: Array = mesh.mesh.surface_get_arrays(surface)
		var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
		var count: int = indices.size() if not indices.is_empty() else vertices.size()
		for i: int in range(0, count - 2, 3):
			var a: Vector3 = vertices[indices[i] if not indices.is_empty() else i]
			var b: Vector3 = vertices[indices[i + 1] if not indices.is_empty() else i + 1]
			var c: Vector3 = vertices[indices[i + 2] if not indices.is_empty() else i + 2]
			if Geometry3D.segment_intersects_triangle(start, finish, mesh.global_transform * a, mesh.global_transform * b, mesh.global_transform * c) != null:
				return true
	return false

func _probe_passenger_space(model: Node3D, id: String) -> void:
	var body: MeshInstance3D = model.find_child("Body_coach" if id == "lastline_coach" else "Body_helicopter", true, false) as MeshInstance3D
	var door: MeshInstance3D = model.find_child("Door_passenger", true, false) as MeshInstance3D
	var boarding: Node3D = model.find_child("Boarding", true, false) as Node3D
	_check(id + " supplies boarding geometry for clearance probes", body != null and door != null and boarding != null)
	if body == null or door == null or boarding == null:
		return
	var z: float = boarding.global_position.z
	var clear: bool = true
	# Removing the animated door must reveal a real opening, not another fixed panel.
	for height: float in [1.06, 1.4, 1.9, 2.45]:
		for offset: float in [-0.30, 0.0, 0.30]:
			clear = not _ray_hits(body, Vector3(1.6,height,z + offset), Vector3(0.82,height,z + offset)) and clear
	_check(id + " open doorway has no fixed body panels across sampled passage", clear)
	_check(id + " door glazing is not backed by an opaque slab", not _ray_hits(door, Vector3(1.6,2.1,z), Vector3(0.8,2.1,z), true))
	if id == "lastline_coach":
		var wheel: MeshInstance3D = model.find_child("Wheel_FR", true, false) as MeshInstance3D
		if wheel != null:
			var bounds: AABB = wheel.global_transform * wheel.get_aabb()
			_check("coach boarding steps sit ahead of the front tire with clearance", bounds.position.z > z + 0.65)
	else:
		for x: float in [-0.43, 0.43]:
			_check("helicopter rear passenger headroom is not a solid aft block %s" % x, not _ray_hits(body, Vector3(x,1.86,0.3), Vector3(x,2.68,0.3)))

func _capture_bench() -> void:
	var folder: String = ""
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--capture-dir="):
			folder = arg.trim_prefix("--capture-dir=").replace("\\", "/")
	var owned: String = ProjectSettings.globalize_path("res://../build/").replace("\\", "/").simplify_path().to_lower().trim_suffix("/") + "/"
	if folder == "" or not folder.simplify_path().to_lower().begins_with(owned):
		_check("capture path stays in isolated build root", false)
		return
	DirAccess.make_dir_recursive_absolute(folder)
	models[0].position.x = -6.5
	models[1].position.x = 6.0
	var world: WorldEnvironment = WorldEnvironment.new()
	world.environment = Environment.new()
	world.environment.background_mode = Environment.BG_COLOR
	world.environment.background_color = Color("313a36")
	world.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	world.environment.ambient_light_color = Color("c8d8cf")
	world.environment.ambient_light_energy = 0.65
	add_child(world)
	var sun: DirectionalLight3D = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55,-30,0)
	sun.light_color = Color("ffe6be")
	sun.light_energy = 1.4
	sun.shadow_enabled = true
	add_child(sun)
	var floor_mesh: MeshInstance3D = MeshInstance3D.new()
	var plane: PlaneMesh = PlaneMesh.new()
	plane.size = Vector2(100,100)
	floor_mesh.mesh = plane
	var material: StandardMaterial3D = StandardMaterial3D.new()
	material.albedo_color = Color("56645a")
	material.roughness = 0.9
	floor_mesh.material_override = material
	floor_mesh.position.y = -0.02
	add_child(floor_mesh)
	var camera: Camera3D = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 17.0
	add_child(camera)
	camera.current = true
	var layer: CanvasLayer = CanvasLayer.new()
	add_child(layer)
	var title: Label = Label.new()
	title.position = Vector2(24,20)
	title.add_theme_font_size_override("font_size", 24)
	title.add_theme_color_override("font_color", Color("fff0cf"))
	title.add_theme_color_override("font_outline_color", Color("1c2721"))
	title.add_theme_constant_override("outline_size", 6)
	layer.add_child(title)
	var views: Array[Vector3] = [Vector3(19,17,-25), Vector3(-19,15,25), Vector3(9,27,-13)]
	for i: int in views.size():
		camera.position = views[i]
		camera.look_at(Vector3(0,1.2,0))
		title.text = "DRIVN / TRANSIT ART BENCH\nLASTLINE coach + KESTREL courier · %s\nImported game assets — not a live transport service" % ["FRONT", "REAR", "CABIN CUTAWAY"][i]
		if i == 2:
			models[0].find_child("Roof_coach", true, false).hide()
			models[1].find_child("Roof_cabin", true, false).hide()
		for frame: int in 4:
			await get_tree().process_frame
		await RenderingServer.frame_post_draw
		var capture: Image = get_viewport().get_texture().get_image()
		var error: Error = capture.save_png(folder + "/%02d_transit_bench.png" % (i + 1))
		_check("unaltered Godot art bench capture %d" % (i + 1), error == OK and capture.get_width() >= 1280)
