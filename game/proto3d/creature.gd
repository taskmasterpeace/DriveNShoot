## THE CREATURES (LIVING_WOUND_ECOSYSTEM P1 — the realized half of the eco
## bridge). One class wears every non-apex wildlife ROW: Mossback grazes and
## herds, the Wire Rat scurries the wreck lines, the Road Vulture circles the
## dead (the read layer made visible), the Razor Dog stalks the dusk road.
## Rows live in data/creatures.json over the code floor below (id present
## replaces — the house fold law). Counts come from the population ledger
## (ProtoEcology.wildlife_desired → materialize_budget); this class never
## decides how many of itself exist. Death: the rig IS the corpse (0.11 BODY
## LAW) and the kill writes back into the cell's eco floats (eco_kill) — the
## land remembers what you take from it.
class_name ProtoCreature
extends CharacterBody3D

## Code floor (data/creatures.json overlays by id; a missing file still walks).
static var ROWS: Dictionary = {
	"mossback": {"id": "mossback", "name": "MOSSBACK", "group": "grazer",
		"biomes": ["swamp", "forest", "farmland", "plains", "scrub"],
		"hp": 70.0, "speed": 1.4, "flee_speed": 4.2, "sense_m": 16.0, "herd_m": 26.0,
		"color": [0.3, 0.36, 0.22], "rig_scale": 2.2, "rig_tail": 0.25, "rig_ears": true,
		"loot": {"meat": [2, 4], "hide": [1, 2]}, "eco_kill": {"prey_density": -0.05}, "noise_flee": true},
	"wire_rat": {"id": "wire_rat", "name": "WIRE RAT", "group": "rodent",
		"biomes": ["urban", "scrub", "farmland", "plains", "forest", "swamp", "desert"],
		"hp": 8.0, "speed": 2.6, "flee_speed": 5.2, "sense_m": 10.0, "herd_m": 0.0,
		"color": [0.36, 0.32, 0.28], "rig_scale": 0.38, "rig_tail": 0.55, "rig_ears": true,
		"rig_squash_y": 0.55, "rig_stretch_z": 1.2,
		"loot": {"meat": [0, 1]}, "eco_kill": {"prey_density": -0.01}, "noise_flee": true},
	"road_vulture": {"id": "road_vulture", "name": "ROAD VULTURE", "group": "scavenger",
		"biomes": ["swamp", "forest", "farmland", "plains", "scrub", "desert", "urban", "mountains"],
		"hp": 12.0, "speed": 3.0, "flee_speed": 6.0, "sense_m": 14.0, "herd_m": 0.0,
		"color": [0.2, 0.18, 0.17], "rig_scale": 0.5, "rig_tail": 0.2, "rig_ears": false,
		"flying": true, "circle_r": 9.0, "circle_h": 7.0,
		"loot": {"meat": [0, 1]}, "eco_kill": {}},
	"glass_jackal": {"id": "glass_jackal", "name": "RAZOR DOG", "group": "pack_pred",
		"biomes": ["swamp", "forest", "scrub", "desert", "plains", "farmland"],
		"hp": 45.0, "speed": 2.2, "flee_speed": 5.0, "chase_speed": 4.6,
		"sense_m": 22.0, "herd_m": 18.0, "attack_dmg": 11.0, "attack_m": 1.7,
		"attack_cd": 1.1, "dusk_bias": true,
		"color": [0.44, 0.38, 0.3], "rig_scale": 1.05, "rig_tail": 0.45, "rig_ears": true,
		"loot": {"meat": [1, 2], "hide": [0, 1]}, "eco_kill": {"predator_pressure": -0.08}},
}
static var _rows_folded: bool = false

const GRAVITY := 20.0
const SENSE_EVERY := 12       ## frames between sense sweeps (throttled group scans)
const FLEE_HOLD_S := 3.0      ## keeps running this long after the danger drops off

enum CState { WANDER, FLEE, STALK, CHASE, CIRCLE, FLUSH }

var kind: String = ""
var row: Dictionary = {}
var state: int = CState.WANDER
var dead: bool = false
var body: Damageable = null

var _quad: ProtoQuadruped = null
var _main: Node = null
var _rng := RandomNumberGenerator.new()
var _frame: int = 0
var _wander_target: Vector3
var _wander_t: float = 0.0
var _flee_from: Vector3
var _flee_t: float = 0.0
var _hunt: Node3D = null
var _attack_t: float = 0.0
var _anchor: Vector3          ## vulture circle center / general home drift
var _circle_a: float = 0.0    ## vulture orbit angle


static func ensure_rows() -> void:
	if _rows_folded:
		return
	_rows_folded = true
	if not FileAccess.file_exists("res://data/creatures.json"):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/creatures.json"))
	if not (parsed is Dictionary):
		return
	for r in ((parsed as Dictionary).get("creatures", []) as Array):
		if r is Dictionary and (r as Dictionary).has("id"):
			ROWS[String((r as Dictionary)["id"])] = r  # JSON present replaces wholesale


## The realization bridge's picker: first row whose group matches and whose
## biomes allow this ground. "" biome (no map) accepts any row of the group.
static func pick_id(group: String, biome: String) -> String:
	ensure_rows()
	for id in ROWS:
		var r: Dictionary = ROWS[id]
		if String(r.get("group", "")) != group:
			continue
		if biome == "" or (r.get("biomes", []) as Array).has(biome):
			return String(id)
	return ""


static func create(id: String) -> ProtoCreature:
	ensure_rows()
	if not ROWS.has(id):
		return null
	var c := ProtoCreature.new()
	c.kind = id
	c.row = ROWS[id]
	c.name = "Creature_%s" % id
	c.add_to_group("creature")
	c.add_to_group("combatant") # meleeable/huntable; gators may ambush one — that's the food chain
	if float(c.row.get("attack_dmg", 0.0)) > 0.0:
		c.add_to_group("threat") # predators fight back and read as hostiles
	c.body = Damageable.new(String(c.row.get("name", id)), "🐾", float(c.row.get("hp", 20.0)))
	var col: Array = c.row.get("color", [0.4, 0.35, 0.3])
	c._quad = ProtoQuadruped.create({
		"scale": float(c.row.get("rig_scale", 1.0)),
		"tail": float(c.row.get("rig_tail", 0.3)),
		"ears": bool(c.row.get("rig_ears", true)),
		"color": Color(float(col[0]), float(col[1]), float(col[2])),
	})
	c.add_child(c._quad)
	# Silhouette knobs (rows, not code): squash_y is the gator law — a low
	# lozenge reads rodent/reptile where a leggy box reads dog. stretch_z
	# lengthens the body without touching the legs' beat.
	c._quad.scale.y = float(c.row.get("rig_squash_y", 1.0))
	c._quad.scale.z = float(c.row.get("rig_stretch_z", 1.0))
	if bool(c.row.get("flying", false)):
		c._birdify(Color(float(col[0]), float(col[1]), float(col[2])))
	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	var s: float = float(c.row.get("rig_scale", 1.0))
	cap.radius = clampf(0.28 * s, 0.12, 0.8)
	cap.height = clampf(0.9 * s, 0.35, 2.6)
	shape.shape = cap
	shape.rotation.x = PI * 0.5 # long axis along the body
	shape.position.y = 0.4 * s
	c.add_child(shape)
	c._rng.seed = hash(id) + Time.get_ticks_usec()
	return c


func _ready() -> void:
	_anchor = global_position
	_wander_target = global_position
	# Find main by walking up to the node that owns the ledgers (harness-safe:
	# current_scene is the SIM under a test harness — never assume it).
	var n: Node = get_parent()
	while n != null:
		if "population" in n and "daynight" in n:
			_main = n
			break
		n = n.get_parent()


func take_damage(amount: float) -> void:
	if dead:
		return
	body.damage(amount)
	if _quad:
		_quad.flinch()
	if body.hp <= 0.0:
		_die()
	elif not _is_predator():
		# shot and survived: RUN, remember where it came from being irrelevant —
		# prey just breaks away from where it stands
		state = CState.FLEE
		_flee_from = global_position + Vector3(_rng.randf_range(-1, 1), 0, _rng.randf_range(-1, 1))
		_flee_t = FLEE_HOLD_S * 2.0


## A BIRD, not a dog with delusions (2026-07-09 acceptance render: the vulture
## read as a four-legged pup). Fold the hind legs away, tuck the fronts, and
## spread two wide wing slabs off the body so the circling silhouette reads
## from the top-down camera — where this creature lives.
func _birdify(col: Color) -> void:
	var s: float = float(row.get("rig_scale", 0.5))
	for i in _quad.legs.size():
		_quad.legs[i].scale = Vector3.ONE * (0.35 if i < 2 else 0.01) # tucked fronts, no hinds
	for side in [-1.0, 1.0]:
		var wing := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(1.5 * s, 0.045 * s, 0.55 * s)
		wing.mesh = bm
		wing.material_override = ProtoWorldBuilder.material(col * 0.85, 0.9)
		wing.position = Vector3(side * 0.9 * s, 0.52 * s, 0.05 * s)
		wing.rotation.z = side * -0.12 # a shallow soaring dihedral
		_quad.add_child(wing)


func _is_predator() -> bool:
	return float(row.get("attack_dmg", 0.0)) > 0.0


func _is_flying() -> bool:
	return bool(row.get("flying", false))


## THE KILL WRITES BACK (LWE's no-free-lunch ethic): eco_kill deltas land on
## the cell's floats, the ledger forgets this instance, and the rig becomes
## the BODY (0.11) with the row's loot rolled onto it.
func _die() -> void:
	dead = true
	set_physics_process(false)
	if _main != null and "population" in _main and _main.population != null:
		var cell: Dictionary = _main.population.cell_at(global_position)
		var eco: Dictionary = cell.get("eco", {})
		for k in (row.get("eco_kill", {}) as Dictionary):
			if eco.has(k):
				eco[k] = clampf(float(eco[k]) + float((row["eco_kill"] as Dictionary)[k]), 0.0, 1.0)
		_main.population.on_actor_removed(self)
	var loot := {}
	for item_id in (row.get("loot", {}) as Dictionary):
		var span: Array = (row["loot"] as Dictionary)[item_id]
		var n := _rng.randi_range(int(span[0]), int(span[1]))
		if n > 0:
			loot[item_id] = n
	var quad := _quad
	_quad = null
	if quad != null:
		remove_child(quad)
	var corpse := ProtoCorpse.create("%s carcass" % String(row.get("name", kind)),
		loot, Color(0.4, 0.35, 0.3), Vector3.ZERO, _main, quad)
	corpse.heat = 0.8
	var parent := get_parent()
	if parent != null:
		parent.add_child(corpse)
		corpse.global_position = global_position + Vector3(0, 0.25, 0)
	queue_free()


func _physics_process(delta: float) -> void:
	if dead:
		return
	_frame += 1
	_attack_t = maxf(0.0, _attack_t - delta)
	if _frame % SENSE_EVERY == 0:
		_sense()
	match state:
		CState.WANDER:
			_do_wander(delta)
		CState.FLEE:
			_do_flee(delta)
		CState.STALK, CState.CHASE:
			_do_hunt(delta)
		CState.CIRCLE:
			_do_circle(delta)
		CState.FLUSH:
			_do_flush(delta)
	if not _is_flying():
		velocity.y -= GRAVITY * delta if not is_on_floor() else 0.0
		move_and_slide()
	# The rig reports the state: speed drives the gait, morale drives the tail
	# (a fleeing animal TUCKS it; a stalking one holds it low and stiff).
	if _quad:
		var morale := 0.75
		if state == CState.FLEE or state == CState.FLUSH:
			morale = 0.05
		elif state == CState.STALK or state == CState.CHASE:
			morale = 0.35
		_quad.animate(delta, Vector2(velocity.x, velocity.z).length(), morale)


# --- Sensing (throttled) ---------------------------------------------------------------

func _sense() -> void:
	var pos := global_position
	# 1) noise: prey bolts from anything loud enough to reach it
	if bool(row.get("noise_flee", false)) and _main != null and _main.has_method("noises_in"):
		var heard: Array = _main.noises_in(pos)
		if not heard.is_empty():
			var loudest: Dictionary = heard[0]
			for h in heard:
				if float(h["radius"]) > float(loudest["radius"]):
					loudest = h
			state = CState.FLEE
			_flee_from = loudest["pos"]
			_flee_t = FLEE_HOLD_S
			return
	# 2) danger/target scan
	var sense_m := float(row.get("sense_m", 12.0))
	if _is_predator():
		# dusk hunters range wider when the light goes
		if bool(row.get("dusk_bias", false)) and _main != null and "daynight" in _main and _main.daynight != null:
			var hr: float = _main.daynight.hour
			if hr >= 18.0 or hr <= 6.0:
				sense_m *= 1.5
		if _hunt == null or not is_instance_valid(_hunt) or ("dead" in _hunt and _hunt.dead):
			_hunt = _pick_prey(sense_m)
			if _hunt != null:
				state = CState.STALK
		elif global_position.distance_to(_hunt.global_position) > sense_m * 2.0:
			_hunt = null
			state = CState.WANDER
		# a badly hurt predator breaks off
		if body.hp < body.max_hp * 0.25 and _hunt != null:
			state = CState.FLEE
			_flee_from = _hunt.global_position
			_flee_t = FLEE_HOLD_S * 2.0
			_hunt = null
		return
	if _is_flying():
		_sense_vulture()
		return
	# prey: flee the nearest hunter-shaped thing (player, dog, any "threat")
	var danger := _nearest_danger(sense_m)
	if danger != Vector3.INF:
		state = CState.FLEE
		_flee_from = danger
		_flee_t = FLEE_HOLD_S


func _nearest_danger(sense_m: float) -> Vector3:
	var pos := global_position
	var best := Vector3.INF
	var best_d := sense_m
	for grp in ["player3d", "dog", "threat"]:
		for n in get_tree().get_nodes_in_group(grp):
			if n == self or not (n is Node3D) or not is_instance_valid(n):
				continue
			if "dead" in n and n.dead:
				continue
			var d: float = pos.distance_to((n as Node3D).global_position)
			if d < best_d:
				best_d = d
				best = (n as Node3D).global_position
	return best


## A pack predator's menu: the player, dogs, and grazers (the herd IS food —
## jackals culling mossbacks in view is the food chain working on camera).
func _pick_prey(sense_m: float) -> Node3D:
	var pos := global_position
	var best: Node3D = null
	var best_d := sense_m
	for grp in ["player3d", "dog", "creature"]:
		for n in get_tree().get_nodes_in_group(grp):
			if n == self or not (n is Node3D) or not is_instance_valid(n):
				continue
			if "dead" in n and n.dead:
				continue
			if grp == "creature":
				if not (n is ProtoCreature) or String((n as ProtoCreature).row.get("group", "")) != "grazer":
					continue
			var d: float = pos.distance_to((n as Node3D).global_position)
			if d < best_d:
				best_d = d
				best = n as Node3D
	return best


## The vulture read layer: find the freshest corpse in glide range and orbit it.
func _sense_vulture() -> void:
	var pos := global_position
	var best: Node3D = null
	var best_d := 60.0
	for n in get_tree().get_nodes_in_group("corpse"):
		if not (n is Node3D) or not is_instance_valid(n):
			continue
		var d: float = pos.distance_to((n as Node3D).global_position)
		if d < best_d:
			best_d = d
			best = n as Node3D
	if best != null:
		_anchor = best.global_position
	# flushed by anything alive walking up on the meal
	var danger := _nearest_danger(9.0)
	if danger != Vector3.INF and state != CState.FLUSH:
		state = CState.FLUSH
		_flee_from = danger
		_flee_t = 2.5
	elif state != CState.FLUSH:
		state = CState.CIRCLE


# --- Movement --------------------------------------------------------------------------

func _do_wander(delta: float) -> void:
	_wander_t -= delta
	if _wander_t <= 0.0 or global_position.distance_to(_wander_target) < 1.0:
		_wander_t = _rng.randf_range(3.0, 7.0)
		var drift := Vector3(_rng.randf_range(-14, 14), 0, _rng.randf_range(-14, 14))
		# herds drift toward each other: pull the target toward the nearest same-kind
		var herd_m := float(row.get("herd_m", 0.0))
		if herd_m > 0.0:
			for n in get_tree().get_nodes_in_group("creature"):
				if n != self and n is ProtoCreature and (n as ProtoCreature).kind == kind \
						and is_instance_valid(n) and global_position.distance_to((n as Node3D).global_position) < herd_m:
					drift += ((n as Node3D).global_position - global_position) * 0.25
					break
		_wander_target = global_position + drift
	_steer_to(_wander_target, float(row.get("speed", 1.5)), delta)
	if _is_flying():
		state = CState.CIRCLE # airborne kinds don't ground-wander


func _do_flee(delta: float) -> void:
	_flee_t -= delta
	if _flee_t <= 0.0:
		state = CState.CIRCLE if _is_flying() else CState.WANDER
		return
	var away := global_position - _flee_from
	away.y = 0.0
	if away.length_squared() < 0.01:
		away = Vector3(1, 0, 0)
	_steer_to(global_position + away.normalized() * 10.0, float(row.get("flee_speed", 4.0)), delta)


func _do_hunt(delta: float) -> void:
	if _hunt == null or not is_instance_valid(_hunt):
		_hunt = null
		state = CState.WANDER
		return
	var d := global_position.distance_to(_hunt.global_position)
	var attack_m := float(row.get("attack_m", 1.6))
	state = CState.CHASE if d < attack_m * 4.0 else CState.STALK
	var spd := float(row.get("chase_speed", 4.0)) if state == CState.CHASE else float(row.get("speed", 2.0))
	_steer_to(_hunt.global_position, spd, delta)
	if d <= attack_m and _attack_t <= 0.0:
		_attack_t = float(row.get("attack_cd", 1.2))
		if _hunt.has_method("take_damage"):
			_hunt.call("take_damage", float(row.get("attack_dmg", 8.0)))
		if _main != null and "audio" in _main and _main.audio != null:
			_main.audio.play_at("dog_bark", global_position, -4.0)


## The orbit: y rides circle_h, x/z ride the ring around the anchor. Flying
## kinds skip move_and_slide entirely — position is authored, cheap, and reads
## perfectly from the top-down camera.
func _do_circle(delta: float) -> void:
	var r := float(row.get("circle_r", 8.0))
	var h := float(row.get("circle_h", 6.0))
	_circle_a += delta * float(row.get("speed", 3.0)) / maxf(r, 1.0)
	var target := _anchor + Vector3(cos(_circle_a) * r, h + sin(_circle_a * 2.3) * 0.6, sin(_circle_a) * r)
	global_position = global_position.lerp(target, clampf(delta * 2.0, 0.0, 1.0))
	if _quad:
		look_at(global_position + Vector3(-sin(_circle_a), 0, cos(_circle_a)), Vector3.UP)


func _do_flush(delta: float) -> void:
	_flee_t -= delta
	var away := global_position - _flee_from
	away.y = 0.0
	if away.length_squared() < 0.01:
		away = Vector3(1, 0, 0)
	var target := global_position + away.normalized() * 6.0 + Vector3(0, 4.0, 0)
	global_position = global_position.lerp(target, clampf(delta * 3.0, 0.0, 1.0))
	if _flee_t <= 0.0:
		_anchor = global_position + away.normalized() * 12.0
		state = CState.CIRCLE


func _steer_to(target: Vector3, speed: float, _delta: float) -> void:
	var to := target - global_position
	to.y = 0.0
	if to.length_squared() < 0.04:
		velocity.x = 0.0
		velocity.z = 0.0
		return
	var dir := to.normalized()
	velocity.x = dir.x * speed
	velocity.z = dir.z * speed
	# face travel (the quad's -Z is its nose)
	var flat := Vector3(dir.x, 0, dir.z)
	if flat.length_squared() > 0.001:
		look_at(global_position + flat, Vector3.UP)
