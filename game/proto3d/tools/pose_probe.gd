## Fast headless solver for the binocular hand-to-face pose: try shoulder/elbow
## combos, measure R_Hand → Head, print the best. No proto3d, no GPU — just the
## skeleton transform math, so it runs in a second.
extends Node

func _ready() -> void:
	var sp := ProtoSkelPuppet.create({})
	add_child(sp)
	var skel := sp.skel
	var head_i := skel.find_bone("Head")
	var hand_i := skel.find_bone("R_Hand")
	var best := {"d": 999.0, "desc": ""}
	# Shoulder: forward (X) + up (Y); Elbow fold about several axes/angles.
	for sx in [-1.8, -1.5, -1.2, -0.9]:
		for sy in [-0.5, 0.0, 0.5]:
			for sz in [-1.1, -0.7, -0.3, 0.2, 0.6]:
				for ea in [2.0, 2.4, 2.8]:
					skel.set_bone_pose_rotation(skel.find_bone("R_Shoulder"),
						(Basis(Vector3(1,0,0), sx) * Basis(Vector3(0,1,0), sy) * Basis(Vector3(0,0,1), sz)).get_rotation_quaternion())
					skel.set_bone_pose_rotation(skel.find_bone("R_Elbow"),
						Basis(Vector3(0,1,0), ea).get_rotation_quaternion())
					skel.force_update_all_bone_transforms()
					var hand := (skel.global_transform * skel.get_bone_global_pose(hand_i).origin)
					var head := (skel.global_transform * skel.get_bone_global_pose(head_i).origin)
					var d := hand.distance_to(head)
					if d < best["d"]:
						best = {"d": d, "desc": "sx=%.2f sy=%.2f sz=%.2f ea=%.2f  hand=%.2v head=%.2v" % [sx, sy, sz, ea, hand, head]}
	print("POSE_PROBE best d=%.3f  %s" % [best["d"], best["desc"]])
	get_tree().quit(0)
