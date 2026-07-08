## Headless probe: confirm Godot imports the Mesh2Motion clips + skeleton (no rendering).
extends Node

func _ready() -> void:
	var scene: PackedScene = load("res://assets/models/anim/m2m_char.glb")
	if scene == null:
		print("M2M: FAILED to load"); get_tree().quit(1); return
	var root := scene.instantiate()
	add_child(root)
	var ap := _find(root, "AnimationPlayer") as AnimationPlayer
	if ap != null:
		print("M2M: clips = %s" % [ap.get_animation_list()])
		for cn in ap.get_animation_list():
			var a := ap.get_animation(cn)
			print("M2M:   '%s' len=%.2fs loop=%s tracks=%d" % [cn, a.length, a.loop_mode, a.get_track_count()])
	else:
		print("M2M: NO AnimationPlayer")
	var skel := _find(root, "Skeleton3D") as Skeleton3D
	if skel != null:
		print("M2M: skeleton bones=%d root0=%s" % [skel.get_bone_count(), skel.get_bone_name(0)])
	var meshes := _meshes(root)
	print("M2M: mesh instances=%d" % meshes.size())
	# Combined AABB (rest pose) — for scale + feet-offset baking. Works headless.
	await get_tree().process_frame
	var aabb := AABB(); var first := true
	for m in meshes:
		var mi := m as MeshInstance3D
		var w := mi.get_global_transform() * mi.get_aabb()
		if first: aabb = w; first = false
		else: aabb = aabb.merge(w)
	print("M2M: AABB size=%.3v min=%.3v (height=%.3f)" % [aabb.size, aabb.position, aabb.size.y])
	# Report a few key bone rest positions to learn axis/orientation.
	if skel != null:
		for bn in ["root", "pelvis", "head", "hand_r", "foot_r"]:
			var bi := skel.find_bone(bn)
			if bi >= 0:
				var gp := skel.get_bone_global_pose(bi).origin
				print("M2M:   bone %-10s pose=%.3v" % [bn, gp])
	get_tree().quit(0)

func _find(n: Node, cls: String) -> Node:
	if n.get_class() == cls: return n
	for c in n.get_children():
		var r := _find(c, cls)
		if r != null: return r
	return null

func _meshes(n: Node) -> Array:
	var o: Array = []
	if n is MeshInstance3D: o.append(n)
	for c in n.get_children(): o.append_array(_meshes(c))
	return o
