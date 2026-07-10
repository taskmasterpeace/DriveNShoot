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
const RESPAWN_TICKS := 75
const SPAWN_PROTECTION_TICKS := 30
const OBJECTIVE_SCORE_TICKS := 60
const MODES: Array[String] = ["skirmish", "frontlines", "capture_flag", "bug_hunt", "fleet"]
const DEPLOYABLES: Dictionary = {
	"sensor":{"material":15,"energy":10.0,"hp":55.0,"range":440.0,"requires":"sensor_pack"},
	"barricade":{"material":25,"energy":5.0,"hp":150.0,"range":0.0,"requires":"barricade_pack"},
	"turret":{"material":35,"energy":25.0,"hp":105.0,"range":310.0,"requires":"turret_pack"},
	"repair":{"material":20,"energy":18.0,"hp":80.0,"range":95.0,"requires":"repair_kit"},
}
const VEHICLE_TYPES: Dictionary = {
	"relay_crawler":{"mass":92.0,"max_speed":275.0,"acceleration":430.0,
		"hp":185.0,"armor":70.0,"weapon_id":"bg_pulse_carbine","radius":22.0},
	"switch_skiff":{"mass":148.0,"max_speed":215.0,"acceleration":300.0,
		"hp":265.0,"armor":125.0,"weapon_id":"bg_shard_cannon","radius":28.0},
	"bastion_carrier":{"mass":220.0,"max_speed":165.0,"acceleration":225.0,
		"hp":390.0,"armor":180.0,"weapon_id":"bg_siege_shell","radius":34.0},
}

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
var team_scores: Dictionary = {"team:0": 0, "team:1": 0}
var tickets: Dictionary = {"team:0": 20, "team:1": 20}
var deployables: Array = []
var vehicles: Array = []
var bugs: Array = []
var flags: Array = []
var votes: Dictionary = {}
var next_mode := ""
var score_limit := 10
var time_limit_ticks := 10800
var match_ticks := 0
var objective_tick := 0
var _next_deployable_id := 1
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
	if mode not in MODES:
		mode = "skirmish"
	score_limit = maxi(1, int(context.get("score_limit", 10)))
	time_limit_ticks = maxi(3, int(context.get("time_limit_ticks", 10800)))
	match_ticks = 0
	var zones := load_zone_rows()
	var zone_id := String(context.get("zone_id", "relay_fall"))
	current_zone = (zones.get(zone_id, zones.get("relay_fall", {})) as Dictionary).duplicate(true)
	_build_zone_state()
	combat = Kernel.new()
	combat.configure(Kernel.load_weapon_rows(), new_seed,
		_rect_from(current_zone.get("bounds", [60, 110, 1160, 520])), walls)
	actors.clear()
	deployables.clear()
	vehicles.clear()
	bugs.clear()
	flags.clear()
	votes.clear()
	next_mode = ""
	_next_deployable_id = 1
	objective_tick = 0
	_visible.clear()
	_radar.clear()
	objective_score = {"team:0": 0, "team:1": 0}
	team_scores = {"team:0": 0, "team:1": 0}
	tickets = {"team:0": int(context.get("tickets", 20)),
		"team:1": int(context.get("tickets", 20))}
	var actor_count := clampi(int(context.get("actor_count", maxi(2, new_seats.size()))), 2, 16)
	for index in actor_count:
		var team := 0 if mode == "bug_hunt" else index % 2
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
			"visible_contacts":{},"radar_contacts":{},"objective_score":0,
			"materials":150,"vehicle_id":-1,"kills":0,"deaths":0,"score":0,
			"respawn_ticks":0,"spawn_protection":0})
		actors.append(combat.actor_state(index))
		var stock: Array = _stock_loadout(class_id)
		_set_loadout(index, class_id, stock)
	_spawn_vehicles()
	if mode == "capture_flag":
		_spawn_flags()
	if mode == "bug_hunt":
		_spawn_bugs()
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


func _stock_loadout(class_id: String) -> Array:
	match class_id:
		"engineer":
			return ["bg_pulse_carbine", "turret_pack", "repair_kit", "sensor_pack", "power_cell"]
		"medic":
			return ["bg_pulse_carbine", "repair_kit", "power_cell"]
		"heavy":
			return ["bg_pulse_carbine", "bg_shard_cannon", "armor_plate"]
		_:
			return ["bg_pulse_carbine", "bg_rail_lance", "sensor_pack"]


func _spawn_vehicles() -> void:
	var type_ids: Array[String] = ["relay_crawler", "switch_skiff", "bastion_carrier"]
	for index in vehicle_pads.size():
		var pad: Dictionary = vehicle_pads[index]
		var type_id := type_ids[index % type_ids.size()]
		var type_row: Dictionary = VEHICLE_TYPES[type_id]
		var combat_id := 1000 + index
		var team := index % 2
		var pos: Vector2 = pad.get("pos", Vector2.ZERO)
		combat.add_actor({"id":combat_id,"team":team,"pos":pos,"hit_pos":pos,
			"velocity":Vector2.ZERO,"hp":float(type_row["hp"]),"max_hp":float(type_row["hp"]),
			"armor":float(type_row["armor"]),"radius":float(type_row["radius"]),"alive":true,
			"vehicle":true,"vehicle_id":index,"type_id":type_id,"mass":float(type_row["mass"]),
			"max_speed":float(type_row["max_speed"]),"acceleration":float(type_row["acceleration"]),
			"weapon_id":String(type_row["weapon_id"]),"driver":-1,"gunner":-1})
		combat.equip(combat_id, [String(type_row["weapon_id"])])
		vehicles.append(combat.actor_state(combat_id))


func _spawn_flags() -> void:
	for team in 2:
		var spawn_rows: Array = (current_zone.get("spawns", {}) as Dictionary).get("team_%d" % team, [])
		var home := _vec_from(spawn_rows[0])
		flags.append({"team":team,"home":home,"pos":home,"carrier":-1,"dropped":false})


func _spawn_bugs() -> void:
	var field := _rect_from(current_zone.get("bounds", [60, 110, 1160, 520]))
	var roles: Array[String] = ["charger", "spitter", "guard"]
	for index in 6:
		var bug_id := 2000 + index
		var pos := field.get_center() + Vector2((index % 3 - 1) * 85, (index / 3 * 2 - 1) * 90)
		combat.add_actor({"id":bug_id,"team":9,"pos":pos,"hit_pos":pos,
			"velocity":Vector2.ZERO,"hp":55.0 + float(index % 3) * 18.0,"max_hp":91.0,
			"armor":0.0,"radius":14.0,"alive":true,"bug":true,
			"role":roles[index % roles.size()],"kills":0})
		combat.equip(bug_id, ["bg_bug_spitter"])
		bugs.append(combat.actor_state(bug_id))


func apply_inputs(new_tick: int, snapshots: Array) -> void:
	if not active or paused or finished:
		return
	tick = maxi(tick, new_tick)
	match_ticks += 1
	for index in actors.size():
		var actor: Dictionary = actors[index]
		if not bool(actor.get("alive", false)):
			continue
		var input: Dictionary = _ai_snapshot(index) if bool(actor.get("ai", false)) \
			else _snapshot_for_actor(index, snapshots)
		if int(actor.get("vehicle_id", -1)) >= 0:
			_apply_vehicle_input(index, int(actor["vehicle_id"]), input)
		else:
			_apply_actor_input(index, input)
			_step_actor_motion(index)
	combat.step()
	_sync_actor_deaths()
	_step_deployables()
	_step_bugs()
	_update_mode_objectives()
	for index in actors.size():
		var actor: Dictionary = actors[index]
		if int(actor.get("boost_ticks", 0)) > 0:
			actor["boost_ticks"] = int(actor["boost_ticks"]) - 1
		else:
			actor["energy"] = minf(float(actor.get("max_energy", 100.0)),
				float(actor.get("energy", 0.0)) + ENERGY_REGEN)
		_update_visibility(index)
	if not finished and match_ticks >= time_limit_ticks:
		_finish_mode(_leading_team())
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
	if bool(pressed.get("secondary", false)):
		var equipment := String(actor.get("active_equipment", ""))
		var deploy_type: String = {"sensor_pack":"sensor","barricade_pack":"barricade",
			"turret_pack":"turret","repair_kit":"repair"}.get(equipment, "")
		if deploy_type != "":
			place_deployable(index, String(deploy_type),
				Vector2(actor.get("pos", Vector2.ZERO)) + Vector2(actor.get("aim", Vector2.RIGHT)) * 34.0)
	if bool(pressed.get("interact", false)):
		enter_nearest_vehicle(index)


func _step_actor_motion(index: int) -> void:
	var actor: Dictionary = actors[index]
	var old_pos: Vector2 = actor.get("pos", Vector2.ZERO)
	var velocity: Vector2 = actor.get("velocity", Vector2.ZERO)
	var next := old_pos + velocity * STEP
	var field := _rect_from(current_zone.get("bounds", [60, 110, 1160, 520]))
	next.x = clampf(next.x, field.position.x + 13.0, field.end.x - 13.0)
	next.y = clampf(next.y, field.position.y + 13.0, field.end.y - 13.0)
	for wall in _active_collision_rects():
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


func _active_collision_rects() -> Array[Rect2]:
	var out := walls.duplicate()
	for deployable_value in deployables:
		var deployable: Dictionary = deployable_value
		if String(deployable.get("type", "")) == "barricade" and float(deployable.get("hp", 0.0)) > 0.0:
			var pos: Vector2 = deployable.get("pos", Vector2.ZERO)
			out.append(Rect2(pos - Vector2(15, 35), Vector2(30, 70)))
	return out


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
	var equipment_ids: Array = loadout.filter(func(item: Variant) -> bool:
		return EQUIPMENT_WEIGHTS.has(String(item)) and String(item) != "armor_plate" \
			and String(item) != "power_cell")
	actor["active_equipment"] = String(equipment_ids[0]) if not equipment_ids.is_empty() else ""
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


func place_deployable(actor_id: int, type_id: String, pos: Vector2) -> int:
	if actor_id < 0 or actor_id >= actors.size() or not DEPLOYABLES.has(type_id):
		return -1
	var actor: Dictionary = actors[actor_id]
	var spec: Dictionary = DEPLOYABLES[type_id]
	if not (actor.get("loadout", []) as Array).has(String(spec.get("requires", ""))) \
			or int(actor.get("materials", 0)) < int(spec.get("material", 0)) \
			or float(actor.get("energy", 0.0)) < float(spec.get("energy", 0.0)):
		return -1
	var field := _rect_from(current_zone.get("bounds", [60, 110, 1160, 520]))
	if not field.grow(-20.0).has_point(pos) or walls.any(func(wall: Rect2) -> bool:
		return wall.grow(12.0).has_point(pos)):
		return -1
	actor["materials"] = int(actor["materials"]) - int(spec.get("material", 0))
	actor["energy"] = float(actor["energy"]) - float(spec.get("energy", 0.0))
	deployables.append({"id":_next_deployable_id,"type":type_id,"owner":actor_id,
		"team":int(actor.get("team", 0)),"pos":pos,"hp":float(spec.get("hp", 50.0)),
		"max_hp":float(spec.get("hp", 50.0)),"range":float(spec.get("range", 0.0)),
		"cooldown":0})
	_next_deployable_id += 1
	_rebuild_combat_walls()
	return deployables.size() - 1


func _step_deployables() -> void:
	for deployable_value in deployables:
		var deployable: Dictionary = deployable_value
		deployable["cooldown"] = maxi(0, int(deployable.get("cooldown", 0)) - 1)
		var type_id := String(deployable.get("type", ""))
		if type_id == "turret" and int(deployable["cooldown"]) == 0:
			var target := _nearest_enemy_to(int(deployable.get("team", 0)),
				Vector2(deployable.get("pos", Vector2.ZERO)), float(deployable.get("range", 0.0)))
			if target >= 0:
				var direction := (Vector2((actors[target] as Dictionary).get("pos", Vector2.ZERO))
					- Vector2(deployable.get("pos", Vector2.ZERO))).normalized()
				combat.damage_actor(target, 9.0, 0.08, direction, 8.0,
					int(deployable.get("owner", -1)))
				deployable["cooldown"] = 15
		elif type_id == "repair" and posmod(tick, 10) == 0:
			for actor_value in actors:
				var actor: Dictionary = actor_value
				if bool(actor.get("alive", false)) and int(actor.get("team", -1)) == int(deployable.get("team", -2)) \
						and Vector2(actor.get("pos", Vector2.ZERO)).distance_to(
							Vector2(deployable.get("pos", Vector2.ZERO))) <= float(deployable.get("range", 0.0)):
					actor["hp"] = minf(float(actor.get("max_hp", 100.0)), float(actor.get("hp", 0.0)) + 4.0)
			for vehicle_value in vehicles:
				var vehicle: Dictionary = vehicle_value
				if bool(vehicle.get("alive", false)) and int(vehicle.get("team", -1)) == int(deployable.get("team", -2)) \
						and Vector2(vehicle.get("pos", Vector2.ZERO)).distance_to(
							Vector2(deployable.get("pos", Vector2.ZERO))) <= float(deployable.get("range", 0.0)):
					vehicle["hp"] = minf(float(vehicle.get("max_hp", 100.0)), float(vehicle.get("hp", 0.0)) + 3.0)


func damage_deployable(index: int, amount: float, _attacker: int) -> bool:
	if index < 0 or index >= deployables.size() or amount <= 0.0:
		return false
	var deployable: Dictionary = deployables[index]
	deployable["hp"] = maxf(0.0, float(deployable.get("hp", 0.0)) - amount)
	if float(deployable["hp"]) <= 0.0:
		deployables.remove_at(index)
		_rebuild_combat_walls()
	return true


func _rebuild_combat_walls() -> void:
	if combat == null:
		return
	combat.walls = _active_collision_rects()


func _apply_vehicle_input(actor_id: int, vehicle_id: int, input: Dictionary) -> void:
	if vehicle_id < 0 or vehicle_id >= vehicles.size():
		return
	var actor: Dictionary = actors[actor_id]
	var vehicle: Dictionary = vehicles[vehicle_id]
	if not bool(vehicle.get("alive", false)):
		exit_vehicle(actor_id)
		return
	var move: Vector2 = input.get("move", Vector2.ZERO)
	var aim: Vector2 = input.get("aim", Vector2.ZERO)
	var pressed: Dictionary = input.get("pressed", {})
	if aim.length_squared() > 0.001:
		vehicle["aim"] = aim.normalized()
	var velocity: Vector2 = vehicle.get("velocity", Vector2.ZERO)
	var desired := move.normalized() * float(vehicle.get("max_speed", 180.0)) \
		if move.length_squared() > 0.01 else Vector2.ZERO
	var coast_drag := 40.0 * 92.0 / maxf(60.0, float(vehicle.get("mass", 92.0)))
	velocity = velocity.move_toward(desired,
		(float(vehicle.get("acceleration", 250.0)) if not desired.is_zero_approx() else coast_drag) * STEP)
	var old_pos: Vector2 = vehicle.get("pos", Vector2.ZERO)
	var next := old_pos + velocity * STEP
	var field := _rect_from(current_zone.get("bounds", [60, 110, 1160, 520]))
	next.x = clampf(next.x, field.position.x + 30.0, field.end.x - 30.0)
	next.y = clampf(next.y, field.position.y + 30.0, field.end.y - 30.0)
	if _active_collision_rects().any(func(rect: Rect2) -> bool:
		return rect.grow(float(vehicle.get("radius", 24.0))).has_point(next)):
		next = old_pos
		velocity *= 0.35
	vehicle["pos"] = next
	vehicle["hit_pos"] = next
	vehicle["velocity"] = velocity
	actor["pos"] = next
	actor["hit_pos"] = next
	actor["velocity"] = velocity
	if bool(pressed.get("primary", false)):
		_fire_vehicle(vehicle_id, Vector2(vehicle.get("aim", actor.get("aim", Vector2.RIGHT))))
	if bool(pressed.get("interact", false)):
		exit_vehicle(actor_id)


func enter_nearest_vehicle(actor_id: int) -> bool:
	if actor_id < 0 or actor_id >= actors.size():
		return false
	var actor: Dictionary = actors[actor_id]
	if int(actor.get("vehicle_id", -1)) >= 0:
		return false
	var best := -1
	var best_distance := INF
	for index in vehicles.size():
		var vehicle: Dictionary = vehicles[index]
		if not bool(vehicle.get("alive", false)) or int(vehicle.get("driver", -1)) >= 0 \
				or int(vehicle.get("team", -1)) != int(actor.get("team", -2)):
			continue
		var distance := Vector2(actor.get("pos", Vector2.ZERO)).distance_to(Vector2(vehicle.get("pos", Vector2.ZERO)))
		if distance <= 42.0 and distance < best_distance:
			best_distance = distance
			best = index
	if best < 0:
		return false
	var chosen: Dictionary = vehicles[best]
	chosen["driver"] = actor_id
	actor["vehicle_id"] = best
	actor["pos"] = Vector2(chosen.get("pos", Vector2.ZERO))
	actor["hit_pos"] = actor["pos"]
	return true


func exit_vehicle(actor_id: int) -> bool:
	if actor_id < 0 or actor_id >= actors.size():
		return false
	var actor: Dictionary = actors[actor_id]
	var vehicle_id := int(actor.get("vehicle_id", -1))
	if vehicle_id < 0 or vehicle_id >= vehicles.size():
		return false
	var vehicle: Dictionary = vehicles[vehicle_id]
	vehicle["driver"] = -1
	actor["vehicle_id"] = -1
	actor["pos"] = Vector2(vehicle.get("pos", Vector2.ZERO)) + Vector2(0, 36)
	actor["hit_pos"] = actor["pos"]
	actor["velocity"] = Vector2(vehicle.get("velocity", Vector2.ZERO)) * 0.35
	return true


func _fire_vehicle(vehicle_id: int, direction: Vector2) -> bool:
	if vehicle_id < 0 or vehicle_id >= vehicles.size():
		return false
	var vehicle: Dictionary = vehicles[vehicle_id]
	if not bool(vehicle.get("alive", false)):
		return false
	var result: Dictionary = combat.fire(int(vehicle.get("id", -1)),
		String(vehicle.get("weapon_id", "")), Vector2(vehicle.get("pos", Vector2.ZERO)), direction)
	return not result.is_empty()


func vehicle_state(index: int) -> Dictionary:
	return vehicles[index] if index >= 0 and index < vehicles.size() else {}


func _sync_actor_deaths() -> void:
	for index in actors.size():
		var actor: Dictionary = actors[index]
		if bool(actor.get("alive", false)) or int(actor.get("respawn_ticks", 0)) > 0:
			continue
		actor["deaths"] = int(actor.get("deaths", 0)) + 1
		actor["respawn_ticks"] = RESPAWN_TICKS
		_drop_flag(index)
		if int(actor.get("vehicle_id", -1)) >= 0:
			exit_vehicle(index)
		var victim_team := int(actor.get("team", 0))
		var attacker := int(actor.get("last_attacker", -1))
		if attacker >= 0 and attacker < actors.size() and attacker != index:
			var killer: Dictionary = actors[attacker]
			killer["kills"] = int(killer.get("kills", 0)) + 1
			killer["score"] = int(killer.get("score", 0)) + 1
			var team_key := "team:%d" % int(killer.get("team", 0))
			team_scores[team_key] = int(team_scores.get(team_key, 0)) + 1
			if mode == "skirmish" and int(team_scores[team_key]) >= score_limit:
				_finish_mode(int(killer.get("team", 0)))
		if mode in ["skirmish", "frontlines"]:
			var ticket_key := "team:%d" % victim_team
			tickets[ticket_key] = maxi(0, int(tickets.get(ticket_key, 0)) - 1)
			if int(tickets[ticket_key]) <= 0:
				_finish_mode(_leading_team())
	for index in actors.size():
		var actor: Dictionary = actors[index]
		if bool(actor.get("alive", false)):
			actor["spawn_protection"] = maxi(0, int(actor.get("spawn_protection", 0)) - 1)
		elif int(actor.get("respawn_ticks", 0)) > 0:
			actor["respawn_ticks"] = int(actor["respawn_ticks"]) - 1
			if int(actor["respawn_ticks"]) == 0 and not finished:
				_respawn_actor(index)


func _respawn_actor(index: int) -> void:
	var actor: Dictionary = actors[index]
	var positions := team_spawn_positions(int(actor.get("team", 0)))
	var pos := positions[index % positions.size()]
	actor["pos"] = pos
	actor["hit_pos"] = pos
	actor["velocity"] = Vector2.ZERO
	actor["alive"] = true
	actor["hp"] = float(actor.get("max_hp", 100.0))
	actor["armor"] = float((CLASSES[String(actor.get("class_id", "scout"))] as Dictionary).get("armor", 0.0))
	actor["spawn_protection"] = SPAWN_PROTECTION_TICKS
	actor["respawn_ticks"] = 0


func team_spawn_positions(team: int) -> Array[Vector2]:
	var out: Array[Vector2] = []
	var spawn_rows: Array = (current_zone.get("spawns", {}) as Dictionary).get("team_%d" % team, [])
	for value in spawn_rows:
		out.append(_vec_from(value))
	for node_value in capture_nodes:
		var node: Dictionary = node_value
		if int(node.get("owner", -1)) == team:
			out.append(Vector2(node.get("pos", Vector2.ZERO)))
	if out.is_empty():
		out.append(Vector2(120 if team == 0 else 1160, 560))
	return out


func _update_mode_objectives() -> void:
	objective_tick += 1
	if mode == "frontlines":
		_update_capture_nodes()
		if objective_tick % OBJECTIVE_SCORE_TICKS == 0:
			for node_value in capture_nodes:
				var node: Dictionary = node_value
				var owner := int(node.get("owner", -1))
				if owner >= 0:
					var key := "team:%d" % owner
					team_scores[key] = int(team_scores.get(key, 0)) + 1
					objective_score[key] = int(objective_score.get(key, 0)) + 1
					if int(team_scores[key]) >= score_limit:
						_finish_mode(owner)
	elif mode == "capture_flag":
		_update_flags()


func _update_capture_nodes() -> void:
	for node_value in capture_nodes:
		var node: Dictionary = node_value
		var counts := {0:0, 1:0}
		for actor_value in actors:
			var actor: Dictionary = actor_value
			if bool(actor.get("alive", false)) and Vector2(actor.get("pos", Vector2.ZERO)).distance_to(
					Vector2(node.get("pos", Vector2.ZERO))) <= 48.0:
				var team := int(actor.get("team", 0))
				counts[team] = int(counts.get(team, 0)) + 1
		if int(counts[0]) == int(counts[1]):
			continue
		var capturing := 0 if int(counts[0]) > int(counts[1]) else 1
		node["capture_team"] = capturing
		node["progress"] = float(node.get("progress", 0.0)) + 0.08 * absf(float(int(counts[0]) - int(counts[1])))
		if float(node["progress"]) >= 1.0:
			node["owner"] = capturing
			node["progress"] = 0.0


func _update_flags() -> void:
	for flag_index in flags.size():
		var flag: Dictionary = flags[flag_index]
		var carrier := int(flag.get("carrier", -1))
		if carrier >= 0:
			var actor: Dictionary = actors[carrier]
			if not bool(actor.get("alive", false)):
				flag["carrier"] = -1
				flag["dropped"] = true
			else:
				flag["pos"] = Vector2(actor.get("pos", Vector2.ZERO))
				var team := int(actor.get("team", 0))
				var own: Dictionary = flags[team]
				if team != int(flag.get("team", -1)) and int(own.get("carrier", -1)) == -1 \
						and not bool(own.get("dropped", false)) and Vector2(actor.get("pos", Vector2.ZERO)).distance_to(
							Vector2(own.get("home", Vector2.ZERO))) <= 34.0:
					var key := "team:%d" % team
					team_scores[key] = int(team_scores.get(key, 0)) + 3
					objective_score[key] = int(objective_score.get(key, 0)) + 3
					_reset_flag(flag_index)
					if int(team_scores[key]) >= score_limit:
						_finish_mode(team)
			continue
		for actor_value in actors:
			var actor: Dictionary = actor_value
			if not bool(actor.get("alive", false)) or Vector2(actor.get("pos", Vector2.ZERO)).distance_to(
					Vector2(flag.get("pos", Vector2.ZERO))) > 28.0:
				continue
			if int(actor.get("team", -1)) == int(flag.get("team", -2)):
				if bool(flag.get("dropped", false)):
					_reset_flag(flag_index)
			else:
				flag["carrier"] = int(actor.get("id", -1))
				flag["dropped"] = false
			break


func _drop_flag(actor_id: int) -> void:
	for flag_value in flags:
		var flag: Dictionary = flag_value
		if int(flag.get("carrier", -1)) == actor_id:
			flag["carrier"] = -1
			flag["dropped"] = true
			flag["pos"] = Vector2((actors[actor_id] as Dictionary).get("pos", Vector2.ZERO))


func _reset_flag(index: int) -> void:
	var flag: Dictionary = flags[index]
	flag["pos"] = Vector2(flag.get("home", Vector2.ZERO))
	flag["carrier"] = -1
	flag["dropped"] = false


func _step_bugs() -> void:
	if mode != "bug_hunt" or finished:
		return
	for bug_value in bugs:
		var bug: Dictionary = bug_value
		if not bool(bug.get("alive", false)):
			continue
		var target := _nearest_live_actor(Vector2(bug.get("pos", Vector2.ZERO)))
		if target < 0:
			continue
		var delta := Vector2((actors[target] as Dictionary).get("pos", Vector2.ZERO)) - Vector2(bug.get("pos", Vector2.ZERO))
		var speed := 105.0 if String(bug.get("role", "")) == "guard" else 155.0
		bug["velocity"] = delta.normalized() * speed
		bug["pos"] = Vector2(bug.get("pos", Vector2.ZERO)) + Vector2(bug["velocity"]) * STEP
		bug["hit_pos"] = bug["pos"]
		if String(bug.get("role", "")) == "spitter" and posmod(tick + int(bug.get("id", 0)), 45) == 0:
			combat.fire(int(bug.get("id", -1)), "bg_bug_spitter",
				Vector2(bug.get("pos", Vector2.ZERO)), delta.normalized())
		elif delta.length() <= 25.0 and posmod(tick + int(bug.get("id", 0)), 20) == 0:
			combat.damage_actor(target, 10.0, 0.2, delta.normalized(), 12.0, int(bug.get("id", -1)))


func _finish_mode(winner_team: int) -> void:
	if finished:
		return
	var kills := 0
	for actor_value in actors:
		var actor: Dictionary = actor_value
		if int(actor.get("team", -1)) == winner_team:
			kills += int(actor.get("kills", 0))
	var vehicles_remaining := 0
	for vehicle_value in vehicles:
		var vehicle: Dictionary = vehicle_value
		if bool(vehicle.get("alive", false)) and int(vehicle.get("team", -1)) == winner_team:
			vehicles_remaining += 1
	finish_match({"primary":1,"secondary":{"objective_score":int(objective_score.get("team:%d" % winner_team, 0)),
		"kills":kills,"winner_team":winner_team,"mode":mode,"zone_id":String(current_zone.get("id", "")),
		"vehicles_remaining":vehicles_remaining},
		"outcome":"complete","ranked":true})


func _leading_team() -> int:
	return 0 if int(team_scores.get("team:0", 0)) >= int(team_scores.get("team:1", 0)) else 1


func cast_vote(actor_id: int, proposed_mode: String) -> bool:
	if actor_id < 0 or actor_id >= actors.size() or proposed_mode not in MODES:
		return false
	votes[actor_id] = proposed_mode
	return true


func resolve_vote() -> String:
	var counts := {}
	for mode_value in votes.values():
		var proposed := String(mode_value)
		counts[proposed] = int(counts.get(proposed, 0)) + 1
	var ordered := MODES.duplicate()
	ordered.sort_custom(func(a: String, b: String) -> bool:
		var count_a := int(counts.get(a, 0))
		var count_b := int(counts.get(b, 0))
		return count_a > count_b if count_a != count_b else a < b)
	next_mode = String(ordered[0]) if not ordered.is_empty() else mode
	return next_mode


func _nearest_enemy_to(team: int, origin: Vector2, max_distance: float) -> int:
	var best := -1
	var best_distance := max_distance * max_distance
	for index in actors.size():
		var actor: Dictionary = actors[index]
		if not bool(actor.get("alive", false)) or int(actor.get("team", -1)) == team:
			continue
		var distance := origin.distance_squared_to(Vector2(actor.get("pos", Vector2.ZERO)))
		if distance < best_distance:
			best_distance = distance
			best = index
	return best


func _nearest_live_actor(origin: Vector2) -> int:
	var best := -1
	var best_distance := INF
	for index in actors.size():
		var actor: Dictionary = actors[index]
		if not bool(actor.get("alive", false)):
			continue
		var distance := origin.distance_squared_to(Vector2(actor.get("pos", Vector2.ZERO)))
		if distance < best_distance:
			best_distance = distance
			best = index
	return best


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
		if not radar.has(target_id):
			for deployable_value in deployables:
				var deployable: Dictionary = deployable_value
				if String(deployable.get("type", "")) == "sensor" \
						and int(deployable.get("team", -1)) == int(viewer.get("team", -2)) \
						and Vector2(deployable.get("pos", Vector2.ZERO)).distance_to(target_pos) \
							<= float(deployable.get("range", 0.0)):
					radar[target_id] = Vector2(roundf(target_pos.x / RADAR_GRID) * RADAR_GRID,
						roundf(target_pos.y / RADAR_GRID) * RADAR_GRID)
					break
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


func _ai_snapshot(index: int) -> Dictionary:
	if not bool(context.get("bots_enabled", true)):
		return {}
	var actor: Dictionary = actors[index]
	var origin: Vector2 = actor.get("pos", Vector2.ZERO)
	var team := int(actor.get("team", 0))
	if mode == "fleet" and int(actor.get("vehicle_id", -1)) < 0:
		for vehicle_index in vehicles.size():
			var vehicle: Dictionary = vehicles[vehicle_index]
			if int(vehicle.get("team", -1)) == team and int(vehicle.get("driver", -1)) < 0 \
					and bool(vehicle.get("alive", false)) and origin.distance_to(
						Vector2(vehicle.get("pos", Vector2.ZERO))) <= 42.0:
				enter_nearest_vehicle(index)
				actor["ai_goal"] = "vehicle"
				return {"seat":index,"move":Vector2.ZERO,"aim":Vector2.RIGHT,
					"held":{},"pressed":{},"released":{}}
	var target_pos := origin
	var goal := "enemy"
	var owned_near: Dictionary = {}
	for node_value in capture_nodes:
		var node: Dictionary = node_value
		if int(node.get("owner", -1)) == team and origin.distance_to(Vector2(node.get("pos", origin))) <= 55.0:
			owned_near = node
			break
	if String(actor.get("class_id", "")) == "engineer" and not owned_near.is_empty():
		goal = "defend_node"
		target_pos = Vector2(owned_near.get("pos", origin))
		var already_fortified := deployables.any(func(deployable: Dictionary) -> bool:
			return int(deployable.get("owner", -1)) == index)
		if not already_fortified:
			place_deployable(index, "turret", target_pos + Vector2(24, 0))
	elif mode in ["frontlines", "skirmish"]:
		var best_distance := INF
		for node_value in capture_nodes:
			var node: Dictionary = node_value
			if int(node.get("owner", -1)) == team:
				continue
			var distance := origin.distance_squared_to(Vector2(node.get("pos", origin)))
			if distance < best_distance:
				best_distance = distance
				target_pos = Vector2(node.get("pos", origin))
				goal = "capture_node"
	elif mode == "capture_flag" and not flags.is_empty():
		var carried := flags.find_custom(func(flag: Dictionary) -> bool:
			return int(flag.get("carrier", -1)) == index)
		if carried >= 0:
			target_pos = Vector2((flags[team] as Dictionary).get("home", origin))
			goal = "flag_home"
		else:
			target_pos = Vector2((flags[1 - team] as Dictionary).get("pos", origin))
			goal = "enemy_flag"
	elif mode == "bug_hunt":
		var nearest_bug := _nearest_live_bug(origin)
		if not nearest_bug.is_empty():
			target_pos = Vector2(nearest_bug.get("pos", origin))
			goal = "bug"
	var enemy := _nearest_enemy_to(team, origin, 720.0)
	var aim := (target_pos - origin).normalized()
	var pressed := {}
	if enemy >= 0:
		var enemy_pos: Vector2 = (actors[enemy] as Dictionary).get("pos", origin)
		aim = (enemy_pos - origin).normalized()
		if posmod(tick + index * 5, 10) == 0:
			pressed["primary"] = true
	actor["ai_goal"] = goal
	return {"seat":index,"move":(target_pos - origin).normalized(),"aim":aim,
		"held":{},"pressed":pressed,"released":{}}


func _nearest_live_bug(origin: Vector2) -> Dictionary:
	var best := {}
	var best_distance := INF
	for bug_value in bugs:
		var bug: Dictionary = bug_value
		if not bool(bug.get("alive", false)):
			continue
		var distance := origin.distance_squared_to(Vector2(bug.get("pos", origin)))
		if distance < best_distance:
			best_distance = distance
			best = bug
	return best


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


func place_deployable_for_test(index: int, type_id: String, pos: Vector2) -> int:
	return place_deployable(index, type_id, pos)


func damage_deployable_for_test(index: int, amount: float, attacker: int) -> bool:
	return damage_deployable(index, amount, attacker)


func enter_vehicle_for_test(actor_id: int, vehicle_id: int) -> bool:
	if vehicle_id < 0 or vehicle_id >= vehicles.size():
		return false
	var actor := actor_state(actor_id)
	var vehicle := vehicle_state(vehicle_id)
	if actor.is_empty() or int(vehicle.get("team", -1)) != int(actor.get("team", -2)):
		return false
	actor["pos"] = Vector2(vehicle.get("pos", Vector2.ZERO))
	actor["hit_pos"] = actor["pos"]
	return enter_nearest_vehicle(actor_id)


func exit_vehicle_for_test(actor_id: int) -> bool:
	return exit_vehicle(actor_id)


func fire_vehicle_for_test(vehicle_id: int, direction: Vector2) -> bool:
	return _fire_vehicle(vehicle_id, direction)


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


func score_kill_for_test(killer: int, victim: int) -> bool:
	if finished or killer < 0 or killer >= actors.size() or victim < 0 or victim >= actors.size():
		return false
	var target: Dictionary = actors[victim]
	target["alive"] = true
	target["hp"] = float(target.get("max_hp", 100.0))
	target["respawn_ticks"] = 0
	target["spawn_protection"] = 0
	var ok: bool = combat.damage_actor(victim, float(target["hp"]) + 200.0, 1.0,
		Vector2.RIGHT, 0.0, killer)
	_sync_actor_deaths()
	return ok


func respawn_actor_for_test(index: int) -> void:
	_respawn_actor(index)


func capture_node_for_test(index: int, team: int) -> void:
	if index >= 0 and index < capture_nodes.size() and team in [0, 1]:
		(capture_nodes[index] as Dictionary)["owner"] = team
		(capture_nodes[index] as Dictionary)["progress"] = 0.0


func flag_state(team: int) -> Dictionary:
	return flags[team] if team >= 0 and team < flags.size() else {}


func update_objectives_for_test() -> void:
	_update_mode_objectives()


func kill_bug_for_test(bug_id: int, killer: int) -> bool:
	var bug: Dictionary = combat.actor_state(bug_id)
	if bug.is_empty() or not bool(bug.get("alive", false)):
		return false
	var ok: bool = combat.damage_actor(bug_id, float(bug.get("hp", 0.0)) + 100.0,
		1.0, Vector2.RIGHT, 0.0, killer)
	if ok and not bugs.any(func(value: Dictionary) -> bool:
		return bool(value.get("alive", false))):
		_finish_mode(0)
	return ok


func destroy_vehicle_for_test(vehicle_id: int, attacker: int) -> bool:
	if vehicle_id < 0 or vehicle_id >= vehicles.size() or attacker < 0 or attacker >= actors.size():
		return false
	var vehicle: Dictionary = vehicles[vehicle_id]
	if not bool(vehicle.get("alive", false)):
		return false
	var ok: bool = combat.damage_actor(int(vehicle.get("id", -1)),
		float(vehicle.get("hp", 0.0)) + 500.0, 1.0, Vector2.RIGHT, 0.0, attacker)
	if ok:
		var team := int((actors[attacker] as Dictionary).get("team", 0))
		var key := "team:%d" % team
		team_scores[key] = int(team_scores.get(key, 0)) + 1
		objective_score[key] = int(objective_score.get(key, 0)) + 1
		if int(team_scores[key]) >= score_limit:
			_finish_mode(team)
	return ok


func ai_snapshot_for_test(index: int) -> Dictionary:
	return _ai_snapshot(index)


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["mode"] = mode
	state["zone_id"] = String(current_zone.get("id", ""))
	state["combat"] = combat.snapshot() if combat != null else {}
	state["capture_nodes"] = capture_nodes.duplicate(true)
	state["vehicle_pads"] = vehicle_pads.duplicate(true)
	state["objective_score"] = objective_score.duplicate(true)
	state["team_scores"] = team_scores.duplicate(true)
	state["tickets"] = tickets.duplicate(true)
	state["deployables"] = deployables.duplicate(true)
	state["vehicle_ids"] = vehicles.map(func(vehicle: Dictionary) -> int:
		return int(vehicle.get("id", -1)))
	state["bug_ids"] = bugs.map(func(bug: Dictionary) -> int:
		return int(bug.get("id", -1)))
	state["flags"] = flags.duplicate(true)
	state["votes"] = votes.duplicate(true)
	state["next_mode"] = next_mode
	state["score_limit"] = score_limit
	state["time_limit_ticks"] = time_limit_ticks
	state["match_ticks"] = match_ticks
	state["objective_tick"] = objective_tick
	state["next_deployable_id"] = _next_deployable_id
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
	team_scores = (state.get("team_scores", team_scores) as Dictionary).duplicate(true)
	tickets = (state.get("tickets", tickets) as Dictionary).duplicate(true)
	deployables = (state.get("deployables", deployables) as Array).duplicate(true)
	vehicles.clear()
	for id_value in state.get("vehicle_ids", []):
		vehicles.append(combat.actor_state(int(id_value)))
	bugs.clear()
	for id_value in state.get("bug_ids", []):
		bugs.append(combat.actor_state(int(id_value)))
	flags = (state.get("flags", flags) as Array).duplicate(true)
	votes = (state.get("votes", votes) as Dictionary).duplicate(true)
	next_mode = String(state.get("next_mode", next_mode))
	score_limit = int(state.get("score_limit", score_limit))
	time_limit_ticks = int(state.get("time_limit_ticks", time_limit_ticks))
	match_ticks = int(state.get("match_ticks", match_ticks))
	objective_tick = int(state.get("objective_tick", objective_tick))
	_next_deployable_id = int(state.get("next_deployable_id", _next_deployable_id))
	_visible = (state.get("visible", _visible) as Dictionary).duplicate(true)
	_radar = (state.get("radar", _radar) as Dictionary).duplicate(true)
	last_result = (state.get("last_result", last_result) as Dictionary).duplicate(true)
	_rebuild_combat_walls()
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
		_tactical_label.text = "EXACT %d  RADAR %d\nZONE %s\nT0 %d  T1 %d\nTICKETS %d/%d  VEH %d\nVOTE %s" % [
			visible_contacts(0).size(), radar_contacts(0).size(),
			String(current_zone.get("name", "UNKNOWN")), int(objective_score.get("team:0", 0)),
			int(objective_score.get("team:1", 0)), int(tickets.get("team:0", 0)),
			int(tickets.get("team:1", 0)), vehicles.size(), next_mode if next_mode != "" else "OPEN"]
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
	for deployable_value in deployables:
		var deployable: Dictionary = deployable_value
		var pos := _iso(Vector2(deployable.get("pos", Vector2.ZERO)))
		var color := Draw.team_color(int(deployable.get("team", 0)))
		if String(deployable.get("type", "")) == "sensor":
			draw_arc(pos, 13, 0, TAU, 16, color, 3.0)
			draw_arc(pos, 24, -PI * 0.75, -PI * 0.25, 12, Color("76a786"), 2.0)
		elif String(deployable.get("type", "")) == "barricade":
			draw_rect(Rect2(pos - Vector2(18, 8), Vector2(36, 16)), color, true)
		elif String(deployable.get("type", "")) == "turret":
			draw_circle(pos, 12, color)
			draw_line(pos, pos + Vector2(22, 0), Draw.BONE, 4.0)
		else:
			draw_colored_polygon(PackedVector2Array([pos-Vector2(0,12),pos+Vector2(12,0),
				pos+Vector2(0,12),pos-Vector2(12,0)]), color)
	for vehicle_value in vehicles:
		var vehicle: Dictionary = vehicle_value
		if not bool(vehicle.get("alive", false)):
			continue
		var pos := _iso(Vector2(vehicle.get("pos", Vector2.ZERO)))
		var color := Draw.team_color(int(vehicle.get("team", 0)))
		draw_colored_polygon(PackedVector2Array([pos+Vector2(0,-18),pos+Vector2(25,-5),
			pos+Vector2(20,14),pos+Vector2(-20,14),pos+Vector2(-25,-5)]), color.darkened(0.15))
		draw_circle(pos, 9, color)
		var aim: Vector2 = vehicle.get("aim", Vector2.RIGHT)
		draw_line(pos, pos + aim.normalized() * 31, Draw.BONE, 5.0)
	for flag_value in flags:
		var flag: Dictionary = flag_value
		var pos := _iso(Vector2(flag.get("pos", Vector2.ZERO)))
		draw_line(pos, pos - Vector2(0, 36), Draw.BONE, 3.0)
		draw_colored_polygon(PackedVector2Array([pos-Vector2(0,36),pos+Vector2(28,-27),pos-Vector2(0,19)]),
			Draw.team_color(int(flag.get("team", 0))))
	for bug_value in bugs:
		var bug: Dictionary = bug_value
		if not bool(bug.get("alive", false)):
			continue
		var pos := _iso(Vector2(bug.get("pos", Vector2.ZERO)))
		draw_circle(pos, 11, Color("8ca33a"))
		for leg in 4:
			var angle := float(leg) * PI * 0.5 + PI * 0.25
			draw_line(pos, pos + Vector2.from_angle(angle) * 17, Color("5f742c"), 3.0)
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
