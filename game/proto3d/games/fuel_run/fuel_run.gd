## FUEL RUN - deterministic one-to-four-player jerry-can capture racing.
## Original refinery yard, buggies, pumps, spill marks, and can art.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/console/console_draw.gd")
const FIELD := Rect2(60, 115, 1160, 510)
const BASE_MAX_SPEED := 245.0
const ACCELERATION := 390.0
const STEER_SPEED := 2.8
const CARRIER_SPEED_FACTOR := 0.68
const MATCH_TICKS := 900
const CAPTURE_TARGET := 3
const STEP := 1.0 / 30.0

var cars: Array = []
var fuel_can: Dictionary = {}
var elapsed_ticks := 0
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "FUEL RUN", "REFINERY MORALE TRIAL // THIRTY SECONDS OF PANIC")
	_status = Draw.status(self)
	queue_redraw()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	cars.clear()
	elapsed_ticks = 0
	var count := clampi(maxi(2, new_seats.size()), 2, 4)
	var homes: Array[Vector2] = [Vector2(150, 190), Vector2(1130, 550),
		Vector2(1130, 190), Vector2(150, 550)]
	for index in count:
		var angle := (FIELD.get_center() - homes[index]).angle()
		cars.append({"id": index, "pos": homes[index], "home": homes[index],
			"vel": Vector2.ZERO, "angle": angle, "ai": index >= new_seats.size(),
			"captures": 0, "lap_ms": 0, "last_capture_tick": 0,
			"wins": 0})
	fuel_can = {"pos": FIELD.get_center(), "carrier": -1}
	_render()


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished:
		return
	tick = maxi(tick, new_tick)
	for index in cars.size():
		var car: Dictionary = cars[index]
		var input: Dictionary = _ai_snapshot(index) if bool(car.get("ai", false)) \
			else _snapshot_for_car(index, snapshots)
		_drive_car(index, input)
	update_fixed(STEP)
	_render()


func _drive_car(index: int, input: Dictionary) -> void:
	if input.is_empty():
		return
	var car: Dictionary = cars[index]
	var move: Vector2 = input.get("move", Vector2.ZERO)
	var speed := Vector2(car["vel"]).length()
	var steer_scale := clampf(speed / 70.0, 0.25, 1.0)
	car["angle"] = wrapf(float(car["angle"]) + move.x * STEER_SPEED * steer_scale * STEP, -PI, PI)
	var forward := Vector2.from_angle(float(car["angle"]))
	if move.y < -0.05:
		car["vel"] = Vector2(car["vel"]) + forward * ACCELERATION * (-move.y) * STEP
	elif move.y > 0.05:
		car["vel"] = Vector2(car["vel"]) * maxf(0.45, 1.0 - move.y * 0.32)
	var max_speed := current_max_speed(index)
	if Vector2(car["vel"]).length() > max_speed:
		car["vel"] = Vector2(car["vel"]).normalized() * max_speed
	cars[index] = car
	var pressed: Dictionary = input.get("pressed", {})
	if bool(pressed.get("primary", false)):
		var carrier := int(fuel_can.get("carrier", -1))
		if carrier >= 0 and carrier != index:
			try_steal(index, carrier)
		else:
			try_pickup_can(index)
	if bool(pressed.get("secondary", false)):
		if int(fuel_can.get("carrier", -1)) == index:
			drop_can(index)
		else:
			car = cars[index]
			car["vel"] = Vector2(car["vel"]) * 0.55
			cars[index] = car


func update_fixed(delta: float) -> void:
	if finished:
		return
	elapsed_ticks += 1
	for index in cars.size():
		var car: Dictionary = cars[index]
		car["pos"] = Vector2(car["pos"]) + Vector2(car["vel"]) * delta
		car["vel"] = Vector2(car["vel"]) * 0.985
		var pos: Vector2 = car["pos"]
		if pos.x < FIELD.position.x + 18.0 or pos.x > FIELD.end.x - 18.0:
			pos.x = clampf(pos.x, FIELD.position.x + 18.0, FIELD.end.x - 18.0)
			car["vel"] = Vector2(-Vector2(car["vel"]).x * 0.55, Vector2(car["vel"]).y)
		if pos.y < FIELD.position.y + 18.0 or pos.y > FIELD.end.y - 18.0:
			pos.y = clampf(pos.y, FIELD.position.y + 18.0, FIELD.end.y - 18.0)
			car["vel"] = Vector2(Vector2(car["vel"]).x, -Vector2(car["vel"]).y * 0.55)
		car["pos"] = pos
		cars[index] = car
	var carrier := int(fuel_can.get("carrier", -1))
	if carrier >= 0 and carrier < cars.size():
		fuel_can["pos"] = Vector2((cars[carrier] as Dictionary)["pos"])
		try_capture(carrier)
	else:
		for index in cars.size():
			if try_pickup_can(index):
				break
	if elapsed_ticks >= MATCH_TICKS:
		_complete_clock()


func current_max_speed(index: int) -> float:
	return BASE_MAX_SPEED * CARRIER_SPEED_FACTOR if int(fuel_can.get("carrier", -1)) == index \
		else BASE_MAX_SPEED


func try_pickup_can(index: int) -> bool:
	if finished or index < 0 or index >= cars.size() or int(fuel_can.get("carrier", -1)) >= 0:
		return false
	if Vector2((cars[index] as Dictionary)["pos"]).distance_to(Vector2(fuel_can["pos"])) > 34.0:
		return false
	fuel_can["carrier"] = index
	fuel_can["pos"] = Vector2((cars[index] as Dictionary)["pos"])
	return true


func try_capture(index: int) -> bool:
	if finished or index < 0 or index >= cars.size() or int(fuel_can.get("carrier", -1)) != index:
		return false
	var car: Dictionary = cars[index]
	if Vector2(car["pos"]).distance_to(Vector2(car["home"])) > 58.0:
		return false
	car["captures"] = int(car.get("captures", 0)) + 1
	car["lap_ms"] = maxi(1, (elapsed_ticks - int(car.get("last_capture_tick", 0))) * 33)
	car["last_capture_tick"] = elapsed_ticks
	cars[index] = car
	fuel_can = {"pos": FIELD.get_center(), "carrier": -1}
	if int(car["captures"]) >= CAPTURE_TARGET:
		_complete_match(index)
	return true


func try_steal(thief: int, victim: int) -> bool:
	if finished or thief < 0 or victim < 0 or thief >= cars.size() or victim >= cars.size() \
			or thief == victim or int(fuel_can.get("carrier", -1)) != victim:
		return false
	if Vector2((cars[thief] as Dictionary)["pos"]).distance_to(Vector2((cars[victim] as Dictionary)["pos"])) > 46.0:
		return false
	fuel_can["carrier"] = thief
	fuel_can["pos"] = Vector2((cars[thief] as Dictionary)["pos"])
	return true


func drop_can(index: int) -> bool:
	if int(fuel_can.get("carrier", -1)) != index or index < 0 or index >= cars.size():
		return false
	fuel_can["carrier"] = -1
	fuel_can["pos"] = Vector2((cars[index] as Dictionary)["pos"])
	return true


func _complete_clock() -> void:
	if finished or cars.is_empty():
		return
	var winner := 0
	for index in range(1, cars.size()):
		var score := int((cars[index] as Dictionary).get("captures", 0))
		var best := int((cars[winner] as Dictionary).get("captures", 0))
		var lap := int((cars[index] as Dictionary).get("lap_ms", 0))
		var best_lap := int((cars[winner] as Dictionary).get("lap_ms", 0))
		if score > best or (score == best and lap > 0 and (best_lap == 0 or lap < best_lap)):
			winner = index
	_complete_match(winner)


func _complete_match(winner: int) -> void:
	if finished or winner < 0 or winner >= cars.size():
		return
	var car: Dictionary = cars[winner]
	car["wins"] = int(car.get("wins", 0)) + 1
	cars[winner] = car
	finish_match({"primary": int(car.get("captures", 0)),
		"secondary": {"winner": winner, "lap_ms": int(car.get("lap_ms", 0))},
		"outcome": "complete", "ranked": true})


func _ai_snapshot(index: int) -> Dictionary:
	var car: Dictionary = cars[index]
	var carrier := int(fuel_can.get("carrier", -1))
	var target: Vector2
	if carrier == index:
		target = car["home"]
	elif carrier >= 0 and carrier < cars.size():
		target = (cars[carrier] as Dictionary)["pos"]
	else:
		target = fuel_can["pos"]
	var delta := target - Vector2(car["pos"])
	var turn := clampf(wrapf(delta.angle() - float(car["angle"]), -PI, PI) * 1.6, -1.0, 1.0)
	var pressed: Dictionary = {}
	if carrier >= 0 and carrier != index and delta.length() < 46.0:
		pressed["primary"] = true
	return {"seat": index, "move": Vector2(turn, -1), "aim": Vector2.ZERO,
		"held": {}, "pressed": pressed, "released": {}}


func _snapshot_for_car(index: int, snapshots: Array) -> Dictionary:
	if index >= seats.size():
		return {}
	var wanted := int((seats[index] as Dictionary).get("seat", index))
	for value in snapshots:
		var input: Dictionary = value
		if int(input.get("seat", -1)) == wanted:
			return input
	return {}


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["cars"] = cars.duplicate(true)
	state["fuel_can"] = fuel_can.duplicate(true)
	state["elapsed_ticks"] = elapsed_ticks
	state["rng_state"] = _rng.state
	state["last_result"] = last_result.duplicate(true)
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	cars = (state.get("cars", cars) as Array).duplicate(true)
	fuel_can = (state.get("fuel_can", fuel_can) as Dictionary).duplicate(true)
	elapsed_ticks = int(state.get("elapsed_ticks", elapsed_ticks))
	_rng.state = int(state.get("rng_state", _rng.state))
	last_result = (state.get("last_result", last_result) as Dictionary).duplicate(true)
	_render()


func debug_force_finish() -> bool:
	if finished or cars.is_empty():
		return false
	var car: Dictionary = cars[0]
	car["captures"] = maxi(1, int(car.get("captures", 0)))
	car["lap_ms"] = maxi(33, int(car.get("lap_ms", 0)))
	cars[0] = car
	_complete_match(0)
	_render()
	return finished


func _render() -> void:
	if _status != null:
		var score: Array[String] = []
		for index in cars.size():
			score.append("P%d %d" % [index + 1, int((cars[index] as Dictionary).get("captures", 0))])
		_status.text = "%s  //  CLOCK %02d.%02d  //  CARRIER %s" % ["  ".join(score),
			maxi(0, MATCH_TICKS - elapsed_ticks) / 30,
			(maxi(0, MATCH_TICKS - elapsed_ticks) % 30) * 3,
			"P%d" % (int(fuel_can.get("carrier", -1)) + 1) if int(fuel_can.get("carrier", -1)) >= 0 else "LOOSE"]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	draw_rect(FIELD, Color("29271f"), true)
	draw_rect(FIELD, Draw.RUST, false, 3.0)
	for x in range(int(FIELD.position.x) + 60, int(FIELD.end.x), 120):
		draw_line(Vector2(x, FIELD.position.y), Vector2(x - 90, FIELD.end.y), Color("3a3529"), 18.0)
	for index in cars.size():
		var car: Dictionary = cars[index]
		var home: Vector2 = car["home"]
		var color := Draw.team_color(index)
		draw_circle(home, 48, color.darkened(0.55))
		draw_arc(home, 48, 0, TAU, 24, color, 4.0)
		draw_rect(Rect2(home - Vector2(16, 26), Vector2(32, 52)), color.darkened(0.2), true)
	if not fuel_can.is_empty():
		var can_pos: Vector2 = fuel_can["pos"]
		draw_rect(Rect2(can_pos - Vector2(12, 17), Vector2(24, 34)), Draw.AMBER, true)
		draw_rect(Rect2(can_pos + Vector2(2, -22), Vector2(8, 8)), Draw.BONE, true)
		draw_arc(can_pos, 24, 0, TAU, 18, Draw.SIGNAL, 2.0)
	for index in cars.size():
		var car: Dictionary = cars[index]
		var pos: Vector2 = car["pos"]
		var forward := Vector2.from_angle(float(car["angle"]))
		var side := forward.orthogonal()
		var color := Draw.team_color(index)
		var body := PackedVector2Array([pos + forward * 24, pos - forward * 20 + side * 15,
			pos - forward * 20 - side * 15])
		draw_colored_polygon(body, color)
		draw_circle(pos - forward * 4 + side * 13, 5, Draw.INK)
		draw_circle(pos - forward * 4 - side * 13, 5, Draw.INK)
		if int(fuel_can.get("carrier", -1)) == index:
			draw_arc(pos, 28, 0, TAU, 18, Draw.AMBER, 3.0)
