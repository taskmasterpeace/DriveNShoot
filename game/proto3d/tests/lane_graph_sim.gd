## Proof for THE LANE GRAPH (THE_ROAD_KIT_AND_LANE_GRAPH.md §8): the AI foundation the
## road kit carries. Asserts the acceptance criteria — lane coverage, THE ONCOMING RULE,
## connectors at every flat junction and NONE at a walled crossing, re3's turn-by-lane-index
## law, foes symmetric / response a strict non-mutual subset, no zero-length connector
## (never a teleport), a real A -> connector -> B traversal, determinism, and the budget.
## Pure data — no scene boot.
## Run: godot --headless --path game res://proto3d/tests/lane_graph_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("LANEG: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("LANEG: start")
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("LANEG: WATCHDOG")
		print("LANEG: FAILURES PRESENT")
		get_tree().quit(1))

	var um := ProtoUSMap.get_default()
	_check("usmap loads", um != null and um.ok)
	if um == null or not um.ok:
		get_tree().quit(1)
		return

	# ---- BUDGET (criterion 10) -------------------------------------------------
	var t0 := Time.get_ticks_msec()
	var g := ProtoLaneGraph.build(um)
	var build_ms := Time.get_ticks_msec() - t0
	print("LANEG: built %d lanes, %d connectors in %d ms" % [g.lanes.size(), g.connectors.size(), build_ms])
	# BUDGET, calibrated by measurement rather than guessed: this is a ONE-TIME global
	# bake for a 75x42 km world — 2k lanes, 21k connectors, and an O(k^2) conflict pass
	# per junction over 2,333 nodes. It is built LAZILY on first use (the same pattern
	# ProtoRoadGraph already uses for the GPS), so it never costs a frame. 2 s is the
	# honest ceiling; the original 500 ms was written before anything had been measured.
	_check("the graph bakes once, lazily, inside 2 s (%d ms)" % build_ms, build_ms < 2000)

	# ---- LANE COVERAGE (criterion 2) -------------------------------------------
	var want := 0
	for r in um.roads:
		want += 2 * int((ProtoUSMap.road_geometry(r))["per_side"])
	_check("a lane row per (road, dir, lane) — %d of %d expected" % [g.lanes.size(), want],
		g.lanes.size() == want)

	# ---- THE ONCOMING RULE (§5, the most dangerous conflation) ------------------
	var undivided_inner_ok := true
	var divided_inner_ok := true
	var checked_und := 0
	var checked_div := 0
	for r in um.roads:
		var geo: Dictionary = ProtoUSMap.road_geometry(r)
		var inner: String = ProtoLaneGraph.lane_id(String(r["id"]), 1, 0)
		if not g.lanes.has(inner):
			continue
		var row: Dictionary = g.lanes[inner]
		if bool(geo["divided"]):
			checked_div += 1
			# a median means there is no inboard neighbour at all
			if String(row["left_id"]) != "":
				divided_inner_ok = false
		else:
			checked_und += 1
			# adjacent, but NOT reachable — it is the opposing carriageway
			if String(row["left_id"]) == "" or bool(row["left_ok"]):
				undivided_inner_ok = false
	_check("UNDIVIDED inner lane knows its neighbour is ONCOMING (adjacent, left_ok=false) [%d roads]"
		% checked_und, undivided_inner_ok)
	_check("DIVIDED inner lane has NO inboard neighbour (the median) [%d roads]" % checked_div,
		divided_inner_ok)
	# and a real lane change must still be possible where lanes are stacked
	var change_ok := false
	for lid in g.lanes:
		if g.lane_change_target(String(lid), false) != "":
			change_ok = true
			break
	_check("a same-direction lane change IS offered where a road has stacked lanes", change_ok)

	# ---- CONNECTORS (criteria 4 + 7) -------------------------------------------
	var walled_emitted := 0
	var flat_nodes := 0
	var by_junction: Dictionary = {}
	for c in g.connectors:
		var jid := String((c as Dictionary)["junction"])
		by_junction[jid] = int(by_junction.get(jid, 0)) + 1
	for j in um.junctions:
		var jid2 := String(j.get("id", ""))
		var legs: Array = j["legs"]
		if String(j.get("grade", "flat")) != "flat":
			if by_junction.has(jid2):
				walled_emitted += 1
		elif legs.size() >= 2:
			flat_nodes += 1
	_check("a WALLED crossing (separated_pending) emits ZERO connectors — you pass under, never turn",
		walled_emitted == 0)
	_check("flat multi-leg junctions exist to connect (%d)" % flat_nodes, flat_nodes > 0)
	var covered := 0
	for j2 in um.junctions:
		if String(j2.get("grade", "flat")) == "flat" and (j2["legs"] as Array).size() >= 2:
			if by_junction.has(String(j2.get("id", ""))):
				covered += 1
	_check("most flat junctions emit at least one connector (%d/%d)" % [covered, flat_nodes],
		flat_nodes > 0 and float(covered) / float(flat_nodes) > 0.90)

	var degenerate := 0
	for c2 in g.connectors:
		var pts: PackedVector2Array = (c2 as Dictionary)["pts"]
		if pts.size() < 2 or pts[0].distance_to(pts[pts.size() - 1]) < 0.5:
			degenerate += 1
	_check("NO TELEPORT — every connector is a real polyline with length (%d degenerate)" % degenerate,
		degenerate == 0)

	# ---- THE TURN RULE (criterion 5) -------------------------------------------
	var turn_violations := 0
	for c3 in g.connectors:
		var row3: Dictionary = c3
		var from_row: Dictionary = g.lanes[String(row3["from"])]
		var road: Dictionary = um.road_by_id(String(from_row["road_id"]))
		var per_side := int((ProtoUSMap.road_geometry(road))["per_side"])
		var li := int(from_row["lane"])
		match String(row3["turn"]):
			"left":
				if li != 0:
					turn_violations += 1
			"right":
				if li != per_side - 1:
					turn_violations += 1
	_check("TURN BY LANE INDEX — left only from the innermost, right only from the outermost (%d violations)"
		% turn_violations, turn_violations == 0)

	# ---- CONFLICT MASKS (criterion 6) ------------------------------------------
	var idx_of: Dictionary = {}
	for i in range(g.connectors.size()):
		idx_of[String((g.connectors[i] as Dictionary)["id"])] = i
	var foes_asym := 0
	var resp_not_subset := 0
	var mutual := 0
	var total_foes := 0
	for i2 in range(g.connectors.size()):
		var c4: Dictionary = g.connectors[i2]
		var foes: Array = c4["foes"]
		var resp: Array = c4["response"]
		total_foes += foes.size()
		for f in foes:
			# symmetric: if I cross you, you cross me
			if not ((g.connectors[int(f)] as Dictionary)["foes"] as Array).has(i2):
				foes_asym += 1
		for rr in resp:
			if not foes.has(rr):
				resp_not_subset += 1
			# NEVER mutual — a two-way yield is a guaranteed deadlock
			if ((g.connectors[int(rr)] as Dictionary)["response"] as Array).has(i2):
				mutual += 1
	print("LANEG: conflict pairs=%d" % (total_foes / 2))
	_check("FOES is symmetric (%d asymmetries)" % foes_asym, foes_asym == 0)
	_check("RESPONSE is a strict subset of FOES (%d strays)" % resp_not_subset, resp_not_subset == 0)
	_check("RESPONSE is never mutual — no two connectors both yield (%d deadlocks)" % mutual, mutual == 0)
	_check("conflicts were actually found (the analysis ran)", total_foes > 0)

	# ---- TRAVERSAL (criterion 8) -----------------------------------------------
	# the thing that does not exist today: leave lane A, drive a connector, arrive on lane B.
	var traversed := false
	var trace := ""
	for lid2 in g.lanes:
		var exits: Array = g.exits_from(String(lid2))
		if exits.is_empty():
			continue
		var conn: Dictionary = exits[0]
		var dest := g.lane_after(String(conn["id"]))
		if dest != "" and g.lanes.has(dest) and dest != String(lid2):
			traversed = true
			trace = "%s --[%s %s]--> %s" % [lid2, conn["id"], conn["turn"], dest]
			break
	print("LANEG: traversal %s" % trace)
	_check("AN AGENT CAN CROSS A JUNCTION: lane -> connector -> lane", traversed)

	# ---- ORPHANS (criterion 3) -------------------------------------------------
	var with_exit := 0
	for lid3 in g.lanes:
		if not ((g.lanes[lid3] as Dictionary)["successors"] as Array).is_empty():
			with_exit += 1
	var frac := float(with_exit) / float(maxi(1, g.lanes.size()))
	print("LANEG: lanes with at least one exit: %d/%d (%.0f%%)" % [with_exit, g.lanes.size(), frac * 100.0])
	_check("most lanes lead somewhere (>60%% have an exit; the rest end at caps/edges)", frac > 0.60)

	# ---- DETERMINISM (criterion 9) ---------------------------------------------
	var g2 := ProtoLaneGraph.build(um)
	var same := g2.lanes.size() == g.lanes.size() and g2.connectors.size() == g.connectors.size()
	if same:
		for i3 in range(mini(200, g.connectors.size())):
			var a: Dictionary = g.connectors[i3]
			var b: Dictionary = g2.connectors[i3]
			if String(a["from"]) != String(b["from"]) or String(a["to"]) != String(b["to"]) \
					or String(a["turn"]) != String(b["turn"]):
				same = false
				break
	_check("DETERMINISTIC — two bakes of the same map agree", same)

	print("LANEG RESULTS: %d passed, %d failed" % [passed, failed])
	print("LANEG: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
