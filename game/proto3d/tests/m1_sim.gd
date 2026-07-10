## M1 Feel Core proof — INPUT-DRIVEN (iron rule: tests press keys, never teleport
## past the mechanic under test; teleports only position the actor for the next test).
## Covers: exit prompt, dive, binoculars v2 mouse aim, locked car, door open,
## walking THROUGH the door, climbing the stairs FOR REAL, stash->key->unlock->drive,
## GTA2 speed zoom, and the world-edge respawn.
## Run: godot --headless --path game res://proto3d/tests/m1_sim.tscn
extends Node

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _mark: Vector3


func _ready() -> void:
	var packed: PackedScene = load("res://proto3d/proto3d.tscn")
	main = packed.instantiate()
	add_child(main)
	print("M1: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("M1: PASS - %s" % name)
	else:
		failed += 1
		print("M1: FAIL - %s" % name)


func _tap_interact() -> void:
	var ev := InputEventAction.new()
	ev.action = "interact"
	ev.pressed = true
	Input.parse_input_event(ev)
	var ev2 := InputEventAction.new()
	ev2.action = "interact"
	ev2.pressed = false
	Input.parse_input_event(ev2)


func _key(code: Key, down: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = code
	ev.physical_keycode = code
	ev.pressed = down
	Input.parse_input_event(ev)


func _mouse_move(rel: Vector2) -> void:
	var ev := InputEventMouseMotion.new()
	ev.relative = rel
	Input.parse_input_event(ev)


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _place_player(pos: Vector3) -> void:
	main.player.global_position = pos
	main.player.velocity = Vector3.ZERO


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # settle; driving prompt
			if phase_t > 0.6:
				_check("boots driving, exit prompt shows", main.mode == 0 and main.hud.current_prompt == "E — Get out")
				_tap_interact()
				_next()
		1: # on foot; start a dive: walk forward then SPACE
			if phase_t > 0.4:
				_check("exited to foot", main.mode == 1)
				Input.action_press("move_up")
				_next()
		2:
			if phase_t > 0.4:
				_mark = main.player.global_position
				Input.action_press("jump")
				_next()
		3: # dive should be active
			if phase_t > 0.15:
				Input.action_release("jump")
				Input.action_release("move_up")
				_check("dive state entered", main.player.move_state == ProtoPlayer3D.FootState.DIVE or main.player.move_state == ProtoPlayer3D.FootState.GETUP)
				_next()
		4: # after dive: recovery happened, then back to normal, and we lunged forward
			if phase_t > 1.4:
				var lunge := _mark.distance_to(main.player.global_position)
				_check("dive lunged %.1f m then recovered" % lunge, lunge > 2.0 and main.player.move_state == ProtoPlayer3D.FootState.NORMAL)
				# Binoculars are RETIRED (playtest #15): B belongs to drone
				# recall now — assert the removal, not the old glass sweep.
				_key(KEY_B, true)
				_next()
		5:
			if phase_t > 0.3:
				_check("retired glass: no vignette on B", not main.hud._vignette.visible)
				_next()
		6: # sweep the mouse — the retired glass must NOT travel the view
			_mouse_move(Vector2(70, 0))
			if phase_t > 1.0:
				_check("retired glass never raises (cam_rig.binoculars off)", not bool(main.cam_rig.binoculars))
				_check("retired glass never sweeps (offset %.0f m stays home)" % main.cam_rig.binocular_offset.length(),
					main.cam_rig.binocular_offset.length() < 10.0)
				_key(KEY_B, false)
				_next()
		7: # locked sedan: prompt + refusal
			if phase_t > 0.4:
				# stage beside the LOCKED SEDAN wherever it's parked (it moved to
				# the TEST GROUNDS motor pool — never trust a street corner)
				_place_player(main.cars[1].global_position + Vector3(1.6, 0.2, 0))
				_next()
		8:
			if phase_t > 0.5:
				# THE ENTRY LADDER (2026-07-07): a locked door offers the SMASH
				# (or a quiet pick) — "Hotwire" moved to the wheel, after entry.
				_check("locked car offers the smash/pick way in", main.hud.current_prompt.contains("smash"))
				_tap_interact()
				_next()
		9:
			if phase_t > 0.4:
				_check("locked car refuses entry", main.mode == 1)
				# Safehouse front door
				_place_player(Vector3(108.5, 0.4, -317.8))
				_next()
		10:
			if phase_t > 0.5:
				_check("door prompts open", main.hud.current_prompt.contains("Open door"))
				_tap_interact()
				_next()
		11:
			if phase_t > 0.6:
				_check("door swung open", main.house.front_door.is_open)
				Input.action_press("move_up") # walk through the doorway
				_next()
		12: # inside by the door — now WALK across to the ramp (the real path)
			if phase_t > 2.0:
				Input.action_release("move_up")
				_check("walked THROUGH the door (roof hid)", not main.house._roof.visible)
				_place_player(main.house.global_position + Vector3(-1.0, 0.5, 4.0))
				Input.action_press("move_right") # head east along the front, toward the stairs
				_next()
		13: # reach the ramp, then turn and climb
			var lx: float = main.player.global_position.x - main.house.global_position.x
			if lx > 3.3 or phase_t > 4.0:
				Input.action_release("move_right")
				Input.action_press("move_up") # climb the ramp (-Z)
				_next()
		14:
			var py: float = main.player.global_position.y - main.house.global_position.y
			if py > 2.9:
				_check("WALKED across the room and UP the ramp (y=%.2f)" % py, true)
				_next() # keep move_up held — now walk OFF the top onto the landing
			elif phase_t > 6.0:
				Input.action_release("move_up")
				_check("WALKED across the room and UP the ramp (y=%.2f)" % py, false)
				phase = 16
		15: # step off the top of the ramp onto the second floor (was blocked)
			var lz: float = main.player.global_position.z - main.house.global_position.z
			var py2: float = main.player.global_position.y - main.house.global_position.y
			if lz < -2.6 and py2 > 2.9:
				Input.action_release("move_up")
				_check("stepped OFF the top onto the landing (z=%.1f y=%.2f)" % [lz, py2], true)
				_next()
			elif phase_t > 4.0:
				Input.action_release("move_up")
				_check("stepped OFF the top onto the landing (z=%.1f y=%.2f)" % [lz, py2], false)
				_next()
		16: # stash upstairs
			if phase_t > 0.4:
				_place_player(main.house.global_position + Vector3(-2.6, 3.6, -2.3))
				_next()
		17:
			if phase_t > 0.5:
				_check("stash prompts search", main.hud.current_prompt.contains("Search"))
				_tap_interact()
				_next()
		18:
			if phase_t > 0.4:
				_check("got the Meridian car key", main.has_key("meridian_car_key"))
				_check("stash consumed", main.house.stash.taken and not main.house.stash.visible)
				# stage beside the LOCKED SEDAN wherever it's parked (it moved to
				# the TEST GROUNDS motor pool — never trust a street corner)
				_place_player(main.cars[1].global_position + Vector3(1.6, 0.2, 0))
				_next()
		19: # unlock, then enter
			if phase_t > 0.5:
				_check("prompt now offers unlock", main.hud.current_prompt.contains("Unlock"))
				_tap_interact()
				_next()
		20:
			if phase_t > 0.4:
				_check("sedan unlocked", not main.cars[1].locked)
				_tap_interact()
				_next()
		21:
			if phase_t > 0.4:
				_check("driving the sedan", main.mode == 0 and main.active_car == main.cars[1])
				Input.action_press("move_up")
				_next()
		22: # GTA2 speed zoom
			if phase_t > 3.5:
				var cam_h: float = main.cam_rig._cam.global_position.y - main.active_car.global_position.y
				_check("camera pulls out with speed (h=%.0f m @ %.0f mph)" % [cam_h, main.active_car.current_mph], cam_h > 34.0 and main.active_car.current_mph > 25.0)
				Input.action_release("move_up")
				_next()
		23: # world edge: throw the car off the map
			if phase_t > 0.6:
				_mark = main._last_safe
				# The far states have GROUND now — prove the net by dropping BELOW the world.
				main.active_car.global_position = Vector3(6900, -40.0, 0)
				main._safe_timer = -3.0 # don't let the fall get recorded as safe
				_next()
		24:
			# The net returns you to A safe spot on the drive corridor — the
			# ring buffer may hand back an entry a stretch behind the very
			# newest _last_safe, so the tape is the corridor (150 m), not 40.
			var back: bool = main.active_car.global_position.distance_to(_mark) < 150.0 and main.active_car.global_position.y > -4.0
			if back and phase_t > 1.0:
				_check("fell off the world, respawned on the safe corridor", true)
				_next()
			elif phase_t > 6.0:
				_check("fell off the world, respawned on the safe corridor (pos %s)" % str(main.active_car.global_position), false)
				_next()
		25:
			print("M1 RESULTS: %d passed, %d failed" % [passed, failed])
			print("M1: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 60.0:
		print("M1: TIMEOUT in phase %d" % phase)
		print("M1 RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
