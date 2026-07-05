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


func take_damage(amount: float) -> void:
	if dead:
		return
	ProtoFloater.pop(get_parent(), global_position + Vector3(0, 1.8, 0), "-%d" % int(amount), Color(0.96, 0.86, 0.55), 110)
	body.damage(amount)
	if body.hp <= 0.0:
		dead = true
		# Death leaves lootable remains — the Container serves corpses too.
		var corpse := ProtoChest.create("Corpse", {"meat": 1, "jack": 2})
		get_parent().add_child(corpse)
		corpse.global_position = global_position
		queue_free()


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

	var stalking := dist < stalk_range and dist > stop_distance
	# Freeze when the player is looking at it (creepy) — only breaks eye contact stalks.
	if stalking and _player.has_method("facing"):
		var facing: Vector3 = _player.call("facing")
		if facing.dot(-to_p.normalized()) > 0.55 and dist < 30.0:
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
