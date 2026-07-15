## Companion shelf proof: all 22 canonical covers plus one non-cartridge DRIVN
## promotion, exact filters, keep-aspect art, and focus restoration.
## Run: Godot --headless --path game res://proto3d/tests/game_companion_shelf_sim.tscn
extends Node

const SHELF_SCRIPT := "res://proto3d/games/companion/companion_shelf.gd"
const THEME_SCRIPT := "res://proto3d/games/companion/companion_theme.gd"

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_COMPANION_SHELF: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_COMPANION_SHELF: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("GAME_COMPANION_SHELF: WATCHDOG")
		get_tree().quit(1))
	_check("companion shelf implementation exists", FileAccess.file_exists(SHELF_SCRIPT)
		and FileAccess.file_exists(THEME_SCRIPT))
	if not FileAccess.file_exists(SHELF_SCRIPT) or not FileAccess.file_exists(THEME_SCRIPT):
		_finish()
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(
		"res://data/game_deck_companion.json"))
	var release_row := parsed as Dictionary
	var registry := ProtoGameRegistry.load_catalog()
	var shelf: Control = (load(SHELF_SCRIPT) as GDScript).new()
	add_child(shelf)
	shelf.call("configure", registry, release_row)
	await get_tree().process_frame

	var all_snapshot: Dictionary = shelf.call("snapshot_ui")
	_check("ALL contains 22 games followed by one DRIVN promo",
		int(all_snapshot.get("game_count", 0)) == 22
		and int(all_snapshot.get("visible_game_count", 0)) == 22
		and bool(all_snapshot.get("promo_visible", false))
		and (all_snapshot.get("ordered_ids", []) as Array).size() == 22
		and String((all_snapshot.get("ordered_ids", []) as Array)[0]) == "waste_heap"
		and String((all_snapshot.get("ordered_ids", []) as Array)[21]) == "black_grid")
	var cards: Dictionary = shelf.get("cards") as Dictionary
	var promo_card: Button = shelf.get("promo_card") as Button
	_check("promo is a distinct non-cartridge card", promo_card != null
		and promo_card.name == "PromoCard_DRIVN" and not cards.has("drivn")
		and registry.get_game("drivn").is_empty())
	_check("every canonical card is enabled and owns keep-aspect art", cards.size() == 22
		and cards.values().all(func(value: Variant) -> bool:
			var card := value as Button
			var art: TextureRect = card.get("cover_texture_rect") as TextureRect
			return card != null and not card.disabled and art != null \
				and art.stretch_mode == TextureRect.STRETCH_KEEP_ASPECT_CENTERED \
				and not card.text.contains("PWR") and not card.text.contains("NET")))

	shelf.call("set_filter", "handheld")
	var handheld: Dictionary = shelf.call("snapshot_ui")
	_check("HANDHELD filter shows exactly ten games and hides promo",
		int(handheld.get("visible_game_count", 0)) == 10
		and not bool(handheld.get("promo_visible", true)))
	shelf.call("set_filter", "console")
	var console: Dictionary = shelf.call("snapshot_ui")
	_check("CONSOLE filter shows exactly twelve games and hides promo",
		int(console.get("visible_game_count", 0)) == 12
		and not bool(console.get("promo_visible", true)))
	shelf.call("set_filter", "all")
	shelf.call("restore_focus", "black_grid")
	await get_tree().process_frame
	await get_tree().process_frame
	var restored: Dictionary = shelf.call("snapshot_ui")
	_check("focus restores to BLACK GRID", String(restored.get("focused_game_id", "")) == "black_grid"
		and (cards["black_grid"] as Button).has_focus())
	var shelf_scroll: ScrollContainer = shelf.get("_scroll") as ScrollContainer
	_check("restored focus scrolls its physical cartridge into view",
		shelf_scroll != null and shelf_scroll.scroll_vertical > 0)

	var selected := [""]
	shelf.connect("game_selected", func(game_id: String) -> void: selected[0] = game_id)
	(cards["waste_heap"] as Button).pressed.emit()
	_check("real cover press emits its exact catalog id", selected[0] == "waste_heap")
	var promo_selected := [false]
	shelf.connect("promo_selected", func() -> void: promo_selected[0] = true)
	promo_card.pressed.emit()
	_check("promo press uses its own non-game signal", promo_selected[0])
	_finish()


func _finish() -> void:
	print("GAME_COMPANION_SHELF RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_COMPANION_SHELF: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
