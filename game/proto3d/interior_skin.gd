## THE INTERIOR SKIN (BUILDING_BOOK §2 / AMERICAN_ROAD 0.9 — I0 of the Living
## World loop): house.gd's three proven interior laws, generalized so ANY
## structure shell can wear them instead of re-deriving the safehouse:
##   1. ROOF-HIDE   — the roof exists from outside, vanishes when you step in
##   2. FRONT-FADE  — the front (+Z) wall goes translucent while you're inside
##                    so the doorway wall never blinds the top-down camera
##   3. SLAB-FADE   — with 2+ floors, the upper slab goes see-through while
##                    you stand downstairs (house.gd's _floor2_mat law)
## The roof is EARNED (AR 0.9): only rows whose interior_template says
## "walkin_roofed" get one — the open-top shell stays the honest default.
## Inside-detect: the same local-space AABB test the safehouse uses, against
## every live "player3d" (co-op safe: ANY player inside opens the shell).
class_name ProtoInteriorSkin
extends Node3D

var half_w: float = 5.0
var half_d: float = 4.0
var height: float = 3.0
var roof: MeshInstance3D = null
var front_mats: Array[StandardMaterial3D] = []
var floor2_mat: StandardMaterial3D = null
var floor_h: float = 3.0
var inside: bool = false


## Wrap a built shell. front_walls: the front-wall MeshInstance3Ds to fade
## (their materials are swapped for per-structure fade-capable duplicates).
## with_roof: build the hide-roof (EARNED — walkin_roofed rows only).
static func apply(root: Node3D, w: float, d: float, wall_h: float,
		front_walls: Array = [], with_roof: bool = false,
		roof_color: Color = Color(0.3, 0.27, 0.24)) -> ProtoInteriorSkin:
	var skin := ProtoInteriorSkin.new()
	skin.name = "InteriorSkin"
	skin.half_w = w * 0.5
	skin.half_d = d * 0.5
	skin.height = wall_h
	root.add_child(skin)
	if with_roof:
		skin.roof = MeshInstance3D.new()
		var rm := BoxMesh.new()
		rm.size = Vector3(w + 0.4, 0.12, d + 0.4)
		skin.roof.mesh = rm
		skin.roof.material_override = ProtoWorldBuilder.material(roof_color, 0.95)
		skin.roof.position.y = wall_h + 0.06
		skin.add_child(skin.roof)
	for wm in front_walls:
		if wm is MeshInstance3D:
			var src: Material = (wm as MeshInstance3D).material_override
			var mat: StandardMaterial3D = (src as StandardMaterial3D).duplicate() \
				if src is StandardMaterial3D else StandardMaterial3D.new()
			mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			(wm as MeshInstance3D).material_override = mat
			skin.front_mats.append(mat)
	return skin


## Optional: register a second-storey slab's material for the downstairs fade.
func track_floor2(mat: StandardMaterial3D, floor_height: float) -> void:
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	floor2_mat = mat
	floor_h = floor_height


func _physics_process(delta: float) -> void:
	var was := inside
	inside = false
	var downstairs := false
	var parent := get_parent() as Node3D
	if parent == null:
		return
	for pl in get_tree().get_nodes_in_group("player3d"):
		if not (pl is Node3D) or not is_instance_valid(pl):
			continue
		var local: Vector3 = parent.to_local((pl as Node3D).global_position)
		if absf(local.x) < half_w + 0.4 and absf(local.z) < half_d + 0.4 \
				and local.y < height * 2.0 + 0.6:
			inside = true
			downstairs = local.y < floor_h - 0.4
			break
	if inside != was:
		get_parent().set_meta("player_inside", inside)
	if roof:
		roof.visible = not inside
	var k := clampf(delta * 8.0, 0.0, 1.0)
	for m in front_mats:
		m.albedo_color.a = lerpf(m.albedo_color.a, 0.14 if inside else 1.0, k)
	if floor2_mat:
		floor2_mat.albedo_color.a = lerpf(floor2_mat.albedo_color.a,
			0.15 if (inside and downstairs) else 1.0, k)
