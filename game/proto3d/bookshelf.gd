## THE BOOKSHELF (ship-guide goal): the safehouse's library furniture — E opens the whole
## in-game manual set (ProtoBookPanel). A pixel-skinned wooden case with amber spines.
class_name ProtoBookshelf
extends Node3D

static func create(main: Node) -> ProtoBookshelf:
	var s := ProtoBookshelf.new()
	s.add_to_group("interactable")
	var case := MeshInstance3D.new()
	var cm := BoxMesh.new()
	cm.size = Vector3(1.2, 1.8, 0.4)
	case.mesh = cm
	case.material_override = ProtoWorldBuilder.material_skin("wood", 1.0, Color(0.45, 0.34, 0.2))
	case.position.y = 0.9
	s.add_child(case)
	# A few book spines so it reads as a library at a glance.
	for i in 3:
		var spine := MeshInstance3D.new()
		var sm := BoxMesh.new()
		sm.size = Vector3(0.9, 0.28, 0.06)
		spine.mesh = sm
		spine.material_override = ProtoWorldBuilder.material(
			[Color(0.96, 0.72, 0.2), Color(0.92, 0.89, 0.82), Color(0.6, 0.3, 0.18)][i], 0.7)
		spine.position = Vector3(0, 0.5 + i * 0.45, 0.2)
		s.add_child(spine)
	var _main := main # kept for symmetry; interact receives main fresh
	return s


func interact_position() -> Vector3:
	return global_position


func interact_prompt(_main: Node) -> String:
	return "E — 📚 read the MANUALS"


func interact(main: Node) -> void:
	if "book_panel" in main and main.book_panel != null:
		main.book_panel.open_shelf()
