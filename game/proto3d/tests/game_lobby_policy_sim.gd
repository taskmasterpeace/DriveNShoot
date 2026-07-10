## Ephemeral lobby policy proof: SOLO requests, physical LOCAL GAME bodies,
## invitation revalidation/capacity, bot policy, and non-mutating failures.
extends Node

class Harness extends Node3D:
	var remote_players: Dictionary = {}
	var notices: Array[String] = []
	func notify(text: String) -> void:
		notices.append(text)

var passed := 0
var failed := 0


func _check(label: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAME_LOBBY_POLICY: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_LOBBY_POLICY: start")
	get_tree().create_timer(75.0).timeout.connect(func() -> void:
		print("GAME_LOBBY_POLICY: WATCHDOG")
		get_tree().quit(1))
	var harness := Harness.new()
	add_child(harness)
	var deck := ProtoGameDeck.create(harness)
	harness.add_child(deck)
	deck.set_process(false)
	var shell := ProtoGameShell.create(deck)
	harness.add_child(shell)
	var console := ProtoGameConsole.create(harness, deck, shell)
	harness.add_child(console)
	console.global_position = Vector3.ZERO
	var broker: RefCounted = console.session_broker
	var methods := ["configure_lobby", "lobby_snapshot", "eligible_peers",
		"invite_peer", "pending_invitations", "join_invitation", "start_match",
		"leave_lobby"]
	_check("terminal broker exposes the complete lobby policy API",
		methods.all(func(method: String) -> bool: return broker.has_method(method)))
	if failed > 0:
		_finish()
		return

	deck.ledger.unlock("dial_tanks")
	var time_before := Engine.time_scale
	console.set_powered(false)
	_check("unpowered console refuses lobby configuration",
		not bool(broker.configure_lobby("dial_tanks", "solo", true))
		and String(broker.lobby_snapshot().get("status", "")) == "CONSOLE HAS NO POWER")
	console.set_powered(true)
	_check("unknown and handheld rows cannot become console lobbies",
		not bool(broker.configure_lobby("missing", "solo", true))
		and not bool(broker.configure_lobby("waste_heap", "solo", true)))
	_check("locked cartridge cannot become an ordinary lobby",
		not bool(broker.configure_lobby("red_sky", "solo", true))
		and String(broker.lobby_snapshot().get("status", "")) == "CARTRIDGE NOT OWNED")

	var launches: Array = []
	broker.launch_ready.connect(func(request: Dictionary) -> void:
		launches.append(request.duplicate(true)))
	_check("SOLO configures one host seat and max-fill default",
		bool(broker.configure_lobby("dial_tanks", "solo", true))
		and String(broker.lobby_snapshot().get("mode", "")) == "solo"
		and (broker.lobby_snapshot().get("seats", []) as Array).size() == 1
		and bool(broker.lobby_snapshot().get("bot_fill", false))
		and int(broker.lobby_snapshot().get("capacity", 0)) == 4)
	_check("SOLO start emits one ordinary max-fill launch request",
		bool(broker.start_match()) and launches.size() == 1
		and int(((launches[0] as Dictionary).get("context", {}) as Dictionary).get(
			"actor_count", 0)) == 4
		and bool(((launches[0] as Dictionary).get("context", {}) as Dictionary).get(
			"bots_enabled", false)))
	broker.leave_lobby("solo complete")

	var peer := CharacterBody3D.new()
	peer.name = "PeerTwo"
	harness.add_child(peer)
	harness.remote_players[2] = peer
	var radius := float(deck.registry.get_game("dial_tanks").get("local_radius_m", 0.0))
	peer.global_position = console.global_position + Vector3(radius + 2.0, 0, 0)
	_check("LOCAL GAME configures but a far body is not eligible",
		bool(broker.configure_lobby("dial_tanks", "local", false))
		and (broker.eligible_peers("local") as Array).is_empty())
	for _step in 40:
		peer.velocity = (console.global_position - peer.global_position).normalized() * 5.0
		peer.move_and_slide()
		await get_tree().physics_frame
		if peer.global_position.distance_to(console.global_position) < radius - 0.4:
			break
	_check("walking a real body into range makes it eligible",
		(broker.eligible_peers("local") as Array).any(func(row: Dictionary) -> bool:
			return int(row.get("peer_id", 0)) == 2))
	_check("INVITE PLAYER creates exactly one pending invitation",
		bool(broker.invite_peer(2)) and (broker.pending_invitations() as Array).size() == 1)
	_check("duplicate pending invitation is rejected without growing state",
		not bool(broker.invite_peer(2)) and (broker.pending_invitations() as Array).size() == 1)
	var invite: Dictionary = (broker.pending_invitations() as Array)[0]
	peer.global_position = console.global_position + Vector3(radius + 1.0, 0, 0)
	_check("acceptance revalidates physical range",
		not bool(broker.join_invitation(String(invite.get("invitation_id", "")), false))
		and String(broker.lobby_snapshot().get("status", "")) == "PLAYER LEFT TERMINAL RANGE"
		and (broker.lobby_snapshot().get("seats", []) as Array).size() == 1)
	peer.global_position = console.global_position + Vector3(radius - 0.5, 0, 0)
	_check("JOIN MATCH consumes the invitation into one distinct seat",
		bool(broker.join_invitation(String(invite.get("invitation_id", "")), false))
		and (broker.lobby_snapshot().get("seats", []) as Array).size() == 2
		and (broker.pending_invitations() as Array).is_empty())
	_check("used invitation cannot be consumed twice",
		not bool(broker.join_invitation(String(invite.get("invitation_id", "")), false))
		and String(broker.lobby_snapshot().get("status", "")) == "INVITATION ALREADY USED")

	for peer_id in [3, 4, 5]:
		var body := CharacterBody3D.new()
		body.name = "Peer%d" % peer_id
		harness.add_child(body)
		body.global_position = console.global_position + Vector3(float(peer_id) * 0.2, 0, 0)
		harness.remote_players[peer_id] = body
	_check("remaining local seats can be invited and joined",
		bool(broker.invite_peer(3)))
	var invite_three: Dictionary = (broker.pending_invitations() as Array)[0]
	_check("third local seat joins", bool(broker.join_invitation(
		String(invite_three.get("invitation_id", "")), false)))
	_check("fourth local seat joins",
		bool(broker.invite_peer(4)))
	var invite_four: Dictionary = (broker.pending_invitations() as Array)[0]
	_check("fourth invitation is accepted", bool(broker.join_invitation(
		String(invite_four.get("invitation_id", "")), false)))
	_check("full lobby refuses another invitation without mutation",
		not bool(broker.invite_peer(5))
		and String(broker.lobby_snapshot().get("status", "")) == "MATCH IS FULL"
		and (broker.lobby_snapshot().get("seats", []) as Array).size() == 4)
	_check("LOCAL bot-fill off launches only accepted humans",
		bool(broker.start_match()) and launches.size() == 2
		and int(((launches[1] as Dictionary).get("context", {}) as Dictionary).get(
			"actor_count", 0)) == 4
		and not bool(((launches[1] as Dictionary).get("context", {}) as Dictionary).get(
			"bots_enabled", true)))
	broker.leave_lobby("test complete")
	_check("LEAVE LOBBY clears roster and pending invitation state",
		String(broker.lobby_snapshot().get("game_id", "")) == ""
		and (broker.pending_invitations() as Array).is_empty())
	_check("lobby policy never changes world time scale", Engine.time_scale == time_before)
	_finish()


func _finish() -> void:
	print("GAME_LOBBY_POLICY RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_LOBBY_POLICY: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
