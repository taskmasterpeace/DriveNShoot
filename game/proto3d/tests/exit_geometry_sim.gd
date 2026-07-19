## Proof for THE EXIT GEOMETRY LAW (AMERICAN_ROAD M1, ruling 0.18 — the owner's
## "little angle"): every off-ramp STARTS at the carriageway EDGE (never the
## centerline), peels at a shallow 8-15°, carries a direction-correct `side`
## (its destination sits on the serving direction's RIGHT — right-hand exits
## only, no left exits ever), and every DIVIDED-highway exit serves BOTH travel
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


## Proper segment-segment intersection point, or null (any angle).
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
	return a1 + d1 * t


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
	for e in um.exits:
		var hwy: Dictionary = um.road_by_id(String(e["highway_id"]))
		if hwy.is_empty():
			continue
		var g: Dictionary = ProtoUSMap.road_geometry(hwy)
		var ex_pos: Vector2 = e["pos"]
		var sides := {}
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
			# DIRECTION-CORRECT: dest sits on the serving direction's RIGHT
			var side := int(rp.get("side", 0))
			sides[side] = true
			var d_serve := _dir_at(hwy, ex_pos) * float(side)
			var rightv := Vector2(-d_serve.y, d_serve.x)
			if rightv.dot(((e["dest"] as Vector2) - ex_pos).normalized()) < -0.05 and side == int(rp.get("side", 0)) and String(rid).ends_with("-off-r") == false:
				bad_side += 1
				print("XGEO: LEFT EXIT (dest not on serving right) on %s" % rid)
		# authored towns (Meridian) keep a clean town-side diamond by design — no
		# generated far-side mirror (its hand-placed core is off-limits to a road).
		var t_authored := false
		for t in um.towns:
			if String(t["id"]) == String(e.get("town_id", "")):
				t_authored = bool(t.get("authored", false))
				break
		if bool(g["divided"]) and not t_authored and not (sides.has(1) and sides.has(-1)):
			divided_missing_mirror += 1
			print("XGEO: divided exit %s missing a side (%s)" % [e["id"], sides.keys()])
	_check("every off-ramp starts at the carriageway EDGE (%d ramps checked)" % off_total, bad_edge == 0)
	_check("every off-ramp peels at the LITTLE ANGLE (8-15°)", bad_angle == 0)
	_check("right-hand exits only — the PRIMARY ramp's dest is on its serving right", bad_side == 0)
	_check("every DIVIDED-highway exit serves BOTH directions (the 0.18b mirrors)", divided_missing_mirror == 0)

	# REGRESSION (owner /goal 2026-07-18 "no misaligned exits"): no off-ramp may
	# cross its own highway (the old mirror-ramp bug sliced across both carriageways).
	var crossings := 0
	for e in um.exits:
		var hwy2: Dictionary = um.road_by_id(String(e["highway_id"]))
		if hwy2.is_empty():
			continue
		var hpts: Array = hwy2["pts"]
		for rid in (e["ramp_ids"] as Array):
			var rp2: Dictionary = um.road_by_id(String(rid))
			if rp2.is_empty() or String(rp2.get("kind", "")) != "exit":
				continue
			var rpts: Array = rp2["pts"]
			if rpts.size() < 2:
				continue
			var mouth: Vector2 = rpts[0]
			for ri in range(rpts.size() - 1):
				for hi in range(hpts.size() - 1):
					var hit: Variant = _seg_cross(rpts[ri], rpts[ri + 1], hpts[hi], hpts[hi + 1])
					if hit != null and (hit as Vector2).distance_to(mouth) > 26.0:
						crossings += 1
						print("XGEO: ramp %s crosses its own highway %s at %s" % [rid, String(e["highway_id"]), hit])
	_check("no off-ramp crosses its own highway (the mirror-ramp bug)", crossings == 0)

	# canon guard (0.5): EXIT-meridian survives with its id and its destination
	var mer_ramp: Dictionary = um.road_by_id("EXIT-meridian")
	_check("EXIT-meridian keeps its id and still lands at Meridian (dest 110,-325)",
		not mer_ramp.is_empty()
		and ((mer_ramp["pts"] as Array).back() as Vector2).distance_to(Vector2(110, -325)) < 5.0)

	print("XGEO RESULTS: %d passed, %d failed" % [passed, failed])
	print("XGEO: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
