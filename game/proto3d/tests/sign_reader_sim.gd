## SIGN READER (2026-07-09 playtest "I'm at another building, I don't even know what the
## fuck this is"). The bug: _update_signs only iterated 3 hardcoded safehouse signs, so
## streamed STRUCTURE + EXIT signs never turned their words on — you saw only a 📜 glyph.
## The fix: every ProtoSign.create() joins the "readable_sign" group and _update_signs reads
## the whole group. This proves a streamed-style sign (not in main.signs) surfaces its name
## when you LOOK at it, and stays a glyph when you don't.
## Run: Godot_console --headless --path game res://proto3d/tests/sign_reader_sim.tscn
extends Node

const ISO := Vector3(6, 0.35, 388)

var passed := 0
var failed := 0
var main: Node3D
var _prev_ts: float = 1.0


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SIGNS: %s - %s" % ["PASS" if ok else "FAIL", n])


func _ready() -> void:
	print("SIGNS: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("SIGNS: WATCHDOG")
		print("SIGNS RESULTS: %d passed, %d failed" % [passed, failed + 1])
		print("SIGNS: FAILURES PRESENT")
		Engine.time_scale = _prev_ts
		get_tree().quit(1))
	_prev_ts = Engine.time_scale
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 12:
		await get_tree().process_frame
	main.mode = main.Mode.FOOT
	main.active_car = null
	main.player.global_position = ISO
	await get_tree().physics_frame

	# A STREAMED-style sign: built through create() (like structure/exit signs), added to
	# the tree, but NOT registered in the legacy `signs` array — exactly the case the old
	# reader missed.
	var s := ProtoSign.create("MERIDIAN CLINIC")
	main.add_child(s)
	_check("a sign built via create() joins the readable_sign group", s.is_in_group("readable_sign"))
	_check("it is NOT in the legacy safehouse `signs` array (the bug case)", not main.signs.has(s))
	_check("the words start hidden (glyph-only until read)", not s.is_readable())

	# Dead ahead, in range → LOOKING at it surfaces the words (its NAME).
	var face: Vector3 = main.player.sight_facing()
	s.global_position = main.player.global_position + face * 6.0
	s.global_position.y = 0.0
	main._update_signs()
	_check("looking at a streamed sign READS it — the name surfaces", s.is_readable())

	# Turn it behind you → back to a glyph (no mouse hover in a headless viewport).
	s.global_position = main.player.global_position - face * 6.0
	s.global_position.y = 0.0
	main._update_signs()
	_check("a sign behind you goes back to unread", not s.is_readable())

	Engine.time_scale = _prev_ts
	print("SIGNS RESULTS: %d passed, %d failed" % [passed, failed])
	print("SIGNS: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
