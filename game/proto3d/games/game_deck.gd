## THE GAME DECK: one lifecycle, viewport, input tick, ledger, and error boundary
## for every cartridge. The host world never needs a game-specific branch.
class_name ProtoGameDeck
extends Node

signal state_changed(state: String)
signal game_launched(game_id: String)
signal result_recorded(result: Dictionary)
signal cartridge_error(game_id: String, message: String)

const STATE_OFF := "OFF"
const STATE_LIBRARY := "LIBRARY"
const STATE_READY := "READY"
const STATE_PLAYING := "PLAYING"
const STATE_PAUSED := "PAUSED"
const STATE_SPECTATING := "SPECTATING"
const STATE_ERROR := "ERROR"
const TICK_HZ := 30.0

var main: Node = null
var registry: RefCounted
var ledger: RefCounted
var input_router: RefCounted
var viewport: SubViewport
var cartridge: Control = null
var current_row: Dictionary = {}
var current_context: Dictionary = {}
var active_seats: Array = []
var state := STATE_OFF
var error_text := ""
var shell_open := false
var arcade_net: Node = null
var _tick := 0
var _accumulator := 0.0


static func create(new_main: Node = null) -> Node:
	var script := load("res://proto3d/games/game_deck.gd") as GDScript
	var deck: Node = script.new()
	deck._setup(new_main)
	return deck


func _setup(new_main: Node) -> void:
	main = new_main
	var registry_script := load("res://proto3d/games/game_registry.gd") as GDScript
	registry = registry_script.load_catalog()
	var ledger_script := load("res://proto3d/games/score_ledger.gd") as GDScript
	ledger = ledger_script.new(registry)
	var input_script := load("res://proto3d/games/arcade_input_router.gd") as GDScript
	input_router = input_script.new()
	viewport = SubViewport.new()
	viewport.name = "GameDeckViewport"
	viewport.size = Vector2i(1280, 720)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.transparent_bg = false
	viewport.handle_input_locally = false
	add_child(viewport)
	set_process(true)


func launch(game_id: String, context: Dictionary) -> bool:
	_clear_cartridge("switch")
	error_text = ""
	current_row = registry.get_game(game_id)
	current_context = context.duplicate(true)
	if current_row.is_empty():
		return _fail(game_id, "CARTRIDGE UNKNOWN")
	if not registry.installed(game_id):
		return _fail(game_id, "CARTRIDGE CORRUPT — scene not installed")
	if not registry.enabled(game_id):
		return _fail(game_id, "CARTRIDGE DISABLED — source notice missing")
	var scene_path := String(current_row.get("cartridge_scene", ""))
	var packed := load(scene_path) as PackedScene
	if packed == null:
		return _fail(game_id, "CARTRIDGE CORRUPT — cannot load scene")
	var device: Dictionary = registry.get_device(String(current_row.get("device_id", "")))
	var resolution: Array = device.get("resolution", [1280, 720])
	viewport.size = Vector2i(int(resolution[0]), int(resolution[1]))
	cartridge = packed.instantiate() as Control
	if cartridge == null:
		return _fail(game_id, "CARTRIDGE CORRUPT — root must be Control")
	viewport.add_child(cartridge)
	cartridge.configure(current_row, current_context)
	cartridge.match_finished.connect(_on_match_finished)
	cartridge.network_event_requested.connect(_on_cartridge_network_event)
	_set_state(STATE_READY)
	game_launched.emit(game_id)
	return true


func start(seed_value: int, seats: Array) -> bool:
	if cartridge == null or state not in [STATE_READY, STATE_PAUSED]:
		return false
	active_seats = seats.duplicate(true)
	for seat_value in active_seats:
		var seat: Dictionary = seat_value
		var seat_id := int(seat.get("seat", 0))
		var device := int(seat.get("device", -1))
		if device < 0:
			input_router.assign_keyboard(seat_id)
		else:
			input_router.assign_device(seat_id, device)
	_tick = 0
	_accumulator = 0.0
	cartridge.start_match(seed_value, active_seats)
	_set_state(STATE_SPECTATING if bool(current_context.get("spectator", false)) else STATE_PLAYING)
	return true


func pause() -> bool:
	if cartridge == null or state != STATE_PLAYING:
		return false
	cartridge.pause_match(true)
	_set_state(STATE_PAUSED)
	return true


func resume() -> bool:
	if cartridge == null or state != STATE_PAUSED:
		return false
	cartridge.pause_match(false)
	_set_state(STATE_PLAYING)
	return true


func feed_event(event: InputEvent) -> void:
	if state == STATE_PLAYING:
		input_router.feed_event(event)


func process_tick() -> void:
	if cartridge == null or state != STATE_PLAYING:
		return
	_tick += 1
	var snapshots: Array = []
	for seat_value in active_seats:
		var seat: Dictionary = seat_value
		snapshots.append(input_router.snapshot_for_seat(int(seat.get("seat", 0))))
	cartridge.apply_inputs(_tick, snapshots)


func _process(delta: float) -> void:
	if state != STATE_PLAYING:
		return
	_accumulator += delta
	var step := 1.0 / TICK_HZ
	while _accumulator >= step:
		_accumulator -= step
		process_tick()


func stop(reason: String) -> void:
	_clear_cartridge(reason)
	current_row.clear()
	current_context.clear()
	active_seats.clear()
	error_text = ""
	_set_state(STATE_OFF)


func _clear_cartridge(reason: String) -> void:
	if cartridge == null:
		return
	cartridge.stop_match(reason)
	viewport.remove_child(cartridge)
	cartridge.free()
	cartridge = null


func _fail(game_id: String, message: String) -> bool:
	error_text = message
	_set_state(STATE_ERROR)
	cartridge_error.emit(game_id, message)
	return false


func _on_match_finished(result: Dictionary) -> void:
	if ledger.submit(result):
		result_recorded.emit(result.duplicate(true))
	_set_state(STATE_READY)


func apply_network_event(event: Dictionary) -> bool:
	if cartridge == null or state not in [STATE_PLAYING, STATE_SPECTATING]:
		return false
	cartridge.apply_event(event.duplicate(true))
	return true


func apply_network_snapshot(snapshot_state: Dictionary) -> bool:
	if cartridge == null or state not in [STATE_PLAYING, STATE_SPECTATING] \
			or snapshot_state.is_empty():
		return false
	cartridge.restore_snapshot(snapshot_state.duplicate(true))
	return true


func attach_net(bridge: Node) -> void:
	if arcade_net != null:
		if arcade_net.event_received.is_connected(_on_net_event):
			arcade_net.event_received.disconnect(_on_net_event)
		if arcade_net.snapshot_received.is_connected(_on_net_snapshot):
			arcade_net.snapshot_received.disconnect(_on_net_snapshot)
		if arcade_net.result_received.is_connected(_on_net_result):
			arcade_net.result_received.disconnect(_on_net_result)
	arcade_net = bridge
	if arcade_net != null:
		arcade_net.event_received.connect(_on_net_event)
		arcade_net.snapshot_received.connect(_on_net_snapshot)
		arcade_net.result_received.connect(_on_net_result)


func _on_cartridge_network_event(event: Dictionary) -> void:
	if arcade_net != null:
		arcade_net.send_event(event)


func _on_net_event(_peer_id: int, event: Dictionary) -> void:
	apply_network_event(event)


func _on_net_snapshot(_peer_id: int, snapshot_state: Dictionary) -> void:
	apply_network_snapshot(snapshot_state)


func _on_net_result(_peer_id: int, result: Dictionary) -> void:
	if ledger.submit(result):
		result_recorded.emit(result.duplicate(true))


func _set_state(next_state: String) -> void:
	if state == next_state:
		return
	state = next_state
	state_changed.emit(state)


func set_shell_open(open: bool) -> void:
	shell_open = open


func texture() -> Texture2D:
	return viewport.get_texture() if viewport != null else null


func serialize() -> Dictionary:
	return ledger.serialize()


func restore(data: Dictionary) -> void:
	ledger.restore(data)
