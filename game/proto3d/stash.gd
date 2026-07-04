## Lootable stash — glows until taken. Can carry a key (and later, inventory items).
class_name ProtoStash
extends Node3D

var taken: bool = false
var display_name: String = "stash"
var gives_key_id: String = ""
var gives_key_display: String = ""


static func create(name_text: String, key_id: String = "", key_display: String = "") -> ProtoStash:
	var s := ProtoStash.new()
	s.display_name = name_text
	s.gives_key_id = key_id
	s.gives_key_display = key_display
	s.add_to_group("interactable")
	var mesh := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.9, 0.6, 0.6)
	mesh.mesh = bm
	mesh.material_override = ProtoWorldBuilder.material(Color(0.95, 0.72, 0.15), 0.4, true)
	mesh.position.y = 0.3
	s.add_child(mesh)
	return s


func interact_position() -> Vector3:
	return global_position


func interact_prompt(_main: Node) -> String:
	if taken:
		return ""
	return "E — Search %s" % display_name


func interact(main: Node) -> void:
	if taken:
		return
	taken = true
	if gives_key_id != "":
		main.give_key(gives_key_id, gives_key_display)
	else:
		main.notify("Searched the %s" % display_name)
	visible = false
