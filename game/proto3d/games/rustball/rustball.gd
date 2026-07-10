## RUSTBALL - deterministic one-to-four-player bumper-yard physics sport.
## Original league pitch, iron ball, gates, athletes, and score presentation.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/console/console_draw.gd")
const FIELD := Rect2(60, 120, 1160, 500)
const GOAL_CENTER_Y := 370.0
const GOAL_HALF_HEIGHT := 105.0
const PLAYER_RADIUS := 24.0
const BALL_RADIUS := 18.0
const PLAYER_ACCEL := 720.0
const PLAYER_MAX_SPEED := 235.0
const DASH_IMPULSE := 185.0
const KICK_IMPULSE := 360.0
const GOALS_TO_WIN := 3
const MATCH_TICKS := 1800
const STEP := 1.0 / 30.0

var players_state: Array = []
var ball: Dictionary = {}
var team_scores: Array[int] = [0, 0]
var elapsed_ticks := 0
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "RUSTBALL", "BUMPER-YARD LEAGUE // NO GRASS, NO MERCY")
	_status = Draw.status(self)
	queue_redraw()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	players_state.clear()
	team_scores = [0, 0]
	elapsed_ticks = 0
	var count := clampi(maxi(2, new_seats.size()), 2, 4)
	for index in count:
		var team := index % 2
		var row := index / 2
		var pos := Vector2(FIELD.position.x + 190.0 if team == 0 else FIELD.end.x - 190.0,
			GOAL_CENTER_Y + (-75.0 if row == 0 else 75.0))
		players_state.append({"id": index, "team": team, "pos": pos, "vel": Vector2.ZERO,
			"ai": index >= new_seats.size(), "dash_cooldown": 0, "goals": 0,
			"saves": 0, "wins": 0})
	ball = {"pos": FIELD.get_center(), "vel": Vector2.ZERO}
	_render()


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished:
		return
	tick = maxi(tick, new_tick)
	for index in players_state.size():
		var player: Dictionary = players_state[index]
		var input: Dictionary = _ai_snapshot(index) if bool(player.get("ai", false)) \
			else _snapshot_for_player(index, snapshots)
		_drive_player(index, input)
	update_fixed(STEP)
	_render()


func _drive_player(index: int, input: Dictionary) -> void:
	if input.is_empty():
		return
	var player: Dictionary = players_state[index]
	var move: Vector2 = input.get("move", Vector2.ZERO)
	if move.length_squared() > 1.0:
		move = move.normalized()
	player["vel"] = Vector2(player["vel"]) + move * PLAYER_ACCEL * STEP
	var velocity: Vector2 = player["vel"]
	if velocity.length() > PLAYER_MAX_SPEED:
		velocity = velocity.normalized() * PLAYER_MAX_SPEED
	player["vel"] = velocity
	players_state[index] = player
	var pressed: Dictionary = input.get("pressed", {})
	if bool(pressed.get("mobility", false)) and int(player.get("dash_cooldown", 0)) <= 0:
		var dash_dir := move.normalized() if move.length_squared() > 0.01 else \
			Vector2(1, 0) if int(player["team"]) == 0 else Vector2(-1, 0)
		player = players_state[index]
		player["vel"] = Vector2(player["vel"]) + dash_dir * DASH_IMPULSE
		player["dash_cooldown"] = 45
		players_state[index] = player
	if bool(pressed.get("primary", false)):
		kick_ball(index)


func kick_ball(index: int) -> bool:
	if finished or index < 0 or index >= players_state.size() or ball.is_empty():
		return false
	var player: Dictionary = players_state[index]
	var delta: Vector2 = Vector2(ball["pos"]) - Vector2(player["pos"])
	if delta.length() > PLAYER_RADIUS + BALL_RADIUS + 14.0:
		return false
	var direction := delta.normalized()
	if direction == Vector2.ZERO:
		direction = Vector2.RIGHT if int(player["team"]) == 0 else Vector2.LEFT
	ball["vel"] = Vector2(ball["vel"]) + direction * KICK_IMPULSE + Vector2(player["vel"]) * 0.35
	return true


func update_fixed(delta: float) -> void:
	if finished:
		return
	elapsed_ticks += 1
	for index in players_state.size():
		var player: Dictionary = players_state[index]
		player["dash_cooldown"] = maxi(0, int(player.get("dash_cooldown", 0)) - 1)
		player["pos"] = Vector2(player["pos"]) + Vector2(player["vel"]) * delta
		player["vel"] = Vector2(player["vel"]) * 0.88
		var pos: Vector2 = player["pos"]
		pos.x = clampf(pos.x, FIELD.position.x + PLAYER_RADIUS, FIELD.end.x - PLAYER_RADIUS)
		pos.y = clampf(pos.y, FIELD.position.y + PLAYER_RADIUS, FIELD.end.y - PLAYER_RADIUS)
		player["pos"] = pos
		players_state[index] = player
	var ball_pos: Vector2 = ball["pos"] + Vector2(ball["vel"]) * delta
	var ball_vel: Vector2 = Vector2(ball["vel"]) * 0.992
	if ball_pos.y < FIELD.position.y + BALL_RADIUS:
		ball_pos.y = FIELD.position.y + BALL_RADIUS
		ball_vel.y = absf(ball_vel.y)
	elif ball_pos.y > FIELD.end.y - BALL_RADIUS:
		ball_pos.y = FIELD.end.y - BALL_RADIUS
		ball_vel.y = -absf(ball_vel.y)
	var in_gate := absf(ball_pos.y - GOAL_CENTER_Y) <= GOAL_HALF_HEIGHT
	if ball_pos.x > FIELD.end.x and in_gate:
		ball["pos"] = ball_pos
		ball["vel"] = ball_vel
		score_goal(0)
		return
	if ball_pos.x < FIELD.position.x and in_gate:
		ball["pos"] = ball_pos
		ball["vel"] = ball_vel
		score_goal(1)
		return
	if ball_pos.x < FIELD.position.x + BALL_RADIUS:
		ball_pos.x = FIELD.position.x + BALL_RADIUS
		ball_vel.x = absf(ball_vel.x)
	elif ball_pos.x > FIELD.end.x - BALL_RADIUS:
		ball_pos.x = FIELD.end.x - BALL_RADIUS
		ball_vel.x = -absf(ball_vel.x)
	ball["pos"] = ball_pos
	ball["vel"] = ball_vel
	_resolve_player_ball()
	if elapsed_ticks >= MATCH_TICKS and team_scores[0] != team_scores[1]:
		_complete_match(0 if team_scores[0] > team_scores[1] else 1)


func _resolve_player_ball() -> void:
	for index in players_state.size():
		var player: Dictionary = players_state[index]
		var delta: Vector2 = Vector2(ball["pos"]) - Vector2(player["pos"])
		var minimum := PLAYER_RADIUS + BALL_RADIUS
		if delta.length() >= minimum:
			continue
		var normal := delta.normalized() if delta != Vector2.ZERO else Vector2.RIGHT
		var was_goalward := (int(player["team"]) == 0 and Vector2(ball["vel"]).x < -80.0
			and Vector2(player["pos"]).x < FIELD.position.x + 150.0) \
			or (int(player["team"]) == 1 and Vector2(ball["vel"]).x > 80.0
			and Vector2(player["pos"]).x > FIELD.end.x - 150.0)
		ball["pos"] = Vector2(player["pos"]) + normal * minimum
		ball["vel"] = normal * maxf(120.0, Vector2(ball["vel"]).length()) + Vector2(player["vel"]) * 0.6
		if was_goalward:
			credit_save(index)


func score_goal(team: int) -> bool:
	if finished or team < 0 or team > 1:
		return false
	team_scores[team] += 1
	var nearest := _nearest_player_on_team(team, Vector2(ball.get("pos", FIELD.get_center())))
	if nearest >= 0:
		var scorer: Dictionary = players_state[nearest]
		scorer["goals"] = int(scorer.get("goals", 0)) + 1
		players_state[nearest] = scorer
	if team_scores[team] >= GOALS_TO_WIN:
		_complete_match(team)
	else:
		_reset_kickoff()
	return true


func credit_save(index: int) -> bool:
	if index < 0 or index >= players_state.size():
		return false
	var player: Dictionary = players_state[index]
	player["saves"] = int(player.get("saves", 0)) + 1
	players_state[index] = player
	return true


func _reset_kickoff() -> void:
	ball = {"pos": FIELD.get_center(), "vel": Vector2.ZERO}
	for index in players_state.size():
		var player: Dictionary = players_state[index]
		var team := int(player["team"])
		var row := index / 2
		player["pos"] = Vector2(FIELD.position.x + 190.0 if team == 0 else FIELD.end.x - 190.0,
			GOAL_CENTER_Y + (-75.0 if row == 0 else 75.0))
		player["vel"] = Vector2.ZERO
		players_state[index] = player


func _complete_match(team: int) -> void:
	if finished:
		return
	var total_saves := 0
	for index in players_state.size():
		var player: Dictionary = players_state[index]
		if int(player["team"]) == team:
			total_saves += int(player.get("saves", 0))
			player["wins"] = int(player.get("wins", 0)) + 1
			players_state[index] = player
	finish_match({"primary": int(team_scores[team]),
		"secondary": {"winner_team": team, "saves": total_saves,
			"clock_ms": elapsed_ticks * 33}, "outcome": "complete", "ranked": true})


func _nearest_player_on_team(team: int, point: Vector2) -> int:
	var best := -1
	var best_distance := INF
	for index in players_state.size():
		var player: Dictionary = players_state[index]
		if int(player["team"]) != team:
			continue
		var distance := Vector2(player["pos"]).distance_squared_to(point)
		if distance < best_distance:
			best_distance = distance
			best = index
	return best


func _ai_snapshot(index: int) -> Dictionary:
	var player: Dictionary = players_state[index]
	var target: Vector2 = ball["pos"]
	var move := (target - Vector2(player["pos"])).normalized()
	var pressed: Dictionary = {}
	if Vector2(player["pos"]).distance_to(target) < PLAYER_RADIUS + BALL_RADIUS + 18.0:
		pressed["primary"] = true
	if tick % 75 == index * 11 % 75:
		pressed["mobility"] = true
	return {"seat": index, "move": move, "aim": Vector2.ZERO,
		"held": {}, "pressed": pressed, "released": {}}


func _snapshot_for_player(index: int, snapshots: Array) -> Dictionary:
	if index >= seats.size():
		return {}
	var wanted := int((seats[index] as Dictionary).get("seat", index))
	for value in snapshots:
		var input: Dictionary = value
		if int(input.get("seat", -1)) == wanted:
			return input
	return {}


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["players_state"] = players_state.duplicate(true)
	state["ball"] = ball.duplicate(true)
	state["team_scores"] = team_scores.duplicate()
	state["elapsed_ticks"] = elapsed_ticks
	state["rng_state"] = _rng.state
	state["last_result"] = last_result.duplicate(true)
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	players_state = (state.get("players_state", players_state) as Array).duplicate(true)
	ball = (state.get("ball", ball) as Dictionary).duplicate(true)
	team_scores.assign(state.get("team_scores", team_scores))
	elapsed_ticks = int(state.get("elapsed_ticks", elapsed_ticks))
	_rng.state = int(state.get("rng_state", _rng.state))
	last_result = (state.get("last_result", last_result) as Dictionary).duplicate(true)
	_render()


func debug_force_finish() -> bool:
	if finished:
		return false
	team_scores[0] = GOALS_TO_WIN
	_complete_match(0)
	_render()
	return finished


func _render() -> void:
	if _status != null:
		_status.text = "AMBER %02d  //  RUST %02d  //  CLOCK %02d:%02d  //  TICK %05d" % [
			team_scores[0], team_scores[1], (MATCH_TICKS - elapsed_ticks) / 900,
			((MATCH_TICKS - elapsed_ticks) / 30) % 60, tick]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	draw_rect(FIELD, Color("262a22"), true)
	draw_rect(FIELD, Draw.STEEL, false, 4.0)
	draw_line(Vector2(FIELD.get_center().x, FIELD.position.y),
		Vector2(FIELD.get_center().x, FIELD.end.y), Draw.DIM, 3.0)
	draw_arc(FIELD.get_center(), 90, 0, TAU, 36, Draw.DIM, 3.0)
	draw_rect(Rect2(FIELD.position.x - 24, GOAL_CENTER_Y - GOAL_HALF_HEIGHT,
		24, GOAL_HALF_HEIGHT * 2), Draw.AMBER.darkened(0.35), true)
	draw_rect(Rect2(FIELD.end.x, GOAL_CENTER_Y - GOAL_HALF_HEIGHT,
		24, GOAL_HALF_HEIGHT * 2), Draw.RUST.darkened(0.2), true)
	for index in 8:
		var x := FIELD.position.x + 90.0 + index * 145.0
		draw_circle(Vector2(x, FIELD.position.y + 28), 13, Color("45443b"))
		draw_circle(Vector2(x, FIELD.end.y - 28), 13, Color("45443b"))
	if not ball.is_empty():
		draw_circle(ball["pos"], BALL_RADIUS, Color("80786b"))
		draw_arc(ball["pos"], BALL_RADIUS, 0, TAU, 18, Draw.BONE, 3.0)
		draw_line(Vector2(ball["pos"]) - Vector2(10, 0), Vector2(ball["pos"]) + Vector2(10, 0), Draw.INK, 2.0)
	for index in players_state.size():
		var player: Dictionary = players_state[index]
		var color := Draw.AMBER if int(player["team"]) == 0 else Draw.RUST
		var pos: Vector2 = player["pos"]
		draw_circle(pos, PLAYER_RADIUS, color)
		draw_circle(pos, 12, Draw.INK)
		draw_line(pos - Vector2(13, 0), pos + Vector2(13, 0), color.lightened(0.25), 4.0)
