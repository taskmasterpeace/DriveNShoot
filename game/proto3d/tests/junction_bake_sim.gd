## Proof for THE JUNCTION BAKE + ROAD GRAPH (AMERICAN_ROAD M1, rulings 0.2-0.5):
## the baked junctions[] fold typed; THE RIRO LAW holds (a ramp NEVER opens the
## median); the blind-crossing roster is a bake OUTPUT and this sim's own
## independent seg-x-seg audit finds ZERO unbaked crossings; I-95 x I-40 (the
## first grade-sep the player sees, ~900 m from Meridian) is separated_pending;
## THE GAP FORMULA's worked example computes; exit ramp_ids are live (the 0.5
## dead-code fix); and route() is Dijkstra on TIME (the interstate wins).
## Pure data — no scene boot.
## Run: godot --headless --path game res://proto3d/tests/junction_bake_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("JBAKE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _seg_cross(a1: Vector2, a2: Vector2, b1: Vector2, b2: Vector2) -> Variant:
	var d1 := a2 - a1
	var d2 := b2 - b1
	var den := d1.x * d2.y - d1.y * d2.x
	if absf(den) < 1e-9:
		return null
	var dp := b1 - a1
	var t := (dp.x * d2.y - dp.y * d2.x) / den
	var u := (dp.x * d1.y - dp.y * d1.x) / den
	if t < 0.0 or t > 1.0 or u < 0.0 or u > 1.0:
		return null
	var ang := rad_to_deg(acos(clampf(absf(d1.normalized().dot(d2.normalized())), 0.0, 1.0)))
	if ang < 15.0:
		return null
	return a1 + d1 * t


func _ready() -> void:
	print("JBAKE: start")
	get_tree().create_timer(45.0).timeout.connect(func() -> void:
		print("JBAKE: WATCHDOG")
		print("JBAKE: FAILURES PRESENT")
		get_tree().quit(1))

	var um := ProtoUSMap.get_default()
	_check("usmap loads", um != null and um.ok)

	# --- 1) The fold + schema ---------------------------------------------------
	_check("junctions[] folded (%d rows, >= 150)" % um.junctions.size(), um.junctions.size() >= 150)
	var kinds_ok := true
	var mouths := 0
	var riro_ok := true
	var pending := 0
	for j in um.junctions:
		if not ["tee", "cross", "ramp_mouth", "ramp_rejoin", "end_cap"].has(String(j["kind"])):
			kinds_ok = false
		if String(j["kind"]) == "ramp_mouth":
			mouths += 1
			if String(j["control"]) != "riro":
				riro_ok = false
		if String(j["kind"]) == "ramp_rejoin" and String(j["control"]) == "gap":
			riro_ok = false
		if String(j["grade"]) == "separated_pending" or String(j["grade"]) == "deck":
			pending += 1
	_check("every kind is in the 0.2 enum", kinds_ok)
	# THE MOUTH LAW: assert the INVARIANT (every exit owns a ramp_mouth), never a
	# frozen count — minting a city exit legitimately grows both sides together.
	_check("every exit has a ramp_mouth node (%d exits / %d mouths)" % [um.exits.size(), mouths],
		mouths == um.exits.size())
	_check("THE RIRO LAW: no ramp mouth/rejoin EVER opens the median (control never 'gap')", riro_ok)
	# 1B: the overpass bake DECKS every pending crossing — the triage law now
	# reads pending+deck together (grade separation exists either way).
	_check("divided x divided crossings triage to grade separation (%d pending+deck, >= 7)" % pending, pending >= 7)

	# --- 2) I-95 x I-40 — the named first grade-sep (0.4) ------------------------
	var i9540 := false
	for j in um.junctions:
		if not (String(j["grade"]) in ["separated_pending", "deck"]):
			continue
		var road_ids: Array = j["legs"].map(func(l: Dictionary) -> String: return String(l["road"]))
		if road_ids.has("I-95") and road_ids.has("I-40") and (j["pos"] as Vector2).distance_to(Vector2(-708, 3724)) < 50.0:
			i9540 = true
	_check("I-95 x I-40 exists at (-708, 3724) — its DECK stands (1B)", i9540)

	# --- 3) THE GAP FORMULA worked example (0.3) ----------------------------------
	var gap_ok := false
	var checked_gap := false
	for j in um.junctions:
		if String(j["kind"]) != "tee" or String(j["control"]) != "gap":
			continue
		for l in j["legs"]:
			var other := um.road_by_id(String(l["road"]))
			if other.is_empty():
				continue
			var g: Dictionary = ProtoUSMap.road_geometry(other)
			if bool(g["divided"]) and int(g["lanes"]) == 6:
				# the gap this junction opens in the OTHER leg's barrier
				for l2 in j["legs"]:
					if String(l2["road"]) == String(l["road"]):
						continue
					var gh: float = um.junction_gap_half(j, String(l2["road"]))
					checked_gap = true
					if absf(gh - 19.6) < 0.05:
						gap_ok = true
	_check("the worked gap example: a 6-lane divided cross road opens 13.6 + 6.0 = 19.6 m each side",
		checked_gap and gap_ok)

	# --- 4) THE INDEPENDENT AUDIT (0.4): zero unbaked crossings remain ------------
	var network: Array = []
	for r in um.roads:
		if String(r.get("kind", "")) != "exit":
			network.append(r)
	var unbaked := 0
	for i in range(network.size()):
		for k in range(i + 1, network.size()):
			var A: Dictionary = network[i]
			var B: Dictionary = network[k]
			for si in range((A["pts"] as Array).size() - 1):
				for sk in range((B["pts"] as Array).size() - 1):
					var hit: Variant = _seg_cross(A["pts"][si], A["pts"][si + 1], B["pts"][sk], B["pts"][sk + 1])
					if hit == null:
						continue
					var covered := false
					for j in um.junctions:
						if (j["pos"] as Vector2).distance_to(hit) <= 40.0:
							covered = true
							break
					if not covered:
						unbaked += 1
						print("JBAKE: UNBAKED crossing %s x %s at %s" % [A["id"], B["id"], hit])
	_check("the independent seg-x-seg audit finds ZERO unbaked crossings", unbaked == 0)

	# --- 5) ramp_ids are LIVE data (the 0.5 dead-code fix) ------------------------
	var mer: Dictionary = {}
	for e in um.exits:
		if String(e["id"]) == "I-95_X1":
			mer = e
	_check("Meridian's exit resolves its ramps by ID (EXIT-meridian + the 0.18b mirror, never a name pattern)",
		not mer.is_empty() and (mer["ramp_ids"] as Array).has("EXIT-meridian")
		and (mer["ramp_ids"] as Array).has("I-95_X1-off-r"))

	# --- 6) THE ROAD GRAPH: Dijkstra on TIME (0.2) --------------------------------
	var graph := ProtoRoadGraph.build(um)
	_check("the graph builds (%d nodes)" % graph.nodes.size(), graph.nodes.size() >= um.junctions.size())
	var rt := graph.route(Vector2(1204, 282), Vector2(10000, -8750)) # Meridian mouth -> I-95's north end
	_check("route(Meridian -> I-95 north end) exists and rides I-95",
		not rt.is_empty() and (rt["roads"] as Array).has("I-95"))
	_check("...at interstate TIME (~len/29 m/s, ±20%%: %.0f s for %.0f m)"
			% [float(rt.get("time_s", 0.0)), float(rt.get("len_m", 0.0))],
		not rt.is_empty() and absf(float(rt["time_s"]) - float(rt["len_m"]) / 29.0) < float(rt["time_s"]) * 0.2)
	# a separated_pending node must NOT allow transfer: no route may turn at one.
	var pending_transfer := false
	if not rt.is_empty():
		for nid in rt["nodes"]:
			var j2: Dictionary = (graph.nodes.get(nid, {}) as Dictionary).get("junction", {})
			if String(j2.get("grade", "flat")) in ["separated_pending", "deck"] and not String(nid).contains("@"):
				pending_transfer = true
	_check("no transfer THROUGH a walled crossing (separated_pending nodes are per-road clones)",
		not pending_transfer)

	print("JBAKE RESULTS: %d passed, %d failed" % [passed, failed])
	print("JBAKE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
