## Proof for THE THREAT: the pack has a BRAIN (roles, a screamer that summons,
## charges that ripple), the road has PIRATES (a blockade + a chaser that hunts
## your rig), and WOUNDS READ (a shot leg limps + slows, a shot arm wobbles the
## barrel, a cracked head narrows the world, healing straightens it all out).
## Run: godot --headless --path game res://proto3d/tests/threat_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("THR: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("THR: start")
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("THR: WATCHDOG")
		print("THR: FAILURES PRESENT")
		get_tree().quit(1))
	Engine.time_scale = 2.0
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- 1) THE PACK BRAIN ------------------------------------------------------
	main._exit_car()
	var origin: Vector3 = main.player.global_position + Vector3(30, 0, 0)
	var before: int = get_tree().get_nodes_in_group("night_pack").size()
	main.spawn_howler_pack(origin, 4)
	await get_tree().physics_frame
	var pack: Array = get_tree().get_nodes_in_group("night_pack")
	var screamers := 0
	var chargers := 0
	for h in pack:
		screamers += 1 if h.role == "screamer" else 0
		chargers += 1 if h.role == "charger" else 0
	_check("a 4-pack deals ROLES (1 screamer, %d chargers)" % chargers, screamers == 1 and chargers >= 1)
	var scr: ProtoHowler = null
	var circ: ProtoHowler = null
	for h in pack:
		if h.role == "screamer": scr = h
		elif h.role == "circler": circ = h
	_check("the screamer reads BIG (scale %.2f)" % scr.scale.x, scr.scale.x > 1.1)
	circ._charge_cd = 99.0
	scr._scream()
	await get_tree().physics_frame
	_check("THE SCREAM summons reinforcements (%d → %d)" % [before + 4, get_tree().get_nodes_in_group("night_pack").size()],
		get_tree().get_nodes_in_group("night_pack").size() >= before + 6)
	_check("…and the pack's patience SNAPS as one (cd 99 → %.1f)" % circ._charge_cd, circ._charge_cd <= 0.01)
	var ch2: ProtoHowler = null
	for h in get_tree().get_nodes_in_group("night_pack"):
		if h.role == "charger": ch2 = h
	circ._charge_cd = 99.0
	ch2._begin_charge()
	_check("a charge RIPPLES to nearby packmates", circ._charge_cd <= 0.6)
	for h in get_tree().get_nodes_in_group("night_pack"): # clear the field
		(h as Node).queue_free()

	# --- 2) WOUNDS READ ----------------------------------------------------------
	var w: ProtoWeapon = ProtoWeapon.new("pistol") # spread probe — reads the character's arms
	var spread0: float = w.current_spread(main)
	var speed0: float = main.player.leg_mult
	# (staging: top core hp back up between wounds — four at once is a corpse,
	# and dead men don't limp; the PARTS are what this phase tests)
	for wound in [["l_leg", 70.0], ["r_arm", 75.0], ["head", 25.0], ["torso", 55.0]]:
		main.character.take_wound(wound[0], wound[1])
		main.character.hp = main.character.hp_cap()
	await get_tree().physics_frame
	await get_tree().physics_frame
	_check("a shot leg LIMPS the rig (limp '%s')" % main.player.puppet.appearance["limp"],
		main.player.puppet.appearance["limp"] == "l")
	_check("…and SLOWS you (leg_mult %.2f → %.2f)" % [speed0, main.player.leg_mult], main.player.leg_mult < 0.85)
	_check("a shot arm WOBBLES the barrel (spread %.1f° → %.1f°)" % [spread0, w.current_spread(main)],
		w.current_spread(main) > spread0 * 1.4)
	_check("…and the rig shakes with it (wobble %.2f)" % main.player.puppet.aim_wobble, main.player.puppet.aim_wobble > 0.2)
	_check("a cracked head NARROWS the world (clarity %.2f)" % main.character.head_clarity(), main.character.head_clarity() < 0.95)
	_check("a broken torso EMPTIES the lungs (regen ×%.2f)" % main.player.wound_regen_mult, main.player.wound_regen_mult < 0.9)
	for part in main.character.body: # the medkit undoes ALL of it
		main.character.treat(part, 100.0)
	await get_tree().physics_frame
	await get_tree().physics_frame
	_check("healing STRAIGHTENS the body back out", main.player.puppet.appearance["limp"] == ""
		and main.player.leg_mult > 0.95 and main.player.puppet.aim_wobble < 0.05)

	# --- 3) ROAD PIRATES ----------------------------------------------------------
	main.enter_car(main.cars[0])
	await get_tree().physics_frame
	var cars_before: int = 0
	for n in main.get_children():
		cars_before += 1 if n is ProtoCar3D else 0
	main.spawn_road_ambush()
	await get_tree().physics_frame
	var cars_after: int = 0
	for n in main.get_children():
		cars_after += 1 if n is ProtoCar3D else 0
	_check("the ambush is a SET-PIECE (+%d rigs: wall + chaser)" % (cars_after - cars_before), cars_after - cars_before == 3)
	_check("the chaser wears the CHASE BRAIN, aimed at YOUR rig", pirates_target_player())
	var chaser: ProtoCar3D = main.pirates[0]
	var d0: float = chaser.global_position.distance_to(main.active_car.global_position)
	var t := 0.0
	while t < 12.0 and chaser.global_position.distance_to(main.active_car.global_position) > d0 * 0.55:
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
	_check("the chaser CLOSES on a standing target (%.0fm → %.0fm)" % [d0, chaser.global_position.distance_to(main.active_car.global_position)],
		chaser.global_position.distance_to(main.active_car.global_position) < d0 * 0.55)
	_check("their trunks make it WORTH the fight", chaser.trunk.count("jack") > 0)
	# Outrun resolution: stage the distance, the chase breaks off.
	main.active_car.global_position += main.active_car.facing() * -500.0
	for _i in 5:
		await get_tree().physics_frame
	_check("outrun = they BREAK OFF (the mirror empties)", main.pirates.is_empty())

	Engine.time_scale = 1.0
	print("THR RESULTS: %d passed, %d failed" % [passed, failed])
	print("THR: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func pirates_target_player() -> bool:
	if main.pirates.is_empty():
		return false
	for c in (main.pirates[0] as Node).get_children():
		if c is ProtoAutopilot and (c as ProtoAutopilot).target_node == main.active_car:
			return true
	return false
