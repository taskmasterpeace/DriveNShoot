extends Node
## Real-runtime render regression: daylight must preserve painted surface detail;
## midnight must remain readable. No screenshot editing or substitute renderer.
var main: Node
var passed: int = 0
var failed: int = 0
var output: String = "res://../docs/renders/lighting/verified"

func _ready() -> void:
	get_tree().create_timer(100.0).timeout.connect(func() -> void: get_tree().quit(1))
	if DisplayServer.get_name() == "headless":
		push_error("LIGHTING RENDER requires a real rendering driver")
		get_tree().quit(1)
		return
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--output="):
			output = argument.trim_prefix("--output=")
	check("capture directory writable", DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output)) == OK)
	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	await frames(10)
	await interact()
	check("real input exits the car", main.mode == main.Mode.FOOT)
	var home: Node3D = main.road_life.sites[0]
	main.player.global_position = home.global_position + Vector3(0,0.2,9)
	main.player.velocity = Vector3.ZERO
	main.player.snap_orientation(Vector3.FORWARD)
	main.aim_override = Vector3.FORWARD
	main.cam_rig.zoom_t = 0.12
	main.cam_rig.snap_to_target()
	await frames(35)
	Input.action_press("move_up")
	await frames(90)
	Input.action_release("move_up")
	await frames(10)
	check("input reached raised porch and cutaway", main.player.global_position.y > 0.3 and not home.roofs[0].visible)
	# Freeze only this scene, so every comparison shares camera/materials/weather.
	main.process_mode = Node.PROCESS_MODE_DISABLED
	ProtoWeather.sky_dim = 1.0
	ProtoWeather.sky_tint_amt = 0.0
	ProtoWeather.fog_mult = 1.0
	var measures: Dictionary = {}
	for preset: Array in [["noon",12.0,0.5],["dusk",19.0,0.5],["new_moon",0.0,0.0],["full_moon",0.0,1.0]]:
		main.daynight.hour = preset[1]
		main.daynight.moon_phase = preset[2]
		main.daynight._apply()
		main._update_location_label()
		# Settle the sky radiance update as well as the current color buffer.
		for i: int in 8:
			await get_tree().process_frame
		main.vision_cone.hide()
		var frame: Image = await capture(String(preset[0]) + "_unmasked")
		var stats: Dictionary = measure(frame)
		measures[preset[0]] = stats
		check("%s avoids near-white clipping (%.3f clipped)" % [preset[0], stats.clipped], stats.clipped < 0.015)
		check("%s surface remains readable (mean %.3f, detail %.3f)" % [preset[0], stats.mean, stats.detail], stats.mean > 0.055 and stats.mean < 0.8 and stats.detail > 0.035)
		main.vision_cone.show()
		main._update_vision_cone(1.0, false)
		await capture(String(preset[0]) + "_gameplay")
	check("day brighter than midnight", measures.noon.mean > measures.full_moon.mean * 1.2)
	check("full moon brighter than new moon", measures.full_moon.mean > measures.new_moon.mean + 0.01)
	main.queue_free()
	await frames(4)
	print("LIGHTING RENDER RESULTS: %d passed, %d failed" % [passed, failed])
	get_tree().quit(0 if failed == 0 else 1)

func measure(frame: Image) -> Dictionary:
	if frame == null or frame.is_empty():
		return {"clipped":1.0,"mean":0.0,"detail":0.0}
	# Fixed normal-camera framing around the cottage, excluding HUD and sky.
	var samples: Array[float] = []
	var clipped: int = 0
	var total: float = 0.0
	for y: int in range(int(frame.get_height()*0.24), int(frame.get_height()*0.68), 2):
		for x: int in range(int(frame.get_width()*0.32), int(frame.get_width()*0.66), 2):
			var color: Color = frame.get_pixel(x,y)
			var luminance: float = color.get_luminance()
			samples.append(luminance)
			total += luminance
			if minf(color.r, minf(color.g,color.b)) > 0.98:
				clipped += 1
	samples.sort()
	return {"clipped":float(clipped)/samples.size(), "mean":total/samples.size(),
		"detail":samples[int(samples.size()*0.9)]-samples[int(samples.size()*0.1)]}

func capture(id: String) -> Image:
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var frame: Image = get_viewport().get_texture().get_image()
	var error: Error = ERR_INVALID_DATA if frame == null or frame.is_empty() else frame.save_png(ProjectSettings.globalize_path(output.path_join(id + ".png")))
	check("%s captured" % id, error == OK)
	return frame

func frames(count: int) -> void:
	for i: int in count:
		await get_tree().physics_frame

func interact() -> void:
	for pressed: bool in [true, false]:
		var event: InputEventAction = InputEventAction.new()
		event.action = "interact"
		event.pressed = pressed
		Input.parse_input_event(event)
		await get_tree().process_frame
		await frames(3)

func check(label: String, result: bool) -> void:
	passed += int(result)
	failed += int(not result)
	print("LIGHTING RENDER: %s %s" % ["PASS" if result else "FAIL", label])
