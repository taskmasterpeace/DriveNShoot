extends Node
## Actual main scene / normal camera captures. Staging is photographic arrangement.
var main: Node
var output: String = "res://../docs/renders/roadstead"
var successful_captures: int = 0
var failed_captures: int = 0

func _ready() -> void:
	get_tree().create_timer(100.0).timeout.connect(func() -> void: get_tree().quit(1))
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--output="):
			output = argument.trim_prefix("--output=")
	var directory_error: Error = DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	if directory_error != OK:
		push_error("ROADSTEAD PHOTOBOOTH: output setup failed error=%d path=%s" % [directory_error, output])
		get_tree().quit(1)
		return
	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	await frames(10)
	await interact()
	for i: int in 8:
		await get_tree().process_frame
	if main.mode != main.Mode.FOOT:
		push_error("Roadstead photobooth could not exit car through input")
		get_tree().quit(1)
		return
	main.daynight.hour = 11.0
	main.cam_rig.zoom_t = 0.12
	await shoot("01_road_office", main.road_life.office.global_position + Vector3(0,0.2,5))
	main.player.global_position = main.road_life.office.interact_position() + Vector3(0,0,1)
	await frames(8)
	await interact()
	await capture("02_freight_desk")
	main.road_life.panel.close()
	var home: Node3D = main.road_life.sites[0]
	await shoot("03_cottage_porch", home.global_position + Vector3(0,0.2,9))
	Input.action_press("move_up")
	await frames(90)
	Input.action_release("move_up")
	await frames(10)
	await capture("04_cottage_inside")
	main.road_life.state.accept("last_light")
	await shoot("05_last_light_receiver", main.road_life.receivers.last_light.global_position + Vector3(0,0.2,9))
	var exit_code: int = completion_exit_code(5)
	if exit_code == 0:
		print("ROADSTEAD PHOTOBOOTH: 5 real runtime captures complete")
	else:
		push_error("ROADSTEAD PHOTOBOOTH: capture failed; %d succeeded, %d failed" % [successful_captures, failed_captures])
	main.queue_free()
	await frames(4)
	get_tree().quit(exit_code)

func shoot(id: String, position: Vector3) -> void:
	main.player.global_position = position
	main.player.velocity = Vector3.ZERO
	main.player.move_state = ProtoPlayer3D.FootState.NORMAL
	main.cam_rig.snap_to_target()
	for i: int in 35:
		main.stream.update_stream(position, main)
		await get_tree().physics_frame
	print("ROADSTEAD PHOTOBOOTH: stage %s actual=%s requested=%s" % [id,main.player.global_position,position])
	await capture(id)

func capture(id: String) -> void:
	main.hud._toast_q.clear()
	main.hud._toast_label.text = ""
	await frames(6)
	await RenderingServer.frame_post_draw
	var started: int = Time.get_ticks_msec()
	var image: Image = get_viewport().get_texture().get_image()
	var error: Error = save_capture_image(image, id)
	print("ROADSTEAD PHOTOBOOTH: %s error=%d capture_ms=%d objects=%d" % [id,error,Time.get_ticks_msec()-started,Performance.get_monitor(Performance.OBJECT_COUNT)])

func save_capture_image(image: Image, id: String) -> Error:
	var error: Error = ERR_INVALID_DATA if image == null or image.is_empty() else image.save_png(ProjectSettings.globalize_path(output + "/" + id + ".png"))
	if error == OK:
		successful_captures += 1
	else:
		failed_captures += 1
		push_error("ROADSTEAD PHOTOBOOTH: %s PNG write failed error=%d" % [id, error])
	return error

func completion_exit_code(expected_captures: int) -> int:
	return 0 if failed_captures == 0 and successful_captures == expected_captures else 1

func frames(count: int) -> void:
	for i: int in count:
		await get_tree().physics_frame

func interact() -> void:
	var event: InputEventAction = InputEventAction.new()
	event.action = "interact"
	event.pressed = true
	Input.parse_input_event(event)
	await get_tree().process_frame
	await frames(3)
	event = InputEventAction.new()
	event.action = "interact"
	Input.parse_input_event(event)
	await get_tree().process_frame
	await frames(3)
