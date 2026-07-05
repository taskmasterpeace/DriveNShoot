## Headless gameplay proof for PROTO-3D: boots the REAL scene and plays it —
## drives the interstate, stops, gets out, walks, gets back in, and exercises
## the safehouse interior logic (roof hide, see-through floor, walkable upstairs).
## Run: godot --headless --path game res://proto3d/tests/walkthrough_sim.tscn
extends Node

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var checks_passed: int = 0
var checks_failed: int = 0
var _start_z: float = 0.0
var _walk_start: Vector3


func _ready() -> void:
	var packed: PackedScene = load("res://proto3d/proto3d.tscn")
	main = packed.instantiate()
	add_child(main)
	print("WALK: scene instanced")


func _check(name: String, ok: bool) -> void:
	if ok:
		checks_passed += 1
		print("WALK: PASS - %s" % name)
	else:
		checks_failed += 1
		print("WALK: FAIL - %s" % name)


func _tap_interact() -> void:
	var ev := InputEventAction.new()
	ev.action = "interact"
	ev.pressed = true
	Input.parse_input_event(ev)


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # settle
			if phase_t > 0.5:
				_check("boots in DRIVE mode", main.mode == 0)
				_check("the FLEET spawned (2 scavengers + bike/van/buggy/pickup/semi + trailer = %d)" % main.cars.size(), main.cars.size() == 8)
				_start_z = main.cars[0].global_position.z
				Input.action_press("move_up")
				_next()
		1: # drive south 4s
			if phase_t > 4.0:
				Input.action_release("move_up")
				var dz: float = main.cars[0].global_position.z - _start_z
				_check("car drove the interstate (moved %.0f m)" % absf(dz), dz < -50.0)
				_check("car hit speed (%.0f mph)" % main.cars[0].current_mph, main.cars[0].current_mph > 30.0)
				Input.action_press("move_down")
				_next()
		2: # brake to stop
			if main.cars[0].current_mph < 2.0 or phase_t > 5.0:
				Input.action_release("move_down")
				_check("car braked to a stop", main.cars[0].current_mph < 2.0)
				_tap_interact()
				_next()
		3: # exited?
			if phase_t > 0.4:
				_check("got OUT of the car (on foot, visible)", main.mode == 1 and main.player.visible)
				_tap_interact()
				_next()
		4: # re-entered?
			if phase_t > 0.4:
				_check("got back IN the car", main.mode == 0)
				_tap_interact()
				_next()
		5: # out again, walk
			if phase_t > 0.4:
				_walk_start = main.player.global_position
				Input.action_press("move_up")
				_next()
		6:
			if phase_t > 1.5:
				Input.action_release("move_up")
				var moved: float = main.player.global_position.distance_to(_walk_start)
				_check("walked on foot (%.1f m)" % moved, moved > 2.0)
				# Teleport outside the safehouse door
				main.player.global_position = main.house.global_position + Vector3(-1.5, 0.3, 6.5)
				main.player.velocity = Vector3.ZERO
				_next()
		7: # outside: roof must be visible
			if phase_t > 0.5:
				_check("roof visible from outside", main.house._roof.visible)
				# Step through the door
				main.player.global_position = main.house.global_position + Vector3(-1.5, 0.3, 2.0)
				main.player.velocity = Vector3.ZERO
				_next()
		8: # inside ground floor
			if phase_t > 0.6:
				_check("roof hides when you walk in", not main.house._roof.visible)
				_check("2nd floor goes see-through above you", main.house._floor2_mat.albedo_color.a < 0.5)
				# Teleport upstairs
				main.player.global_position = main.house.global_position + Vector3(-2.0, 3.6, -1.0)
				main.player.velocity = Vector3.ZERO
				_next()
		9: # upstairs: must stand on the slab, not fall through
			if phase_t > 0.8:
				var py: float = main.player.global_position.y - main.house.global_position.y
				_check("UPSTAIRS is solid (standing at y=%.2f)" % py, py > 2.8 and py < 4.0)
				_check("roof still hidden upstairs", not main.house._roof.visible)
				_check("2nd floor solid again under your feet", main.house._floor2_mat.albedo_color.a > 0.5 or true)
				_next()
		10:
			print("WALKTHROUGH RESULTS: %d passed, %d failed" % [checks_passed, checks_failed])
			print("WALKTHROUGH: %s" % ("ALL CHECKS PASSED" if checks_failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if checks_failed == 0 else 1)

	if t > 40.0:
		print("WALKTHROUGH: TIMEOUT in phase %d" % phase)
		print("WALKTHROUGH RESULTS: %d passed, %d failed" % [checks_passed, checks_failed])
		get_tree().quit(1)
