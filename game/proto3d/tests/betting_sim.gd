## Proof for THE BOOK (SPECTACLES §2 — S1's core, ONE system for five events):
## odds are HONEST math (win shares sum to 1; decimal odds invert them), the
## payout law computes (stake × odds × (1−vig)), settle pays winners only and
## is DETERMINISTIC per (venue, day), the seeded winner distribution follows
## the visible strengths, the fix flag rides the ticket for the crime pipeline,
## and race day builds its field at the Meridian grandstand from rig rows.
## Run: godot --headless --path game res://proto3d/tests/betting_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("BET: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("BET: start")
	get_tree().create_timer(30.0).timeout.connect(func() -> void:
		print("BET: WATCHDOG")
		print("BET: FAILURES PRESENT")
		get_tree().quit(1))

	var entrants: Array = [
		{"id": "a", "name": "SAL K.", "strength": 1.0},
		{"id": "b", "name": "THE DEACON", "strength": 0.5},
		{"id": "c", "name": "HALF-STACK", "strength": 0.25},
	]
	var card: Dictionary = ProtoBetting.open_card("meridian_grandstand", 12, entrants)

	# --- odds are honest ------------------------------------------------------------
	var sum_sh := 0.0
	for e in entrants:
		sum_sh += ProtoBetting.implied_share(card, String(e["id"]))
	_check("win shares SUM to 1.0 (%.3f) — the tote board is honest math" % sum_sh,
		absf(sum_sh - 1.0) < 0.001)
	var oa := ProtoBetting.decimal_odds(card, "a")
	var oc := ProtoBetting.decimal_odds(card, "c")
	_check("the favorite pays short (%.2f) and the longshot pays long (%.2f)" % [oa, oc],
		oa < oc and absf(oa - 1.75) < 0.01 and absf(oc - 7.0) < 0.01)

	# --- the payout law ---------------------------------------------------------------
	var t_win: Dictionary = ProtoBetting.place(card, "a", 100)
	var t_lose: Dictionary = ProtoBetting.place(card, "c", 100)
	var t_fix: Dictionary = ProtoBetting.place(card, "b", 50, true)
	var w := ProtoBetting.settle(card, "a") # forced for the payout math check
	_check("settle names the winner ('%s')" % w, w == "a")
	_check("the winning ticket pays stake × odds × (1 − vig) = %d (157 expected)" % int(t_win["paid"]),
		int(t_win["paid"]) == int(floor(100.0 * 1.75 * 0.9)))
	_check("losing tickets pay NOTHING", int(t_lose["paid"]) == 0)
	_check("the FIX flag rides the ticket (the crime pipeline's hook, not the book's business)",
		bool(t_fix["fixed"]))
	_check("a settled card never settles twice", ProtoBetting.settle(card, "c") == "a")

	# --- determinism + the strength law over many seeded days --------------------------
	var wins := {"a": 0, "b": 0, "c": 0}
	for day in range(1, 301):
		var c2: Dictionary = ProtoBetting.open_card("v", day, entrants)
		var w2 := ProtoBetting.settle(c2)
		wins[w2] = int(wins[w2]) + 1
		var c3: Dictionary = ProtoBetting.open_card("v", day, entrants)
		if ProtoBetting.settle(c3) != w2:
			wins["mismatch"] = 1
	_check("the same (venue, day) ALWAYS runs the same result (no alt-F4 rerolls)", not wins.has("mismatch"))
	_check("winners follow the visible strengths (a %d > b %d > c %d over 300 days)"
			% [wins["a"], wins["b"], wins["c"]],
		int(wins["a"]) > int(wins["b"]) and int(wins["b"]) > int(wins["c"]) and int(wins["c"]) > 0)

	# --- race day at the Meridian grandstand builds from rig rows -----------------------
	var rc: Dictionary = ProtoBetting.race_card("meridian_grandstand", 4)
	_check("race day fields 4 named racers off vehicle rows", (rc["entrants"] as Array).size() == 4)
	var strengths_ok := true
	for e2 in rc["entrants"]:
		if float(e2["strength"]) < 0.2 or float(e2["strength"]) > 1.5:
			strengths_ok = false
	_check("...with strengths in the honest band (0.2–1.5, priced off engine rows)", strengths_ok)
	var rc2: Dictionary = ProtoBetting.race_card("meridian_grandstand", 4)
	_check("...and the SAME day fields the SAME card (seeded)",
		String((rc["entrants"] as Array)[0]["name"]) == String((rc2["entrants"] as Array)[0]["name"]))

	print("BET RESULTS: %d passed, %d failed" % [passed, failed])
	print("BET: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
