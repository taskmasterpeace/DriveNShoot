## Proof for STRIKE POSE AUTHORING (docs/design/POSE_TO_POSE_STRIKES.md, §Authoring
## Flow) inside the REAL motion stage (motion_stage.gd's TAB author mode) — never a
## mock rig or a synthetic input path. Drives real InputEventKey presses through the
## stage's own _input() exactly as a keyboard would, then asserts on the puppet's
## real joints and the file strikes.json actually holds after SAVE.
##
## FILE SAFETY: backs up the REAL data/strikes.json (another agent's content may
## already be in it), works entirely against that file, and restores the ORIGINAL
## BYTES on every exit path — pass, fail, and the watchdog — mirroring
## motion_stage_sim.gd's one-exit-door discipline for motions.json.
## Run: godot --headless --path game res://proto3d/tests/strike_author_sim.tscn
extends Node

const STRIKES_PATH: String = "res://data/strikes.json"
const STAGE_SCENE: String = "res://proto3d/tools/motion_stage.tscn"

var passed := 0
var failed := 0
var _prev_time_scale: float = 1.0
var _original_bytes: PackedByteArray = PackedByteArray()
var _had_original_file: bool = false
var _done := false ## guards double-restore (watchdog racing the normal finish)
var stage: Node3D = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("STRIKE_AUTHOR: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Sends a REAL InputEventKey through the stage's own _input(), the same door a
## keyboard press arrives through — never a direct call to the private handler
## functions the stage exposes, so this sim proves the KEY MAP, not just the logic
## behind it.
func _press(key: int, shift: bool = false) -> void:
	var ev := InputEventKey.new()
	ev.keycode = key
	ev.pressed = true
	ev.shift_pressed = shift
	stage._input(ev)


func _ready() -> void:
	print("STRIKE_AUTHOR: start")
	_prev_time_scale = Engine.time_scale
	# WATCHDOG: no matter what hangs, the original file gets put back.
	get_tree().create_timer(30.0, true, false, true).timeout.connect(func() -> void:
		if not _done:
			print("STRIKE_AUTHOR: WATCHDOG")
			_check("WATCHDOG did not fire", false)
			_finish(1))

	# --- Back up the REAL file (whatever it currently holds) -------------------
	_had_original_file = FileAccess.file_exists(STRIKES_PATH)
	if _had_original_file:
		var rf := FileAccess.open(STRIKES_PATH, FileAccess.READ)
		_original_bytes = rf.get_buffer(rf.get_length())
		rf.close()
	print("STRIKE_AUTHOR: backed up %d bytes of the real strikes.json" % _original_bytes.size())

	# --- Load the REAL stage scene (headless — real input events, never teleports
	# internal state; the sim only reads back what the stage itself produced) ----
	var packed: PackedScene = load(STAGE_SCENE)
	stage = packed.instantiate()
	add_child(stage)
	await get_tree().process_frame
	await get_tree().process_frame
	_check("stage loaded (puppet + author strike player present)",
		stage.puppet != null and stage._author_player != null)

	# --- 1. TAB enters author mode; legend swaps ---------------------------------
	_check("author mode starts OFF", not stage._author_mode)
	_press(KEY_TAB)
	await get_tree().process_frame
	_check("TAB entered author mode", stage._author_mode)
	_check("legend text swapped to the author-mode legend",
		stage._legend_label.text.findn("STRIKE POSE AUTHORING") >= 0)

	# --- 2. Load a KNOWN-BLANK custom row so this sim never depends on (or
	# disturbs, pre-save) any of the six shipped rows' real tuning. G cycles
	# AUTHOR_ROW_IDS; walk forward to "new_custom_1". -----------------------------
	var target_idx: int = stage.AUTHOR_ROW_IDS.find("new_custom_1")
	_check("AUTHOR_ROW_IDS carries a blank custom slot", target_idx >= 0)
	var steps: int = wrapi(target_idx - stage._author_row_idx, 0, stage.AUTHOR_ROW_IDS.size())
	for _i in steps:
		_press(KEY_G)
	await get_tree().process_frame
	_check("cycled to 'new_custom_1'", stage._author_row_id == "new_custom_1")
	_check("a brand-new custom id imports BLANK (no phantom poses)", stage._author_poses.is_empty())

	# --- 3. JOINT POSING: select joint 3 (shoulder_yaw), nudge it, assert the
	# REAL puppet.shoulder node actually rotated on that axis. --------------------
	_press(KEY_3) # 1=torso_twist 2=torso_lean 3=shoulder_yaw 4=shoulder_pitch 5=hip_kick
	await get_tree().process_frame
	_check("joint 3 selected is shoulder_yaw", stage._author_selected_joint == 2 and stage.AUTHOR_JOINTS[2] == "shoulder_yaw")
	var yaw_before: float = stage.puppet.shoulder.rotation.y
	_press(KEY_E) # +0.05 rad
	await get_tree().process_frame
	var yaw_after_one: float = stage.puppet.shoulder.rotation.y
	_check("E nudged shoulder.rotation.y by ~+0.05rad on the REAL puppet joint",
		is_equal_approx(yaw_after_one - yaw_before, stage.JOINT_NUDGE_STEP) or absf((yaw_after_one - yaw_before) - stage.JOINT_NUDGE_STEP) < 0.001)
	_press(KEY_Q, true) # SHIFT+Q: -0.05*3 rad
	await get_tree().process_frame
	var yaw_after_shift: float = stage.puppet.shoulder.rotation.y
	var shift_delta: float = yaw_after_shift - yaw_after_one
	_check("SHIFT+Q nudged by -0.15rad (x3 the base step)",
		absf(shift_delta - (-stage.JOINT_NUDGE_STEP * stage.JOINT_NUDGE_SHIFT_MULT)) < 0.001)

	# --- Move to a clean, known joint VALUE set before capturing so the three
	# captured poses below are distinct and checkable: pick joint 1
	# (torso_twist) and drive it to a known small value the same way, too. ------
	_press(KEY_1)
	await get_tree().process_frame
	for _i in 2:
		_press(KEY_E)
	await get_tree().process_frame

	# --- 4. CAPTURE 3 poses, assert count + toast at each step -------------------
	_press(KEY_C)
	await get_tree().process_frame
	_check("capture 1/3: count is 1", stage._author_poses.size() == 1)
	_check("capture 1 toast reads POSE 1/... CAPTURED", stage._toast_label.text.findn("POSE 1/") >= 0 and stage._toast_label.text.findn("CAPTURED") >= 0)
	var pose1_snapshot: Dictionary = (stage._author_poses[0] as Dictionary)["joints"].duplicate()

	_press(KEY_2) # switch to torso_lean and nudge it before the 2nd capture, so
	await get_tree().process_frame # pose 2 is DISTINCT from pose 1, not an accidental duplicate.
	for _i in 4:
		_press(KEY_E)
	await get_tree().process_frame
	_press(KEY_C)
	await get_tree().process_frame
	_check("capture 2/3: count is 2", stage._author_poses.size() == 2)
	var pose2_snapshot: Dictionary = (stage._author_poses[1] as Dictionary)["joints"].duplicate()
	_check("pose 2's captured joints differ from pose 1's (distinct keyframes)",
		not _joints_equal(pose1_snapshot, pose2_snapshot))

	_press(KEY_5) # hip_kick, nudge, 3rd capture
	await get_tree().process_frame
	for _i in 3:
		_press(KEY_E)
	await get_tree().process_frame
	_press(KEY_C)
	await get_tree().process_frame
	_check("capture 3/3: count is 3", stage._author_poses.size() == 3)
	var pose3_snapshot: Dictionary = (stage._author_poses[2] as Dictionary)["joints"].duplicate()

	# --- 5. UNDO removes the last capture, count drops to 2 ----------------------
	_press(KEY_U)
	await get_tree().process_frame
	_check("U undid the 3rd capture (count back to 2)", stage._author_poses.size() == 2)
	# Re-capture the 3rd so the rest of the sim has 3 poses to work with again.
	_press(KEY_C)
	await get_tree().process_frame
	_check("re-captured pose 3 (count is 3 again)", stage._author_poses.size() == 3)

	# --- 6. CONTACT EXCLUSIVITY: mark pose 2 contact, then pose 3 — pose 2 must
	# clear. ,/. moves the SELECTED pose; select pose 2 (index 1) first. --------
	_press(KEY_COMMA) # selected_pose currently sits at 2 (last capture) -> step back to 1
	await get_tree().process_frame
	_check("selection moved to pose 2 (index 1)", stage._author_selected_pose == 1)
	_press(KEY_X)
	await get_tree().process_frame
	_check("pose 2 marked CONTACT", bool((stage._author_poses[1] as Dictionary).get("contact", false)))
	_press(KEY_PERIOD) # select pose 3 (index 2)
	await get_tree().process_frame
	_check("selection moved to pose 3 (index 2)", stage._author_selected_pose == 2)
	_press(KEY_X)
	await get_tree().process_frame
	_check("marking pose 3 CONTACT set it true", bool((stage._author_poses[2] as Dictionary).get("contact", false)))
	_check("marking pose 3 CONTACT CLEARED pose 2 (exclusivity enforced)",
		not bool((stage._author_poses[1] as Dictionary).get("contact", false)))
	var contact_total := 0
	for p in stage._author_poses:
		if bool((p as Dictionary).get("contact", false)):
			contact_total += 1
	_check("exactly one contact pose across the row", contact_total == 1)

	# --- 7. TIMING: adjust pose 3's (currently selected) ease_ms/hold_ms ---------
	var ease_before: float = float((stage._author_poses[2] as Dictionary)["ease_ms"])
	var hold_before: float = float((stage._author_poses[2] as Dictionary)["hold_ms"])
	_press(KEY_BRACKETRIGHT) # ease_ms +20
	_press(KEY_BRACKETRIGHT) # ease_ms +20 again
	_press(KEY_APOSTROPHE)   # hold_ms +20
	await get_tree().process_frame
	var ease_after: float = float((stage._author_poses[2] as Dictionary)["ease_ms"])
	var hold_after: float = float((stage._author_poses[2] as Dictionary)["hold_ms"])
	_check("[ ] adjusted ease_ms by +40 total (%.0f -> %.0f)" % [ease_before, ease_after],
		is_equal_approx(ease_after - ease_before, stage.TIMING_STEP_MS * 2.0))
	_check("; ' adjusted hold_ms by +20 (%.0f -> %.0f)" % [hold_before, hold_after],
		is_equal_approx(hold_after - hold_before, stage.TIMING_STEP_MS))
	_press(KEY_SEMICOLON) # hold_ms -20, back to baseline, also exercises the other direction
	await get_tree().process_frame
	_check("; brought hold_ms back down by 20", is_equal_approx(float((stage._author_poses[2] as Dictionary)["hold_ms"]), hold_before))

	# Snapshot the exact working poses BEFORE save, for the round-trip check below.
	var poses_before_save: Array = stage._author_poses.duplicate(true)

	# --- 8. SAVE: read-modify-write into the REAL strikes.json path, then verify
	# the row round-trips byte-for-byte in VALUE (re-parse the file fresh) -------
	_press(KEY_ENTER)
	await get_tree().process_frame
	_check("SAVED toast fired", stage._toast_label.text.findn("SAVED") >= 0)
	_check("strikes.json exists on disk after save", FileAccess.file_exists(STRIKES_PATH))

	var reparsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(STRIKES_PATH))
	_check("saved file re-parses as a Dictionary", reparsed is Dictionary)
	var reparsed_rows: Dictionary = (reparsed as Dictionary).get("strikes", {})
	_check("saved file's 'strikes' holds our new_custom_1 row", reparsed_rows.has("new_custom_1"))
	var saved_poses: Array = reparsed_rows.get("new_custom_1", {}).get("poses", [])
	_check("saved row has 3 poses", saved_poses.size() == 3)
	var round_trip_ok := true
	if saved_poses.size() == poses_before_save.size():
		for i in saved_poses.size():
			var want: Dictionary = poses_before_save[i]
			var got: Dictionary = saved_poses[i]
			if absf(float(got.get("ease_ms", -1.0)) - float(want.get("ease_ms", -2.0))) > 0.01:
				round_trip_ok = false
			if absf(float(got.get("hold_ms", -1.0)) - float(want.get("hold_ms", -2.0))) > 0.01:
				round_trip_ok = false
			if bool(got.get("contact", false)) != bool(want.get("contact", false)):
				round_trip_ok = false
			var want_joints: Dictionary = want.get("joints", {})
			var got_joints: Dictionary = got.get("joints", {})
			for jn in want_joints:
				if not got_joints.has(jn) or absf(float(got_joints[jn]) - float(want_joints[jn])) > 0.0001:
					round_trip_ok = false
	else:
		round_trip_ok = false
	_check("the saved row's poses/timing/contact/joints match what was captured (round-trip)", round_trip_ok)

	# --- 9. PREVIEW: SPACE plays the saved row through the REAL ProtoStrikePlayer;
	# assert `finished` actually fires (advance the stage's own _process, which
	# steps _author_player._process() while _author_previewing is true). --------
	var finished_state: Dictionary = {"fired": false}
	stage._author_player.finished.connect(func() -> void: finished_state["fired"] = true)
	_press(KEY_SPACE)
	await get_tree().process_frame
	_check("SPACE started the preview (is_playing)", stage._author_player.is_playing())
	var total_ms := 0.0
	for p in stage._author_poses:
		total_ms += float((p as Dictionary).get("ease_ms", 0.0)) + float((p as Dictionary).get("hold_ms", 0.0))
	var frames_needed: int = int(ceil((total_ms / 1000.0) / (1.0 / 60.0))) + 20 # generous margin
	for _i in frames_needed:
		if bool(finished_state["fired"]):
			break
		stage._process(1.0 / 60.0)
	_check("preview strike_player fired finished()", bool(finished_state["fired"]))
	_check("stage clears _author_previewing once finished", not stage._author_previewing)

	# --- 10. ESC exits author mode, restoring normal stage behavior --------------
	_press(KEY_ESCAPE)
	await get_tree().process_frame
	_check("ESC exited author mode", not stage._author_mode)
	# NOTE: the NORMAL legend's own last line ("TAB enter STRIKE POSE AUTHORING")
	# legitimately contains that phrase, so distinguishing the two modes keys on
	# the author-legend's EXCLUSIVE "editing '<row>'" line instead of a phrase
	# both legends share.
	_check("legend reverted to the normal-mode legend",
		stage._legend_label.text.findn("MOTION STAGE") >= 0 and stage._legend_label.text.findn("editing '") < 0)

	print("STRIKE_AUTHOR RESULTS: %d passed, %d failed" % [passed, failed])
	_finish(0 if failed == 0 else 1)


func _joints_equal(a: Dictionary, b: Dictionary) -> bool:
	if a.size() != b.size():
		return false
	for k in a:
		if not b.has(k) or absf(float(a[k]) - float(b[k])) > 0.0001:
			return false
	return true


func _restore_original_file() -> void:
	if _had_original_file:
		var wf := FileAccess.open(STRIKES_PATH, FileAccess.WRITE)
		wf.store_buffer(_original_bytes)
		wf.close()
	else:
		# The real file didn't exist before this sim ran — leave it gone again.
		if FileAccess.file_exists(STRIKES_PATH):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(STRIKES_PATH))
	# Un-fold so a re-parse next run (or the next sim in a batch) never sees this
	# sim's writes cached in the static STRIKES table.
	ProtoStrikePlayer._folded = false
	ProtoStrikePlayer.STRIKES.erase("__author_preview__")


## THE ONE EXIT DOOR: every path (pass, fail, watchdog) funnels here so the real
## strikes.json is restored exactly once and time_scale is put back.
func _finish(code: int) -> void:
	if _done:
		return
	_done = true
	_restore_original_file()
	Engine.time_scale = _prev_time_scale
	print("STRIKE_AUTHOR: %s" % ("ALL CHECKS PASSED" if failed == 0 and code == 0 else "FAILURES PRESENT"))
	get_tree().quit(code)
