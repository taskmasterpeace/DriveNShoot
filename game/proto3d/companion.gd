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

var comp_name: String = "Sam"
var staying: bool = false
var riding_in: ProtoCar3D = null
var hp: float = 70.0
var max_hp: float = 70.0

var _main: Node = null
var _fire_cd: float = 0.0
var _scout_cd: float = 0.0
var _visual: Node3D
var _gun_mesh: MeshInstance3D


static func create(main: Node) -> ProtoCompanion:
	var c := ProtoCompanion.new()
	c._main = main
	c.add_to_group("interactable")
	c.add_to_group("npc") # sight rays pass him; FADE treats him as a person
	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.33
	cap.height = 1.7
	shape.shape = cap
	shape.position.y = 0.85
	c.add_child(shape)
	c._visual = Node3D.new()
	c.add_child(c._visual)
	var body := MeshInstance3D.new()
	var bm := CapsuleMesh.new()
	bm.radius = 0.32
	bm.height = 1.5
	body.mesh = bm
	body.material_override = ProtoWorldBuilder.material(Color(0.33, 0.38, 0.3), 0.85)
	body.position.y = 0.78
	c._visual.add_child(body)
	var head := MeshInstance3D.new()
	var hm := SphereMesh.new()
	hm.radius = 0.18
	hm.height = 0.36
	head.mesh = hm
	head.material_override = ProtoWorldBuilder.material(Color(0.72, 0.55, 0.4), 0.9)
	head.position.y = 1.64
	c._visual.add_child(head)
	c._gun_mesh = MeshInstance3D.new()
	var gm := BoxMesh.new()
	gm.size = Vector3(0.06, 0.06, 0.5)
	c._gun_mesh.mesh = gm
	c._gun_mesh.material_override = ProtoWorldBuilder.material(Color(0.15, 0.15, 0.17), 0.4)
	c._gun_mesh.position = Vector3(0.26, 1.1, -0.3)
	c._visual.add_child(c._gun_mesh)
	var tag := Label3D.new()
	tag.text = "SAM\nDRIFTER"
	tag.font_size = 84
	tag.pixel_size = 0.0042
	tag.modulate = Color(0.7, 0.85, 0.7)
	tag.position = Vector3(0, 2.3, 0)
	tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	c._visual.add_child(tag)
	return c


func interact_position() -> Vector3:
	return global_position


func interact_prompt(_m: Node) -> String:
	return "E — %s: Follow" % comp_name if staying else "E — %s: Hold here" % comp_name


func interact(m: Node) -> void:
	staying = not staying
	m.notify("%s %s" % [comp_name, "holds this spot" if staying else "falls in behind you"])


func take_damage(amount: float) -> void:
	hp = maxf(1.0, hp - amount) # companions don't die in this slice (Stage 7 full adds it)
	ProtoFloater.pop(get_parent(), global_position + Vector3(0, 1.9, 0), "-%d" % int(amount), Color(0.9, 0.6, 0.4), 100)


# --- Riding shotgun (same law as the pack) -------------------------------------

func board(car: ProtoCar3D) -> void:
	riding_in = car
	visible = false
	process_mode = Node.PROCESS_MODE_DISABLED


func unboard(pos: Vector3) -> void:
	riding_in = null
	process_mode = Node.PROCESS_MODE_INHERIT
	visible = true
	global_position = pos
	velocity = Vector3.ZERO


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity += get_gravity() * delta
	_fire_cd = maxf(0.0, _fire_cd - delta)
	_scout_cd = maxf(0.0, _scout_cd - delta)

	var player: Node3D = _main.player if _main and "player" in _main else null
	if player == null or not is_instance_valid(player):
		move_and_slide()
		return

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

	# FIGHT: his own iron answers the nearest threat in range with clear LOS.
	var target := _nearest_threat()
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
	if _main and "audio" in _main and _main.audio:
		_main.audio.play_at("shot", global_position, -6.0, 1.1)
	if not hit.is_empty():
		var col = hit["collider"]
		if col != null and col.has_method("take_damage"):
			ProtoFX.blood(_main if _main else get_parent(), hit["position"])
			col.take_damage(GUN_DAMAGE)
		else:
			ProtoFX.impact(_main if _main else get_parent(), hit["position"])


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
