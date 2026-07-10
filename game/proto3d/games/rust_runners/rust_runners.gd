## RUST RUNNERS — original Crimson Road side-view arena shooter.
## Eligible OpenSoldat implementation knowledge is noticed; no base maps,
## names, sprites, art, audio, branding, or text are imported.
extends "res://proto3d/games/game_cartridge.gd"

const Draw = preload("res://proto3d/games/console/console_draw.gd")
const Kernel = preload("res://proto3d/games/shooter/shooter_kernel.gd")
const MAP_PATH := "res://data/rust_runners_maps.json"
const STEP := 1.0 / 30.0
const RUN_SPEED := 245.0
const GROUND_ACCEL := 1500.0
const AIR_ACCEL := 430.0
const GROUND_FRICTION := 1800.0
const GRAVITY := 980.0
const JUMP_SPEED := 365.0
const JET_ACCEL := 720.0
const JET_FUEL_MAX := 100.0
const JET_BURN := 1.8
const JET_RECHARGE := 1.15
const STAND_HEIGHT := 48.0
const CROUCH_HEIGHT := 31.0
const PRONE_HEIGHT := 18.0
const ROLL_SPEED := 340.0
const ROLL_TICKS := 13
const BACKFLIP_X := 285.0
const BACKFLIP_Y := 390.0
const FALL_DAMAGE_SPEED := 500.0
const RESPAWN_TICKS := 90
const SPAWN_PROTECTION_TICKS := 36
const PICKUP_RADIUS := 30.0

var combat: RefCounted = null
var actors: Array = []
var pickups: Array = []
var death_parts: Array = []
var current_map: Dictionary = {}
var platforms: Array[Rect2] = []
var spawns: Array[Vector2] = []
var mode := "deathmatch"
var gore_enabled := true
var _rng := RandomNumberGenerator.new()
var _status: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "RUST RUNNERS", "CRIMSON ROAD BOOTLEG LEAGUE // MOVE FAST OR FEED THE STEEL")
	_status = Draw.status(self)
	queue_redraw()


static func load_map_rows(path: String = MAP_PATH) -> Dictionary:
	var out := {}
	if not FileAccess.file_exists(path):
		return out
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not parsed is Dictionary:
		return out
	for value in (parsed as Dictionary).get("maps", []):
		var row: Dictionary = value
		var id := String(row.get("id", ""))
		if id != "" and not out.has(id):
			out[id] = row.duplicate(true)
	return out


func start_match(new_seed: int, new_seats: Array) -> void:
	super.start_match(new_seed, new_seats)
	_rng.seed = new_seed
	mode = String(context.get("mode", "deathmatch"))
	gore_enabled = bool(context.get("gore", true))
	var map_rows := load_map_rows()
	var map_id := String(context.get("map_id", "refinery_run"))
	current_map = (map_rows.get(map_id, map_rows.get("refinery_run", {})) as Dictionary).duplicate(true)
	_build_map_state()
	combat = Kernel.new()
	combat.configure(Kernel.load_weapon_rows(), new_seed,
		_rect_from(current_map.get("bounds", [60, 110, 1160, 520])), platforms)
	actors.clear()
	death_parts.clear()
	var actor_count := clampi(int(context.get("actor_count", maxi(2, new_seats.size()))), 2, 8)
	for index in actor_count:
		var spawn := spawns[index % spawns.size()]
		combat.add_actor({"id": index, "team": index % 2, "pos": spawn,
			"hit_pos": spawn - Vector2(0, STAND_HEIGHT * 0.5),
			"velocity": Vector2.ZERO, "hp": 100.0, "max_hp": 100.0,
			"armor": 0.0, "radius": 13.0, "alive": true,
			"ai": index >= new_seats.size(), "stance": "stand",
			"hull_height": STAND_HEIGHT, "on_ground": true, "facing": 1 if index % 2 == 0 else -1,
			"aim": Vector2.RIGHT if index % 2 == 0 else Vector2.LEFT,
			"jet_fuel": JET_FUEL_MAX, "roll_ticks": 0,
			"spawn_protection": 0, "respawn_ticks": 0,
			"spawn_index": index % spawns.size(), "kills": 0, "deaths": 0,
			"weapon_slots": ["rr_scrap_rifle", "rr_bolt_launcher"],
			"active_slot": 0, "active_weapon": "rr_scrap_rifle"})
		combat.equip(index, ["rr_scrap_rifle", "rr_bolt_launcher", "rr_frag"])
		actors.append(combat.actor_state(index))
	_render()


func _build_map_state() -> void:
	platforms.clear()
	spawns.clear()
	for value in current_map.get("platforms", []):
		platforms.append(_rect_from(value))
	for value in current_map.get("spawns", []):
		spawns.append(_vec_from(value))
	if spawns.is_empty():
		spawns = [Vector2(140, 610), Vector2(1140, 610)]
	pickups.clear()
	for value in current_map.get("pickups", []):
		var pickup: Dictionary = (value as Dictionary).duplicate(true)
		pickup["pos"] = _vec_from(pickup.get("pos", [640, 400]))
		pickups.append(pickup)


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
		_step_actor_physics(index)
	combat.step()
	_sync_deaths()
	_step_timers_and_parts()
	for index in actors.size():
		if bool((actors[index] as Dictionary).get("alive", false)):
			_collect_pickups(index)
	_render()


func _apply_actor_input(index: int, input: Dictionary) -> void:
	var actor: Dictionary = actors[index]
	var move: Vector2 = input.get("move", Vector2.ZERO)
	var aim: Vector2 = input.get("aim", Vector2.ZERO)
	var held: Dictionary = input.get("held", {})
	var pressed: Dictionary = input.get("pressed", {})
	if aim.length_squared() > 0.001:
		actor["aim"] = aim.normalized()
		actor["facing"] = 1 if aim.x >= 0.0 else -1
	var backflip := bool(pressed.get("mobility", false)) and bool(held.get("stance", false)) \
		and bool(actor.get("on_ground", false)) and move.x * float(actor.get("facing", 1)) < -0.2
	if backflip:
		actor["stance"] = "backflip"
		actor["hull_height"] = CROUCH_HEIGHT
		actor["on_ground"] = false
		actor["velocity"] = Vector2(signf(move.x) * BACKFLIP_X, -BACKFLIP_Y)
	elif bool(pressed.get("stance", false)) and bool(actor.get("on_ground", false)):
		if move.y > 0.4:
			actor["stance"] = "prone"
			actor["hull_height"] = PRONE_HEIGHT
		elif absf(move.x) > 0.2:
			actor["stance"] = "roll"
			actor["hull_height"] = PRONE_HEIGHT
			actor["roll_ticks"] = ROLL_TICKS
			actor["velocity"] = Vector2(signf(move.x) * ROLL_SPEED, 0.0)
		else:
			actor["stance"] = "crouch"
			actor["hull_height"] = CROUCH_HEIGHT
	elif not bool(held.get("stance", false)) and int(actor.get("roll_ticks", 0)) <= 0 \
			and String(actor.get("stance", "")) not in ["backflip"]:
		actor["stance"] = "stand"
		actor["hull_height"] = STAND_HEIGHT
	if not backflip and int(actor.get("roll_ticks", 0)) <= 0:
		var velocity: Vector2 = actor.get("velocity", Vector2.ZERO)
		var acceleration := GROUND_ACCEL if bool(actor.get("on_ground", false)) else AIR_ACCEL
		if absf(move.x) > 0.05:
			velocity.x = move_toward(velocity.x, move.x * RUN_SPEED, acceleration * STEP)
		elif bool(actor.get("on_ground", false)):
			velocity.x = move_toward(velocity.x, 0.0, GROUND_FRICTION * STEP)
		actor["velocity"] = velocity
	if bool(pressed.get("mobility", false)) and bool(actor.get("on_ground", false)) and not backflip:
		actor["velocity"] = Vector2((actor["velocity"] as Vector2).x, -JUMP_SPEED)
		actor["on_ground"] = false
	if bool(held.get("mobility", false)) and not bool(actor.get("on_ground", false)) \
			and float(actor.get("jet_fuel", 0.0)) > 0.0 and not backflip:
		var jet_velocity: Vector2 = actor["velocity"]
		jet_velocity.y -= JET_ACCEL * STEP
		actor["velocity"] = jet_velocity
		actor["jet_fuel"] = maxf(0.0, float(actor["jet_fuel"]) - JET_BURN)
	if bool(pressed.get("weapon_prev", false)):
		_cycle_weapon(actor, -1)
	if bool(pressed.get("weapon_next", false)):
		_cycle_weapon(actor, 1)
	if bool(pressed.get("reload", false)):
		combat.start_reload(index, String(actor.get("active_weapon", "")))
	if bool(pressed.get("primary", false)):
		combat.fire(index, String(actor.get("active_weapon", "")), _muzzle(actor),
			Vector2(actor.get("aim", Vector2.RIGHT)))
	if bool(pressed.get("secondary", false)):
		combat.fire(index, "rr_frag", _muzzle(actor),
			Vector2(actor.get("aim", Vector2.RIGHT)))
	if bool(pressed.get("interact", false)) and bool(held.get("stance", false)):
		drop_active_weapon(index)


func _step_actor_physics(index: int) -> void:
	var actor: Dictionary = actors[index]
	var old_pos: Vector2 = actor.get("pos", Vector2.ZERO)
	var velocity: Vector2 = actor.get("velocity", Vector2.ZERO)
	if not bool(actor.get("on_ground", false)):
		velocity.y += GRAVITY * STEP
	var next := old_pos + velocity * STEP
	var landed := false
	if velocity.y >= 0.0 and not bool(actor.get("on_ground", false)):
		for platform in platforms:
			if old_pos.y <= platform.position.y and next.y >= platform.position.y \
					and next.x >= platform.position.x and next.x <= platform.end.x:
				next.y = platform.position.y
				landed = true
				break
	if landed:
		if velocity.y > FALL_DAMAGE_SPEED:
			var fall_damage := (velocity.y - FALL_DAMAGE_SPEED) * 0.12
			actor["hp"] = maxf(0.0, float(actor.get("hp", 0.0)) - fall_damage)
			if float(actor["hp"]) <= 0.0:
				actor["alive"] = false
		velocity.y = 0.0
		actor["on_ground"] = true
	else:
		actor["on_ground"] = bool(actor.get("on_ground", false)) and absf(velocity.y) < 0.001
	var field := _rect_from(current_map.get("bounds", [60, 110, 1160, 520]))
	next.x = clampf(next.x, field.position.x + 12.0, field.end.x - 12.0)
	if next.y > field.end.y + 90.0:
		actor["hp"] = 0.0
		actor["alive"] = false
	actor["pos"] = next
	actor["hit_pos"] = next - Vector2(0, float(actor.get("hull_height", STAND_HEIGHT)) * 0.5)
	actor["velocity"] = velocity
	if bool(actor.get("on_ground", false)):
		actor["jet_fuel"] = minf(JET_FUEL_MAX, float(actor.get("jet_fuel", 0.0)) + JET_RECHARGE)
	if int(actor.get("roll_ticks", 0)) > 0:
		actor["roll_ticks"] = int(actor["roll_ticks"]) - 1
		if int(actor["roll_ticks"]) == 0:
			actor["stance"] = "crouch"
			actor["hull_height"] = CROUCH_HEIGHT
	if String(actor.get("stance", "")) == "backflip" and bool(actor.get("on_ground", false)):
		actor["stance"] = "stand"
		actor["hull_height"] = STAND_HEIGHT


func _sync_deaths() -> void:
	for index in actors.size():
		var actor: Dictionary = actors[index]
		if bool(actor.get("alive", false)) or int(actor.get("respawn_ticks", 0)) > 0:
			continue
		actor["deaths"] = int(actor.get("deaths", 0)) + 1
		actor["respawn_ticks"] = RESPAWN_TICKS
		if gore_enabled:
			_spawn_death_parts(actor)


func _step_timers_and_parts() -> void:
	for index in actors.size():
		var actor: Dictionary = actors[index]
		if bool(actor.get("alive", false)):
			actor["spawn_protection"] = maxi(0, int(actor.get("spawn_protection", 0)) - 1)
			continue
		if int(actor.get("respawn_ticks", 0)) > 0:
			actor["respawn_ticks"] = int(actor["respawn_ticks"]) - 1
			if int(actor["respawn_ticks"]) == 0:
				_respawn(index)
	var part_index := death_parts.size() - 1
	while part_index >= 0:
		var part: Dictionary = death_parts[part_index]
		part["life"] = int(part.get("life", 0)) - 1
		part["velocity"] = Vector2(part.get("velocity", Vector2.ZERO)) + Vector2(0, 420) * STEP
		part["pos"] = Vector2(part.get("pos", Vector2.ZERO)) + Vector2(part["velocity"]) * STEP
		if int(part["life"]) <= 0:
			death_parts.remove_at(part_index)
		else:
			death_parts[part_index] = part
		part_index -= 1


func _respawn(index: int) -> void:
	var actor: Dictionary = actors[index]
	actor["pos"] = spawns[int(actor.get("spawn_index", index)) % spawns.size()]
	actor["hit_pos"] = Vector2(actor["pos"]) - Vector2(0, STAND_HEIGHT * 0.5)
	actor["velocity"] = Vector2.ZERO
	actor["hp"] = float(actor.get("max_hp", 100.0))
	actor["armor"] = 0.0
	actor["alive"] = true
	actor["stance"] = "stand"
	actor["hull_height"] = STAND_HEIGHT
	actor["on_ground"] = true
	actor["jet_fuel"] = JET_FUEL_MAX
	actor["spawn_protection"] = SPAWN_PROTECTION_TICKS
	actor["respawn_ticks"] = 0


func _spawn_death_parts(actor: Dictionary) -> void:
	var origin: Vector2 = actor.get("pos", Vector2.ZERO)
	for part in 6:
		death_parts.append({"pos": origin + Vector2(_rng.randf_range(-8, 8), _rng.randf_range(-32, -4)),
			"velocity": Vector2(_rng.randf_range(-150, 150), _rng.randf_range(-260, -80)),
			"life": 70 + part * 3, "team": int(actor.get("team", 0)), "part": part})


func _cycle_weapon(actor: Dictionary, direction: int) -> void:
	var slots: Array = actor.get("weapon_slots", [])
	if slots.is_empty():
		actor["active_weapon"] = ""
		return
	actor["active_slot"] = posmod(int(actor.get("active_slot", 0)) + direction, slots.size())
	actor["active_weapon"] = String(slots[int(actor["active_slot"])])


func drop_active_weapon(index: int) -> bool:
	if index < 0 or index >= actors.size():
		return false
	var actor: Dictionary = actors[index]
	var slots: Array = actor.get("weapon_slots", [])
	if slots.size() <= 1:
		return false
	var slot := clampi(int(actor.get("active_slot", 0)), 0, slots.size() - 1)
	var weapon_id := String(slots[slot])
	slots.remove_at(slot)
	actor["active_slot"] = clampi(slot, 0, slots.size() - 1)
	actor["active_weapon"] = String(slots[int(actor["active_slot"])])
	pickups.append({"kind": "weapon", "weapon_id": weapon_id,
		"pos": Vector2(actor.get("pos", Vector2.ZERO)) + Vector2(22 * int(actor.get("facing", 1)), -8),
		"value": 1, "dropped": true})
	return true


func _collect_pickups(index: int) -> void:
	var actor: Dictionary = actors[index]
	var pickup_index := pickups.size() - 1
	while pickup_index >= 0:
		var pickup: Dictionary = pickups[pickup_index]
		if Vector2(actor.get("pos", Vector2.ZERO)).distance_to(Vector2(pickup.get("pos", Vector2.ZERO))) \
				> PICKUP_RADIUS:
			pickup_index -= 1
			continue
		var consumed := true
		match String(pickup.get("kind", "")):
			"weapon":
				var weapon_id := String(pickup.get("weapon_id", ""))
				var slots: Array = actor.get("weapon_slots", [])
				if weapon_id == "" or slots.has(weapon_id):
					consumed = false
				else:
					if not weapon_state(index, weapon_id).is_empty():
						slots.append(weapon_id)
					else:
						combat.equip(index, [weapon_id])
						slots.append(weapon_id)
			"health":
				actor["hp"] = minf(float(actor.get("max_hp", 100.0)),
					float(actor.get("hp", 0.0)) + float(pickup.get("value", 0)))
			"vest":
				actor["armor"] = minf(100.0, float(actor.get("armor", 0.0)) + float(pickup.get("value", 0)))
			"grenade":
				var frag := weapon_state(index, "rr_frag")
				frag["reserve"] = int(frag.get("reserve", 0)) + int(pickup.get("value", 1))
			_:
				consumed = false
		if consumed:
			pickups.remove_at(pickup_index)
		pickup_index -= 1


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
	# Task 3 installs objective-aware traversal. Slice one keeps the deterministic
	# opponent inert so locomotion and combat laws can be isolated.
	return {}


func _muzzle(actor: Dictionary) -> Vector2:
	return Vector2(actor.get("pos", Vector2.ZERO)) - Vector2(0, float(actor.get("hull_height", STAND_HEIGHT)) * 0.58)


func actor_state(index: int) -> Dictionary:
	return actors[index] if index >= 0 and index < actors.size() else {}


func weapon_state(index: int, weapon_id: String) -> Dictionary:
	if index < 0 or index >= actors.size():
		return {}
	return ((actors[index] as Dictionary).get("weapons", {}) as Dictionary).get(weapon_id, {})


func place_actor_for_test(index: int, pos: Vector2, velocity: Vector2, on_ground: bool) -> void:
	var actor := actor_state(index)
	actor["pos"] = pos
	actor["hit_pos"] = pos - Vector2(0, STAND_HEIGHT * 0.5)
	actor["velocity"] = velocity
	actor["on_ground"] = on_ground
	actor["stance"] = "stand"
	actor["hull_height"] = STAND_HEIGHT


func step_without_input(count: int) -> void:
	for _index in maxi(0, count):
		apply_inputs(tick + 1, [])


func add_pickup_for_test(kind: String, pos: Vector2, value: int,
		weapon_id: String = "") -> void:
	pickups.append({"kind": kind, "pos": pos, "value": value, "weapon_id": weapon_id})


func collect_pickups_for_test(index: int) -> void:
	_collect_pickups(index)


func damage_actor_for_test(index: int, amount: float, attacker: int) -> bool:
	if index < 0 or index >= actors.size() or int((actors[index] as Dictionary).get("spawn_protection", 0)) > 0:
		return false
	var ok: bool = combat.damage_actor(index, amount, 0.0, Vector2.RIGHT, 0.0, attacker)
	if ok and not bool((actors[index] as Dictionary).get("alive", true)):
		if attacker >= 0 and attacker < actors.size() and attacker != index:
			(actors[attacker] as Dictionary)["kills"] = int((actors[attacker] as Dictionary).get("kills", 0)) + 1
		_sync_deaths()
	return ok


func set_gore_enabled(value: bool) -> void:
	gore_enabled = value


func snapshot() -> Dictionary:
	var state := super.snapshot()
	state["mode"] = mode
	state["map_id"] = String(current_map.get("id", ""))
	state["combat"] = combat.snapshot() if combat != null else {}
	state["pickups"] = pickups.duplicate(true)
	state["death_parts"] = death_parts.duplicate(true)
	state["gore_enabled"] = gore_enabled
	state["rng_state"] = _rng.state
	state["last_result"] = last_result.duplicate(true)
	return state


func restore_snapshot(state: Dictionary) -> void:
	super.restore_snapshot(state)
	mode = String(state.get("mode", mode))
	var map_rows := load_map_rows()
	current_map = (map_rows.get(String(state.get("map_id", "refinery_run")), current_map) as Dictionary).duplicate(true)
	_build_map_state()
	combat.restore_snapshot(state.get("combat", {}))
	actors.clear()
	var ids: Array = combat.actors.keys()
	ids.sort()
	for id_value in ids:
		actors.append(combat.actor_state(int(id_value)))
	pickups = (state.get("pickups", pickups) as Array).duplicate(true)
	death_parts = (state.get("death_parts", death_parts) as Array).duplicate(true)
	gore_enabled = bool(state.get("gore_enabled", gore_enabled))
	_rng.state = int(state.get("rng_state", _rng.state))
	last_result = (state.get("last_result", last_result) as Dictionary).duplicate(true)
	_render()


func debug_force_finish() -> bool:
	if finished or actors.is_empty():
		return false
	var leader: Dictionary = actors[0]
	finish_match({"primary": 1, "secondary": {"kills": int(leader.get("kills", 0)),
		"deaths": int(leader.get("deaths", 0)), "mode": mode,
		"map_id": String(current_map.get("id", ""))}, "outcome": "complete", "ranked": true})
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
		var active_id := String(rider.get("active_weapon", ""))
		var active_state := weapon_state(0, active_id)
		_status.text = "%s // HP %03d  VEST %03d  JET %03d  %s %02d/%03d  K%d D%d" % [
			mode.to_upper(), int(rider.get("hp", 0)), int(rider.get("armor", 0)),
			int(rider.get("jet_fuel", 0)), active_id.trim_prefix("rr_").replace("_", " ").to_upper(),
			int(active_state.get("ammo", 0)), int(active_state.get("reserve", 0)),
			int(rider.get("kills", 0)), int(rider.get("deaths", 0))]
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Draw.INK)
	draw_rect(Rect2(55, 105, 1170, 535), Color("221d18"), true)
	# Original refinery horizon and truss silhouettes.
	for stack in 6:
		var x := 95.0 + stack * 205.0
		var height := 80.0 + float((stack * 37) % 95)
		draw_rect(Rect2(x, 610 - height, 34, height), Color("332b24"), true)
		draw_line(Vector2(x + 17, 610 - height), Vector2(x + 17, 610 - height - 30), Draw.RUST, 5.0)
	for platform in platforms:
		draw_rect(platform, Color("4a3b2d"), true)
		draw_line(platform.position, Vector2(platform.end.x, platform.position.y), Draw.AMBER, 3.0)
	for pickup_value in pickups:
		var pickup: Dictionary = pickup_value
		var pos: Vector2 = pickup.get("pos", Vector2.ZERO)
		var color := Draw.SIGNAL if String(pickup.get("kind", "")) == "health" else Draw.AMBER
		draw_rect(Rect2(pos - Vector2(9, 12), Vector2(18, 12)), color, true)
		draw_circle(pos - Vector2(0, 14), 5, Draw.BONE)
	if combat != null:
		for projectile_value in combat.projectiles:
			var projectile: Dictionary = projectile_value
			draw_circle(Vector2(projectile.get("pos", Vector2.ZERO)), 4.0,
				Color.from_string(String(projectile.get("color", "#f2b735")), Draw.AMBER))
	for actor_value in actors:
		var actor: Dictionary = actor_value
		if not bool(actor.get("alive", false)):
			continue
		var pos: Vector2 = actor.get("pos", Vector2.ZERO)
		var height := float(actor.get("hull_height", STAND_HEIGHT))
		var color := Draw.team_color(int(actor.get("team", 0)))
		draw_rect(Rect2(pos.x - 11, pos.y - height, 22, height - 10), color, true)
		draw_circle(pos - Vector2(0, height + 8), 10, color.lightened(0.18))
		var aim: Vector2 = actor.get("aim", Vector2.RIGHT)
		draw_line(_muzzle(actor), _muzzle(actor) + aim * 32.0, Draw.BONE, 5.0)
		if float(actor.get("jet_fuel", 0.0)) < JET_FUEL_MAX and not bool(actor.get("on_ground", false)):
			draw_line(pos - Vector2(6, 8), pos + Vector2(-6, 18), Draw.RUST, 5.0)
		if int(actor.get("spawn_protection", 0)) > 0:
			draw_arc(pos - Vector2(0, height * 0.5), 28, 0, TAU, 20, Draw.SIGNAL, 2.0)
	for part_value in death_parts:
		var part: Dictionary = part_value
		draw_circle(Vector2(part.get("pos", Vector2.ZERO)), 4.0 + float(int(part.get("part", 0)) % 3),
			Draw.team_color(int(part.get("team", 0))).darkened(0.18))
