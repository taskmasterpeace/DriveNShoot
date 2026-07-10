## LAST MILE — deterministic 16:9 courier time trial with original pseudo-3D
## highway presentation, seeded traffic, ordered markers, and a racing-line ghost.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/handheld/handheld_draw.gd")
const FIELD_SIZE := Vector2(1280, 720)
const COURSE_LENGTH := 5000.0
const MAX_SPEED := 185.0

var lane_x := 0.0
var speed := 0.0
var distance := 0.0
var elapsed_ticks := 0
var penalty_ms := 0
var contacts := 0
var checkpoints: Array[float] = [1000.0, 2500.0, 4000.0]
var checkpoint_index := 0
var traffic: Array = []
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "LAST MILE", "PRE-COLLAPSE COURIER APTITUDE // ROUTE 09")
	_status = Draw.label("", 16, Draw.DIM, HORIZONTAL_ALIGNMENT_CENTER)
	_status.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE, Control.PRESET_MODE_MINSIZE, 12)
	add_child(_status)
	_render()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	lane_x = 0.0
	speed = 0.0
	distance = 0.0
	elapsed_ticks = 0
	penalty_ms = 0
	contacts = 0
	checkpoint_index = 0
	_build_traffic()
	_render()


func _build_traffic() -> void:
	traffic.clear()
	var lanes: Array[float] = [-0.65, 0.0, 0.65]
	for index in 14:
		traffic.append({
			"lane": lanes[_rng.randi_range(0, lanes.size() - 1)],
			"distance": 280.0 + float(index) * 315.0 + _rng.randf_range(-65.0, 65.0),
			"speed": _rng.randf_range(38.0, 82.0),
			"hit": false,
			"kind": index % 3,
		})


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished or snapshots.is_empty():
		return
	tick = maxi(tick, new_tick)
	var held: Dictionary = (snapshots[0] as Dictionary).get("held", {})
	var throttle := bool(held.get("throttle", false)) or bool(held.get("move_up", false))
	var brake := bool(held.get("brake", false)) or bool(held.get("move_down", false))
	var steer := float(bool(held.get("move_right", false))) - float(bool(held.get("move_left", false)))
	var delta := 1.0 / 30.0
	if throttle:
		speed += 92.0 * delta
	if brake:
		speed -= 150.0 * delta
	speed = clampf(speed - 10.0 * delta, 0.0, MAX_SPEED)
	lane_x = clampf(lane_x + steer * 1.55 * delta, -1.0, 1.0)
	update_fixed(delta)


func update_fixed(delta: float) -> void:
	if not active or paused or finished:
		return
	var previous_distance := distance
	distance += speed * delta
	elapsed_ticks += maxi(1, int(round(delta * 30.0)))
	for traffic_value in traffic:
		var car: Dictionary = traffic_value
		car["distance"] = float(car.get("distance", 0.0)) + float(car.get("speed", 0.0)) * delta
		if not bool(car.get("hit", false)) \
				and absf(float(car["distance"]) - distance) < 9.0 \
				and absf(float(car.get("lane", 0.0)) - lane_x) < 0.24:
			car["hit"] = true
			contacts += 1
			penalty_ms += 2500
			speed *= 0.42
	if checkpoint_index < checkpoints.size():
		var target := checkpoints[checkpoint_index]
		if previous_distance <= target and distance >= target:
			checkpoint_index += 1
	if distance >= COURSE_LENGTH and checkpoint_index >= checkpoints.size():
		_finish_course()
	else:
		score_changed.emit({"primary": _course_ms(),
			"secondary": {"clean_laps": 1 if contacts == 0 else 0}})
	_render()


func ghost_lane_at(route_distance: float) -> float:
	return clampf(sin(route_distance * 0.0031) * 0.48 + sin(route_distance * 0.00083) * 0.22,
		-0.85, 0.85)


func _course_ms() -> int:
	return int(round(float(elapsed_ticks) / 30.0 * 1000.0)) + penalty_ms


func _finish_course() -> bool:
	distance = maxf(distance, COURSE_LENGTH)
	return finish_match({"primary": _course_ms(),
		"secondary": {"clean_laps": 1 if contacts == 0 else 0, "contacts": contacts},
		"outcome": "complete", "ranked": true})


func debug_force_finish() -> bool:
	if finished or not active:
		return false
	checkpoint_index = checkpoints.size()
	distance = COURSE_LENGTH
	return _finish_course()


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["lane_x"] = lane_x
	state["speed"] = speed
	state["distance"] = distance
	state["elapsed_ticks"] = elapsed_ticks
	state["penalty_ms"] = penalty_ms
	state["contacts"] = contacts
	state["checkpoint_index"] = checkpoint_index
	state["traffic"] = traffic.duplicate(true)
	state["rng_state"] = _rng.state
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	lane_x = float(state.get("lane_x", lane_x))
	speed = float(state.get("speed", speed))
	distance = float(state.get("distance", distance))
	elapsed_ticks = int(state.get("elapsed_ticks", elapsed_ticks))
	penalty_ms = int(state.get("penalty_ms", penalty_ms))
	contacts = int(state.get("contacts", contacts))
	checkpoint_index = int(state.get("checkpoint_index", checkpoint_index))
	traffic = (state.get("traffic", traffic) as Array).duplicate(true)
	_rng.state = int(state.get("rng_state", _rng.state))
	_render()


func _render() -> void:
	if _status != null:
		_status.text = "%03d KM/H   //   MARKER %d/%d   //   %06d ms%s" % [
			int(speed), checkpoint_index, checkpoints.size(), _course_ms(),
			" +CONTACT" if penalty_ms > 0 else ""]
	queue_redraw()


func _screen_transform() -> Transform2D:
	var scale_factor := minf(size.x / FIELD_SIZE.x, size.y / FIELD_SIZE.y)
	return Transform2D(0.0, Vector2(scale_factor, scale_factor), 0.0,
		(size - FIELD_SIZE * scale_factor) * 0.5)


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	draw_set_transform_matrix(_screen_transform())
	# Dusk and horizon.
	draw_rect(Rect2(0, 72, 1280, 390), Color("2b2a27"))
	draw_circle(Vector2(1020, 158), 72, Draw.RUST.darkened(0.2))
	for x in range(0, 1280, 80):
		draw_rect(Rect2(x, 350 - (x % 160) * 0.15, 54, 90 + (x % 5) * 12), Draw.INK.lightened(0.08))
	# Road trapezoid.
	var road := PackedVector2Array([Vector2(440, 380), Vector2(840, 380), Vector2(1180, 720), Vector2(100, 720)])
	draw_colored_polygon(road, Draw.CARD)
	for lane_value in [-0.33, 0.33]:
		var lane: float = float(lane_value)
		var top_x: float = 640.0 + lane * 190.0
		var bottom_x: float = 640.0 + lane * 520.0
		draw_dashed_line(Vector2(top_x, 390), Vector2(bottom_x, 720), Draw.DIM, 6.0, 20.0)
	# Traffic ahead, projected by route separation.
	for traffic_value in traffic:
		var car: Dictionary = traffic_value
		var ahead := float(car.get("distance", 0.0)) - distance
		if ahead < 0.0 or ahead > 520.0:
			continue
		var depth := 1.0 - ahead / 520.0
		var y := lerpf(390.0, 665.0, depth)
		var half_road := lerpf(190.0, 510.0, depth)
		var x := 640.0 + float(car.get("lane", 0.0)) * half_road
		var car_size := lerpf(12.0, 54.0, depth)
		draw_rect(Rect2(x - car_size * 0.5, y - car_size, car_size, car_size * 1.4),
			Draw.RUST.darkened(0.25) if bool(car.get("hit", false)) else Draw.DIM)
	# Ghost and player courier.
	var ghost_x := 640.0 + ghost_lane_at(distance + 60.0) * 450.0
	draw_rect(Rect2(ghost_x - 18, 610, 36, 52), Color(0.5, 0.64, 0.42, 0.45), false, 3.0)
	var player_x := 640.0 + lane_x * 500.0
	draw_rect(Rect2(player_x - 34, 624, 68, 86), Draw.AMBER)
	draw_rect(Rect2(player_x - 22, 638, 44, 30), Draw.INK)
	draw_set_transform_matrix(Transform2D.IDENTITY)
