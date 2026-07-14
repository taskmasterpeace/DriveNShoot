## RUSTBALL proof: acceleration/dash, body-ball impulse, rebounds, goals/reset,
## saves, clock/score finish, AI offense, local seats, snapshot, result.
extends Node

var passed := 0
var failed := 0
var results := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RUSTBALL: %s - %s" % ["PASS" if ok else "FAIL", label])


func _new_game(seed_value: int = 91, seat_count: int = 1) -> Control:
	var game := (load("res://proto3d/games/rustball/rustball.tscn") as PackedScene).instantiate() as Control
	add_child(game)
	game.configure(ProtoGameRegistry.load_catalog().get_game("rustball"), {"source": "test"})
	var seats: Array = []
	for index in seat_count:
		seats.append({"seat": index, "device": -1 if index == 0 else index,
			"profile_id": "league-%d" % index})
	game.start_match(seed_value, seats)
	return game


func _snap(seat: int, move: Vector2, pressed: Dictionary = {}) -> Dictionary:
	return {"seat": seat, "device": -1, "move": move, "aim": Vector2.ZERO,
		"held": {}, "pressed": pressed, "released": {}}


func _ready() -> void:
	print("RUSTBALL: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void: get_tree().quit(1))
	var path := "res://proto3d/games/rustball/rustball.tscn"
	_check("the cartridge scene exists", ResourceLoader.exists(path))
	if not ResourceLoader.exists(path):
		_finish()
		return
	var a := _new_game(911)
	var b := _new_game(911)
	_check("same seed creates the same league roster and kickoff",
		a.snapshot()["players_state"] == b.snapshot()["players_state"]
		and a.ball == b.ball)
	_check("solo play fills an AI rival", a.players_state.size() == 2
		and bool((a.players_state[1] as Dictionary)["ai"]))
	var pos_before: Vector2 = (a.players_state[0] as Dictionary)["pos"]
	a.apply_inputs(1, [_snap(0, Vector2.RIGHT)])
	_check("movement accelerates a bumper athlete", (a.players_state[0] as Dictionary)["pos"] != pos_before
		and Vector2((a.players_state[0] as Dictionary)["vel"]).x > 0.0)
	var speed_before := Vector2((a.players_state[0] as Dictionary)["vel"]).length()
	a.apply_inputs(2, [_snap(0, Vector2.RIGHT, {"mobility": true})])
	_check("mobility performs a committed dash", Vector2((a.players_state[0] as Dictionary)["vel"]).length() > speed_before)

	(a.players_state[0] as Dictionary)["pos"] = Vector2(600, 360)
	a.ball = {"pos": Vector2(628, 360), "vel": Vector2.ZERO}
	_check("primary body action drives the iron ball", a.kick_ball(0)
		and Vector2(a.ball["vel"]).x > 0.0)
	a.ball = {"pos": Vector2(640, a.FIELD.position.y + 2), "vel": Vector2(0, -180)}
	a.update_fixed(0.05)
	_check("arena rails rebound the ball", Vector2(a.ball["vel"]).y > 0.0)

	var score_before := int(a.team_scores[0])
	a.ball = {"pos": Vector2(a.FIELD.end.x - 2, a.GOAL_CENTER_Y), "vel": Vector2(220, 0)}
	a.update_fixed(0.05)
	_check("crossing the rival gate scores and resets kickoff",
		int(a.team_scores[0]) == score_before + 1 and Vector2(a.ball["pos"]) == a.FIELD.get_center())
	var saves_before := int((a.players_state[1] as Dictionary)["saves"])
	a.credit_save(1)
	_check("a goal-line stop credits its defender", int((a.players_state[1] as Dictionary)["saves"]) == saves_before + 1)

	var ai_game := _new_game(912)
	var ai_before: Vector2 = (ai_game.players_state[1] as Dictionary)["pos"]
	for tick in 20:
		ai_game.apply_inputs(tick + 1, [_snap(0, Vector2.ZERO)])
	_check("AI moves into an offensive or defensive line",
		(ai_game.players_state[1] as Dictionary)["pos"] != ai_before)

	var local_game := _new_game(913, 2)
	var local_a: Vector2 = (local_game.players_state[0] as Dictionary)["pos"]
	var local_b: Vector2 = (local_game.players_state[1] as Dictionary)["pos"]
	local_game.apply_inputs(1, [_snap(0, Vector2.RIGHT), _snap(1, Vector2.LEFT)])
	_check("two local seats move distinct athletes",
		(local_game.players_state[0] as Dictionary)["pos"] != local_a
		and (local_game.players_state[1] as Dictionary)["pos"] != local_b)
	var saved: Dictionary = local_game.snapshot()
	local_game.apply_inputs(2, [_snap(0, Vector2.DOWN, {"primary": true}),
		_snap(1, Vector2.UP, {"mobility": true})])
	local_game.restore_snapshot(saved)
	_check("snapshot restores players, ball, score, clock, RNG, and tick", local_game.snapshot() == saved)

	var win_game := _new_game(914, 2)
	win_game.match_finished.connect(func(_result: Dictionary) -> void: results += 1)
	for goal in win_game.GOALS_TO_WIN:
		win_game.score_goal(0)
	_check("goal target emits one goals/saves result", win_game.finished and results == 1
		and int(win_game.last_result.get("primary", 0)) == win_game.GOALS_TO_WIN
		and (win_game.last_result.get("secondary", {}) as Dictionary).has("saves"))
	_check("completed league match is idempotent", not win_game.debug_force_finish() and results == 1)
	var forced := _new_game(915, 2)
	_check("catalog completion hook emits a valid RUSTBALL result", forced.debug_force_finish()
		and String(forced.last_result.get("game_id", "")) == "rustball")
	_check("rules never change DRIVN time", Engine.time_scale == 1.0)
	_finish()


func _finish() -> void:
	print("RUSTBALL RESULTS: %d passed, %d failed" % [passed, failed])
	print("RUSTBALL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
