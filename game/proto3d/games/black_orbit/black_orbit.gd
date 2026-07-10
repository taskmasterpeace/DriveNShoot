## BLACK ORBIT - deterministic wraparound orbital salvage claim combat.
## Original skiffs, dead satellites, beacons, rocks, and HUD.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/console/console_draw.gd")
const FIELD := Rect2(45, 105, 1190, 545)
const SHIP_SPEED := 165.0
const TURN_SPEED := 2.7
const SHOT_SPEED := 510.0
const FIRE_COOLDOWN := 14
const START_HP := 3
const BANK_TARGET := 3
const STEP := 1.0 / 30.0

var ships: Array = []
var asteroids: Array = []
var shots: Array = []
var salvage_pickups: Array = []
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "BLACK ORBIT", "DEAD SKY CLAIM COURT // BRING THE JUNK HOME")
	_status = Draw.status(self)
	queue_redraw()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	ships.clear()
	asteroids.clear()
	shots.clear()
	salvage_pickups.clear()
	var count := clampi(maxi(2, new_seats.size()), 2, 4)
	var homes: Array[Vector2] = [Vector2(135, 185), Vector2(1145, 570),
		Vector2(1145, 185), Vector2(135, 570)]
	for index in count:
		var angle := (FIELD.get_center() - homes[index]).angle()
		ships.append({"id": index, "pos": homes[index], "home": homes[index],
			"vel": Vector2.ZERO, "angle": angle, "aim": angle, "hp": START_HP,
			"alive": true, "ai": index >= new_seats.size(), "cooldown": 0,
			"salvage": 0, "banked": 0, "wins": 0})
	for index in 7:
		asteroids.append({"pos": Vector2(_rng.randf_range(310.0, 970.0),
			_rng.randf_range(185.0, 575.0)),
			"vel": Vector2.from_angle(_rng.randf_range(-PI, PI)) * _rng.randf_range(18.0, 48.0),
			"size": 1 + index % 3})
	_render()


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished:
		return
	tick = maxi(tick, new_tick)
	for index in ships.size():
		var ship: Dictionary = ships[index]
		if not bool(ship.get("alive", false)):
			continue
		var input: Dictionary = _ai_snapshot(index) if bool(ship.get("ai", false)) \
			else _snapshot_for_ship(index, snapshots)
		_drive_ship(index, input)
	update_fixed(STEP)
	_render()


func _drive_ship(index: int, input: Dictionary) -> void:
	if input.is_empty():
		return
	var ship: Dictionary = ships[index]
	var move: Vector2 = input.get("move", Vector2.ZERO)
	ship["angle"] = wrapf(float(ship["angle"]) + move.x * TURN_SPEED * STEP, -PI, PI)
	if move.y < -0.05:
		ship["vel"] = Vector2(ship["vel"]) + Vector2.from_angle(float(ship["angle"])) \
			* SHIP_SPEED * (-move.y) * STEP
	var aim: Vector2 = input.get("aim", Vector2.ZERO)
	if aim.length_squared() > 0.01:
		ship["aim"] = aim.angle()
	ships[index] = ship
	var pressed: Dictionary = input.get("pressed", {})
	if bool(pressed.get("primary", false)):
		fire_shot(index)
	if bool(pressed.get("secondary", false)):
		ship = ships[index]
		ship["vel"] = Vector2(ship["vel"]) * 0.62
		ships[index] = ship
	if bool(pressed.get("mobility", false)):
		ship = ships[index]
		ship["vel"] = Vector2(ship["vel"]) + Vector2.from_angle(float(ship["angle"])) * 55.0
		ships[index] = ship


func fire_shot(index: int) -> bool:
	if index < 0 or index >= ships.size():
		return false
	var ship: Dictionary = ships[index]
	if not bool(ship.get("alive", false)) or int(ship.get("cooldown", 0)) > 0:
		return false
	var direction := Vector2.from_angle(float(ship["aim"]))
	shots.append({"pos": Vector2(ship["pos"]) + direction * 23.0,
		"vel": direction * SHOT_SPEED, "owner": index, "life": 90})
	ship["cooldown"] = FIRE_COOLDOWN
	ships[index] = ship
	return true


func update_fixed(delta: float) -> void:
	for index in ships.size():
		var ship: Dictionary = ships[index]
		ship["cooldown"] = maxi(0, int(ship.get("cooldown", 0)) - 1)
		if bool(ship.get("alive", false)):
			ship["pos"] = wrap_position(Vector2(ship["pos"]) + Vector2(ship["vel"]) * delta)
			ship["vel"] = Vector2(ship["vel"]) * 0.992
		ships[index] = ship
	for asteroid_index in asteroids.size():
		var asteroid: Dictionary = asteroids[asteroid_index]
		asteroid["pos"] = wrap_position(Vector2(asteroid["pos"]) + Vector2(asteroid["vel"]) * delta)
		asteroids[asteroid_index] = asteroid
	_update_shots(delta)
	_update_collisions()
	for index in ships.size():
		if bool((ships[index] as Dictionary).get("alive", false)):
			collect_salvage(index)
			bank_salvage(index)


func _update_shots(delta: float) -> void:
	var index := shots.size() - 1
	while index >= 0:
		var shot: Dictionary = shots[index]
		shot["pos"] = wrap_position(Vector2(shot["pos"]) + Vector2(shot["vel"]) * delta)
		shot["life"] = int(shot.get("life", 0)) - 1
		var consumed := int(shot["life"]) <= 0
		if not consumed:
			for asteroid_index in asteroids.size():
				var asteroid: Dictionary = asteroids[asteroid_index]
				if Vector2(shot["pos"]).distance_to(Vector2(asteroid["pos"])) <= 9.0 + int(asteroid["size"]) * 9.0:
					hit_asteroid(asteroid_index, int(shot["owner"]))
					consumed = true
					break
		if not consumed:
			for ship_index in ships.size():
				if ship_index == int(shot["owner"]):
					continue
				var ship: Dictionary = ships[ship_index]
				if bool(ship.get("alive", false)) and Vector2(shot["pos"]).distance_to(Vector2(ship["pos"])) <= 19.0:
					damage_ship(ship_index, 1, int(shot["owner"]))
					consumed = true
					break
		if consumed:
			shots.remove_at(index)
		else:
			shots[index] = shot
		index -= 1


func _update_collisions() -> void:
	for ship_index in ships.size():
		var ship: Dictionary = ships[ship_index]
		if not bool(ship.get("alive", false)):
			continue
		for asteroid_index in asteroids.size():
			var asteroid: Dictionary = asteroids[asteroid_index]
			var radius := 17.0 + float(asteroid["size"]) * 8.0
			if Vector2(ship["pos"]).distance_to(Vector2(asteroid["pos"])) <= radius:
				damage_ship(ship_index, 1, -1)
				var push := Vector2(asteroid["pos"]).direction_to(Vector2(ship["pos"]))
				ship = ships[ship_index]
				ship["pos"] = wrap_position(Vector2(ship["pos"]) + push * 30.0)
				ship["vel"] = Vector2(ship["vel"]) + push * 45.0
				ships[ship_index] = ship
				break


func hit_asteroid(index: int, _owner: int) -> bool:
	if index < 0 or index >= asteroids.size():
		return false
	var asteroid: Dictionary = asteroids[index]
	asteroids.remove_at(index)
	var pos: Vector2 = asteroid["pos"]
	var size_value := int(asteroid["size"])
	if size_value > 1:
		var base_vel: Vector2 = asteroid["vel"]
		asteroids.append({"pos": pos + Vector2(10, 0), "vel": base_vel.rotated(0.7) + Vector2(18, -12),
			"size": size_value - 1})
		asteroids.append({"pos": pos - Vector2(10, 0), "vel": base_vel.rotated(-0.7) + Vector2(-18, 12),
			"size": size_value - 1})
	salvage_pickups.append({"pos": pos, "value": 1})
	return true


func collect_salvage(index: int) -> bool:
	if index < 0 or index >= ships.size():
		return false
	var collected := false
	var pickup_index := salvage_pickups.size() - 1
	while pickup_index >= 0:
		var pickup: Dictionary = salvage_pickups[pickup_index]
		if Vector2((ships[index] as Dictionary)["pos"]).distance_to(Vector2(pickup["pos"])) <= 30.0:
			var ship: Dictionary = ships[index]
			ship["salvage"] = int(ship.get("salvage", 0)) + int(pickup.get("value", 1))
			ships[index] = ship
			salvage_pickups.remove_at(pickup_index)
			collected = true
		pickup_index -= 1
	return collected


func bank_salvage(index: int) -> bool:
	if finished or index < 0 or index >= ships.size():
		return false
	var ship: Dictionary = ships[index]
	var carried := int(ship.get("salvage", 0))
	if carried <= 0 or Vector2(ship["pos"]).distance_to(Vector2(ship["home"])) > 70.0:
		return false
	ship["salvage"] = 0
	ship["banked"] = int(ship.get("banked", 0)) + carried
	ships[index] = ship
	if int(ship["banked"]) >= BANK_TARGET:
		_complete_match(index)
	return true


func damage_ship(index: int, amount: int, _attacker: int) -> bool:
	if finished or index < 0 or index >= ships.size() or amount <= 0:
		return false
	var ship: Dictionary = ships[index]
	if not bool(ship.get("alive", false)):
		return false
	ship["hp"] = maxi(0, int(ship["hp"]) - amount)
	if int(ship["hp"]) <= 0:
		ship["alive"] = false
		ship["salvage"] = 0
	ships[index] = ship
	var alive: Array = ships.filter(func(row: Dictionary) -> bool: return bool(row.get("alive", false)))
	if alive.size() == 1 and ships.size() > 1:
		for winner in ships.size():
			if bool((ships[winner] as Dictionary).get("alive", false)):
				_complete_match(winner)
				break
	return true


func _complete_match(winner: int) -> void:
	if finished or winner < 0 or winner >= ships.size():
		return
	var ship: Dictionary = ships[winner]
	ship["wins"] = int(ship.get("wins", 0)) + 1
	ships[winner] = ship
	finish_match({"primary": int(ship["wins"]),
		"secondary": {"winner": winner, "salvage": int(ship.get("banked", 0))},
		"outcome": "complete", "ranked": true})


func wrap_position(pos: Vector2) -> Vector2:
	if pos.x < FIELD.position.x:
		pos.x = FIELD.end.x
	elif pos.x > FIELD.end.x:
		pos.x = FIELD.position.x
	if pos.y < FIELD.position.y:
		pos.y = FIELD.end.y
	elif pos.y > FIELD.end.y:
		pos.y = FIELD.position.y
	return pos


func _snapshot_for_ship(index: int, snapshots: Array) -> Dictionary:
	if index >= seats.size():
		return {}
	var wanted := int((seats[index] as Dictionary).get("seat", index))
	for value in snapshots:
		var input: Dictionary = value
		if int(input.get("seat", -1)) == wanted:
			return input
	return {}


func _ai_snapshot(index: int) -> Dictionary:
	var ship: Dictionary = ships[index]
	var target_pos: Vector2
	if not salvage_pickups.is_empty():
		target_pos = (salvage_pickups[0] as Dictionary)["pos"]
	elif not asteroids.is_empty():
		target_pos = (asteroids[0] as Dictionary)["pos"]
	else:
		target_pos = FIELD.get_center()
	var delta := target_pos - Vector2(ship["pos"])
	var turn := clampf(wrapf(delta.angle() - float(ship["angle"]), -PI, PI) * 1.7, -1.0, 1.0)
	var pressed: Dictionary = {}
	if tick % 35 == index * 6 % 35:
		pressed["primary"] = true
	return {"seat": index, "move": Vector2(turn, -1), "aim": delta.normalized(),
		"held": {}, "pressed": pressed, "released": {}}


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["ships"] = ships.duplicate(true)
	state["asteroids"] = asteroids.duplicate(true)
	state["shots"] = shots.duplicate(true)
	state["salvage_pickups"] = salvage_pickups.duplicate(true)
	state["rng_state"] = _rng.state
	state["last_result"] = last_result.duplicate(true)
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	ships = (state.get("ships", ships) as Array).duplicate(true)
	asteroids = (state.get("asteroids", asteroids) as Array).duplicate(true)
	shots = (state.get("shots", shots) as Array).duplicate(true)
	salvage_pickups = (state.get("salvage_pickups", salvage_pickups) as Array).duplicate(true)
	_rng.state = int(state.get("rng_state", _rng.state))
	last_result = (state.get("last_result", last_result) as Dictionary).duplicate(true)
	_render()


func debug_force_finish() -> bool:
	if finished or ships.is_empty():
		return false
	var ship: Dictionary = ships[0]
	ship["banked"] = BANK_TARGET
	ships[0] = ship
	_complete_match(0)
	_render()
	return finished


func _render() -> void:
	if _status != null:
		var score_parts: Array[String] = []
		for index in ships.size():
			var ship: Dictionary = ships[index]
			score_parts.append("P%d %d/%d" % [index + 1, int(ship.get("banked", 0)), BANK_TARGET])
		_status.text = "%s  //  CLAIMS %02d  //  DEBRIS %02d  //  TICK %05d" % [
			"  ".join(score_parts), salvage_pickups.size(), asteroids.size(), tick]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	draw_rect(FIELD, Color("171b1a"), true)
	draw_rect(FIELD, Draw.TEAL, false, 2.0)
	for index in 58:
		var x := FIELD.position.x + float((index * 197) % int(FIELD.size.x))
		var y := FIELD.position.y + float((index * 113) % int(FIELD.size.y))
		draw_circle(Vector2(x, y), 1.0 + float(index % 2), Color("8d927f"))
	for pickup_value in salvage_pickups:
		var pickup: Dictionary = pickup_value
		var pos: Vector2 = pickup["pos"]
		draw_rect(Rect2(pos - Vector2(7, 7), Vector2(14, 14)), Draw.AMBER, true)
		draw_arc(pos, 14, 0, TAU, 12, Draw.SIGNAL, 2.0)
	for asteroid_value in asteroids:
		var asteroid: Dictionary = asteroid_value
		var pos: Vector2 = asteroid["pos"]
		var radius := 8.0 + float(asteroid["size"]) * 8.0
		draw_circle(pos, radius, Color("585247"))
		draw_arc(pos, radius, 0, TAU, 12, Draw.DIM, 2.0)
	for shot_value in shots:
		var shot: Dictionary = shot_value
		var pos: Vector2 = shot["pos"]
		var direction := Vector2(shot["vel"]).normalized()
		draw_line(pos - direction * 14.0, pos, Draw.AMBER, 3.0)
	for index in ships.size():
		var ship: Dictionary = ships[index]
		var pos: Vector2 = ship["pos"]
		var color := Draw.team_color(index) if bool(ship.get("alive", false)) else Draw.DIM
		draw_arc(Vector2(ship["home"]), 30, 0, TAU, 24, color.darkened(0.25), 3.0)
		var facing := Vector2.from_angle(float(ship["angle"]))
		var side := facing.orthogonal()
		var hull := PackedVector2Array([pos + facing * 23, pos - facing * 16 + side * 14,
			pos - facing * 9, pos - facing * 16 - side * 14])
		draw_colored_polygon(hull, color)
		var aim := Vector2.from_angle(float(ship["aim"]))
		draw_line(pos, pos + aim * 28, Draw.BONE, 4.0)
		for hp_index in int(ship.get("hp", 0)):
			draw_rect(Rect2(pos + Vector2(-15 + hp_index * 11, 22), Vector2(8, 3)), color)
