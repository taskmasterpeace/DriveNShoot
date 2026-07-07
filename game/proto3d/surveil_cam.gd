## SURVEILLANCE CAMERA (gadgets goal): a deployable eye. Plant it facing where you stand
## (a doorway, a road, your stash) and it feeds THE SECOND WINDOW — the V-cycle PiP slot
## the dog cam used to own (SecondaryView CAMS mode). Pick it back up with E. Salvaged
## FEDNET hardware, like everything else that still blinks in the Divided States.
class_name ProtoSurveilCam
extends Node3D

var facing: Vector3 = Vector3.FORWARD  ## locked at placement — where the lens looks
var _eye_mat: StandardMaterial3D
var _blink_t: float = 0.0


static func create(main: Node, at: Vector3, face_dir: Vector3) -> ProtoSurveilCam:
	var c := ProtoSurveilCam.new()
	c.add_to_group("interactable")
	c.add_to_group("surveil_cam")
	c.facing = Vector3(face_dir.x, 0.0, face_dir.z).normalized() if face_dir.length() > 0.01 else Vector3.FORWARD

	# The pole.
	var pole := MeshInstance3D.new()
	var pm := BoxMesh.new()
	pm.size = Vector3(0.08, 1.6, 0.08)
	pole.mesh = pm
	pole.material_override = ProtoWorldBuilder.material(Color(0.25, 0.26, 0.27), 0.6)
	pole.position.y = 0.8
	c.add_child(pole)
	# The camera head, cocked along the facing.
	var head := MeshInstance3D.new()
	var hm := BoxMesh.new()
	hm.size = Vector3(0.18, 0.14, 0.3)
	head.mesh = hm
	head.material_override = ProtoWorldBuilder.material(Color(0.32, 0.33, 0.34), 0.4)
	head.position = Vector3(0, 1.62, 0) + c.facing * 0.1
	c.add_child(head)
	# The RECORDING eye — blinks.
	var eye := MeshInstance3D.new()
	var em := BoxMesh.new()
	em.size = Vector3(0.05, 0.05, 0.05)
	eye.mesh = em
	c._eye_mat = StandardMaterial3D.new()
	c._eye_mat.albedo_color = Color(0.9, 0.2, 0.15)
	c._eye_mat.emission_enabled = true
	c._eye_mat.emission = Color(0.9, 0.2, 0.15)
	eye.material_override = c._eye_mat
	eye.position = head.position + c.facing * 0.18
	c.add_child(eye)

	c.position = at
	if "surveil_cams" in main:
		main.surveil_cams.append(c)
	return c


## Where the FEED's eye sits and looks (SecondaryView reads these).
func cam_position() -> Vector3:
	return global_position + Vector3(0, 1.62, 0)


func cam_target() -> Vector3:
	return cam_position() + facing * 12.0 + Vector3(0, -0.8, 0)


func _physics_process(delta: float) -> void:
	_blink_t += delta
	if _eye_mat != null:
		_eye_mat.emission_energy_multiplier = 2.2 if fmod(_blink_t, 1.2) < 0.9 else 0.2


func interact_position() -> Vector3:
	return global_position


func interact_prompt(_main: Node) -> String:
	return "E — pack up the CAMERA (feed: V)"


func interact(main: Node) -> void:
	if "surveil_cams" in main:
		main.surveil_cams.erase(self)
	if "backpack" in main and main.backpack != null:
		main.backpack.add("surveil_cam", 1)
	if main.has_method("notify"):
		main.notify("📹 Camera packed up")
	queue_free()
