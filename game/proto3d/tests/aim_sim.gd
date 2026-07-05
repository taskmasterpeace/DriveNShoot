## AIM & LOCOMOTION proof — TWIN-STICK (Option A "free arms, human eyes"):
## the arms/gun track the mouse ALWAYS and aim any direction INSTANTLY (you can
## shoot behind you), while the EYES (vision cone, carried by the torso) turn at a
## human rate — so you can shoot back there before you can SEE back there (the
## dog's blind-spot job). All input-driven; aim via main.aim_override (headless has
## no mouse — documented exception). Run: godot --headless --path game res://proto3d/tests/aim_sim.tscn
extends Node

const EAST := Vector3(1, 0, 0)
const WEST := Vector3(-1, 0, 0)
const NORTH := Vector3(0, 0, -1)

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0

var _p0: Vector3
var _dummy_w: TargetDummy
var _dummy_m: TargetDummy
var _hpw: float = 0.0
var _sight_at_snap: Vector3
var _did: bool = false
var _p1_set: bool = false
var _fwd_speed: float = 0.0
var _orbit_p: Vector3
var _orbit_r0: float = -1.0
var _orbit_dev: float = 0.0
var _orbit_swept: float = 0.0
var _orbit_prev: float = 0.0
var _orbit_min_dot: float = 1.0
var _orbit_click_t: float = 0.0
var _step: int = 0


## A wall of meat that remembers being shot; big + high-hp so checks stay clean.
class TargetDummy:
	extends StaticBody3D
	var hp: float = 1000.0
	func take_damage(d: float) -> void:
		hp -= d


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
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
	_key(code, true)
	_key(code, false)


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


func _dummy(pos: Vector3, threat: bool) -> TargetDummy:
	var d := TargetDummy.new()
	var cs := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(2.0, 2.4, 2.0)
	cs.shape = box
	d.add_child(cs)
	if threat:
		d.add_to_group("threat")
	main.add_child(d)
	d.global_position = pos
	return d


func _aim() -> Vector3:
	return main.player.aim_facing()


func _sight() -> Vector3:
	return main.player.sight_facing()


func _place(p: Vector3) -> void:
	main.player.global_position = p
	main.player.velocity = Vector3.ZERO


func _next() -> void:
	phase += 1
	phase_t = 0.0
	_did = false
	_p1_set = false
	_step = 0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # boot, get out of the car onto open interstate
			if phase_t > 0.6:
				_tap_interact()
				_place(Vector3(6, 0.3, 300))
				main.player.snap_orientation(NORTH)
				_next()
		1: # arm, aim EAST (no firing), walk NORTH
			if phase_t > 0.4:
				main.backpack.add("pistol", 1)
				main.backpack.add("9mm", 24)
				main.use_item("pistol")
				main.aim_override = EAST
				Input.action_press("move_up")
				_p0 = main.player.global_position
				_next()
		2: # DECOUPLE + "the gun tracks the mouse WITHOUT firing" (no shoot-to-look)
			if phase_t > 1.0:
				var pos: Vector3 = main.player.global_position
				_check("decouple: walked NORTH %.1fm while aiming EAST" % (_p0.z - pos.z),
					(_p0.z - pos.z) > 1.5 and absf(pos.x - _p0.x) < 0.8)
				_check("gun tracks the mouse WITHOUT firing (aim east %.2f, never clicked)" % _aim().dot(EAST),
					_aim().dot(EAST) > 0.98)
				Input.action_release("move_up")
				_next()
		3: # LOOK ONE WAY, WALK THE OTHER — aim EAST, walk WEST
			if not _did:
				_did = true
				main.aim_override = EAST
				Input.action_press("move_left") # screen-west
				_p0 = main.player.global_position
			elif phase_t > 1.0:
				var pos: Vector3 = main.player.global_position
				_check("look one way / walk the other: moved WEST %.1fm, gun still EAST (%.2f)" % [_p0.x - pos.x, _aim().dot(EAST)],
					(_p0.x - pos.x) > 1.5 and _aim().dot(EAST) > 0.98)
				Input.action_release("move_left")
				_next()
		4: # TWIN-STICK 360: snap aim BEHIND (west); gun flips instantly, eyes lag, shot still HITS
			if not _did:
				_did = true
				# torso is ~EAST now (held aim east). Put a dummy due WEST — behind you.
				_dummy_w = _dummy(main.player.global_position + WEST * 7.0 + Vector3(0, 1.1, 0), false)
				_hpw = _dummy_w.hp
				_sight_at_snap = _sight()
				main.aim_override = WEST # snap the mouse behind
			elif phase_t > 0.06 and not _p1_set:
				_p1_set = true
				_check("gun snaps BEHIND you instantly (aim west %.2f)" % _aim().dot(WEST), _aim().dot(WEST) > 0.95)
				_check("...but your EYES lag — still facing east, not yet west (sight·west %.2f < 0.6)" % _sight().dot(WEST),
					_sight().dot(WEST) < 0.6 and _sight_at_snap.dot(EAST) > 0.8)
				_click() # shoot behind you
			elif phase_t > 0.5:
				_check("TWIN-STICK: a shot BEHIND you HITS (dummy hp %.0f < %.0f)" % [_dummy_w.hp, _hpw], _dummy_w.hp < _hpw)
				_next()
		5: # EYES CATCH UP: hold aim west; the torso comes around, now you can SEE behind
			if phase_t < 0.05:
				main.aim_override = WEST
			elif phase_t > 1.2:
				_check("hold it and the eyes come around — now you SEE west (sight·west %.2f)" % _sight().dot(WEST),
					_sight().dot(WEST) > 0.9)
				var cd: Vector2 = main.vision_cone.current_dir()
				_check("the vision cone tracks the EYES to west (%.2f)" % cd.dot(Vector2(-1, 0)), cd.dot(Vector2(-1, 0)) > 0.8)
				_next()
		6: # MELEE sweeps where you AIM — even behind (360)
			if not _did:
				_did = true
				main.use_item("machete")
				main.aim_override = EAST
				_dummy_m = _dummy(main.player.global_position + EAST * 2.2 + Vector3(0, 1.1, 0), true)
				_click()
			elif phase_t > 0.4:
				_check("melee lands where you AIM (dummy hp %.0f)" % _dummy_m.hp, _dummy_m.hp < 1000.0)
				_next()
		7: # STANCE: firing slows you and refuses sprint (aiming alone does NOT)
			if _step == 0:
				# Clear the leftover melee dummy + the prior melee's stance lull.
				if is_instance_valid(_dummy_m): _dummy_m.queue_free()
				if is_instance_valid(_dummy_w): _dummy_w.queue_free()
				_place(Vector3(6, 0.3, 300))
				main.aim_override = EAST
				_tap_key(KEY_1) # back to the pistol
				_tap_key(KEY_R)
				_step = 1
			elif _step == 1: # wait out the melee lull → prove aiming alone keeps you free
				if not main.player.in_stance():
					_check("aiming alone does NOT force stance (free until you fire)", true)
					_click() # fire → enter stance
					_key(KEY_SHIFT, true)
					Input.action_press("move_right") # EAST = toward the aim (no backpedal)
					_p0 = main.player.global_position
					_step = 2
					phase_t = 0.0
				elif phase_t > 3.5:
					_check("aiming alone does NOT force stance (free until you fire)", false)
					_next()
			elif _step == 2:
				if phase_t > 0.1 and not _p1_set:
					_p1_set = true
					_check("firing enters combat stance", main.player.in_stance())
				if phase_t > 1.0:
					_fwd_speed = (main.player.global_position - _p0).length() / phase_t
					_check("SHIFT refused in stance (%.1f m/s, not a ~7 sprint)" % _fwd_speed, _fwd_speed > 1.8 and _fwd_speed < 3.6)
					_key(KEY_SHIFT, false)
					Input.action_release("move_right")
					_next()
		8: # CIRCLE-STRAFE: orbit a pivot, gun trained the whole way
			if not _did:
				_did = true
				_orbit_p = main.player.global_position + EAST * 6.0
				main.aim_override = (_orbit_p - main.player.global_position).normalized()
				_click()
			else:
				var rel: Vector3 = main.player.global_position - _orbit_p
				rel.y = 0.0
				var to_p: Vector3 = (-rel).normalized()
				main.aim_override = to_p
				var tang: Vector3 = Vector3(to_p.z, 0, -to_p.x)
				_set_act("move_right", tang.x > 0.38)
				_set_act("move_left", tang.x < -0.38)
				_set_act("move_up", tang.z < -0.38)
				_set_act("move_down", tang.z > 0.38)
				_orbit_click_t -= delta
				if _orbit_click_t <= 0.0:
					_orbit_click_t = 0.6
					_click()
				var bearing: float = atan2(rel.z, rel.x)
				if phase_t > 0.5:
					if _orbit_r0 < 0.0:
						_orbit_r0 = rel.length()
						_orbit_prev = bearing
					else:
						_orbit_swept += wrapf(bearing - _orbit_prev, -PI, PI)
						_orbit_prev = bearing
						_orbit_dev = maxf(_orbit_dev, absf(rel.length() - _orbit_r0))
						_orbit_min_dot = minf(_orbit_min_dot, _aim().dot(to_p))
				if phase_t > 3.2:
					for a in ["move_right", "move_left", "move_up", "move_down"]:
						Input.action_release(a)
					_check("circle-strafe: orbited %.0f deg around the pivot" % rad_to_deg(absf(_orbit_swept)), absf(_orbit_swept) > deg_to_rad(45.0))
					_check("orbit held its radius (dev %.1fm of %.1fm)" % [_orbit_dev, _orbit_r0], _orbit_dev < _orbit_r0 * 0.5)
					_check("gun stayed trained on the pivot the whole way (min dot %.3f)" % _orbit_min_dot, _orbit_min_dot > 0.9)
					_next()
		9:
			print("AIM RESULTS: %d passed, %d failed" % [passed, failed])
			print("AIM: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 45.0:
		print("AIM: TIMEOUT in phase %d" % phase)
		print("AIM RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
