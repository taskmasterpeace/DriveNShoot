## THE CONTROLS PANEL (controller arc): rebind ANY verb's key AND pad button,
## in-game, press-to-capture. Rows come from ProtoInputMap (input_bindings.json);
## rebinds apply live and persist to user://input_overrides.json. Open with F11
## or the title menu's CONTROLS button. Xbox names shown with PS parity (A / ✕).
class_name ProtoControlsPanel
extends CanvasLayer

signal closed

const AMBER := Color(0.96, 0.72, 0.2)
const BONE := Color(0.92, 0.89, 0.82)
const DIM := Color(0.55, 0.52, 0.46)
const CLOSE_RED := Color(0.9, 0.4, 0.3)

var is_open: bool = false
var _main: Node = null
var _root: PanelContainer
var _rows_box: VBoxContainer
var _hint: Label
var _close_btn: Button
var _scroll: ScrollContainer
var _first_binding: Button = null
var _capture: Dictionary = {} ## {} = idle; {id, slot, button} while listening


static func create(main: Node) -> ProtoControlsPanel:
	var p := ProtoControlsPanel.new()
	p._main = main
	p.layer = 5
	p._root = PanelContainer.new()
	p._root.set_anchors_preset(Control.PRESET_CENTER)
	p._fit_to_viewport()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.09, 0.08, 0.06, 0.97)
	style.border_color = AMBER
	style.set_border_width_all(2)
	style.set_corner_radius_all(6)
	style.set_content_margin_all(12)
	p._root.add_theme_stylebox_override("panel", style)
	p.add_child(p._root)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	p._root.add_child(v)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	v.add_child(header)
	var title := Label.new()
	title.text = "CONTROLS"
	title.add_theme_font_override("font", ProtoHUD.mixed_font())
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", AMBER)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	p._close_btn = Button.new()
	p._close_btn.text = "✕"
	p._style_button(p._close_btn)
	p._close_btn.add_theme_color_override("font_color", CLOSE_RED)
	p._close_btn.add_theme_color_override("font_focus_color", CLOSE_RED)
	p._close_btn.custom_minimum_size = Vector2(36, 36)
	p._close_btn.pressed.connect(p.close)
	header.add_child(p._close_btn)
	p._hint = Label.new()
	p._hint.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._hint.add_theme_font_size_override("font_size", 15)
	p._hint.add_theme_color_override("font_color", DIM)
	p._hint.text = "Select a KEY or PAD binding, then press its replacement. Esc cancels a capture."
	p._hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(p._hint)

	p._scroll = ScrollContainer.new()
	p._scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	p._scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	p._scroll.follow_focus = true
	v.add_child(p._scroll)
	p._rows_box = VBoxContainer.new()
	p._rows_box.add_theme_constant_override("separation", 2)
	p._rows_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	p._scroll.add_child(p._rows_box)

	var foot := HBoxContainer.new()
	foot.add_theme_constant_override("separation", 8)
	v.add_child(foot)
	var reset := Button.new()
	reset.text = "↺ RESET ALL TO STOCK"
	p._style_button(reset)
	reset.pressed.connect(func() -> void:
		ProtoInputMap.reset_all()
		p._rebuild())
	foot.add_child(reset)
	var close_hint := Label.new()
	close_hint.text = "CLOSE  Esc / B / ◯"
	close_hint.add_theme_font_override("font", ProtoHUD.mixed_font())
	close_hint.add_theme_font_size_override("font_size", 15)
	close_hint.add_theme_color_override("font_color", DIM)
	close_hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	close_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	foot.add_child(close_hint)

	p.visible = false
	p.is_open = false
	p.open()
	return p


func _ready() -> void:
	get_viewport().size_changed.connect(_fit_to_viewport)
	_fit_to_viewport()


func _fit_to_viewport() -> void:
	var vp := _main.get_viewport().get_visible_rect().size
	var size := Vector2(minf(900.0, vp.x - 80.0), minf(660.0, vp.y - 80.0))
	_root.offset_left = -size.x * 0.5
	_root.offset_right = size.x * 0.5
	_root.offset_top = -size.y * 0.5
	_root.offset_bottom = size.y * 0.5


func _style_button(button: Button) -> void:
	button.add_theme_font_override("font", ProtoHUD.mixed_font())
	button.add_theme_font_size_override("font_size", 15)
	button.add_theme_color_override("font_color", BONE)
	button.add_theme_color_override("font_hover_color", AMBER)
	button.add_theme_color_override("font_focus_color", AMBER)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.14, 0.12, 0.08)
	style.border_color = DIM
	style.set_border_width_all(2)
	style.set_corner_radius_all(6)
	style.set_content_margin_all(7)
	button.add_theme_stylebox_override("normal", style)
	var focus := style.duplicate() as StyleBoxFlat
	focus.bg_color = Color(0, 0, 0, 0)
	focus.border_color = AMBER
	button.add_theme_stylebox_override("focus", focus)
	var hover := style.duplicate() as StyleBoxFlat
	hover.border_color = AMBER
	hover.bg_color = Color(0.20, 0.17, 0.10)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", hover)


func toggle() -> void:
	if is_open:
		close()
	else:
		open()


func open() -> void:
	is_open = true
	visible = true
	_capture = {}
	_rebuild()


func close() -> void:
	if not is_open:
		return
	is_open = false
	visible = false
	_capture = {}
	closed.emit()


func capturing() -> bool:
	return not _capture.is_empty()


func _rebuild(focus_id: String = "", focus_slot: String = "keys") -> void:
	for c in _rows_box.get_children():
		_rows_box.remove_child(c)
		c.queue_free()
	var last_group := ""
	var first: Button = null
	var preferred: Button = null
	for row in ProtoInputMap.rows_for_panel():
		if String(row["group"]) != last_group:
			last_group = String(row["group"])
			var g := Label.new()
			g.text = "— %s —" % last_group
			g.add_theme_font_override("font", ProtoHUD.mixed_font())
			g.add_theme_font_size_override("font_size", 15)
			g.add_theme_color_override("font_color", AMBER)
			_rows_box.add_child(g)
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 6)
		var lbl := Label.new()
		lbl.text = String(row["label"])
		lbl.add_theme_font_override("font", ProtoHUD.mixed_font())
		lbl.add_theme_font_size_override("font_size", 15)
		lbl.add_theme_color_override("font_color", BONE)
		lbl.custom_minimum_size = Vector2(260, 0)
		lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		lbl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		h.add_child(lbl)
		var kb := Button.new()
		kb.text = String(row["keys_pretty"])
		_style_button(kb)
		kb.custom_minimum_size = Vector2(180, 36)
		kb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		kb.clip_text = true
		# Show a prompt GLYPH for the primary key when art exists (MIT icon set); the
		# glyph replaces the text for a single bind, sits beside it for a combo, and
		# a keyless/art-less bind (Comma, pad-only) just keeps its text.
		var kicon := ProtoKeyIcons.first_texture(row.get("keys_raw", []))
		if kicon != null:
			kb.icon = kicon
			kb.add_theme_constant_override("icon_max_width", 26)
			if (row.get("keys_raw", []) as Array).size() <= 1:
				kb.text = ""
		var id := String(row["id"])
		kb.pressed.connect(func() -> void: _begin_capture(id, "keys", kb))
		h.add_child(kb)
		var pb := Button.new()
		pb.text = String(row["pad_pretty"])
		_style_button(pb)
		pb.custom_minimum_size = Vector2(220, 36)
		pb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		pb.clip_text = true
		pb.pressed.connect(func() -> void: _begin_capture(id, "pad", pb))
		h.add_child(pb)
		_rows_box.add_child(h)
		if first == null:
			first = kb
		if id == focus_id:
			preferred = pb if focus_slot == "pad" else kb
	var focus := preferred if preferred != null else first
	_first_binding = first
	if focus != null:
		_focus_binding.call_deferred(focus)


func _focus_binding(button: Button) -> void:
	# A second rebind/reset can rebuild before this deferred focus lands.
	if is_open and is_instance_valid(button) and button.is_inside_tree() and not button.is_queued_for_deletion():
		button.grab_focus()
		if button == _first_binding:
			# Follow-focus may run before the new rows finish layout and leave the
			# first row clipped. Its category is part of the first-open context.
			_scroll.set_deferred("scroll_vertical", 0)


func _begin_capture(action_id: String, slot: String, button: Button) -> void:
	_capture = {"id": action_id, "slot": slot, "button": button}
	button.text = "PRESS A %s…" % ("KEY" if slot == "keys" else "BUTTON")


## The capture ear: _input (ahead of gameplay) so the pressed thing binds instead
## of firing its old verb. ESC backs out. Slot-filtered: keys take keys/mouse,
## pad takes buttons/triggers/stick directions.
func _input(event: InputEvent) -> void:
	if not is_open:
		return
	if event is InputEventKey and (event as InputEventKey).echo:
		return
	if not _capture.is_empty() and event is InputEventMouseButton \
			and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var local := _close_btn.make_input_local(event) as InputEventMouseButton
		if Rect2(Vector2.ZERO, _close_btn.size).has_point(local.position):
			return # leave header press/release to GUI hit testing, never bind it
	var escape := event is InputEventKey and (event as InputEventKey).pressed \
		and ((event as InputEventKey).physical_keycode == KEY_ESCAPE or (event as InputEventKey).keycode == KEY_ESCAPE)
	var back := event is InputEventJoypadButton and (event as InputEventJoypadButton).pressed \
		and (event as InputEventJoypadButton).button_index == JOY_BUTTON_B
	if _capture.is_empty():
		# Raw close remains available even after the Controls toggle is rebound,
		# and while the title's higher-level gameplay gate owns unhandled input.
		if escape or back or event.is_action_pressed("drivn_controls"):
			get_viewport().set_input_as_handled()
			close()
		return
	var pressed: bool = (event is InputEventKey and (event as InputEventKey).pressed) \
		or (event is InputEventMouseButton and (event as InputEventMouseButton).pressed) \
		or (event is InputEventJoypadButton and (event as InputEventJoypadButton).pressed) \
		or (event is InputEventJoypadMotion and absf((event as InputEventJoypadMotion).axis_value) > 0.6)
	if not pressed:
		return
	get_viewport().set_input_as_handled()
	if escape:
		var previous_id := String(_capture["id"])
		var previous_slot := String(_capture["slot"])
		_capture = {}
		_rebuild(previous_id, previous_slot)
		return
	var d := ProtoInputMap.event_to_descriptor(event)
	if d == "":
		return
	var slot := String(_capture["slot"])
	var kind := d.split(":")[0]
	var fits := (slot == "keys" and (kind == "key" or kind == "mouse")) \
		or (slot == "pad" and (kind == "joy" or kind == "axis"))
	if not fits:
		return # wrong hardware for this column — keep listening
	var bound_id := String(_capture["id"])
	ProtoInputMap.rebind(bound_id, slot, [d])
	_capture = {}
	if _main != null and _main.has_method("notify"):
		_main.notify("🕹 Bound %s" % ProtoInputMap.pretty(d))
	_rebuild(bound_id, slot)
