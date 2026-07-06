## Proof for THE SPINE + THE WOW: THE CIRCUIT pays off when all four beats land,
## the Divided States' RULERS react to your ledger at the border, the calendar
## rolls deterministic daily/weekly EVENTS, a killing crit reads CINEMATIC, and
## the content pipeline reloads LIVE.
## Run: godot --headless --path game res://proto3d/tests/spine_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SPN: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("SPN: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("SPN: WATCHDOG")
		print("SPN: FAILURES PRESENT")
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- THE CIRCUIT: four beats → the payoff ----------------------------------
	var lv0: int = main.circuit_level
	var xp0: float = main.character.skills["endurance"]["xp"]
	main.circuit_beat("scavenge")
	main.circuit_beat("upgrade")
	main.circuit_beat("upgrade") # a repeat beat must NOT double-count
	main.circuit_beat("push")
	_check("three beats in — no premature payoff", main.circuit_level == lv0)
	main.circuit_beat("node")
	_check("all four beats → CIRCUIT COMPLETE (lv %d → %d)" % [lv0, main.circuit_level], main.circuit_level == lv0 + 1)
	_check("the payoff FEEDS you (skill xp %.0f → %.0f, +cell %d)" % [xp0, main.character.skills["endurance"]["xp"], main.backpack.count("power_cell")],
		main.character.skills["endurance"]["xp"] > xp0 and main.backpack.count("power_cell") >= 1)
	_check("the next lap is armed (beats reset)", not main.circuit_beats.values().any(func(b): return b))

	# --- THE DIVIDED STATES REACT ------------------------------------------------
	_check("rulers.json loaded (%d states)" % (main.rulers.get("states", {}) as Dictionary).size(),
		(main.rulers.get("states", {}) as Dictionary).size() >= 10)
	main.respect.add_infamy("KENTUCKY", 500.0)
	main.on_state_entered("KENTUCKY")
	_check("a SUSPECT border-crossing posts BOUNTY HUNTERS", main.bounty_hunted)
	main.respect.add_esteem("NEVADA", 300.0)
	var jack0: int = main.backpack.count("scrip")
	main.on_state_entered("NEVADA")
	_check("a TRUSTED name gets the ruler's WELCOME (+scrip)", main.backpack.count("scrip") > jack0 and not main.bounty_hunted)
	_check("…and entering states banked the PUSH beat", main.circuit_beats["push"])

	# --- WORLD EVENTS: deterministic off the day ---------------------------------
	var war_day := 7
	_check("day 7 = a STATE AT WAR (%s)" % main.events.roll_daily(war_day), main.events.today_event == "state_at_war" and main.events.war_state != "")
	_check("war roads run TRIPLE pirates", main.events.pirate_mult(main.events.war_state) == 3.0)
	var caravan_day := -1
	var moon_day := -1
	for d in range(1, 30):
		if d % 7 == 0:
			continue
		var e: String = main.events.roll_daily(d)
		if e == "caravan" and caravan_day < 0:
			caravan_day = d
		elif e == "blood_moon" and moon_day < 0:
			moon_day = d
	_check("the calendar deals CARAVANS (day %d)" % caravan_day, caravan_day > 0)
	var caravan_found := false
	for n in main.get_children():
		if n is ProtoCar3D and (n as ProtoCar3D).trunk != null and (n as ProtoCar3D).trunk.count("power_cell") > 0 and n != main.cars[0]:
			caravan_found = true
	_check("…and the caravan is REAL (a fat trunk up the road)", caravan_found)
	_check("…and BLOOD MOONS (day %d — moon %.2f)" % [moon_day, main.daynight.moon_phase], moon_day > 0 and main.daynight.moon_phase < 0.1)
	_check("same day = same event (determinism)", main.events.roll_daily(caravan_day) == "caravan")

	# --- THE WOW: the killing crit holds its breath -------------------------------
	var prev_scale := Engine.time_scale
	main.cinematic_kill(main.player.global_position)
	_check("a killing crit DROPS time (×%.2f)" % Engine.time_scale, Engine.time_scale < prev_scale * 0.5)
	await get_tree().create_timer(0.6, true, false, true).timeout
	_check("…and the world EXHALES (restored ×%.2f)" % Engine.time_scale, is_equal_approx(Engine.time_scale, prev_scale))

	# --- THE LIVING PIPELINE -------------------------------------------------------
	var r: Dictionary = main.reload_content()
	_check("one press re-folds the whole content spine (%d vehicles, map %s)" % [r["vehicles"], str(r["map_ok"])],
		r["vehicles"] >= 10 and r["map_ok"])

	print("SPN RESULTS: %d passed, %d failed" % [passed, failed])
	print("SPN: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
