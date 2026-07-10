## BLACK GRID — original clean-room Continuity combined-arms simulation.
## Player-facing genre relationships only; no Infantry/FreeInfantry code,
## zones, maps, names, art, audio, silhouettes, branding, or prose are used.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/console/console_draw.gd")
const Kernel = preload("res://proto3d/games/shooter/shooter_kernel.gd")
const ZONE_PATH := "res://data/black_grid_zones.json"
const STEP := 1.0 / 30.0
const RUN_SPEED := 260.0
const BOOST_SPEED := 390.0
const BOOST_TICKS := 8
const BOOST_COST := 24.0
const ENERGY_REGEN := 1.2
const DRAG := 280.0
const CLOSE_DARK_REVEAL := 105.0
const RADAR_GRID := 64.0

const CLASSES: Dictionary = {
	"scout": {"base_mass":18.0,"max_speed":260.0,"acceleration":980.0,"loadout_cap":55.0,
		"hp":82.0,"armor":12.0,"energy":125.0,"vision":390.0,"radar":610.0},
	"medic": {"base_mass":24.0,"max_speed":235.0,"acceleration":860.0,"loadout_cap":68.0,
		"hp":96.0,"armor":22.0,"energy":115.0,"vision":350.0,"radar":540.0},
	"engineer": {"base_mass":30.0,"max_speed":220.0,"acceleration":780.0,"loadout_cap":84.0,
		"hp":104.0,"armor":34.0,"energy":135.0,"vision":330.0,"radar":570.0},
	"heavy": {"base_mass":42.0,"max_speed":190.0,"acceleration":640.0,"loadout_cap":110.0,
		"hp":128.0,"armor":68.0,"energy":92.0,"vision":300.0,"radar":470.0},
}
const EQUIPMENT_WEIGHTS: Dictionary = {
	"armor_plate":18.0,"power_cell":12.0,"sensor_pack":8.0,
	"repair_kit":11.0,"turret_pack":24.0,"barricade_pack":16.0,
}

var combat: RefCounted = null
var actors: Array = []
var current_zone: Dictionary = {}
var walls: Array[Rect2] = []
var darkness: Array[Rect2] = []
var capture_nodes: Array = []
var vehicle_pads: Array = []
var mode := "skirmish"
var objective_score: Dictionary = {"team:0": 0, "team:1": 0}
var _visible: Dictionary = {}
var _radar: Dictionary = {}
var _status: Label = null
var _tactical_label: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "BLACK GRID", "CONTINUITY FIELD DOCTRINE // THE MAP ONLY SHOWS WHAT YOU KNOW")
	_status = Draw.status(self)
	_tactical_label = Draw.label("", 14, Color("9bbf9b"), HORIZONTAL_ALIGNMENT_RIGHT)
	_tactical_label.name = "TacticalStatus"
	_tactical_label.position = Vector2(930, 112)
	_tactical_label.size = Vector2(280, 180)
	add_child(_tactical_label)
	queue_redraw()


static func load_zone_rows(path: String = ZONE_PATH) -> Dictionary:
	var out := {}
	if not FileAccess.file_exists(path):
		return out
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not parsed is Dictionary:
		return out
	for value in (parsed as Dictionary).get("zones", []):
		var row: Dictionary = value
		var id := String(row.get("id", ""))
		if id != "" and not out.has(id):
			out[id] = row.duplicate(true)
	return out


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	mode = String(context.get("mode", "skirmish"))
	var zones := load_zone_rows()
	var zone_id := String(context.get("zone_id", "relay_fall"))
	current_zone = (zones.get(zone_id, zones.get("relay_fall", {})) as Dictionary).duplicate(true)
	_build_zone_state()
	combat = Kernel.new()
	combat.configure(Kernel.load_weapon_rows(), new_seed,
		_rect_from(current_zone.get("bounds", [60, 110, 1160, 520])), walls)
	actors.clear()
	_visible.clear()
	_radar.clear()
	objective_score = {"team:0": 0, "team:1": 0}
	var actor_count := clampi(int(context.get("actor_count", maxi(2, new_seats.size()))), 2, 16)
	for index in actor_count:
		var team := index % 2
		var spawn_rows: Array = (current_zone.get("spawns", {}) as Dictionary).get("team_%d" % team, [])
		var spawn := _vec_from(spawn_rows[int(index / 2) % spawn_rows.size()])
		var class_id: String = "scout" if index == 0 else String(
			["heavy", "engineer", "medic", "scout"][index % 4])
		var class_row: Dictionary = CLASSES[class_id]
		combat.add_actor({"id":index,"team":team,"pos":spawn,"hit_pos":spawn,
			"velocity":Vector2.ZERO,"hp":float(class_row["hp"]),"max_hp":float(class_row["hp"]),
			"armor":float(class_row["armor"]),"radius":13.0,"alive":true,
			"ai":index >= new_seats.size(),"class_id":class_id,"stance":"mobile",
			"aim":Vector2.RIGHT if team == 0 else Vector2.LEFT,"boost_ticks":0,
			"energy":float(class_row["energy"]),"max_energy":float(class_row["energy"]),
			"loadout":[],"active_weapon":"","active_slot":0,
			"visible_contacts":{},"radar_contacts":{},"objective_score":0})
		actors.append(combat.actor_state(index))
		var stock := ["bg_pulse_carbine", "bg_rail_lance", "sensor_pack"] \
			if class_id == "scout" else ["bg_pulse_carbine", "armor_plate", "power_cell"]
		_set_loadout(index, class_id, stock)
	for index in actors.size():
		_update_visibility(index)
	_render()


func _build_zone_state() -> void:
	walls.clear()
	darkness.clear()
	capture_nodes = (current_zone.get("capture_nodes", []) as Array).duplicate(true)
	vehicle_pads = (current_zone.get("vehicle_pads", []) as Array).duplicate(true)
	for value in current_zone.get("walls", []):
		walls.append(_rect_from(value))
	for value in current_zone.get("darkness", []):
		darkness.append(_rect_from(value))
	for node_value in capture_nodes:
		var node: Dictionary = node_value
		node["pos"] = _vec_from(node.get("pos", [640, 360]))
		node["owner"] = -1
	for pad_value in vehicle_pads:
		var pad: Dictionary = pad_value
		pad["pos"] = _vec_from(pad.get("pos", [640, 560]))


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished:
		return
	tick = maxi(tick, new_tick)
	for index in actors.size():
		var actor: Dictionary = actors[index]
		if not bool(actor.get("alive", false)):
			continue
		var input: Dictionary = _ai_snapshot(index) if bool(actor.get("ai", false)) \
			else _snapshot_for_actor(index, snapshots)
		_apply_actor_input(index, input)
		_step_actor_motion(index)
	combat.step()
	for index in actors.size():
		var actor: Dictionary = actors[index]
		if int(actor.get("boost_ticks", 0)) > 0:
			actor["boost_ticks"] = int(actor["boost_ticks"]) - 1
		else:
			actor["energy"] = minf(float(actor.get("max_energy", 100.0)),
				float(actor.get("energy", 0.0)) + ENERGY_REGEN)
		_update_visibility(index)
	_render()


func _apply_actor_input(index: int, input: Dictionary) -> void:
	var actor: Dictionary = actors[index]
	var move: Vector2 = input.get("move", Vector2.ZERO)
	var aim: Vector2 = input.get("aim", Vector2.ZERO)
	var held: Dictionary = input.get("held", {})
	var pressed: Dictionary = input.get("pressed", {})
	if aim.length_squared() > 0.001:
		actor["aim"] = aim.normalized()
	actor["stance"] = "braced" if bool(held.get("stance", false)) else "mobile"
	_recalculate_stats(actor)
	if bool(pressed.get("mobility", false)) and float(actor.get("energy", 0.0)) >= BOOST_COST:
		var boost_direction := move.normalized() if move.length_squared() > 0.01 else Vector2(actor.get("aim", Vector2.RIGHT))
		actor["velocity"] = boost_direction * BOOST_SPEED
		actor["energy"] = float(actor["energy"]) - BOOST_COST
		actor["boost_ticks"] = BOOST_TICKS
	else:
		var velocity: Vector2 = actor.get("velocity", Vector2.ZERO)
		var desired := move.normalized() * float(actor.get("max_speed", RUN_SPEED)) \
			if move.length_squared() > 0.01 else Vector2.ZERO
		var rate := float(actor.get("acceleration", 700.0)) if not desired.is_zero_approx() else DRAG
		velocity = velocity.move_toward(desired, rate * STEP)
		actor["velocity"] = velocity
	if bool(pressed.get("weapon_prev", false)):
		_cycle_weapon(actor, -1)
	if bool(pressed.get("weapon_next", false)):
		_cycle_weapon(actor, 1)
	if bool(pressed.get("reload", false)):
		combat.start_reload(index, String(actor.get("active_weapon", "")))
	if bool(pressed.get("primary", false)):
		combat.fire(index, String(actor.get("active_weapon", "")),
			Vector2(actor.get("pos", Vector2.ZERO)), Vector2(actor.get("aim", Vector2.RIGHT)))


func _step_actor_motion(index: int) -> void:
	var actor: Dictionary = actors[index]
	var old_pos: Vector2 = actor.get("pos", Vector2.ZERO)
	var velocity: Vector2 = actor.get("velocity", Vector2.ZERO)
	var next := old_pos + velocity * STEP
	var field := _rect_from(current_zone.get("bounds", [60, 110, 1160, 520]))
	next.x = clampf(next.x, field.position.x + 13.0, field.end.x - 13.0)
	next.y = clampf(next.y, field.position.y + 13.0, field.end.y - 13.0)
	for wall in walls:
		if wall.grow(float(actor.get("radius", 13.0))).has_point(next):
			var x_only := Vector2(next.x, old_pos.y)
			var y_only := Vector2(old_pos.x, next.y)
			if not wall.grow(float(actor.get("radius", 13.0))).has_point(x_only):
				next = x_only
				velocity.y = 0.0
			elif not wall.grow(float(actor.get("radius", 13.0))).has_point(y_only):
				next = y_only
				velocity.x = 0.0
			else:
				next = old_pos
				velocity = Vector2.ZERO
		actor["pos"] = next
		actor["hit_pos"] = next
		actor["velocity"] = velocity


func _set_loadout(index: int, class_id: String, loadout: Array) -> bool:
	if index < 0 or index >= actors.size() or not CLASSES.has(class_id):
		return false
	var class_row: Dictionary = CLASSES[class_id]
	var weight := 0.0
	var weapon_rows: Dictionary = combat.weapon_rows
	for item_value in loadout:
		var item_id := String(item_value)
		if weapon_rows.has(item_id):
			weight += float((weapon_rows[item_id] as Dictionary).get("weight", 0.0))
		elif EQUIPMENT_WEIGHTS.has(item_id):
			weight += float(EQUIPMENT_WEIGHTS[item_id])
		else:
			return false
	if weight > float(class_row.get("loadout_cap", 0.0)):
		return false
	var actor: Dictionary = actors[index]
	actor["class_id"] = class_id
	actor["loadout"] = loadout.duplicate()
	actor["loadout_weight"] = weight
	actor["weapons"] = {}
	var weapon_ids: Array = loadout.filter(func(item: Variant) -> bool:
		return weapon_rows.has(String(item)))
	combat.equip(index, weapon_ids)
	actor["active_slot"] = 0
	actor["active_weapon"] = String(weapon_ids[0]) if not weapon_ids.is_empty() else ""
	actor["hp"] = minf(float(actor.get("hp", class_row["hp"])), float(class_row["hp"]))
	actor["max_hp"] = float(class_row["hp"])
	actor["armor"] = float(class_row["armor"]) + float(loadout.count("armor_plate")) * 24.0
	actor["max_energy"] = float(class_row["energy"]) + float(loadout.count("power_cell")) * 30.0
	actor["energy"] = float(actor["max_energy"])
	_recalculate_stats(actor)
	return true


func _recalculate_stats(actor: Dictionary) -> void:
	var class_row: Dictionary = CLASSES[String(actor.get("class_id", "scout"))]
	var total_mass := float(class_row["base_mass"]) + float(actor.get("loadout_weight", 0.0))
	var excess := maxf(0.0, total_mass - float(class_row["base_mass"]))
	actor["total_mass"] = total_mass
	actor["acceleration"] = float(class_row["acceleration"]) / (1.0 + excess * 0.018)
	actor["max_speed"] = float(class_row["max_speed"]) / (1.0 + excess * 0.008)
	if String(actor.get("stance", "mobile")) == "braced":
		actor["max_speed"] = float(actor["max_speed"]) * 0.72
		actor["acceleration"] = float(actor["acceleration"]) * 0.78
	actor["vision_range"] = float(class_row["vision"])
	actor["radar_range"] = float(class_row["radar"]) + (120.0 if (actor.get("loadout", []) as Array).has("sensor_pack") else 0.0)


func _cycle_weapon(actor: Dictionary, direction: int) -> void:
	var weapons: Array = (actor.get("loadout", []) as Array).filter(func(item: Variant) -> bool:
		return combat.weapon_rows.has(String(item)))
	if weapons.is_empty():
		actor["active_weapon"] = ""
		return
	actor["active_slot"] = posmod(int(actor.get("active_slot", 0)) + direction, weapons.size())
	actor["active_weapon"] = String(weapons[int(actor["active_slot"])])


func _update_visibility(viewer_id: int) -> void:
	if viewer_id < 0 or viewer_id >= actors.size():
		return
	var viewer: Dictionary = actors[viewer_id]
	var exact := {}
	var radar := {}
	var origin: Vector2 = viewer.get("pos", Vector2.ZERO)
	for target_id in actors.size():
		if target_id == viewer_id:
			continue
		var target: Dictionary = actors[target_id]
		if not bool(target.get("alive", false)) or int(target.get("team", -1)) == int(viewer.get("team", -2)):
			continue
		var target_pos: Vector2 = target.get("pos", Vector2.ZERO)
		var distance := origin.distance_to(target_pos)
		if distance <= float(viewer.get("radar_range", 0.0)):
			radar[target_id] = Vector2(roundf(target_pos.x / RADAR_GRID) * RADAR_GRID,
				roundf(target_pos.y / RADAR_GRID) * RADAR_GRID)
		var in_dark := darkness.any(func(rect: Rect2) -> bool: return rect.has_point(target_pos))
		if distance <= float(viewer.get("vision_range", 0.0)) and not _line_blocked(origin, target_pos) \
				and (not in_dark or distance <= CLOSE_DARK_REVEAL):
			exact[target_id] = target_pos
	_visible[viewer_id] = exact
	_radar[viewer_id] = radar
	viewer["visible_contacts"] = exact
	viewer["radar_contacts"] = radar


func _line_blocked(start: Vector2, finish: Vector2) -> bool:
	for wall in walls:
		var points := [wall.position, Vector2(wall.end.x, wall.position.y),
			wall.end, Vector2(wall.position.x, wall.end.y)]
		for edge in 4:
			if Geometry2D.segment_intersects_segment(start, finish, points[edge], points[(edge + 1) % 4]) != null:
				return true
	return false


func _snapshot_for_actor(index: int, snapshots: Array) -> Dictionary:
	if index >= seats.size():
		return {}
	var wanted := int((seats[index] as Dictionary).get("seat", index))
	for value in snapshots:
		var input: Dictionary = value
		if int(input.get("seat", -1)) == wanted:
			return input
	return {}


func _ai_snapshot(_index: int) -> Dictionary:
	return {} if not bool(context.get("bots_enabled", true)) else {}


func actor_state(index: int) -> Dictionary:
	return actors[index] if index >= 0 and index < actors.size() else {}


func weapon_state(index: int, weapon_id: String) -> Dictionary:
	if index < 0 or index >= actors.size():
		return {}
	return ((actors[index] as Dictionary).get("weapons", {}) as Dictionary).get(weapon_id, {})


func place_actor_for_test(index: int, pos: Vector2, velocity: Vector2) -> void:
	var actor := actor_state(index)
	actor["pos"] = pos
	actor["hit_pos"] = pos
	actor["velocity"] = velocity


func set_loadout_for_test(index: int, class_id: String, loadout: Array) -> bool:
	return _set_loadout(index, class_id, loadout)


func set_active_weapon_for_test(index: int, weapon_id: String) -> bool:
	var state := weapon_state(index, weapon_id)
	if state.is_empty():
		return false
	var actor := actor_state(index)
	actor["active_weapon"] = weapon_id
	return true


func fire_weapon_for_test(index: int, weapon_id: String, direction: Vector2,
		extra: Dictionary = {}) -> Dictionary:
	if weapon_state(index, weapon_id).is_empty():
		return {}
	return combat.fire(index, weapon_id, Vector2(actor_state(index).get("pos", Vector2.ZERO)),
		direction, extra)


func step_without_input(count: int) -> void:
	for _index in maxi(0, count):
		apply_inputs(tick + 1, [])


func update_visibility_for_test(index: int) -> void:
	_update_visibility(index)


func visible_contacts(index: int) -> Dictionary:
	return _visible.get(index, {})


func radar_contacts(index: int) -> Dictionary:
	return _radar.get(index, {})


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["mode"] = mode
	state["zone_id"] = String(current_zone.get("id", ""))
	state["combat"] = combat.snapshot() if combat != null else {}
	state["capture_nodes"] = capture_nodes.duplicate(true)
	state["vehicle_pads"] = vehicle_pads.duplicate(true)
	state["objective_score"] = objective_score.duplicate(true)
	state["visible"] = _visible.duplicate(true)
	state["radar"] = _radar.duplicate(true)
	state["last_result"] = last_result.duplicate(true)
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	mode = String(state.get("mode", mode))
	var zones := load_zone_rows()
	current_zone = (zones.get(String(state.get("zone_id", "relay_fall")), current_zone) as Dictionary).duplicate(true)
	_build_zone_state()
	combat.restore_snapshot(state.get("combat", {}))
	actors.clear()
	var ids: Array = combat.actors.keys()
	ids.sort()
	for id_value in ids:
		actors.append(combat.actor_state(int(id_value)))
	capture_nodes = (state.get("capture_nodes", capture_nodes) as Array).duplicate(true)
	vehicle_pads = (state.get("vehicle_pads", vehicle_pads) as Array).duplicate(true)
	objective_score = (state.get("objective_score", objective_score) as Dictionary).duplicate(true)
	_visible = (state.get("visible", _visible) as Dictionary).duplicate(true)
	_radar = (state.get("radar", _radar) as Dictionary).duplicate(true)
	last_result = (state.get("last_result", last_result) as Dictionary).duplicate(true)
	_render()


func debug_force_finish() -> bool:
	if finished or actors.is_empty():
		return false
	finish_match({"primary": 1, "secondary": {"objective_score": int((actors[0] as Dictionary).get("objective_score", 0)),
		"mode": mode, "zone_id": String(current_zone.get("id", "")), "kills": 0},
		"outcome": "complete", "ranked": true})
	_render()
	return finished


func _rect_from(value: Variant) -> Rect2:
	if value is Rect2:
		return value
	var row: Array = value if value is Array else []
	return Rect2(float(row[0]), float(row[1]), float(row[2]), float(row[3])) \
		if row.size() >= 4 else Rect2()


func _vec_from(value: Variant) -> Vector2:
	if value is Vector2:
		return value
	var row: Array = value if value is Array else []
	return Vector2(float(row[0]), float(row[1])) if row.size() >= 2 else Vector2.ZERO


func _render() -> void:
	if _status != null and not actors.is_empty():
		var rider: Dictionary = actors[0]
		var weapon_id := String(rider.get("active_weapon", ""))
		var weapon := weapon_state(0, weapon_id)
		_status.text = "%s // %s  MASS %03d  ARM %03d  CELL %03d  %s %02d/%03d  HEAT %03d" % [
			mode.to_upper(), String(rider.get("class_id", "scout")).to_upper(),
			int(rider.get("total_mass", 0)), int(rider.get("armor", 0)), int(rider.get("energy", 0)),
			weapon_id.trim_prefix("bg_").replace("_", " ").to_upper(), int(weapon.get("ammo", 0)),
			int(weapon.get("reserve", 0)), int(weapon.get("heat", 0))]
	if _tactical_label != null and not actors.is_empty():
		_tactical_label.text = "EXACT %d\nRADAR %d\nZONE %s\nT0 %d  T1 %d" % [
			visible_contacts(0).size(), radar_contacts(0).size(),
			String(current_zone.get("name", "UNKNOWN")), int(objective_score.get("team:0", 0)),
			int(objective_score.get("team:1", 0))]
	queue_redraw()


func _iso(pos: Vector2) -> Vector2:
	var center := Vector2(640, 375)
	var offset := pos - center
	return center + Vector2(offset.x - offset.y * 0.32, offset.y * 0.62)


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color("0d1511"))
	draw_rect(Rect2(55, 105, 1170, 535), Color("15211b"), true)
	for line in 16:
		var y := 130.0 + line * 31.0
		draw_line(Vector2(75, y), Vector2(1205, y), Color("233a2e"), 1.0)
	for wall in walls:
		var a := _iso(wall.position)
		var b := _iso(Vector2(wall.end.x, wall.position.y))
		var c := _iso(wall.end)
		var d := _iso(Vector2(wall.position.x, wall.end.y))
		draw_colored_polygon(PackedVector2Array([a, b, c, d]), Color("34483b"))
		draw_polyline(PackedVector2Array([a, b, c, d, a]), Color("76a786"), 2.0)
	for rect in darkness:
		var center := _iso(rect.get_center())
		draw_circle(center, minf(rect.size.x, rect.size.y) * 0.22, Color("09100d"))
	for node_value in capture_nodes:
		var node: Dictionary = node_value
		var pos := _iso(Vector2(node.get("pos", Vector2.ZERO)))
		draw_circle(pos, 15, Color("76a786"), false, 3.0)
		draw_line(pos - Vector2(18, 0), pos + Vector2(18, 0), Color("b8d8b8"), 2.0)
	if combat != null:
		for projectile_value in combat.projectiles:
			var projectile: Dictionary = projectile_value
			draw_circle(_iso(Vector2(projectile.get("pos", Vector2.ZERO))), 4,
				Color.from_string(String(projectile.get("color", "#76a786")), Color("76a786")))
	for actor_value in actors:
		var actor: Dictionary = actor_value
		if not bool(actor.get("alive", false)):
			continue
		var pos := _iso(Vector2(actor.get("pos", Vector2.ZERO)))
		var color := Draw.team_color(int(actor.get("team", 0)))
		draw_colored_polygon(PackedVector2Array([pos + Vector2(0, -14), pos + Vector2(13, 5),
			pos + Vector2(0, 14), pos + Vector2(-13, 5)]), color)
		var aim: Vector2 = actor.get("aim", Vector2.RIGHT)
		draw_line(pos, pos + Vector2(aim.x - aim.y * 0.32, aim.y * 0.62).normalized() * 26, Draw.BONE, 3.0)
		if int(actor.get("boost_ticks", 0)) > 0:
			draw_arc(pos, 20, 0, TAU, 16, Color("76a786"), 3.0)
	if not actors.is_empty():
		var viewer_pos := _iso(Vector2((actors[0] as Dictionary).get("pos", Vector2.ZERO)))
		for contact_id in radar_contacts(0):
			if visible_contacts(0).has(contact_id):
				continue
			var contact := _iso(Vector2(radar_contacts(0)[contact_id]))
			draw_dashed_line(viewer_pos, contact, Color("52705c"), 1.0, 10.0)
			draw_circle(contact, 7, Color("52705c"), false, 2.0)
