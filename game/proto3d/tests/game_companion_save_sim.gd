## Companion persistence proof: scores/settings are isolated from DRIVN, all
## games are transiently unlocked, and corrupt companion data self-recovers.
## Run: Godot --headless --path game res://proto3d/tests/game_companion_save_sim.tscn
extends Node

const STORE_SCRIPT := "res://proto3d/games/companion/companion_save.gd"
const SAVE_PATH := "user://test_game_deck_companion_save.json"
const DRIVN_FIXTURE_PATH := "user://test_drivn_save_fixture.json"
const DRIVN_FIXTURE := "{\"world\":\"must remain byte-identical\",\"day\":17}"

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_COMPANION_SAVE: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_COMPANION_SAVE: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("GAME_COMPANION_SAVE: WATCHDOG")
		get_tree().quit(1))
	_cleanup()
	_write_text(DRIVN_FIXTURE_PATH, DRIVN_FIXTURE)
	_check("companion save store exists", FileAccess.file_exists(STORE_SCRIPT))
	if not FileAccess.file_exists(STORE_SCRIPT):
		_cleanup()
		_finish()
		return

	var registry := ProtoGameRegistry.load_catalog()
	var ledger := ProtoScoreLedger.new(registry)
	var result := {"result_id": "companion-save-score", "game_id": "waste_heap",
		"ruleset": "stock-1", "seed": 42, "players": [{"profile_id": "companion"}],
		"primary": 4096, "secondary": {"highest_part": 512}, "outcome": "complete",
		"ranked": true, "source": "companion"}
	_check("test score enters the real ledger", ledger.submit(result))
	var store: RefCounted = (load(STORE_SCRIPT) as GDScript).new()
	store.set("path", SAVE_PATH)
	var ui := {"last_game_id": "black_grid", "filter": "console", "volume": 0.65,
		"fullscreen": true, "reduced_motion": true, "seen_insert": true}
	var save_error: int = int(store.call("save_from", ledger, ui))
	_check("companion save writes atomically", save_error == OK and FileAccess.file_exists(SAVE_PATH)
		and not FileAccess.file_exists(SAVE_PATH + ".tmp"))

	var restored_ledger := ProtoScoreLedger.new(registry)
	var restored_store: RefCounted = (load(STORE_SCRIPT) as GDScript).new()
	restored_store.set("path", SAVE_PATH)
	var restored_ui: Dictionary = restored_store.call("load_into", restored_ledger)
	_check("score ledger round-trips", int(restored_ledger.personal_best(
		"waste_heap", "stock-1").get("primary", 0)) == 4096)
	_check("companion UI state round-trips", String(restored_ui.get("last_game_id", "")) == "black_grid"
		and String(restored_ui.get("filter", "")) == "console"
		and is_equal_approx(float(restored_ui.get("volume", 0.0)), 0.65)
		and bool(restored_ui.get("fullscreen", false))
		and bool(restored_ui.get("reduced_motion", false))
		and bool(restored_ui.get("seen_insert", false)))
	_check("all twenty-two games are transiently unlocked",
		registry.order.all(func(game_id: Variant) -> bool:
			return restored_ledger.is_unlocked(String(game_id))))
	_check("DRIVN save fixture remains byte-identical",
		FileAccess.get_file_as_string(DRIVN_FIXTURE_PATH) == DRIVN_FIXTURE)

	_write_text(SAVE_PATH, "{ definitely not json")
	var corrupt_ledger := ProtoScoreLedger.new(registry)
	var corrupt_store: RefCounted = (load(STORE_SCRIPT) as GDScript).new()
	corrupt_store.set("path", SAVE_PATH)
	var recovered_ui: Dictionary = corrupt_store.call("load_into", corrupt_ledger)
	_check("corrupt save returns safe defaults", String(recovered_ui.get("filter", "")) == "all"
		and String(recovered_ui.get("last_game_id", "")) == "waste_heap")
	_check("corrupt save is quarantined and all games stay playable",
		_find_bad_save() and registry.order.all(func(game_id: Variant) -> bool:
			return corrupt_ledger.is_unlocked(String(game_id))))
	_check("corrupt recovery never touches DRIVN save fixture",
		FileAccess.get_file_as_string(DRIVN_FIXTURE_PATH) == DRIVN_FIXTURE)
	_cleanup()
	_finish()


func _write_text(path: String, text: String) -> void:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file != null:
		file.store_string(text)
		file.close()


func _find_bad_save() -> bool:
	var base := SAVE_PATH.get_file() + ".bad."
	var directory := DirAccess.open(SAVE_PATH.get_base_dir())
	if directory == null:
		return false
	for filename in directory.get_files():
		if filename.begins_with(base):
			return true
	return false


func _cleanup() -> void:
	for path in [SAVE_PATH, SAVE_PATH + ".tmp", DRIVN_FIXTURE_PATH]:
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	var directory := DirAccess.open(SAVE_PATH.get_base_dir())
	if directory != null:
		var base := SAVE_PATH.get_file() + ".bad."
		for filename in directory.get_files():
			if filename.begins_with(base):
				DirAccess.remove_absolute(ProjectSettings.globalize_path(
					SAVE_PATH.get_base_dir().path_join(filename)))


func _finish() -> void:
	print("GAME_COMPANION_SAVE RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_COMPANION_SAVE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
