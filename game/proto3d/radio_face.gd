## THE RADIO FACE — the pixel-art faceplate (a generated PNG with an EMPTY FM scale and
## an EMPTY display window) plus the two DYNAMIC parts driven in code: a tuning POINTER
## that slides across the FM band by frequency, and the display TEXT (frequency / station)
## rendered in the generated amber LCD font. Same law as the speedometer needle — the
## moving + live parts are NEVER baked into the art. A missing PNG hides the face cleanly.
class_name ProtoRadioFace
extends Control

const FACE_PNG := "res://assets/ui/radio/faceplate.png"
const LCD_FONT := "res://assets/ui/fonts/radio_lcd.ttf"

# Normalized calibration of the generated faceplate (fractions of its shown size),
# measured off assets/ui/radio/faceplate.png (640x360). Retune if the art is swapped.
const SCALE_X0 := 0.245   # x where BAND_LO (88.1) sits — under the "88" label
const SCALE_X1 := 0.765   # x where BAND_HI (107.9) sits — under the "108" label
const SCALE_Y := 0.24     # top of the pointer travel
const SCALE_H := 0.11     # pointer height (down over the tick strip)
const WIN_X := 0.24       # display window left
const WIN_Y := 0.40       # display window top
const WIN_W := 0.52       # display window width
const WIN_H := 0.18       # display window height

var _dial: TextureRect
var _pointer: ColorRect
var _display: Label
var pointer_frac: float = 0.0  ## sim hook: 0..1 pointer position across the band

const AMBER := Color(1.0, 0.66, 0.18)
const MARK := Color(1.0, 0.42, 0.12)


static func create(w: float = 400.0) -> ProtoRadioFace:
	var g := ProtoRadioFace.new()
	g.custom_minimum_size = Vector2(w, w * 360.0 / 640.0) # match the faceplate aspect
	g.size = g.custom_minimum_size
	g.size_flags_horizontal = Control.SIZE_SHRINK_CENTER  # never stretch (coords stay true)
	g.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var tex: Texture2D = load(FACE_PNG) if ResourceLoader.exists(FACE_PNG) else null
	g._dial = TextureRect.new()
	g._dial.set_anchors_preset(Control.PRESET_FULL_RECT)
	g._dial.texture = tex
	g._dial.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	g._dial.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	g._dial.mouse_filter = Control.MOUSE_FILTER_IGNORE
	g._dial.visible = tex != null
	g.add_child(g._dial)

	g._pointer = ColorRect.new()
	g._pointer.color = MARK
	g._pointer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	g._pointer.visible = false
	g.add_child(g._pointer)

	g._display = Label.new()
	var fnt: Font = load(LCD_FONT) if ResourceLoader.exists(LCD_FONT) else ProtoHUD.mixed_font()
	g._display.add_theme_font_override("font", fnt)
	g._display.add_theme_color_override("font_color", AMBER)
	g._display.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	g._display.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	g._display.mouse_filter = Control.MOUSE_FILTER_IGNORE
	g.add_child(g._display)
	return g


func has_dial() -> bool:
	return _dial != null and _dial.texture != null


## Drive the two live parts: the pointer's x from the frequency, the window text from
## the tuned station. `powered` off = a dark window (no text) and the pointer at rest.
func set_state(freq: float, band_lo: float, band_hi: float, text: String, powered: bool) -> void:
	var sz := custom_minimum_size
	var t := clampf((freq - band_lo) / maxf(0.001, band_hi - band_lo), 0.0, 1.0)
	pointer_frac = t
	var pw := maxf(2.0, sz.x * 0.006)
	_pointer.position = Vector2(lerpf(SCALE_X0, SCALE_X1, t) * sz.x - pw * 0.5, SCALE_Y * sz.y)
	_pointer.size = Vector2(pw, SCALE_H * sz.y)
	_pointer.visible = has_dial()
	_display.position = Vector2(WIN_X * sz.x, WIN_Y * sz.y)
	_display.size = Vector2(WIN_W * sz.x, WIN_H * sz.y)
	_display.add_theme_font_size_override("font_size", maxi(10, int(WIN_H * sz.y * 0.62)))
	_display.text = text if powered else ""
