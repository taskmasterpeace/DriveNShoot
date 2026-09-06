class_name ProtoRoadsteadYard
extends Node3D
## Authored real-world dressing: rows own placements, not transaction authority.
const ROWS := "res://data/roadstead_yard.json"
const SURFACE_KEY := "roadstead_yard"
var _life: Node
var _canopies: Array[Dictionary] = []
var _lights: Array[Dictionary] = []

func setup(life: Node) -> void:
	_life = life
	name = "RoadsteadYard"
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(ROWS))
	var road_rects: Array = []
	for row: Dictionary in data.surfaces:
		_surface(row)
		if bool(row.get("gravel", false)):
			var a := Vector2(float(row.a[0]),float(row.a[1]))
			var b := Vector2(float(row.b[0]),float(row.b[1]))
			var mid := (a+b)*0.5
			var delta := b-a
			road_rects.append([mid.x,mid.y,float(row.width)*0.5,delta.length()*0.5,atan2(delta.x,delta.y),"gravel"])
	ProtoWorldBuilder.extra_road_rects[SURFACE_KEY] = road_rects
	for row: Dictionary in data.props:
		_prop(row)

func _exit_tree() -> void:
	ProtoWorldBuilder.extra_road_rects.erase(SURFACE_KEY)

func _surface(row: Dictionary) -> void:
	var a := Vector2(float(row.a[0]),float(row.a[1]))
	var b := Vector2(float(row.b[0]),float(row.b[1]))
	var delta := b-a
	var length_m := delta.length()
	if length_m < 0.01:
		return
	var side := Vector2(-delta.y,delta.x).normalized()*float(row.width)*0.5
	var subdivisions: int = maxi(1,ceili(length_m/2.0))
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var uv := PackedVector2Array()
	var indices := PackedInt32Array()
	var gravel: bool = bool(row.get("gravel",false))
	for step: int in subdivisions+1:
		var along := a.lerp(b,float(step)/subdivisions)
		for direction: float in [-1.0,1.0]:
			var p := along+side*direction
			vertices.append(Vector3(p.x,ProtoWorldBuilder.ground_y(p.x,p.y)+(0.04 if gravel else 0.06),p.y))
			normals.append(Vector3.UP)
			uv.append(p/3.0)
		if step < subdivisions:
			var i := step*2
			indices.append_array(PackedInt32Array([i,i+2,i+1,i+1,i+2,i+3]))
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uv
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	var view := MeshInstance3D.new()
	view.name = String(row.id)
	view.mesh = mesh
	var tint := Color(String(row.color))
	view.material_override = ProtoWorldBuilder.ground_material(tint,1.0) if gravel else ProtoWorldBuilder.material(tint)
	view.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(view)

func _prop(row: Dictionary) -> void:
	var anchor := Node3D.new()
	anchor.name = String(row.id)
	anchor.position = Vector3(float(row.position[0]),0,float(row.position[1]))
	anchor.position.y = ProtoWorldBuilder.ground_y(anchor.position.x,anchor.position.z)
	anchor.rotation.y = deg_to_rad(float(row.get("yaw",0)))
	add_child(anchor)
	var path := "res://assets/models/homestead/%s.glb" % String(row.asset)
	var model := ProtoPropertySite.load_model(path,Vector3.ONE,Color("806a47"))
	anchor.add_child(model)
	for solid: Array in row.get("solids",[]):
		var body := StaticBody3D.new()
		body.position = Vector3(float(solid[0]),float(solid[1]),float(solid[2]))
		var collider := CollisionShape3D.new()
		var shape := BoxShape3D.new()
		shape.size = Vector3(float(solid[3]),float(solid[4]),float(solid[5]))
		collider.shape = shape
		body.add_child(collider)
		anchor.add_child(body)
	var radius: float = float(row.get("cutaway_radius",0))
	if radius > 0:
		for node: Node in model.find_children("Roof*","MeshInstance3D",true,false):
			_canopies.append({"roof":node,"anchor":anchor,"radius":radius})
	var light_row: Dictionary = row.get("light",{})
	if not light_row.is_empty():
		var lamp := OmniLight3D.new()
		lamp.position = Vector3(float(light_row.position[0]),float(light_row.position[1]),float(light_row.position[2]))
		lamp.light_color = Color(String(light_row.color))
		lamp.omni_range = float(light_row.range)
		lamp.omni_attenuation = 1.4
		lamp.shadow_enabled = true
		anchor.add_child(lamp)
		_lights.append({"node":lamp,"day":float(light_row.day_energy),"night":float(light_row.night_energy)})

func _physics_process(_delta: float) -> void:
	if _life == null or _life.main == null:
		return
	var player: Vector3 = _life.main.player.global_position
	for entry: Dictionary in _canopies:
		var anchor: Node3D = entry.anchor
		var roof: Node3D = entry.roof
		roof.visible = Vector2(player.x,player.z).distance_to(Vector2(anchor.global_position.x,anchor.global_position.z)) > float(entry.radius)
	var darkness: float = _life.main.daynight.visual_darkness()
	for entry: Dictionary in _lights:
		var lamp: OmniLight3D = entry.node
		lamp.light_energy = lerpf(float(entry.day),float(entry.night),darkness)
