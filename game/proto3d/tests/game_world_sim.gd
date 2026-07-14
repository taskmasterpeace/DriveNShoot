## Final Phase 1 world wiring: shelf/caches/venues are real main-scene bodies,
## venue navigation exists before atlas setup, and ordinary save owns culture.
extends Node

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_WORLD: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_WORLD: start")
	get_tree().create_timer(100.0).timeout.connect(func() -> void:
		print("GAME_WORLD: WATCHDOG")
		get_tree().quit(1))
	var main: Node3D = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _frame in 12:
		await get_tree().process_frame
	var shelves := get_tree().get_nodes_in_group("game_shelf")
	var caches := get_tree().get_nodes_in_group("game_cache")
	var venues := get_tree().get_nodes_in_group("game_venue")
	_check("real main scene contains one shelf four caches and three venues",
		shelves.size() == 1 and caches.size() == 4 and venues.size() == 3)
	_check("every Game Deck world object uses the ordinary interaction law",
		(shelves + caches + venues).all(func(node: Node) -> bool:
			return node.is_in_group("interactable") and node.has_method("interact") \
				and node.has_method("interact_prompt")))

	var venue_script := load("res://proto3d/games/game_venue.gd") as GDScript
	var catalog: Dictionary = venue_script.load_catalog()
	var positions_ok := venues.size() == 3
	for row_value in catalog.get("venues", []):
		var row: Dictionary = row_value
		var pos: Array = row.get("position", [])
		var expected := Vector3(float(pos[0]), float(pos[1]), float(pos[2]))
		positions_ok = positions_ok and venues.any(func(venue: Node) -> bool:
			return String(venue.venue_row.get("id", "")) == String(row.get("id", "")) \
				and (venue as Node3D).global_position.is_equal_approx(expected))
	_check("all declared venue rows are placed at their exact world positions", positions_ok)
	var waypoint_names: Array = main.waypoints.map(func(waypoint: Array) -> String:
		return String(waypoint[0]))
	var venue_waypoints_ok := (catalog.get("venues", []) as Array).all(func(row: Dictionary) -> bool:
		return waypoint_names.has(String(row.get("waypoint", ""))))
	_check("every venue enters the existing waypoint and atlas ring before setup", venue_waypoints_ok
		and main.stream._pois.size() == main.waypoints.size())

	var discovered: Dictionary = {}
	for cache_value in caches:
		var cache: Node = cache_value
		for item_id in cache.container.slots:
			if String(item_id).begins_with("game_cart_"):
				discovered[String(item_id)] = true
	var expected_world_items: Array = ProtoContainer.ITEMS.keys().filter(func(item_id: Variant) -> bool:
		return String(item_id).begins_with("game_cart_") \
			and String(item_id) != "game_cart_fight_night_99")
	_check("physical caches cover every non-prize cartridge acquisition path",
		expected_world_items.all(func(item_id: Variant) -> bool:
			return discovered.has(String(item_id))))

	var drive_venue: Node = null
	for venue_value in venues:
		if String(venue_value.venue_row.get("id", "")) == "meridian_drive_in_games":
			drive_venue = venue_value
			break
	main.daynight.day = 2
	main.daynight.hour = 20.25
	main.backpack.add("scrip", 30)
	var live_world_start := false
	if drive_venue != null:
		drive_venue.interact(main)
		live_world_start = main.game_deck.state == "PLAYING" \
			and String(main.game_deck.current_context.get("tournament_id", "")) == "dial_drive_in"
	_check("walking up to a live real-world venue starts its ordinary tournament cartridge",
		live_world_start)
	main.game_deck.stop("world_save_probe")

	main.game_deck.ledger.unlock("radworm")
	main.game_deck.ledger.record_tournament("world-proof", {"event_id": "dial_drive_in",
		"game_id": "dial_tanks", "won": true})
	var save: Dictionary = main.save_game()
	main.game_deck.restore({})
	main.apply_save(save)
	_check("one-file save restores installs and tournament records",
		main.game_deck.ledger.is_unlocked("radworm")
		and main.game_deck.ledger.tournament_records.has("world-proof"))
	_check("world wiring and venue play never change time scale", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("GAME_WORLD RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_WORLD: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
