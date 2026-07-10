## GAME DECK ledger proof: results write once, obey each row's high/low rule,
## never compare across rulesets, preserve seeded challenges, label fictional
## house records, cap history, and survive the one-file save shape.
## Run: Godot --headless --path game res://proto3d/tests/game_ledger_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_LEDGER: %s - %s" % ["PASS" if ok else "FAIL", label])


func _result(id: String, game_id: String, ruleset: String, primary: int, seed_value: int = 17) -> Dictionary:
	return {
		"result_id": id, "game_id": game_id, "ruleset": ruleset, "seed": seed_value,
		"players": [{"profile_id": "local", "name": "RIDER"}],
		"primary": primary, "secondary": {}, "outcome": "complete", "ranked": true,
		"source": "solo", "tick": 30,
	}


func _ready() -> void:
	print("GAME_LEDGER: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("GAME_LEDGER: WATCHDOG")
		get_tree().quit(1))
	var ledger_script: GDScript = load("res://proto3d/games/score_ledger.gd") as GDScript
	_check("the score ledger exists", ledger_script != null)
	if ledger_script == null:
		_finish()
		return

	var reg := ProtoGameRegistry.load_catalog()
	var ledger: RefCounted = ledger_script.new(reg)
	_check("first result is accepted", ledger.submit(_result("w-100", "waste_heap", "stock-1", 100)))
	_check("duplicate result id is rejected", not ledger.submit(_result("w-100", "waste_heap", "stock-1", 999)))
	_check("lower high-score run remains valid history", ledger.submit(_result("w-080", "waste_heap", "stock-1", 80)))
	_check("higher high-score run becomes best", ledger.submit(_result("w-120", "waste_heap", "stock-1", 120)))
	_check("duplicate did not grow history", ledger.recent_results.size() == 3)
	_check("high-direction best is 120", int(ledger.personal_best("waste_heap", "stock-1").get("primary", 0)) == 120)

	ledger.submit(_result("d-100", "dead_ground", "stock-1", 100))
	ledger.submit(_result("d-080", "dead_ground", "stock-1", 80))
	ledger.submit(_result("d-120", "dead_ground", "stock-1", 120))
	_check("low-direction best is 80", int(ledger.personal_best("dead_ground", "stock-1").get("primary", 0)) == 80)

	var version_two := _result("w-v2", "waste_heap", "stock-2", 999)
	_check("new submissions cannot invent a ruleset", not ledger.submit(version_two))
	var historical_save: Dictionary = ledger.serialize()
	(historical_save["personal_bests"] as Dictionary)["waste_heap|stock-2"] = version_two
	(historical_save["recent_results"] as Array).append(version_two)
	var historical_ledger: RefCounted = ledger_script.new(reg)
	historical_ledger.restore(historical_save)
	_check("loaded historical rulesets remain visible but isolated",
		int(historical_ledger.personal_best("waste_heap", "stock-1").get("primary", 0)) == 120
		and int(historical_ledger.personal_best("waste_heap", "stock-2").get("primary", 0)) == 999)

	var challenge: Dictionary = ledger.create_challenge(_result("challenge-source", "waste_heap", "stock-1", 120, 4242), 7)
	_check("challenge preserves game, ruleset, seed, target", challenge.get("game_id") == "waste_heap"
		and challenge.get("ruleset") == "stock-1" and int(challenge.get("seed", 0)) == 4242
		and int(challenge.get("target_peer", 0)) == 7)

	var house: Array = ledger.board("waste_heap", "stock-1", "house")
	_check("house rows are explicitly fictional", not house.is_empty() and house.all(func(row: Dictionary) -> bool:
		return bool(row.get("fictional", false)) and row.get("scope") == "house"))

	for i in 55:
		ledger.submit(_result("cap-%02d" % i, "waste_heap", "stock-1", 200 + i))
	var waste_history: Array = ledger.recent_results.filter(func(row: Dictionary) -> bool:
		return row.get("game_id") == "waste_heap")
	_check("recent history caps at fifty per game", waste_history.size() == 50)

	var saved: Dictionary = ledger.serialize()
	var restored: RefCounted = ledger_script.new(reg)
	restored.restore(saved)
	_check("save round-trip preserves best", int(restored.personal_best("waste_heap", "stock-1").get("primary", 0)) == 254)
	_check("save round-trip preserves challenge seed", int(restored.challenges[0].get("seed", 0)) == 4242)
	_check("save round-trip preserves capped history", restored.recent_results.size() == ledger.recent_results.size())
	_check("malformed and unknown results are rejected", not restored.submit({})
		and not restored.submit(_result("ghost", "not_a_game", "stock-1", 5)))
	_finish()


func _finish() -> void:
	print("GAME_LEDGER RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_LEDGER: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
