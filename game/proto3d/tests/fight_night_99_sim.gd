## FIGHT NIGHT '99 proof: original archetypes, walk/crouch, high/low guards,
## throws, recovery, special meter, best-of rounds, AI, local, snapshot, result.
extends Node

var passed := 0
var failed := 0
var results := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("FIGHT_NIGHT_99: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int = 121, seat_count: int = 1) -> Control:
	var game := (load("res://proto3d/games/fight_night_99/fight_night_99.tscn") as PackedScene).instantiate() as Control
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("fight_night_99"), {"source": "test"})
	var seats: Array = []
	var choices := ["road_warden", "pit_medic"]
	for index in seat_count:
		seats.append({"seat": index, "device": -1 if index == 0 else index,
			"profile_id": "fighter-%d" % index, "archetype": choices[index]})
	game.start_match(seed_value, seats)
	return game


func _snap(seat: int, move: Vector2, held: Dictionary = {}, pressed: Dictionary = {}) -> Dictionary:
	return {"seat": seat, "device": -1, "move": move, "aim": Vector2.ZERO,
		"held": held, "pressed": pressed, "released": {}}


func _ready() -> void:
	print("FIGHT_NIGHT_99: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/fight_night_99/fight_night_99.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var a := _new_game(1211, 2)
	var b := _new_game(1211, 2)
	_check("same seed and choices create the same road legends", a.fighters == b.fighters)
	_check("three original archetypes are selectable",
		a.ARCHETYPES.has("road_warden") and a.ARCHETYPES.has("pit_medic")
		and a.ARCHETYPES.has("toll_breaker"))
	var solo := _new_game(1212)
	_check("solo play fills a deterministic AI rival", bool((solo.fighters[1] as Dictionary)["ai"]))

	var x_before := float((a.fighters[0] as Dictionary)["x"])
	a.apply_inputs(1, [_snap(0, Vector2.RIGHT), _snap(1, Vector2.ZERO)])
	_check("semantic movement walks the active legend", float((a.fighters[0] as Dictionary)["x"]) > x_before)
	a.apply_inputs(2, [_snap(0, Vector2.DOWN), _snap(1, Vector2.ZERO)])
	_check("down stance crouches the fighter", bool((a.fighters[0] as Dictionary)["crouched"]))

	a.place_for_test(0, 585.0)
	a.place_for_test(1, 650.0)
	(a.fighters[1] as Dictionary)["guard"] = "high"
	var hp_before := int((a.fighters[1] as Dictionary)["hp"])
	_check("standing guard blocks a high strike", a.attempt_attack(0, "high")
		and int((a.fighters[1] as Dictionary)["hp"]) == hp_before)
	(a.fighters[0] as Dictionary)["recovery"] = 0
	_check("a low strike opens a standing guard", a.attempt_attack(0, "low")
		and int((a.fighters[1] as Dictionary)["hp"]) < hp_before)
	(a.fighters[0] as Dictionary)["recovery"] = 0
	(a.fighters[1] as Dictionary)["guard"] = "low"
	hp_before = int((a.fighters[1] as Dictionary)["hp"])
	a.attempt_attack(0, "low")
	_check("crouching guard blocks a low strike", int((a.fighters[1] as Dictionary)["hp"]) == hp_before)
	(a.fighters[0] as Dictionary)["recovery"] = 0
	(a.fighters[1] as Dictionary)["guard"] = "high"
	a.attempt_attack(0, "throw")
	_check("throw punishes passive blocking", int((a.fighters[1] as Dictionary)["hp"]) < hp_before)
	_check("attack recovery prevents immediate mashing", not a.attempt_attack(0, "high"))

	(a.fighters[0] as Dictionary)["recovery"] = 0
	(a.fighters[0] as Dictionary)["meter"] = a.SPECIAL_COST
	(a.fighters[1] as Dictionary)["guard"] = "high"
	hp_before = int((a.fighters[1] as Dictionary)["hp"])
	_check("earned meter buys an unblockable special", a.attempt_attack(0, "special")
		and float((a.fighters[0] as Dictionary)["meter"]) == 0.0
		and int((a.fighters[1] as Dictionary)["hp"]) < hp_before)

	var ai_before := float((solo.fighters[1] as Dictionary)["x"])
	for tick in 30:
		solo.apply_inputs(tick + 1, [_snap(0, Vector2.ZERO)])
	_check("AI closes distance or attacks without player input",
		float((solo.fighters[1] as Dictionary)["x"]) != ai_before
		or int((solo.fighters[0] as Dictionary)["hp"]) < int((solo.fighters[0] as Dictionary)["max_hp"]))

	var local_game := _new_game(1213, 2)
	var local_a := float((local_game.fighters[0] as Dictionary)["x"])
	var local_b := float((local_game.fighters[1] as Dictionary)["x"])
	local_game.apply_inputs(1, [_snap(0, Vector2.RIGHT), _snap(1, Vector2.LEFT)])
	_check("two local seats move distinct legends",
		float((local_game.fighters[0] as Dictionary)["x"]) > local_a
		and float((local_game.fighters[1] as Dictionary)["x"]) < local_b)
	var saved: Dictionary = local_game.snapshot()
	local_game.apply_inputs(2, [_snap(0, Vector2.ZERO, {}, {"primary": true}),
		_snap(1, Vector2.DOWN, {"stance": true}, {"secondary": true})])
	local_game.restore_snapshot(saved)
	_check("snapshot restores fighters, rounds, states, meter, RNG, and tick",
		local_game.snapshot() == saved)

	var win_game := _new_game(1214, 2)
	win_game.match_finished.connect(func(_result: Dictionary) -> void: results += 1)
	(win_game.fighters[1] as Dictionary)["hp"] = 1
	win_game.apply_damage(1, 10, 0)
	_check("first knockout resets a best-of-three round",
		int((win_game.fighters[0] as Dictionary)["rounds"]) == 1 and not win_game.finished)
	(win_game.fighters[1] as Dictionary)["hp"] = 1
	win_game.apply_damage(1, 10, 0)
	_check("two rounds emit one wins/HP result", win_game.finished and results == 1
		and int(win_game.last_result.get("primary", 0)) == 1
		and (win_game.last_result.get("secondary", {}) as Dictionary).has("hp_remaining"))
	_check("completed fight is idempotent", not win_game.debug_force_finish() and results == 1)
	var forced := _new_game(1215, 2)
	_check("catalog completion hook emits a valid FIGHT NIGHT result", forced.debug_force_finish()
		and String(forced.last_result.get("game_id", "")) == "fight_night_99")
	_check("rules never change DRIVN time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("FIGHT_NIGHT_99 RESULTS: %d passed, %d failed" % [passed, failed])
	print("FIGHT_NIGHT_99: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
