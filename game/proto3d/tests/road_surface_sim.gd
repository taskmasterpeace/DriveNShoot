extends Node
## Real Seattle road/terrain overlap reproduction. Owned disposable profile only.
var main: Node3D
var passed: int = 0
var failed: int = 0
var output: String = ""
var captures: Array[Dictionary] = []

func check(label: String, ok: bool) -> void:
	passed += int(ok)
	failed += int(not ok)
	print("ROAD SURFACE: %s %s" % ["PASS" if ok else "FAIL", label])

func frames(count: int = 5) -> void:
	await get_tree().process_frame
	for i: int in count:
		await get_tree().physics_frame

func key(code: Key, down: bool) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.physical_keycode = code
	event.pressed = down
	Input.parse_input_event(event)
	await frames()

func capture(id: String) -> void:
	if output.is_empty():
		return
	await frames(10)
	await RenderingServer.frame_post_draw
	var picture: Image = get_viewport().get_texture().get_image()
	check(id + " real 1280x720 frame", picture.get_size() == Vector2i(1280,720))
	check(id + " saved", picture.save_png(output.path_join(id + ".png")) == OK)
	captures.append({"id":id,"pixels":str(picture.get_size()),"player":str(main.player.global_position),
		"car":str(main.active_car.global_position) if main.active_car != null else "on foot",
		"camera":str(main.cam_rig._cam.global_position),"hour":main.daynight.hour,
		"note":"Actual unedited game render. Locations are photographically staged, not continuous-trip evidence. See the named scene for real inputs exercised. Comparison clock held at 11:00. Isolated fresh profile."})

func probe_road(rid: String, slabs: Array[MeshInstance3D], at: Vector3, terrain_only: bool = false) -> void:
	var probes: int = 0
	var buried: int = 0
	var missed: int = 0
	var maximum: float = -INF
	var worst := Vector3.ZERO
	var collider_name: String = ""
	for slab: MeshInstance3D in slabs:
		if String(slab.get_meta("road_slab")) != rid:
			continue
		var size: Vector3 = (slab.mesh as BoxMesh).size
		for step: int in range(2, int(size.z) - 2, 4):
			var point: Vector3 = slab.global_transform * Vector3(2, size.y * 0.5, -size.z * 0.5 + step)
			if Vector2(point.x-at.x,point.z-at.z).length() > 200:
				continue
			var query := PhysicsRayQueryParameters3D.create(point + Vector3.UP * 20, point - Vector3.UP * 5, 1)
			var hit: Dictionary = main.get_world_3d().direct_space_state.intersect_ray(query)
			# The separate profile gate inspects physical terrain, while the
			# default broader gate STILL counts median/other obstruction hits.
			if terrain_only:
				var excluded: Array[RID] = []
				for attempt: int in 32:
					if hit.is_empty() or (hit["collider"] as Node).has_meta("relief_floor"):
						break
					excluded.append((hit["collider"] as CollisionObject3D).get_rid())
					query.exclude = excluded
					hit = main.get_world_3d().direct_space_state.intersect_ray(query)
				if not hit.is_empty() and not (hit["collider"] as Node).has_meta("relief_floor"):
					hit = {}
			if hit.is_empty():
				missed += 1
				continue
			probes += 1
			var gap: float = (hit["position"] as Vector3).y - point.y
			if gap > maximum:
				maximum = gap
				worst = point
				collider_name = str((hit["collider"] as Node).get_path())
				var body: Node = hit["collider"]
				collider_name += " meta=" + str(body.get_meta_list())
				for child: Node in body.get_children():
					if child is CollisionShape3D and child.shape is BoxShape3D:
						collider_name += " box=" + str(child.shape.size)
			if gap > 0.12:
				buried += 1
	print("ROAD SURFACE diagnostic: road=%s probes=%d buried=%d max=%.3f worst=%s collider=%s ground_y=%.3f" % [rid,probes,buried,maximum,worst,collider_name,ProtoWorldBuilder.ground_y(worst.x,worst.z)])
	check(rid + " has sampled physical pavement", probes >= 20)
	check(rid + " has a floor at every tested pavement point", missed == 0)
	check(rid + (" is not buried under physical terrain" if terrain_only else " is not buried under terrain or blockers"), buried == 0)

func run_checks(slabs: Array[MeshInstance3D], at: Vector3) -> void:
	for rid: String in ["I-90", "I-90_X11-off", "I-90_X11-on", "I-90_X11-off-r", "I-90_X11-on-r"]:
		probe_road(rid, slabs, at)

func _ready() -> void:
	var owned: String = ProjectSettings.globalize_path("res://../build/").replace("\\", "/").simplify_path().to_lower().trim_suffix("/") + "/"
	var profile: String = OS.get_user_data_dir().replace("\\", "/").simplify_path().to_lower()
	if not profile.begins_with(owned):
		print("ROAD SURFACE: REFUSED non-build save profile")
		get_tree().quit(2)
		return
	get_tree().create_timer(130).timeout.connect(func() -> void: get_tree().quit(2))
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--output="):
			output = argument.trim_prefix("--output=").replace("\\", "/").simplify_path()
	if not output.is_empty():
		if not output.to_lower().begins_with(owned) or DisplayServer.get_name() == "headless":
			get_tree().quit(2)
			return
		if DirAccess.make_dir_recursive_absolute(output) != OK:
			get_tree().quit(2)
			return
	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	await frames(15)
	if not output.is_empty():
		get_window().size = Vector2i(1280,720)
	await key(KEY_E, true)
	await key(KEY_E, false)
	check("actual E exits starter car", main.mode == main.Mode.FOOT)
	main.daynight.hour = 11.0
	main.daynight.dev_mult = 0.0
	# Photographic staging, not evidence of travelling from Virginia to Seattle.
	var at := Vector3(-56064, 12, -17888)
	main.player.global_position = at
	main.player.velocity = Vector3.ZERO
	main.cam_rig.zoom_t = 0.75
	for i: int in 70:
		main.stream.update_stream(at, main)
		await frames(1)
	main.cam_rig.snap_to_target()
	await frames(30)
	await capture("01_seattle_approach")
	var slabs: Array[MeshInstance3D] = []
	for chunk: Node3D in main.stream.loaded.values():
		for child: Node in chunk.get_children():
			if child is MeshInstance3D and child.has_meta("road_slab"):
				slabs.append(child as MeshInstance3D)
	check("real road slabs loaded around photographed approach", slabs.size() > 5)
	# Check the actual top faces and physics floor, not surface_at's abstract
	# road classification (which remains 'road' when terrain buries the mesh).
	await run_checks(slabs, at)
	if not output.is_empty():
		var manifest := FileAccess.open(output.path_join("manifest.json"),FileAccess.WRITE)
		if manifest == null:
			check("capture manifest can be written",false)
		else:
			manifest.store_string(JSON.stringify({"scene":get_script().resource_path,"passed":passed,"failed":failed,"captures":captures},"\t"))
			manifest.close()
	main.queue_free()
	await frames(8)
	main = null
	print("ROAD SURFACE RESULTS: %d passed, %d failed" % [passed,failed])
	get_tree().quit(0 if failed == 0 else 1)
