extends Node

func _ready() -> void:
	var scene: PackedScene = load("res://assets/models/dsa_body.glb")
	if scene == null:
		print("GLB: FAILED to load"); get_tree().quit(1); return
	var root := scene.instantiate()
	add_child(root)
	print("GLB: root = %s (%s)" % [root.name, root.get_class()])
	_walk(root, 0)
	# Find the skeleton + report bones
	var skel := _find_skel(root)
	if skel != null:
		print("GLB: SKELETON with %d bones:" % skel.get_bone_count())
		for i in skel.get_bone_count():
			var parent_i := skel.get_bone_parent(i)
			var pn := skel.get_bone_name(parent_i) if parent_i >= 0 else "—"
			var rest := skel.get_bone_rest(i).origin
			print("GLB:   [%d] %-14s parent=%-12s rest=(%.2f,%.2f,%.2f)" % [i, skel.get_bone_name(i), pn, rest.x, rest.y, rest.z])
	else:
		print("GLB: no Skeleton3D found")
	# Report mesh AABBs (size in world units)
	for m in _find_meshes(root):
		var aabb := (m as MeshInstance3D).get_aabb()
		print("GLB: mesh '%s' size=(%.2f,%.2f,%.2f) surfaces=%d" % [m.name, aabb.size.x, aabb.size.y, aabb.size.z, (m as MeshInstance3D).mesh.get_surface_count()])
	get_tree().quit(0)

func _walk(n: Node, d: int) -> void:
	print("GLB: %s%s (%s)" % ["  ".repeat(d), n.name, n.get_class()])
	for c in n.get_children():
		_walk(c, d + 1)

func _find_skel(n: Node) -> Skeleton3D:
	if n is Skeleton3D: return n
	for c in n.get_children():
		var s := _find_skel(c)
		if s != null: return s
	return null

func _find_meshes(n: Node) -> Array:
	var out: Array = []
	if n is MeshInstance3D and (n as MeshInstance3D).mesh != null: out.append(n)
	for c in n.get_children():
		out.append_array(_find_meshes(c))
	return out
