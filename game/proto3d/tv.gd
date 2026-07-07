## THE SAFEHOUSE TV (docs/cinema.md Phase 2): a set in the corner of home. E
## opens the media panel — the creator's films, shows, trailers, and clips,
## watched from the wasteland. The set is a REAL SCREEN (owner, 2026-07-07):
## close the fullscreen panel and the picture keeps playing ON THE TELEVISION
## ITSELF — do your chores with the game on, walk back up and E it fullscreen.
class_name ProtoTV
extends StaticBody3D

var screen: MeshInstance3D = null
var _off_material: Material = null
var _live_material: StandardMaterial3D = null


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
	tv.screen = MeshInstance3D.new()
	var sm := BoxMesh.new()
	sm.size = Vector3(1.3, 0.8, 0.03)
	tv.screen.mesh = sm
	tv.screen.material_override = ProtoWorldBuilder.material(Color(0.35, 0.28, 0.12), 0.4, true)
	tv._off_material = tv.screen.material_override
	tv.screen.position = Vector3(0, 0.9, -0.12)
	tv.add_child(tv.screen)
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


## The picture lands ON the set (the drive-in's unshaded-quad law, on the box):
## media_panel hands over the live video texture when the fullscreen panel
## closes mid-reel; power-off restores the warm amber idle glow.
func set_live(tex: Texture2D) -> void:
	if screen == null:
		return
	if _live_material == null:
		_live_material = StandardMaterial3D.new()
		_live_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_live_material.albedo_texture = tex
	_live_material.albedo_color = Color(1, 1, 1)
	screen.material_override = _live_material


func is_live() -> bool:
	return screen != null and screen.material_override == _live_material and _live_material != null


func set_off() -> void:
	if screen != null and _off_material != null:
		screen.material_override = _off_material


func interact_position() -> Vector3:
	return global_position


func interact_prompt(main: Node) -> String:
	if is_live():
		return "E — 📺 Watch FULLSCREEN (playing on the set)"
	var n: int = 0
	if "media_registry" in main and main.media_registry != null:
		n = main.media_registry.rows.size()
	return "E — 📺 Watch the TV (%d in the catalog)" % n


func interact(main: Node) -> void:
	if main.has_method("open_media_panel"):
		main.open_media_panel()
