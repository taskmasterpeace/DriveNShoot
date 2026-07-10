## DIAL TANKS - deterministic one-to-four-player ricochet tank combat.
## Original Carousel targeting-bay art; no upstream maps, sprites, or branding.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/console/console_draw.gd")
const FIELD := Rect2(60, 110, 1160, 540)
const TANK_RADIUS := 22.0
const TANK_SPEED := 135.0
const TURN_SPEED := 2.25
const SHELL_SPEED := 430.0
const MAX_BOUNCES := 2
const START_HP := 3
const MINE_DAMAGE := 2
const MINE_TRIGGER := 42.0
const FIRE_COOLDOWN := 20
const MINE_COOLDOWN := 75
const STEP := 1.0 / 30.0

var tanks: Array = []
var shells: Array = []
var mines: Array = []
var walls: Array[Rect2] = [Rect2(410, 225, 90, 265), Rect2(780, 225, 90, 265),
	Rect2(570, 330, 140, 55)]
var round_winner := -1
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "DIAL TANKS", "CAROUSEL GUNNERY TRIAL // BANK THE SHOT")
	_status = Draw.status(self)
	queue_redraw()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	tanks.clear()
	shells.clear()
	mines.clear()
	round_winner = -1
	var count := target_participant_count(2, 4, new_seats.size())
	var spawns: Array[Vector2] = [Vector2(155, 175), Vector2(1125, 585),
		Vector2(1125, 175), Vector2(155, 585)]
	for index in count:
		var angle := _rng.randf_range(-PI, PI)
		tanks.append({"id": index, "pos": spawns[index], "angle": angle,
			"turret": angle, "hp": START_HP, "alive": true,
			"ai": index >= new_seats.size(), "cooldown": 0, "mine_cooldown": 0,
			"kills": 0, "wins": 0})
	_render()


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished:
		return
	tick = maxi(tick, new_tick)
	for index in tanks.size():
		var tank: Dictionary = tanks[index]
		if not bool(tank.get("alive", false)):
			continue
		var input: Dictionary = _ai_snapshot(index) if bool(tank.get("ai", false)) \
			else _snapshot_for_tank(index, snapshots)
		_drive(index, input)
	update_fixed(STEP)
	_render()


func _drive(index: int, input: Dictionary) -> void:
	if input.is_empty():
		return
	var tank: Dictionary = tanks[index]
	var move: Vector2 = input.get("move", Vector2.ZERO)
	if move == Vector2.ZERO:
		var held: Dictionary = input.get("held", {})
		move = Vector2(float(bool(held.get("move_right", false)))
			- float(bool(held.get("move_left", false))),
			float(bool(held.get("move_down", false)))
			- float(bool(held.get("move_up", false))))
	tank["angle"] = wrapf(float(tank["angle"]) + move.x * TURN_SPEED * STEP, -PI, PI)
	var aim: Vector2 = input.get("aim", Vector2.ZERO)
	if aim.length_squared() > 0.01:
		tank["turret"] = aim.angle()
	var direction := Vector2.from_angle(float(tank["angle"]))
	var proposed: Vector2 = tank["pos"] + direction * (-move.y) * TANK_SPEED * STEP
	proposed.x = clampf(proposed.x, FIELD.position.x + TANK_RADIUS, FIELD.end.x - TANK_RADIUS)
	proposed.y = clampf(proposed.y, FIELD.position.y + TANK_RADIUS, FIELD.end.y - TANK_RADIUS)
	if not _tank_hits_wall(proposed):
		tank["pos"] = proposed
	var pressed: Dictionary = input.get("pressed", {})
	if bool(pressed.get("primary", false)):
		fire_shell(index)
	if bool(pressed.get("secondary", false)):
		place_mine(index)
	tanks[index] = tank


func fire_shell(index: int) -> bool:
	if index < 0 or index >= tanks.size():
		return false
	var tank: Dictionary = tanks[index]
	if not bool(tank.get("alive", false)) or int(tank.get("cooldown", 0)) > 0:
		return false
	var direction := Vector2.from_angle(float(tank["turret"]))
	shells.append({"pos": Vector2(tank["pos"]) + direction * 30.0,
		"vel": direction * SHELL_SPEED, "owner": index, "bounces": 0, "alive": true})
	tank["cooldown"] = FIRE_COOLDOWN
	tanks[index] = tank
	return true


func place_mine(index: int) -> bool:
	if index < 0 or index >= tanks.size():
		return false
	var tank: Dictionary = tanks[index]
	if not bool(tank.get("alive", false)) or int(tank.get("mine_cooldown", 0)) > 0:
		return false
	mines.append({"pos": Vector2(tank["pos"]), "owner": index, "arm_ticks": 12})
	tank["mine_cooldown"] = MINE_COOLDOWN
	tanks[index] = tank
	return true


func update_fixed(delta: float) -> void:
	for index in tanks.size():
		var tank: Dictionary = tanks[index]
		tank["cooldown"] = maxi(0, int(tank.get("cooldown", 0)) - 1)
		tank["mine_cooldown"] = maxi(0, int(tank.get("mine_cooldown", 0)) - 1)
		tanks[index] = tank
	_update_shells(delta)
	_update_mines()


func _update_shells(delta: float) -> void:
	var index := shells.size() - 1
	while index >= 0:
		var shell: Dictionary = shells[index]
		var old_pos: Vector2 = shell["pos"]
		var pos: Vector2 = old_pos + Vector2(shell["vel"]) * delta
		var velocity: Vector2 = shell["vel"]
		var bounced := false
		if pos.x < FIELD.position.x or pos.x > FIELD.end.x:
			velocity.x *= -1.0
			pos.x = clampf(pos.x, FIELD.position.x, FIELD.end.x)
			bounced = true
		if pos.y < FIELD.position.y or pos.y > FIELD.end.y:
			velocity.y *= -1.0
			pos.y = clampf(pos.y, FIELD.position.y, FIELD.end.y)
			bounced = true
		for wall in walls:
			if wall.has_point(pos):
				var from_left := absf(pos.x - wall.position.x)
				var from_right := absf(wall.end.x - pos.x)
				var from_top := absf(pos.y - wall.position.y)
				var from_bottom := absf(wall.end.y - pos.y)
				var edge := minf(minf(from_left, from_right), minf(from_top, from_bottom))
				if edge == from_left or edge == from_right:
					velocity.x *= -1.0
				else:
					velocity.y *= -1.0
				pos = old_pos
				bounced = true
				break
		if bounced:
			if int(shell.get("bounces", 0)) >= MAX_BOUNCES:
				shells.remove_at(index)
				index -= 1
				continue
			shell["bounces"] = int(shell.get("bounces", 0)) + 1
		shell["pos"] = pos
		shell["vel"] = velocity
		var hit := false
		for tank_index in tanks.size():
			var tank: Dictionary = tanks[tank_index]
			if tank_index == int(shell["owner"]) or not bool(tank.get("alive", false)):
				continue
			if Vector2(tank["pos"]).distance_to(pos) <= TANK_RADIUS + 5.0:
				damage_tank(tank_index, 1, int(shell["owner"]))
				hit = true
				break
		if hit:
			shells.remove_at(index)
		else:
			shells[index] = shell
		index -= 1


func _update_mines() -> void:
	var index := mines.size() - 1
	while index >= 0:
		var mine: Dictionary = mines[index]
		mine["arm_ticks"] = maxi(0, int(mine.get("arm_ticks", 0)) - 1)
		var triggered := false
		if int(mine["arm_ticks"]) <= 0:
			for tank_index in tanks.size():
				var tank: Dictionary = tanks[tank_index]
				if tank_index == int(mine["owner"]) or not bool(tank.get("alive", false)):
					continue
				if Vector2(tank["pos"]).distance_to(Vector2(mine["pos"])) <= MINE_TRIGGER:
					damage_tank(tank_index, MINE_DAMAGE, int(mine["owner"]))
					triggered = true
			if triggered:
				mines.remove_at(index)
			else:
				mines[index] = mine
		else:
			mines[index] = mine
		index -= 1


func damage_tank(index: int, amount: int, attacker: int) -> bool:
	if finished or index < 0 or index >= tanks.size() or amount <= 0:
		return false
	var tank: Dictionary = tanks[index]
	if not bool(tank.get("alive", false)):
		return false
	tank["hp"] = maxi(0, int(tank["hp"]) - amount)
	if int(tank["hp"]) <= 0:
		tank["alive"] = false
		if attacker >= 0 and attacker < tanks.size() and attacker != index:
			var killer: Dictionary = tanks[attacker]
			killer["kills"] = int(killer.get("kills", 0)) + 1
			tanks[attacker] = killer
	tanks[index] = tank
	_check_round()
	_render()
	return true


func _check_round() -> void:
	if finished:
		return
	var alive: Array[int] = []
	for index in tanks.size():
		if bool((tanks[index] as Dictionary).get("alive", false)):
			alive.append(index)
	if alive.size() == 1 and tanks.size() > 1:
		_complete_round(alive[0])


func _complete_round(winner: int) -> void:
	if finished or winner < 0 or winner >= tanks.size():
		return
	round_winner = winner
	var tank: Dictionary = tanks[winner]
	tank["wins"] = int(tank.get("wins", 0)) + 1
	tanks[winner] = tank
	finish_match({"primary": int(tank["wins"]),
		"secondary": {"winner": winner, "kills": int(tank.get("kills", 0))},
		"outcome": "complete", "ranked": true})
	_render()


func _snapshot_for_tank(index: int, snapshots: Array) -> Dictionary:
	if index >= seats.size():
		return {}
	var wanted := int((seats[index] as Dictionary).get("seat", index))
	for value in snapshots:
		var snapshot_row: Dictionary = value
		if int(snapshot_row.get("seat", -1)) == wanted:
			return snapshot_row
	return {}


func _ai_snapshot(index: int) -> Dictionary:
	var tank: Dictionary = tanks[index]
	var target := _nearest_enemy(index)
	if target < 0:
		return {}
	var delta: Vector2 = Vector2((tanks[target] as Dictionary)["pos"]) - Vector2(tank["pos"])
	var desired := delta.angle()
	var turn := clampf(wrapf(desired - float(tank["angle"]), -PI, PI) * 1.8, -1.0, 1.0)
	var pressed: Dictionary = {}
	if tick % 45 == index * 7 % 45:
		pressed["primary"] = true
	if tick % 120 == 30 + index * 5:
		pressed["secondary"] = true
	return {"seat": index, "move": Vector2(turn, -1.0), "aim": delta.normalized(),
		"held": {}, "pressed": pressed, "released": {}}


func _nearest_enemy(index: int) -> int:
	var best := -1
	var best_distance := INF
	var origin: Vector2 = (tanks[index] as Dictionary)["pos"]
	for other in tanks.size():
		if other == index or not bool((tanks[other] as Dictionary).get("alive", false)):
			continue
		var distance := origin.distance_squared_to(Vector2((tanks[other] as Dictionary)["pos"]))
		if distance < best_distance:
			best_distance = distance
			best = other
	return best


func _tank_hits_wall(pos: Vector2) -> bool:
	for wall in walls:
		if wall.grow(TANK_RADIUS).has_point(pos):
			return true
	return false


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["tanks"] = tanks.duplicate(true)
	state["shells"] = shells.duplicate(true)
	state["mines"] = mines.duplicate(true)
	state["round_winner"] = round_winner
	state["rng_state"] = _rng.state
	state["last_result"] = last_result.duplicate(true)
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	tanks = (state.get("tanks", tanks) as Array).duplicate(true)
	shells = (state.get("shells", shells) as Array).duplicate(true)
	mines = (state.get("mines", mines) as Array).duplicate(true)
	round_winner = int(state.get("round_winner", round_winner))
	_rng.state = int(state.get("rng_state", _rng.state))
	last_result = (state.get("last_result", last_result) as Dictionary).duplicate(true)
	_render()


func debug_force_finish() -> bool:
	if finished or tanks.is_empty():
		return false
	for index in range(1, tanks.size()):
		var tank: Dictionary = tanks[index]
		tank["alive"] = false
		tank["hp"] = 0
		tanks[index] = tank
	_complete_round(0)
	return finished


func _render() -> void:
	if _status != null:
		var alive := tanks.filter(func(tank: Dictionary) -> bool: return bool(tank.get("alive", false))).size()
		_status.text = "TICK %05d  //  ACTIVE %d  //  SHELLS %02d  //  MINES %02d%s" % [
			tick, alive, shells.size(), mines.size(),
			"  //  TANK %d WINS" % (round_winner + 1) if round_winner >= 0 else ""]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	draw_rect(FIELD, Draw.CARD, true)
	draw_rect(FIELD, Draw.AMBER, false, 3.0)
	for x in range(int(FIELD.position.x), int(FIELD.end.x), 58):
		draw_line(Vector2(x, FIELD.position.y), Vector2(x, FIELD.end.y), Color("2e2922"), 1.0)
	for y in range(int(FIELD.position.y), int(FIELD.end.y), 54):
		draw_line(Vector2(FIELD.position.x, y), Vector2(FIELD.end.x, y), Color("2e2922"), 1.0)
	for wall in walls:
		draw_rect(wall, Color("51483a"), true)
		draw_rect(wall, Draw.STEEL, false, 3.0)
		for y in range(int(wall.position.y) + 12, int(wall.end.y), 24):
			draw_line(Vector2(wall.position.x + 4, y), Vector2(wall.end.x - 4, y), Draw.DIM, 2.0)
	for mine_value in mines:
		var mine: Dictionary = mine_value
		var mine_pos: Vector2 = mine["pos"]
		draw_circle(mine_pos, 9.0, Draw.RUST)
		draw_arc(mine_pos, 14.0, 0, TAU, 16, Draw.AMBER, 2.0)
	for shell_value in shells:
		var shell: Dictionary = shell_value
		var shell_pos: Vector2 = shell["pos"]
		var shell_vel: Vector2 = Vector2(shell["vel"]).normalized()
		draw_line(shell_pos - shell_vel * 16.0, shell_pos, Draw.AMBER, 4.0)
		draw_circle(shell_pos, 4.0, Draw.BONE)
	for index in tanks.size():
		var tank: Dictionary = tanks[index]
		var pos: Vector2 = tank["pos"]
		var color := Draw.team_color(index)
		if not bool(tank.get("alive", false)):
			color = Draw.DIM
		draw_circle(pos, TANK_RADIUS, color)
		var body_dir := Vector2.from_angle(float(tank["angle"]))
		var side := body_dir.orthogonal()
		var hull := PackedVector2Array([pos + body_dir * 25.0, pos + side * 18.0 - body_dir * 18.0,
			pos - side * 18.0 - body_dir * 18.0])
		draw_colored_polygon(hull, color.darkened(0.2))
		var turret_dir := Vector2.from_angle(float(tank["turret"]))
		draw_line(pos, pos + turret_dir * 38.0, Draw.BONE, 7.0)
		draw_circle(pos, 9.0, Draw.INK)
		for hp_index in int(tank.get("hp", 0)):
			draw_rect(Rect2(pos + Vector2(-18 + hp_index * 13, 28), Vector2(10, 4)), color)
