## SAFEHOUSE CARTRIDGE SHELF: an ownership display and library door. It never
## grants media; every enabled button still queries the one save-backed ledger.
extends StaticBody3D

const WOOD := Color("4f3823")
const AMBER := Color("f2b735")
const BONE := Color("e8dfcf")

var main: Node = null
var deck: Node = null
var shell: CanvasLayer = null
var _label: Label3D = null


static func create(new_main: Node, new_deck: Node, new_shell: CanvasLayer) -> Node3D:
	var script := load("res://proto3d/games/game_shelf.gd") as GDScript
	var shelf: Node3D = script.new()
	shelf.main = new_main
	shelf.deck = new_deck
	shelf.shell = new_shell
	shelf.name = "GameCartridgeShelf"
	shelf.add_to_group("interactable")
	shelf.add_to_group("game_shelf")
	shelf._build()
	return shelf


func _build() -> void:
	_add_box("Back", Vector3(1.65, 1.7, 0.16), Vector3(0, 0.9, 0), WOOD.darkened(0.18))
	for y in [0.22, 0.62, 1.02, 1.42]:
		_add_box("Shelf", Vector3(1.72, 0.1, 0.42), Vector3(0, y, -0.08), WOOD)
	for index in 12:
		var color := AMBER if index % 3 != 2 else Color("b84a3b")
		_add_box("Media%02d" % index, Vector3(0.09, 0.27, 0.2),
			Vector3(-0.68 + float(index % 4) * 0.43, 0.42 + float(index / 4) * 0.4, -0.25), color)
	_label = Label3D.new()
	_label.font_size = 42
	_label.pixel_size = 0.004
	_label.modulate = BONE
	_label.outline_modulate = Color("11100d")
	_label.outline_size = 8
	_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_label.position = Vector3(0, 2.15, -0.35)
	add_child(_label)
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(1.8, 1.9, 0.5)
	shape.shape = box
	shape.position = Vector3(0, 0.95, -0.08)
	add_child(shape)
	_refresh_label()


func _add_box(label: String, size: Vector3, at: Vector3, color: Color) -> void:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = label
	var box := BoxMesh.new()
	box.size = size
	mesh_instance.mesh = box
	mesh_instance.position = at
	mesh_instance.material_override = ProtoWorldBuilder.material(color, 0.75)
	add_child(mesh_instance)


func _refresh_label() -> void:
	if _label != null:
		_label.text = "GAME DECK\n%d / 20" % int(deck.ledger.installed_count(1))


func interact_position() -> Vector3:
	return global_position - global_basis.z * 0.8


func interact_prompt(_main: Node) -> String:
	_refresh_label()
	return "E — GAME CARTRIDGE SHELF  %d / 20 INSTALLED" % int(deck.ledger.installed_count(1))


func interact(_main: Node) -> void:
	_refresh_label()
	# The shelf sits beside the TV/console and mounts only the console library.
	# Pocket firmware remains available from the carried handheld.
	shell.open_library("console", {"source": "shelf", "device": "console", "auto_start": true})
