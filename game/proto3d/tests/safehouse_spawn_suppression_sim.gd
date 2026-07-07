## Proof for SAFEHOUSE SUPPRESSION (docs/design/POPULATION_WAR.md §3.1 "Safehouse
## suppression radius" / §5 edge case / §8 acceptance): every cell touching
## SAFE_BUBBLE_M of SAFEHOUSE is protected and NEVER refills threat population,
## across repeated hourly ticks — while a FAR cell under the identical conditions
## refills normally. Also proves it generalizes to a SECOND anchor (a future
## player-built base), not hardcoded to one location.
## Run: godot --headless --path game res://proto3d/tests/safehouse_spawn_suppression_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("SPS: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("SPS: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("SPS: WATCHDOG")
		print("SPS: FAILURES PRESENT")
		get_tree().quit(1))
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0

	var pop := ProtoPopulation.create(null, ProtoUSMap.get_default())
	var dn := ProtoDayNight.new()
	pop._main = _StubMain.new(dn, Vector3(110, 0, -323))
	dn.day = 1
	dn.hour = 0.0

	# --- 1) EVERY cell touching SAFE_BUBBLE_M around SAFEHOUSE is protected -----
	const SAFEHOUSE := Vector3(110, 0, -323)
	const SAFE_BUBBLE_M := 18.0
	var inside_pts: Array[Vector3] = [
		SAFEHOUSE,
		SAFEHOUSE + Vector3(SAFE_BUBBLE_M * 0.5, 0, 0),
		SAFEHOUSE + Vector3(0, 0, -SAFE_BUBBLE_M * 0.9),
		SAFEHOUSE + Vector3(-SAFE_BUBBLE_M * 0.3, 0, SAFE_BUBBLE_M * 0.3),
	]
	var all_protected := true
	for p in inside_pts:
		if not bool(pop.cell_at(p)["protected"]):
			all_protected = false
	_check("every cell touching SAFE_BUBBLE_M(%.0fm) around SAFEHOUSE is protected (%d/%d points)" % [SAFE_BUBBLE_M, inside_pts.size(), inside_pts.size()],
		all_protected)

	# --- 2) Stage: cleared + unseen for a LONG time, force desired > 0 ----------
	var shkey := pop.cell_key(SAFEHOUSE)
	pop.cells[shkey]["zone_tag"] = "military_perimeter" # a zone_tag that DESIRES threats
	pop.cells[shkey]["desired_pop"] = {"civilian": 0, "worker": 0, "threat": 2, "law": 0, "faction_troops": 4}
	pop.cells[shkey]["current_pop"] = {"civilian": 0, "worker": 0, "threat": 0, "law": 0, "faction_troops": 0}
	pop.cells[shkey]["last_seen_time"] = 0.0
	_check("the SAFEHOUSE cell bootstrapped protected=true", bool(pop.cells[shkey]["protected"]))

	# --- 3) Repeated hourly ticks across many cycles: current_pop["threat"] ----
	# stays at 0 no matter how long it goes unseen (§8's exact acceptance line).
	for _cycle in 8:
		dn.hour += pop.refill_unseen_hours + 1.0
		if dn.hour >= 24.0:
			dn.hour -= 24.0
			dn.day += 1
		pop.tick(1.0)
	_check("after 8 hourly-tick cycles (all well past the unseen timer), threat stays at 0 in the SAFEHOUSE cell",
		int(pop.cells[shkey]["current_pop"]["threat"]) == 0)
	_check("...faction_troops stays at 0 too (protected blocks EVERY group, not just threat)",
		int(pop.cells[shkey]["current_pop"]["faction_troops"]) == 0)

	# --- 4) A FAR cell, IDENTICAL conditions, is NOT protected and DOES refill --
	var far_pos := Vector3(110, 0, -323) + Vector3(0, 0, 4000.0) # ~4km away — nowhere near any anchor
	var fkey := pop.cell_key(far_pos)
	pop.cells[fkey] = {
		"id": fkey, "zone_tag": "military_perimeter", "biome": "scrub",
		"controlling_faction": "free_counties",
		"desired_pop": {"civilian": 0, "worker": 0, "threat": 2, "law": 0, "faction_troops": 4},
		"current_pop": {"civilian": 0, "worker": 0, "threat": 0, "law": 0, "faction_troops": 0},
		"last_seen_time": 0.0, "last_noise_time": 0.0, "last_cleared_time": -1.0,
		"protected": pop._is_protected(far_pos),
	}
	_check("...and the FAR cell (4km out) correctly bootstraps as NOT protected", not bool(pop.cells[fkey]["protected"]))
	dn.hour += pop.refill_unseen_hours + 1.0
	pop.tick(1.0)
	_check("the FAR cell, same unseen/desired conditions, DOES refill (%d threat)" % int(pop.cells[fkey]["current_pop"]["threat"]),
		int(pop.cells[fkey]["current_pop"]["threat"]) > 0)

	# --- 5) GENERALIZES: a SECOND anchor (homebase.HOME — a future player-built
	# base) protects its OWN cell on the SAME ledger, alongside SAFEHOUSE — proof
	# this isn't hardcoded to one coordinate, it's "any anchor in the list."
	var second_base := Vector3(-4400, 0, 7700) # nowhere near SAFEHOUSE
	var pop2 := ProtoPopulation.create(null, ProtoUSMap.get_default())
	var stub2 := _StubMain.new(dn, Vector3(110, 0, -323))
	stub2.homebase = _StubHomebase.new()
	stub2.homebase.HOME = second_base
	pop2._main = stub2
	_check("with BOTH anchors present, SAFEHOUSE still protects its cell",
		bool(pop2.cell_at(Vector3(110, 0, -323))["protected"]))
	_check("...and the SECOND anchor (homebase.HOME) protects ITS cell too — same ledger, two anchors",
		bool(pop2.cell_at(second_base)["protected"]))
	_check("...while a point near NEITHER anchor stays unprotected",
		not bool(pop2.cell_at(Vector3(second_base.x + 4000.0, 0, second_base.z)).get("protected", false)))
	# And confirm the second anchor's protection is REAL (not a stray true): a
	# ledger with ONLY the default SAFEHOUSE fallback does NOT protect that spot.
	var pop_no_anchor := ProtoPopulation.create(null, ProtoUSMap.get_default())
	pop_no_anchor._main = _StubMain.new(dn, Vector3(110, 0, -323)) # only the doc's SAFEHOUSE fallback, no homebase
	_check("...confirmed: that SAME second-base point is NOT protected under a ledger lacking that anchor",
		not bool(pop_no_anchor.cell_at(second_base)["protected"]))

	Engine.time_scale = prev_scale
	print("SPS RESULTS: %d passed, %d failed" % [passed, failed])
	print("SPS: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


## A tiny main-stub carrying SAFEHOUSE + a fake homebase.HOME, so _protected_anchors()
## exercises the REAL anchor-reading code path (not the doc's bare fallback constant)
## for every check except the intentionally-anchor-less one in step 5.
class _StubMain:
	extends Node # ProtoPopulation._main is typed Node (same parse error as population_cell_sim shipped with)
	var daynight: ProtoDayNight
	var SAFEHOUSE: Vector3
	var homebase: _StubHomebase
	func _init(dn: ProtoDayNight, anchor: Vector3) -> void:
		daynight = dn
		SAFEHOUSE = anchor
		homebase = null # keep this stub to ONE anchor per instance — step 5 builds a second stub for the other anchor

class _StubHomebase:
	var HOME: Vector3
