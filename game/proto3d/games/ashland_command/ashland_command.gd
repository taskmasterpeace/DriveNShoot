## ASHLAND COMMAND - deterministic hot-seat/online turn tactics.
## Original compressed border scenario and unit insignia; no upstream maps/audio.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/console/console_draw.gd")
const GRID_WIDTH := 10
const GRID_HEIGHT := 7
const PLAINS := 0
const RUBBLE := 1
const RIDGE := 2
const SUPPLY := 3
const CELL_SIZE := 72.0
const GRID_ORIGIN := Vector2(280, 112)
const TERRAIN_COST: Dictionary = {PLAINS: 1, RUBBLE: 2, RIDGE: 2, SUPPLY: 1}
const TERRAIN_DEFENSE: Dictionary = {PLAINS: 0, RUBBLE: 1, RIDGE: 3, SUPPLY: 1}
const UNIT_STATS: Dictionary = {
	"command": {"hp": 12, "move": 2, "range": 2, "damage": 3},
	"infantry": {"hp": 8, "move": 3, "range": 2, "damage": 4},
	"armor": {"hp": 12, "move": 3, "range": 1, "damage": 5},
	"artillery": {"hp": 6, "move": 2, "range": 3, "damage": 5},
}

var terrain: Array = []
var units: Array = []
var team_ai: Array[bool] = [false, true]
var team_supply: Array[int] = [0, 0]
var team_wins: Array[int] = [0, 0]
var supply_owners: Dictionary = {}
var current_team := 0
var turn_number := 1
var cursor := Vector2i(1, 3)
var selected_unit := -1
var seen_events: Dictionary = {}
var _event_counter := 0
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "ASHLAND COMMAND", "BORDER ACADEMY PACKAGE // SUPPLY IS THE MAP")
	_status = Draw.status(self)
	queue_redraw()


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	terrain = _build_terrain()
	units.clear()
	team_ai = [false, new_seats.size() < 2]
	team_supply = [0, 0]
	team_wins = [0, 0]
	supply_owners.clear()
	seen_events.clear()
	_event_counter = 0
	current_team = 0
	turn_number = 1
	selected_unit = -1
	_add_army(0, false)
	_add_army(1, true)
	cursor = (units[command_unit(0)] as Dictionary)["cell"]
	_render()


func blank_tactics_grid() -> Array:
	var out: Array = []
	for _y in GRID_HEIGHT:
		var row: Array[int] = []
		for _x in GRID_WIDTH:
			row.append(PLAINS)
		out.append(row)
	out[1][4] = SUPPLY
	out[5][5] = SUPPLY
	out[3][4] = SUPPLY
	return out


func _build_terrain() -> Array:
	var out := blank_tactics_grid()
	var occupied := [Vector2i(1, 3), Vector2i(2, 2), Vector2i(2, 4), Vector2i(1, 5),
		Vector2i(8, 3), Vector2i(7, 2), Vector2i(7, 4), Vector2i(8, 1)]
	for y in GRID_HEIGHT:
		for x in GRID_WIDTH:
			var cell := Vector2i(x, y)
			if int(out[y][x]) == SUPPLY or occupied.has(cell):
				continue
			var roll := _rng.randf()
			if roll < 0.19:
				out[y][x] = RIDGE
			elif roll < 0.43:
				out[y][x] = RUBBLE
	return out


func _add_army(team: int, mirrored: bool) -> void:
	var placements: Array = [
		["command", Vector2i(1, 3)], ["infantry", Vector2i(2, 2)],
		["armor", Vector2i(2, 4)], ["artillery", Vector2i(1, 5)],
	]
	for value in placements:
		var row: Array = value
		var type := String(row[0])
		var cell: Vector2i = row[1]
		if mirrored:
			cell = Vector2i(GRID_WIDTH - 1 - cell.x, GRID_HEIGHT - 1 - cell.y)
		var stats: Dictionary = UNIT_STATS[type]
		units.append({"id": units.size(), "team": team, "type": type, "cell": cell,
			"max_hp": int(stats["hp"]), "hp": int(stats["hp"]),
			"move": int(stats["move"]), "range": int(stats["range"]),
			"damage": int(stats["damage"]), "ap": 2, "alive": true})


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished:
		return
	tick = maxi(tick, new_tick)
	if bool(team_ai[current_team]):
		run_ai_turn()
		_render()
		return
	var input := _snapshot_for_team(current_team, snapshots)
	if input.is_empty():
		return
	var pressed: Dictionary = input.get("pressed", {})
	var moved := false
	if bool(pressed.get("move_up", false)):
		cursor.y = maxi(0, cursor.y - 1)
		moved = true
	elif bool(pressed.get("move_down", false)):
		cursor.y = mini(GRID_HEIGHT - 1, cursor.y + 1)
		moved = true
	elif bool(pressed.get("move_left", false)):
		cursor.x = maxi(0, cursor.x - 1)
		moved = true
	elif bool(pressed.get("move_right", false)):
		cursor.x = mini(GRID_WIDTH - 1, cursor.x + 1)
		moved = true
	if bool(pressed.get("primary", false)):
		_commit_cursor_action()
	elif bool(pressed.get("secondary", false)):
		var event := _new_event("end", {})
		end_turn()
		network_event_requested.emit(event)
	elif moved:
		selected_unit = selected_unit
	_render()


func _commit_cursor_action() -> void:
	var occupant := unit_at(cursor)
	if selected_unit < 0:
		if occupant >= 0 and int((units[occupant] as Dictionary)["team"]) == current_team:
			selected_unit = occupant
		return
	var selected: Dictionary = units[selected_unit]
	if occupant >= 0 and int((units[occupant] as Dictionary)["team"]) != current_team:
		if attack_unit(selected_unit, occupant):
			network_event_requested.emit(_new_event("attack", {"unit": selected_unit, "target": occupant}))
	elif occupant < 0:
		if move_unit(selected_unit, cursor):
			network_event_requested.emit(_new_event("move", {"unit": selected_unit,
				"to": [cursor.x, cursor.y]}))
	selected_unit = -1


func movement_cost(unit_index: int, destination: Vector2i) -> int:
	if unit_index < 0 or unit_index >= units.size() or not _inside(destination):
		return 999
	var origin: Vector2i = (units[unit_index] as Dictionary)["cell"]
	var distance := absi(destination.x - origin.x) + absi(destination.y - origin.y)
	return distance * int(TERRAIN_COST.get(int(terrain[destination.y][destination.x]), 1))


func move_unit(index: int, destination: Vector2i) -> bool:
	if finished or index < 0 or index >= units.size() or not _inside(destination):
		return false
	var unit: Dictionary = units[index]
	if not bool(unit.get("alive", false)) or int(unit["team"]) != current_team \
			or int(unit.get("ap", 0)) <= 0 or unit_at(destination) >= 0:
		return false
	var cost := movement_cost(index, destination)
	if cost <= 0 or cost > int(unit.get("move", 0)):
		return false
	unit["cell"] = destination
	unit["ap"] = int(unit["ap"]) - 1
	units[index] = unit
	capture_supply_for_unit(index)
	return true


func preview_damage(attacker: int, target: int) -> int:
	if attacker < 0 or target < 0 or attacker >= units.size() or target >= units.size():
		return 0
	var source: Dictionary = units[attacker]
	var victim: Dictionary = units[target]
	var defense := int(TERRAIN_DEFENSE.get(int(terrain[Vector2i(victim["cell"]).y][Vector2i(victim["cell"]).x]), 0))
	return maxi(1, int(source.get("damage", 1)) - defense)


func attack_unit(attacker: int, target: int) -> bool:
	if finished or attacker < 0 or target < 0 or attacker >= units.size() or target >= units.size():
		return false
	var source: Dictionary = units[attacker]
	var victim: Dictionary = units[target]
	if not bool(source.get("alive", false)) or not bool(victim.get("alive", false)) \
			or int(source["team"]) != current_team or int(source["team"]) == int(victim["team"]) \
			or int(source.get("ap", 0)) <= 0:
		return false
	var from: Vector2i = source["cell"]
	var to: Vector2i = victim["cell"]
	var distance := absi(to.x - from.x) + absi(to.y - from.y)
	if distance > int(source.get("range", 1)):
		return false
	source["ap"] = int(source["ap"]) - 1
	units[attacker] = source
	return apply_damage(target, preview_damage(attacker, target), attacker)


func apply_damage(index: int, amount: int, attacker: int) -> bool:
	if finished or index < 0 or index >= units.size() or amount <= 0:
		return false
	var unit: Dictionary = units[index]
	if not bool(unit.get("alive", false)):
		return false
	unit["hp"] = maxi(0, int(unit["hp"]) - amount)
	if int(unit["hp"]) <= 0:
		unit["alive"] = false
	units[index] = unit
	if not bool(unit["alive"]) and String(unit["type"]) == "command":
		var winner_team := int((units[attacker] as Dictionary)["team"]) if attacker >= 0 \
			and attacker < units.size() else 1 - int(unit["team"])
		_complete_match(winner_team)
	return true


func capture_supply_for_unit(index: int) -> bool:
	if index < 0 or index >= units.size():
		return false
	var unit: Dictionary = units[index]
	var cell: Vector2i = unit["cell"]
	if int(terrain[cell.y][cell.x]) != SUPPLY:
		return false
	supply_owners[_cell_key(cell)] = int(unit["team"])
	return true


func end_turn() -> bool:
	if finished:
		return false
	_process_supply(current_team)
	current_team = 1 - current_team
	if current_team == 0:
		turn_number += 1
	for index in units.size():
		var unit: Dictionary = units[index]
		if bool(unit.get("alive", false)) and int(unit["team"]) == current_team:
			unit["ap"] = 2
			units[index] = unit
	selected_unit = -1
	var command := command_unit(current_team)
	if command >= 0:
		cursor = (units[command] as Dictionary)["cell"]
	return true


func _process_supply(team: int) -> void:
	for key in supply_owners:
		if int(supply_owners[key]) == team:
			team_supply[team] += 10
	for index in units.size():
		var unit: Dictionary = units[index]
		if not bool(unit.get("alive", false)) or int(unit["team"]) != team:
			continue
		var cell: Vector2i = unit["cell"]
		if int(supply_owners.get(_cell_key(cell), -1)) == team:
			unit["hp"] = mini(int(unit["max_hp"]), int(unit["hp"]) + 2)
			units[index] = unit


func run_ai_turn() -> bool:
	if finished or not bool(team_ai[current_team]):
		return false
	var team := current_team
	for index in units.size():
		var unit: Dictionary = units[index]
		if not bool(unit.get("alive", false)) or int(unit["team"]) != team:
			continue
		var target := _nearest_enemy(index)
		if target < 0:
			continue
		if attack_unit(index, target):
			continue
		var target_cell: Vector2i = (units[target] as Dictionary)["cell"]
		var origin: Vector2i = unit["cell"]
		var delta := target_cell - origin
		var step := Vector2i(signi(delta.x), 0) if abs(delta.x) >= abs(delta.y) \
			else Vector2i(0, signi(delta.y))
		var destination := origin + step
		if unit_at(destination) < 0 and _inside(destination):
			move_unit(index, destination)
	end_turn()
	return true


func _nearest_enemy(index: int) -> int:
	var best := -1
	var best_distance := 999
	var source: Dictionary = units[index]
	var origin: Vector2i = source["cell"]
	for other in units.size():
		var candidate: Dictionary = units[other]
		if not bool(candidate.get("alive", false)) or int(candidate["team"]) == int(source["team"]):
			continue
		var cell: Vector2i = candidate["cell"]
		var distance := absi(cell.x - origin.x) + absi(cell.y - origin.y)
		if String(candidate["type"]) == "command":
			distance -= 1
		if distance < best_distance:
			best_distance = distance
			best = other
	return best


func apply_event(event: Dictionary) -> void:
	var event_id := String(event.get("event_id", ""))
	if event_id == "" or seen_events.has(event_id) or finished:
		return
	seen_events[event_id] = true
	match String(event.get("type", "")):
		"move":
			var to: Array = event.get("to", [])
			if to.size() == 2:
				move_unit(int(event.get("unit", -1)), Vector2i(int(to[0]), int(to[1])))
		"attack":
			attack_unit(int(event.get("unit", -1)), int(event.get("target", -1)))
		"end":
			end_turn()
	_render()


func _new_event(type: String, payload: Dictionary) -> Dictionary:
	_event_counter += 1
	var event := payload.duplicate(true)
	event["type"] = type
	event["event_id"] = "%s:%d:%d" % [_session_id, turn_number, _event_counter]
	return event


func command_unit(team: int) -> int:
	for index in units.size():
		var unit: Dictionary = units[index]
		if int(unit["team"]) == team and String(unit["type"]) == "command":
			return index
	return -1


func unit_at(cell: Vector2i) -> int:
	for index in units.size():
		var unit: Dictionary = units[index]
		if bool(unit.get("alive", false)) and unit.get("cell") == cell:
			return index
	return -1


func _complete_match(winner_team: int) -> void:
	if finished:
		return
	team_wins[winner_team] += 1
	finish_match({"primary": team_wins[winner_team],
		"secondary": {"winner_team": winner_team, "turns": turn_number,
			"supply": team_supply[winner_team]}, "outcome": "complete", "ranked": true})


func _snapshot_for_team(team: int, snapshots: Array) -> Dictionary:
	var seat_id := team
	for seat_value in seats:
		var seat: Dictionary = seat_value
		if int(seat.get("team", int(seat.get("seat", 0)))) == team:
			seat_id = int(seat.get("seat", team))
			break
	for value in snapshots:
		var input: Dictionary = value
		if int(input.get("seat", -1)) == seat_id:
			return input
	return {}


func _inside(cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.y >= 0 and cell.x < GRID_WIDTH and cell.y < GRID_HEIGHT


func _cell_key(cell: Vector2i) -> String:
	return "%d,%d" % [cell.x, cell.y]


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["terrain"] = terrain.duplicate(true)
	state["units"] = units.duplicate(true)
	state["team_ai"] = team_ai.duplicate()
	state["team_supply"] = team_supply.duplicate()
	state["team_wins"] = team_wins.duplicate()
	state["supply_owners"] = supply_owners.duplicate(true)
	state["current_team"] = current_team
	state["turn_number"] = turn_number
	state["cursor"] = cursor
	state["selected_unit"] = selected_unit
	state["seen_events"] = seen_events.duplicate(true)
	state["event_counter"] = _event_counter
	state["rng_state"] = _rng.state
	state["last_result"] = last_result.duplicate(true)
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	terrain = (state.get("terrain", terrain) as Array).duplicate(true)
	units = (state.get("units", units) as Array).duplicate(true)
	team_ai.assign(state.get("team_ai", team_ai))
	team_supply.assign(state.get("team_supply", team_supply))
	team_wins.assign(state.get("team_wins", team_wins))
	supply_owners = (state.get("supply_owners", supply_owners) as Dictionary).duplicate(true)
	current_team = int(state.get("current_team", current_team))
	turn_number = int(state.get("turn_number", turn_number))
	cursor = state.get("cursor", cursor)
	selected_unit = int(state.get("selected_unit", selected_unit))
	seen_events = (state.get("seen_events", seen_events) as Dictionary).duplicate(true)
	_event_counter = int(state.get("event_counter", _event_counter))
	_rng.state = int(state.get("rng_state", _rng.state))
	last_result = (state.get("last_result", last_result) as Dictionary).duplicate(true)
	_render()


func debug_force_finish() -> bool:
	if finished:
		return false
	_complete_match(0)
	_render()
	return finished


func _render() -> void:
	if _status != null:
		_status.text = "TEAM %d  //  TURN %03d  //  SUPPLY %03d : %03d  //  AP-BASED ORDERS" % [
			current_team + 1, turn_number, team_supply[0], team_supply[1]]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	for y in terrain.size():
		for x in (terrain[y] as Array).size():
			var kind := int(terrain[y][x])
			var rect := Rect2(GRID_ORIGIN + Vector2(x, y) * CELL_SIZE,
				Vector2.ONE * (CELL_SIZE - 2.0))
			var color := Color("3d3a2c")
			if kind == RUBBLE:
				color = Color("59463a")
			elif kind == RIDGE:
				color = Color("4d5546")
			elif kind == SUPPLY:
				color = Color("64562e")
			draw_rect(rect, color, true)
			draw_rect(rect, Color("29271f"), false, 1.0)
			if kind == RIDGE:
				draw_line(rect.position + Vector2(6, 52), rect.position + Vector2(34, 15), Draw.SIGNAL, 3.0)
			elif kind == RUBBLE:
				draw_circle(rect.get_center(), 12, Draw.RUST.darkened(0.25))
			elif kind == SUPPLY:
				draw_rect(Rect2(rect.get_center() - Vector2(9, 13), Vector2(18, 26)), Draw.AMBER, true)
	for index in units.size():
		var unit: Dictionary = units[index]
		if not bool(unit.get("alive", false)):
			continue
		var center := GRID_ORIGIN + (Vector2(Vector2i(unit["cell"])) + Vector2.ONE * 0.5) * CELL_SIZE
		var color := Draw.AMBER if int(unit["team"]) == 0 else Draw.RUST
		match String(unit["type"]):
			"command":
				draw_colored_polygon(PackedVector2Array([center + Vector2(0, -24), center + Vector2(24, 18),
					center - Vector2(24, -18)]), color)
			"armor":
				draw_rect(Rect2(center - Vector2(23, 16), Vector2(46, 32)), color, true)
				draw_line(center, center + Vector2(28 if int(unit["team"]) == 0 else -28, 0), Draw.BONE, 5.0)
			"artillery":
				draw_circle(center, 19, color)
				draw_line(center, center + Vector2(30 if int(unit["team"]) == 0 else -30, -12), Draw.BONE, 6.0)
			_:
				draw_circle(center, 18, color)
				draw_rect(Rect2(center - Vector2(8, 8), Vector2(16, 16)), Draw.INK, true)
		draw_rect(Rect2(center + Vector2(-24, 25), Vector2(48, 4)), Draw.RUST, true)
		draw_rect(Rect2(center + Vector2(-24, 25),
			Vector2(48.0 * float(unit["hp"]) / float(unit["max_hp"]), 4)), color, true)
		for ap_index in int(unit.get("ap", 0)):
			draw_circle(center + Vector2(-7 + ap_index * 14, -28), 4, Draw.BONE)
	var cursor_center := GRID_ORIGIN + (Vector2(cursor) + Vector2.ONE * 0.5) * CELL_SIZE
	draw_rect(Rect2(cursor_center - Vector2.ONE * 31, Vector2.ONE * 62), Draw.BONE, false, 3.0)
	if selected_unit >= 0 and selected_unit < units.size():
		var selected_center := GRID_ORIGIN + (Vector2(Vector2i((units[selected_unit] as Dictionary)["cell"]))
			+ Vector2.ONE * 0.5) * CELL_SIZE
		draw_arc(selected_center, 29, 0, TAU, 24, Draw.SIGNAL, 4.0)
