## THE NIGHT THREAT: Howlers hunt in packs after dark. They CIRCLE at the edge
## of what you can actually see (they read your real vision cone), then CHARGE —
## fast, straight, screaming. They fear working headlights, hits STAGGER them
## out of a charge, and dawn burns the whole pack off the map. The moon decides
## how close they get before you ever know: dark night = short cone = close teeth.
class_name ProtoHowler
extends CharacterBody3D

enum HowlState { CIRCLE, CHARGE, FLEE }

@export var circle_speed: float = 5.0
@export var charge_speed: float = 9.5
@export var claw_damage: float = 12.0
@export var claw_cooldown: float = 1.1
@export var flee_speed: float = 12.0
@export var despawn_dist: float = 55.0

var state: HowlState = HowlState.CIRCLE
var body: Damageable = Damageable.new("body", "💀", 30.0)
var dead: bool = false
var _stun_t: float = 0.0
var _charge_cd: float = 0.0
var _claw_cd: float = 0.0
var _orbit_sign: float = 1.0
var _player: Node3D = null
var _main: Node = null
var _visual: Node3D
var _hit_flash_t: float = 0.0
var _flash_mat: StandardMaterial3D = null
var _rng := RandomNumberGenerator.new()


static func create(main: Node) -> ProtoHowler:
	var h := ProtoHowler.new()
	h._main = main
	h.add_to_group("threat")
	h._rng.randomize()
	h._orbit_sign = 1.0 if h._rng.randf() > 0.5 else -1.0
	h._charge_cd = h._rng.randf_range(2.5, 6.0)
	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.3
	cap.height = 1.1
	shape.shape = cap
	shape.position.y = 0.55
	h.add_child(shape)
	h._visual = Node3D.new()
	h.add_child(h._visual)
	var torso := MeshInstance3D.new()
	var tm := CapsuleMesh.new()
	tm.radius = 0.3
	tm.height = 1.0
	torso.mesh = tm
	torso.material_override = ProtoWorldBuilder.material(Color(0.16, 0.13, 0.11), 1.0)
	torso.position.y = 0.5
	torso.rotation_degrees.x = 68.0 # low, loping silhouette
	h._visual.add_child(torso)
	# The EYES — two hot points, the only thing night shows you until it's close.
	for ex in [-0.08, 0.08]:
		var eye := MeshInstance3D.new()
		var em := SphereMesh.new()
		em.radius = 0.035
		em.height = 0.07
		eye.mesh = em
		eye.material_override = ProtoWorldBuilder.material(Color(1.0, 0.75, 0.2), 0.1, true)
		eye.position = Vector3(ex, 0.72, -0.42)
		h._visual.add_child(eye)
	return h


func is_stunned() -> bool:
	return _stun_t > 0.0


## Hits STAGGER: the charge dies in its tracks — shooting STOPS things now.
func take_damage(amount: float) -> void:
	if dead:
		return
	_stun_t = minf(_stun_t + 0.35, 0.8)
	if state == HowlState.CHARGE:
		state = HowlState.CIRCLE
		_charge_cd = _rng.randf_range(1.6, 3.2)
	ProtoFloater.pop(get_parent(), global_position + Vector3(0, 1.5, 0), "-%d" % int(amount), Color(0.96, 0.86, 0.55), 110)
	if _flash_mat == null:
		_flash_mat = StandardMaterial3D.new()
		_flash_mat.albedo_color = Color(1.0, 0.9, 0.8)
		_flash_mat.emission_enabled = true
		_flash_mat.emission = Color(1.0, 0.55, 0.35)
		_flash_mat.emission_energy_multiplier = 2.4
	_hit_flash_t = 0.12
	for c in _visual.get_children():
		if c is MeshInstance3D:
			(c as MeshInstance3D).material_overlay = _flash_mat
	body.damage(amount)
	if body.hp <= 0.0:
		dead = true
		ProtoFX.skull(get_parent(), global_position)
		var corpse := ProtoChest.create("Corpse", {"meat": 1, "jack": 3}, false)
		get_parent().add_child(corpse)
		corpse.global_position = global_position
		queue_free()


func shove(dir: Vector3, power: float) -> void:
	if dead:
		return
	var d := Vector3(dir.x, 0, dir.z)
	if d.length_squared() > 0.01:
		velocity += d.normalized() * power + Vector3(0, power * 0.25, 0)


func knock_down() -> void:
	_stun_t = maxf(_stun_t, 1.2)


## Sim hook: skip the circling patience and come NOW.
func force_charge() -> void:
	state = HowlState.CHARGE
	_charge_cd = 0.0


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity += get_gravity() * delta
	if _hit_flash_t > 0.0:
		_hit_flash_t -= delta
		if _hit_flash_t <= 0.0 and _visual:
			for c in _visual.get_children():
				if c is MeshInstance3D:
					(c as MeshInstance3D).material_overlay = null

	# Staggered: no legs, no teeth — the stagger IS the counterplay.
	if _stun_t > 0.0:
		_stun_t -= delta
		velocity.x = move_toward(velocity.x, 0.0, 20.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 20.0 * delta)
		move_and_slide()
		return

	if _player == null or not is_instance_valid(_player):
		_player = get_tree().get_first_node_in_group("player3d")
		move_and_slide()
		return

	# DAWN BURNS THE PACK: first light, they break and run until they're gone.
	if _main and "daynight" in _main and not _main.daynight.is_dark():
		state = HowlState.FLEE

	var to_p := _player.global_position - global_position
	to_p.y = 0.0
	var dist := to_p.length()
	var dir := to_p.normalized() if dist > 0.1 else Vector3.FORWARD

	match state:
		HowlState.FLEE:
			velocity.x = -dir.x * flee_speed
			velocity.z = -dir.z * flee_speed
			_face(-dir, delta)
			if dist > despawn_dist:
				queue_free()
				return
		HowlState.CIRCLE:
			# Ride the RIM of what the player can actually see — the real cone
			# range (the moon sets it). Dark night = tight circle = close teeth.
			var ring := 15.0
			if _main and "vision_cone" in _main and _main.vision_cone:
				ring = clampf(_main.vision_cone.last_range_m + 3.0, 10.0, 42.0)
			var radial := dist - ring
			var tangent := Vector3(dir.z, 0, -dir.x) * _orbit_sign
			var move_dir := (tangent + dir * clampf(radial * 0.25, -1.0, 1.0)).normalized()
			velocity.x = move_dir.x * circle_speed
			velocity.z = move_dir.z * circle_speed
			_face(dir, delta)
			_charge_cd -= delta
			if _charge_cd <= 0.0 and dist < 50.0:
				state = HowlState.CHARGE
		HowlState.CHARGE:
			# Headlight-shy: charging INTO a lit beam breaks the run.
			if _in_headlights():
				state = HowlState.CIRCLE
				_charge_cd = _rng.randf_range(2.0, 4.0)
				_orbit_sign *= -1.0
			else:
				velocity.x = dir.x * charge_speed
				velocity.z = dir.z * charge_speed
				_face(dir, delta)

	# Teeth: same two-way law as the lurker's claw.
	_claw_cd = maxf(0.0, _claw_cd - delta)
	if not dead and _claw_cd <= 0.0 and dist <= 1.7:
		if _main and _main.has_method("on_player_clawed"):
			_claw_cd = claw_cooldown
			_main.on_player_clawed(claw_damage, self)
			state = HowlState.CIRCLE
			_charge_cd = _rng.randf_range(2.0, 4.5)

	move_and_slide()


func _face(dir: Vector3, delta: float) -> void:
	if dir.length_squared() > 0.01 and _visual:
		_visual.rotation.y = lerp_angle(_visual.rotation.y, atan2(-dir.x, -dir.z), 9.0 * delta)


## Inside any lights-on vehicle's forward beam within 20m? Howlers won't cross it.
func _in_headlights() -> bool:
	if _main == null or not "cars" in _main:
		return false
	for c in _main.cars:
		if c == null or not is_instance_valid(c) or not c.headlights_on:
			continue
		var rel: Vector3 = global_position - (c as Node3D).global_position
		rel.y = 0.0
		if rel.length() < 20.0 and (c as ProtoCar3D).facing().dot(rel.normalized()) > 0.55:
			return true
	return false
