## Real ENet CLIENT proof for the Game Deck. Sends semantic seat input, accepts
## the host snapshot/result, then confirms convergence and result idempotency.
extends Node

const PORT := 24779
const SESSION := "console-wire-proof"
const GAME_ID := "dial_tanks"
const SEED := 73421

var net: ProtoNet = null
var deck: Node = null
var initial_remote_pos := Vector2.ZERO
var snapshot_ok := false
var result_signals := 0
var result_received := false
var remote_players: Dictionary = {}


func notify(_text: String) -> void:
	pass


func _ready() -> void:
	net = ProtoNet.create(self)
	add_child(net)
	multiplayer.connected_to_server.connect(_on_connected)
	multiplayer.connection_failed.connect(func() -> void:
		print("CONSOLE CLIENT: CONNECTION FAILED")
		get_tree().quit(1))
	get_tree().create_timer(0.6).timeout.connect(func() -> void:
		net.join("127.0.0.1", PORT))
	get_tree().create_timer(14.0).timeout.connect(func() -> void:
		print("CONSOLE CLIENT: WATCHDOG FAIL")
		get_tree().quit(1))


func _on_connected() -> void:
	var local_peer := multiplayer.get_unique_id()
	var members: Array = [1, local_peer]
	if not net.arcade.begin_session(SESSION, GAME_ID, 1, members):
		print("CONSOLE CLIENT: SESSION FAIL")
		get_tree().quit(1)
		return
	deck = ProtoGameDeck.create(self)
	add_child(deck)
	deck.set_process(false)
	deck.attach_net(net.arcade)
	net.arcade.snapshot_received.connect(_on_snapshot)
	net.arcade.result_received.connect(_on_result)
	var context := {"source": "session", "online": true, "session_id": SESSION,
		"local_peer_id": local_peer}
	var seats: Array = [
		{"seat": 0, "peer_id": 1, "device": -1, "profile_id": "host"},
		{"seat": 1, "peer_id": local_peer, "device": -1, "profile_id": "client"},
	]
	if not deck.launch(GAME_ID, context) or not deck.start(SEED, seats):
		print("CONSOLE CLIENT: DECK START FAIL")
		get_tree().quit(1)
		return
	var tanks: Array = deck.cartridge.get("tanks")
	initial_remote_pos = (tanks[1] as Dictionary).get("pos", Vector2.ZERO)
	print("CONSOLE CLIENT: MATCH READY peer=%d" % local_peer)
	get_tree().create_timer(0.35).timeout.connect(_send_semantic_input)


func _send_semantic_input() -> void:
	var event := InputEventKey.new()
	event.physical_keycode = KEY_W
	event.keycode = KEY_W
	event.pressed = true
	deck.feed_event(event)
	deck.process_tick()
	var semantic: Dictionary = deck.input_router.snapshot_for_seat(1)
	print("CONSOLE CLIENT: SEMANTIC INPUT SENT online=%s move=%s" % [
		str(net.online), str(semantic.get("move"))])


func _on_snapshot(_peer_id: int, state: Dictionary) -> void:
	var state_tanks: Array = state.get("tanks", [])
	var live_tanks: Array = deck.cartridge.get("tanks")
	if state_tanks.size() < 2 or live_tanks.size() < 2:
		return
	var authoritative_pos: Vector2 = (state_tanks[1] as Dictionary).get("pos", Vector2.ZERO)
	var live_pos: Vector2 = (live_tanks[1] as Dictionary).get("pos", Vector2.ZERO)
	snapshot_ok = authoritative_pos != initial_remote_pos and live_pos == authoritative_pos \
		and int(deck.cartridge.get("tick")) == int(state.get("tick", -1))
	print("CONSOLE CLIENT: SNAPSHOT CONVERGED=%s pos=%s" % [str(snapshot_ok), str(live_pos)])


func _on_result(_peer_id: int, result: Dictionary) -> void:
	result_signals += 1
	result_received = String(result.get("game_id", "")) == GAME_ID \
		and String(result.get("outcome", "")) == "complete"
	if result_signals == 1:
		get_tree().create_timer(0.65).timeout.connect(_finish_audit)


func _finish_audit() -> void:
	var ledger_count := (deck.ledger.recent_results as Array).size()
	var ok := snapshot_ok and result_received and result_signals == 1 and ledger_count == 1
	var ack := {"event_id": "client-audit-1", "type": "client_audit",
		"snapshot_ok": snapshot_ok, "ledger_count": ledger_count,
		"result_signals": result_signals}
	net.arcade.send_event(ack)
	print("CONSOLE CLIENT: RESULT IDEMPOTENT ledger=%d signals=%d" % [ledger_count, result_signals])
	print("CONSOLE CLIENT: %s" % ("ALL CHECKS PASSED" if ok else "FAILURES PRESENT"))
	get_tree().create_timer(0.5).timeout.connect(func() -> void:
		get_tree().quit(0 if ok else 1))
