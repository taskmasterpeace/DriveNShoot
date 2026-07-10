## SKYJOUST - deterministic two-player rocket-rig aerial dueling.
## Original fairground rigs, grandstands, clouds, lances, and score art.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/console/console_draw.gd")
const FIELD := Rect2(70, 115, 1140, 505)
const GRAVITY := 250.0
const THRUST := 430.0
const AIR_ACCEL := 280.0
const MAX_SPEED := 310.0
const MAX_FUEL := 100.0
const ALTITUDE_ADVANTAGE := 28.0
const CONTACT_RANGE := 92.0
const KNOCKOUTS_TO_WIN := 3
const STEP := 1.0 / 30.0

var pilots: Array = []
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "SKYJOUST", "COUNTY FAIR ROCKET LEAGUE // ALTITUDE IS AUTHORITY")
	_status = Draw.status(self)
	queue_redraw()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	pilots.clear()
	var spawns: Array[Vector2] = [Vector2(265, 520), Vector2(1015, 520)]
	for index in 2:
		pilots.append({"id": index, "pos": spawns[index], "spawn": spawns[index],
			"vel": Vector2.ZERO, "facing": 1 if index == 0 else -1,
			"fuel": MAX_FUEL, "alive": true, "ai": index >= new_seats.size(),
			"lance_ticks": 0, "invulnerable": 18, "knockouts": 0,
			"wins": 0, "thrusting": false})
	_render()


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished:
		return
	tick = maxi(tick, new_tick)
	for index in pilots.size():
		var pilot: Dictionary = pilots[index]
		var input: Dictionary = _ai_snapshot(index) if bool(pilot.get("ai", false)) \
			else _snapshot_for_pilot(index, snapshots)
		_drive_pilot(index, input)
	update_fixed(STEP)
	_render()


func _drive_pilot(index: int, input: Dictionary) -> void:
	if input.is_empty():
		return
	var pilot: Dictionary = pilots[index]
	var move: Vector2 = input.get("move", Vector2.ZERO)
	pilot["thrusting"] = false
	if absf(move.x) > 0.05:
		pilot["vel"] = Vector2(pilot["vel"]) + Vector2(move.x * AIR_ACCEL * STEP, 0)
		pilot["facing"] = 1 if move.x > 0.0 else -1
	if move.y < -0.05 and float(pilot["fuel"]) > 0.0:
		pilot["vel"] = Vector2(pilot["vel"]) + Vector2(0, -THRUST * (-move.y) * STEP)
		pilot["fuel"] = maxf(0.0, float(pilot["fuel"]) - 1.25 * (-move.y))
		pilot["thrusting"] = true
	var pressed: Dictionary = input.get("pressed", {})
	if bool(pressed.get("primary", false)):
		pilot["lance_ticks"] = 10
	if bool(pressed.get("mobility", false)) and float(pilot["fuel"]) >= 12.0:
		pilot["fuel"] = float(pilot["fuel"]) - 12.0
		pilot["vel"] = Vector2(pilot["vel"]) + Vector2(float(pilot["facing"]) * 95.0, -80.0)
	pilots[index] = pilot


func update_fixed(delta: float) -> void:
	if finished:
		return
	for index in pilots.size():
		var pilot: Dictionary = pilots[index]
		pilot["invulnerable"] = maxi(0, int(pilot.get("invulnerable", 0)) - 1)
		pilot["lance_ticks"] = maxi(0, int(pilot.get("lance_ticks", 0)) - 1)
		var velocity: Vector2 = pilot["vel"]
		velocity.y += GRAVITY * delta
		velocity *= 0.994
		if velocity.length() > MAX_SPEED:
			velocity = velocity.normalized() * MAX_SPEED
		var pos: Vector2 = pilot["pos"] + velocity * delta
		if pos.x < FIELD.position.x + 20.0:
			pos.x = FIELD.position.x + 20.0
			velocity.x = absf(velocity.x) * 0.45
		elif pos.x > FIELD.end.x - 20.0:
			pos.x = FIELD.end.x - 20.0
			velocity.x = -absf(velocity.x) * 0.45
		if pos.y < FIELD.position.y + 18.0:
			pos.y = FIELD.position.y + 18.0
			velocity.y = absf(velocity.y) * 0.35
		if pos.y > FIELD.end.y - 24.0:
			pos.y = FIELD.end.y - 24.0
			velocity.y = 0.0
			pilot["fuel"] = minf(MAX_FUEL, float(pilot["fuel"]) + 2.2)
		elif not bool(pilot.get("thrusting", false)):
			pilot["fuel"] = minf(MAX_FUEL, float(pilot["fuel"]) + 0.18)
		pilot["pos"] = pos
		pilot["vel"] = velocity
		pilot["thrusting"] = false
		pilots[index] = pilot
	if pilots.size() == 2:
		if int((pilots[0] as Dictionary).get("lance_ticks", 0)) > 0:
			resolve_lance(0, 1)
		if not finished and int((pilots[1] as Dictionary).get("lance_ticks", 0)) > 0:
			resolve_lance(1, 0)


func resolve_lance(attacker: int, defender: int) -> bool:
	if finished or attacker < 0 or defender < 0 or attacker >= pilots.size() or defender >= pilots.size() \
			or attacker == defender:
		return false
	var a: Dictionary = pilots[attacker]
	var d: Dictionary = pilots[defender]
	if int(a.get("lance_ticks", 0)) <= 0 or int(d.get("invulnerable", 0)) > 0 \
			or Vector2(a["pos"]).distance_to(Vector2(d["pos"])) > CONTACT_RANGE \
			or Vector2(a["pos"]).y + ALTITUDE_ADVANTAGE >= Vector2(d["pos"]).y:
		return false
	a["knockouts"] = int(a.get("knockouts", 0)) + 1
	a["lance_ticks"] = 0
	pilots[attacker] = a
	if int(a["knockouts"]) >= KNOCKOUTS_TO_WIN:
		_complete_match(attacker)
	else:
		_respawn(defender)
	return true


func _respawn(index: int) -> void:
	var pilot: Dictionary = pilots[index]
	pilot["alive"] = true
	pilot["pos"] = pilot["spawn"]
	pilot["vel"] = Vector2.ZERO
	pilot["fuel"] = MAX_FUEL
	pilot["lance_ticks"] = 0
	pilot["invulnerable"] = 18
	pilots[index] = pilot


func _complete_match(winner: int) -> void:
	if finished or winner < 0 or winner >= pilots.size():
		return
	var pilot: Dictionary = pilots[winner]
	pilot["wins"] = int(pilot.get("wins", 0)) + 1
	pilots[winner] = pilot
	finish_match({"primary": int(pilot["wins"]),
		"secondary": {"winner": winner, "knockouts": int(pilot.get("knockouts", 0))},
		"outcome": "complete", "ranked": true})


func _ai_snapshot(index: int) -> Dictionary:
	var pilot: Dictionary = pilots[index]
	var target: Dictionary = pilots[1 - index]
	var delta := Vector2(target["pos"]) - Vector2(pilot["pos"])
	var desired_y := Vector2(target["pos"]).y - 55.0
	var move := Vector2(signf(delta.x), -1.0 if Vector2(pilot["pos"]).y > desired_y else 0.0)
	var pressed: Dictionary = {}
	if delta.length() <= CONTACT_RANGE and Vector2(pilot["pos"]).y + ALTITUDE_ADVANTAGE < Vector2(target["pos"]).y:
		pressed["primary"] = true
	if tick % 95 == 20 + index * 7:
		pressed["mobility"] = true
	return {"seat": index, "move": move, "aim": Vector2.ZERO,
		"held": {}, "pressed": pressed, "released": {}}


func _snapshot_for_pilot(index: int, snapshots: Array) -> Dictionary:
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
	state["pilots"] = pilots.duplicate(true)
	state["rng_state"] = _rng.state
	state["last_result"] = last_result.duplicate(true)
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	pilots = (state.get("pilots", pilots) as Array).duplicate(true)
	_rng.state = int(state.get("rng_state", _rng.state))
	last_result = (state.get("last_result", last_result) as Dictionary).duplicate(true)
	_render()


func debug_force_finish() -> bool:
	if finished or pilots.is_empty():
		return false
	var pilot: Dictionary = pilots[0]
	pilot["knockouts"] = KNOCKOUTS_TO_WIN
	pilots[0] = pilot
	_complete_match(0)
	_render()
	return finished


func _render() -> void:
	if _status != null and pilots.size() == 2:
		_status.text = "P1 KOs %d  FUEL %03d  //  P2 KOs %d  FUEL %03d  //  TICK %05d" % [
			int((pilots[0] as Dictionary).get("knockouts", 0)), int((pilots[0] as Dictionary).get("fuel", 0)),
			int((pilots[1] as Dictionary).get("knockouts", 0)), int((pilots[1] as Dictionary).get("fuel", 0)), tick]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	draw_rect(FIELD, Color("2d302d"), true)
	draw_circle(Vector2(1030, 205), 66, Color("a04434"))
	for index in 5:
		var cloud := Vector2(180 + index * 230, 210 + (index % 2) * 70)
		draw_circle(cloud, 35, Color("484b45"))
		draw_circle(cloud + Vector2(35, 8), 28, Color("484b45"))
	# Broken fairground stands and gantries.
	for index in 13:
		var x := FIELD.position.x + index * 92.0
		draw_rect(Rect2(x, FIELD.end.y - 55 - (index % 3) * 12, 68, 55 + (index % 3) * 12),
			Color("39342c"), true)
	draw_line(Vector2(FIELD.position.x, FIELD.end.y - 25), Vector2(FIELD.end.x, FIELD.end.y - 25), Draw.RUST, 5.0)
	for index in pilots.size():
		var pilot: Dictionary = pilots[index]
		var pos: Vector2 = pilot["pos"]
		var facing := float(pilot["facing"])
		var color := Draw.team_color(index)
		draw_circle(pos, 18, color)
		draw_rect(Rect2(pos + Vector2(-10, 16), Vector2(20, 24)), Color("555148"), true)
		draw_line(pos + Vector2(facing * 8, -2), pos + Vector2(facing * 48, -2), Draw.BONE, 5.0)
		if int(pilot.get("lance_ticks", 0)) > 0:
			draw_line(pos + Vector2(facing * 40, -2), pos + Vector2(facing * 58, -2), Draw.AMBER, 7.0)
		if bool(pilot.get("thrusting", false)):
			draw_colored_polygon(PackedVector2Array([pos + Vector2(-7, 39), pos + Vector2(7, 39),
				pos + Vector2(0, 62)]), Draw.RUST)
		draw_rect(Rect2(pos + Vector2(-24, 47), Vector2(48 * float(pilot["fuel"]) / MAX_FUEL, 4)), color, true)
