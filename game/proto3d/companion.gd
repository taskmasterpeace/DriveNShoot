## STAGE 7 — the COMPANION system: dogs AND people, one law. Sam the Drifter
## hires on at Meridian and does the three companion jobs: FOLLOWS (dog-style),
## FIGHTS (his own iron, fired at whatever threatens you), and SCOUTS — what HE
## sees that YOU can't pings your perception (reveal bubble). He rides shotgun
## like the pack does. WORLD_NPCS.md §3: "Drifter — factionless, hirable."
class_name ProtoCompanion
extends CharacterBody3D

const FOLLOW_DIST := 3.6
const RUN_SPEED := 6.5
const FIGHT_RANGE := 18.0
const FIRE_CD := 1.15
const GUN_DAMAGE := 12.0
const SCOUT_CD := 4.0

## THE CREW as DATA ROWS (goal: a crew you can hire, work, and LOSE). Jobs map
## to APIs that already exist: gunner = the fight law below, mechanic = timed
## component restore on a nearby rig, medic = timed character.treat() when he's
## walking beside you. Adding a crew member = adding a row.
const CREW: Dictionary = {
	"sam": {"name": "Sam", "title": "GUNNER", "look": "drifter", "job": "gunner",
		"hire_cost": 40, "gear": {"9mm": 20, "scrip": 5}},
	"hazel": {"name": "Hazel", "title": "MECHANIC", "look": "scav", "job": "mechanic",
		"hire_cost": 60, "gear": {"car_parts": 1, "duct_tape": 2, "scrip": 8}},
	"mercer": {"name": "Doc Mercer", "title": "MEDIC", "look": "old_timer", "job": "medic",
		"hire_cost": 60, "gear": {"bandage": 3, "medkit": 1}},
}
const JOB_HOURS := 0.5 ## a job tick every half a game-hour (T-wait/dev clock honor it)

var hit_launch: Vector3 = Vector3.ZERO ## a car sets this before a fatal hit → the corpse is FLUNG
var crew_id: String = "sam"
var comp_name: String = "Sam"
var job: String = "gunner"
var staying: bool = false
var riding_in: ProtoCar3D = null
var hp: float = 70.0
var max_hp: float = 70.0
var dead: bool = false

var _main: Node = null
var _fire_cd: float = 0.0
var _scout_cd: float = 0.0
var _visual: Node3D
var _gun_mesh: Node3D ## the puppet's held-weapon container (Node3D since weapons-as-data)
var puppet: ProtoPuppet = null
var _dead_t: float = 0.0
var _last_job_hour: float = -1.0


static func create(main: Node, crew_id_in: String = "sam") -> ProtoCompanion:
	var c := ProtoCompanion.new()
	var row: Dictionary = CREW.get(crew_id_in, CREW["sam"])
	c.crew_id = crew_id_in
	c.comp_name = row["name"]
	c.job = row["job"]
	c._main = main
	c.add_to_group("interactable")
	c.add_to_group("npc") # sight rays pass him; FADE treats him as a person
	c.add_to_group("combatant") # crew live under the one damage law (friendly fire is real)
	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.33
	cap.height = 1.7
	shape.shape = cap
	shape.position.y = 0.85
	c.add_child(shape)
	# THE PUPPET (no more capsule-person): the same rig as everyone — flinch,
	# recoil, and the death flop come free from the rig work.
	c.puppet = ProtoPuppet.create(ProtoPuppet.look(row["look"]))
	c._visual = c.puppet
	c.add_child(c._visual)
	c.puppet.set_armed(c.job == "gunner") # only the gunner walks iron-out
	c._gun_mesh = c.puppet.gun
	var tag := Label3D.new()
	tag.text = "%s\n%s" % [String(row["name"]).to_upper(), row["title"]]
	tag.font_size = 84
	tag.pixel_size = 0.0042
	tag.modulate = Color(0.7, 0.85, 0.7)
	tag.position = Vector3(0, 2.3, 0)
	tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	c.add_child(tag)
	return c


func interact_position() -> Vector3:
	return global_position


func interact_prompt(_m: Node) -> String:
	return "E — %s: Follow" % comp_name if staying else "E — %s: Hold here" % comp_name


func interact(m: Node) -> void:
	staying = not staying
	m.notify("%s %s" % [comp_name, "holds this spot" if staying else "falls in behind you"])


## Save row: which crew member, how hurt, where standing. Rebuilt via create().
func to_record() -> Dictionary:
	return {"crew_id": crew_id, "hp": hp,
		"pos": [global_position.x, global_position.y, global_position.z]}


## MORTAL now (goal: a crew you can LOSE is the point). The rig flops, the gear
## drops as a corpse chest, and the road gets heavier.
func take_damage(amount: float) -> void:
	if dead:
		return
	hp -= amount
	if puppet:
		puppet.flinch(-global_basis.z)
	ProtoFloater.pop(get_parent(), global_position + Vector3(0, 1.9, 0), "-%d" % int(amount), Color(0.9, 0.6, 0.4), 100)
	if hp <= 0.0:
		dead = true
		_dead_t = 1.6 # the flop plays before the world moves on
		if _main != null:
			_main.stress = minf(100.0, _main.stress + 20.0)
			if "fallen_dogs" in _main:
				_main.fallen_dogs.append({"name": comp_name, "breed": CREW[crew_id]["title"], "bond": "CREW"})
			_main.notify("☠️ %s IS DEAD. You hired them. The road collected." % comp_name.to_upper())


func _die_to_chest() -> void:
	var gear: Dictionary = (CREW[crew_id].get("gear", {}) as Dictionary).duplicate()
	var corpse := ProtoCorpse.create("%s's body" % comp_name, gear, Color(0.55, 0.48, 0.4), hit_launch, _main)
	get_parent().add_child(corpse)
	corpse.global_position = global_position
	if _main != null and "companions" in _main:
		_main.companions.erase(self)
	queue_free()


# --- Riding shotgun (same law as the pack) -------------------------------------

## SEAT ANCHORS: the gunner rides a bed anchor VISIBLE and KEEPS FIRING — Sam in
## the truck bed, iron up, is the Mad Max poster. Cab seats hide.
func board(car: ProtoCar3D, anchor: Vector3 = Vector3.INF, seat_type: String = "cab") -> void:
	riding_in = car
	for c in get_children():
		if c is CollisionShape3D:
			(c as CollisionShape3D).disabled = true
	if anchor != Vector3.INF:
		reparent(car)
		position = anchor
		rotation = Vector3.ZERO
		visible = seat_type == "bed"
	else:
		visible = false
		process_mode = Node.PROCESS_MODE_DISABLED


func unboard(pos: Vector3) -> void:
	riding_in = null
	if get_parent() != null and get_parent() is ProtoCar3D:
		reparent(_main)
	for c in get_children():
		if c is CollisionShape3D:
			(c as CollisionShape3D).disabled = false
	process_mode = Node.PROCESS_MODE_INHERIT
	visible = true
	global_position = pos
	velocity = Vector3.ZERO


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity += get_gravity() * delta
	# DEAD: the rig flops (the same read as everyone), then the gear hits the dirt.
	if dead:
		if puppet:
			puppet.animate(delta, 0.0, 0.0, false, 1.0, true)
		velocity.x = 0.0
		velocity.z = 0.0
		move_and_slide()
		_dead_t -= delta
		if _dead_t <= 0.0:
			_die_to_chest()
		return
	_fire_cd = maxf(0.0, _fire_cd - delta)
	_scout_cd = maxf(0.0, _scout_cd - delta)

	var player: Node3D = _main.player if _main and "player" in _main else null
	if player == null or not is_instance_valid(player):
		move_and_slide()
		return

	# RIDING A BED ANCHOR: parented to the rig, no legs — but the iron stays LIVE.
	# Sam fires from the truck bed as it drives (his whole fight brain, from a seat).
	if riding_in != null and is_instance_valid(riding_in):
		if visible and puppet:
			puppet.animate(delta, 0.0, 0.0, job == "gunner", 1.0 - hp / max_hp, false)
		var bed_target := _nearest_threat() if job == "gunner" else null
		if bed_target != null and _fire_cd <= 0.0:
			_fire_cd = FIRE_CD
			_face(bed_target.global_position - global_position, delta)
			_fire_at(bed_target)
		return

	# THE JOB ENGINE: every half game-hour standing with you, the hire EARNS it
	# (T-wait and the dev clock honor game time, so camp days do real work).
	if "daynight" in _main and _main.daynight != null:
		var hr: float = _main.daynight.hour + float(_main.daynight.day) * 24.0
		if _last_job_hour < 0.0:
			_last_job_hour = hr
		elif hr - _last_job_hour >= JOB_HOURS:
			_last_job_hour = hr
			_do_job()

	# FOLLOW (dog law: keep the distance, run to close it)
	if not staying:
		var to_p := player.global_position - global_position
		to_p.y = 0.0
		if to_p.length() > FOLLOW_DIST:
			var dir := to_p.normalized()
			velocity.x = move_toward(velocity.x, dir.x * RUN_SPEED, 10.0 * delta)
			velocity.z = move_toward(velocity.z, dir.z * RUN_SPEED, 10.0 * delta)
			_face(dir, delta)
		else:
			velocity.x = move_toward(velocity.x, 0.0, 12.0 * delta)
			velocity.z = move_toward(velocity.z, 0.0, 12.0 * delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, 12.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 12.0 * delta)

	# The rig lives: stride, breathe, slump as hp falls.
	if puppet:
		puppet.animate(delta, Vector2(velocity.x, velocity.z).length(), 0.0,
			job == "gunner", 1.0 - hp / max_hp, false)

	# FIGHT: the GUNNER's iron answers the nearest threat (a medic keeps walking).
	var target := _nearest_threat() if job == "gunner" else null
	if target != null:
		var tdir := target.global_position - global_position
		tdir.y = 0.0
		_face(tdir.normalized(), delta)
		if _fire_cd <= 0.0:
			_fire_cd = FIRE_CD
			_fire_at(target)
		# SCOUT: what HE sees that YOU can't becomes YOUR perception ping.
		if _scout_cd <= 0.0 and _main and "vision_cone" in _main:
			var seen_by_you: bool = _player_can_see(player, target)
			if not seen_by_you:
				_scout_cd = SCOUT_CD
				_main.vision_cone.reveal_at(target.global_position)
				_main.notify("🧭 %s: 'Contact! On me!'" % comp_name)
				if crew_id == "sam" and "audio" in _main and _main.audio:
					_main.audio.play_at("vo_sam_contact", global_position, 3.0)

	move_and_slide()


func _face(dir: Vector3, delta: float) -> void:
	if dir.length_squared() > 0.01 and _visual:
		_visual.rotation.y = lerp_angle(_visual.rotation.y, atan2(-dir.x, -dir.z), 10.0 * delta)


func _nearest_threat() -> Node3D:
	var best: Node3D = null
	var bd := FIGHT_RANGE
	for node in get_tree().get_nodes_in_group("threat"):
		var t := node as Node3D
		if t == null or not is_instance_valid(t):
			continue
		if t is StaticBody3D:
			continue # sim dummies aren't his problem
		var d := t.global_position.distance_to(global_position)
		if d < bd:
			bd = d
			best = t
	return best


func _fire_at(target: Node3D) -> void:
	var muzzle := _gun_mesh.global_position if _gun_mesh else global_position + Vector3(0, 1.1, 0)
	var aim := target.global_position + Vector3(0, 0.8, 0) - muzzle
	var space := get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(muzzle, muzzle + aim.normalized() * FIGHT_RANGE)
	q.exclude = [get_rid()] + ([(_main.player as PhysicsBody3D).get_rid()] if _main and _main.player else [])
	var hit: Dictionary = space.intersect_ray(q)
	ProtoFX.muzzle_flash(_main if _main else get_parent(), muzzle, aim.normalized())
	if puppet:
		puppet.recoil()
		puppet.gun_recoil() # the shot lands on the rig, same as the player's
	if _main and "audio" in _main and _main.audio:
		_main.audio.play_at("shot", global_position, -6.0, 1.1)
	if not hit.is_empty():
		var col = hit["collider"]
		if col != null and col.has_method("take_damage"):
			ProtoFX.blood(_main if _main else get_parent(), hit["position"])
			col.take_damage(GUN_DAMAGE)
		else:
			ProtoFX.impact(_main if _main else get_parent(), hit["position"])


## THE JOBS — each is one existing call on a timer. The hire earns its keep.
func _do_job() -> void:
	match job:
		"mechanic":
			# Works the WORST component of the nearest rig in reach — parked at
			# camp overnight, you wake to a healthier fleet.
			var best: ProtoCar3D = null
			var bd := 14.0
			for car in _main.cars:
				if car is ProtoCar3D and is_instance_valid(car) and not car.dead:
					var dd: float = car.global_position.distance_to(global_position)
					if dd < bd:
						bd = dd
						best = car
			if best != null:
				var worst: Damageable = null
				for k in best.components:
					if worst == null or best.components[k].ratio() < worst.ratio():
						worst = best.components[k]
				if worst != null and worst.ratio() < 1.0:
					worst.restore(9.0)
					_main.notify("🔧 %s works the %s's %s (%d%%)" % [comp_name, best.display_name, worst.id, int(worst.ratio() * 100)])
		"medic":
			# Field medicine on the move: your worst part, patched as you walk.
			var pl: Node3D = _main.player
			if pl != null and pl.global_position.distance_to(global_position) < 10.0:
				var ch: ProtoCharacter = _main.character
				var wp: String = ch.worst_part()
				if ch.body[wp].ratio() < 1.0:
					ch.treat(wp, 6.0)
					_main.notify("🩹 %s patches your %s as you walk (%d%%)" % [comp_name, wp.replace("_", " "), int(ch.body[wp].ratio() * 100)])
		_:
			pass # the gunner's job IS the fight law below


## Can the PLAYER's cone see this threat right now? (angle + range + LOS)
func _player_can_see(player: Node3D, t: Node3D) -> bool:
	if _main == null or not "vision_cone" in _main:
		return true
	var to := t.global_position - player.global_position
	to.y = 0.0
	var d := to.length()
	if d < _main.vision_cone.last_clear_m:
		return true
	if d > _main.vision_cone.last_range_m:
		return false
	var facing: Vector3 = player.call("sight_facing") if player.has_method("sight_facing") else Vector3.FORWARD
	if facing.dot(to.normalized()) < cos(_main.vision_cone.current_half_angle()):
		return false
	return not _main.sight_blocked(player.global_position + Vector3(0, 1.5, 0), t.global_position + Vector3(0, 0.9, 0))
