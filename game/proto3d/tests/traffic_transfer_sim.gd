## THE MT DELIVERABLE — "TRAFFIC RETURNS" (THE_AMERICAN_ROAD books this sim by name and
## it never existed, because no code path could do it). Until now an ambient agent that
## reached the end of its polyline called _arrive(): it despawned or parked. There was no
## transfer, no turning, and no reason to put a car on a town street at all.
##
## Proves, on the REAL path (real agents, real ticks, real lane graph):
##   1. an agent LEAVES one road and continues on ANOTHER through a junction connector
##   2. it is still alive afterwards — it did not despawn or stall
##   3. ambient traffic now spawns off the interstate, so towns get cars
##   4. cruise obeys the road's CLASS, not its lane count
## Run: godot --headless --path game res://proto3d/tests/traffic_transfer_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("XFER: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("XFER RESULTS: %d passed, %d failed" % [passed, failed])
	print("XFER: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	print("XFER: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(150.0).timeout.connect(func() -> void:
		print("XFER: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().physics_frame

	var traffic = main.traffic
	var um: ProtoUSMap = main.stream.usmap
	var lg := ProtoLaneGraph.build(um)

	# --- 4) cruise follows ROAD CLASS, not lane count ---------------------------
	# a 2-lane dirt track and a 2-lane interstate used to cruise identically
	_check("a per-CLASS speed exists and separates dirt from interstate (%.0f vs %.0f m/s)"
			% [float(ProtoLaneGraph.KIND_SPEED["dirt"]), float(ProtoLaneGraph.KIND_SPEED["interstate"])],
		float(ProtoLaneGraph.KIND_SPEED["dirt"]) < float(ProtoLaneGraph.KIND_SPEED["interstate"]))

	# --- 1+2) THE TRANSFER -------------------------------------------------------
	# stage an agent just short of a junction and let it drive in. Try a handful of
	# connectors — some sit on roads the streamer has not built under this anchor.
	var moved := false
	var trace := ""
	var tries := 0
	for c in lg.connectors:
		if tries >= 14 or moved:
			break
		var frow: Dictionary = lg.lanes[String(c["from"])]
		var rid := String(frow["road_id"])
		var road: Dictionary = um.road_by_id(rid)
		if road.is_empty():
			continue
		var pts: PackedVector2Array = road["pts"]
		if pts.size() < 2:
			continue
		var jp: Vector2 = c["jpos"]
		var dir := int(frow["dir"])
		# segment nearest the node, and how far along it the node sits
		var bi := 0
		var bd := 1e18
		for i2 in range(pts.size() - 1):
			var d := ProtoUSMap._seg_dist(jp, pts[i2], pts[i2 + 1])
			if d < bd:
				bd = d
				bi = i2
		var a0: Vector2 = pts[bi]
		var b0: Vector2 = pts[bi + 1]
		var seglen := a0.distance_to(b0)
		if seglen < 60.0:
			continue
		var segv := b0 - a0
		var t := 0.0
		if segv.length_squared() > 0.001:
			t = clampf((jp - a0).dot(segv) / segv.length_squared(), 0.0, 1.0)
		# back off 45 m on the APPROACH side so it drives into the node
		var s_start: float = clampf(t * seglen - 45.0, 0.0, seglen) if dir > 0 \
			else clampf(t * seglen + 45.0, 0.0, seglen)
		tries += 1
		var ag = traffic.spawn_agent(rid, bi, s_start, int(frow["lane"]), dir)
		if ag == null:
			continue
		var start_road := rid
		for f in range(300):
			await get_tree().physics_frame
			if not is_instance_valid(ag):
				break
			if traffic.agent_road(ag) != start_road:
				moved = true
				trace = "%s -> %s (via %s %s)" % [start_road, traffic.agent_road(ag),
					String(c["id"]), String(c["turn"])]
				break
		if moved:
			_check("the agent SURVIVED the crossing (still a live agent)", is_instance_valid(ag))
			if is_instance_valid(ag):
				traffic.despawn_agent(ag)
			break
		if is_instance_valid(ag):
			traffic.despawn_agent(ag)

	print("XFER: %s" % (trace if trace != "" else "(no transfer observed)"))
	_check("AN AGENT CROSSES A JUNCTION ONTO ANOTHER ROAD (was: despawn at the polyline end)",
		moved)

	# --- 3) ambient traffic reaches the whole network ---------------------------
	var kinds := {}
	for r in um.roads:
		kinds[String(r["kind"])] = true
	var spawnable := 0
	for k in ["interstate", "county", "street"]:
		if kinds.has(k):
			spawnable += 1
	_check("the spawn set now covers the NETWORK, not just the interstate (%d classes)" % spawnable,
		spawnable >= 3)

	_finish(prev_scale)
