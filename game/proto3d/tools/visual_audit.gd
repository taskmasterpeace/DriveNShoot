extends "res://proto3d/tools/roadstead_photobooth.gd"
## Documentary tour of the REAL main scene. No synthetic HUD or replacement art.
## Launch/screens use real UI input; distant locations and cartridge seeds are
## staged explicitly and recorded in manifest.json. Run with a fresh APPDATA.

var evidence: Array[Dictionary] = []
var front_only: bool = false
var _note: String = "Normal launch; no photographic staging."


func _ready() -> void:
	get_tree().create_timer(180.0).timeout.connect(func() -> void:
		push_error("VISUAL AUDIT watchdog")
		get_tree().quit(1))
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--output="):
			output = argument.trim_prefix("--output=")
		front_only = front_only or argument == "--front-only"
	if DisplayServer.get_name() == "headless" or DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output)) != OK:
		push_error("VISUAL AUDIT needs a rendering driver and writable output")
		get_tree().quit(1)
		return
	_run.call_deferred()


func _run() -> void:
	# Preserve this observer while the normal current_scene == main launch runs.
	get_tree().current_scene = null
	if get_tree().change_scene_to_file("res://proto3d/proto3d.tscn") != OK:
		get_tree().quit(1)
		return
	await frames(20)
	main = get_tree().current_scene
	await capture("01_title")
	await click_named("CONTROLS")
	await capture("02_title_controls")
	# Baseline may have an inaccessible subpanel; closing for tour navigation is
	# not asserted as usability proof (title_modal_sim tests real close inputs).
	if main.controls_panel != null:
		main.controls_panel.close()
	await frames(4)
	await click_named("OPTIONS")
	await capture("03_title_options")
	for node: Node in main.get_children():
		if node is ProtoMenu and node._options_panel != null:
			node._options_panel.close()
	await frames(4)
	await click_named("NEW GAME")
	await frames(90)
	await capture("04_new_game_highway")
	if not front_only:
		await _world_tour()
	var report := {"kind": "actual-runtime-visual-audit", "engine": Engine.get_version_info(),
		"viewport": str(get_viewport().get_visible_rect().size), "captures": evidence,
		"limitations": "Photographic location staging is not driving, combat or all-cartridge playthrough proof. No image retouching; no synthetic HUD. Normal title and New Game use injected UI input."}
	var file := FileAccess.open(output.path_join("manifest.json"), FileAccess.WRITE)
	if file == null:
		failed_captures += 1
	else:
		file.store_string(JSON.stringify(report, "\t"))
	var code := completion_exit_code(4 if front_only else 20)
	print("VISUAL AUDIT: %d screenshots, %d failures" % [successful_captures, failed_captures])
	get_tree().current_scene = null
	main.queue_free()
	main = null
	await frames(5)
	get_tree().quit(code)


func _world_tour() -> void:
	await key(KEY_E)
	main.daynight.hour = 11.0
	main.daynight.dev_mult = 0.0
	main.cam_rig.zoom_t = 0.25
	await stage("05_meridian", Vector3(110, 1, -320))
	await stage("06_appalachian_highway", Vector3(-6500, 1, 2875))
	await stage("07_colorado_highway", Vector3(-35125, 1, 0))
	await stage("08_road_office", main.road_life.office.global_position + Vector3(0, 1, 7))
	await position_at(main.road_life.office.interact_position() + Vector3(0, 0.2, 1))
	await key(KEY_E)
	_note = "Real interact input at the photographically staged freight desk."
	await capture("09_freight_desk")
	main.road_life.panel.close()
	await stage("10_home_porch", main.road_life.sites[0].global_position + Vector3(0, 1, 9))
	Input.action_press("move_up")
	await frames(90)
	Input.action_release("move_up")
	await frames(15)
	_note = "Walked through the real cottage doorway using movement input after porch staging."
	await capture("11_home_inside")
	await key(KEY_TAB)
	_note = "Real TAB inventory input; ordinary starter backpack, no mocked contents."
	await capture("12_backpack")
	if main.panel.is_open:
		main.panel.close()
	await key(KEY_K)
	await capture("13_character_sheet")
	await key(KEY_K)
	await key(KEY_M)
	await capture("14_route_map")
	# M cycles local/state/country/off; a second toggle does NOT close the GPS.
	main.stream._on_gps_button("power")
	if main.stream._map_mode != 0:
		failed_captures += 1
		push_error("VISUAL AUDIT: GPS did not power off before the next component")
	main.game_shell.open_library("console", {"source": "console", "device": "console"})
	_note = "Existing console library UI; directly opened for component photography."
	await capture("15_console_library")
	for sample: Dictionary in [
		{"id": "waste_heap", "shot": "16_waste_heap_square", "device": "handheld"},
		{"id": "bunker_breaker", "shot": "17_bunker_breaker_portrait", "device": "handheld"},
		{"id": "last_mile", "shot": "18_last_mile_landscape", "device": "handheld"},
		{"id": "rust_runners", "shot": "19_rust_runners_console", "device": "console"},
	]:
		# An owned-cartridge fixture belongs only to this throwaway photo profile.
		main.game_deck.ledger.unlock(String(sample.id))
		var opened: bool = main.game_shell.open_game(String(sample.id), {"source": "solo", "device": String(sample.device)})
		var started: bool = opened and main.game_deck.start(2026, [{"seat": 0, "device": -1, "profile_id": "local"}])
		if not started:
			failed_captures += 1
			push_error("VISUAL AUDIT could not start cartridge " + String(sample.id))
		await frames(35)
		_note = "Cartridge %s; unlocked photographic fixture, fixed solo seed; started=%s; no playthrough claim." % [sample.id, started]
		await capture(String(sample.shot))
	main.game_shell.power_off()
	main.daynight.hour = 23.0
	await frames(45)
	_note = "Same real cottage interior at 23:00; photographed after closing the cartridge shell. No lighting overrides or image edits."
	await capture("20_home_at_night")


func position_at(position: Vector3) -> void:
	var road: Dictionary = main.stream.usmap.road_near(position, 60.0)
	var surface := ProtoWorldBuilder.ground_y(position.x, position.z)
	if not road.is_empty():
		var a: Vector2 = road.a
		var ab: Vector2 = (road.b as Vector2) - a
		var along := clampf((Vector2(position.x, position.z) - a).dot(ab) / maxf(ab.length_squared(), 0.001), 0, 1)
		surface = maxf(surface, lerpf(float(road.get("elev_a", 0)), float(road.get("elev_b", 0)), along))
	position.y = maxf(position.y, surface + 0.9)
	main.player.global_position = position
	main.player.velocity = Vector3.ZERO
	main.player.move_state = ProtoPlayer3D.FootState.NORMAL
	for i: int in 45:
		main.stream.update_stream(position, main)
		await get_tree().physics_frame
	# Only documentary teleports snap; ordinary gameplay camera is unchanged.
	main.cam_rig.snap_to_target()
	await frames(90)


func stage(id: String, position: Vector3) -> void:
	await position_at(position)
	_note = "Photographic location staging at %s; real terrain/road height and snapped normal follow camera; 11:00 clock held for comparison." % str(position)
	await capture(id)


func capture(id: String) -> void:
	await frames(8)
	await RenderingServer.frame_post_draw
	var image: Image = get_viewport().get_texture().get_image()
	var error := save_capture_image(image, id)
	evidence.append({"id": id, "png": id + ".png", "saved": error == OK, "note": _note,
		"player": str(main.player.global_position), "camera": str(main.cam_rig._cam.global_position),
		"car": str(main.active_car.global_position) if main.active_car != null else "none",
		"hour": main.daynight.hour, "menu_open": main.menu_open})
	print("VISUAL AUDIT: %s error=%d" % [id, error])


func click_named(fragment: String) -> void:
	var button := find_button(main, fragment)
	if button == null:
		push_error("VISUAL AUDIT missing button: " + fragment)
		failed_captures += 1
		return
	button.grab_focus()
	await frames(3)
	await key(KEY_ENTER)


func find_button(node: Node, fragment: String) -> Button:
	if node is Button and node.is_visible_in_tree() and (node as Button).text.contains(fragment):
		return node as Button
	for child: Node in node.get_children():
		var found := find_button(child, fragment)
		if found != null:
			return found
	return null


func key(code: Key) -> void:
	for pressed: bool in [true, false]:
		var event := InputEventKey.new()
		event.keycode = code
		event.physical_keycode = code
		event.pressed = pressed
		Input.parse_input_event(event)
		await frames(4)
