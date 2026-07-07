## Proof for THE DOG'S EYE (dynamic-split goal — the high-bond dog-cam). A PARTNER+
## dog sent SEEKING carries the split view (bond sets how far it ranges before the screen
## splits); the eye folds shut when the dog comes off the seek; a low-bond stray never
## carries it. Real main, real adoption (E on the dog), real _dog_command path. Run:
## godot --headless --path game res://proto3d/tests/dog_eye_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DOGEYE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("DOGEYE: DONE — %d passed, %d failed (WATCHDOG)" % [passed, failed + 1])
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# Adopt Rex through the REAL path (E on the dog).
	var rex: ProtoDog = ProtoDog.create(ProtoDog.DogType.SECURITY, "Rex", "Shepherd")
	main.add_child(rex)
	rex.global_position = main.player.global_position + Vector3(0, 0, 3.0)
	await get_tree().physics_frame
	rex.interact(main)
	_check("Rex joins the pack", rex.adopted)

	# Stage a cache beside the player so the seek has a target (staging exception).
	var cache := ProtoChest.create("Test cache", {"scrip": 1})
	main.add_child(cache)
	cache.global_position = main.player.global_position + Vector3(4, 0.1, 0)
	await get_tree().physics_frame
	_check("a loot target is in sniffing range", main._nearest_loot() != null)

	# LOW bond first: a stray's seek carries NO eye.
	rex.bond = 0.0
	main._dog_command("seek")
	_check("a low-bond dog does NOT carry the eye", not main.split_view.active)
	rex.command_heel()
	await get_tree().physics_frame

	# SOULBOUND: the seek carries the split view, ranged to the bond.
	rex.bond = 999.0
	_check("Rex reads SOULBOUND", rex.bond_tier() == 3)
	main._dog_command("seek")
	_check("the seek raises THE DOG'S EYE (split active)", main.split_view.active)
	_check("the eye rides Rex", main.split_view._remote == rex)
	_check("SOULBOUND ranges 45m before the screen splits", main.split_view.max_separation == 45.0)
	for _i in 40:
		if rex.state == ProtoDog.DogState.SEEK:
			break
		await get_tree().physics_frame # ride out the obey delay — the command QUEUES
	_check("Rex is actually SEEKING", rex.state == ProtoDog.DogState.SEEK)
	_check("the eye survived the obey delay (grace)", main.split_view.active)

	# Recall — the eye folds shut (after the dog's own obey delay) and the range resets.
	rex.command_heel()
	for _i in 60:
		if not main.split_view.active:
			break
		await get_tree().physics_frame
	_check("recall folds the eye shut", not main.split_view.active)
	_check("default split range restored (22m)", main.split_view.max_separation == 22.0)

	print("DOGEYE: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
