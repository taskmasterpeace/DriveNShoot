## RACING DESTRUCTION SET (P2): THE TOYBOX. One class wears every track-piece
## row (data/track_pieces.json) — ramps, a banked curve, plain obstacles, and
## DESTRUCTIBLE clutter (barrels/crates) that breaks on a hard vehicle impact,
## scatters a little scrap, and never blocks the road once it's gone. Placed
## by MapForge same as any other structure, via the existing placements layer
## under the "track:<id>" namespace (world_stream._spawn_placement dispatches
## here — zero new plumbing on the authoring side).
##
## Ramps/banks/plain obstacles build as a bare Node3D wrapping StaticBody3D
## pieces (nothing to damage, nothing to signal). A destructible row builds a
## ProtoTrackPiece instance instead — it carries the ONE damage class
## (Damageable), detects a hard hit via a monitoring Area3D (duck-typed off
## whatever body enters — no car_3d.gd change needed: any RigidBody3D/
## VehicleBody3D exposing linear_velocity works), and answers the same
## `take_damage(amount)` interface every other damageable actor in this
## codebase already understands (weapons, roadkill, explosions could all
## reach it later without new code).
class_name ProtoTrackPiece
extends Node3D

signal broken(piece: Node3D)

static var ROWS: Dictionary = {}
static var _rows_folded: bool = false

var row: Dictionary = {}
var body: Damageable = null
var broken_flag: bool = false
var _solid: StaticBody3D = null
var _area: Area3D = null
var _hit_cd: float = 0.0


static func ensure_rows() -> void:
	if _rows_folded:
		return
	_rows_folded = true
	if not FileAccess.file_exists("res://data/track_pieces.json"):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/track_pieces.json"))
	if not (parsed is Dictionary):
		return
	for r in ((parsed as Dictionary).get("track_pieces", []) as Array):
		if r is Dictionary and (r as Dictionary).has("id"):
			ROWS[String((r as Dictionary)["id"])] = r


static func catalog_ids() -> Array:
	ensure_rows()
	return ROWS.keys()


static func has_id(id: String) -> bool:
	ensure_rows()
	return ROWS.has(id)


## The ONE factory MapForge placements and any future spawner call. Returns
## null for an unknown id (the caller push_warns and skips — the same
## defensive law world_stream already applies to every placement row).
static func create(id: String) -> Node3D:
	ensure_rows()
	if not ROWS.has(id):
		return null
	var row: Dictionary = ROWS[id]
	if bool(row.get("destructible", false)):
		return _build_destructible(row)
	match String(row.get("kind", "obstacle")):
		"ramp":
			return _build_ramp(row)
		"bank":
			return _build_bank(row)
		_:
			return _build_obstacle(row)


static func _vec3(a: Array, fallback: Vector3) -> Vector3:
	if a.size() < 3:
		return fallback
	return Vector3(float(a[0]), float(a[1]), float(a[2]))


static func _col(a: Array, fallback: Color) -> Color:
	if a.size() < 3:
		return fallback
	return Color(float(a[0]), float(a[1]), float(a[2]))


## A single sloped launch surface (or the paired launch+landing halves of a
## jump_gap) — a rotated solid box, same tilt law world_stream's elevated
## road decks use (rot_x = the row's own lip_angle_deg, local +Z end rises).
static func _build_ramp(row: Dictionary) -> Node3D:
	var root := Node3D.new()
	root.name = "TrackPiece_%s" % String(row.get("id", ""))
	root.add_to_group("track_piece")
	var size := _vec3(row.get("size", []), Vector3(4.0, 1.2, 6.0))
	var col := _col(row.get("color", []), Color(0.32, 0.31, 0.29))
	var pitch := deg_to_rad(float(row.get("lip_angle_deg", 20.0)))
	if String(row.get("id", "")) == "jump_gap" or row.has("gap_m"):
		var gap := float(row.get("gap_m", 10.0))
		# NOTE the sign (matches world_stream's elevated-deck law, verified
		# against a driven car): rotation.x = -pitch puts local -Z (the
		# approach side) LOW and local +Z HIGH — a launch ramp rises toward
		# the gap; a landing ramp is the mirror (rises out of the gap, settles
		# back to ground on the far side).
		var launch := ProtoWorldBuilder.box_body(root, size,
			Vector3(0, size.y * 0.5, -(size.z * 0.5 + gap * 0.5)), col, 0.0, -pitch)
		launch.set_meta("track_ramp", String(row.get("id", "")))
		var landing := ProtoWorldBuilder.box_body(root, size,
			Vector3(0, size.y * 0.5, size.z * 0.5 + gap * 0.5), col, 0.0, pitch)
		landing.set_meta("track_ramp", String(row.get("id", "")))
		return root
	# rotation.x = -pitch: local -Z (the approach) stays low, local +Z (the
	# launch direction) rises — see the sign note above.
	var ramp := ProtoWorldBuilder.box_body(root, size, Vector3(0, size.y * 0.5, 0), col, 0.0, -pitch)
	ramp.set_meta("track_ramp", String(row.get("id", "")))
	return root


## A cross-sloped (rolled) surface for a banked curve — rotation.z is the
## row's bank_deg, tilting the local X axis (the road's WIDTH) instead of the
## length axis a ramp uses.
static func _build_bank(row: Dictionary) -> Node3D:
	var root := Node3D.new()
	root.name = "TrackPiece_%s" % String(row.get("id", ""))
	root.add_to_group("track_piece")
	var size := _vec3(row.get("size", []), Vector3(11.0, 2.2, 11.0))
	var col := _col(row.get("color", []), Color(0.33, 0.32, 0.30))
	var roll := deg_to_rad(float(row.get("bank_deg", 25.0)))
	var slab := ProtoWorldBuilder.box_body(root, size, Vector3(0, size.y * 0.5, 0), col)
	slab.rotation.z = roll
	slab.set_meta("track_bank", String(row.get("id", "")))
	return root


## A plain, indestructible solid (concrete barrier, etc.) — a box, no drama.
static func _build_obstacle(row: Dictionary) -> Node3D:
	var root := Node3D.new()
	root.name = "TrackPiece_%s" % String(row.get("id", ""))
	root.add_to_group("track_piece")
	var size := _vec3(row.get("size", []), Vector3(3.0, 1.0, 1.0))
	var col := _col(row.get("color", []), Color(0.55, 0.54, 0.50))
	var obstacle := ProtoWorldBuilder.box_body(root, size, Vector3(0, size.y * 0.5, 0), col)
	obstacle.set_meta("track_obstacle", String(row.get("id", "")))
	return root


## Destructible clutter — the solid body a car actually hits, a monitoring
## Area3D that reads any overlapping body's own linear_velocity (duck-typed:
## no car_3d.gd change), and the Damageable that decides when it breaks.
static func _build_destructible(row: Dictionary) -> ProtoTrackPiece:
	var p := ProtoTrackPiece.new()
	p.row = row
	p.name = "TrackPiece_%s" % String(row.get("id", ""))
	p.add_to_group("track_piece")
	p.add_to_group("destructible")
	var size := _vec3(row.get("size", []), Vector3(1.8, 1.6, 1.8))
	var col := _col(row.get("color", []), Color(0.5, 0.4, 0.3))
	p.body = Damageable.new(String(row.get("id", "piece")), "📦", float(row.get("hp", 40.0)))
	p._solid = ProtoWorldBuilder.box_body(p, size, Vector3(0, size.y * 0.5, 0), col)
	p._solid.set_meta("track_obstacle", String(row.get("id", "")))
	var area := Area3D.new()
	var ashape := CollisionShape3D.new()
	var abox := BoxShape3D.new()
	abox.size = size * 1.15
	ashape.shape = abox
	ashape.position.y = size.y * 0.5
	area.add_child(ashape)
	p.add_child(area)
	p._area = area
	area.body_entered.connect(p._on_body_entered)
	return p


func _physics_process(delta: float) -> void:
	_hit_cd = maxf(0.0, _hit_cd - delta)


## Any physics body (car, dropped prop, whatever) that overlaps hard enough
## takes a hit scaled by how far it beat the row's break_speed_mps — the same
## speed-scaled-damage shape car_3d.gd's own _roadkill uses, just read off the
## OTHER body's velocity since this class can't reach into car_3d.gd.
func _on_body_entered(b: Node) -> void:
	if broken_flag or _hit_cd > 0.0 or body == null:
		return
	if not ("linear_velocity" in b):
		return
	var speed: float = (b.get("linear_velocity") as Vector3).length()
	var break_speed := float(row.get("break_speed_mps", 4.0))
	if speed < break_speed:
		return
	_hit_cd = 0.5
	take_damage((speed - break_speed) * float(row.get("dmg_per_mps", 10.0)))


## The public interface (matches every other damageable actor in this
## codebase): a weapon, an explosion, or roadkill's own speed-scaled formula
## can all call this directly without knowing this is a track piece.
func take_damage(amount: float) -> void:
	if broken_flag or body == null:
		return
	body.damage(amount)
	if body.hp <= 0.0:
		_break()


func _break() -> void:
	if broken_flag:
		return
	broken_flag = true
	if _solid != null and is_instance_valid(_solid):
		_solid.queue_free()
		_solid = null
	if _area != null and is_instance_valid(_area):
		_area.queue_free()
		_area = null
	var size := _vec3(row.get("size", []), Vector3(1.5, 1.5, 1.5))
	var mat := ProtoWorldBuilder.material(_col(row.get("color", []), Color(0.5, 0.4, 0.3)) * 0.85, 0.9)
	for i in 4:
		var frag := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = size * 0.35
		frag.mesh = bm
		frag.material_override = mat
		frag.position = Vector3(randf_range(-size.x * 0.3, size.x * 0.3), size.y * 0.25,
			randf_range(-size.z * 0.3, size.z * 0.3))
		add_child(frag)
		var tw := create_tween()
		tw.tween_property(frag, "position:y", frag.position.y - 0.9, 1.1)
		tw.parallel().tween_property(frag, "rotation:x", randf_range(1.0, 3.0), 1.1)
		tw.chain().tween_property(frag, "modulate:a", 0.0, 0.3)
		tw.tween_callback(frag.queue_free)
	var lo := mini(int(row.get("scrap_min", 1)), int(row.get("scrap_max", 3)))
	var hi := maxi(int(row.get("scrap_min", 1)), int(row.get("scrap_max", 3)))
	var n := randi_range(lo, hi)
	if n > 0:
		# solid=false (ProtoChest's own law): a scrap pile never dents a car —
		# the wreckage that just broke shouldn't leave a second invisible wall.
		var chest := ProtoChest.create("Wreckage", {"scrap": n}, false)
		var parent := get_parent()
		if parent != null:
			parent.add_child(chest)
			chest.global_position = global_position + Vector3(0, 0.1, 0)
	broken.emit(self)
