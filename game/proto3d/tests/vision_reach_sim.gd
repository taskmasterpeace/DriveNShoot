## THE VISION REACH LAW (owner 2026-07-08: "when you look a direction you should
## see all the way to the HORIZON in that direction; binoculars let you see
## EVERYWHERE the mouse points, the character LOOKS there and puts a hand to the
## face like they're glassing — so other players know what's going on"):
##  1. on-foot sight reaches FAR in the look direction (a long forward cone),
##  2. binoculars reach much FARTHER and the cone FACES THE MOUSE/AIM,
##  3. the camera view travels far toward the mouse,
##  4. the puppet raises a HAND TO THE FACE while glassing (readable by others).
## Run: godot --headless --path game res://proto3d/tests/vision_reach_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("VISREACH: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("VISREACH: start")
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("VISREACH: WATCHDOG"); print("VISREACH: FAILURES PRESENT"); get_tree().quit(1))

	# === 1. THE RANGE CONSTANTS (the reveal + perception reach, in world meters) ===
	_check("on foot you see FAR in your look direction (MODE_FOOT range %.0fm >= 90)" % ProtoVisionCone.MODE_FOOT[2],
		float(ProtoVisionCone.MODE_FOOT[2]) >= 90.0)
	_check("binoculars reach much farther — toward the horizon (MODE_BINOC %.0fm >= 200)" % ProtoVisionCone.MODE_BINOC[2],
		float(ProtoVisionCone.MODE_BINOC[2]) >= 200.0)
	_check("binoculars out-see the naked eye (%.0f > %.0f)" % [ProtoVisionCone.MODE_BINOC[2], ProtoVisionCone.MODE_FOOT[2]],
		float(ProtoVisionCone.MODE_BINOC[2]) > float(ProtoVisionCone.MODE_FOOT[2]))
	var rig := ProtoCameraRig.new()
	_check("the binocular VIEW travels far to the mouse (rig range %.0f >= 200)" % rig.binocular_range,
		rig.binocular_range >= 200.0)
	rig.free()

	# === 2. THE HAND-TO-FACE POSE (readable by other players) ======================
	var sp := ProtoSkelPuppet.create({})
	add_child(sp)
	sp.binoculars = false
	for _i in 20:
		sp.animate(1.0 / 60.0, 0.0, 0.0, false, 0.0, false)
	await get_tree().process_frame
	var hand_rest_y := _bone_world(sp, "R_Hand").y
	sp.binoculars = true
	for _i in 40:
		sp.animate(1.0 / 60.0, 0.0, 0.0, false, 0.0, false)
	await get_tree().process_frame
	var hand_up := _bone_world(sp, "R_Hand")
	var head := _bone_world(sp, "Head")
	_check("glassing RAISES the hand from rest (%.2f > %.2f)" % [hand_up.y, hand_rest_y],
		hand_up.y > hand_rest_y)
	_check("the hand comes to the FACE (within 0.4m of the head: %.2fm)" % hand_up.distance_to(head),
		hand_up.distance_to(head) < 0.4)
	sp.queue_free()

	# === 3. BINOCULARS FACE THE MOUSE (wherever you point, that's where you look) ==
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 10:
		await get_tree().physics_frame
	# Aim hard to one side, raise the glasses, and let the cone settle.
	main.player.global_position = Vector3(6, 0.35, 388)
	var aim2 := Vector2(1.0, 0.35).normalized()
	# Drive the REAL binocular-look field the mouse feeds (_binoc_view), far enough
	# out that binocular_aim_dir() reports it — this is the "look at the mouse" path.
	main.cam_rig.binocular_offset = aim2 * 60.0
	main.cam_rig._binoc_view = aim2 * 60.0
	Input.action_press("drivn_binoculars") # the REAL path: input → cam_rig + puppet + cone
	for _i in 50:
		await get_tree().physics_frame
		main.cam_rig._binoc_view = aim2 * 60.0 # hold it out (no real mouse to sustain it)
	var want := aim2
	_check("the binocular cone FACES the mouse/aim (dot %.2f >= 0.7)" % Vector2(main.vision_cone._dir).dot(want),
		Vector2(main.vision_cone._dir).normalized().dot(want) >= 0.7)
	_check("...and the player's BODY is told it's glassing (puppet.binoculars)",
		"binoculars" in main.player.puppet and main.player.puppet.binoculars)
	Input.action_release("drivn_binoculars")

	print("VISREACH RESULTS: %d passed, %d failed" % [passed, failed])
	print("VISREACH: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _bone_world(sp: ProtoSkelPuppet, bone: String) -> Vector3:
	if sp.skel == null or not sp._bone.has(bone):
		return Vector3.ZERO
	return sp.skel.global_transform * sp.skel.get_bone_global_pose(sp._bone[bone]).origin
