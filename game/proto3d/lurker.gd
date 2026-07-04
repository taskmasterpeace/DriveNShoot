## PROTO-3D lurker: a hooded silhouette that stalks the player from behind and
## FREEZES when looked at. No damage yet (combat is Stage 2/4) — it exists so the
## dogs' rear-smell has something real to catch, and to make the wasteland creepy.
class_name ProtoLurker
extends CharacterBody3D

@export var stalk_range: float = 45.0
@export var stop_distance: float = 5.0
@export var stalk_speed: float = 2.6

var _visual: Node3D
var _player: Node3D = null


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

	if _player == null or not is_instance_valid(_player):
		_player = get_tree().get_first_node_in_group("player")
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

	move_and_slide()
