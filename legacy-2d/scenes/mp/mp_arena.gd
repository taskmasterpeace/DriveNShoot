extends Node2D

## Minimal playable multiplayer arena. Launch two instances:
##   [H] Host    [J] Join (127.0.0.1)    Drive: WASD/Stick    Fire: LMB/RB
## The server spawns a networked vehicle per peer (driven from that peer's input); every client
## renders all of them via NetworkManager's auto state sync. Proves the netcode in the real game.

var _spawned: Dictionary = {} # peer_id -> vehicle node
@onready var label: Label = $UI/Label

func _ready() -> void:
	NetworkManager.peer_joined.connect(_on_peer_joined)
	NetworkManager.peer_left.connect(_on_peer_left)
	NetworkManager.server_started.connect(func(): _spawn_vehicle(NetworkManager.local_id()))
	NetworkManager.spawned_as.connect(func(id): _spawn_vehicle(id))
	_update_label()

func _input(event: InputEvent) -> void:
	if NetworkManager.is_active():
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_H:
			NetworkManager.host_server()
			_update_label()
		elif event.keycode == KEY_J:
			NetworkManager.join_server("127.0.0.1")
			_update_label()

func _process(_delta: float) -> void:
	# Client: spawn a render proxy for any peer the server is syncing that we don't have locally.
	if NetworkManager.is_active() and not NetworkManager.is_server():
		for id in NetworkManager.remote_states.keys():
			if not _spawned.has(id):
				_spawn_vehicle(id)

func _on_peer_joined(id: int) -> void:
	if NetworkManager.is_server():
		_spawn_vehicle(id)

func _on_peer_left(id: int) -> void:
	if _spawned.has(id):
		_spawned[id].queue_free()
		_spawned.erase(id)
	_update_label()

func _spawn_vehicle(id: int) -> void:
	if id <= 0 or _spawned.has(id):
		return
	var v: VehicleEntity = load("res://entities/vehicles/vehicle_entity.tscn").instantiate()
	v.network_peer_id = id
	v.data = load("res://data/vehicles/vehicle_balanced.tres")
	add_child(v)
	v.global_position = Vector2(400 + (id % 6) * 160, 300)
	v.is_active = true
	if id == NetworkManager.local_id():
		var cam := Camera2D.new()
		cam.zoom = Vector2(0.7, 0.7)
		v.add_child(cam)
		cam.make_current()
	_spawned[id] = v
	_update_label()

func _update_label() -> void:
	if not label:
		return
	if not NetworkManager.is_active():
		label.text = "MULTIPLAYER ARENA\n[H] Host    [J] Join (127.0.0.1)\nDrive: WASD/Stick   Fire: LMB/RB"
	else:
		var role := "HOST" if NetworkManager.is_server() else "CLIENT"
		label.text = "%s — id %d — players: %d\nDrive: WASD/Stick   Fire: LMB/RB" % [role, NetworkManager.local_id(), _spawned.size()]
