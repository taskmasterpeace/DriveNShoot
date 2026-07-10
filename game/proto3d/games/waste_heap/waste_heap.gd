## WASTE HEAP — deterministic 2048 adapted into DRIVN salvage fiction. The
## rules are self-contained and consume only semantic cartridge snapshots.
extends "res://proto3d/games/game_cartridge.gd"

const SIZE := 4
const INK := Color("11100d")
const PANEL := Color("252018")
const AMBER := Color("f2b735")
const BONE := Color("e8dfcf")
const DIM := Color("918675")

var board: Array = []
var score := 0
var highest_part := 0
var _rng := RandomNumberGenerator.new()
var _cells: Array[Label] = []
var _score_label: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_build_ui()
	if board.is_empty():
		board = _empty_board()
	_render()


func configure(new_game_row: Dictionary, new_context: Dictionary) -> void:
	super.configure(new_game_row, new_context)


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	board = _empty_board()
	score = 0
	highest_part = 0
	_spawn_tile()
	_spawn_tile()
	_render()


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished or snapshots.is_empty():
		return
	tick = maxi(tick, new_tick)
	var snapshot_row: Dictionary = snapshots[0]
	var pressed: Dictionary = snapshot_row.get("pressed", {})
	var direction := Vector2i.ZERO
	if bool(pressed.get("move_left", false)):
		direction = Vector2i.LEFT
	elif bool(pressed.get("move_right", false)):
		direction = Vector2i.RIGHT
	elif bool(pressed.get("move_up", false)):
		direction = Vector2i.UP
	elif bool(pressed.get("move_down", false)):
		direction = Vector2i.DOWN
	if direction == Vector2i.ZERO:
		return
	if _move(direction):
		_spawn_tile()
		score_changed.emit({"primary": score, "secondary": {"highest_part": highest_part}})
		_render()
	if not _has_moves():
		finish_match({
			"primary": score,
			"secondary": {"highest_part": highest_part},
			"outcome": "complete",
			"ranked": true,
		})


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["board"] = board.duplicate(true)
	state["score"] = score
	state["highest_part"] = highest_part
	state["rng_state"] = _rng.state
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	var restored: Variant = state.get("board", board)
	if restored is Array and (restored as Array).size() == SIZE:
		board = (restored as Array).duplicate(true)
	elif board.is_empty():
		board = _empty_board()
	score = int(state.get("score", score))
	highest_part = int(state.get("highest_part", highest_part))
	if state.has("rng_state"):
		_rng.state = int(state["rng_state"])
	_render()


func debug_force_finish() -> bool:
	if finished or not active:
		return false
	return finish_match({
		"primary": score,
		"secondary": {"highest_part": highest_part},
		"outcome": "complete",
		"ranked": true,
	})


func _empty_board() -> Array:
	var out: Array = []
	for _y in SIZE:
		out.append([0, 0, 0, 0])
	return out


func _spawn_tile() -> void:
	var empty: Array[Vector2i] = []
	for y in SIZE:
		for x in SIZE:
			if int(board[y][x]) == 0:
				empty.append(Vector2i(x, y))
	if empty.is_empty():
		return
	var point: Vector2i = empty[_rng.randi_range(0, empty.size() - 1)]
	var value := 4 if _rng.randf() < 0.1 else 2
	board[point.y][point.x] = value
	highest_part = maxi(highest_part, value)


func _move(direction: Vector2i) -> bool:
	var changed := false
	for line in SIZE:
		var original: Array[int] = []
		for index in SIZE:
			var point := _line_point(direction, line, index)
			original.append(int(board[point.y][point.x]))
		var compact: Array[int] = []
		for value in original:
			if value > 0:
				compact.append(value)
		var merged: Array[int] = []
		var cursor := 0
		while cursor < compact.size():
			if cursor + 1 < compact.size() and compact[cursor] == compact[cursor + 1]:
				var made := compact[cursor] * 2
				merged.append(made)
				score += made
				highest_part = maxi(highest_part, made)
				cursor += 2
			else:
				merged.append(compact[cursor])
				cursor += 1
		while merged.size() < SIZE:
			merged.append(0)
		if merged != original:
			changed = true
		for index in SIZE:
			var point := _line_point(direction, line, index)
			board[point.y][point.x] = merged[index]
	return changed


func _line_point(direction: Vector2i, line: int, index: int) -> Vector2i:
	if direction == Vector2i.LEFT:
		return Vector2i(index, line)
	if direction == Vector2i.RIGHT:
		return Vector2i(SIZE - 1 - index, line)
	if direction == Vector2i.UP:
		return Vector2i(line, index)
	return Vector2i(line, SIZE - 1 - index)


func _has_moves() -> bool:
	for y in SIZE:
		for x in SIZE:
			var value := int(board[y][x])
			if value == 0:
				return true
			if x + 1 < SIZE and int(board[y][x + 1]) == value:
				return true
			if y + 1 < SIZE and int(board[y + 1][x]) == value:
				return true
	return false


func _build_ui() -> void:
	var background := ColorRect.new()
	background.color = INK
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)

	var frame := VBoxContainer.new()
	frame.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, 34)
	frame.add_theme_constant_override("separation", 16)
	add_child(frame)

	var title := Label.new()
	title.text = "WASTE HEAP"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 34)
	title.add_theme_color_override("font_color", AMBER)
	frame.add_child(title)

	_score_label = Label.new()
	_score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_score_label.add_theme_font_size_override("font_size", 20)
	_score_label.add_theme_color_override("font_color", BONE)
	frame.add_child(_score_label)

	var grid := GridContainer.new()
	grid.columns = SIZE
	grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	frame.add_child(grid)
	for _i in SIZE * SIZE:
		var cell := Label.new()
		cell.custom_minimum_size = Vector2(118, 100)
		cell.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		cell.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		cell.add_theme_font_size_override("font_size", 28)
		cell.add_theme_color_override("font_color", BONE)
		var style := StyleBoxFlat.new()
		style.bg_color = PANEL
		style.border_color = DIM
		style.set_border_width_all(2)
		style.corner_radius_top_left = 8
		style.corner_radius_top_right = 8
		style.corner_radius_bottom_left = 8
		style.corner_radius_bottom_right = 8
		cell.add_theme_stylebox_override("normal", style)
		grid.add_child(cell)
		_cells.append(cell)


func _render() -> void:
	if _score_label == null or _cells.size() != SIZE * SIZE:
		return
	_score_label.text = "SCORE %06d   //   CORE %d" % [score, highest_part]
	for y in SIZE:
		for x in SIZE:
			var value := int(board[y][x])
			_cells[y * SIZE + x].text = "" if value == 0 else str(value)
