## THE SAFEHOUSE TV (docs/cinema.md Phase 2): a set in the corner of home. E
## opens the media panel — the creator's films, shows, trailers, and clips,
## watched from the wasteland. Downtime IS gameplay (time passes while you watch).
class_name ProtoTV
extends StaticBody3D


static func create() -> ProtoTV:
	var tv := ProtoTV.new()
	tv.add_to_group("interactable")
	# The cabinet — a dark box on short legs, screen angled at the room.
	var body := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(1.5, 1.0, 0.22)
	body.mesh = bm
	body.material_override = ProtoWorldBuilder.material(Color(0.12, 0.11, 0.10), 0.85)
	body.position.y = 0.9
	tv.add_child(body)
	# The screen — off-glow amber, the one warm light in the safehouse.
	var screen := MeshInstance3D.new()
	var sm := BoxMesh.new()
	sm.size = Vector3(1.3, 0.8, 0.03)
	screen.mesh = sm
	screen.material_override = ProtoWorldBuilder.material(Color(0.35, 0.28, 0.12), 0.4, true)
	screen.position = Vector3(0, 0.9, -0.12)
	tv.add_child(screen)
	# The stand.
	var stand := MeshInstance3D.new()
	var stm := BoxMesh.new()
	stm.size = Vector3(1.0, 0.4, 0.5)
	stand.mesh = stm
	stand.material_override = ProtoWorldBuilder.material(Color(0.3, 0.22, 0.12), 0.9)
	stand.position.y = 0.2
	tv.add_child(stand)
	var shape := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(1.5, 1.5, 0.6)
	shape.shape = bs
	shape.position.y = 0.75
	tv.add_child(shape)
	return tv


func interact_position() -> Vector3:
	return global_position


func interact_prompt(main: Node) -> String:
	var n: int = 0
	if "media_registry" in main and main.media_registry != null:
		n = main.media_registry.rows.size()
	return "E — 📺 Watch the TV (%d in the catalog)" % n


func interact(main: Node) -> void:
	if main.has_method("open_media_panel"):
		main.open_media_panel()
