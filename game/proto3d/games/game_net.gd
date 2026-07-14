## ONE NETWORK SEAM FOR EVERY CARTRIDGE. Reliable envelopes carry invitations,
## discrete events, snapshots, and results; unreliable ordered envelopes carry
## real-time input ticks. Every receive path validates game/session/membership.
class_name ProtoArcadeNet
extends Node

signal invite_received(peer_id: int, offer: Dictionary)
signal lobby_response_received(peer_id: int, response: Dictionary)
signal peer_joined_game(peer_id: int, session_id: String)
signal input_received(peer_id: int, tick: int, snapshot: Dictionary)
signal event_received(peer_id: int, event: Dictionary)
signal snapshot_received(peer_id: int, state: Dictionary)
signal result_received(peer_id: int, result: Dictionary)

var proto_net: Node
var registry: RefCounted
var session_id := ""
var game_id := ""
var host_peer := 0
var members: Dictionary = {}
var _seen_event_ids: Dictionary = {}
var _seen_result_ids: Dictionary = {}
var _seen_lobby_messages: Dictionary = {}
var _last_input_tick: Dictionary = {}


static func create(new_proto_net: Node) -> Node:
	var script := load("res://proto3d/games/game_net.gd") as GDScript
	var bridge: Node = script.new()
	bridge.proto_net = new_proto_net
	var registry_script := load("res://proto3d/games/game_registry.gd") as GDScript
	bridge.registry = registry_script.load_catalog()
	bridge.name = "Arcade"
	return bridge


func begin_session(new_session_id: String, new_game_id: String, new_host_peer: int,
		new_members: Array) -> bool:
	if new_session_id == "" or registry.get_game(new_game_id).is_empty() \
			or new_host_peer <= 0 or not new_members.has(new_host_peer):
		return false
	clear_session()
	session_id = new_session_id
	game_id = new_game_id
	host_peer = new_host_peer
	for peer_value in new_members:
		var peer := int(peer_value)
		if peer > 0:
			members[peer] = true
	return true


func clear_session() -> void:
	session_id = ""
	game_id = ""
	host_peer = 0
	members.clear()
	_seen_event_ids.clear()
	_seen_result_ids.clear()
	_seen_lobby_messages.clear()
	_last_input_tick.clear()


func add_member(peer_id: int) -> bool:
	if session_id == "" or peer_id <= 0 or members.has(peer_id):
		return false
	members[peer_id] = true
	return true


func remove_member(peer_id: int) -> bool:
	if peer_id <= 0 or not members.has(peer_id) or peer_id == host_peer:
		return false
	members.erase(peer_id)
	_last_input_tick.erase(peer_id)
	return true


func invite(peer_id: int, offer: Dictionary) -> bool:
	if not _can_send() or peer_id <= 0:
		return false
	var offered_game := String(offer.get("game_id", ""))
	if registry.get_game(offered_game).is_empty():
		return false
	var envelope := offer.duplicate(true)
	envelope["kind"] = "invite"
	arcade_reliable.rpc_id(peer_id, envelope)
	return true


func accept(peer_id: int, offered_session_id: String, offered_game_id: String) -> bool:
	if not _can_send() or peer_id <= 0 or registry.get_game(offered_game_id).is_empty():
		return false
	arcade_reliable.rpc_id(peer_id, {"kind": "accept", "session_id": offered_session_id,
		"game_id": offered_game_id})
	return true


func accept_lobby(peer_id: int, response: Dictionary) -> bool:
	if not _can_send() or peer_id <= 0:
		return false
	var envelope := response.duplicate(true)
	envelope["kind"] = "accept"
	if not _valid_lobby_response(envelope):
		return false
	arcade_reliable.rpc_id(peer_id, envelope)
	return true


func send_input(tick: int, snapshot: Dictionary) -> bool:
	if not _can_send() or session_id == "" or tick <= 0:
		return false
	arcade_input.rpc({"kind": "input", "session_id": session_id, "game_id": game_id,
		"tick": tick, "payload": snapshot})
	return true


func send_event(event: Dictionary) -> bool:
	if not _can_send() or session_id == "" or String(event.get("event_id", "")) == "":
		return false
	arcade_reliable.rpc({"kind": "event", "session_id": session_id, "game_id": game_id,
		"event_id": String(event["event_id"]), "payload": event})
	return true


func send_snapshot(event_id: String, state: Dictionary) -> bool:
	if not _can_send() or not proto_net.is_server() or session_id == "" or event_id == "":
		return false
	arcade_reliable.rpc({"kind": "snapshot", "session_id": session_id, "game_id": game_id,
		"event_id": event_id, "payload": state})
	return true


func send_result(result: Dictionary) -> bool:
	if not _can_send() or session_id == "" or not _valid_result(result):
		return false
	arcade_reliable.rpc({"kind": "result", "session_id": session_id, "game_id": game_id,
		"event_id": "result:%s" % String(result["result_id"]), "payload": result})
	return true


func _can_send() -> bool:
	return proto_net != null and bool(proto_net.get("online")) and multiplayer.has_multiplayer_peer()


func is_host_authority() -> bool:
	return proto_net != null and bool(proto_net.is_server())


@rpc("any_peer", "reliable", "call_remote")
func arcade_reliable(envelope: Dictionary) -> void:
	ingest_reliable(multiplayer.get_remote_sender_id(), envelope)


@rpc("any_peer", "unreliable_ordered", "call_remote")
func arcade_input(envelope: Dictionary) -> void:
	ingest_input(multiplayer.get_remote_sender_id(), envelope)


func ingest_reliable(sender: int, envelope: Dictionary) -> bool:
	var kind := String(envelope.get("kind", ""))
	var envelope_game := String(envelope.get("game_id", ""))
	if sender <= 0 or registry.get_game(envelope_game).is_empty():
		return false
	if kind == "invite":
		if envelope.has("lobby_action"):
			if not _valid_lobby_offer(sender, envelope) \
					or not _remember_lobby_message("offer", envelope):
				return false
		invite_received.emit(sender, envelope.duplicate(true))
		return true
	if kind == "accept":
		if envelope.has("lobby_action"):
			if not _valid_lobby_response(envelope) \
					or not _remember_lobby_message("response", envelope):
				return false
			lobby_response_received.emit(sender, envelope.duplicate(true))
			return true
		peer_joined_game.emit(sender, String(envelope.get("session_id", "")))
		return true
	if not _valid_member_envelope(sender, envelope):
		return false
	var event_id := String(envelope.get("event_id", ""))
	match kind:
		"event":
			if event_id == "" or _seen_event_ids.has(event_id):
				return false
			_seen_event_ids[event_id] = true
			event_received.emit(sender, (envelope.get("payload", {}) as Dictionary).duplicate(true))
			return true
		"snapshot":
			if sender != host_peer or event_id == "" or _seen_event_ids.has(event_id):
				return false
			_seen_event_ids[event_id] = true
			snapshot_received.emit(sender, (envelope.get("payload", {}) as Dictionary).duplicate(true))
			return true
		"result":
			var result: Dictionary = envelope.get("payload", {})
			var result_id := String(result.get("result_id", ""))
			if event_id == "" or _seen_event_ids.has(event_id) or _seen_result_ids.has(result_id) \
					or not _valid_result(result):
				return false
			_seen_event_ids[event_id] = true
			_seen_result_ids[result_id] = true
			result_received.emit(sender, result.duplicate(true))
			return true
	return false


func ingest_input(sender: int, envelope: Dictionary) -> bool:
	if String(envelope.get("kind", "")) != "input" or not _valid_member_envelope(sender, envelope):
		return false
	var new_tick := int(envelope.get("tick", 0))
	if new_tick <= int(_last_input_tick.get(sender, 0)):
		return false
	_last_input_tick[sender] = new_tick
	input_received.emit(sender, new_tick, (envelope.get("payload", {}) as Dictionary).duplicate(true))
	return true


func _valid_member_envelope(sender: int, envelope: Dictionary) -> bool:
	return session_id != "" and members.has(sender) \
		and String(envelope.get("session_id", "")) == session_id \
		and String(envelope.get("game_id", "")) == game_id


func _valid_lobby_offer(sender: int, envelope: Dictionary) -> bool:
	var offered_session := String(envelope.get("session_id", ""))
	var offered_host := int(envelope.get("host_peer", 0))
	return String(envelope.get("lobby_action", "")) == "offer" \
		and String(envelope.get("invitation_id", "")) != "" \
		and offered_session != "" and offered_host > 0 and sender == offered_host \
		and (session_id == "" or offered_session == session_id)


func _valid_lobby_response(envelope: Dictionary) -> bool:
	var action := String(envelope.get("lobby_action", ""))
	var offered_session := String(envelope.get("session_id", ""))
	var offered_host := int(envelope.get("host_peer", 0))
	return action in ["accept_player", "accept_spectator", "cancel"] \
		and String(envelope.get("invitation_id", "")) != "" \
		and offered_session != "" and offered_host > 0 \
		and (session_id == "" or offered_session == session_id) \
		and (host_peer == 0 or offered_host == host_peer)


func _remember_lobby_message(prefix: String, envelope: Dictionary) -> bool:
	var key := "%s:%s:%s" % [prefix, String(envelope.get("lobby_action", "")),
		String(envelope.get("invitation_id", ""))]
	if _seen_lobby_messages.has(key):
		return false
	_seen_lobby_messages[key] = true
	return true


func _valid_result(result: Dictionary) -> bool:
	if String(result.get("result_id", "")) == "" or String(result.get("game_id", "")) != game_id:
		return false
	var row: Dictionary = registry.get_game(game_id)
	if String(result.get("ruleset", "")) != String(row.get("ruleset", "")):
		return false
	if String(result.get("outcome", "")) != "complete":
		return false
	var primary: Variant = result.get("primary", null)
	return primary is int or primary is float
