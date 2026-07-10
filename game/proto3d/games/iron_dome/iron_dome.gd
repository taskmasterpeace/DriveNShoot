## IRON DOME — deterministic portrait missile defense. Finite silos, armed
## interceptors, player-triggered chain blasts, and original settlement art.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/handheld/handheld_draw.gd")
const FIELD_SIZE := Vector2(540, 960)
const GROUND_Y := 880.0
const INTERCEPTOR_SPEED := 610.0
const BLAST_SPEED := 170.0
const BLAST_MAX := 88.0

var aim_point := Vector2(270, 400)
var missiles: Array = []
var interceptors: Array = []
var cities: Array = [true, true, true, true, true, true]
var ammo := 20
var score := 0
var wave := 1
var _chain := 0
var _clear_ticks := 0
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "IRON DOME", "SETTLEMENT BATTERY 6 // BURST AHEAD OF THE TRAIL")
	_status = Draw.label("", 15, Draw.DIM, HORIZONTAL_ALIGNMENT_CENTER)
	_status.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE, Control.PRESET_MODE_MINSIZE, 12)
	add_child(_status)
	_render()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	aim_point = Vector2(270, 400)
	missiles.clear()
	interceptors.clear()
	cities = [true, true, true, true, true, true]
	ammo = 20
	score = 0
	wave = 1
	_chain = 0
	_clear_ticks = 0
	_build_wave()
	_render()


func _build_wave() -> void:
	missiles.clear()
	var alive_indices: Array[int] = []
	for index in cities.size():
		if bool(cities[index]):
			alive_indices.append(index)
	if alive_indices.is_empty():
		return
	for index in 5 + wave * 2:
		var target_city := alive_indices[_rng.randi_range(0, alive_indices.size() - 1)]
		var start := Vector2(_rng.randf_range(30.0, 510.0), 90.0 - float(index % 3) * 26.0)
		var target := Vector2(city_x(target_city), GROUND_Y)
		var speed := 38.0 + float(wave) * 5.0 + _rng.randf_range(-4.0, 6.0)
		missiles.append({"pos": start, "vel": start.direction_to(target) * speed,
			"target_city": target_city, "alive": true})
	ammo = 20
	_clear_ticks = 0


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished or snapshots.is_empty():
		return
	tick = maxi(tick, new_tick)
	var snapshot_row: Dictionary = snapshots[0]
	var pointer: Vector2 = snapshot_row.get("cursor", Vector2.ZERO)
	if pointer != Vector2.ZERO:
		var field_point := screen_to_field(pointer)
		if field_point.x >= 0.0:
			aim_point = field_point
	var aim: Vector2 = snapshot_row.get("aim", Vector2.ZERO)
	if aim.length_squared() > 0.01:
		aim_point += aim.normalized() * 240.0 / 30.0
	aim_point.x = clampf(aim_point.x, 20.0, FIELD_SIZE.x - 20.0)
	aim_point.y = clampf(aim_point.y, 110.0, GROUND_Y - 70.0)
	var pressed: Dictionary = snapshot_row.get("pressed", {})
	if bool(pressed.get("primary", false)) or bool(pressed.get("interact", false)):
		launch_interceptor(aim_point)
	if bool(pressed.get("secondary", false)):
		detonate_armed()
	update_fixed(1.0 / 30.0)


func launch_interceptor(target: Vector2) -> bool:
	if not active or paused or finished or ammo <= 0:
		return false
	ammo -= 1
	interceptors.append({"pos": Vector2(270, GROUND_Y - 6),
		"target": Vector2(clampf(target.x, 15.0, FIELD_SIZE.x - 15.0),
			clampf(target.y, 100.0, GROUND_Y - 40.0)),
		"armed": false, "exploding": false, "radius": 0.0})
	_render()
	return true


func detonate_armed() -> int:
	var count := 0
	for interceptor_value in interceptors:
		var interceptor: Dictionary = interceptor_value
		if bool(interceptor.get("armed", false)) and not bool(interceptor.get("exploding", false)):
			interceptor["exploding"] = true
			_chain = 0
			count += 1
	return count


func update_fixed(delta: float) -> void:
	if not active or paused or finished:
		return
	for missile_value in missiles:
		var missile: Dictionary = missile_value
		missile["pos"] = (missile.get("pos", Vector2.ZERO) as Vector2) \
			+ (missile.get("vel", Vector2.ZERO) as Vector2) * delta
	var remove_interceptors: Array[int] = []
	for index in interceptors.size():
		var interceptor: Dictionary = interceptors[index]
		var pos: Vector2 = interceptor.get("pos", Vector2.ZERO)
		var target: Vector2 = interceptor.get("target", pos)
		if bool(interceptor.get("exploding", false)):
			interceptor["radius"] = float(interceptor.get("radius", 0.0)) + BLAST_SPEED * delta
			_kill_missiles_in_blast(pos, float(interceptor["radius"]))
			if float(interceptor["radius"]) >= BLAST_MAX:
				remove_interceptors.push_front(index)
		elif not bool(interceptor.get("armed", false)):
			var travel := INTERCEPTOR_SPEED * delta
			if pos.distance_to(target) <= travel:
				interceptor["pos"] = target
				interceptor["armed"] = true
			else:
				interceptor["pos"] = pos + pos.direction_to(target) * travel
	for index in remove_interceptors:
		interceptors.remove_at(index)
	var survivors: Array = []
	for missile_value in missiles:
		var missile: Dictionary = missile_value
		var pos: Vector2 = missile.get("pos", Vector2.ZERO)
		if pos.y >= GROUND_Y:
			var target_city := int(missile.get("target_city", -1))
			if target_city >= 0 and target_city < cities.size():
				cities[target_city] = false
		else:
			survivors.append(missile)
	missiles = survivors
	if cities.all(func(alive: Variant) -> bool: return not bool(alive)):
		_finish_defense()
		return
	if missiles.is_empty() and interceptors.is_empty():
		_clear_ticks += maxi(1, int(round(delta * 30.0)))
		if _clear_ticks >= 60:
			wave += 1
			_build_wave()
	else:
		_clear_ticks = 0
	score_changed.emit({"primary": score, "secondary": {"cities_saved": _cities_saved()}})
	_render()


func _kill_missiles_in_blast(center: Vector2, radius: float) -> void:
	var survivors: Array = []
	for missile_value in missiles:
		var missile: Dictionary = missile_value
		var pos: Vector2 = missile.get("pos", Vector2.ZERO)
		if pos.distance_to(center) <= radius:
			_chain += 1
			score += 100 * _chain
		else:
			survivors.append(missile)
	missiles = survivors


func _cities_saved() -> int:
	return cities.reduce(func(total: int, alive: Variant) -> int:
		return total + (1 if bool(alive) else 0), 0)


func city_x(index: int) -> float:
	return 52.0 + float(index) * 87.0


func _finish_defense() -> bool:
	return finish_match({"primary": score, "secondary": {"cities_saved": _cities_saved()},
		"outcome": "complete", "ranked": true})


func debug_force_finish() -> bool:
	if finished or not active:
		return false
	return _finish_defense()


func _screen_transform() -> Transform2D:
	var scale_factor := minf(size.x / FIELD_SIZE.x, size.y / FIELD_SIZE.y)
	return Transform2D(0.0, Vector2(scale_factor, scale_factor), 0.0,
		(size - FIELD_SIZE * scale_factor) * 0.5)


func field_to_screen(point: Vector2) -> Vector2:
	return _screen_transform() * point


func screen_to_field(point: Vector2) -> Vector2:
	var transform := _screen_transform()
	if is_zero_approx(transform.determinant()):
		return Vector2(-1, -1)
	return transform.affine_inverse() * point


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["aim_point"] = aim_point
	state["missiles"] = missiles.duplicate(true)
	state["interceptors"] = interceptors.duplicate(true)
	state["cities"] = cities.duplicate()
	state["ammo"] = ammo
	state["score"] = score
	state["wave"] = wave
	state["chain"] = _chain
	state["clear_ticks"] = _clear_ticks
	state["rng_state"] = _rng.state
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	aim_point = state.get("aim_point", aim_point)
	missiles = (state.get("missiles", missiles) as Array).duplicate(true)
	interceptors = (state.get("interceptors", interceptors) as Array).duplicate(true)
	cities = (state.get("cities", cities) as Array).duplicate()
	ammo = int(state.get("ammo", ammo))
	score = int(state.get("score", score))
	wave = int(state.get("wave", wave))
	_chain = int(state.get("chain", _chain))
	_clear_ticks = int(state.get("clear_ticks", _clear_ticks))
	_rng.state = int(state.get("rng_state", _rng.state))
	_render()


func _render() -> void:
	if _status != null:
		_status.text = "SCORE %06d   //   SILO %02d   //   CITIES %d   //   WAVE %d" % [
			score, ammo, _cities_saved(), wave]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	draw_set_transform_matrix(_screen_transform())
	draw_rect(Rect2(20, 95, 500, GROUND_Y - 95), Color("20242a"))
	# Missile and interceptor trails.
	for missile_value in missiles:
		var missile: Dictionary = missile_value
		var pos: Vector2 = missile.get("pos", Vector2.ZERO)
		var vel: Vector2 = missile.get("vel", Vector2.ZERO)
		draw_line(pos - vel.normalized() * 32.0, pos, Draw.RUST, 3.0)
		draw_circle(pos, 4.0, Draw.BONE)
	for interceptor_value in interceptors:
		var interceptor: Dictionary = interceptor_value
		var pos: Vector2 = interceptor.get("pos", Vector2.ZERO)
		if bool(interceptor.get("exploding", false)):
			draw_circle(pos, float(interceptor.get("radius", 0.0)), Color(0.95, 0.72, 0.2, 0.18))
			draw_circle(pos, float(interceptor.get("radius", 0.0)), Draw.AMBER, false, 3.0)
		else:
			draw_line(Vector2(270, GROUND_Y), pos, Draw.SIGNAL, 2.0)
			draw_circle(pos, 4.0, Draw.AMBER)
	# Settlement skyline and surviving-city lamps.
	draw_rect(Rect2(18, GROUND_Y, 504, 24), Draw.CARD)
	for index in cities.size():
		var x := city_x(index)
		draw_rect(Rect2(x - 26, GROUND_Y - 34 - float(index % 2) * 16, 52, 34 + float(index % 2) * 16),
			Draw.DIM.darkened(0.25) if bool(cities[index]) else Draw.INK)
		draw_circle(Vector2(x, GROUND_Y - 12), 5.0, Draw.SIGNAL if bool(cities[index]) else Draw.RUST)
	draw_circle(aim_point, 13.0, Draw.AMBER, false, 2.0)
	draw_line(aim_point - Vector2(20, 0), aim_point + Vector2(20, 0), Draw.AMBER, 1.0)
	draw_line(aim_point - Vector2(0, 20), aim_point + Vector2(0, 20), Draw.AMBER, 1.0)
	draw_set_transform_matrix(Transform2D.IDENTITY)
