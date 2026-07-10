## THE SHELL BUILDER (DRIVN_World_Structures spec §7-8, §18): materializes any
## DrivnStructure row into a playable shell — walls with a real door gap when
## enterable (a solid massing block when not), the SIGN GLYPH out front (§18:
## every structure reads from the road), a loot cache rolled off the row's table,
## and every systemic hook tagged as meta for the systems that consume them.
##
## CALLED BY WORLD PLACEMENT since M0 (world_builder authored placements +
## world_stream._spawn_placement for streamed chunks), plus sims and MapForge
## previews. (Header was stale — it predated the M0 materialize wire.)
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
}


## Materialize a profile row. Returns null (with a warning) for unknown ids —
## a missing row must never crash a caller (the warn-not-crash law).
static func materialize(structure_id: String, label_override: String = "", tint_seed: int = 0) -> Node3D:
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
	# THE PATCHWORK FOR BUILDINGS (fidelity loop it.11): a stable per-placement
	# tint nudge (quantized — the material cache stays bounded) so a street stops
	# reading as one repeated swatch. Seed 0 = byte-identical to before.
	if tint_seed != 0:
		col = ProtoWorldBuilder.chunk_tint(col, tint_seed, tint_seed >> 8)

	if row.enterable:
		# Four walls, a REAL door gap in the front (+Z), open top — from the
		# top-down camera an open shell reads its whole interior honestly.
		# FLOORS READ (I2): a 2-storey row builds 2-storey walls.
		var wh := WALL_H * maxf(1.0, float(row.floors))
		_wall(root, Vector3(0, wh * 0.5, -d * 0.5), Vector3(w, wh, WALL_T), col)          # back
		_wall(root, Vector3(-w * 0.5, wh * 0.5, 0), Vector3(WALL_T, wh, d), col)          # west
		_wall(root, Vector3(w * 0.5, wh * 0.5, 0), Vector3(WALL_T, wh, d), col)           # east
		var seg := (w - DOOR_W) * 0.5 # the front wall splits around the doorway
		var fronts: Array = []
		if seg > 0.1:
			fronts.append(_wall(root, Vector3(-(DOOR_W + seg) * 0.5, wh * 0.5, d * 0.5), Vector3(seg, wh, WALL_T), col))
			fronts.append(_wall(root, Vector3((DOOR_W + seg) * 0.5, wh * 0.5, d * 0.5), Vector3(seg, wh, WALL_T), col))
		var floor_slab := MeshInstance3D.new()
		var fm := BoxMesh.new()
		fm.size = Vector3(w, 0.06, d)
		floor_slab.mesh = fm
		floor_slab.material_override = ProtoWorldBuilder.material(col.darkened(0.45), 0.95)
		floor_slab.position.y = 0.03
		root.add_child(floor_slab)
		# THE INTERIOR SKIN (I0): walk-in rows wear the generalized house laws.
		# "walkin" = open-top (the honest default) + inside-detect + front-fade;
		# "walkin_roofed" = the EARNED hide-roof on top (AR 0.9: motel/police/
		# safehouse class only). Any other template value = today's bare shell,
		# byte-identical (backward-compat law).
		if row.interior_template == "walkin" or row.interior_template == "walkin_roofed":
			ProtoInteriorSkin.apply(root, w, d, wh, fronts,
				row.interior_template == "walkin_roofed", col.darkened(0.35))
			# THE FURNISHER (I1): furniture WAKES on approach, FREES on exit
			# (AR 0.11's LOD law) — the set comes from the row's building-type
			# ROW in building_types.json, uids seeded by the structure id so
			# the same shell always wakes the same pieces + loot.
			if not ProtoLootResolver.building_row(row.id).is_empty():
				ProtoFurnisher.attach(root, w, d, row.id, row.id)
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
		# THE ROOF READS (fidelity loop it.11): a massing block's top face was the
		# same swatch as its walls — cap it with a warm roof tone (visual-only,
		# no collision) so the top-down camera reads WALLS vs ROOF.
		var roof := MeshInstance3D.new()
		var roof_mesh := BoxMesh.new()
		roof_mesh.size = Vector3(w, 0.14, d)
		roof.mesh = roof_mesh
		roof.material_override = ProtoWorldBuilder.material(
			col.lerp(ProtoWorldBuilder.COL_ROOF, 0.55).darkened(0.12), 0.95)
		roof.position.y = WALL_H * row.floors + 0.07
		root.add_child(roof)

	# THE SILHOUETTE (I2): one read-feature per CATEGORY so 39 types stop being
	# one brown box — a canopy says fuel, a steeple says church, a stack says
	# industry. Visual-only boxes (no new collision = no walk-path regressions).
	_silhouette(root, row, col)

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


## Category → its DEFAULT read-feature. A row's own `silhouette` field wins
## (data over code: the school flies a flag whatever its category says).
const CATEGORY_SILHOUETTE: Dictionary = {
	"service": "canopy", "commercial": "awning", "residential": "porch",
	"civic_law": "lightbar", "medical": "cross", "civic": "steeple",
	"civic_faction": "flagpole", "venue": "marquee", "industrial": "stack",
	"industrial_service": "boom", "monument": "plinth", "media": "mast",
	"restricted": "hazard", "law_military": "berm", "agriculture": "silo",
}


## THE SILHOUETTE PASS (I2) — every structure grows its one defining massing
## read. Every feature is a visual box (never a collider): the read changes,
## the walk paths don't. Heights key off the row's own floors.
static func _silhouette(root: Node3D, row: DrivnStructure, col: Color) -> void:
	var w := row.footprint_m.x
	var d := row.footprint_m.y
	var wh := WALL_H * maxf(1.0, float(row.floors))
	var kind: String = row.silhouette if row.silhouette != "" \
		else String(CATEGORY_SILHOUETTE.get(row.category, ""))
	root.set_meta("silhouette_kind", kind)
	match kind:
		"canopy": # the fuel-stop CANOPY on posts out front
			_vis(root, Vector3(w * 0.7, 0.18, 3.2), Vector3(0, WALL_H + 0.4, d * 0.5 + 2.2), col.lightened(0.15))
			for sx in [-w * 0.3, w * 0.3]:
				_vis(root, Vector3(0.22, WALL_H + 0.4, 0.22), Vector3(sx, (WALL_H + 0.4) * 0.5, d * 0.5 + 3.2), col.darkened(0.3))
		"awning": # awning over the door + a parapet lip
			_vis(root, Vector3(w * 0.55, 0.2, 1.6), Vector3(0, WALL_H * 0.92, d * 0.5 + 0.9), Color(0.66, 0.52, 0.28))
			_vis(root, Vector3(w + 0.3, 0.35, 0.35), Vector3(0, wh + 0.15, d * 0.5), col.darkened(0.2))
		"porch": # porch stoop + a chimney block
			_vis(root, Vector3(DOOR_W + 1.2, 0.22, 1.6), Vector3(0, 0.11, d * 0.5 + 0.9), col.darkened(0.35))
			_vis(root, Vector3(0.7, wh + 1.1, 0.7), Vector3(w * 0.32, (wh + 1.1) * 0.5, -d * 0.5 - 0.38), col.darkened(0.4))
		"lightbar": # the LIGHT BAR strip + barred window blocks
			_vis(root, Vector3(w * 0.5, 0.3, 0.3), Vector3(0, wh + 0.25, d * 0.5 - 0.1), Color(0.25, 0.35, 0.55))
			for sx in [-w * 0.3, w * 0.3]:
				_vis(root, Vector3(1.2, 1.0, 0.12), Vector3(sx, WALL_H * 0.6, d * 0.5 + 0.08), Color(0.2, 0.22, 0.25))
		"cross": # the white cross panel above the door
			_vis(root, Vector3(0.5, 1.5, 0.15), Vector3(0, wh + 0.9, d * 0.5), Color(0.9, 0.9, 0.88))
			_vis(root, Vector3(1.5, 0.5, 0.15), Vector3(0, wh + 0.9, d * 0.5), Color(0.9, 0.9, 0.88))
		"steeple": # the steeple spike
			_vis(root, Vector3(1.4, 2.2, 1.4), Vector3(0, wh + 1.1, -d * 0.2), col.lightened(0.1))
			_vis(root, Vector3(0.4, 2.4, 0.4), Vector3(0, wh + 2.2 + 1.2, -d * 0.2), col.darkened(0.25))
		"flagpole": # the flagpole
			_vis(root, Vector3(0.16, wh + 3.0, 0.16), Vector3(w * 0.5 + 1.4, (wh + 3.0) * 0.5, d * 0.5 + 1.4), Color(0.5, 0.5, 0.52))
			_vis(root, Vector3(1.4, 0.8, 0.08), Vector3(w * 0.5 + 2.2, wh + 2.4, d * 0.5 + 1.4), Color(0.65, 0.28, 0.2))
		"marquee": # the MARQUEE board on posts
			_vis(root, Vector3(w * 0.55, 1.4, 0.3), Vector3(0, wh + 1.0, d * 0.5 + 1.6), Color(0.72, 0.62, 0.3))
			for sx in [-w * 0.22, w * 0.22]:
				_vis(root, Vector3(0.2, wh + 0.4, 0.2), Vector3(sx, (wh + 0.4) * 0.5, d * 0.5 + 1.6), col.darkened(0.3))
		"stack": # the STACK + a side hopper
			_vis(root, Vector3(1.0, wh + 3.4, 1.0), Vector3(w * 0.34, (wh + 3.4) * 0.5, -d * 0.25), col.darkened(0.25))
			_vis(root, Vector3(2.2, 1.6, 2.2), Vector3(-w * 0.38, wh * 0.4, -d * 0.2), col.darkened(0.15))
		"boom": # the checkpoint BOOM ARM
			_vis(root, Vector3(0.25, 1.1, 0.25), Vector3(w * 0.5 + 0.8, 0.55, d * 0.5 + 1.2), col.darkened(0.3))
			_vis(root, Vector3(maxf(4.2, w * 0.8), 0.3, 0.3), Vector3(0, 1.05, d * 0.5 + 1.4), Color(0.75, 0.3, 0.22))
		"plinth": # the plinth ring
			for ang in [0.0, PI * 0.5, PI, PI * 1.5]:
				_vis(root, Vector3(0.8, 1.2, 0.8), Vector3(cos(ang) * (w * 0.5 + 1.2), 0.6, sin(ang) * (d * 0.5 + 1.2)), col.lightened(0.12))
		"mast": # the ANTENNA mast + dish block
			_vis(root, Vector3(0.18, wh + 5.0, 0.18), Vector3(0, (wh + 5.0) * 0.5, -d * 0.3), Color(0.55, 0.55, 0.58))
			_vis(root, Vector3(1.1, 1.1, 0.3), Vector3(0.9, wh + 3.4, -d * 0.3), Color(0.62, 0.62, 0.6))
		"hazard": # hazard-stripe panel — keep out
			_vis(root, Vector3(w * 0.5, 0.7, 0.14), Vector3(0, 1.2, d * 0.5 + 0.1), Color(0.72, 0.6, 0.16))
		"berm": # sandbag berm blocks flanking the front
			for sx in [-w * 0.42, w * 0.42]:
				_vis(root, Vector3(2.2, 0.9, 1.4), Vector3(sx, 0.45, d * 0.5 + 1.0), Color(0.5, 0.46, 0.34))
		"silo": # the SILO cylinder-read (a tall box at this poly count)
			_vis(root, Vector3(2.0, wh + 2.6, 2.0), Vector3(w * 0.5 + 1.6, (wh + 2.6) * 0.5, -d * 0.2), col.lightened(0.18))


static func _vis(root: Node3D, size: Vector3, pos: Vector3, col: Color) -> void:
	var mesh := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mesh.mesh = bm
	mesh.material_override = ProtoWorldBuilder.material(col, 0.9)
	mesh.position = pos
	mesh.set_meta("silhouette", true) # sims count the read-features
	root.add_child(mesh)


## Returns the wall's MeshInstance3D so the interior skin can fade fronts.
static func _wall(root: Node3D, pos: Vector3, size: Vector3, col: Color) -> MeshInstance3D:
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
	return mesh
