extends SceneTree
## Scratch photography harness. Staged locations/clock are NOT travel evidence.
var main: Node3D
var output: String = ""
var records: Array[Dictionary] = []
var failed: bool = false
var previous_scale: float = 1.0

func _initialize() -> void:
	call_deferred("_run")

func _frames(count: int) -> void:
	for i: int in count:
		await physics_frame

func _action(id: String) -> void:
	for pressed: bool in [true, false]:
		var event := InputEventAction.new()
		event.action = id
		event.pressed = pressed
		Input.parse_input_event(event)
		await _frames(5)

func _run() -> void:
	var build: String = ProjectSettings.globalize_path("res://../build/").replace("\\", "/").simplify_path().to_lower().trim_suffix("/") + "/"
	var profile: String = OS.get_user_data_dir().replace("\\", "/").simplify_path().to_lower()
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--capture-dir="):
			output = arg.trim_prefix("--capture-dir=").replace("\\", "/").simplify_path()
	if not profile.begins_with(build) or not output.to_lower().begins_with(build) or DisplayServer.get_name() == "headless":
		print("TRANSIT SCOUT: refused unsafe profile/output or headless rendering")
		quit(2)
		return
	previous_scale = Engine.time_scale
	create_timer(90.0).timeout.connect(func() -> void:
		Engine.time_scale = previous_scale
		print("TRANSIT SCOUT: watchdog")
		quit(2))
	var before: String = FileAccess.get_file_as_string("user://drivn.save") if FileAccess.file_exists("user://drivn.save") else ""
	root.size = Vector2i(1280, 720)
	main = load("res://proto3d/proto3d.tscn").instantiate()
	root.add_child(main)
	await _frames(15)
	await _action("interact")
	if main.mode != main.Mode.FOOT:
		print("TRANSIT SCOUT: real interaction did not exit the starter car")
		quit(1)
		return
	var old_day_speed: float = main.daynight.dev_mult
	main.daynight.dev_mult = 0.0
	main.weather.force("clear")
	main.cam_rig.zoom_t = 0.25
	var catalog: RefCounted = load("res://proto3d/transit/catalog.gd").new()
	var rows: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/transit.json"))
	if not catalog.setup(rows, main.stream.usmap):
		print("TRANSIT SCOUT: catalog rejected " + str(catalog.errors))
		quit(1)
		return
	var meridian: Vector3 = catalog.stop_position("meridian_east")
	var richmond: Vector3 = catalog.stop_position("richmond")
	await _stage_capture("01_meridian_east_day", meridian, 11.0, "Proposed terminal waiting point. Existing world before construction; no coach service shown.")
	await _stage_capture("02_richmond_west_day", richmond, 11.0, "Proposed western terminal, moved clear of church footprint. Staged for siting review, not a travelled journey.")
	await _stage_capture("03_richmond_church_day", Vector3(1422.09, 0, -239.81), 11.0, "Rejected terminal candidate at the church footprint. Existing geometry, not a constructed stop.")
	await _stage_capture("04_meridian_east_night", meridian, 22.0, "Unlit baseline at proposed terminal. Night visibility before transit shelter/practical lights.")
	main.daynight.dev_mult = old_day_speed
	Engine.time_scale = previous_scale
	var after: String = FileAccess.get_file_as_string("user://drivn.save") if FileAccess.file_exists("user://drivn.save") else ""
	failed = failed or before != after
	var file := FileAccess.open(output.path_join("frames.json"), FileAccess.WRITE)
	if file == null:
		failed = true
	else:
		file.store_string(JSON.stringify({"note":"Unretouched original game viewport; location and clock staged for photography, not travel proof.","save_unchanged":before == after,"frames":records}, "\t"))
		file.close()
	print("TRANSIT SCOUT: %d frames; isolated save unchanged=%s; failed=%s" % [records.size(), str(before == after), str(failed)])
	main.queue_free()
	await process_frame
	quit(1 if failed else 0)

func _stage_capture(id: String, position: Vector3, hour: float, note: String) -> void:
	main.daynight.hour = hour
	main.player.global_position = Vector3(position.x, ProtoWorldBuilder.ground_y(position.x, position.z) + 0.15, position.z)
	main.player.velocity = Vector3.ZERO
	await _frames(35)
	main.cam_rig.snap_to_target()
	await _frames(30)
	await RenderingServer.frame_post_draw
	var picture: Image = root.get_texture().get_image()
	var valid: bool = picture != null and picture.get_size() == Vector2i(1280,720)
	var error: Error = picture.save_png(output.path_join(id + ".png")) if valid else ERR_INVALID_DATA
	failed = failed or error != OK
	records.append({"id":id,"saved":error == OK,"size":str(picture.get_size()) if picture != null else "none","player":str(main.player.global_position),"camera":str(main.cam_rig._cam.global_position),"hour":hour,"note":note})
	print("TRANSIT SCOUT FRAME: " + JSON.stringify(records.back()))
