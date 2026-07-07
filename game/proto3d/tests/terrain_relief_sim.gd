## Proof for TERRAIN RELIEF v1 (docs/design/TERRAIN_RELIEF.md — wilderness-only).
## The shared ground_y field is deterministic + continuous (no seams by construction),
## the wilderness-only law holds (flat on water / near roads / near towns / authored
## core), a REAL streamed chunk in high-relief wilderness builds a displaced floor with
## a HeightMapShape3D whose PHYSICS surface matches ground_y (raycast-verified — this
## catches heightmap orientation bugs), and the drape lifts chunk content onto the land.
## Run: godot --headless --path game res://proto3d/tests/terrain_relief_sim.tscn
extends Node3D

var passed := 0
var failed := 0
var usmap
var stream: ProtoWorldStream


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RELIEF: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## A wilderness spot in a high-relief state: far from roads/towns/water, beyond the slab.
func _find_wild() -> Vector3:
	for cy in range(0, usmap.h, 2):
		for cx in range(0, usmap.w, 2):
			var cc: Vector2 = usmap.cell_center(Vector2i(cx, cy))
			var pos := Vector3(cc.x, 0, cc.y)
			if absf(pos.x) <= ProtoWorldStream.SLAB + ProtoWorldStream.CHUNK \
					and absf(pos.z) <= ProtoWorldStream.SLAB + ProtoWorldStream.CHUNK:
				continue
			if float(ProtoWorldBuilder.STATE_RELIEF.get(usmap.state_at(pos), 0.0)) < 0.5:
				continue
			var b: String = usmap.biome_at(pos)
			if b == "water" or b == "ocean":
				continue
			if not usmap.road_near(pos, 260.0).is_empty():
				continue
			if not usmap.town_near(pos, 320.0).is_empty():
				continue
			if ProtoWorldBuilder.relief_at(pos.x, pos.z) > 0.4:
				return pos
	return Vector3.ZERO


func _ready() -> void:
	get_tree().create_timer(120.0).timeout.connect(func() -> void:
		print("RELIEF: DONE — %d passed, %d failed (WATCHDOG)" % [passed, failed + 1])
		get_tree().quit(1))
	usmap = ProtoUSMap.get_default()
	ProtoWorldBuilder.usmap = usmap
	ProtoWorldBuilder.extra_road_rects.clear()
	_check("usmap loads", usmap.ok)

	var wild := _find_wild()
	_check("found high-relief wilderness (%.0f, %.0f)" % [wild.x, wild.z], wild != Vector3.ZERO)

	# --- The field: deterministic, continuous, meaningfully tall in the wild. ------
	var h1 := ProtoWorldBuilder.ground_y(wild.x, wild.z)
	_check("ground_y is deterministic", ProtoWorldBuilder.ground_y(wild.x, wild.z) == h1)
	var max_h := 0.0
	var max_step := 0.0
	var prev := h1
	for i in 60:
		var h := ProtoWorldBuilder.ground_y(wild.x + i * 2.0, wild.z)
		max_h = maxf(max_h, h)
		max_step = maxf(max_step, absf(h - prev))
		prev = h
	_check("the wild actually ROLLS (max %.1f m > 2)" % max_h, max_h > 2.0)
	_check("continuous — no cliffs between samples (max step %.2f m / 2 m)" % max_step, max_step < 3.0)

	# --- The wilderness-only law: flat where the world needs flat. -----------------
	_check("authored core is FLAT (safehouse)", ProtoWorldBuilder.ground_y(110.0, -323.0) == 0.0)
	var road: Dictionary = usmap.road_near(Vector3(wild.x, 0, wild.z), 4000.0)
	if not road.is_empty():
		var mid: Vector2 = ((road["a"] as Vector2) + (road["b"] as Vector2)) * 0.5
		_check("roads stay FLAT (relief 0 on the asphalt)", ProtoWorldBuilder.relief_at(mid.x, mid.y) == 0.0)
	else:
		_check("(no road within 4km of the wild spot)", true)

	# --- A REAL streamed relief chunk: displaced floor + heightmap collider. -------
	stream = ProtoWorldStream.new()
	add_child(stream)
	stream.setup([])
	stream.update_stream(wild, self)   # fresh arrival — full ring, synchronous
	var ccx := int(floor(wild.x / ProtoWorldStream.CHUNK))
	var ccz := int(floor(wild.z / ProtoWorldStream.CHUNK))
	var chunk: Node3D = stream.loaded.get("%d,%d" % [ccx, ccz])
	_check("the wild chunk streams in", chunk != null)
	_check("it carries the RELIEF floor", chunk != null and chunk.has_meta("relief"))
	var floor_body: StaticBody3D = null
	var hshape: HeightMapShape3D = null
	if chunk != null:
		for c in chunk.get_children():
			if c.has_meta("relief_floor"):
				floor_body = c
				for s in c.get_children():
					if s is CollisionShape3D and (s as CollisionShape3D).shape is HeightMapShape3D:
						hshape = (s as CollisionShape3D).shape
	_check("floor collider is a HeightMapShape3D (never trimesh)", hshape != null)

	# The PHYSICS surface matches the field — raycast down and compare (orientation proof).
	for _i in 4:
		await get_tree().physics_frame
	var probe := Vector3(wild.x + 13.0, 60.0, wild.z + 7.0)
	var want := ProtoWorldBuilder.ground_y(probe.x, probe.z)
	var hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(
		PhysicsRayQueryParameters3D.create(probe, probe + Vector3(0, -120, 0)))
	_check("raycast hits the rolled land", not hit.is_empty())
	if not hit.is_empty():
		var err: float = absf(float(hit["position"].y) - want)
		_check("physics surface matches ground_y (err %.2f m ≤ 0.75)" % err, err <= 0.75)

	# --- THE DRAPE: chunk content rides up onto the land. --------------------------
	var fake := Node3D.new()
	add_child(fake)
	var prop := Node3D.new()
	fake.add_child(prop)
	prop.position = Vector3(wild.x + 20.0, 0.4, wild.z)
	stream._drape_chunk(fake)
	var lifted := prop.position.y - 0.4
	_check("the drape lifts a prop by ground_y (%.1f m)" % lifted,
		absf(lifted - ProtoWorldBuilder.ground_y(prop.position.x, prop.position.z)) < 0.01)

	print("RELIEF: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
