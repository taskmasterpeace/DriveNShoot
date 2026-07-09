## Builds the entire PROTO-3D world from code — no imported assets, pure low-poly boxes.
## Layout: an interstate highway running north/south, an exit ramp at Exit 9, and the
## small neighborhood of Meridian with an enterable two-story safehouse.
class_name ProtoWorldBuilder
extends Object

static var _mat_cache: Dictionary = {}

const COL_GROUND := Color(0.52, 0.42, 0.28)
const COL_ROAD := Color(0.17, 0.16, 0.15)
const COL_DASH := Color(0.85, 0.82, 0.70)
const COL_SHOULDER := Color(0.78, 0.72, 0.55)
const COL_HOUSE_A := Color(0.62, 0.48, 0.34)
const COL_HOUSE_B := Color(0.55, 0.50, 0.42)
const COL_ROOF := Color(0.40, 0.26, 0.18)
const COL_WRECK := Color(0.35, 0.22, 0.14)
const COL_SIGN := Color(0.10, 0.35, 0.16)
const COL_CRATE := Color(0.45, 0.34, 0.20)


static func material(color: Color, rough: float = 0.9, emissive: bool = false) -> StandardMaterial3D:
	var key: String = color.to_html() + ("e" if emissive else "")
	if _mat_cache.has(key):
		return _mat_cache[key]
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = rough
	if emissive:
		mat.emission_enabled = true
		mat.emission = color
		mat.emission_energy_multiplier = 1.4
	_mat_cache[key] = mat
	return mat


## --- TERRAIN RELIEF (goal: docs/design/TERRAIN_RELIEF.md — wilderness-only v1) --------
## One shared, deterministic height field: ground_y(x,z) = fbm(x,z)² × relief_at(x,z) ×
## RELIEF_MAX_M. relief_at is DATA (per-state, a row away from usmap.json/MapForge later)
## and fades to ZERO near roads, towns, water, and where there's no map — so the streamed
## asphalt, town ruins, and the whole authored core stay exactly where they are. Both
## sides of a chunk seam sample the SAME function → no stitching, no cracks.
const RELIEF_MAX_M := 24.0    ## vertical exaggeration at 1:60 (doc range 20–80)
const RELIEF_FREQ := 0.0035   ## hills every ~300 m — broad ranges, not moguls
const ROAD_FLAT_M := 90.0     ## dead flat within this of a road…
const ROAD_FADE_M := 90.0     ## …then relief fades in over this
const TOWN_FLAT_M := 150.0
const TOWN_FADE_M := 110.0
## Per-STATE relief (0 = Florida-flat … 1 = Colorado). A dict IS the data row (v1);
## graduating it to a usmap.json field + a MapForge painter is the banked follow-up.
## M0 FIX (AMERICAN_ROAD): the old 0.2 fallback rolled ~4.8 m hills onto FLORIDA
## swamp — the flat South is now EXPLICIT rows, and the unknown-state fallback
## stays 0.2 only for the un-rowed interior.
const STATE_RELIEF: Dictionary = {
	"COLORADO": 1.0, "UTAH": 0.8, "NEVADA": 0.6, "CALIFORNIA": 0.5,
	"KENTUCKY": 0.35, "VIRGINIA": 0.3, "MISSOURI": 0.15, "KANSAS": 0.05,
	"FLORIDA": 0.0, "LOUISIANA": 0.02, "MISSISSIPPI": 0.05, "ALABAMA": 0.1,
	"GEORGIA": 0.12, "TEXAS": 0.15,
}
static var _relief_noise: FastNoiseLite = null


## How mountainous the world is HERE, 0..1. Zero without a map, on water, near roads
## and towns (the wilderness-only law), else the state's relief knob.
static func relief_at(x: float, z: float) -> float:
	if usmap == null or not usmap.ok:
		return 0.0
	var pos := Vector3(x, 0, z)
	var biome: String = usmap.biome_at(pos)
	if biome == "water" or biome == "ocean":
		return 0.0
	var base := float(STATE_RELIEF.get(usmap.state_at(pos), 0.2))
	if base <= 0.0:
		return 0.0
	var road: Dictionary = usmap.road_near(pos, ROAD_FLAT_M + ROAD_FADE_M + 40.0)
	if not road.is_empty():
		var d := float(road.get("dist", 9999.0))
		if d < ROAD_FLAT_M:
			return 0.0
		base *= clampf((d - ROAD_FLAT_M) / ROAD_FADE_M, 0.0, 1.0)
	var town: Dictionary = usmap.town_near(pos, TOWN_FLAT_M + TOWN_FADE_M + 40.0)
	if not town.is_empty():
		var td := Vector2(x, z).distance_to(town["pos"] as Vector2)
		if td < TOWN_FLAT_M:
			return 0.0
		base *= clampf((td - TOWN_FLAT_M) / TOWN_FADE_M, 0.0, 1.0)
	return clampf(base, 0.0, 1.0)


## THE height field — deterministic (world-seeded noise), continuous, cheap. n² biases
## the land toward broad valleys with occasional ridges, so driving stays drivable.
static func ground_y(x: float, z: float) -> float:
	var r := relief_at(x, z)
	if r <= 0.001:
		return 0.0
	if _relief_noise == null:
		_relief_noise = FastNoiseLite.new()
		_relief_noise.seed = 0xD817D # THE world seed — same land for every run and peer
		_relief_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
		_relief_noise.fractal_type = FastNoiseLite.FRACTAL_FBM
		_relief_noise.fractal_octaves = 4
		_relief_noise.frequency = RELIEF_FREQ
	var n := (_relief_noise.get_noise_2d(x, z) + 1.0) * 0.5
	return n * n * r * RELIEF_MAX_M


## --- PIXEL ART IN 3D (goal: "pixel art, brought into 3D") ----------------------------
## A pixel-art SKIN on chunky geometry: crisp NEAREST-filtered tiles at a constant density
## (the TEXEL-PER-METER law — same discipline as the 60× scale law). Triplanar world-mapping
## means one texture tile always spans `tile_meters` in WORLD space, so a wall and a road
## read at the same pixel density no matter their mesh size. Actors (box-puppets) keep the
## flat material() so they stay clean against the busy textured ground — that contrast is
## the whole trick. A skin is just a Texture2D, so a data row naming one is on-brand.
static var _skins: Dictionary = {}   ## name -> Texture2D, loaded from assets/skins/
const SKIN_DIR := "res://assets/skins"


## The pixel skin registry: assets/skins/<name>.png → SKINS["<name>"]. Lazy-scanned once.
static func skins() -> Dictionary:
	if not _skins.is_empty():
		return _skins
	var d := DirAccess.open(SKIN_DIR)
	if d != null:
		for f in d.get_files():
			if f.ends_with(".png"):
				var path := "%s/%s" % [SKIN_DIR, f]
				var tex: Texture2D = load(path) if ResourceLoader.exists(path) else null
				if tex != null:
					_skins[f.trim_suffix(".png")] = tex
	return _skins


static func skin(name: String) -> Texture2D:
	return skins().get(name, null)


## A pixel-skin material: NEAREST-filtered (crisp, not blurry) + triplanar at 1/tile_meters
## so every surface shares one texel density. Cached per (texture, tile_meters). Falls back
## to a flat color when the skin is missing so the world never renders untextured-black.
static func material_textured(tex: Texture2D, tile_meters: float = 1.0, fallback: Color = COL_GROUND, rough: float = 0.95) -> StandardMaterial3D:
	if tex == null:
		return material(fallback, rough)
	var key := "px_%s_%.3f" % [tex.resource_path, tile_meters]
	if _mat_cache.has(key):
		return _mat_cache[key]
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = tex
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST   # crisp pixels — the whole look
	mat.uv1_triplanar = true                                     # world-space → constant texel density
	var s := 1.0 / maxf(0.01, tile_meters)
	mat.uv1_scale = Vector3(s, s, s)
	mat.roughness = rough
	_mat_cache[key] = mat
	return mat


## Skin a mesh by SKIN NAME (the data-row form: a row names its skin). tile_meters honors
## the texel law; a missing skin falls back to the flat color.
static func material_skin(skin_name: String, tile_meters: float = 1.0, fallback: Color = COL_GROUND) -> StandardMaterial3D:
	return material_textured(skin(skin_name), tile_meters, fallback)


## --- TEXTURED TERRAIN (goal: "improve terrain in every biome — adds texture") ------
## Native, GL-Compatibility-safe ground texturing — the idea cherry-picked from the
## terrain addons (Terrain3D/LiteTerrain) WITHOUT their GDExtension/renderer baggage or
## their fixed single-mesh model (we stream a 60× continent). One shared procedural
## noise set (mottle albedo + a normal map for lit micro-relief), triplanar world-mapped
## so it never stretches across our differently-sized ground slabs, tinted per biome.
static var _ground_detail: NoiseTexture2D = null
static var _ground_normal: NoiseTexture2D = null


## Grayscale multi-octave mottle. Multiplies the biome tint (kept bright, 0.72–1.0, so
## the biome still reads) → ground stops being a flat color and gains grain + patches.
static func ground_detail_texture() -> Texture2D:
	if _ground_detail != null:
		return _ground_detail
	var n := FastNoiseLite.new()
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n.frequency = 0.035
	n.fractal_type = FastNoiseLite.FRACTAL_FBM
	n.fractal_octaves = 5
	var t := NoiseTexture2D.new()
	t.width = 256
	t.height = 256
	t.seamless = true
	t.noise = n
	var g := Gradient.new()
	g.set_color(0, Color(0.72, 0.72, 0.72))
	g.set_color(1, Color(1.0, 1.0, 1.0))
	t.color_ramp = g
	_ground_detail = t
	return t


## Normal map from a finer octave of the same style — gives the ground lit micro-relief
## (bumps catch the sun/headlights) with zero extra geometry or collision.
static func ground_normal_texture() -> Texture2D:
	if _ground_normal != null:
		return _ground_normal
	var n := FastNoiseLite.new()
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n.frequency = 0.05
	n.fractal_type = FastNoiseLite.FRACTAL_FBM
	n.fractal_octaves = 4
	var t := NoiseTexture2D.new()
	t.width = 256
	t.height = 256
	t.seamless = true
	t.as_normal_map = true
	t.bump_strength = 2.5
	t.noise = n
	_ground_normal = t
	return t


## A ground/terrain material: the biome tint, textured. Separate from material() so only
## TERRAIN gets grain — boxes/houses stay clean. Cached per color like material().
static func ground_material(color: Color, rough: float = 0.95) -> StandardMaterial3D:
	var key := "grd_" + color.to_html()
	if _mat_cache.has(key):
		return _mat_cache[key]
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.albedo_texture = ground_detail_texture()
	mat.uv1_triplanar = true                    # world-space → no stretch across slabs
	mat.uv1_scale = Vector3(0.11, 0.11, 0.11)   # ~9 m per tile at gameplay zoom
	mat.roughness = rough
	mat.normal_enabled = true
	mat.normal_texture = ground_normal_texture()
	mat.normal_scale = 0.7
	_mat_cache[key] = mat
	return mat


## Visual-only ground quad (biome tint layer over the slab) — box_visual with the
## textured ground_material instead of the flat one.
static func ground_visual(parent: Node3D, size: Vector3, pos: Vector3, color: Color, rot_y: float = 0.0) -> MeshInstance3D:
	var mesh := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mesh.mesh = bm
	mesh.material_override = ground_material(color)
	mesh.position = pos
	mesh.rotation.y = rot_y
	parent.add_child(mesh)
	return mesh


## Solid box with collision (StaticBody3D + mesh + shape).
static func box_body(parent: Node3D, size: Vector3, pos: Vector3, color: Color, rot_y: float = 0.0) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.position = pos
	body.rotation.y = rot_y
	var mesh := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mesh.mesh = bm
	mesh.material_override = material(color)
	body.add_child(mesh)
	var shape := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = size
	shape.shape = bs
	body.add_child(shape)
	parent.add_child(body)
	return body


## Visual-only box (road surfaces, markings — no collision seams to bump over).
static func box_visual(parent: Node3D, size: Vector3, pos: Vector3, color: Color, rot_y: float = 0.0) -> MeshInstance3D:
	var mesh := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mesh.mesh = bm
	mesh.material_override = material(color)
	mesh.position = pos
	mesh.rotation.y = rot_y
	parent.add_child(mesh)
	return mesh


## True when a scatter position would land on a road or in town.
static func _on_road(x: float, z: float) -> bool:
	if absf(x) < 12.0:
		return true # interstate corridor
	if x > 15.0 and x < 170.0 and z < -240.0 and z > -370.0:
		return true # Meridian town block + exit ramp area
	return false


## Sprinkles thousands of cheap detail instances so off-road driving has visual
## anchors: olive scrub, gray rocks, darker dirt patches. MultiMesh = one draw call each.
static func _scatter_detail(world: Node3D) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 0xD817D  # deterministic world

	var specs: Array = [
		# [count, mesh size, color, y, max_tilt]
		[2600, Vector3(0.7, 0.55, 0.7), Color(0.33, 0.36, 0.22), 0.25, 0.15],  # scrub
		[1000, Vector3(0.9, 0.6, 0.8), Color(0.42, 0.40, 0.37), 0.2, 0.4],     # rocks
		[800, Vector3(3.5, 0.03, 3.5), Color(0.44, 0.35, 0.23), 0.015, 0.0],   # dirt patches
	]
	for spec in specs:
		var count: int = spec[0]
		var size: Vector3 = spec[1]
		var color: Color = spec[2]
		var y: float = spec[3]
		var tilt: float = spec[4]
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		var mesh := BoxMesh.new()
		mesh.size = size
		mesh.material = material(color, 1.0)
		mm.mesh = mesh
		mm.instance_count = count
		var placed := 0
		var guard := 0
		while placed < count and guard < count * 20:
			guard += 1
			var x := rng.randf_range(-1400.0, 1400.0)
			var z := rng.randf_range(-1400.0, 1400.0)
			if _on_road(x, z):
				continue
			var b := Basis(Vector3.UP, rng.randf_range(0.0, TAU))
			if tilt > 0.0:
				b = b.rotated(Vector3.RIGHT, rng.randf_range(-tilt, tilt))
			b = b.scaled(Vector3.ONE * rng.randf_range(0.6, 1.7))
			mm.set_instance_transform(placed, Transform3D(b, Vector3(x, y, z)))
			placed += 1
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		world.add_child(mmi)


## Road footprints (asphalt) — MIRRORS the visual slabs laid in build_world below
## (roads are visual-only, no collision, so the car can't raycast them). Each entry:
## [center_x, center_z, half_x, half_z, rot_y]. Streamed chunks ADD their own
## rects (materialized interstates, city streets) into extra_road_rects.
const ROAD_RECTS: Array = [
	[0.0, 0.0, 8.0, 430.0, 0.0],            # Interstate 9
	[105.0, -290.0, 60.0, 5.0, 0.0],        # Meridian main street
	[85.0, -300.0, 5.0, 45.0, 0.0],         # Meridian cross street
	[30.0, -257.5, 4.5, 37.5, 0.774],       # Exit 9 ramp (atan2(44,45))
]

## Per-chunk road surface rects, registered/unregistered by ProtoWorldStream
## as interstates + city streets materialize: "cx,cz" -> Array of rect rows.
static var extra_road_rects: Dictionary = {}

## The macro map (set at boot by proto3d): water/ocean biomes read as "water".
static var usmap: ProtoUSMap = null


## The surface under a world point: "road" (asphalt — high grip), "water"
## (lakes/rivers/ocean — bogs everything; bridges are road and WIN), or "dirt".
static func surface_at(pos: Vector3) -> String:
	for r in ROAD_RECTS:
		if _in_rect(pos, r):
			return "road" # the authored slab is asphalt
	for rects in extra_road_rects.values():
		for r in rects:
			if _in_rect(pos, r):
				# M3b (0.17): the rect carries its row's surface — asphalt reads
				# "road" (full grip), GRAVEL and DIRT report themselves so the
				# tire law can price them.
				if (r as Array).size() > 5:
					var s := String(r[5])
					if s == "gravel":
						return "gravel"
					if s == "dirt":
						return "dirt_road"
				return "road"
	if usmap != null and usmap.ok:
		var biome := usmap.biome_at(pos)
		if biome == "water" or biome == "ocean":
			return "water"
	return "dirt"


static func _in_rect(pos: Vector3, r: Array) -> bool:
	# M1 yaw fix: the standard world→local inverse for a yaw-φ box whose local
	# +Z maps to (sinφ, cosφ) — the old form carried the same Z-reflection the
	# road slabs did (they matched each other, both mirrored on diagonals).
	var dx: float = pos.x - r[0]
	var dz: float = pos.z - r[1]
	var c: float = cos(r[4])
	var s: float = sin(r[4])
	return absf(dx * c - dz * s) <= r[2] and absf(dx * s + dz * c) <= r[3]


## Builds everything. Returns spawn info: { "car_spawns": Array[Transform3D], "house": ProtoHouse }
static func build_world(root: Node3D) -> Dictionary:
	var world := Node3D.new()
	world.name = "World"
	root.add_child(world)

	# --- Ground: one huge desert slab (12 km — M2 replaces with streaming) ---
	var ground := StaticBody3D.new()
	ground.name = "Ground"
	var gmesh := MeshInstance3D.new()
	var gplane := PlaneMesh.new()
	gplane.size = Vector2(12000, 12000)
	gmesh.mesh = gplane
	gmesh.material_override = ground_material(COL_GROUND, 1.0) # textured terrain, not flat color
	ground.add_child(gmesh)
	var gshape := CollisionShape3D.new()
	var gbox := BoxShape3D.new()
	gbox.size = Vector3(12000, 1.0, 12000)
	gshape.shape = gbox
	gshape.position.y = -0.5
	ground.add_child(gshape)
	world.add_child(ground)

	# --- Off-road ground detail: scrub, rocks, dirt patches (playtest bug #4) --
	_scatter_detail(world)

	# --- Interstate 9: north/south highway ---------------------------------
	# Runs from z=+420 (spawn) to z=-420. Visual-only slabs sit on the ground.
	box_visual(world, Vector3(16, 0.04, 860), Vector3(0, 0.07, 0), COL_ROAD)
	# Shoulder lines
	box_visual(world, Vector3(0.35, 0.05, 860), Vector3(-7.2, 0.11, 0), COL_DASH)
	box_visual(world, Vector3(0.35, 0.05, 860), Vector3(7.2, 0.11, 0), COL_DASH)
	# Center dashes
	var z := -420.0
	while z < 420.0:
		box_visual(world, Vector3(0.4, 0.05, 3.2), Vector3(0, 0.12, z), COL_DASH)
		z += 12.0

	# --- Exit 9 ramp: peels off east toward Meridian ------------------------
	# Diagonal from highway edge (x=8, z=-235) down to the town street (x=52, z=-280).
	var ramp_dir := Vector2(52.0 - 8.0, -280.0 + 235.0) # (44, -45)
	var ramp_len := ramp_dir.length() + 12.0
	var ramp_ang := atan2(ramp_dir.x, ramp_dir.y) # Z-aligned box yaw (M1 fix: was Z-reflected — the ramp drew mirrored)
	box_visual(world, Vector3(9, 0.05, ramp_len), Vector3(30, 0.07, -257.5), COL_ROAD, ramp_ang)

	# --- Meridian: street grid ---------------------------------------------
	# Main street along X at z=-290, cross street along Z at x=85.
	box_visual(world, Vector3(120, 0.05, 10), Vector3(105, 0.07, -290), COL_ROAD)
	box_visual(world, Vector3(10, 0.05, 90), Vector3(85, 0.07, -300), COL_ROAD)

	# --- Highway sign for the exit ------------------------------------------
	var sign_root := Node3D.new()
	sign_root.position = Vector3(10.5, 0, -195)
	world.add_child(sign_root)
	box_body(sign_root, Vector3(0.25, 5.2, 0.25), Vector3(0, 2.6, 0), Color(0.5, 0.5, 0.52))
	box_body(sign_root, Vector3(0.2, 2.2, 5.0), Vector3(0, 4.6, 0), COL_SIGN)
	var sign_label := Label3D.new()
	sign_label.text = "EXIT 9\nMERIDIAN"
	sign_label.font_size = 220
	sign_label.pixel_size = 0.004
	sign_label.modulate = Color(0.95, 0.95, 0.9)
	sign_label.position = Vector3(-0.15, 4.6, 0)
	sign_label.rotation.y = -PI / 2.0
	sign_root.add_child(sign_label)

	# --- MERIDIAN: THE PROVING GROUND (owner order 2026-07-09: "redo meridian so
	# it includes all the testing elements"). The filler boxes are gone; every
	# building is a structure-profile ROW placed via usmap placements — this is
	# ProtoStructureBuilder's FIRST world consumer (created ≠ placed, until now).
	# New testing element = a catalog row + a placement row. Never code.
	var um := ProtoUSMap.get_default()
	if um != null and um.ok:
		DrivnData.ensure_structures()
		for p in um.placements_in(ProtoWorldStream.AUTHORED):
			var sid := String(p.get("building", ""))
			if not DrivnData.structures.has(sid):
				continue # hand-built ids (the safehouse) stay hand-built; warn-not-crash
			var shell := ProtoStructureBuilder.materialize(sid)
			if shell == null:
				continue
			world.add_child(shell)
			shell.position = Vector3(float(p["pos"][0]), 0.0, float(p["pos"][1]))
			shell.rotation.y = float(p.get("rot", 0.0))
			shell.set_meta("placement_id", String(p.get("id", sid)))
			shell.add_to_group("placement")

	# --- Wrecks along the highway shoulder (Divided States flavor) --------------
	var wrecks: Array = [
		[Vector3(-10.5, 0, 160), 0.4], [Vector3(11, 0, 40), -0.8],
		[Vector3(-11.5, 0, -90), 2.2], [Vector3(10.2, 0, -300), 1.1],
	]
	for w in wrecks:
		var wpos: Vector3 = w[0]
		box_body(world, Vector3(2.0, 0.9, 4.4), wpos + Vector3(0, 0.45, 0), COL_WRECK, w[1])
		box_body(world, Vector3(1.7, 0.5, 1.8), wpos + Vector3(0, 1.1, 0.2), COL_WRECK * 0.8, w[1])

	# --- Crates near the safehouse ------------------------------------------
	box_body(world, Vector3(1.2, 1.2, 1.2), Vector3(102, 0.6, -322), COL_CRATE)
	box_body(world, Vector3(1.0, 1.0, 1.0), Vector3(103.4, 0.5, -321.2), COL_CRATE * 1.1)

	# --- The kennel yard: four strays waiting for a scav (dogs spawn in main) --
	var kennel_label := Label3D.new()
	kennel_label.text = "STRAYS — E TO ADOPT"
	kennel_label.font_size = 140
	kennel_label.pixel_size = 0.005
	kennel_label.modulate = Color(0.95, 0.75, 0.25)
	kennel_label.position = Vector3(123, 3.2, -316)
	kennel_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	world.add_child(kennel_label)
	for post_pos in [Vector3(120.5, 0, -313.5), Vector3(125.5, 0, -313.5), Vector3(120.5, 0, -318.5), Vector3(125.5, 0, -318.5)]:
		box_body(world, Vector3(0.2, 1.2, 0.2), post_pos + Vector3(0, 0.6, 0), Color(0.4, 0.3, 0.2))

	# --- The safehouse: enterable, two floors --------------------------------
	var house := ProtoHouse.new()
	house.position = Vector3(110, 0, -325)
	world.add_child(house)
	house.build()
	# THE FURNISHER: building_types.json's furniture_set made real, right after the
	# structure exists (root IS main here — build_world(root) is called as
	# ProtoWorldBuilder.build_world(self) from proto3d.gd's _ready()). Placement is
	# eager and needs no live world_state; the loot layers (building weight_mult +
	# law override) resolve lazily on first interact(), by which point main.stream
	# exists — see furniture.gd's _state_id_at().
	house.furnish_interior(root)
	var house_label := Label3D.new()
	house_label.text = "SAFEHOUSE"
	house_label.font_size = 180
	house_label.pixel_size = 0.005
	house_label.modulate = Color(0.95, 0.75, 0.25)
	house_label.position = Vector3(110, 7.4, -325)
	house_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	world.add_child(house_label)

	# --- Spawns ---------------------------------------------------------------
	# Player's car starts at the north end of the interstate, pointed south (-Z is forward).
	var car_spawns: Array[Transform3D] = []
	car_spawns.append(Transform3D(Basis.IDENTITY, Vector3(2.5, 1.2, 390)))
	# Second car parked on Meridian's main street.
	var parked := Transform3D(Basis(Vector3.UP, PI / 2.0), Vector3(95, 1.2, -284))
	car_spawns.append(parked)

	return {"car_spawns": car_spawns, "house": house}
