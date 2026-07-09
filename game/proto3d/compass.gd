## THE COMPASS (2026-07-09 playtest "we need a compass"): a top-center ribbon showing the
## heading you're POINTED — your facing on foot, the rig's nose at the wheel. Cardinals
## scroll as you turn/drive; the center pip is dead ahead. Reads the player's heading (not
## the fixed top-down camera), so it's meaningful everywhere. Fed each frame by proto3d via
## ProtoHUD.update_compass(). Amber to match the HUD's driving grammar (never purple).
class_name ProtoCompass
extends Control

const FOV := 2.6179939      ## ~150 degrees of arc shown across the ribbon (radians)
const AMBER := Color(0.96, 0.72, 0.2)
const TICK := Color(0.72, 0.63, 0.45, 0.8)

var heading: float = 0.0    ## radians; 0 = North (-Z), increasing clockwise
const CARDINALS := {0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW"}


func set_heading(h: float) -> void:
	if is_equal_approx(h, heading):
		return
	heading = h
	queue_redraw()


func _draw() -> void:
	var w: float = size.x
	var y: float = size.y
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.06, 0.05, 0.03, 0.42))
	var font: Font = ProtoHUD.mixed_font()
	for deg in range(0, 360, 15):
		var rel: float = wrapf(deg_to_rad(float(deg)) - heading, -PI, PI)
		if absf(rel) > FOV * 0.5:
			continue
		var x: float = w * 0.5 + (rel / (FOV * 0.5)) * (w * 0.5)
		var is_card: bool = CARDINALS.has(deg)
		var col: Color = AMBER if is_card else TICK
		draw_line(Vector2(x, y - (12.0 if is_card else 6.0)), Vector2(x, y), col, 2.0 if is_card else 1.0)
		if is_card and font != null:
			var lbl: String = String(CARDINALS[deg])
			var tw: float = font.get_string_size(lbl, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
			draw_string(font, Vector2(x - tw * 0.5, 15.0), lbl, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, col)
	# center pip — dead ahead
	draw_colored_polygon(PackedVector2Array([
		Vector2(w * 0.5 - 5.0, 0.0), Vector2(w * 0.5 + 5.0, 0.0), Vector2(w * 0.5, 9.0)]), AMBER)
