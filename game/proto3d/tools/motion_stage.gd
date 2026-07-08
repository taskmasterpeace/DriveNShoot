## THE MOTION STAGE (MOVESET.txt SPEC B + owner's 2026-07-07 preview ask): the
## treadmill IS the preview — MotionForge (:8896) stays just the knob panel.
## No world, no driving around to find an animal: both rigs stride in place.
##
## LIVE AUTO-REFOLD: polls data/motions.json's mtime (~0.5s) and re-folds rows
## through the SAME path F10/KEY_R already use (ProtoPuppet/ProtoQuadruped
## ensure_motions()) — a MotionForge slider move lands on the stage with no
## button press. A toast confirms every refold; KEY_R still forces one too.
##
## MOUSE AIM: the cursor raycasts to the stage floor and the puppet's aim arm
## tracks it continuously (arm_tracks_gaze() gate honored — melee/unarmed
## relax home exactly like the real game, so the preview reads TRUE).
## RIGHT-DRAG orbits a free stage camera around the puppet; WHEEL zooms.
##
## HELD-ITEM CYCLE (W): steps through real weapon ROWS (data the game itself
## uses — ProtoWeapon.WEAPONS) so the hand pose (offset/two-handed) is exactly
## what the game would render, never an invented pose.
##
## MOVE-VS-LOOK: WASD/arrows set a HEADING relative to the stage (forward /
## strafe-left / strafe-right / backpedal) while the mouse keeps aiming
## independently — so strafe-while-aiming poses (the owner's actual question:
## "how are his hands when he moves this way and looks that way with the
## shotgun") are visible together.
##
## Keys: 1/2/3 speed · C crouch · A airborne pose · D dig pose · R force re-fold
## (on top of the automatic poll) · M/P/K strike previews · W item cycle ·
## F recoil kick off the held row (SHIFT+F = strength 8 — watch muscle eat it) ·
## WASD/arrows move-heading · mouse aim · RMB-drag orbit · wheel zoom.
##
## STRIKE POSE AUTHORING (docs/design/POSE_TO_POSE_STRIKES.md, §Authoring Flow):
## TAB toggles AUTHOR MODE — a non-programmer poses the box man joint by joint,
## captures 3-4 keyframes into a strike row, times them, marks the ONE contact
## pose, and saves straight into data/strikes.json (read-modify-write, same
## fold convention as motions.json) — all without leaving the stage window.
## While in author mode the puppet's normal animate() call is SKIPPED entirely
## (legs/breathing pause too) and the 5 posable joints are driven directly from
## the author's live pose buffer instead — the simplest, most reliable
## ownership gate: a frozen mannequin you pose, not a moving target. G cycles
## which strike row is being edited (existing rows import their real saved
## poses first, never start blank); 1-9 select a joint (6-9 = the RIG V2
## elbows/knees); Q/E nudge it ±0.05rad
## (SHIFT = x3); C captures, U undoes; ,/. pick which captured pose is being
## edited; [/] and ;/' adjust that pose's ease_ms/hold_ms; X marks it the
## (exclusive) contact pose; ENTER saves; SPACE previews the working row
## through a real ProtoStrikePlayer; ESC exits back to normal stage behavior.
## Run: godot --path game res://proto3d/tools/motion_stage.tscn
extends Node3D

var puppet: ProtoPuppet
var quad: ProtoQuadruped
var speed: float = 3.0
var crouched: bool = false
var air: bool = false
var dig: bool = false
var _armed: bool = false
var _punch_beat: int = 0

# --- LIVE AUTO-REFOLD (poll data/motions.json's mtime; no F10 needed) ---------
const MOTIONS_PATH: String = "res://data/motions.json"
const POLL_INTERVAL: float = 0.5
var _poll_t: float = 0.0
var _last_mtime: int = 0
## Content signature (size + a cheap hash) alongside mtime: some filesystems
## coalesce two close writes into the SAME reported mtime, which would
## silently swallow a real edit. Triggering on mtime OR signature change means
## a real edit always trips the poll even when the clock doesn't move.
var _last_sig: int = 0

# --- On-screen UI (a self-contained CanvasLayer — this stage owns its own HUD,
# never hud_3d.gd) ------------------------------------------------------------
var _canvas: CanvasLayer
var _toast_label: Label
var _legend_label: Label
var _readout_label: Label
var _toast_tween: Tween

# --- MOUSE AIM + FREE ORBIT CAMERA --------------------------------------------
var _cam: Camera3D
var _orbit_yaw: float = -0.35
var _orbit_pitch: float = -0.42
var _orbit_dist: float = 5.2
const ORBIT_DIST_MIN: float = 2.0
const ORBIT_DIST_MAX: float = 14.0
const ORBIT_SENS: float = 0.008
const ORBIT_ZOOM_STEP: float = 0.5
var _orbit_target: Vector3 = Vector3(-1.2, 1.2, 0.0) # the puppet's chest, where the hands read
var _rmb_down: bool = false
var _aim_world: Vector3 = Vector3(-1.2, 1.0, -5.0) # world point the puppet aims at (floor raycast lands here)

# --- HELD-ITEM CYCLE: real weapon ROWS, never an invented one -----------------
const ITEM_IDS: Array[String] = ["fists", "pistol", "shotgun", "car_mg", "machete"]
const ITEM_LABELS: Dictionary = {
	"fists": "FISTS", "pistol": "PISTOL", "shotgun": "SHOTGUN",
	"car_mg": "RIFLE (Hood MG row)", "machete": "MACHETE",
}
var _item_idx: int = 0

# --- MOVE-VS-LOOK HEADING (independent of the mouse aim) ----------------------
## Body-relative heading the treadmill walks toward; the puppet's whole root
## yaws to it (so strafe reads as strafe, not just "faces move"). ZERO = idle.
var _move_heading: Vector3 = Vector3.ZERO
var _prev_puppet_yaw: float = 0.0
const HEADING_TURN_RATE_DEG: float = 320.0 ## how fast the BODY swings to face the WASD heading

# --- STRIKE POSE AUTHORING (docs/design/POSE_TO_POSE_STRIKES.md) -------------
const STRIKES_PATH: String = "res://data/strikes.json"
## The rows a non-programmer can dial through with G. The real, already-shipped
## rows come first (importing their true saved poses — never blank); trailing
## slots are reserved blank-start ids for brand-new strikes (spec: "shove had
## no procedural row before... it's the one row that legitimately starts
## blank" generalizes to any custom id past the shipped six).
const AUTHOR_ROW_IDS: Array[String] = [
	"punch_1", "punch_2", "punch_3", "kick", "shove", "weapon_swing",
	"new_custom_1", "new_custom_2", "new_custom_3",
]
const JOINT_NUDGE_STEP: float = 0.05     ## rad, per Q/E tap
const JOINT_NUDGE_SHIFT_MULT: float = 3.0
const TIMING_STEP_MS: float = 20.0       ## per [/]/;/' tap
## joint index (1-9) -> the exact name ProtoStrikePlayer.JOINT_AXIS/JOINT_NAMES use.
## RIG V2 (PUPPET_RIG_V2.md): the four new hinges are authorable — same order as
## ProtoStrikePlayer.JOINT_NAMES so the two lists never drift apart silently.
## FULL BODY (owner 2026-07-08): keys 1-9 still select the first nine; every joint
## past that is reachable by LEFT-DRAGGING the part (the drag pick finds it by
## screen position, no number key needed). Mirrors ProtoStrikePlayer.JOINT_NAMES.
const AUTHOR_JOINTS: Array[String] = ["torso_twist", "torso_lean", "shoulder_yaw", "shoulder_pitch", "hip_kick",
	"elbow_r", "elbow_l", "knee_r", "knee_l",
	"head_yaw", "head_pitch", "free_shoulder_yaw", "free_shoulder_pitch",
	"wrist_r", "wrist_l", "ankle_r", "ankle_l", "hip_l_pitch"]

var _author_mode: bool = false
var _author_row_id: String = "punch_1"
var _author_row_idx: int = 0
## Array[Dictionary] — each shaped exactly like a strikes.json pose entry
## ({"name","joints","ease_ms","hold_ms","ease_curve","contact"}) so SAVE never
## needs to reshape anything, only splice this array into the file's row.
var _author_poses: Array = []
## The LIVE posing buffer while freezing the puppet — torso_twist etc -> float,
## the values actually written onto the joints every author-mode frame.
var _author_joint_values: Dictionary = {}
var _author_selected_joint: int = 0   ## index into AUTHOR_JOINTS
var _author_selected_pose: int = -1   ## index into _author_poses (,/. moves it); -1 = none captured yet
## The ProtoStrikePlayer this stage owns for author-mode PREVIEW (SPACE) only —
## entirely separate from the puppet's real M/P/K preview keys, which keep
## working unchanged whether author mode is on or off.
var _author_player: ProtoStrikePlayer = null
var _author_previewing: bool = false

# --- DRAG-TO-POSE (owner 2026-07-08: "build a little editor to drag stuff around
# and put it EXACTLY where it's supposed to be, then fine-tune"). Author mode +
# LEFT-DRAG a body part to rotate its joint(s) live — writes the SAME
# _author_joint_values buffer the keyboard nudge does, so C-capture / ENTER-save
# are unchanged. Pick = nearest authorable part to the click (screen space);
# vertical drag works the X axis (bend/pitch/lean), horizontal the Y (twist/yaw).
const DRAG_SENS: float = 0.006      ## rad per pixel of mouse travel
const DRAG_PICK_PX: float = 140.0   ## click must land within this of a part to grab it
var _drag_active: bool = false
var _drag_node: Node3D = null
var _drag_x_joint: String = ""      ## the authorable joint on _drag_node that rotates about X ("" = none)
var _drag_y_joint: String = ""      ## …about Y


func _ready() -> void:
	# Floor, light — a stage, not a world.
	var floor_body := StaticBody3D.new()
	var fm := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(12, 12)
	fm.mesh = plane
	fm.material_override = ProtoWorldBuilder.material(Color(0.16, 0.14, 0.11), 1.0)
	floor_body.add_child(fm)
	add_child(floor_body)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55, 30, 0)
	add_child(sun)

	# Free orbit camera (stage-local — NOT ProtoCameraRig; that rig chases a
	# moving GTA2 target, this stage wants a hand-held orbit around one puppet).
	_cam = Camera3D.new()
	_cam.near = 0.05
	_cam.far = 200.0
	_cam.current = true
	add_child(_cam)
	_update_orbit_camera()

	puppet = ProtoPuppet.create({})
	add_child(puppet)
	puppet.position = Vector3(-1.2, 0, 0)
	quad = ProtoQuadruped.create({})
	add_child(quad)
	quad.position = Vector3(1.2, 0, 0)

	for pair in [[-1.2, "PUPPET"], [1.2, "QUADRUPED"]]:
		var l := Label3D.new()
		l.text = pair[1]
		l.font_size = 40
		l.position = Vector3(pair[0], 2.4, 0)
		l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		add_child(l)

	_build_ui()
	_last_mtime = FileAccess.get_modified_time(MOTIONS_PATH)
	_last_sig = _motions_file_sig()
	_set_item(0)

	_author_player = ProtoStrikePlayer.new()
	add_child(_author_player)
	_author_player.setup(_author_joint_map(), Callable())
	_author_player.finished.connect(_on_author_preview_finished)
	_load_author_row(_author_row_idx)

	print("MOTION STAGE — mouse aims · RMB-drag orbits · wheel zooms · WASD/arrows move-heading · W item cycle · M/P/K strikes · TAB strike-pose authoring · motions.json auto-refolds live.")


func _build_ui() -> void:
	_canvas = CanvasLayer.new()
	add_child(_canvas)

	_legend_label = Label.new()
	_legend_label.add_theme_font_size_override("font_size", 15)
	_legend_label.add_theme_color_override("font_color", Color(0.85, 0.85, 0.8))
	_legend_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	_legend_label.add_theme_constant_override("shadow_offset_x", 1)
	_legend_label.add_theme_constant_override("shadow_offset_y", 1)
	_legend_label.text = _legend_text()
	_legend_label.position = Vector2(14, 14)
	_canvas.add_child(_legend_label)

	_readout_label = Label.new()
	_readout_label.add_theme_font_size_override("font_size", 16)
	_readout_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.4))
	_readout_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	_readout_label.add_theme_constant_override("shadow_offset_x", 1)
	_readout_label.add_theme_constant_override("shadow_offset_y", 1)
	_readout_label.position = Vector2(14, 290)
	_canvas.add_child(_readout_label)

	_toast_label = Label.new()
	_toast_label.add_theme_font_size_override("font_size", 20)
	_toast_label.add_theme_color_override("font_color", Color(0.4, 1.0, 0.55))
	_toast_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	_toast_label.add_theme_constant_override("shadow_offset_x", 1)
	_toast_label.add_theme_constant_override("shadow_offset_y", 1)
	_toast_label.modulate.a = 0.0
	_toast_label.position = Vector2(14, 340)
	_canvas.add_child(_toast_label)


func _legend_text() -> String:
	if _author_mode:
		return _author_legend_text()
	return "MOTION STAGE\n" \
		+ "1/2/3  speed\nC  crouch · A  air pose · D  dig pose\n" \
		+ "M  swing · P  punch · K  kick\n" \
		+ "W  cycle held item · F  recoil kick (SHIFT+F = strength 8)\n" \
		+ "WASD / arrows  move-heading (mouse keeps aiming)\n" \
		+ "mouse  aim · RMB-drag  orbit camera · wheel  zoom\n" \
		+ "R  force re-fold (motions.json also auto-refolds live)\n" \
		+ "TAB  enter STRIKE POSE AUTHORING"


## STRIKE POSE AUTHORING legend — Q/E chosen over +/- (spec: "pick what feels
## obvious"): +/- shares a key with = on most boards and reads ambiguously
## against the SHIFT-x3 modifier, where SHIFT+Q/E is unambiguous.
func _author_legend_text() -> String:
	return "STRIKE POSE AUTHORING — editing '%s' (G cycles row)\n" % _author_row_id \
		+ "LEFT-DRAG a body part to pose it (↕ bend/pitch · ↔ twist/yaw)\n" \
		+ "1-9 select joint (6-9 = elbows/knees) · Q/E nudge -+0.05rad (SHIFT x3)\n" \
		+ "C capture pose · U undo capture\n" \
		+ ", / .  select captured pose to edit\n" \
		+ "[ / ]  ease_ms -+20 · ; / '  hold_ms -+20 · X  toggle CONTACT (exclusive)\n" \
		+ "ENTER save to strikes.json · SPACE preview · ESC exit authoring"


func _toast(text: String) -> void:
	_toast_label.text = text
	_toast_label.modulate.a = 1.0
	if _toast_tween and _toast_tween.is_valid():
		_toast_tween.kill()
	_toast_tween = create_tween()
	_toast_tween.tween_interval(1.6)
	_toast_tween.tween_property(_toast_label, "modulate:a", 0.0, 0.8)


# --- HELD-ITEM CYCLE: read the REAL weapon row, pose the hand exactly as the
# game would (offset/two_handed straight off ProtoWeapon.WEAPONS; melee carries
# low + only rises in the swing, guns ride raised — same law as proto3d.gd's
# _apply_hand_pose()). --------------------------------------------------------
func _set_item(idx: int) -> void:
	_item_idx = wrapi(idx, 0, ITEM_IDS.size())
	var id: String = ITEM_IDS[_item_idx]
	var info: Dictionary = ProtoWeapon.WEAPONS.get(id, {})
	var is_melee: bool = info.get("behavior", ProtoWeapon.Behavior.MELEE) == ProtoWeapon.Behavior.MELEE
	var pose: Dictionary = info.get("hand_pose", {"offset": Vector3.ZERO, "two_handed": false})
	puppet.set_hand_pose(pose.get("offset", Vector3.ZERO), pose.get("two_handed", false),
		pose.get("grip_l", Vector3.ZERO), pose.get("grip_r", Vector3.ZERO))
	# fists carries no visible gun mesh at all — bare hands, never "armed".
	_armed = id != "fists"
	puppet.set_armed(_armed)
	puppet.raised = not is_melee


func _current_item_label() -> String:
	var id: String = ITEM_IDS[_item_idx]
	return String(ITEM_LABELS.get(id, id.to_upper()))


func _process(delta: float) -> void:
	_poll_motions_file(delta)
	_legend_label.text = _legend_text() # cheap; mode/row/joint selection changes it often

	if _author_mode:
		# FREEZE: the puppet holds the posed values — animate()'s gait/breathing
		# is skipped entirely rather than partially fought, the simplest reliable
		# ownership gate (spec allows this: "the puppet holds the posed values
		# while in author mode"). The quadruped rig is untouched either way.
		_write_author_joints()
		if _author_previewing:
			_author_player._process(delta)
		quad.air_target = 1.0 if air else 0.0
		quad.dig_target = 1.0 if dig else 0.0
		quad.animate(delta, 0.0, 0.85)
		_readout_label.text = _author_readout_text()
		return

	_update_mouse_aim()
	_update_move_heading()
	_animate_puppet(delta)

	quad.air_target = 1.0 if air else 0.0
	quad.dig_target = 1.0 if dig else 0.0
	quad.animate(delta, 0.0 if dig else speed, 0.85)

	_readout_label.text = "ITEM: %s\nHEADING: %s\nAIM: %s%s" % [
		_current_item_label(),
		_heading_label(),
		"tracking mouse" if puppet.arm_tracks_gaze() else "relaxed (carried low — melee/unarmed)",
		"  [ORBIT]" if _rmb_down else "",
	]


## The treadmill's own root yaws to the WASD/arrow heading (so strafe reads as
## strafe, not "the body just faces where it walks") while animate()'s speed
## param drives the stride amplitude — the same split player_3d.gd runs between
## body_yaw and _move_yaw, just without a moving floor under the puppet.
func _animate_puppet(delta: float) -> void:
	var moving := _move_heading.length_squared() > 0.01
	var target_yaw: float = puppet.rotation.y
	if moving:
		# Heading is expressed body-relative (forward/strafe/back) — resolve it
		# to a WORLD yaw off the puppet's CURRENT facing so "strafe left" always
		# reads left of wherever the puppet is presently pointed, exactly like
		# the treadmill concept (the rig doesn't relocate — only heading pivots).
		var world_dir := Vector3(_move_heading.x, 0, _move_heading.z).rotated(Vector3.UP, puppet.rotation.y)
		target_yaw = ProtoPlayer3D._yaw_of(world_dir.normalized())
	_prev_puppet_yaw = puppet.rotation.y
	puppet.rotation.y = ProtoPlayer3D._rotate_yaw(puppet.rotation.y, target_yaw, deg_to_rad(HEADING_TURN_RATE_DEG) * delta)
	var turn_rate := wrapf(puppet.rotation.y - _prev_puppet_yaw, -PI, PI) / maxf(delta, 0.0001)

	# Aim arm's YAW is body-relative too — the same subtraction player_3d.gd
	# does (aim_yaw - body_yaw) — so mouse aim stays correct as the body turns.
	var world_to_aim := _aim_world - puppet.global_position
	world_to_aim.y = 0.0
	var aim_yaw: float = ProtoPlayer3D._yaw_of(world_to_aim.normalized()) if world_to_aim.length_squared() > 0.0001 else puppet.rotation.y
	if puppet.arm_tracks_gaze():
		puppet.aim_arm.rotation.y = wrapf(aim_yaw - puppet.rotation.y, -PI, PI)
	else:
		puppet.aim_arm.rotation.y = lerp_angle(puppet.aim_arm.rotation.y, 0.0, clampf(10.0 * delta, 0.0, 1.0))

	puppet.crouch_target = 1.0 if crouched else 0.0
	var effective_speed := speed if moving else 0.0
	puppet.animate(delta, effective_speed, turn_rate, _armed, 0.0, false)


func _heading_label() -> String:
	if _move_heading.length_squared() < 0.01:
		return "idle"
	var f := -_move_heading.z # our convention below: z<0 = forward
	var s := _move_heading.x  # x>0 = strafe right
	if f > 0.5 and absf(s) < 0.5:
		return "FORWARD"
	if f < -0.5 and absf(s) < 0.5:
		return "BACKPEDAL"
	if s > 0.5 and absf(f) < 0.5:
		return "STRAFE RIGHT"
	if s < -0.5 and absf(f) < 0.5:
		return "STRAFE LEFT"
	if f > 0.0 and s > 0.0:
		return "FORWARD-RIGHT"
	if f > 0.0 and s < 0.0:
		return "FORWARD-LEFT"
	if f < 0.0 and s > 0.0:
		return "BACK-RIGHT"
	return "BACK-LEFT"


## WASD/arrows → a body-relative heading (forward/strafe/back), read every
## frame (not event-based) so holding a key keeps walking, exactly like the
## real gather_input() does for the player.
func _update_move_heading() -> void:
	var x := 0.0
	var z := 0.0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		x += 1.0
	if Input.is_key_pressed(KEY_UP):
		z -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		z += 1.0
	# NOTE: W is the item-cycle key (event-based, in _input below) — the
	# held-key POLL here intentionally does NOT read W, so tapping it to swap
	# items never also nudges the treadmill forward. UP/S/DOWN cover fwd/back.
	var d := Vector3(x, 0, z)
	_move_heading = d.normalized() if d.length_squared() > 0.0001 else Vector3.ZERO


## Mouse → world point on the floor plane (y=1.0, the SAME plane proto3d.gd's
## aim_point() intersects — chest height, keeps flat aims flat) → the puppet's
## aim arm chases it every frame. Sim override (no real mouse headless) lands
## in _aim_world directly via set_aim_override_world().
var _aim_override_active: bool = false
func _update_mouse_aim() -> void:
	if _aim_override_active:
		return
	if _cam == null:
		return
	var mouse := get_viewport().get_mouse_position()
	var from := _cam.project_ray_origin(mouse)
	var dir := _cam.project_ray_normal(mouse)
	if absf(dir.y) < 0.0001:
		return
	var t := (1.0 - from.y) / dir.y
	if t <= 0.0:
		return
	_aim_world = from + dir * t


## Sim hook: headless has no real mouse — let a test pin the aim point directly.
func set_aim_override_world(point: Vector3) -> void:
	_aim_override_active = true
	_aim_world = point


func clear_aim_override() -> void:
	_aim_override_active = false


# --- FREE ORBIT CAMERA: RMB-drag orbits yaw/pitch, wheel zooms ---------------
func _update_orbit_camera() -> void:
	var offset := Vector3(0, 0, _orbit_dist).rotated(Vector3.RIGHT, _orbit_pitch).rotated(Vector3.UP, _orbit_yaw)
	_cam.global_position = _orbit_target + offset
	_cam.look_at(_orbit_target, Vector3.UP)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		# AUTHOR MODE: LEFT button grabs the nearest body part to drag-pose it.
		if mb.button_index == MOUSE_BUTTON_LEFT and _author_mode:
			if mb.pressed:
				_begin_author_drag(mb.position)
			else:
				_end_author_drag()
			return
		if mb.button_index == MOUSE_BUTTON_RIGHT:
			_rmb_down = mb.pressed
		elif mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			_orbit_dist = clampf(_orbit_dist - ORBIT_ZOOM_STEP, ORBIT_DIST_MIN, ORBIT_DIST_MAX)
			_update_orbit_camera()
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			_orbit_dist = clampf(_orbit_dist + ORBIT_ZOOM_STEP, ORBIT_DIST_MIN, ORBIT_DIST_MAX)
			_update_orbit_camera()
	elif event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		# Drag-pose wins over orbit while a part is grabbed (author mode only).
		if _drag_active:
			_author_drag_motion(mm.relative)
		elif _rmb_down:
			_orbit_yaw -= mm.relative.x * ORBIT_SENS
			_orbit_pitch = clampf(_orbit_pitch - mm.relative.y * ORBIT_SENS, -1.3, 0.35)
			_update_orbit_camera()


## GRAB: pick the authorable part nearest the click (screen space) and latch it
## for dragging. Two joints can share one node (torso twist+lean, shoulder
## yaw+pitch) — we grab the NODE and remember its X/Y joints so a single drag can
## work both axes at once (drag around = pose it around).
func _begin_author_drag(mouse: Vector2) -> bool:
	if _cam == null:
		return false
	var jm := _author_joint_map()
	var best_node: Node3D = null
	var best_d := DRAG_PICK_PX
	for jn in AUTHOR_JOINTS:
		var node := jm.get(jn, null) as Node3D
		if node == null or _cam.is_position_behind(node.global_position):
			continue
		var sp := _cam.unproject_position(node.global_position)
		var d := sp.distance_to(mouse)
		if d < best_d:
			best_d = d
			best_node = node
	if best_node == null:
		_toast("no part under the cursor — click closer to a joint")
		return false
	_drag_node = best_node
	_drag_x_joint = ""
	_drag_y_joint = ""
	for jn in AUTHOR_JOINTS:
		if jm.get(jn, null) == best_node:
			if String(ProtoStrikePlayer.JOINT_AXIS.get(jn, "rotation:x")) == "rotation:y":
				_drag_y_joint = jn
			else:
				_drag_x_joint = jn
	# Point the readout/selected-joint at what we grabbed (prefer the bend axis).
	var lead := _drag_x_joint if _drag_x_joint != "" else _drag_y_joint
	_author_selected_joint = maxi(0, AUTHOR_JOINTS.find(lead))
	_drag_active = true
	_toast("GRABBED %s — drag to pose (Q/E fine-tune, C capture)" % _drag_label())
	return true


func _end_author_drag() -> void:
	if _drag_active:
		_toast("set %s" % _drag_label())
	_drag_active = false
	_drag_node = null


## DRAG: vertical mouse → the X-axis joint (bend/pitch/lean), horizontal → the
## Y-axis joint (twist/yaw). Writes the author buffer; _write_author_joints()
## puts it on the real rig the same frame, so it moves under the cursor live.
func _author_drag_motion(rel: Vector2) -> void:
	if _drag_x_joint != "":
		_author_joint_values[_drag_x_joint] = float(_author_joint_values.get(_drag_x_joint, 0.0)) + rel.y * DRAG_SENS
	if _drag_y_joint != "":
		_author_joint_values[_drag_y_joint] = float(_author_joint_values.get(_drag_y_joint, 0.0)) + rel.x * DRAG_SENS


func _drag_label() -> String:
	var parts: Array[String] = []
	if _drag_x_joint != "":
		parts.append(_drag_x_joint)
	if _drag_y_joint != "":
		parts.append(_drag_y_joint)
	return "+".join(parts) if not parts.is_empty() else "?"


func _input(event: InputEvent) -> void:
	if not (event is InputEventKey and event.pressed and not event.echo):
		return
	var key: int = (event as InputEventKey).keycode
	var shift: bool = (event as InputEventKey).shift_pressed

	# TAB toggles author mode from EITHER side — checked before the mode branch
	# so it always works regardless of which key-set is currently live.
	if key == KEY_TAB:
		_set_author_mode(not _author_mode)
		return
	if _author_mode:
		if key == KEY_ESCAPE:
			_set_author_mode(false)
			return
		_author_input(key, shift)
		return

	match key:
		KEY_1: speed = 1.2
		KEY_2: speed = 3.0
		KEY_3: speed = 6.5
		KEY_C: crouched = not crouched
		KEY_A: air = not air
		KEY_D: dig = not dig
		KEY_M: puppet.swing()      # THE MELEE READ — tune it at :8896, watch it land live here
		KEY_P:
			_punch_beat += 1
			puppet.punch(_punch_beat)
		KEY_K: puppet.kick()
		KEY_W:
			# W = cycle the held item (fists → pistol → shotgun → rifle-row → melee →
			# back to fists), NOT the old single armed-toggle — the owner's actual ask
			# ("switching held items... how are his hands with the shotgun").
			_set_item(_item_idx + 1)
			_toast("ITEM: %s" % _current_item_label())
		KEY_F:
			# RIG V2 PHASE 3 preview: fire the HELD row's recoil kick — F at strength 0
			# (the weak get rocked), SHIFT+F at strength 8 (muscle eats it). The tuner
			# watches the contrast live while MotionForge's recoil row folds in.
			var row: Dictionary = (ProtoWeapon.WEAPONS.get(ITEM_IDS[_item_idx], {}) as Dictionary).get("recoil", {})
			if row.is_empty():
				_toast("no recoil row on %s" % _current_item_label())
			else:
				var strength := 8 if shift else 0
				puppet.recoil_kick(row, strength)
				puppet.gun_recoil()
				_toast("RECOIL %s @ strength %d" % [_current_item_label(), strength])
		KEY_R:
			_force_refold()
			_toast("⟳ MOTIONS RELOADED (manual)")


## Manual re-fold (KEY_R) — identical path to the automatic poll below and to
## proto3d.gd's F10 reload_content(): _motion_folded=false, ensure_motions().
func _force_refold() -> void:
	ProtoPuppet._motion_folded = false
	ProtoPuppet.ensure_motions()
	ProtoQuadruped._motion_folded = false
	ProtoQuadruped.ensure_motions()
	print("MOTION STAGE — rows re-folded from data/motions.json")


## Cheap content signature: file size folded with a hash of its bytes. Used
## ALONGSIDE mtime (never instead of — mtime is still the fast-path check) so
## a real edit that happens to land in the same coarse mtime bucket still trips
## the poll. Cost is one small file read every ~0.5s — negligible.
func _motions_file_sig() -> int:
	if not FileAccess.file_exists(MOTIONS_PATH):
		return 0
	var bytes := FileAccess.get_file_as_bytes(MOTIONS_PATH)
	return bytes.size() ^ int(hash(bytes))


## THE LIVE PREVIEW (owner's core ask): poll the file every ~0.5s instead of a
## hot-reload of the whole scene — cheap, and the actual fold is the SAME two
## lines KEY_R and F10's reload_content() already run, so there is exactly one
## fold path in the codebase, just three doors into it. Triggers on mtime OR
## content-signature change — belt and suspenders against FS timestamp
## coalescing (two close writes reported as the same mtime).
func _poll_motions_file(delta: float) -> void:
	_poll_t += delta
	if _poll_t < POLL_INTERVAL:
		return
	_poll_t = 0.0
	if not FileAccess.file_exists(MOTIONS_PATH):
		return
	var mtime := FileAccess.get_modified_time(MOTIONS_PATH)
	var sig := _motions_file_sig()
	if mtime == _last_mtime and sig == _last_sig:
		return
	_last_mtime = mtime
	_last_sig = sig
	_force_refold()
	_toast("⟳ MOTIONS RELOADED")


# ============================================================================
# STRIKE POSE AUTHORING (docs/design/POSE_TO_POSE_STRIKES.md, §Authoring Flow)
# ============================================================================

## The SAME joint dict shape strike_sim.gd proves against the real rig —
## torso_twist/torso_lean both point at puppet.torso (twist=Y, lean=X),
## shoulder_yaw/shoulder_pitch both at puppet.shoulder, hip_kick at hip_r.
## This stage never reaches past ProtoStrikePlayer.JOINT_AXIS to decide which
## axis a name means — that table is strike_player.gd's, called here, not
## duplicated.
func _author_joint_map() -> Dictionary:
	return {
		"torso_twist": puppet.torso, "torso_lean": puppet.torso,
		"shoulder_yaw": puppet.shoulder, "shoulder_pitch": puppet.shoulder,
		"hip_kick": puppet.hip_r,
		# RIG V2: the segmented hinges (all rotation:x per JOINT_AXIS).
		"elbow_r": puppet.elbow_r, "elbow_l": puppet.elbow_l,
		"knee_r": puppet.knee_r, "knee_l": puppet.knee_l,
		# FULL BODY (owner 2026-07-08): head, off-shoulder, wrists, ankles, left hip.
		"head_yaw": puppet.neck, "head_pitch": puppet.neck,
		"free_shoulder_yaw": puppet.free_arm, "free_shoulder_pitch": puppet.free_arm,
		"wrist_r": puppet.hand, "wrist_l": puppet.hand_l,
		"ankle_r": puppet.foot_r, "ankle_l": puppet.foot_l,
		"hip_l_pitch": puppet.hip_l,
	}


func _set_author_mode(on: bool) -> void:
	if on == _author_mode:
		return
	_author_mode = on
	if on:
		_author_previewing = false
		if _author_player.is_playing():
			_author_player.cancel()
		_author_player.rebind_rest() # capture whatever pose the puppet is standing in as rest
		# Seed the LIVE posing buffer from the row's own poses (last-captured
		# values), or rest if the row hasn't captured anything yet — never a
		# jarring snap to zero on entry.
		_author_joint_values = _current_or_rest_joint_values()
		_toast("AUTHOR MODE — editing '%s'" % _author_row_id)
	else:
		if _author_player.is_playing():
			_author_player.cancel()
		_author_previewing = false
		_toast("author mode OFF")


func _current_or_rest_joint_values() -> Dictionary:
	var out: Dictionary = {}
	for jn in AUTHOR_JOINTS:
		out[jn] = 0.0
	if _author_selected_pose >= 0 and _author_selected_pose < _author_poses.size():
		var pose: Dictionary = _author_poses[_author_selected_pose]
		var joints: Dictionary = pose.get("joints", {})
		for jn in joints:
			if out.has(String(jn)):
				out[String(jn)] = float(joints[jn])
	return out


## Writes the live posing buffer straight onto the puppet's real joints —
## called every author-mode frame instead of puppet.animate(), the ownership
## gate: a frozen mannequin, not a fight over who owns the axis this frame.
func _write_author_joints() -> void:
	var jm := _author_joint_map()
	for jn in AUTHOR_JOINTS:
		var node_v: Variant = jm.get(jn, null)
		if node_v == null:
			continue
		var node: Node3D = node_v as Node3D
		var axis: String = ProtoStrikePlayer.JOINT_AXIS[jn]
		var v: float = float(_author_joint_values.get(jn, 0.0))
		if axis == "rotation:y":
			node.rotation.y = v
		else:
			node.rotation.x = v


## Loads AUTHOR_ROW_IDS[idx] for editing. Existing rows IMPORT their real
## poses (from the already-folded ProtoStrikePlayer.STRIKES, which already
## carries any strikes.json overlay) — never start blank on an existing row,
## per spec. Reserved "new_custom_N" ids that aren't in STRIKES start empty.
func _load_author_row(idx: int) -> void:
	_author_row_idx = wrapi(idx, 0, AUTHOR_ROW_IDS.size())
	_author_row_id = AUTHOR_ROW_IDS[_author_row_idx]
	_author_poses = []
	if ProtoStrikePlayer.STRIKES.has(_author_row_id):
		var row: Dictionary = ProtoStrikePlayer.STRIKES[_author_row_id]
		var poses_v: Variant = row.get("poses", [])
		if poses_v is Array:
			_author_poses = (poses_v as Array).duplicate(true)
	_author_selected_pose = _author_poses.size() - 1 if not _author_poses.is_empty() else -1
	_author_joint_values = _current_or_rest_joint_values()


## Dispatch table for author-mode keys — kept as one match, mirroring the
## normal-mode _input() style above, so the two modes read as siblings.
func _author_input(key: int, shift: bool) -> void:
	match key:
		KEY_1, KEY_2, KEY_3, KEY_4, KEY_5, KEY_6, KEY_7, KEY_8, KEY_9:
			_author_selected_joint = key - KEY_1
			_toast("JOINT: %s" % AUTHOR_JOINTS[_author_selected_joint])
		KEY_Q:
			_nudge_selected_joint(-JOINT_NUDGE_STEP * (JOINT_NUDGE_SHIFT_MULT if shift else 1.0))
		KEY_E:
			_nudge_selected_joint(JOINT_NUDGE_STEP * (JOINT_NUDGE_SHIFT_MULT if shift else 1.0))
		KEY_C:
			_capture_pose()
		KEY_U:
			_undo_capture()
		KEY_COMMA:
			_select_pose(_author_selected_pose - 1)
		KEY_PERIOD:
			_select_pose(_author_selected_pose + 1)
		KEY_BRACKETLEFT:
			_adjust_timing("ease_ms", -TIMING_STEP_MS)
		KEY_BRACKETRIGHT:
			_adjust_timing("ease_ms", TIMING_STEP_MS)
		KEY_SEMICOLON:
			_adjust_timing("hold_ms", -TIMING_STEP_MS)
		KEY_APOSTROPHE:
			_adjust_timing("hold_ms", TIMING_STEP_MS)
		KEY_X:
			_toggle_contact()
		KEY_G:
			_load_author_row(_author_row_idx + 1)
			_toast("ROW: %s (%d captured pose%s)" % [_author_row_id, _author_poses.size(), "" if _author_poses.size() == 1 else "s"])
		KEY_ENTER, KEY_KP_ENTER:
			_save_author_row()
		KEY_SPACE:
			_preview_author_row()


func _nudge_selected_joint(delta_rad: float) -> void:
	var jn: String = AUTHOR_JOINTS[_author_selected_joint]
	_author_joint_values[jn] = float(_author_joint_values.get(jn, 0.0)) + delta_rad


## Captures the CURRENT 5-axis pose as the NEXT keyframe. A pose is a PARTIAL
## per the schema (an omitted joint holds the previous pose's value) but the
## author-mode buffer already tracks all 5 live, so the capture writes the
## full 5-axis dict — harmless (identical joints across poses collapse to a
## no-op ease) and keeps the round-trip trivially exact for the sim.
func _capture_pose() -> void:
	var pose: Dictionary = {
		"name": "pose_%d" % (_author_poses.size() + 1),
		"joints": _author_joint_values.duplicate(),
		"ease_ms": 80.0, "hold_ms": 20.0, "ease_curve": ProtoStrikePlayer.EASE_OUT,
		"contact": false,
	}
	_author_poses.append(pose)
	_author_selected_pose = _author_poses.size() - 1
	_toast("POSE %d/%d CAPTURED" % [_author_poses.size(), maxi(_author_poses.size(), 4)])


func _undo_capture() -> void:
	if _author_poses.is_empty():
		_toast("nothing to undo")
		return
	_author_poses.pop_back()
	_author_selected_pose = _author_poses.size() - 1
	_toast("UNDO — %d pose%s left" % [_author_poses.size(), "" if _author_poses.size() == 1 else "s"])


func _select_pose(idx: int) -> void:
	if _author_poses.is_empty():
		return
	_author_selected_pose = wrapi(idx, 0, _author_poses.size())
	_toast("EDITING pose %d/%d" % [_author_selected_pose + 1, _author_poses.size()])


func _adjust_timing(field: String, delta_ms: float) -> void:
	if _author_selected_pose < 0 or _author_selected_pose >= _author_poses.size():
		_toast("capture a pose first")
		return
	var pose: Dictionary = _author_poses[_author_selected_pose]
	pose[field] = maxf(0.0, float(pose.get(field, 0.0)) + delta_ms)
	_toast("pose %d %s = %.0fms" % [_author_selected_pose + 1, field, float(pose[field])])


## Exactly one contact:true per row (spec, non-negotiable) — setting one
## CLEARS every other, enforced here at edit time, not just at save time.
func _toggle_contact() -> void:
	if _author_selected_pose < 0 or _author_selected_pose >= _author_poses.size():
		_toast("capture a pose first")
		return
	var pose: Dictionary = _author_poses[_author_selected_pose]
	var now_on: bool = not bool(pose.get("contact", false))
	for i in _author_poses.size():
		(_author_poses[i] as Dictionary)["contact"] = false
	pose["contact"] = now_on
	_toast("pose %d CONTACT: %s" % [_author_selected_pose + 1, "ON" if now_on else "off"])


## READ-MODIFY-WRITE: loads strikes.json (or the code-floor schema if the
## file doesn't exist yet), splices in ONLY this row, writes the whole file
## back — every other row survives byte-for-byte in shape (same convention
## MotionForge already uses for motions.json). Rejects the save if no pose
## carries contact:true OR more than one does (spec: exactly one,
## non-negotiable) so a broken row can never reach disk.
func _save_author_row() -> void:
	var contact_count := 0
	for pose_v in _author_poses:
		if bool((pose_v as Dictionary).get("contact", false)):
			contact_count += 1
	if _author_poses.is_empty():
		_toast("SAVE REFUSED — capture at least one pose")
		return
	if contact_count != 1:
		_toast("SAVE REFUSED — exactly ONE contact pose required (has %d)" % contact_count)
		return

	var doc: Dictionary = {}
	if FileAccess.file_exists(STRIKES_PATH):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(STRIKES_PATH))
		if parsed is Dictionary:
			doc = parsed as Dictionary
	if not doc.has("strikes") or not (doc["strikes"] is Dictionary):
		doc["strikes"] = {}
	var rows: Dictionary = doc["strikes"]

	# Preserve req_skill/cancel_window_ms/chain_next off whatever the row
	# already carried (folded STRIKES, which already includes any prior JSON
	# overlay) — author mode edits POSES only, never invents gate/combo data.
	var prior: Dictionary = ProtoStrikePlayer.STRIKES.get(_author_row_id, {})
	var req_skill: Dictionary = (prior.get("req_skill", {"id": "", "level": 0}) as Dictionary).duplicate(true)
	var cancel_window_ms: float = float(prior.get("cancel_window_ms", 250.0))
	var chain_next: String = String(prior.get("chain_next", ""))

	rows[_author_row_id] = {
		"poses": _author_poses.duplicate(true),
		"req_skill": req_skill,
		"cancel_window_ms": cancel_window_ms,
		"chain_next": chain_next,
	}
	if not doc.has("_comment"):
		doc["_comment"] = "POSE-TO-POSE STRIKES — authored live from the motion stage (TAB author mode)."

	var wf := FileAccess.open(STRIKES_PATH, FileAccess.WRITE)
	wf.store_string(JSON.stringify(doc, "  "))
	wf.close()

	# Same law as _force_refold(): the write must be visible through the ONE
	# fold path immediately, not just on next launch, so SAVE-then-PREVIEW in
	# the same session (and the sim) sees the new poses.
	ProtoStrikePlayer._folded = false
	ProtoStrikePlayer.ensure_strikes()
	_toast("SAVED '%s' (%d poses) -> strikes.json" % [_author_row_id, _author_poses.size()])


## SPACE: plays the WORKING (possibly unsaved) row through a real
## ProtoStrikePlayer on the stage puppet — setup() with the identical joint
## dict prescribed by the wiring note (torso under two keys, etc). Author
## input keeps working during preview (Q/E would fight it) except while it's
## actually mid-swing the joints are strike_player-owned; ESC/TAB still exit
## cleanly (cancel() first).
func _preview_author_row() -> void:
	if _author_poses.is_empty():
		_toast("nothing captured to preview")
		return
	var contact_count := 0
	for pose_v in _author_poses:
		if bool((pose_v as Dictionary).get("contact", false)):
			contact_count += 1
	if contact_count != 1:
		_toast("PREVIEW NEEDS exactly one CONTACT pose (has %d)" % contact_count)
		return
	# Play the WORKING poses directly (not necessarily saved yet) by staging
	# them into a throwaway id on the player's own STRIKES table, exactly the
	# additive-fold shape the player already expects — no parallel play path.
	var scratch_id := "__author_preview__"
	ProtoStrikePlayer.STRIKES[scratch_id] = {
		"poses": _author_poses.duplicate(true),
		"req_skill": {"id": "", "level": 0}, "cancel_window_ms": 0.0, "chain_next": "",
	}
	_author_player.setup(_author_joint_map(), Callable())
	_author_previewing = _author_player.play(scratch_id)
	if _author_previewing:
		_toast("PREVIEW '%s'" % _author_row_id)
	else:
		_toast("preview failed to start")


func _on_author_preview_finished() -> void:
	_author_previewing = false
	# Snap the live posing buffer back to whatever the row's poses currently
	# hold selected, so continued authoring (Q/E, capture) resumes from a
	# known state rather than wherever the strike player's last frame left it.
	_author_joint_values = _current_or_rest_joint_values()


## Owner-readable status block while in author mode: which row, which joint
## and its value, how many poses captured, which is selected and its timing/
## contact state.
func _author_readout_text() -> String:
	var jn: String = AUTHOR_JOINTS[_author_selected_joint]
	var jv: float = float(_author_joint_values.get(jn, 0.0))
	var lines: Array[String] = []
	lines.append("ROW: %s   POSES CAPTURED: %d" % [_author_row_id, _author_poses.size()])
	lines.append("JOINT %d/9 [%s] = %.3f rad" % [_author_selected_joint + 1, jn, jv])
	if _author_poses.is_empty():
		lines.append("(no poses captured yet — C to capture)")
	else:
		for i in _author_poses.size():
			var p: Dictionary = _author_poses[i]
			var marker := ">" if i == _author_selected_pose else " "
			var contact_tag := " [CONTACT]" if bool(p.get("contact", false)) else ""
			lines.append("%s pose %d: ease %.0fms hold %.0fms%s" % [
				marker, i + 1, float(p.get("ease_ms", 0.0)), float(p.get("hold_ms", 0.0)), contact_tag])
	if _author_previewing:
		lines.append("[PREVIEWING...]")
	return "\n".join(lines)
