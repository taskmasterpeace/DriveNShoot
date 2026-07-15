## Export feature routing proof: the companion flag alone selects Game Deck;
## every ordinary/editor path remains DRIVN, and PLAY.bat stays explicit.
## Run: Godot --headless --path game res://proto3d/tests/game_companion_boot_sim.tscn
extends Node

const ROUTER_SCRIPT := "res://proto3d/boot/boot_router.gd"
const ROUTER_SCENE := "res://proto3d/boot/boot_router.tscn"
const DRIVN_SCENE := "res://proto3d/proto3d.tscn"
const COMPANION_SCENE := "res://proto3d/games/companion/game_deck_companion.tscn"

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_COMPANION_BOOT: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_COMPANION_BOOT: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("GAME_COMPANION_BOOT: WATCHDOG")
		get_tree().quit(1))
	_check("boot router script and scene exist", FileAccess.file_exists(ROUTER_SCRIPT)
		and FileAccess.file_exists(ROUTER_SCENE))
	if not FileAccess.file_exists(ROUTER_SCRIPT) or not FileAccess.file_exists(ROUTER_SCENE):
		_finish()
		return
	var router := load(ROUTER_SCRIPT) as GDScript
	var empty: Array[String] = []
	var windows: Array[String] = ["windows"]
	var editor: Array[String] = ["editor", "windows", "x86_64"]
	var companion: Array[String] = ["game_deck_companion"]
	var mixed: Array[String] = ["windows", "x86_64", "game_deck_companion"]
	_check("empty feature set routes to normal DRIVN",
		String(router.route_for_features(empty)) == DRIVN_SCENE)
	_check("ordinary Windows and editor features route to normal DRIVN",
		String(router.route_for_features(windows)) == DRIVN_SCENE
		and String(router.route_for_features(editor)) == DRIVN_SCENE)
	_check("exact companion export feature routes to Game Deck",
		String(router.route_for_features(companion)) == COMPANION_SCENE)
	_check("companion wins inside a mixed export feature set",
		String(router.route_for_features(mixed))
		== COMPANION_SCENE)
	_check("both routed targets are installed PackedScenes",
		ResourceLoader.exists(DRIVN_SCENE) and load(DRIVN_SCENE) is PackedScene
		and ResourceLoader.exists(COMPANION_SCENE) and load(COMPANION_SCENE) is PackedScene)
	var project_text := FileAccess.get_file_as_string("res://project.godot")
	_check("project front door is the pure boot router",
		project_text.contains('run/main_scene="%s"' % ROUTER_SCENE))
	var play_path := ProjectSettings.globalize_path("res://../PLAY.bat")
	var play_text := FileAccess.get_file_as_string(play_path)
	_check("PLAY.bat still launches DRIVN directly and never the companion",
		play_text.contains(DRIVN_SCENE) and not play_text.contains("game_deck_companion"))
	_finish()


func _finish() -> void:
	print("GAME_COMPANION_BOOT RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_COMPANION_BOOT: %s" % (
		"ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
