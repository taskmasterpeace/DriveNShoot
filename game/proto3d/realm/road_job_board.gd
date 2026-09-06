class_name ProtoRoadJobBoard
extends Node3D
var road_life: Node
var job_id: String = ""

func setup(owner: Node, id: String = "") -> void:
	road_life = owner
	job_id = id
	add_to_group("interactable")
	var model: Node3D = ProtoPropertySite.load_model("res://assets/models/homestead/freight_kiosk.glb", Vector3(3,2,0.4), Color("537873"))
	add_child(model)
	var label: Label3D = Label3D.new()
	label.text = "ROAD OFFICE\nJOBS → HOME" if id == "" else "FREIGHT RECEIVER\n" + id.replace("_", " ").to_upper()
	label.position.y = 3.5
	label.font_size = 48
	label.pixel_size = 0.009
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	add_child(label)
	if id != "":
		var crate: Node3D = ProtoPropertySite.load_model("res://assets/models/homestead/delivery_crate.glb", Vector3.ONE, Color("927142"))
		crate.position.x = 2.2
		add_child(crate)

func interact_position() -> Vector3:
	return global_position + Vector3(0,0.8,1.2)

func interact_prompt(_main: Node) -> String:
	return "E / Y — ROAD OFFICE · freight & deeds" if job_id == "" else "E / Y — deliver " + job_id.replace("_", " ")

func interact(_main: Node) -> void:
	road_life.panel.open_board(self)
