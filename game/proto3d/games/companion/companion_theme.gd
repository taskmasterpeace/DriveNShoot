## One no-purple visual law for the standalone Game Deck surfaces.
class_name ProtoCompanionTheme
extends RefCounted

const INK := Color("11100d")
const CARD := Color("242019")
const BONE := Color("e8dfcf")
const AMBER := Color("f2b735")
const TEAL := Color("5f756e")
const RUST := Color("c87832")
const DANGER := Color("c94f3d")
const BORDER := Color("4f4638")


static func panel(background: Color = CARD, border: Color = BORDER,
		width: int = 1, radius: int = 10) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(width)
	style.corner_radius_top_left = radius
	style.corner_radius_top_right = radius
	style.corner_radius_bottom_left = radius
	style.corner_radius_bottom_right = radius
	style.set_content_margin_all(14.0)
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.34)
	style.shadow_size = 5 if width > 1 else 2
	return style


static func style_button(button: Button, accent: Color = AMBER) -> void:
	button.focus_mode = Control.FOCUS_ALL
	button.add_theme_color_override("font_color", BONE)
	button.add_theme_color_override("font_hover_color", BONE)
	button.add_theme_color_override("font_focus_color", BONE)
	button.add_theme_color_override("font_pressed_color", INK)
	button.add_theme_stylebox_override("normal", panel(CARD, BORDER, 1))
	button.add_theme_stylebox_override("hover", panel(CARD.lightened(0.05), accent, 2))
	button.add_theme_stylebox_override("focus", panel(CARD.lightened(0.05), accent, 3))
	button.add_theme_stylebox_override("pressed", panel(accent, accent, 2))
	button.add_theme_stylebox_override("disabled", panel(INK.lightened(0.03), BORDER, 1))


static func style_filter(button: Button) -> void:
	style_button(button, TEAL)
	button.toggle_mode = true
	button.add_theme_stylebox_override("pressed", panel(TEAL.darkened(0.08), TEAL, 2, 10))


static func make_badge(text: String, accent: Color = AMBER) -> Label:
	var badge := Label.new()
	badge.text = text
	badge.add_theme_font_size_override("font_size", 12)
	badge.add_theme_color_override("font_color", BONE)
	badge.add_theme_stylebox_override("normal", panel(INK, accent, 1, 8))
	return badge
