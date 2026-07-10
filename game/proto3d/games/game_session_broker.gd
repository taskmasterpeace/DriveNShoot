## ONE TERMINAL POLICY for every console cartridge. Local means the remote body
## stands at this set; online means another powered terminal in this live DRIVN
## session. It creates ordinary deck contexts and never knows game rules.
extends RefCounted

signal lobby_changed()
signal launch_ready(request: Dictionary)

const INVITE_TTL_MS := 30000
const VALID_MODES := ["solo", "local", "online"]

var console: Node3D = null
var deck: Node = null
var shell: CanvasLayer = null
var lobby: Dictionary = {}
var invitations: Dictionary = {}
var used_invitation_ids: Dictionary = {}
var status_text := ""
var _invitation_counter := 0
var _compat_local_bodies: Dictionary = {}


static func create(new_console: Node3D, new_deck: Node, new_shell: CanvasLayer) -> RefCounted:
	var script := load("res://proto3d/games/game_session_broker.gd") as GDScript
	var broker: RefCounted = script.new()
	broker.console = new_console
	broker.deck = new_deck
	broker.shell = new_shell
	return broker


func configure_lobby(game_id: String, mode: String, bot_fill: bool) -> bool:
	var row := _lobby_row(game_id, mode)
	if row.is_empty():
		return false
	var players: Dictionary = row.get("players", {})
	var capacity := maxi(1, int(players.get("max", 1)))
	var local_peer := _local_peer_id()
	lobby = {
		"game_id": game_id,
		"title": String(row.get("title", game_id.to_upper())),
		"ruleset": String(row.get("ruleset", "stock-1")),
		"mode": mode,
		"host_peer": local_peer,
		"capacity": capacity,
		"local_radius_m": float(row.get("local_radius_m", 0.0)),
		"bot_fill": bot_fill,
		"seed": absi(hash("%s:%d" % [game_id, Time.get_ticks_msec()])),
		"seats": [{
			"seat": 0, "peer_id": local_peer, "device": -1,
			"profile_id": "local", "name": "RIDER",
		}],
		"spectators": [],
		"status": "MATCH READY",
	}
	invitations.clear()
	used_invitation_ids.clear()
	_compat_local_bodies.clear()
	status_text = "MATCH READY"
	lobby_changed.emit()
	return true


func lobby_snapshot() -> Dictionary:
	if lobby.is_empty():
		return {"status": status_text}
	var snapshot := lobby.duplicate(true)
	var seats: Array = snapshot.get("seats", [])
	var spectators: Array = snapshot.get("spectators", [])
	snapshot["roster"] = seats.duplicate(true) + spectators.duplicate(true)
	snapshot["pending_invites"] = pending_invitations()
	return snapshot


func eligible_peers(mode: String = "") -> Array:
	var eligible: Array = []
	if lobby.is_empty() or (mode != "" and mode != String(lobby.get("mode", ""))):
		return eligible
	var lobby_mode := String(lobby.get("mode", ""))
	if lobby_mode == "solo":
		return eligible
	var occupied := _occupied_peer_ids()
	var main: Variant = console.get("main") if console != null else null
	if lobby_mode == "local":
		var remote_players: Dictionary = {}
		if main is Node and (main as Node).get("remote_players") is Dictionary:
			remote_players = (main as Node).get("remote_players") as Dictionary
		for peer_value in _compat_local_bodies.keys():
			if not remote_players.has(peer_value):
				remote_players[peer_value] = _compat_local_bodies[peer_value]
		var radius := float(lobby.get("local_radius_m", 0.0))
		var peer_ids: Array = remote_players.keys()
		peer_ids.sort()
		for peer_value in peer_ids:
			var peer_id := int(peer_value)
			var body: Variant = remote_players.get(peer_value)
			if peer_id <= 0 or occupied.has(peer_id) or not body is Node3D \
					or not is_instance_valid(body) or radius <= 0.0:
				continue
			var distance := (body as Node3D).global_position.distance_to(console.global_position)
			if distance <= radius:
				eligible.append({"peer_id": peer_id, "name": _peer_name(peer_id, body),
					"distance_m": distance})
		return eligible
	var bridge := _bridge()
	if bridge == null:
		return eligible
	var members: Dictionary = bridge.get("members") if bridge.get("members") is Dictionary else {}
	var member_ids: Array = members.keys()
	member_ids.sort()
	for peer_value in member_ids:
		var peer_id := int(peer_value)
		if peer_id <= 0 or peer_id == _local_peer_id() or occupied.has(peer_id):
			continue
		var member: Variant = members.get(peer_value)
		eligible.append({"peer_id": peer_id, "name": _peer_name(peer_id, member)})
	return eligible


func invite_peer(peer_id: int) -> bool:
	_expire_invitations()
	if lobby.is_empty():
		return _set_status("NO MATCH CONFIGURED")
	if peer_id <= 0:
		return _set_status("NO PLAYER AVAILABLE")
	var seats: Array = lobby.get("seats", [])
	if seats.size() + _pending_player_invitation_count() >= int(lobby.get("capacity", 1)):
		return _set_status("MATCH IS FULL")
	for invitation_value in invitations.values():
		var existing: Dictionary = invitation_value
		if String(existing.get("state", "")) == "pending" \
				and int(existing.get("peer_id", 0)) == peer_id:
			return _set_status("PLAYER ALREADY INVITED")
	if not _eligible_peer_ids(String(lobby.get("mode", ""))).has(peer_id):
		return _set_status("NO PLAYER IN TERMINAL RANGE" \
			if String(lobby.get("mode", "")) == "local" else "PLAYER NOT AVAILABLE")
	_invitation_counter += 1
	var now := Time.get_ticks_msec()
	var invitation_id := "lobby:%s:%d" % [String(lobby.get("game_id", "")), _invitation_counter]
	var invitation := {
		"invitation_id": invitation_id,
		"direction": "outgoing",
		"state": "pending",
		"game_id": String(lobby.get("game_id", "")),
		"ruleset": String(lobby.get("ruleset", "stock-1")),
		"mode": String(lobby.get("mode", "")),
		"session_id": _session_id(),
		"host_peer": int(lobby.get("host_peer", 1)),
		"peer_id": peer_id,
		"seed": int(lobby.get("seed", 1)),
		"capacity": int(lobby.get("capacity", 1)),
		"bot_fill": bool(lobby.get("bot_fill", true)),
		"created_ms": now,
		"expires_at": now + INVITE_TTL_MS,
	}
	invitations[invitation_id] = invitation
	_set_status("INVITATION SENT")
	return true


func pending_invitations() -> Array:
	_expire_invitations()
	var pending: Array = []
	for invitation_value in invitations.values():
		var invitation: Dictionary = invitation_value
		if String(invitation.get("state", "")) == "pending":
			pending.append(invitation.duplicate(true))
	pending.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return int(a.get("created_ms", 0)) < int(b.get("created_ms", 0)))
	return pending


func join_invitation(invitation_id: String, as_spectator: bool = false) -> bool:
	if invitation_id == "":
		return _set_status("NO LIVE MATCH TO SPECTATE" if as_spectator \
			else "NO INVITATION TO JOIN")
	if used_invitation_ids.has(invitation_id):
		return _set_status("INVITATION ALREADY USED")
	_expire_invitations()
	if not invitations.has(invitation_id):
		return _set_status("INVITATION EXPIRED")
	var invitation: Dictionary = invitations[invitation_id]
	if as_spectator:
		return _set_status("NO LIVE MATCH TO SPECTATE")
	if lobby.is_empty() or String(invitation.get("game_id", "")) != String(lobby.get("game_id", "")):
		return _set_status("MATCH IS NO LONGER AVAILABLE")
	var seats: Array = lobby.get("seats", [])
	if seats.size() >= int(lobby.get("capacity", 1)):
		return _set_status("MATCH IS FULL")
	var peer_id := int(invitation.get("peer_id", 0))
	if String(lobby.get("mode", "")) == "local" \
			and not _eligible_peer_ids("local").has(peer_id):
		return _set_status("PLAYER LEFT TERMINAL RANGE")
	seats.append({
		"seat": seats.size(), "peer_id": peer_id,
		"device": int(invitation.get("device", peer_id)),
		"profile_id": "peer-%d" % peer_id, "name": "P%d" % peer_id,
	})
	lobby["seats"] = seats
	used_invitation_ids[invitation_id] = true
	invitations.erase(invitation_id)
	_set_status("PLAYER JOINED")
	return true


func start_match() -> bool:
	if lobby.is_empty():
		return _set_status("NO MATCH CONFIGURED")
	var seats: Array = lobby.get("seats", [])
	var bot_fill := bool(lobby.get("bot_fill", true))
	var mode := String(lobby.get("mode", "solo"))
	var context := {
		"source": "session" if mode == "online" else mode,
		"device": "console",
		"auto_start": true,
		"online": mode == "online",
		"session_id": _session_id(),
		"local_peer_id": _local_peer_id(),
		"seed": int(lobby.get("seed", 1)),
		"seats": seats.duplicate(true),
		"bots_enabled": bot_fill,
		"actor_count": int(lobby.get("capacity", 1)) if bot_fill else maxi(2, seats.size()),
	}
	launch_ready.emit({"game_id": String(lobby.get("game_id", "")), "context": context})
	_set_status("MATCH STARTING")
	return true


func set_bot_fill(enabled: bool) -> bool:
	if lobby.is_empty():
		return _set_status("NO MATCH CONFIGURED")
	lobby["bot_fill"] = enabled
	_set_status("BOT FILL ON" if enabled else "BOT FILL OFF")
	return true


func leave_lobby(reason: String = "LEFT LOBBY") -> void:
	lobby.clear()
	invitations.clear()
	used_invitation_ids.clear()
	_compat_local_bodies.clear()
	status_text = reason.to_upper()
	lobby_changed.emit()


func local_offer(game_id: String, peer_id: int, body: Node3D, device: int = 1) -> Dictionary:
	if peer_id <= 0 or body == null or not is_instance_valid(body) \
			or not configure_lobby(game_id, "local", false):
		return {}
	_compat_local_bodies[peer_id] = body
	if not invite_peer(peer_id):
		return {}
	var pending := pending_invitations()
	if pending.is_empty():
		return {}
	var invitation_id := String((pending[0] as Dictionary).get("invitation_id", ""))
	(invitations[invitation_id] as Dictionary)["device"] = device
	if not join_invitation(invitation_id, false):
		return {}
	var radius := float(lobby.get("local_radius_m", 0.0))
	var offer := {
		"kind": "local", "game_id": game_id, "peer_id": peer_id,
		"terminal_path": String(console.get_path()), "radius_m": radius,
		"seats": (lobby.get("seats", []) as Array).duplicate(true),
	}
	var bridge := _bridge()
	if bridge != null and String(bridge.get("session_id")) != "" \
			and bridge.has_method("invite") and not bool(bridge.invite(peer_id, offer)):
		return {}
	return offer


func start_local_offer(offer: Dictionary) -> bool:
	if String(offer.get("kind", "")) != "local" or (offer.get("seats", []) as Array).size() < 2:
		return false
	if String(lobby.get("mode", "")) != "local" \
			or String(lobby.get("game_id", "")) != String(offer.get("game_id", "")):
		return false
	return shell.open_game(String(offer.get("game_id", "")), {
		"source": "local", "device": "console", "auto_start": true,
		"seats": (lobby.get("seats", []) as Array).duplicate(true),
		"bots_enabled": false,
		"actor_count": (lobby.get("seats", []) as Array).size(),
	})


func online_offer(game_id: String, peer_id: int, remote_terminal: Node,
		session_id: String) -> Dictionary:
	var row := _eligible_row(game_id, "online")
	var bridge := _bridge()
	if row.is_empty() or bridge == null or peer_id <= 0 or session_id == "" \
			or remote_terminal == null or not is_instance_valid(remote_terminal) \
			or not remote_terminal.has_method("is_powered") \
			or not bool(remote_terminal.is_powered()):
		return {}
	if String(bridge.get("session_id")) != session_id:
		return {}
	var members: Dictionary = bridge.get("members") if bridge.get("members") is Dictionary else {}
	if not members.has(peer_id):
		return {}
	var local_peer := _local_peer_id()
	var offer := {
		"kind": "online", "game_id": game_id, "peer_id": peer_id,
		"session_id": session_id, "host_peer": local_peer,
		"seats": [
			{"seat": 0, "peer_id": local_peer, "device": -1,
				"profile_id": "local", "name": "RIDER"},
			{"seat": 1, "peer_id": peer_id, "device": -2,
				"profile_id": "peer-%d" % peer_id, "name": "P%d" % peer_id},
		],
	}
	if not bridge.has_method("invite") or not bool(bridge.invite(peer_id, offer)):
		return {}
	return offer


func start_online_offer(offer: Dictionary) -> bool:
	if String(offer.get("kind", "")) != "online" or (offer.get("seats", []) as Array).size() < 2:
		return false
	return shell.open_game(String(offer.get("game_id", "")), {
		"source": "session", "device": "console", "auto_start": true,
		"online": true, "session_id": String(offer.get("session_id", "")),
		"local_peer_id": int(offer.get("host_peer", 1)),
		"seats": (offer.get("seats", []) as Array).duplicate(true),
	})


func _lobby_row(game_id: String, mode: String) -> Dictionary:
	if console == null or not console.has_method("is_powered") or not bool(console.is_powered()):
		_set_status("CONSOLE HAS NO POWER")
		return {}
	if not VALID_MODES.has(mode):
		_set_status("MATCH MODE UNKNOWN")
		return {}
	if deck == null:
		_set_status("GAME DECK OFFLINE")
		return {}
	var row: Dictionary = deck.registry.get_game(game_id)
	if row.is_empty() or not bool(deck.registry.enabled(game_id)):
		_set_status("CARTRIDGE UNKNOWN")
		return {}
	if String(row.get("platform", "")) != "console":
		_set_status("CONSOLE GAME REQUIRED")
		return {}
	if not bool(deck.ledger.is_unlocked(game_id)):
		_set_status("CARTRIDGE NOT OWNED")
		return {}
	var players: Dictionary = row.get("players", {})
	if mode == "local" and not bool(players.get("local", false)):
		_set_status("LOCAL GAME NOT SUPPORTED")
		return {}
	if mode == "online" and String(players.get("online", "")) != "same_session":
		_set_status("ONLINE GAME NOT SUPPORTED")
		return {}
	return row


func _set_status(text: String) -> bool:
	status_text = text
	if not lobby.is_empty():
		lobby["status"] = text
	lobby_changed.emit()
	return false


func _occupied_peer_ids() -> Array[int]:
	var occupied: Array[int] = []
	for seat_value in lobby.get("seats", []):
		var seat: Dictionary = seat_value
		occupied.append(int(seat.get("peer_id", 0)))
	return occupied


func _eligible_peer_ids(mode: String) -> Array[int]:
	var ids: Array[int] = []
	for candidate_value in eligible_peers(mode):
		var candidate: Dictionary = candidate_value
		ids.append(int(candidate.get("peer_id", 0)))
	return ids


func _pending_player_invitation_count() -> int:
	var total := 0
	for invitation_value in invitations.values():
		var invitation: Dictionary = invitation_value
		if String(invitation.get("state", "")) == "pending":
			total += 1
	return total


func _expire_invitations() -> void:
	var now := Time.get_ticks_msec()
	for invitation_id_value in invitations.keys():
		var invitation_id := String(invitation_id_value)
		var invitation: Dictionary = invitations[invitation_id_value]
		if int(invitation.get("expires_at", 0)) <= now:
			invitations.erase(invitation_id_value)
			status_text = "INVITATION EXPIRED"


func _peer_name(peer_id: int, source: Variant) -> String:
	if source is Node and String((source as Node).name) != "":
		return String((source as Node).name)
	if source is Dictionary:
		var row: Dictionary = source
		var declared := String(row.get("name", ""))
		if declared != "":
			return declared
	return "P%d" % peer_id


func _session_id() -> String:
	var bridge := _bridge()
	return String(bridge.get("session_id")) if bridge != null else ""


func _eligible_row(game_id: String, mode: String) -> Dictionary:
	if console == null or deck == null or not console.has_method("is_powered") \
			or not bool(console.is_powered()) or not bool(deck.registry.enabled(game_id)) \
			or not bool(deck.ledger.is_unlocked(game_id)):
		return {}
	var row: Dictionary = deck.registry.get_game(game_id)
	if String(row.get("platform", "")) != "console":
		return {}
	var players: Dictionary = row.get("players", {})
	if mode == "local" and not bool(players.get("local", false)):
		return {}
	if mode == "online" and String(players.get("online", "")) != "same_session":
		return {}
	return row


func _bridge() -> Node:
	return deck.arcade_net as Node if deck != null and deck.arcade_net != null else null


func _local_peer_id() -> int:
	var bridge := _bridge()
	if bridge != null:
		var proto_net: Variant = bridge.get("proto_net")
		if proto_net is Node and (proto_net as Node).has_method("my_id"):
			return int((proto_net as Node).my_id())
	return 1
