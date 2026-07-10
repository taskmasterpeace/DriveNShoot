## THE RADIO FACE — a data-driven pixel radio faceplate (rows in data/radios.json). Each
## face is a generated or hand-cleaned PNG with EMPTY dynamic zones; the code drives them:
##   analog  -> a tuning POINTER slides the FM scale ('scale' rect) + the display TEXT
##   digital -> just the display TEXT (freq / station) in the LCD window ('win' rect)
## The moving + live parts are NEVER baked into the art (same law as the speedometer
## needle). A missing PNG hides the face cleanly. Adding a radio = a PNG + a row.
class_name ProtoRadioFace
extends Control

const RADIOS_JSON := "res://data/radios.json"
const LCD_FONT := "res://assets/ui/fonts/radio_lcd.ttf"

# --- the data spine (static): data/radios.json -> rows + texture cache ---------
static var _rows: Dictionary = {}
static var _tex: Dictionary = {}
static var _loaded := false

static func _ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true
	if not FileAccess.file_exists(RADIOS_JSON):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(RADIOS_JSON))
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	for r in (parsed as Dictionary).get("radios", []):
		var row: Dictionary = r
		var id: String = String(row.get("id", ""))
		if id != "":
			_rows[id] = row

static func row(id: String) -> Dictionary:
	_ensure_loaded()
	return _rows.get(id, {})

## Every known radio face id (fleet loaders / the style cycler).
static func ids() -> Array:
	_ensure_loaded()
	return _rows.keys()

static func texture(id: String) -> Texture2D:
	_ensure_loaded()
	if _tex.has(id):
		return _tex[id]
	var r: Dictionary = _rows.get(id, {})
	var path: String = String(r.get("png", ""))
	var tex: Texture2D = load(path) if (path != "" and ResourceLoader.exists(path)) else null
	_tex[id] = tex
	return tex

# --- instance -----------------------------------------------------------------
var radio_id: String = ""
var _type: String = "analog"
var _scale: Dictionary = {}
var _win: Dictionary = {}
var _dial: TextureRect
var _pointer: ColorRect
var _display: Label
var pointer_frac: float = 0.0  ## sim hook: 0..1 pointer position across the band

const AMBER := Color(1.0, 0.66, 0.18)
const MARK := Color(1.0, 0.42, 0.12)


static func create(radio_id_in: String, w: float = 400.0) -> ProtoRadioFace:
	_ensure_loaded()
	var g := ProtoRadioFace.new()
	g.radio_id = radio_id_in
	var r: Dictionary = _rows.get(radio_id_in, {})
	g._type = String(r.get("type", "analog"))
	g._scale = r.get("scale", {})
	g._win = r.get("win", {})
	var aw: float = float(r.get("w", 640))
	var ah: float = float(r.get("h", 360))
	g.custom_minimum_size = Vector2(w, w * ah / maxf(1.0, aw)) # match the face's aspect
	g.size = g.custom_minimum_size
	g.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	g.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var tex: Texture2D = texture(radio_id_in)
	g._dial = TextureRect.new()
	g._dial.set_anchors_preset(Control.PRESET_FULL_RECT)
	g._dial.texture = tex
	g._dial.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	g._dial.expand_mode = TextureRect.EXPAND_IGNORE_SIZE # never overflow the control (the faceplate PNG is bigger than the widget)
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


func is_analog() -> bool:
	return _type == "analog"


## Drive the live parts: the pointer (analog faces only) from frequency, and the display
## text from the tuned station. `powered` off = a dark window and the pointer at rest.
func set_state(freq: float, band_lo: float, band_hi: float, text: String, powered: bool) -> void:
	var sz := custom_minimum_size
	var t := clampf((freq - band_lo) / maxf(0.001, band_hi - band_lo), 0.0, 1.0)
	pointer_frac = t
	# The tuning pointer — analog faces only (a digital head unit has no scale).
	if _type == "analog" and not _scale.is_empty() and has_dial():
		var pw := maxf(2.0, sz.x * 0.006)
		var x0: float = float(_scale.get("x0", 0.2))
		var x1: float = float(_scale.get("x1", 0.8))
		var sy: float = float(_scale.get("y", 0.24))
		var sh: float = float(_scale.get("h", 0.11))
		_pointer.position = Vector2(lerpf(x0, x1, t) * sz.x - pw * 0.5, sy * sz.y)
		_pointer.size = Vector2(pw, sh * sz.y)
		_pointer.visible = true
	else:
		_pointer.visible = false
	# The display text — every face renders it (the whole point of the LCD font).
	if not _win.is_empty():
		var wx: float = float(_win.get("x", 0.25))
		var wy: float = float(_win.get("y", 0.40))
		var ww: float = float(_win.get("w", 0.50))
		var wh: float = float(_win.get("h", 0.18))
		_display.position = Vector2(wx * sz.x, wy * sz.y)
		_display.size = Vector2(ww * sz.x, wh * sz.y)
		_display.add_theme_font_size_override("font_size", maxi(8, int(wh * sz.y * 0.62)))
	_display.text = text if powered else ""
