## Proof for DRAG-TO-POSE (owner 2026-07-08: "build a little editor to drag stuff
## around and put it EXACTLY where it's supposed to be, then fine-tune"). In the
## motion stage's author mode, LEFT-DRAGGING a body part rotates its joint(s) live
## and feeds the SAME capture/save pipeline the keyboard author uses. Verifies:
##  - a LMB click grabs the authorable part nearest the cursor (screen-space pick)
##  - a vertical drag rotates that part's BEND axis by ~travel*DRAG_SENS
##  - the posed value is written onto the REAL rig the same frame (live)
##  - a two-axis part (torso) takes BOTH axes from one drag (↕ lean, ↔ twist)
##  - releasing ends the drag; C then captures the dragged pose into the row
## Run: godot --headless --path game res://proto3d/tests/pose_drag_sim.tscn
extends Node

const STAGE_SCENE: String = "res://proto3d/tools/motion_stage.tscn"

var passed := 0
var failed := 0
var _prev_time_scale: float = 1.0
var stage: Node3D = null


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("POSEDRAG: %s - %s" % ["PASS" if ok else "FAIL", n])


func _key(k: int) -> void:
	var ev := InputEventKey.new()
	ev.keycode = k
	ev.pressed = true
	stage._input(ev)


func _lmb(pos: Vector2, pressed: bool) -> void:
	var ev := InputEventMouseButton.new()
	ev.button_index = MOUSE_BUTTON_LEFT
	ev.pressed = pressed
	ev.position = pos
	stage._unhandled_input(ev)


func _drag(rel: Vector2) -> void:
	var ev := InputEventMouseMotion.new()
	ev.relative = rel
	stage._unhandled_input(ev)


func _ready() -> void:
	print("POSEDRAG: start")
	_prev_time_scale = Engine.time_scale
	get_tree().create_timer(30.0, true, false, true).timeout.connect(func() -> void:
		print("POSEDRAG: WATCHDOG"); _finish())
	await _run()


func _run() -> void:
	stage = (load(STAGE_SCENE) as PackedScene).instantiate()
	add_child(stage)
	for _f in 8:
		await get_tree().process_frame

	# Enter author mode with a REAL Tab key (the same door the player uses).
	_key(KEY_TAB)
	await get_tree().process_frame
	_check("author mode ON after TAB", stage._author_mode)

	# --- 1) Grab the RIGHT KNEE by clicking its on-screen position ----------------
	var knee: Node3D = stage.puppet.knee_r
	var screen: Vector2 = stage._cam.unproject_position(knee.global_position)
	_lmb(screen, true)
	_check("LMB grabbed a part", stage._drag_active)
	_check("grabbed the knee I clicked", stage._drag_node == knee)
	_check("knee maps to a bend (X) joint", stage._drag_x_joint == "knee_r")

	# --- 2) Vertical drag bends the knee by ~travel*DRAG_SENS --------------------
	var before: float = float(stage._author_joint_values.get("knee_r", 0.0))
	var travel := 100.0
	_drag(Vector2(0, travel))
	var after: float = float(stage._author_joint_values.get("knee_r", 0.0))
	var expect: float = before + travel * stage.DRAG_SENS
	_check("vertical drag rotated knee_r by travel*sens (Δ=%.3f want %.3f)" % [after - before, travel * stage.DRAG_SENS],
		absf(after - expect) < 0.001)

	# It lands on the REAL rig the same frame (author mode writes every _process).
	await get_tree().process_frame
	_check("the posed value is on the actual knee bone (%.3f)" % knee.rotation.x,
		absf(knee.rotation.x - after) < 0.02)

	_lmb(screen, false)
	_check("release ends the drag", not stage._drag_active)

	# --- 3) A two-axis part (TORSO) takes BOTH axes from one diagonal drag -------
	var torso: Node3D = stage.puppet.torso
	var tscreen: Vector2 = stage._cam.unproject_position(torso.global_position)
	_lmb(tscreen, true)
	_check("grabbed the torso (two-axis part)", stage._drag_node == torso and stage._drag_x_joint == "torso_lean" and stage._drag_y_joint == "torso_twist")
	var lean0: float = float(stage._author_joint_values.get("torso_lean", 0.0))
	var twist0: float = float(stage._author_joint_values.get("torso_twist", 0.0))
	_drag(Vector2(60, 40)) # ↔60 twist, ↕40 lean
	_check("↕ drag moved torso_lean", absf(float(stage._author_joint_values["torso_lean"]) - (lean0 + 40 * stage.DRAG_SENS)) < 0.001)
	_check("↔ drag moved torso_twist", absf(float(stage._author_joint_values["torso_twist"]) - (twist0 + 60 * stage.DRAG_SENS)) < 0.001)
	_lmb(tscreen, false)

	# --- 3b) FULL BODY: the parts that had NO joint before are now draggable ------
	# Each: click the part, drag, confirm the mapped joint moved. (owner: "trying to
	# manipulate the arms and the joints aren't all there" — now they are.)
	for tc in [
		{"node": stage.puppet.free_arm, "x": "free_shoulder_pitch", "y": "free_shoulder_yaw", "label": "LEFT shoulder"},
		{"node": stage.puppet.hand_l, "x": "wrist_l", "y": "", "label": "left wrist"},
		{"node": stage.puppet.foot_r, "x": "ankle_r", "y": "", "label": "right ankle"},
		{"node": stage.puppet.neck, "x": "head_pitch", "y": "head_yaw", "label": "head"},
		{"node": stage.puppet.hip_l, "x": "hip_l_pitch", "y": "", "label": "LEFT hip"},
	]:
		var node: Node3D = tc["node"]
		var sp: Vector2 = stage._cam.unproject_position(node.global_position)
		_lmb(sp, true)
		var grabbed: bool = stage._drag_active and stage._drag_node == node
		var xj: String = tc["x"]
		var b: float = float(stage._author_joint_values.get(xj, 0.0))
		_drag(Vector2(0, 50))
		var moved: bool = absf(float(stage._author_joint_values.get(xj, 0.0)) - (b + 50 * stage.DRAG_SENS)) < 0.001
		_lmb(sp, false)
		_check("%s is draggable now (grab + bend %s)" % [tc["label"], xj], grabbed and moved)

	# --- 4) The dragged pose feeds the EXISTING capture/save pipeline ------------
	var poses_before: int = stage._author_poses.size()
	_key(KEY_C) # capture
	await get_tree().process_frame
	_check("C captures the dragged pose into the row", stage._author_poses.size() == poses_before + 1)
	var cap: Dictionary = stage._author_poses.back()
	var joints: Dictionary = cap.get("joints", {})
	_check("captured pose carries the dragged knee value", absf(float(joints.get("knee_r", 0.0)) - after) < 0.001)

	_finish()


func _finish() -> void:
	Engine.time_scale = _prev_time_scale
	print("POSEDRAG RESULTS: %d passed, %d failed" % [passed, failed])
	print("POSEDRAG: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES"))
	get_tree().quit(1 if failed > 0 else 0)
