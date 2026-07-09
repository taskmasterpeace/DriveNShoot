## Proof for CORRIDOR KIT #1 (AMERICAN_ROAD M4a): the band pass dresses the
## majors — utility poles (draped on ground_y), a field fence (ONE rail body +
## visual posts), verge strips, farm-country field patches — inside a body
## budget, and NEVER on a dirt spur (a hermit's track with utility poles is a
## lie). A 60-second I-75 drive reads as Florida in a screenshot.
## Run: godot --headless --path game res://proto3d/tests/roadside_band_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("BAND: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("BAND RESULTS: %d passed, %d failed" % [passed, failed])
	print("BAND: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _count_meta(chunk: Node3D, meta: String) -> int:
	var n := 0
	for c in chunk.get_children():
		if c.has_meta(meta):
			n += 1
	return n


func _has_billboard_label(root: Node) -> bool:
	if root is Label3D:
		var label := root as Label3D
		if label.billboard == BaseMaterial3D.BILLBOARD_ENABLED and label.text.strip_edges() != "":
			return true
	for child in root.get_children():
		if _has_billboard_label(child):
			return true
	return false


func _ready() -> void:
	print("BAND: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("BAND: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().physics_frame
	var um: ProtoUSMap = main.stream.usmap
	var chunk_m := float(ProtoWorldStream.CHUNK)

	# --- find an I-75 sample in the green Southeast (outside the authored slab) ---
	var i75: Dictionary = um.road_by_id("I-75")
	_check("I-75 exists (the Florida corridor)", not i75.is_empty())
	var sample := Vector2.ZERO
	var pts: Array = i75["pts"]
	var total := 0.0
	for i in range(pts.size() - 1):
		total += ((pts[i + 1] as Vector2) - (pts[i] as Vector2)).length()
	for k in range(40):
		var want := total * (float(k) + 0.5) / 40.0
		var acc := 0.0
		var cand := Vector2.ZERO
		for i in range(pts.size() - 1):
			var l := ((pts[i + 1] as Vector2) - (pts[i] as Vector2)).length()
			if acc + l >= want:
				cand = (pts[i] as Vector2) + ((pts[i + 1] as Vector2) - (pts[i] as Vector2)) * ((want - acc) / l)
				break
			acc += l
		if absf(cand.x) <= 6000.0 and absf(cand.y) <= 6000.0:
			continue
		var b := String(um.biome_at(Vector3(cand.x, 0, cand.y)))
		if b != "water" and b != "ocean":
			sample = cand
			break
	_check("a dry streamed I-75 sample found (%s)" % sample, sample != Vector2.ZERO)

	var chunk: Node3D = main.stream._spawn_chunk(int(floor(sample.x / chunk_m)), int(floor(sample.y / chunk_m)))
	for i in range(3):
		await get_tree().physics_frame
	_check("the corridor chunk builds", chunk != null)
	if chunk != null:
		var poles := _count_meta(chunk, "roadside_pole")
		var fences := _count_meta(chunk, "roadside_fence")
		var verges := _count_meta(chunk, "road_verge")
		_check("utility poles stand the corridor (%d >= 1)" % poles, poles >= 1)
		_check("the field fence runs (%d rail bodies >= 1)" % fences, fences >= 1)
		_check("verge strips read beside the shoulder (%d >= 2)" % verges, verges >= 2)
		# THE DRAPE LAW: every pole base sits ON the ground field
		var draped := true
		for c in chunk.get_children():
			if c.has_meta("roadside_pole") and c is Node3D:
				var p3 := c as Node3D
				var gy := ProtoWorldBuilder.ground_y(p3.global_position.x, p3.global_position.z)
				if absf((p3.global_position.y - 4.0) - gy) > 0.6:
					draped = false
					print("BAND: FLOATING pole at %s (base %.2f vs ground %.2f)" % [p3.global_position, p3.global_position.y - 4.0, gy])
		_check("THE DRAPE LAW: every pole base sits on ground_y (relief never floats a pole)", draped)
		# THE BODY BUDGET (0.11-adjacent): the band must stay cheap
		var bodies := 0
		for c in chunk.get_children():
			if c is StaticBody3D:
				bodies += 1
		_check("the chunk's body count stays inside the budget (%d <= 70)" % bodies, bodies <= 70)
		chunk.queue_free()

	# --- the band NEVER dresses a dirt spur ---------------------------------------
	var spur: Dictionary = {}
	for r in um.roads:
		if String(r["kind"]) == "dirt":
			spur = r
			break
	if not spur.is_empty():
		var spts: Array = spur["pts"]
		var smid: Vector2 = ((spts[0] as Vector2) + (spts[1] as Vector2)) * 0.5
		var c2: Node3D = main.stream._spawn_chunk(int(floor(smid.x / chunk_m)), int(floor(smid.y / chunk_m)))
		for i in range(3):
			await get_tree().physics_frame
		var spur_poles := 0
		if c2 != null:
			for c in c2.get_children():
				if c.has_meta("roadside_pole") and String(c.get_meta("roadside_pole")) == String(spur["id"]):
					spur_poles += 1
		_check("a dirt spur gets NO corridor band (a hermit's track with utility poles is a lie)", spur_poles == 0)
		if c2 != null:
			c2.queue_free()

	# --- M4b: THE ADDRESS FURNITURE -----------------------------------------------
	# THE invariant: EXIT 9 (Meridian) stands near MILE 9 — same game-mile.
	var mer_exit := Vector2(1204, 282)
	var c9: Node3D = main.stream._spawn_chunk(int(floor(mer_exit.x / chunk_m)), int(floor(mer_exit.y / chunk_m)))
	for i in range(3):
		await get_tree().physics_frame
	var mile9 := false
	if c9 != null:
		for c in c9.get_children():
			if c.has_meta("mile_marker") and int(c.get_meta("mile_marker")) == 9 \
					and (c as Node3D).global_position.distance_to(Vector3(mer_exit.x, 0.75, mer_exit.y)) < 400.0:
				mile9 = true
	_check("EXIT 9 stands near MILE 9 (the American invariant, one game-mile)", mile9)
	if c9 != null:
		c9.queue_free()
	# the state line: find an interstate segment that crosses a border, build it
	var line_found := false
	for r2 in um.roads:
		if line_found or String(r2.get("kind", "")) != "interstate":
			continue
		var pts2: Array = r2["pts"]
		for i in range(pts2.size() - 1):
			if line_found:
				break
			var aa: Vector2 = pts2[i]
			var bb: Vector2 = pts2[i + 1]
			var sa := String(um.state_at(Vector3(aa.x, 0, aa.y)))
			var sb := String(um.state_at(Vector3(bb.x, 0, bb.y)))
			if sa == sb or sb == "" or sa == "":
				continue
			for t in range(1, 20):
				var q := aa + (bb - aa) * (float(t) / 20.0)
				if String(um.state_at(Vector3(q.x, 0, q.y))) != sa:
					if absf(q.x) <= 6000.0 and absf(q.y) <= 6000.0:
						break
					var cl: Node3D = main.stream._spawn_chunk(int(floor(q.x / chunk_m)), int(floor(q.y / chunk_m)))
					for j in range(3):
						await get_tree().physics_frame
					if cl != null:
						for c2b in cl.get_children():
							if c2b.has_meta("state_line"):
								line_found = true
						cl.queue_free()
					break
	_check("a WELCOME monument stands at a state line (the iconic drive read)", line_found)
	# M4b also promises route reassurance shields and camera-honest billboards.
	var shield_found := false
	var billboard_found := false
	var checked := 0
	for rr in um.roads:
		if checked >= 32 or (shield_found and billboard_found):
			break
		if String(rr.get("kind", "")) != "interstate":
			continue
		var rpts: Array = rr["pts"]
		for ri in range(rpts.size() - 1):
			if checked >= 32 or (shield_found and billboard_found):
				break
			var ra: Vector2 = rpts[ri]
			var rb: Vector2 = rpts[ri + 1]
			var rm := (ra + rb) * 0.5
			if absf(rm.x) <= 6000.0 and absf(rm.y) <= 6000.0:
				continue
			var rc: Node3D = main.stream._spawn_chunk(int(floor(rm.x / chunk_m)), int(floor(rm.y / chunk_m)))
			checked += 1
			if rc == null:
				continue
			for prop in rc.get_children():
				if prop.has_meta("route_shield"):
					shield_found = true
				if prop.has_meta("road_billboard") and _has_billboard_label(prop):
					billboard_found = true
			rc.queue_free()
	_check("route reassurance shields appear along interstates", shield_found)
	_check("camera-facing billboards appear along interstates", billboard_found)
	# the water tower says the TOWN's name (label override through the builder)
	var tower: Node3D = ProtoStructureBuilder.materialize("water_tower", "ROSEWOOD")
	add_child(tower)
	var says_town := false
	var stack: Array = [tower]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is Label3D and (n as Label3D).text.contains("ROSEWOOD"):
			says_town = true
			break
		for ch in n.get_children():
			stack.append(ch)
	_check("the water tower says the TOWN's name (label override)", says_town)
	tower.queue_free()

	_finish(prev_scale)
