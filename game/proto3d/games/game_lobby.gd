## MATCH: the visible, controller-first face of ProtoGameSessionBroker. It owns
## no multiplayer policy; every action is rendered from a broker snapshot.
class_name ProtoGameLobby
extends Control

signal leave_requested()

const INK := Color("11100d")
const CARD := Color("242019")
const AMBER := Color("f2b735")
const BONE := Color("e8dfcf")
const DIM := Color("918675")
const RUST := Color("c94f3d")
const SIGNAL_TEAL := Color("2f8f83")

var broker: RefCounted
var game_id := ""
var context: Dictionary = {}
var selected_mode := "solo"
var selected_peer := 0
var _header: Label
var _roster: RichTextLabel
var _invitations: RichTextLabel
var _status: Label
var _bot_state: Label
var _buttons: Dictionary = {}


static func create(new_broker: RefCounted) -> Control:
	var script := load("res://proto3d/games/game_lobby.gd") as GDScript
	var control: Control = script.new()
	control.broker = new_broker
	control._build_ui()
	if new_broker != null and new_broker.has_signal("lobby_changed"):
		new_broker.lobby_changed.connect(control.refresh)
	return control


func _build_ui() -> void:
	name = "GameMatchLobby"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var layout := VBoxContainer.new()
	layout.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layout.add_theme_constant_override("separation", 7)
	add_child(layout)

	_header = Label.new()
	_header.text = "MATCH // NO CARTRIDGE"
	_header.add_theme_font_size_override("font_size", 22)
	_header.add_theme_color_override("font_color", AMBER)
	layout.add_child(_header)

	var modes := HBoxContainer.new()
	modes.add_theme_constant_override("separation", 7)
	layout.add_child(modes)
	for row in [["SOLO", "solo"], ["LOCAL GAME", "local"], ["ONLINE GAME", "online"]]:
		var button := _button(String(row[0]), SIGNAL_TEAL)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var mode := String(row[1])
		button.pressed.connect(func() -> void: select_mode(mode))
		modes.add_child(button)

	var columns := HBoxContainer.new()
	columns.size_flags_vertical = Control.SIZE_EXPAND_FILL
	columns.add_theme_constant_override("separation", 8)
	layout.add_child(columns)
	_roster = _column(columns, "SEATS", AMBER)
	_invitations = _column(columns, "INVITATIONS / NEARBY", SIGNAL_TEAL)

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 7)
	layout.add_child(actions)
	for label in ["INVITE PLAYER", "JOIN MATCH", "SPECTATE"]:
		var button := _button(label, SIGNAL_TEAL if label != "SPECTATE" else AMBER)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(func() -> void: press_action(label))
		actions.add_child(button)

	var bot_row := HBoxContainer.new()
	bot_row.add_theme_constant_override("separation", 8)
	layout.add_child(bot_row)
	var bots := _button("FILL EMPTY SEATS WITH BOTS", AMBER)
	bots.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bots.pressed.connect(func() -> void:
		var snapshot: Dictionary = broker.lobby_snapshot()
		set_bot_fill(not bool(snapshot.get("bot_fill", true))))
	bot_row.add_child(bots)
	_bot_state = Label.new()
	_bot_state.custom_minimum_size.x = 64
	_bot_state.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_bot_state.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_bot_state.add_theme_color_override("font_color", AMBER)
	bot_row.add_child(_bot_state)

	var footer := HBoxContainer.new()
	footer.add_theme_constant_override("separation", 8)
	layout.add_child(footer)
	var start := _button("START MATCH", AMBER)
	start.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	start.pressed.connect(func() -> void: press_action("START MATCH"))
	footer.add_child(start)
	var leave := _button("LEAVE LOBBY", RUST)
	leave.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	leave.pressed.connect(func() -> void: press_action("LEAVE LOBBY"))
	footer.add_child(leave)

	_status = Label.new()
	_status.text = "CHOOSE A MATCH MODE"
	_status.add_theme_color_override("font_color", DIM)
	_status.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	layout.add_child(_status)


func _column(parent: HBoxContainer, heading: String, color: Color) -> RichTextLabel:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size = Vector2(0, 128)
	var style := StyleBoxFlat.new()
	style.bg_color = INK
	style.border_color = color.darkened(0.28)
	style.set_border_width_all(1)
	style.set_content_margin_all(8)
	style.corner_radius_top_left = 8
	style.corner_radius_top_right = 8
	style.corner_radius_bottom_left = 8
	style.corner_radius_bottom_right = 8
	panel.add_theme_stylebox_override("panel", style)
	parent.add_child(panel)
	var text := RichTextLabel.new()
	text.bbcode_enabled = true
	text.fit_content = false
	text.scroll_active = true
	text.add_theme_font_size_override("normal_font_size", 15)
	text.add_theme_color_override("default_color", BONE)
	text.text = "[color=#%s]%s[/color]" % [color.to_html(false), heading]
	panel.add_child(text)
	return text


func _button(label: String, accent: Color) -> Button:
	var button := Button.new()
	button.text = label
	button.focus_mode = Control.FOCUS_ALL
	button.custom_minimum_size.y = 36
	button.add_theme_font_size_override("font_size", 15)
	button.add_theme_color_override("font_color", BONE)
	button.add_theme_color_override("font_hover_color", Color.WHITE)
	button.add_theme_color_override("font_focus_color", Color.WHITE)
	button.add_theme_stylebox_override("normal", _button_style(CARD, Color("4f4638"), 1))
	button.add_theme_stylebox_override("hover", _button_style(CARD.lightened(0.08), accent, 2))
	button.add_theme_stylebox_override("pressed", _button_style(INK, accent, 2))
	button.add_theme_stylebox_override("focus", _button_style(Color.TRANSPARENT, accent, 2))
	_buttons[label] = button
	return button


func _button_style(background: Color, border: Color, width: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(width)
	style.set_corner_radius_all(8)
	style.content_margin_left = 9
	style.content_margin_right = 9
	style.content_margin_top = 6
	style.content_margin_bottom = 6
	return style


func configure(new_game_id: String, new_context: Dictionary = {}) -> bool:
	game_id = new_game_id
	context = new_context.duplicate(true)
	selected_mode = String(context.get("mode", "solo"))
	var bot_fill := bool(context.get("bot_fill", selected_mode != "local"))
	var configured := broker != null and bool(broker.configure_lobby(
		game_id, selected_mode, bot_fill))
	refresh()
	return configured


func focus_default() -> void:
	if _buttons.has("SOLO") and visible:
		(_buttons["SOLO"] as Button).grab_focus()


func refresh() -> void:
	if broker == null:
		return
	var snapshot: Dictionary = broker.lobby_snapshot()
	if not String(snapshot.get("mode", "")).is_empty():
		selected_mode = String(snapshot.get("mode", selected_mode))
	var candidates: Array = broker.eligible_peers(selected_mode)
	if not candidates.any(func(row: Dictionary) -> bool:
		return int(row.get("peer_id", 0)) == selected_peer):
		selected_peer = int((candidates[0] as Dictionary).get("peer_id", 0)) \
			if not candidates.is_empty() else 0
	_header.text = "MATCH // %s // %d SEATS" % [String(snapshot.get("title", game_id.to_upper())),
		int(snapshot.get("capacity", 0))]
	var roster_lines: Array[String] = ["[color=#f2b735]SEATS[/color]"]
	for seat_value in snapshot.get("seats", []):
		var seat: Dictionary = seat_value
		roster_lines.append("%d  %s%s" % [int(seat.get("seat", 0)) + 1,
			String(seat.get("name", "RIDER")), "  // HOST" if int(seat.get("seat", 0)) == 0 else ""])
	for spectator_value in snapshot.get("spectators", []):
		var spectator: Dictionary = spectator_value if spectator_value is Dictionary \
			else {"name": "P%d" % int(spectator_value)}
		roster_lines.append("EYE  %s" % String(spectator.get("name", "SPECTATOR")))
	_roster.text = "\n".join(roster_lines)
	var invite_lines: Array[String] = ["[color=#2f8f83]INVITATIONS / NEARBY[/color]"]
	for candidate_value in candidates:
		var candidate: Dictionary = candidate_value
		invite_lines.append("%s%s" % ["> " if int(candidate.get("peer_id", 0)) == selected_peer else "  ",
			String(candidate.get("name", "P%d" % int(candidate.get("peer_id", 0))))])
	for invitation_value in broker.pending_invitations():
		var invitation: Dictionary = invitation_value
		invite_lines.append("P%d  // PENDING" % int(invitation.get("peer_id", 0)))
	if candidates.is_empty() and broker.pending_invitations().is_empty():
		invite_lines.append("— NO SIGNALS")
	_invitations.text = "\n".join(invite_lines)
	_bot_state.text = "ON" if bool(snapshot.get("bot_fill", true)) else "OFF"
	_bot_state.add_theme_color_override("font_color", AMBER \
		if bool(snapshot.get("bot_fill", true)) else DIM)
	_status.text = String(snapshot.get("status", "CHOOSE A MATCH MODE"))
	for mode in ["solo", "local", "online"]:
		var label: String = {"solo": "SOLO", "local": "LOCAL GAME",
			"online": "ONLINE GAME"}[mode]
		(_buttons[label] as Button).add_theme_color_override("font_color",
			AMBER if mode == selected_mode else BONE)


func select_mode(mode: String) -> bool:
	if game_id == "" or broker == null:
		return false
	selected_mode = mode
	selected_peer = 0
	var configured := bool(broker.configure_lobby(game_id, mode, mode != "local"))
	refresh()
	return configured


func select_peer(peer_id: int) -> bool:
	for candidate_value in broker.eligible_peers(selected_mode):
		var candidate: Dictionary = candidate_value
		if int(candidate.get("peer_id", 0)) == peer_id:
			selected_peer = peer_id
			refresh()
			return true
	return false


func set_bot_fill(enabled: bool) -> bool:
	var changed := broker != null and broker.has_method("set_bot_fill") \
		and bool(broker.set_bot_fill(enabled))
	refresh()
	return changed


func press_action(action: String) -> bool:
	if broker == null:
		return false
	var accepted := false
	match action:
		"INVITE PLAYER":
			accepted = bool(broker.invite_peer(selected_peer))
		"JOIN MATCH":
			var pending: Array = broker.pending_invitations()
			var invitation_id := String((pending[0] as Dictionary).get("invitation_id", "")) \
				if not pending.is_empty() else ""
			accepted = bool(broker.join_invitation(invitation_id, false))
		"SPECTATE":
			var pending: Array = broker.pending_invitations()
			var invitation_id := String((pending[0] as Dictionary).get("invitation_id", "")) \
				if not pending.is_empty() else ""
			accepted = bool(broker.join_invitation(invitation_id, true))
		"START MATCH":
			accepted = bool(broker.start_match())
		"LEAVE LOBBY":
			broker.leave_lobby("LEFT LOBBY")
			leave_requested.emit()
			accepted = true
	refresh()
	return accepted


func snapshot_ui() -> Dictionary:
	var snapshot: Dictionary = broker.lobby_snapshot() if broker != null else {}
	var labels: Array[String] = []
	var enabled: Dictionary = {}
	for label_value in _buttons.keys():
		var label := String(label_value)
		labels.append(label)
		enabled[label] = not (_buttons[label] as Button).disabled
	labels.sort()
	return {
		"labels": labels,
		"enabled": enabled,
		"selected_mode": selected_mode,
		"selected_peer": selected_peer,
		"roster": (snapshot.get("roster", []) as Array).duplicate(true),
		"invitations": broker.pending_invitations() if broker != null else [],
		"bot_fill": bool(snapshot.get("bot_fill", true)),
		"status": String(snapshot.get("status", "")),
	}
