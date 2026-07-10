## TILT SALVAGE — deterministic portrait junkyard pinball. Original table art,
## independent flippers, real rebound math, lane jackpots, nudge and tilt.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/handheld/handheld_draw.gd")
const FIELD_SIZE := Vector2(540, 960)
const BALL_RADIUS := 8.0
const BUMPER_RADIUS := 32.0
const GRAVITY := 260.0
const BUMPERS: Array[Vector2] = [Vector2(160, 300), Vector2(380, 300), Vector2(270, 465)]
const LANE_RECTS: Array[Rect2] = [Rect2(92, 130, 72, 150), Rect2(234, 120, 72, 155), Rect2(376, 130, 72, 150)]

var ball_pos := Vector2(492, 820)
var ball_vel := Vector2.ZERO
var ball_active := false
var left_flipper := false
var right_flipper := false
var lanes: Array = [false, false, false]
var balls := 3
var score := 0
var jackpots := 0
var tilt_meter := 0.0
var tilted := false
var _tilt_ticks := 0
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "TILT SALVAGE", "MAGNETIC SORT TABLE // NUDGE COSTS TRUST")
	_status = Draw.label("", 15, Draw.DIM, HORIZONTAL_ALIGNMENT_CENTER)
	_status.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE, Control.PRESET_MODE_MINSIZE, 12)
	add_child(_status)
	_render()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	ball_pos = Vector2(492, 820)
	ball_vel = Vector2.ZERO
	ball_active = false
	left_flipper = false
	right_flipper = false
	lanes = [false, false, false]
	balls = 3
	score = 0
	jackpots = 0
	tilt_meter = 0.0
	tilted = false
	_tilt_ticks = 0
	_render()


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished or snapshots.is_empty():
		return
	tick = maxi(tick, new_tick)
	var snapshot_row: Dictionary = snapshots[0]
	var held: Dictionary = snapshot_row.get("held", {})
	if tilted:
		left_flipper = false
		right_flipper = false
	else:
		left_flipper = bool(held.get("flipper_left", false)) or bool(held.get("move_left", false))
		right_flipper = bool(held.get("flipper_right", false)) or bool(held.get("move_right", false))
	var pressed: Dictionary = snapshot_row.get("pressed", {})
	if not ball_active and (bool(pressed.get("primary", false)) or bool(pressed.get("interact", false))):
		launch_ball()
	if bool(pressed.get("secondary", false)):
		nudge()
	physics_step(1.0 / 30.0)


func launch_ball() -> bool:
	if ball_active or balls <= 0 or finished:
		return false
	ball_active = true
	ball_pos = Vector2(492, 820)
	ball_vel = Vector2(_rng.randf_range(-70.0, -25.0), -650.0)
	return true


func physics_step(delta: float) -> void:
	if not active or paused or finished:
		return
	if tilted:
		_tilt_ticks -= maxi(1, int(round(delta * 30.0)))
		if _tilt_ticks <= 0:
			tilted = false
			tilt_meter = 0.0
	else:
		tilt_meter = maxf(0.0, tilt_meter - delta * 0.35)
	if not ball_active:
		_render()
		return
	ball_vel.y += GRAVITY * delta
	ball_pos += ball_vel * delta
	if ball_pos.x < 28.0 + BALL_RADIUS:
		ball_pos.x = 28.0 + BALL_RADIUS
		ball_vel.x = absf(ball_vel.x) * 0.9
	elif ball_pos.x > FIELD_SIZE.x - 28.0 - BALL_RADIUS:
		ball_pos.x = FIELD_SIZE.x - 28.0 - BALL_RADIUS
		ball_vel.x = -absf(ball_vel.x) * 0.9
	if ball_pos.y < 102.0 + BALL_RADIUS:
		ball_pos.y = 102.0 + BALL_RADIUS
		ball_vel.y = absf(ball_vel.y) * 0.9
	_hit_bumpers()
	_hit_flippers()
	_check_lanes()
	if ball_pos.y - BALL_RADIUS > FIELD_SIZE.y:
		_drain()
	score_changed.emit({"primary": score, "secondary": {"jackpots": jackpots}})
	_render()


func _hit_bumpers() -> void:
	for center in BUMPERS:
		var delta := ball_pos - center
		var limit := BUMPER_RADIUS + BALL_RADIUS
		if delta.length_squared() < limit * limit:
			var normal := delta.normalized() if delta.length_squared() > 0.001 else Vector2.UP
			ball_pos = center + normal * limit
			ball_vel = ball_vel.bounce(normal) + normal * 220.0
			score += 100


func _left_segment() -> Array[Vector2]:
	return [Vector2(128, 812), Vector2(232, 780 if left_flipper else 830)]


func _right_segment() -> Array[Vector2]:
	return [Vector2(412, 812), Vector2(308, 780 if right_flipper else 830)]


func _hit_flippers() -> void:
	if tilted or ball_vel.y < 0.0:
		return
	if left_flipper and _point_segment_distance(ball_pos, _left_segment()[0], _left_segment()[1]) <= BALL_RADIUS + 10.0:
		ball_vel = Vector2(-130.0, -470.0)
		ball_pos.y -= 8.0
	elif right_flipper and _point_segment_distance(ball_pos, _right_segment()[0], _right_segment()[1]) <= BALL_RADIUS + 10.0:
		ball_vel = Vector2(130.0, -470.0)
		ball_pos.y -= 8.0


func _point_segment_distance(point: Vector2, start: Vector2, finish: Vector2) -> float:
	var segment := finish - start
	var length_squared := segment.length_squared()
	if length_squared <= 0.001:
		return point.distance_to(start)
	var amount := clampf((point - start).dot(segment) / length_squared, 0.0, 1.0)
	return point.distance_to(start + segment * amount)


func _check_lanes() -> void:
	for index in LANE_RECTS.size():
		if LANE_RECTS[index].has_point(ball_pos):
			activate_lane(index)


func activate_lane(index: int) -> bool:
	if index < 0 or index >= lanes.size() or bool(lanes[index]):
		return false
	lanes[index] = true
	score += 250
	if lanes.all(func(lit: Variant) -> bool: return bool(lit)):
		jackpots += 1
		score += 1000
		lanes = [false, false, false]
	return true


func nudge() -> void:
	if tilted:
		return
	tilt_meter += 1.0
	if ball_active:
		ball_vel.x += _rng.randf_range(-55.0, 55.0)
	if tilt_meter >= 3.0:
		tilted = true
		_tilt_ticks = 90
		left_flipper = false
		right_flipper = false


func _drain() -> void:
	balls -= 1
	ball_active = false
	ball_pos = Vector2(492, 820)
	ball_vel = Vector2.ZERO
	if balls <= 0:
		finish_match({"primary": score, "secondary": {"jackpots": jackpots},
			"outcome": "complete", "ranked": true})


func debug_force_finish() -> bool:
	if finished or not active:
		return false
	return finish_match({"primary": score, "secondary": {"jackpots": jackpots},
		"outcome": "complete", "ranked": true})


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["ball_pos"] = ball_pos
	state["ball_vel"] = ball_vel
	state["ball_active"] = ball_active
	state["left_flipper"] = left_flipper
	state["right_flipper"] = right_flipper
	state["lanes"] = lanes.duplicate()
	state["balls"] = balls
	state["score"] = score
	state["jackpots"] = jackpots
	state["tilt_meter"] = tilt_meter
	state["tilted"] = tilted
	state["tilt_ticks"] = _tilt_ticks
	state["rng_state"] = _rng.state
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	ball_pos = state.get("ball_pos", ball_pos)
	ball_vel = state.get("ball_vel", ball_vel)
	ball_active = bool(state.get("ball_active", ball_active))
	left_flipper = bool(state.get("left_flipper", left_flipper))
	right_flipper = bool(state.get("right_flipper", right_flipper))
	lanes = (state.get("lanes", lanes) as Array).duplicate()
	balls = int(state.get("balls", balls))
	score = int(state.get("score", score))
	jackpots = int(state.get("jackpots", jackpots))
	tilt_meter = float(state.get("tilt_meter", tilt_meter))
	tilted = bool(state.get("tilted", tilted))
	_tilt_ticks = int(state.get("tilt_ticks", _tilt_ticks))
	_rng.state = int(state.get("rng_state", _rng.state))
	_render()


func _screen_transform() -> Transform2D:
	var scale_factor := minf(size.x / FIELD_SIZE.x, size.y / FIELD_SIZE.y)
	return Transform2D(0.0, Vector2(scale_factor, scale_factor), 0.0,
		(size - FIELD_SIZE * scale_factor) * 0.5)


func _render() -> void:
	if _status != null:
		_status.text = "SCORE %07d   //   BALLS %d   //   JACKPOT %02d%s" % [
			score, balls, jackpots, "   //   TILT" if tilted else ""]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	draw_set_transform_matrix(_screen_transform())
	draw_rect(Rect2(28, 102, 484, 858), Draw.CARD)
	# Scrap rails and lanes.
	draw_line(Vector2(28, 102), Vector2(28, 930), Draw.DIM, 7.0)
	draw_line(Vector2(512, 102), Vector2(512, 930), Draw.DIM, 7.0)
	for index in LANE_RECTS.size():
		draw_rect(LANE_RECTS[index], Draw.AMBER if bool(lanes[index]) else Draw.DIM, false, 4.0)
	for center in BUMPERS:
		draw_circle(center, BUMPER_RADIUS, Draw.RUST)
		draw_circle(center, BUMPER_RADIUS * 0.55, Draw.INK)
		draw_circle(center, BUMPER_RADIUS * 0.28, Draw.AMBER)
	var left := _left_segment()
	var right := _right_segment()
	draw_line(left[0], left[1], Draw.AMBER if left_flipper else Draw.BONE, 18.0, true)
	draw_line(right[0], right[1], Draw.AMBER if right_flipper else Draw.BONE, 18.0, true)
	if ball_active:
		draw_circle(ball_pos, BALL_RADIUS, Draw.BONE)
		draw_circle(ball_pos, BALL_RADIUS * 0.4, Draw.RUST)
	else:
		draw_circle(Vector2(492, 820), BALL_RADIUS, Draw.DIM)
	draw_set_transform_matrix(Transform2D.IDENTITY)
