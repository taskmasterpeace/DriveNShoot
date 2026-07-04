## Swinging door with optional lock. Interactable: walk up → prompt chip → E to
## open/close. Locked doors need their key_id in the player's key ring.
class_name ProtoDoor
extends Node3D

var is_open: bool = false
var locked: bool = false
var key_id: String = ""
var key_display: String = "key"
var door_width: float = 1.8
var door_height: float = 2.6

var _panel: StaticBody3D
var _tween: Tween


## Builds the panel hinged at this node's origin, swinging around local Y.
## Place the node at the hinge-side edge of the doorway, facing along local X.
static func create(width: float, height: float, color: Color) -> ProtoDoor:
	var door := ProtoDoor.new()
	door.door_width = width
	door.door_height = height
	door.add_to_group("interactable")
	door._panel = StaticBody3D.new()
	var mesh := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(width, height, 0.12)
	mesh.mesh = bm
	mesh.material_override = ProtoWorldBuilder.material(color, 0.8)
	mesh.position = Vector3(width / 2.0, height / 2.0, 0)
	door._panel.add_child(mesh)
	var shape := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(width, height, 0.12)
	shape.shape = bs
	shape.position = Vector3(width / 2.0, height / 2.0, 0)
	door._panel.add_child(shape)
	# Handle hint
	var handle := MeshInstance3D.new()
	var hm := BoxMesh.new()
	hm.size = Vector3(0.12, 0.12, 0.2)
	handle.mesh = hm
	handle.material_override = ProtoWorldBuilder.material(Color(0.75, 0.65, 0.3), 0.4)
	handle.position = Vector3(width - 0.18, height * 0.45, 0)
	door._panel.add_child(handle)
	door.add_child(door._panel)
	return door


## Interaction point for range checks (middle of the doorway, not the hinge).
func interact_position() -> Vector3:
	return global_position + global_basis.x * (door_width / 2.0)


func interact_prompt(main: Node) -> String:
	if locked and not main.has_key(key_id):
		return "LOCKED — need %s" % key_display
	if locked:
		return "E — Unlock (%s)" % key_display
	return "E — Close door" if is_open else "E — Open door"


func interact(main: Node) -> void:
	if locked:
		if main.has_key(key_id):
			locked = false
			main.notify("Unlocked with %s" % key_display)
		return
	is_open = not is_open
	if _tween and _tween.is_valid():
		_tween.kill()
	_tween = create_tween()
	_tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	_tween.tween_property(_panel, "rotation:y", -1.9 if is_open else 0.0, 0.35)
