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
				# Binoculars v2: hold B, sweep the mouse east
				_key(KEY_B, true)
				_next()
		5:
			if phase_t > 0.3:
				_check("vignette overlay on", main.hud._vignette.visible)
				_next()
		6: # sweep mouse — aim should travel
			_mouse_move(Vector2(70, 0))
			if phase_t > 1.0:
				var off: Vector2 = main.cam_rig.binocular_offset
				_check("mouse aimed the glass %.0f m out" % off.length(), off.length() > 35.0 and off.x > 0.0)
				var look_dist: float = (main.cam_rig._look_smooth - main.player.global_position).length()
				_check("camera view traveled downrange (%.0f m)" % look_dist, look_dist > 20.0)
				_key(KEY_B, false)
				_next()
		7: # locked sedan: prompt + refusal
			if phase_t > 0.4:
				_place_player(Vector3(95, 0.4, -281.5))
				_next()
		8:
			if phase_t > 0.5:
				_check("locked car prompts LOCKED", main.hud.current_prompt.contains("LOCKED"))
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
		12:
			if phase_t > 2.0:
				Input.action_release("move_up")
				_check("walked THROUGH the door (roof hid)", not main.house._roof.visible)
				# Stair base (setup teleport), then climb with inputs only
				_place_player(main.house.global_position + Vector3(3.85, 0.4, 2.8))
				_next()
		13:
			if phase_t > 0.3:
				Input.action_press("move_up")
				_next()
		14:
			var py: float = main.player.global_position.y - main.house.global_position.y
			if py > 2.9:
				Input.action_release("move_up")
				_check("CLIMBED the stairs by walking (y=%.2f)" % py, true)
				_next()
			elif phase_t > 5.0:
				Input.action_release("move_up")
				_check("CLIMBED the stairs by walking (y=%.2f)" % py, false)
				_next()
		15: # stash upstairs
			if phase_t > 0.4:
				_place_player(main.house.global_position + Vector3(-2.6, 3.6, -2.3))
				_next()
		16:
			if phase_t > 0.5:
				_check("stash prompts search", main.hud.current_prompt.contains("Search"))
				_tap_interact()
				_next()
		17:
			if phase_t > 0.4:
				_check("got the Meridian car key", main.has_key("meridian_car_key"))
				_check("stash consumed", main.house.stash.taken and not main.house.stash.visible)
				_place_player(Vector3(95, 0.4, -281.5))
				_next()
		18: # unlock, then enter
			if phase_t > 0.5:
				_check("prompt now offers unlock", main.hud.current_prompt.contains("Unlock"))
				_tap_interact()
				_next()
		19:
			if phase_t > 0.4:
				_check("sedan unlocked", not main.cars[1].locked)
				_tap_interact()
				_next()
		20:
			if phase_t > 0.4:
				_check("driving the sedan", main.mode == 0 and main.active_car == main.cars[1])
				Input.action_press("move_up")
				_next()
		21: # GTA2 speed zoom
			if phase_t > 3.5:
				var cam_h: float = main.cam_rig._cam.global_position.y - main.active_car.global_position.y
				_check("camera pulls out with speed (h=%.0f m @ %.0f mph)" % [cam_h, main.active_car.current_mph], cam_h > 34.0 and main.active_car.current_mph > 25.0)
				Input.action_release("move_up")
				_next()
		22: # world edge: throw the car off the map
			if phase_t > 0.6:
				_mark = main._last_safe
				main.active_car.global_position = Vector3(6900, 4.0, 0)
				main._safe_timer = -3.0 # don't let the fall get recorded as safe
				_next()
		23:
			var back: bool = main.active_car.global_position.distance_to(_mark) < 40.0 and main.active_car.global_position.y > -4.0
			if back and phase_t > 1.0:
				_check("fell off the world, respawned at last safe spot", true)
				_next()
			elif phase_t > 6.0:
				_check("fell off the world, respawned at last safe spot (pos %s)" % str(main.active_car.global_position), false)
				_next()
		24:
			print("M1 RESULTS: %d passed, %d failed" % [passed, failed])
			print("M1: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 60.0:
		print("M1: TIMEOUT in phase %d" % phase)
		print("M1 RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
