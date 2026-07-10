## THE KNIFEBACK (LIVING_WOUND_ECOSYSTEM P1 apex — LWE §3's nest machine, in
## one animal for the Phase-1 slice; the multi-animal den extracts to nest.gd
## in Phase 2). A swamp apex that keys its temper off the CELL'S FLOATS: a fed
## sector keeps it wild and territorial; a starving one widens its ground until
## the road itself is a hunting lane. Six states — FED / HUNGRY / STARVING /
## BREEDING / WOUNDED / EXPANDING — all driven by prey_density + its own hp,
## RNG-free. It announces itself before it ever commits (the warning contract's
## P1 subset: one unmissable tell on first acquisition). Death: rig-corpse
## (0.11), predator_pressure −0.2, the nest goes quiet.
class_name ProtoKnifeback
extends CharacterBody3D

enum Nest { FED, HUNGRY, STARVING, BREEDING, WOUNDED, EXPANDING }

const GRAVITY := 20.0
const NEST_TICK_S := 4.0        ## how often it re-reads the sector
const BREED_AFTER_TICKS := 5    ## this many FED reads in a row → BREEDING
const TERRITORY_BASE_M := 40.0

static var ROW: Dictionary = {} ## filled from ProtoCreature.ROWS["knifeback"]

var nest_state: int = Nest.FED
var nest_pos: Vector3
var territory_m: float = TERRITORY_BASE_M
var nest_strength: float = 0.3
var dead: bool = false
var body: Damageable = null

var _quad: ProtoQuadruped = null
var _main: Node = null
var _hunt: Node3D = null
var _attack_t: float = 0.0
var _nest_t: float = 0.0
var _warn_cd: float = 0.0       ## one tell per nest-tick cadence
var _fed_streak: int = 0
var _rng := RandomNumberGenerator.new()
var _wander_target: Vector3
var _wander_t: float = 0.0


static func create() -> ProtoKnifeback:
	ProtoCreature.ensure_rows()
	ROW = ProtoCreature.ROWS.get("knifeback", {})
	var k := ProtoKnifeback.new()
	k.name = "Knifeback"
	k.add_to_group("creature")
	k.add_to_group("combatant")
	k.add_to_group("threat")
	k.body = Damageable.new("KNIFEBACK", "🦴", float(ROW.get("hp", 260.0)))
	var col: Array = ROW.get("color", [0.24, 0.27, 0.2])
	k._quad = ProtoQuadruped.create({
		"scale": float(ROW.get("rig_scale", 3.0)),
		"tail": float(ROW.get("rig_tail", 0.8)),
		"ears": bool(ROW.get("rig_ears", false)),
		"color": Color(float(col[0]), float(col[1]), float(col[2])),
	})
	k._quad.scale.y = 0.8 # low-slung — a gator-law silhouette, not a hound
	k.add_child(k._quad)
	# THE KNIFE BACK (2026-07-09 acceptance render: it read as a big dog — the
	# name IS the silhouette): a ridge of blade plates down the spine, riding
	# the body box so they rock with the gait.
	var s := float(ROW.get("rig_scale", 3.0))
	var blade_col := Color(float(col[0]) * 0.6, float(col[1]) * 0.7, float(col[2]) * 0.55)
	for i in 4:
		var blade := MeshInstance3D.new()
		var bm := BoxMesh.new()
		var h := (0.34 - 0.06 * absf(i - 1.2)) * s # tallest over the shoulders
		bm.size = Vector3(0.05 * s, h, 0.16 * s)
		blade.mesh = bm
		blade.material_override = ProtoWorldBuilder.material(blade_col, 0.85)
		blade.position = Vector3(0, 0.18 * s + h * 0.5, (-0.3 + 0.2 * i) * s)
		blade.rotation.x = -0.12 # raked back
		k._quad.body.add_child(blade)
	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.85
	cap.height = 3.2
	shape.shape = cap
	shape.rotation.x = PI * 0.5
	shape.position.y = 1.0
	k.add_child(shape)
	k._rng.seed = hash("knifeback") + Time.get_ticks_usec()
	return k


func _ready() -> void:
	# nest_pos is claimed lazily on the first physics frame — the bridge
	# add_child()s BEFORE positioning, and a den at the chunk-add origin
	# would territorialize the wrong ground entirely.
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
		return
	if body.hp < body.max_hp * 0.4 and nest_state != Nest.WOUNDED:
		nest_state = Nest.WOUNDED
		_hunt = null


func _die() -> void:
	dead = true
	set_physics_process(false)
	if _main != null and "population" in _main and _main.population != null:
		var cell: Dictionary = _main.population.cell_at(global_position)
		var eco: Dictionary = cell.get("eco", {})
		if eco.has("predator_pressure"):
			eco["predator_pressure"] = clampf(float(eco["predator_pressure"]) - 0.2, 0.0, 1.0)
		_main.population.on_actor_removed(self)
	var loot := {}
	for item_id in (ROW.get("loot", {}) as Dictionary):
		var span: Array = (ROW["loot"] as Dictionary)[item_id]
		var n := _rng.randi_range(int(span[0]), int(span[1]))
		if n > 0:
			loot[item_id] = n
	var quad := _quad
	_quad = null
	if quad != null:
		remove_child(quad)
	var corpse := ProtoCorpse.create("KNIFEBACK carcass", loot, Color(0.24, 0.27, 0.2), Vector3.ZERO, _main, quad)
	corpse.heat = 1.0
	var parent := get_parent()
	if parent != null:
		parent.add_child(corpse)
		corpse.global_position = global_position + Vector3(0, 0.3, 0)
	if _main != null and _main.has_method("notify"):
		_main.notify("🦴 The swamp goes quiet.")
	queue_free()


## THE NEST MACHINE — reads the sector, never rolls dice. prey_density is the
## whole story: >0.45 fed · 0.2–0.45 hungry · <0.2 starving. FED long enough
## breeds (nest_strength grows); strength past 0.8 EXPANDS the territory.
## WOUNDED overrides everything until hp mends past 70% (slow regen at nest).
func _nest_tick() -> void:
	if _main == null or not ("population" in _main) or _main.population == null:
		return
	var eco: Dictionary = _main.population.cell_at(nest_pos).get("eco", {})
	if eco.is_empty():
		return
	var prey := float(eco.get("prey_density", 0.3))
	if nest_state == Nest.WOUNDED:
		body.restore(body.max_hp * 0.02) # licking wounds at the den
		if body.hp >= body.max_hp * 0.7:
			nest_state = Nest.FED
		return
	if prey > 0.45:
		_fed_streak += 1
		# BREEDING and EXPANDING are transient BEATS, not resting states — each
		# fires on the read that earns it, then the next fed read settles FED.
		if _fed_streak >= BREED_AFTER_TICKS:
			nest_state = Nest.BREEDING
			nest_strength = clampf(nest_strength + 0.05, 0.0, 1.0)
			eco["predator_pressure"] = clampf(float(eco.get("predator_pressure", 0.0)) + 0.02, 0.0, 1.0)
			_fed_streak = 0
		elif nest_strength > 0.8:
			nest_state = Nest.EXPANDING
			territory_m = TERRITORY_BASE_M * 1.75
			nest_strength = 0.6
		else:
			nest_state = Nest.FED
	elif prey >= 0.2:
		_fed_streak = 0
		nest_state = Nest.HUNGRY
	else:
		_fed_streak = 0
		nest_state = Nest.STARVING


## The ground it defends right now: fed = home range, hungry = widened,
## starving = the road becomes meat (LWE's core law, in one multiplier).
func hunt_radius() -> float:
	match nest_state:
		Nest.STARVING:
			return territory_m * 2.0
		Nest.HUNGRY:
			return territory_m * 1.4
		Nest.WOUNDED:
			return 4.0 # cornered-only
		_:
			return territory_m


var _den_claimed: bool = false
func _physics_process(delta: float) -> void:
	if dead:
		return
	if not _den_claimed: # first frame: the spawn position is final NOW
		_den_claimed = true
		nest_pos = global_position
		_wander_target = global_position
	_attack_t = maxf(0.0, _attack_t - delta)
	_warn_cd = maxf(0.0, _warn_cd - delta)
	_nest_t -= delta
	if _nest_t <= 0.0:
		_nest_t = NEST_TICK_S
		_nest_tick()
	if nest_state == Nest.WOUNDED:
		_retreat(delta)
	else:
		_hunt_or_hold(delta)
	velocity.y -= GRAVITY * delta if not is_on_floor() else 0.0
	move_and_slide()
	if _quad:
		var morale := 0.15 if nest_state == Nest.WOUNDED else (0.9 if _hunt != null else 0.5)
		_quad.animate(delta, Vector2(velocity.x, velocity.z).length(), morale)


func _retreat(delta: float) -> void:
	_hunt = null
	if global_position.distance_to(nest_pos) > 2.5:
		_steer_to(nest_pos, float(ROW.get("flee_speed", 3.2)), delta)
	else:
		velocity.x = 0.0
		velocity.z = 0.0


## The nest cell's floats — warn_count and human_noise live here so the LAND
## remembers across this animal's death (kill the beast, the warnings stand).
func _cell_eco() -> Dictionary:
	if _main != null and "population" in _main and _main.population != null:
		return _main.population.cell_at(nest_pos).get("eco", {})
	return {}


## THE WARNING LADDER (LWE 0.6 / audit F1): a human strike is ILLEGAL until
## the land has warned three times — each would-be strike defers into the
## next tell instead. warn_count rides the CELL, so it survives the animal.
func _warn(eco: Dictionary, warns: int) -> void:
	if _warn_cd > 0.0:
		return
	_warn_cd = NEST_TICK_S
	eco["warn_count"] = warns + 1
	if _main != null and "audio" in _main and _main.audio != null:
		_main.audio.play_at("howler_scream", global_position, 2.0)
	if _main == null:
		return
	var text := ""
	match warns:
		0:
			text = "🦴 Something big is moving in the swamp. It knows you're here."
		1:
			text = "🦴 Drag marks on the shoulder — fresh. You are being shadowed."
		_:
			text = "🦴 The swamp has gone SILENT around you. Last warning."
	# THE TELL MUST BE DELIVERED (audit-2 GAP-3): toasts can drop in a burst
	# and the scream carries 90 m vs a ~128 m acquisition reach — the threat
	# STACK line is the guaranteed lane (apex = top priority, its own ttl).
	if "hud" in _main and _main.hud != null:
		_main.hud.set_threat(text, "apex", 5, 6.0)
	if _main.has_method("notify"):
		_main.notify(text)


func _hunt_or_hold(delta: float) -> void:
	var eco: Dictionary = _cell_eco()
	# F4: a noisy road WIDENS the ground it claims — go quiet and it shrinks
	var radius := hunt_radius() * (1.0 + 0.6 * float(eco.get("human_noise", 0.0)))
	# STATE GATES WHO — including a hunt already in progress (audit-2 GAP-2):
	# a mid-chase downgrade (the land recovering past the line) calls it off.
	if _hunt != null and is_instance_valid(_hunt):
		if _hunt.is_in_group("player3d") and nest_state != Nest.STARVING:
			_hunt = null
		elif _hunt != null and _hunt.is_in_group("dog") \
				and not (nest_state == Nest.HUNGRY or nest_state == Nest.STARVING):
			_hunt = null
	# acquire: what counts as FOOD depends on the nest's state (F2 — the human
	# gate: a FED apex never hunts people; dogs enter the menu when HUNGRY;
	# humans only when the land is STARVING and fairly warned)
	if _hunt == null or not is_instance_valid(_hunt) or ("dead" in _hunt and _hunt.dead):
		_hunt = null
		var best_d := radius
		for grp in ["player3d", "dog", "creature"]:
			if grp == "player3d" and nest_state != Nest.STARVING:
				continue
			if grp == "dog" and not (nest_state == Nest.HUNGRY or nest_state == Nest.STARVING):
				continue
			for n in get_tree().get_nodes_in_group(grp):
				if n == self or not (n is Node3D) or not is_instance_valid(n):
					continue
				if "dead" in n and n.dead:
					continue
				if n is ProtoCreature and String((n as ProtoCreature).row.get("group", "")) != "grazer":
					continue
				var d: float = nest_pos.distance_to((n as Node3D).global_position)
				if d < best_d:
					best_d = d
					_hunt = n as Node3D
		# F1: the fair-warning gate — the strike DEFERS into the next tell
		if _hunt != null and _hunt.is_in_group("player3d"):
			var warns := int(eco.get("warn_count", 0))
			if warns < 3:
				_hunt = null
				_warn(eco, warns)
	if _hunt == null:
		# hold the ground: slow patrol around the nest
		_wander_t -= delta
		if _wander_t <= 0.0 or global_position.distance_to(_wander_target) < 1.5:
			_wander_t = _rng.randf_range(4.0, 8.0)
			_wander_target = nest_pos + Vector3(_rng.randf_range(-0.5, 0.5) * territory_m, 0, _rng.randf_range(-0.5, 0.5) * territory_m)
		_steer_to(_wander_target, float(ROW.get("speed", 1.8)), delta)
		return
	# prey drops off its claimed ground → let it go (a territorial animal, not a chaser…
	# unless the land is STARVING — then it follows the meat)
	if nest_state != Nest.STARVING and nest_pos.distance_to(_hunt.global_position) > radius * 1.3:
		_hunt = null
		return
	var d := global_position.distance_to(_hunt.global_position)
	_steer_to(_hunt.global_position, float(ROW.get("chase_speed", 5.4)), delta)
	var attack_m := float(ROW.get("attack_m", 2.6))
	if d <= attack_m and _attack_t <= 0.0:
		_attack_t = float(ROW.get("attack_cd", 1.6))
		if _hunt.has_method("take_damage"):
			_hunt.call("take_damage", float(ROW.get("attack_dmg", 34.0)))
		# the hit SHOVES — a knifeback strike moves you
		if "velocity" in _hunt:
			var shove := (_hunt.global_position - global_position).normalized() * 7.0
			_hunt.velocity += Vector3(shove.x, 3.0, shove.z)


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
	var flat := Vector3(dir.x, 0, dir.z)
	if flat.length_squared() > 0.001:
		look_at(global_position + flat, Vector3.UP)
