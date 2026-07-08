## THE SKELETAL PUPPET (owner 2026-07-08: adopt the authored low-poly GLB body
## for ALL humanoids). Wraps the imported DSA skeleton (dsa_body.glb — a 27-bone
## humanoid + skinned mesh, authored Z-up) and will expose the SAME interface as
## the procedural ProtoPuppet (create / animate / set_armed / muzzle_world / …) so
## call sites swap with no churn — but it poses SKELETON BONES instead of box
## pivots, so the character IS the authored model.
##
## Migration status: FOUNDATION — stands, scales, arms out of T-pose, weapon mount
## on R_Hand. Locomotion / aim / melee / crouch / death / per-archetype tint follow.
## Bone axes are learned empirically via the photobooth (glb_render probe): the
## shoulder LOWERS about local Z.
class_name ProtoSkelPuppet
extends Node3D

const GLB := "res://assets/models/dsa_body.glb"
const MODEL_SCALE := 0.60 ## 2.99 authored units tall → ~1.8 m

var skel: Skeleton3D
var mesh: MeshInstance3D
var hand_mount: BoneAttachment3D ## weapon rides here (R_Hand)
var gun: Node3D ## held-weapon container (mirrors ProtoPuppet.gun)
var _bone: Dictionary = {} ## name → index


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
	p.scale = Vector3.ONE * MODEL_SCALE
	p._idle_pose()
	# The weapon mount: a BoneAttachment on R_Hand so a held mesh rides the hand.
	if p.skel != null and p._bone.has("R_Hand"):
		p.hand_mount = BoneAttachment3D.new()
		p.hand_mount.bone_name = "R_Hand"
		p.skel.add_child(p.hand_mount)
		p.gun = Node3D.new()
		p.gun.visible = false
		p.hand_mount.add_child(p.gun)
	return p


## Neutral standing idle: bring both arms DOWN from the T-pose to the sides
## (shoulders rotate about local Z — the probe result; mirror the sign per side)
## with a slight elbow bend so the arms don't read as ramrod planks.
func _idle_pose() -> void:
	_pose("R_Shoulder", Vector3(0, 0, 1), -1.82)
	_pose("L_Shoulder", Vector3(0, 0, 1), 1.82)


func _pose(bone: String, axis: Vector3, angle: float) -> void:
	if skel != null and _bone.has(bone):
		skel.set_bone_pose_rotation(_bone[bone], Quaternion(axis, angle))


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
