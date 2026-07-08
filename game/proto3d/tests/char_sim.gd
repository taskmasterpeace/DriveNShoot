## Proof for CHARACTER CREATION (Rung 5): the picks flow into BOTH the puppet and the
## stat hooks. Choose left-handed, blind in the right eye, a bad left leg, a raider
## body → the rig is REBUILT that way AND the vision cone narrows and the legs slow.
## Run: godot --headless --path game res://proto3d/tests/char_sim.tscn
extends Node

var main: Node3D
var t := 0.0
var phase := 0
var phase_t := 0.0
var passed := 0
var failed := 0
var old_puppet_id := 0


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("CHAR: scene up")


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CHAR: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0:
			if phase_t > 0.6:
				_check("the creation screen exists", main.char_create != null)
				main.char_create.toggle()
				_check("J opens it", main.char_create.is_open)
				main.char_create.toggle()
				_check("J closes it", not main.char_create.is_open)
				old_puppet_id = main.player.puppet.get_instance_id()
				# AUTHOR a very specific survivor.
				main.apply_character({"handed": "left", "blind_eye": "r", "bad_leg": "l", "look": "raider"})
				_next()
		1:
			if phase_t > 0.3:
				var pup: Node3D = main.player.puppet # either puppet type (box or skel)
				_check("the body was REBUILT (new rig instance)", pup.get_instance_id() != old_puppet_id)
				_check("the puppet is LEFT-HANDED (sign %.0f, appearance %s)" % [pup.handed_sign, pup.appearance["handed"]],
					pup.appearance["handed"] == "left" and pup.handed_sign < 0.0)
				_check("the puppet is blind in the RIGHT eye", pup.appearance["blind_eye"] == "r")
				_check("the puppet carries the bad LEFT leg as a limp", pup.appearance["limp"] == "l")
				_check("the RAIDER body applied (torso %.2f > scav 0.5)" % pup.appearance["torso"].x, pup.appearance["torso"].x > 0.5)
				# The SAME picks are stat hooks:
				_check("a blind eye NARROWS the vision cone (arc mult %.2f)" % main.character.vision_arc_mult, main.character.vision_arc_mult == 0.5)
				_check("the dark side follows the RIGHT eye (yaw offset %.2f, want <0)" % main.character.vision_yaw_offset, main.character.vision_yaw_offset < 0.0)
				_check("the bad leg SLOWS you (leg mult %.2f, want <1)" % main.player.leg_mult, main.player.leg_mult < 1.0)
				# Re-author back to whole to prove it's reversible.
				main.apply_character({"handed": "right", "blind_eye": "", "bad_leg": "", "look": "scav"})
				_next()
		2:
			if phase_t > 0.3:
				_check("re-authoring whole restores full sight", main.character.vision_arc_mult == 1.0 and not main.character.eyepatch)
				_check("re-authoring whole restores full speed", main.player.leg_mult == 1.0)
				_check("and flips the hand back to the right", main.player.puppet.appearance["handed"] == "right")
				_report()

	if t > 20.0:
		print("CHAR: TIMEOUT phase %d" % phase)
		_report()


func _report() -> void:
	print("CHAR RESULTS: %d passed, %d failed" % [passed, failed])
	print("CHAR: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
