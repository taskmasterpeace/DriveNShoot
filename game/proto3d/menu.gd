## THE FRONT DOOR (the "it's a game, not a slice" pass). A title overlay shown
## ONLY on a real launch — sims instantiate proto3d under a harness, so the menu
## checks it IS the running scene and stays out of their way. NEW GAME plays the
## world already built; CONTINUE loads the save; HOST/JOIN open the wasteland to
## friends; QUIT closes. House aesthetic: ink/bone/amber, no purple.
class_name ProtoMenu
extends CanvasLayer

const AMBER := Color(0.96, 0.72, 0.2)
const BONE := Color(0.92, 0.89, 0.82)
const DIM := Color(0.55, 0.52, 0.46)
const INK := Color(0.09, 0.08, 0.06)

var _main: Node = null
var _root: Control = null
var _actions: VBoxContainer
var _ip_field: LineEdit = null
var _options_panel: ProtoOptionsPanel = null ## lazily created, owned by the menu
var _controls_button: Button
var _options_button: Button
var _active_panel: CanvasLayer = null
var _return_focus: Control = null
var _previous_panel_layer: int = 0


static func create(main: Node) -> ProtoMenu:
	# Boot-time settings apply (QA blocker fix, owner ask 2026-07-07): a saved
	# fullscreen/vsync/volume choice must be live before the player sees the
	# title, not just from inside the OPTIONS panel. Static — no panel needed.
	# (In-game alternative, if a pause-menu hook ever lands: call this same
	# line from proto3d.gd's _ready() instead/also — see options_panel.gd's
	# own header comment for the exact one-line hook.)
	ProtoOptionsPanel.apply_saved()
	var m := ProtoMenu.new()
	m._main = main
	m.layer = 8 # title backdrop; its one owned subpanel is promoted above it
	m._build()
	return m


func _build() -> void:
	var dim := ColorRect.new()
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	# The title is a front door, not a translucent gameplay overlay. Keep the
	# world HUD untouched (the return briefing also uses main.menu_open).
	dim.color = Color(0.045, 0.04, 0.03, 1.0)
	add_child(dim)

	_root = PanelContainer.new()
	_root.set_anchors_preset(Control.PRESET_CENTER)
	var bezel := _plate(INK, AMBER)
	bezel.set_content_margin_all(24)
	_root.add_theme_stylebox_override("panel", bezel)
	add_child(_root)
	_fit_to_viewport()
	_actions = VBoxContainer.new()
	_actions.add_theme_constant_override("separation", 12)
	_root.add_child(_actions)

	var serial := _label("ROAD TERMINAL  /  01", 15, DIM)
	_actions.add_child(serial)
	var identity := HBoxContainer.new()
	identity.add_theme_constant_override("separation", 20)
	_actions.add_child(identity)
	# The existing 52px wordmark is the title's deliberate brand-scale exception
	# to UI_DESIGN_LANGUAGE's 44 / 20 / 15 readout scale.
	var title := _label("DRIVN", 52, AMBER)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	identity.add_child(title)
	var identity_tag := _label("SURVIVE THE ROAD.\nMAKE IT HOME.", 15, BONE)
	identity_tag.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	identity_tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	identity.add_child(identity_tag)
	_actions.add_child(_label("THE DIVIDED STATES OF AMERICA", 15, BONE))
	var rule := ColorRect.new()
	rule.color = AMBER
	rule.custom_minimum_size.y = 2
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_actions.add_child(rule)
	var space := Control.new()
	space.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_actions.add_child(space)

	var first := _mk_button("▶  NEW GAME", true)
	first.pressed.connect(new_game)
	_actions.add_child(first)
	if FileAccess.file_exists(_main.SAVE_PATH):
		_button("↻  CONTINUE", continue_game)
	var jrow := HBoxContainer.new()
	jrow.add_theme_constant_override("separation", 10)
	_actions.add_child(jrow)
	var host := _mk_button("HOST CO-OP")
	host.add_theme_font_size_override("font_size", 15)
	host.pressed.connect(host_game)
	jrow.add_child(host)
	_ip_field = LineEdit.new()
	_ip_field.text = "127.0.0.1"
	_ip_field.placeholder_text = "IP ADDRESS"
	_ip_field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ip_field.add_theme_font_override("font", ProtoHUD.mixed_font())
	_ip_field.add_theme_font_size_override("font_size", 15)
	_ip_field.add_theme_color_override("font_color", BONE)
	_ip_field.add_theme_stylebox_override("normal", _plate(Color(0.055, 0.05, 0.035), DIM))
	_ip_field.add_theme_stylebox_override("focus", _plate(Color(0, 0, 0, 0), AMBER))
	jrow.add_child(_ip_field)
	var jb := _mk_button("JOIN")
	jb.add_theme_font_size_override("font_size", 15)
	jb.pressed.connect(join_game)
	jrow.add_child(jb)

	var settings := HBoxContainer.new()
	settings.add_theme_constant_override("separation", 10)
	_actions.add_child(settings)
	_controls_button = _mk_button("CONTROLS")
	_controls_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_controls_button.pressed.connect(open_controls)
	settings.add_child(_controls_button)
	_options_button = _mk_button("OPTIONS")
	_options_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_options_button.pressed.connect(open_options)
	settings.add_child(_options_button)
	_button("QUIT", func() -> void:
		if _active_panel == null:
			_main.get_tree().quit())

	var hint := _label("ENTER / A / ✕  SELECT     ·     ARROWS / D-PAD  NAVIGATE", 15, DIM)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_actions.add_child(hint)
	# A PAD navigates the door: focus the first button so D-pad/✕ work from boot.
	first.grab_focus.call_deferred()


func _ready() -> void:
	get_viewport().size_changed.connect(_fit_to_viewport)
	_fit_to_viewport()


func _fit_to_viewport() -> void:
	var vp := _main.get_viewport().get_visible_rect().size
	var size := Vector2(minf(640.0, vp.x - 80.0), minf(600.0, vp.y - 80.0))
	_root.offset_left = -size.x * 0.5
	_root.offset_right = size.x * 0.5
	_root.offset_top = -size.y * 0.5
	_root.offset_bottom = size.y * 0.5


func _label(text: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_override("font", ProtoHUD.mixed_font())
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	return label


func _plate(fill: Color, edge: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = edge
	style.set_border_width_all(2)
	style.set_corner_radius_all(6)
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 7
	style.content_margin_bottom = 7
	return style


func _mk_button(text: String, primary: bool = false) -> Button:
	var b := Button.new()
	b.add_theme_font_override("font", ProtoHUD.mixed_font())
	b.add_theme_font_size_override("font_size", 20)
	b.add_theme_color_override("font_color", INK if primary else BONE)
	b.add_theme_color_override("font_hover_color", INK)
	b.add_theme_color_override("font_pressed_color", INK)
	b.add_theme_color_override("font_focus_color", INK if primary else AMBER)
	b.add_theme_stylebox_override("normal", _plate(AMBER if primary else Color(0.13, 0.115, 0.075), AMBER))
	b.add_theme_stylebox_override("hover", _plate(Color(1.0, 0.8, 0.35), AMBER))
	b.add_theme_stylebox_override("pressed", _plate(Color(0.78, 0.55, 0.16), AMBER))
	var focus := _plate(Color(0, 0, 0, 0), BONE)
	focus.expand_margin_left = 3
	focus.expand_margin_right = 3
	focus.expand_margin_top = 3
	focus.expand_margin_bottom = 3
	b.add_theme_stylebox_override("focus", focus)
	b.text = text
	b.custom_minimum_size = Vector2(0, 44)
	return b


func _button(text: String, cb: Callable) -> void:
	var b := _mk_button(text)
	b.pressed.connect(cb)
	_actions.add_child(b)


# --- The doors (also called directly by menu_sim) -------------------------------

func new_game() -> void:
	if _active_panel != null:
		return
	_main.begin_new_game() # arms THE FIRST RUN (drive → pull over → scavenge → home)
	dismiss()


func continue_game() -> void:
	if _active_panel != null:
		return
	_main.load_game()
	dismiss()


func host_game() -> void:
	if _active_panel != null:
		return
	_main._ensure_net()
	_main.net.host()
	dismiss()


func join_game() -> void:
	if _active_panel != null:
		return
	_main._ensure_net()
	_main.net.join(_ip_field.text if _ip_field != null else "127.0.0.1")
	dismiss()


func open_controls() -> void:
	if _active_panel != null:
		return
	_main.toggle_controls_panel()
	var panel := _main.get("controls_panel") as ProtoControlsPanel
	if panel != null and panel.is_open:
		_own_subpanel(panel, _controls_button)


## The title retains its opaque backdrop and gameplay gate, but relinquishes
## its ACTION face. One explicit owner, not two focusable panels competing.
func open_options() -> void:
	if _active_panel != null:
		return
	if _options_panel == null:
		_options_panel = ProtoOptionsPanel.create(_main)
		_main.add_child(_options_panel)
	_own_subpanel(_options_panel, _options_button)
	_options_panel.open()


func _own_subpanel(panel: CanvasLayer, launcher: Control) -> void:
	_active_panel = panel
	_return_focus = launcher
	_previous_panel_layer = panel.layer
	panel.layer = layer + 1
	_root.hide() # hidden controls cannot participate in GUI focus or hit tests
	var on_close := _release_subpanel.bind(panel)
	if not panel.is_connected("closed", on_close):
		panel.connect("closed", on_close)


func _release_subpanel(panel: CanvasLayer) -> void:
	if panel != _active_panel:
		return
	panel.layer = _previous_panel_layer
	_active_panel = null
	if is_inside_tree() and not is_queued_for_deletion():
		_root.show()
		_restore_launcher_focus.call_deferred()


func _restore_launcher_focus() -> void:
	if _active_panel == null and is_instance_valid(_return_focus) and _return_focus.is_visible_in_tree():
		_return_focus.grab_focus()


func dismiss() -> void:
	_main.menu_open = false
	if is_instance_valid(_options_panel):
		_options_panel.queue_free()
	queue_free()
