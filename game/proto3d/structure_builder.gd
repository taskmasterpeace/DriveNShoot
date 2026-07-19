## THE SHELL BUILDER (DRIVN_World_Structures spec §7-8, §18): materializes any
## DrivnStructure row into a playable shell — walls with a real door gap when
## enterable (a solid massing block when not), the SIGN GLYPH out front (§18:
## every structure reads from the road), a loot cache rolled off the row's table,
## and every systemic hook tagged as meta for the systems that consume them.
##
## DELIBERATELY NOT CALLED BY WORLD PLACEMENT YET (owner's order: buildings are
## CREATED, roads + exits get arranged first). Sims, MapForge previews, and the
## future placement phase are the callers.
class_name ProtoStructureBuilder
extends RefCounted

const WALL_H := 3.0
const WALL_T := 0.3
const DOOR_W := 1.8

## Category palette — ink/bone/amber family, never purple.
const CATEGORY_COLORS: Dictionary = {
	"service": Color(0.55, 0.44, 0.26),
	"commercial": Color(0.5, 0.42, 0.3),
	"residential": Color(0.46, 0.4, 0.32),
	"civic_law": Color(0.42, 0.42, 0.44),
	"civic_faction": Color(0.48, 0.44, 0.38),
	"civic": Color(0.44, 0.44, 0.42),
	"medical": Color(0.6, 0.58, 0.54),
	"industrial": Color(0.34, 0.32, 0.3),
	"industrial_service": Color(0.4, 0.36, 0.3),
	"monument": Color(0.58, 0.55, 0.48),
	"media": Color(0.36, 0.34, 0.36),
	"restricted": Color(0.34, 0.36, 0.28),
	"law_military": Color(0.38, 0.38, 0.3),
	"venue": Color(0.52, 0.38, 0.2),
	"agriculture": Color(0.44, 0.42, 0.26),
	"transit": Color(0.42, 0.46, 0.48), # SEABOARD: station slate — steel-age gray-blue
}

## Category -> the furniture pieces that dress its interior (ids from
## furniture_defs.json). A building without a row here gets the plain default.
const CATEGORY_FURNITURE: Dictionary = {
	"residential": ["fridge", "kitchen_cabinet", "closet", "desk"],
	"commercial": ["cash_register", "kitchen_cabinet", "warehouse_crate", "desk"],
	"service": ["cash_register", "tool_rack", "kitchen_cabinet"],
	"civic_law": ["police_locker", "gun_safe", "desk"],
	"law_military": ["gun_safe", "police_locker", "tool_rack"],
	"medical": ["medicine_cabinet", "closet", "desk"],
	"civic_faction": ["kitchen_cabinet", "desk", "closet"],
	"civic": ["desk", "closet"],
	"media": ["desk", "tool_rack"],
	"industrial": ["warehouse_crate", "tool_rack"],
	"industrial_service": ["warehouse_crate", "tool_rack"],
	"agriculture": ["tool_rack", "kitchen_cabinet", "gun_safe"],
	"restricted": ["warehouse_crate", "gun_safe", "desk"],
	"venue": ["cash_register", "desk"],
	"transit": ["desk", "closet"],
}
## Category -> the building_types.json id whose loot weight_mult the furniture uses.
const CATEGORY_BUILDING_TYPE: Dictionary = {
	"residential": "house", "agriculture": "farmhouse", "service": "gas_station",
	"civic_law": "police_station", "law_military": "police_station",
	"medical": "clinic", "civic_faction": "church",
	"industrial": "warehouse", "industrial_service": "warehouse", "restricted": "warehouse",
}


## Materialize a profile row. Returns null (with a warning) for unknown ids —
## a missing row must never crash a caller (the warn-not-crash law).
static func materialize(structure_id: String, label_override: String = "") -> Node3D:
	DrivnData.ensure_structures()
	var row: DrivnStructure = DrivnData.structures.get(structure_id)
	if row == null:
		push_warning("StructureBuilder: no profile '%s' in the catalog" % structure_id)
		return null
	var root := Node3D.new()
	root.name = "Structure_%s" % row.id
	root.add_to_group("structure")
	root.set_meta("structure_id", row.id)
	root.set_meta("category", row.category)
	root.set_meta("danger", row.danger)
	root.set_meta("npc_jobs", row.npc_jobs)
	root.set_meta("law_hooks", row.law_hooks)
	root.set_meta("event_hooks", row.event_hooks)
	root.set_meta("can_be_safehouse", row.can_be_safehouse)

	var w := row.footprint_m.x
	var d := row.footprint_m.y
	var col: Color = CATEGORY_COLORS.get(row.category, Color(0.45, 0.4, 0.33))

	if row.enterable:
		# Four walls, a REAL door gap in the front (+Z), open top — from the
		# top-down camera an open shell reads its whole interior honestly.
		_wall(root, Vector3(0, WALL_H * 0.5, -d * 0.5), Vector3(w, WALL_H, WALL_T), col)          # back
		_wall(root, Vector3(-w * 0.5, WALL_H * 0.5, 0), Vector3(WALL_T, WALL_H, d), col)          # west
		_wall(root, Vector3(w * 0.5, WALL_H * 0.5, 0), Vector3(WALL_T, WALL_H, d), col)           # east
		var seg := (w - DOOR_W) * 0.5 # the front wall splits around the doorway
		if seg > 0.1:
			_wall(root, Vector3(-(DOOR_W + seg) * 0.5, WALL_H * 0.5, d * 0.5), Vector3(seg, WALL_H, WALL_T), col)
			_wall(root, Vector3((DOOR_W + seg) * 0.5, WALL_H * 0.5, d * 0.5), Vector3(seg, WALL_H, WALL_T), col)
		var floor_slab := MeshInstance3D.new()
		var fm := BoxMesh.new()
		fm.size = Vector3(w, 0.06, d)
		floor_slab.mesh = fm
		floor_slab.material_override = ProtoWorldBuilder.material(col.darkened(0.45), 0.95)
		floor_slab.position.y = 0.03
		root.add_child(floor_slab)
		# NOT AN EMPTY SHELL (LOOT_NPC §4 + owner /goal "we need enterable buildings"):
		# a few interactable furniture pieces matched to the building's category, on
		# interior anchors clear of the front door and the cache. Walk in, open a fridge.
		_furnish(root, row, w, d)
	else:
		# A solid massing block — junkyards/monuments/compounds read as mass.
		var body := StaticBody3D.new()
		var mesh := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(w, WALL_H * row.floors, d)
		mesh.mesh = bm
		mesh.material_override = ProtoWorldBuilder.material(col, 0.9)
		mesh.position.y = WALL_H * row.floors * 0.5
		body.add_child(mesh)
		var shape := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = bm.size
		shape.shape = bs
		shape.position.y = mesh.position.y
		body.add_child(shape)
		root.add_child(body)

	# THE SIGN (§18): glyph + name out front, readable by the sight cone.
	# M4b: a placement may override the name — the water tower says the TOWN's.
	var sign_name := label_override if label_override != "" else row.display_name
	var sign := ProtoSign.create("%s %s" % [row.sign_glyph, sign_name], row.sign_glyph)
	root.add_child(sign)
	sign.position = Vector3(w * 0.5 + 1.0, 0, d * 0.5 + 1.0)

	# THE LOOT (§9 multi-use): rolled off the row's table, same spot every time
	# for the same building (seeded by id — determinism the sims can hold).
	if row.loot_table != "":
		var rng := RandomNumberGenerator.new()
		rng.seed = hash(row.id)
		var loot: Dictionary = ProtoContainer.roll_loot(row.loot_table, rng)
		if loot.is_empty():
			loot = {"scrap": 1}
		var chest := ProtoChest.create("%s cache" % row.display_name, loot, false)
		root.add_child(chest)
		chest.position = Vector3(0, 0, -d * 0.25) if row.enterable else Vector3(w * 0.5 + 1.2, 0, -d * 0.25)
	return root


## Dress an enterable shell with interactable furniture. Deterministic per building
## type (mirrors the loot cache's seeding). Anchors sit clear of the front doorway
## (+Z centre) and the cache at (0,0,-d*0.25) so neither the walk-in ray nor the
## chest is ever blocked.
static func _furnish(root: Node3D, row: DrivnStructure, w: float, d: float) -> void:
	var furn_set: Array = CATEGORY_FURNITURE.get(row.category, ["desk", "closet"])
	if furn_set.is_empty():
		return
	var area := w * d
	var n: int = 2 if area < 90.0 else (3 if area < 200.0 else 4)
	n = mini(n, furn_set.size())
	var bt := String(CATEGORY_BUILDING_TYPE.get(row.category, ""))
	var anchors: Array = [
		Vector3(-w * 0.3, 0, -d * 0.36), Vector3(w * 0.3, 0, -d * 0.36),
		Vector3(-w * 0.37, 0, d * 0.02), Vector3(w * 0.37, 0, d * 0.02),
	]
	for i in range(n):
		var piece := ProtoFurniture.create(String(furn_set[i]), "%s:furn_%d" % [row.id, i], bt)
		if piece == null:
			continue
		piece.position = anchors[i % anchors.size()]
		root.add_child(piece)


static func _wall(root: Node3D, pos: Vector3, size: Vector3, col: Color) -> void:
	var body := StaticBody3D.new()
	var mesh := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mesh.mesh = bm
	mesh.material_override = ProtoWorldBuilder.material(col, 0.9)
	body.add_child(mesh)
	var shape := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = size
	shape.shape = bs
	body.add_child(shape)
	root.add_child(body)
	body.position = pos
