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
## WASD/arrows move-heading · mouse aim · RMB-drag orbit · wheel zoom.
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
	print("MOTION STAGE — mouse aims · RMB-drag orbits · wheel zooms · WASD/arrows move-heading · W item cycle · M/P/K strikes · motions.json auto-refolds live.")


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
	return "MOTION STAGE\n" \
		+ "1/2/3  speed\nC  crouch · A  air pose · D  dig pose\n" \
		+ "M  swing · P  punch · K  kick\n" \
		+ "W  cycle held item\n" \
		+ "WASD / arrows  move-heading (mouse keeps aiming)\n" \
		+ "mouse  aim · RMB-drag  orbit camera · wheel  zoom\n" \
		+ "R  force re-fold (motions.json also auto-refolds live)"


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
	puppet.set_hand_pose(pose.get("offset", Vector3.ZERO), pose.get("two_handed", false))
	# fists carries no visible gun mesh at all — bare hands, never "armed".
	_armed = id != "fists"
	puppet.set_armed(_armed)
	puppet.raised = not is_melee


func _current_item_label() -> String:
	var id: String = ITEM_IDS[_item_idx]
	return String(ITEM_LABELS.get(id, id.to_upper()))


func _process(delta: float) -> void:
	_poll_motions_file(delta)
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
		if mb.button_index == MOUSE_BUTTON_RIGHT:
			_rmb_down = mb.pressed
		elif mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			_orbit_dist = clampf(_orbit_dist - ORBIT_ZOOM_STEP, ORBIT_DIST_MIN, ORBIT_DIST_MAX)
			_update_orbit_camera()
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			_orbit_dist = clampf(_orbit_dist + ORBIT_ZOOM_STEP, ORBIT_DIST_MIN, ORBIT_DIST_MAX)
			_update_orbit_camera()
	elif event is InputEventMouseMotion and _rmb_down:
		var mm := event as InputEventMouseMotion
		_orbit_yaw -= mm.relative.x * ORBIT_SENS
		_orbit_pitch = clampf(_orbit_pitch - mm.relative.y * ORBIT_SENS, -1.3, 0.35)
		_update_orbit_camera()


func _input(event: InputEvent) -> void:
	if not (event is InputEventKey and event.pressed and not event.echo):
		return
	match (event as InputEventKey).keycode:
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
