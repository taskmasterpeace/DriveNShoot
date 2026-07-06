## Proof for DEPLOYABLES rung 1 (P5 pillar): a proximity MINE — USE plants it, it
## ARMS after a beat (planting-safe: won't trip on you), then the first enemy in its
## ring detonates it through the one blast law (damage + knockback). Run:
##   godot --headless --path game res://proto3d/tests/mine_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("MINE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("MINE: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("MINE: WATCHDOG"); print("MINE: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main.daynight.hour = 0.0 # keep the howler alive

	# --- USE plants a mine (deployable off the item read-back) -------------------
	main.mode = main.Mode.FOOT
	main.player.is_active = true
	main.player.global_position = Vector3(40, 0.2, -300)
	main.backpack.add("mine", 1)
	var n0: int = main.backpack.count("mine")
	_check("mine is a usable item", ProtoContainer.ITEMS.has("mine") and ProtoNPC.PRICES.has("mine"))
	main.use_item("mine")
	main.backpack.remove("mine", 1) # use_item returns true; the panel/consumer removes it
	var mine: ProtoMine = null
	for c in main.get_children():
		if c is ProtoMine:
			mine = c
	_check("USE plants a live mine in the world", mine != null)

	# --- Arming: it's INERT for a beat, even with the player standing ON it ------
	mine.global_position = main.player.global_position
	await get_tree().physics_frame
	await get_tree().physics_frame
	_check("armed-delay: it does NOT trip on the planter", is_instance_valid(mine))

	# --- An enemy walks into the ring → it BLOWS -------------------------------
	for _i in 60: # wait out the ~1s arm delay
		await get_tree().physics_frame
	var howl := ProtoHowler.create(main)
	main.add_child(howl)
	howl.global_position = mine.global_position + Vector3(0, 0.4, 1.0) # inside the trigger ring
	var hp0: float = howl.body.hp
	for _i in 6:
		await get_tree().physics_frame
	_check("an enemy in the ring DETONATES it (mine consumed)", not is_instance_valid(mine))
	_check("the blast HURT the enemy that tripped it", not is_instance_valid(howl) or howl.body.hp < hp0)

	print("MINE RESULTS: %d passed, %d failed" % [passed, failed])
	print("MINE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
