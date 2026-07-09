## Proof for THE JUNCTION GEOMETRY LAW (AMERICAN_ROAD M1 part 2, rulings
## 0.2-0.4): in the BUILT world a flat gap junction opens a real hole in the
## divided road's median barrier (a physics ray crosses AT the node, and hits
## barrier 80 m away); a walled separated_pending crossing stays UNGAPPED (the
## ray hits); a riro ramp mouth NEVER opens the median (the ray hits); and the
## flat node paints its INTERSECTION SLAB. Chunks build through the REAL
## _spawn_chunk path; ray tests are physics, not faith.
## Run: godot --headless --path game res://proto3d/tests/junction_law_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("JLAW: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("JLAW RESULTS: %d passed, %d failed" % [passed, failed])
	print("JLAW: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


## Cast a horizontal ray ACROSS the divided road's median at world point wp,
## perpendicular to the road's local direction, at barrier height (y 0.4).
## Returns true when a road_barrier body blocks it.
func _median_blocked(road: Dictionary, wp: Vector2) -> bool:
	# local road direction at wp: nearest segment
	var best_d := 1e18
	var seg_dir := Vector2.RIGHT
	var pts: Array = road["pts"]
	for i in range(pts.size() - 1):
		var a: Vector2 = pts[i]
		var b: Vector2 = pts[i + 1]
		var d := ProtoUSMap._seg_dist(wp, a, b)
		if d < best_d:
			best_d = d
			seg_dir = (b - a).normalized()
	var perp := Vector2(seg_dir.y, -seg_dir.x)
	var g: Dictionary = ProtoUSMap.road_geometry(road)
	var reach := float(g["carriage_w"]) + float(g["median_w"])
	var from3 := Vector3(wp.x + perp.x * reach, 0.4, wp.y + perp.y * reach)
	var to3 := Vector3(wp.x - perp.x * reach, 0.4, wp.y - perp.y * reach)
	var q := PhysicsRayQueryParameters3D.create(from3, to3)
	var space := (main as Node3D).get_world_3d().direct_space_state
	var hits := 0
	# walk through multiple hits (carriageway slabs are visuals, but rails/other
	# bodies exist) — count only road_barrier bodies
	for guard in 8:
		var hit := space.intersect_ray(q)
		if hit.is_empty():
			break
		var col: Node = hit["collider"]
		if col != null and col.has_meta("road_barrier"):
			return true
		q = PhysicsRayQueryParameters3D.create(hit["position"] + (to3 - from3).normalized() * 0.6, to3)
	return false


func _build_chunk_at(pos: Vector2) -> Node3D:
	var stream: ProtoWorldStream = main.stream
	var chunk_m := float(ProtoWorldStream.CHUNK)
	return stream._spawn_chunk(int(floor(pos.x / chunk_m)), int(floor(pos.y / chunk_m)))


func _ready() -> void:
	print("JLAW: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("JLAW: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().physics_frame

	var um: ProtoUSMap = main.stream.usmap

	# --- pick the three probe junctions from the baked data ---------------------
	var gap_j: Dictionary = {}
	var walled_j: Dictionary = {}
	var mouth_j: Dictionary = {}
	for j in um.junctions:
		if gap_j.is_empty() and String(j["kind"]) == "tee" and String(j["control"]) == "gap":
			# want the gap on a DIVIDED leg
			for l in j["legs"]:
				var r: Dictionary = um.road_by_id(String(l["road"]))
				if not r.is_empty() and bool(ProtoUSMap.road_geometry(r)["divided"]) \
						and um.junction_gap_half(j, String(l["road"])) > 0.0:
					gap_j = j
		if walled_j.is_empty() and String(j["grade"]) == "separated_pending":
			walled_j = j
		if mouth_j.is_empty() and String(j["kind"]) == "ramp_mouth":
			# a mouth on a divided highway, away from any gap junction
			var hw: Dictionary = um.road_by_id(String(j["legs"][0]["road"]))
			if not hw.is_empty() and bool(ProtoUSMap.road_geometry(hw)["divided"]):
				var clean := true
				for j2 in um.junctions:
					if String(j2.get("control", "")) == "gap" and (j2["pos"] as Vector2).distance_to(j["pos"]) < 120.0:
						clean = false
				if clean:
					mouth_j = j
	_check("probe junctions found (gap tee / walled crossing / riro mouth)",
		not gap_j.is_empty() and not walled_j.is_empty() and not mouth_j.is_empty())

	# --- 1) THE GAP: the median opens AT the turn, holds 80 m away --------------
	if not gap_j.is_empty():
		var groad: Dictionary = {}
		for l in gap_j["legs"]:
			var r2: Dictionary = um.road_by_id(String(l["road"]))
			if not r2.is_empty() and bool(ProtoUSMap.road_geometry(r2)["divided"]) \
					and um.junction_gap_half(gap_j, String(l["road"])) > 0.0:
				groad = r2
		var jp: Vector2 = gap_j["pos"]
		var chunk := _build_chunk_at(jp)
		for i in range(6):
			await get_tree().physics_frame
		_check("gap junction chunk builds", chunk != null)
		_check("the median is OPEN at the junction node (ray crosses '%s' at %s)" % [groad.get("id", "?"), jp],
			not _median_blocked(groad, jp))
		# 80 m along the road away from the node the barrier must stand
		var pts: Array = groad["pts"]
		var dirv: Vector2 = (pts[1] as Vector2 - pts[0] as Vector2).normalized()
		var away := jp + dirv * 80.0
		var away_chunk := _build_chunk_at(away)
		for i in range(4):
			await get_tree().physics_frame
		var away_blocked := _median_blocked(groad, away)
		if not away_blocked:
			print("JLAW: DIAG away=%s — barriers near:" % away)
			for bnode in get_tree().get_nodes_in_group("__none__") + []:
				pass
			for n in [chunk, away_chunk]:
				if n == null:
					continue
				for c in n.get_children():
					if c is Node3D and c.has_meta("road_barrier"):
						var b3 := c as Node3D
						print("  barrier %s pos=%s rot=%.1f° size=%s" % [String(c.get_meta("road_barrier")),
							b3.global_position, rad_to_deg(b3.rotation.y),
							((b3.get_child(1) as CollisionShape3D).shape as BoxShape3D).size if b3.get_child_count() > 1 and b3.get_child(1) is CollisionShape3D else Vector3.ZERO])
			var space2 := (main as Node3D).get_world_3d().direct_space_state
			var pts2: Array = groad["pts"]
			var sd: Vector2 = (pts2[1] as Vector2 - pts2[0] as Vector2).normalized()
			var pp := Vector2(sd.y, -sd.x)
			var g2: Dictionary = ProtoUSMap.road_geometry(groad)
			var rch := float(g2["carriage_w"]) + float(g2["median_w"])
			var f3 := Vector3(away.x + pp.x * rch, 0.4, away.y + pp.y * rch)
			var t3 := Vector3(away.x - pp.x * rch, 0.4, away.y - pp.y * rch)
			var h := space2.intersect_ray(PhysicsRayQueryParameters3D.create(f3, t3))
			print("  ray %s -> %s first hit: %s" % [f3, t3,
				("%s meta_barrier=%s at %s" % [(h["collider"] as Node).get_class(), (h["collider"] as Node).has_meta("road_barrier"), h["position"]]) if not h.is_empty() else "NOTHING"])
		_check("...and the barrier STANDS 80 m away (ray blocked)", away_blocked)
		# the intersection slab painted
		var slab_found := false
		for n in [chunk, away_chunk]:
			if n == null:
				continue
			for c in n.get_children():
				if c.has_meta("junction_slab") and String(c.get_meta("junction_slab")) == String(gap_j["id"]):
					slab_found = true
		_check("the INTERSECTION SLAB paints at the flat node", slab_found)
		if chunk != null:
			chunk.queue_free()
		if away_chunk != null:
			away_chunk.queue_free()

	# --- 2) THE WALL: separated_pending stays UNGAPPED --------------------------
	if not walled_j.is_empty():
		var wroad: Dictionary = um.road_by_id(String(walled_j["legs"][0]["road"]))
		var wp: Vector2 = walled_j["pos"]
		var wchunk := _build_chunk_at(wp)
		for i in range(6):
			await get_tree().physics_frame
		_check("walled crossing (%s) keeps its median CLOSED — pending its M2 deck" % String(walled_j["id"]),
			_median_blocked(wroad, wp))
		var wslab := false
		if wchunk != null:
			for c in wchunk.get_children():
				if c.has_meta("junction_slab") and String(c.get_meta("junction_slab")) == String(walled_j["id"]):
					wslab = true
		_check("...and paints NO slab (the roads don't meet yet)", not wslab)
		if wchunk != null:
			wchunk.queue_free()

	# --- 3) THE RIRO LAW in the world: a ramp mouth never opens the median ------
	if not mouth_j.is_empty():
		var hwy: Dictionary = um.road_by_id(String(mouth_j["legs"][0]["road"]))
		var mp: Vector2 = mouth_j["pos"]
		var mchunk := _build_chunk_at(mp)
		for i in range(6):
			await get_tree().physics_frame
		var mblocked := _median_blocked(hwy, mp)
		if not mblocked and mchunk != null:
			print("JLAW: DIAG mouth chunk children:")
			for c in mchunk.get_children():
				if c is Node3D and (c.has_meta("road_barrier") or c.has_meta("road_slab")):
					print("  %s meta=%s pos=%s" % [c.get_class(),
						("barrier:" + String(c.get_meta("road_barrier"))) if c.has_meta("road_barrier") else ("slab:" + String(c.get_meta("road_slab"))),
						(c as Node3D).global_position])
		_check("a riro ramp mouth (%s) leaves the median INTACT (ray blocked)" % String(mouth_j["id"]),
			mblocked)
		if mchunk != null:
			mchunk.queue_free()

	_finish(prev_scale)
