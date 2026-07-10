## GAME DECK network proof: one generic envelope validates membership, host
## snapshot authority, monotonic inputs, event/result idempotency, and both
## turn-based and asynchronous challenge traffic without a per-game RPC.
## Run: Godot --headless --path game res://proto3d/tests/game_net_sim.tscn
extends Node

var passed := 0
var failed := 0
var event_count := 0
var input_count := 0
var snapshot_count := 0
var result_count := 0


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
	_check("a known game session begins", bridge.begin_session("crown-room", "crown_of_ash", 1, [1, 2]))
	_check("unknown game session is rejected", not bridge.begin_session("bad", "not_a_game", 1, [1, 2]))
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
	net.leave()
	_check("leaving DRIVN clears arcade session state", bridge.session_id == "" and bridge.members.is_empty())
	_finish()


func notify(_message: String) -> void:
	pass


func _finish() -> void:
	print("GAME_NET RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_NET: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
