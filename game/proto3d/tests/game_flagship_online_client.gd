## Real ENet client proof shared by both flagship shooters. It produces a real
## D-key event, sends the resulting semantic input, accepts the authority's
## deep combat snapshot, and audits exactly one normalized result.
extends Node

const PORT := 24783
const SEED := 91847

var game_id := ""
var session_id := ""
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
	game_id = _selected_game()
	if game_id not in ["rust_runners", "black_grid"]:
		print("FLAGSHIP CLIENT: INVALID GAME %s" % game_id)
		get_tree().quit(1)
		return
	session_id = "flagship-wire-proof-%s" % game_id
	net = ProtoNet.create(self)
	add_child(net)
	multiplayer.connected_to_server.connect(_on_connected)
	multiplayer.connection_failed.connect(func() -> void:
		print("FLAGSHIP CLIENT [%s]: CONNECTION FAILED" % game_id)
		get_tree().quit(1))
	get_tree().create_timer(0.6).timeout.connect(func() -> void:
		net.join("127.0.0.1", PORT))
	get_tree().create_timer(17.0).timeout.connect(func() -> void:
		print("FLAGSHIP CLIENT [%s]: WATCHDOG FAIL" % game_id)
		get_tree().quit(1))


func _selected_game() -> String:
	var selected := OS.get_environment("FLAGSHIP_GAME")
	if selected != "":
		return selected
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--flagship-game="):
			return argument.trim_prefix("--flagship-game=")
	return ""


func _on_connected() -> void:
	var local_peer := multiplayer.get_unique_id()
	var members: Array = [1, local_peer]
	if not net.arcade.begin_session(session_id, game_id, 1, members):
		print("FLAGSHIP CLIENT [%s]: SESSION FAIL" % game_id)
		get_tree().quit(1)
		return
	deck = ProtoGameDeck.create(self)
	add_child(deck)
	deck.set_process(false)
	deck.attach_net(net.arcade)
	net.arcade.snapshot_received.connect(_on_snapshot)
	net.arcade.result_received.connect(_on_result)
	var context := _match_context(local_peer)
	var seats: Array = [
		{"seat": 0, "peer_id": 1, "device": -1, "profile_id": "host"},
		{"seat": 1, "peer_id": local_peer, "device": -1, "profile_id": "client"},
	]
	if not deck.launch(game_id, context) or not deck.start(SEED, seats):
		print("FLAGSHIP CLIENT [%s]: DECK START FAIL" % game_id)
		get_tree().quit(1)
		return
	initial_remote_pos = Vector2(deck.cartridge.actor_state(1).get("pos", Vector2.ZERO))
	print("FLAGSHIP CLIENT [%s]: MATCH READY peer=%d pos=%s" % [
		game_id, local_peer, str(initial_remote_pos)])
	get_tree().create_timer(0.35).timeout.connect(_send_semantic_input)


func _match_context(local_peer: int) -> Dictionary:
	return {
		"source": "session",
		"online": true,
		"session_id": session_id,
		"local_peer_id": local_peer,
		"mode": "team_deathmatch" if game_id == "rust_runners" else "frontlines",
		"actor_count": 2,
		"bots": false,
		"time_limit_ticks": 900,
	}


func _send_semantic_input() -> void:
	var event := InputEventKey.new()
	event.physical_keycode = KEY_D
	event.keycode = KEY_D
	event.pressed = true
	deck.feed_event(event)
	deck.process_tick()
	var semantic: Dictionary = deck.input_router.snapshot_for_seat(1)
	print("FLAGSHIP CLIENT [%s]: SEMANTIC INPUT SENT online=%s move=%s" % [
		game_id, str(net.online), str(semantic.get("move"))])


func _on_snapshot(_peer_id: int, state: Dictionary) -> void:
	var combat_state: Dictionary = state.get("combat", {})
	var state_actors: Dictionary = combat_state.get("actors", {})
	var authoritative: Dictionary = state_actors.get(1, state_actors.get("1", {}))
	var live: Dictionary = deck.cartridge.actor_state(1)
	if authoritative.is_empty() or live.is_empty():
		return
	var authoritative_pos := Vector2(authoritative.get("pos", Vector2.ZERO))
	var live_pos := Vector2(live.get("pos", Vector2.ZERO))
	snapshot_ok = authoritative_pos.distance_to(initial_remote_pos) > 0.01 \
		and live_pos.distance_to(authoritative_pos) < 0.001 \
		and int(deck.cartridge.get("tick")) == int(state.get("tick", -1))
	print("FLAGSHIP CLIENT [%s]: SNAPSHOT CONVERGED=%s pos=%s" % [
		game_id, str(snapshot_ok), str(live_pos)])


func _on_result(_peer_id: int, result: Dictionary) -> void:
	result_signals += 1
	result_received = String(result.get("game_id", "")) == game_id \
		and String(result.get("outcome", "")) == "complete"
	if result_signals == 1:
		get_tree().create_timer(0.65).timeout.connect(_finish_audit)


func _finish_audit() -> void:
	var ledger_count := (deck.ledger.recent_results as Array).size()
	var ok := snapshot_ok and result_received and result_signals == 1 and ledger_count == 1
	var ack := {
		"event_id": "client-audit-%s" % game_id,
		"type": "client_audit",
		"game_id": game_id,
		"snapshot_ok": snapshot_ok,
		"ledger_count": ledger_count,
		"result_signals": result_signals,
	}
	net.arcade.send_event(ack)
	print("FLAGSHIP CLIENT [%s]: RESULT IDEMPOTENT ledger=%d signals=%d" % [
		game_id, ledger_count, result_signals])
	print("FLAGSHIP CLIENT [%s]: %s" % [game_id,
		"ALL CHECKS PASSED" if ok else "FAILURES PRESENT"])
	get_tree().create_timer(0.5).timeout.connect(func() -> void:
		get_tree().quit(0 if ok else 1))
