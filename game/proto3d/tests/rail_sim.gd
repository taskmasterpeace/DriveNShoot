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

	# --- §render (R2): the rail materializes in streamed chunks -----------------
	var prev_ts := Engine.time_scale
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("RAIL: WATCHDOG")
		print("RAIL RESULTS: %d passed, %d failed" % [passed, failed + 1])
		print("RAIL: FAILURES PRESENT")
		Engine.time_scale = prev_ts
		get_tree().quit(1))
	var main: Node3D = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 10:
		await get_tree().process_frame
	main.mode = main.Mode.FOOT
	main.active_car = null
	# Stand at MERIDIAN DEPOT — the stream builds the world around your boots.
	main.player.global_position = Vector3(210, 0.4, -350)
	for _i in 40:
		await get_tree().physics_frame
	var found_bed := false
	var found_steel := false
	var found_ties := false
	var stack: Array = [main.stream]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n.has_meta("rail_bed"):
			found_bed = true
		if n.has_meta("rail_steel"):
			found_steel = true
		if n.has_meta("rail_ties") and n is MultiMeshInstance3D \
				and (n as MultiMeshInstance3D).multimesh.instance_count > 0:
			found_ties = true
		for c in n.get_children():
			stack.push_back(c)
	_check("the rail BED streams in at the depot", found_bed)
	_check("TWIN STEEL streams in", found_steel)
	_check("the TIES streams in (MultiMesh, >0 sleepers)", found_ties)

	# --- §stations (R3): the depot BUILDING materialized from its placement row --
	var depot_shell: Node3D = null
	for s in get_tree().get_nodes_in_group("structure"):
		if s is Node3D and String(s.get_meta("structure_id", "")) == "train_station" \
				and (s as Node3D).global_position.distance_to(Vector3(208, 0, -341)) < 40.0:
			depot_shell = s
			break
	_check("MERIDIAN DEPOT's station shell materialized (placement row)", depot_shell != null)

	# --- §ride-the-line (R4): the FULL line end-to-end, headless, zero void/derail --
	# A second, engine-detached train instance ticked MANUALLY with big deltas — the
	# deterministic full-route proof (823 s of track in a moment of sim time).
	_check("the shipped world spawned ITS train at boot", main.train != null and is_instance_valid(main.train))
	var t2 := ProtoTrain.create(main, usmap.rails[0])
	add_child(t2)
	t2.set_physics_process(false) # the sim owns this one's clock
	var visited: Dictionary = {}
	var y_ok := true
	var sane := true
	var reached_end := false
	var back_home := false
	for i in 4200:
		t2._physics_process(0.6)
		var dw := t2.dwelling_station()
		if dw >= 0:
			visited[dw] = true
			if dw == t2.stations.size() - 1:
				reached_end = true
			if reached_end and dw == 0:
				back_home = true
				break
		if absf(t2.global_position.y - (ProtoTrain.RAIL_TOP_Y + 0.36)) > 0.01:
			y_ok = false
		if is_nan(t2.dist) or t2.dist < -1.0 or t2.dist > t2.total_len + 1.0:
			sane = false
	_check("the train calls at EVERY station (%d/%d)" % [visited.size(), t2.stations.size()],
		visited.size() == t2.stations.size())
	_check("it reaches MIAMI CENTRAL end-of-line", reached_end)
	_check("the TURNAROUND brings it home to the depot", back_home)
	_check("zero VOID — y rides the steel the whole line", y_ok)
	_check("zero DERAIL — dist stays on the spline", sane)
	t2.queue_free()

	# --- R6: SEABOARD DISPATCH rides the dial ------------------------------------
	if "radio" in main and main.radio != null:
		main.radio._deliver("rail_bulletin")
		_check("the radio carries the SEABOARD bulletin", main.radio.last_signal == "rail_bulletin")
	var depot_sign := false
	for sg in get_tree().get_nodes_in_group("readable_sign"):
		if sg is ProtoSign and (sg as ProtoSign).text.contains("Train Station") \
				and (sg as Node3D).global_position.distance_to(Vector3(208, 0, -341)) < 45.0:
			depot_sign = true
			break
	_check("the depot has its NAME SIGN out front", depot_sign)

	Engine.time_scale = prev_ts
	print("RAIL RESULTS: %d passed, %d failed" % [passed, failed])
	print("RAIL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
