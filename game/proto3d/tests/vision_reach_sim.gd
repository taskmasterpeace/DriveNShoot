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

	# === 3. THE RETIREMENT (playtest #15) — the bind row is CLEARED, so no key
	# can ever raise the glass; B belongs to drone recall. §1's range constants
	# and §2's hand-to-face pose stay in code for the future radar/scope arc —
	# this section asserts the shipped truth: the verb is unreachable.
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 10:
		await get_tree().physics_frame
	main.player.global_position = Vector3(6, 0.35, 388)
	var row_clear := true
	for a in ProtoInputMap.actions:
		if String(a.get("id", "")) == "drivn_binoculars":
			row_clear = (a.get("keys", []) as Array).is_empty() and (a.get("pad", []) as Array).is_empty()
	_check("the binocular BIND ROW is cleared (keys+pad empty)", row_clear)
	var evb := InputEventKey.new()
	evb.keycode = KEY_B
	evb.physical_keycode = KEY_B
	evb.pressed = true
	Input.parse_input_event(evb)
	for _i in 20:
		await get_tree().physics_frame
	_check("HOLD B no longer glasses (cam_rig.binoculars stays off)", not bool(main.cam_rig.binoculars))
	evb = InputEventKey.new()
	evb.keycode = KEY_B
	evb.physical_keycode = KEY_B
	evb.pressed = false
	Input.parse_input_event(evb)

	print("VISREACH RESULTS: %d passed, %d failed" % [passed, failed])
	print("VISREACH: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _bone_world(sp: ProtoSkelPuppet, bone: String) -> Vector3:
	if sp.skel == null or not sp._bone.has(bone):
		return Vector3.ZERO
	return sp.skel.global_transform * sp.skel.get_bone_global_pose(sp._bone[bone]).origin
