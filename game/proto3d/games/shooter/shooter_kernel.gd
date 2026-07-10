## Deterministic combat substrate shared by RUST RUNNERS and BLACK GRID.
## Locomotion, maps, objectives, bots, and presentation remain cartridge-owned.
class_name ProtoShooterKernel
extends RefCounted

const STEP := 1.0 / 30.0
const DEFAULT_WEAPONS := "res://data/game_shooter_weapons.json"

var weapon_rows: Dictionary = {}
var actors: Dictionary = {}
var projectiles: Array = []
var events: Array = []
var bounds := Rect2()
var walls: Array[Rect2] = []
var tick := 0
var _rng := RandomNumberGenerator.new()
var _next_projectile_id := 1


static func load_weapon_rows(path: String = DEFAULT_WEAPONS) -> Dictionary:
	var out := {}
	if not FileAccess.file_exists(path):
		return out
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not parsed is Dictionary:
		return out
	for value in (parsed as Dictionary).get("weapons", []):
		var row: Dictionary = value
		var id := String(row.get("id", ""))
		if id == "" or out.has(id):
			continue
		out[id] = row.duplicate(true)
	return out


func configure(rows: Dictionary, seed_value: int, field_bounds: Rect2,
		collision_rects: Array = []) -> void:
	weapon_rows = rows.duplicate(true)
	actors.clear()
	projectiles.clear()
	events.clear()
	bounds = field_bounds
	walls.clear()
	for value in collision_rects:
		if value is Rect2:
			walls.append(value)
	tick = 0
	_next_projectile_id = 1
	_rng.seed = seed_value


func add_actor(source: Dictionary) -> bool:
	var id := int(source.get("id", -1))
	if id < 0 or actors.has(id):
		return false
	var actor := source.duplicate(true)
	actor["id"] = id
	actor["team"] = int(actor.get("team", -1))
	actor["pos"] = Vector2(actor.get("pos", Vector2.ZERO))
	actor["velocity"] = Vector2(actor.get("velocity", Vector2.ZERO))
	actor["hp"] = float(actor.get("hp", 100.0))
	actor["max_hp"] = float(actor.get("max_hp", actor["hp"]))
	actor["armor"] = float(actor.get("armor", 0.0))
	actor["radius"] = float(actor.get("radius", 12.0))
	actor["alive"] = bool(actor.get("alive", true))
	actor["weapons"] = (actor.get("weapons", {}) as Dictionary).duplicate(true)
	actors[id] = actor
	return true


func actor_state(id: int) -> Dictionary:
	return actors.get(id, {})


func equip(actor_id: int, weapon_ids: Array) -> bool:
	if not actors.has(actor_id):
		return false
	var actor: Dictionary = actors[actor_id]
	var states: Dictionary = actor["weapons"]
	var equipped := 0
	for value in weapon_ids:
		var weapon_id := String(value)
		if not weapon_rows.has(weapon_id):
			continue
		var row: Dictionary = weapon_rows[weapon_id]
		states[weapon_id] = {"ammo": int(row.get("magazine", 0)),
			"reserve": int(row.get("reserve", 0)), "cooldown": 0,
			"reload": 0, "heat": 0.0}
		equipped += 1
	return equipped > 0


func fire(actor_id: int, weapon_id: String, origin: Vector2, aim: Vector2,
		extra: Dictionary = {}) -> Dictionary:
	if not actors.has(actor_id) or not weapon_rows.has(weapon_id):
		return {}
	var actor: Dictionary = actors[actor_id]
	var states: Dictionary = actor.get("weapons", {})
	if not bool(actor.get("alive", false)) or not states.has(weapon_id):
		return {}
	var state: Dictionary = states[weapon_id]
	var row: Dictionary = weapon_rows[weapon_id]
	if int(state.get("cooldown", 0)) > 0 or int(state.get("reload", 0)) > 0 \
			or int(state.get("ammo", 0)) <= 0:
		return {}
	var heat_limit := float(row.get("heat_limit", INF))
	if float(state.get("heat", 0.0)) + float(row.get("heat", 0.0)) > heat_limit:
		return {}
	state["ammo"] = int(state["ammo"]) - 1
	state["cooldown"] = int(row.get("cooldown_ticks", 1))
	state["heat"] = float(state.get("heat", 0.0)) + float(row.get("heat", 0.0))
	var base_direction := aim.normalized() if aim.length_squared() > 0.0001 else Vector2.RIGHT
	var directions: Array = []
	var pellet_count := maxi(1, int(row.get("pellets", 1)))
	for _pellet in pellet_count:
		var angle := base_direction.angle() + _rng.randf_range(-float(row.get("spread", 0.0)),
			float(row.get("spread", 0.0)))
		var direction := Vector2.from_angle(angle)
		directions.append(direction)
		if String(row.get("kind", "hitscan")) == "hitscan":
			_trace_hitscan(actor_id, origin, direction, row)
		else:
			_spawn_projectile(actor_id, origin, direction, row, extra)
	actor["velocity"] = Vector2(actor.get("velocity", Vector2.ZERO)) \
		- base_direction * float(row.get("recoil", 0.0))
	var fired := {"kind": "fire", "tick": tick, "actor_id": actor_id,
		"weapon_id": weapon_id, "directions": directions,
		"ammo": int(state["ammo"]), "recoil": float(row.get("recoil", 0.0))}
	events.append(fired.duplicate(true))
	return fired


func start_reload(actor_id: int, weapon_id: String) -> bool:
	if not actors.has(actor_id) or not weapon_rows.has(weapon_id):
		return false
	var states: Dictionary = (actors[actor_id] as Dictionary).get("weapons", {})
	if not states.has(weapon_id):
		return false
	var state: Dictionary = states[weapon_id]
	var row: Dictionary = weapon_rows[weapon_id]
	if int(state.get("reload", 0)) > 0 or int(state.get("reserve", 0)) <= 0 \
			or int(state.get("ammo", 0)) >= int(row.get("magazine", 0)):
		return false
	state["reload"] = maxi(1, int(row.get("reload_ticks", 1)))
	events.append({"kind": "reload", "tick": tick, "actor_id": actor_id,
		"weapon_id": weapon_id})
	return true


func step_many(count: int) -> void:
	for _index in maxi(0, count):
		step()


func step() -> void:
	tick += 1
	_step_weapon_states()
	var index := projectiles.size() - 1
	while index >= 0:
		if _step_projectile(index):
			projectiles.remove_at(index)
		index -= 1


func _step_weapon_states() -> void:
	for actor_value in actors.values():
		var actor: Dictionary = actor_value
		for weapon_id_value in (actor.get("weapons", {}) as Dictionary).keys():
			var weapon_id := String(weapon_id_value)
			var state: Dictionary = actor["weapons"][weapon_id]
			var row: Dictionary = weapon_rows.get(weapon_id, {})
			state["cooldown"] = maxi(0, int(state.get("cooldown", 0)) - 1)
			state["heat"] = maxf(0.0, float(state.get("heat", 0.0))
				- float(row.get("heat_decay", 0.0)))
			if int(state.get("reload", 0)) <= 0:
				continue
			state["reload"] = int(state["reload"]) - 1
			if int(state["reload"]) == 0:
				var wanted := maxi(0, int(row.get("magazine", 0)) - int(state.get("ammo", 0)))
				var moved := mini(wanted, int(state.get("reserve", 0)))
				state["ammo"] = int(state.get("ammo", 0)) + moved
				state["reserve"] = int(state.get("reserve", 0)) - moved


func _spawn_projectile(actor_id: int, origin: Vector2, direction: Vector2,
		row: Dictionary, extra: Dictionary) -> void:
	var speed := float(row.get("speed", 0.0)) * float(extra.get("velocity_scale", 1.0))
	projectiles.append({"id": _next_projectile_id, "owner": actor_id,
		"team": int((actors[actor_id] as Dictionary).get("team", -1)),
		"weapon_id": String(row.get("id", "")), "pos": origin,
		"velocity": direction * speed, "damage": float(row.get("damage", 0.0)),
		"gravity": float(row.get("gravity", 0.0)),
		"life": int(row.get("life_ticks", 1)),
		"fuse": int(extra.get("fuse_ticks", row.get("fuse_ticks", 0))),
		"blast_radius": float(row.get("blast_radius", 0.0)),
		"shrapnel": int(row.get("shrapnel", 0)),
		"ricochets": int(row.get("ricochets", 0)),
		"armor_pierce": float(row.get("armor_pierce", 0.0)),
		"knockback": float(row.get("knockback", 0.0)),
		"friendly_fire": bool(row.get("friendly_fire", false)),
		"color": String(row.get("color", "#ffffff"))})
	_next_projectile_id += 1


func _step_projectile(index: int) -> bool:
	var projectile: Dictionary = projectiles[index]
	projectile["life"] = int(projectile.get("life", 0)) - 1
	if int(projectile.get("fuse", 0)) > 0:
		projectile["fuse"] = int(projectile["fuse"]) - 1
		if int(projectile["fuse"]) <= 0:
			_explode(projectile)
			return true
	var old_pos: Vector2 = projectile.get("pos", Vector2.ZERO)
	var velocity: Vector2 = projectile.get("velocity", Vector2.ZERO)
	velocity.y += float(projectile.get("gravity", 0.0)) * STEP
	var new_pos := old_pos + velocity * STEP
	var wall_hit := _first_wall_hit(old_pos, new_pos)
	if not wall_hit.is_empty():
		if int(projectile.get("ricochets", 0)) > 0:
			var normal: Vector2 = wall_hit.get("normal", Vector2.LEFT)
			velocity = velocity.bounce(normal)
			projectile["ricochets"] = int(projectile["ricochets"]) - 1
			new_pos = Vector2(wall_hit.get("point", old_pos)) + normal * 0.5
			events.append({"kind": "ricochet", "tick": tick,
				"projectile_id": int(projectile.get("id", 0))})
		else:
			projectile["pos"] = Vector2(wall_hit.get("point", old_pos))
			if float(projectile.get("blast_radius", 0.0)) > 0.0:
				_explode(projectile)
			return true
	var target := _first_actor_hit(old_pos, new_pos, int(projectile.get("owner", -1)),
		int(projectile.get("team", -1)), bool(projectile.get("friendly_fire", false)))
	if target >= 0:
		var hit_direction := velocity.normalized() if velocity.length_squared() > 0.0 else Vector2.RIGHT
		damage_actor(target, float(projectile.get("damage", 0.0)),
			float(projectile.get("armor_pierce", 0.0)), hit_direction,
			float(projectile.get("knockback", 0.0)), int(projectile.get("owner", -1)))
		projectile["pos"] = new_pos
		if float(projectile.get("blast_radius", 0.0)) > 0.0:
			_explode(projectile)
		return true
	projectile["pos"] = new_pos
	projectile["velocity"] = velocity
	projectiles[index] = projectile
	if int(projectile.get("life", 0)) <= 0 or not bounds.grow(32.0).has_point(new_pos):
		if float(projectile.get("blast_radius", 0.0)) > 0.0:
			_explode(projectile)
		return true
	return false


func _trace_hitscan(actor_id: int, origin: Vector2, direction: Vector2,
		row: Dictionary) -> void:
	var remaining := float(row.get("range", 800.0))
	var ray_origin := origin
	var ray_direction := direction
	var bounces := int(row.get("ricochets", 0))
	while remaining > 0.1:
		var ray_end := ray_origin + ray_direction * remaining
		var actor_hit := _first_actor_hit_data(ray_origin, ray_end, actor_id,
			int((actors[actor_id] as Dictionary).get("team", -1)),
			bool(row.get("friendly_fire", false)))
		var wall_hit := _first_wall_hit(ray_origin, ray_end)
		var actor_fraction := float(actor_hit.get("fraction", INF))
		var wall_fraction := float(wall_hit.get("fraction", INF))
		if actor_fraction < wall_fraction:
			var target := int(actor_hit.get("actor_id", -1))
			damage_actor(target, float(row.get("damage", 0.0)),
				float(row.get("armor_pierce", 0.0)), ray_direction,
				float(row.get("knockback", 0.0)), actor_id)
			return
		if wall_hit.is_empty():
			return
		if bounces <= 0:
			return
		var normal: Vector2 = wall_hit.get("normal", Vector2.LEFT)
		ray_origin = Vector2(wall_hit.get("point", ray_origin)) + normal * 0.5
		remaining *= 1.0 - wall_fraction
		ray_direction = ray_direction.bounce(normal)
		bounces -= 1
		events.append({"kind": "ricochet", "tick": tick, "actor_id": actor_id,
			"weapon_id": String(row.get("id", ""))})


func damage_actor(actor_id: int, amount: float, armor_pierce: float,
		direction: Vector2, knockback: float, attacker_id: int) -> bool:
	if amount <= 0.0 or not actors.has(actor_id):
		return false
	var actor: Dictionary = actors[actor_id]
	if not bool(actor.get("alive", false)):
		return false
	var armor := float(actor.get("armor", 0.0))
	var absorb := minf(armor, amount * (1.0 - clampf(armor_pierce, 0.0, 1.0)))
	actor["armor"] = armor - absorb
	actor["hp"] = maxf(0.0, float(actor.get("hp", 0.0)) - (amount - absorb))
	actor["velocity"] = Vector2(actor.get("velocity", Vector2.ZERO)) + direction * knockback
	if float(actor["hp"]) <= 0.0:
		actor["alive"] = false
	events.append({"kind": "damage", "tick": tick, "actor_id": actor_id,
		"attacker_id": attacker_id, "amount": amount, "absorbed": absorb})
	return true


func _explode(projectile: Dictionary) -> void:
	var center: Vector2 = projectile.get("pos", Vector2.ZERO)
	var radius := float(projectile.get("blast_radius", 0.0))
	if radius <= 0.0:
		return
	var owner := int(projectile.get("owner", -1))
	var owner_team := int(projectile.get("team", -1))
	var friendly := bool(projectile.get("friendly_fire", false))
	for actor_id_value in actors.keys():
		var actor_id := int(actor_id_value)
		if actor_id == owner:
			continue
		var actor: Dictionary = actors[actor_id]
		if not bool(actor.get("alive", false)) or (not friendly
				and int(actor.get("team", -2)) == owner_team):
			continue
		var offset := Vector2(actor.get("pos", Vector2.ZERO)) - center
		var distance := offset.length()
		if distance > radius:
			continue
		var falloff := clampf(1.0 - distance / radius, 0.08, 1.0)
		damage_actor(actor_id, float(projectile.get("damage", 0.0)) * falloff,
			float(projectile.get("armor_pierce", 0.0)),
			offset.normalized() if distance > 0.01 else Vector2.RIGHT,
			float(projectile.get("knockback", 0.0)) * falloff, owner)
	events.append({"kind": "blast", "tick": tick, "pos": center, "radius": radius})
	var shard_count := int(projectile.get("shrapnel", 0))
	for _shard in shard_count:
		var direction := Vector2.from_angle(_rng.randf_range(-PI, PI))
		events.append({"kind": "shrapnel", "tick": tick, "pos": center,
			"direction": direction})
		var shard_row := {"id": String(projectile.get("weapon_id", "")),
			"range": radius * 1.4, "damage": float(projectile.get("damage", 0.0)) * 0.16,
			"armor_pierce": float(projectile.get("armor_pierce", 0.0)),
			"knockback": float(projectile.get("knockback", 0.0)) * 0.1,
			"ricochets": 0, "friendly_fire": friendly}
		_trace_hitscan(owner, center, direction, shard_row)


func _first_actor_hit(start: Vector2, finish: Vector2, owner: int, team: int,
		friendly_fire: bool) -> int:
	return int(_first_actor_hit_data(start, finish, owner, team, friendly_fire).get("actor_id", -1))


func _first_actor_hit_data(start: Vector2, finish: Vector2, owner: int, team: int,
		friendly_fire: bool) -> Dictionary:
	var best := {}
	var best_fraction := INF
	for actor_id_value in actors.keys():
		var actor_id := int(actor_id_value)
		if actor_id == owner:
			continue
		var actor: Dictionary = actors[actor_id]
		if not bool(actor.get("alive", false)) or (not friendly_fire
				and int(actor.get("team", -2)) == team):
			continue
		var fraction := _segment_circle_fraction(start, finish,
			Vector2(actor.get("pos", Vector2.ZERO)), float(actor.get("radius", 12.0)))
		if fraction >= 0.0 and fraction < best_fraction:
			best_fraction = fraction
			best = {"actor_id": actor_id, "fraction": fraction}
	return best


func _segment_circle_fraction(start: Vector2, finish: Vector2, center: Vector2,
		radius: float) -> float:
	var delta := finish - start
	var offset := start - center
	var a := delta.dot(delta)
	if a <= 0.000001:
		return -1.0
	var b := 2.0 * offset.dot(delta)
	var c := offset.dot(offset) - radius * radius
	var discriminant := b * b - 4.0 * a * c
	if discriminant < 0.0:
		return -1.0
	var root := sqrt(discriminant)
	var first := (-b - root) / (2.0 * a)
	if first >= 0.0 and first <= 1.0:
		return first
	var second := (-b + root) / (2.0 * a)
	return second if second >= 0.0 and second <= 1.0 else -1.0


func _first_wall_hit(start: Vector2, finish: Vector2) -> Dictionary:
	var best := {}
	var best_fraction := INF
	for wall in walls:
		var hit := _segment_rect_hit(start, finish, wall)
		var fraction := float(hit.get("fraction", INF))
		if fraction < best_fraction:
			best_fraction = fraction
			best = hit
	return best


func _segment_rect_hit(start: Vector2, finish: Vector2, rect: Rect2) -> Dictionary:
	var delta := finish - start
	var t_min := 0.0
	var t_max := 1.0
	var normal := Vector2.ZERO
	for axis in 2:
		var origin := start[axis]
		var direction := delta[axis]
		var low := rect.position[axis]
		var high := rect.end[axis]
		if absf(direction) < 0.000001:
			if origin < low or origin > high:
				return {}
			continue
		var near := (low - origin) / direction
		var far := (high - origin) / direction
		var near_normal := Vector2.ZERO
		near_normal[axis] = -1.0 if direction > 0.0 else 1.0
		if near > far:
			var swap := near
			near = far
			far = swap
		if near > t_min:
			t_min = near
			normal = near_normal
		t_max = minf(t_max, far)
		if t_min > t_max:
			return {}
	if t_min < 0.0 or t_min > 1.0:
		return {}
	return {"fraction": t_min, "point": start + delta * t_min, "normal": normal}


func event_count(kind: String) -> int:
	var count := 0
	for event_value in events:
		var event: Dictionary = event_value
		if String(event.get("kind", "")) == kind:
			count += 1
	return count


func snapshot() -> Dictionary:
	return {"tick": tick, "rng_state": _rng.state, "actors": actors.duplicate(true),
		"projectiles": projectiles.duplicate(true), "events": events.duplicate(true),
		"next_projectile_id": _next_projectile_id}


func restore_snapshot(state: Dictionary) -> void:
	tick = int(state.get("tick", tick))
	_rng.state = int(state.get("rng_state", _rng.state))
	actors = (state.get("actors", actors) as Dictionary).duplicate(true)
	projectiles = (state.get("projectiles", projectiles) as Array).duplicate(true)
	events = (state.get("events", events) as Array).duplicate(true)
	_next_projectile_id = int(state.get("next_projectile_id", _next_projectile_id))
