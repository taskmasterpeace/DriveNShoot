## PROTO-3D dog: four types (Security/Hunter/Companion/Cuddle), each mechanically
## distinct. The law of dogs: a dog always knows what's behind you.
## Design: docs/systems/DOGS.md
class_name ProtoDog
extends CharacterBody3D

enum DogType { SECURITY, HUNTER, COMPANION, CUDDLE }
enum DogState { STRAY, FOLLOW, STAY, ALERT, GUARD, SIC, SEEK }

## Per-type tuning: [follow_dist, run_speed, threat_radius, rear_bonus, nose_radius, calm_aura, size, color]
const TYPE_PARAMS: Dictionary = {
	DogType.SECURITY: {
		"follow_dist": 3.2, "speed": 8.0, "threat_radius": 26.0, "rear_mult": 1.5,
		"nose_radius": 0.0, "calm_aura": 0.0, "scale": 1.15, "color": Color(0.32, 0.26, 0.18),
		"obey_delay": 0.5, "bark": "GROWLS", "bite": 16.0, "bite_kd": 0.45,
	},
	DogType.HUNTER: {
		"follow_dist": 4.5, "speed": 8.5, "threat_radius": 14.0, "rear_mult": 1.2,
		"nose_radius": 24.0, "calm_aura": 0.0, "scale": 1.0, "color": Color(0.55, 0.42, 0.25),
		"obey_delay": 0.6, "bark": "points", "bite": 9.0, "bite_kd": 0.2,
	},
	DogType.COMPANION: {
		"follow_dist": 2.6, "speed": 8.0, "threat_radius": 16.0, "rear_mult": 1.2,
		"nose_radius": 10.0, "calm_aura": 2.0, "scale": 1.0, "color": Color(0.72, 0.6, 0.4),
		"obey_delay": 0.0, "bark": "barks", "bite": 12.0, "bite_kd": 0.25,
	},
	DogType.CUDDLE: {
		"follow_dist": 1.8, "speed": 7.0, "threat_radius": 8.0, "rear_mult": 1.1,
		"nose_radius": 0.0, "calm_aura": 9.0, "scale": 0.62, "color": Color(0.82, 0.74, 0.62),
		"obey_delay": 0.8, "bark": "grumbles", "bite": 0.0, "bite_kd": 0.0,
	},
}

const TYPE_NAMES: Dictionary = {
	DogType.SECURITY: "Security", DogType.HUNTER: "Hunter",
	DogType.COMPANION: "Companion", DogType.CUDDLE: "Cuddle",
}

## Breed variance UNDER each type (DOGS.md §3) — multipliers over the type's params.
## Adding a breed = adding a row.
const BREED_MODS: Dictionary = {
	"Shepherd": {}, # the baseline guard
	"Rottweiler": {"threat_radius": 0.8, "speed": 1.05}, # shorter nose, faster teeth (bite later)
	"Mastiff": {"threat_radius": 1.15, "speed": 0.82}, # slow wall of intimidation
	"Bloodhound": {"nose_radius": 1.4}, # THE nose
	"Pointer": {"nose_radius": 1.0, "speed": 1.1}, # precise + quick
	"Coyote-cross": {"nose_radius": 1.15, "threat_radius": 1.1}, # wild senses
	"Lab": {"speed": 1.05},
	"Border Collie": {"obey_delay": 0.0}, # the smartest — instant commands
	"Mutt": {}, # lucky later
	"Pocket": {"calm_aura": 1.25, "speed": 1.1}, # fastest calm
	"Wheezer": {"calm_aura": 1.1, "speed": 0.8}, # snores; sleep bonus later
	"Ratter": {"threat_radius": 1.2}, # jumpy — notices everything
}

var dog_type: DogType = DogType.COMPANION
var dog_name: String = "Rex"
var breed: String = "Shepherd"
var adopted: bool = false
var state: DogState = DogState.STRAY
var guard_pos: Vector3 = Vector3.ZERO
var sic_target: Node3D = null
var seek_target: Node3D = null
var hp: float = 50.0
var max_hp: float = 50.0
var riding_in: ProtoCar3D = null ## the vehicle this dog is riding shotgun in

var _owner_ref: Node3D = null
var _main: Node = null ## the proto3d main scene (set at adoption) — sim-safe, no current_scene reliance
var _visual: Node3D
var _quad: ProtoQuadruped = null
var _follow_angle: float = 0.0 ## personal heel offset so dogs don't stack
var _alert_t: float = 0.0
var _alert_face: Vector3 = Vector3.ZERO
var _scan_t: float = 0.0
var _threat_cooldown: float = 0.0
var _pinged_stashes: Array = []
var _obey_queue: Array = [] ## [ [time_left, state] ] — obedience delay per type
var _wag_t: float = 0.0
var _stuck_t: float = 0.0
var _bite_cd: float = 0.0


var _params: Dictionary = {}

static func create(type: DogType, name_in: String, breed_in: String) -> ProtoDog:
	var d := ProtoDog.new()
	d.dog_type = type
	d.dog_name = name_in
	d.breed = breed_in
	d.add_to_group("interactable")
	d.add_to_group("proto_dog")
	# Type params + breed multipliers = this dog's actual senses.
	d._params = TYPE_PARAMS[type].duplicate()
	for key in BREED_MODS.get(breed_in, {}):
		d._params[key] = d._params[key] * BREED_MODS[breed_in][key] if d._params[key] is float else BREED_MODS[breed_in][key]
	var p: Dictionary = d._params
	var s: float = p["scale"]
	var body_color: Color = p["color"]

	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.28 * s
	cap.height = 0.7 * s
	shape.shape = cap
	shape.position.y = 0.4 * s
	d.add_child(shape)

	# THE FOUR-LEGGED PUPPET (quadruped.gd): box parts driven by sin() off speed,
	# and the tail wags/tucks off MORALE. The rig IS the visual root — yawing it
	# (as the AI already does) turns the whole dog.
	d._quad = ProtoQuadruped.create({"scale": s, "color": body_color})
	d._visual = d._quad
	d.add_child(d._visual)

	d._follow_angle = randf() * TAU
	return d


## Morale 0..1 (the tail's readout): high near your owner and calm, low when hurt
## or a threat is close. Cuddle dogs are sunnier; a spooked dog just got scared.
func morale() -> float:
	var m := 0.55
	if _near_owner(4.0):
		m += 0.25
	m += (hp / max_hp - 0.5) * 0.5     # hurt lowers it
	if _alert_t > 0.0:
		m -= 0.25                        # recently spooked
	var nearest := 999.0
	for n in get_tree().get_nodes_in_group("threat"):
		if n is Node3D and is_instance_valid(n):
			nearest = minf(nearest, global_position.distance_to((n as Node3D).global_position))
	if nearest < 12.0:
		m -= (1.0 - nearest / 12.0) * 0.6 # a close threat = fear
	if dog_type == DogType.CUDDLE:
		m += 0.15
	return clampf(m, 0.0, 1.0)


func params() -> Dictionary:
	return _params if not _params.is_empty() else TYPE_PARAMS[dog_type]


func type_name() -> String:
	return TYPE_NAMES[dog_type]


# --- Interactable contract -------------------------------------------------

func interact_position() -> Vector3:
	return global_position


func interact_prompt(main: Node) -> String:
	if not adopted:
		return "E — Adopt %s (%s · %s)" % [dog_name, type_name(), breed]
	if hp < max_hp - 5.0 and main.backpack.count("meat") > 0:
		return "E — Feed %s (🍖 %d hp)" % [dog_name, int(minf(30.0, max_hp - hp))]
	if state == DogState.STAY:
		return "E — %s: Follow" % dog_name
	return "E — %s: Stay" % dog_name


func interact(main: Node) -> void:
	if not adopted:
		adopted = true
		_main = main
		_owner_ref = main.player
		_queue_state(DogState.FOLLOW)
		main.register_dog(self)
		main.notify("%s the %s %s joins you" % [dog_name, breed, type_name()])
		return
	# A hurt dog eats first — meat heals the pack (improve-the-dogs pass).
	if hp < max_hp - 5.0 and main.backpack.remove("meat", 1):
		hp = minf(max_hp, hp + 30.0)
		main.notify("🍖 %s wolfs it down (%d/%d hp)" % [dog_name, int(hp), int(max_hp)])
		if "audio" in main and main.audio:
			main.audio.play_at("bark", global_position, -10.0, 1.2)
		return
	# Toggle stay/follow (obedience delay is part of each type's identity)
	_queue_state(DogState.FOLLOW if state == DogState.STAY else DogState.STAY)


# --- Riding shotgun (the pack goes WITH you) ----------------------------------

func board(car: ProtoCar3D) -> void:
	riding_in = car
	state = DogState.FOLLOW
	visible = false
	process_mode = Node.PROCESS_MODE_DISABLED


func unboard(pos: Vector3) -> void:
	riding_in = null
	process_mode = Node.PROCESS_MODE_INHERIT
	visible = true
	global_position = pos
	velocity = Vector3.ZERO
	command_heel()


## Whistle: every adopted dog returns to heel.
func whistle() -> void:
	if adopted:
		_queue_state(DogState.FOLLOW)


# --- Command verbs (whistle patterns + the metasystem) ---------------------

func command_heel() -> void:
	if adopted:
		_queue_state(DogState.FOLLOW)


func command_guard(pos: Vector3) -> void:
	if adopted:
		guard_pos = pos
		_queue_state(DogState.GUARD)


func command_sic(target: Node3D) -> void:
	if adopted and target != null:
		sic_target = target
		_queue_state(DogState.SIC)


func command_seek(target: Node3D) -> void:
	if adopted and target != null:
		seek_target = target
		_queue_state(DogState.SEEK)


func take_damage(amount: float) -> void:
	hp = maxf(0.0, hp - amount)
	if _quad:
		_quad.flinch() # the hit reads on the body
	ProtoFloater.pop(get_parent(), global_position + Vector3(0, 1.4, 0), "-%d" % int(amount), Color(0.9, 0.5, 0.4), 90)
	if hp <= 0.0:
		if _main and _main.has_method("notify"):
			_main.notify("%s went down." % dog_name)
		queue_free()


## Metasystem: collapse to a data record, and rebuild from one.
func to_record() -> Dictionary:
	return {"type": dog_type, "name": dog_name, "breed": breed,
		"pos": global_position, "guard_pos": guard_pos, "hp": hp,
		"wounded": false, "killed": false}


static func from_record(rec: Dictionary, main_in: Node) -> ProtoDog:
	var d := ProtoDog.create(rec["type"], rec["name"], rec["breed"])
	d.adopted = true
	d._main = main_in
	d._owner_ref = main_in.player
	d.guard_pos = rec["guard_pos"]
	d.hp = rec.get("hp", 50.0)
	d.state = DogState.GUARD
	return d


func _queue_state(s: DogState) -> void:
	var delay: float = params()["obey_delay"]
	if delay <= 0.0:
		state = s # Companion: instant obedience — its signature
	else:
		_obey_queue.append([delay, s])


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity += get_gravity() * delta

	# Obedience delay queue
	var qi := 0
	while qi < _obey_queue.size():
		_obey_queue[qi][0] -= delta
		if _obey_queue[qi][0] <= 0.0:
			state = _obey_queue[qi][1]
			_obey_queue.remove_at(qi)
		else:
			qi += 1

	_threat_cooldown = maxf(0.0, _threat_cooldown - delta)
	_bite_cd = maxf(0.0, _bite_cd - delta)
	match state:
		DogState.STRAY:
			velocity.x = move_toward(velocity.x, 0.0, 10.0 * delta)
			velocity.z = move_toward(velocity.z, 0.0, 10.0 * delta)
		DogState.STAY:
			velocity.x = move_toward(velocity.x, 0.0, 14.0 * delta)
			velocity.z = move_toward(velocity.z, 0.0, 14.0 * delta)
			_sense(delta)
		DogState.FOLLOW:
			_do_follow(delta)
			_sense(delta)
		DogState.ALERT:
			velocity.x = move_toward(velocity.x, 0.0, 16.0 * delta)
			velocity.z = move_toward(velocity.z, 0.0, 16.0 * delta)
			if _alert_face.length_squared() > 0.01:
				var yaw := atan2(-_alert_face.x, -_alert_face.z)
				_visual.rotation.y = lerp_angle(_visual.rotation.y, yaw, 14.0 * delta)
			_alert_t -= delta
			if _alert_t <= 0.0:
				state = DogState.FOLLOW if adopted else DogState.STRAY
			_sense(delta)
		DogState.GUARD:
			_do_guard(delta)
		DogState.SIC:
			if not _chase_and_bite(sic_target, delta):
				sic_target = null
				state = DogState.FOLLOW if adopted else DogState.STRAY
		DogState.SEEK:
			_do_seek(delta)

	# The rig reads STATE: legs run off speed, the tail wags/tucks off MORALE.
	if _quad:
		_quad.animate(delta, velocity.length(), morale())

	move_and_slide()


func _near_owner(dist: float) -> bool:
	return _owner_ref != null and is_instance_valid(_owner_ref) \
		and global_position.distance_to(_owner_ref.global_position) < dist


func _do_follow(delta: float) -> void:
	if _owner_ref == null or not is_instance_valid(_owner_ref):
		return
	var p: Dictionary = params()
	var heel: Vector3 = _owner_ref.global_position \
		+ Vector3(cos(_follow_angle), 0, sin(_follow_angle)) * p["follow_dist"]
	var to_heel := heel - global_position
	to_heel.y = 0.0
	var dist := to_heel.length()
	# Catch-up sprint when left far behind; trot at heel.
	var speed: float = p["speed"] * (1.35 if dist > 12.0 else (1.0 if dist > 6.0 else 0.55))
	if dist > 0.6:
		var dir := to_heel.normalized()
		# Unstuck: pinned against a post/wall while trying to move → sidestep and
		# re-pick the heel angle (dogs flow around obstacles instead of pushing).
		if velocity.length() < 0.6 and dist > 2.0:
			_stuck_t += delta
			if _stuck_t > 0.35:
				_stuck_t = 0.0
				_follow_angle = randf() * TAU
				var side := Vector3(-dir.z, 0, dir.x) * (1.0 if randf() > 0.5 else -1.0)
				velocity += side * p["speed"] * 0.8
		else:
			_stuck_t = 0.0
		velocity.x = move_toward(velocity.x, dir.x * speed, 22.0 * delta)
		velocity.z = move_toward(velocity.z, dir.z * speed, 22.0 * delta)
		var yaw := atan2(-dir.x, -dir.z)
		_visual.rotation.y = lerp_angle(_visual.rotation.y, yaw, 10.0 * delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, 18.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 18.0 * delta)


func _do_guard(delta: float) -> void:
	var p: Dictionary = params()
	var spd: float = p["speed"]
	var threat := _nearest_threat_near(guard_pos, p["threat_radius"])
	if threat:
		_chase_and_bite(threat, delta)
		return
	var to_post := guard_pos - global_position
	to_post.y = 0.0
	if to_post.length() > 1.5:
		var dir := to_post.normalized()
		velocity.x = move_toward(velocity.x, dir.x * spd, 20.0 * delta)
		velocity.z = move_toward(velocity.z, dir.z * spd, 20.0 * delta)
		_visual.rotation.y = lerp_angle(_visual.rotation.y, atan2(-dir.x, -dir.z), 10.0 * delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, 16.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 16.0 * delta)


func _do_seek(delta: float) -> void:
	if seek_target == null or not is_instance_valid(seek_target) \
			or (seek_target is ProtoStash and (seek_target as ProtoStash).taken):
		state = DogState.FOLLOW if adopted else DogState.STRAY
		return
	var p: Dictionary = params()
	var spd: float = p["speed"]
	var to_s := seek_target.global_position - global_position
	to_s.y = 0.0
	if to_s.length() > 1.8:
		var dir := to_s.normalized()
		velocity.x = move_toward(velocity.x, dir.x * spd, 20.0 * delta)
		velocity.z = move_toward(velocity.z, dir.z * spd, 20.0 * delta)
		_visual.rotation.y = lerp_angle(_visual.rotation.y, atan2(-dir.x, -dir.z), 10.0 * delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, 16.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 16.0 * delta)


## Chase a target and bite when in reach. Returns false if the target is gone.
func _chase_and_bite(target: Node3D, delta: float) -> bool:
	if target == null or not is_instance_valid(target) or target.get("dead") == true:
		return false
	var p: Dictionary = params()
	var spd: float = p["speed"]
	var to_t := target.global_position - global_position
	to_t.y = 0.0
	if to_t.length() > 1.5:
		var dir := to_t.normalized()
		velocity.x = move_toward(velocity.x, dir.x * spd, 22.0 * delta)
		velocity.z = move_toward(velocity.z, dir.z * spd, 22.0 * delta)
		_visual.rotation.y = lerp_angle(_visual.rotation.y, atan2(-dir.x, -dir.z), 12.0 * delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, 18.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 18.0 * delta)
		_bite(target)
	return true


func _bite(target: Node3D) -> void:
	if _bite_cd > 0.0:
		return
	var p: Dictionary = params()
	var dmg: float = p.get("bite", 0.0)
	if dmg <= 0.0:
		return
	_bite_cd = 0.8
	if target.has_method("take_damage"):
		target.take_damage(dmg)
	if target.has_method("knock_down") and randf() < float(p.get("bite_kd", 0.0)):
		target.knock_down()


func _nearest_threat_near(pos: Vector3, radius: float) -> Node3D:
	var best: Node3D = null
	var bd: float = radius
	for node in get_tree().get_nodes_in_group("threat"):
		var t := node as Node3D
		if t and is_instance_valid(t):
			var dd := t.global_position.distance_to(pos)
			if dd < bd:
				bd = dd
				best = t
	return best


## The law of dogs: scan for threats (rear arc counts extra) and stashes (Hunter).
func _sense(delta: float) -> void:
	_scan_t -= delta
	if _scan_t > 0.0 or _owner_ref == null or not is_instance_valid(_owner_ref):
		return
	_scan_t = 0.35
	var p: Dictionary = params()
	var main := _main
	if main == null:
		return

	# Threats — a dog ALWAYS knows what's behind you. "Behind" means behind your
	# GAZE (the Look Arc's blind spot), which is exactly what the dog covers.
	if _threat_cooldown <= 0.0:
		var facing: Vector3 = _owner_ref.call("sight_facing") if _owner_ref.has_method("sight_facing") \
			else (_owner_ref.call("facing") if _owner_ref.has_method("facing") else Vector3.FORWARD)
		for node in get_tree().get_nodes_in_group("threat"):
			var t := node as Node3D
			if t == null or not is_instance_valid(t):
				continue
			var to_t: Vector3 = t.global_position - _owner_ref.global_position
			to_t.y = 0.0
			var d := to_t.length()
			var behind: bool = facing.dot(to_t.normalized()) < -0.25 if d > 0.5 else false
			var radius: float = p["threat_radius"] * (p["rear_mult"] if behind else 1.0)
			if d <= radius:
				_alert_face = to_t.normalized()
				state = DogState.ALERT
				_alert_t = 1.6
				_threat_cooldown = 5.0
				_mark_threat(t)
				if main.has_method("on_dog_alert"):
					main.on_dog_alert(self, t, behind)
				break

	_sense_nose()


## The dog's senses become YOUR senses: a mark floats over what it smelled.
func _mark_threat(t: Node3D) -> void:
	var mark := Label3D.new()
	mark.text = "❗"
	mark.font = ProtoHUD.emoji_font()
	mark.font_size = 220
	mark.pixel_size = 0.006
	mark.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	mark.modulate = Color(0.95, 0.3, 0.15)
	mark.position = Vector3(0, 2.4, 0)
	t.add_child(mark)
	var tw := mark.create_tween()
	tw.tween_interval(2.2)
	tw.tween_property(mark, "modulate:a", 0.0, 0.6)
	tw.tween_callback(mark.queue_free)


func _sense_nose() -> void:
	# Hunter's nose: point out stashes that haven't been looted.
	var p: Dictionary = params()
	var main := _main
	if main == null:
		return
	if p["nose_radius"] > 0.0:
		for node in get_tree().get_nodes_in_group("interactable"):
			if node is ProtoStash:
				var stash := node as ProtoStash
				if stash.taken or _pinged_stashes.has(stash):
					continue
				var d2 := global_position.distance_to(stash.global_position)
				if d2 <= p["nose_radius"]:
					_pinged_stashes.append(stash)
					_alert_face = (stash.global_position - global_position).normalized()
					state = DogState.ALERT
					_alert_t = 1.6
					if main.has_method("on_dog_nose"):
						main.on_dog_nose(self, stash)
					break
