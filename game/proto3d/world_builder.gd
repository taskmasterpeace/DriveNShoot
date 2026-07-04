## Builds the entire PROTO-3D world from code — no imported assets, pure low-poly boxes.
## Layout: an interstate highway running north/south, an exit ramp at Exit 9, and the
## small neighborhood of Meridian with an enterable two-story safehouse.
class_name ProtoWorldBuilder
extends Object

static var _mat_cache: Dictionary = {}

const COL_GROUND := Color(0.70, 0.58, 0.40)
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


## Builds everything. Returns spawn info: { "car_spawns": Array[Transform3D], "house": ProtoHouse }
static func build_world(root: Node3D) -> Dictionary:
	var world := Node3D.new()
	world.name = "World"
	root.add_child(world)

	# --- Ground: one huge desert slab -------------------------------------
	var ground := StaticBody3D.new()
	ground.name = "Ground"
	var gmesh := MeshInstance3D.new()
	var gplane := PlaneMesh.new()
	gplane.size = Vector2(1600, 1600)
	gmesh.mesh = gplane
	gmesh.material_override = material(COL_GROUND, 1.0)
	ground.add_child(gmesh)
	var gshape := CollisionShape3D.new()
	var gbox := BoxShape3D.new()
	gbox.size = Vector3(1600, 1.0, 1600)
	gshape.shape = gbox
	gshape.position.y = -0.5
	ground.add_child(gshape)
	world.add_child(ground)

	# --- Interstate 9: north/south highway ---------------------------------
	# Runs from z=+420 (spawn) to z=-420. Visual-only slabs sit on the ground.
	box_visual(world, Vector3(16, 0.04, 860), Vector3(0, 0.02, 0), COL_ROAD)
	# Shoulder lines
	box_visual(world, Vector3(0.35, 0.05, 860), Vector3(-7.2, 0.025, 0), COL_DASH)
	box_visual(world, Vector3(0.35, 0.05, 860), Vector3(7.2, 0.025, 0), COL_DASH)
	# Center dashes
	var z := -420.0
	while z < 420.0:
		box_visual(world, Vector3(0.4, 0.05, 3.2), Vector3(0, 0.03, z), COL_DASH)
		z += 12.0

	# --- Exit 9 ramp: peels off east toward Meridian ------------------------
	# Diagonal from highway edge (x=8, z=-235) down to the town street (x=52, z=-280).
	var ramp_dir := Vector2(52.0 - 8.0, -280.0 + 235.0) # (44, -45)
	var ramp_len := ramp_dir.length() + 12.0
	var ramp_ang := atan2(ramp_dir.x, -ramp_dir.y) # rotation around Y for a Z-aligned box
	box_visual(world, Vector3(9, 0.05, ramp_len), Vector3(30, 0.025, -257.5), COL_ROAD, ramp_ang)

	# --- Meridian: street grid ---------------------------------------------
	# Main street along X at z=-290, cross street along Z at x=85.
	box_visual(world, Vector3(120, 0.05, 10), Vector3(105, 0.025, -290), COL_ROAD)
	box_visual(world, Vector3(10, 0.05, 90), Vector3(85, 0.025, -300), COL_ROAD)

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

	# --- Filler houses (solid, not enterable) -------------------------------
	var fillers: Array = [
		[Vector3(60, 0, -310), Vector3(10, 5, 8), COL_HOUSE_A],
		[Vector3(62, 0, -268), Vector3(9, 4, 9), COL_HOUSE_B],
		[Vector3(110, 0, -268), Vector3(12, 4.5, 8), COL_HOUSE_A],
		[Vector3(140, 0, -312), Vector3(9, 5, 9), COL_HOUSE_B],
		[Vector3(64, 0, -335), Vector3(8, 4, 8), COL_HOUSE_A],
	]
	for f in fillers:
		var fpos: Vector3 = f[0]
		var fsize: Vector3 = f[1]
		var fcol: Color = f[2]
		box_body(world, fsize, fpos + Vector3(0, fsize.y / 2.0, 0), fcol)
		box_body(world, Vector3(fsize.x + 0.6, 0.3, fsize.z + 0.6), fpos + Vector3(0, fsize.y + 0.15, 0), COL_ROOF)

	# --- Wrecks along the highway shoulder (Deathlands flavor) --------------
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

	# --- The safehouse: enterable, two floors --------------------------------
	var house := ProtoHouse.new()
	house.position = Vector3(110, 0, -325)
	world.add_child(house)
	house.build()
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
