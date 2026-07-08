## Proof for PUPPET RIG V2 PHASE 1 (docs/design/PUPPET_RIG_V2.md): segmented limbs
## on the ONE box rig — knees/calves/feet, elbows/forearms/hands — with the ALIAS
## LAW (old joint names keep driving whole limbs), FOLLOW-THROUGH rows (elbows/knees
## ride their parents as fractions), the IDENTICAL net gun-hand rest (so every gun/
## muzzle/recoil formula reads unchanged), the two-hand FORE-GRIP pose, dead-pose
## limb bends, the no-kiss cross-section step-down, ProtoStrikePlayer's 9-name
## JOINT_AXIS actually driving the new hinges, and the motion stage's TAB author
## mode grown to joint keys 1-9 (driven through REAL InputEventKey presses).
## Run: godot --headless --path game res://proto3d/tests/rig_v2_sim.tscn
extends Node

const STAGE_SCENE: String = "res://proto3d/tools/motion_stage.tscn"

var passed := 0
var failed := 0
var _prev_time_scale: float = 1.0
var _done := false
var stage: Node3D = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RIG_V2: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## The proven strike_author_sim door: a REAL InputEventKey through the stage's own
## _input() — proves the KEY MAP, never the private handler behind it.
func _press(key: int, shift: bool = false) -> void:
	var ev := InputEventKey.new()
	ev.keycode = key
	ev.pressed = true
	ev.shift_pressed = shift
	stage._input(ev)


func _ready() -> void:
	print("RIG_V2: start")
	_prev_time_scale = Engine.time_scale
	get_tree().create_timer(30.0, true, false, true).timeout.connect(func() -> void:
		if not _done:
			print("RIG_V2: WATCHDOG")
			_check("WATCHDOG did not fire", false)
			_finish(1))

	# === 1. THE SEGMENTS EXIST + the net hand rest is IDENTICAL ==================
	var p := ProtoPuppet.create({})
	add_child(p)
	await get_tree().process_frame
	_check("gun arm segmented (elbow_r under the shoulder)", p.elbow_r != null and p.elbow_r.get_parent() == p.shoulder)
	_check("free arm segmented (elbow_l under free_arm, hand_l under elbow_l)",
		p.elbow_l != null and p.elbow_l.get_parent() == p.free_arm
		and p.hand_l != null and p.hand_l.get_parent() == p.elbow_l)
	_check("legs segmented (knee under hip, foot under knee, both sides)",
		p.knee_l != null and p.knee_l.get_parent() == p.hip_l
		and p.knee_r != null and p.knee_r.get_parent() == p.hip_r
		and p.foot_l != null and p.foot_l.get_parent() == p.knee_l
		and p.foot_r != null and p.foot_r.get_parent() == p.knee_r)
	# The load-bearing back-compat number: the HAND's shoulder-net rest must be the
	# old single-box rig's (0, -0.28, -0.36) — gun/muzzle/set_hand_pose math holds.
	var net_rest: Vector3 = p.elbow_r.position + p.hand.position
	_check("net gun-hand rest is the old (0,-0.28,-0.36) exactly (%.3f,%.3f,%.3f)" %
		[net_rest.x, net_rest.y, net_rest.z],
		net_rest.is_equal_approx(Vector3(0.0, -0.28, -0.36)))
	_check("_gun_rest matches the hand's elbow-local rest", p._gun_rest.is_equal_approx(p.hand.position))

	# === 2. THE ALIAS LAW: the old shoulder pivot still swings the WHOLE arm =====
	var hand_before: Vector3 = p.hand.global_position
	p.shoulder.rotation.x = -0.8
	await get_tree().process_frame
	var hand_moved: float = p.hand.global_position.distance_to(hand_before)
	_check("pitching the OLD shoulder name carries hand+forearm with it (moved %.2fm)" % hand_moved,
		hand_moved > 0.15)
	p.shoulder.rotation.x = 0.0

	# === 3. FOLLOW-THROUGH: knees/elbows ride the stride off the MOTION rows =====
	var mg: Dictionary = ProtoPuppet.MOTION["gait"]
	_check("the follow-through knobs are ROWS (knee_follow/knee_phase/knee_rest/crouch_knee/elbow_follow/elbow_rest)",
		mg.has("knee_follow") and mg.has("knee_phase") and mg.has("knee_rest")
		and mg.has("crouch_knee") and mg.has("elbow_follow") and mg.has("elbow_rest"))
	var kr: float = float(mg["knee_rest"])
	_check("knee_rest > 0 (knees never lock straight — the robotic-look AND coplanar-face guard)", kr > 0.0)
	var knee_min := 99.0
	var knee_max := -99.0
	var elbow_l_min := 99.0
	var elbow_l_max := -99.0
	for _i in 120:
		p.animate(1.0 / 60.0, 5.0, 0.0, false, 0.0, false)
		knee_min = minf(knee_min, p.knee_l.rotation.x)
		knee_max = maxf(knee_max, p.knee_l.rotation.x)
		elbow_l_min = minf(elbow_l_min, p.elbow_l.rotation.x)
		elbow_l_max = maxf(elbow_l_max, p.elbow_l.rotation.x)
	_check("striding BENDS the knee past rest (max %.2f rad)" % knee_max, knee_max > kr + 0.05)
	_check("the knee is a one-way hinge (min %.3f never below zero)" % knee_min, knee_min >= -0.001)
	_check("the free elbow bends INTO the swing (min %.2f rad)" % elbow_l_min, elbow_l_min < -0.2)
	_check("the free elbow never hyperextends (max %.3f <= 0)" % elbow_l_max, elbow_l_max <= 0.001)

	# === 4. A RAISED GUN aims down a STRAIGHT arm (elbow ~0) ======================
	p.set_armed(true)
	p.raised = true
	for _i in 60:
		p.animate(1.0 / 60.0, 0.0, 0.0, true, 0.0, false)
	# Holding a raised gun now BENDS the elbow so the forearm is horizontal (the
	# 2026-07-08 "forearm should be horizontal" fix — the old law wanted it straight).
	_check("holding a raised gun bends the elbow for a horizontal forearm (%.3f rad ~= %.2f)" % [p.elbow_r.rotation.x, ProtoPuppet.AIM_ELBOW],
		absf(p.elbow_r.rotation.x - ProtoPuppet.AIM_ELBOW) < 0.06)
	p.set_armed(false)

	# === 5. CROUCH COILS the knees (the low silhouette) ===========================
	var crouch_knee: float = float(mg["crouch_knee"])
	p.crouch_target = 1.0
	for _i in 120:
		p.animate(1.0 / 60.0, 0.0, 0.0, false, 0.0, false)
	_check("full crouch coils the knee by ~crouch_knee (%.2f rad, row says %.2f)" %
		[p.knee_l.rotation.x, kr + crouch_knee],
		p.knee_l.rotation.x > kr + crouch_knee * 0.8)
	p.crouch_target = 0.0
	for _i in 90:
		p.animate(1.0 / 60.0, 0.0, 0.0, false, 0.0, false)

	# === 6. THE TWO-HAND FORE-GRIP (the shotgun fix) ==============================
	var shotgun_pose: Dictionary = ProtoWeapon.WEAPONS["shotgun"]["hand_pose"]
	p.set_hand_pose(shotgun_pose["offset"], bool(shotgun_pose["two_handed"]))
	p.set_armed(true)
	p.raised = true
	_check("two_handed pulls the free-arm SHOULDER across toward the gun side (x=%.2f)" % p.free_arm.position.x,
		is_equal_approx(p.free_arm.position.x, 0.12))
	for _i in 90:
		p.animate(1.0 / 60.0, 0.0, 0.0, true, 0.0, false)
	_check("the free arm RAISES onto the fore-grip (%.2f rad, wants ~-1.22)" % p.free_arm.rotation.x,
		p.free_arm.rotation.x < -1.0)
	_check("the free elbow CLOSES the hold (%.2f rad, wants ~-0.42)" % p.elbow_l.rotation.x,
		absf(p.elbow_l.rotation.x - (-0.42)) < 0.12)
	var pistol_pose: Dictionary = ProtoWeapon.WEAPONS["pistol"]["hand_pose"]
	p.set_hand_pose(pistol_pose["offset"], bool(pistol_pose["two_handed"]))
	_check("a one-hand row returns the free arm home (x=%.2f)" % p.free_arm.position.x,
		is_equal_approx(p.free_arm.position.x, -0.29))
	p.set_armed(false)

	# === 7. THE DEAD SPRAWL bends real knees and elbows now =======================
	for _i in 150:
		p.animate(1.0 / 60.0, 0.0, 0.0, false, 0.0, true)
	_check("dead pose bends the left knee (%.2f rad, wants ~0.8)" % p.knee_l.rotation.x,
		p.knee_l.rotation.x > 0.5)
	_check("dead pose bends the knees ASYMMETRICALLY (a sprawl, not a plank: r %.2f != l %.2f)" %
		[p.knee_r.rotation.x, p.knee_l.rotation.x],
		absf(p.knee_r.rotation.x - p.knee_l.rotation.x) > 0.2)
	_check("dead pose bends both elbows (l %.2f, r %.2f)" % [p.elbow_l.rotation.x, p.elbow_r.rotation.x],
		p.elbow_l.rotation.x < -0.3 and p.elbow_r.rotation.x < -0.2)

	# === 8. NO-KISS: cross-sections STEP DOWN segment to segment ==================
	var thigh_box := p.hip_l.get_child(0) as MeshInstance3D
	var calf_box := p.knee_l.get_child(0) as MeshInstance3D
	var thigh_size: Vector3 = (thigh_box.mesh as BoxMesh).size
	var calf_size: Vector3 = (calf_box.mesh as BoxMesh).size
	_check("the calf cross-section steps DOWN from the thigh (%.2fx%.2f < %.2fx%.2f)" %
		[calf_size.x, calf_size.z, thigh_size.x, thigh_size.z],
		calf_size.x < thigh_size.x and calf_size.z < thigh_size.z)
	var fore_box := p.elbow_r.get_child(0) as MeshInstance3D
	var upper_box := p.shoulder.get_child(0) as MeshInstance3D
	_check("the forearm steps down from the upper arm",
		(fore_box.mesh as BoxMesh).size.x < (upper_box.mesh as BoxMesh).size.x)

	# === 9. STRIKE ROWS drive the NEW hinges (JOINT_AXIS grew to 9) ===============
	_check("ProtoStrikePlayer.JOINT_NAMES carries all 9", ProtoStrikePlayer.JOINT_NAMES.size() == 9)
	_check("the four new hinges are authorable joints",
		ProtoStrikePlayer.JOINT_AXIS.has("elbow_r") and ProtoStrikePlayer.JOINT_AXIS.has("elbow_l")
		and ProtoStrikePlayer.JOINT_AXIS.has("knee_r") and ProtoStrikePlayer.JOINT_AXIS.has("knee_l"))
	var p2 := ProtoPuppet.create({})
	add_child(p2)
	var sp := ProtoStrikePlayer.new()
	add_child(sp)
	ProtoStrikePlayer.STRIKES["__rig_v2_test__"] = {
		"poses": [
			{"name": "contact", "joints": {"elbow_r": -0.9, "knee_l": 0.7}, "ease_ms": 40.0, "hold_ms": 20.0, "ease_curve": "out", "contact": true},
			{"name": "recovery", "joints": {"elbow_r": 0.0, "knee_l": 0.0}, "ease_ms": 60.0, "hold_ms": 0.0, "ease_curve": "in_out", "contact": false},
		],
		"req_skill": {"id": "", "level": 0}, "cancel_window_ms": 0.0, "chain_next": "",
	}
	sp.setup({"elbow_r": p2.elbow_r, "knee_l": p2.knee_l}, Callable())
	var contact_state := {"elbow": 99.0, "knee": 99.0}
	sp.contact.connect(func() -> void:
		contact_state["elbow"] = p2.elbow_r.rotation.x
		contact_state["knee"] = p2.knee_l.rotation.x)
	var started := sp.play("__rig_v2_test__")
	_check("a strike row naming NEW joints plays", started)
	for _i in 60:
		sp._process(1.0 / 60.0)
		if not sp.is_playing():
			break
	_check("the strike's contact pose LANDED on the new hinges (elbow %.2f, knee %.2f)" %
		[float(contact_state["elbow"]), float(contact_state["knee"])],
		is_equal_approx(float(contact_state["elbow"]), -0.9)
		and is_equal_approx(float(contact_state["knee"]), 0.7))
	ProtoStrikePlayer.STRIKES.erase("__rig_v2_test__")

	# === 10. THE MOTION STAGE authors joints 1-9 now (real key presses) ===========
	var packed: PackedScene = load(STAGE_SCENE)
	stage = packed.instantiate()
	add_child(stage)
	await get_tree().process_frame
	await get_tree().process_frame
	_check("stage AUTHOR_JOINTS grew to 9", stage.AUTHOR_JOINTS.size() == 9)
	var jm: Dictionary = stage._author_joint_map()
	var map_ok := true
	for jn in ["elbow_r", "elbow_l", "knee_r", "knee_l"]:
		if not (jm.get(jn, null) is Node3D):
			map_ok = false
	_check("the stage's joint map resolves all four new hinges to REAL puppet nodes", map_ok)
	_press(KEY_TAB)
	await get_tree().process_frame
	_check("TAB entered author mode", stage._author_mode)
	# Work on the blank custom row (strike_author_sim's discipline): capture stays
	# in memory — ENTER is never pressed, so strikes.json is never touched here.
	var target_idx: int = stage.AUTHOR_ROW_IDS.find("new_custom_1")
	var steps: int = wrapi(target_idx - stage._author_row_idx, 0, stage.AUTHOR_ROW_IDS.size())
	for _i in steps:
		_press(KEY_G)
	await get_tree().process_frame
	_press(KEY_6)
	await get_tree().process_frame
	_check("KEY_6 selects elbow_r", stage._author_selected_joint == 5 and String(stage.AUTHOR_JOINTS[5]) == "elbow_r")
	_press(KEY_9)
	await get_tree().process_frame
	_check("KEY_9 selects knee_l", stage._author_selected_joint == 8 and String(stage.AUTHOR_JOINTS[8]) == "knee_l")
	for _i in 3:
		_press(KEY_E) # +0.05 each
	await get_tree().process_frame
	await get_tree().process_frame
	_check("nudging joint 9 drives the REAL left knee (%.2f rad, wants ~0.15)" % stage.puppet.knee_l.rotation.x,
		absf(stage.puppet.knee_l.rotation.x - 0.15) < 0.01)
	_press(KEY_C)
	await get_tree().process_frame
	var captured: Dictionary = {}
	if not stage._author_poses.is_empty():
		captured = (stage._author_poses[-1] as Dictionary).get("joints", {})
	_check("the captured pose carries the new joint's value (knee_l %.2f)" % float(captured.get("knee_l", 0.0)),
		absf(float(captured.get("knee_l", 0.0)) - 0.15) < 0.01)
	_press(KEY_TAB)
	await get_tree().process_frame
	_check("TAB exits author mode clean", not stage._author_mode)

	# === THE AIM ARM (owner 2026-07-08: "the forearm should be HORIZONTAL, in ====
	# line with the gun — and add a rectangle for the hand"): a raised gun bends
	# the elbow forward and counter-rotates the hand, so the forearm extends
	# horizontally and the barrel stays level, with a fist mesh gripping it.
	var ag := ProtoPuppet.create({})
	add_child(ag)
	var pistol_pose2: Dictionary = ProtoWeapon.WEAPONS["pistol"]["hand_pose"]
	ag.set_hand_pose(pistol_pose2["offset"], bool(pistol_pose2["two_handed"]))
	ag.set_armed(true)
	ag.raised = true
	for _i in 90:
		ag.animate(1.0 / 60.0, 0.0, 0.0, true, 0.0, false)
	await get_tree().process_frame
	_check("aiming bends the elbow to the horizontal-forearm angle (%.2f ~= %.2f)" %
		[ag.elbow_r.rotation.x, ProtoPuppet.AIM_ELBOW], absf(ag.elbow_r.rotation.x - ProtoPuppet.AIM_ELBOW) < 0.2)
	_check("the hand COUNTERS so the gun stays level (hand.x %.2f ~= -%.2f)" %
		[ag.hand.rotation.x, ProtoPuppet.AIM_ELBOW], absf(ag.hand.rotation.x + ProtoPuppet.AIM_ELBOW) < 0.2)
	var elbow_z: float = (ag.elbow_r as Node3D).global_position.z
	var hand_z: float = (ag.hand as Node3D).global_position.z
	_check("the arm EXTENDS forward — hand ahead of the elbow (%.2f < %.2f)" % [hand_z, elbow_z],
		hand_z < elbow_z - 0.05)
	var gun_y: float = (ag.gun as Node3D).global_position.y
	var muzzle_y: float = ag.muzzle_world().y
	_check("the barrel holds LEVEL (muzzle %.2f ~= grip %.2f)" % [muzzle_y, gun_y], absf(muzzle_y - gun_y) < 0.15)
	var fist := 0
	for c in ag.hand.get_children():
		if c is MeshInstance3D:
			fist += 1
	_check("a FIST mesh grips the gun (a rectangle, not a bare pivot)", fist >= 1)
	ag.queue_free()

	# === THE DOORKNOB FIX (owner 2026-07-08: "it turns like a doorknob, not a =====
	# torso"): a fresh rig fed a steady body turn TWISTS THE CHEST into it (spine
	# lead) while the hips are left to the caller's leg-tracker — shoulder-hip
	# separation, not a rigid column spun flat about its vertical center.
	var dk := ProtoPuppet.create({})
	add_child(dk)
	for _i in 40:
		dk.animate(1.0 / 60.0, 2.0, 1.0, false, 0.0, false) # turning one way (+turn_rate)
	var dk_twist := dk.torso.rotation.y
	_check("a turn twists the CHEST into it (torso.y=%.2f rad, not a rigid doorknob)" % dk_twist,
		absf(dk_twist) > 0.1)
	_check("...animate leaves the HIPS to the leg-tracker (legs_pivot.y=%.3f)" % dk.legs_pivot.rotation.y,
		is_equal_approx(dk.legs_pivot.rotation.y, 0.0))
	_check("...the head stays truer to aim than the leading chest (|neck.y|=%.2f < |torso.y|=%.2f)" %
		[absf(dk.neck.rotation.y), absf(dk_twist)],
		absf(dk.neck.rotation.y) < absf(dk_twist) and absf(dk.neck.rotation.y) > 0.0)
	for _i in 80:
		dk.animate(1.0 / 60.0, 2.0, -1.0, false, 0.0, false) # reverse the turn
	_check("the twist REVERSES with the turn (%.2f -> %.2f)" % [dk_twist, dk.torso.rotation.y],
		signf(dk.torso.rotation.y) != signf(dk_twist))
	dk.queue_free()

	print("RIG_V2 RESULTS: %d passed, %d failed" % [passed, failed])
	_finish(0 if failed == 0 else 1)


func _finish(code: int) -> void:
	if _done:
		return
	_done = true
	Engine.time_scale = _prev_time_scale
	print("RIG_V2: %s" % ("ALL CHECKS PASSED" if failed == 0 and code == 0 else "FAILURES PRESENT"))
	get_tree().quit(code)
