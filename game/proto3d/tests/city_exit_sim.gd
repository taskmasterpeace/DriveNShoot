## Proof for CITY EXITS (POC 2026-07-16): 33 of 59 towns had NO exit — the
## interstate ran straight PAST Seattle, San Francisco, Atlanta and 26 more
## with no off-ramp, so the player could not leave the highway to enter them.
## The bake now MINTS one per exit-less town to the proven denver/losangeles
## pattern (pos on the carriageway, dest ~520 m off, inside renumberExits' 600 m
## town_id stamp radius). This proves: the rows LINK, the ramps PEEL + mirror,
## the exit MATERIALIZES in the world (sign + drivable ramp slab), the graph can
## ROUTE off the highway into the city, and MERIDIAN's address canon never moved.
## Run: godot --headless --path game res://proto3d/tests/city_exit_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D

## the POC subset (bake const MINT_EXITS_ONLY) — town_id -> minted exit id
const POC: Dictionary = {"seattle": "I-90_X11", "sanfrancisco": "I-80_X11", "atlanta": "I-75_X10"}
const STAMP_R := 600.0 ## must mirror renumberExits' town_id radius


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CITYEXIT: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(watchdog: bool = false) -> void:
	print("CITYEXIT RESULTS: %d passed, %d failed%s" % [passed, failed, " (WATCHDOG)" if watchdog else ""])
	print("CITYEXIT: %s" % ("ALL CHECKS PASSED" if failed == 0 and not watchdog else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 and not watchdog else 1)


func _exit_by_id(m: ProtoUSMap, eid: String) -> Dictionary:
	for e in m.exits:
		if String((e as Dictionary)["id"]) == eid:
			return e
	return {}


func _town_by_id(m: ProtoUSMap, tid: String) -> Dictionary:
	for t in m.towns:
		if String((t as Dictionary)["id"]) == tid:
			return t
	return {}


func _ready() -> void:
	print("CITYEXIT: start")
	get_tree().create_timer(150.0).timeout.connect(func() -> void: _finish(true))

	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().physics_frame
	if "menu_open" in main and main.menu_open:
		main.menu_open = false
	if main.get("mode") == 0 and main.get("active_car") != null:
		main._exit_car()
		await get_tree().physics_frame
	var m: ProtoUSMap = main.stream.usmap

	# --- 1. THE LINK: the city you could never reach now owns an exit ------------
	for tid_v in POC:
		var tid := String(tid_v)
		var e := _exit_by_id(m, String(POC[tid]))
		var t := _town_by_id(m, tid)
		_check("%s owns exit %s" % [tid, POC[tid]], not e.is_empty())
		if e.is_empty() or t.is_empty():
			continue
		_check("...stamped to its town (town_id=%s)" % String(e.get("town_id", "")),
			String(e.get("town_id", "")) == tid)
		var dest: Vector2 = e["dest"]
		var d := dest.distance_to(t["pos"] as Vector2)
		_check("...dest lands INSIDE the stamp radius (%.0f m < %.0f) so the link sticks" % [d, STAMP_R],
			d < STAMP_R)
		_check("...and the ramp is a real length, not degenerate (%.0f m > 200)" % (e["pos"] as Vector2).distance_to(dest),
			(e["pos"] as Vector2).distance_to(dest) > 200.0)

	# --- 2. THE RAMPS: peeled by the geometry law + mirrored on divided roads ----
	for tid_v in POC:
		var e := _exit_by_id(m, String(POC[tid_v]))
		if e.is_empty():
			continue
		var ramps: Array = e.get("ramp_ids", [])
		var peeled := 0
		for rp in ramps:
			var r := m.road_by_id(String(rp))
			# THE ENGINE NEVER FOLDS `geom` — it is the bake's idempotency marker,
			# not runtime data. Assert the SHAPE the peel produces instead:
			# rewriteExitGeometry prepends [peel, out] to the tail, so 3+ points.
			if not r.is_empty() and (r["pts"] as PackedVector2Array).size() >= 3:
				peeled += 1
		_check("%s: every ramp PEELS to real geometry (%d/%d carry the peel shape)" % [POC[tid_v], peeled, ramps.size()],
			ramps.size() >= 1 and peeled == ramps.size())
		var hwy := m.road_by_id(String(e["highway_id"]))
		if not hwy.is_empty() and bool(hwy.get("divided", false)):
			_check("...divided highway, so the MIRROR ramp was auto-minted (%d ramps)" % ramps.size(),
				ramps.size() >= 2)

	# --- 3. THE ADDRESS CANON: minting must never move MERIDIAN ------------------
	var mer := _exit_by_id(m, "I-95_X1")
	_check("MERIDIAN is still I-95 EXIT 9 (the address canon held)",
		not mer.is_empty() and int(mer["exit_number"]) == 9)

	# --- 4. IT MATERIALIZES: the Seattle exit builds in the REAL world -----------
	var se := _exit_by_id(m, "I-90_X11")
	if not se.is_empty():
		var sp: Vector2 = se["pos"]
		main.player.global_position = Vector3(sp.x, 2.0, sp.y)
		for _i in 45:
			main.stream.update_stream(main.player.global_position, main)
			await get_tree().physics_frame
		var sign_found := false
		var ramp_slab := false
		for ck in main.stream.loaded:
			var chunk: Node3D = main.stream.loaded[ck]
			for c in chunk.get_children():
				if (c as Node).has_meta("exit_id") and String(c.get_meta("exit_id")) == "I-90_X11":
					sign_found = true
				if (c as Node).has_meta("road_slab") and String(c.get_meta("road_slab")).begins_with("I-90_X11"):
					ramp_slab = true
		_check("the SEATTLE exit sign materializes in the world", sign_found)
		_check("the SEATTLE off-ramp lays real asphalt (road_slab built)", ramp_slab)
		# the ramp is DRIVABLE: stand on it and the surface law says road
		# Sample ON the ramp's OWN polyline: a peeled ramp KINKS (peel -> out ->
		# dest), so the straight pos->dest chord lands ~36 m off it, in the dirt.
		var rr := m.road_by_id("I-90_X11-off")
		if not rr.is_empty():
			var rpts: PackedVector2Array = rr["pts"]
			var on_ramp: Vector2 = (rpts[rpts.size() - 2] + rpts[rpts.size() - 1]) * 0.5
			var surf := ProtoWorldBuilder.surface_at(Vector3(on_ramp.x, 0.2, on_ramp.y))
			_check("the ramp is DRIVABLE asphalt where a car actually rides (surface_at = '%s')" % surf,
				surf == "road")

	# --- 5. THE ROUTE: the graph can LEAVE the highway for the city --------------
	# (a minted exit that isn't on the graph is a painted lie — traffic + GPS use this)
	var graph := ProtoRoadGraph.build(m)
	_check("the road graph builds (%d nodes)" % graph.nodes.size(), graph.nodes.size() > 0)
	if not se.is_empty():
		var hwy90 := m.road_by_id("I-90")
		if not hwy90.is_empty():
			var pts: PackedVector2Array = hwy90["pts"]
			# start a few km up I-90 from Seattle, route to the exit's dest
			var from: Vector2 = pts[mini(3, pts.size() - 1)]
			var rt := graph.route(from, se["dest"] as Vector2)
			_check("route(I-90 -> SEATTLE's exit) EXISTS (the exit is connected, not a stub)",
				not rt.is_empty())
			if not rt.is_empty():
				var roads_used: Array = rt.get("roads", [])
				_check("...and it actually rides I-90 to get there", roads_used.has("I-90"))

	_finish()
