## ONLINE in Phase 1 means another powered terminal in this DRIVN session. No
## external accounts, public matchmaking, or invented internet peers.
extends Node

class FakeBridge extends Node:
	var session_id := "road-session"
	var game_id := ""
	var members: Dictionary = {1: true, 2: true}
	var invites: Array = []
	func invite(peer_id: int, offer: Dictionary) -> bool:
		if not members.has(peer_id):
			return false
		invites.append(offer.duplicate(true))
		return true
	func is_host_authority() -> bool:
		return true
	func send_snapshot(_event_id: String, _state: Dictionary) -> bool:
		return true
	func send_result(_result: Dictionary) -> bool:
		return true

class Harness extends Node3D:
	var remote_players: Dictionary = {}
	func notify(_text: String) -> void:
		pass

class LobbyBridge extends Node:
	signal invite_received(peer_id: int, offer: Dictionary)
	signal lobby_response_received(peer_id: int, response: Dictionary)
	signal input_received(peer_id: int, tick: int, snapshot: Dictionary)
	signal event_received(peer_id: int, event: Dictionary)
	signal snapshot_received(peer_id: int, state: Dictionary)
	signal result_received(peer_id: int, result: Dictionary)

	var local_peer_id := 1
	var host_authority := false
	var session_id := ""
	var game_id := ""
	var host_peer := 0
	var members: Dictionary = {}
	var partner: Node = null
	var invites: Array = []
	var responses: Array = []
	var sent_inputs: Array = []

	func begin_session(new_session_id: String, new_game_id: String, new_host: int,
			new_members: Array) -> bool:
		if new_session_id == "" or new_host <= 0 or not new_members.has(new_host):
			return false
		session_id = new_session_id
		game_id = new_game_id
		host_peer = new_host
		members.clear()
		for peer_value in new_members:
			members[int(peer_value)] = true
		return true

	func clear_session() -> void:
		session_id = ""
		game_id = ""
		host_peer = 0
		members.clear()

	func add_member(peer_id: int) -> bool:
		if peer_id <= 0 or members.has(peer_id):
			return false
		members[peer_id] = true
		return true

	func remove_member(peer_id: int) -> bool:
		if not members.has(peer_id) or peer_id == host_peer:
			return false
		members.erase(peer_id)
		return true

	func invite(peer_id: int, offer: Dictionary) -> bool:
		if partner == null or peer_id != int(partner.get("local_peer_id")):
			return false
		var envelope := offer.duplicate(true)
		envelope["kind"] = "invite"
		invites.append(envelope.duplicate(true))
		partner.invite_received.emit(local_peer_id, envelope)
		return true

	func accept_lobby(peer_id: int, response: Dictionary) -> bool:
		if partner == null or peer_id != int(partner.get("local_peer_id")):
			return false
		var envelope := response.duplicate(true)
		envelope["kind"] = "accept"
		responses.append(envelope.duplicate(true))
		partner.lobby_response_received.emit(local_peer_id, envelope)
		return true

	func send_event(event: Dictionary) -> bool:
		if partner == null:
			return false
		partner.event_received.emit(local_peer_id, event.duplicate(true))
		return true

	func send_input(tick: int, snapshot: Dictionary) -> bool:
		sent_inputs.append({"tick": tick, "snapshot": snapshot.duplicate(true)})
		return true

	func send_snapshot(_event_id: String, _state: Dictionary) -> bool:
		return true

	func send_result(_result: Dictionary) -> bool:
		return true

	func is_host_authority() -> bool:
		return host_authority

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_ONLINE_MP: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_ONLINE_MP: start")
	get_tree().create_timer(75.0).timeout.connect(func() -> void:
		print("GAME_ONLINE_MP: WATCHDOG")
		get_tree().quit(1))
	var main: Node3D = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _frame in 10:
		await get_tree().process_frame
	main.game_deck.ledger.unlock("dial_tanks")
	var host_terminal: Node3D = main.game_console
	if host_terminal == null or not host_terminal.has_method("online_offer"):
		_check("the physical console exposes the generic online terminal broker", false)
		_finish()
		return
	_check("the physical console exposes the generic online terminal broker", true)
	var remote_terminal := ProtoGameConsole.create(main, main.game_deck, main.game_shell)
	main.add_child(remote_terminal)
	remote_terminal.global_position = host_terminal.global_position + Vector3(500, 0, 0)
	var bridge := FakeBridge.new()
	bridge.name = "FakeArcade"
	main.add_child(bridge)
	main.game_deck.arcade_net = bridge

	_check("a wrong session cannot form an online terminal offer",
		host_terminal.online_offer("dial_tanks", 2, remote_terminal, "wrong-session").is_empty())
	remote_terminal.set_powered(false)
	_check("an unpowered remote terminal cannot join",
		host_terminal.online_offer("dial_tanks", 2, remote_terminal, "road-session").is_empty())
	remote_terminal.set_powered(true)
	_check("a non-member cannot be invented as an online player",
		host_terminal.online_offer("dial_tanks", 99, remote_terminal, "road-session").is_empty())
	_check("locked ordinary media cannot be offered online",
		host_terminal.online_offer("red_sky", 2, remote_terminal, "road-session").is_empty())
	var offer: Dictionary = host_terminal.online_offer("dial_tanks", 2, remote_terminal, "road-session")
	_check("two powered same-session terminals create one real remote offer",
		not offer.is_empty() and bridge.invites.size() == 1
		and int(offer.get("peer_id", 0)) == 2)
	_check("accepted remote offer starts the ordinary online cartridge contract",
		host_terminal.start_online_offer(offer) and main.game_deck.state == "PLAYING"
		and bool(main.game_deck.current_context.get("online", false))
		and String(main.game_deck.current_context.get("session_id", "")) == "road-session")
	_check("online terminal policy never changes world time scale", Engine.time_scale == 1.0)
	await _run_lobby_handshake()
	_finish()


func _run_lobby_handshake() -> void:
	var host_main := Harness.new()
	var client_main := Harness.new()
	add_child(host_main)
	add_child(client_main)
	var host_deck := ProtoGameDeck.create(host_main)
	var client_deck := ProtoGameDeck.create(client_main)
	host_main.add_child(host_deck)
	client_main.add_child(client_deck)
	host_deck.set_process(false)
	client_deck.set_process(false)
	var host_shell := ProtoGameShell.create(host_deck)
	var client_shell := ProtoGameShell.create(client_deck)
	host_main.add_child(host_shell)
	client_main.add_child(client_shell)
	var host_terminal := ProtoGameConsole.create(host_main, host_deck, host_shell)
	var client_terminal := ProtoGameConsole.create(client_main, client_deck, client_shell)
	host_main.add_child(host_terminal)
	client_main.add_child(client_terminal)
	host_shell.attach_terminal(host_terminal, host_terminal.session_broker)
	client_shell.attach_terminal(client_terminal, client_terminal.session_broker)
	var host_bridge := LobbyBridge.new()
	var client_bridge := LobbyBridge.new()
	host_bridge.local_peer_id = 1
	host_bridge.host_authority = true
	client_bridge.local_peer_id = 2
	host_bridge.partner = client_bridge
	client_bridge.partner = host_bridge
	host_main.add_child(host_bridge)
	client_main.add_child(client_bridge)
	host_deck.attach_net(host_bridge)
	client_deck.attach_net(client_bridge)
	host_deck.ledger.unlock("dial_tanks")
	var remote_body := CharacterBody3D.new()
	remote_body.name = "REMOTE TWO"
	host_main.add_child(remote_body)
	host_main.remote_players[2] = remote_body
	var host_body := CharacterBody3D.new()
	host_body.name = "REMOTE HOST"
	client_main.add_child(host_body)
	client_main.remote_players[1] = host_body
	host_bridge.begin_session("road-spectate", "dial_tanks", 1, [1])

	var host_broker: RefCounted = host_terminal.session_broker
	var client_broker: RefCounted = client_terminal.session_broker
	var offered := bool(host_broker.configure_lobby("dial_tanks", "online", true)) \
		and bool(host_broker.invite_peer(2))
	_check("ONLINE GAME delivers one pending invitation to the remote terminal",
		offered and (client_broker.pending_invitations() as Array).size() == 1)
	if not offered or (client_broker.pending_invitations() as Array).is_empty():
		return
	client_terminal.interact(client_main)
	await get_tree().process_frame
	_check("a pending online invitation opens MATCH even when the cartridge is locked",
		client_shell.current_view == "match" and client_shell.lobby.visible)
	var invitation: Dictionary = (client_broker.pending_invitations() as Array)[0]
	var invitation_id := String(invitation.get("invitation_id", ""))
	client_terminal.set("powered", false)
	_check("an unpowered terminal cannot join or spectate",
		not bool(client_broker.join_invitation(invitation_id, true))
		and String(client_broker.lobby_snapshot().get("status", "")) == "CONSOLE HAS NO POWER")
	client_terminal.set("powered", true)
	_check("player JOIN MATCH requires ownership without consuming the invite",
		not bool(client_broker.join_invitation(invitation_id, false))
		and String(client_broker.lobby_snapshot().get("status", "")) == "CARTRIDGE NOT OWNED"
		and (client_broker.pending_invitations() as Array).size() == 1)
	var expired := invitation.duplicate(true)
	expired["invitation_id"] = "expired-proof"
	expired["expires_at"] = Time.get_ticks_msec() - 1
	client_broker.invitations["expired-proof"] = expired
	var seats_before_expiry := (client_broker.lobby_snapshot().get("seats", []) as Array).size()
	_check("an expired invitation cannot mutate the online roster",
		not bool(client_broker.join_invitation("expired-proof", true))
		and String(client_broker.lobby_snapshot().get("status", "")) == "INVITATION EXPIRED"
		and (client_broker.lobby_snapshot().get("seats", []) as Array).size() == seats_before_expiry)
	_check("SPECTATE bypasses ownership but creates no player seat",
		bool(client_broker.join_invitation(invitation_id, true))
		and (host_broker.lobby_snapshot().get("spectators", []) as Array).has(2)
		and not _seat_has_peer(host_broker.lobby_snapshot().get("seats", []), 2))
	_check("an accepted spectator is removed from invite candidates",
		not (host_broker.eligible_peers("online") as Array).any(func(row: Dictionary) -> bool:
			return int(row.get("peer_id", 0)) == 2))
	_check("the accepted online invitation is one-use",
		not bool(client_broker.join_invitation(invitation_id, true))
		and String(client_broker.lobby_snapshot().get("status", "")) == "INVITATION ALREADY USED")
	_check("host START MATCH launches a read-only remote spectator",
		bool(host_broker.start_match()) and host_deck.state == "PLAYING"
		and client_deck.state == "SPECTATING" and client_deck.active_seats.is_empty())
	var history_before := (client_deck.ledger.serialize().get("history", []) as Array).size()
	client_bridge.result_received.emit(1, {"result_id": "spectator-result", "game_id": "dial_tanks",
		"ruleset": "stock-1", "primary": 1, "secondary": {}, "outcome": "complete",
		"ranked": true})
	_check("spectators neither send input nor write observed results to their ledger",
		client_bridge.sent_inputs.is_empty()
		and (client_deck.ledger.serialize().get("history", []) as Array).size() == history_before)

	host_deck.stop("next proof")
	client_deck.stop("next proof")
	host_broker.leave_lobby("next proof")
	client_broker.leave_lobby("next proof")
	host_bridge.begin_session("road-player", "dial_tanks", 1, [1])
	client_bridge.clear_session()
	client_deck.ledger.unlock("dial_tanks")
	var player_offered := bool(host_broker.configure_lobby("dial_tanks", "online", false)) \
		and bool(host_broker.invite_peer(2))
	var player_pending: Array = client_broker.pending_invitations()
	_check("a second online invitation can target an owning player",
		player_offered and player_pending.size() == 1)
	if not player_offered or player_pending.is_empty():
		return
	var player_id := String((player_pending[0] as Dictionary).get("invitation_id", ""))
	client_bridge.session_id = "wrong-road-session"
	_check("a wrong live DRIVN session cannot consume JOIN MATCH",
		not bool(client_broker.join_invitation(player_id, false))
		and String(client_broker.lobby_snapshot().get("status", "")) == "WRONG DRIVN SESSION"
		and (client_broker.pending_invitations() as Array).size() == 1)
	client_bridge.clear_session()
	client_main.remote_players.erase(1)
	_check("a departed host invalidates JOIN MATCH without consuming it",
		not bool(client_broker.join_invitation(player_id, false))
		and String(client_broker.lobby_snapshot().get("status", "")) == "MATCH HOST LEFT"
		and (client_broker.pending_invitations() as Array).size() == 1)
	client_main.remote_players[1] = host_body
	_check("JOIN MATCH adds the remote as a distinct online seat",
		bool(client_broker.join_invitation(player_id, false))
		and _seat_has_peer(host_broker.lobby_snapshot().get("seats", []), 2))
	_check("both owning terminals enter PLAY on host start",
		bool(host_broker.start_match()) and host_deck.state == "PLAYING"
		and client_deck.state == "PLAYING")
	client_broker.leave_lobby("player left")
	_check("online LEAVE LOBBY removes the remote host seat and membership",
		not _seat_has_peer(host_broker.lobby_snapshot().get("seats", []), 2)
		and not host_bridge.members.has(2)
		and String(client_broker.lobby_snapshot().get("game_id", "")) == "")
	host_bridge.clear_session()
	host_bridge.begin_session("road-reconnected", "dial_tanks", 1, [1])
	_check("reconfiguring after a DRIVN reconnect adopts the fresh session id",
		bool(host_broker.configure_lobby("dial_tanks", "online", true))
		and String(host_broker.lobby_snapshot().get("session_id", ""))
			== "road-reconnected")


func _seat_has_peer(seats_value: Variant, peer_id: int) -> bool:
	var seats: Array = seats_value if seats_value is Array else []
	return seats.any(func(seat: Dictionary) -> bool:
		return int(seat.get("peer_id", 0)) == peer_id)


func _finish() -> void:
	print("GAME_ONLINE_MP RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_ONLINE_MP: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
