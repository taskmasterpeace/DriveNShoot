## RED SKY - deterministic turn artillery across a ruined weather array.
## Original terrain, crews, towers, shells, and HUD; no upstream art or maps.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/console/console_draw.gd")
const FIELD := Rect2(40, 105, 1200, 545)
const TERRAIN_SAMPLES := 65
const GRAVITY := 250.0
const SHOT_SPEED := 470.0
const BLAST_RADIUS := 92.0
const CRATER_DEPTH := 36.0
const MAX_DAMAGE := 65
const START_HP := 100
const STEP := 1.0 / 30.0

var terrain: Array[float] = []
var crews: Array = []
var wind := 0.0
var current_turn := 0
var projectile: Dictionary = {}
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "RED SKY", "WEATHER ARRAY 12 // RANGE BEFORE THEY RANGE YOU")
	_status = Draw.status(self)
	queue_redraw()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	_build_terrain()
	wind = _rng.randf_range(-34.0, 34.0)
	if absf(wind) < 2.0:
		wind = 12.0
	crews.clear()
	projectile.clear()
	current_turn = 0
	var count := clampi(maxi(2, new_seats.size()), 2, 4)
	var crew_x: Array[float] = [165.0, 1115.0, 385.0, 895.0]
	for index in count:
		crews.append({"id": index, "x": crew_x[index], "hp": START_HP,
			"angle": 45.0, "power": 0.68, "ai": index >= new_seats.size(),
			"damage": 0, "wins": 0, "alive": true})
	_render()


func _build_terrain() -> void:
	terrain.clear()
	var drift := _rng.randf_range(-10.0, 10.0)
	for index in TERRAIN_SAMPLES:
		drift = clampf(drift + _rng.randf_range(-7.0, 7.0), -42.0, 42.0)
		var ridge := sin(float(index) * 0.31) * 22.0 + sin(float(index) * 0.09) * 28.0
		terrain.append(510.0 + ridge + drift)


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished:
		return
	tick = maxi(tick, new_tick)
	if not projectile.is_empty():
		update_projectile(STEP)
		_render()
		return
	if current_turn < 0 or current_turn >= crews.size():
		return
	var crew: Dictionary = crews[current_turn]
	if bool(crew.get("ai", false)):
		if tick % 20 == 0:
			ai_take_turn(current_turn)
		_render()
		return
	var input := _snapshot_for_crew(current_turn, snapshots)
	if input.is_empty():
		return
	var held: Dictionary = input.get("held", {})
	crew["angle"] = clampf(float(crew["angle"])
		+ (float(bool(held.get("move_right", false)))
		- float(bool(held.get("move_left", false)))) * 0.75, 12.0, 82.0)
	crew["power"] = clampf(float(crew["power"])
		+ (float(bool(held.get("move_up", false)))
		- float(bool(held.get("move_down", false)))) * 0.012, 0.28, 1.0)
	crews[current_turn] = crew
	var pressed: Dictionary = input.get("pressed", {})
	if bool(pressed.get("primary", false)):
		fire_projectile(current_turn)
	_render()


func fire_projectile(owner: int) -> bool:
	if not projectile.is_empty() or owner != current_turn or owner < 0 or owner >= crews.size():
		return false
	var crew: Dictionary = crews[owner]
	if not bool(crew.get("alive", false)):
		return false
	var facing := 1.0 if float(crew["x"]) < FIELD.get_center().x else -1.0
	var angle := deg_to_rad(float(crew["angle"]))
	var speed := SHOT_SPEED * float(crew["power"])
	var origin := Vector2(float(crew["x"]), terrain_y(float(crew["x"])) - 24.0)
	projectile = {"pos": origin, "vel": Vector2(cos(angle) * speed * facing,
		-sin(angle) * speed), "owner": owner, "age": 0.0}
	return true


func update_projectile(delta: float) -> void:
	if projectile.is_empty() or finished:
		return
	var velocity: Vector2 = projectile["vel"]
	velocity.x += wind * delta
	velocity.y += GRAVITY * delta
	var pos: Vector2 = projectile["pos"] + velocity * delta
	projectile["vel"] = velocity
	projectile["pos"] = pos
	projectile["age"] = float(projectile.get("age", 0.0)) + delta
	if pos.x < FIELD.position.x or pos.x > FIELD.end.x or pos.y > FIELD.end.y + 80.0:
		var clamped_x := clampf(pos.x, FIELD.position.x, FIELD.end.x)
		explode_at(Vector2(clamped_x, terrain_y(clamped_x)), int(projectile["owner"]))
	elif pos.y >= terrain_y(pos.x):
		explode_at(pos, int(projectile["owner"]))


func explode_at(pos: Vector2, owner: int) -> void:
	projectile.clear()
	_deform_terrain(pos.x)
	for index in crews.size():
		var crew: Dictionary = crews[index]
		if not bool(crew.get("alive", false)):
			continue
		var crew_pos := Vector2(float(crew["x"]), terrain_y(float(crew["x"])) - 14.0)
		var distance := crew_pos.distance_to(pos)
		if distance > BLAST_RADIUS:
			continue
		var amount := maxi(1, int(round(float(MAX_DAMAGE) * (1.0 - distance / BLAST_RADIUS))))
		crew["hp"] = maxi(0, int(crew["hp"]) - amount)
		if int(crew["hp"]) <= 0:
			crew["alive"] = false
		crews[index] = crew
		if owner >= 0 and owner < crews.size() and owner != index:
			var attacker: Dictionary = crews[owner]
			attacker["damage"] = int(attacker.get("damage", 0)) + amount
			crews[owner] = attacker
	if not _check_winner():
		_advance_turn()
	_render()


func _deform_terrain(center_x: float) -> void:
	var spacing := FIELD.size.x / float(TERRAIN_SAMPLES - 1)
	for index in terrain.size():
		var sample_x := FIELD.position.x + float(index) * spacing
		var distance := absf(sample_x - center_x)
		if distance <= BLAST_RADIUS:
			terrain[index] += CRATER_DEPTH * (1.0 - distance / BLAST_RADIUS)


func terrain_y(x: float) -> float:
	var ratio := clampf((x - FIELD.position.x) / FIELD.size.x, 0.0, 1.0)
	var sample := ratio * float(TERRAIN_SAMPLES - 1)
	var left := clampi(int(floor(sample)), 0, TERRAIN_SAMPLES - 1)
	var right := mini(left + 1, TERRAIN_SAMPLES - 1)
	return lerpf(terrain[left], terrain[right], sample - float(left))


func terrain_ready_for_draw() -> bool:
	return terrain.size() >= 3


func _advance_turn() -> void:
	if crews.is_empty():
		return
	for offset in range(1, crews.size() + 1):
		var candidate := (current_turn + offset) % crews.size()
		if bool((crews[candidate] as Dictionary).get("alive", false)):
			current_turn = candidate
			return


func _check_winner() -> bool:
	var alive: Array[int] = []
	for index in crews.size():
		if bool((crews[index] as Dictionary).get("alive", false)):
			alive.append(index)
	if alive.size() != 1 or crews.size() < 2:
		return false
	_complete_match(alive[0])
	return true


func _complete_match(winner: int) -> void:
	if finished or winner < 0 or winner >= crews.size():
		return
	var crew: Dictionary = crews[winner]
	crew["wins"] = int(crew.get("wins", 0)) + 1
	crews[winner] = crew
	finish_match({"primary": int(crew["wins"]),
		"secondary": {"winner": winner, "damage": int(crew.get("damage", 0))},
		"outcome": "complete", "ranked": true})


func ai_take_turn(index: int) -> bool:
	if not projectile.is_empty() or index != current_turn or index < 0 or index >= crews.size():
		return false
	var target := _nearest_target(index)
	if target < 0:
		return false
	var crew: Dictionary = crews[index]
	var distance := absf(float((crews[target] as Dictionary)["x"]) - float(crew["x"]))
	crew["angle"] = clampf(38.0 + distance / FIELD.size.x * 18.0 + wind * 0.04, 25.0, 70.0)
	crew["power"] = clampf(0.42 + distance / FIELD.size.x * 0.52, 0.35, 0.95)
	crews[index] = crew
	return fire_projectile(index)


func _nearest_target(index: int) -> int:
	var best := -1
	var best_distance := INF
	var origin := float((crews[index] as Dictionary)["x"])
	for other in crews.size():
		if other == index or not bool((crews[other] as Dictionary).get("alive", false)):
			continue
		var distance := absf(float((crews[other] as Dictionary)["x"]) - origin)
		if distance < best_distance:
			best_distance = distance
			best = other
	return best


func _snapshot_for_crew(index: int, snapshots: Array) -> Dictionary:
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
	state["terrain"] = terrain.duplicate()
	state["crews"] = crews.duplicate(true)
	state["wind"] = wind
	state["current_turn"] = current_turn
	state["projectile"] = projectile.duplicate(true)
	state["rng_state"] = _rng.state
	state["last_result"] = last_result.duplicate(true)
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	terrain.assign(state.get("terrain", terrain))
	crews = (state.get("crews", crews) as Array).duplicate(true)
	wind = float(state.get("wind", wind))
	current_turn = int(state.get("current_turn", current_turn))
	projectile = (state.get("projectile", projectile) as Dictionary).duplicate(true)
	_rng.state = int(state.get("rng_state", _rng.state))
	last_result = (state.get("last_result", last_result) as Dictionary).duplicate(true)
	_render()


func debug_force_finish() -> bool:
	if finished or crews.is_empty():
		return false
	for index in range(1, crews.size()):
		var crew: Dictionary = crews[index]
		crew["alive"] = false
		crew["hp"] = 0
		crews[index] = crew
	_complete_match(0)
	_render()
	return finished


func _render() -> void:
	if _status != null and not crews.is_empty():
		var crew: Dictionary = crews[current_turn] if current_turn >= 0 and current_turn < crews.size() else {}
		_status.text = "WIND %+.1f  //  CREW %d  //  ANGLE %02d  //  CHARGE %03d%%  //  TICK %05d" % [
			wind, current_turn + 1, int(crew.get("angle", 0)),
			int(float(crew.get("power", 0.0)) * 100.0), tick]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	draw_rect(FIELD, Color("3a211e"), true)
	# The red weather front and dead sensor towers are original cartridge art.
	draw_circle(Vector2(1030, 205), 78.0, Color("9d3d32"))
	for index in 9:
		var x := 90.0 + float(index) * 145.0
		var height := 45.0 + float((index * 37) % 85)
		draw_rect(Rect2(x, 250.0 - height, 18, height), Color("2a2420"), true)
		draw_line(Vector2(x + 9, 250 - height), Vector2(x + 9, 220 - height), Draw.DIM, 3.0)
	if not terrain_ready_for_draw():
		return
	var points := PackedVector2Array()
	points.append(Vector2(FIELD.position.x, FIELD.end.y))
	var spacing := FIELD.size.x / float(TERRAIN_SAMPLES - 1)
	for index in terrain.size():
		points.append(Vector2(FIELD.position.x + float(index) * spacing, terrain[index]))
	points.append(Vector2(FIELD.end.x, FIELD.end.y))
	draw_colored_polygon(points, Color("302a22"))
	for index in crews.size():
		var crew: Dictionary = crews[index]
		var pos := Vector2(float(crew["x"]), terrain_y(float(crew["x"])) - 12.0)
		var color := Draw.team_color(index) if bool(crew.get("alive", false)) else Draw.DIM
		draw_rect(Rect2(pos - Vector2(18, 10), Vector2(36, 18)), color, true)
		var facing := 1.0 if pos.x < FIELD.get_center().x else -1.0
		var barrel := Vector2(cos(deg_to_rad(float(crew["angle"]))) * facing,
			-sin(deg_to_rad(float(crew["angle"]))))
		draw_line(pos, pos + barrel * 32.0, Draw.BONE, 5.0)
		draw_rect(Rect2(pos + Vector2(-20, 15), Vector2(40, 5)), Draw.RUST, true)
		draw_rect(Rect2(pos + Vector2(-20, 15), Vector2(40.0 * float(crew["hp"]) / START_HP, 5)), color, true)
	if not projectile.is_empty():
		var pos: Vector2 = projectile["pos"]
		var vel := Vector2(projectile["vel"]).normalized()
		draw_line(pos - vel * 22.0, pos, Draw.AMBER, 4.0)
		draw_circle(pos, 5.0, Draw.BONE)
