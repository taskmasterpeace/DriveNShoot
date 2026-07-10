## ONE TERMINAL POLICY for every console cartridge. Local means the remote body
## stands at this set; online means another powered terminal in this live DRIVN
## session. It creates ordinary deck contexts and never knows game rules.
extends RefCounted

var console: Node3D = null
var deck: Node = null
var shell: CanvasLayer = null


static func create(new_console: Node3D, new_deck: Node, new_shell: CanvasLayer) -> RefCounted:
	var script := load("res://proto3d/games/game_session_broker.gd") as GDScript
	var broker: RefCounted = script.new()
	broker.console = new_console
	broker.deck = new_deck
	broker.shell = new_shell
	return broker


func local_offer(game_id: String, peer_id: int, body: Node3D, device: int = 1) -> Dictionary:
	var row := _eligible_row(game_id, "local")
	if row.is_empty() or peer_id <= 0 or body == null or not is_instance_valid(body):
		return {}
	var radius := float(row.get("local_radius_m", 0.0))
	if radius <= 0.0 or body.global_position.distance_to(console.global_position) > radius:
		return {}
	var local_peer := _local_peer_id()
	var offer := {
		"kind": "local", "game_id": game_id, "peer_id": peer_id,
		"terminal_path": String(console.get_path()), "radius_m": radius,
		"seats": [
			{"seat": 0, "peer_id": local_peer, "device": -1,
				"profile_id": "local", "name": "RIDER"},
			{"seat": 1, "peer_id": peer_id, "device": device,
				"profile_id": "peer-%d" % peer_id, "name": "P%d" % peer_id},
		],
	}
	var bridge := _bridge()
	if bridge != null and String(bridge.get("session_id")) != "" \
			and bridge.has_method("invite") and not bool(bridge.invite(peer_id, offer)):
		return {}
	return offer


func start_local_offer(offer: Dictionary) -> bool:
	if String(offer.get("kind", "")) != "local" or (offer.get("seats", []) as Array).size() < 2:
		return false
	return shell.open_game(String(offer.get("game_id", "")), {
		"source": "local", "device": "console", "auto_start": true,
		"seats": (offer.get("seats", []) as Array).duplicate(true),
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
