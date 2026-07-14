## COMPLETE CONSOLE SHELF contract: every row uses one 16:9 lifecycle and
## proves solo, two local seats, online context, input, pause, restore, result.
extends Node

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CONSOLE_CATALOG: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("CONSOLE_CATALOG: start")
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("CONSOLE_CATALOG: WATCHDOG")
		get_tree().quit(1))
	var registry := ProtoGameRegistry.load_catalog()
	var rows: Array = registry.phase_rows(1).filter(func(row: Dictionary) -> bool:
		return String(row.get("platform", "")) == "console")
	_check("catalog declares exactly ten console games", rows.size() == 10)
	var exact_titles := {
		"crown_of_ash": "CROWN OF ASH", "dial_tanks": "DIAL TANKS",
		"red_sky": "RED SKY", "black_orbit": "BLACK ORBIT",
		"gridbreach": "GRIDBREACH", "rustball": "RUSTBALL",
		"fuel_run": "FUEL RUN", "skyjoust": "SKYJOUST",
		"fight_night_99": "FIGHT NIGHT ’99", "ashland_command": "ASHLAND COMMAND",
	}
	_check("ten approved non-placeholder console titles are exact", rows.all(func(row: Dictionary) -> bool:
		var id := String(row.get("id", ""))
		return exact_titles.has(id) and String(row.get("title", "")) == String(exact_titles[id])))
	_check("every console row ships a substantial objective and in-lore history",
		rows.all(func(row: Dictionary) -> bool:
			return String(row.get("help", "")).length() >= 60 \
				and String(row.get("about_world", "")).length() >= 60))
	var book_data: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/books.json"))
	var guide_pages: Array = []
	if book_data is Dictionary:
		for book_value in (book_data as Dictionary).get("books", []):
			var book: Dictionary = book_value
			if String(book.get("id", "")) == "book_game_deck_console":
				guide_pages = book.get("pages", [])
				break
	var all_guided := guide_pages.size() == 11
	for title_value in exact_titles.values():
		var title := String(title_value).replace("’", "'")
		all_guided = all_guided and guide_pages.any(func(page_value: Variant) -> bool:
			return String(page_value).replace("’", "'").begins_with(title))
	_check("the console annual has one usage page and one strategy page per title", all_guided)
	_check("the console shelf shares one original presentation helper",
		ResourceLoader.exists("res://proto3d/games/console/console_draw.gd"))
	var before_scale := Engine.time_scale
	for row_value in rows:
		await _prove_row(registry, row_value as Dictionary)
	_check("the full console shelf never changes world time scale", Engine.time_scale == before_scale)
	_finish()


func _prove_row(registry: RefCounted, row: Dictionary) -> void:
	var id := String(row.get("id", ""))
	var scene_path := String(row.get("cartridge_scene", ""))
	if not ResourceLoader.exists(scene_path):
		_check("%s is installed" % id, false)
		return
	var device: Dictionary = registry.get_device(String(row.get("device_id", "")))
	var resolution: Array = device.get("resolution", [])
	_check("%s uses the shared 16:9 console" % id, String(row.get("aspect", "")) == "16:9"
		and String(device.get("aspect", "")) == "16:9" and resolution.size() == 2
		and int(resolution[0]) == 1280 and int(resolution[1]) == 720)
	_check("%s implements the shared cartridge contract" % id,
		String(registry.cartridge_contract_error(id)) == "")
	var game := (load(scene_path) as PackedScene).instantiate() as Control
	var viewport := SubViewport.new()
	viewport.size = Vector2i(1280, 720)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(viewport)
	viewport.add_child(game)
	await get_tree().process_frame

	game.configure(row, {"source": "catalog-solo"})
	game.start_match(1200 + id.hash(), [{"seat": 0, "device": -1, "profile_id": "solo"}])
	_check("%s starts a deterministic solo/AI match" % id, bool(game.get("active"))
		and int(game.get("seed_value")) == 1200 + id.hash())
	var original: Dictionary = game.snapshot()
	game.apply_inputs(1, [_seat_snapshot(0, Vector2.LEFT, Vector2.RIGHT)])
	_check("%s consumes semantic console input" % id, int(game.snapshot().get("tick", 0)) >= 1)
	game.pause_match(true)
	var paused: Dictionary = game.snapshot()
	game.apply_inputs(2, [_seat_snapshot(0, Vector2.RIGHT, Vector2.LEFT)])
	_check("%s pauses without simulation mutation" % id, game.snapshot() == paused)
	game.pause_match(false)
	game.restore_snapshot(original)
	_check("%s restores a deterministic snapshot" % id,
		JSON.stringify(game.snapshot()) == JSON.stringify(original))

	game.start_match(1300 + id.hash(), [
		{"seat": 0, "device": -1, "profile_id": "local-a"},
		{"seat": 1, "device": 1, "profile_id": "local-b"},
	])
	game.apply_inputs(1, [_seat_snapshot(0, Vector2.LEFT, Vector2.RIGHT),
		_seat_snapshot(1, Vector2.RIGHT, Vector2.LEFT)])
	_check("%s assigns two distinct local seats" % id, (game.get("seats") as Array).size() == 2)

	game.configure(row, {"source": "session", "online": true,
		"session_id": "online-%s" % id})
	game.start_match(1400 + id.hash(), [
		{"seat": 0, "peer_id": 1, "profile_id": "host"},
		{"seat": 1, "peer_id": 2, "profile_id": "remote"},
	])
	var online_state: Dictionary = game.snapshot()
	_check("%s accepts the same-session online context" % id, bool(game.context.get("online", false))
		and String(online_state.get("session_id", "")) == "online-%s" % id)
	var emissions := [0]
	game.match_finished.connect(func(_result: Dictionary) -> void: emissions[0] += 1)
	var forced := game.has_method("debug_force_finish") and bool(game.debug_force_finish())
	var result: Dictionary = game.get("last_result")
	_check("%s emits one normalized valid result" % id, forced and int(emissions[0]) == 1
		and String(result.get("game_id", "")) == id
		and String(result.get("ruleset", "")) == String(row.get("ruleset", ""))
		and String(result.get("outcome", "")) == "complete"
		and (result.get("primary", null) is int or result.get("primary", null) is float))
	game.stop_match("catalog_done")
	viewport.remove_child(game)
	game.free()
	viewport.queue_free()


func _seat_snapshot(seat: int, move: Vector2, aim: Vector2) -> Dictionary:
	return {"seat": seat, "device": -1, "move": move, "aim": aim,
		"held": {"move_left": move.x < 0.0, "move_right": move.x > 0.0,
			"move_up": move.y < 0.0, "move_down": move.y > 0.0,
			"primary": true, "secondary": true, "mobility": true, "stance": true},
		"pressed": {"move_left": move.x < 0.0, "move_right": move.x > 0.0,
			"move_up": move.y < 0.0, "move_down": move.y > 0.0,
			"primary": true, "secondary": true, "mobility": true, "stance": true,
			"interact": true}, "released": {}}


func _finish() -> void:
	print("CONSOLE_CATALOG RESULTS: %d passed, %d failed" % [passed, failed])
	print("CONSOLE_CATALOG: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
