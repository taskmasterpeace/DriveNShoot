## GAME DECK save proof: records/unlocks/settings join the existing one-file save,
## round-trip without clobbering other keys, and old saves receive clean starters.
## Run: Godot --headless --path game res://proto3d/tests/game_save_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_SAVE: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_SAVE: start")
	get_tree().create_timer(75.0).timeout.connect(func() -> void:
		print("GAME_SAVE: WATCHDOG")
		get_tree().quit(1))
	var main: Node3D = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	var deck: Node = main.get("game_deck") as Node
	_check("main owns the save-backed Game Deck", deck != null)
	if deck == null:
		_finish()
		return
	var result := {"result_id": "save-score-1", "game_id": "waste_heap", "ruleset": "stock-1",
		"seed": 55, "players": [{"profile_id": "local"}], "primary": 2048,
		"secondary": {"highest_part": 256}, "outcome": "complete", "ranked": true, "source": "solo"}
	deck.ledger.submit(result)
	deck.ledger.unlocked.append("radworm")
	deck.ledger.settings["waste_heap"] = {"music": false}
	main.daynight.day = 4
	var save: Dictionary = main.save_game()
	_check("one-file save contains a Game Deck block", save.has("game_deck"))
	deck.restore({})
	main.apply_save(save)
	_check("personal best round-trips", int(deck.ledger.personal_best("waste_heap", "stock-1").get("primary", 0)) == 2048)
	_check("unlock and per-game setting round-trip", deck.ledger.unlocked.has("radworm")
		and deck.ledger.settings.get("waste_heap", {}).get("music") == false)
	_check("unrelated save keys survive", main.daynight.day == 4 and save.has("player") and save.has("world"))

	var old_save := save.duplicate(true)
	old_save.erase("game_deck")
	main.apply_save(old_save)
	_check("old save defaults to starter unlocks", deck.ledger.unlocked.has("waste_heap")
		and deck.ledger.unlocked.has("crown_of_ash") and not deck.ledger.unlocked.has("radworm"))
	_check("old save invents no score history", deck.ledger.personal_bests.is_empty()
		and deck.ledger.recent_results.is_empty())
	_finish()


func _finish() -> void:
	print("GAME_SAVE RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_SAVE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
