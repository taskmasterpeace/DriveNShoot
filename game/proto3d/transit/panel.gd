class_name ProtoTransitPanel
extends CanvasLayer
## Contractual facts belong on the ticket board: the physical destination sign
## teaches the service, but cannot convey its exact fare/refund/departure terms.
const AMBER := Color(0.96,0.72,0.2)
const BONE := Color(0.92,0.89,0.82)
const DIM := Color(0.55,0.52,0.46)
var service: Node
var is_open: bool = false
var stop_id: String = ""
var actions: Dictionary = {}
var frame: PanelContainer
var rows: VBoxContainer
var title: Label
var descriptions: Dictionary = {}
var _refresh_seconds: float = 0.0

func _ready() -> void:
	layer = 12
	frame = PanelContainer.new()
	add_child(frame)
	frame.set_anchors_preset(Control.PRESET_CENTER)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.09,0.08,0.06,0.97)
	style.border_color = AMBER
	style.set_border_width_all(2)
	style.set_corner_radius_all(6)
	style.content_margin_left = 20
	style.content_margin_right = 20
	style.content_margin_top = 16
	style.content_margin_bottom = 16
	frame.add_theme_stylebox_override("panel",style)
	frame.add_theme_font_override("font",ProtoHUD.mixed_font())
	frame.add_theme_font_size_override("font_size",15)
	frame.add_theme_color_override("font_color",BONE)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation",12)
	frame.add_child(column)
	var header := HBoxContainer.new()
	column.add_child(header)
	title = Label.new()
	title.add_theme_color_override("font_color",AMBER)
	title.add_theme_font_size_override("font_size",20)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	var close_button := Button.new()
	close_button.text = "✕"
	close_button.tooltip_text = "Close · Esc / B/◯"
	close_button.set_meta("action","close")
	close_button.add_theme_color_override("font_color",Color(0.9,0.4,0.3)) # sanctioned exit red
	close_button.pressed.connect(close)
	header.add_child(close_button)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	rows = VBoxContainer.new()
	rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rows.add_theme_constant_override("separation",10)
	scroll.add_child(rows)
	var hints := Label.new()
	hints.text = "A/✕ select · B/◯ / Esc close · LOCAL OFFLINE SERVICE"
	hints.add_theme_color_override("font_color",DIM)
	column.add_child(hints)
	frame.hide()
	get_viewport().size_changed.connect(_layout)
	_layout()

func _layout() -> void:
	var size: Vector2 = get_viewport().get_visible_rect().size
	var width: float = minf(640,size.x-80)
	var height: float = minf(405,size.y-80)
	frame.offset_left = -width*0.5
	frame.offset_right = width*0.5
	frame.offset_top = -height*0.5
	frame.offset_bottom = height*0.5

func open(id: String) -> void:
	if not service.can_open(id):
		return
	stop_id = id
	is_open = true
	frame.show()
	refresh()
	service.main.audio.play_ui("blip",-12.0)

func close() -> void:
	if is_open:
		service.main.audio.play_ui("click",-12.0)
	is_open = false
	frame.hide()

func _input(event: InputEvent) -> void:
	if not is_open:
		return
	if (event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE) or (event is InputEventJoypadButton and event.pressed and event.button_index == JOY_BUTTON_B) or event.is_action_pressed("interact"):
		close()
		get_viewport().set_input_as_handled()

func _process(delta: float) -> void:
	if not is_open:
		return
	if not service.can_open(stop_id):
		close()
		return
	_refresh_seconds += delta
	if _refresh_seconds > 1.0:
		_refresh_seconds = 0.0
		# Update live schedule in place. Rebuilding buttons mid press/release
		# loses the activation and pad focus at the one-second boundary.
		for id: String in descriptions:
			descriptions[id].text = _description(id)
			if actions.has("reserve:"+id):
				actions["reserve:"+id].disabled = not service.can_reserve(id)
		if actions.has("board"):
			actions.board.disabled = not service.can_board()

func refresh(focus_first: bool = true) -> void:
	var focused: String = ""
	var owner: Control = get_viewport().gui_get_focus_owner()
	if owner != null:
		focused = String(owner.get_meta("action",""))
	for child: Node in rows.get_children():
		rows.remove_child(child)
		child.queue_free()
	actions.clear()
	descriptions.clear()
	title.text = "LASTLINE · " + String(service.catalog.stops[stop_id].name).to_upper()
	_text("CARRIED BAGGAGE ONLY · no vehicles, dogs or crew.\nCancel: full refund. Arrival/voluntary exit: no refund.\nFailure: safe roadside exit + refund. Restart: last terminal + refund.")
	var ticket: Dictionary = service.record().ticket
	for id: String in service.catalog.services:
		var row: Dictionary = service.catalog.services[id]
		if row.origin != stop_id or row.kind != "coach":
			continue
		_text(_description(id))
		descriptions[id] = rows.get_child(rows.get_child_count()-1)
		if ticket.is_empty():
			_button("reserve:"+id,"RESERVE · %d SCRIP" % row.fare,service.can_reserve(id),func() -> void: service.reserve(id))
		elif String(ticket.service) == id and String(ticket.phase) == "reserved":
			_button("board","BOARD · passenger seat",service.can_board(),func() -> void: service.board())
			_button("cancel","CANCEL · refund %d scrip" % ticket.paid,true,func() -> void: service.cancel())
	_text("KESTREL flights: not in service. No flight tickets sold.")
	var first: Button
	for id: String in actions:
		var button: Button = actions[id]
		if not button.disabled and first == null:
			first = button
		if id == focused and not button.disabled and not focus_first:
			first = button
			break
	if first != null:
		first.grab_focus.call_deferred()

func _description(id: String) -> String:
	var row: Dictionary = service.catalog.services[id]
	var departure: float = service.catalog.next_departure(id,service.now_minutes())
	return "%s → %s\n%d SCRIP · %d seats · DEPARTS %02d:%02d (in %d game min)\nRoad running ≥ %d game min; turns / traffic add time.\n%s" % [row.name,service.catalog.stops[row.destination].name,row.fare,row.capacity,int(departure/60.0)%24,int(departure)%60,int(ceil(departure-service.now_minutes())),int(ceil(service.duration_minutes(id))),row.risk]

func _text(value: String) -> void:
	var label := Label.new()
	label.text = value
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rows.add_child(label)

func _button(id: String, text: String, enabled: bool, callback: Callable) -> void:
	var button := Button.new()
	button.text = text
	button.disabled = not enabled
	button.set_meta("action",id)
	button.add_theme_color_override("font_color",AMBER)
	button.add_theme_color_override("font_hover_color",BONE)
	button.add_theme_color_override("font_focus_color",BONE)
	for name: String in ["normal","hover","pressed","focus"]:
		var style := StyleBoxFlat.new()
		style.bg_color = Color(0.15,0.13,0.08) if name != "normal" else Color(0.09,0.08,0.06)
		style.border_color = AMBER if name != "normal" else DIM
		style.set_border_width_all(2)
		style.set_corner_radius_all(4)
		style.content_margin_top = 8
		style.content_margin_bottom = 8
		button.add_theme_stylebox_override(name,style)
	button.pressed.connect(callback)
	rows.add_child(button)
	actions[id] = button
