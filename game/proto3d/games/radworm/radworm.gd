## RADWORM — a deterministic Continuity routing snake. Original DRIVN art,
## one semantic input path, and one normalized length/survival result.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/handheld/handheld_draw.gd")
const GRID_SIZE := 18
const STEP_TICKS := 4

var body: Array = []
var food := Vector2i.ZERO
var direction := Vector2i.RIGHT
var queued_direction := Vector2i.RIGHT
var survival_ticks := 0
var _last_step_tick := 0
var _rng := RandomNumberGenerator.new()
var _stats: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "RADWORM", "CONTINUITY PACKET ROUTER // DO NOT CROSS YOUR TRACE")
	_stats = Draw.label("", 15, Draw.DIM, HORIZONTAL_ALIGNMENT_CENTER)
	_stats.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE, Control.PRESET_MODE_MINSIZE, 12)
	add_child(_stats)
	if body.is_empty():
		body = [Vector2i(9, 9), Vector2i(8, 9), Vector2i(7, 9)]
	queue_redraw()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	body = [Vector2i(9, 9), Vector2i(8, 9), Vector2i(7, 9)]
	direction = Vector2i.RIGHT
	queued_direction = direction
	survival_ticks = 0
	_last_step_tick = 0
	_spawn_food()
	_render()


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished or snapshots.is_empty():
		return
	tick = maxi(tick, new_tick)
	var snapshot_row: Dictionary = snapshots[0]
	var pressed: Dictionary = snapshot_row.get("pressed", {})
	var requested := Vector2i.ZERO
	if bool(pressed.get("move_left", false)):
		requested = Vector2i.LEFT
	elif bool(pressed.get("move_right", false)):
		requested = Vector2i.RIGHT
	elif bool(pressed.get("move_up", false)):
		requested = Vector2i.UP
	elif bool(pressed.get("move_down", false)):
		requested = Vector2i.DOWN
	if requested != Vector2i.ZERO and requested != -direction:
		queued_direction = requested
	if new_tick - _last_step_tick >= STEP_TICKS:
		_last_step_tick = new_tick
		step_once()


func step_once() -> bool:
	if not active or paused or finished or body.is_empty():
		return false
	direction = queued_direction
	var next: Vector2i = body[0] + direction
	var growing: bool = next == food
	var strikes_body: bool = body.has(next) and (growing or next != body[body.size() - 1])
	if next.x < 0 or next.y < 0 or next.x >= GRID_SIZE or next.y >= GRID_SIZE or strikes_body:
		_finish_route()
		return false
	body.push_front(next)
	if growing:
		_spawn_food()
	else:
		body.pop_back()
	survival_ticks += 1
	score_changed.emit({"primary": body.size(),
		"secondary": {"survival_ms": _survival_ms()}})
	_render()
	return true


func _spawn_food() -> void:
	var open: Array[Vector2i] = []
	for y in GRID_SIZE:
		for x in GRID_SIZE:
			var point := Vector2i(x, y)
			if not body.has(point):
				open.append(point)
	if open.is_empty():
		_finish_route()
		return
	food = open[_rng.randi_range(0, open.size() - 1)]


func _finish_route() -> bool:
	return finish_match({
		"primary": body.size(),
		"secondary": {"survival_ms": _survival_ms()},
		"outcome": "complete", "ranked": true,
	})


func _survival_ms() -> int:
	return int(round(float(survival_ticks * STEP_TICKS) / 30.0 * 1000.0))


func debug_force_finish() -> bool:
	if finished or not active:
		return false
	return _finish_route()


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["body"] = body.duplicate()
	state["food"] = [food.x, food.y]
	state["direction"] = [direction.x, direction.y]
	state["queued_direction"] = [queued_direction.x, queued_direction.y]
	state["survival_ticks"] = survival_ticks
	state["last_step_tick"] = _last_step_tick
	state["rng_state"] = _rng.state
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	body = (state.get("body", body) as Array).duplicate()
	var food_row: Array = state.get("food", [food.x, food.y])
	food = Vector2i(int(food_row[0]), int(food_row[1]))
	var direction_row: Array = state.get("direction", [direction.x, direction.y])
	direction = Vector2i(int(direction_row[0]), int(direction_row[1]))
	var queued_row: Array = state.get("queued_direction", [queued_direction.x, queued_direction.y])
	queued_direction = Vector2i(int(queued_row[0]), int(queued_row[1]))
	survival_ticks = int(state.get("survival_ticks", survival_ticks))
	_last_step_tick = int(state.get("last_step_tick", _last_step_tick))
	_rng.state = int(state.get("rng_state", _rng.state))
	_render()


func _render() -> void:
	if _stats != null:
		_stats.text = "LENGTH %02d   //   ROUTE %05d ms" % [body.size(), _survival_ms()]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	var usable := minf(size.x - 54.0, size.y - 126.0)
	var cell := usable / float(GRID_SIZE)
	var origin := Vector2((size.x - usable) * 0.5, 78.0)
	draw_rect(Rect2(origin - Vector2(5, 5), Vector2(usable + 10, usable + 10)),
		Draw.CARD, true)
	for index in body.size():
		var point: Vector2i = body[index]
		var rect := Rect2(origin + Vector2(point) * cell + Vector2(1, 1),
			Vector2(cell - 2, cell - 2))
		draw_rect(rect, Draw.AMBER if index == 0 else Draw.SIGNAL, true)
		if index > 0:
			draw_rect(rect, Draw.DIM, false, 1.0)
	var food_center := origin + (Vector2(food) + Vector2(0.5, 0.5)) * cell
	draw_circle(food_center, maxf(3.0, cell * 0.28), Draw.RUST)
	draw_circle(food_center, maxf(1.0, cell * 0.08), Draw.BONE)
