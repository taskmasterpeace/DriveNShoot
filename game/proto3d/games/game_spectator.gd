## A WORLD SCREEN, NOT A SECOND GAME. This node owns only original frame meshes
## and samples the existing Game Deck SubViewportTexture by reference.
extends Node3D

var deck: Node = null
var _screen: MeshInstance3D = null
var _material: StandardMaterial3D = null


static func create(new_deck: Node, screen_size: Vector2, accent: Color) -> Node3D:
	var script := load("res://proto3d/games/game_spectator.gd") as GDScript
	var spectator: Node3D = script.new()
	spectator.deck = new_deck
	spectator.name = "Spectator"
	spectator._build(screen_size, accent)
	return spectator


func _build(screen_size: Vector2, accent: Color) -> void:
	var back := MeshInstance3D.new()
	back.name = "ScreenCabinet"
	var back_box := BoxMesh.new()
	back_box.size = Vector3(screen_size.x + 0.34, screen_size.y + 0.34, 0.24)
	back.mesh = back_box
	back.material_override = ProtoWorldBuilder.material(Color("171510"), 0.82)
	add_child(back)
	_screen = MeshInstance3D.new()
	_screen.name = "LiveMatchScreen"
	var quad := QuadMesh.new()
	quad.size = screen_size
	_screen.mesh = quad
	_screen.position.z = 0.13
	_material = StandardMaterial3D.new()
	_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_material.albedo_color = Color.WHITE
	_material.albedo_texture = deck.texture()
	_material.emission_enabled = true
	_material.emission = accent
	_material.emission_energy_multiplier = 0.28
	_material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	_screen.material_override = _material
	add_child(_screen)
	for x in [-screen_size.x * 0.5 - 0.13, screen_size.x * 0.5 + 0.13]:
		var trim := MeshInstance3D.new()
		var trim_box := BoxMesh.new()
		trim_box.size = Vector3(0.08, screen_size.y + 0.34, 0.28)
		trim.mesh = trim_box
		trim.position = Vector3(x, 0, 0.02)
		trim.material_override = ProtoWorldBuilder.material(accent, 0.45, true)
		add_child(trim)


func screen_texture() -> Texture2D:
	return _material.albedo_texture if _material != null else null


func refresh_texture() -> void:
	if _material != null and deck != null:
		_material.albedo_texture = deck.texture()
