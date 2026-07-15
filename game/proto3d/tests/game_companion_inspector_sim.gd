## Box-before-boot proof: canonical art/copy/facts/live controls for every device
## shape, gated insertion, and the separate DRIVN full-game promotion.
## Run: Godot --headless --path game res://proto3d/tests/game_companion_inspector_sim.tscn
extends Node

const INSPECTOR_SCRIPT := "res://proto3d/games/companion/companion_inspector.gd"

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_COMPANION_INSPECTOR: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_COMPANION_INSPECTOR: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("GAME_COMPANION_INSPECTOR: WATCHDOG")
		get_tree().quit(1))
	_check("companion inspector implementation exists", FileAccess.file_exists(INSPECTOR_SCRIPT))
	if not FileAccess.file_exists(INSPECTOR_SCRIPT):
		_finish()
		return
	var registry := ProtoGameRegistry.load_catalog()
	var router := ProtoArcadeInputRouter.new()
	var inspector: Control = (load(INSPECTOR_SCRIPT) as GDScript).new()
	add_child(inspector)
	await get_tree().process_frame

	var inserted := [""]
	inspector.connect("insert_requested", func(game_id: String) -> void: inserted[0] = game_id)
	var insert_button: Button = inspector.get("insert_button") as Button
	insert_button.pressed.emit()
	_check("INSERT is unavailable until a real cartridge is inspected", inserted[0] == ""
		and not insert_button.visible)

	var examples := [
		["waste_heap", "1:1", "HANDHELD", "HIGH SCORE WINS", false],
		["bunker_breaker", "9:16", "HANDHELD", "HIGH SCORE WINS", false],
		["last_mile", "16:9", "HANDHELD", "LOW TIME WINS", true],
		["crown_of_ash", "16:9", "CONSOLE", "HIGH SCORE WINS", true],
	]
	var examples_exact := true
	for example in examples:
		var game_id := String(example[0])
		var row: Dictionary = registry.get_game(game_id)
		var controls: Array = router.help_labels(String(row.get("controls_profile", "")))
		inspector.call("show_game", row, controls)
		var shot: Dictionary = inspector.call("snapshot_ui")
		var shown_controls: Array = shot.get("controls", []) as Array
		examples_exact = examples_exact and String(shot.get("mode", "")) == "game" \
			and String(shot.get("game_id", "")) == game_id \
			and String(shot.get("title", "")) == String(row.get("title", "")) \
			and String(shot.get("cover_path", "")) == String(row.get("cover_path", "")) \
			and String(shot.get("help", "")) == String(row.get("help", "")) \
			and String(shot.get("lore", "")) == String(row.get("about_world", "")) \
			and String(shot.get("aspect", "")) == String(example[1]) \
			and String(shot.get("platform", "")) == String(example[2]) \
			and String(shot.get("score_rule", "")) == String(example[3]) \
			and bool(shot.get("single_player", false)) \
			and bool(shot.get("ai_opponents", false)) == bool(example[4]) \
			and shown_controls == controls and not shown_controls.is_empty() \
			and shown_controls.all(func(value: Variant) -> bool:
				var control := value as Dictionary
				return String(control.get("label", "")) != "" \
					and String(control.get("keyboard", "")) != "" \
					and String(control.get("pad", "")) != "")
	_check("four device exemplars expose exact art, copy, facts, score law, badges, and live controls",
		examples_exact)
	var cover: TextureRect = inspector.get("cover_texture_rect") as TextureRect
	_check("1:1, 9:16, and 16:9 cartridges all preserve cover proportions",
		cover != null and cover.stretch_mode == TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		and cover.texture != null)

	var crown := registry.get_game("crown_of_ash")
	inspector.call("show_game", crown,
		router.help_labels(String(crown.get("controls_profile", ""))))
	insert_button.pressed.emit()
	_check("INSERT emits only the currently inspected canonical id", inserted[0] == "crown_of_ash")

	var release := JSON.parse_string(FileAccess.get_file_as_string(
		"res://data/game_deck_companion.json")) as Dictionary
	inspector.call("show_promo", release)
	var promo: Dictionary = inspector.call("snapshot_ui")
	var promo_row: Dictionary = release.get("promo", {}) as Dictionary
	_check("DRIVN promo exposes exact configured headline, strap, body, features, and status",
		String(promo.get("mode", "")) == "promo" and String(promo.get("game_id", "")) == ""
		and String(promo.get("title", "")) == String(promo_row.get("headline", ""))
		and String(promo.get("strap", "")) == String(promo_row.get("strap", ""))
		and String(promo.get("body", "")) == String(promo_row.get("body", ""))
		and (promo.get("features", []) as Array) == (promo_row.get("features", []) as Array)
		and String(promo.get("status", "")) == String(promo_row.get("status", "")))
	_check("promo is 2:3 keep-aspect art with no cartridge action or registry identity",
		cover.stretch_mode == TextureRect.STRETCH_KEEP_ASPECT_CENTERED and cover.texture != null
		and cover.texture.get_width() * 3 == cover.texture.get_height() * 2
		and not insert_button.visible and not bool(promo.get("insert_visible", true)))
	var follow_button: Button = inspector.get("follow_button") as Button
	_check("missing full-game URL hides Follow entirely", not follow_button.visible)
	var followed := [""]
	inspector.connect("follow_requested", func(url: String) -> void: followed[0] = url)
	var linked := release.duplicate(true)
	linked["full_game_url"] = "https://drivn.example/game"
	inspector.call("show_promo", linked)
	follow_button.pressed.emit()
	_check("configured HTTPS Follow emits only its exact URL", follow_button.visible
		and followed[0] == "https://drivn.example/game")
	var unsafe := release.duplicate(true)
	unsafe["full_game_url"] = "javascript:alert(1)"
	inspector.call("show_promo", unsafe)
	_check("non-HTTPS promotion links are never exposed", not follow_button.visible)
	_finish()


func _finish() -> void:
	print("GAME_COMPANION_INSPECTOR RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_COMPANION_INSPECTOR: %s" % (
		"ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
