## Event-driven WATCH · BET · ENTER board. Buttons and keyboard parity call the
## same focused runtime; opening it never changes time scale.
class_name ProtoLabSpectaclePanel
extends CanvasLayer

const BONE := Color("#eadfca")
const MUTED := Color("#aa9c86")
const AMBER := Color("#e8a33a")
const TEAL := Color("#35b6a6")
const PANEL := Color(0.075, 0.06, 0.045, 0.97)
const BORDER := Color("#684d2e")

var runtime: Node = null
var _large: Panel = null
var _compact: Panel = null
var _title: Label = null
var _body: Label = null
var _compact_text: Label = null
var _buttons: Array[Button] = []
var refresh_count: int = 0


func setup(runtime_in: Node) -> void:
	runtime = runtime_in
	layer = 86
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	_build_large(root)
	_build_compact(root)
	runtime.changed.connect(refresh)
	refresh(runtime.facts())


func _build_large(root: Control) -> void:
	_large = _panel(Vector2(720, 620))
	_large.set_anchors_preset(Control.PRESET_CENTER)
	_large.position = Vector2(-360, -310)
	_large.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(_large)
	_title = _label("SPECTACLES", 24, AMBER)
	_title.position = Vector2(24, 18)
	_large.add_child(_title)
	var law := _label("WATCH  ·  BET  ·  ENTER", 15, TEAL)
	law.position = Vector2(24, 53)
	_large.add_child(law)
	_body = _label("", 13, BONE)
	_body.position = Vector2(24, 84)
	_body.size = Vector2(672, 390)
	_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_large.add_child(_body)
	var specs: Array = [
		["WATCH [1]", Vector2(24, 492), Callable(self, "_watch")],
		["ENTER [2]", Vector2(150, 492), Callable(self, "_enter")],
		["◀ ENTRANT", Vector2(276, 492), Callable(self, "_previous")],
		["ENTRANT ▶", Vector2(402, 492), Callable(self, "_next")],
		["− STAKE", Vector2(528, 492), Callable(self, "_stake_down")],
		["+ STAKE", Vector2(24, 544), Callable(self, "_stake_up")],
		["BET [B]", Vector2(150, 544), Callable(self, "_bet")],
		["START [↵]", Vector2(276, 544), Callable(self, "_start_reset")],
		["CLOSE [J]", Vector2(528, 544), Callable(self, "close")],
	]
	for spec in specs:
		var button := _button(String(spec[0]), spec[1] as Vector2)
		button.pressed.connect(spec[2] as Callable)
		_large.add_child(button)
		_buttons.append(button)
	_large.visible = false


func _build_compact(root: Control) -> void:
	_compact = _panel(Vector2(520, 92))
	_compact.position = Vector2(18, 276)
	root.add_child(_compact)
	_compact_text = _label("SPECTACLES READY", 12, BONE)
	_compact_text.position = Vector2(16, 10)
	_compact_text.size = Vector2(488, 70)
	_compact_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_compact.add_child(_compact_text)
	_compact.visible = false


func _panel(size_in: Vector2) -> Panel:
	var panel := Panel.new()
	panel.size = size_in
	var style := StyleBoxFlat.new()
	style.bg_color = PANEL
	style.border_color = BORDER
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	style.shadow_color = Color(0, 0, 0, 0.35)
	style.shadow_size = 10
	panel.add_theme_stylebox_override("panel", style)
	return panel


func _label(text_in: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text_in
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	return label


func _button(text_in: String, at: Vector2) -> Button:
	var button := Button.new()
	button.text = text_in
	button.position = at
	button.size = Vector2(116, 38)
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for state in ["normal", "hover", "pressed"]:
		var style := StyleBoxFlat.new()
		style.bg_color = Color("#251d14") if state == "normal" else (
			Color("#49351f") if state == "hover" else Color("#5b4021"))
		style.border_color = BORDER if state == "normal" else AMBER
		style.set_border_width_all(1)
		style.set_corner_radius_all(10)
		button.add_theme_stylebox_override(state, style)
	button.add_theme_color_override("font_color", BONE)
	button.add_theme_font_size_override("font_size", 11)
	return button


func refresh(facts: Dictionary) -> void:
	refresh_count += 1
	_title.text = "%s  ·  %s" % [String(facts.get("name", "SPECTACLES")),
		String(facts.get("venue", ""))]
	var entrant_lines: Array[String] = []
	for entrant in (facts.get("entrants", []) as Array):
		entrant_lines.append("%-14s  STR %.2f  ODDS %.2f  %s" % [
			String(entrant.get("name", entrant.get("id", ""))).to_upper(),
			float(entrant.get("strength", 0.0)), float(entrant.get("odds", 0.0)),
			String(entrant.get("weapon_id", "")).to_upper()])
	var bracket_lines: Array[String] = []
	for match_row in (facts.get("matches", []) as Array):
		bracket_lines.append("%s  %s vs %s  %s" % [String(match_row["round"]),
			_name_for(facts, String(match_row["left"])), _name_for(facts, String(match_row["right"])),
			("→ " + _name_for(facts, String(match_row["winner"]))) if String(match_row["winner"]) != "" else ""])
	var ticket: Dictionary = facts.get("ticket", {})
	var ticket_line: String = "NO TICKET" if ticket.is_empty() else "%s · %d @ %.2f" % [
		String(ticket.get("id", "")).to_upper(), int(ticket.get("stake", 0)), float(ticket.get("odds", 0.0))]
	var round_state: Dictionary = facts.get("round", {})
	var current: Dictionary = facts.get("current_match", {})
	var live_line: String = _fighter_line(facts, current, round_state)
	var card_line: String = _round_card_line(facts, round_state)
	var broadcast_line: String = _broadcast_line(facts, current)
	_body.text = "%s\n\n%s\n\n%s\n%s\n%s\n\nMODE  %s     SELECT  %s\nSTAKE  %d     BANKROLL  %d     TICKET  %s\nROUND  %s     CHAMPION  %s     PAYOUT  %d\n\n%s" % [
		"\n".join(entrant_lines), "\n".join(bracket_lines), live_line, card_line,
		broadcast_line, String(facts.get("mode", "watch")).to_upper(),
		_name_for(facts, String(facts.get("selected_entrant", ""))), int(facts.get("stake", 0)),
		int(facts.get("bankroll", 0)), ticket_line, String(round_state.get("phase", "READY")).to_upper(),
		_name_for(facts, String(facts.get("champion", ""))), int(facts.get("payout", 0)),
		String(facts.get("status", ""))]
	_compact_text.text = "SPECTACLES  ·  %s  ·  %s vs %s\n%s\n%s" % [
		String(current.get("round", facts.get("phase", "READY"))).to_upper(),
		_name_for(facts, String(current.get("left", ""))),
		_name_for(facts, String(current.get("right", ""))), live_line,
		"%s · BANKROLL %d · PAYOUT %d" % [card_line,
			int(facts.get("bankroll", 0)), int(facts.get("payout", 0))]]
	_update_visibility(facts)


func _fighter_line(facts: Dictionary, current: Dictionary, round_state: Dictionary) -> String:
	var left_id: String = String(current.get("left", ""))
	var right_id: String = String(current.get("right", ""))
	var fighters: Dictionary = round_state.get("fighters", {})
	if left_id == "" or right_id == "" or not fighters.has(left_id) or not fighters.has(right_id):
		return "FIGHTERS READY"
	var health_max: float = float(round_state.get("max_health", 100.0))
	var wins: int = int(round_state.get("rounds_to_win", 2))
	var left: Dictionary = fighters[left_id]
	var right: Dictionary = fighters[right_id]
	return "%s HP %.0f/%.0f R %d/%d  ·  %s HP %.0f/%.0f R %d/%d" % [
		_name_for(facts, left_id), float(left.get("health", 0.0)), health_max,
		int(left.get("rounds", 0)), wins, _name_for(facts, right_id),
		float(right.get("health", 0.0)), health_max, int(right.get("rounds", 0)), wins]


func _round_card_line(facts: Dictionary, round_state: Dictionary) -> String:
	var card: Dictionary = round_state.get("last_card", {})
	if card.is_empty():
		return "CARD —"
	return "CARD %s · %s" % [_name_for(facts, String(card.get("winner", ""))),
		String(card.get("reason", "ROUND")).to_upper()]


func _broadcast_line(facts: Dictionary, current: Dictionary) -> String:
	var copy: Dictionary = facts.get("broadcast", {})
	if String(facts.get("phase", "")) == "settled":
		return String(copy.get("winner", ""))
	if String(current.get("round", "")) == "FINAL":
		return String(copy.get("final", ""))
	return String(copy.get("semifinal", ""))


func _name_for(facts: Dictionary, id: String) -> String:
	if id == "":
		return "—"
	for entrant in (facts.get("entrants", []) as Array):
		if String(entrant.get("id", "")) == id:
			return String(entrant.get("name", id)).to_upper()
	return id.to_upper()


func toggle() -> void:
	if is_open(): close()
	else: open()


func open() -> void:
	_large.visible = true
	_compact.visible = false


func close() -> void:
	_large.visible = false
	_update_visibility(runtime.facts())


func is_open() -> bool:
	return _large != null and _large.visible


func _update_visibility(facts: Dictionary) -> void:
	if _compact != null:
		_compact.visible = not is_open() and String(facts.get("phase", "")) in ["running", "settled"]


func handle_key(event: InputEventKey) -> bool:
	if not is_open() or not event.pressed or event.echo:
		return false
	match event.keycode:
		KEY_1: _watch()
		KEY_2: _enter()
		KEY_LEFT: _previous()
		KEY_RIGHT: _next()
		KEY_DOWN: _stake_down()
		KEY_UP: _stake_up()
		KEY_B: _bet()
		KEY_ENTER: _start_reset()
		KEY_J, KEY_ESCAPE: close()
		_: return false
	return true


func panel_facts() -> Dictionary:
	return {"open":is_open(), "compact_visible":_compact.visible,
		"refresh_count":refresh_count, "button_count":_buttons.size(),
		"text":(_title.text + "\nWATCH · BET · ENTER\n" + _body.text + "\n" + _compact_text.text)}


func _watch() -> void: runtime.select_mode("watch")
func _enter() -> void: runtime.select_mode("enter")
func _previous() -> void: runtime.cycle_entrant(-1)
func _next() -> void: runtime.cycle_entrant(1)
func _stake_down() -> void: runtime.change_stake(-1)
func _stake_up() -> void: runtime.change_stake(1)
func _bet() -> void: runtime.place_bet()


func _start_reset() -> void:
	if String(runtime.facts()["phase"]) == "ready":
		if runtime.start_tournament():
			close()
	else:
		runtime.reset_tournament()
