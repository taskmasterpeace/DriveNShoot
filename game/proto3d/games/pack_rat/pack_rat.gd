## PACK RAT — strict Sokoban warehouse work with three original evacuation maps.
## One worker, one crate per push, no pulling, no borrowed maps or art.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/handheld/handheld_draw.gd")
const LEVELS: Array = [
	{"name": "INTAKE", "map": [
		"########", "#  .   #", "#  $   #", "#  @   #", "########"]},
	{"name": "COLD AISLE", "map": [
		"#########", "# . .   #", "# $ $   #", "#   @   #", "#       #", "#########"]},
	{"name": "NIGHT DOCK", "map": [
		"##########", "# . . .  #", "# $ $ $  #", "#    @   #", "#        #", "##########"]},
]

var walls: Dictionary = {}
var crates: Array = []
var goals: Array = []
var player_cell := Vector2i.ZERO
var grid_size := Vector2i.ZERO
var level_index := 0
var levels_cleared := 0
var moves := 0
var level_complete := false
var level_name := ""
var _test_level := false
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "PACK RAT", "EVACUATION WAREHOUSE // EVERY CRATE HAS ONE WAY HOME")
	_status = Draw.label("", 15, Draw.DIM, HORIZONTAL_ALIGNMENT_CENTER)
	_status.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE, Control.PRESET_MODE_MINSIZE, 12)
	add_child(_status)
	_render()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	level_index = 0
	levels_cleared = 0
	moves = 0
	_test_level = false
	_load_authored_level(level_index)


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished or snapshots.is_empty():
		return
	tick = maxi(tick, new_tick)
	var pressed: Dictionary = (snapshots[0] as Dictionary).get("pressed", {})
	var direction := Vector2i.ZERO
	if bool(pressed.get("move_left", false)):
		direction = Vector2i.LEFT
	elif bool(pressed.get("move_right", false)):
		direction = Vector2i.RIGHT
	elif bool(pressed.get("move_up", false)):
		direction = Vector2i.UP
	elif bool(pressed.get("move_down", false)):
		direction = Vector2i.DOWN
	if direction != Vector2i.ZERO:
		move_worker(direction)


func move_worker(direction: Vector2i) -> bool:
	if not active or paused or finished or level_complete:
		return false
	var target := player_cell + direction
	if _wall(target):
		return false
	if crates.has(target):
		var beyond := target + direction
		if _wall(beyond) or crates.has(beyond):
			return false
		crates.erase(target)
		crates.append(beyond)
	player_cell = target
	moves += 1
	score_changed.emit({"primary": levels_cleared, "secondary": {"moves": moves}})
	if goals.all(func(point: Vector2i) -> bool: return crates.has(point)):
		_on_level_cleared()
	_render()
	return true


func _on_level_cleared() -> void:
	level_complete = true
	if _test_level:
		return
	levels_cleared += 1
	if levels_cleared >= LEVELS.size():
		finish_match({"primary": levels_cleared, "secondary": {"moves": moves},
			"outcome": "complete", "ranked": true})
		return
	level_index += 1
	_load_authored_level(level_index)


func _load_authored_level(index: int) -> void:
	var row: Dictionary = LEVELS[index]
	level_name = String(row["name"])
	_parse_map(row["map"])
	level_complete = false
	_render()


func set_level_for_test(lines: Array) -> void:
	_test_level = true
	level_name = "TEST FLOOR"
	_parse_map(lines)
	level_complete = false
	finished = false
	active = true
	moves = 0
	_render()


func _parse_map(lines: Array) -> void:
	walls.clear()
	crates.clear()
	goals.clear()
	grid_size = Vector2i.ZERO
	for y in lines.size():
		var line := String(lines[y])
		grid_size.x = maxi(grid_size.x, line.length())
		grid_size.y = lines.size()
		for x in line.length():
			var token := line.substr(x, 1)
			var point := Vector2i(x, y)
			match token:
				"#": walls[_key(point)] = true
				"@": player_cell = point
				"$": crates.append(point)
				".": goals.append(point)
				"*": crates.append(point); goals.append(point)
				"+": player_cell = point; goals.append(point)


func _wall(point: Vector2i) -> bool:
	return point.x < 0 or point.y < 0 or point.x >= grid_size.x or point.y >= grid_size.y \
		or walls.has(_key(point))


func _key(point: Vector2i) -> String:
	return "%d,%d" % [point.x, point.y]


func debug_clear_level() -> bool:
	if finished or not active:
		return false
	crates = goals.duplicate()
	_on_level_cleared()
	_render()
	return true


func debug_force_finish() -> bool:
	if finished or not active:
		return false
	return finish_match({"primary": levels_cleared, "secondary": {"moves": moves},
		"outcome": "complete", "ranked": true})


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["walls"] = walls.duplicate(true)
	state["crates"] = crates.duplicate()
	state["goals"] = goals.duplicate()
	state["player_cell"] = player_cell
	state["grid_size"] = grid_size
	state["level_index"] = level_index
	state["levels_cleared"] = levels_cleared
	state["moves"] = moves
	state["level_complete"] = level_complete
	state["level_name"] = level_name
	state["test_level"] = _test_level
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	walls = (state.get("walls", walls) as Dictionary).duplicate(true)
	crates = (state.get("crates", crates) as Array).duplicate()
	goals = (state.get("goals", goals) as Array).duplicate()
	player_cell = state.get("player_cell", player_cell)
	grid_size = state.get("grid_size", grid_size)
	level_index = int(state.get("level_index", level_index))
	levels_cleared = int(state.get("levels_cleared", levels_cleared))
	moves = int(state.get("moves", moves))
	level_complete = bool(state.get("level_complete", level_complete))
	level_name = String(state.get("level_name", level_name))
	_test_level = bool(state.get("test_level", _test_level))
	_render()


func _board_rect() -> Rect2:
	var extent := minf(size.x - 70.0, size.y - 160.0)
	var cell := floorf(extent / float(maxi(grid_size.x, grid_size.y))) if grid_size.x > 0 else 1.0
	var board_size := Vector2(grid_size) * cell
	return Rect2(Vector2((size.x - board_size.x) * 0.5, 86.0), board_size)


func _render() -> void:
	if _status != null:
		_status.text = "%s   //   CLEARED %d/%d   //   MOVES %03d" % [
			level_name, levels_cleared, LEVELS.size(), moves]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	if grid_size.x <= 0:
		return
	var rect := _board_rect()
	var cell := rect.size.x / float(grid_size.x)
	for y in grid_size.y:
		for x in grid_size.x:
			var point := Vector2i(x, y)
			var tile := Rect2(rect.position + Vector2(point) * cell, Vector2(cell - 2, cell - 2))
			var fill := Draw.CARD
			if walls.has(_key(point)):
				fill = Draw.INK.lightened(0.16)
			draw_rect(tile, fill)
			if goals.has(point):
				draw_circle(tile.get_center(), cell * 0.22, Draw.AMBER, false, 3.0)
			if crates.has(point):
				draw_rect(tile.grow(-cell * 0.12), Draw.RUST if goals.has(point) else Draw.DIM)
				draw_line(tile.position + Vector2(cell * 0.22, cell * 0.22),
					tile.end - Vector2(cell * 0.22, cell * 0.22), Draw.BONE, 2.0)
				draw_line(Vector2(tile.end.x - cell * 0.22, tile.position.y + cell * 0.22),
					Vector2(tile.position.x + cell * 0.22, tile.end.y - cell * 0.22), Draw.BONE, 2.0)
	var worker_center := rect.position + (Vector2(player_cell) + Vector2(0.5, 0.5)) * cell
	draw_circle(worker_center, cell * 0.24, Draw.SIGNAL)
	draw_circle(worker_center + Vector2(0, -cell * 0.16), cell * 0.09, Draw.BONE)
