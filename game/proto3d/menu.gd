## THE FRONT DOOR (the "it's a game, not a slice" pass). A title overlay shown
## ONLY on a real launch — sims instantiate proto3d under a harness, so the menu
## checks it IS the running scene and stays out of their way. NEW GAME plays the
## world already built; CONTINUE loads the save; HOST/JOIN open the wasteland to
## friends; QUIT closes. House aesthetic: ink/bone/amber, no purple.
class_name ProtoMenu
extends CanvasLayer

var _main: Node = null
var _root: Control = null
var _ip_field: LineEdit = null
var _options_panel: ProtoOptionsPanel = null ## lazily created, owned by the menu


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
	m.layer = 8 # above everything
	m._build()
	return m


func _build() -> void:
	var dim := ColorRect.new()
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0.08, 0.07, 0.05, 0.92)
	add_child(dim)

	_root = VBoxContainer.new()
	_root.set_anchors_preset(Control.PRESET_CENTER)
	_root.offset_left = -220.0
	_root.offset_right = 220.0
	_root.offset_top = -230.0
	_root.offset_bottom = 230.0
	_root.add_theme_constant_override("separation", 12)
	add_child(_root)

	var title := Label.new()
	title.add_theme_font_override("font", ProtoHUD.mixed_font())
	title.add_theme_font_size_override("font_size", 52)
	title.add_theme_color_override("font_color", Color(0.96, 0.72, 0.2))
	title.text = "DRIVN"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_root.add_child(title)
	var sub := Label.new()
	sub.add_theme_font_override("font", ProtoHUD.mixed_font())
	sub.add_theme_font_size_override("font_size", 16)
	sub.add_theme_color_override("font_color", Color(0.6, 0.55, 0.45))
	sub.text = "THE DIVIDED STATES OF AMERICA"
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_root.add_child(sub)
	_root.add_child(Control.new()) # spacer

	var first := _mk_button("▶  NEW GAME")
	first.pressed.connect(new_game)
	_root.add_child(first)
	if FileAccess.file_exists(_main.SAVE_PATH):
		_button("↻  CONTINUE", continue_game)
	_button("🌐  HOST CO-OP", host_game)
	_button("🕹  CONTROLS", func() -> void: _main.toggle_controls_panel()) # 🕹 not 🎮 — the pad emoji renders PURPLE (the law)
	_button("⚙  OPTIONS", func() -> void: open_options())
	var jrow := HBoxContainer.new()
	jrow.add_theme_constant_override("separation", 6)
	_root.add_child(jrow)
	_ip_field = LineEdit.new()
	_ip_field.text = "127.0.0.1"
	_ip_field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ip_field.add_theme_font_override("font", ProtoHUD.mixed_font())
	jrow.add_child(_ip_field)
	var jb := _mk_button("🌐  JOIN")
	jb.pressed.connect(join_game)
	jrow.add_child(jb)
	_button("✕  QUIT", func() -> void: _main.get_tree().quit())

	var hint := Label.new()
	hint.add_theme_font_override("font", ProtoHUD.mixed_font())
	hint.add_theme_font_size_override("font_size", 12)
	hint.add_theme_color_override("font_color", Color(0.55, 0.5, 0.42))
	hint.text = "in-game: F5 save · F9 load · F7 host · F8 join · K sheet · F10 dev · F11 controls · 🕹 pads welcome"
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_root.add_child(hint)
	# A PAD navigates the door: focus the first button so D-pad/✕ work from boot.
	first.grab_focus.call_deferred()


func _mk_button(text: String) -> Button:
	var b := Button.new()
	b.add_theme_font_override("font", ProtoHUD.mixed_font())
	b.add_theme_font_size_override("font_size", 20)
	b.text = text
	b.custom_minimum_size = Vector2(0, 44)
	return b


func _button(text: String, cb: Callable) -> void:
	var b := _mk_button(text)
	b.pressed.connect(cb)
	_root.add_child(b)


# --- The doors (also called directly by menu_sim) -------------------------------

func new_game() -> void:
	_main.begin_new_game() # arms THE FIRST RUN (drive → pull over → scavenge → home)
	dismiss()


func continue_game() -> void:
	_main.load_game()
	dismiss()


func host_game() -> void:
	_main._ensure_net()
	_main.net.host()
	dismiss()


func join_game() -> void:
	_main._ensure_net()
	_main.net.join(_ip_field.text if _ip_field != null else "127.0.0.1")
	dismiss()


## OPTIONS does NOT dismiss the menu underneath it (matches how CONTROLS
## coexists with the title) — the panel returns you to the menu on close.
func open_options() -> void:
	if _options_panel == null:
		_options_panel = ProtoOptionsPanel.create(_main)
		_main.add_child(_options_panel)
	_options_panel.open()


func dismiss() -> void:
	_main.menu_open = false
	queue_free()
