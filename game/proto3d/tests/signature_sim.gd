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

	# --- BOND EFFECTS: the heel tightens, the 5th command is EARNED ---------------
	_check("a bonded heel walks CLOSER (×%.2f)" % d.follow_mult(), d.follow_mult() < 1.0)
	_check("SHIELD refuses a mere companion", not d.command_shield())
	d.bond = 85.0 # (staging: months of scratches)
	_check("a SOULBOUND partner answers SHIELD", d.command_shield() and d.shielding)
	main.player.global_position += Vector3(10, 0, 0)
	for _i in 10:
		await get_tree().physics_frame
	_check("the shield ring RIDES YOUR HIP (%.1fm off)" % d.guard_pos.distance_to(main.player.global_position),
		d.guard_pos.distance_to(main.player.global_position) < 2.0)
	_check("memory: the record knows the last meal (day %d)" % d.last_fed_day, d.to_record().has("last_fed_day"))

	# --- PERMADEATH, act 1: the save ----------------------------------------------
	d.take_damage(999.0)
	_check("a downed dog is DOWN, not gone (%.0fs clock)" % d._bleed_out_t, d.downed and is_instance_valid(d))
	main.backpack.add("bandage", 1)
	var bond_before: float = d.bond
	d.interact(main) # the bandage save
	_check("a bandage CARRIES IT BACK — and it never forgets (+%.0f bond, saves=%d)" % [d.bond - bond_before, d.times_saved],
		not d.downed and d.hp > 0.0 and d.bond > bond_before and d.times_saved == 1)

	# --- PERMADEATH, act 2: the grave ----------------------------------------------
	d.take_damage(999.0)
	d._bleed_out_t = 0.2 # (staging: the sim can't wait 45 real seconds)
	for _i in 30:
		await get_tree().physics_frame
	_check("no bandage in time = GONE for real", not is_instance_valid(d))
	var remains: ProtoChest = null
	var grave: Variant = null
	for n in main.get_children():
		if n is ProtoChest and (n as ProtoChest).container.count("dog_collar") > 0:
			remains = n
		if n is ProtoDog.DogGrave:
			grave = n
	_check("the REMAINS hold the collar — yours to face or leave", remains != null)
	_check("the MEMORIAL remembers the name", main.fallen_dogs.size() == 1 and main.fallen_dogs[0]["name"] == "Ghost")
	main.stress = 60.0
	grave.interact(main)
	_check("BURYING it proper lightens the road (stress 60 → %.0f)" % main.stress, main.stress <= 40.0 and grave.buried)

	# --- DRIVABLE DAMAGE ------------------------------------------------------------
	var car: ProtoCar3D = main.cars[0]
	main.enter_car(car)
	# NOTE: chassis-critical + breached tank = the ON_FIRE spiral — the car can
	# EXPLODE before the first cough (flaked twice). Keep the tank healthy while
	# reading misfire+slop; bleed-test the tank afterwards on a mended frame.
	car.components["engine"].hp = car.components["engine"].max_hp * 0.2 # CRITICAL
	car.components["chassis"].hp = car.components["chassis"].max_hp * 0.2
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
	car.components["chassis"].hp = car.components["chassis"].max_hp # mend the frame (no fire)
	car.components["fuel_tank"].hp = car.components["fuel_tank"].max_hp * 0.1 # breach the tank
	var fuel0: float = car.fuel
	var tb := 0.0
	while tb < 4.0:
		await get_tree().physics_frame
		tb += get_physics_process_delta_time()
	_check("a breached tank BLEEDS fuel (%.1f → %.1f)" % [fuel0, car.fuel], car.fuel < fuel0 - 0.5)

	# --- THE VISIBLE PAYOFF -----------------------------------------------------------
	main.circuit_beat("scavenge")
	_check("the CIRCUIT pips are ON SCREEN (%s)" % main.hud._circuit_label.text,
		main.hud._circuit_label != null and main.hud._circuit_label.text.contains("●○○○"))

	Engine.time_scale = 1.0
	print("SIG RESULTS: %d passed, %d failed" % [passed, failed])
	print("SIG: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
