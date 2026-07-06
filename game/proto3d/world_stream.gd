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

const ROAD_W := 13.0 ## interstate slab width (m)

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

var loaded: Dictionary = {} ## "cx,cz" -> Node3D
var visited: Dictionary = {} ## "cx,cz" -> Vector2 (chunk center) — the map's fog-of-war
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
	# Load ring
	for dx in range(-RING, RING + 1):
		for dz in range(-RING, RING + 1):
			var key := "%d,%d" % [ccx + dx, ccz + dz]
			if not loaded.has(key):
				loaded[key] = _spawn_chunk(ccx + dx, ccz + dz)
				visited[key] = Vector2((ccx + dx + 0.5) * CHUNK, (ccz + dz + 0.5) * CHUNK)
	# Unload beyond ring+1
	for key in loaded.keys().duplicate():
		var parts: PackedStringArray = key.split(",")
		if absi(int(parts[0]) - ccx) > RING + 1 or absi(int(parts[1]) - ccz) > RING + 1:
			if loaded[key] != null and is_instance_valid(loaded[key]):
				loaded[key].queue_free()
			loaded.erase(key)
			ProtoWorldBuilder.extra_road_rects.erase(key)
	# State line crossings announce themselves
	var st := current_state(body_pos)
	if st != last_state:
		if last_state != "" and main.has_method("notify"):
			main.notify("🪧 WELCOME TO %s" % st)
		last_state = st
	# Keep the open map live so the you-dot and your markers track as you move.
	if map_open():
		_map_canvas.queue_redraw()


func _spawn_chunk(cx: int, cz: int) -> Node3D:
	var center := Vector3((cx + 0.5) * CHUNK, 0, (cz + 0.5) * CHUNK)
	if AUTHORED.has_point(Vector2(center.x, center.z)):
		return null # hand-built land — leave it alone
	var chunk := Node3D.new()
	add_child(chunk)
	var rng := RandomNumberGenerator.new()
	rng.seed = hash("%d:%d:%d" % [WORLD_SEED, cx, cz])
	var key := "%d,%d" % [cx, cz]

	var biome := biome_at(center)
	var wet := biome == "water" or biome == "ocean"

	# --- Ground. Beyond the authored slab a chunk brings its own floor (in its
	# biome's color); inside the slab, non-desert biomes lay a tint quad on top.
	if absf(center.x) > SLAB or absf(center.z) > SLAB:
		var g := StaticBody3D.new()
		var gm := MeshInstance3D.new()
		var plane := BoxMesh.new()
		plane.size = Vector3(CHUNK + 2.0, 0.5, CHUNK + 2.0)
		gm.mesh = plane
		gm.material_override = ProtoWorldBuilder.material(BIOME_GROUND.get(biome, BIOME_GROUND["scrub"]), 1.0)
		gm.position.y = -0.26 - (0.22 if wet else 0.0) # water sits a hair lower
		g.add_child(gm)
		var gs := CollisionShape3D.new()
		var gb := BoxShape3D.new()
		gb.size = Vector3(CHUNK + 2.0, 0.5, CHUNK + 2.0)
		gs.shape = gb
		gs.position.y = gm.position.y
		g.add_child(gs)
		g.position = Vector3(center.x, 0, center.z)
		chunk.add_child(g)
	elif biome != "scrub" and biome != "desert":
		ProtoWorldBuilder.box_visual(chunk, Vector3(CHUNK, 0.04, CHUNK),
			center + Vector3(0, 0.03, 0), BIOME_GROUND.get(biome, BIOME_GROUND["scrub"]))

	# --- The interstate materializes: nearest macro road clipped to this chunk
	# becomes real asphalt + a registered surface rect (drivable grip). Over
	# water it rides a BRIDGE deck — rivers are crossable where roads cross them.
	var road: Dictionary = {}
	if usmap != null and usmap.ok:
		road = usmap.road_near(center, 220.0)
	if not road.is_empty():
		var seg := _clip_segment_to_chunk(road["a"], road["b"], center)
		if not seg.is_empty():
			var a: Vector2 = seg[0]
			var b: Vector2 = seg[1]
			var mid := (a + b) * 0.5
			var dir := b - a
			var seg_len := dir.length()
			if seg_len > 4.0:
				var rot := atan2(dir.x, -dir.y) # Z-aligned slab → world yaw
				var y := 0.09 if wet else 0.07
				ProtoWorldBuilder.box_visual(chunk, Vector3(ROAD_W, 0.05, seg_len + 6.0),
					Vector3(mid.x, y, mid.y), ProtoWorldBuilder.COL_ROAD, rot)
				ProtoWorldBuilder.box_visual(chunk, Vector3(0.35, 0.06, seg_len + 6.0),
					Vector3(mid.x, y + 0.02, mid.y), ProtoWorldBuilder.COL_DASH, rot)
				if wet: # bridge rails
					var side := Vector2(dir.y, -dir.x).normalized() * (ROAD_W * 0.5 + 0.4)
					for sgn in [1.0, -1.0]:
						ProtoWorldBuilder.box_body(chunk, Vector3(0.4, 1.0, seg_len + 6.0),
							Vector3(mid.x + side.x * sgn, 0.5, mid.y + side.y * sgn),
							Color(0.35, 0.33, 0.30), rot)
				var rects: Array = ProtoWorldBuilder.extra_road_rects.get(key, [])
				rects.append([mid.x, mid.y, ROAD_W * 0.5 + 1.0, seg_len * 0.5 + 3.0, rot])
				ProtoWorldBuilder.extra_road_rects[key] = rects

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
			_trees(chunk, center, rng, 52 if near_road else 40, road)
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
		"scrub":
			_scatter(chunk, center, rng, 26, Color(0.33, 0.36, 0.22))
		"desert":
			_scatter(chunk, center, rng, 16, Color(0.5, 0.42, 0.3))
			for i in 3:
				ProtoWorldBuilder.box_visual(chunk, Vector3(3.5, 0.03, 3.5),
					center + Vector3(rng.randf_range(-55, 55), 0.015, rng.randf_range(-55, 55)), Color(0.55, 0.44, 0.27))
		"mountains":
			for i in rng.randi_range(3, 5):
				var rpos := center + Vector3(rng.randf_range(-52, 52), 0, rng.randf_range(-52, 52))
				if _on_new_road(rpos, key):
					continue
				var rh := rng.randf_range(2.2, 5.5)
				ProtoWorldBuilder.box_body(chunk, Vector3(rng.randf_range(4, 9), rh, rng.randf_range(4, 9)),
					rpos + Vector3(0, rh * 0.5 - 0.4, 0), Color(0.46, 0.44, 0.42), rng.randf_range(0, TAU))
			_scatter(chunk, center, rng, 14, Color(0.42, 0.40, 0.37))
		"swamp":
			for i in 4:
				ProtoWorldBuilder.box_visual(chunk, Vector3(rng.randf_range(6, 14), 0.03, rng.randf_range(6, 14)),
					center + Vector3(rng.randf_range(-50, 50), 0.04, rng.randf_range(-50, 50)), Color(0.14, 0.22, 0.20))
			_trees(chunk, center, rng, 14, road)
			_scatter(chunk, center, rng, 12, Color(0.3, 0.33, 0.2))
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
		var cache: Dictionary = {"scrap": rng.randi_range(1, 3), "9mm": rng.randi_range(4, 10), "bandage": 1 if rng.randf() < 0.5 else 0}
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
		var c := ProtoChest.create("Cache", cache)
		chunk.add_child(c)
		c.position = center + Vector3(rng.randf_range(-45, 45), 0.05, rng.randf_range(-45, 45))
	return chunk


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
func _trees(chunk: Node3D, center: Vector3, rng: RandomNumberGenerator, count: int, road: Dictionary) -> void:
	var spots: Array[Vector3] = []
	var guard := 0
	while spots.size() < count and guard < count * 8:
		guard += 1
		var p := center + Vector3(rng.randf_range(-60, 60), 0, rng.randf_range(-60, 60))
		if not road.is_empty():
			if ProtoUSMap._seg_dist(Vector2(p.x, p.z), road["a"], road["b"]) < ROAD_W * 0.5 + 3.0:
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
	# A few trunks are REAL — you cannot drive through a forest at full song.
	for i in mini(5, spots.size()):
		ProtoWorldBuilder.box_body(chunk, Vector3(0.5, 3.0, 0.5), spots[i] + Vector3(0, 1.5, 0), Color(0.30, 0.22, 0.14))


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
	var base2 := Vector2(center.x, center.z) + side * (ROAD_W * 0.5 + rng.randf_range(14.0, 22.0))
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
			Vector3(lerpf(hpos2.x, center.x + side.x * ROAD_W * 0.5, 0.5), 0.05, lerpf(hpos2.y, center.z + side.y * ROAD_W * 0.5, 0.5)),
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
		var c := ProtoChest.create("Ruin stash", {"scrap": rng.randi_range(2, 5), "9mm": rng.randi_range(3, 8)})
		chunk.add_child(c)
		c.position = center + Vector3(rng.randf_range(-30, 30), 0.05, rng.randf_range(-30, 30))


## A macro town materializes: welcome sign, husk blocks, a stash — and its
## LANDMARK if it has one (you navigate the Deathlands by silhouettes).
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
	for i in 6:
		var q := Vector3(cos(i * TAU / 6.0), 0, sin(i * TAU / 6.0)) * rng.randf_range(16, 42)
		var bs := Vector3(rng.randf_range(8, 13), rng.randf_range(4, 11), rng.randf_range(8, 13))
		ProtoWorldBuilder.box_body(chunk, bs, base + q + Vector3(0, bs.y / 2.0, 0), Color(0.32, 0.29, 0.26), rng.randf_range(0, TAU))
	var c := ProtoChest.create("%s cache" % t["name"], {"scrap": rng.randi_range(3, 6), "bandage": 1, "9mm": rng.randi_range(6, 14)})
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
	# Macro roads within view
	if usmap != null and usmap.ok:
		for road in usmap.roads:
			var pts: PackedVector2Array = road["pts"]
			for i in range(pts.size() - 1):
				_map_canvas.draw_line(center + (pts[i] - Vector2(_map_player.x, _map_player.z)) * scale,
					center + (pts[i + 1] - Vector2(_map_player.x, _map_player.z)) * scale, Color(0.55, 0.5, 0.42), 2.0)
	# POIs
	for poi in _pois:
		var tpos: Vector3 = poi[1].global_position if poi[1] is Node3D else poi[1]
		var p2 := center + (Vector2(tpos.x, tpos.z) - Vector2(_map_player.x, _map_player.z)) * scale
		if Rect2(Vector2.ZERO, size).has_point(p2):
			_map_canvas.draw_circle(p2, 4.0, Color(0.96, 0.72, 0.2))
			_map_canvas.draw_string(ThemeDB.fallback_font, p2 + Vector2(7, 4), poi[0], HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(0.92, 0.89, 0.82))
	# You
	_map_canvas.draw_circle(center, 5.0, Color(0.9, 0.25, 0.12))
	_map_canvas.draw_string(ThemeDB.fallback_font, Vector2(12, 20), "DEATHLANDS — %s   (M again: the atlas)" % last_state, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(0.96, 0.72, 0.2))


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
		var pts: PackedVector2Array = road["pts"]
		for i in range(pts.size() - 1):
			_map_canvas.draw_line(org + (pts[i] - bounds.position) * px, org + (pts[i + 1] - bounds.position) * px,
				Color(0.62, 0.55, 0.42), 1.5)
	for t in usmap.towns:
		var p2 := org + ((t["pos"] as Vector2) - bounds.position) * px
		_map_canvas.draw_circle(p2, 2.5 if t["kind"] == "city" else 1.8, Color(0.96, 0.72, 0.2))
		if String(t.get("landmark", "")) != "" or t.get("authored", false):
			_map_canvas.draw_string(ThemeDB.fallback_font, p2 + Vector2(4, 3), t["name"], HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(0.92, 0.89, 0.82))
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
