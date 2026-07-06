## PROTO-3D lurker: a hooded silhouette that stalks the player from behind and
## FREEZES when looked at. No damage yet (combat is Stage 2/4) — it exists so the
## dogs' rear-smell has something real to catch, and to make the wasteland creepy.
class_name ProtoLurker
extends CharacterBody3D

@export var stalk_range: float = 45.0
@export var stop_distance: float = 1.4 ## close enough to CLAW
@export var stalk_speed: float = 2.6
@export var claw_damage: float = 9.0
@export var claw_cooldown: float = 1.3
var _claw_cd: float = 0.0

var _visual: Node3D
var _player: Node3D = null
var body: Damageable = Damageable.new("body", "💀", 40.0)
var dead: bool = false
var knocked: bool = false
var _knock_t: float = 0.0


## Knocked flat — can't move or attack, floating word, gets up after a beat.
func knock_down() -> void:
	if dead:
		return
	knocked = true
	_knock_t = 1.6
	if _visual:
		_visual.rotation.x = -1.35
	ProtoFloater.pop(get_parent(), global_position + Vector3(0, 2.1, 0), "KNOCKDOWN!", Color(1.0, 0.82, 0.2), 150)


var _hit_flash_t: float = 0.0
var _flash_mat: StandardMaterial3D = null
var _stun_t: float = 0.0


func is_stunned() -> bool:
	return _stun_t > 0.0


func take_damage(amount: float) -> void:
	if dead:
		return
	# Hits STAGGER — the stalk/claw stops dead for a beat (combat answers back).
	_stun_t = minf(_stun_t + 0.3, 0.7)
	ProtoFloater.pop(get_parent(), global_position + Vector3(0, 1.8, 0), "-%d" % int(amount), Color(0.96, 0.86, 0.55), 110)
	# HITS READ (playtest: "nothing shows they're taking damage"): the whole
	# silhouette FLASHES hot for a beat and the thing staggers.
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
	velocity.y += 1.6 # the stagger hop
	body.damage(amount)
	if body.hp <= 0.0:
		dead = true
		# KILL PAYOFF: the skull pops, the remains drop (soft pile, never a
		# car-denting crate).
		ProtoFX.skull(get_parent(), global_position)
		var corpse := ProtoChest.create("Corpse", {"meat": 1, "jack": 2}, false)
		get_parent().add_child(corpse)
		corpse.global_position = global_position
		queue_free()


## Force answered with motion: pellets and steel SHOVE the thing backward.
func shove(dir: Vector3, power: float) -> void:
	if dead:
		return
	var d := Vector3(dir.x, 0, dir.z)
	if d.length_squared() > 0.01:
		velocity += d.normalized() * power + Vector3(0, power * 0.25, 0)


static func create() -> ProtoLurker:
	var l := ProtoLurker.new()
	l.add_to_group("threat")
	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.32
	cap.height = 1.6
	shape.shape = cap
	shape.position.y = 0.8
	l.add_child(shape)

	l._visual = Node3D.new()
	l.add_child(l._visual)
	var cloak := MeshInstance3D.new()
	var cm := CapsuleMesh.new()
	cm.radius = 0.34
	cm.height = 1.5
	cloak.mesh = cm
	cloak.material_override = ProtoWorldBuilder.material(Color(0.12, 0.11, 0.10), 1.0)
	cloak.position.y = 0.75
	l._visual.add_child(cloak)
	var hood := MeshInstance3D.new()
	var hm := SphereMesh.new()
	hm.radius = 0.2
	hm.height = 0.4
	hood.mesh = hm
	hood.material_override = ProtoWorldBuilder.material(Color(0.09, 0.08, 0.08), 1.0)
	hood.position.y = 1.6
	l._visual.add_child(hood)
	return l


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity += get_gravity() * delta

	# Hit flash decays and clears (runs on every path, knocked included).
	if _hit_flash_t > 0.0:
		_hit_flash_t -= delta
		if _hit_flash_t <= 0.0 and _visual:
			for c in _visual.get_children():
				if c is MeshInstance3D:
					(c as MeshInstance3D).material_overlay = null

	# Staggered by a hit: no legs, no claws until it recovers.
	if _stun_t > 0.0:
		_stun_t -= delta
		velocity.x = move_toward(velocity.x, 0.0, 16.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 16.0 * delta)
		move_and_slide()
		return

	# Knocked down: helpless, no stalk, no claw, until it gets back up.
	if knocked:
		_knock_t -= delta
		velocity.x = move_toward(velocity.x, 0.0, 14.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 14.0 * delta)
		if _knock_t <= 0.0:
			knocked = false
			if _visual:
				_visual.rotation.x = 0.0
		move_and_slide()
		return

	if _player == null or not is_instance_valid(_player):
		_player = get_tree().get_first_node_in_group("player3d")
		move_and_slide()
		return

	var to_p := _player.global_position - global_position
	to_p.y = 0.0
	var dist := to_p.length()

	# STEALTH: a quiet walker gets noticed later (sprinting spoils the discount).
	var eff_stalk := stalk_range
	if _player.has_method("noise_mult"):
		eff_stalk *= _player.call("noise_mult")
	var stalking := dist < eff_stalk and dist > stop_distance
	# Freeze when the player is looking at it (creepy) — only breaks eye contact stalks.
	# Eye contact = the GAZE (Look Arc), not the torso: what the cone shows is what freezes it.
	if stalking and _player.has_method("facing"):
		var facing: Vector3 = _player.call("sight_facing") if _player.has_method("sight_facing") else _player.call("facing")
		if facing.dot(-to_p.normalized()) > 0.55 and dist < 30.0:
			# ...but a stare through a WALL freezes nothing — eye contact needs LOS.
			var m: Node = get_tree().current_scene
			if m == null or not m.has_method("sight_blocked"):
				m = _player.get_parent()
			if m == null or not m.has_method("sight_blocked") \
					or not m.sight_blocked(_player.global_position + Vector3(0, 1.5, 0), global_position + Vector3(0, 0.9, 0)):
				stalking = false

	if stalking:
		var dir := to_p.normalized()
		velocity.x = move_toward(velocity.x, dir.x * stalk_speed, 8.0 * delta)
		velocity.z = move_toward(velocity.z, dir.z * stalk_speed, 8.0 * delta)
		var yaw := atan2(-dir.x, -dir.z)
		_visual.rotation.y = lerp_angle(_visual.rotation.y, yaw, 6.0 * delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, 10.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 10.0 * delta)

	# COMBAT IS TWO-WAY: in claw reach, it swipes — the wasteland bites back.
	_claw_cd = maxf(0.0, _claw_cd - delta)
	if not dead and _claw_cd <= 0.0 and dist <= stop_distance + 0.5:
		var main := get_tree().current_scene
		if main == null or not main.has_method("on_player_clawed"):
			main = _player.get_parent() if _player else null
		if main and main.has_method("on_player_clawed"):
			_claw_cd = claw_cooldown
			main.on_player_clawed(claw_damage, self)

	move_and_slide()
