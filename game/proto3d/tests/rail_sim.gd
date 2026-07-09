## THE SEABOARD LINE — rail regression (goal 2026-07-09: "a railroad across the map").
## §data (R1): the rail rows are real — line continuity, ≥3 stations, stations ON the line,
## MERIDIAN DEPOT walkable from town, termini at Meridian/Miami.
## Later rows extend this sim: §render (R2), §stations (R3), §ride-the-line (R4).
## Run: Godot_console --headless --path game res://proto3d/tests/rail_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RAIL: %s - %s" % ["PASS" if ok else "FAIL", n])


## Distance from point to a polyline (min over segments).
func _dist_to_line(p: Vector2, pts: PackedVector2Array) -> float:
	var best := INF
	for i in range(pts.size() - 1):
		var q := Geometry2D.get_closest_point_to_segment(p, pts[i], pts[i + 1])
		best = minf(best, p.distance_to(q))
	return best


func _ready() -> void:
	print("RAIL: start")
	var usmap := ProtoUSMap.get_default()
	_check("usmap loads", usmap.ok)

	# --- §data (R1): THE SEABOARD LINE rows ------------------------------------
	_check("a rail row exists", usmap.rails.size() >= 1)
	var line: Dictionary = {}
	for r in usmap.rails:
		if String(r["id"]) == "SEABOARD":
			line = r
			break
	_check("THE SEABOARD LINE is the row", not line.is_empty())
	if line.is_empty():
		print("RAIL RESULTS: %d passed, %d failed" % [passed, failed])
		print("RAIL: FAILURES PRESENT")
		get_tree().quit(1)
		return
	var pts: PackedVector2Array = line["pts"]
	_check("the line has a real polyline (%d pts)" % pts.size(), pts.size() >= 4)
	# Continuity: every segment a sane hop — no zero-length, no teleport.
	var total := 0.0
	var seg_ok := true
	for i in range(pts.size() - 1):
		var seg := pts[i].distance_to(pts[i + 1])
		total += seg
		if seg < 50.0 or seg > 9000.0 or is_nan(seg):
			seg_ok = false
	_check("segments are continuous sane hops (total %.1f km)" % (total / 1000.0), seg_ok)
	_check("the line is a real haul (>15 km)", total > 15000.0)

	var stations: Array = line["stations"]
	_check("at least 3 stations (%d)" % stations.size(), stations.size() >= 3)
	var on_line := true
	for s in stations:
		if _dist_to_line(s["pos"], pts) > 60.0:
			on_line = false
			print("RAIL:   station off the line: %s" % String(s["name"]))
	_check("every station sits ON the line", on_line)

	# The termini serve the right places.
	var meridian := Vector2.ZERO
	var miami := Vector2.ZERO
	for t in usmap.towns:
		if String(t["id"]) == "meridian":
			meridian = t["pos"]
		elif String(t["id"]) == "miami":
			miami = t["pos"]
	var depot: Dictionary = {}
	var central: Dictionary = {}
	for s in stations:
		if String(s["id"]) == "meridian_depot":
			depot = s
		elif String(s["id"]) == "miami_central":
			central = s
	_check("MERIDIAN DEPOT exists", not depot.is_empty())
	_check("MIAMI CENTRAL exists", not central.is_empty())
	if not depot.is_empty():
		var dd: float = (depot["pos"] as Vector2).distance_to(meridian)
		_check("the depot is WALKABLE from Meridian (%.0f m ≤ 250)" % dd, dd <= 250.0)
	if not central.is_empty():
		var dm: float = (central["pos"] as Vector2).distance_to(miami)
		_check("Miami Central serves Miami (%.0f m ≤ 600)" % dm, dm <= 600.0)

	print("RAIL RESULTS: %d passed, %d failed" % [passed, failed])
	print("RAIL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
