## Stage 5 v2: the USA streams in. Chunks spawn in a ring around you, unload
## behind, deterministic from the world seed — and now every chunk asks the
## MACRO MAP (ProtoUSMap ← data/usmap.json ← MapForge) what America looks like
## here: biome ground + scatter (forest/farmland/desert/plains/swamp/mountains),
## real interstates that materialize as drivable asphalt (with bridges over
## water), neighborhoods and small woods hugging the highways, town ruins with
## landmarks, REAL state lines with welcome signs, and a two-level world map
## (M: local fog-of-war → the country atlas).
class_name ProtoWorldStream
extends Node3D

const CHUNK := 128.0
const RING := 3 ## load radius in chunks
const WORLD_SEED := 0xD817D
## The hand-authored zone (highway + Meridian) — streaming skips it.
const AUTHORED := Rect2(-60, -440, 280, 900) ## x, z, w, d
const SLAB := 5800.0 ## the authored 12 km ground slab's half-size — beyond it, chunks bring floors

## Fallback bands if the map file is missing (pre-usmap behavior).
const STATES: Array = ["VIRGINIA", "KENTUCKY", "MISSOURI", "KANSAS", "COLORADO", "UTAH", "NEVADA", "CALIFORNIA"]

# (ROAD_W retired 2026-07-07: width is the ROW's — ProtoUSMap.road_geometry, the one law.)

const BIOME_GROUND: Dictionary = {
	"forest": Color(0.30, 0.34, 0.20), "farmland": Color(0.55, 0.48, 0.26),
	"plains": Color(0.52, 0.47, 0.30), "scrub": Color(0.52, 0.42, 0.28),
	"desert": Color(0.62, 0.50, 0.32), "mountains": Color(0.46, 0.44, 0.42),
	"swamp": Color(0.30, 0.32, 0.22), "urban": Color(0.42, 0.40, 0.38),
	"water": Color(0.16, 0.28, 0.34), "ocean": Color(0.10, 0.20, 0.28),
}

const MAP_BIOME: Dictionary = {
	"forest": Color(0.24, 0.33, 0.18), "farmland": Color(0.55, 0.47, 0.24),
	"plains": Color(0.45, 0.42, 0.26), "scrub": Color(0.42, 0.35, 0.24),
	"desert": Color(0.58, 0.46, 0.28), "mountains": Color(0.40, 0.39, 0.38),
	"swamp": Color(0.25, 0.30, 0.20), "urban": Color(0.50, 0.47, 0.44),
	"water": Color(0.15, 0.30, 0.40), "ocean": Color(0.08, 0.16, 0.24),
}

var usmap: ProtoUSMap = null

## THE INSTANTIATION BRIDGE (docs/design/POPULATION_WAR.md §3.2): optional —
## null (or population_targets.json absent/empty, which leaves every cell's
## desired_pop at all-zero) means every spawn call below behaves EXACTLY as it
## did before this system existed: pure hash-roll, parity mode, §4's
## backward-compat law. Set by setup() when main carries a population ledger.
var population: ProtoPopulation = null

var loaded: Dictionary = {} ## "cx,cz" -> Node3D
var visited: Dictionary = {} ## "cx,cz" -> Vector2 (chunk center) — the map's fog-of-war
## STREAMING BUDGET (mined from LittleFernStudio/Chunk-Loader, MIT — its queued
## _process_load_queue): steady-state driving spawns at most this many chunks per frame
## from a nearest-first queue, so crossing a chunk boundary no longer builds a whole new
## ROW in one frame (the hitch). Tunable; 3 clears a 7-wide edge in ~3 frames.
const LOAD_BUDGET := 3
var _load_queue: Array = [] ## pending chunk coords (Vector2i), drained nearest-first
var last_state: String = ""

var _map_layer: CanvasLayer = null
var _map_panel: PanelContainer = null
var _map_canvas: Control = null
var _map_player: Vector3 = Vector3.ZERO
var _map_mode: int = 0 ## 1 = local (fog-of-war), 2 = country atlas
var _pois: Array = []
var _main: Node = null ## the game root — the atlas calls back to set a course


func setup(pois: Array, main_ref: Node = null) -> void:
	_pois = pois
	_main = main_ref
	if usmap == null:
		usmap = ProtoUSMap.get_default()
	if main_ref != null and "population" in main_ref and main_ref.population != null:
		population = main_ref.population


## Which state a world position is in (the macro map's Voronoi states; the old
## 800 m bands only if the map file is missing).
func current_state(pos) -> String:
	if usmap != null and usmap.ok:
		var p: Vector3 = pos if pos is Vector3 else Vector3(float(pos), 0, 0)
		var st := usmap.state_at(p)
		return st if st != "" else "OPEN WATER"
	var x: float = pos.x if pos is Vector3 else float(pos)
	var idx := clampi(int(floor((x + 400.0) / 800.0)) + 3, 0, STATES.size() - 1)
	return STATES[idx]


func biome_at(pos: Vector3) -> String:
	if usmap != null and usmap.ok:
		return usmap.biome_at(pos)
	return "scrub"


func update_stream(body_pos: Vector3, main: Node) -> void:
	_map_player = body_pos
	var ccx := int(floor(body_pos.x / CHUNK))
	var ccz := int(floor(body_pos.z / CHUNK))
	# LOAD (Chunk-Loader mine): a FRESH arrival (spawn/teleport — no ground loaded under
	# you) fills the whole ring NOW; you need the floor immediately and can't hide a hitch
	# you asked for by teleporting. Steady-state driving instead ENQUEUES the new edge and
	# spawns at most LOAD_BUDGET/frame, nearest first — killing the boundary-cross spike
	# (a whole new row of chunks used to materialize in one frame).
	if not loaded.has("%d,%d" % [ccx, ccz]):
		_load_queue.clear()
		for dx in range(-RING, RING + 1):
			for dz in range(-RING, RING + 1):
				_spawn_at(ccx + dx, ccz + dz)
	else:
		for dx in range(-RING, RING + 1):
			for dz in range(-RING, RING + 1):
				var c := Vector2i(ccx + dx, ccz + dz)
				if not loaded.has("%d,%d" % [c.x, c.y]) and not (c in _load_queue):
					_load_queue.append(c)
		_drain_load_queue(body_pos, ccx, ccz)
	# Unload beyond ring+1
	for key in loaded.keys().duplicate():
		var parts: PackedStringArray = key.split(",")
		if absi(int(parts[0]) - ccx) > RING + 1 or absi(int(parts[1]) - ccz) > RING + 1:
			if loaded[key] != null and is_instance_valid(loaded[key]):
				_bank_chunk_survivors(loaded[key])
				loaded[key].queue_free()
			loaded.erase(key)
			ProtoWorldBuilder.extra_road_rects.erase(key)
	# State line crossings announce themselves
	var st := current_state(body_pos)
	if st != last_state:
		if last_state != "" and main.has_method("notify"):
			main.notify("🪧 WELCOME TO %s" % st)
			if main.has_method("on_state_entered"):
				main.on_state_entered(st) # the ruler reads your ledger at the border
		last_state = st
	# Keep the open map live so the you-dot and your markers track as you move.
	if map_open():
		_map_canvas.queue_redraw()


## Build one chunk and register it in loaded + the fog-of-war visited set. Idempotent.
func _spawn_at(cx: int, cz: int) -> void:
	var key := "%d,%d" % [cx, cz]
	if loaded.has(key):
		return
	var ch := _spawn_chunk(cx, cz)
	if ch != null and ch.has_meta("relief"):
		_drape_chunk(ch) # scatter/wrecks/caches sit ON the rolled land, not inside it
	loaded[key] = ch
	visited[key] = Vector2((cx + 0.5) * CHUNK, (cz + 0.5) * CHUNK)


## A RELIEF floor: a subdivided plane displaced by the shared ground_y field (both sides
## of a seam sample the same function → edges match), skinned like the flat floors, with
## a HeightMapShape3D collider (cheap, purpose-built — the doc's law: never a trimesh).
func _relief_floor(center: Vector3, biome: String) -> StaticBody3D:
	const N := 16                       # cells per side → 17×17 height samples
	var size := CHUNK + 2.0
	var step := size / N
	var body := StaticBody3D.new()
	body.position = Vector3(center.x, 0, center.z)

	var pm := PlaneMesh.new()
	pm.size = Vector2(size, size)
	pm.subdivide_width = N - 1
	pm.subdivide_depth = N - 1
	var arrays: Array = pm.get_mesh_arrays()
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	for i in verts.size():
		verts[i].y = ProtoWorldBuilder.ground_y(center.x + verts[i].x, center.z + verts[i].z)
	arrays[Mesh.ARRAY_VERTEX] = verts
	var am := ArrayMesh.new()
	am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var st := SurfaceTool.new()
	st.create_from(am, 0)
	st.generate_normals() # displaced slopes need real normals to light correctly
	var gm := MeshInstance3D.new()
	gm.mesh = st.commit()
	gm.material_override = ProtoWorldBuilder.ground_material(BIOME_GROUND.get(biome, BIOME_GROUND["scrub"]), 1.0)
	body.add_child(gm)

	var hshape := HeightMapShape3D.new()
	hshape.map_width = N + 1
	hshape.map_depth = N + 1
	var data := PackedFloat32Array()
	data.resize((N + 1) * (N + 1))
	for zz in N + 1:
		for xx in N + 1:
			var wx := center.x - size * 0.5 + xx * step
			var wz := center.z - size * 0.5 + zz * step
			data[zz * (N + 1) + xx] = ProtoWorldBuilder.ground_y(wx, wz)
	hshape.map_data = data
	var cs := CollisionShape3D.new()
	cs.shape = hshape
	cs.scale = Vector3(step, 1.0, step) # heightmap cells are 1 unit — stretch to the grid
	body.add_child(cs)
	body.set_meta("relief_floor", true)
	return body


## THE DRAPE: lift a relief chunk's content onto the land. Road-adjacent pieces move ~0
## by construction (relief fades to zero near asphalt), pure-wilderness scatter rides up.
func _drape_chunk(chunk: Node3D) -> void:
	for child in chunk.get_children():
		if child is Node3D and not child.has_meta("relief_floor"):
			var c := child as Node3D
			c.position.y += ProtoWorldBuilder.ground_y(c.position.x, c.position.z)


## Spawn up to LOAD_BUDGET queued chunks this frame, nearest to the player first, after
## dropping any that became stale (already loaded, or fell outside the load ring because
## the player kept moving). The heart of the Chunk-Loader mine.
func _drain_load_queue(body_pos: Vector3, ccx: int, ccz: int) -> void:
	if _load_queue.is_empty():
		return
	var kept: Array = []
	for c in _load_queue:
		if loaded.has("%d,%d" % [c.x, c.y]):
			continue
		if absi(c.x - ccx) > RING or absi(c.y - ccz) > RING:
			continue
		kept.append(c)
	_load_queue = kept
	var p := Vector2(body_pos.x, body_pos.z)
	_load_queue.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		return _chunk_center(a).distance_squared_to(p) < _chunk_center(b).distance_squared_to(p))
	var built := 0
	while built < LOAD_BUDGET and not _load_queue.is_empty():
		var c: Vector2i = _load_queue.pop_front()
		_spawn_at(c.x, c.y)
		built += 1


func _chunk_center(c: Vector2i) -> Vector2:
	return Vector2((c.x + 0.5) * CHUNK, (c.y + 0.5) * CHUNK)


## THE INSTANTIATION BRIDGE's unload half (§3.2): before a chunk is freed, any
## SURVIVING ledger-tagged actor banks back into its cell's current_pop. A dead
## actor never reaches here still tagged — its death handler (ProtoHowler/
## ProtoLurker's take_damage, the moment it sets dead=true) already called
## ProtoPopulation.on_actor_removed() and cleared the meta tag first, so this
## walk only ever finds the living (§3.2: "death-removal always fires first").
func _bank_chunk_survivors(chunk: Node) -> void:
	if population == null:
		return
	for child in chunk.get_children():
		if child.is_in_group("pop_ledger") and child.has_meta("pop_cell") and child.has_meta("pop_group"):
			population.bank(String(child.get_meta("pop_cell")), String(child.get_meta("pop_group")))
			child.remove_meta("pop_cell")
			child.remove_meta("pop_group")
			child.remove_from_group("pop_ledger")


func _spawn_chunk(cx: int, cz: int) -> Node3D:
	var center := Vector3((cx + 0.5) * CHUNK, 0, (cz + 0.5) * CHUNK)
	if AUTHORED.has_point(Vector2(center.x, center.z)):
		return null # hand-built land — leave it alone
	var chunk := Node3D.new()
	add_child(chunk)
	var rng := RandomNumberGenerator.new()
	rng.seed = hash("%d:%d:%d" % [WORLD_SEED, cx, cz])
	var key := "%d,%d" % [cx, cz]

	# (GROUND_INTEGRITY rule 2 — FLOOR-FIRST CHUNK LAW: placements/exits moved
	# BELOW the ground + road passes. A bad row used to abort the build before
	# the floor existed — one bad placement on a highway chunk = a floorless
	# chunk on the interstate. Now the floor always lands first.)
	var biome := biome_at(center)
	var wet := biome == "water" or biome == "ocean"

	# --- Ground. Beyond the authored slab a chunk brings its own floor (in its
	# biome's color); inside the slab, non-desert biomes lay a tint quad on top.
	if absf(center.x) > SLAB or absf(center.z) > SLAB:
		# TERRAIN RELIEF (wilderness-only, docs/design/TERRAIN_RELIEF.md): where the
		# state's relief knob says the land rolls — and no road/town needs it flat —
		# the chunk floor is a DISPLACED mesh over ground_y with a HeightMapShape3D
		# collider (never a trimesh). Everywhere else: the flat slab, byte-identical.
		# GROUND_INTEGRITY rule 4 (SEAM-CLIFF LAW): the floor-type decision samples
		# FIVE points (center + corners) — one relief corner beside a flattened
		# highway chunk used to make a vertical cliff wall at the seam.
		var rly := false
		if not wet:
			var chalf_g := CHUNK * 0.5
			for sp in [Vector2.ZERO, Vector2(-chalf_g, -chalf_g), Vector2(chalf_g, -chalf_g),
					Vector2(-chalf_g, chalf_g), Vector2(chalf_g, chalf_g)]:
				if ProtoWorldBuilder.relief_at(center.x + sp.x, center.z + sp.y) > 0.02:
					rly = true
					break
		if rly:
			chunk.add_child(_relief_floor(center, biome))
			chunk.set_meta("relief", true)
		else:
			# GROUND_INTEGRITY rule 3b (TUNNELING): 0.5 m floors tunnel at 38 m/s
			# (0.63 m/tick). 2.0 m thick, extended DOWNWARD — top face unchanged.
			var g := StaticBody3D.new()
			var gm := MeshInstance3D.new()
			var plane := BoxMesh.new()
			plane.size = Vector3(CHUNK + 2.0, 2.0, CHUNK + 2.0)
			gm.mesh = plane
			gm.material_override = ProtoWorldBuilder.ground_material(BIOME_GROUND.get(biome, BIOME_GROUND["scrub"]), 1.0)
			gm.position.y = -1.01 - (0.22 if wet else 0.0) # top face where the 0.5 m floor's was
			g.add_child(gm)
			var gs := CollisionShape3D.new()
			var gb := BoxShape3D.new()
			gb.size = Vector3(CHUNK + 2.0, 2.0, CHUNK + 2.0)
			gs.shape = gb
			gs.position.y = gm.position.y
			g.add_child(gs)
			g.position = Vector3(center.x, 0, center.z)
			chunk.add_child(g)
	elif biome != "scrub" and biome != "desert":
		ProtoWorldBuilder.ground_visual(chunk, Vector3(CHUNK, 0.04, CHUNK),
			center + Vector3(0, 0.03, 0), BIOME_GROUND.get(biome, BIOME_GROUND["scrub"]))

	# --- The roads materialize (ROAD_TRAFFIC_OVERHAUL.md §3.3): EVERY macro road
	# near this chunk becomes real asphalt to its ROW's geometry — lanes, median
	# division, honest grip width. Plural is the junction fix: an exit ramp used
	# to displace the very interstate it merges with (nearest-only). Over water
	# a road rides a BRIDGE deck — rivers are crossable where roads cross them.
	var road: Dictionary = {}
	if usmap != null and usmap.ok:
		road = usmap.road_near(center, 220.0) # the NEAREST, for the scatter consumers below
		for row in usmap.roads_near(center, 220.0):
			_build_road_stretch(chunk, center, row, key, wet)
		# THE INTERSECTION SLAB (M1): one per flat tee/cross node — painted ABOVE
		# every road's per-id lift so the crossing reads as one paved mouth
		# instead of two z-fighting slabs. Walled (separated_pending) crossings
		# get NO slab — the roads pass without meeting until M2 decks them.
		var chalf := CHUNK * 0.5
		for j in usmap.junctions_in(Rect2(center.x - chalf, center.z - chalf, CHUNK, CHUNK)):
			if String(j["grade"]) == "flat" and ["tee", "cross"].has(String(j["kind"])):
				var wmax := 8.0
				for l in j["legs"]:
					var lr: Dictionary = usmap.road_by_id(String(l["road"]))
					if not lr.is_empty():
						wmax = maxf(wmax, float(ProtoUSMap.road_geometry(lr)["width"]))
				var jp: Vector2 = j["pos"]
				var jslab := ProtoWorldBuilder.box_visual(chunk, Vector3(wmax + 2.0, 0.05, wmax + 2.0),
					Vector3(jp.x, 0.13, jp.y), ProtoWorldBuilder.COL_ROAD, 0.0)
				jslab.set_meta("junction_slab", String(j["id"]))
			elif String(j["kind"]) == "ramp_mouth" and (j["legs"] as Array).size() >= 2:
				# THE EXIT DRESSING (0.18a): painted GORE at the split, crash
				# barrels at its tip, and the DECEL LANE running the serving
				# shoulder upstream — the "little angle" now READS at 60 mph.
				var hwyr: Dictionary = usmap.road_by_id(String(j["legs"][0]["road"]))
				var rampr: Dictionary = usmap.road_by_id(String(j["legs"][1]["road"]))
				if hwyr.is_empty() or rampr.is_empty() or (rampr["pts"] as Array).size() < 2:
					continue
				var p0: Vector2 = rampr["pts"][0]
				var rd: Vector2 = ((rampr["pts"][1] as Vector2) - p0).normalized()
				var gore := ProtoWorldBuilder.box_visual(chunk, Vector3(2.2, 0.05, 7.0),
					Vector3(p0.x + rd.x * 8.0, 0.135, p0.y + rd.y * 8.0),
					Color(0.82, 0.80, 0.74), atan2(rd.x, rd.y))
				gore.set_meta("junction_gore", String(j["id"]))
				for bi in range(3):
					var bp := p0 + rd * (4.0 + 1.2 * float(bi))
					var barrel := ProtoWorldBuilder.box_body(chunk, Vector3(0.55, 0.9, 0.55),
						Vector3(bp.x, 0.45, bp.y), Color(0.85, 0.42, 0.08), atan2(rd.x, rd.y))
					barrel.set_meta("gore_barrel", String(j["id"]))
				var side_i := int(rampr.get("side", 0))
				if side_i != 0:
					var hd := Vector2.RIGHT
					var best_hd := 1e18
					var hpts: Array = hwyr["pts"]
					for hi in range(hpts.size() - 1):
						var hdd := ProtoUSMap._seg_dist(j["pos"], hpts[hi], hpts[hi + 1])
						if hdd < best_hd:
							best_hd = hdd
							hd = ((hpts[hi + 1] as Vector2) - (hpts[hi] as Vector2)).normalized()
					var d_s := hd * float(side_i)
					var rightv := Vector2(-d_s.y, d_s.x)
					var lat := float(ProtoUSMap.road_geometry(hwyr)["width"]) * 0.5 - 1.5
					var dc := (j["pos"] as Vector2) + rightv * lat - d_s * 74.0
					var decel := ProtoWorldBuilder.box_visual(chunk, Vector3(3.0, 0.05, 140.0),
						Vector3(dc.x, 0.125, dc.y), ProtoWorldBuilder.COL_ROAD, atan2(d_s.x, d_s.y))
					decel.set_meta("road_decel", String(j["id"]))

	# AUTHORED PLACEMENTS (MapForge v2 Goal 2b) + EXIT SIGNS — after the floor
	# and roads exist (GROUND_INTEGRITY rule 2). Each spawn is defensive: a bad
	# row costs one prop and a push_warning, never the floor.
	if usmap != null and usmap.ok:
		var phalf2 := CHUNK * 0.5
		for p in usmap.placements_in(Rect2(center.x - phalf2, center.z - phalf2, CHUNK, CHUNK)):
			if not (p is Dictionary) or not p.has("building") or not p.has("pos"):
				push_warning("world_stream: malformed placement row skipped in %s" % key)
				continue
			_spawn_placement(chunk, p)
		for e in usmap.exits_in(Rect2(center.x - phalf2, center.z - phalf2, CHUNK, CHUNK)):
			if not (e is Dictionary) or not e.has("pos"):
				push_warning("world_stream: malformed exit row skipped in %s" % key)
				continue
			_spawn_exit_sign(chunk, e)

	# --- Water chunks: still surface, no scatter, nothing to fight. -----------
	if wet:
		if absf(center.x) <= SLAB and absf(center.z) <= SLAB:
			ProtoWorldBuilder.box_visual(chunk, Vector3(CHUNK, 0.04, CHUNK),
				center + Vector3(0, 0.045, 0), BIOME_GROUND[biome])
		return chunk

	# --- A town? (macro anchor inside this chunk → ruins + sign + landmark) ---
	if usmap != null and usmap.ok:
		var t := usmap.town_near(center, 91.0)
		if not t.is_empty() and not bool(t.get("authored", false)):
			var tp: Vector2 = t["pos"]
			if absf(tp.x - center.x) <= CHUNK * 0.5 and absf(tp.y - center.z) <= CHUNK * 0.5:
				_stamp_town(chunk, t, rng)

	# --- Neighborhoods + small woods hug the highway (the real-America ask) ---
	var near_road: bool = not road.is_empty() and float(road.get("dist", 999.0)) < 95.0
	if near_road and biome in ["plains", "farmland", "forest", "scrub"] and rng.randf() < 0.3:
		_stamp_neighborhood(chunk, center, road, rng)

	# --- Biome content --------------------------------------------------------
	match biome:
		"forest":
			# THE FRONTIER LAW (owner + lore bible): eastern forest is DENSE and
			# collidable — deep woods off the road are car-proof but a horse or a
			# motorcycle threads the trunks (solid gaps >= ~1.5m clear the bike's
			# 0.9m bars, never a 1.9m+ car). The west stays open country. Roads
			# always keep their cleared shoulders — the road is the way through.
			var deep := road.is_empty() or float(road.get("dist", 999.0)) > 140.0
			var east_x := center.x > -10000.0
			var mid_x := center.x > -35000.0 and not east_x
			var solid := 5
			var visual := 52 if near_road else 40
			if deep and east_x:
				solid = 34
				visual = 72
			elif deep and mid_x:
				solid = 16
				visual = 52
			elif deep:
				solid = 8
			_trees(chunk, center, rng, visual, road, solid)
		"farmland":
			_crops(chunk, center, rng)
			if rng.randf() < 0.14:
				var bpos := center + Vector3(rng.randf_range(-45, 45), 0, rng.randf_range(-45, 45))
				ProtoWorldBuilder.box_body(chunk, Vector3(7, 4.5, 10), bpos + Vector3(0, 2.25, 0), Color(0.48, 0.20, 0.14))
				ProtoWorldBuilder.box_body(chunk, Vector3(2.4, 7.0, 2.4), bpos + Vector3(6, 3.5, 2), Color(0.6, 0.58, 0.52))
			if near_road and rng.randf() < 0.4:
				_trees(chunk, center, rng, 10, road) # the windbreak line by the road
		"plains":
			_scatter(chunk, center, rng, 12, Color(0.36, 0.38, 0.24))
			if rng.randf() < 0.25:
				_trees(chunk, center, rng, 3, road)
			if near_road and rng.randf() < 0.35:
				_trees(chunk, center, rng, 9, road) # a small roadside copse
			# WILD HORSES (frontier goal + the animal-location tune): mustang
			# country is the WEST — open plains chunks graze a catchable horse
			# (E mounts; same rig as the stable's). East keeps them rare.
			var horse_p := 0.09 if center.x < -35000.0 else (0.05 if center.x < -10000.0 else 0.025)
			if rng.randf() < horse_p:
				var wild := ProtoHorse.create("mustang" if center.x < -10000.0 else "draft")
				chunk.add_child(wild)
				wild.set_meta("wild_horse", true)
				var hoff := Vector3(rng.randf_range(-45, 45), 0.3, rng.randf_range(-45, 45))
				if road.is_empty() or ProtoUSMap._seg_dist(Vector2(center.x + hoff.x, center.z + hoff.z), road["a"], road["b"]) > float(ProtoUSMap.road_geometry(road)["width"]) * 0.5 + 8.0:
					wild.position = center + hoff
				else:
					wild.position = center + Vector3(0, 0.3, 55)
		"scrub":
			_scatter(chunk, center, rng, 26, Color(0.33, 0.36, 0.22))
		"desert":
			_scatter(chunk, center, rng, 16, Color(0.5, 0.42, 0.3))
			for i in 3:
				ProtoWorldBuilder.box_visual(chunk, Vector3(3.5, 0.03, 3.5),
					center + Vector3(rng.randf_range(-55, 55), 0.015, rng.randf_range(-55, 55)), Color(0.55, 0.44, 0.27))
		"mountains":
			# THE RIDGE LAW (frontier goal): deep mountains (no road near) stack
			# REAL rock — a wall of outcrops cars cannot cross; horses and bikes
			# pick between them; the road through is the only easy line.
			var deep_mtn := road.is_empty() or float(road.get("dist", 999.0)) > 140.0
			for i in rng.randi_range(7, 10) if deep_mtn else rng.randi_range(3, 5):
				var rpos := center + Vector3(rng.randf_range(-56, 56), 0, rng.randf_range(-56, 56))
				if _on_new_road(rpos, key):
					continue
				var rh := rng.randf_range(2.2, 5.5) * (1.5 if deep_mtn else 1.0)
				var rock := ProtoWorldBuilder.box_body(chunk, Vector3(rng.randf_range(4, 11), rh, rng.randf_range(4, 11)),
					rpos + Vector3(0, rh * 0.5 - 0.4, 0), Color(0.46, 0.44, 0.42), rng.randf_range(0, TAU))
				rock.set_meta("ridge_rock", true)
			_scatter(chunk, center, rng, 14, Color(0.42, 0.40, 0.37))
		"swamp":
			for i in 4:
				ProtoWorldBuilder.box_visual(chunk, Vector3(rng.randf_range(6, 14), 0.03, rng.randf_range(6, 14)),
					center + Vector3(rng.randf_range(-50, 50), 0.04, rng.randf_range(-50, 50)), Color(0.14, 0.22, 0.20))
			_trees(chunk, center, rng, 14, road)
			_scatter(chunk, center, rng, 12, Color(0.3, 0.33, 0.2))
			# THE GATOR (MAP_POLISH_PLAN §3.3): a stationary ambush at the water's
			# edge — deterministic per chunk, PLACED before the player arrives
			# (never popped into view), excluded from population current_pop.
			if rng.randf() < 0.22 and near_road:
				var gator := ProtoGator.create()
				chunk.add_child(gator)
				var side2 := Vector2(rng.randf_range(-1, 1), rng.randf_range(-1, 1)).normalized()
				var gd := float(ProtoUSMap.road_geometry(road)["width"]) * 0.5 + rng.randf_range(8.0, 16.0)
				gator.position = Vector3(center.x + side2.x * gd, 0.15, center.z + side2.y * gd)
				gator.rotation.y = rng.randf_range(0, TAU)
		"urban":
			_stamp_ruined_block(chunk, center, rng, key)

	# --- Life & loot (density is the biome's mood) -----------------------------
	var lurk_p: float = {"swamp": 0.4, "urban": 0.35, "forest": 0.28, "mountains": 0.2,
		"plains": 0.2, "farmland": 0.18, "desert": 0.14, "scrub": 0.22}.get(biome, 0.2)
	if rng.randf() < 0.3 and biome != "urban":
		var wpos := center + Vector3(rng.randf_range(-40, 40), 0.45, rng.randf_range(-40, 40))
		ProtoWorldBuilder.box_body(chunk, Vector3(2.0, 0.9, 4.4), wpos, ProtoWorldBuilder.COL_WRECK, rng.randf_range(0, TAU))
	if rng.randf() < lurk_p:
		var l := ProtoLurker.create()
		chunk.add_child(l)
		l.position = center + Vector3(rng.randf_range(-50, 50), 0.4, rng.randf_range(-50, 50))
	if rng.randf() < 0.12:
		# THE FIELD CACHE now VARIES per chest and can ARM you (2026-07-09 playtest
		# "every chest the same shit / no weapons anywhere") — see roll_field_cache below.
		var cache: Dictionary = roll_field_cache(biome, near_road, rng)
		var c := ProtoChest.create("Cache", cache)
		chunk.add_child(c)
		c.position = center + Vector3(rng.randf_range(-45, 45), 0.05, rng.randf_range(-45, 45))

	# --- THE INSTANTIATION BRIDGE (POPULATION_WAR.md §3.2) ---------------------
	# ADDITIVE to every hash-roll above (parity mode: population==null changes
	# nothing here at all — §4 backward-compat). When a ledger is wired in, this
	# chunk also spends whatever counts its parent 500m cell has BANKED, using
	# the exact same spawner calls this file already makes elsewhere.
	if population != null:
		_materialize_population(chunk, center)
	return chunk


## Spend this chunk's parent cell's banked counts into real actors — budgeted
## by the ledger, never a fresh hash-roll. Each spawn is tagged with the
## POPULATION cell key (the 500m ledger grid, NOT this chunk's 128m key — the
## two grids are deliberately different resolutions, POPULATION_WAR.md §3.1) so
## death/unload can find its way back to the count it came from (§3.2's bridge).
func _materialize_population(chunk: Node3D, center: Vector3) -> void:
	var budget: Dictionary = population.materialize_budget(center)
	if budget.is_empty():
		return
	var pop_key := population.cell_key(center)
	var players: Array = population._live_players()
	for group in budget.keys():
		var want := int(budget[group])
		var spent := 0
		var guard := 0
		while spent < want and guard < want * 6: # a handful of tries per unit before deferring
			guard += 1
			var cand := center + Vector3(randf_range(-58, 58), 0.0, randf_range(-58, 58))
			if not population.safe_to_spawn(cand, players):
				continue
			var actor: Node = _spawn_pop_actor(String(group), cand)
			if actor == null:
				break # no spawner for this group yet — bank the rest, don't loop forever
			chunk.add_child(actor)
			actor.global_position = cand + Vector3(0, 0.4, 0)
			actor.set_meta("pop_cell", pop_key)
			actor.set_meta("pop_group", String(group))
			actor.add_to_group("pop_ledger")
			spent += 1
		if spent < want:
			population.return_unspent(center, String(group), want - spent) # deferred, not lost


## group -> the concrete actor this bridge spawns for it, using the EXACT
## existing spawner calls already in this file/codebase (never a new one).
## "" groups this bridge doesn't materialize yet (faction_troops — P1/§3.4's
## ProtoSquad, out of this ticket's scope) simply bank forever, which is correct:
## counts-not-instances means nothing is lost by a group having no renderer yet.
func _spawn_pop_actor(group: String, _pos: Vector3) -> Node:
	match group:
		"threat":
			return ProtoLurker.create()
		"civilian":
			return ProtoNPC.create("drifter")
		"worker":
			return ProtoNPC.create("trader")
		"law":
			return ProtoNPC.create("secman")
		_:
			return null


## Build one authored structure at its exact world position, tagged so systems
## + tests can find it. THE MATERIALIZE WIRE (AMERICAN_ROAD M0): ids the catalog
## knows become REAL shells — signed, chest-seeded, door-gapped — through the
## one structure builder; unknown ids keep the massing-box fallback (0.7's law:
## deleting the fallback early turns un-migrated towns into nulls).
const ID_MIGRATE: Dictionary = {"gas_station": "gas_station_small"} ## legacy usmap ids → catalog rows (M0 migration)
const PLACEMENT_SIZE: Dictionary = {
	"safehouse": Vector3(10, 6, 12), "gas_station": Vector3(14, 4, 10),
	"ruined_house": Vector3(8, 4, 8), "market_stall": Vector3(4, 3, 3),
}
func _spawn_placement(chunk: Node3D, p: Dictionary) -> void:
	var sid := String(ID_MIGRATE.get(p["building"], p["building"]))
	DrivnData.ensure_structures()
	if DrivnData.structures.has(sid):
		var shell := ProtoStructureBuilder.materialize(sid, String(p.get("label", "")))
		if shell != null:
			shell.add_to_group("placement")
			shell.set_meta("building", p["building"])
			shell.set_meta("placement_id", p["id"])
			chunk.add_child(shell)
			shell.global_position = Vector3(p["pos"].x, 0.0, p["pos"].y)
			shell.rotation.y = float(p.get("rot", 0.0))
			return
	var size: Vector3 = PLACEMENT_SIZE.get(p["building"], Vector3(8, 4, 8))
	var body := StaticBody3D.new()
	body.add_to_group("placement")
	body.set_meta("building", p["building"])
	body.set_meta("placement_id", p["id"])
	var mesh := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mesh.mesh = bm
	mesh.material_override = ProtoWorldBuilder.material(Color(0.40, 0.36, 0.30), 0.75)
	mesh.position.y = size.y * 0.5
	body.add_child(mesh)
	var shape := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = size
	shape.shape = bs
	shape.position.y = size.y * 0.5
	body.add_child(shape)
	chunk.add_child(body)
	body.global_position = Vector3(p["pos"].x, 0.0, p["pos"].y)


## THE EXIT SIGN (World_Structures §18: every exit needs a highway sign): the
## big green read at the ramp mouth — number, name, tier — plus the archetype's
## glyph always visible. This is what makes an exit a DECISION at 60 mph.
func _spawn_exit_sign(chunk: Node3D, e: Dictionary) -> void:
	var glyphs: Dictionary = {"service": "⛽", "neighborhood": "🏘️", "county_seat": "⚖️",
		"industrial": "🏭", "metro": "🌆", "military_spur": "☢️", "dead": "🚫"}
	var glyph: String = glyphs.get(String(e.get("archetype", "service")), "🛣️")
	var label := "EXIT %d — %s (%s)" % [int(e.get("exit_number", 0)),
		String(e.get("name", "")).to_upper(), String(e.get("community_tier", "T1"))]
	var sign := ProtoSign.create(label, glyph)
	sign.add_to_group("exit_sign")
	sign.set_meta("exit_id", e.get("id", ""))
	chunk.add_child(sign)
	# Stand it at the ramp mouth, offset toward the exit's DESTINATION side so it
	# reads as "this way off" instead of standing in the traffic lane.
	var pos: Vector2 = e["pos"]
	var toward: Vector2 = (e["dest"] as Vector2) - pos
	var side := toward.normalized() * 9.0 if toward.length() > 1.0 else Vector2(9, 0)
	sign.global_position = Vector3(pos.x + side.x, 0.0, pos.y + side.y)


## ONE road row's stretch through this chunk: slab(s) to the row's geometry law,
## lane markings, a PHYSICAL median barrier when divided, bridge rails when wet,
## and the grip rect at the row's real width. Every piece is meta-tagged with
## the road id (road_slab / road_center / road_lane / road_barrier) so sims and
## tools can read the built world without guessing at colors.
func _build_road_stretch(chunk: Node3D, center: Vector3, row: Dictionary, key: String, wet: bool) -> void:
	var seg := _clip_segment_to_chunk(row["a"], row["b"], center)
	if seg.is_empty():
		return
	var a: Vector2 = seg[0]
	var b: Vector2 = seg[1]
	var mid := (a + b) * 0.5
	var dir := b - a
	var seg_len := dir.length()
	if seg_len <= 4.0:
		return
	var rid := String(row["id"])
	var g := ProtoUSMap.road_geometry(row)
	# Z-aligned slab → world yaw. M1 FIX: this was atan2(dir.x, -dir.y), which is
	# the Z-REFLECTED yaw — invisible on axis-aligned roads and 180°-symmetric
	# boxes, but every true DIAGONAL rendered (and collided!) mirrored across X.
	# The junction_law_sim physics ray caught it: barriers on diagonal stretches
	# existed 40+ m off their own centerline. Correct: local +Z → (sinφ, cosφ).
	var rot := atan2(dir.x, dir.y)
	var perp := Vector2(dir.y, -dir.x).normalized()
	# Deterministic per-id lift (≤24mm) so overlapping slabs at junctions never
	# z-fight — two roads through one chunk each keep their own plane.
	var y := (0.09 if wet else 0.07) + float(absi(hash(rid)) % 5) * 0.004
	if bool(g["divided"]):
		# TWIN CARRIAGEWAYS around the median gap, each with its own lane strips.
		var carriage_w := float(g["carriage_w"])
		var half_gap := float(g["median_w"]) * 0.5 + carriage_w * 0.5
		for sgn: float in [1.0, -1.0]:
			var off: Vector2 = perp * half_gap * sgn
			var slab := ProtoWorldBuilder.box_visual(chunk, Vector3(carriage_w, 0.05, seg_len + 6.0),
				Vector3(mid.x + off.x, y, mid.y + off.y), ProtoWorldBuilder.COL_ROAD, rot)
			slab.set_meta("road_slab", rid)
			for k in range(1, int(g["per_side"])):
				var lat: float = (float(g["center_gap"]) + k * ProtoUSMap.LANE_W) * sgn
				var strip := ProtoWorldBuilder.box_visual(chunk, Vector3(0.3, 0.06, seg_len + 6.0),
					Vector3(mid.x + perp.x * lat, y + 0.02, mid.y + perp.y * lat),
					ProtoWorldBuilder.COL_DASH, rot)
				strip.set_meta("road_lane", rid)
		# THE MEDIAN BARRIER — a real body, now GAPPED at baked junctions
		# (AMERICAN_ROAD M1, 0.3): a flat gap-control junction on this road opens
		# ±junction_gap_half around its projection onto the run. riro ramp mouths
		# and walled separated_pending crossings NEVER open it (0.2/0.4) — an
		# exit still never breaches the median; crossing happens at real turns.
		var cuts: Array = []
		if usmap != null and usmap.ok:
			for j in usmap.junctions:
				if String(j.get("control", "")) != "gap":
					continue
				var on_this := false
				for l in j["legs"]:
					if String(l["road"]) == rid:
						on_this = true
				if not on_this:
					continue
				var jp: Vector2 = j["pos"]
				var t := clampf((jp - a).dot(dir) / (seg_len * seg_len), 0.0, 1.0)
				if (a + dir * t).distance_to(jp) > float(g["width"]):
					continue # the node projects off this particular stretch
				var gh: float = usmap.junction_gap_half(j, rid)
				if gh > 0.0:
					cuts.append([clampf(t - gh / seg_len, 0.0, 1.0), clampf(t + gh / seg_len, 0.0, 1.0)])
		cuts.sort_custom(func(x, y) -> bool: return float(x[0]) < float(y[0]))
		var t_cur := 0.0
		var runs: Array = []
		for c in cuts:
			if float(c[0]) > t_cur:
				runs.append([t_cur, float(c[0])])
			t_cur = maxf(t_cur, float(c[1]))
		if t_cur < 1.0:
			runs.append([t_cur, 1.0])
		for rn in runs:
			var run_len := (float(rn[1]) - float(rn[0])) * seg_len
			if run_len < 2.0:
				continue
			var rmid := a + dir * ((float(rn[0]) + float(rn[1])) * 0.5)
			var bar := ProtoWorldBuilder.box_body(chunk, Vector3(0.5, 0.8, run_len),
				Vector3(rmid.x, 0.4 + (0.02 if wet else 0.0), rmid.y), Color(0.44, 0.43, 0.41), rot)
			bar.set_meta("road_barrier", rid)
	else:
		# SURFACE LAW (M3b, 0.17): paint follows the surface — asphalt gets its
		# markings; GRAVEL is a bare pale slab; DIRT is an unpainted twin-rut
		# track. Grip follows via the rects below.
		var surface := String(row.get("surface", "asphalt"))
		var slab_col := ProtoWorldBuilder.COL_ROAD
		if surface == "gravel":
			slab_col = Color(0.45, 0.43, 0.39)
		elif surface == "dirt":
			slab_col = Color(0.42, 0.36, 0.27)
		var slab2 := ProtoWorldBuilder.box_visual(chunk, Vector3(float(g["width"]), 0.05, seg_len + 6.0),
			Vector3(mid.x, y, mid.y), slab_col, rot)
		slab2.set_meta("road_slab", rid)
		if surface == "dirt":
			# the twin ruts — the read that says "someone drives this, slowly"
			for rsgn: float in [1.0, -1.0]:
				var rut := ProtoWorldBuilder.box_visual(chunk, Vector3(0.55, 0.06, seg_len + 6.0),
					Vector3(mid.x + perp.x * 1.1 * rsgn, y + 0.015, mid.y + perp.y * 1.1 * rsgn),
					Color(0.33, 0.28, 0.21), rot)
				rut.set_meta("road_rut", rid)
		# TOWN STREETS (M3 0.19): curbs + streetlights make a street read as a
		# STREET, not a country road — keyed to the row's kind, pure dressing.
		if String(row.get("kind", "")) == "street":
			var curb_lat := float(g["width"]) * 0.5 + 0.25
			for csgn: float in [1.0, -1.0]:
				var curb := ProtoWorldBuilder.box_visual(chunk, Vector3(0.4, 0.12, seg_len + 6.0),
					Vector3(mid.x + perp.x * curb_lat * csgn, 0.06, mid.y + perp.y * curb_lat * csgn),
					Color(0.62, 0.60, 0.56), rot)
				curb.set_meta("street_curb", rid)
			var n_lights := int(seg_len / 30.0)
			for li in range(n_lights):
				var lsgn: float = 1.0 if li % 2 == 0 else -1.0
				var lp := a + dir * ((float(li) + 0.5) / maxf(float(n_lights), 1.0)) + perp * (curb_lat + 0.8) * lsgn
				var pole := ProtoWorldBuilder.box_body(chunk, Vector3(0.18, 4.6, 0.18),
					Vector3(lp.x, 2.3, lp.y), Color(0.3, 0.3, 0.32), rot)
				pole.set_meta("streetlight", rid)
				var head := ProtoWorldBuilder.material(Color(0.95, 0.88, 0.6), 0.4, true)
				var hm := MeshInstance3D.new()
				var hb := BoxMesh.new()
				hb.size = Vector3(0.5, 0.16, 0.5)
				hm.mesh = hb
				hm.material_override = head
				hm.position = Vector3(0, 2.32, 0)
				pole.add_child(hm)
		# Double-yellow center + lane strips: ASPHALT ONLY — nobody paints gravel
		# or a dirt track (the SURFACE LAW's whole point).
		if surface == "asphalt" or surface == "concrete":
			var cl := ProtoWorldBuilder.box_visual(chunk, Vector3(0.35, 0.06, seg_len + 6.0),
				Vector3(mid.x, y + 0.02, mid.y), Color(0.75, 0.62, 0.18), rot)
			cl.set_meta("road_center", rid)
			for side_sgn: float in [1.0, -1.0]:
				for k2 in range(1, int(g["per_side"])):
					var lat2: float = k2 * ProtoUSMap.LANE_W * side_sgn
					var strip2 := ProtoWorldBuilder.box_visual(chunk, Vector3(0.3, 0.06, seg_len + 6.0),
						Vector3(mid.x + perp.x * lat2, y + 0.02, mid.y + perp.y * lat2),
						ProtoWorldBuilder.COL_DASH, rot)
					strip2.set_meta("road_lane", rid)
	if wet: # bridge rails at the row's real edge
		var rail_lat := float(g["width"]) * 0.5 + 0.4
		for sgn2: float in [1.0, -1.0]:
			ProtoWorldBuilder.box_body(chunk, Vector3(0.4, 1.0, seg_len + 6.0),
				Vector3(mid.x + perp.x * rail_lat * sgn2, 0.5, mid.y + perp.y * rail_lat * sgn2),
				Color(0.35, 0.33, 0.30), rot)
		# GROUND_INTEGRITY rule 5 (BRIDGES ARE REAL DECKS): the paint was at
		# y≈0.09 while the physical floor was the water box at −0.23 — cars
		# crossed rivers sunk 30 cm through the visual. One deck body per
		# carriageway, top AT the paint.
		if bool(g["divided"]):
			var deck_half := float(g["median_w"]) * 0.5 + float(g["carriage_w"]) * 0.5
			for dsgn: float in [1.0, -1.0]:
				var doff: Vector2 = perp * deck_half * dsgn
				var deck := ProtoWorldBuilder.box_body(chunk, Vector3(float(g["carriage_w"]), 0.3, seg_len + 6.0),
					Vector3(mid.x + doff.x, y + 0.025 - 0.15, mid.y + doff.y), ProtoWorldBuilder.COL_ROAD, rot)
				deck.set_meta("road_deck", rid)
		else:
			var deck1 := ProtoWorldBuilder.box_body(chunk, Vector3(float(g["width"]), 0.3, seg_len + 6.0),
				Vector3(mid.x, y + 0.025 - 0.15, mid.y), ProtoWorldBuilder.COL_ROAD, rot)
			deck1.set_meta("road_deck", rid)
	var rects: Array = ProtoWorldBuilder.extra_road_rects.get(key, [])
	rects.append([mid.x, mid.y, float(g["width"]) * 0.5 + 1.0, seg_len * 0.5 + 3.0, rot,
		String(row.get("surface", "asphalt"))]) # index 5: the grip surface (M3b 0.17)
	ProtoWorldBuilder.extra_road_rects[key] = rects

	# THE CORRIDOR BAND (M4a — "reads as Florida in a screenshot"): fences,
	# utility poles, verge, field patches along the majors. Deterministic per
	# stretch; drapes on ground_y so relief never floats a pole. Budget-aware:
	# ONE fence-rail body + a few pole bodies per stretch, the rest visuals.
	if not wet and kind_band(row) and seg_len > 40.0:
		var brng := RandomNumberGenerator.new()
		brng.seed = hash("%s|%s" % [rid, key])
		var biome_b := biome_at(Vector3(mid.x, 0, mid.y))
		var pole_side: float = 1.0 if (absi(hash(rid)) % 2 == 0) else -1.0
		var band_lat := float(g["width"]) * 0.5
		# verge: the mowed strip beside the shoulder — green in the wet SE, tan out west
		var verge_col := Color(0.34, 0.42, 0.24) if biome_b in ["swamp", "farmland", "forest", "plains"] else Color(0.52, 0.46, 0.32)
		for vsgn: float in [1.0, -1.0]:
			var verge := ProtoWorldBuilder.box_visual(chunk, Vector3(5.0, 0.02, seg_len),
				Vector3(mid.x + perp.x * (band_lat + 3.2) * vsgn, 0.015, mid.y + perp.y * (band_lat + 3.2) * vsgn), verge_col, rot)
			verge.set_meta("road_verge", rid)
		# utility poles: one side, ~55 m apart, draped on ground_y
		var n_poles := int(seg_len / 55.0)
		for pi in range(n_poles):
			var pt := a + dir * ((float(pi) + 0.5) / maxf(float(n_poles), 1.0)) + perp * (band_lat + 9.0) * pole_side
			var gy := ProtoWorldBuilder.ground_y(pt.x, pt.y)
			var pole := ProtoWorldBuilder.box_body(chunk, Vector3(0.28, 8.0, 0.28),
				Vector3(pt.x, gy + 4.0, pt.y), Color(0.30, 0.24, 0.18), rot)
			pole.set_meta("roadside_pole", rid)
			var cross := MeshInstance3D.new()
			var cm := BoxMesh.new()
			cm.size = Vector3(2.4, 0.16, 0.16)
			cross.mesh = cm
			cross.material_override = ProtoWorldBuilder.material(Color(0.30, 0.24, 0.18))
			cross.position = Vector3(0, 3.4, 0)
			pole.add_child(cross)
		# the field fence: ONE thin rail body + visual posts, field side only
		var fence_side := -pole_side
		var frail_mid := mid + perp * (band_lat + 14.0) * fence_side
		var fgy := ProtoWorldBuilder.ground_y(frail_mid.x, frail_mid.y)
		var rail := ProtoWorldBuilder.box_body(chunk, Vector3(0.08, 1.1, seg_len),
			Vector3(frail_mid.x, fgy + 0.62, frail_mid.y), Color(0.38, 0.32, 0.24), rot)
		rail.set_meta("roadside_fence", rid)
		var n_posts := int(seg_len / 12.0)
		for fi in range(n_posts):
			var fp := a + dir * ((float(fi) + 0.5) / maxf(float(n_posts), 1.0)) + perp * (band_lat + 14.0) * fence_side
			var fy := ProtoWorldBuilder.ground_y(fp.x, fp.y)
			ProtoWorldBuilder.box_visual(chunk, Vector3(0.14, 1.2, 0.14),
				Vector3(fp.x, fy + 0.6, fp.y), Color(0.33, 0.27, 0.2), rot)
		# field patches: the crop-quilt read beyond the fence (farm country only)
		if biome_b in ["farmland", "plains"] and brng.randf() < 0.7:
			var fpc := a + dir * brng.randf_range(0.3, 0.7) + perp * (band_lat + 46.0) * fence_side
			var patch_col := Color(0.36, 0.44, 0.22) if brng.randf() < 0.5 else Color(0.58, 0.5, 0.28)
			var patch := ProtoWorldBuilder.box_visual(chunk, Vector3(brng.randf_range(34, 58), 0.02, brng.randf_range(44, 70)),
				Vector3(fpc.x, 0.012, fpc.y), patch_col, rot)
			patch.set_meta("field_patch", rid)
		# guardrail where the land rolls (relief chunks) — the shoulder's promise
		if chunk.has_meta("relief"):
			for gsgn: float in [1.0, -1.0]:
				var gr := ProtoWorldBuilder.box_body(chunk, Vector3(0.25, 0.55, seg_len),
					Vector3(mid.x + perp.x * (band_lat + 0.9) * gsgn, 0.35, mid.y + perp.y * (band_lat + 0.9) * gsgn),
					Color(0.55, 0.54, 0.5), rot)
				gr.set_meta("road_guardrail", rid)
		# M4b — THE ADDRESS FURNITURE (interstates only): mile markers on the
		# SAME game-mile the exits use (EXIT N stands near MILE N), route
		# shields every ~2 km, and a WELCOME monument at every state line.
		# All text is billboard Label3D (0.12 — legible at the wheel).
		if String(row.get("kind", "")) == "interstate" and usmap != null and usmap.ok:
			var full: Dictionary = usmap.road_by_id(rid)
			if not full.is_empty():
				var arc_a := usmap.arc_from_origin(full, a)
				var arc_b := usmap.arc_from_origin(full, b)
				var arc_lo := minf(arc_a, arc_b)
				var arc_hi := maxf(arc_a, arc_b)
				var mile := int(ceil(arc_lo / ProtoUSMap.EXIT_MILE_M))
				while float(mile) * ProtoUSMap.EXIT_MILE_M <= arc_hi and mile <= 999:
					var t_m := (float(mile) * ProtoUSMap.EXIT_MILE_M - arc_lo) / maxf(arc_hi - arc_lo, 0.001)
					if arc_a > arc_b:
						t_m = 1.0 - t_m
					var mp := a + dir * t_m + perp * (band_lat + 1.6)
					var post := ProtoWorldBuilder.box_body(chunk, Vector3(0.14, 1.5, 0.14),
						Vector3(mp.x, 0.75, mp.y), Color(0.16, 0.42, 0.2), rot)
					post.set_meta("mile_marker", mile)
					var lbl := Label3D.new()
					lbl.text = "MILE\n%d" % mile
					lbl.font_size = 96
					lbl.pixel_size = 0.004
					lbl.modulate = Color(0.92, 0.95, 0.9)
					lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
					lbl.position = Vector3(0, 1.1, 0)
					post.add_child(lbl)
					mile += 1
				if int(arc_lo / 2000.0) != int(arc_hi / 2000.0):
					var sp2 := mid + perp * (band_lat + 1.6)
					var spost := ProtoWorldBuilder.box_body(chunk, Vector3(0.16, 2.6, 0.16),
						Vector3(sp2.x, 1.3, sp2.y), Color(0.3, 0.3, 0.32), rot)
					spost.set_meta("route_shield", rid)
					var slbl := Label3D.new()
					slbl.text = "%s" % rid
					slbl.font_size = 110
					slbl.pixel_size = 0.004
					slbl.modulate = Color(0.88, 0.15, 0.18)
					slbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
					slbl.position = Vector3(0, 2.9, 0)
					spost.add_child(slbl)
				if int(arc_lo / 3000.0) != int(arc_hi / 3000.0):
					var t_b: float = (ceil(arc_lo / 3000.0) * 3000.0 - arc_lo) / maxf(arc_hi - arc_lo, 0.001)
					if arc_a > arc_b:
						t_b = 1.0 - t_b
					var bp2: Vector2 = a + dir * clampf(t_b, 0.0, 1.0) + perp * (band_lat + 23.0) * -pole_side
					var by: float = ProtoWorldBuilder.ground_y(bp2.x, bp2.y)
					var board_root := Node3D.new()
					board_root.name = "RoadBillboard"
					board_root.position = Vector3(bp2.x, by, bp2.y)
					board_root.rotation.y = rot
					board_root.set_meta("road_billboard", rid)
					var risk: int = int(row.get("risk_rating", row.get("danger", 0)))
					board_root.set_meta("road_billboard_condition", "weathered" if risk >= 3 else "clean")
					chunk.add_child(board_root)
					ProtoWorldBuilder.box_visual(board_root, Vector3(0.22, 4.6, 0.22),
						Vector3(-2.35, 2.3, 0), Color(0.26, 0.25, 0.23), 0.0)
					ProtoWorldBuilder.box_visual(board_root, Vector3(0.22, 4.6, 0.22),
						Vector3(2.35, 2.3, 0), Color(0.26, 0.25, 0.23), 0.0)
					var panel_col: Color = Color(0.12, 0.24, 0.25) if risk < 3 else Color(0.23, 0.18, 0.14)
					ProtoWorldBuilder.box_visual(board_root, Vector3(5.8, 2.2, 0.18),
						Vector3(0, 4.25, 0), panel_col, 0.0)
					if risk >= 3:
						for hx_v in [-1.6, 0.2, 1.4]:
							var hx: float = float(hx_v)
							ProtoWorldBuilder.box_visual(board_root, Vector3(0.16, 0.16, 0.04),
								Vector3(hx, 4.45 + 0.25 * signf(hx), -0.12), Color(0.04, 0.035, 0.03), 0.0)
					var bl := Label3D.new()
					bl.text = "KEEP DRIVING\nNO SERVICE" if risk >= 3 else "LAST GAS\nNEXT EXIT"
					bl.font_size = 150
					bl.pixel_size = 0.004
					bl.modulate = Color(0.95, 0.86, 0.58) if risk >= 3 else Color(0.96, 0.94, 0.82)
					bl.outline_size = 8
					bl.outline_modulate = Color(0, 0, 0, 0.85)
					bl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
					bl.position = Vector3(0, 4.28, -0.14)
					board_root.add_child(bl)
				var st_a := usmap.state_at(Vector3(a.x, 0, a.y))
				var st_b := usmap.state_at(Vector3(b.x, 0, b.y))
				if st_a != st_b and st_b != "":
					var wp2 := mid + perp * (band_lat + 3.0)
					var mono := ProtoWorldBuilder.box_body(chunk, Vector3(3.2, 2.2, 0.5),
						Vector3(wp2.x, 1.1, wp2.y), Color(0.45, 0.38, 0.3), rot)
					mono.set_meta("state_line", st_b)
					var wl := Label3D.new()
					wl.text = "WELCOME TO\n%s" % st_b
					wl.font_size = 128
					wl.pixel_size = 0.004
					wl.modulate = Color(0.95, 0.88, 0.6)
					wl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
					wl.position = Vector3(0, 2.6, 0)
					mono.add_child(wl)


## Which road kinds get the M4a corridor band (majors only — a dirt spur with
## utility poles would be a lie).
static func kind_band(row: Dictionary) -> bool:
	return String(row.get("kind", "")) in ["interstate", "us_route", "state_road"]


## Clip the macro road segment a→b to this chunk's box (+margin). [] if outside.
func _clip_segment_to_chunk(a: Vector2, b: Vector2, center: Vector3) -> Array:
	var half := CHUNK * 0.5 + 6.0
	var lo := Vector2(center.x - half, center.z - half)
	var hi := Vector2(center.x + half, center.z + half)
	var d := b - a
	var t0 := 0.0
	var t1 := 1.0
	for axis in 2:
		var da := d.x if axis == 0 else d.y
		var pa := a.x if axis == 0 else a.y
		var mn := lo.x if axis == 0 else lo.y
		var mx := hi.x if axis == 0 else hi.y
		if absf(da) < 0.0001:
			if pa < mn or pa > mx:
				return []
		else:
			var ta := (mn - pa) / da
			var tb := (mx - pa) / da
			if ta > tb:
				var tmp := ta
				ta = tb
				tb = tmp
			t0 = maxf(t0, ta)
			t1 = minf(t1, tb)
			if t0 > t1:
				return []
	return [a + d * t0, a + d * t1]


func _on_new_road(pos: Vector3, key: String) -> bool:
	for r in ProtoWorldBuilder.extra_road_rects.get(key, []):
		var dx: float = pos.x - r[0]
		var dz: float = pos.z - r[1]
		var c: float = cos(-r[4])
		var s: float = sin(-r[4])
		if absf(dx * c - dz * s) <= r[2] + 4.0 and absf(dx * s + dz * c) <= r[3]:
			return true
	return false


## A stand of trees: MultiMesh trunks + canopies (cheap), a few SOLID trunks
## (forests are obstacles), all kept off the asphalt.
func _trees(chunk: Node3D, center: Vector3, rng: RandomNumberGenerator, count: int, road: Dictionary, solid_count: int = 5) -> void:
	var spots: Array[Vector3] = []
	var guard := 0
	while spots.size() < count and guard < count * 8:
		guard += 1
		var p := center + Vector3(rng.randf_range(-60, 60), 0, rng.randf_range(-60, 60))
		if not road.is_empty():
			# Clearance follows the ROW's real width (a 6-lane clears further than a 2-lane).
			if ProtoUSMap._seg_dist(Vector2(p.x, p.z), road["a"], road["b"]) < float(ProtoUSMap.road_geometry(road)["width"]) * 0.5 + 3.0:
				continue
		spots.append(p)
	if spots.is_empty():
		return
	var trunk_mm := MultiMesh.new()
	trunk_mm.transform_format = MultiMesh.TRANSFORM_3D
	var tmesh := BoxMesh.new()
	tmesh.size = Vector3(0.4, 2.8, 0.4)
	tmesh.material = ProtoWorldBuilder.material(Color(0.30, 0.22, 0.14), 1.0)
	trunk_mm.mesh = tmesh
	trunk_mm.instance_count = spots.size()
	var can_mm := MultiMesh.new()
	can_mm.transform_format = MultiMesh.TRANSFORM_3D
	var cmesh := BoxMesh.new()
	cmesh.size = Vector3(2.6, 2.2, 2.6)
	cmesh.material = ProtoWorldBuilder.material(Color(0.20, 0.30, 0.14), 1.0)
	can_mm.mesh = cmesh
	can_mm.instance_count = spots.size()
	for i in spots.size():
		var s := rng.randf_range(0.7, 1.5)
		var basis := Basis(Vector3.UP, rng.randf_range(0, TAU)).scaled(Vector3.ONE * s)
		trunk_mm.set_instance_transform(i, Transform3D(basis, spots[i] + Vector3(0, 1.4 * s, 0)))
		can_mm.set_instance_transform(i, Transform3D(basis, spots[i] + Vector3(0, 3.2 * s, 0)))
	for mm in [trunk_mm, can_mm]:
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		chunk.add_child(mmi)
	chunk.add_to_group("biome_trees")
	# REAL trunks — you cannot drive through a forest at full song. Dense woods
	# (the frontier law) plant MANY, spaced so a bike/horse threads (centers
	# >= 2.0m apart = ~1.5m clear gaps) and a car cannot. Tagged for sims.
	var solids: Array[Vector3] = []
	for i in spots.size():
		if solids.size() >= solid_count:
			break
		var ok := true
		for sp in solids:
			if sp.distance_to(spots[i]) < 2.0:
				ok = false
				break
		if not ok:
			continue
		solids.append(spots[i])
		var trunk := ProtoWorldBuilder.box_body(chunk, Vector3(0.5, 3.0, 0.5), spots[i] + Vector3(0, 1.5, 0), Color(0.30, 0.22, 0.14))
		trunk.set_meta("dense_trunk", true)


## Crop rows: farmland reads as WORKED LAND from the driver's seat.
func _crops(chunk: Node3D, center: Vector3, rng: RandomNumberGenerator) -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	var mesh := BoxMesh.new()
	mesh.size = Vector3(16.0, 0.5, 1.2)
	mesh.material = ProtoWorldBuilder.material(Color(0.5, 0.5, 0.22) if rng.randf() < 0.6 else Color(0.42, 0.44, 0.2), 1.0)
	mm.mesh = mesh
	var rows := 14
	mm.instance_count = rows
	var yaw := rng.randf_range(0, TAU)
	var basis := Basis(Vector3.UP, yaw)
	var row_dir := Vector3(cos(yaw), 0, -sin(yaw)) # crop strips march perpendicular to their length
	for i in rows:
		var off := (i - rows / 2.0) * 3.4
		mm.set_instance_transform(i, Transform3D(basis, center + row_dir * off + Vector3(rng.randf_range(-8, 8), 0.25, rng.randf_range(-8, 8))))
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	chunk.add_child(mmi)
	chunk.add_to_group("biome_crops")


func _scatter(chunk: Node3D, center: Vector3, rng: RandomNumberGenerator, count: int, color: Color) -> void:
	for i in count:
		var pos := center + Vector3(rng.randf_range(-60, 60), 0, rng.randf_range(-60, 60))
		var s := rng.randf_range(0.5, 1.6)
		ProtoWorldBuilder.box_visual(chunk, Vector3(0.7, 0.5, 0.7) * s, pos + Vector3(0, 0.25 * s, 0),
			color if rng.randf() > 0.4 else Color(0.42, 0.4, 0.37))


## A handful of homes beside the road — America lived along its interstates.
func _stamp_neighborhood(chunk: Node3D, center: Vector3, road: Dictionary, rng: RandomNumberGenerator) -> void:
	var a: Vector2 = road["a"]
	var b: Vector2 = road["b"]
	var dir := (b - a).normalized()
	var side := Vector2(dir.y, -dir.x) * (1.0 if rng.randf() < 0.5 else -1.0)
	var half_w := float(ProtoUSMap.road_geometry(road)["width"]) * 0.5 # setback off the ROW's real edge
	var base2 := Vector2(center.x, center.z) + side * (half_w + rng.randf_range(14.0, 22.0))
	var n := rng.randi_range(4, 6)
	for i in n:
		var hpos2 := base2 + dir * ((i - n / 2.0) * rng.randf_range(11.0, 14.0)) + side * rng.randf_range(-3, 5)
		var hsize := Vector3(rng.randf_range(7, 10), rng.randf_range(3.5, 5), rng.randf_range(7, 9))
		var hcol := ProtoWorldBuilder.COL_HOUSE_A if rng.randf() < 0.5 else ProtoWorldBuilder.COL_HOUSE_B
		var hpos := Vector3(hpos2.x, 0, hpos2.y)
		ProtoWorldBuilder.box_body(chunk, hsize, hpos + Vector3(0, hsize.y / 2.0, 0), hcol, atan2(side.x, -side.y))
		ProtoWorldBuilder.box_body(chunk, Vector3(hsize.x + 0.6, 0.3, hsize.z + 0.6), hpos + Vector3(0, hsize.y + 0.15, 0), ProtoWorldBuilder.COL_ROOF, atan2(side.x, -side.y))
		# driveway
		ProtoWorldBuilder.box_visual(chunk, Vector3(3.0, 0.03, (base2 - Vector2(center.x, center.z)).length()),
			Vector3(lerpf(hpos2.x, center.x + side.x * half_w, 0.5), 0.05, lerpf(hpos2.y, center.z + side.y * half_w, 0.5)),
			Color(0.36, 0.32, 0.26), atan2(side.x, -side.y))
	chunk.add_to_group("biome_neighborhood")


## City ruins block (urban biome filler between town anchors).
func _stamp_ruined_block(chunk: Node3D, center: Vector3, rng: RandomNumberGenerator, key: String) -> void:
	ProtoWorldBuilder.box_visual(chunk, Vector3(8, 0.04, CHUNK * 0.9), center + Vector3(0, 0.06, 0), ProtoWorldBuilder.COL_ROAD)
	ProtoWorldBuilder.box_visual(chunk, Vector3(CHUNK * 0.9, 0.04, 8), center + Vector3(0, 0.06, 0), ProtoWorldBuilder.COL_ROAD)
	var rects: Array = ProtoWorldBuilder.extra_road_rects.get(key, [])
	rects.append([center.x, center.z, 4.0, CHUNK * 0.45, 0.0])
	rects.append([center.x, center.z, CHUNK * 0.45, 4.0, 0.0])
	ProtoWorldBuilder.extra_road_rects[key] = rects
	for i in rng.randi_range(4, 7):
		var q: Vector3 = [Vector3(1, 0, 1), Vector3(-1, 0, 1), Vector3(1, 0, -1), Vector3(-1, 0, -1)][i % 4]
		var bpos := center + Vector3(q.x * rng.randf_range(14, 48), 0, q.z * rng.randf_range(14, 48))
		var bs := Vector3(rng.randf_range(8, 14), rng.randf_range(3, 12), rng.randf_range(8, 14))
		ProtoWorldBuilder.box_body(chunk, bs, bpos + Vector3(0, bs.y / 2.0, 0),
			Color(0.30, 0.28, 0.26) if rng.randf() < 0.5 else Color(0.36, 0.30, 0.24), rng.randf_range(-0.1, 0.1))
	if rng.randf() < 0.5:
		# Ruins TOOL YOU UP (2026-07-09 playtest): often a weapon, now and then a jackpot.
		var ruin: Dictionary = {"scrap": rng.randi_range(2, 5)}
		if rng.randf() < 0.6:
			ruin["9mm"] = rng.randi_range(3, 8)
		if rng.randf() < 0.3:
			ruin[["machete", "wrench", "bat", "pistol", "axe"][rng.randi() % 5]] = 1
		if rng.randf() < 0.08:
			var rr: Dictionary = ProtoContainer.roll_loot("cache_rare", rng)
			for k in rr:
				ruin[k] = int(ruin.get(k, 0)) + int(rr[k])
		var c := ProtoChest.create("Ruin stash", ruin)
		chunk.add_child(c)
		c.position = center + Vector3(rng.randf_range(-30, 30), 0.05, rng.randf_range(-30, 30))


## A macro town materializes: welcome sign, husk blocks, a stash — and its
## LANDMARK if it has one (you navigate the Divided States by silhouettes).
func _stamp_town(chunk: Node3D, t: Dictionary, rng: RandomNumberGenerator) -> void:
	var tp: Vector2 = t["pos"]
	var base := Vector3(tp.x, 0, tp.y)
	var sign_label := Label3D.new()
	sign_label.text = "%s\n%s" % [t["name"], ("— " + String(t["landmark"])) if String(t.get("landmark", "")) != "" else "POP. UNKNOWN"]
	sign_label.font_size = 200
	sign_label.pixel_size = 0.006
	sign_label.modulate = Color(0.95, 0.75, 0.25)
	sign_label.position = base + Vector3(0, 8.0, 0)
	sign_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	chunk.add_child(sign_label)
	# (M3 0.19: the husk ring is DEAD — towns grow real streets + Building-Book
	# slots via the bake's two-tier generator; the sign/landmark/cache remain.)
	var town_loot: Dictionary = {"scrap": rng.randi_range(3, 6), "bandage": 1, "9mm": rng.randi_range(6, 14)}
	# A town cache often holds a weapon (2026-07-09 playtest "no weapons anywhere").
	if rng.randf() < 0.35:
		town_loot[["pistol", "machete", "bat", "wrench"][rng.randi() % 4]] = 1
	if rng.randf() < 0.15:
		town_loot["shotgun"] = 1
		town_loot["12ga"] = int(town_loot.get("12ga", 0)) + rng.randi_range(4, 12)
	var c := ProtoChest.create("%s cache" % t["name"], town_loot)
	chunk.add_child(c)
	c.position = base + Vector3(rng.randf_range(-10, 10), 0.05, rng.randf_range(-10, 10))
	match String(t.get("id", "")):
		"vegas": # the dead strip still glows
			ProtoWorldBuilder.box_body(chunk, Vector3(3, 22, 3), base + Vector3(10, 11, 0), Color(0.9, 0.55, 0.15))
			var glow := ProtoWorldBuilder.box_visual(chunk, Vector3(3.4, 20, 0.4), base + Vector3(10, 11, 1.8), Color(0.95, 0.6, 0.2))
			glow.material_override = ProtoWorldBuilder.material(Color(0.95, 0.6, 0.2), 0.3, true)
		"stlouis": # the rusted arch — two leaning legs
			ProtoWorldBuilder.box_body(chunk, Vector3(2, 26, 2), base + Vector3(-8, 12, 0), Color(0.55, 0.35, 0.2), 0.0)
			ProtoWorldBuilder.box_body(chunk, Vector3(2, 26, 2), base + Vector3(8, 12, 0), Color(0.55, 0.35, 0.2), 0.0)
			ProtoWorldBuilder.box_body(chunk, Vector3(18, 2, 2), base + Vector3(0, 24, 0), Color(0.55, 0.35, 0.2), 0.0)
		"washington": # the drowned monument
			ProtoWorldBuilder.box_body(chunk, Vector3(2.4, 30, 2.4), base + Vector3(0, 12, 6), Color(0.8, 0.78, 0.72))
	chunk.add_to_group("biome_town")


## THE FIELD CACHE ROLLER (2026-07-09 playtest "every chest the same shit / no weapons
## anywhere"): what a world cache holds. Each staple rolls independently (no two caches read
## identical), the biome flavors it, and there's a real chance it ARMS you — melee often, a
## firearm as the lucky find (with ammo to feed it), plus an occasional RARE jackpot merge.
## Static + pure (biome, near_road, seeded rng) so loot_field_sim can prove variety headless.
static func roll_field_cache(biome: String, near_road: bool, rng: RandomNumberGenerator) -> Dictionary:
	var cache: Dictionary = {}
	if rng.randf() < 0.75:
		cache["scrap"] = rng.randi_range(1, 4)
	if rng.randf() < 0.6:
		cache["9mm"] = rng.randi_range(4, 10)
	if rng.randf() < 0.5:
		cache["scrip"] = rng.randi_range(3, 12)
	if rng.randf() < 0.4:
		cache["bandage"] = 1
	# The land flavors the loot: farms feed you, ruins tool you up, the road provides.
	match biome:
		"farmland":
			cache["canned_food"] = rng.randi_range(1, 2)
			if rng.randf() < 0.3:
				cache["water"] = 1
		"urban":
			if rng.randf() < 0.4:
				cache[["duct_tape", "painkillers", "map_fragment"][rng.randi() % 3]] = 1
		_:
			if rng.randf() < 0.25:
				cache[["water", "coffee", "flare", "tire_kit", "whiskey"][rng.randi() % 5]] = 1
	if near_road and rng.randf() < 0.25:
		cache["jerry_can"] = 1
	# WEAPONS IN THE FIELD: urban ruins and roadsides arm you more than open country.
	var wchance: float = 0.14
	if biome == "urban":
		wchance += 0.15
	if near_road:
		wchance += 0.08
	if rng.randf() < wchance:
		if rng.randf() < 0.65:
			cache[["machete", "wrench", "bat"][rng.randi() % 3]] = 1
		elif rng.randf() < 0.5:
			cache["pistol"] = 1
			cache["9mm"] = int(cache.get("9mm", 0)) + rng.randi_range(4, 10)
		else:
			cache["shotgun"] = 1
			cache["12ga"] = int(cache.get("12ga", 0)) + rng.randi_range(4, 10)
	# A RARE jackpot rides on top now and then — guns, tools, a medkit.
	if rng.randf() < 0.06:
		var rare: Dictionary = ProtoContainer.roll_loot("cache_rare", rng)
		for k in rare:
			cache[k] = int(cache.get(k, 0)) + int(rare[k])
	return cache


# --- The world map (M): local fog-of-war → the country atlas -------------------

func toggle_map() -> void:
	if _map_layer == null:
		_map_layer = CanvasLayer.new()
		_map_layer.layer = 3
		add_child(_map_layer)
		_map_panel = PanelContainer.new()
		_map_panel.set_anchors_preset(Control.PRESET_CENTER)
		_map_panel.offset_left = -300.0
		_map_panel.offset_right = 300.0
		_map_panel.offset_top = -240.0
		_map_panel.offset_bottom = 240.0
		var style := StyleBoxFlat.new()
		style.bg_color = Color(0.08, 0.075, 0.06, 0.96)
		style.border_color = Color(0.96, 0.72, 0.2)
		style.set_border_width_all(2)
		_map_panel.add_theme_stylebox_override("panel", style)
		_map_layer.add_child(_map_panel)
		_map_canvas = Control.new()
		_map_canvas.custom_minimum_size = Vector2(600, 480)
		_map_canvas.clip_contents = true # roads at map scale run for kilometers — nothing draws past the frame (playtest: "lines outside the map")
		_map_canvas.mouse_filter = Control.MOUSE_FILTER_STOP # the atlas is clickable
		_map_canvas.draw.connect(_draw_map)
		_map_canvas.gui_input.connect(_on_map_input)
		_map_panel.add_child(_map_canvas)
		_map_layer.visible = false
	_map_mode = (_map_mode + 1) % 3
	if _map_mode == 2 and not (usmap != null and usmap.ok):
		_map_mode = 0 # no atlas without the map file
	_map_layer.visible = _map_mode != 0
	if _map_layer.visible:
		_map_canvas.queue_redraw()


func map_open() -> bool:
	return _map_layer != null and _map_layer.visible


## MAP STYLE LAW (UI language: hierarchy you can read at a glance): interstates
## draw heavy, backroads thin and dim, exit ramps stay off the atlas (noise at
## country scale — they live on the LOCAL map instead). Testable data, then draw.
static func atlas_road_style(kind: String) -> Dictionary:
	match kind:
		"interstate":
			return {"width": 2.2, "color": Color(0.68, 0.60, 0.44), "atlas": true}
		"us_route", "state_road":
			return {"width": 1.6, "color": Color(0.58, 0.52, 0.40), "atlas": true}
		"backroad", "county":
			return {"width": 1.0, "color": Color(0.48, 0.44, 0.36), "atlas": true}
		"street":
			return {"width": 0.8, "color": Color(0.42, 0.40, 0.34), "atlas": false} # town-scale: local map only
		"dirt":
			# THE DISCOVERY LAYER (0.19): dirt spurs are deliberately NOT on the
			# atlas — the map never marks the hermit's shack. Local map only.
			return {"width": 0.7, "color": Color(0.40, 0.34, 0.25), "atlas": false}
		_:
			return {"width": 1.0, "color": Color(0.48, 0.44, 0.36), "atlas": false} # ramps: local only


## The atlas' EXITS layer as data: T2/T3 get names, T1s are quiet dots — 88
## exits must read as a network, not a rash.
func atlas_exit_markers() -> Array:
	var out: Array = []
	if usmap == null or not usmap.ok:
		return out
	for e in usmap.exits:
		var tier := String(e.get("community_tier", "T1"))
		out.append({"pos": e["pos"], "tier": tier,
			"label": String(e.get("name", "")) if tier != "T1" else ""})
	return out


func _draw_map() -> void:
	if _map_mode == 2:
		_draw_country()
	else:
		_draw_local()


func _draw_local() -> void:
	var size: Vector2 = _map_canvas.size
	var center := size * 0.5
	var scale := 0.10 # px per meter → ~±3 km view
	# Fog-of-war: only chunks you've SEEN are drawn
	for key in visited:
		var w: Vector2 = visited[key]
		var p := center + (w - Vector2(_map_player.x, _map_player.z)) * scale
		if Rect2(Vector2.ZERO, size).has_point(p):
			_map_canvas.draw_rect(Rect2(p - Vector2(5, 5), Vector2(10, 10)), Color(0.35, 0.30, 0.22, 0.55))
	# The interstate (you know the road you're on)
	_map_canvas.draw_line(center + Vector2(0 - _map_player.x, -430 - _map_player.z) * scale,
		center + Vector2(0 - _map_player.x, 430 - _map_player.z) * scale, Color(0.55, 0.5, 0.42), 2.0)
	# Macro roads within view (clip_contents hides the rest; this cull just
	# keeps country-length polylines out of the draw list entirely)
	if usmap != null and usmap.ok:
		var view := Rect2(Vector2.ZERO, size).grow(40.0)
		for road in usmap.roads:
			var style := atlas_road_style(String(road["kind"]))
			var pts: PackedVector2Array = road["pts"]
			for i in range(pts.size() - 1):
				var pa := center + (pts[i] - Vector2(_map_player.x, _map_player.z)) * scale
				var pb := center + (pts[i + 1] - Vector2(_map_player.x, _map_player.z)) * scale
				if view.has_point(pa) or view.has_point(pb):
					_map_canvas.draw_line(pa, pb, style["color"], maxf(1.2, float(style["width"])))
		# EXITS in view, NAMED — the "what's my next exit" read, right on the local map.
		for e in usmap.exits:
			var ep2 := center + ((e["pos"] as Vector2) - Vector2(_map_player.x, _map_player.z)) * scale
			if Rect2(Vector2.ZERO, size).has_point(ep2):
				_map_canvas.draw_rect(Rect2(ep2 - Vector2(3, 3), Vector2(6, 6)), Color(0.96, 0.72, 0.2))
				_map_canvas.draw_string(ThemeDB.fallback_font, ep2 + Vector2(6, 4), String(e.get("name", "")),
					HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0.92, 0.89, 0.82))
	# POIs
	for poi in _pois:
		var tpos: Vector3 = poi[1].global_position if poi[1] is Node3D else poi[1]
		var p2 := center + (Vector2(tpos.x, tpos.z) - Vector2(_map_player.x, _map_player.z)) * scale
		if Rect2(Vector2.ZERO, size).has_point(p2):
			_map_canvas.draw_circle(p2, 4.0, Color(0.96, 0.72, 0.2))
			_map_canvas.draw_string(ThemeDB.fallback_font, p2 + Vector2(7, 4), poi[0], HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(0.92, 0.89, 0.82))
	# You
	_map_canvas.draw_circle(center, 5.0, Color(0.9, 0.25, 0.12))
	_map_canvas.draw_string(ThemeDB.fallback_font, Vector2(12, 20), "DIVIDED STATES — %s   (M again: the atlas)" % last_state, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(0.96, 0.72, 0.2))


## Screen⇄world mapping for the atlas (shared by draw + click). world XZ →
## screen: org + (worldXZ - bounds.position) * px. Inverse in _on_map_input.
func _country_transform() -> Dictionary:
	var size: Vector2 = _map_canvas.size
	var bounds := usmap.world_bounds()
	var px := minf(size.x / bounds.size.x, size.y / bounds.size.y)
	var org := (size - bounds.size * px) * 0.5 # letterbox the country in the panel
	return {"org": org, "px": px, "bounds": bounds}


## The country atlas: the whole compressed USA — biomes, interstates, towns, you.
func _draw_country() -> void:
	var size: Vector2 = _map_canvas.size
	var xf := _country_transform()
	var org: Vector2 = xf["org"]
	var px: float = xf["px"]
	var bounds: Rect2 = xf["bounds"]
	var step := 2 # draw every 2nd cell — plenty at this panel size
	var cpx := usmap.cell_m * px * step
	for cz in range(0, usmap.h, step):
		var row: String = usmap.grid[cz]
		for cx in range(0, usmap.w, step):
			var biome: String = usmap.legend.get(row[cx], "ocean")
			if biome == "ocean":
				continue
			var p := org + (Vector2(cx, cz) * usmap.cell_m + usmap.offset - bounds.position) * px
			_map_canvas.draw_rect(Rect2(p, Vector2(cpx + 0.5, cpx + 0.5)), MAP_BIOME.get(biome, Color(0.3, 0.3, 0.3)))
	for road in usmap.roads:
		var style := atlas_road_style(String(road["kind"]))
		if not bool(style["atlas"]):
			continue # ramps live on the LOCAL map, not the country picture
		var pts: PackedVector2Array = road["pts"]
		for i in range(pts.size() - 1):
			_map_canvas.draw_line(org + (pts[i] - bounds.position) * px, org + (pts[i + 1] - bounds.position) * px,
				style["color"], float(style["width"]))
	# THE EXITS LAYER: every valve on the network — named where it matters.
	for mk in atlas_exit_markers():
		var ep := org + ((mk["pos"] as Vector2) - bounds.position) * px
		var tier := String(mk["tier"])
		var r := 2.4 if tier == "T3" else (1.9 if tier == "T2" else 1.1)
		var col := Color(0.96, 0.72, 0.2) if tier != "T1" else Color(0.62, 0.55, 0.42)
		_map_canvas.draw_rect(Rect2(ep - Vector2(r, r), Vector2(r * 2, r * 2)), col) # the DIAMOND read, cheap
		if String(mk["label"]) != "":
			_map_canvas.draw_string(ThemeDB.fallback_font, ep + Vector2(4, -2), String(mk["label"]),
				HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color(0.92, 0.89, 0.82, 0.85))
	for t in usmap.towns:
		var p2 := org + ((t["pos"] as Vector2) - bounds.position) * px
		_map_canvas.draw_circle(p2, 2.5 if t["kind"] == "city" else 1.8, Color(0.96, 0.72, 0.2))
		if String(t.get("landmark", "")) != "" or t.get("authored", false):
			_map_canvas.draw_string(ThemeDB.fallback_font, p2 + Vector2(4, 3), t["name"], HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(0.92, 0.89, 0.82))
	# THE CAROUSEL LAYER (surfacing pass): every gate on the atlas — teal + ringed
	# when LIT (yours, permanently), dark sockets when dormant. The map literally
	# lights up as your network grows — the retention picture, drawn.
	if _main != null and "carousel" in _main and _main.carousel != null:
		for b in _main.carousel.data.get("bases", []):
			var gp := org + (Vector2(float(b["pos"][0]), float(b["pos"][1])) - bounds.position) * px
			var lit: bool = _main.carousel.active.get(b["id"], false)
			var sieged: bool = _main.carousel.gates.has(b["id"]) and _main.carousel.gates[b["id"]].under_siege
			_map_canvas.draw_circle(gp, 3.0, Color(0.95, 0.2, 0.12) if sieged else (Color(0.3, 0.85, 0.75) if lit else Color(0.22, 0.30, 0.31)))
			if sieged: # a fat alarm ring — you see the node in trouble from across the country
				_map_canvas.draw_arc(gp, 7.0, 0.0, TAU, 16, Color(0.95, 0.2, 0.12), 2.0)
			if lit:
				_map_canvas.draw_arc(gp, 5.5, 0.0, TAU, 14, Color(0.3, 0.85, 0.75), 1.2)
				_map_canvas.draw_string(ThemeDB.fallback_font, gp + Vector2(6, 3), String(b["name"]), HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color(0.55, 0.9, 0.82))
	# Your waypoints (HOME 🏠, the set course 🧭, and the base POIs) ride on the
	# atlas too — with the SELECTED one ringed so a fresh pick reads instantly.
	var sel: int = _main.waypoint_idx if _main != null else -1
	for i in _pois.size():
		var poi: Array = _pois[i]
		var raw: Variant = poi[1]
		var wpos: Vector3 = raw.global_position if (raw is Node3D and is_instance_valid(raw)) else (raw if raw is Vector3 else Vector3.ZERO)
		var mp := org + (Vector2(wpos.x, wpos.z) - bounds.position) * px
		var picked: bool = i == sel
		_map_canvas.draw_circle(mp, 5.0 if picked else 3.0, Color(0.4, 0.85, 0.4) if picked else Color(0.96, 0.86, 0.55))
		if picked:
			_map_canvas.draw_arc(mp, 9.0, 0.0, TAU, 20, Color(0.4, 0.85, 0.4), 1.5)
		_map_canvas.draw_string(ThemeDB.fallback_font, mp + Vector2(6, 3), String(poi[0]), HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0.85, 0.95, 0.8))
	var you := org + (Vector2(_map_player.x, _map_player.z) - bounds.position) * px
	_map_canvas.draw_circle(you, 4.0, Color(0.9, 0.25, 0.12))
	_map_canvas.draw_string(ThemeDB.fallback_font, Vector2(12, 20), "%s — %s" % [usmap.map_name, last_state], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(0.96, 0.72, 0.2))
	_map_canvas.draw_string(ThemeDB.fallback_font, Vector2(12, size.y - 12), "click a town to SET COURSE · click open ground to drop a mark · F in the world plants 🏠 HOME",
		HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(0.85, 0.78, 0.6))


## Click the atlas to set your course: nearest town within reach wins, else drop
## a plain mark where you clicked. Routes back to main.set_map_course.
func _on_map_input(event: InputEvent) -> void:
	if _map_mode != 2 or _main == null or usmap == null or not usmap.ok:
		return
	if not (event is InputEventMouseButton and event.pressed \
			and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT):
		return
	var xf := _country_transform()
	var org: Vector2 = xf["org"]
	var px: float = xf["px"]
	var bounds: Rect2 = xf["bounds"]
	var click: Vector2 = (event as InputEventMouseButton).position
	# Nearest town within 14 px of the click gets the course; otherwise a mark.
	var best: Dictionary = {}
	var best_d := 14.0
	for t in usmap.towns:
		var sp := org + ((t["pos"] as Vector2) - bounds.position) * px
		var d := sp.distance_to(click)
		if d < best_d:
			best_d = d
			best = t
	if not best.is_empty():
		var tp: Vector2 = best["pos"]
		_main.set_map_course(String(best["name"]), Vector3(tp.x, 0.0, tp.y))
	else:
		var world := (click - org) / px + bounds.position
		_main.set_map_course("MARK", Vector3(world.x, 0.0, world.y))
	_map_canvas.queue_redraw()
