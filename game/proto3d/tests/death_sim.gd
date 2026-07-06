## Proof for DEATH & THE ROAD BACK: going down no longer nukes the run. The world
## persists; you wake on the safehouse cot, mended but lighter (the wasteland takes
## a cut), your rig left where it fell. R drives the real respawn — not a reload.
## Run: godot --headless --path game res://proto3d/tests/death_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DEATH: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("DEATH: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("DEATH: WATCHDOG")
		print("DEATH: FAILURES PRESENT")
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	var ch = main.character
	# Load the pack so the toll has something to take.
	main.backpack.slots.clear()
	main.backpack.add("scrap", 10)
	main.backpack.add("scrip", 10)

	# --- Die while driving ------------------------------------------------------
	main.mode = main.Mode.DRIVE
	main.active_car = main.cars[0]
	ch.take_wound("torso", 999.0) # a killing blow → died signal → _on_death
	_check("a killing wound kills", ch.dead)
	_check("death screen up, control off", main.hud.death_shown() and not main.player.is_active)
	_check("deaths counter still 0 until you get up", main.deaths == 0)

	# --- R: wake at the safehouse -----------------------------------------------
	main.respawn_at_home()
	_check("revived — no longer dead, full hp", not ch.dead and ch.hp >= ch.hp_cap() - 0.01)
	_check("back in control, on foot", main.player.is_active and main.mode == main.Mode.FOOT)
	_check("left the rig behind (active_car cleared)", main.active_car == null)
	_check("woke at the safehouse", main.player.global_position.distance_to(Vector3(110, 0.3, -322)) < 3.0)
	_check("death screen gone", not main.hud.death_shown())
	_check("deaths counter ticked to 1", main.deaths == 1)
	_check("the toll took a cut of scrap (10 → 6)", main.backpack.count("scrap") == 6)
	_check("the toll took a cut of scrip (10 → 7)", main.backpack.count("scrip") == 7)

	# --- The world persisted (not a reload) -------------------------------------
	_check("the car still exists in the world", is_instance_valid(main.cars[0]))

	# --- deaths rides the save file ---------------------------------------------
	var rec: Dictionary = main.save_game()
	_check("deaths is in the save", int(rec.get("deaths", -1)) == 1)
	main.deaths = 0
	main.apply_save(rec)
	_check("deaths restored on load", main.deaths == 1)

	print("DEATH RESULTS: %d passed, %d failed" % [passed, failed])
	print("DEATH: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
