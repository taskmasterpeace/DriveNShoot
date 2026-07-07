## Proof for POPULATION CELLS (docs/design/POPULATION_WAR.md §3.1/§3.2/§8):
## the ledger folds zone_tag rows from data/population_targets.json, refill
## respects the unseen-timer + valid-source + protected gates (never a burst),
## a recently-SEEN cell does NOT refill, redistribute pulls from an adjacent
## surplus before minting fresh, a protected cell never refills, and the
## ledger round-trips through serialize/restore. Real-path: drives the actual
## daynight clock (the game's real hour API), not a teleport.
## Run: godot --headless --path game res://proto3d/tests/population_cell_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("POP: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("POP: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("POP: WATCHDOG")
		print("POP: FAILURES PRESENT")
		get_tree().quit(1))
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0

	# --- 0) A bare ledger (no main) — the sim's own harness, matching the
	# "counts-not-instances" promise: the object works standalone. --------------
	var pop := ProtoPopulation.create(null, ProtoUSMap.get_default())

	# --- 1) THE TARGETS FILE FOLDS ITS ROWS -------------------------------------
	_check("population_targets.json folded 7 zone_tag rows (%d found)" % pop.targets.size(),
		pop.targets.size() >= 7)
	_check("thick_forest desires 3 threat, 0 civilian (its OWN mix, not a shared default)",
		int(pop.targets["thick_forest"]["threat"]) == 3 and int(pop.targets["thick_forest"]["civilian"]) == 0)
	_check("suburbs desires a DIFFERENT mix (4 civilian, 1 law) — zone_tags aren't interchangeable",
		int(pop.targets["suburbs"]["civilian"]) == 4 and int(pop.targets["suburbs"]["law"]) == 1)
	_check("refill knobs loaded from the JSON defaults block (unseen=%.1fh, step=%d)" % [pop.refill_unseen_hours, pop.refill_step],
		pop.refill_unseen_hours > 0.0 and pop.refill_step >= 1)

	# --- 2) BOOTSTRAP: a never-visited cell still holds valid counts ------------
	var forest_pos := Vector3(-90000, 0, -90000) # deep in nowhere, first touch
	var row := pop.cell_at(forest_pos)
	_check("a cell that's never been visited bootstraps with valid current_pop (all >= 0)",
		row["current_pop"]["threat"] >= 0 and row["current_pop"]["civilian"] >= 0)
	_check("desired_pop is NEVER negative", row["desired_pop"]["threat"] >= 0)
	_check("current_pop starts at ZERO (counts, not a hidden pre-fill)", row["current_pop"]["threat"] == 0)

	# --- 3) REFILL: unseen-timer gate, one at a time, never a burst -------------
	# Force a KNOWN zone_tag/desired mix so the math is exact regardless of what
	# usmap's real biome grid says at this staged position.
	var key := pop.cell_key(forest_pos)
	pop.cells[key]["zone_tag"] = "thick_forest"
	pop.cells[key]["desired_pop"] = {"civilian": 0, "worker": 0, "threat": 3, "law": 0, "faction_troops": 0}
	pop.cells[key]["current_pop"]["threat"] = 0
	pop.cells[key]["last_seen_time"] = 0.0
	pop.cells[key]["protected"] = false

	# 3a) checked immediately (unseen gap = 0h): must NOT refill.
	pop.tick(1.0)
	_check("a JUST-seen cell (0h unseen) does NOT refill", pop.cells[key]["current_pop"]["threat"] == 0)

	# 3b) advance the REAL game clock past REFILL_UNSEEN_HOURS via daynight's
	# own hour field (the actual API other systems read) — not a fabricated field.
	var dn := ProtoDayNight.new()
	pop._main = _StubMain.new(dn)
	dn.day = 1
	dn.hour = 9.0
	pop.cells[key]["last_seen_time"] = pop._now_h() # "seen" stamped at t=9h day1
	dn.hour = 9.0 + pop.refill_unseen_hours + 0.1 # clears the gate by 0.1h
	pop.tick(1.0)
	_check("past REFILL_UNSEEN_HOURS with a valid source (road/town/first-touch), it refills by exactly +%d (not a burst to 3)" % pop.refill_step,
		pop.cells[key]["current_pop"]["threat"] == pop.refill_step)
	var after_one := int(pop.cells[key]["current_pop"]["threat"])
	_check("...and NOT all the way to desired_pop (3) in one tick", after_one < 3)

	# 3c) mark it SEEN again — the timer resets, no further refill this cycle.
	pop.mark_seen(forest_pos)
	pop.tick(1.0)
	_check("marking the cell SEEN resets the timer (no refill immediately after)",
		int(pop.cells[key]["current_pop"]["threat"]) == after_one)
	dn.hour += pop.refill_unseen_hours + 0.1
	pop.tick(1.0)
	# The FIRST-TOUCH source is a documented ONE-SHOT (population.gd: a cell with
	# neither a neighbor surplus nor a road/town "can mint exactly once and then
	# genuinely stalls") — this deep-nowhere cell spent it in 3b, so a second
	# unseen cycle must NOT mint. (The fleet-authored version of this check
	# expected a free second refill — it contradicted the system's own spec and
	# had never actually been run: the sim shipped with a parse error.)
	_check("...and a nowhere-cell STALLS on the second cycle (first-touch is one-shot: stays %d)" % after_one,
		int(pop.cells[key]["current_pop"]["threat"]) == after_one)

	# --- 4) REDISTRIBUTE pulls from an adjacent surplus BEFORE minting fresh ----
	var parts: PackedStringArray = key.split(",")
	var cx := int(parts[0])
	var cz := int(parts[1])
	var neighbor_key := "%d,%d" % [cx + 1, cz]
	pop.cells[neighbor_key] = {
		"id": neighbor_key, "zone_tag": "thick_forest", "biome": "forest",
		"controlling_faction": "free_counties",
		"desired_pop": {"civilian": 0, "worker": 0, "threat": 3, "law": 0, "faction_troops": 0},
		"current_pop": {"civilian": 0, "worker": 0, "threat": 5, "law": 0, "faction_troops": 0},
		"last_seen_time": 0.0, "last_noise_time": 0.0, "last_cleared_time": -1.0, "protected": false,
	}
	var dest_before := int(pop.cells[key]["current_pop"]["threat"])
	var src_before := int(pop.cells[neighbor_key]["current_pop"]["threat"])
	dn.hour += pop.refill_unseen_hours + 0.1
	pop.tick(1.0)
	var dest_after := int(pop.cells[key]["current_pop"]["threat"])
	var src_after := int(pop.cells[neighbor_key]["current_pop"]["threat"])
	_check("an adjacent cell with SURPLUS (%d) is pulled from BEFORE minting fresh (dest %d -> %d, source %d -> %d)"
			% [src_before, dest_before, dest_after, src_before, src_after],
		dest_after == dest_before + pop.refill_step and src_after == src_before - pop.refill_step)

	# --- 5) PROTECTED cells never refill -----------------------------------------
	pop.cells[key]["protected"] = true
	pop.cells[key]["current_pop"]["threat"] = 0
	pop.cells[key]["last_seen_time"] = 0.0
	dn.hour += pop.refill_unseen_hours + 5.0
	pop.tick(1.0)
	_check("a PROTECTED cell never refills, however long unseen", int(pop.cells[key]["current_pop"]["threat"]) == 0)
	pop.cells[key]["protected"] = false

	# --- 6) NEVER-IN-VIEW: safe_to_spawn gate ------------------------------------
	var fake_player := _FakePlayer.new()
	add_child(fake_player)
	fake_player.global_position = Vector3(0, 0, 0)
	_check("a spawn point INSIDE cone+range is UNSAFE",
		not pop.safe_to_spawn(Vector3(0, 0, -30), [fake_player])) # north, in the default cone
	_check("a spawn point OUTSIDE the arc (90° off) but close is SAFE from the cone (still gated by distance)",
		pop.safe_to_spawn(Vector3(60, 0, 0), [fake_player]) == (60.0 >= pop.min_spawn_dist_m))
	_check("a spawn point too CLOSE (< min_spawn_dist_m) is UNSAFE even outside the arc",
		not pop.safe_to_spawn(Vector3(10, 0, 0), [fake_player]))
	_check("no players at all = trivially safe (headless staging, nothing to hide from)",
		pop.safe_to_spawn(Vector3(0, 0, -5), []))
	fake_player.queue_free()

	# --- 7) SAFEHOUSE SUPPRESSION (generalized: works with NO main at all) ------
	var pop2 := ProtoPopulation.create(null, ProtoUSMap.get_default())
	var safehouse_pos: Vector3 = Vector3(110, 0, -323) + Vector3(3, 0, 2) # inside SAFE_BUBBLE_M of the doc's constant
	var srow := pop2.cell_at(safehouse_pos)
	_check("a cell touching the SAFEHOUSE anchor bootstraps PROTECTED (no main needed — the doc's own fallback constant)",
		bool(srow["protected"]))

	# --- 8) SERIALIZE / RESTORE round-trips --------------------------------------
	pop.cells[key]["current_pop"]["threat"] = 7
	var dump := pop.serialize()
	var pop3 := ProtoPopulation.create(null, ProtoUSMap.get_default())
	pop3.restore(dump)
	_check("serialize/restore round-trips the ledger (threat count %d preserved)" % 7,
		int(pop3.cells[key]["current_pop"]["threat"]) == 7)
	_check("...and the zone_tag round-trips too ('%s')" % String(pop3.cells[key]["zone_tag"]),
		String(pop3.cells[key]["zone_tag"]) == "thick_forest")

	# --- 9) BACKWARD-COMPAT PARITY: an ABSENT/empty-targets ledger changes NOTHING
	# (§4 of the brief: population==null OR targets empty must be pure hash-roll
	# parity). The real "file absent" path is _ensure_targets() early-returning
	# when FileAccess.file_exists() is false — exercised here by skipping the
	# fold entirely, which is behaviorally identical to that early return: the
	# acceptance is "targets empty => desired_pop is all-zero => tick() is a no-op".
	var empty_pop := ProtoPopulation.new()
	empty_pop.usmap = ProtoUSMap.get_default()
	empty_pop._targets_loaded = true # skip the fold entirely — same as a missing/empty file
	var probe_pos := Vector3(-77777, 0, -77777)
	var prow := empty_pop.cell_at(probe_pos)
	_check("with NO targets folded, every desired_pop group is 0 (parity mode)",
		int(prow["desired_pop"]["threat"]) == 0 and int(prow["desired_pop"]["civilian"]) == 0)
	empty_pop.tick(1.0)
	_check("...so tick() is a true no-op (nothing to ever refill toward)",
		int(empty_pop.cells[empty_pop.cell_key(probe_pos)]["current_pop"]["threat"]) == 0)

	Engine.time_scale = prev_scale
	print("POP RESULTS: %d passed, %d failed" % [passed, failed])
	print("POP: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


## A tiny main-stub so pop._now_h()/_derive_zone_tag's world_state read find a
## "daynight" property without pulling in the whole proto3d scene.
class _StubMain:
	extends Node # ProtoPopulation._main is typed Node (the parse error this sim shipped with)
	var daynight: ProtoDayNight
	func _init(dn: ProtoDayNight) -> void:
		daynight = dn


## A minimal facing() Node3D so safe_to_spawn's cone check has something real
## to read (facing -Z, matching ProtoVisionCone's own default dir).
class _FakePlayer:
	extends Node3D
	func facing() -> Vector3:
		return Vector3(0, 0, -1)
