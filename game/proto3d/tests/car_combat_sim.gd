## Proof for CAR TAKES COMBAT DAMAGE (HANDOFF roadmap #5 remainder). Driving used
## to make the cab INVINCIBLE — claws did nothing to car or driver. Now the beast
## mauls the RIG (the driver stays shielded), and the vehicle's ARMOR row — formerly
## inert metadata — actually blunts it. Run:
##   godot --headless --path game res://proto3d/tests/car_combat_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CARCBT: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("CARCBT: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("CARCBT: WATCHDOG"); print("CARCBT: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- Driving: a claw mauls the RIG, not the driver --------------------------
	main.mode = main.Mode.DRIVE
	main.active_car = main.cars[0]
	main.active_car.armor = 0.0 # bare metal for a clean read
	var car_hp0: float = main.active_car.components["chassis"].hp
	var drv_hp0: float = main.character.hp
	main.on_player_clawed(30.0, null)
	_check("the RIG took the hit (chassis %.0f → %.0f)" % [car_hp0, main.active_car.components["chassis"].hp],
		main.active_car.components["chassis"].hp < car_hp0)
	_check("the DRIVER stayed shielded (hp unchanged)", absf(main.character.hp - drv_hp0) < 0.01)

	# --- Armor is REAL now: a plated rig takes less than bare metal --------------
	var bare: ProtoCar3D = main.cars[0]
	bare.armor = 0.0
	bare.components["chassis"].hp = bare.components["chassis"].max_hp
	var bh0: float = bare.components["chassis"].hp
	main.active_car = bare
	main.on_player_clawed(40.0, null)
	var bare_dmg: float = bh0 - bare.components["chassis"].hp

	var plated: ProtoCar3D = main.cars[1] if main.cars.size() > 1 else main.cars[0]
	plated.armor = 90.0
	plated.components["chassis"].hp = plated.components["chassis"].max_hp
	var ph0: float = plated.components["chassis"].hp
	main.active_car = plated
	main.on_player_clawed(40.0, null)
	var plated_dmg: float = ph0 - plated.components["chassis"].hp
	_check("ARMOR blunts it (bare %.1f > plated %.1f)" % [bare_dmg, plated_dmg], bare_dmg > plated_dmg + 0.5)

	# --- On foot you're still meat (the old law holds) --------------------------
	main.mode = main.Mode.FOOT
	main.active_car = null
	var foot_hp0: float = main.character.hp
	main.on_player_clawed(12.0, null)
	_check("on foot the claw still wounds YOU", main.character.hp < foot_hp0)

	print("CARCBT RESULTS: %d passed, %d failed" % [passed, failed])
	print("CARCBT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
