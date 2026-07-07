## Proof for THE DRIVE-IN (docs/cinema.md Phase 3 acceptance): walk to the
## projector, E starts the show, TRAILERS roll before the FEATURE (the schedule
## is manifest rows, not code), the reels are REAL streams, and leaving the lot
## STOPS the playback. Real key events; fixture rows point at the real test reel.
## Run: godot --headless --path game res://proto3d/tests/drive_in_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DRIVEIN: %s - %s" % ["PASS" if ok else "FAIL", check_name])


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
	print("DRIVEIN: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("DRIVEIN: WATCHDOG"); print("DRIVEIN: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# Tonight's program (fixture rows over the REAL test reel): one trailer, one film.
	var ogv := "res://media/clips/test_pattern/test_pattern.ogv"
	var fixture: Dictionary = {"media": [
		{"id": "coming_soon", "category": "trailers", "title": "Coming Soon",
			"encoded_path": ogv, "unlock_type": "always_available", "screen_context": ["drive_in"]},
		{"id": "blood_road", "category": "film", "title": "Blood Road",
			"encoded_path": ogv, "unlock_type": "always_available", "screen_context": ["drive_in", "safehouse_tv"]},
	]}
	var f := FileAccess.open("user://test_drivein_manifest.json", FileAccess.WRITE)
	f.store_string(JSON.stringify(fixture))
	f.close()
	main.media_registry = ProtoMediaRegistry.load_manifest("user://test_drivein_manifest.json")

	main._exit_car()
	var p: ProtoPlayer3D = main.player
	var di: ProtoDriveIn = main.drive_in
	p.global_position = di.global_position + Vector3(0, 0.35, 19.2) # at the projector post
	p.velocity = Vector3.ZERO
	for _i in 6:
		await get_tree().physics_frame
	_check("the projector is the interactable", main._current_interactable == di)

	# --- E rolls the show: trailers BEFORE the feature ---------------------------
	await _e()
	_check("the show is ON", di.showing)
	_check("the TRAILER rolls first (%s)" % di.now_showing, di.now_showing == "coming_soon" and di.phase == "trailers")
	_check("the FEATURE waits its turn (queued: %s)" % str(di.reel_queue), di.reel_queue == ["blood_road"])
	_check("the reel is a REAL stream", di._video.stream != null and di._video.is_playing())

	# --- The reel ends; the feature takes the screen ------------------------------
	di._video.stop()
	di._on_finished() # the wired handler — exactly what the finished signal calls
	for _i in 4:
		await get_tree().physics_frame
	_check("the FEATURE takes the screen (%s)" % di.now_showing, di.now_showing == "blood_road" and di.phase == "feature")
	_check("sitting through the feature marks it WATCHED", main.media_watched.has("blood_road"))

	# --- Leaving the lot stops the show -------------------------------------------
	p.global_position = di.global_position + Vector3(0, 0.35, 120.0) # gone
	for _i in 8:
		await get_tree().physics_frame
	_check("driving off STOPS the playback", not di.showing and not di._video.is_playing())

	# --- E again restarts; E again shuts it down (the toggle) ----------------------
	p.global_position = di.global_position + Vector3(0, 0.35, 19.2)
	p.velocity = Vector3.ZERO
	for _i in 6:
		await get_tree().physics_frame
	await _e()
	_check("the projector starts again for a returning car", di.showing)
	await _e()
	_check("E shuts it down by hand", not di.showing)

	DirAccess.remove_absolute("user://test_drivein_manifest.json")
	print("DRIVEIN RESULTS: %d passed, %d failed" % [passed, failed])
	print("DRIVEIN: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
