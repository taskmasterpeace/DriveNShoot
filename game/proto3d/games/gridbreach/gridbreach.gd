## GRIDBREACH - deterministic one-to-four-player sabotage maze.
## Original Continuity relay blocks and breach avatars; no demo map or sprites.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/console/console_draw.gd")
const GRID_WIDTH := 13
const GRID_HEIGHT := 9
const FLOOR := 0
const SOLID := 1
const BREAKABLE := 2
const BOMB_FUSE := 55
const BLAST_TTL := 10
const CELL_SIZE := 56.0
const GRID_ORIGIN := Vector2(276, 112)

var grid: Array = []
var players: Array = []
var bombs: Array = []
var blasts: Array = []
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "GRIDBREACH", "CONTINUITY RELAY MAZE // OPEN A LANE, CLOSE A LIFE")
	_status = Draw.status(self)
	queue_redraw()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	grid = _build_grid()
	players.clear()
	bombs.clear()
	blasts.clear()
	var count := clampi(maxi(2, new_seats.size()), 2, 4)
	var spawns: Array[Vector2i] = [Vector2i(1, 1), Vector2i(11, 7),
		Vector2i(11, 1), Vector2i(1, 7)]
	for index in count:
		players.append({"id": index, "cell": spawns[index], "alive": true,
			"ai": index >= new_seats.size(), "capacity": 1, "range": 2,
			"kills": 0, "wins": 0})
	_render()


func blank_grid() -> Array:
	var out: Array = []
	for y in GRID_HEIGHT:
		var row: Array[int] = []
		for x in GRID_WIDTH:
			row.append(SOLID if x == 0 or y == 0 or x == GRID_WIDTH - 1 or y == GRID_HEIGHT - 1 else FLOOR)
		out.append(row)
	return out


func _build_grid() -> Array:
	var out := blank_grid()
	for y in range(2, GRID_HEIGHT - 1, 2):
		for x in range(2, GRID_WIDTH - 1, 2):
			out[y][x] = SOLID
	var safe: Dictionary = {}
	for spawn in [Vector2i(1, 1), Vector2i(11, 7), Vector2i(11, 1), Vector2i(1, 7)]:
		safe[spawn] = true
		safe[spawn + Vector2i.RIGHT] = true
		safe[spawn + Vector2i.LEFT] = true
		safe[spawn + Vector2i.UP] = true
		safe[spawn + Vector2i.DOWN] = true
	for y in range(1, GRID_HEIGHT - 1):
		for x in range(1, GRID_WIDTH - 1):
			var cell := Vector2i(x, y)
			if int(out[y][x]) == FLOOR and not safe.has(cell) and _rng.randf() < 0.58:
				out[y][x] = BREAKABLE
	return out


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished:
		return
	tick = maxi(tick, new_tick)
	for index in players.size():
		var player: Dictionary = players[index]
		if not bool(player.get("alive", false)):
			continue
		var input: Dictionary = _ai_snapshot(index) if bool(player.get("ai", false)) \
			else _snapshot_for_player(index, snapshots)
		_apply_player_input(index, input)
	update_fixed()
	_render()


func _apply_player_input(index: int, input: Dictionary) -> void:
	if input.is_empty():
		return
	var pressed: Dictionary = input.get("pressed", {})
	var direction := Vector2i.ZERO
	if bool(pressed.get("move_up", false)):
		direction = Vector2i.UP
	elif bool(pressed.get("move_down", false)):
		direction = Vector2i.DOWN
	elif bool(pressed.get("move_left", false)):
		direction = Vector2i.LEFT
	elif bool(pressed.get("move_right", false)):
		direction = Vector2i.RIGHT
	if direction != Vector2i.ZERO:
		move_player(index, direction)
	if bool(pressed.get("primary", false)):
		plant_bomb(index)


func move_player(index: int, direction: Vector2i) -> bool:
	if finished or index < 0 or index >= players.size() or direction == Vector2i.ZERO:
		return false
	var player: Dictionary = players[index]
	if not bool(player.get("alive", false)):
		return false
	var target: Vector2i = player["cell"] + direction
	if not _inside(target) or int(grid[target.y][target.x]) != FLOOR or _bomb_at(target) >= 0:
		return false
	for other in players.size():
		if other != index and bool((players[other] as Dictionary).get("alive", false)) \
				and (players[other] as Dictionary)["cell"] == target:
			return false
	player["cell"] = target
	players[index] = player
	return true


func plant_bomb(index: int) -> bool:
	if finished or index < 0 or index >= players.size():
		return false
	var player: Dictionary = players[index]
	if not bool(player.get("alive", false)):
		return false
	var owned := bombs.filter(func(bomb: Dictionary) -> bool: return int(bomb.get("owner", -1)) == index).size()
	var cell: Vector2i = player["cell"]
	if owned >= int(player.get("capacity", 1)) or _bomb_at(cell) >= 0:
		return false
	bombs.append({"cell": cell, "owner": index, "fuse": BOMB_FUSE,
		"range": int(player.get("range", 2))})
	return true


func place_bomb_for_test(cell: Vector2i, owner: int, fuse: int, range_value: int = 2) -> void:
	bombs.append({"cell": cell, "owner": owner, "fuse": fuse, "range": range_value})


func update_fixed() -> void:
	var blast_index := blasts.size() - 1
	while blast_index >= 0:
		var blast: Dictionary = blasts[blast_index]
		blast["ttl"] = int(blast.get("ttl", 0)) - 1
		if int(blast["ttl"]) <= 0:
			blasts.remove_at(blast_index)
		else:
			blasts[blast_index] = blast
		blast_index -= 1
	for index in bombs.size():
		var bomb: Dictionary = bombs[index]
		bomb["fuse"] = int(bomb.get("fuse", 0)) - 1
		bombs[index] = bomb
	while true:
		var due := -1
		for index in bombs.size():
			if int((bombs[index] as Dictionary).get("fuse", 0)) <= 0:
				due = index
				break
		if due < 0:
			break
		detonate_bomb(due)


func detonate_bomb(index: int) -> bool:
	if index < 0 or index >= bombs.size():
		return false
	var bomb: Dictionary = bombs[index]
	bombs.remove_at(index)
	var cells := compute_blast(bomb["cell"], int(bomb.get("range", 2)))
	for cell in cells:
		if int(grid[cell.y][cell.x]) == BREAKABLE:
			grid[cell.y][cell.x] = FLOOR
		if not blasts.any(func(row: Dictionary) -> bool: return row.get("cell") == cell):
			blasts.append({"cell": cell, "owner": int(bomb["owner"]), "ttl": BLAST_TTL})
		var chained := _bomb_at(cell)
		if chained >= 0:
			detonate_bomb(chained)
	for player_index in players.size():
		var player: Dictionary = players[player_index]
		if bool(player.get("alive", false)) and cells.has(player["cell"]):
			kill_player(player_index, int(bomb["owner"]))
	return true


func compute_blast(origin: Vector2i, range_value: int) -> Array[Vector2i]:
	var out: Array[Vector2i] = [origin]
	for direction_value in [Vector2i.UP, Vector2i.DOWN, Vector2i.LEFT, Vector2i.RIGHT]:
		var direction: Vector2i = direction_value
		for step in range(1, range_value + 1):
			var cell: Vector2i = origin + direction * step
			if not _inside(cell) or int(grid[cell.y][cell.x]) == SOLID:
				break
			out.append(cell)
			if int(grid[cell.y][cell.x]) == BREAKABLE:
				break
	return out


func kill_player(index: int, owner: int) -> bool:
	if finished or index < 0 or index >= players.size():
		return false
	var player: Dictionary = players[index]
	if not bool(player.get("alive", false)):
		return false
	player["alive"] = false
	players[index] = player
	if owner >= 0 and owner < players.size() and owner != index:
		var killer: Dictionary = players[owner]
		killer["kills"] = int(killer.get("kills", 0)) + 1
		players[owner] = killer
	var alive: Array[int] = []
	for candidate in players.size():
		if bool((players[candidate] as Dictionary).get("alive", false)):
			alive.append(candidate)
	if alive.size() == 1 and players.size() > 1:
		_complete_match(alive[0])
	return true


func _complete_match(winner: int) -> void:
	if finished or winner < 0 or winner >= players.size():
		return
	var player: Dictionary = players[winner]
	player["wins"] = int(player.get("wins", 0)) + 1
	players[winner] = player
	finish_match({"primary": int(player["wins"]),
		"secondary": {"winner": winner, "survival_ms": tick * 33,
			"kills": int(player.get("kills", 0))},
		"outcome": "complete", "ranked": true})


func _ai_snapshot(index: int) -> Dictionary:
	var player: Dictionary = players[index]
	var cell: Vector2i = player["cell"]
	var nearest_bomb := Vector2i(-99, -99)
	var nearest_distance := 999
	for bomb_value in bombs:
		var bomb: Dictionary = bomb_value
		var distance: int = cell.distance_to(bomb["cell"])
		if distance < nearest_distance:
			nearest_distance = distance
			nearest_bomb = bomb["cell"]
	var direction := Vector2i.ZERO
	if nearest_distance <= 3:
		var best_distance := nearest_distance
		for candidate_value in [Vector2i.UP, Vector2i.DOWN, Vector2i.LEFT, Vector2i.RIGHT]:
			var candidate: Vector2i = candidate_value
			var target: Vector2i = cell + candidate
			if _can_enter(target) and target.distance_to(nearest_bomb) > best_distance:
				best_distance = target.distance_to(nearest_bomb)
				direction = candidate
	else:
		var target_index := _nearest_enemy(index)
		if target_index >= 0:
			var target_cell: Vector2i = (players[target_index] as Dictionary)["cell"]
			var delta := target_cell - cell
			direction = Vector2i(signi(delta.x), 0) if abs(delta.x) >= abs(delta.y) \
				else Vector2i(0, signi(delta.y))
	var pressed: Dictionary = {}
	if direction == Vector2i.UP:
		pressed["move_up"] = true
	elif direction == Vector2i.DOWN:
		pressed["move_down"] = true
	elif direction == Vector2i.LEFT:
		pressed["move_left"] = true
	elif direction == Vector2i.RIGHT:
		pressed["move_right"] = true
	if nearest_distance > 3 and tick % 28 == index * 5 % 28:
		pressed["primary"] = true
	return {"seat": index, "held": pressed.duplicate(), "pressed": pressed,
		"released": {}, "move": Vector2.ZERO, "aim": Vector2.ZERO}


func _nearest_enemy(index: int) -> int:
	var best := -1
	var best_distance := 999
	var origin: Vector2i = (players[index] as Dictionary)["cell"]
	for other in players.size():
		if other == index or not bool((players[other] as Dictionary).get("alive", false)):
			continue
		var distance: int = origin.distance_to((players[other] as Dictionary)["cell"])
		if distance < best_distance:
			best_distance = distance
			best = other
	return best


func _snapshot_for_player(index: int, snapshots: Array) -> Dictionary:
	if index >= seats.size():
		return {}
	var wanted := int((seats[index] as Dictionary).get("seat", index))
	for value in snapshots:
		var input: Dictionary = value
		if int(input.get("seat", -1)) == wanted:
			return input
	return {}


func _inside(cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.y >= 0 and cell.x < GRID_WIDTH and cell.y < GRID_HEIGHT


func _can_enter(cell: Vector2i) -> bool:
	return _inside(cell) and int(grid[cell.y][cell.x]) == FLOOR and _bomb_at(cell) < 0


func _bomb_at(cell: Vector2i) -> int:
	for index in bombs.size():
		if (bombs[index] as Dictionary).get("cell") == cell:
			return index
	return -1


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["grid"] = grid.duplicate(true)
	state["players"] = players.duplicate(true)
	state["bombs"] = bombs.duplicate(true)
	state["blasts"] = blasts.duplicate(true)
	state["rng_state"] = _rng.state
	state["last_result"] = last_result.duplicate(true)
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	grid = (state.get("grid", grid) as Array).duplicate(true)
	players = (state.get("players", players) as Array).duplicate(true)
	bombs = (state.get("bombs", bombs) as Array).duplicate(true)
	blasts = (state.get("blasts", blasts) as Array).duplicate(true)
	_rng.state = int(state.get("rng_state", _rng.state))
	last_result = (state.get("last_result", last_result) as Dictionary).duplicate(true)
	_render()


func debug_force_finish() -> bool:
	if finished or players.is_empty():
		return false
	for index in range(1, players.size()):
		var player: Dictionary = players[index]
		player["alive"] = false
		players[index] = player
	_complete_match(0)
	_render()
	return finished


func _render() -> void:
	if _status != null:
		var alive := players.filter(func(player: Dictionary) -> bool: return bool(player.get("alive", false))).size()
		_status.text = "ONLINE %d  //  CHARGES %02d  //  LIVE BLASTS %02d  //  TICK %05d" % [
			alive, bombs.size(), blasts.size(), tick]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	for y in grid.size():
		for x in (grid[y] as Array).size():
			var cell := Vector2i(x, y)
			var rect := Rect2(GRID_ORIGIN + Vector2(x, y) * CELL_SIZE, Vector2.ONE * (CELL_SIZE - 2.0))
			var kind := int(grid[y][x])
			var color := Color("242923")
			if kind == SOLID:
				color = Color("5a594f")
			elif kind == BREAKABLE:
				color = Color("70483a")
			draw_rect(rect, color, true)
			draw_rect(rect, Color("343a31"), false, 1.0)
			if kind == BREAKABLE:
				draw_line(rect.position + Vector2(6, 6), rect.end - Vector2(6, 6), Draw.RUST, 2.0)
	for blast_value in blasts:
		var blast: Dictionary = blast_value
		var center := _cell_center(blast["cell"])
		draw_rect(Rect2(center - Vector2.ONE * 20, Vector2.ONE * 40), Draw.AMBER, true)
		draw_line(center - Vector2(24, 0), center + Vector2(24, 0), Draw.BONE, 5.0)
		draw_line(center - Vector2(0, 24), center + Vector2(0, 24), Draw.BONE, 5.0)
	for bomb_value in bombs:
		var bomb: Dictionary = bomb_value
		var center := _cell_center(bomb["cell"])
		draw_circle(center, 16, Draw.INK)
		draw_arc(center, 18, 0, TAU, 18, Draw.RUST, 4.0)
		draw_line(center, center + Vector2(10, -16), Draw.AMBER, 3.0)
	for index in players.size():
		var player: Dictionary = players[index]
		var center := _cell_center(player["cell"])
		var color := Draw.team_color(index) if bool(player.get("alive", false)) else Draw.DIM
		draw_circle(center, 18, color)
		draw_rect(Rect2(center - Vector2(8, 8), Vector2(16, 16)), Draw.INK, true)
		draw_line(center - Vector2(12, 0), center + Vector2(12, 0), color, 3.0)


func _cell_center(cell: Vector2i) -> Vector2:
	return GRID_ORIGIN + (Vector2(cell) + Vector2.ONE * 0.5) * CELL_SIZE
