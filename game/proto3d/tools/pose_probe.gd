## Re-solve the binocular hand-to-FACE pose WITH the facing flip in place.
extends Node

func _ready() -> void:
	var sp := ProtoSkelPuppet.create({})
	add_child(sp)
	var skel := sp.skel
	var head_i := skel.find_bone("Head")
	var hand_i := skel.find_bone("R_Hand")
	var best := {"d": 999.0, "desc": ""}
	for sx in [-2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0]:
		for sy in [-2.0, -1.0, 0.0, 1.0, 2.0]:
			for sz in [-2.0, -1.0, 0.0, 1.0, 2.0]:
				for ea in [1.6, 2.2, 2.8]:
					skel.set_bone_pose_rotation(skel.find_bone("R_Shoulder"),
						(Basis(Vector3(1,0,0), sx) * Basis(Vector3(0,1,0), sy) * Basis(Vector3(0,0,1), sz)).get_rotation_quaternion())
					skel.set_bone_pose_rotation(skel.find_bone("R_Elbow"), Basis(Vector3(0,1,0), ea).get_rotation_quaternion())
					skel.force_update_all_bone_transforms()
					var hand := (skel.global_transform * skel.get_bone_global_pose(hand_i).origin)
					var head := (skel.global_transform * skel.get_bone_global_pose(head_i).origin)
					var d := hand.distance_to(head)
					if d < best["d"]:
						best = {"d": d, "desc": "sx=%.2f sy=%.2f sz=%.2f ea=%.2f" % [sx, sy, sz, ea]}
	print("POSE_PROBE face best d=%.3f  %s" % [best["d"], best["desc"]])
	get_tree().quit(0)
