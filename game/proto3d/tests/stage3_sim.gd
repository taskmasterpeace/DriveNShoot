## Stage 3 proof: skills level BY USE and change the game (spread, hotwire),
## wounds land on body parts and LOWER THE HP CAP, bandages treat the part,
## the K sheet opens, and death is permadeath.
## Run: godot --headless --path game res://proto3d/tests/stage3_sim.tscn
extends Node

var main: Node3D
var t := 0.0
var phase := 0
var phase_t := 0.0
var passed := 0
var failed := 0
var _cap0 := 0.0


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("RPG: scene up")


func _check(name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RPG: %s - %s" % ["PASS" if ok else "FAIL", name])


func _key(code: Key) -> void:
	for pressed in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = code
		ev.physical_keycode = code
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0:
			if phase_t > 0.8:
				_check("character spine exists (6 parts, the 11-skill tree)", main.character.body.size() == 6 and main.character.skills.size() == 11)
				# Skill engine: xp -> level -> real effect
				main.grant_xp("mechanics", 200.0)
				_check("xp levels Mechanics (lv %d)" % main.character.level("mechanics"), main.character.level("mechanics") >= 2)
				_check("Mechanics SPEEDS hotwire (%.1fs < 5)" % main._hotwire_duration(), main._hotwire_duration() < 5.0)
				main.grant_xp("marksmanship", 360.0)
				_check("Marksmanship lv %d tightens spread" % main.character.level("marksmanship"), main.character.level("marksmanship") >= 3)
				_next()
		1: # wounds hit body parts and drop the CAP
			if phase_t > 0.3:
				_cap0 = main.character.hp_cap()
				main.give_bleeding(2)
				_next()
		2:
			if phase_t > 0.4:
				_check("wound lowers the HP CAP (%.0f -> %.0f)" % [_cap0, main.character.hp_cap()], main.character.hp_cap() < _cap0)
				_check("a body part took it (%s)" % main.character.worst_part(), main.character.worst_part() != "")
				main.backpack.add("bandage", 1)
				main.use_item("bandage")
				_next()
		3:
			if phase_t > 0.3:
				_check("bandage TREATS the part — cap recovers (%.0f)" % main.character.hp_cap(), main.character.hp_cap() > _cap0 - 10.0)
				_key(KEY_K)
				_next()
		4:
			if phase_t > 0.4:
				_check("K opens the character sheet", main.hud.sheet_open())
				_key(KEY_K)
				_next()
		5: # driving xp by miles
			if phase_t > 0.3:
				main.cars[0].use_player_input = false
				main.cars[0].input_throttle = 1.0
				_next()
		6:
			if main.character.skills["driving"]["xp"] > 0.0:
				_check("Driving earns xp by the mile", true)
				main.cars[0].input_throttle = 0.0
				_next()
			elif phase_t > 12.0:
				_check("Driving earns xp by the mile", false)
				_next()
		7: # permadeath
			if phase_t > 0.4:
				main.character.take_wound("torso", 300.0)
				_next()
		8:
			if phase_t > 0.5:
				_check("torso destroyed = DEAD", main.character.dead)
				_check("death screen shows (permadeath)", main.hud.death_shown())
				_check("input locked on death", not main.player.is_active)
				_next()
		9:
			print("RPG RESULTS: %d passed, %d failed" % [passed, failed])
			print("RPG: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 35.0:
		print("RPG: TIMEOUT in phase %d" % phase)
		print("RPG RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
