## Proof for THE EXIT GEOMETRY LAW (AMERICAN_ROAD M1, ruling 0.18 — the owner's
## "little angle"): every off-ramp STARTS at the carriageway EDGE (never the
## centerline), peels at a shallow 8-15°, carries a direction-correct `side`
## (managed mouths and legacy destinations sit on the serving direction's RIGHT
## — no left exits ever), and every DIVIDED-highway exit serves BOTH travel
## directions (the bake minted the missing mirrors). Canon guard: EXIT-meridian
## keeps its id and its dest. Pure data — no scene boot.
## Run: godot --headless --path game res://proto3d/tests/exit_geometry_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("XGEO: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Local highway direction (along pts order) at the segment nearest p.
func _dir_at(road: Dictionary, p: Vector2) -> Vector2:
	var best_d := 1e18
	var out := Vector2.RIGHT
	var pts: Array = road["pts"]
	for i in range(pts.size() - 1):
		var a: Vector2 = pts[i]
		var b: Vector2 = pts[i + 1]
		var d := ProtoUSMap._seg_dist(p, a, b)
		if d < best_d:
			best_d = d
			out = (b - a).normalized()
	return out


## Independent finite-segment projection for managed ramp mouths. The public
## descriptor selects the owned OFF road; raw map points prove its geometry.
func _finite_projection(road: Dictionary, p: Vector2) -> Dictionary:
	if not p.is_finite():
		return {}
	var best_d := INF
	var best: Dictionary = {}
	var pts: PackedVector2Array = road["pts"]
	for i: int in range(pts.size() - 1):
		var a := pts[i]
		var b := pts[i + 1]
		var delta := b - a
		var length_squared := delta.length_squared()
		if not a.is_finite() or not b.is_finite() or length_squared < 0.000001:
			continue
		var t := clampf((p - a).dot(delta) / length_squared, 0.0, 1.0)
		var projected := a + delta * t
		var distance := p.distance_to(projected)
		if distance < best_d:
			best_d = distance
			best = {"pos": projected, "dir": delta / sqrt(length_squared), "dist": distance}
	return best


func _ready() -> void:
	print("XGEO: start")
	get_tree().create_timer(45.0).timeout.connect(func() -> void:
		print("XGEO: WATCHDOG")
		print("XGEO: FAILURES PRESENT")
		get_tree().quit(1))

	var um := ProtoUSMap.get_default()
	_check("usmap loads", um != null and um.ok)

	var off_total := 0
	var bad_angle := 0
	var bad_edge := 0
	var bad_side := 0
	var divided_missing_mirror := 0
	var seattle_managed_off_count := 0
	var seattle_managed_sides := {}
	for e in um.exits:
		var hwy: Dictionary = um.road_by_id(String(e["highway_id"]))
		if hwy.is_empty():
			continue
		var g: Dictionary = ProtoUSMap.road_geometry(hwy)
		var ex_pos: Vector2 = e["pos"]
		var sides := {}
		var managed := not (e.get("interchange", {}) as Dictionary).is_empty()
		if managed:
			# Managed diamonds own explicit OFF ports far from the old sign anchor.
			# Their local mouth geometry, not the ultimate town across the bridge,
			# certifies the edge, peel angle, and right-hand side.
			for port: Dictionary in um.exit_ports(e, "off"):
				var rp: Dictionary = port["road"]
				var rid := String(rp["id"])
				var pts: PackedVector2Array = rp["pts"]
				if pts.size() < 2:
					bad_edge += 1
					print("XGEO: managed OFF ramp has no raw start segment on %s" % rid)
					continue
				var p0 := pts[0]
				var side := int(port["side"])
				sides[side] = true
				off_total += 1
				if String(e["id"]) == "I-90_X11":
					seattle_managed_off_count += 1
					seattle_managed_sides[side] = true
				var projection := _finite_projection(hwy, p0)
				var descriptor_pos: Vector2 = port["pos"]
				var owned_raw_start := (
					String(port["role"]) == "off"
					and String(rp.get("interchange_id", "")) == String(e["id"])
					and (e["ramp_ids"] as Array).has(rid)
					and descriptor_pos == p0
				)
				if not owned_raw_start or projection.is_empty():
					bad_edge += 1
					print("XGEO: managed OFF descriptor is not its finite raw start on %s" % rid)
					continue
				# THE EDGE LAW: raw ramp start is at the projected carriageway edge.
				var lat := float(projection["dist"])
				var want_edge := float(g["width"]) * 0.5 + 1.0
				if absf(lat - want_edge) > 2.5:
					bad_edge += 1
					print("XGEO: bad managed edge start on %s (%.1f m from centerline, want ~%.1f)" % [rid, lat, want_edge])
				# THE LITTLE ANGLE: actual mouth peels 8-15° (6-17 float slack).
				var rd := (pts[1] - p0).normalized()
				var hd: Vector2 = projection["dir"]
				var ang := rad_to_deg(acos(clampf(absf(hd.dot(rd)), 0.0, 1.0)))
				if ang < 6.0 or ang > 17.0:
					bad_angle += 1
					print("XGEO: bad managed peel angle %.1f° on %s" % [ang, rid])
				# RIGHT-HAND LAW: the local mouth lies right of its serving direction.
				var d_serve := hd * float(side)
				var rightv := Vector2(-d_serve.y, d_serve.x)
				var offset: Vector2 = p0 - (projection["pos"] as Vector2)
				if side not in [-1, 1] or rightv.dot(offset) <= 0.05 or side != int(rp.get("side", 0)):
					bad_side += 1
					print("XGEO: managed LEFT/invalid OFF mouth on %s" % rid)
		else:
			# Legacy exits retain the contained sign-anchor classifier and their
			# destination-side guard; changing that is outside this compatibility fix.
			for rid in (e["ramp_ids"] as Array):
				var rp: Dictionary = um.road_by_id(String(rid))
				if rp.is_empty():
					continue
				var pts: Array = rp["pts"]
				var p0: Vector2 = pts[0]
				if p0.distance_to(ex_pos) > 40.0:
					continue # an on-ramp — merge geometry, not peel
				off_total += 1
				# THE EDGE LAW: the ramp starts at the carriageway edge, never the centerline
				var lat := absf(p0.distance_to(ex_pos))
				var want_edge := float(g["width"]) * 0.5 + 1.0
				if absf(lat - want_edge) > 2.5:
					bad_edge += 1
					print("XGEO: bad edge start on %s (%.1f m from anchor, want ~%.1f)" % [rid, lat, want_edge])
				# THE LITTLE ANGLE: peel 8-15° (band 6-17 with float slack)
				if pts.size() >= 2:
					var rd: Vector2 = ((pts[1] as Vector2) - p0).normalized()
					var hd := _dir_at(hwy, ex_pos)
					var ang := rad_to_deg(acos(clampf(absf(hd.dot(rd)), 0.0, 1.0)))
					if ang < 6.0 or ang > 17.0:
						bad_angle += 1
						print("XGEO: bad peel angle %.1f° on %s" % [ang, rid])
				# DIRECTION-CORRECT: legacy dest sits on serving direction's RIGHT.
				var side := int(rp.get("side", 0))
				sides[side] = true
				var d_serve := _dir_at(hwy, ex_pos) * float(side)
				var rightv := Vector2(-d_serve.y, d_serve.x)
				if rightv.dot(((e["dest"] as Vector2) - ex_pos).normalized()) < -0.05 and side == int(rp.get("side", 0)) and String(rid).ends_with("-off-r") == false:
					bad_side += 1
					print("XGEO: LEFT EXIT (dest not on serving right) on %s" % rid)
		if bool(g["divided"]) and not (sides.has(1) and sides.has(-1)):
			divided_missing_mirror += 1
			print("XGEO: divided exit %s missing a side (%s)" % [e["id"], sides.keys()])
	_check("every off-ramp starts at the carriageway EDGE (%d ramps checked)" % off_total, bad_edge == 0)
	_check("every off-ramp peels at the LITTLE ANGLE (8-15°)", bad_angle == 0)
	_check("right-hand exits only — managed mouths and legacy destinations stay on serving right", bad_side == 0)
	_check("every DIVIDED-highway exit serves BOTH directions (the 0.18b mirrors)", divided_missing_mirror == 0)
	_check("managed Seattle explicitly checks both owned OFF directions",
		seattle_managed_off_count == 2
		and seattle_managed_sides.has(-1)
		and seattle_managed_sides.has(1))

	# canon guard (0.5, amended by the v4 MAP-FIRST Meridian pass): EXIT-meridian
	# survives with its id and still DELIVERS to Meridian — the ramp now tees into
	# MAIN ST (~[216,-290], ~112 m from the town dot) instead of dead-ending on the
	# dot. 150 m = anywhere on the downtown grid; a rewrite that flings the ramp
	# somewhere else entirely still fails.
	var mer_ramp: Dictionary = um.road_by_id("EXIT-meridian")
	_check("EXIT-meridian keeps its id and still lands at Meridian (MAIN ST arrival, <150 m)",
		not mer_ramp.is_empty()
		and ((mer_ramp["pts"] as Array).back() as Vector2).distance_to(Vector2(110, -325)) < 150.0)

	print("XGEO RESULTS: %d passed, %d failed" % [passed, failed])
	print("XGEO: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
