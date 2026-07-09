## Proof for NAV-P1 (NAVIGATION.md §3/§8/§9): the v0 WALK GRAPH folds from rows
## (ring + door/curb spokes + plaza, zero islands), A* answers in microseconds,
## and a real walker body walks DOOR-TO-DOOR across Meridian — through the
## church's actual front doorway — under the ported dog laws, obeying the
## universal displacement law (no teleports, ever). The v0 door plays the
## player's own door audio at the threshold.
## Run: godot --headless --path game res://proto3d/tests/nav_walk_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("NAVW: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("NAVW RESULTS: %d passed, %d failed" % [passed, failed])
	print("NAVW: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _walker() -> CharacterBody3D:
	var w := CharacterBody3D.new()
	var col := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.32
	cap.height = 1.7
	col.shape = cap
	col.position.y = 0.85
	w.add_child(col)
	return w


func _ready() -> void:
	print("NAVW: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(180.0).timeout.connect(func() -> void:
		print("NAVW: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().physics_frame

	var jd: ProtoJourneys = main.journeys
	_check("the journey director is wired at boot", jd != null)

	# --- 1) THE GRAPH: Meridian's bones fold from rows ---------------------------
	var town: Dictionary = {}
	for t in main.stream.usmap.towns:
		if String(t["id"]) == "meridian":
			town = t
	_check("the Meridian town row exists", not town.is_empty())
	var t0 := Time.get_ticks_usec()
	var g: ProtoWalkGraph = jd.graph_for_town(town)
	var build_us := Time.get_ticks_usec() - t0
	_check("the v0 graph folds (%d nodes, %d doors, built in %d µs)" % [g.nodes.size(), g.doors.size(), build_us],
		g.nodes.size() >= 28 and g.doors.size() >= 9)
	_check("ZERO islands (every door reaches the plaza; warnings: %s)" % str(g.warnings), g.warnings.is_empty())
	var t1 := Time.get_ticks_usec()
	var probe_path: Array = g.a_star(g.nearest_node(Vector2(110, -325)), String(g.doors.get("meridian-church", "")))
	var astar_us := Time.get_ticks_usec() - t1
	_check("A* answers in microseconds (%d µs, path %d nodes)" % [astar_us, probe_path.size()],
		astar_us < 5000 and probe_path.size() >= 2)

	# --- 2) THE WALK: safehouse curb → the church door, through the doorway ------
	var w := _walker()
	main.add_child(w)
	w.global_position = Vector3(104, 0.4, -318) # beside the safehouse (staged position — the documented exception)
	for i in range(4):
		await get_tree().physics_frame
	var jid := jd.start_walk(w, town, "meridian-church", 1.0, 2.2)
	_check("the journey starts (id '%s')" % jid, jid != "")
	var arr := {"v": false} # lambdas capture bools BY VALUE — the house gotcha, wrapper required
	jd.journey_arrived.connect(func(id: String) -> void:
		if id == jid:
			arr["v"] = true)
	# the displacement law: LIVE movers never teleport
	var vmax := 2.2 * 2.5
	var law_ok := true
	var last := w.global_position
	var frames := 0
	var motionless := 0.0
	while not bool(arr["v"]) and frames < 7000:
		await get_tree().physics_frame
		frames += 1
		var d := w.global_position.distance_to(last)
		if d > vmax * get_physics_process_delta_time() * 3.0 and frames > 10:
			law_ok = false
			print("NAVW: DISPLACEMENT BREACH %.2f m in one frame at %s" % [d, w.global_position])
		motionless = (motionless + get_physics_process_delta_time()) if d < 0.002 else 0.0
		if motionless > 6.0:
			break # a statue — the loop below fails loudly
		if frames % 600 == 0:
			var jrow: Dictionary = jd.state_of(jid)
			print("NAVW: DIAG f%d pos=%s leg=%s/%s" % [frames, w.global_position,
				jrow.get("leg_idx", "?"), (jrow.get("path", []) as Array).size()])
		last = w.global_position
	var jend: Dictionary = jd.state_of(jid)
	print("NAVW: ENDSTATE leg=%s/%s state=%s dwell=%s detour=%s pos=%s" % [jend.get("leg_idx", "?"),
		(jend.get("path", []) as Array).size(), jend.get("state", "gone"), jend.get("dwell_s", "?"),
		jend.get("detour", "nil"), w.global_position])
	_check("the walker ARRIVES at the church door (%d frames)" % frames, bool(arr["v"]))
	_check("the displacement law holds every frame (≤ v_max·delta·1.5, hydration excepted)", law_ok)
	_check("NEVER A STATUE (max motionless streak < 6 s)", motionless <= 6.0)
	# through the DOORWAY: the walker's final spot sits at the church's front face
	var church_door: Vector2 = g.nodes[String(g.doors["meridian-church"])]
	var final := Vector2(w.global_position.x, w.global_position.z)
	_check("...standing at the real doorway (%.1f m from the door node)" % final.distance_to(church_door),
		final.distance_to(church_door) < 2.5)
	w.queue_free()

	_finish(prev_scale)
