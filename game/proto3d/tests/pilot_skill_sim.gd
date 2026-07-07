## Proof for PILOTING — the 12th skill (goal: flying a drone is a skill; you get better).
## The row exists with a perk branch, stick time earns xp through the REAL pilot loop, a
## landing pays a bonus, and the skill's three effects are REAL: faster stick, thriftier
## battery, longer signal before the split. Run:
## godot --headless --path game res://proto3d/tests/pilot_skill_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("PSKILL: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _frames(n: int) -> void:
	for _i in n:
		await get_tree().physics_frame


func _ready() -> void:
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("PSKILL: DONE — %d passed, %d failed (WATCHDOG)" % [passed, failed + 1])
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	await _frames(8)
	if main.mode == 0 and main.active_car != null:
		main._exit_car()
		await _frames(4)

	# --- The row + the effect curves. ------------------------------------------------
	_check("PILOTING is a skill row (12 in the tree)", ProtoCharacter.SKILLS.has("piloting")
		and ProtoCharacter.SKILLS.size() == 12)
	var ch := ProtoCharacter.new()
	_check("unskilled = baseline (speed ×1, drain ×1, 22m signal)",
		ch.pilot_speed_mult() == 1.0 and ch.pilot_drain_mult() == 1.0 and ch.pilot_signal_m() == 22.0)
	ch.add_xp("piloting", ProtoSkillTree.xp_for_level(6))
	_check("level 6 flies faster (×%.2f)" % ch.pilot_speed_mult(), absf(ch.pilot_speed_mult() - 1.3) < 0.001)
	_check("level 6 sips the battery (×%.2f)" % ch.pilot_drain_mult(), absf(ch.pilot_drain_mult() - 0.76) < 0.001)
	_check("level 6 holds the signal to 31m", absf(ch.pilot_signal_m() - 31.0) < 0.001)
	_check("the perk branch exists (Steady Stick / Efficient Draw / Long Lease)",
		(ProtoSkillTree.perks().get("piloting", []) as Array).size() == 3)

	# --- Stick time earns xp through the REAL loop. -----------------------------------
	main.backpack.add("drone", 1)
	main.use_item("drone")        # deploy
	main.use_item("drone")        # take the stick
	_check("at the stick (body frozen)", main.drone_pilot.body_immobile())
	var xp0: float = main.character.skills["piloting"]["xp"]
	Input.action_press("move_right")
	await _frames(90)             # 1.5s of real steering
	Input.action_release("move_right")
	var earned: float = main.character.skills["piloting"]["xp"] - xp0
	_check("stick time EARNS piloting xp (%.1f)" % earned, earned > 1.0)

	# AFK hover earns nothing.
	var xp1: float = main.character.skills["piloting"]["xp"]
	await _frames(60)
	_check("AFK hover earns NOTHING", main.character.skills["piloting"]["xp"] == xp1)

	# --- The landing pays out. ---------------------------------------------------------
	main.drone_pilot.request_off()
	for _i in 400:
		if not main.drone_pilot.is_active():
			break
		await get_tree().physics_frame
	_check("the bird is down and off", not main.drone_pilot.is_active())
	_check("a landing pays bonus xp", main.character.skills["piloting"]["xp"] >= xp1 + 6.0)

	# --- The skill rides the NEXT takeoff (pilot + split configured from character). --
	main.character.add_xp("piloting", ProtoSkillTree.xp_for_level(6))
	main.use_item("drone")        # take the stick again (bird parked in the world)
	_check("takeoff loads the skill into the pilot (speed ×%.2f)" % main.drone_pilot.speed_mult,
		main.drone_pilot.speed_mult > 1.05)
	_check("…and the drain multiplier", main.drone_pilot.drain_mult < 1.0)
	_check("…and the split signal range", main.split_view.max_separation > 22.0)
	main.drone_pilot.request_off()

	print("PSKILL: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
