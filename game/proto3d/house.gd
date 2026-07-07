## Two-story enterable safehouse built from boxes. The GTA trick lives here:
## the roof vanishes when you're inside, and the second floor goes see-through
## while you're on the ground floor so the top-down camera can always see you.
class_name ProtoHouse
extends Node3D

const WIDTH := 10.0  # x
const DEPTH := 9.0   # z
const FLOOR_H := 3.0
const WALL_T := 0.3

## THE FURNISHER (building_types.json id this structure furnishes as): reads its
## furniture_set row ["fridge","kitchen_cabinet","medicine_cabinet","closet","desk"].
const BUILDING_TYPE := "house"

## Door-safe interior anchors (recon geometry — verified against build()'s own door
## span [X -2.4..-0.6 @ Z=+4.5, the front/+Z face] and the stair foot-zone [X 3.0..5.0,
## Z -2.2..4.0]): the west-wall column (X=-4.2) never enters either AABB's X-range;
## the back-wall overflow row (Z=-3.9) never enters the stair AABB's Z-range. Lines
## the west wall from the back corner toward the door, then wraps onto the back wall.
const FURN_WEST_X := -4.2
const FURN_WEST_Z_START := -3.5
const FURN_WEST_Z_STEP := 1.3
const FURN_WEST_Z_MAX := 3.5     ## stop short of the door's Z face; overflow -> back wall
const FURN_BACK_Z := -3.9
const FURN_BACK_X_START := -2.6  ## picks up where the west column's X range left off
const FURN_BACK_X_STEP := 1.3
const FURN_WEST_FACING := 0.0        ## faces +Z, into the room, off the west wall
const FURN_BACK_FACING := PI / 2.0   ## faces +X, into the room, off the back wall
## Owner functional-polish ask: a GUN RACK proves the law override lives even though
## "house" isn't gun-flavored furniture_set. Reuses the gun_safe row verbatim (same
## table + law_sensitivity "guns") rather than inventing an undifferentiated near-dupe.
## Placed at furnish_interior() time via the NEXT free slot in the same anchor grid
## the furniture_set uses — never a hardcoded point that could collide with it.
const GUN_RACK_FURNITURE_ID := "gun_safe"

var tracked: Node3D = null ## Set by the main scene — the on-foot player to watch.

var front_door: ProtoDoor
var stash: ProtoStash
var furniture: Array[ProtoFurniture] = [] ## filled by furnish_interior(); read by sims

var tracked_inside: bool = false ## read by main: clamps sight indoors (no x-ray walls)
var _roof: Node3D
var _front_mat: StandardMaterial3D = null ## front wall fades so you can SEE the stairs
var _floor2_mat: StandardMaterial3D
var _wall_color := Color(0.55, 0.50, 0.42)
var _floor2_color := Color(0.48, 0.38, 0.26)


func build() -> void:
	var hw := WIDTH / 2.0
	var hd := DEPTH / 2.0
	var full_h := FLOOR_H * 2.0 + 0.2

	# --- Walls (full two-story height on back + west; detailed front + east) ---
	# Back wall (-Z)
	_wall(Vector3(WIDTH, full_h, WALL_T), Vector3(0, full_h / 2.0, -hd))
	# West wall (-X)
	_wall(Vector3(WALL_T, full_h, DEPTH), Vector3(-hw, full_h / 2.0, 0))
	# East wall (+X)
	_wall(Vector3(WALL_T, full_h, DEPTH), Vector3(hw, full_h / 2.0, 0))

	# Front wall (+Z, faces the street) — ground floor has a door gap.
	# Door: 1.8 wide, centered at x = -1.5. Segments left and right of it.
	var door_x := -1.5
	var door_w := 1.8
	var seg_l_w := (door_x - door_w / 2.0) - (-hw)
	_wall(Vector3(seg_l_w, FLOOR_H, WALL_T), Vector3(-hw + seg_l_w / 2.0, FLOOR_H / 2.0, hd))
	var seg_r_x0 := door_x + door_w / 2.0
	var seg_r_w := hw - seg_r_x0
	_wall(Vector3(seg_r_w, FLOOR_H, WALL_T), Vector3(seg_r_x0 + seg_r_w / 2.0, FLOOR_H / 2.0, hd))
	# Lintel above the door gap
	_wall(Vector3(door_w, FLOOR_H - 2.6, WALL_T), Vector3(door_x, 2.6 + (FLOOR_H - 2.6) / 2.0, hd))

	# The actual front door: hinged at the left edge of the gap.
	front_door = ProtoDoor.create(door_w, 2.6, Color(0.34, 0.22, 0.13))
	front_door.position = Vector3(door_x - door_w / 2.0, 0, hd)
	add_child(front_door)
	# Upstairs front: window gap 2.2 wide centered at x = 0.5 (look out over the street).
	var win_x := 0.5
	var win_w := 2.2
	var up_y := FLOOR_H + 0.2
	var up_l_w := (win_x - win_w / 2.0) - (-hw)
	_wall(Vector3(up_l_w, FLOOR_H, WALL_T), Vector3(-hw + up_l_w / 2.0, up_y + FLOOR_H / 2.0, hd))
	var up_r_x0 := win_x + win_w / 2.0
	var up_r_w := hw - up_r_x0
	_wall(Vector3(up_r_w, FLOOR_H, WALL_T), Vector3(up_r_x0 + up_r_w / 2.0, up_y + FLOOR_H / 2.0, hd))
	# Sill below + lintel above the window
	_wall(Vector3(win_w, 1.0, WALL_T), Vector3(win_x, up_y + 0.5, hd))
	_wall(Vector3(win_w, 0.8, WALL_T), Vector3(win_x, up_y + FLOOR_H - 0.4, hd))

	# --- Interior floor slab (visual) -----------------------------------------
	ProtoWorldBuilder.box_visual(self, Vector3(WIDTH - WALL_T, 0.06, DEPTH - WALL_T), Vector3(0, 0.03, 0), Color(0.35, 0.30, 0.24))

	# --- Second floor: slab with a stairwell hole along the east side ----------
	# Stair strip: x in [3.0, hw-WALL_T], stairwell hole z in [-2.2, hd].
	_floor2_mat = StandardMaterial3D.new()
	_floor2_mat.albedo_color = _floor2_color
	_floor2_mat.roughness = 0.9
	_floor2_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	var slab_y := FLOOR_H + 0.1
	# Main slab covers x [-hw, 3.0], all z.
	_floor2_slab(Vector3(3.0 + hw, 0.2, DEPTH), Vector3((3.0 - hw) / 2.0, slab_y, 0))
	# Landing slab at the top of the stairs: x [3.0, hw], z [-hd, -2.2].
	_floor2_slab(Vector3(hw - 3.0, 0.2, -2.2 + hd), Vector3((3.0 + hw) / 2.0, slab_y, (-hd - 2.2) / 2.0))

	# --- Stairs: a SOLID smooth RAMP you just walk up, with decorative treads on
	# top. The stepped/thin-box collision was too fiddly to climb — playtest fix is
	# literally "make it a ramp that looks like stairs." A wide triangular wedge
	# (nothing to catch on) rising from the room floor to the landing. -------------
	var stair_x := 3.6
	var half_w := 1.1        # 2.2 m wide — easy to line up
	var z_base := 4.0        # front / bottom (y=0), reachable from the room
	var z_ramp_top := -2.0   # where the slope reaches full height
	var z_back := -3.4       # a flat PLATEAU continues under the landing so there's
	var rise := FLOOR_H + 0.2 # no lip to step over at the top (playtest: stuck up top)
	var wedge := StaticBody3D.new()
	wedge.position = Vector3(stair_x, 0, 0)
	var wshape := CollisionShape3D.new()
	var hull := ConvexPolygonShape3D.new()
	hull.points = PackedVector3Array([
		Vector3(-half_w, 0.0, z_base), Vector3(-half_w, 0.0, z_back),
		Vector3(-half_w, rise, z_back), Vector3(-half_w, rise, z_ramp_top),
		Vector3(half_w, 0.0, z_base), Vector3(half_w, 0.0, z_back),
		Vector3(half_w, rise, z_back), Vector3(half_w, rise, z_ramp_top),
	])
	wshape.shape = hull
	wedge.add_child(wshape)
	add_child(wedge)
	# Decorative treads on the sloped part only (the plateau IS the landing edge).
	var steps := 9
	for i in steps:
		var tt := (float(i) + 0.5) / float(steps)
		var sz := lerpf(z_base, z_ramp_top, tt)
		var sy := lerpf(0.0, rise, tt)
		ProtoWorldBuilder.box_visual(self, Vector3(2.2, 0.12, (z_base - z_ramp_top) / float(steps) + 0.06), Vector3(stair_x, sy + 0.03, sz), Color(0.42, 0.36, 0.28))

	# --- Roof: hides when you walk in ------------------------------------------
	_roof = ProtoWorldBuilder.box_body(self, Vector3(WIDTH + 0.8, 0.25, DEPTH + 0.8), Vector3(0, FLOOR_H * 2.0 + 0.35, 0), Color(0.40, 0.26, 0.18))

	# --- Upstairs loot: the stash holds the key to the car parked in town ------
	stash = ProtoStash.create("duffel bag", "meridian_car_key", "the Meridian car key")
	stash.position = Vector3(-3.4, FLOOR_H + 0.2, -2.8)
	add_child(stash)
	# Crate downstairs
	ProtoWorldBuilder.box_body(self, Vector3(1.1, 1.1, 1.1), Vector3(3.6, 0.55, -3.2) * Vector3(-1, 1, 1), Color(0.45, 0.34, 0.20))

	# --- Interior lights so it isn't a cave under the roof ----------------------
	for ly in [1.8, FLOOR_H + 2.0]:
		var lamp := OmniLight3D.new()
		lamp.position = Vector3(0, ly, 0)
		lamp.light_color = Color(1.0, 0.85, 0.6)
		lamp.light_energy = 1.2
		lamp.omni_range = 9.0
		add_child(lamp)


func _wall(size: Vector3, pos: Vector3) -> void:
	var body := ProtoWorldBuilder.box_body(self, size, pos, _wall_color)
	# Front (camera-side, +Z) walls share a fade material — transparent when
	# you're inside, so the stairs by the front wall are actually visible.
	if pos.z > DEPTH / 2.0 - 0.5:
		if _front_mat == null:
			_front_mat = StandardMaterial3D.new()
			_front_mat.albedo_color = _wall_color
			_front_mat.roughness = 0.9
			_front_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		for child in body.get_children():
			if child is MeshInstance3D:
				(child as MeshInstance3D).material_override = _front_mat
	else:
		# PIXEL SKIN the solid walls — bone concrete (goal "pixel art, brought into 3D",
		# safehouse block first). Front walls keep the fade material so the stairs show.
		for child in body.get_children():
			if child is MeshInstance3D:
				(child as MeshInstance3D).material_override = ProtoWorldBuilder.material_skin("wall", 1.0)


func _floor2_slab(size: Vector3, pos: Vector3) -> void:
	var body := ProtoWorldBuilder.box_body(self, size, pos, _floor2_color)
	# Share the transparency-capable material so both slabs fade together.
	for child in body.get_children():
		if child is MeshInstance3D:
			(child as MeshInstance3D).material_override = _floor2_mat


func _physics_process(_delta: float) -> void:
	if tracked == null or not is_instance_valid(tracked):
		_set_inside(false)
		return
	var local := to_local(tracked.global_position)
	var inside: bool = absf(local.x) < WIDTH / 2.0 + 0.4 and absf(local.z) < DEPTH / 2.0 + 0.4 and local.y < FLOOR_H * 2.0 + 0.6
	_set_inside(inside, local.y)


func _set_inside(inside: bool, tracked_y: float = 0.0) -> void:
	tracked_inside = inside
	if _roof:
		_roof.visible = not inside
	if _front_mat:
		_front_mat.albedo_color.a = lerpf(_front_mat.albedo_color.a, 0.14 if inside else 1.0, 0.25)
	if _floor2_mat:
		var downstairs: bool = inside and tracked_y < FLOOR_H - 0.4
		var target_a := 0.15 if downstairs else 1.0
		_floor2_mat.albedo_color.a = lerpf(_floor2_mat.albedo_color.a, target_a, 0.25)


## THE FURNISHER (world_builder.gd calls this right after build()): spawns this
## structure's building_types.json furniture_set at deterministic door-safe anchors
## (see the FURN_* consts) — west wall first, back wall on overflow — each piece
## facing INTO the room. Also drops the owner's functional-polish pair: a STOVE
## (meat -> hot meal, camp.gd's own verb) and a GUN RACK (the gun_safe table, so
## faith_occupation staging rolls confiscation notices here too). Deterministic:
## the SAME seed idiom (hash("building_id:furn_i")) on two calls with the same
## building_id produces byte-identical placement AND (once rolled) byte-identical
## loot — furnisher_sim asserts this directly.
func furnish_interior(main: Node, building_id: String = "safehouse") -> void:
	furniture.clear()
	var row := ProtoLootResolver.building_row(BUILDING_TYPE)
	var set_ids: Array = row.get("furniture_set", [])

	# ONE ordered, door-safe slot cursor (west wall, back-corner-to-door-ward, THEN
	# the back wall on overflow) — every placed thing (furniture_set pieces, the
	# gun rack, the stove) draws its anchor from the SAME list at increasing index,
	# so nothing can ever collide no matter how the furniture_set grows.
	var slots: Array[Vector3] = []
	var facings: Array[float] = []
	var z := FURN_WEST_Z_START
	while z <= FURN_WEST_Z_MAX:
		slots.append(Vector3(FURN_WEST_X, 0, z))
		facings.append(FURN_WEST_FACING)
		z += FURN_WEST_Z_STEP
	var x := FURN_BACK_X_START
	while x <= WIDTH / 2.0 - 1.0:
		slots.append(Vector3(x, 0, FURN_BACK_Z))
		facings.append(FURN_BACK_FACING)
		x += FURN_BACK_X_STEP

	var cursor := 0
	for i in set_ids.size():
		var fid := String(set_ids[i])
		var uid := "%s:furn_%d" % [building_id, i]
		var piece := ProtoFurniture.create(fid, uid, BUILDING_TYPE)
		var slot_i: int = mini(cursor, slots.size() - 1)
		piece.position = slots[slot_i]
		piece.rotation.y = facings[slot_i]
		add_child(piece)
		furniture.append(piece)
		cursor += 1

	# --- Functional polish: the GUN RACK (gun_safe table — proves the law layer) --
	var rack := ProtoFurniture.create(GUN_RACK_FURNITURE_ID, "%s:gun_rack" % building_id, BUILDING_TYPE)
	var rack_i: int = mini(cursor, slots.size() - 1)
	rack.position = slots[rack_i]
	rack.rotation.y = facings[rack_i]
	add_child(rack)
	furniture.append(rack)
	cursor += 1

	# --- Functional polish: the STOVE (camp.gd's own cook verb, house-side twin) --
	var stove := Stove.new()
	var stove_i: int = mini(cursor, slots.size() - 1)
	stove.position = slots[stove_i]
	stove.rotation.y = facings[stove_i]
	add_child(stove)


## THE STOVE — camp.gd's own crafting verb (1 meat -> 1 hot camp meal), reused
## verbatim for the safehouse's fixed kitchen. A tiny sibling class rather than a
## mode flag on ProtoFurniture: the stove has no loot table and no container — it's
## a pure verb converter, a different shape than "a furniture_defs row made real."
## Bolting cook-mode onto ProtoFurniture would force every consumer to branch on
## is_stove; two small honest classes (this + camp.gd::Stove) stay single-purpose.
class Stove:
	extends StaticBody3D

	func _ready() -> void:
		add_to_group("interactable")
		var m := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(0.8, 0.7, 0.6)
		m.mesh = bm
		m.material_override = ProtoWorldBuilder.material(Color(0.3, 0.3, 0.32), 0.6)
		m.position.y = 0.35
		add_child(m)
		var shape := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = Vector3(0.9, 0.8, 0.7)
		shape.shape = bs
		shape.position.y = 0.4
		add_child(shape)

	func interact_position() -> Vector3:
		return global_position

	func interact_prompt(main: Node) -> String:
		if main.backpack.count("meat") <= 0:
			return "🍳 STOVE — bring meat to cook"
		return "E — 🍳 COOK (1 meat → hot camp meal)"

	func interact(main: Node) -> void:
		if not main.backpack.remove("meat", 1):
			main.notify("🍳 Nothing to cook — the pack's out of meat")
			return
		main.backpack.add("cooked_meal", 1)
		main.audio.play_ui("click", -8.0)
		if main.has_method("grant_xp"):
			main.grant_xp("scavenging", 1.0)
		main.notify("🍳 The stove does its work — a HOT MEAL rides in your pack now")
