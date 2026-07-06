## Proof for THE WORLD goal: WEATHER taxes real systems (vision/grip/engine),
## the RADIO delivers real signals (a distress cache actually exists), and the
## TOWN REMEMBERS (greetings warm, the market grows, prices ride the ledger).
## Run: godot --headless --path game res://proto3d/tests/world_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("WLD: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("WLD: start")
	get_tree().create_timer(100.0).timeout.connect(func() -> void:
		print("WLD: WATCHDOG")
		print("WLD: FAILURES PRESENT")
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- WEATHER: dust collapses the cone; rain kills grip; heat cooks engines --
	main.daynight.hour = 12.0 # high noon — any vision loss is the STORM's
	main._exit_car()
	for _i in 30:
		await get_tree().physics_frame
	var clear_range: float = main.vision_cone.last_range_m
	main.weather.force("dust", 9999.0)
	for _i in 90:
		await get_tree().physics_frame
	_check("DUST collapses sight at noon (%.0fm → %.0fm)" % [clear_range, main.vision_cone.last_range_m],
		main.vision_cone.last_range_m < clear_range * 0.45)
	main.weather.force("rain", 9999.0)
	await get_tree().physics_frame
	_check("RAIN kills grip (grip_now %.2f)" % ProtoWeather.grip_now, ProtoWeather.grip_now < 0.7)
	main.weather.force("heat", 9999.0)
	var car: Node = main.cars[0]
	var eng0: float = car.components["engine"].hp
	main.active_car = car
	car.input_throttle = 1.0
	for _i in 120:
		await get_tree().physics_frame
	_check("HEAT cooks a running engine (%.1f → %.1f hp)" % [eng0, car.components["engine"].hp],
		car.components["engine"].hp < eng0 - 0.4)
	car.input_throttle = 0.0
	main.weather.force("clear", 9999.0)

	# --- RADIO: a distress signal is a REAL place -------------------------------
	main.radio.rng.seed = 7
	main.radio._deliver("distress")
	var found := false
	for node in main.get_children():
		if node is ProtoChest and (node as ProtoChest).container.label == "Distress cache":
			found = true
	_check("radio distress spawns a REAL cache in the world", found)
	_check("…and sets a course to it", main.waypoints.any(func(w): return String(w[0]).contains("DISTRESS")))
	main.radio._deliver("lore")
	_check("lore signal delivers a fragment", main.radio.last_signal == "lore")

	# --- THE TOWN REMEMBERS: greeting warms, market grows, price drops ----------
	var trader: ProtoNPC = null
	for node in main.get_children():
		if node is ProtoNPC and (node as ProtoNPC).role == "trade":
			trader = node
	var price_neutral: int = main.trade_price("bandage", false)
	var stock_before: int = trader.stock.slots.size()
	main.respect.add_esteem(ProtoNPC.FACTION, 200.0) # earn TRUSTED the fast way (sim staging)
	_check("standing rose to TRUSTED+", main.respect.standing(ProtoNPC.FACTION) in ["TRUSTED", "HERO"])
	trader.interact(main)
	main.panel.close()
	_check("the MARKET GREW (%d → %d lines)" % [stock_before, trader.stock.slots.size()],
		trader.stock.slots.size() > stock_before)
	_check("prices remember you (%d → %d scrip)" % [price_neutral, main.trade_price("bandage", false)],
		main.trade_price("bandage", false) < price_neutral)
	# …and a SUSPECT gets the town's other face.
	main.respect.add_infamy(ProtoNPC.FACTION, 500.0)
	_check("a marked player reads SUSPECT", main.respect.standing(ProtoNPC.FACTION) == "SUSPECT")
	_check("the trader refuses a suspect", trader.interact_prompt(main).contains("🚫"))

	print("WLD RESULTS: %d passed, %d failed" % [passed, failed])
	print("WLD: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
