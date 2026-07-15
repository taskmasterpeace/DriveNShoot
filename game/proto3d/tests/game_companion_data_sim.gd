## DRIVN: GAME DECK companion release-data contract.
## Run: Godot --headless --path game res://proto3d/tests/game_companion_data_sim.tscn
extends Node

const DATA_PATH := "res://data/game_deck_companion.json"

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_COMPANION_DATA: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_COMPANION_DATA: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("GAME_COMPANION_DATA: WATCHDOG")
		get_tree().quit(1))
	_check("release row exists", FileAccess.file_exists(DATA_PATH))
	if not FileAccess.file_exists(DATA_PATH):
		_finish()
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	_check("release row is valid JSON", parsed is Dictionary)
	if not (parsed is Dictionary):
		_finish()
		return
	var row := parsed as Dictionary
	_check("product identity is exact", String(row.get("product_title", "")) == "DRIVN: GAME DECK"
		and String(row.get("subtitle", "")) == "A DRIVN COMPANION")
	_check("release schema and version are present", int(row.get("schema", 0)) == 1
		and String(row.get("version", "")) != "")
	var promo: Dictionary = row.get("promo", {}) as Dictionary
	_check("promotion has finished copy", String(promo.get("headline", "")) == "DRIVN // THE FULL WASTELAND"
		and String(promo.get("strap", "")) == "GAME DECK LIVES INSIDE THIS WORLD"
		and String(promo.get("body", "")) != "" and String(promo.get("status", "")) != ""
		and (promo.get("features", []) as Array).size() == 5)
	_check("promotion declares its final art path", String(promo.get("art_path", ""))
		== "res://assets/game_deck/companion_drivn_promo.webp")
	_check("optional full-game URL remains a string", row.get("full_game_url", null) is String)

	var registry := ProtoGameRegistry.load_catalog()
	var handheld := 0
	var console := 0
	for game_id_value in registry.order:
		var game_row: Dictionary = registry.get_game(String(game_id_value))
		if String(game_row.get("platform", "")) == "handheld":
			handheld += 1
		elif String(game_row.get("platform", "")) == "console":
			console += 1
	_check("canonical companion catalog is exactly ten handheld and twelve console",
		registry.order.size() == 22 and handheld == 10 and console == 12)
	_finish()


func _finish() -> void:
	print("GAME_COMPANION_DATA RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_COMPANION_DATA: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
