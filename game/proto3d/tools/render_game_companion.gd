## Real Compatibility-renderer evidence for the standalone companion. This
## drives the same app, transitions, shell, cartridges, and semantic input as
## the release and writes both the required UI journey and three named frames
## for every installed game.
extends Control

const OUTPUT_RELATIVE := "../docs/verification/game_deck_companion"
const TEMP_SAVE := "user://game_deck_companion_render.json"
const UI_FRAME_WAIT := 4

var app: Control
var capture_viewport: SubViewport
var output_absolute := ""
var failures: Array[String] = []
var manifest_games: Array = []


func _ready() -> void:
	output_absolute = ProjectSettings.globalize_path("res://" + OUTPUT_RELATIVE)
	var directory_error := DirAccess.make_dir_recursive_absolute(
		output_absolute.path_join("games"))
	if directory_error != OK:
		_fail("cannot create verification output: %s" % error_string(directory_error))
		_finish()
		return

	capture_viewport = SubViewport.new()
	capture_viewport.name = "Exact1920x1080Capture"
	capture_viewport.size = Vector2i(1920, 1080)
	capture_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	capture_viewport.handle_input_locally = true
	add_child(capture_viewport)
	app = ProtoGameDeckCompanion.create(TEMP_SAVE)
	capture_viewport.add_child(app)
	await get_tree().process_frame
	app.set("_exit_on_quit", false)
	app.transition.set_process(false)
	app.deck.set_process(false)

	await _capture_png("01_boot.png")
	app.skip_boot()
	await _capture_png("02_full_shelf.png")

	app.inspect_game("waste_heap")
	await _capture_png("03_inspect_square_waste_heap.png")
	app.open_shelf("waste_heap")
	app.inspect_game("last_mile")
	await _capture_png("04_inspect_portrait_last_mile.png")
	app.open_shelf("last_mile")
	app.inspect_game("crown_of_ash")
	await _capture_png("05_inspect_console_crown_of_ash.png")

	app.open_shelf("waste_heap")
	app.inspect_game("waste_heap")
	app.insert_game("waste_heap")
	app.transition.call("_advance", 0.05)
	await _capture_png("06_insert_package_waste_heap.png")
	app.transition.call("_advance", 0.30)
	await _capture_png("07_insert_cartridge_waste_heap.png")
	app.transition.call("_advance", 0.30)
	await _capture_png("08_insert_contact_waste_heap.png")
	app.transition.call("_advance", 0.51)
	await _capture_png("09_play_square_waste_heap.png")
	app.shell.call("show_view", "help")
	await _capture_png("10_help_strategy_waste_heap.png")
	app.shell.call("show_view", "controls")
	await _capture_png("11_live_controls_waste_heap.png")
	app.shell.call("show_view", "about")
	await _capture_png("12_about_license_waste_heap.png")
	app.shell.call("show_view", "scores")
	await _capture_png("13_scoreboards_waste_heap.png")
	app.shell.call("show_view", "play")
	await _eject_to_shelf()

	await _launch("last_mile")
	_drive_action(34, KEY_W, true)
	await _capture_png("14_play_portrait_last_mile.png")
	await _eject_to_shelf()

	await _launch("rust_runners")
	_drive_action(40, KEY_D, true)
	await _capture_png("15_play_wide_rust_runners.png")
	app.change_cartridge()
	app.transition.call("_advance", 0.24)
	await _capture_png("16_eject_rust_runners.png")
	app.transition.call("_advance", 0.32)
	await _capture_png("17_shelf_focus_restored.png")

	app.show_promo()
	await _capture_png("18_drivn_full_game_promo.png")
	app.open_shelf("waste_heap")
	app.ui_state["reduced_motion"] = true
	app.inspect_game("waste_heap")
	app.insert_game("waste_heap")
	app.transition.call("_advance", 0.11)
	await _capture_png("19_reduced_motion_contact.png")
	app.transition.call("_advance", 0.10)
	await _eject_to_shelf()
	app.ui_state["reduced_motion"] = false

	await _capture_every_game()
	_write_manifest()
	_cleanup_temp_save()
	_finish()


func _capture_every_game() -> void:
	var order: Array = app.deck.registry.order
	for index in order.size():
		var game_id := String(order[index])
		var row: Dictionary = app.deck.registry.get_game(game_id)
		var folder_name := "%02d_%s" % [index + 1, game_id]
		var folder := output_absolute.path_join("games").path_join(folder_name)
		var make_error := DirAccess.make_dir_recursive_absolute(folder)
		if make_error != OK:
			_fail("cannot create %s" % folder_name)
			continue
		if not await _launch(game_id):
			_fail("%s did not launch for visual capture" % game_id)
			continue

		await _capture_jpg("games/%s/01_start.jpg" % folder_name)
		_drive_action(36, KEY_W if index % 2 == 0 else KEY_D, true)
		await _capture_jpg("games/%s/02_action.jpg" % folder_name)
		_drive_action(72, KEY_A if index % 2 == 0 else KEY_S, false)
		await _capture_jpg("games/%s/03_late.jpg" % folder_name)

		manifest_games.append({
			"order": index + 1,
			"id": game_id,
			"title": String(row.get("title", game_id)),
			"platform": String(row.get("platform", "")),
			"aspect": String(row.get("aspect", "")),
			"cover_path": String(row.get("cover_path", "")),
			"frames": [
				"games/%s/01_start.jpg" % folder_name,
				"games/%s/02_action.jpg" % folder_name,
				"games/%s/03_late.jpg" % folder_name,
			],
		})
		_release_inputs()
		await _eject_to_shelf()


func _launch(game_id: String) -> bool:
	if app.app_state == ProtoGameDeckCompanion.PLAY:
		await _eject_to_shelf()
	elif app.app_state in [ProtoGameDeckCompanion.INSPECT, ProtoGameDeckCompanion.PROMO]:
		app.open_shelf(game_id)
	if app.app_state != ProtoGameDeckCompanion.SHELF:
		_fail("launch %s started from unexpected state %s" % [game_id, app.app_state])
		return false
	if not app.inspect_game(game_id) or not app.insert_game(game_id):
		return false
	app.transition.call("_advance", 0.63)
	app.transition.call("_advance", 0.53)
	await _wait_frames(2)
	return app.app_state == ProtoGameDeckCompanion.PLAY \
		and String(app.deck.current_row.get("id", "")) == game_id


func _eject_to_shelf() -> void:
	if app.app_state == ProtoGameDeckCompanion.PLAY:
		_release_inputs()
		app.change_cartridge()
	if app.app_state == ProtoGameDeckCompanion.EJECT:
		app.transition.call("_advance", 0.56)
	await _wait_frames(2)
	if app.app_state != ProtoGameDeckCompanion.SHELF:
		_fail("eject did not restore shelf")


func _drive_action(ticks: int, direction_key: Key, primary: bool) -> void:
	for tick_index in ticks:
		var direction_pulse := tick_index % 4 == 0
		if direction_pulse:
			_send_key(direction_key, true)
		if primary and tick_index % 9 == 0:
			_send_mouse(MOUSE_BUTTON_LEFT, true)
		elif not primary and tick_index % 13 == 0:
			_send_key(KEY_SPACE, true)
		app.deck.process_tick()
		if direction_pulse:
			_send_key(direction_key, false)
		if primary and tick_index % 9 == 0:
			_send_mouse(MOUSE_BUTTON_LEFT, false)
		elif not primary and tick_index % 13 == 0:
			_send_key(KEY_SPACE, false)


func _release_inputs() -> void:
	for code in [KEY_W, KEY_A, KEY_S, KEY_D, KEY_SPACE]:
		_send_key(code, false)
	_send_mouse(MOUSE_BUTTON_LEFT, false)


func _send_key(code: Key, pressed: bool) -> void:
	if app == null or app.deck == null:
		return
	var event := InputEventKey.new()
	event.physical_keycode = code
	event.keycode = code
	event.pressed = pressed
	app.deck.feed_event(event)


func _send_mouse(button: MouseButton, pressed: bool) -> void:
	if app == null or app.deck == null:
		return
	var event := InputEventMouseButton.new()
	event.button_index = button
	event.pressed = pressed
	app.deck.feed_event(event)


func _capture_png(relative_path: String) -> void:
	await _capture(relative_path, false)


func _capture_jpg(relative_path: String) -> void:
	await _capture(relative_path, true)


func _capture(relative_path: String, jpeg: bool) -> void:
	await _wait_frames(UI_FRAME_WAIT)
	await RenderingServer.frame_post_draw
	var image := capture_viewport.get_texture().get_image()
	var absolute_path := output_absolute.path_join(relative_path)
	var error := image.save_jpg(absolute_path, 0.88) if jpeg \
		else image.save_png(absolute_path)
	if error != OK:
		_fail("capture failed %s: %s" % [relative_path, error_string(error)])
	else:
		print("GAME_COMPANION_RENDER: saved %s" % absolute_path)


func _wait_frames(count: int) -> void:
	for _index in count:
		await get_tree().process_frame


func _write_manifest() -> void:
	var manifest := {
		"product": "DRIVN: GAME DECK",
		"renderer": RenderingServer.get_current_rendering_method(),
		"viewport": [capture_viewport.size.x, capture_viewport.size.y],
		"ui_frames": 19,
		"game_count": manifest_games.size(),
		"frames_per_game": 3,
		"games": manifest_games,
	}
	var file := FileAccess.open(output_absolute.path_join("manifest.json"), FileAccess.WRITE)
	if file == null:
		_fail("cannot write visual manifest")
		return
	file.store_string(JSON.stringify(manifest, "\t"))
	file.close()


func _cleanup_temp_save() -> void:
	for candidate in [TEMP_SAVE, TEMP_SAVE + ".tmp"]:
		if FileAccess.file_exists(candidate):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(candidate))


func _fail(message: String) -> void:
	failures.append(message)
	print("GAME_COMPANION_RENDER: FAIL - %s" % message)


func _finish() -> void:
	if failures.is_empty():
		print("GAME_COMPANION_RENDER: PASS - 19 UI frames and 66 gameplay frames")
		get_tree().quit(0)
	else:
		print("GAME_COMPANION_RENDER: FAILURES - %s" % " | ".join(failures))
		get_tree().quit(1)
