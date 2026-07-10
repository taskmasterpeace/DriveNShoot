## THE CONTROLS PANEL (controller arc): rebind ANY verb's key AND pad button,
## in-game, press-to-capture. Rows come from ProtoInputMap (input_bindings.json);
## rebinds apply live and persist to user://input_overrides.json. Open with F11
## or the title menu's CONTROLS button. Xbox names shown with PS parity (A / ✕).
class_name ProtoControlsPanel
extends CanvasLayer

const AMBER := Color(0.96, 0.72, 0.2)
const BONE := Color(0.92, 0.89, 0.82)
const DIM := Color(0.55, 0.52, 0.46)

var is_open: bool = false
var _main: Node = null
var _root: PanelContainer
var _rows_box: VBoxContainer
var _hint: Label
var _capture: Dictionary = {} ## {} = idle; {id, slot, button} while listening


static func create(main: Node) -> ProtoControlsPanel:
	var p := ProtoControlsPanel.new()
	p._main = main
	p.layer = 5
	p._root = PanelContainer.new()
	p._root.set_anchors_preset(Control.PRESET_CENTER)
	p._root.offset_left = -430.0
	p._root.offset_right = 430.0
	p._root.offset_top = -330.0
	p._root.offset_bottom = 330.0
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
	var title := Label.new()
	title.text = "🕹  CONTROLS — click a binding, press the new key or button"
	title.add_theme_font_override("font", ProtoHUD.mixed_font())
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", AMBER)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(title)
	p._hint = Label.new()
	p._hint.add_theme_font_override("font", ProtoHUD.mixed_font())
	p._hint.add_theme_font_size_override("font_size", 13)
	p._hint.add_theme_color_override("font_color", DIM)
	p._hint.text = "Keyboard + mouse in the KEY column · Xbox/PS pads in the PAD column (✕◯▢△ = the same buttons) · ESC cancels a capture · rebinding replaces the slot"
	p._hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(p._hint)

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(scroll)
	p._rows_box = VBoxContainer.new()
	p._rows_box.add_theme_constant_override("separation", 2)
	p._rows_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(p._rows_box)

	var foot := HBoxContainer.new()
	foot.add_theme_constant_override("separation", 8)
	v.add_child(foot)
	var reset := Button.new()
	reset.text = "↺ RESET ALL TO STOCK"
	reset.add_theme_font_override("font", ProtoHUD.mixed_font())
	reset.pressed.connect(func() -> void:
		ProtoInputMap.reset_all()
		p._rebuild())
	foot.add_child(reset)
	var closer := Button.new()
	closer.text = "CLOSE (F11)"
	closer.add_theme_font_override("font", ProtoHUD.mixed_font())
	closer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	closer.pressed.connect(func() -> void: p.close())
	foot.add_child(closer)

	p.visible = false
	p.is_open = false
	p.open()
	return p


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
	is_open = false
	visible = false
	_capture = {}


func capturing() -> bool:
	return not _capture.is_empty()


func _rebuild() -> void:
	for c in _rows_box.get_children():
		c.queue_free()
	var last_group := ""
	for row in ProtoInputMap.rows_for_panel():
		if String(row["group"]) != last_group:
			last_group = String(row["group"])
			var g := Label.new()
			g.text = "— %s —" % last_group
			g.add_theme_font_override("font", ProtoHUD.mixed_font())
			g.add_theme_font_size_override("font_size", 14)
			g.add_theme_color_override("font_color", AMBER)
			_rows_box.add_child(g)
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 6)
		var lbl := Label.new()
		lbl.text = String(row["label"])
		lbl.add_theme_font_override("font", ProtoHUD.mixed_font())
		lbl.add_theme_font_size_override("font_size", 14)
		lbl.add_theme_color_override("font_color", BONE)
		lbl.custom_minimum_size = Vector2(340, 0)
		h.add_child(lbl)
		var kb := Button.new()
		kb.text = String(row["keys_pretty"])
		kb.add_theme_font_override("font", ProtoHUD.mixed_font())
		kb.add_theme_font_size_override("font_size", 13)
		kb.custom_minimum_size = Vector2(180, 0)
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
		pb.add_theme_font_override("font", ProtoHUD.mixed_font())
		pb.add_theme_font_size_override("font_size", 13)
		pb.custom_minimum_size = Vector2(180, 0)
		pb.pressed.connect(func() -> void: _begin_capture(id, "pad", pb))
		h.add_child(pb)
		_rows_box.add_child(h)


func _begin_capture(action_id: String, slot: String, button: Button) -> void:
	_capture = {"id": action_id, "slot": slot, "button": button}
	button.text = "PRESS A %s…" % ("KEY" if slot == "keys" else "BUTTON")


## The capture ear: _input (ahead of gameplay) so the pressed thing binds instead
## of firing its old verb. ESC backs out. Slot-filtered: keys take keys/mouse,
## pad takes buttons/triggers/stick directions.
func _input(event: InputEvent) -> void:
	if not is_open or _capture.is_empty():
		return
	var pressed: bool = (event is InputEventKey and (event as InputEventKey).pressed) \
		or (event is InputEventMouseButton and (event as InputEventMouseButton).pressed) \
		or (event is InputEventJoypadButton and (event as InputEventJoypadButton).pressed) \
		or (event is InputEventJoypadMotion and absf((event as InputEventJoypadMotion).axis_value) > 0.6)
	if not pressed:
		return
	get_viewport().set_input_as_handled()
	if event is InputEventKey and (event as InputEventKey).physical_keycode == KEY_ESCAPE:
		_capture = {}
		_rebuild()
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
	ProtoInputMap.rebind(String(_capture["id"]), slot, [d])
	_capture = {}
	if _main != null and _main.has_method("notify"):
		_main.notify("🕹 Bound %s" % ProtoInputMap.pretty(d))
	_rebuild()
