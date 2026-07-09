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

	_finish(prev_scale)
