## Proof for MEDIA UNLOCKS & COLLECTIBLES (docs/cinema.md Phase 4): a tape lying
## in the world, E takes it, the CORRECT film unlocks on the shelf, the unlock
## SURVIVES save/load, and the shelf count matches. The drive-in lot SEEDS
## pickups straight from manifest rows (drop a found_tape film → a tape appears).
## Run: godot --headless --path game res://proto3d/tests/unlock_media_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("UNLOCK: %s - %s" % ["PASS" if ok else "FAIL", check_name])


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
	print("UNLOCK: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("UNLOCK: WATCHDOG"); print("UNLOCK: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# Fixture catalog: one locked tape whose file is the REAL test reel.
	var fixture: Dictionary = {"media": [
		{"id": "test_pattern", "category": "clips", "title": "DRIVN Test Reel",
			"encoded_path": "res://media/clips/test_pattern/test_pattern.ogv",
			"unlock_type": "always_available", "screen_context": ["safehouse_tv"]},
		{"id": "blood_road", "category": "film", "title": "Blood Road",
			"encoded_path": "res://media/clips/test_pattern/test_pattern.ogv",
			"unlock_type": "found_tape", "screen_context": ["safehouse_tv", "drive_in"]},
	]}
	var f := FileAccess.open("user://test_unlock_manifest.json", FileAccess.WRITE)
	f.store_string(JSON.stringify(fixture))
	f.close()
	main.media_registry = ProtoMediaRegistry.load_manifest("user://test_unlock_manifest.json")

	main._exit_car()
	var p: ProtoPlayer3D = main.player
	p.global_position = Vector3(6, 0.35, 388)
	p.velocity = Vector3.ZERO
	for _i in 4:
		await get_tree().physics_frame

	_check("the film starts LOCKED (off the shelf)",
		main.media_registry.list_unlocked(main.media_unlocked).size() == 1)

	# --- The tape on the ground --------------------------------------------------
	var tape := ProtoMediaPickup.create("blood_road", "tape")
	main.add_child(tape)
	tape.global_position = p.global_position + p.facing() * 1.2
	for _i in 6:
		await get_tree().physics_frame
	_check("the tape is the interactable (its case names the film)",
		main._current_interactable == tape and tape.interact_prompt(main).contains("Blood Road"))
	await _e()
	_check("E takes it — the CORRECT film unlocks", main.media_unlocked.has("blood_road"))
	_check("the shelf count GROWS (2 on the shelf)",
		main.media_registry.list_unlocked(main.media_unlocked).size() == 2)

	# --- Persistence ---------------------------------------------------------------
	var snap: Dictionary = main.save_game()
	main.media_unlocked.clear()
	main.apply_save(snap)
	_check("the unlock SURVIVES save/load", main.media_unlocked.has("blood_road"))

	# --- The drive-in SEEDS pickups from manifest rows ------------------------------
	main.media_unlocked.clear()
	main.drive_in.seed_pickups()
	var seeded := 0
	for c in main.drive_in.get_children():
		if c is ProtoMediaPickup and not (c as ProtoMediaPickup).taken:
			seeded += 1
	_check("the drive-in lot seeded the locked reel as a pickup (%d)" % seeded, seeded >= 1)

	DirAccess.remove_absolute("user://test_unlock_manifest.json")
	print("UNLOCK RESULTS: %d passed, %d failed" % [passed, failed])
	print("UNLOCK: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
