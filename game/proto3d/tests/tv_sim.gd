## Proof for the SAFEHOUSE TV MVP (docs/cinema.md Phase 2 acceptance): walk to
## the set, E opens the panel (feet freeze), pick the test reel off the shelf,
## it PLAYS (a real Theora stream MediaForge converted), TIME PASSES while it
## rolls, watched persists through the save, E turns it off and gives you back
## your feet. Real key events; the reel is real media off the real manifest.
## Run: godot --headless --path game res://proto3d/tests/tv_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("TV: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _e() -> void:
	for down in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = KEY_E
		ev.physical_keycode = KEY_E
		ev.pressed = down
		Input.parse_input_event(ev)
		await get_tree().physics_frame
		await get_tree().physics_frame


func _ready() -> void:
	print("TV: start")
	get_tree().create_timer(75.0).timeout.connect(func() -> void:
		print("TV: WATCHDOG"); print("TV: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	main._exit_car()
	var p: ProtoPlayer3D = main.player
	# Home, RIGHT in front of the set (the home chest sits 1.3m away and wins
	# the nearest-interactable race from farther back — stand at the screen).
	p.global_position = main.SAFEHOUSE + Vector3(-3.0, 0.35, -1.4)
	p.velocity = Vector3.ZERO
	for _i in 8:
		await get_tree().physics_frame

	_check("the catalog LOADED (manifest rows: %d)" % main.media_registry.rows.size(),
		main.media_registry.rows.size() >= 1)
	_check("the TEST REEL is on the manifest (MediaForge made it)",
		main.media_registry.rows.has("test_pattern"))
	_check("the reel's file is INSTALLED", main.media_registry.installed("test_pattern"))
	_check("the TV is the current interactable", main._current_interactable is ProtoTV)

	# --- E opens the set; the feet freeze ---------------------------------------
	await _e()
	_check("E opens the media panel", main.media_panel.is_open)
	_check("the feet FREEZE while the set is on", p.input_locked)

	# --- Pick the reel off the CLIPS shelf --------------------------------------
	main.media_panel.set_category("clips")
	await get_tree().process_frame
	main.media_panel.select_media("test_pattern")
	for _i in 4:
		await get_tree().physics_frame
	_check("the reel ROLLS (stream live: %s)" % main.media_panel.now_playing_id,
		main.media_panel.playing() and main.media_panel.now_playing_id == "test_pattern")
	_check("watching MARKS it watched", main.media_watched.has("test_pattern"))

	# --- TIME PASSES while it plays (downtime costs daylight) -------------------
	var h0: float = main.daynight.hour
	for _i in 60:
		await get_tree().physics_frame
	var dh_watching: float = main.daynight.hour - h0
	main.media_panel.stop()
	for _i in 4:
		await get_tree().physics_frame
	var h1: float = main.daynight.hour
	for _i in 60:
		await get_tree().physics_frame
	var dh_idle: float = main.daynight.hour - h1
	_check("time SPRINTS while the reel rolls (Δ%.3fh vs idle Δ%.3fh)" % [dh_watching, dh_idle],
		dh_watching > dh_idle * 3.0 and dh_watching > 0.0)

	# --- The save REMEMBERS the shelf -------------------------------------------
	var snap: Dictionary = main.save_game()
	main.media_watched.clear()
	main.apply_save(snap)
	_check("watched PERSISTS through save/load", main.media_watched.has("test_pattern"))

	# --- E turns the set off; the room comes back --------------------------------
	await _e()
	_check("E turns the set off", not main.media_panel.is_open)
	_check("the feet come back", not p.input_locked)

	print("TV RESULTS: %d passed, %d failed" % [passed, failed])
	print("TV: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
