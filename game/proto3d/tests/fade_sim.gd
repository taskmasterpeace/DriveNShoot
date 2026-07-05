## Perception FADE proof: a threat outside your sight fades out; turn to face it
## and it fades back in; a static thing you've seen lingers as a memory ghost.
extends Node

var main: Node3D
var t := 0.0
var phase := 0
var phase_t := 0.0
var passed := 0
var failed := 0
var _lurk: ProtoLurker
var _chest: ProtoChest


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("FADE: scene up")


func _check(name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("FADE: %s - %s" % ["PASS" if ok else "FAIL", name])


func _tap_interact() -> void:
	for pressed in [true, false]:
		var ev := InputEventAction.new()
		ev.action = "interact"
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _fade_of(e: Node3D) -> float:
	return main._fade_cur.get(e, 0.0)


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0:
			if phase_t > 0.6:
				_tap_interact() # on foot, out in the open
				_next()
		1:
			if phase_t > 0.5:
				main.player.global_position = Vector3(40, 0.3, 200)
				main.player.velocity = Vector3.ZERO
				main.player.snap_orientation(Vector3(0, 0, -1)) # look NORTH (-Z)
				main.aim_override = Vector3(0, 0, -1) # eyes track the aim now — hold them north
				# lurker placed BEHIND (south, +Z) — out of sight
				_lurk = ProtoLurker.create()
				_lurk.stalk_range = 0.0
				main.add_child(_lurk)
				_lurk.global_position = main.player.global_position + Vector3(0, 0.4, 14.0)
				# a chest in FRONT (north) — will be seen, then remembered
				_chest = ProtoChest.create("Cache", {"scrap": 1})
				main.add_child(_chest)
				_chest.global_position = main.player.global_position + Vector3(0, 0, -10.0)
				_next()
		2: # let the fade settle
			if phase_t > 2.0:
				_check("threat BEHIND you fades out (%.2f)" % _fade_of(_lurk), _fade_of(_lurk) > 0.5)
				_check("chest you're looking at is solid (%.2f)" % _fade_of(_chest), _fade_of(_chest) < 0.2)
				# now TURN to face the lurker (south)
				main.player.snap_orientation(Vector3(0, 0, 1))
				main.aim_override = Vector3(0, 0, 1)
				_next()
		3:
			if phase_t > 2.0:
				_check("turn to face it and it fades back IN (%.2f)" % _fade_of(_lurk), _fade_of(_lurk) < 0.25)
				_check("now-behind chest becomes a memory GHOST, not gone (%.2f)" % _fade_of(_chest), _fade_of(_chest) > 0.3 and _fade_of(_chest) < 0.75)
				_next()
		4:
			print("FADE RESULTS: %d passed, %d failed" % [passed, failed])
			print("FADE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 20.0:
		print("FADE: TIMEOUT in phase %d" % phase)
		print("FADE RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
