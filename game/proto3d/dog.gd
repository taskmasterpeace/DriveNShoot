## PROTO-3D dog: four types (Security/Hunter/Companion/Cuddle), each mechanically
## distinct. The law of dogs: a dog always knows what's behind you.
## Design: docs/systems/DOGS.md
class_name ProtoDog
extends CharacterBody3D

enum DogType { SECURITY, HUNTER, COMPANION, CUDDLE }
enum DogState { STRAY, FOLLOW, STAY, ALERT }

## Per-type tuning: [follow_dist, run_speed, threat_radius, rear_bonus, nose_radius, calm_aura, size, color]
const TYPE_PARAMS: Dictionary = {
	DogType.SECURITY: {
		"follow_dist": 3.2, "speed": 8.0, "threat_radius": 26.0, "rear_mult": 1.5,
		"nose_radius": 0.0, "calm_aura": 0.0, "scale": 1.15, "color": Color(0.32, 0.26, 0.18),
		"obey_delay": 0.5, "bark": "GROWLS",
	},
	DogType.HUNTER: {
		"follow_dist": 4.5, "speed": 8.5, "threat_radius": 14.0, "rear_mult": 1.2,
		"nose_radius": 24.0, "calm_aura": 0.0, "scale": 1.0, "color": Color(0.55, 0.42, 0.25),
		"obey_delay": 0.6, "bark": "points",
	},
	DogType.COMPANION: {
		"follow_dist": 2.6, "speed": 8.0, "threat_radius": 16.0, "rear_mult": 1.2,
		"nose_radius": 10.0, "calm_aura": 2.0, "scale": 1.0, "color": Color(0.72, 0.6, 0.4),
		"obey_delay": 0.0, "bark": "barks",
	},
	DogType.CUDDLE: {
		"follow_dist": 1.8, "speed": 7.0, "threat_radius": 8.0, "rear_mult": 1.1,
		"nose_radius": 0.0, "calm_aura": 9.0, "scale": 0.62, "color": Color(0.82, 0.74, 0.62),
		"obey_delay": 0.8, "bark": "grumbles",
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

var _owner_ref: Node3D = null
var _main: Node = null ## the proto3d main scene (set at adoption) — sim-safe, no current_scene reliance
var _visual: Node3D
var _tail: MeshInstance3D
var _follow_angle: float = 0.0 ## personal heel offset so dogs don't stack
var _alert_t: float = 0.0
var _alert_face: Vector3 = Vector3.ZERO
var _scan_t: float = 0.0
var _threat_cooldown: float = 0.0
var _pinged_stashes: Array = []
var _obey_queue: Array = [] ## [ [time_left, state] ] — obedience delay per type
var _wag_t: float = 0.0


var _params: Dictionary = {}

static func create(type: DogType, name_in: String, breed_in: String) -> ProtoDog:
	var d := ProtoDog.new()
	d.dog_type = type
	d.dog_name = name_in
	d.breed = breed_in
	d.add_to_group("interactable")
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

	d._visual = Node3D.new()
	d.add_child(d._visual)
	# Body
	var body := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.34, 0.32, 0.8) * s
	body.mesh = bm
	body.material_override = ProtoWorldBuilder.material(body_color, 0.9)
	body.position.y = 0.42 * s
	d._visual.add_child(body)
	# Head + snout
	var head := MeshInstance3D.new()
	var hm := BoxMesh.new()
	hm.size = Vector3(0.26, 0.24, 0.26) * s
	head.mesh = hm
	head.material_override = ProtoWorldBuilder.material(body_color * 1.1, 0.9)
	head.position = Vector3(0, 0.62, -0.45) * s
	d._visual.add_child(head)
	var snout := MeshInstance3D.new()
	var sm := BoxMesh.new()
	sm.size = Vector3(0.12, 0.1, 0.16) * s
	snout.mesh = sm
	snout.material_override = ProtoWorldBuilder.material(body_color * 0.7, 0.9)
	snout.position = Vector3(0, 0.56, -0.63) * s
	d._visual.add_child(snout)
	# Ears
	for ex in [-0.08, 0.08]:
		var ear := MeshInstance3D.new()
		var em := BoxMesh.new()
		em.size = Vector3(0.06, 0.12, 0.04) * s
		ear.mesh = em
		ear.material_override = ProtoWorldBuilder.material(body_color * 0.8, 0.9)
		ear.position = Vector3(ex * s, 0.78 * s, -0.45 * s)
		d._visual.add_child(ear)
	# Tail (wags)
	d._tail = MeshInstance3D.new()
	var tm := BoxMesh.new()
	tm.size = Vector3(0.06, 0.06, 0.3) * s
	d._tail.mesh = tm
	d._tail.material_override = ProtoWorldBuilder.material(body_color * 0.9, 0.9)
	d._tail.position = Vector3(0, 0.55, 0.5) * s
	d._visual.add_child(d._tail)
	# Legs
	for lx in [-0.12, 0.12]:
		for lz in [-0.28, 0.28]:
			var leg := MeshInstance3D.new()
			var lm := BoxMesh.new()
			lm.size = Vector3(0.08, 0.28, 0.08) * s
			leg.mesh = lm
			leg.material_override = ProtoWorldBuilder.material(body_color * 0.75, 0.9)
			leg.position = Vector3(lx * s, 0.14 * s, lz * s)
			d._visual.add_child(leg)

	d._follow_angle = randf() * TAU
	return d


func params() -> Dictionary:
	return _params if not _params.is_empty() else TYPE_PARAMS[dog_type]


func type_name() -> String:
	return TYPE_NAMES[dog_type]


# --- Interactable contract -------------------------------------------------

func interact_position() -> Vector3:
	return global_position


func interact_prompt(_main: Node) -> String:
	if not adopted:
		return "E — Adopt %s (%s · %s)" % [dog_name, type_name(), breed]
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
	# Toggle stay/follow (obedience delay is part of each type's identity)
	_queue_state(DogState.FOLLOW if state == DogState.STAY else DogState.STAY)


## Whistle: every adopted dog returns to heel.
func whistle() -> void:
	if adopted:
		_queue_state(DogState.FOLLOW)


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

	# Tail wag: friendly types wag while following; everyone wags when close to owner.
	_wag_t += delta * 9.0
	if _tail and (dog_type == DogType.CUDDLE or dog_type == DogType.COMPANION or _near_owner(3.0)):
		_tail.rotation.y = sin(_wag_t) * 0.6

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
		velocity.x = move_toward(velocity.x, dir.x * speed, 22.0 * delta)
		velocity.z = move_toward(velocity.z, dir.z * speed, 22.0 * delta)
		var yaw := atan2(-dir.x, -dir.z)
		_visual.rotation.y = lerp_angle(_visual.rotation.y, yaw, 10.0 * delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, 18.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 18.0 * delta)


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

	# Threats — a dog ALWAYS knows what's behind you.
	if _threat_cooldown <= 0.0:
		var facing: Vector3 = _owner_ref.call("facing") if _owner_ref.has_method("facing") else Vector3.FORWARD
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
