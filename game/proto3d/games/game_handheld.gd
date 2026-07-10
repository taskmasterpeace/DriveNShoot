## POCKET GAME HANDHELD: inventory-opened physical shell around the same Game Deck.
## It declares all three approved screen families; the active cartridge selects size.
class_name ProtoGameHandheld
extends Node3D

const CASE_COLOR := Color("353128")
const TRIM_COLOR := Color("d18a25")
const OFF_COLOR := Color("152018")

var main: Node
var deck: Node
var shell: CanvasLayer
var _screen: MeshInstance3D
var _screen_material: StandardMaterial3D
var _live_texture: Texture2D = null


static func create(new_main: Node, new_deck: Node, new_shell: CanvasLayer) -> Node3D:
	var script := load("res://proto3d/games/game_handheld.gd") as GDScript
	var handheld: Node3D = script.new()
	handheld._setup(new_main, new_deck, new_shell)
	return handheld


func _setup(new_main: Node, new_deck: Node, new_shell: CanvasLayer) -> void:
	main = new_main
	deck = new_deck
	shell = new_shell
	name = "PocketGameHandheld"
	_build_case()
	visible = false
	set_process(true)
	deck.game_launched.connect(_on_game_launched)
	deck.state_changed.connect(_on_deck_state_changed)


func _build_case() -> void:
	var body := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.42, 0.3, 0.07)
	body.mesh = box
	var body_material := StandardMaterial3D.new()
	body_material.albedo_color = CASE_COLOR
	body_material.metallic = 0.3
	body_material.roughness = 0.72
	body.material_override = body_material
	add_child(body)
	_screen = MeshInstance3D.new()
	_screen.name = "LivePocketScreen"
	var quad := QuadMesh.new()
	quad.size = Vector2(0.24, 0.18)
	_screen.mesh = quad
	_screen.position = Vector3(0, 0.035, 0.041)
	_screen_material = StandardMaterial3D.new()
	_screen_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_screen_material.albedo_color = OFF_COLOR
	_screen_material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	_screen.material_override = _screen_material
	add_child(_screen)
	_add_button(Vector3(-0.15, -0.085, 0.045), Vector3(0.075, 0.025, 0.018))
	_add_button(Vector3(-0.15, -0.085, 0.045), Vector3(0.025, 0.075, 0.018))
	_add_button(Vector3(0.135, -0.07, 0.045), Vector3(0.04, 0.04, 0.018))
	_add_button(Vector3(0.175, -0.11, 0.045), Vector3(0.04, 0.04, 0.018))


func _add_button(at: Vector3, size: Vector3) -> void:
	var button := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	button.mesh = box
	button.position = at
	var material := StandardMaterial3D.new()
	material.albedo_color = TRIM_COLOR
	material.roughness = 0.65
	button.material_override = material
	add_child(button)


func open(_main: Node = null) -> void:
	visible = true
	shell.open_library("handheld", {"source": "handheld", "device": "handheld", "auto_start": true})


func _process(_delta: float) -> void:
	# The hardware belongs to the character, not an invisible menu. When drawn,
	# the little physical screen rides just ahead of the player's hands.
	if not visible or main == null or main.get("player") == null:
		return
	var riding: bool = bool(main.get("passenger_of_ai"))
	var active_car: Node3D = main.get("active_car") as Node3D
	if riding and active_car != null:
		# In the passenger seat the prop belongs to the moving cab, not the hidden
		# on-foot body parked at its boarding position.
		global_position = active_car.global_position + active_car.global_basis.y * 1.15 \
			- active_car.global_basis.z * 0.35
		rotation = Vector3(-1.0, active_car.global_rotation.y, 0)
		return
	var player := main.get("player") as Node3D
	if player == null:
		return
	var facing: Vector3 = player.facing() if player.has_method("facing") else -player.global_basis.z
	global_position = player.global_position + Vector3(0, 1.1, 0) + facing * 0.48
	rotation = Vector3(-1.0, atan2(facing.x, facing.z), 0)


func _on_game_launched(game_id: String) -> void:
	var row: Dictionary = deck.registry.get_game(game_id)
	if String(row.get("platform", "")) == "handheld":
		set_device(String(row.get("device_id", "")))
	set_live(deck.texture())


func set_device(device_id: String) -> bool:
	var device: Dictionary = deck.registry.get_device(device_id)
	if device.is_empty() or String(device.get("platform", "")) != "handheld":
		return false
	var size: Array = device.get("screen_size_m", [])
	if size.size() != 2:
		return false
	(_screen.mesh as QuadMesh).size = Vector2(float(size[0]), float(size[1]))
	return true


func screen_size() -> Vector2:
	return (_screen.mesh as QuadMesh).size


func _on_deck_state_changed(next_state: String) -> void:
	if next_state in ["OFF", "ERROR"]:
		set_off()


func set_live(texture: Texture2D) -> void:
	_live_texture = texture
	_screen_material.albedo_texture = texture
	_screen_material.albedo_color = Color.WHITE
	_screen_material.emission_enabled = true
	_screen_material.emission = Color("d8c58e")
	_screen_material.emission_energy_multiplier = 0.4


func set_off() -> void:
	_live_texture = null
	visible = false
	_screen_material.albedo_texture = null
	_screen_material.albedo_color = OFF_COLOR
	_screen_material.emission_enabled = false


func screen_texture() -> Texture2D:
	return _live_texture


func is_live() -> bool:
	return _live_texture != null
