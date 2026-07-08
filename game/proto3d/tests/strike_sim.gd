## Proof for POSE-TO-POSE STRIKES (docs/design/POSE_TO_POSE_STRIKES.md), Sim Hooks §.
## Drives the REAL ProtoStrikePlayer against REAL ProtoPuppet joints (no mock rig —
## a puppet built off its own public create() path, so the sim proves strikes.json's
## joint names against the actual rig, not an invented stand-in). Never teleports
## state: every assertion advances the player one manual delta at a time, the same
## clock the game will drive it with (no Tween anywhere in this system, by design —
## see strike_player.gd's header — so "advance N frames" gives bit-identical timing
## whether run headless or in a real build).
## Run: godot --headless --path game res://proto3d/tests/strike_sim.tscn
extends Node

var passed := 0
var failed := 0
var _prior_time_scale: float = 1.0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("STRIKE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Advance the player exactly `frames` steps of `step` seconds each — the sim's one
## clock primitive, mirrored by every assertion below so results are reproducible.
func _advance(sp: ProtoStrikePlayer, frames: int, step: float = 1.0 / 60.0) -> void:
	for _i in frames:
		sp._process(step)


## Sums a strike row's poses' ease_ms+hold_ms — the expected total duration in ms,
## against which the ±20% envelope check is measured.
func _row_duration_ms(id: String) -> float:
	var row: Dictionary = ProtoStrikePlayer.STRIKES[id]
	var total := 0.0
	for pose_v in (row["poses"] as Array):
		var pose: Dictionary = pose_v
		total += float(pose.get("ease_ms", 0.0)) + float(pose.get("hold_ms", 0.0))
	return total


func _ready() -> void:
	print("STRIKE: start")
	_prior_time_scale = Engine.time_scale
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("STRIKE: WATCHDOG"); print("STRIKE: FAILURES PRESENT")
		Engine.time_scale = _prior_time_scale
		get_tree().quit(1))

	# --- 0. Build the REAL rig: an actual ProtoPuppet via its public create() path,
	# never a hand-rolled joint mock — this is the proof strikes.json's joint names
	# resolve against the rig the game actually ships. -------------------------
	var puppet := ProtoPuppet.create({})
	add_child(puppet)
	# The FULL mannequin joint set the game/editor inject (owner 2026-07-08): the
	# re-authored strikes reach the elbows/knees/off-shoulder, so the sim must hand
	# the player every joint a row can name — the proof it resolves against the real rig.
	var joints: Dictionary = {
		"torso_twist": puppet.torso, "torso_lean": puppet.torso,
		"shoulder_yaw": puppet.shoulder, "shoulder_pitch": puppet.shoulder,
		"hip_kick": puppet.hip_r,
		"elbow_r": puppet.elbow_r, "elbow_l": puppet.elbow_l,
		"knee_r": puppet.knee_r, "knee_l": puppet.knee_l,
		"head_yaw": puppet.neck, "head_pitch": puppet.neck,
		"free_shoulder_yaw": puppet.free_arm, "free_shoulder_pitch": puppet.free_arm,
		"wrist_r": puppet.hand, "wrist_l": puppet.hand_l,
		"ankle_r": puppet.foot_r, "ankle_l": puppet.foot_l, "hip_l_pitch": puppet.hip_l,
		"waist_twist": puppet.waist, "waist_lean": puppet.waist,
		"fingers_r": puppet.fingers_r, "fingers_l": puppet.fingers_l,
	}
	for jn in joints:
		_check("puppet exposes the '%s' joint" % jn, joints[jn] != null and is_instance_valid(joints[jn]))

	# --- (a) strikes.json FOLDS: 6 rows, each with exactly one contact pose, every
	# joint it names present in the injected dict. --------------------------------
	var ids: Array = ["punch_1", "punch_2", "punch_3", "kick", "shove", "weapon_swing"]
	_check("strikes.json/floor folds all 6 rows", ids.all(func(i): return ProtoStrikePlayer.STRIKES.has(i)))
	# ANIMATION_FIX_PACK D6: the code-FLOOR seed carried pre-mannequin INVERTED signs
	# (contact shoulder_pitch -1.45) while strikes.json was re-authored to the SIGN LAW
	# (+1.5). Re-seeded to match, so a missing/corrupt strikes.json can never play every
	# strike backwards. A punch's contact must extend the arm FORWARD (positive pitch).
	var p1c: Dictionary = (ProtoStrikePlayer.STRIKES["punch_1"]["poses"][1] as Dictionary)["joints"]
	_check("D6 sign parity: punch_1 contact extends FORWARD (shoulder_pitch %.2f > 0)" % float(p1c["shoulder_pitch"]),
		float(p1c["shoulder_pitch"]) > 0.0)
	for id in ids:
		var row: Dictionary = ProtoStrikePlayer.STRIKES[id]
		var poses: Array = row["poses"]
		var contact_count := 0
		var joints_ok := true
		for pose_v in poses:
			var pose: Dictionary = pose_v
			if bool(pose.get("contact", false)):
				contact_count += 1
			var pose_joints: Dictionary = pose.get("joints", {})
			for jn in pose_joints:
				if not joints.has(String(jn)):
					joints_ok = false
		_check("'%s' has exactly one contact pose (%d)" % [id, contact_count], contact_count == 1)
		_check("'%s' only names joints the rig exposes" % id, joints_ok)

	# --- Skill callable: a mutable "current level" the test flips between checks --
	var current_level := {"martial_arts": 0}
	var skill_check := func(sid: String) -> int:
		return int(current_level.get(sid, 0))

	# --- (b) play(punch_1) visits every pose IN ORDER (monotonic pose_reached) ----
	# NOTE: signal-connected lambdas below write into single-key Dictionaries/Arrays,
	# never bare int/bool locals — GDScript closures capture int/bool by VALUE, so a
	# lambda's `some_int += 1` would silently mutate its OWN private copy and never
	# reach this scope's variable (a real bug this sim's first draft hit and fixed;
	# Dictionary/Array are reference types, so mutating their CONTENTS from inside a
	# closure is visible out here).
	var sp := ProtoStrikePlayer.new()
	add_child(sp)
	sp.setup(joints, skill_check)
	var reached_order: Array = []
	sp.pose_reached.connect(func(i: int) -> void: reached_order.append(i))
	var contact_state: Dictionary = {"count": 0, "seen_at_reached_len": -1}
	sp.contact.connect(func() -> void:
		contact_state["count"] = int(contact_state["count"]) + 1
		contact_state["seen_at_reached_len"] = reached_order.size())
	var finished_state: Dictionary = {"fired": false}
	sp.finished.connect(func() -> void: finished_state["fired"] = true)

	_check("play(punch_1) starts", sp.play("punch_1"))
	var punch1_total_ms := _row_duration_ms("punch_1")
	var frames_needed := int(ceil((punch1_total_ms / 1000.0) / (1.0 / 60.0))) + 10 # generous margin past the row's own sum
	_advance(sp, frames_needed)

	_check("all 3 poses of punch_1 visited", reached_order.size() == 3)
	var monotonic := true
	for i in range(reached_order.size()):
		if reached_order[i] != i:
			monotonic = false
	_check("pose_reached indices are monotonic (%s)" % str(reached_order), monotonic)

	# --- (c) contact() fires exactly once, between the right pose_reached signals -
	# punch_1's contact pose is index 1 (the 2nd of 3) — contact must land AFTER
	# pose_reached(1) fired (2 entries logged) and BEFORE pose_reached(2) could have
	# appended a 3rd — i.e. exactly at reached_order.size()==2 when contact fired.
	_check("contact() fired exactly once", int(contact_state["count"]) == 1)
	_check("contact landed right at the contact pose (after pose 1, before pose 2)",
		int(contact_state["seen_at_reached_len"]) == 2)

	# --- finished() fires; joints land within epsilon of the final pose -----------
	_check("finished() fired", bool(finished_state["fired"]))
	var final_pose: Dictionary = (ProtoStrikePlayer.STRIKES["punch_1"]["poses"] as Array)[-1]
	var final_joints: Dictionary = final_pose["joints"]
	var joints_match := true
	for jn in final_joints:
		var node: Node3D = joints[String(jn)]
		var axis: String = ProtoStrikePlayer.JOINT_AXIS[String(jn)]
		var have: float = node.rotation.y if axis == "rotation:y" else node.rotation.x
		if not is_equal_approx(have, float(final_joints[jn])) and absf(have - float(final_joints[jn])) > 0.01:
			joints_match = false
	_check("joints land within epsilon of punch_1's final pose", joints_match)
	_check("player reports not-playing once finished", not sp.is_playing())

	# --- (e) total duration within ±20% of the row's summed ms at time_scale 1 ----
	# Re-run timed: count frames from play() to finished() at a fixed 1/60 step and
	# compare wall-ms against the row's authored sum.
	var sp2 := ProtoStrikePlayer.new()
	add_child(sp2)
	sp2.setup(joints, skill_check)
	var frames_elapsed := 0
	var sp2_finished_state: Dictionary = {"fired": false}
	sp2.finished.connect(func() -> void: sp2_finished_state["fired"] = true)
	current_level["martial_arts"] = 2 # unlock the kick row for this timing pass
	_check("play(kick) starts once unlocked", sp2.play("kick"))
	var step := 1.0 / 60.0
	var max_frames := 600 # 10s ceiling — well past any authored row, just a safety cap
	for _i in max_frames:
		if bool(sp2_finished_state["fired"]):
			break
		sp2._process(step)
		frames_elapsed += 1
	var measured_ms := frames_elapsed * step * 1000.0
	var kick_total_ms := _row_duration_ms("kick")
	var lo := kick_total_ms * 0.8
	var hi := kick_total_ms * 1.2
	_check("kick's played duration (%.1fms) is within +/-20%% of its row sum (%.1fms)" % [measured_ms, kick_total_ms],
		measured_ms >= lo and measured_ms <= hi)

	# --- (f) a lv2-gated kick refuses to play at level 1, plays at level 2 --------
	var sp3 := ProtoStrikePlayer.new()
	add_child(sp3)
	current_level["martial_arts"] = 1
	sp3.setup(joints, skill_check)
	_check("kick (req lv2) refuses at Martial Arts 1", not sp3.play("kick"))
	_check("can_play() agrees (false at lv1)", not sp3.can_play("kick"))
	current_level["martial_arts"] = 2
	_check("kick plays at Martial Arts 2", sp3.play("kick"))
	_check("can_play() agrees (true at lv2)", sp3.can_play("kick"))
	sp3.cancel() # don't let it run into the next block's shared joints

	# --- Regression: cancel() stops playback with no further signals -------------
	var sp4 := ProtoStrikePlayer.new()
	add_child(sp4)
	sp4.setup(joints, skill_check)
	var post_cancel_state: Dictionary = {"contact_fired": false}
	sp4.contact.connect(func() -> void: post_cancel_state["contact_fired"] = true)
	_check("play(shove) starts", sp4.play("shove"))
	_advance(sp4, 2) # a couple frames into the anticipation ease
	sp4.cancel()
	_check("cancel() stops is_playing()", not sp4.is_playing())
	_advance(sp4, 60) # a full second of frames the cancelled player must ignore
	_check("a cancelled strike never reaches contact", not bool(post_cancel_state["contact_fired"]))

	# --- weapon_swing: 4 poses (windup -> contact -> overswing -> settle) --------
	var swing_row: Dictionary = ProtoStrikePlayer.STRIKES["weapon_swing"]
	_check("weapon_swing authored with 4 poses", (swing_row["poses"] as Array).size() == 4)
	var sp5 := ProtoStrikePlayer.new()
	add_child(sp5)
	sp5.setup(joints, skill_check)
	var swing_reached: Array = []
	sp5.pose_reached.connect(func(i: int) -> void: swing_reached.append(i))
	_check("play(weapon_swing) starts", sp5.play("weapon_swing"))
	_advance(sp5, int(ceil((_row_duration_ms("weapon_swing") / 1000.0) / (1.0 / 60.0))) + 10)
	_check("weapon_swing visits all 4 poses in order", swing_reached == [0, 1, 2, 3])

	print("STRIKE RESULTS: %d passed, %d failed" % [passed, failed])
	print("STRIKE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	Engine.time_scale = _prior_time_scale
	get_tree().quit(0 if failed == 0 else 1)
