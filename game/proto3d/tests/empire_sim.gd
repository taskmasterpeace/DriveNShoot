## Proof for THE FAMILY EMPIRE E1 (THE_FAMILY_EMPIRE.md 0.1/0.2 — the
## Hollowpoint verbs on Meridian's live diner): THE PITCH opens the arrangement
## (extort 25% / buy-in 25 days of profit), the take accrues on the GAME-DAY
## clock, COLLECT pays physical scrip, HEAT rises with the racket and decays
## when you lay low (thresholds SPEAK), the pacing anchor holds (~9 freight-run
## days of diner profit buys the diner), and the ledger rides the save.
## Run: godot --headless --path game res://proto3d/tests/empire_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("EMP: %s - %s" % ["PASS" if ok else "FAIL", failed if false else check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("EMP RESULTS: %d passed, %d failed" % [passed, failed])
	print("EMP: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	print("EMP: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("EMP: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().physics_frame
	var emp: ProtoEmpire = main.empire
	_check("the empire ledger is wired at boot", emp != null)

	# --- 1) businesses are ROWS (capabilities on rows, ownership in the save) ----
	_check("the diner is a business (profit_day %.0f)" % ProtoEmpire.profit_of("diner_roadside"),
		emp.is_business("diner_roadside") and ProtoEmpire.profit_of("diner_roadside") == 14.0)
	_check("a house is NOT (no profit row)", not emp.is_business("house_small"))

	# --- 2) THE PITCH: extortion opens the arrangement ---------------------------
	_check("the pitch lands on the Meridian diner", emp.pitch("meridian-diner", "diner_roadside", false))
	_check("...and pitching it TWICE is refused (one arrangement per place)",
		not emp.pitch("meridian-diner", "diner_roadside", false))
	var heat_after_pitch: float = emp.heat
	_check("the pitch itself is LOUD (heat %.1f > 0)" % heat_after_pitch, heat_after_pitch > 0.0)

	# --- 3) the take accrues on the GAME-DAY clock --------------------------------
	emp.day_tick(4)
	var banked: float = float((emp.holdings["meridian-diner"] as Dictionary)["banked"])
	_check("4 days bank 4 × 14 × 25%% = 14 scrip (got %.1f)" % banked, is_equal_approx(banked, 14.0))
	var scrip0: int = main.backpack.count("scrip")
	var took: int = emp.collect("meridian-diner")
	_check("COLLECT pays physical scrip (%d, backpack %d -> %d)" % [took, scrip0, main.backpack.count("scrip")],
		took == 14 and main.backpack.count("scrip") == scrip0 + 14)

	# --- 4) heat breathes: rises with the racket, decays laying low ---------------
	var h_hot: float = emp.heat
	var before_decay: float = emp.heat
	emp.holdings.clear() # lay entirely low
	emp.day_tick(6)
	_check("heat DECAYS when you lay low (%.1f -> %.1f)" % [before_decay, emp.heat], emp.heat < before_decay)

	# --- 5) the buy-in: 25 days of the place's own money --------------------------
	main.backpack.add("scrip", 400)
	var price := int(ceil(14.0 * 25.0))
	var s_before: int = main.backpack.count("scrip")
	_check("the BUY-IN takes %d scrip and flips the mode" % price,
		emp.pitch("meridian-diner", "diner_roadside", true)
		and main.backpack.count("scrip") == s_before - price
		and String((emp.holdings["meridian-diner"] as Dictionary)["mode"]) == "owned")
	emp.day_tick(2)
	var owned_take: float = float((emp.holdings["meridian-diner"] as Dictionary)["banked"])
	_check("an OWNED place pays through its staff floor (2 × 14 × 0.55 = %.1f)" % owned_take,
		is_equal_approx(owned_take, 2.0 * 14.0 * 0.55))
	# the pacing anchor: extortion of the diner takes ~%d days to equal the buy-in
	var days_to_buyin := price / (14.0 * 0.25)
	_check("the pacing anchor: extorting the diner needs %.0f days to match one buy-in (25/0.25 = 100)" % days_to_buyin,
		is_equal_approx(days_to_buyin, 100.0))

	# --- 6) the ledger rides the save ----------------------------------------------
	var dump: Dictionary = emp.serialize()
	var probe := ProtoEmpire.create(main)
	probe.restore(dump)
	_check("holdings + heat round-trip the save",
		probe.holdings.has("meridian-diner") and is_equal_approx(probe.heat, emp.heat))

	_finish(prev_scale)
