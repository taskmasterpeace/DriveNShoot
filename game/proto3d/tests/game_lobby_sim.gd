## Visible MATCH proof: a console cartridge routes through one real lobby whose
## seven player actions are focusable, styled, and wired to broker state.
extends Node

const REQUIRED := ["SOLO", "LOCAL GAME", "ONLINE GAME", "INVITE PLAYER",
	"JOIN MATCH", "SPECTATE", "FILL EMPTY SEATS WITH BOTS"]

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
	print("GAME_LOBBY: %s - %s" % ["PASS" if ok else "FAIL", label])


func _ready() -> void:
	print("GAME_LOBBY: start")
	get_tree().create_timer(75.0).timeout.connect(func() -> void:
		print("GAME_LOBBY: WATCHDOG")
		get_tree().quit(1))
	_check("the isolated lobby implementation exists",
		FileAccess.file_exists("res://proto3d/games/game_lobby.gd"))
	if failed > 0:
		_finish()
		return

	var time_before := Engine.time_scale
	var harness := Harness.new()
	add_child(harness)
	var deck := ProtoGameDeck.create(harness)
	harness.add_child(deck)
	deck.set_process(false)
	deck.ledger.unlock("dial_tanks")
	var shell := ProtoGameShell.create(deck)
	harness.add_child(shell)
	var console := ProtoGameConsole.create(harness, deck, shell)
	harness.add_child(console)
	shell.attach_terminal(console, console.session_broker)
	console.interact(harness)
	await get_tree().process_frame
	var dial_button := _find_button_containing(shell, "DIAL TANKS")
	_check("the owned console cartridge appears in the real library", dial_button != null)
	if dial_button == null:
		_finish()
		return
	dial_button.pressed.emit()
	await get_tree().process_frame
	var lobby: Control = shell.get("lobby") as Control
	_check("console selection enters MATCH without launching", shell.current_view == "match"
		and lobby != null and lobby.visible and deck.cartridge == null)
	var focus_owner := get_viewport().gui_get_focus_owner()
	_check("MATCH moves controller focus off the hidden library",
		focus_owner is Button and lobby.is_ancestor_of(focus_owner))

	var required_buttons: Array[Button] = []
	for label in REQUIRED:
		var button := _find_button(lobby, label)
		_check("%s is visible and focusable" % label, button != null and button.visible
			and button.focus_mode == Control.FOCUS_ALL)
		if button != null:
			required_buttons.append(button)
	var styled := required_buttons.size() == REQUIRED.size()
	for button in required_buttons:
		styled = styled and button.has_theme_stylebox_override("hover") \
			and button.has_theme_stylebox_override("focus")
	_check("all seven actions expose explicit hover and focus treatment", styled)

	var solo := _find_button(lobby, "SOLO")
	var local := _find_button(lobby, "LOCAL GAME")
	var online := _find_button(lobby, "ONLINE GAME")
	var bots := _find_button(lobby, "FILL EMPTY SEATS WITH BOTS")
	var invite := _find_button(lobby, "INVITE PLAYER")
	var join := _find_button(lobby, "JOIN MATCH")
	var spectate := _find_button(lobby, "SPECTATE")
	var start := _find_button(lobby, "START MATCH")

	solo.pressed.emit()
	_check("SOLO selects one human seat", String(console.session_broker.lobby_snapshot().get(
		"mode", "")) == "solo" and (console.session_broker.lobby_snapshot().get(
		"seats", []) as Array).size() == 1)
	invite.pressed.emit()
	_check("INVITE PLAYER explains an empty candidate list",
		String(console.session_broker.lobby_snapshot().get("status", ""))
			== "NO PLAYER AVAILABLE")
	join.pressed.emit()
	_check("JOIN MATCH explains an empty invitation list",
		String(console.session_broker.lobby_snapshot().get("status", ""))
			== "NO INVITATION TO JOIN")
	spectate.pressed.emit()
	_check("SPECTATE explains that no live invitation exists",
		String(console.session_broker.lobby_snapshot().get("status", ""))
			== "NO LIVE MATCH TO SPECTATE")
	var fill_before := bool(console.session_broker.lobby_snapshot().get("bot_fill", false))
	bots.pressed.emit()
	_check("FILL EMPTY SEATS WITH BOTS toggles policy", bool(
		console.session_broker.lobby_snapshot().get("bot_fill", fill_before)) != fill_before)
	bots.pressed.emit()

	local.pressed.emit()
	var peer := CharacterBody3D.new()
	peer.name = "ROAD PARTNER"
	harness.add_child(peer)
	peer.global_position = console.global_position + Vector3(1.0, 0.0, 0.0)
	harness.remote_players[2] = peer
	lobby.call("refresh")
	_check("LOCAL GAME selects the physical-terminal mode",
		String(console.session_broker.lobby_snapshot().get("mode", "")) == "local")
	invite.pressed.emit()
	_check("INVITE PLAYER creates a visible pending invitation",
		(console.session_broker.pending_invitations() as Array).size() == 1)
	spectate.pressed.emit()
	_check("SPECTATE refuses a local invitation with an honest reason",
		String(console.session_broker.lobby_snapshot().get("status", ""))
			== "NO LIVE MATCH TO SPECTATE")
	join.pressed.emit()
	_check("JOIN MATCH consumes the pending invitation into a seat",
		(console.session_broker.lobby_snapshot().get("seats", []) as Array).size() == 2
		and (console.session_broker.pending_invitations() as Array).is_empty())
	online.pressed.emit()
	_check("ONLINE GAME refuses to invent an absent DRIVN session",
		String(console.session_broker.lobby_snapshot().get("status", ""))
			== "NO LIVE DRIVN SESSION")

	var ui: Dictionary = lobby.call("snapshot_ui")
	_check("MATCH exposes roster, invitations, selection, bots, and status",
		ui.has_all(["labels", "enabled", "selected_mode", "selected_peer", "roster",
			"invitations", "bot_fill", "status"]))
	await get_tree().process_frame
	var shell_rect: Rect2 = shell._root.get_global_rect()
	var frame: Rect2 = get_viewport().get_visible_rect()
	_check("MATCH stays inside the 720x600 shell and rendered frame",
		shell._root.custom_minimum_size == Vector2(720, 600) and frame.encloses(shell_rect))

	console.set_powered(false)
	_check("console power loss closes MATCH and clears ephemeral lobby state",
		not shell.is_open and String(console.session_broker.lobby_snapshot().get(
			"game_id", "")) == "")
	console.set_powered(true)
	_check("restored power can configure a fresh MATCH",
		shell.open_lobby("dial_tanks", {"device": "console"}))
	solo.pressed.emit()
	start.pressed.emit()
	_check("START MATCH launches the ordinary cartridge through the deck",
		shell.current_view == "play" and deck.cartridge != null and deck.state == "PLAYING")
	_check("lobby interaction never pauses DRIVN", Engine.time_scale == time_before)
	_finish()


func _find_button(root: Node, exact_text: String) -> Button:
	if root is Button and String((root as Button).text) == exact_text:
		return root as Button
	for child in root.get_children():
		var found := _find_button(child, exact_text)
		if found != null:
			return found
	return null


func _find_button_containing(root: Node, text: String) -> Button:
	if root is Button and String((root as Button).text).contains(text):
		return root as Button
	for child in root.get_children():
		var found := _find_button_containing(child, text)
		if found != null:
			return found
	return null


func _finish() -> void:
	print("GAME_LOBBY RESULTS: %d passed, %d failed" % [passed, failed])
	print("GAME_LOBBY: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
