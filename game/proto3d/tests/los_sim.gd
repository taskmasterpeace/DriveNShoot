## LOS occlusion proof: walls END sight, doors/windows LET IT THROUGH.
## A lurker behind the closed front door is invisible (FADE) and the lit cone
## stops at the door; open the door with E (real input) and the same spot is
## seen. Your stare can't freeze a lurker through a wall, but freezes it through
## the open doorway. Upstairs, sight escapes through the WINDOW but not the wall.
## Positioning teleports = stage-setting (allowed); the mechanics run untouched.
## Run: godot --headless --path game res://proto3d/tests/los_sim.tscn
extends Node

const NORTH := Vector3(0, 0, -1)
const SOUTH := Vector3(0, 0, 1)
const WEST := Vector3(-1, 0, 0)

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _did: bool = false

var _l1: ProtoLurker # behind the closed door
var _l2: ProtoLurker # stalker behind the west wall
var _l3: ProtoLurker # stalker beyond the open doorway
var _mark: Vector3


func _ready() -> void:
	var packed: PackedScene = load("res://proto3d/proto3d.tscn")
	main = packed.instantiate()
	add_child(main)
	print("LOS: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("LOS: PASS - %s" % name)
	else:
		failed += 1
		print("LOS: FAIL - %s" % name)


func _tap_interact() -> void:
	for pressed in [true, false]:
		var ev := InputEventAction.new()
		ev.action = "interact"
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _place(pos: Vector3) -> void:
	main.player.global_position = pos
	main.player.velocity = Vector3.ZERO


func _fade_of(e: Node3D) -> float:
	return float(main._fade_cur.get(e, 0.0))


func _spawn_lurker(pos: Vector3, range_m: float) -> ProtoLurker:
	var l := ProtoLurker.create()
	l.stalk_range = range_m
	main.add_child(l)
	l.global_position = pos
	return l


func _next() -> void:
	phase += 1
	phase_t = 0.0
	_did = false


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # boot, on foot
			if phase_t > 0.6:
				_tap_interact()
				_next()
		1: # STAGE: outside the CLOSED front door, lurker inside on the door axis
			if phase_t > 0.4:
				_place(Vector3(108.5, 0.35, -317.8))
				main.player.snap_orientation(NORTH) # facing the house
				_l1 = _spawn_lurker(Vector3(108.5, 0.4, -322.5), 0.0) # 4.7m away, IN cone & near range
				_next()
		2: # a closed door is a wall: in-cone + in-range yet UNSEEN, and the light stops
			if phase_t > 1.5:
				_check("closed door HIDES what's inside (fade %.2f — in cone, 4.7m away)" % _fade_of(_l1), _fade_of(_l1) > 0.5)
				var r: float = main.vision_cone.occl_range_at(NORTH)
				_check("the lit cone STOPS at the door (%.1fm ≤ 4)" % r, r >= 0.0 and r <= 4.0)
				_tap_interact() # E — the real door path
				_next()
		3: # open the door and the SAME spot is seen — sight through the aperture
			if phase_t > 1.3:
				_check("door swung open", main.house.front_door.is_open)
				_check("open the door and it is SEEN (fade %.2f)" % _fade_of(_l1), _fade_of(_l1) < 0.25)
				var r: float = main.vision_cone.occl_range_at(NORTH)
				_check("light SPILLS through the open doorway (%.1fm > 4.5)" % r, r > 4.5)
				_next()
		4: # your stare can't freeze what a WALL hides — it keeps coming
			if not _did:
				_did = true
				_place(Vector3(110.0, 0.35, -325.0)) # house center
				main.player.snap_orientation(WEST)
				_l2 = _spawn_lurker(Vector3(102.0, 0.4, -325.0), 25.0) # beyond the west wall
			elif phase_t > 0.15 and _mark == Vector3.ZERO:
				_mark = _l2.global_position
			elif phase_t > 1.05:
				var moved: float = _l2.global_position.distance_to(_mark)
				_check("stare through a WALL freezes nothing — it kept coming (%.1fm)" % moved, moved > 1.2)
				_l2.queue_free()
				_l1.queue_free()
				_mark = Vector3.ZERO
				_next()
		5: # eye contact through the OPEN doorway DOES freeze it
			if not _did:
				_did = true
				_place(Vector3(108.5, 0.35, -323.5)) # inside, looking out the open door
				main.player.snap_orientation(SOUTH)
				_l3 = _spawn_lurker(Vector3(108.5, 0.4, -316.5), 25.0) # outside, on the door axis
			elif phase_t > 0.15 and _mark == Vector3.ZERO:
				_mark = _l3.global_position
			elif phase_t > 1.05:
				var moved: float = _l3.global_position.distance_to(_mark)
				_check("eye contact through the OPEN door freezes it (%.2fm)" % moved, moved < 0.35)
				_l3.queue_free()
				_next()
		6: # upstairs: sight ESCAPES through the window, the solid wall still ends it
			if not _did:
				_did = true
				_place(main.house.global_position + Vector3(0.5, 3.5, 2.0)) # on the slab, at the window column
				main.player.snap_orientation(SOUTH)
			elif phase_t > 0.8:
				var r_win: float = main.vision_cone.occl_range_at(SOUTH)
				var r_wall: float = main.vision_cone.occl_range_at(WEST)
				_check("upstairs, sight ESCAPES through the WINDOW (%.0fm > 8)" % r_win, r_win > 8.0)
				_check("...while the solid wall still ends it (%.1fm < 8)" % r_wall, r_wall >= 0.0 and r_wall < 8.0)
				_next()
		7:
			print("LOS RESULTS: %d passed, %d failed" % [passed, failed])
			print("LOS: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 30.0:
		print("LOS: TIMEOUT in phase %d" % phase)
		print("LOS RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
