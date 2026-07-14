## GAME DECK cover contract: every catalog row owns one loadable, correctly
## sized package front before the shell is allowed to present a cover library.
## Run: Godot --headless --path game res://proto3d/tests/game_cover_sim.tscn
extends Node

const CONSOLE_SIZE := Vector2i(1024, 1536)
const HANDHELD_SIZES := {
	"1:1": Vector2i(1024, 1024),
	"9:16": Vector2i(864, 1536),
	"16:9": Vector2i(1536, 864),
}

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_COVER: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_COVER: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("GAME_COVER: WATCHDOG")
		get_tree().quit(1))

	var registry_script: GDScript = load("res://proto3d/games/game_registry.gd") as GDScript
	_check("the registry implementation exists", registry_script != null)
	if registry_script == null:
		_finish()
		return

	var registry: RefCounted = registry_script.load_catalog()
	var rows: Array = registry.order.map(func(id_value: Variant) -> Dictionary:
		return registry.get_game(String(id_value)))
	var paths: Dictionary = {}
	var all_declared := true
	var all_loaded := true
	var console_dimensions_ok := true
	var handheld_dimensions_ok := true
	var loaded_console := 0
	var loaded_handheld := 0

	for row_value in rows:
		var row: Dictionary = row_value
		var id := String(row.get("id", ""))
		var path := String(row.get("cover_path", ""))
		if path == "" or paths.has(path):
			all_declared = false
			continue
		paths[path] = id
		if not FileAccess.file_exists(path):
			all_loaded = false
			continue
		var image := Image.new()
		if image.load(ProjectSettings.globalize_path(path)) != OK:
			all_loaded = false
			continue
		var actual := image.get_size()
		if String(row.get("platform", "")) == "console":
			loaded_console += 1
			console_dimensions_ok = console_dimensions_ok and actual == CONSOLE_SIZE
		else:
			loaded_handheld += 1
			var expected: Vector2i = HANDHELD_SIZES.get(String(row.get("aspect", "")), Vector2i.ZERO)
			handheld_dimensions_ok = handheld_dimensions_ok and actual == expected

	_check("the complete catalog still contains twenty-two rows", rows.size() == 22)
	_check("all twenty-two rows declare unique cover paths",
		all_declared and paths.size() == 22)
	_check("all declared cover files load", all_loaded and paths.size() == 22)
	_check("all twelve console covers are 2:3 box fronts",
		console_dimensions_ok and loaded_console == 12)
	_check("all ten handheld labels match their declared display aspect",
		handheld_dimensions_ok and loaded_handheld == 10)
	_finish()


func _finish() -> void:
	print("GAME_COVER RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_COVER: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
