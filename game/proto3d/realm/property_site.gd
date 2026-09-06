class_name ProtoPropertySite
extends Node3D
var row: Dictionary
var road_life: Node
var roofs: Array[Node3D] = []
var plaque: Node3D

func setup(owner: Node, definition: Dictionary) -> void:
	road_life = owner
	row = definition
	position = Vector3(float(row.position[0]), 0, float(row.position[1]))
	position.y = ProtoWorldBuilder.ground_y(position.x, position.z)
	add_to_group("interactable")
	var model: Node3D = load_model(String(row.model), Vector3(10, 3.0, 8), Color("cbbd99"))
	add_child(model)
	_find_roofs(model)
	# Collision matches the finished floor and leaves a full 1.4m door gap.
	_solid(Vector3(10, 0.355, 8), Vector3(0, 0.1775, 0))
	_solid(Vector3(0.2, 2.6, 8), Vector3(-5, 1.65, 0))
	_solid(Vector3(0.2, 2.6, 8), Vector3(5, 1.65, 0))
	_solid(Vector3(10, 2.6, 0.2), Vector3(0, 1.65, -4))
	_solid(Vector3(4.3, 2.6, 0.2), Vector3(-2.85, 1.65, 4))
	_solid(Vector3(4.3, 2.6, 0.2), Vector3(2.85, 1.65, 4))
	_solid(Vector3(1.4, 0.5, 0.2), Vector3(0, 2.89, 4))
	_solid(Vector3(8, 0.4, 2), Vector3(0, 0.2, 5))
	# Convex wedge: 0→0.4m over 2m, so normal walking climbs without jumping.
	var ramp: StaticBody3D = StaticBody3D.new()
	var shape: CollisionShape3D = CollisionShape3D.new()
	var wedge: ConvexPolygonShape3D = ConvexPolygonShape3D.new()
	wedge.points = PackedVector3Array([Vector3(-1,0,8),Vector3(1,0,8),Vector3(-1,0,6),Vector3(1,0,6),Vector3(-1,0.4,6),Vector3(1,0.4,6)])
	shape.shape = wedge
	ramp.add_child(shape)
	add_child(ramp)
	ProtoWorldBuilder.box_visual(self, Vector3(2,0.08,2.05), Vector3(0,0.19,7), Color("95805b"), 0, 0.1974)
	plaque = load_model("res://assets/models/homestead/parcel_mailbox.glb", Vector3(0.5,1.5,0.5), Color("bb7b39"))
	plaque.position = Vector3(6,0,6)
	add_child(plaque)
	var label: Label3D = Label3D.new()
	label.text = "%s\n%d BANKED SCRIP" % [row.name, row.price]
	label.font_size = 44
	label.pixel_size = 0.008
	label.position = Vector3(6,2.3,6)
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	add_child(label)

static func load_model(path: String, fallback: Vector3, color: Color) -> Node3D:
	if ResourceLoader.exists(path):
		var scene: PackedScene = load(path) as PackedScene
		if scene != null:
			return scene.instantiate() as Node3D
	var root: Node3D = Node3D.new()
	ProtoWorldBuilder.box_visual(root, fallback, Vector3(0, fallback.y / 2.0, 0), color)
	return root

func _solid(size: Vector3, at: Vector3) -> void:
	var body: StaticBody3D = StaticBody3D.new()
	var collision: CollisionShape3D = CollisionShape3D.new()
	var box: BoxShape3D = BoxShape3D.new()
	box.size = size
	collision.shape = box
	body.position = at
	body.add_child(collision)
	add_child(body)

func _find_roofs(node: Node) -> void:
	if node is Node3D and String(node.name).begins_with("Roof"):
		roofs.append(node)
	for child: Node in node.get_children():
		_find_roofs(child)

func _physics_process(_delta: float) -> void:
	if road_life == null or road_life.main == null:
		return
	var local: Vector3 = to_local(road_life.main.player.global_position)
	var inside: bool = absf(local.x) < 5.2 and local.z > -4.2 and local.z < 6.0
	for roof: Node3D in roofs:
		roof.visible = not inside

func interact_position() -> Vector3:
	return to_global(Vector3(6,0.8,6))

func interact_prompt(_main: Node) -> String:
	return "E / Y — %s · deeds & storage" % row.name

func interact(_main: Node) -> void:
	road_life.panel.open_site(self)
