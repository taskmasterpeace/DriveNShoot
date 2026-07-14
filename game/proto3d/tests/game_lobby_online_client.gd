## Real ENet client for visible JOIN MATCH / SPECTATE lobby actions.
extends Node

const GAME_ID := "dial_tanks"

var mode := "player"
var port := 24781
var net: ProtoNet
var deck: Node
var shell: CanvasLayer
var terminal: Node3D
var broker: RefCounted
var remote_players: Dictionary = {}
var responded := false
var visible_action := false
var snapshot_ok := false
var result_signals := 0
var live_started := false


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
	if mode == "player":
		deck.ledger.unlock(GAME_ID)
	deck.attach_net(net.arcade)
	broker.lobby_changed.connect(_on_lobby_changed)
	deck.state_changed.connect(_on_deck_state_changed)
	net.arcade.snapshot_received.connect(_on_snapshot)
	net.arcade.result_received.connect(_on_result)
	multiplayer.connected_to_server.connect(_on_connected)
	multiplayer.connection_failed.connect(func() -> void:
		print("LOBBY CLIENT [%s]: CONNECTION FAILED" % mode)
		get_tree().quit(1))
	get_tree().create_timer(0.65).timeout.connect(func() -> void:
		net.join("127.0.0.1", port))
	get_tree().create_timer(21.0).timeout.connect(func() -> void:
		print("LOBBY CLIENT [%s]: WATCHDOG FAIL" % mode)
		get_tree().quit(1))


func _on_connected() -> void:
	var host_body := CharacterBody3D.new()
	host_body.name = "REMOTE HOST"
	add_child(host_body)
	remote_players[1] = host_body
	print("LOBBY CLIENT [%s]: DRIVN CONNECTED peer=%d" % [mode,
		multiplayer.get_unique_id()])


func _on_lobby_changed() -> void:
	if responded or (broker.pending_invitations() as Array).is_empty():
		return
	responded = true
	terminal.interact(self)
	visible_action = shell.current_view == "match" and shell.lobby.visible
	var action := "SPECTATE" if mode == "spectator" else "JOIN MATCH"
	var accepted := bool(shell.lobby.call("press_action", action))
	print("LOBBY CLIENT [%s]: %s accepted=%s visible=%s" % [mode, action,
		str(accepted), str(visible_action)])
	if not accepted:
		get_tree().quit(1)


func _on_deck_state_changed(next_state: String) -> void:
	var expected := "SPECTATING" if mode == "spectator" else "PLAYING"
	if live_started or next_state != expected:
		return
	live_started = true
	print("LOBBY CLIENT [%s]: LIVE state=%s seats=%d" % [mode, next_state,
		(deck.active_seats as Array).size()])
	get_tree().create_timer(0.3).timeout.connect(_exercise_local_input)


func _exercise_local_input() -> void:
	var event := InputEventKey.new()
	event.physical_keycode = KEY_W
	event.keycode = KEY_W
	event.pressed = true
	deck.feed_event(event)
	deck.process_tick()
	if mode == "player":
		var semantic: Dictionary = deck.input_router.snapshot_for_seat(1)
		print("LOBBY CLIENT [%s]: SEMANTIC INPUT move=%s" % [mode,
			str(semantic.get("move"))])
	else:
		print("LOBBY CLIENT [%s]: INPUT SUPPRESSED ticks=%d" % [mode, int(deck._tick)])


func _on_snapshot(_peer_id: int, state: Dictionary) -> void:
	if deck.cartridge == null:
		return
	snapshot_ok = int(state.get("tick", 0)) >= 3 \
		and int(deck.cartridge.get("tick")) == int(state.get("tick", -1))
	print("LOBBY CLIENT [%s]: SNAPSHOT CONVERGED=%s tick=%d" % [mode,
		str(snapshot_ok), int(state.get("tick", -1))])


func _on_result(_peer_id: int, result: Dictionary) -> void:
	if String(result.get("game_id", "")) != GAME_ID:
		return
	result_signals += 1
	if result_signals == 1:
		get_tree().create_timer(0.65).timeout.connect(_finish_audit)


func _finish_audit() -> void:
	var ledger_count := (deck.ledger.recent_results as Array).size()
	var expected_state := "SPECTATING" if mode == "spectator" else "PLAYING"
	var local_ticks := int(deck._tick)
	var ok: bool = visible_action and snapshot_ok and live_started \
		and deck.state == expected_state and result_signals == 1 \
		and ledger_count == (0 if mode == "spectator" else 1) \
		and local_ticks == (0 if mode == "spectator" else 1)
	var audit := {
		"event_id": "lobby-client-audit:%s" % mode,
		"type": "lobby_client_audit",
		"visible_action": visible_action,
		"snapshot_ok": snapshot_ok,
		"deck_state": deck.state,
		"ledger_count": ledger_count,
		"result_signals": result_signals,
		"local_ticks": local_ticks,
	}
	net.arcade.send_event(audit)
	print("LOBBY CLIENT [%s]: RESULT AUDIT ledger=%d signals=%d" % [mode,
		ledger_count, result_signals])
	print("LOBBY CLIENT [%s]: %s" % [mode,
		"ALL CHECKS PASSED" if ok else "FAILURES PRESENT"])
	get_tree().create_timer(0.5).timeout.connect(func() -> void:
		get_tree().quit(0 if ok else 1))
