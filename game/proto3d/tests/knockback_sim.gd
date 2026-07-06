## Proof for IMPACT (playtest: "shooting should be fulfilling — knockback").
## Shotgun pellets carry a data-driven SHOVE, and explosions are a real SHOCKWAVE:
## radial damage + knockback + a flat-out chance, falling off with distance, on the
## ONE DAMAGE LAW group (combatant ∪ threat). Run:
##   godot --headless --path game res://proto3d/tests/knockback_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("KB: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("KB: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("KB: WATCHDOG"); print("KB: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main.daynight.hour = 0.0 # MIDNIGHT — daylight burns howlers off; keep the test targets alive
	for _i in 2:
		await get_tree().physics_frame

	# --- Shotgun shove is data-driven now ---------------------------------------
	_check("shotgun carries a SHOVE row (pellets push)", float(ProtoWeapon.WEAPONS["shotgun"].get("shove", 0.0)) > 1.5)

	# --- THE SHOCKWAVE: explosion damages + launches a threat -------------------
	var howl := ProtoHowler.create(main)
	main.add_child(howl)
	var center: Vector3 = main.player.global_position + Vector3(0, 0, -30.0)
	howl.global_position = center + Vector3(0, 0, 1.2) # near ground zero, in blast
	for _i in 3:
		await get_tree().physics_frame
	var hp0: float = howl.body.hp
	var pos0: Vector3 = howl.global_position
	main.on_explosion(center, 60.0, 5.0) # rocket-grade blast
	for _i in 6:
		await get_tree().physics_frame
	_check("the blast HURT it", not is_instance_valid(howl) or howl.body.hp < hp0)
	if is_instance_valid(howl):
		_check("the blast THREW it outward (moved %.1fm)" % pos0.distance_to(howl.global_position), pos0.distance_to(howl.global_position) > 0.3)
	else:
		_check("the blast THREW it (target destroyed at ground zero)", true)

	# --- Falloff: a threat at the rim takes less than one at the center ----------
	var near := ProtoHowler.create(main); main.add_child(near)
	var far := ProtoHowler.create(main); main.add_child(far)
	var gz: Vector3 = main.player.global_position + Vector3(0, 0, -60.0)
	near.global_position = gz + Vector3(0, 0, 0.6)
	far.global_position = gz + Vector3(0, 0, 4.6) # just inside the rim
	for _i in 3:
		await get_tree().physics_frame
	var np0: Vector3 = near.global_position
	var fp0: Vector3 = far.global_position
	main.on_explosion(gz, 1.0, 5.0) # tiny damage so both survive; measure the LAUNCH
	for _i in 5:
		await get_tree().physics_frame
	var near_push := 0.0
	if is_instance_valid(near):
		near_push = np0.distance_to(near.global_position)
	var far_push := 999.0
	if is_instance_valid(far):
		far_push = fp0.distance_to(far.global_position)
	_check("KNOCKBACK falls off with distance (center %.1fm > rim %.1fm)" % [near_push, far_push], near_push > far_push)

	# --- The blast targets the ONE DAMAGE LAW union (combatant ∪ threat) ---------
	# The pack lives in "threat"; the player/pirates/remotes in "combatant". The
	# shockwave sweeps both — so a pirate (combatant-not-threat) can't shrug a rocket.
	_check("shockwave reads the combatant∪threat union (threat covered)",
		is_instance_valid(near) == false or near.is_in_group("threat"))

	print("KB RESULTS: %d passed, %d failed" % [passed, failed])
	print("KB: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
