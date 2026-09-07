extends Node3D
## Real factory, collision and throttle/brake proof; GPU views are runtime test
## bodies on physical ground, not a claim of main-world scheduled service.
var passed: int = 0
var failed: int = 0
var camera: Camera3D
var title: Label
var capture_dir: String = ""

func check(label: String, ok: bool) -> void:
	passed += int(ok)
	failed += int(not ok)
	print("TRANSIT VEHICLE %s: %s" % ["PASS" if ok else "FAIL", label])

func frames(count: int) -> void:
	for i: int in count:
		await get_tree().physics_frame

func _ready() -> void:
	var owned: String = ProjectSettings.globalize_path("res://../build/").replace("\\", "/").simplify_path().to_lower().trim_suffix("/") + "/"
	for key: String in ["APPDATA", "LOCALAPPDATA"]:
		if not OS.get_environment(key).replace("\\", "/").simplify_path().to_lower().begins_with(owned):
			get_tree().quit(2)
			return
	get_tree().create_timer(150.0).timeout.connect(func() -> void: get_tree().quit(2))
	check("authored service can be created", ResourceLoader.exists("res://proto3d/transit/vehicle.gd"))
	if failed:
		finish()
		return
	var factory: Script = load("res://proto3d/transit/vehicle.gd")
	DrivnData.ensure()
	var donor: Dictionary = (ProtoCar3D.VEHICLES["van"] as Dictionary).duplicate(true)
	var coach: ProtoCar3D = factory.make("coach")
	var heli: ProtoCar3D = factory.make("helicopter")
	check("factory preserves subclass", coach.get_script() == factory and heli.get_script() == factory)
	check("service creation never mutates donor", donor == ProtoCar3D.VEHICLES["van"])
	var ordinary_car: ProtoCar3D = ProtoCar3D.create("scavenger", Color.WHITE)
	check("ordinary factory retains stock brake strength", ordinary_car.max_brake == 40.0)
	ordinary_car.free()
	var previous_glb: bool = ProtoCar3D.use_glb_bodies
	ProtoCar3D.use_glb_bodies = false
	var service_body: ProtoCar3D = ProtoCar3D.create("lastline_coach", Color.WHITE)
	check("authored service never falls back to unrelated generic family art", service_body.find_child("Body_coach", true, false) != null)
	service_body.free()
	ProtoCar3D.use_glb_bodies = previous_glb
	check("invalid kind fails closed", factory.make("hovercraft") == null)
	var ordinary: Array = DrivnData.fleet()
	var inclusive: Array = (load("res://proto3d/data/data_library.gd") as Script).call("fleet", true)
	check("ordinary race fleet excludes both service rigs", not ordinary.has(DrivnData.vehicles[coach.vclass]) and not ordinary.has(DrivnData.vehicles[heli.vclass]) and inclusive.size() == ordinary.size() + 2)
	build_stage()
	# Staging only. All subsequent vehicle movement is engine physics.
	coach.position = Vector3(-6, 0.20, 0)
	heli.position = Vector3(7, 0.20, 0)
	add_child(coach)
	add_child(heli)
	coach.surface_override = "road"
	coach.use_player_input = false
	await frames(150)
	for car: ProtoCar3D in [coach, heli]:
		await probe_cabin(car, 6 if car == coach else 3)
	check("coach settles grounded without half-height sinking", absf(coach.position.y) < 0.15)
	check("helicopter settles on collision skids", absf(heli.position.y) < 0.08)
	check("helicopter has no traction wheels", heli._all_wheels.is_empty() and heli.max_engine_force == 0)
	for i: int in coach._all_wheels.size():
		var wheel: VehicleWheel3D = coach._all_wheels[i]
		var mesh: MeshInstance3D = wheel.get_child(0) as MeshInstance3D
		check("authored suspension wheel %d grounded and centred" % i, wheel.is_in_contact() and mesh != null and absf(mesh.global_position.y - 0.5) < 0.09 and mesh.position.length() < 0.001)
		check("authored wheel %d keeps separate rim material" % i, mesh.material_override == null and mesh.mesh.get_surface_count() >= 2)
		check("wheel %d suspension compresses under actual body weight" % i, wheel.position.y < 0.61 and wheel.position.y > 0.4)
		var centres: Array[Vector2] = [Vector2(-1.10,-1.95), Vector2(1.10,-1.95), Vector2(-1.10,2.7), Vector2(1.10,2.7)]
		check("authored wheel %d stays on original axle" % i, Vector2(wheel.position.x, wheel.position.z).distance_to(centres[i]) < 0.01)
	await capture("01_front", "LASTLINE + KESTREL / REAL RUNTIME BODIES\nPhysical test ground — not a scheduled main-world journey", Vector3(20, 11, -23), Vector3(0, 1.5, 0), 21)
	coach.set_door_open(true)
	heli.set_door_open(true)
	await frames(55)
	check("grounded helicopter permits disembark", heli.can_disembark())
	for car: ProtoCar3D in [coach, heli]:
		car.set_cabin_roof_faded(true)
		var seat: Node3D = car.passenger_anchor(0)
		check(car.vclass + " faded roof still collision bearing", not ray_clear(seat.global_position + Vector3.UP * 0.6, seat.global_position + Vector3.UP * 3))
		var roof: MeshInstance3D = car.find_child("Roof_coach" if car == coach else "Roof_cabin", true, false)
		var roof_material: BaseMaterial3D = roof.get_active_material(0)
		check(car.vclass + " roof material opens compatibility-renderer cabin view", roof_material.transparency == BaseMaterial3D.TRANSPARENCY_ALPHA and roof_material.albedo_color.a < 0.1)
	await capture("02_coach_cabin", "LASTLINE / OPEN AUTHORED DOOR + SIX SEATS\nRuntime roof cutaway; collision remains present", coach.position + Vector3(8, 9, -8), coach.position + Vector3(0, 1.4, 0), 9)
	await capture("03_helicopter_cabin", "KESTREL / OPEN SLIDING DOOR + THREE SEATS\nGrounded runtime body — flight controller not implemented here", heli.position + Vector3(7, 8, -7), heli.position + Vector3(0, 1.5, 0), 7)
	for car: ProtoCar3D in [coach, heli]:
		car.set_cabin_roof_faded(false)
		var roof: MeshInstance3D = car.find_child("Roof_coach" if car == coach else "Roof_cabin", true, false)
		check(car.vclass + " exterior roof restores shared authored material", roof.get_active_material(0) == roof.mesh.surface_get_material(0))
		car.set_door_open(false)
	await frames(55)
	# A real impulse lifts it; no transform staging to fake the airborne gate.
	heli.apply_central_impulse(Vector3.UP * heli.mass * 5)
	await frames(18)
	heli.set_door_open(true)
	await frames(35)
	check("aircraft rejects exit while physically airborne", heli.position.y > 0.3 and not heli.can_disembark())
	coach.is_active = true
	coach.input_throttle = 1.0
	var start: Vector3 = coach.position
	var previous: Vector3 = start
	var biggest_step: float = 0
	var rolling_basis: Basis = coach._all_wheels[0].get_child(0).global_basis
	for i: int in 240:
		await frames(1)
		biggest_step = maxf(biggest_step, coach.position.distance_to(previous))
		previous = coach.position
	check("throttle drives real coach more than 12 metres", coach.position.z < start.z - 12)
	check("every physics-frame displacement stays continuous", biggest_step < 0.4)
	check("authored wheels roll with their suspension", not coach._all_wheels[0].get_child(0).global_basis.is_equal_approx(rolling_basis))
	coach.set_door_open(true)
	await frames(45)
	check("moving coach rejects exit even with opened doors", coach.linear_velocity.length() > 1 and not coach.can_disembark())
	coach.set_door_open(false)
	coach.input_steer = 0.15
	await frames(40)
	check("front authored wheel actually steers", absf(coach._all_wheels[0].steering) > 0.015 and coach._all_wheels[0].get_child(0).get_parent() == coach._all_wheels[0])
	coach.input_steer = 0
	await capture("04_driving", "LASTLINE / THROTTLE-DRIVEN RUNTIME COACH\nActual VehicleBody3D motion; no transform-driven traversal", coach.position + Vector3(8, 6, -10), coach.position + Vector3(0, 1.3, 0), 10)
	coach.input_throttle = 0
	coach.input_brake = 1
	var brake_start: Vector3 = coach.position
	for i: int in 240:
		# Existing car brake pedal becomes reverse below 1 m/s. A public driver
		# finishes with the real parking handbrake, never a velocity assignment.
		if absf(coach.forward_speed) < 1.5:
			coach.input_brake = 0
			coach.input_handbrake = true
		if coach.linear_velocity.length() < 0.1:
			coach.input_handbrake = false
			coach.is_active = false
		await frames(1)
	var braking_distance: float = coach.position.distance_to(brake_start)
	print("PHYSICS displacement=%.3f max_step=%.3f braking_distance=%.3f stopped_speed=%.3f ground_y=%.3f" % [start.distance_to(brake_start), biggest_step, braking_distance, coach.linear_velocity.length(), coach.position.y])
	check("service brake stops coach within 20 metres", coach.linear_velocity.length() < 0.5 and braking_distance < 20)
	print("STOP ATTITUDE basis=%s sleeping=%s wheels=%s" % [coach.global_rotation_degrees, coach.sleeping, coach._all_wheels.map(func(w: VehicleWheel3D) -> Array: return [w.is_in_contact(), w.global_position.y, w.wheel_radius, w.get_contact_point(), w.get_contact_normal(), w.position])])
	check("braked coach remains upright and supported at wheel height", coach.global_basis.y.dot(Vector3.UP) > 0.98 and absf(coach.position.y) < 0.15)
	coach.set_door_open(true)
	await frames(50)
	check("stopped open coach permits exit", coach.can_disembark())
	finish()

func finish() -> void:
	print("TRANSIT VEHICLE RESULTS: %d passed, %d failed" % [passed, failed])
	get_tree().quit(0 if failed == 0 else 1)

func probe_cabin(car: ProtoCar3D, capacity: int) -> void:
	var model: Node3D = car.find_child("GlbBody", true, false)
	check(car.vclass + " model preserves metre scale", model != null and model.scale.is_equal_approx(Vector3.ONE))
	check(car.vclass + " no stock opaque meshes", car.get_children().filter(func(n: Node) -> bool: return n is MeshInstance3D).is_empty())
	check(car.vclass + " vector fields folded", car.spec.chassis is Vector3 and car.spec.cabin_pos is Vector3)
	check(car.vclass + " invalid seats reject", car.passenger_anchor(-1) == null and car.passenger_anchor(capacity) == null)
	for i: int in capacity:
		var anchor: Node3D = car.passenger_anchor(i)
		check("%s passenger %d anchor" % [car.vclass, i], anchor != null)
		if anchor == null:
			continue
		var local: Vector3 = car.to_local(anchor.global_position)
		check("%s seat %d at authored cushion height" % [car.vclass, i], absf(local.y - (1.22 if capacity == 6 else 1.25)) < 0.02)
		var coach_seats: Array[Vector2] = [Vector2(-0.56,-1.2),Vector2(0.56,-1.2),Vector2(-0.56,0.1),Vector2(0.56,0.1),Vector2(-0.56,1.4),Vector2(0.56,1.4)]
		var heli_seats: Array[Vector2] = [Vector2(0.43,-1.0),Vector2(-0.43,0.3),Vector2(0.43,0.3)]
		check("%s passenger %d uses distinct original seat" % [car.vclass, i], Vector2(local.x, local.z).distance_to((coach_seats if capacity == 6 else heli_seats)[i]) < 0.01)
		check("%s passenger %d torso clear of chassis collision" % [car.vclass, i], clear_sphere(anchor.global_position + car.global_basis.y * 0.35, 0.24))
		var head_from: Vector3 = anchor.global_position + car.global_basis.y * 0.4
		var head_to: Vector3 = anchor.global_position + car.global_basis.y * 1.05
		check("%s passenger %d authored headroom" % [car.vclass, i], not mesh_ray(model.find_child("Body_coach" if capacity == 6 else "Body_helicopter", true, false), head_from, head_to))
	var door: Node3D = model.find_child("Door_passenger", true, false)
	var closed: Transform3D = door.transform
	var board: Vector3 = car.to_local(car.anchor_world("Boarding"))
	var from: Vector3 = car.to_global(Vector3(1.65, 1.65, board.z))
	var to: Vector3 = car.to_global(Vector3(0.80, 1.65, board.z))
	check(car.vclass + " closed door is collision bearing", not ray_clear(from, to))
	check(car.vclass + " closed door rejects disembark", not car.can_disembark())
	car.set_door_open(true)
	check(car.vclass + " opening transition does not admit exit early", not car.can_disembark())
	await frames(50)
	check(car.vclass + " actual authored door moves", not door.transform.is_equal_approx(closed))
	check(car.vclass + " opened doorway collision clear", ray_clear(from, to))
	check(car.vclass + " moved door geometry clears passage", not mesh_ray(door, from, to))
	car.set_door_open(false)
	await frames(50)
	check(car.vclass + " door closes to original transform", door.transform.is_equal_approx(closed) and not ray_clear(from, to))

func clear_sphere(at: Vector3, radius: float) -> bool:
	var query := PhysicsShapeQueryParameters3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = radius
	query.shape = sphere
	query.transform.origin = at
	return get_world_3d().direct_space_state.intersect_shape(query).is_empty()

func ray_clear(from: Vector3, to: Vector3) -> bool:
	return get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(from, to)).is_empty()

func mesh_ray(mesh: MeshInstance3D, from: Vector3, to: Vector3) -> bool:
	var vertices: PackedVector3Array = mesh.mesh.get_faces()
	for i: int in range(0, vertices.size(), 3):
		if Geometry3D.segment_intersects_triangle(from, to, mesh.global_transform * vertices[i], mesh.global_transform * vertices[i + 1], mesh.global_transform * vertices[i + 2]) != null:
			return true
	return false

func build_stage() -> void:
	var ground := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(200, 1, 300)
	shape.shape = box
	shape.position.y = -0.5
	ground.add_child(shape)
	add_child(ground)
	var mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(200, 300)
	mesh.mesh = plane
	mesh.material_override = ProtoWorldBuilder.material(Color("49554b"), 0.95)
	add_child(mesh)
	var env := WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.background_mode = Environment.BG_COLOR
	env.environment.background_color = Color("313b36")
	env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.environment.ambient_light_color = Color("c6d6cb")
	env.environment.ambient_light_energy = 0.7
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, -30, 0)
	sun.light_energy = 1.3
	sun.shadow_enabled = true
	add_child(sun)
	camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	add_child(camera)
	camera.current = true
	var layer := CanvasLayer.new()
	add_child(layer)
	title = Label.new()
	title.position = Vector2(24, 20)
	title.add_theme_font_size_override("font_size", 23)
	title.add_theme_constant_override("outline_size", 5)
	layer.add_child(title)
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--capture-dir="):
			capture_dir = arg.trim_prefix("--capture-dir=")

func capture(id: String, label: String, eye: Vector3, target: Vector3, size: float) -> void:
	if DisplayServer.get_name() == "headless":
		return
	var owned: String = ProjectSettings.globalize_path("res://../build/").replace("\\", "/").simplify_path().to_lower().trim_suffix("/") + "/"
	if not capture_dir.replace("\\", "/").simplify_path().to_lower().begins_with(owned):
		check("capture refuses unsafe directory", false)
		return
	DirAccess.make_dir_recursive_absolute(capture_dir)
	camera.position = eye
	camera.look_at(target)
	camera.size = size
	title.text = label
	for i: int in 4:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img: Image = get_viewport().get_texture().get_image()
	check(id + " GPU image written", img.save_png(capture_dir + "/" + id + ".png") == OK)
