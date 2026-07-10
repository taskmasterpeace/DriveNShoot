## THE BODY DOLL (owner ask 2026-07-10: "add in like body parts damage... the
## doll thing where we can show the damage"): the character's 6-part paper-doll
## made VISIBLE — the silhouette art (assets/ui/doll/body_doll.png) with each
## wound region tinted by its live Damageable tier. Quiet when whole, loud when
## hurt — the same tier grammar as the vehicle doll and the dash. Part anchors
## are fractions of the FIGURE's own alpha bbox (self-calibrating: regenerated
## art re-fits itself, no magic pixel numbers).
class_name ProtoBodyDoll
extends Control

const TEX_PATH := "res://assets/ui/doll/body_doll.png"
## part -> Rect2 in FIGURE-bbox fractions. Front-facing figure: viewer-left arm
## is labeled l_arm, matching the sheet's text rows top-to-bottom. Rects may be
## generous — the wound tint is MASKED by the art's own alpha, so it always
## follows the body's real shape, never a floating box.
const PART_RECTS: Dictionary = {
	"head":  Rect2(0.36, 0.00, 0.28, 0.16),
	"torso": Rect2(0.30, 0.16, 0.40, 0.36),
	"l_arm": Rect2(0.02, 0.18, 0.26, 0.44),
	"r_arm": Rect2(0.72, 0.18, 0.26, 0.44),
	"l_leg": Rect2(0.28, 0.52, 0.22, 0.48),
	"r_leg": Rect2(0.50, 0.52, 0.22, 0.48),
}

static var _tex: Texture2D = null
static var _fig_frac: Rect2 = Rect2(0, 0, 1, 1) ## figure alpha-bbox as texture fractions
static var _part_tex: Dictionary = {} ## part -> white ImageTexture masked by the art's alpha
static var _part_px: Dictionary = {}  ## part -> the mask's Rect2i in texture px (draw mapping)

var _tiers: Dictionary = {}


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if _tex == null and ResourceLoader.exists(TEX_PATH):
		_tex = load(TEX_PATH)
		var img: Image = _tex.get_image()
		if img != null:
			img.convert(Image.FORMAT_RGBA8)
			var used := img.get_used_rect() # self-calibrate the anchors to the art
			var tw := float(img.get_width())
			var th := float(img.get_height())
			_fig_frac = Rect2(used.position.x / tw, used.position.y / th,
				used.size.x / tw, used.size.y / th)
			# Bake per-part WHITE masks from the silhouette's own alpha (once,
			# static): tinting these paints the wound exactly on the body.
			for part in PART_RECTS:
				var f: Rect2 = PART_RECTS[part]
				var px := Rect2i(used.position + Vector2i(int(f.position.x * used.size.x), int(f.position.y * used.size.y)),
					Vector2i(maxi(1, int(f.size.x * used.size.x)), maxi(1, int(f.size.y * used.size.y))))
				px = px.intersection(Rect2i(0, 0, img.get_width(), img.get_height()))
				var sub := img.get_region(px)
				for y in sub.get_height():
					for x in sub.get_width():
						var a: float = sub.get_pixel(x, y).a
						sub.set_pixel(x, y, Color(1.0, 1.0, 1.0, a))
				_part_tex[part] = ImageTexture.create_from_image(sub)
				_part_px[part] = px


func set_tiers(t: Dictionary) -> void:
	if t == _tiers:
		return
	_tiers = t.duplicate()
	queue_redraw()


func tier_of(part: String) -> int: ## sim hook
	return int(_tiers.get(part, 0))


func _draw() -> void:
	if _tex == null:
		return
	var ts: Vector2 = _tex.get_size()
	var s: float = minf(size.x / ts.x, size.y / ts.y)
	var draw_size := ts * s
	var org := (size - draw_size) * 0.5
	draw_texture_rect(_tex, Rect2(org, draw_size), false)
	for part in PART_RECTS:
		var t: int = int(_tiers.get(part, 0))
		if t <= 0 or not _part_tex.has(part):
			continue # whole parts stay QUIET — the silhouette itself is the healthy read
		# The baked mask maps 1:1 back onto its texture-px rect, scaled with the art.
		var px: Rect2i = _part_px[part]
		var r := Rect2(org + Vector2(px.position) * s, Vector2(px.size) * s)
		var col: Color = ProtoHUD.TIER_COLORS[clampi(t, 0, 3)]
		draw_texture_rect(_part_tex[part], r, false, Color(col.r, col.g, col.b, 0.55 + 0.15 * t))
