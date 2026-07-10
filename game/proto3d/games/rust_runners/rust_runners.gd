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
const POINT_SCORE_TICKS := 30
const MODES: Array[String] = ["deathmatch", "team_deathmatch", "capture_flag", "pointmatch"]

var combat: RefCounted = null
var actors: Array = []
var pickups: Array = []
var death_parts: Array = []
var current_map: Dictionary = {}
var platforms: Array[Rect2] = []
var spawns: Array[Vector2] = []
var mode := "deathmatch"
var gore_enabled := true
var mode_scores: Dictionary = {}
var flags: Array = []
var point_item: Dictionary = {}
var kill_feed: Array[String] = []
var show_scoreboard := false
var score_limit := 10
var time_limit_ticks := 10800
var match_ticks := 0
var _rng := RandomNumberGenerator.new()
var _status: Label = null
var _scoreboard_label: Label = null
var _kill_feed_label: Label = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Draw.header(self, "RUST RUNNERS", "CRIMSON ROAD BOOTLEG LEAGUE // MOVE FAST OR FEED THE STEEL")
	_status = Draw.status(self)
	_scoreboard_label = Draw.label("", 15, Draw.BONE, HORIZONTAL_ALIGNMENT_RIGHT)
	_scoreboard_label.name = "Scoreboard"
	_scoreboard_label.position = Vector2(930, 112)
	_scoreboard_label.size = Vector2(270, 210)
	add_child(_scoreboard_label)
	_kill_feed_label = Draw.label("", 14, Draw.DIM)
	_kill_feed_label.name = "KillFeed"
	_kill_feed_label.position = Vector2(78, 118)
	_kill_feed_label.size = Vector2(360, 145)
	add_child(_kill_feed_label)
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
	if mode not in MODES:
		mode = "deathmatch"
	gore_enabled = bool(context.get("gore", true))
	score_limit = maxi(1, int(context.get("score_limit", 10)))
	time_limit_ticks = maxi(30, int(context.get("time_limit_ticks", 10800)))
	match_ticks = 0
	show_scoreboard = false
	mode_scores.clear()
	flags.clear()
	point_item.clear()
	kill_feed.clear()
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
	_init_mode_state()
	_render()


func _init_mode_state() -> void:
	for actor_value in actors:
		var actor: Dictionary = actor_value
		actor["score"] = 0
		mode_scores["actor:%d" % int(actor.get("id", 0))] = 0
		mode_scores["team:%d" % int(actor.get("team", 0))] = 0
	if mode == "capture_flag":
		for team in 2:
			var home := spawns[team % spawns.size()]
			flags.append({"team": team, "home": home, "pos": home,
				"carrier": -1, "dropped": false})
	if mode == "pointmatch":
		var field := _rect_from(current_map.get("bounds", [60, 110, 1160, 520]))
		point_item = {"pos": field.get_center(), "carrier": -1, "score_tick": 0}


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
	match_ticks += 1
	show_scoreboard = false
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
	_update_objectives()
	for index in actors.size():
		if bool((actors[index] as Dictionary).get("alive", false)):
			_collect_pickups(index)
	if not finished and match_ticks >= time_limit_ticks:
		_finish_mode(_leading_actor(), _leading_team())
	_render()


func _apply_actor_input(index: int, input: Dictionary) -> void:
	var actor: Dictionary = actors[index]
	var move: Vector2 = input.get("move", Vector2.ZERO)
	var aim: Vector2 = input.get("aim", Vector2.ZERO)
	var held: Dictionary = input.get("held", {})
	var pressed: Dictionary = input.get("pressed", {})
	show_scoreboard = show_scoreboard or bool(held.get("scoreboard", false))
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
		var attacker := int(actor.get("last_attacker", -1))
		if attacker >= 0 and attacker < actors.size() and attacker != index:
			_record_kill(attacker, index)
		_drop_carried_objectives(index)
		if gore_enabled:
			_spawn_death_parts(actor)


func _record_kill(killer: int, victim: int) -> void:
	if killer < 0 or killer >= actors.size() or victim < 0 or victim >= actors.size():
		return
	var source: Dictionary = actors[killer]
	var target: Dictionary = actors[victim]
	source["kills"] = int(source.get("kills", 0)) + 1
	source["score"] = int(source.get("score", 0)) + 1
	var actor_key := "actor:%d" % killer
	mode_scores[actor_key] = int(mode_scores.get(actor_key, 0)) + 1
	if mode == "team_deathmatch":
		var team_key := "team:%d" % int(source.get("team", 0))
		mode_scores[team_key] = int(mode_scores.get(team_key, 0)) + 1
	kill_feed.push_front("%s CUT %s" % [_actor_name(source), _actor_name(target)])
	if kill_feed.size() > 5:
		kill_feed.resize(5)
	if not finished:
		var winning_score := int(mode_scores.get(actor_key, 0))
		if mode == "team_deathmatch":
			winning_score = int(mode_scores.get("team:%d" % int(source.get("team", 0)), 0))
		if mode in ["deathmatch", "team_deathmatch"] and winning_score >= score_limit:
			_finish_mode(killer, int(source.get("team", 0)))


func _update_objectives() -> void:
	if mode == "capture_flag":
		_update_flags()
	elif mode == "pointmatch":
		_update_point_item()


func _update_flags() -> void:
	for flag_index in flags.size():
		var flag: Dictionary = flags[flag_index]
		var carrier := int(flag.get("carrier", -1))
		if carrier >= 0:
			var runner: Dictionary = actors[carrier]
			if not bool(runner.get("alive", false)):
				flag["carrier"] = -1
				flag["dropped"] = true
			else:
				flag["pos"] = Vector2(runner.get("pos", Vector2.ZERO))
				var team := int(runner.get("team", 0))
				var own_flag: Dictionary = flags[team]
				if team != int(flag.get("team", -1)) and int(own_flag.get("carrier", -1)) == -1 \
						and not bool(own_flag.get("dropped", false)) \
						and Vector2(runner.get("pos", Vector2.ZERO)).distance_to(Vector2(own_flag.get("home", Vector2.ZERO))) <= 34.0:
					_capture_flag(team, flag_index, carrier)
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
				kill_feed.push_front("%s TOOK TEAM %d SIGNAL" % [_actor_name(actor), int(flag.get("team", 0))])
			break


func _capture_flag(team: int, flag_index: int, carrier: int) -> void:
	mode_scores["team:%d" % team] = int(mode_scores.get("team:%d" % team, 0)) + 3
	var actor: Dictionary = actors[carrier]
	actor["score"] = int(actor.get("score", 0)) + 3
	mode_scores["actor:%d" % carrier] = int(mode_scores.get("actor:%d" % carrier, 0)) + 3
	kill_feed.push_front("%s BANKED THE SIGNAL" % _actor_name(actor))
	_reset_flag(flag_index)
	if int(mode_scores["team:%d" % team]) >= score_limit:
		_finish_mode(carrier, team)


func _reset_flag(index: int) -> void:
	var flag: Dictionary = flags[index]
	flag["pos"] = Vector2(flag.get("home", Vector2.ZERO))
	flag["carrier"] = -1
	flag["dropped"] = false


func _update_point_item() -> void:
	var carrier := int(point_item.get("carrier", -1))
	if carrier >= 0:
		var actor: Dictionary = actors[carrier]
		if not bool(actor.get("alive", false)):
			point_item["carrier"] = -1
			return
		point_item["pos"] = Vector2(actor.get("pos", Vector2.ZERO))
		point_item["score_tick"] = int(point_item.get("score_tick", 0)) + 1
		if int(point_item["score_tick"]) >= POINT_SCORE_TICKS:
			point_item["score_tick"] = 0
			actor["score"] = int(actor.get("score", 0)) + 1
			var actor_key := "actor:%d" % carrier
			mode_scores[actor_key] = int(mode_scores.get(actor_key, 0)) + 1
			if int(mode_scores[actor_key]) >= score_limit:
				_finish_mode(carrier, int(actor.get("team", 0)))
		return
	for actor_value in actors:
		var actor: Dictionary = actor_value
		if bool(actor.get("alive", false)) and Vector2(actor.get("pos", Vector2.ZERO)).distance_to(
				Vector2(point_item.get("pos", Vector2.ZERO))) <= 28.0:
			point_item["carrier"] = int(actor.get("id", -1))
			point_item["score_tick"] = 0
			kill_feed.push_front("%s HOLDS THE POINT IRON" % _actor_name(actor))
			break


func _drop_carried_objectives(actor_id: int) -> void:
	for flag_value in flags:
		var flag: Dictionary = flag_value
		if int(flag.get("carrier", -1)) == actor_id:
			flag["carrier"] = -1
			flag["dropped"] = true
			flag["pos"] = Vector2((actors[actor_id] as Dictionary).get("pos", Vector2.ZERO))
	if int(point_item.get("carrier", -1)) == actor_id:
		point_item["carrier"] = -1
		point_item["pos"] = Vector2((actors[actor_id] as Dictionary).get("pos", Vector2.ZERO))


func _finish_mode(winner_actor: int, winner_team: int) -> void:
	if finished:
		return
	var kills := 0
	if winner_actor >= 0 and winner_actor < actors.size():
		kills = int((actors[winner_actor] as Dictionary).get("kills", 0))
	finish_match({"primary": 1, "secondary": {"kills": kills,
		"winner": winner_actor, "team": winner_team, "mode": mode,
		"objective_score": int(mode_scores.get("team:%d" % winner_team, 0)),
		"duration_ticks": match_ticks, "map_id": String(current_map.get("id", ""))},
		"outcome": "complete", "ranked": true})


func _leading_actor() -> int:
	var best := 0
	for index in actors.size():
		if int((actors[index] as Dictionary).get("score", 0)) > int((actors[best] as Dictionary).get("score", 0)):
			best = index
	return best


func _leading_team() -> int:
	return 0 if int(mode_scores.get("team:0", 0)) >= int(mode_scores.get("team:1", 0)) else 1


func _actor_name(actor: Dictionary) -> String:
	return "RIDER" if not bool(actor.get("ai", false)) else "BOT-%02d" % int(actor.get("id", 0))


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


func _ai_snapshot(index: int) -> Dictionary:
	if not bool(context.get("bots_enabled", true)):
		return {}
	var actor: Dictionary = actors[index]
	var origin: Vector2 = actor.get("pos", Vector2.ZERO)
	var target_pos := origin
	var goal := "enemy"
	var target_enemy := _nearest_enemy(index)
	if float(actor.get("hp", 100.0)) < 35.0:
		var health := _nearest_pickup(origin, "health")
		if not health.is_empty():
			target_pos = Vector2(health.get("pos", origin))
			goal = "pickup_health"
		elif target_enemy >= 0:
			target_pos = origin - (Vector2((actors[target_enemy] as Dictionary).get("pos", origin)) - origin)
			goal = "retreat"
	elif mode == "capture_flag":
		var carried := _flag_carried_by(index)
		if carried >= 0:
			target_pos = Vector2((flags[int(actor.get("team", 0))] as Dictionary).get("home", origin))
			goal = "flag_home"
		else:
			var enemy_flag: Dictionary = flags[1 - int(actor.get("team", 0))]
			target_pos = Vector2(enemy_flag.get("pos", origin))
			goal = "enemy_flag"
	elif mode == "pointmatch" and int(point_item.get("carrier", -1)) != index:
		target_pos = Vector2(point_item.get("pos", origin))
		goal = "point_item"
	elif target_enemy >= 0:
		target_pos = Vector2((actors[target_enemy] as Dictionary).get("pos", origin))
	actor["ai_goal"] = goal
	var delta := target_pos - origin
	var move := Vector2(signf(delta.x), 0.0)
	var held := {}
	var pressed := {}
	if delta.y < -30.0:
		held["mobility"] = true
		if bool(actor.get("on_ground", false)):
			pressed["mobility"] = true
	if target_enemy >= 0:
		var enemy_delta := Vector2((actors[target_enemy] as Dictionary).get("hit_pos",
			(actors[target_enemy] as Dictionary).get("pos", origin))) - _muzzle(actor)
		if enemy_delta.length() < 820.0 and posmod(tick + index * 3, 9) == 0:
			pressed["primary"] = true
		if enemy_delta.length() < 300.0 and posmod(tick + index * 7, 91) == 0:
			pressed["secondary"] = true
		return {"seat": index, "move": move, "aim": enemy_delta.normalized(),
			"held": held, "pressed": pressed, "released": {}}
	return {"seat": index, "move": move, "aim": delta.normalized(),
		"held": held, "pressed": pressed, "released": {}}


func _nearest_enemy(index: int) -> int:
	var actor: Dictionary = actors[index]
	var best := -1
	var best_distance := INF
	for other in actors.size():
		if other == index or not bool((actors[other] as Dictionary).get("alive", false)) \
				or int((actors[other] as Dictionary).get("team", -1)) == int(actor.get("team", -2)):
			continue
		var distance := Vector2(actor.get("pos", Vector2.ZERO)).distance_squared_to(
			Vector2((actors[other] as Dictionary).get("pos", Vector2.ZERO)))
		if distance < best_distance:
			best_distance = distance
			best = other
	return best


func _nearest_pickup(origin: Vector2, kind: String) -> Dictionary:
	var best := {}
	var best_distance := INF
	for pickup_value in pickups:
		var pickup: Dictionary = pickup_value
		if String(pickup.get("kind", "")) != kind:
			continue
		var distance := origin.distance_squared_to(Vector2(pickup.get("pos", origin)))
		if distance < best_distance:
			best_distance = distance
			best = pickup
	return best


func _flag_carried_by(actor_id: int) -> int:
	for index in flags.size():
		if int((flags[index] as Dictionary).get("carrier", -1)) == actor_id:
			return index
	return -1


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
		_sync_deaths()
	return ok


func score_kill_for_test(killer: int, victim: int) -> bool:
	if finished or victim < 0 or victim >= actors.size():
		return false
	var target: Dictionary = actors[victim]
	target["spawn_protection"] = 0
	target["alive"] = true
	target["hp"] = float(target.get("max_hp", 100.0))
	target["respawn_ticks"] = 0
	return damage_actor_for_test(victim, float(target["hp"]) + 1.0, killer)


func flag_state(team: int) -> Dictionary:
	return flags[team] if team >= 0 and team < flags.size() else {}


func update_objectives_for_test() -> void:
	_update_objectives()


func respawn_actor_for_test(index: int) -> void:
	_respawn(index)


func ai_snapshot_for_test(index: int) -> Dictionary:
	return _ai_snapshot(index)


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
	state["mode_scores"] = mode_scores.duplicate(true)
	state["flags"] = flags.duplicate(true)
	state["point_item"] = point_item.duplicate(true)
	state["kill_feed"] = kill_feed.duplicate()
	state["show_scoreboard"] = show_scoreboard
	state["score_limit"] = score_limit
	state["time_limit_ticks"] = time_limit_ticks
	state["match_ticks"] = match_ticks
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
	mode_scores = (state.get("mode_scores", mode_scores) as Dictionary).duplicate(true)
	flags = (state.get("flags", flags) as Array).duplicate(true)
	point_item = (state.get("point_item", point_item) as Dictionary).duplicate(true)
	kill_feed.assign(state.get("kill_feed", kill_feed))
	show_scoreboard = bool(state.get("show_scoreboard", show_scoreboard))
	score_limit = int(state.get("score_limit", score_limit))
	time_limit_ticks = int(state.get("time_limit_ticks", time_limit_ticks))
	match_ticks = int(state.get("match_ticks", match_ticks))
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
	if _scoreboard_label != null:
		var lines: Array[String] = ["%s // LIMIT %d" % [mode.to_upper(), score_limit]]
		for actor_value in actors:
			var actor: Dictionary = actor_value
			lines.append("%s  %02d  K%d D%d" % [_actor_name(actor), int(actor.get("score", 0)),
				int(actor.get("kills", 0)), int(actor.get("deaths", 0))])
		_scoreboard_label.text = "\n".join(lines)
		_scoreboard_label.visible = show_scoreboard
	if _kill_feed_label != null:
		_kill_feed_label.text = "\n".join(kill_feed)
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
	for flag_value in flags:
		var flag: Dictionary = flag_value
		var flag_pos: Vector2 = flag.get("pos", Vector2.ZERO)
		draw_line(flag_pos, flag_pos - Vector2(0, 48), Draw.BONE, 4.0)
		draw_colored_polygon(PackedVector2Array([flag_pos - Vector2(0, 48),
			flag_pos + Vector2(36, -38), flag_pos - Vector2(0, 28)]),
			Draw.team_color(int(flag.get("team", 0))))
	if not point_item.is_empty():
		draw_circle(Vector2(point_item.get("pos", Vector2.ZERO)) - Vector2(0, 18), 11, Draw.AMBER)
		draw_arc(Vector2(point_item.get("pos", Vector2.ZERO)) - Vector2(0, 18), 17, 0, TAU, 16, Draw.BONE, 2.0)
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
