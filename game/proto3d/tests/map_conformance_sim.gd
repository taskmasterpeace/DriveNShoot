## THE MAP CONFORMANCE SWEEP (THE_MAPMAKER'S_EYE GAP 1 + owner /goal 2026-07-18:
## "improve every city — no dead ends, no misaligned exits, no unorganized cities").
## The cross-cutting contract: the drawn map and the built world agree. Proves,
## across ALL 59 towns and 531 roads, that:
##   1. NO ramp crosses its own highway (the mirror-ramp bake defect dies here).
##   2. NO road dead-ends in empty country (end_caps live only at towns, payloads,
##      or the map edge).
##   3. EVERY non-authored town has ONE connected street network wired to the road net.
##   4. EVERY exit's ramps reach the town they serve, and every exit lets you back
##      on (a return ramp — an exit is not a one-way trap).
##   5. EVERY placement sits on the road net (reachable, not marooned).
## Pure data — no scene boot. Measure-first: RED until the overhaul lands, then the
## goal's done-signal. Run:
##   Godot --headless --path game res://proto3d/tests/map_conformance_sim.tscn
extends Node

const CELL_M := 500.0
const EDGE_TOL := 1600.0          # an interstate may leave the map within this of the border
const TOWN_TOL := 1300.0          # an end_cap inside a town is a street terminus, not a dead end
const PAYLOAD_TOL := 130.0        # a dirt spur ending AT its farm/quarry is a destination, not a dead end
const GRID_JOIN_TOL := 36.0       # two streets share a corner within this (grid spacing is 62-80 m)
const RAMP_MOUTH_TOL := 26.0      # ignore the legitimate ramp/highway touch at the mouth
const EXIT_REACH_TOL := 460.0     # a ramp "reaches" its town within this of centre
const PLACEMENT_REACH_TOL := 140.0

var passed := 0
var failed := 0
var _um: ProtoUSMap


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CONF: %s - %s" % ["PASS" if ok else "FAIL", check_name])


# ---- geometry helpers --------------------------------------------------------
func _seg_hit(a1: Vector2, a2: Vector2, b1: Vector2, b2: Vector2) -> Variant:
	# proper segment-segment intersection point, or null (any angle)
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
	return a1 + d1 * t


func _pt_seg_dist(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab := b - a
	var l2 := ab.length_squared()
	if l2 < 1e-9:
		return p.distance_to(a)
	var t := clampf((p - a).dot(ab) / l2, 0.0, 1.0)
	return p.distance_to(a + ab * t)


func _near_map_edge(p: Vector2) -> bool:
	var mn := _um.offset
	var mx := _um.offset + Vector2(_um.w * CELL_M, _um.h * CELL_M)
	return p.x - mn.x < EDGE_TOL or mx.x - p.x < EDGE_TOL or p.y - mn.y < EDGE_TOL or mx.y - p.y < EDGE_TOL


func _dist_to_road(p: Vector2, r: Dictionary) -> float:
	var pts: PackedVector2Array = r["pts"]
	var best := 1e18
	for i in range(pts.size() - 1):
		best = minf(best, _pt_seg_dist(p, pts[i], pts[i + 1]))
	return best


func _ready() -> void:
	print("CONF: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("CONF: WATCHDOG")
		print("CONF: FAILURES PRESENT")
		get_tree().quit(1))

	_um = ProtoUSMap.get_default()
	_check("usmap loads", _um != null and _um.ok)
	if _um == null or not _um.ok:
		get_tree().quit(1)
		return

	var roads: Array = _um.roads
	var towns: Array = _um.towns
	var placements: Array = _um.placements
	var exits: Array = _um.exits
	var junctions: Array = _um.junctions
	var road_by_id := {}
	for r in roads:
		road_by_id[String(r["id"])] = r

	# ===== 1) NO RAMP CROSSES ITS OWN HIGHWAY ================================
	# For each exit ramp, find the highway it serves and test whether the ramp
	# polyline crosses the highway centreline anywhere past the mouth.
	var ramp_to_hwy := {}
	for ex in exits:
		var hid := String(ex["highway_id"])
		for rid in ex["ramp_ids"]:
			ramp_to_hwy[String(rid)] = hid
	var ramp_cross := 0
	var ramp_cross_ids: Array = []
	for r in roads:
		if String(r["kind"]) != "exit":
			continue
		var hid := String(ramp_to_hwy.get(String(r["id"]), ""))
		if hid == "" or not road_by_id.has(hid):
			continue
		var rpts: PackedVector2Array = r["pts"]
		if rpts.size() < 2:
			continue
		var start: Vector2 = rpts[0]
		var hpts: PackedVector2Array = (road_by_id[hid] as Dictionary)["pts"]
		var crossed := false
		for i in range(rpts.size() - 1):
			for k in range(hpts.size() - 1):
				var hit: Variant = _seg_hit(rpts[i], rpts[i + 1], hpts[k], hpts[k + 1])
				if hit == null:
					continue
				if (hit as Vector2).distance_to(start) > RAMP_MOUTH_TOL:
					crossed = true
		if crossed:
			ramp_cross += 1
			ramp_cross_ids.append(String(r["id"]))
	print("CONF: ramps crossing their own highway = %d %s" % [ramp_cross, str(ramp_cross_ids.slice(0, 8))])
	_check("no exit ramp crosses its own highway (mirror-ramp defect)", ramp_cross == 0)

	# ===== 2) NO DEAD END IN EMPTY COUNTRY ==================================
	# an interchange LANDING (where a cross-street meets its off/on ramps) is
	# reachable and leaveable via those ramps — not a dead end. Grandfather any
	# end_cap sitting on an exit-ramp endpoint.
	var ramp_ends: Array = []
	for r in roads:
		if String(r["kind"]) == "exit":
			var rp: PackedVector2Array = r["pts"]
			if rp.size() > 0:
				ramp_ends.append(rp[0])
				ramp_ends.append(rp[rp.size() - 1])
	var wild := 0
	var wild_list: Array = []
	for j in junctions:
		if String(j["kind"]) != "end_cap":
			continue
		var p: Vector2 = j["pos"]
		if _near_map_edge(p):
			continue
		var ok_here := false
		for t in towns:
			if p.distance_to(t["pos"] as Vector2) <= TOWN_TOL:
				ok_here = true
				break
		if not ok_here:
			for pl in placements:
				if p.distance_to(pl["pos"] as Vector2) <= PAYLOAD_TOL:
					ok_here = true
					break
		if not ok_here:
			for re in ramp_ends:
				if p.distance_to(re as Vector2) <= 70.0:
					ok_here = true
					break
		if not ok_here:
			wild += 1
			var rid := "?"
			if (j["legs"] as Array).size() > 0:
				rid = String((j["legs"][0] as Dictionary)["road"])
			wild_list.append("%s@(%d,%d)" % [rid, int(p.x), int(p.y)])
	print("CONF: wild dead-ends (road stops in open country) = %d %s" % [wild, str(wild_list.slice(0, 12))])
	_check("no road dead-ends in empty country", wild == 0)

	# ===== 3) EVERY NON-AUTHORED TOWN: ONE CONNECTED GRID, WIRED TO THE NET ==
	var disc_towns := 0
	var disc_list: Array = []
	for t in towns:
		if bool(t.get("authored", false)):
			continue
		var prefix := "ST-%s-" % String(t["id"])
		var streets: Array = []
		for r in roads:
			if String(r["id"]).begins_with(prefix):
				streets.append(r)
		if streets.is_empty():
			disc_towns += 1
			disc_list.append("%s(no-grid)" % String(t["id"]))
			continue
		# union-find over streets sharing a corner within GRID_JOIN_TOL
		var parent := {}
		for i in range(streets.size()):
			parent[i] = i
		var find := func(a: int) -> int:
			while parent[a] != a:
				parent[a] = parent[parent[a]]
				a = parent[a]
			return a
		var ends := []
		for r in streets:
			var pts: PackedVector2Array = r["pts"]
			ends.append([pts[0], pts[pts.size() - 1]])
		for i in range(streets.size()):
			for k in range(i + 1, streets.size()):
				var joined := false
				for ea in ends[i]:
					for eb in ends[k]:
						if (ea as Vector2).distance_to(eb as Vector2) <= GRID_JOIN_TOL:
							joined = true
				if joined:
					var ra: int = find.call(i)
					var rb: int = find.call(k)
					if ra != rb:
						parent[ra] = rb
		var comps := {}
		for i in range(streets.size()):
			comps[find.call(i)] = true
		# wired to the network: a street endpoint meets a non-street road nearby
		var wired := false
		for r in streets:
			var pts: PackedVector2Array = r["pts"]
			for endp in [pts[0], pts[pts.size() - 1]]:
				for other in roads:
					if String(other["id"]).begins_with("ST-"):
						continue
					if _dist_to_road(endp, other) <= GRID_JOIN_TOL * 1.6:
						wired = true
						break
				if wired:
					break
			if wired:
				break
		var town_ok: bool = comps.size() == 1 and wired
		if not town_ok:
			disc_towns += 1
			disc_list.append("%s(comp=%d,wired=%s)" % [String(t["id"]), comps.size(), str(wired)])
	print("CONF: towns with a broken/disconnected street grid = %d / %d" % [disc_towns, _non_authored(towns)])
	print("CONF:   %s" % str(disc_list.slice(0, 16)))
	_check("every non-authored town has ONE connected grid wired to the net", disc_towns == 0)

	# ===== 4) EXITS: RAMPS REACH THE TOWN + A RETURN RAMP EXISTS =============
	var authored_towns := {}
	for t in towns:
		if bool(t.get("authored", false)):
			authored_towns[String(t["id"])] = true
	var not_reaching := 0
	var one_way := 0
	var nr_list: Array = []
	for ex in exits:
		var tid := String(ex["town_id"])
		if tid != "":
			var tc := Vector2.ZERO
			var found_t := false
			for t in towns:
				if String(t["id"]) == tid:
					tc = t["pos"]
					found_t = true
					break
			if found_t:
				var reaches := false
				for rid in ex["ramp_ids"]:
					if not road_by_id.has(String(rid)):
						continue
					var rpts: PackedVector2Array = (road_by_id[String(rid)] as Dictionary)["pts"]
					for pv in rpts:
						if (pv as Vector2).distance_to(tc) <= EXIT_REACH_TOL:
							reaches = true
							break
					if reaches:
						break
				if not reaches:
					not_reaching += 1
					nr_list.append("%s->%s" % [String(ex["id"]), tid])
		# return ramp: every exit should let you back onto the highway. Authored
		# interchanges (Meridian) are hand-built and leave via their county roads —
		# grandfathered (no generated ramp may intrude on the authored core).
		if not bool(ex["has_return_ramp"]) and not authored_towns.has(String(ex["town_id"])):
			one_way += 1
	print("CONF: exits whose ramps miss their town = %d %s" % [not_reaching, str(nr_list.slice(0, 10))])
	print("CONF: one-way exits (no way back onto the highway) = %d / %d" % [one_way, exits.size()])
	_check("every exit's ramps reach the town they serve", not_reaching == 0)
	_check("no one-way exit (every exit has a return ramp)", one_way == 0)

	# ===== 5) EVERY PLACEMENT SITS ON THE ROAD NET ==========================
	var marooned := 0
	var mar_list: Array = []
	for pl in placements:
		var pp: Vector2 = pl["pos"]
		var near := false
		for r in roads:
			if _dist_to_road(pp, r) <= PLACEMENT_REACH_TOL:
				near = true
				break
		if not near: # a rail station is reached by rail, not road — that counts
			for rr in _um.rails:
				if _dist_to_road(pp, rr) <= PLACEMENT_REACH_TOL:
					near = true
					break
		if not near:
			marooned += 1
			if mar_list.size() < 10:
				mar_list.append(String(pl["id"]))
	print("CONF: marooned placements (no road within %dm) = %d %s" % [int(PLACEMENT_REACH_TOL), marooned, str(mar_list)])
	_check("every placement is reachable from a road", marooned == 0)

	print("CONF RESULTS: %d passed, %d failed" % [passed, failed])
	print("CONF: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _non_authored(towns: Array) -> int:
	var n := 0
	for t in towns:
		if not bool(t.get("authored", false)):
			n += 1
	return n
