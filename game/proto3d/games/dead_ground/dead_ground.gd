## DEAD GROUND — deterministic first-click-safe demining. Original DRIVN
## survey presentation; recognizable Minesweeper rules behind semantic input.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/handheld/handheld_draw.gd")
const BOARD_SIZE := 10
const MINE_COUNT := 14

var mines: Dictionary = {}
var revealed: Dictionary = {}
var flags: Dictionary = {}
var cursor := Vector2i(4, 4)
var board_ready := false
var errors := 0
var game_status := "surveying"
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "DEAD GROUND", "VOLUNTEER ORDNANCE SURVEY // MARK BEFORE YOU STEP")
	_status = Draw.label("", 15, Draw.DIM, HORIZONTAL_ALIGNMENT_CENTER)
	_status.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE, Control.PRESET_MODE_MINSIZE, 12)
	add_child(_status)
	_render()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	mines.clear()
	revealed.clear()
	flags.clear()
	cursor = Vector2i(4, 4)
	board_ready = false
	errors = 0
	game_status = "surveying"
	_render()


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished or snapshots.is_empty():
		return
	tick = maxi(tick, new_tick)
	var snapshot_row: Dictionary = snapshots[0]
	var pointer: Vector2 = snapshot_row.get("cursor", Vector2.ZERO)
	if pointer != Vector2.ZERO:
		var pointer_cell := point_from_screen(pointer)
		if _inside(pointer_cell):
			cursor = pointer_cell
	var pressed: Dictionary = snapshot_row.get("pressed", {})
	if bool(pressed.get("move_left", false)):
		cursor.x = maxi(0, cursor.x - 1)
	elif bool(pressed.get("move_right", false)):
		cursor.x = mini(BOARD_SIZE - 1, cursor.x + 1)
	elif bool(pressed.get("move_up", false)):
		cursor.y = maxi(0, cursor.y - 1)
	elif bool(pressed.get("move_down", false)):
		cursor.y = mini(BOARD_SIZE - 1, cursor.y + 1)
	if bool(pressed.get("secondary", false)):
		toggle_flag(cursor)
	elif bool(pressed.get("primary", false)) or bool(pressed.get("interact", false)):
		reveal(cursor)
	_render()


func reveal(point: Vector2i) -> bool:
	if not active or paused or finished or not _inside(point) or flags.has(_key(point)):
		return false
	if not board_ready:
		_generate_mines(point)
	var key := _key(point)
	if revealed.has(key):
		return false
	if is_mine(point):
		revealed[key] = true
		errors += 1
		game_status = "struck"
		_render()
		return finish_match({"primary": _elapsed_ms(), "secondary": {"errors": errors},
			"outcome": "complete", "ranked": false})
	_flood(point)
	if revealed.size() >= BOARD_SIZE * BOARD_SIZE - mines.size():
		game_status = "cleared"
		_render()
		finish_match({"primary": _elapsed_ms(), "secondary": {"errors": errors},
			"outcome": "complete", "ranked": true})
	else:
		score_changed.emit({"primary": _elapsed_ms(), "secondary": {"errors": errors}})
		_render()
	return true


func toggle_flag(point: Vector2i) -> bool:
	if not active or paused or finished or not _inside(point) or revealed.has(_key(point)):
		return false
	var key := _key(point)
	if flags.has(key):
		flags.erase(key)
	else:
		flags[key] = true
	_render()
	return true


func _generate_mines(first: Vector2i) -> void:
	var candidates: Array[Vector2i] = []
	for y in BOARD_SIZE:
		for x in BOARD_SIZE:
			var point := Vector2i(x, y)
			if absi(point.x - first.x) <= 1 and absi(point.y - first.y) <= 1:
				continue
			candidates.append(point)
	for _i in MINE_COUNT:
		var index := _rng.randi_range(0, candidates.size() - 1)
		mines[_key(candidates[index])] = true
		candidates.remove_at(index)
	board_ready = true


func set_mines_for_test(points: Array) -> void:
	mines.clear()
	for point_value in points:
		var point: Vector2i = point_value
		mines[_key(point)] = true
	revealed.clear()
	flags.clear()
	board_ready = true
	errors = 0
	game_status = "surveying"
	finished = false
	active = true
	_render()


func _flood(start: Vector2i) -> void:
	var stack: Array[Vector2i] = [start]
	while not stack.is_empty():
		var point: Vector2i = stack.pop_back()
		var key := _key(point)
		if revealed.has(key) or flags.has(key) or is_mine(point):
			continue
		revealed[key] = true
		if adjacent_count(point) != 0:
			continue
		for neighbor in _neighbors(point):
			if not revealed.has(_key(neighbor)) and not is_mine(neighbor):
				stack.append(neighbor)


func adjacent_count(point: Vector2i) -> int:
	var count := 0
	for neighbor in _neighbors(point):
		if is_mine(neighbor):
			count += 1
	return count


func _neighbors(point: Vector2i) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for dy in [-1, 0, 1]:
		for dx in [-1, 0, 1]:
			var neighbor := point + Vector2i(dx, dy)
			if (dx != 0 or dy != 0) and _inside(neighbor):
				out.append(neighbor)
	return out


func is_mine(point: Vector2i) -> bool:
	return mines.has(_key(point))


func _inside(point: Vector2i) -> bool:
	return point.x >= 0 and point.y >= 0 and point.x < BOARD_SIZE and point.y < BOARD_SIZE


func _key(point: Vector2i) -> String:
	return "%d,%d" % [point.x, point.y]


func _point_from_key(key: String) -> Vector2i:
	var parts := key.split(",")
	return Vector2i(int(parts[0]), int(parts[1]))


func _board_rect() -> Rect2:
	var extent := minf(size.x - 70.0, size.y - 150.0)
	return Rect2(Vector2((size.x - extent) * 0.5, 78.0), Vector2(extent, extent))


func point_from_screen(screen_point: Vector2) -> Vector2i:
	var rect := _board_rect()
	if not rect.has_point(screen_point):
		return Vector2i(-1, -1)
	var local := screen_point - rect.position
	var cell := rect.size.x / float(BOARD_SIZE)
	return Vector2i(int(local.x / cell), int(local.y / cell))


func cell_center(point: Vector2i) -> Vector2:
	var rect := _board_rect()
	var cell := rect.size.x / float(BOARD_SIZE)
	return rect.position + (Vector2(point) + Vector2(0.5, 0.5)) * cell


func _elapsed_ms() -> int:
	return maxi(1, int(round(float(tick) / 30.0 * 1000.0)))


func debug_reveal_all_safe() -> void:
	for y in BOARD_SIZE:
		for x in BOARD_SIZE:
			if finished:
				return
			var point := Vector2i(x, y)
			if not is_mine(point):
				reveal(point)


func debug_force_finish() -> bool:
	if finished or not active:
		return false
	game_status = "catalog_complete"
	return finish_match({"primary": _elapsed_ms(), "secondary": {"errors": errors},
		"outcome": "complete", "ranked": true})


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["mines"] = mines.duplicate(true)
	state["revealed"] = revealed.duplicate(true)
	state["flags"] = flags.duplicate(true)
	state["cursor"] = [cursor.x, cursor.y]
	state["board_ready"] = board_ready
	state["errors"] = errors
	state["game_status"] = game_status
	state["rng_state"] = _rng.state
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	mines = (state.get("mines", mines) as Dictionary).duplicate(true)
	revealed = (state.get("revealed", revealed) as Dictionary).duplicate(true)
	flags = (state.get("flags", flags) as Dictionary).duplicate(true)
	var cursor_row: Array = state.get("cursor", [cursor.x, cursor.y])
	cursor = Vector2i(int(cursor_row[0]), int(cursor_row[1]))
	board_ready = bool(state.get("board_ready", board_ready))
	errors = int(state.get("errors", errors))
	game_status = String(state.get("game_status", game_status))
	_rng.state = int(state.get("rng_state", _rng.state))
	_render()


func _render() -> void:
	if _status != null:
		_status.text = "MINES %02d   //   FLAGS %02d   //   %s" % [
			mines.size() if board_ready else MINE_COUNT, flags.size(), game_status.to_upper()]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	var rect := _board_rect()
	draw_rect(rect.grow(6.0), Draw.CARD)
	var cell := rect.size.x / float(BOARD_SIZE)
	var font := ThemeDB.fallback_font
	for y in BOARD_SIZE:
		for x in BOARD_SIZE:
			var point := Vector2i(x, y)
			var cell_rect := Rect2(rect.position + Vector2(point) * cell,
				Vector2(cell - 1.0, cell - 1.0))
			var key := _key(point)
			var fill := Draw.CARD.lightened(0.08)
			if revealed.has(key):
				fill = Draw.INK.lightened(0.08)
			draw_rect(cell_rect, fill)
			draw_rect(cell_rect, Draw.DIM, false, 1.0)
			if flags.has(key):
				draw_string(font, cell_rect.position + Vector2(cell * 0.25, cell * 0.7), "!",
					HORIZONTAL_ALIGNMENT_CENTER, cell * 0.5, int(cell * 0.55), Draw.AMBER)
			elif revealed.has(key) and is_mine(point):
				draw_circle(cell_rect.get_center(), cell * 0.22, Draw.RUST)
			elif revealed.has(key):
				var count := adjacent_count(point)
				if count > 0:
					draw_string(font, cell_rect.position + Vector2(0, cell * 0.72), str(count),
						HORIZONTAL_ALIGNMENT_CENTER, cell, int(cell * 0.48), Draw.BONE)
	var cursor_rect := Rect2(rect.position + Vector2(cursor) * cell, Vector2(cell - 1.0, cell - 1.0))
	draw_rect(cursor_rect.grow(-2.0), Draw.AMBER, false, 3.0)
