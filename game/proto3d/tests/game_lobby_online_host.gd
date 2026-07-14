## Real ENet host for the visible Game Deck lobby. Run through
## tools/game_lobby_loopback.sh in player and spectator modes.
extends Node

const GAME_ID := "dial_tanks"
const SEED := 94127

var mode := "player"
var port := 24781
var net: ProtoNet
var deck: Node
var shell: CanvasLayer
var terminal: Node3D
var broker: RefCounted
var remote_players: Dictionary = {}
var remote_peer := 0
var started := false
var saw_remote_input := false
var authority_ticks := false
var result_published := false


func notify(_text: String) -> void:
	pass


func _ready() -> void:
	var user_args := OS.get_cmdline_user_args()
	mode = String(user_args[0]) if not user_args.is_empty() else "player"
	if mode not in ["player", "spectator"]:
		mode = "player"
	port = 24782 if mode == "spectator" else 24781
	net = ProtoNet.create(self)
	add_child(net)
	deck = ProtoGameDeck.create(self)
	add_child(deck)
	deck.set_process(false)
	shell = ProtoGameShell.create(deck)
	add_child(shell)
	terminal = ProtoGameConsole.create(self, deck, shell)
	add_child(terminal)
	shell.attach_terminal(terminal, terminal.session_broker)
	broker = terminal.session_broker
	deck.ledger.unlock(GAME_ID)
	deck.attach_net(net.arcade)
	broker.lobby_changed.connect(_on_lobby_changed)
	net.arcade.input_received.connect(_on_remote_input)
	net.arcade.event_received.connect(_on_remote_event)
	net.peer_joined.connect(_on_peer_joined)
	if not net.host(port):
		print("LOBBY HOST [%s]: BIND FAILED" % mode)
		get_tree().quit(1)
		return
	print("LOBBY HOST [%s]: LISTENING" % mode)
	get_tree().create_timer(22.0).timeout.connect(func() -> void:
		print("LOBBY HOST [%s]: WATCHDOG FAIL" % mode)
		get_tree().quit(1))


func _on_peer_joined(peer_id: int) -> void:
	remote_peer = peer_id
	var body := CharacterBody3D.new()
	body.name = "REMOTE %d" % peer_id
	add_child(body)
	remote_players[peer_id] = body
	if not bool(broker.configure_lobby(GAME_ID, "online", true)) \
			or not bool(broker.invite_peer(peer_id)):
		print("LOBBY HOST [%s]: INVITE FAIL status=%s" % [mode,
			String(broker.lobby_snapshot().get("status", ""))])
		get_tree().quit(1)
		return
	print("LOBBY HOST [%s]: INVITE SENT peer=%d" % [mode, peer_id])


func _on_lobby_changed() -> void:
	if started or remote_peer <= 0:
		return
	var snapshot: Dictionary = broker.lobby_snapshot()
	var accepted := (snapshot.get("spectators", []) as Array).has(remote_peer) \
		if mode == "spectator" else _seat_has_peer(snapshot.get("seats", []), remote_peer)
	if accepted:
		started = true
		call_deferred("_start_match")


func _start_match() -> void:
	if not bool(broker.start_match()) or deck.state != "PLAYING":
		print("LOBBY HOST [%s]: START FAIL" % mode)
		get_tree().quit(1)
		return
	print("LOBBY HOST [%s]: MATCH STARTED seats=%d spectators=%d" % [mode,
		(deck.active_seats as Array).size(),
		(broker.lobby_snapshot().get("spectators", []) as Array).size()])
	if mode == "spectator":
		get_tree().create_timer(0.4).timeout.connect(_drive_authority_for_spectator)


func _drive_authority_for_spectator() -> void:
	var event := InputEventKey.new()
	event.physical_keycode = KEY_W
	event.keycode = KEY_W
	event.pressed = true
	deck.feed_event(event)
	deck.process_tick()
	deck.process_tick()
	deck.process_tick()
	authority_ticks = int(deck.cartridge.get("tick")) == 3
	print("LOBBY HOST [%s]: SPECTATOR SNAPSHOT PUBLISHED tick=%d" % [mode,
		int(deck.cartridge.get("tick"))])
	get_tree().create_timer(0.25).timeout.connect(_publish_result)


func _on_remote_input(peer_id: int, _tick: int, state: Dictionary) -> void:
	if mode != "player" or peer_id != remote_peer or saw_remote_input:
		return
	var move: Vector2 = state.get("move", Vector2.ZERO)
	saw_remote_input = move.y < -0.9 and int(state.get("seat", -1)) == 1
	if not saw_remote_input:
		return
	deck.process_tick()
	deck.process_tick()
	deck.process_tick()
	authority_ticks = int(deck.cartridge.get("tick")) == 3
	print("LOBBY HOST [%s]: REMOTE INPUT APPLIED" % mode)
	call_deferred("_publish_result")


func _publish_result() -> void:
	if result_published:
		return
	result_published = true
	if not bool(deck.cartridge.debug_force_finish()):
		print("LOBBY HOST [%s]: RESULT FAIL" % mode)
		get_tree().quit(1)
		return
	var result: Dictionary = deck.cartridge.get("last_result")
	get_tree().create_timer(0.18).timeout.connect(func() -> void:
		net.arcade.send_result(result))
	print("LOBBY HOST [%s]: RESULT PUBLISHED" % mode)


func _on_remote_event(peer_id: int, event: Dictionary) -> void:
	if peer_id != remote_peer or String(event.get("type", "")) != "lobby_client_audit":
		return
	var expected_ledger := 0 if mode == "spectator" else 1
	var ok := started and authority_ticks and result_published \
		and (saw_remote_input if mode == "player" else not saw_remote_input) \
		and bool(event.get("visible_action", false)) \
		and bool(event.get("snapshot_ok", false)) \
		and String(event.get("deck_state", "")) == ("SPECTATING" if mode == "spectator" else "PLAYING") \
		and int(event.get("ledger_count", -1)) == expected_ledger \
		and int(event.get("result_signals", 0)) == 1 \
		and int(event.get("local_ticks", -1)) == (0 if mode == "spectator" else 1) \
		and (deck.ledger.recent_results as Array).size() == 1
	print("LOBBY HOST [%s]: CLIENT ACK snapshot=%s ledger=%d state=%s" % [mode,
		str(event.get("snapshot_ok", false)), int(event.get("ledger_count", -1)),
		String(event.get("deck_state", ""))])
	print("LOBBY HOST [%s]: %s" % [mode,
		"ALL CHECKS PASSED" if ok else "FAILURES PRESENT"])
	get_tree().create_timer(0.25).timeout.connect(func() -> void:
		get_tree().quit(0 if ok else 1))


func _seat_has_peer(seats_value: Variant, peer_id: int) -> bool:
	var seats: Array = seats_value if seats_value is Array else []
	return seats.any(func(seat: Dictionary) -> bool:
		return int(seat.get("peer_id", 0)) == peer_id)
