## ASHLAND COMMAND proof: terrain cost/defense, AP, move/attack legality,
## supply/repair, damaged occupancy, turns, AI, hot seat, event replay, result.
extends Node

var passed := 0
var failed := 0
var results := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("ASHLAND_COMMAND: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int = 131, seat_count: int = 1) -> Control:
	var game := (load("res://proto3d/games/ashland_command/ashland_command.tscn") as PackedScene).instantiate() as Control
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("ashland_command"), {"source": "test"})
	var seats: Array = []
	for index in seat_count:
		seats.append({"seat": index, "device": -1 if index == 0 else index,
			"profile_id": "commander-%d" % index, "team": index})
	game.start_match(seed_value, seats)
	return game


func _snap(seat: int, pressed: Dictionary) -> Dictionary:
	return {"seat": seat, "device": -1, "move": Vector2.ZERO, "aim": Vector2.ZERO,
		"held": pressed.duplicate(), "pressed": pressed.duplicate(), "released": {}}


func _ready() -> void:
	print("ASHLAND_COMMAND: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/ashland_command/ashland_command.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var a := _new_game(1311)
	var b := _new_game(1311)
	_check("same seed creates the same border terrain and armies",
		a.terrain == b.terrain and a.units == b.units)
	_check("solo play assigns the opposing command to AI", a.team_ai == [false, true])
	a.terrain = a.blank_tactics_grid()
	(a.units[1] as Dictionary)["cell"] = Vector2i(2, 2)
	a.terrain[2][3] = a.RUBBLE
	_check("rubble charges its declared movement cost", a.movement_cost(1, Vector2i(3, 2)) == 2)
	var ap_before := int((a.units[1] as Dictionary)["ap"])
	_check("legal movement spends AP and occupies the destination", a.move_unit(1, Vector2i(3, 2))
		and (a.units[1] as Dictionary)["cell"] == Vector2i(3, 2)
		and int((a.units[1] as Dictionary)["ap"]) == ap_before - 1)
	(a.units[2] as Dictionary)["cell"] = Vector2i(4, 2)
	(a.units[2] as Dictionary)["hp"] = 1
	_check("a damaged unit still blocks its occupied cell", not a.move_unit(1, Vector2i(4, 2)))

	(a.units[4] as Dictionary)["cell"] = Vector2i(5, 2)
	a.terrain[2][5] = a.PLAINS
	var plain_damage: int = a.preview_damage(1, 4)
	a.terrain[2][5] = a.RIDGE
	var ridge_damage: int = a.preview_damage(1, 4)
	_check("ridge defense reduces deterministic incoming damage", ridge_damage < plain_damage)
	(a.units[1] as Dictionary)["ap"] = 1
	var hp_before := int((a.units[4] as Dictionary)["hp"])
	_check("legal attack spends AP and applies deterministic damage", a.attack_unit(1, 4)
		and int((a.units[4] as Dictionary)["hp"]) == hp_before - ridge_damage)
	_check("an exhausted unit cannot attack twice", not a.attack_unit(1, 4))

	var supply_cell := Vector2i(4, 1)
	(a.units[1] as Dictionary)["cell"] = supply_cell
	(a.units[1] as Dictionary)["hp"] = int((a.units[1] as Dictionary)["max_hp"]) - 5
	a.capture_supply_for_unit(1)
	var supply_before := int(a.team_supply[0])
	a.end_turn()
	_check("owned supply pays income and repairs a damaged occupier",
		int(a.team_supply[0]) > supply_before
		and int((a.units[1] as Dictionary)["hp"]) > int((a.units[1] as Dictionary)["max_hp"]) - 5)
	_check("ending team zero hands authority to team one", a.current_team == 1)

	var event_game := _new_game(1312, 2)
	event_game.terrain = event_game.blank_tactics_grid()
	var event := {"type": "move", "event_id": "move-1", "unit": 1, "to": [3, 2]}
	event_game.apply_event(event)
	var event_cell: Vector2i = (event_game.units[1] as Dictionary)["cell"]
	event_game.apply_event(event)
	_check("reliable action replay is idempotent", event_cell == Vector2i(3, 2)
		and (event_game.units[1] as Dictionary)["cell"] == event_cell
		and event_game.seen_events.size() == 1)

	var hotseat := _new_game(1313, 2)
	var cursor_before: Vector2i = hotseat.cursor
	hotseat.apply_inputs(1, [_snap(0, {}), _snap(1, {"move_right": true})])
	_check("non-active hot-seat input cannot move the command cursor", hotseat.cursor == cursor_before)
	hotseat.apply_inputs(2, [_snap(0, {"move_right": true}), _snap(1, {})])
	_check("active hot-seat input owns the command cursor", hotseat.cursor == cursor_before + Vector2i.RIGHT)
	hotseat.apply_inputs(3, [_snap(0, {"secondary": true}), _snap(1, {})])
	var team_one_cursor: Vector2i = hotseat.cursor
	hotseat.apply_inputs(4, [_snap(0, {}), _snap(1, {"move_left": true})])
	_check("second local commander acts after turn handoff",
		hotseat.current_team == 1 and hotseat.cursor == team_one_cursor + Vector2i.LEFT)

	var ai_game := _new_game(1314)
	ai_game.current_team = 1
	var ai_before: Dictionary = ai_game.snapshot()
	ai_game.run_ai_turn()
	_check("AI completes a deterministic tactical turn without player input",
		ai_game.current_team == 0 and ai_game.snapshot() != ai_before)
	var saved: Dictionary = hotseat.snapshot()
	hotseat.apply_inputs(5, [_snap(0, {}), _snap(1, {"primary": true})])
	hotseat.restore_snapshot(saved)
	_check("snapshot restores terrain, units, supply, cursor, turn, events, RNG, and tick",
		hotseat.snapshot() == saved)

	var win_game := _new_game(1315, 2)
	win_game.match_finished.connect(func(_result: Dictionary) -> void: results += 1)
	var enemy_command: int = win_game.command_unit(1)
	(win_game.units[enemy_command] as Dictionary)["hp"] = 1
	win_game.apply_damage(enemy_command, 10, 0)
	_check("breaking enemy command emits one wins/turns result", win_game.finished and results == 1
		and int(win_game.last_result.get("primary", 0)) == 1
		and (win_game.last_result.get("secondary", {}) as Dictionary).has("turns"))
	_check("completed campaign is idempotent", not win_game.debug_force_finish() and results == 1)
	var forced := _new_game(1316, 2)
	_check("catalog completion hook emits a valid ASHLAND result", forced.debug_force_finish()
		and String(forced.last_result.get("game_id", "")) == "ashland_command")
	_check("rules never change DRIVN time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("ASHLAND_COMMAND RESULTS: %d passed, %d failed" % [passed, failed])
	print("ASHLAND_COMMAND: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
