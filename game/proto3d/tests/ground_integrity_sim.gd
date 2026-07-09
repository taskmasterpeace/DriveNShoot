## Proof for THE FLOOR IS LAW (docs/design/GROUND_INTEGRITY.md §8): floor under
## every highway sample, THE VOID NET catches + self-reports (foot AND car),
## floor-first survives a corrupt row, no tunneling at top speed (seeded
## repeats), no seam cliffs at the relief boundary, and bridges are REAL decks.
## Teleports below the world are the spec's own staging (§8.2).
## Run: godot --headless --path game res://proto3d/tests/ground_integrity_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GRND: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("GRND RESULTS: %d passed, %d failed" % [passed, failed])
	print("GRND: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _ray_down(p: Vector2, from_y: float = 50.0) -> Dictionary:
	var space := (main as Node3D).get_world_3d().direct_space_state
	return space.intersect_ray(PhysicsRayQueryParameters3D.create(
		Vector3(p.x, from_y, p.y), Vector3(p.x, -40.0, p.y)))


func _build_at(p: Vector2) -> Node3D:
	var chunk_m := float(ProtoWorldStream.CHUNK)
	return main.stream._spawn_chunk(int(floor(p.x / chunk_m)), int(floor(p.y / chunk_m)))


func _ready() -> void:
	print("GRND: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(240.0).timeout.connect(func() -> void:
		print("GRND: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	main = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().physics_frame
	var um: ProtoUSMap = main.stream.usmap

	# --- 1) FLOOR UNDER EVERY HIGHWAY (sampled sweep) ---------------------------
	var misses := 0
	var swept := 0
	for r in um.roads:
		if String(r.get("kind", "")) != "interstate":
			continue
		var pts: Array = r["pts"]
		var total := 0.0
		for i in range(pts.size() - 1):
			total += (pts[i + 1] as Vector2 - pts[i] as Vector2).length()
		for k in range(12):
			var want := total * (float(k) + 0.5) / 12.0
			var acc := 0.0
			var sample := Vector2.ZERO
			for i in range(pts.size() - 1):
				var seg_l := (pts[i + 1] as Vector2 - pts[i] as Vector2).length()
				if acc + seg_l >= want:
					sample = (pts[i] as Vector2) + (pts[i + 1] as Vector2 - pts[i] as Vector2) * ((want - acc) / seg_l)
					break
				acc += seg_l
			if absf(sample.x) <= 6000.0 and absf(sample.y) <= 6000.0:
				continue # the authored slab is unfallable by construction
			var chunk := _build_at(sample)
			for i in range(2):
				await get_tree().physics_frame
			swept += 1
			# walk the ray THROUGH above-floor bodies (median barrier at 0.8,
			# signs, structures) — the law is "a FLOOR exists at floor level",
			# not "nothing stands on the road".
			var floor_y := float(ProtoWorldBuilder.ground_y(sample.x, sample.y))
			var space := (main as Node3D).get_world_3d().direct_space_state
			var from3 := Vector3(sample.x, 50.0, sample.y)
			var found_floor := false
			for step in range(8):
				var h := space.intersect_ray(PhysicsRayQueryParameters3D.create(from3, Vector3(sample.x, -40.0, sample.y)))
				if h.is_empty():
					break
				var hy := (h["position"] as Vector3).y
				if hy >= -0.30 and hy <= floor_y + 0.35:
					found_floor = true
					break
				if hy < -0.30:
					break
				from3 = (h["position"] as Vector3) + Vector3(0, -0.2, 0)
			if not found_floor:
				misses += 1
				print("GRND: FLOOR MISS at %s on %s" % [sample, r["id"]])
			if chunk != null:
				chunk.queue_free()
	_check("floor under EVERY highway sample (%d swept, 0 misses)" % swept, swept > 50 and misses == 0)

	# --- 2) THE VOID NET (on foot, then at the wheel) ----------------------------
	# the game BOOTS you at the wheel — stage FOOT so the net watches the player
	main.mode = main.Mode.FOOT
	main.active_car = null
	main._good_pos.clear() # re-seed the ring for the newly-watched body
	for i in range(100): # bank ≥1 grounded ring sample (0.5 s cadence)
		await get_tree().physics_frame
	var player: Node3D = main.player
	var before: Vector3 = player.global_position
	player.global_position = Vector3(before.x, -12.0, before.z)
	for i in range(4):
		await get_tree().physics_frame
	_check("VOID NET rescues the on-foot player (y %.1f, above the world again)" % player.global_position.y,
		player.global_position.y > -1.0)
	_check("...with velocity zeroed", (player as CharacterBody3D).velocity.length() < 0.5)
	# at the wheel
	var car: Node3D = main.cars[0]
	main.mode = main.Mode.DRIVE
	main.active_car = car
	for i in range(100):
		await get_tree().physics_frame
	var cbefore: Vector3 = car.global_position
	car.global_position = Vector3(cbefore.x, -14.0, cbefore.z)
	(car as RigidBody3D).linear_velocity = Vector3(0, -20, 30)
	for i in range(4):
		await get_tree().physics_frame
	_check("VOID NET rescues the active car (y %.1f)" % car.global_position.y,
		car.global_position.y > -1.0)
	_check("...car velocity killed (< 4 m/s after suspension settle, was 36)",
		(car as RigidBody3D).linear_velocity.length() < 4.0)
	main.mode = main.Mode.FOOT
	main.active_car = null

	# --- 3) FLOOR-FIRST vs a corrupt placement row -------------------------------
	var far := Vector2(9000.0, 9200.0)
	um.placements.append({"id": "grnd-corrupt"}) # no building, no pos — malformed on purpose
	um.placements.append({"id": "grnd-ok", "building": "no_such_row_xyz", "pos": far + Vector2(5, 5), "rot": 0.0})
	var c3 := _build_at(far)
	for i in range(2):
		await get_tree().physics_frame
	var hit3 := _ray_down(far)
	_check("a corrupt placement row NEVER costs the floor (ray still lands)",
		c3 != null and not hit3.is_empty() and absf((hit3["position"] as Vector3).y) < 0.30)
	if c3 != null:
		c3.queue_free()
	for i in range(um.placements.size() - 1, -1, -1):
		if String(um.placements[i].get("id", "")).begins_with("grnd-"):
			um.placements.remove_at(i)

	# --- 4) TUNNELING: top-speed drops onto a fresh floor (seeded repeats) -------
	var drop_at := Vector2(-9000.0, -9000.0)
	var c4 := _build_at(drop_at)
	for i in range(2):
		await get_tree().physics_frame
	var rng := RandomNumberGenerator.new()
	rng.seed = hash("ground_integrity")
	var test_car: Node3D = ProtoCar3D.create("scavenger", Color(0.5, 0.4, 0.3))
	add_child(test_car)
	var tunneled := 0
	var drops := 24
	for d in range(drops):
		test_car.global_position = Vector3(drop_at.x + rng.randf_range(-20, 20), 10.0, drop_at.y + rng.randf_range(-20, 20))
		test_car.global_rotation = Vector3(-0.5, rng.randf_range(0, TAU), 0.0) # nose down
		(test_car as RigidBody3D).linear_velocity = Vector3(0, -14, 34).rotated(Vector3.UP, test_car.global_rotation.y)
		(test_car as RigidBody3D).angular_velocity = Vector3.ZERO
		for i in range(26):
			await get_tree().physics_frame
		if test_car.global_position.y < -0.11:
			tunneled += 1
			print("GRND: TUNNELED on drop %d (y %.2f)" % [d, test_car.global_position.y])
	test_car.queue_free()
	if c4 != null:
		c4.queue_free()
	_check("NO tunneling in %d seeded top-speed drops (CCD + 2 m floors)" % drops, tunneled == 0)

	# --- 5) SEAM-CLIFF: the relief boundary beside a highway ---------------------
	var seam_checked := false
	var seam_ok := true
	for r2 in um.roads:
		if seam_checked or String(r2.get("kind", "")) != "interstate":
			continue
		var pts2: Array = r2["pts"]
		for i in range(pts2.size() - 1):
			if seam_checked:
				break
			var a2: Vector2 = pts2[i]
			var b2: Vector2 = pts2[i + 1]
			var dirn := (b2 - a2).normalized()
			var perp := Vector2(dirn.y, -dirn.x)
			for t in [0.25, 0.5, 0.75]:
				var road_p := a2 + (b2 - a2) * float(t)
				var off_p := road_p + perp * 200.0
				if absf(off_p.x) <= 6000.0 and absf(off_p.y) <= 6000.0:
					continue
				if ProtoWorldBuilder.relief_at(off_p.x, off_p.y) > 0.05:
					# found the fade band: chunks at 100 m (flat band) vs 228 m (relief)
					var ca := _build_at(road_p + perp * 100.0)
					var cb := _build_at(road_p + perp * 228.0)
					for i2 in range(3):
						await get_tree().physics_frame
					# sample along the straddle line every 2 m for 40 m
					var worst := 0.0
					var prev_y := 1e9
					for s in range(40):
						var sp := road_p + perp * (90.0 + 2.0 * float(s))
						var hy := _ray_down(sp)
						if hy.is_empty():
							continue
						var yv := (hy["position"] as Vector3).y
						if prev_y < 1e8:
							worst = maxf(worst, absf(yv - prev_y))
						prev_y = yv
					seam_ok = worst < 0.35 # 2 m sampling: 0.15/0.5m law scaled ≈ honest slope bound
					print("GRND: seam worst step %.2f m at %s" % [worst, road_p])
					seam_checked = true
					if ca != null:
						ca.queue_free()
					if cb != null:
						cb.queue_free()
					break
	_check("no cliff at the relief seam (worst sampled step within the slope law)", seam_checked and seam_ok)

	# --- 6) BRIDGES ARE REAL DECKS ------------------------------------------------
	var deck_checked := false
	var deck_ok := false
	for r3 in um.roads:
		if deck_checked or String(r3.get("kind", "")) != "interstate":
			continue
		var pts3: Array = r3["pts"]
		var total3 := 0.0
		for i in range(pts3.size() - 1):
			total3 += (pts3[i + 1] as Vector2 - pts3[i] as Vector2).length()
		for k in range(60):
			if deck_checked:
				break
			var want3 := total3 * (float(k) + 0.5) / 60.0
			var acc3 := 0.0
			var sp3 := Vector2.ZERO
			var dirn3 := Vector2.RIGHT
			for i in range(pts3.size() - 1):
				var seg_l3 := (pts3[i + 1] as Vector2 - pts3[i] as Vector2).length()
				if acc3 + seg_l3 >= want3:
					sp3 = (pts3[i] as Vector2) + (pts3[i + 1] as Vector2 - pts3[i] as Vector2) * ((want3 - acc3) / seg_l3)
					dirn3 = ((pts3[i + 1] as Vector2) - (pts3[i] as Vector2)).normalized()
					break
				acc3 += seg_l3
			if absf(sp3.x) <= 6000.0 and absf(sp3.y) <= 6000.0:
				continue
			if String(um.biome_at(Vector3(sp3.x, 0, sp3.y))) != "water":
				continue
			var c6 := _build_at(sp3)
			for i in range(3):
				await get_tree().physics_frame
			var g6: Dictionary = ProtoUSMap.road_geometry(um.road_by_id(String(r3["id"])))
			var perp6 := Vector2(dirn3.y, -dirn3.x)
			var lane_off := (float(g6["median_w"]) * 0.5 + float(g6["carriage_w"]) * 0.5) if bool(g6["divided"]) else 0.0
			var probe6 := sp3 + perp6 * lane_off
			var hit6 := _ray_down(probe6, 30.0)
			deck_checked = true
			deck_ok = not hit6.is_empty() and (hit6["position"] as Vector3).y > 0.0 \
				and (hit6["collider"] as Node).has_meta("road_deck")
			print("GRND: bridge probe at %s -> %s (y %.2f)" % [probe6,
				("deck" if deck_ok else "NOT DECK"), ((hit6["position"] as Vector3).y if not hit6.is_empty() else -99.0)])
			if c6 != null:
				c6.queue_free()
	_check("a river crossing lands on the DECK, not the lakebed", deck_checked and deck_ok)

	_finish(prev_scale)
