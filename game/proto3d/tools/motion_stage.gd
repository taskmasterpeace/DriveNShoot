## THE MOTION STAGE (MOVESET.txt SPEC B): the treadmill. Loads JUST the rigs —
## no world, no driving around to find an animal. Both rigs stride in place;
## tweak rows in MotionForge (:8896) → press R → watch the change land live.
## Keys: 1/2/3 speed · C crouch · A airborne pose · D dig pose · R re-fold rows.
## Run: godot --path game res://proto3d/tools/motion_stage.tscn
extends Node3D

var puppet: ProtoPuppet
var quad: ProtoQuadruped
var speed: float = 3.0
var crouched: bool = false
var air: bool = false
var dig: bool = false


func _ready() -> void:
	# Floor, light, camera — a stage, not a world.
	var floor_body := StaticBody3D.new()
	var fm := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(12, 12)
	fm.mesh = plane
	fm.material_override = ProtoWorldBuilder.material(Color(0.16, 0.14, 0.11), 1.0)
	floor_body.add_child(fm)
	add_child(floor_body)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55, 30, 0)
	add_child(sun)
	var cam := Camera3D.new()
	cam.position = Vector3(0, 2.6, 4.4)
	cam.rotation_degrees.x = -24
	add_child(cam)

	puppet = ProtoPuppet.create({})
	add_child(puppet)
	puppet.position = Vector3(-1.2, 0, 0)
	quad = ProtoQuadruped.create({})
	add_child(quad)
	quad.position = Vector3(1.2, 0, 0)

	for pair in [[-1.2, "PUPPET"], [1.2, "QUADRUPED"]]:
		var l := Label3D.new()
		l.text = pair[1]
		l.font_size = 40
		l.position = Vector3(pair[0], 2.4, 0)
		l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		add_child(l)
	print("MOTION STAGE — 1/2/3 speed · C crouch · A air · D dig · R re-fold motions.json")


func _process(delta: float) -> void:
	puppet.crouch_target = 1.0 if crouched else 0.0
	puppet.animate(delta, speed, 0.0, false, 0.0, false)
	quad.air_target = 1.0 if air else 0.0
	quad.dig_target = 1.0 if dig else 0.0
	quad.animate(delta, 0.0 if dig else speed, 0.85)


func _input(event: InputEvent) -> void:
	if not (event is InputEventKey and event.pressed and not event.echo):
		return
	match (event as InputEventKey).keycode:
		KEY_1: speed = 1.2
		KEY_2: speed = 3.0
		KEY_3: speed = 6.5
		KEY_C: crouched = not crouched
		KEY_A: air = not air
		KEY_D: dig = not dig
		KEY_R:
			ProtoPuppet._motion_folded = false
			ProtoPuppet.ensure_motions()
			ProtoQuadruped._motion_folded = false
			ProtoQuadruped.ensure_motions()
			print("MOTION STAGE — rows re-folded from data/motions.json")
