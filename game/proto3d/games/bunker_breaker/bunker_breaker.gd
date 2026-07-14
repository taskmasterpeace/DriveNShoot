## BUNKER BREAKER — deterministic portrait Breakout with original bunker armor
## plates and breaching-sensor presentation.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/handheld/handheld_draw.gd")
const FIELD_SIZE := Vector2(540, 960)
const PADDLE_Y := 880.0
const PADDLE_WIDTH := 124.0
const PADDLE_HEIGHT := 18.0
const BALL_RADIUS := 8.0
const PADDLE_SPEED := 330.0

var ball_pos := Vector2(270, PADDLE_Y - 22)
var ball_vel := Vector2(210, -350)
var ball_attached := true
var paddle_x := 270.0
var bricks: Array = []
var score := 0
var layers := 0
var lives := 3
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "BUNKER BREAKER", "SHELTER ARMOR CERTIFICATION // LIVE SLUG")
	_status = Draw.label("", 15, Draw.DIM, HORIZONTAL_ALIGNMENT_CENTER)
	_status.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE, Control.PRESET_MODE_MINSIZE, 12)
	add_child(_status)
	_render()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	score = 0
	layers = 0
	lives = 3
	paddle_x = FIELD_SIZE.x * 0.5
	_reset_ball()
	_build_layer()
	_render()


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished or snapshots.is_empty():
		return
	tick = maxi(tick, new_tick)
	var snapshot_row: Dictionary = snapshots[0]
	var held: Dictionary = snapshot_row.get("held", {})
	var axis := float(bool(held.get("move_right", false))) - float(bool(held.get("move_left", false)))
	paddle_x = clampf(paddle_x + axis * PADDLE_SPEED / 30.0,
		PADDLE_WIDTH * 0.5, FIELD_SIZE.x - PADDLE_WIDTH * 0.5)
	var pressed: Dictionary = snapshot_row.get("pressed", {})
	if ball_attached and (bool(pressed.get("primary", false)) or bool(pressed.get("interact", false))):
		ball_attached = false
		ball_vel = Vector2(190.0 if _rng.randi() % 2 == 0 else -190.0, -360.0)
	physics_step(1.0 / 30.0)


func physics_step(delta: float) -> void:
	if not active or paused or finished:
		return
	if ball_attached:
		ball_pos = Vector2(paddle_x, PADDLE_Y - BALL_RADIUS - 4.0)
		_render()
		return
	var previous := ball_pos
	ball_pos += ball_vel * delta
	if ball_pos.x < BALL_RADIUS:
		ball_pos.x = BALL_RADIUS
		ball_vel.x = absf(ball_vel.x)
	elif ball_pos.x > FIELD_SIZE.x - BALL_RADIUS:
		ball_pos.x = FIELD_SIZE.x - BALL_RADIUS
		ball_vel.x = -absf(ball_vel.x)
	if ball_pos.y < 92.0 + BALL_RADIUS:
		ball_pos.y = 92.0 + BALL_RADIUS
		ball_vel.y = absf(ball_vel.y)
	var paddle_left := paddle_x - PADDLE_WIDTH * 0.5
	var paddle_right := paddle_x + PADDLE_WIDTH * 0.5
	if ball_vel.y > 0.0 and previous.y + BALL_RADIUS <= PADDLE_Y + 2.0 \
			and ball_pos.y + BALL_RADIUS >= PADDLE_Y \
			and ball_pos.x >= paddle_left - BALL_RADIUS and ball_pos.x <= paddle_right + BALL_RADIUS:
		ball_pos.y = PADDLE_Y - BALL_RADIUS
		var relative := clampf((ball_pos.x - paddle_x) / (PADDLE_WIDTH * 0.5), -1.0, 1.0)
		ball_vel.x = relative * 340.0
		ball_vel.y = -maxf(250.0, absf(ball_vel.y))
	_hit_brick_if_any()
	if ball_pos.y - BALL_RADIUS > FIELD_SIZE.y:
		_lose_life()
	_render()


func _hit_brick_if_any() -> void:
	for index in bricks.size():
		var brick: Rect2 = bricks[index]
		if brick.grow(BALL_RADIUS).has_point(ball_pos):
			bricks.remove_at(index)
			score += 100 + layers * 25
			ball_vel.y *= -1.0
			score_changed.emit({"primary": score, "secondary": {"layers": layers}})
			if bricks.is_empty():
				layers += 1
				_build_layer()
				_reset_ball()
			break


func _lose_life() -> void:
	lives -= 1
	if lives <= 0:
		finish_match({"primary": score, "secondary": {"layers": layers},
			"outcome": "complete", "ranked": true})
		return
	_reset_ball()


func _reset_ball() -> void:
	ball_attached = true
	ball_pos = Vector2(paddle_x, PADDLE_Y - BALL_RADIUS - 4.0)
	ball_vel = Vector2(190, -360)


func _build_layer() -> void:
	bricks.clear()
	var columns := 6
	var rows := 6
	var gap := 8.0
	var width := (FIELD_SIZE.x - 52.0 - gap * float(columns - 1)) / float(columns)
	for y in rows:
		for x in columns:
			# The seeded omissions cut firing lanes but never remove a whole layer.
			if y > 1 and _rng.randf() < minf(0.18, float(layers) * 0.025):
				continue
			bricks.append(Rect2(26.0 + x * (width + gap), 170.0 + y * 46.0, width, 32.0))


func set_bricks_for_test(new_bricks: Array) -> void:
	bricks = new_bricks.duplicate()
	finished = false
	active = true
	_render()


func debug_force_finish() -> bool:
	if finished or not active:
		return false
	return finish_match({"primary": score, "secondary": {"layers": layers},
		"outcome": "complete", "ranked": true})


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["ball_pos"] = ball_pos
	state["ball_vel"] = ball_vel
	state["ball_attached"] = ball_attached
	state["paddle_x"] = paddle_x
	state["bricks"] = bricks.duplicate()
	state["score"] = score
	state["layers"] = layers
	state["lives"] = lives
	state["rng_state"] = _rng.state
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	ball_pos = state.get("ball_pos", ball_pos)
	ball_vel = state.get("ball_vel", ball_vel)
	ball_attached = bool(state.get("ball_attached", ball_attached))
	paddle_x = float(state.get("paddle_x", paddle_x))
	bricks = (state.get("bricks", bricks) as Array).duplicate()
	score = int(state.get("score", score))
	layers = int(state.get("layers", layers))
	lives = int(state.get("lives", lives))
	_rng.state = int(state.get("rng_state", _rng.state))
	_render()


func _screen_transform() -> Transform2D:
	var scale_factor := minf(size.x / FIELD_SIZE.x, size.y / FIELD_SIZE.y)
	var offset := (size - FIELD_SIZE * scale_factor) * 0.5
	return Transform2D(0.0, Vector2(scale_factor, scale_factor), 0.0, offset)


func _render() -> void:
	if _status != null:
		_status.text = "SCORE %06d   //   DEPTH %02d   //   SLUGS %d" % [score, layers, lives]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	var transform := _screen_transform()
	draw_set_transform_matrix(transform)
	draw_rect(Rect2(18, 105, FIELD_SIZE.x - 36, FIELD_SIZE.y - 150), Draw.CARD)
	for index in bricks.size():
		var brick: Rect2 = bricks[index]
		var color := Draw.RUST.lerp(Draw.AMBER, float((index + layers) % 5) / 8.0)
		draw_rect(brick, color)
		draw_rect(brick.grow(-3.0), Draw.INK.lightened(0.12), false, 2.0)
	var paddle := Rect2(paddle_x - PADDLE_WIDTH * 0.5, PADDLE_Y,
		PADDLE_WIDTH, PADDLE_HEIGHT)
	draw_rect(paddle, Draw.AMBER)
	draw_rect(paddle.grow(-3.0), Draw.BONE, false, 2.0)
	draw_circle(ball_pos, BALL_RADIUS, Draw.BONE)
	draw_circle(ball_pos, BALL_RADIUS * 0.45, Draw.RUST)
	draw_set_transform_matrix(Transform2D.IDENTITY)
