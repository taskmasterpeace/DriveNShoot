## THE SKELETAL PUPPET (owner 2026-07-08: adopt the authored low-poly GLB body
## for ALL humanoids). Wraps the imported DSA skeleton (dsa_body.glb — a 27-bone
## humanoid + skinned mesh, authored Z-up) and exposes the SAME interface the game
## calls on ProtoPuppet (aim_arm / legs_pivot / gun / animate / set_hand_pose /
## set_weapon_mesh / set_armed / muzzle_world / raised / crouch_target / swing /
## punch / kick / recoil / flinch / arm_tracks_gaze) — so player_3d and proto3d
## drive it with NO changes, but the character IS the authored model.
##
## Poses SKELETON BONES, not box pivots. Bone axes learned via the photobooth
## probe: the SHOULDER lowers about local Z. Migration is incremental — idle +
## aim + crouch land first (the model shows in-game); the walk stride, melee, and
## per-archetype tint refine in following passes.
class_name ProtoSkelPuppet
extends Node3D

const GLB := "res://assets/models/dsa_body.glb"
const MODEL_SCALE := 0.60 ## 2.99 authored units tall → ~1.8 m
## Shoulder angle (about local Z) that hangs the arms at the sides.
const ARM_DOWN := 1.82

# --- The interface the game reads (mirrors ProtoPuppet) ----------------------
var aim_arm: Node3D          ## proxy: the caller yaws this to the gaze; animate() reads it
var legs_pivot: Node3D       ## proxy: the caller yaws this for feet-vs-body
var gun: Node3D              ## held-weapon container, rides the R_Hand bone
var raised: bool = false     ## a gun is up (twin-stick aim read)
var binoculars: bool = false ## glassing — the hand comes to the face (owner: others READ it)
var crouch_target: float = 0.0
var aim_wobble: float = 0.0  ## wound shake the game feeds in (steady-arm degrades)
var appearance: Dictionary = {} ## the look row (limp/handed/colors); the game reads + tweaks it
var handed_sign: float = 1.0 ## +1 right-handed, -1 left (visual mirror is a later pass)

# --- Internals ---------------------------------------------------------------
var skel: Skeleton3D
var mesh: MeshInstance3D
var hand_mount: BoneAttachment3D
var _bone: Dictionary = {}   ## name → index
var _t: float = 0.0
var _phase: float = 0.0
var _crouch: float = 0.0
var _muzzle_z: float = 0.34
var _two_handed: bool = false
var _base_y: float = 0.0     ## the puppet's rest Y (crouch sinks from here)
var _swing_t: float = 0.0


static func create(_appearance: Dictionary = {}) -> ProtoSkelPuppet:
	var p := ProtoSkelPuppet.new()
	var body := (load(GLB) as PackedScene).instantiate()
	body.name = "Body"
	body.rotation = Vector3(deg_to_rad(-90.0), 0.0, 0.0) # authored Z-up → Godot Y-up
	p.add_child(body)
	p.skel = p._find_skel(body)
	if p.skel != null:
		for i in p.skel.get_bone_count():
			p._bone[p.skel.get_bone_name(i)] = i
		p.mesh = p._find_mesh(p.skel)
	p.appearance = _appearance.duplicate() if _appearance != null else {}
	p.handed_sign = -1.0 if String(p.appearance.get("handed", "right")) == "left" else 1.0
	p.scale = Vector3.ONE * MODEL_SCALE
	# Proxy nodes the caller manipulates (never rendered themselves).
	p.aim_arm = Node3D.new(); p.add_child(p.aim_arm)
	p.legs_pivot = Node3D.new(); p.add_child(p.legs_pivot)
	# Weapon mount on the RIGHT hand bone.
	if p.skel != null and p._bone.has("R_Hand"):
		p.hand_mount = BoneAttachment3D.new()
		p.hand_mount.bone_name = "R_Hand"
		p.skel.add_child(p.hand_mount)
		p.gun = Node3D.new()
		p.gun.visible = false
		# The hand bone points +X (the authored arm axis); rotate the weapon so its
		# −Z barrel lines up with the arm's reach, and lift it into the palm.
		p.gun.rotation = Vector3(0.0, deg_to_rad(90.0), 0.0)
		p.hand_mount.add_child(p.gun)
	else:
		p.gun = Node3D.new(); p.add_child(p.gun); p.gun.visible = false
	p._idle_pose()
	return p


# --- The animator: idle + aim + crouch first; walk stride is the next pass ----
func animate(delta: float, speed: float, _turn_rate: float, armed: bool, _hurt: float, dead: bool) -> void:
	_t += delta
	if skel == null:
		return
	_swing_t = maxf(0.0, _swing_t - delta)
	if dead:
		_death_pose()
		return
	var aiming := raised and armed and gun != null and gun.visible
	if _swing_t <= 0.0:
		if binoculars:
			_binocular_pose()
		elif aiming:
			_aim_pose()
		else:
			_idle_pose(speed)
	# CROUCH: sink the whole body a touch and pull it into a hunch.
	_crouch = lerpf(_crouch, crouch_target, clampf(8.0 * delta, 0.0, 1.0))
	position.y = _base_y - _crouch * 0.28
	# a slow idle breath so it never reads frozen
	if speed < 0.15 and not aiming:
		_pose_add("Spine_02", Vector3(1, 0, 0), sin(_t * 1.8) * 0.015)


## Neutral standing: both arms hang at the sides (+ a little walk swing).
func _idle_pose(speed: float = 0.0) -> void:
	var moving := speed > 0.15
	if moving:
		_phase += 0.016 * (6.0 + speed * 0.4)
	var sw := (sin(_phase) if moving else 0.0) * clampf(0.15 + speed * 0.04, 0.0, 0.5)
	# arms hang (about Z) and swing fore/aft (about Y) with the gait
	_bpose("R_Shoulder", Basis(Vector3(0, 0, 1), -ARM_DOWN) * Basis(Vector3(0, 1, 0), sw))
	_bpose("L_Shoulder", Basis(Vector3(0, 0, 1), ARM_DOWN) * Basis(Vector3(0, 1, 0), -sw))
	# legs stride (hips fore/aft about Y; a light knee bend on the forward leg)
	_bpose("R_Hip", Basis(Vector3(0, 1, 0), sw * 1.1))
	_bpose("L_Hip", Basis(Vector3(0, 1, 0), -sw * 1.1))
	_bpose("R_Knee", Basis(Vector3(0, 1, 0), maxf(0.0, sw) * 1.2))
	_bpose("L_Knee", Basis(Vector3(0, 1, 0), maxf(0.0, -sw) * 1.2))


## Aim: the RIGHT arm comes forward and level; the gaze yaw (aim_arm.rotation.y)
## swings the whole arm about the body so the gun points where you aim.
func _aim_pose() -> void:
	var yaw := aim_arm.rotation.y if aim_arm != null else 0.0
	# Shoulder: down (Z) then forward (Y) to bring the arm to a horizontal point,
	# then the gaze yaw carries it around.
	_bpose("R_Shoulder", Basis(Vector3(0, 1, 0), yaw) * Basis(Vector3(0, 0, 1), -1.35) * Basis(Vector3(0, 1, 0), 1.35))
	_bpose("R_Elbow", Basis(Vector3(0, 1, 0), 0.15))
	_bpose("L_Shoulder", Basis(Vector3(0, 0, 1), ARM_DOWN))
	_bpose("R_Hip", Basis()); _bpose("L_Hip", Basis())
	_bpose("R_Knee", Basis()); _bpose("L_Knee", Basis())


## GLASSING (owner 2026-07-08): the right hand comes to the face like holding
## binoculars — a silhouette other players read instantly. Upper arm raises
## forward-up, the elbow folds hard so the hand lands at the eyes.
func _binocular_pose() -> void:
	# Solved for hand-at-face (pose_probe): upper arm forward + up + across the
	# body, elbow folded hard — the hand lands ~0.33 m from the head (the eyes).
	_bpose("R_Shoulder", Basis(Vector3(1, 0, 0), -1.8) * Basis(Vector3(0, 1, 0), 0.5) * Basis(Vector3(0, 0, 1), 0.6))
	_bpose("R_Elbow", Basis(Vector3(0, 1, 0), 2.8))
	_bpose("L_Shoulder", Basis(Vector3(0, 0, 1), ARM_DOWN)) # off hand stays down (a one-hand read)
	_bpose("R_Hip", Basis()); _bpose("L_Hip", Basis())
	_bpose("R_Knee", Basis()); _bpose("L_Knee", Basis())


func _death_pose() -> void:
	_bpose("Spine_01", Basis(Vector3(1, 0, 0), 1.4))
	_bpose("R_Shoulder", Basis(Vector3(0, 0, 1), -0.6))
	_bpose("L_Shoulder", Basis(Vector3(0, 0, 1), 0.6))


# --- Held-weapon interface (mirrors ProtoPuppet) -----------------------------
func set_hand_pose(_offset: Vector3, two_handed: bool, _grip_l: Vector3 = Vector3.ZERO, _grip_r: Vector3 = Vector3.ZERO) -> void:
	_two_handed = two_handed # (the fore-grip / off-hand support is a later pass)


func set_weapon_mesh(parts: Array, muzzle_z: float = 0.34) -> void:
	_muzzle_z = maxf(0.05, muzzle_z)
	if gun == null:
		return
	for c in gun.get_children():
		gun.remove_child(c)
		c.queue_free()
	var use: Array = parts if not parts.is_empty() else [{"size": Vector3(0.06, 0.06, 0.5), "pos": Vector3(0, 0, -0.16), "color": Color(0.16, 0.16, 0.18)}]
	for part in use:
		var m := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = part.get("size", Vector3(0.06, 0.06, 0.3))
		m.mesh = bm
		m.material_override = ProtoWorldBuilder.material(part.get("color", Color(0.16, 0.16, 0.18)), 0.85)
		m.position = part.get("pos", Vector3.ZERO)
		var r: Vector3 = part.get("rot", Vector3.ZERO)
		if r != Vector3.ZERO:
			m.rotation = r
		gun.add_child(m)


func set_armed(on: bool) -> void:
	if gun:
		gun.visible = on


func muzzle_world() -> Vector3:
	if gun != null and gun.visible:
		return gun.global_position - gun.global_basis.z * _muzzle_z
	return global_position + Vector3(0, 1.2, 0)


## Guns track the gaze (twin-stick); melee/unarmed relax home (same law as ProtoPuppet).
func arm_tracks_gaze() -> bool:
	return raised


## Riding an exposed rig (motorcycle): lean into the bars; an armed rider brings
## the gun arm up to aim. (A proper hands-on-bars pose is a later pass.)
func pose_riding(_delta: float, armed_aim: bool) -> void:
	if skel == null:
		return
	_bpose("Spine_01", Basis(Vector3(1, 0, 0), 0.32)) # lean forward over the tank
	if armed_aim:
		_aim_pose()
	else:
		_bpose("R_Shoulder", Basis(Vector3(0, 0, 1), -1.4) * Basis(Vector3(0, 1, 0), 0.5))
		_bpose("L_Shoulder", Basis(Vector3(0, 0, 1), 1.4) * Basis(Vector3(0, 1, 0), -0.5))


# --- Combat feedback (light for now; full swings/recoil are a later pass) -----
func swing() -> void:
	_swing_t = 0.35
	if skel != null:
		_bpose("R_Shoulder", Basis(Vector3(0, 1, 0), -1.0) * Basis(Vector3(0, 0, 1), -1.2))


func punch(_beat: int) -> void:
	_swing_t = 0.2


func kick() -> void:
	_swing_t = 0.2


func is_swinging() -> bool:
	return _swing_t > 0.0


func gun_recoil() -> void:
	pass


func recoil() -> void:
	pass


func recoil_kick(_row: Dictionary, _strength_level: int) -> void:
	pass


func flinch(_world_dir: Vector3 = Vector3.ZERO) -> void:
	pass


# --- Bone helpers ------------------------------------------------------------
func _bpose(bone: String, basis: Basis) -> void:
	if skel != null and _bone.has(bone):
		skel.set_bone_pose_rotation(_bone[bone], basis.get_rotation_quaternion())


func _pose(bone: String, axis: Vector3, angle: float) -> void:
	_bpose(bone, Basis(axis, angle))


func _pose_add(bone: String, axis: Vector3, angle: float) -> void:
	if skel != null and _bone.has(bone):
		var cur := skel.get_bone_pose_rotation(_bone[bone])
		skel.set_bone_pose_rotation(_bone[bone], cur * Quaternion(axis, angle))


func _idle_pose_static() -> void:
	_pose("R_Shoulder", Vector3(0, 0, 1), -ARM_DOWN)
	_pose("L_Shoulder", Vector3(0, 0, 1), ARM_DOWN)


func _find_skel(n: Node) -> Skeleton3D:
	if n is Skeleton3D:
		return n
	for c in n.get_children():
		var s := _find_skel(c)
		if s != null:
			return s
	return null


func _find_mesh(n: Node) -> MeshInstance3D:
	if n is MeshInstance3D:
		return n
	for c in n.get_children():
		var m := _find_mesh(c)
		if m != null:
			return m
	return null
