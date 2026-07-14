## FALL LINE — deterministic portrait lander with real momentum, limited fuel,
## wind, strict pad/velocity/angle thresholds, and original relay-craft art.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/handheld/handheld_draw.gd")
const FIELD_SIZE := Vector2(540, 960)
const GROUND_Y := 880.0
const CRAFT_RADIUS := 13.0
const GRAVITY := 58.0
const THRUST_ACCEL := 118.0
const FUEL_BURN := 17.0
const ROTATE_SPEED := 1.65
const PAD_WIDTH := 150.0

var craft_pos := Vector2(270, 180)
var velocity := Vector2.ZERO
var angle := 0.0
var fuel := 100.0
var pad_center := 270.0
var wind := 0.0
var elapsed_ticks := 0
var game_status := "descending"
var thrust_visible := false
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "FALL LINE", "RELAY CRAFT RECOVERY // KILL DRIFT BEFORE DESCENT")
	_status = Draw.label("", 15, Draw.DIM, HORIZONTAL_ALIGNMENT_CENTER)
	_status.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE, Control.PRESET_MODE_MINSIZE, 12)
	add_child(_status)
	_render()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	var pads: Array[float] = [150.0, 270.0, 390.0]
	pad_center = pads[_rng.randi_range(0, pads.size() - 1)]
	wind = _rng.randf_range(-4.5, 4.5)
	craft_pos = Vector2(270, 180)
	velocity = Vector2(_rng.randf_range(-8.0, 8.0), 0.0)
	angle = 0.0
	fuel = 100.0
	elapsed_ticks = 0
	game_status = "descending"
	thrust_visible = false
	_render()


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished or snapshots.is_empty():
		return
	tick = maxi(tick, new_tick)
	var held: Dictionary = (snapshots[0] as Dictionary).get("held", {})
	var rotation_axis := float(bool(held.get("move_right", false))) - float(bool(held.get("move_left", false)))
	var thrusting := bool(held.get("thrust", false)) or bool(held.get("primary", false)) \
		or bool(held.get("move_up", false))
	physics_step(1.0 / 30.0, thrusting, rotation_axis)


func physics_step(delta: float, thrusting: bool, rotation_axis: float) -> void:
	if not active or paused or finished:
		return
	angle = wrapf(angle + rotation_axis * ROTATE_SPEED * delta, -PI, PI)
	velocity.x += wind * delta
	velocity.y += GRAVITY * delta
	thrust_visible = thrusting and fuel > 0.0
	if thrust_visible:
		var thrust_vector := Vector2(sin(angle), -cos(angle)) * THRUST_ACCEL
		velocity += thrust_vector * delta
		fuel = maxf(0.0, fuel - FUEL_BURN * delta)
	craft_pos += velocity * delta
	if craft_pos.x < CRAFT_RADIUS:
		craft_pos.x = CRAFT_RADIUS
		velocity.x = absf(velocity.x) * 0.45
	elif craft_pos.x > FIELD_SIZE.x - CRAFT_RADIUS:
		craft_pos.x = FIELD_SIZE.x - CRAFT_RADIUS
		velocity.x = -absf(velocity.x) * 0.45
	elapsed_ticks += maxi(1, int(round(delta * 30.0)))
	if craft_pos.y + CRAFT_RADIUS >= GROUND_Y:
		_touch_down()
	else:
		score_changed.emit({"primary": _live_rating(), "secondary": {"fuel": int(round(fuel))}})
	_render()


func _touch_down() -> void:
	craft_pos.y = GROUND_Y - CRAFT_RADIUS
	var on_pad := absf(craft_pos.x - pad_center) <= PAD_WIDTH * 0.5 - CRAFT_RADIUS
	var safe := on_pad and velocity.y <= 46.0 and absf(velocity.x) <= 22.0 and absf(angle) <= 0.22
	if safe:
		game_status = "landed"
		finish_match({"primary": _landing_rating(), "secondary": {"fuel": int(round(fuel))},
			"outcome": "complete", "ranked": true})
	else:
		game_status = "crashed"
		finish_match({"primary": 0, "secondary": {"fuel": int(round(fuel))},
			"outcome": "complete", "ranked": true})


func _live_rating() -> int:
	return maxi(0, int(1000.0 - velocity.length() * 7.0 - absf(angle) * 260.0))


func _landing_rating() -> int:
	return maxi(1, int(1200.0 - velocity.y * 9.0 - absf(velocity.x) * 8.0
		- absf(angle) * 500.0 + fuel * 2.0))


func debug_force_finish() -> bool:
	if finished or not active:
		return false
	game_status = "catalog_complete"
	return finish_match({"primary": maxi(1, _live_rating()),
		"secondary": {"fuel": int(round(fuel))}, "outcome": "complete", "ranked": true})


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["craft_pos"] = craft_pos
	state["velocity"] = velocity
	state["angle"] = angle
	state["fuel"] = fuel
	state["pad_center"] = pad_center
	state["wind"] = wind
	state["elapsed_ticks"] = elapsed_ticks
	state["game_status"] = game_status
	state["thrust_visible"] = thrust_visible
	state["rng_state"] = _rng.state
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	craft_pos = state.get("craft_pos", craft_pos)
	velocity = state.get("velocity", velocity)
	angle = float(state.get("angle", angle))
	fuel = float(state.get("fuel", fuel))
	pad_center = float(state.get("pad_center", pad_center))
	wind = float(state.get("wind", wind))
	elapsed_ticks = int(state.get("elapsed_ticks", elapsed_ticks))
	game_status = String(state.get("game_status", game_status))
	thrust_visible = bool(state.get("thrust_visible", thrust_visible))
	_rng.state = int(state.get("rng_state", _rng.state))
	_render()


func _screen_transform() -> Transform2D:
	var scale_factor := minf(size.x / FIELD_SIZE.x, size.y / FIELD_SIZE.y)
	return Transform2D(0.0, Vector2(scale_factor, scale_factor), 0.0,
		(size - FIELD_SIZE * scale_factor) * 0.5)


func _render() -> void:
	if _status != null:
		_status.text = "V %05.1f   //   DRIFT %+05.1f   //   FUEL %03d   //   WIND %+04.1f" % [
			velocity.y, velocity.x, int(round(fuel)), wind]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	draw_set_transform_matrix(_screen_transform())
	draw_rect(Rect2(18, 92, 504, GROUND_Y - 92), Color("171c21"))
	for index in 22:
		var star := Vector2(30 + (index * 97) % 480, 110 + (index * 53) % 610)
		draw_circle(star, 1.5 + float(index % 2), Draw.DIM)
	# Broken terrain and the live pad.
	var terrain := PackedVector2Array([Vector2(0, GROUND_Y), Vector2(70, 830),
		Vector2(145, 850), Vector2(220, 820), Vector2(330, 845), Vector2(430, 812),
		Vector2(540, 850), Vector2(540, 960), Vector2(0, 960)])
	draw_colored_polygon(terrain, Draw.CARD)
	draw_rect(Rect2(pad_center - PAD_WIDTH * 0.5, GROUND_Y - 7, PAD_WIDTH, 14), Draw.AMBER)
	draw_line(Vector2(pad_center, GROUND_Y - 30), Vector2(pad_center, GROUND_Y + 8), Draw.BONE, 2.0)
	# Craft in local coordinates, then rotated around its center.
	var local := Transform2D(angle, craft_pos)
	draw_set_transform_matrix(_screen_transform() * local)
	var hull := PackedVector2Array([Vector2(0, -18), Vector2(14, 12), Vector2(6, 9),
		Vector2(0, 15), Vector2(-6, 9), Vector2(-14, 12)])
	draw_colored_polygon(hull, Draw.BONE if game_status != "crashed" else Draw.RUST)
	draw_line(Vector2(-13, 12), Vector2(-20, 18), Draw.AMBER, 3.0)
	draw_line(Vector2(13, 12), Vector2(20, 18), Draw.AMBER, 3.0)
	if thrust_visible:
		draw_colored_polygon(PackedVector2Array([Vector2(-5, 14), Vector2(0, 34), Vector2(5, 14)]), Draw.RUST)
	draw_set_transform_matrix(Transform2D.IDENTITY)
