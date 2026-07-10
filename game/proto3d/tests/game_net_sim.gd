## GAME DECK network proof: one generic envelope validates membership, host
## snapshot authority, monotonic inputs, event/result idempotency, and both
## turn-based and asynchronous challenge traffic without a per-game RPC.
## Run: Godot --headless --path game res://proto3d/tests/game_net_sim.tscn
extends Node

class FakeArcade:
	extends Node
	signal input_received(peer_id: int, tick: int, snapshot: Dictionary)
	signal event_received(peer_id: int, event: Dictionary)
	signal snapshot_received(peer_id: int, state: Dictionary)
	signal result_received(peer_id: int, result: Dictionary)

	var host_authority := true
	var sent_inputs: Array = []
	var sent_snapshots: Array = []
	var sent_results: Array = []

	func is_host_authority() -> bool:
		return host_authority

	func send_input(new_tick: int, snapshot: Dictionary) -> bool:
		sent_inputs.append({"tick": new_tick, "snapshot": snapshot.duplicate(true)})
		return true

	func send_event(_event: Dictionary) -> bool:
		return true

	func send_snapshot(event_id: String, state: Dictionary) -> bool:
		sent_snapshots.append({"event_id": event_id, "state": state.duplicate(true)})
		return true

	func send_result(result: Dictionary) -> bool:
		sent_results.append(result.duplicate(true))
		return true

var passed := 0
var failed := 0
var event_count := 0
var input_count := 0
var snapshot_count := 0
var result_count := 0
var lobby_offer_count := 0
var lobby_response_count := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_NET: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_NET: start")
	get_tree().create_timer(35.0).timeout.connect(func() -> void:
		print("GAME_NET: WATCHDOG")
		get_tree().quit(1))
	var bridge_script: GDScript = load("res://proto3d/games/game_net.gd") as GDScript
	_check("the generic arcade bridge exists", bridge_script != null)
	if bridge_script == null:
		_finish()
		return
	var net: Node = ProtoNet.create(self)
	add_child(net)
	var bridge: Node = net.get("arcade")
	_check("ProtoNet owns the bridge at a stable child path", bridge != null and bridge.name == "Arcade")
	_check("offline send calls fail without state mutation", not bridge.invite(2, {
		"session_id": "room", "game_id": "crown_of_ash"}) and bridge.session_id == "")

	bridge.event_received.connect(func(_peer: int, _event: Dictionary) -> void: event_count += 1)
	bridge.input_received.connect(func(_peer: int, _tick: int, _snapshot: Dictionary) -> void: input_count += 1)
	bridge.snapshot_received.connect(func(_peer: int, _state: Dictionary) -> void: snapshot_count += 1)
	bridge.result_received.connect(func(_peer: int, _result: Dictionary) -> void: result_count += 1)
	if bridge.has_signal("invite_received"):
		bridge.invite_received.connect(func(_peer: int, _offer: Dictionary) -> void:
			lobby_offer_count += 1)
	if bridge.has_signal("lobby_response_received"):
		bridge.lobby_response_received.connect(func(_peer: int, _response: Dictionary) -> void:
			lobby_response_count += 1)
	var has_lobby_api := bridge.has_method("add_member") and bridge.has_method("remove_member") \
		and bridge.has_method("accept_lobby") and bridge.has_signal("lobby_response_received")
	_check("the bridge exposes lobby membership and response APIs", has_lobby_api)
	if not has_lobby_api:
		_finish()
		return
	_check("a known game session begins", bridge.begin_session("crown-room", "crown_of_ash", 1, [1, 2]))
	_check("unknown game session is rejected", not bridge.begin_session("bad", "not_a_game", 1, [1, 2]))
	_check("host can add one accepted member but not duplicate it",
		bridge.add_member(3) and not bridge.add_member(3) and bridge.members.has(3))
	_check("host can remove a present member but not invent a removal",
		bridge.remove_member(3) and not bridge.remove_member(3) and not bridge.members.has(3))
	var lobby_offer := {"kind": "invite", "lobby_action": "offer",
		"invitation_id": "crown-invite-1", "session_id": "crown-room",
		"game_id": "crown_of_ash", "host_peer": 1, "capacity": 2,
		"seed": 71, "bot_fill": true}
	_check("one validated lobby offer is accepted exactly once",
		bridge.ingest_reliable(1, lobby_offer)
		and not bridge.ingest_reliable(1, lobby_offer) and lobby_offer_count == 1)
	var malformed_offer := lobby_offer.duplicate(true)
	malformed_offer["invitation_id"] = ""
	_check("a lobby offer missing identity is rejected",
		not bridge.ingest_reliable(1, malformed_offer))
	var lobby_response := {"kind": "accept", "lobby_action": "accept_spectator",
		"invitation_id": "crown-invite-1", "session_id": "crown-room",
		"game_id": "crown_of_ash", "host_peer": 1}
	_check("one validated lobby response is accepted exactly once",
		bridge.ingest_reliable(2, lobby_response)
		and not bridge.ingest_reliable(2, lobby_response) and lobby_response_count == 1)
	var deck_script := load("res://proto3d/games/game_deck.gd") as GDScript
	var deck: Node = deck_script.create(self)
	add_child(deck)
	deck.attach_net(bridge)
	deck.launch("crown_of_ash", {"source": "session", "online": true, "local_side": "b"})
	deck.start(70, [{"seat": 0, "profile_id": "host", "side": "b"}])

	var chess_event := {"session_id": "crown-room", "game_id": "crown_of_ash",
		"kind": "event", "event_id": "move-1", "payload": {"from": "e2", "to": "e4"}}
	_check("member turn event is accepted", bridge.ingest_reliable(2, chess_event))
	_check("accepted turn event reaches the live cartridge", deck.cartridge.piece_at(Vector2i(4, 4)) == "wP")
	_check("duplicate turn event is rejected", not bridge.ingest_reliable(2, chess_event) and event_count == 1)
	var outsider_event := chess_event.duplicate(true)
	outsider_event["event_id"] = "move-outsider"
	_check("non-member event is rejected", not bridge.ingest_reliable(9, outsider_event))
	deck.attach_net(null)

	var input := {"session_id": "crown-room", "game_id": "crown_of_ash",
		"kind": "input", "tick": 12, "payload": {"move": Vector2.RIGHT}}
	_check("member input tick is accepted", bridge.ingest_input(2, input))
	input["tick"] = 11
	_check("stale input tick is rejected", not bridge.ingest_input(2, input) and input_count == 1)

	var snapshot := {"session_id": "crown-room", "game_id": "crown_of_ash",
		"kind": "snapshot", "event_id": "snap-1", "payload": {"board": []}}
	_check("non-host snapshot is rejected", not bridge.ingest_reliable(2, snapshot))
	_check("host snapshot is accepted", bridge.ingest_reliable(1, snapshot) and snapshot_count == 1)

	var result := {"result_id": "net-result-1", "game_id": "crown_of_ash", "ruleset": "stock-1",
		"primary": 1, "secondary": {}, "outcome": "complete", "ranked": true}
	var result_envelope := {"session_id": "crown-room", "game_id": "crown_of_ash",
		"kind": "result", "event_id": "result-event-1", "payload": result}
	_check("member result is accepted once", bridge.ingest_reliable(2, result_envelope))
	_check("duplicate result is rejected", not bridge.ingest_reliable(2, result_envelope) and result_count == 1)

	_check("WASTE HEAP challenge uses the same reliable seam",
		bridge.begin_session("waste-challenge", "waste_heap", 1, [1, 2])
		and bridge.ingest_reliable(2, {"session_id": "waste-challenge", "game_id": "waste_heap",
			"kind": "event", "event_id": "challenge-1", "payload": {"type": "challenge", "seed": 4242}}))
	_check("unknown envelope game is rejected", not bridge.ingest_reliable(2, {
		"session_id": "waste-challenge", "game_id": "ghost", "kind": "event",
		"event_id": "ghost-1", "payload": {}}))

	var host_arcade := FakeArcade.new()
	add_child(host_arcade)
	var host_deck: Node = deck_script.create(self)
	add_child(host_deck)
	host_deck.attach_net(host_arcade)
	host_deck.launch("waste_heap", {"source": "session", "online": true,
		"local_peer_id": 1, "session_id": "realtime-host"})
	host_deck.start(707, [{"seat": 1, "peer_id": 2, "profile_id": "remote"}])
	host_deck.cartridge.restore_snapshot({
		"board": [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
		"score": 0, "highest_part": 2, "rng_state": 707, "tick": 0,
	})
	var remote_left := {"seat": 1, "device": 4, "move": Vector2.LEFT,
		"aim": Vector2.RIGHT, "held": {"move_left": true},
		"pressed": {"move_left": true}, "released": {}}
	host_arcade.input_received.emit(2, 8, remote_left)
	var stale_right := remote_left.duplicate(true)
	stale_right["move"] = Vector2.RIGHT
	stale_right["held"] = {"move_right": true}
	stale_right["pressed"] = {"move_right": true}
	host_arcade.input_received.emit(2, 7, stale_right)
	host_deck.process_tick()
	_check("remote real-time input reaches its declared host seat", host_deck.cartridge.board[0][0] == 4)
	_check("the deck rejects stale remote input ticks", int(host_deck._remote_input_ticks.get(2, 0)) == 8
		and Vector2(host_deck._remote_inputs[2].get("move", Vector2.ZERO)) == Vector2.LEFT)
	host_deck.process_tick()
	host_deck.process_tick()
	_check("only the host publishes authoritative cartridge snapshots",
		host_arcade.sent_snapshots.size() == 1)
	host_deck.cartridge.debug_force_finish()
	_check("the host publishes one normalized shared result", host_arcade.sent_results.size() == 1)

	var client_arcade := FakeArcade.new()
	client_arcade.host_authority = false
	add_child(client_arcade)
	var client_deck: Node = deck_script.create(self)
	add_child(client_deck)
	client_deck.attach_net(client_arcade)
	client_deck.launch("waste_heap", {"source": "session", "online": true,
		"local_peer_id": 2, "session_id": "realtime-client"})
	client_deck.start(708, [{"seat": 1, "peer_id": 2, "device": -1, "profile_id": "client"}])
	client_deck.process_tick()
	_check("a client streams its local semantic snapshot", client_arcade.sent_inputs.size() == 1)
	_check("a client never publishes authoritative snapshots", client_arcade.sent_snapshots.is_empty())

	net.leave()
	_check("leaving DRIVN clears arcade session state", bridge.session_id == "" and bridge.members.is_empty())
	_finish()


func notify(_message: String) -> void:
	pass


func _finish() -> void:
	print("GAME_NET RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_NET: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
