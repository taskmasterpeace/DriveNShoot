## Proof for the PvP prep: (1) INPUT PACKETS — the on-foot body consumes a struct,
## so a bot/replay/remote player is the same body fed a different dict; and
## (2) player_record/restore — the dog pattern scaled up (saves, join-in-progress,
## respawn). The damage-law unification (combatant group) is the next rung.
## Run: godot --headless --path game res://proto3d/tests/pvp_prep_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("PVP: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("PVP: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("PVP: WATCHDOG")
		print("PVP: FAILURES PRESENT")
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- 1) INPUT PACKETS: a struct drives the body, no keyboard ---------------
	var pl: ProtoPlayer3D = main.player
	main._exit_car() # on foot
	await get_tree().physics_frame
	pl.use_player_input = false # the netcode/bot/replay path
	pl.is_active = true
	var start: Vector3 = pl.global_position
	pl.packet = {"move": Vector3(0, 0, -1), "dive": false, "sprint": false}
	for _i in 90:
		await get_tree().physics_frame
	var walked := pl.global_position.distance_to(start)
	_check("a fed packet WALKS the body (%.1f m, want >2)" % walked, walked > 2.0)

	var sprint_start: Vector3 = pl.global_position
	pl.packet = {"move": Vector3(0, 0, -1), "dive": false, "sprint": true}
	for _i in 90:
		await get_tree().physics_frame
	var ran := pl.global_position.distance_to(sprint_start)
	_check("sprint in the packet RUNS faster (%.1f m > %.1f m)" % [ran, walked], ran > walked * 1.2)

	pl.packet = {"move": Vector3(0, 0, -1), "dive": true, "sprint": false}
	await get_tree().physics_frame
	await get_tree().physics_frame
	_check("dive in the packet COMMITS the dive", pl.move_state == ProtoPlayer3D.FootState.DIVE)
	pl.packet = ProtoPlayer3D.empty_packet()
	for _i in 120:
		await get_tree().physics_frame

	# --- 2) player_record → wipe → restore -------------------------------------
	main.backpack.add("jack", 55)
	main.use_item("wrench") # equip steel (already in the pack at boot)
	main.character.take_wound("l_arm", 30.0)
	var before_arm: float = main.character.body["l_arm"].hp
	var before_jack: int = main.backpack.count("jack")
	var before_w: int = main.weapons.size()
	var rec: Dictionary = main.player_record()
	_check("record captures pack/arsenal/wounds", rec["backpack"].get("jack", 0) == before_jack
		and rec["weapons"].size() == before_w and rec["character"]["parts"]["l_arm"] == before_arm)

	# WIPE: spend, heal, disarm, walk away — then restore the snapshot.
	main.backpack.remove("jack", before_jack)
	main.character.treat("l_arm", 100.0)
	main.weapons.clear()
	main.equipped = -1
	pl.global_position += Vector3(25, 0, 25)
	main.player_restore(rec)
	await get_tree().physics_frame
	_check("restore: the jack is back (%d)" % main.backpack.count("jack"), main.backpack.count("jack") == before_jack)
	_check("restore: the wound is back (l_arm %.0f)" % main.character.body["l_arm"].hp,
		absf(main.character.body["l_arm"].hp - before_arm) < 0.01)
	_check("restore: the arsenal is back (%d guns)" % main.weapons.size(), main.weapons.size() == before_w)
	_check("restore: the body stands where it stood",
		pl.global_position.distance_to(Vector3(rec["pos"][0], rec["pos"][1], rec["pos"][2])) < 1.0)

	print("PVP RESULTS: %d passed, %d failed" % [passed, failed])
	print("PVP: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
