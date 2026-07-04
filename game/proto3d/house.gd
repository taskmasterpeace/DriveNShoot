## Two-story enterable safehouse built from boxes. The GTA trick lives here:
## the roof vanishes when you're inside, and the second floor goes see-through
## while you're on the ground floor so the top-down camera can always see you.
class_name ProtoHouse
extends Node3D

const WIDTH := 10.0  # x
const DEPTH := 9.0   # z
const FLOOR_H := 3.0
const WALL_T := 0.3

var tracked: Node3D = null ## Set by the main scene — the on-foot player to watch.

var front_door: ProtoDoor
var stash: ProtoStash

var _roof: Node3D
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

	# --- Stairs: ramp collision + step visuals, rising back-to-front gap -------
	# Run from z=+3.4 (bottom, y=0) to z=-2.2 (top, y=FLOOR_H+0.2) in the east strip.
	var stair_x := (3.0 + hw - WALL_T) / 2.0
	var run := 3.4 - (-2.2)
	var rise := FLOOR_H + 0.2
	var ramp_len := sqrt(run * run + rise * rise)
	var ramp := StaticBody3D.new()
	ramp.position = Vector3(stair_x, rise / 2.0, (3.4 + -2.2) / 2.0)
	# +X rotation drops the +Z (door-side) end: bottom at the door, top at the back.
	# (Was negative — the collision ramp ascended BACKWARD vs the visual steps. Playtest bug #1.)
	ramp.rotation.x = atan2(rise, run)
	var rshape := CollisionShape3D.new()
	var rbox := BoxShape3D.new()
	rbox.size = Vector3(1.6, 0.25, ramp_len)
	rshape.shape = rbox
	ramp.add_child(rshape)
	add_child(ramp)
	# Step visuals: 9 steps
	var steps := 9
	for i in steps:
		var t0 := float(i) / float(steps)
		var t1 := float(i + 1) / float(steps)
		var sz := 3.4 - t0 * run - (run / float(steps)) / 2.0
		var sy := t1 * rise
		ProtoWorldBuilder.box_visual(self, Vector3(1.6, sy, run / float(steps)), Vector3(stair_x, sy / 2.0, sz), Color(0.42, 0.36, 0.28))

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
	ProtoWorldBuilder.box_body(self, size, pos, _wall_color)


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
	if _roof:
		_roof.visible = not inside
	if _floor2_mat:
		var downstairs: bool = inside and tracked_y < FLOOR_H - 0.4
		var target_a := 0.15 if downstairs else 1.0
		_floor2_mat.albedo_color.a = lerpf(_floor2_mat.albedo_color.a, target_a, 0.25)
