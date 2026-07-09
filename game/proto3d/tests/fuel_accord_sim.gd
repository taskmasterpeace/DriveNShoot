## THE FUEL ACCORD — regression (owner add, 2026-07-09). Proves the whole accord:
## §dress — every gas_station_small gets THE PUMP + 2 posted ENFORCERS + THE SIGN
##   (Meridian's own station at (140,-302.5) is the subject).
## §buy — fuel for scrip through the REAL pump interact: scrip drains, the tank rises.
## §law — violence in the ring (the real single-arg bullet entry on a guard) = the
##   Accord breaks: bounty flagged, EVERY flag's infamy rises, both guards ENGAGE and
##   the player takes fire through the real hurt path.
## §truce — a bandit crew at commit threshold DEFERS while the mark stands on Accord
##   ground (sightings held, no strike), then commits the moment it rolls off.
## Staging positions is the documented exception; verbs ride the real paths.
## Run: Godot_console --headless --path game res://proto3d/tests/fuel_accord_sim.tscn
extends Node

const GAS := Vector3(140, 0.4, -302.5) ## meridian-gas placement (usmap row)

var passed := 0
var failed := 0
var main: Node3D
var _prev_ts: float = 1.0


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("ACCORD: %s - %s" % ["PASS" if ok else "FAIL", n])


func _tap_interact() -> void:
	for pressed in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = KEY_E
		ev.physical_keycode = KEY_E
		ev.pressed = pressed
		Input.parse_input_event(ev)
		for _i in 3:
			await get_tree().physics_frame


func _ready() -> void:
	print("ACCORD: start")
	get_tree().create_timer(110.0).timeout.connect(func() -> void:
		print("ACCORD: WATCHDOG")
		print("ACCORD RESULTS: %d passed, %d failed" % [passed, failed + 1])
		print("ACCORD: FAILURES PRESENT")
		Engine.time_scale = _prev_ts
		get_tree().quit(1))
	_prev_ts = Engine.time_scale
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 10:
		await get_tree().process_frame
	main.mode = main.Mode.FOOT
	main.active_car = null
	main.player.global_position = GAS + Vector3(0, 0, 2.0)
	for _i in 40:
		await get_tree().physics_frame # stream the station — the dress hook fires

	# --- §dress: the ring is real -----------------------------------------------
	var accords := get_tree().get_nodes_in_group("fuel_accord")
	_check("the station got its ACCORD dressing", accords.size() >= 1)
	var guards: Array = []
	for g in get_tree().get_nodes_in_group("accord_guard"):
		if g is Node3D and (g as Node3D).global_position.distance_to(GAS) < 40.0:
			guards.append(g)
	_check("TWO enforcers stand their posts (%d)" % guards.size(), guards.size() == 2)
	var sign_ok := false
	for s in get_tree().get_nodes_in_group("readable_sign"):
		if s is ProtoSign and (s as ProtoSign).text.contains("FUEL ACCORD") \
				and (s as Node3D).global_position.distance_to(GAS) < 40.0:
			sign_ok = true
	_check("THE SIGN stands at the ring (ALL FLAGS WELCOME)", sign_ok)
	_check("the ring answers in_ring() here", ProtoFuelAccord.in_ring(GAS))
	if guards.size() < 2:
		print("ACCORD RESULTS: %d passed, %d failed" % [passed, failed])
		print("ACCORD: FAILURES PRESENT")
		Engine.time_scale = _prev_ts
		get_tree().quit(1)
		return

	# --- §buy: fuel for scrip through the real pump -------------------------------
	var pump: Node3D = null
	for a in accords:
		for c in (a as Node).get_children():
			if c is StaticBody3D and c.is_in_group("interactable") and c.has_method("interact_prompt"):
				if String(c.interact_prompt(main)).contains("PUMP") or String(c.interact_prompt(main)).contains("fuel"):
					pump = c
	_check("THE PUMP stands on its island", pump != null)
	var car: Node = main.cars[0]
	car.global_position = pump.global_position + Vector3(5.0, 0.6, 0)
	car.linear_velocity = Vector3.ZERO
	car.fuel = 30.0
	main.backpack.add("scrip", 30)
	var scrip0: int = main.backpack.count("scrip")
	main.player.global_position = pump.global_position + Vector3(0.9, 0.35, 0.4)
	for _i in 10:
		await get_tree().physics_frame # the interact scan finds the pump (nearest)
	await _tap_interact()
	_check("the pump took the fare (%d → %d scrip)" % [scrip0, main.backpack.count("scrip")],
		main.backpack.count("scrip") == scrip0 - 12)
	_check("…and filled the tank (%.0f%%)" % float(car.fuel), absf(float(car.fuel) - 70.0) < 1.0)

	# --- §law: violence on Accord ground ------------------------------------------
	var g0: Node3D = guards[0]
	# Stand in the OPEN for the return fire — the first run staged the violator
	# BEHIND the pump and the guards' rays hit the island (honest cover behavior).
	main.player.global_position = g0.global_position + Vector3(4.0, 0.35, 4.0)
	for _i in 6:
		await get_tree().physics_frame
	var hp_before: float = main.character.hp
	var infamy0: float = 0.0
	if main.respect.ledger.has("free_counties"):
		infamy0 = float(main.respect.ledger["free_counties"]["infamy"])
	g0.take_damage(5.0) # the real bullet entry — single-arg, the shooter is inferred
	await get_tree().physics_frame
	_check("the Accord flags you WANTED", main.bounty_hunted)
	var all_flags_heard := true
	for f in ProtoFuelAccord.ALL_FLAGS:
		if not main.respect.ledger.has(f) or float(main.respect.ledger[f]["infamy"]) < infamy0 + 39.0:
			all_flags_heard = false
			print("ACCORD:   flag missing the news: %s" % f)
	_check("EVERY flag heard it (infamy +%d across the board)" % int(ProtoFuelAccord.ACCORD_INFAMY),
		all_flags_heard)
	var engaged := 0
	for g in guards:
		if is_instance_valid(g) and g.target == main.player:
			engaged += 1
	_check("both enforcers ENGAGE the violator (%d/2)" % engaged, engaged == 2)
	for _i in 160:
		await get_tree().physics_frame # ~2.6 s: at least one volley lands
	_check("the guards' fire HURTS (hp %.0f → %.0f)" % [hp_before, main.character.hp],
		main.character.hp < hp_before)

	# --- §truce: the bandit STRIKE defers on Accord ground -------------------------
	main.player.global_position = GAS + Vector3(2.0, 0.35, 2.0) # inside the ring
	var st: String = main.stream.current_state(GAS)
	var s: int = main.bandits.strength_of(st)
	_check("a gang watches this state (%s, strength %d)" % [st, s], s >= 1)
	var gang: Dictionary = main.bandits._gang(st)
	gang["gstate"] = main.bandits.GangState.WATCH
	gang["sightings"] = 99999.0
	var pirates0: int = main.pirates.size()
	main.bandits._tick(0.1)
	_check("the strike DEFERS inside the ring (sightings held)",
		float(gang["sightings"]) >= 99998.0 and gang["gstate"] == main.bandits.GangState.WATCH)
	_check("…no ambush crew spawned", main.pirates.size() == pirates0)
	# Roll off the neutral ground — the crew commits like it always did.
	main.player.global_position = GAS + Vector3(220.0, 0.35, 220.0)
	main.bandits._tick(0.1)
	_check("off the ring, the crew COMMITS (the gate is a truce, not a bug-off)",
		gang["gstate"] == main.bandits.GangState.COOLDOWN or main.pirates.size() > pirates0)

	Engine.time_scale = _prev_ts
	print("ACCORD RESULTS: %d passed, %d failed" % [passed, failed])
	print("ACCORD: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
