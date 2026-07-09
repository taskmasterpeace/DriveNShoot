## THE LOOK (SEABOARD loop) — acceptance renders of the rail world, saved to
## docs/acceptance/ for the fresh-context judge. Shoots the REAL streamed world
## (proto3d booted, chunks built around the player), not a studio mock.
## Needs a real GPU context — run WITHOUT --headless (photobooth precedent):
##   Godot_v4.5.1-stable_win64_console.exe --path game res://proto3d/tools/seaboard_shots.tscn
extends Node3D

var _cam: Camera3D
var main: Node3D


func _out_dir() -> String:
	var root := ProjectSettings.globalize_path("res://")
	return root.path_join("../docs/acceptance")


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(_out_dir())
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 20:
		await get_tree().process_frame
	main.mode = main.Mode.FOOT
	main.active_car = null
	main.daynight.hour = 12.0 # clean noon light for the judge
	# Park the train at the depot, doors held, so the shot has its subject.
	if main.train != null and is_instance_valid(main.train):
		main.train._arrive(0)
		main.train.dwell = 9999.0
		main.train._pose()
	main.player.global_position = Vector3(210, 0.4, -350)
	for _i in 80:
		await get_tree().physics_frame # let the chunks and the station stream in

	_cam = Camera3D.new()
	add_child(_cam)
	_cam.make_current()

	# SHOT 1 — the DEPOT: rail + ties + station shell + sign + stop post + train.
	await _shoot(Vector3(238, 30, -312), Vector3(208, 0.5, -347), "seaboard_depot.png")
	# SHOT 2 — the CONSIST up close: loco + coaches on the steel.
	await _shoot(Vector3(220, 6, -336), Vector3(210, 1.4, -350), "seaboard_train.png")
	# SHOT 3 — the LINE running out of town (the gameplay-camera read, ~30 m up,
	# aimed ALONG the right-of-way so the ribbon + steel carry the frame).
	await _shoot(Vector3(280, 32, -318), Vector3(460, 0.3, -292), "seaboard_line.png")

	# SHOT 4 — MIAMI CENTRAL, the waterfront terminus: the OCEAN off the platform
	# (the stop condition's "ocean visible from the terminus"). Stream there first.
	main.player.global_position = Vector3(-160, 0.4, 20505)
	for _i in 90:
		await get_tree().physics_frame
	await _shoot(Vector3(-260, 26, 20560), Vector3(60, 0.3, 20500), "seaboard_miami_ocean.png")

	# SHOT 5 — THE MAP PAINTS WATER (stop condition): open the atlas with a real M
	# and photograph the country — the sea as ink, the SEABOARD line + station ticks.
	var m_down := InputEventKey.new()
	m_down.keycode = KEY_M
	m_down.physical_keycode = KEY_M
	m_down.pressed = true
	Input.parse_input_event(m_down)
	var m_up := InputEventKey.new()
	m_up.keycode = KEY_M
	m_up.physical_keycode = KEY_M
	m_up.pressed = false
	Input.parse_input_event(m_up)
	for _i in 20:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var mimg := get_viewport().get_texture().get_image()
	print("SEABOARD_SHOTS: %s (%s)" % ["seaboard_map.png",
		"ok" if mimg.save_png(_out_dir().path_join("seaboard_map.png")) == OK else "ERR"])

	print("SEABOARD_SHOTS: DONE")
	get_tree().quit(0)


func _shoot(from: Vector3, at: Vector3, file: String) -> void:
	_cam.global_position = from
	_cam.look_at(at)
	for _i in 12:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var path := _out_dir().path_join(file)
	print("SEABOARD_SHOTS: %s (%s)" % [file, "ok" if img.save_png(path) == OK else "ERR"])
