## THE FURNISHER (LOOT_NPC_PRODUCTION_WANTED_SPAWN.md §14 Phase 1): a furniture_defs.json
## row made real — a box-mesh StaticBody3D in the "interactable" group holding its own
## internal ProtoContainer. Loot is NOT rolled at spawn: it resolves ONCE, lazily, on the
## first real interact() via ProtoLootResolver (furniture table -> building weight_mult ->
## law override), using a SEEDED rng so two furnish passes with the same uid roll IDENTICAL
## contents. A second open reads the SAME container (possibly emptied by the player) — v1
## doesn't persist contents across save/load (recon note: accepted for this slice).
##
## NOT a ProtoChest subclass on purpose: ProtoChest is special-cased by proto3d.gd's input
## handler for GRAB & DRAG (tap-vs-hold on E). Furniture is fixed set dressing — it should
## never be draggable — so it composes an internal ProtoContainer instead of extending
## ProtoChest, keeping the drag branch (`_current_interactable is ProtoChest`) untouched.
class_name ProtoFurniture
extends StaticBody3D

var furniture_id: String = ""
var container: ProtoContainer = ProtoContainer.new("Furniture")
var building_type: String = "" ## building_types.json id this piece was furnished into ("" = no modifier)

var _uid: String = "" ## stable seed key: "<furniture_id>:<building_id>:<index>"
var _rolled: bool = false ## loot resolves once, lazily, on first interact()
var _lock_message: String = "" ## cached "locked — need Scavenging N" (empty = open)


## Builds a ProtoFurniture from its furniture_defs.json row. `uid` seeds the lazy
## loot roll deterministically (recon idiom: hash("%s:furn_%d" % [building_id, i])
## — callers pass the FULL stable string here, this class only hashes it once).
## `building_type_in` feeds ProtoLootResolver's building weight_mult layer ("" = none).
static func create(furniture_id_in: String, uid: String, building_type_in: String = "") -> ProtoFurniture:
	var row := ProtoLootResolver.furniture_row(furniture_id_in)
	var f := ProtoFurniture.new()
	f.furniture_id = furniture_id_in
	f._uid = uid
	f.building_type = building_type_in
	f.add_to_group("interactable")
	f.container.label = String(row.get("name", furniture_id_in))

	var box_row: Dictionary = row.get("box", {})
	var size_arr: Array = box_row.get("size", [0.8, 0.8, 0.8])
	var size := Vector3(float(size_arr[0]), float(size_arr[1]), float(size_arr[2]))
	var color := Color(String(box_row.get("color", "#808080")))

	var mesh := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mesh.mesh = bm
	mesh.material_override = ProtoWorldBuilder.material(color, 0.85)
	mesh.position.y = size.y / 2.0
	f.add_child(mesh)

	var shape := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = size
	shape.shape = bs
	shape.position.y = size.y / 2.0
	f.add_child(shape)

	return f


func interact_position() -> Vector3:
	return global_position


func interact_prompt(main: Node) -> String:
	_lock_message = ProtoLootResolver.lock_reason(furniture_id, main)
	if _lock_message != "":
		return _lock_message
	return "E — Open %s" % container.label.to_lower()


func interact(main: Node) -> void:
	if ProtoLootResolver.lock_reason(furniture_id, main) != "":
		return # locked prompt already told the player why; refuse the open
	_ensure_rolled(main)
	main.open_container(container)


## Lazy roll: the FIRST interact (of any kind — a locked check never rolls) resolves
## the container's contents via the layered resolver, seeded off this piece's stable
## uid so re-furnishing the same building with the same seed is bit-identical. Every
## call after the first is a no-op — the same (possibly player-emptied) Dictionary.
func _ensure_rolled(main: Node) -> void:
	if _rolled:
		return
	_rolled = true
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(_uid)
	var state_id := _state_id_at(main)
	var loot: Dictionary = ProtoLootResolver.resolve(furniture_id, building_type, state_id, main, rng)
	for item_id in loot:
		container.add(String(item_id), int(loot[item_id]))


## Reads the DIVIDED STATES state id under this furniture (feeds the resolver's law
## layer). No live world map -> "" (resolver treats that as "no law layer").
func _state_id_at(main: Node) -> String:
	if main == null or not ("stream" in main) or main.stream == null:
		return ""
	var s: ProtoWorldStream = main.stream
	if s.usmap == null or not s.usmap.ok:
		return ""
	return s.usmap.state_at(global_position)
