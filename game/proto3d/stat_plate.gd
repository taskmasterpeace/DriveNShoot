## A HUD STATUS PLATE — the generated pixel plate PNG (a symbol on the left + an EMPTY
## readout window) with a code-driven number in the window. Same law as the radio LCD /
## TV screen: the value is never baked into the art. A missing PNG falls back to plain
## text so the readout never vanishes. Used for the HP and ammo readouts (assets/ui/hud/).
class_name ProtoStatPlate
extends Control

# The readout window as a fraction of the plate (measured off the health/ammo plates:
# the empty screen sits on the right ~0.37-0.93 wide, ~0.30-0.72 tall).
const WIN := Rect2(0.40, 0.32, 0.40, 0.36)

var _plate: TextureRect
var _label: Label


static func create(png_path: String, w: float = 208.0, col: Color = Color(0.96, 0.72, 0.2)) -> ProtoStatPlate:
	var g := ProtoStatPlate.new()
	g.custom_minimum_size = Vector2(w, w * 224.0 / 448.0) # the 2:1 plate aspect
	g.size = g.custom_minimum_size
	g.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var tex: Texture2D = load(png_path) if ResourceLoader.exists(png_path) else null
	g._plate = TextureRect.new()
	g._plate.set_anchors_preset(Control.PRESET_FULL_RECT)
	g._plate.texture = tex
	g._plate.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	g._plate.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	g._plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	g._plate.visible = tex != null
	g.add_child(g._plate)

	g._label = Label.new()
	g._label.add_theme_font_override("font", ProtoHUD.mixed_font())
	g._label.add_theme_color_override("font_color", col)
	g._label.add_theme_color_override("font_outline_color", Color(0.05, 0.04, 0.03))
	g._label.add_theme_constant_override("outline_size", 5)
	g._label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	g._label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	g._label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sz := g.custom_minimum_size
	g._label.position = Vector2(WIN.position.x * sz.x, WIN.position.y * sz.y)
	g._label.size = Vector2(WIN.size.x * sz.x, WIN.size.y * sz.y)
	g._label.add_theme_font_size_override("font_size", maxi(9, int(WIN.size.y * sz.y * 0.52)))
	g.add_child(g._label)
	return g


func has_plate() -> bool:
	return _plate != null and _plate.texture != null


func set_text(txt: String, col: Color = Color(0, 0, 0, 0)) -> void:
	_label.text = txt
	if col.a > 0.0:
		_label.add_theme_color_override("font_color", col)
