## Original 16:9 console presentation primitives. Palette, typography, and
## Control construction live here; cartridge rules and simulation never do.
class_name ProtoConsoleDraw
extends RefCounted

const INK := Color("11100d")
const CARD := Color("242019")
const AMBER := Color("f2b735")
const BONE := Color("e8dfcf")
const DIM := Color("918675")
const RUST := Color("b84a3b")
const SIGNAL := Color("7fa36b")
const TEAL := Color("4f8f86")
const STEEL := Color("6f746f")
const TEAM_COLORS: Array[Color] = [AMBER, RUST, SIGNAL, TEAL]


static func background(parent: Control, color: Color = INK) -> ColorRect:
	var rect := ColorRect.new()
	rect.color = color
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	parent.add_child(rect)
	return rect


static func label(text: String, size: int = 20, color: Color = BONE,
		alignment: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var out := Label.new()
	out.text = text
	out.horizontal_alignment = alignment
	out.add_theme_font_size_override("font_size", size)
	out.add_theme_color_override("font_color", color)
	return out


static func header(parent: Control, title: String, subtitle: String) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE, Control.PRESET_MODE_MINSIZE, 16)
	box.add_theme_constant_override("separation", 2)
	box.add_child(label(title, 30, AMBER, HORIZONTAL_ALIGNMENT_CENTER))
	box.add_child(label(subtitle, 15, DIM, HORIZONTAL_ALIGNMENT_CENTER))
	parent.add_child(box)
	return box


static func status(parent: Control, text: String = "") -> Label:
	var out := label(text, 16, DIM, HORIZONTAL_ALIGNMENT_CENTER)
	out.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE, Control.PRESET_MODE_MINSIZE, 14)
	parent.add_child(out)
	return out


static func frame(color: Color = CARD, border: Color = AMBER, width: int = 2) -> StyleBoxFlat:
	var out := StyleBoxFlat.new()
	out.bg_color = color
	out.border_color = border
	out.set_border_width_all(width)
	out.set_content_margin_all(12)
	out.corner_radius_top_left = 8
	out.corner_radius_top_right = 8
	out.corner_radius_bottom_left = 8
	out.corner_radius_bottom_right = 8
	return out


static func team_color(index: int) -> Color:
	return TEAM_COLORS[posmod(index, TEAM_COLORS.size())]
