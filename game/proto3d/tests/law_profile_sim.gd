## Proof for THE LIVING WORLD, Phase 1 (HANDOFF §0 · LIVING_WORLD_DSOA §21.2): state
## LAW PROFILES + contraband. The same gun is legal under Free Counties and contraband
## under the Faith Bloc; crossing a state line becomes a LAW line (announced), and carrying
## contraband in occupied territory FLAGS you (a risk) but does NOT punish you on the spot.
## Run: godot --headless --path game res://proto3d/tests/law_profile_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("LAW: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("LAW: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("LAW: WATCHDOG"); print("LAW: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	var ws = main.world_state

	# --- the core contrast: the SAME gun, two laws --------------------------------------
	_check("a pistol is LEGAL under Free Counties law",
		ws.contraband_in("TEXAS", ["pistol"]).is_empty())
	# put Florida under the Faith Bloc directly (no catch-up needed for the law test)
	ws.state_control["FLORIDA"] = "broadcast_church"
	ws.active_laws["FLORIDA"] = "faith_occupation_law"
	_check("the SAME pistol is CONTRABAND under Faith Occupation law",
		ws.contraband_in("FLORIDA", ["pistol"]).has("pistol"))
	_check("law_for/controller_of default to FREE where no faction holds",
		ws.controller_of("MONTANA") == "free_counties" and ws.law_id_for("MONTANA") == "free_counties_law")
	_check("an occupied state reports its controller + law",
		ws.controller_of("FLORIDA") == "broadcast_church" and ws.law_id_for("FLORIDA") == "faith_occupation_law")

	# --- crossing into occupied territory: felt, but not fatal ---------------------------
	main.mode = main.Mode.FOOT
	main.player.is_active = true
	main.player.global_position = main.SAFEHOUSE + Vector3(0, 0.2, 0)
	main.backpack.slots.clear()
	main.backpack.add("pistol", 1)
	var hp_before: float = main.player.character.hp if ("character" in main.player and main.player.character != null) else 100.0
	main.on_state_entered("FLORIDA") # the state-line -> law-line announcement path
	for _i in 4:
		await get_tree().process_frame
	_check("your kit flags CONTRABAND when you enter occupied Florida",
		not ws.player_contraband("FLORIDA").is_empty())
	_check("crossing the line did NOT punish you (possession != instant arrest)",
		not main.player.dead_vis)
	var hp_after: float = main.player.character.hp if ("character" in main.player and main.player.character != null) else 100.0
	_check("crossing the line did NOT drain your health", hp_after >= hp_before - 0.01)

	# --- entering a FREE state clears the contraband read --------------------------------
	_check("that same kit is clean in a free state", ws.player_contraband("TEXAS").is_empty())

	print("LAW RESULTS: %d passed, %d failed" % [passed, failed])
	print("LAW: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
