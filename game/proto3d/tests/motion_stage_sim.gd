## Proof for THE MOTION STAGE's LIVE AUTO-REFOLD (owner ask 2026-07-07: move a
## MotionForge slider, the stage should update WITHOUT pressing F10/R). Loads
## the real stage scene headless, backs up the REAL data/motions.json (never
## assumes its contents — another agent may have live rows in it already),
## writes a modified copy, and asserts the folded MOTION value changes within
## ~1.5s purely off the stage's internal poll (no manual re-fold call). Then
## proves the restore round-trips the same way. The ORIGINAL FILE IS ALWAYS
## PUT BACK — on pass, on fail, and on the watchdog — every exit funnels
## through one restore-then-quit function (GDScript has no try/finally, so
## this is the closest equivalent).
## Run: godot --headless --path game res://proto3d/tests/motion_stage_sim.tscn
extends Node

const MOTIONS_PATH: String = "res://data/motions.json"
const STAGE_SCENE: String = "res://proto3d/tools/motion_stage.tscn"
const POLL_BUDGET_S: float = 1.5 ## the owner's "within ~1.5s" contract

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
	print("MOTION_STAGE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("MOTION_STAGE: start")
	_prev_time_scale = Engine.time_scale
	# WATCHDOG: no matter what hangs, the original file gets put back.
	get_tree().create_timer(30.0, true, false, true).timeout.connect(func() -> void:
		if not _done:
			print("MOTION_STAGE: WATCHDOG")
			_check("WATCHDOG did not fire", false)
			_finish(1))

	# --- Back up the REAL file (whatever it currently holds) -------------------
	_had_original_file = FileAccess.file_exists(MOTIONS_PATH)
	if _had_original_file:
		var rf := FileAccess.open(MOTIONS_PATH, FileAccess.READ)
		_original_bytes = rf.get_buffer(rf.get_length())
		rf.close()
	print("MOTION_STAGE: backed up %d bytes of the real motions.json" % _original_bytes.size())

	# --- Load the REAL stage scene (headless — inputs, never teleports; the
	# only staging exception here is the aim/heading fields the stage itself
	# already exposes as sim hooks, same convention as aim_override elsewhere) --
	var packed: PackedScene = load(STAGE_SCENE)
	stage = packed.instantiate()
	add_child(stage)
	await get_tree().process_frame
	await get_tree().process_frame
	_check("stage loaded both rigs", stage.puppet != null and stage.quad != null)
	_check("stage set its baseline mtime on _ready()", stage._last_mtime != 0)

	# --- 1. Baseline: read the CURRENT folded value (whatever the real file
	# left it at) so the "changed" assertion is relative, not a hardcoded guess -
	var before: float = float(ProtoPuppet.MOTION["melee"]["windup_s"])
	var new_windup: float = before + 0.37 if before < 5.0 else before - 0.37 # guaranteed distinct
	print("MOTION_STAGE: baseline windup_s = %.4f, will write %.4f" % [before, new_windup])

	# --- 2. Write a MODIFIED copy — same schema as the real file, one param
	# changed, so the fold law (data overlays stock, unknown keys survive) is
	# exercised on the real path, not a synthetic one --------------------------
	var fixture: Dictionary = {
		"_comment": "motion_stage_sim TEMP fixture — restored automatically",
		"rigs": {"puppet": {"melee": {"windup_s": new_windup}}},
	}
	var fixture_bytes: PackedByteArray = JSON.stringify(fixture).to_utf8_buffer()
	var wrote_fixture := await _write_bytes_ensuring_mtime_advances(fixture_bytes)
	_check("the fixture write actually changed the file's mtime", wrote_fixture)

	# --- 3. Wait for the STAGE's own poll to pick it up — NO manual re-fold call
	# from the sim (that would just prove KEY_R works, which motion_sim already
	# covers; this proves the LIVE, buttonless path the owner asked for) -------
	var landed := await _wait_for_windup(new_windup, POLL_BUDGET_S)
	_check("the LIVE poll folded the change within %.1fs WITHOUT F10/R (%.4f -> %.4f)" %
		[POLL_BUDGET_S, before, float(ProtoPuppet.MOTION["melee"]["windup_s"])], landed)
	_check("the toast fired on that refold", stage._toast_label.text.findn("MOTIONS RELOADED") >= 0)

	# --- 4. RESTORE the original file, then prove the fold reverses too — same
	# live-poll path, still no F10/R. The mtime-advance guard matters HERE just
	# as much as step 2: without it, a restore that lands in the SAME coarse
	# mtime bucket as the fixture write silently never re-polls as changed. ----
	var wrote_restore := await _write_bytes_ensuring_mtime_advances(_original_bytes if _had_original_file else PackedByteArray())
	_check("the restore write actually changed the file's mtime", wrote_restore)
	if not _had_original_file and FileAccess.file_exists(MOTIONS_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(MOTIONS_PATH))
	var restored := await _wait_for_windup(before, POLL_BUDGET_S)
	_check("the LIVE poll folded the RESTORE back within %.1fs (-> %.4f)" %
		[POLL_BUDGET_S, float(ProtoPuppet.MOTION["melee"]["windup_s"])], restored)

	# --- 5. A quick pass over the other owner-asked features, read-only against
	# the real APIs (no invented behavior) -------------------------------------
	_check("ITEM_IDS['pistol'] is a REAL row with the REAL (one-handed) hand_pose",
		ProtoWeapon.WEAPONS["pistol"]["hand_pose"]["two_handed"] == false)
	stage._set_item(1) # pistol by ITEM_IDS order
	_check("equipping a GUN raises the arm (twin-stick aim read — same law as proto3d.gd)",
		stage.puppet.raised == true)
	stage._set_item(2) # shotgun (two-handed gun row)
	_check("the shotgun's REAL two_handed flag pulls the free arm to the fore-grip",
		not is_equal_approx(stage.puppet.free_arm.position.x, -0.29))
	_check("a gun still raises (shotgun is not melee)", stage.puppet.raised == true)
	stage._set_item(4) # machete (melee)
	_check("equipping a MELEE row carries LOW (raised == false, same law as proto3d.gd)",
		stage.puppet.raised == false)

	# Move-vs-look: strafe the treadmill heading while pinning the aim well off
	# to the side, and confirm the body yaws toward the WASD heading while the
	# arm math runs without collapsing the two together.
	stage.set_aim_override_world(stage.puppet.global_position + Vector3(5, 1.0, 0))
	stage._move_heading = Vector3(1, 0, 0) # strafe right
	var yaw_before: float = stage.puppet.rotation.y
	for _i in 30:
		stage._animate_puppet(1.0 / 60.0)
	_check("the puppet's BODY yawed toward the strafe heading (move-heading is live)",
		not is_equal_approx(stage.puppet.rotation.y, yaw_before))
	stage.clear_aim_override()
	stage._move_heading = Vector3.ZERO

	print("MOTION_STAGE RESULTS: %d passed, %d failed" % [passed, failed])
	_finish(0 if failed == 0 else 1)


## Poll ProtoPuppet.MOTION for the target value, driven by REAL frames (so the
## stage's own _process() actually runs its poll) — never a fold call from us.
func _wait_for_windup(target: float, budget_s: float) -> bool:
	var t := 0.0
	var step := 0.1
	while t < budget_s:
		await get_tree().create_timer(step, true, false, true).timeout
		t += step
		if is_equal_approx(float(ProtoPuppet.MOTION["melee"]["windup_s"]), target):
			return true
	return is_equal_approx(float(ProtoPuppet.MOTION["melee"]["windup_s"]), target)


func _restore_original_file() -> void:
	if _had_original_file:
		var wf := FileAccess.open(MOTIONS_PATH, FileAccess.WRITE)
		wf.store_buffer(_original_bytes)
		wf.close()
	else:
		# The real file didn't exist before this sim ran — leave it gone again.
		if FileAccess.file_exists(MOTIONS_PATH):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(MOTIONS_PATH))


## Write bytes to MOTIONS_PATH and CONFIRM the stage's own change-detector
## (mtime OR content signature — the exact dual check _poll_motions_file()
## runs) will see this as a change from its CURRENTLY-known state. Some
## filesystems coalesce two close writes into the same reported mtime, so
## mtime alone can silently swallow a real edit; comparing content too closes
## that gap on both sides (this helper AND the stage's poll use the same law,
## so "did the write register" and "will the poll see it" are the same test).
## Nudges with a short real-time grace loop if neither signal moved yet.
func _write_bytes_ensuring_mtime_advances(bytes: PackedByteArray) -> bool:
	var known_mtime: int = stage._last_mtime
	var known_sig: int = stage._last_sig
	var grace := 0.0
	while grace < 2.5:
		var wf := FileAccess.open(MOTIONS_PATH, FileAccess.WRITE)
		wf.store_buffer(bytes)
		wf.close()
		var write_mtime := FileAccess.get_modified_time(MOTIONS_PATH)
		var write_sig: int = stage._motions_file_sig()
		if write_mtime != known_mtime or write_sig != known_sig:
			return true
		await get_tree().create_timer(0.25, true, false, true).timeout
		grace += 0.25
	return FileAccess.get_modified_time(MOTIONS_PATH) != known_mtime or stage._motions_file_sig() != known_sig


## THE ONE EXIT DOOR: every path (pass, fail, watchdog) funnels here so the
## real motions.json is restored exactly once and time_scale is put back.
func _finish(code: int) -> void:
	if _done:
		return
	_done = true
	_restore_original_file()
	Engine.time_scale = _prev_time_scale
	print("MOTION_STAGE: %s" % ("ALL CHECKS PASSED" if failed == 0 and code == 0 else "FAILURES PRESENT"))
	get_tree().quit(code)
