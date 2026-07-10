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
	_finish()


func _finish() -> void:
	print("GAME_ONLINE_MP RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_ONLINE_MP: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
