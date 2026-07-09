## Proof for THE ECO CORE (LIVING_WOUND_ECOSYSTEM P1): every cell carries its
## eco floats (swamps bootstrap DAMP — Alligator Alley starts alive); the
## RNG-free pressure loop breathes (plants regrow, grazers eat them, predators
## FOLLOW the prey with a lag, everything clamps 0..1 and never explodes); the
## WINTER season is the hungry season (regrowth ×0.4 sags the food); a kill's
## body HEATS its sector once and the heat cools on the clock; and W-WET's
## water_rot now lives in the eco dict (MUD's plain key stays synced).
## Run: godot --headless --path game res://proto3d/tests/ecology_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("ECO: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("ECO RESULTS: %d passed, %d failed" % [passed, failed])
	print("ECO: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	print("ECO: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("ECO: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().physics_frame
	var eco_d: ProtoEcology = main.ecology
	_check("the ecology director is wired at boot", eco_d != null)

	# --- 1) the eco dict bootstraps; the Alley starts DAMP -------------------------
	var swamp_pos := Vector3(-6200, 0, 13600) # the I-75 Florida corridor band
	var swamp_row: Dictionary = main.population.cell_at(swamp_pos)
	var swamp_eco: Dictionary = swamp_row.get("eco", {})
	var dry_row: Dictionary = main.population.cell_at(Vector3(-30000, 0, -5000))
	var dry_eco: Dictionary = dry_row.get("eco", {})
	_check("every cell carries the eco floats", not swamp_eco.is_empty() and not dry_eco.is_empty())
	var is_swamp := String(swamp_row.get("biome", "")) == "swamp"
	_check("a swamp cell bootstraps DAMP (water_rot %.2f >= 0.5; biome '%s')"
			% [float(swamp_eco.get("water_rot", 0.0)), swamp_row.get("biome", "?")],
		not is_swamp or float(swamp_eco.get("water_rot", 0.0)) >= 0.5)

	# --- 2) the pressure loop BREATHES and never explodes ---------------------------
	main.daynight.day = 8 # SUMMER — the neutral-ish season
	var cell: Dictionary = dry_eco
	cell["food_avail"] = 0.45
	cell["prey_density"] = 0.15
	cell["predator_pressure"] = 0.1
	for h in range(24 * 14): # two weeks of hours
		eco_d.tick(1.0)
	var bounded := true
	for k in ["food_avail", "prey_density", "predator_pressure", "corpse_heat"]:
		var v := float(cell.get(k, -1.0))
		if v < 0.0 or v > 1.0:
			bounded = false
	_check("two weeks of ticks stay bounded 0..1 (no explosions, no NaNs)", bounded)
	_check("life came back: prey GREW on the food (%.2f > 0.15)" % float(cell["prey_density"]),
		float(cell["prey_density"]) > 0.15)
	_check("...and the predators FOLLOWED the prey (%.2f > 0.10)" % float(cell["predator_pressure"]),
		float(cell["predator_pressure"]) > 0.1)

	# --- 3) WINTER is the hungry season ----------------------------------------------
	var summer_food := float(cell["food_avail"])
	main.daynight.day = 22 # WINTER (day/7 % 4 == 3)
	for h in range(24 * 7):
		eco_d.tick(1.0)
	_check("WINTER sags the larder (food %.2f < summer's %.2f — regrowth ×0.4)"
			% [float(cell["food_avail"]), summer_food],
		float(cell["food_avail"]) < summer_food)

	# --- 4) a body HEATS its sector, once, and the heat cools -------------------------
	var kill_pos := Vector3(-30000, 0, -5000)
	var heat0 := float(dry_eco.get("corpse_heat", 0.0))
	var corpse := ProtoCorpse.create("Body", {"meat": 1}, Color(0.5, 0.45, 0.4), Vector3.ZERO, main)
	main.add_child(corpse)
	corpse.global_position = kill_pos
	for i in range(4):
		await get_tree().physics_frame
	var heat1 := float(dry_eco.get("corpse_heat", 0.0))
	_check("the kill HEATED the sector (%.2f -> %.2f, one deposit)" % [heat0, heat1], heat1 > heat0)
	for i in range(3):
		await get_tree().physics_frame
	_check("...exactly once (no per-frame re-deposit)", is_equal_approx(float(dry_eco.get("corpse_heat", 0.0)), heat1))
	for h in range(30):
		eco_d.tick(1.0)
	_check("...and the heat COOLS on the clock (%.2f < %.2f)" % [float(dry_eco.get("corpse_heat", 0.0)), heat1],
		float(dry_eco.get("corpse_heat", 0.0)) < heat1)
	corpse.queue_free()

	# --- 5) W-WET writes the ECO dict now (and keeps MUD's key synced) ----------------
	var wet_row: Dictionary = main.population.cell_at(Vector3(-77500, 0, -77500))
	var wet_center: Vector2 = main.population.usmap.cell_center(
		main.population.usmap.cell_of(-77500.0, -77500.0))
	main.weather.systems = [{"kind": "rain", "pos": wet_center, "radius": 2600.0,
		"vel": Vector2.ZERO, "ttl_h": 10.0, "age_h": 2.0}]
	main.weather._hour_tick(3)
	var eco_rot := float((wet_row["eco"] as Dictionary).get("water_rot", 0.0))
	_check("rain writes eco.water_rot (%.2f >= 0.6)" % eco_rot, eco_rot >= 0.6)
	_check("...and MUD's plain key stays in sync (%.2f)" % float(wet_row.get("water_rot", 0.0)),
		is_equal_approx(float(wet_row.get("water_rot", 0.0)), eco_rot))
	main.weather.systems.clear()

	_finish(prev_scale)
