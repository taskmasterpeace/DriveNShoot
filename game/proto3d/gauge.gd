## PROTO-3D GAUGE — the pixel-art speedometer cluster. THE DIAL is a generated PNG
## (PixelLab → assets/ui/gauges/<id>.png, a ROW in data/gauges.json); THE NEEDLE is
## drawn here in code and rotated by the car's speed. This is the whole trick: the
## art is baked, the moving hand is data-driven — so a new gauge is a PNG + a row
## (the house "everything is a row" law), never new needle code.
##
## A vehicle picks its face by vclass (each row lists the "vclasses" it serves). A
## MISSING dial falls back to the digital number, so the HUD never renders blank —
## the same fallback discipline as the world skins (world_builder.material_skin).
class_name ProtoGauge
extends Control

const GAUGES_JSON := "res://data/gauges.json"

# --- the data spine (static, shared): data/gauges.json → rows + reverse map + cache
static var _rows: Dictionary = {}       ## id -> row dict
static var _by_vclass: Dictionary = {}  ## vclass -> gauge id
static var _tex: Dictionary = {}        ## id -> Texture2D (lazy)
static var _loaded: bool = false

static func _ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true
	if not FileAccess.file_exists(GAUGES_JSON):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(GAUGES_JSON))
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var rows: Array = (parsed as Dictionary).get("gauges", [])
	for r in rows:
		var row: Dictionary = r
		var id: String = String(row.get("id", ""))
		if id == "":
			continue
		_rows[id] = row
		for vc in row.get("vclasses", []):
			_by_vclass[String(vc)] = id

static func row(id: String) -> Dictionary:
	_ensure_loaded()
	return _rows.get(id, {})

## Every known gauge id (sim hook / bulk loaders).
static func ids() -> Array:
	_ensure_loaded()
	return _rows.keys()

## The gauge id for a vehicle class — data-driven; "sport" when a class is unmapped.
static func for_vclass(vclass: String) -> String:
	_ensure_loaded()
	return String(_by_vclass.get(vclass, "sport"))

## The dial texture for a gauge id (lazy-loaded + cached; null if the PNG is absent).
static func texture(id: String) -> Texture2D:
	_ensure_loaded()
	if _tex.has(id):
		return _tex[id]
	var r: Dictionary = _rows.get(id, {})
	var path: String = String(r.get("png", ""))
	var tex: Texture2D = load(path) if (path != "" and ResourceLoader.exists(path)) else null
	_tex[id] = tex
	return tex

# --- instance ---------------------------------------------------------------
var _dial: TextureRect
var _needle: Node2D
var _blade: Polygon2D
var _hub: Polygon2D
var _digital: Label

var gauge_id: String = ""     ## sim hook: which face is showing
var needle_deg: float = 0.0   ## sim hook: current needle angle (deg, 0 = up, + = CW)
var redline_hot: bool = false ## sim hook: is the needle past the redline right now
var _max: float = 160.0
var _redline: float = 135.0
var _start_deg: float = -135.0
var _sweep_deg: float = 270.0
var _s: float = 156.0

const AMBER := Color(0.98, 0.62, 0.16)
const RED := Color(1.0, 0.23, 0.18)
const BONE := Color(0.95, 0.92, 0.84)


static func create(size_px: float = 156.0) -> ProtoGauge:
	var g := ProtoGauge.new()
	g._s = size_px
	g.custom_minimum_size = Vector2(size_px, size_px)
	g.size = Vector2(size_px, size_px)
	g.mouse_filter = Control.MOUSE_FILTER_IGNORE

	g._dial = TextureRect.new()
	g._dial.set_anchors_preset(Control.PRESET_FULL_RECT)
	g._dial.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	g._dial.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	g._dial.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST # crisp pixels — the look
	g._dial.mouse_filter = Control.MOUSE_FILTER_IGNORE
	g.add_child(g._dial)

	g._needle = Node2D.new()
	g._needle.position = Vector2(size_px * 0.5, size_px * 0.5)
	g.add_child(g._needle)
	var tip := size_px * 0.34
	g._blade = Polygon2D.new()
	g._blade.polygon = PackedVector2Array([Vector2(-2.5, 7), Vector2(2.5, 7), Vector2(1.3, -tip), Vector2(-1.3, -tip)])
	g._blade.color = AMBER
	g._needle.add_child(g._blade)
	g._hub = Polygon2D.new()
	g._hub.polygon = _circle_pts(size_px * 0.037)
	g._hub.color = Color(0.08, 0.07, 0.05)
	g._needle.add_child(g._hub)

	g._digital = Label.new()
	g._digital.add_theme_font_override("font", ProtoHUD.mixed_font())
	g._digital.add_theme_font_size_override("font_size", 20)
	g._digital.add_theme_color_override("font_color", BONE)
	g._digital.add_theme_color_override("font_outline_color", Color(0.06, 0.05, 0.03))
	g._digital.add_theme_constant_override("outline_size", 6)
	g._digital.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	g._digital.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	g._digital.offset_top = -24.0
	g.add_child(g._digital)
	return g


static func _circle_pts(r: float, n: int = 12) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in n:
		var a := TAU * float(i) / float(n)
		pts.append(Vector2(cos(a), sin(a)) * r)
	return pts


## Point this gauge at a dial id — loads its texture + calibration. Missing dial =
## digital-only (the number still reads).
func apply(id: String) -> void:
	gauge_id = id
	var r: Dictionary = ProtoGauge.row(id)
	_max = float(r.get("max", 160.0))
	_redline = float(r.get("redline", _max * 0.85))
	_start_deg = float(r.get("start_deg", -135.0))
	_sweep_deg = float(r.get("sweep_deg", 270.0))
	var tex: Texture2D = ProtoGauge.texture(id)
	_dial.texture = tex
	_dial.visible = tex != null


## Is a real dial showing (vs the digital-only fallback)?
func has_dial() -> bool:
	return _dial != null and _dial.texture != null


## Drive the needle to a speed value (mph). Redline tints the hand + number red.
func set_value(v: float) -> void:
	var ratio := clampf(v / maxf(1.0, _max), 0.0, 1.0)
	needle_deg = _start_deg + ratio * _sweep_deg
	_needle.rotation = deg_to_rad(needle_deg)
	var hot := v >= _redline
	redline_hot = hot
	_blade.color = RED if hot else AMBER
	_digital.text = "%d" % int(round(maxf(0.0, v)))
	_digital.add_theme_color_override("font_color", RED if hot else BONE)
