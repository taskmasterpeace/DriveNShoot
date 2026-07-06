## CHARACTER CREATION — you author the survivor, and the choices flow into BOTH the
## puppet (a left-handed, one-eyed, bad-legged body) AND the stat hooks (a patched eye
## narrows your vision cone; a bad leg slows you and drags the gait). Same rig, your row.
## Everything here is data the puppet already understands — creation is just picking it.
class_name ProtoCharCreate
extends CanvasLayer

var _main: Node = null
var _root: PanelContainer = null
var _rows: VBoxContainer = null
var is_open: bool = false

## The choices — a partial appearance row plus the stat-bearing picks.
var choices: Dictionary = {"handed": "right", "blind_eye": "", "bad_leg": "", "look": "scav"}

const OPTIONS: Array = [
	["BODY", "look", [["Scav", "scav"], ["Drifter", "drifter"], ["Raider", "raider"], ["Trader", "trader"], ["Guard", "guard"], ["Waif", "waif"], ["Old-timer", "old_timer"]]],
	["HANDED", "handed", [["Right", "right"], ["Left", "left"]]],
	["BLIND EYE", "blind_eye", [["None", ""], ["Left", "l"], ["Right", "r"]]],
	["BAD LEG", "bad_leg", [["None", ""], ["Left", "l"], ["Right", "r"]]],
]


static func create(main: Node) -> ProtoCharCreate:
	var c := ProtoCharCreate.new()
	c._main = main
	c.layer = 4
	c._root = PanelContainer.new()
	c._root.set_anchors_preset(Control.PRESET_CENTER)
	c._root.offset_left = -240.0
	c._root.offset_right = 240.0
	c._root.offset_top = -220.0
	c._root.offset_bottom = 220.0
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.09, 0.08, 0.06, 0.97)
	style.border_color = Color(0.96, 0.72, 0.2)
	style.set_border_width_all(2)
	style.set_corner_radius_all(6)
	c._root.add_theme_stylebox_override("panel", style)
	c._root.visible = false
	c.add_child(c._root)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	c._root.add_child(v)
	var title := Label.new()
	title.add_theme_font_override("font", ProtoHUD.mixed_font())
	title.add_theme_font_size_override("font_size", 22)
	title.add_theme_color_override("font_color", Color(0.96, 0.72, 0.2))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.text = "WHO ARE YOU?"
	v.add_child(title)
	c._rows = VBoxContainer.new()
	c._rows.add_theme_constant_override("separation", 8)
	v.add_child(c._rows)
	var apply := Button.new()
	apply.add_theme_font_override("font", ProtoHUD.mixed_font())
	apply.text = "▶ BECOME"
	apply.pressed.connect(c._on_apply)
	v.add_child(apply)
	var hint := Label.new()
	hint.add_theme_font_override("font", ProtoHUD.mixed_font())
	hint.add_theme_font_size_override("font_size", 12)
	hint.add_theme_color_override("font_color", Color(0.92, 0.89, 0.82, 0.7))
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.text = "a patched eye narrows your sight · a bad leg slows you & drags your gait"
	v.add_child(hint)
	return c


func toggle() -> void:
	is_open = not is_open
	_root.visible = is_open
	if is_open:
		_render()


func _render() -> void:
	for ch in _rows.get_children():
		ch.queue_free()
	for opt in OPTIONS:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		_rows.add_child(row)
		var lbl := Label.new()
		lbl.add_theme_font_override("font", ProtoHUD.mixed_font())
		lbl.add_theme_font_size_override("font_size", 13)
		lbl.add_theme_color_override("font_color", Color(0.92, 0.89, 0.82))
		lbl.custom_minimum_size.x = 90.0
		lbl.text = opt[0]
		row.add_child(lbl)
		var key: String = opt[1]
		for pair in opt[2]:
			var b := Button.new()
			b.add_theme_font_override("font", ProtoHUD.mixed_font())
			b.add_theme_font_size_override("font_size", 12)
			b.text = pair[0]
			if choices[key] == pair[1]:
				b.add_theme_color_override("font_color", Color(0.96, 0.72, 0.2))
			b.pressed.connect(_on_pick.bind(key, pair[1]))
			row.add_child(b)


func _on_pick(key: String, value: String) -> void:
	choices[key] = value
	_render()


func _on_apply() -> void:
	if _main and _main.has_method("apply_character"):
		_main.apply_character(choices)
	toggle()
