## THE TV FACE — a data-driven pixel TV cabinet (rows in data/tvs.json). The cabinet is a
## generated PNG with an EMPTY screen; the media pipeline plays the channel/video through
## the `screen` Control (positioned at the cabinet's screen rect). Same law as the radio
## LCD — the screen content is NEVER baked into the art. The face is an AspectRatioContainer
## so it always keeps the cabinet's proportions and the screen rect stays aligned at any
## size. Adding a TV = drop a PNG + a row.
class_name ProtoTVFace
extends AspectRatioContainer

const TVS_JSON := "res://data/tvs.json"

static var _rows: Dictionary = {}
static var _tex: Dictionary = {}
static var _loaded := false

static func _ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true
	if not FileAccess.file_exists(TVS_JSON):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(TVS_JSON))
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	for r in (parsed as Dictionary).get("tvs", []):
		var row: Dictionary = r
		var id: String = String(row.get("id", ""))
		if id != "":
			_rows[id] = row

static func row(id: String) -> Dictionary:
	_ensure_loaded()
	return _rows.get(id, {})

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

var tv_id: String = ""
var screen: Control        ## the video/channel content goes here (the cabinet's empty screen)
var _cabinet: TextureRect
var _inner: Control
var screen_frac: Rect2 = Rect2()  ## sim hook: the screen rect (fractions of the cabinet)


static func create(tv_id_in: String) -> ProtoTVFace:
	_ensure_loaded()
	var g := ProtoTVFace.new()
	g.tv_id = tv_id_in
	var r: Dictionary = _rows.get(tv_id_in, {})
	var w: float = float(r.get("w", 640))
	var h: float = float(r.get("h", 360))
	g.ratio = w / maxf(1.0, h)                                  # keep the cabinet's shape
	g.stretch_mode = AspectRatioContainer.STRETCH_FIT
	g.mouse_filter = Control.MOUSE_FILTER_IGNORE

	# The container sizes _inner to the cabinet aspect; cabinet + screen live inside it.
	g._inner = Control.new()
	g._inner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	g.add_child(g._inner)

	var tex: Texture2D = texture(tv_id_in)
	g._cabinet = TextureRect.new()
	g._cabinet.set_anchors_preset(Control.PRESET_FULL_RECT)
	g._cabinet.texture = tex
	g._cabinet.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	g._cabinet.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	g._cabinet.stretch_mode = TextureRect.STRETCH_SCALE          # _inner already matches aspect
	g._cabinet.mouse_filter = Control.MOUSE_FILTER_IGNORE
	g._cabinet.visible = tex != null
	g._inner.add_child(g._cabinet)

	# The screen area — anchored to the cabinet's empty screen rect (fractions), so it
	# tracks the cabinet at any size. The caller fills this with the live picture.
	var sr: Dictionary = r.get("screen", {})
	var sx: float = float(sr.get("x", 0.12))
	var sy: float = float(sr.get("y", 0.10))
	var sw: float = float(sr.get("w", 0.76))
	var sh: float = float(sr.get("h", 0.75))
	g.screen_frac = Rect2(sx, sy, sw, sh)
	g.screen = Control.new()
	g.screen.anchor_left = sx
	g.screen.anchor_top = sy
	g.screen.anchor_right = sx + sw
	g.screen.anchor_bottom = sy + sh
	g.screen.offset_left = 0.0
	g.screen.offset_top = 0.0
	g.screen.offset_right = 0.0
	g.screen.offset_bottom = 0.0
	g._inner.add_child(g.screen)
	return g


func has_cabinet() -> bool:
	return _cabinet != null and _cabinet.texture != null
