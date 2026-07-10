## SAFEHOUSE GAME CONSOLE: a physical interactable shell around the one Game Deck.
## The fullscreen shell and this QuadMesh always sample the same SubViewport texture.
class_name ProtoGameConsole
extends StaticBody3D

const BODY_COLOR := Color("201d18")
const TRIM_COLOR := Color("b7791f")
const OFF_COLOR := Color("171b17")

var main: Node
var deck: Node
var shell: CanvasLayer
var _screen: MeshInstance3D
var _screen_material: StandardMaterial3D
var _live_texture: Texture2D = null
var powered := true
var session_broker: RefCounted = null


static func create(new_main: Node, new_deck: Node, new_shell: CanvasLayer) -> Node3D:
	var script := load("res://proto3d/games/game_console.gd") as GDScript
	var console: Node3D = script.new()
	console._setup(new_main, new_deck, new_shell)
	return console


func _setup(new_main: Node, new_deck: Node, new_shell: CanvasLayer) -> void:
	main = new_main
	deck = new_deck
	shell = new_shell
	name = "SafehouseGameConsole"
	add_to_group("interactable")
	_build_case()
	var broker_script := load("res://proto3d/games/game_session_broker.gd") as GDScript
	session_broker = broker_script.create(self, deck, shell)
	if deck != null and deck.has_signal("arcade_net_attached"):
		deck.arcade_net_attached.connect(session_broker.attach_bridge)
		if deck.arcade_net != null:
			session_broker.attach_bridge(deck.arcade_net)
	deck.game_launched.connect(_on_game_launched)
	deck.state_changed.connect(_on_deck_state_changed)


func _build_case() -> void:
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(1.75, 1.15, 0.46)
	collision.shape = shape
	collision.position.y = 0.82
	add_child(collision)
	_add_box("Cabinet", Vector3(1.84, 1.22, 0.52), Vector3(0, 0.82, 0), BODY_COLOR)
	_add_box("AmberTrim", Vector3(1.68, 0.08, 0.04), Vector3(0, 1.44, 0.285), TRIM_COLOR)
	_add_box("Deck", Vector3(0.78, 0.12, 0.38), Vector3(0, 0.13, 0.02), BODY_COLOR.lightened(0.08))
	_add_box("LeftSpeaker", Vector3(0.16, 0.72, 0.05), Vector3(-0.82, 0.88, 0.285), Color("15130f"))
	_add_box("RightSpeaker", Vector3(0.16, 0.72, 0.05), Vector3(0.82, 0.88, 0.285), Color("15130f"))
	_screen = MeshInstance3D.new()
	_screen.name = "LiveScreen16x9"
	var quad := QuadMesh.new()
	quad.size = Vector2(1.28, 0.72)
	_screen.mesh = quad
	_screen.position = Vector3(0, 0.9, 0.292)
	_screen_material = StandardMaterial3D.new()
	_screen_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_screen_material.albedo_color = OFF_COLOR
	_screen_material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	_screen.material_override = _screen_material
	add_child(_screen)


func _add_box(label: String, size: Vector3, at: Vector3, color: Color) -> void:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = label
	var box := BoxMesh.new()
	box.size = size
	mesh_instance.mesh = box
	mesh_instance.position = at
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = 0.45
	material.roughness = 0.68
	mesh_instance.material_override = material
	add_child(mesh_instance)


func interact_prompt(_main: Node) -> String:
	if not powered:
		return "E  GAME CONSOLE — NO POWER"
	if session_broker != null and session_broker.has_method("pending_invitations") \
			and not (session_broker.pending_invitations() as Array).is_empty():
		return "E  GAME CONSOLE — MATCH INVITE"
	return "E  PLAY GAME CONSOLE"


func interact(_main: Node) -> void:
	if not powered:
		if main != null and main.has_method("notify"):
			main.notify("🎮 The console is dark. It needs a real power source.")
		return
	if session_broker != null and session_broker.has_method("pending_invitations") \
			and not (session_broker.pending_invitations() as Array).is_empty() \
			and shell.has_method("open_pending_lobby"):
		shell.open_pending_lobby()
		return
	shell.open_library("console", {"source": "console", "device": "console", "auto_start": true})


func set_powered(value: bool) -> void:
	powered = value
	if not powered:
		if session_broker != null and session_broker.has_method("leave_lobby"):
			session_broker.leave_lobby("CONSOLE LOST POWER")
		if shell != null and String(shell.get("current_view")) == "match":
			shell.close_to_device()
		if deck != null and deck.cartridge != null \
				and String(deck.current_context.get("device", "")) == "console":
			deck.stop("power_lost")
		set_off()


func is_powered() -> bool:
	return powered


func local_offer(game_id: String, peer_id: int, body: Node3D, device: int = 1) -> Dictionary:
	return session_broker.local_offer(game_id, peer_id, body, device) if session_broker != null else {}


func start_local_offer(offer: Dictionary) -> bool:
	return session_broker != null and bool(session_broker.start_local_offer(offer))


func online_offer(game_id: String, peer_id: int, remote_terminal: Node,
		session_id: String) -> Dictionary:
	return session_broker.online_offer(game_id, peer_id, remote_terminal, session_id) \
		if session_broker != null else {}


func start_online_offer(offer: Dictionary) -> bool:
	return session_broker != null and bool(session_broker.start_online_offer(offer))


func interact_position() -> Vector3:
	return global_position + global_basis.z * 1.25


func _on_game_launched(_game_id: String) -> void:
	set_live(deck.texture())


func _on_deck_state_changed(next_state: String) -> void:
	if next_state in ["OFF", "ERROR"]:
		set_off()


func set_live(texture: Texture2D) -> void:
	_live_texture = texture
	_screen_material.albedo_texture = texture
	_screen_material.albedo_color = Color.WHITE
	_screen_material.emission_enabled = true
	_screen_material.emission = Color("d8c58e")
	_screen_material.emission_energy_multiplier = 0.45


func set_off() -> void:
	_live_texture = null
	_screen_material.albedo_texture = null
	_screen_material.albedo_color = OFF_COLOR
	_screen_material.emission_enabled = false


func screen_texture() -> Texture2D:
	return _live_texture


func is_live() -> bool:
	return _live_texture != null
