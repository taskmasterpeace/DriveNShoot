## Windows release contract proof: exact feature-tagged embedded preset, complete
## resource inclusion, branded metadata/icon, and one-click test/export/smoke.
## Run: Godot --headless --path game res://proto3d/tests/game_companion_export_sim.tscn
extends Node

const PRESETS := "res://export_presets.cfg"
const BUILD_SCRIPT := "res://../BUILD_GAME_DECK.bat"
const OUTPUT := "../build/DRIVN-Game-Deck.exe"
const ICON := "res://assets/game_deck/game_deck.ico"

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_COMPANION_EXPORT: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_COMPANION_EXPORT: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("GAME_COMPANION_EXPORT: WATCHDOG")
		get_tree().quit(1))
	var config := ConfigFile.new()
	var loaded := config.load(PRESETS) == OK
	_check("export presets parse", loaded)
	if not loaded:
		_finish()
		return
	var section := ""
	for candidate in config.get_sections():
		if String(config.get_value(candidate, "name", "")) == "Windows Game Deck Companion":
			section = String(candidate)
			break
	_check("dedicated Windows Game Deck Companion preset exists", section != "")
	if section == "":
		_finish()
		return
	var options := section + ".options"
	_check("preset carries only the exact companion feature and output name",
		String(config.get_value(section, "custom_features", "")) == "game_deck_companion"
		and String(config.get_value(section, "export_path", "")) == OUTPUT)
	_check("release is embedded x86-64 with no console wrapper",
		bool(config.get_value(options, "binary_format/embed_pck", false))
		and String(config.get_value(options, "binary_format/architecture", "")) == "x86_64"
		and int(config.get_value(options, "debug/export_console_wrapper", -1)) == 0)
	_check("Windows metadata identifies the DRIVN companion product",
		String(config.get_value(options, "application/product_name", "")) == "DRIVN: GAME DECK"
		and String(config.get_value(options, "application/company_name", "")) == "Machine Kings Media"
		and String(config.get_value(options, "application/file_description", "")).contains(
			"single-player companion")
		and String(config.get_value(options, "application/file_version", "")) == "0.14.0.0"
		and String(config.get_value(options, "application/product_version", "")) == "0.14.0.0")
	_check("companion owns a separate installed product icon",
		String(config.get_value(options, "application/icon", "")) == ICON
		and FileAccess.file_exists(ICON))
	var includes := String(config.get_value(section, "include_filter", ""))
	_check("preset starts complete and explicitly includes dynamic and legal assets",
		String(config.get_value(section, "export_filter", "")) == "all_resources"
		and ["*.json", "*.md", "*.txt", "*.ttf", "*.webp", "*.tscn", "*.gd"].all(
			func(pattern: String) -> bool: return includes.contains(pattern)))
	var registry := ProtoGameRegistry.load_catalog()
	var all_dynamic_assets := FileAccess.file_exists(
		"res://assets/fonts/game_deck/RussoOne-Regular.ttf")
	for id_value in registry.order:
		var row: Dictionary = registry.get_game(String(id_value))
		all_dynamic_assets = all_dynamic_assets \
			and ResourceLoader.exists(String(row.get("cartridge_scene", ""))) \
			and ResourceLoader.exists(String(row.get("cover_path", "")))
		for source_id in row.get("source_ids", []):
			var source: Dictionary = registry.get_source(String(source_id))
			all_dynamic_assets = all_dynamic_assets \
				and FileAccess.file_exists(String(source.get("notice_path", "")))
			var license_path := String(source.get("license_path", ""))
			all_dynamic_assets = all_dynamic_assets \
				and (license_path == "" or FileAccess.file_exists(license_path))
	_check("all 22 dynamic scenes, covers, font, notices, and licenses exist for export",
		all_dynamic_assets)

	_check("one-click companion build script exists", FileAccess.file_exists(BUILD_SCRIPT))
	if FileAccess.file_exists(BUILD_SCRIPT):
		var build := FileAccess.get_file_as_string(BUILD_SCRIPT)
		var required_sims := ["game_companion_data_sim", "game_companion_save_sim",
			"game_companion_shelf_sim", "game_companion_inspector_sim",
			"game_companion_transition_sim", "game_companion_flow_sim",
			"game_companion_boot_sim", "game_companion_export_sim",
			"game_catalog_sim", "game_cover_sim", "game_input_sim", "game_license_sim"]
		_check("builder runs all eight companion gates plus shared release regressions",
			required_sims.all(func(sim: String) -> bool: return build.contains(sim)))
		_check("builder exports only the companion artifact and verifies size/hash/smoke",
			build.contains('Windows Game Deck Companion')
			and build.contains('DRIVN-Game-Deck.exe')
			and build.contains('20971520')
			and build.contains('--companion-smoke')
			and build.contains('Get-FileHash')
			and not build.contains('del "%~dp0build\\DRIVN.exe"'))
	_finish()


func _finish() -> void:
	print("GAME_COMPANION_EXPORT RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_COMPANION_EXPORT: %s" % (
		"ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
