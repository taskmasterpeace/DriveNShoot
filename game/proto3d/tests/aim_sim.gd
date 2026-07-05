## AIM & LOCOMOTION proof (docs/systems/AIM_AND_LOCOMOTION.md): feet, gaze, and
## gun are three separate things, unified by the Look Arc. All input-driven —
## movement via action state, fire via injected LMB, aim via main.aim_override
## (headless has no real mouse — documented exception, same as arsenal_sim).
## Run: godot --headless --path game res://proto3d/tests/aim_sim.tscn
extends Node

const EAST := Vector3(1, 0, 0)
const NORTH := Vector3(0, 0, -1)

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0

var _p0: Vector3
var _b0: Vector3
var _snap_target: Vector3
var _dummy: TargetDummy
var _dummy_a: TargetDummy
var _dummy_b: TargetDummy
var _hp0: float = 0.0
var _expected_turn: float = 0.0
var _turn_done: float = -1.0
var _first_shot_checked: bool = false
var _fwd_speed: float = 0.0
var _did: bool = false
var _p1_set: bool = false
var _orbit_p: Vector3
var _orbit_r0: float = -1.0
var _orbit_dev: float = 0.0
var _orbit_swept: float = 0.0
var _orbit_prev_bearing: float = 0.0
var _orbit_min_dot: float = 1.0
var _orbit_click_t: float = 0.0


## A wall of meat that remembers being shot. Big enough that spread can't
## excuse a miss; hp huge so it never dies out from under the checks.
class TargetDummy:
	extends StaticBody3D
	var hp: float = 1000.0

	func take_damage(d: float) -> void:
		hp -= d


func _ready() -> void:
	var packed: PackedScene = load("res://proto3d/proto3d.tscn")
	main = packed.instantiate()
	add_child(main)
	print("AIM: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("AIM: PASS - %s" % name)
	else:
		failed += 1
		print("AIM: FAIL - %s" % name)


func _tap_interact() -> void:
	for pressed in [true, false]:
		var ev := InputEventAction.new()
		ev.action = "interact"
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _click() -> void:
	for pressed in [true, false]:
		var ev := InputEventMouseButton.new()
		ev.button_index = MOUSE_BUTTON_LEFT
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _tap_key(code: Key) -> void:
	for pressed in [true, false]:
		_key(code, pressed)


func _key(code: Key, pressed: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = code
	ev.physical_keycode = code
	ev.pressed = pressed
	Input.parse_input_event(ev)


func _set_act(action: String, on: bool) -> void:
	if on:
		Input.action_press(action)
	else:
		Input.action_release(action)


func _dummy_at(pos: Vector3, threat: bool) -> TargetDummy:
	var d := TargetDummy.new()
	var cs := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(2.0, 2.2, 2.0)
	cs.shape = box
	d.add_child(cs)
	if threat:
		d.add_to_group("threat") # melee only sweeps the threat group
	main.add_child(d)
	d.global_position = pos
	return d


func _gaze() -> Vector3:
	return main.player.sight_facing()


func _next() -> void:
	phase += 1
	phase_t = 0.0
	_did = false
	_p1_set = false


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # boot, get out of the car (body faces NORTH by default)
			if phase_t > 0.6:
				_tap_interact()
				_next()
		1: # arm up, aim EAST, fire once (enters stance), walk NORTH
			if phase_t > 0.5:
				main.backpack.add("pistol", 1)
				main.backpack.add("9mm", 24)
				main.use_item("pistol")
				main.aim_override = EAST
				_click()
				Input.action_press("move_up")
				_p0 = main.player.global_position
				_next()
		2: # THE DECOUPLE: position moved north, gun/cone stayed east, torso dragged only to the arc edge
			if phase_t > 1.2:
				var pos: Vector3 = main.player.global_position
				var dz: float = _p0.z - pos.z
				_check("decouple: walked NORTH %.1fm while aiming EAST" % dz, dz > 2.0 and absf(pos.x - _p0.x) < 0.8)
				_check("gun stayed ON the mouse (east) while strafing (dot %.3f)" % _gaze().dot(EAST), _gaze().dot(EAST) > 0.98)
				var body_dot: float = main.player.facing().dot(EAST)
				_check("torso dragged only to the ARC EDGE, not all the way east (dot %.2f ~ 0.5)" % body_dot, body_dot > 0.30 and body_dot < 0.70)
				_check("stance holds while the gun is up", main.player.in_stance())
				var spd: float = dz / 1.2
				_check("stance walk is SLOW (%.1f m/s, walk 4.2 / stance ~2.9)" % spd, spd > 1.9 and spd < 3.4)
				var cdir: Vector2 = main.vision_cone.current_dir()
				_check("vision cone follows the GAZE not the feet (east %.2f / north %.2f)" % [cdir.dot(Vector2(1, 0)), cdir.dot(Vector2(0, -1))],
					cdir.dot(Vector2(1, 0)) > 0.9 and cdir.dot(Vector2(0, -1)) < 0.5)
				_check("aim not pinned once the body caught up", not main.player.aim_pinned())
				Input.action_release("move_up")
				_next()
		3: # WITHIN THE ARC: aim flick is instant, torso does not move
			if not _did:
				_did = true
				_click() # refresh stance (fires east — harmless)
				_b0 = main.player.facing()
				_snap_target = _b0.rotated(Vector3.UP, deg_to_rad(-40.0)) # 40 deg flick, inside +/-60
				main.aim_override = _snap_target
			elif phase_t > 0.12:
				_check("inside the arc the head SNAPS (dot %.4f)" % _gaze().dot(_snap_target), _gaze().dot(_snap_target) > 0.997)
				_check("...and the torso DID NOT move (%.2f deg)" % rad_to_deg(main.player.facing().angle_to(_b0)),
					main.player.facing().angle_to(_b0) < deg_to_rad(1.5))
				_next()
		4: # BEHIND YOU: first shot flies the arc edge (MISSES), body turns in real time, then the same click connects
			if not _did:
				_did = true
				var behind: Vector3 = -_gaze()
				_dummy = _dummy_at(main.player.global_position + behind * 7.0 + Vector3(0, 1.1, 0), false)
				_hp0 = _dummy.hp
				main.aim_override = behind
				_expected_turn = maxf(main.player.facing().angle_to(behind) - deg_to_rad(main.player.max_look_yaw_deg), 0.1) \
					/ deg_to_rad(main.player.body_turn_rate_deg)
				_click() # the no-instant-back-shot shot
			else:
				if _turn_done < 0.0 and _gaze().dot(main.aim_override) > 0.996:
					_turn_done = phase_t
				if not _first_shot_checked and phase_t > 0.3:
					_first_shot_checked = true
					_check("shot at a target BEHIND you does NOT hit — round leaves along the arc edge", is_equal_approx(_dummy.hp, _hp0))
				if _first_shot_checked and _turn_done > 0.0 and phase_t > _turn_done:
					if _dummy.hp < _hp0:
						_check("turn-around cost: body took %.2fs (expected ~%.2fs)" % [_turn_done, _expected_turn],
							_turn_done > 0.15 and _turn_done > _expected_turn * 0.5 and _turn_done < _expected_turn * 2.5 + 0.2)
						_check("after the body comes around, the SAME click connects", true)
						_next()
					elif phase_t < 4.5:
						_click() # keep squeezing — cooldown gates the rate
					else:
						_check("after the body comes around, the SAME click connects", false)
						_next()
				elif phase_t > 4.5:
					_check("turn-around: gaze never reached the target (stuck)", false)
					_next()
		5: # MELEE SWEEPS WHERE YOU LOOK: hit in the gaze arc, no hit in the off arc
			if not _did:
				_did = true
				main.use_item("machete")
				_dummy_a = _dummy_at(main.player.global_position + _gaze() * 2.2 + Vector3(0, 1.1, 0), true)
				_dummy_b = _dummy_at(main.player.global_position + _gaze().rotated(Vector3.UP, deg_to_rad(100.0)) * 2.2 + Vector3(0, 1.1, 0), true)
				_click()
			elif phase_t > 0.35:
				_check("melee lands in the GAZE arc (hp %.0f)" % _dummy_a.hp, _dummy_a.hp < 1000.0)
				_check("melee spares what is IN REACH but OUTSIDE the arc", is_equal_approx(_dummy_b.hp, 1000.0))
				_next()
		6: # SPRINT REFUSED while aiming: SHIFT+move at stance speed
			if not _did:
				_did = true
				main.aim_override = EAST
				_click() # machete swing east + stance refresh (also re-drags the body east)
			elif phase_t > 0.9 and not _p1_set:
				_p1_set = true
				_key(KEY_SHIFT, true)
				Input.action_press("move_right")
				_p0 = main.player.global_position
			elif phase_t > 1.9:
				_fwd_speed = (main.player.global_position - _p0).length() / 1.0
				_check("SHIFT refused behind a raised gun (%.1f m/s, sprint-stance would be ~5.0)" % _fwd_speed,
					_fwd_speed > 1.9 and _fwd_speed < 3.6)
				_click() # refresh stance for the backpedal leg
				Input.action_release("move_right")
				Input.action_press("move_left")
				_next()
		7: # BACKPEDAL: walking against the gaze is slower than advancing
			if phase_t > 0.45 and not _p1_set:
				_p1_set = true
				_p0 = main.player.global_position
			elif phase_t > 1.25:
				var back_speed: float = (main.player.global_position - _p0).length() / 0.8
				_check("backpedal slower than advance (%.1f vs %.1f m/s)" % [back_speed, _fwd_speed],
					back_speed < _fwd_speed * 0.8 and back_speed > 0.8)
				Input.action_release("move_left")
				_next()
		8: # THE LULL: stance relaxes on its own, then sprint is allowed again
			if not main.player.in_stance():
				_check("stance relaxes after the lull (%.1fs in)" % phase_t, true)
				Input.action_press("move_right") # SHIFT is still held from phase 6
				_next()
			elif phase_t > 4.0:
				_check("stance relaxes after the lull", false)
				_next()
		9: # free sprint measure (1.0s window after a 0.55s ramp)
			if phase_t > 0.55 and not _p1_set:
				_p1_set = true
				_p0 = main.player.global_position
			elif phase_t > 1.55:
				var spd: float = (main.player.global_position - _p0).length() / 1.0
				_check("sprint returns when the gun comes down (%.1f m/s > 5.2)" % spd, spd > 5.2)
				Input.action_release("move_right")
				_key(KEY_SHIFT, false)
				_next()
		10: # CIRCLE-STRAFE: orbit a fixed point, gun trained the whole way around
			if not _did:
				_did = true
				_tap_key(KEY_1) # back to the pistol (melee costs stamina per swing)
				_tap_key(KEY_R) # top the mag from the backpack
				_orbit_p = main.player.global_position + EAST * 6.0
				main.aim_override = (_orbit_p - main.player.global_position).normalized()
				_click()
				_orbit_click_t = 0.0
			else:
				var rel: Vector3 = main.player.global_position - _orbit_p
				rel.y = 0.0
				var to_p: Vector3 = (-rel).normalized()
				main.aim_override = to_p # the "mouse" stays glued to the pivot
				# steer like a human: hold whichever keys point along the tangent
				var tang: Vector3 = Vector3(to_p.z, 0, -to_p.x)
				_set_act("move_right", tang.x > 0.38)
				_set_act("move_left", tang.x < -0.38)
				_set_act("move_up", tang.z < -0.38)
				_set_act("move_down", tang.z > 0.38)
				_orbit_click_t -= delta
				if _orbit_click_t <= 0.0:
					_orbit_click_t = 0.6
					_click() # keep the stance (and the gun) alive
				var bearing: float = atan2(rel.z, rel.x)
				if phase_t > 0.5:
					if _orbit_r0 < 0.0:
						_orbit_r0 = rel.length()
						_orbit_prev_bearing = bearing
					else:
						_orbit_swept += wrapf(bearing - _orbit_prev_bearing, -PI, PI)
						_orbit_prev_bearing = bearing
						_orbit_dev = maxf(_orbit_dev, absf(rel.length() - _orbit_r0))
						_orbit_min_dot = minf(_orbit_min_dot, _gaze().dot(to_p))
				if phase_t > 3.2:
					for a in ["move_right", "move_left", "move_up", "move_down"]:
						Input.action_release(a)
					_check("circle-strafe: orbited %.0f deg around the pivot" % rad_to_deg(absf(_orbit_swept)), absf(_orbit_swept) > deg_to_rad(45.0))
					_check("orbit held its radius (dev %.1fm of %.1fm)" % [_orbit_dev, _orbit_r0], _orbit_dev < _orbit_r0 * 0.5)
					_check("gun stayed trained on the pivot ALL the way (min dot %.3f)" % _orbit_min_dot, _orbit_min_dot > 0.9)
					_next()
		11:
			print("AIM RESULTS: %d passed, %d failed" % [passed, failed])
			print("AIM: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 45.0:
		print("AIM: TIMEOUT in phase %d" % phase)
		print("AIM RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
