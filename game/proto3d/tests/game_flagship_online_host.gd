## Real ENet authority proof shared by both flagship shooters. A second Godot
## process drives seat 1 through the ordinary semantic-input path; this host
## advances the real cartridge, publishes a deep combat snapshot, and proves
## normalized results remain idempotent over the wire.
extends Node

const PORT := 24783
const SEED := 91847

var game_id := ""
var session_id := ""
var net: ProtoNet = null
var deck: Node = null
var remote_peer := 0
var initial_remote_pos := Vector2.ZERO
var saw_remote_input := false
var sent_snapshot := false
var client_ack := false
var remote_players: Dictionary = {}


func notify(_text: String) -> void:
	pass


func _ready() -> void:
	game_id = _selected_game()
	if game_id not in ["rust_runners", "black_grid"]:
		print("FLAGSHIP HOST: INVALID GAME %s" % game_id)
		get_tree().quit(1)
		return
	session_id = "flagship-wire-proof-%s" % game_id
	net = ProtoNet.create(self)
	add_child(net)
	net.peer_joined.connect(_on_peer_joined)
	if not net.host(PORT):
		print("FLAGSHIP HOST [%s]: BIND FAILED" % game_id)
		get_tree().quit(1)
		return
	print("FLAGSHIP HOST [%s]: LISTENING" % game_id)
	get_tree().create_timer(18.0).timeout.connect(func() -> void:
		print("FLAGSHIP HOST [%s]: WATCHDOG FAIL" % game_id)
		get_tree().quit(1))


func _selected_game() -> String:
	var selected := OS.get_environment("FLAGSHIP_GAME")
	if selected != "":
		return selected
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--flagship-game="):
			return argument.trim_prefix("--flagship-game=")
	return ""


func _on_peer_joined(peer_id: int) -> void:
	remote_peer = peer_id
	var members: Array = [1, remote_peer]
	if not net.arcade.begin_session(session_id, game_id, 1, members):
		print("FLAGSHIP HOST [%s]: SESSION FAIL" % game_id)
		get_tree().quit(1)
		return
	deck = ProtoGameDeck.create(self)
	add_child(deck)
	deck.set_process(false)
	deck.attach_net(net.arcade)
	net.arcade.input_received.connect(_on_remote_input)
	net.arcade.event_received.connect(_on_remote_event)
	var context := _match_context(1)
	var seats: Array = [
		{"seat": 0, "peer_id": 1, "device": -1, "profile_id": "host"},
		{"seat": 1, "peer_id": remote_peer, "device": -1, "profile_id": "remote"},
	]
	if not deck.launch(game_id, context) or not deck.start(SEED, seats):
		print("FLAGSHIP HOST [%s]: DECK START FAIL" % game_id)
		get_tree().quit(1)
		return
	initial_remote_pos = Vector2(deck.cartridge.actor_state(1).get("pos", Vector2.ZERO))
	print("FLAGSHIP HOST [%s]: MATCH READY peer=%d pos=%s" % [
		game_id, remote_peer, str(initial_remote_pos)])


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


func _on_remote_input(peer_id: int, _input_tick: int, state: Dictionary) -> void:
	if peer_id != remote_peer or saw_remote_input:
		return
	var move: Vector2 = state.get("move", Vector2.ZERO)
	saw_remote_input = move.x > 0.9 and int(state.get("seat", -1)) == 1
	if not saw_remote_input:
		return
	# Three authority ticks are the stock Game Deck snapshot cadence.
	deck.process_tick()
	deck.process_tick()
	deck.process_tick()
	var remote_pos := Vector2(deck.cartridge.actor_state(1).get("pos", Vector2.ZERO))
	sent_snapshot = remote_pos.distance_to(initial_remote_pos) > 0.01 \
		and int(deck.cartridge.get("tick")) == 3
	print("FLAGSHIP HOST [%s]: REMOTE INPUT APPLIED pos=%s" % [game_id, str(remote_pos)])
	call_deferred("_publish_result")


func _publish_result() -> void:
	if not bool(deck.cartridge.debug_force_finish()):
		print("FLAGSHIP HOST [%s]: RESULT FINISH FAIL" % game_id)
		get_tree().quit(1)
		return
	var result: Dictionary = deck.cartridge.get("last_result")
	# Deliberately duplicate the result. The receiver and ledger must reject it.
	get_tree().create_timer(0.15).timeout.connect(func() -> void:
		net.arcade.send_result(result))
	print("FLAGSHIP HOST [%s]: RESULT PUBLISHED" % game_id)


func _on_remote_event(peer_id: int, event: Dictionary) -> void:
	if peer_id != remote_peer or String(event.get("type", "")) != "client_audit" \
			or String(event.get("game_id", "")) != game_id:
		return
	client_ack = bool(event.get("snapshot_ok", false)) \
		and int(event.get("ledger_count", 0)) == 1 \
		and int(event.get("result_signals", 0)) == 1
	var host_ledger_count := (deck.ledger.recent_results as Array).size()
	var ok := saw_remote_input and sent_snapshot and client_ack and host_ledger_count == 1
	print("FLAGSHIP HOST [%s]: CLIENT ACK snapshot=%s ledger=%d signals=%d" % [
		game_id, str(event.get("snapshot_ok", false)), int(event.get("ledger_count", 0)),
		int(event.get("result_signals", 0))])
	print("FLAGSHIP HOST [%s]: %s" % [game_id,
		"ALL CHECKS PASSED" if ok else "FAILURES PRESENT"])
	get_tree().create_timer(0.2).timeout.connect(func() -> void:
		get_tree().quit(0 if ok else 1))
