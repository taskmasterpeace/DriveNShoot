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

	var card_path := "res://proto3d/games/game_cover_card.gd"
	_check("the reusable cartridge cover card exists", FileAccess.file_exists(card_path))
	if FileAccess.file_exists(card_path):
		var card_script: GDScript = load(card_path) as GDScript
		_check("the cover card script loads", card_script != null)
		if card_script != null:
			var waste_row: Dictionary = registry.get_game("waste_heap")
			var owned_card: Button = card_script.create(waste_row, true, true)
			add_child(owned_card)
			var owned_art: TextureRect = owned_card.get("cover_texture_rect") as TextureRect
			_check("an owned card preserves searchable title and machine facts",
				owned_card.text.contains("WASTE HEAP") and owned_card.text.contains("1:1")
				and owned_card.text.contains("PWR 1") and owned_card.text.contains("NET 0"))
			_check("cover art is loaded with aspect-preserving presentation",
				bool(owned_card.get("art_loaded")) and owned_art != null
				and owned_art.texture != null
				and owned_art.stretch_mode == TextureRect.STRETCH_KEEP_ASPECT_CENTERED)
			_check("cover cards expose explicit controller focus styling",
				owned_card.focus_mode == Control.FOCUS_ALL
				and owned_card.has_theme_stylebox_override("hover")
				and owned_card.has_theme_stylebox_override("focus"))

			var missing_row := waste_row.duplicate(true)
			missing_row["cover_path"] = "res://assets/game_covers/does_not_exist.webp"
			var fallback_card: Button = card_script.create(missing_row, true, true)
			add_child(fallback_card)
			var fallback_art: TextureRect = fallback_card.get("cover_texture_rect") as TextureRect
			_check("a missing cover produces a deterministic visible fallback",
				not bool(fallback_card.get("art_loaded")) and fallback_art != null
				and fallback_art.texture != null)

			var locked_card: Button = card_script.create(waste_row, true, false)
			add_child(locked_card)
			var locked_art: TextureRect = locked_card.get("cover_texture_rect") as TextureRect
			var state_label: Label = locked_card.get("state_label") as Label
			_check("locked media keeps its art visible but cannot launch",
				locked_card.disabled and locked_art != null and locked_art.texture != null
				and state_label != null and state_label.text.contains("LOCKED"))

			var deck_script: GDScript = load("res://proto3d/games/game_deck.gd") as GDScript
			var shell_script: GDScript = load("res://proto3d/games/game_shell.gd") as GDScript
			var deck: Node = deck_script.create(self)
			add_child(deck)
			deck.set_process(false)
			deck.ledger.unlock("waste_heap")
			var shell: CanvasLayer = shell_script.create(deck)
			add_child(shell)
			shell.open_library("handheld", {"device": "handheld", "auto_start": false})
			await get_tree().process_frame
			var library_box: GridContainer = shell.get("_library_box") as GridContainer
			var shelf_ok := library_box != null and library_box.get_child_count() == 10
			if shelf_ok:
				for child in library_box.get_children():
					shelf_ok = shelf_ok and child is Button and child.get_script() == card_script
					var child_art: TextureRect = child.get("cover_texture_rect") as TextureRect
					shelf_ok = (shelf_ok and child_art != null and child_art.texture != null
						and child_art.stretch_mode == TextureRect.STRETCH_KEEP_ASPECT_CENTERED)
			_check("the real handheld shelf renders ten cover cards in catalog order", shelf_ok)
			var waste_button: Button = null
			if library_box != null:
				for child in library_box.get_children():
					if child is Button and String((child as Button).text).contains("WASTE HEAP"):
						waste_button = child as Button
						break
			if waste_button != null:
				waste_button.pressed.emit()
				await get_tree().process_frame
			_check("an owned handheld cover routes through the existing launch path",
				waste_button != null and shell.current_view == "play"
				and String(deck.current_row.get("id", "")) == "waste_heap")
			shell.power_off()
	_finish()


func _finish() -> void:
	print("GAME_COVER RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_COVER: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
