## RELAY BLOOM — deterministic reciprocal-edge rotation puzzle. Original
## Continuity relay diagrams, source flood, terminal blooms, and combo scoring.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/handheld/handheld_draw.gd")
const GRID_SIZE := 5
const NORTH := 1
const EAST := 2
const SOUTH := 4
const WEST := 8
const BASE_MASKS: Dictionary = {
	"0,2": EAST,
	"1,2": WEST | EAST,
	"2,2": WEST | EAST | NORTH | SOUTH,
	"3,2": WEST | EAST,
	"4,2": WEST,
	"2,1": NORTH | SOUTH,
	"2,0": SOUTH,
	"2,3": NORTH | SOUTH,
	"2,4": NORTH,
}
const SOURCE := Vector2i(0, 2)
const TERMINALS: Array[Vector2i] = [Vector2i(4, 2), Vector2i(2, 0), Vector2i(2, 4)]

var rotations: Dictionary = {}
var powered: Dictionary = {}
var cursor := Vector2i(2, 2)
var score := 0
var combo := 0
var max_combo := 0
var moves := 0
var corrections := 0
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "RELAY BLOOM", "LINE CREW PRACTICUM // EVERY EDGE MUST ANSWER")
	_status = Draw.label("", 15, Draw.DIM, HORIZONTAL_ALIGNMENT_CENTER)
	_status.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE, Control.PRESET_MODE_MINSIZE, 12)
	add_child(_status)
	_render()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	rotations.clear()
	for key in BASE_MASKS:
		rotations[key] = _rng.randi_range(0, 3)
	cursor = Vector2i(2, 2)
	score = 0
	combo = 0
	max_combo = 0
	moves = 0
	corrections = 0
	_recompute_power()
	if terminals_powered():
		rotations["2,2"] = (int(rotations.get("2,2", 0)) + 1) % 4
		_recompute_power()
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
		cursor.x = mini(GRID_SIZE - 1, cursor.x + 1)
	elif bool(pressed.get("move_up", false)):
		cursor.y = maxi(0, cursor.y - 1)
	elif bool(pressed.get("move_down", false)):
		cursor.y = mini(GRID_SIZE - 1, cursor.y + 1)
	if bool(pressed.get("primary", false)) or bool(pressed.get("interact", false)):
		rotate_tile(cursor)
	_render()


func rotate_tile(point: Vector2i) -> bool:
	var key := _key(point)
	if finished or not active or not BASE_MASKS.has(key):
		return false
	var before := powered.size()
	rotations[key] = (int(rotations.get(key, 0)) + 1) % 4
	moves += 1
	_recompute_power()
	if powered.size() > before:
		combo += 1
		max_combo = maxi(max_combo, combo)
		score += 100 * combo
	else:
		corrections += 1
		combo = 0
		score = maxi(0, score - 10)
	score_changed.emit({"primary": score, "secondary": {"max_combo": max_combo}})
	if terminals_powered():
		score += 1000 + maxi(0, 500 - moves * 5)
		finish_match({"primary": score, "secondary": {"max_combo": max_combo,
			"moves": moves, "corrections": corrections}, "outcome": "complete", "ranked": true})
	_render()
	return true


func rotate_mask(mask: int, turns: int) -> int:
	var amount := posmod(turns, 4)
	if amount == 0:
		return mask & 15
	return ((mask << amount) | (mask >> (4 - amount))) & 15


func tile_mask(point: Vector2i) -> int:
	var key := _key(point)
	if not BASE_MASKS.has(key):
		return 0
	return rotate_mask(int(BASE_MASKS[key]), int(rotations.get(key, 0)))


func tiles_connected(from: Vector2i, to: Vector2i) -> bool:
	var delta := to - from
	var out_bit := 0
	var in_bit := 0
	match delta:
		Vector2i.UP: out_bit = NORTH; in_bit = SOUTH
		Vector2i.RIGHT: out_bit = EAST; in_bit = WEST
		Vector2i.DOWN: out_bit = SOUTH; in_bit = NORTH
		Vector2i.LEFT: out_bit = WEST; in_bit = EAST
		_: return false
	return (tile_mask(from) & out_bit) != 0 and (tile_mask(to) & in_bit) != 0


func _recompute_power() -> void:
	powered.clear()
	if tile_mask(SOURCE) == 0:
		return
	var open: Array[Vector2i] = [SOURCE]
	powered[_key(SOURCE)] = true
	while not open.is_empty():
		var point: Vector2i = open.pop_front()
		for direction in [Vector2i.UP, Vector2i.RIGHT, Vector2i.DOWN, Vector2i.LEFT]:
			var neighbor: Vector2i = point + direction
			var key := _key(neighbor)
			if _inside(neighbor) and BASE_MASKS.has(key) and not powered.has(key) \
					and tiles_connected(point, neighbor):
				powered[key] = true
				open.append(neighbor)


func terminals_powered() -> bool:
	return TERMINALS.all(func(point: Vector2i) -> bool: return powered.has(_key(point)))


func solved_rotations() -> Dictionary:
	var out: Dictionary = {}
	for key in BASE_MASKS:
		out[key] = 0
	return out


func set_rotations_for_test(values: Dictionary) -> void:
	rotations = values.duplicate(true)
	finished = false
	active = true
	_recompute_power()
	_render()


func _inside(point: Vector2i) -> bool:
	return point.x >= 0 and point.y >= 0 and point.x < GRID_SIZE and point.y < GRID_SIZE


func _key(point: Vector2i) -> String:
	return "%d,%d" % [point.x, point.y]


func _board_rect() -> Rect2:
	var extent := minf(size.x - 70.0, size.y - 160.0)
	return Rect2(Vector2((size.x - extent) * 0.5, 86.0), Vector2(extent, extent))


func point_from_screen(point: Vector2) -> Vector2i:
	var rect := _board_rect()
	if not rect.has_point(point):
		return Vector2i(-1, -1)
	var cell := rect.size.x / float(GRID_SIZE)
	var local := point - rect.position
	return Vector2i(int(local.x / cell), int(local.y / cell))


func cell_center(point: Vector2i) -> Vector2:
	var rect := _board_rect()
	var cell := rect.size.x / float(GRID_SIZE)
	return rect.position + (Vector2(point) + Vector2(0.5, 0.5)) * cell


func debug_force_finish() -> bool:
	if finished or not active:
		return false
	return finish_match({"primary": score, "secondary": {"max_combo": max_combo},
		"outcome": "complete", "ranked": true})


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["rotations"] = rotations.duplicate(true)
	state["powered"] = powered.duplicate(true)
	state["cursor"] = cursor
	state["score"] = score
	state["combo"] = combo
	state["max_combo"] = max_combo
	state["moves"] = moves
	state["corrections"] = corrections
	state["rng_state"] = _rng.state
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	rotations = (state.get("rotations", rotations) as Dictionary).duplicate(true)
	powered = (state.get("powered", powered) as Dictionary).duplicate(true)
	cursor = state.get("cursor", cursor)
	score = int(state.get("score", score))
	combo = int(state.get("combo", combo))
	max_combo = int(state.get("max_combo", max_combo))
	moves = int(state.get("moves", moves))
	corrections = int(state.get("corrections", corrections))
	_rng.state = int(state.get("rng_state", _rng.state))
	_render()


func _render() -> void:
	if _status != null:
		_status.text = "POWER %d/%d   //   SCORE %05d   //   COMBO x%d   //   FIXES %d" % [
			powered.size(), BASE_MASKS.size(), score, combo, corrections]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	var rect := _board_rect()
	var cell := rect.size.x / float(GRID_SIZE)
	draw_rect(rect.grow(7.0), Draw.CARD)
	for y in GRID_SIZE:
		for x in GRID_SIZE:
			var point := Vector2i(x, y)
			var key := _key(point)
			var tile := Rect2(rect.position + Vector2(point) * cell, Vector2(cell - 2, cell - 2))
			draw_rect(tile, Draw.INK.lightened(0.08))
			draw_rect(tile, Draw.DIM, false, 1.0)
			if not BASE_MASKS.has(key):
				continue
			var color := Draw.AMBER if powered.has(key) else Draw.DIM
			var center := tile.get_center()
			var mask := tile_mask(point)
			if mask & NORTH: draw_line(center, Vector2(center.x, tile.position.y), color, 7.0)
			if mask & EAST: draw_line(center, Vector2(tile.end.x, center.y), color, 7.0)
			if mask & SOUTH: draw_line(center, Vector2(center.x, tile.end.y), color, 7.0)
			if mask & WEST: draw_line(center, Vector2(tile.position.x, center.y), color, 7.0)
			draw_circle(center, cell * 0.09, color)
			if TERMINALS.has(point):
				draw_circle(center, cell * 0.24, Draw.SIGNAL if powered.has(key) else Draw.RUST, false, 4.0)
			if point == SOURCE:
				draw_rect(Rect2(center - Vector2(cell * 0.12, cell * 0.12),
					Vector2(cell * 0.24, cell * 0.24)), Draw.BONE, false, 3.0)
	var cursor_rect := Rect2(rect.position + Vector2(cursor) * cell, Vector2(cell - 2, cell - 2))
	draw_rect(cursor_rect.grow(-4.0), Draw.AMBER, false, 3.0)
