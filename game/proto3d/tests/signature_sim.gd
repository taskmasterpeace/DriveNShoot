## Proof for the SIGNATURE goal: dog BONDS deepen through real acts and
## PERMADEATH has weight (down → bandage save, or a grave + a collar + a name on
## the memorial); vehicle damage is DRIVABLE (misfire coughs, chassis slop, fuel
## bleed); and THE CIRCUIT's payoff is VISIBLE (HUD pips).
## Run: godot --headless --path game res://proto3d/tests/signature_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SIG: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("SIG: start")
	get_tree().create_timer(100.0).timeout.connect(func() -> void:
		print("SIG: WATCHDOG")
		print("SIG: FAILURES PRESENT")
		get_tree().quit(1))
	Engine.time_scale = 2.5
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- DOG BONDS: real acts, deepening ----------------------------------------
	var d := ProtoDog.create(ProtoDog.DogType.COMPANION, "Ghost", "Mutt")
	main.add_child(d)
	d.global_position = main.player.global_position + Vector3(2, 0.4, 0)
	d.interact(main) # adopt
	_check("adoption STARTS the bond (%.0f)" % d.bond, d.bond >= 10.0)
	d.hp = 40.0
	main.backpack.add("meat", 1)
	d.interact(main) # feed the hurt dog
	_check("feeding a hurt dog DEEPENS it (%.0f — %s)" % [d.bond, d.BOND_TIERS[d.bond_tier()]],
		d.bond >= 18.0 and d.bond_tier() >= 1)

	# --- PERMADEATH, act 1: the save ----------------------------------------------
	d.take_damage(999.0)
	_check("a downed dog is DOWN, not gone (%.0fs clock)" % d._bleed_out_t, d.downed and is_instance_valid(d))
	main.backpack.add("bandage", 1)
	var bond_before: float = d.bond
	d.interact(main) # the bandage save
	_check("a bandage CARRIES IT BACK — and it never forgets (+%.0f bond)" % (d.bond - bond_before),
		not d.downed and d.hp > 0.0 and d.bond > bond_before)

	# --- PERMADEATH, act 2: the grave ----------------------------------------------
	d.take_damage(999.0)
	d._bleed_out_t = 0.2 # (staging: the sim can't wait 45 real seconds)
	for _i in 30:
		await get_tree().physics_frame
	_check("no bandage in time = GONE for real", not is_instance_valid(d))
	_check("you keep the COLLAR", main.backpack.count("dog_collar") >= 1)
	_check("the MEMORIAL remembers the name", main.fallen_dogs.size() == 1 and main.fallen_dogs[0]["name"] == "Ghost")

	# --- DRIVABLE DAMAGE ------------------------------------------------------------
	var car: ProtoCar3D = main.cars[0]
	main.enter_car(car)
	car.components["engine"].hp = car.components["engine"].max_hp * 0.2 # CRITICAL
	car.components["chassis"].hp = car.components["chassis"].max_hp * 0.2
	car.components["fuel_tank"].hp = car.components["fuel_tank"].max_hp * 0.1
	var fuel0: float = car.fuel
	# (idle, parked: full throttle drove a 20hp-chassis car into town and it DIED
	# before the misfire clock — the coughs don't need motion, just a bad engine)
	var saw_misfire := false
	var saw_slop := false
	var t := 0.0
	while t < 14.0 and not (saw_misfire and saw_slop):
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
		saw_misfire = saw_misfire or car.misfiring
		saw_slop = saw_slop or car.steer_slop > 0.05
	_check("a critical engine MISFIRES — power dies in coughs", saw_misfire)
	_check("a bent chassis WANDERS the wheel (slop %.2f)" % car.steer_slop, saw_slop)
	_check("a breached tank BLEEDS fuel (%.1f → %.1f)" % [fuel0, car.fuel], car.fuel < fuel0 - 0.5)

	# --- THE VISIBLE PAYOFF -----------------------------------------------------------
	main.circuit_beat("scavenge")
	_check("the CIRCUIT pips are ON SCREEN (%s)" % main.hud._circuit_label.text,
		main.hud._circuit_label != null and main.hud._circuit_label.text.contains("●○○○"))

	Engine.time_scale = 1.0
	print("SIG RESULTS: %d passed, %d failed" % [passed, failed])
	print("SIG: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
