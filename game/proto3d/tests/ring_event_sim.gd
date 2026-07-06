## Proof for RING EVENTS: the Carousel is a front line, not a trophy shelf. The
## calendar besieges a lit node (never your first); reach it and clear the
## attackers to RELIEVE it; ignore it past the deadline and the node FALLS.
## And the siege survives a save/load.
## Run: godot --headless --path game res://proto3d/tests/ring_event_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RING: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("RING: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("RING: WATCHDOG")
		print("RING: FAILURES PRESENT")
		get_tree().quit(1))
	Engine.time_scale = 2.5
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main._exit_car()
	var crsl: ProtoCarousel = main.carousel

	# --- ONE node is a safe haven; the ring only bites a NETWORK -----------------
	crsl.set_active("camp_bellamy")
	_check("your FIRST node is safe (the ring waits)", crsl.besiege_random(2) == "")
	crsl.set_active("norfolk_yard")
	crsl.set_active("fort_bragg")

	# --- The calendar puts a lit node under SIEGE -------------------------------
	main.daynight.day = 4
	var hit: String = crsl.besiege_random(2)
	_check("a lit node comes UNDER SIEGE (%s)" % hit, hit != "" and crsl.gates[hit].under_siege)
	var gate: Variant = crsl.gates[hit]
	_check("the siege set a DEADLINE (day %d)" % gate.siege_deadline_day, gate.siege_deadline_day > main.daynight.day)
	_check("attackers RING the node", gate.siege_attackers.size() >= 2)
	_check("…and never your FIRST-fallen turf twice at once", crsl.any_under_siege().size() == 1)

	# --- RELIEVE it: reach the gate, clear the attackers ------------------------
	main.player.global_position = gate.global_position + Vector3(10, 0.5, 0)
	for a in gate.siege_attackers:
		if is_instance_valid(a):
			a.take_damage(999.0)
	for _i in 20:
		await get_tree().physics_frame
		if not gate.under_siege:
			break
	_check("reaching it + clearing the attackers RELIEVES it", not gate.under_siege
		and crsl.active.get(hit, false))

	# --- IGNORE it: the deadline passes and the node FALLS ----------------------
	crsl.rng.seed = 3
	main.daynight.day = 8
	var hit2: String = crsl.besiege_random(2)
	var g2: Variant = crsl.gates[hit2]
	main.player.global_position = Vector3(50000, 0.5, 50000) # far away — you can't relieve it
	var stress0: float = main.stress
	main.daynight.day = g2.siege_deadline_day + 1 # the clock ran out
	for _i in 15:
		await get_tree().physics_frame
		if g2.state == "dormant":
			break
	_check("an unrelieved node FALLS (%s → %s)" % [hit2, g2.state], g2.state == "dormant" and not crsl.active.get(hit2, false))
	_check("losing a node HURTS (stress %.0f → %.0f)" % [stress0, main.stress], main.stress > stress0 + 20.0)

	# --- The siege survives save/load ------------------------------------------------
	crsl.rng.seed = 11
	main.daynight.day = 12
	var hit3: String = crsl.besiege_random(3)
	main.save_game()
	crsl.gates[hit3].under_siege = false # wreck it
	main.load_game()
	_check("the siege SURVIVES a save/load (%s still besieged)" % hit3, crsl.gates[hit3].under_siege)

	Engine.time_scale = 1.0
	print("RING RESULTS: %d passed, %d failed" % [passed, failed])
	print("RING: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
