## THE VEHICLE DAMAGE DOLL (owner ask 2026-07-10: "a silhouette that represents
## whatever the different classes are so we can have the damage... shown"): a
## top-down rig silhouette DRAWN FROM THE SAME SPEC ROWS that build the 3D body
## (chassis / cabin / wheels / armor) — every class, present or future, gets a
## doll for free and it always matches the rig. Live damage tints the anatomy:
## engine hood, wheel corners (tires), battery box, fuel-tank slab, chassis
## outline; the vehicles.json armor rows draw as FACE STRIPS (front/rear/sides —
## the directional-damage read). Forward is -Z = UP, matching the map's grammar.
class_name ProtoDamageDoll
extends Control

const PARTS: Array[String] = ["engine", "tires", "battery", "fuel_tank", "chassis"]

var _doll: Dictionary = {}  ## geometry rows (ProtoCar3D.doll_spec_for)
var _tiers: Dictionary = {} ## part -> live tier
var _on_fire: bool = false
var _fire_clock: float = 0.0
var _flash: Dictionary = {} ## part -> seconds left of the "just got WORSE" pulse


func _ready() -> void:
	set_process(false) # only ticks while on fire or a part is flashing
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _process(delta: float) -> void:
	_fire_clock += delta
	var done: Array = []
	for part in _flash:
		_flash[part] = float(_flash[part]) - delta
		if float(_flash[part]) <= 0.0:
			done.append(part)
	for part in done:
		_flash.erase(part)
	if not _on_fire and _flash.is_empty():
		set_process(false)
	queue_redraw()


## One call per dashboard tick: geometry from d["doll"] (absent = hidden — old
## hand-built dicts render exactly as before), tiers/fire from the same dict.
## Redraws only when something actually changed.
func update_state(d: Dictionary) -> void:
	var doll: Dictionary = d.get("doll", {})
	var changed: bool = false
	if doll != _doll: # absent key = empty = HIDDEN (P1 contract: old dicts render as before)
		_doll = doll
		changed = true
	var fire: bool = bool(d.get("on_fire", false))
	if fire != _on_fire:
		_on_fire = fire
		changed = true
	for part in PARTS:
		var t: int = int(d.get(part, 0))
		var old: int = int(_tiers.get(part, -1))
		if old != t:
			if t > old and old >= 0:
				_flash[part] = 0.7 # DAMAGE JUICE: the part pulses when it just got worse
			_tiers[part] = t
			changed = true
	set_process(_on_fire or not _flash.is_empty())
	visible = not _doll.is_empty()
	if changed and visible:
		queue_redraw()


func _draw() -> void:
	if _doll.is_empty():
		return
	# The instrument backing — same dark-plate-with-amber-edge grammar as the rest
	# of the HUD, so the doll reads as a gauge, not loose shapes over the world.
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.06, 0.055, 0.045, 0.78))
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.96, 0.72, 0.2, 0.55), false, 1.5)
	var body_w: float = float(_doll.get("w", 2.0))
	var body_l: float = float(_doll.get("l", 4.4))
	var pad := 10.0
	var s: float = minf((size.x - pad * 2.0) / body_w, (size.y - pad * 2.0) / body_l)
	var c := size * 0.5
	var hw := body_w * 0.5 * s
	var hl := body_l * 0.5 * s

	# 1) ARMOR FACE STRIPS behind the body — thickness + brightness follow the row.
	var armor: Dictionary = _doll.get("armor", {})
	var af: float = float(armor.get("front", 0.0))
	var ar: float = float(armor.get("rear", 0.0))
	var asd: float = float(armor.get("side", 0.0))
	if af > 0.0:
		draw_rect(Rect2(c.x - hw, c.y - hl - _strip(af), hw * 2.0, _strip(af)), _steel(af))
	if ar > 0.0:
		draw_rect(Rect2(c.x - hw, c.y + hl, hw * 2.0, _strip(ar)), _steel(ar))
	if asd > 0.0:
		draw_rect(Rect2(c.x - hw - _strip(asd), c.y - hl, _strip(asd), hl * 2.0), _steel(asd))
		draw_rect(Rect2(c.x + hw, c.y - hl, _strip(asd), hl * 2.0), _steel(asd))

	# 2) BODY — the outline IS the chassis part.
	var body := Rect2(c.x - hw, c.y - hl, hw * 2.0, hl * 2.0)
	draw_rect(body, Color(0.10, 0.11, 0.125, 1.0))
	draw_rect(body, _tier_color("chassis", 1.0), false, 2.0)

	# 3) WHEELS over the body — the TIRES part tints all corners (healthy = dark
	# rubber; worn+ = the tier color shouts). Wide rigs wear them PROUD of the
	# hull like the 3D cylinders; a two-wheeler's tires ARE its nose and tail —
	# drawn after the body so the narrow hull can't swallow them.
	var tire_col := Color(0.16, 0.17, 0.18, 0.95) if _tier("tires") == 0 else _tier_color("tires", 0.95)
	var proud: bool = body_w >= 1.0
	for wrow in _doll.get("wheels", []):
		var wr: Array = wrow
		var wx: float = float(wr[0]) * s
		var wz: float = float(wr[1]) * s
		var rad: float = float(wr[2]) * s
		var wcx: float = (signf(wx) * (body_w * 0.5 + 0.10) * s) if proud else 0.0
		var wcz: float = wz if proud else signf(wz) * (hl - rad)
		var ww: float = (0.30 if proud else 0.26) * s
		# (non-proud rigs center their tires — the rig's visible pair sits a touch
		# off-axis for physics, but the DOLL reads better symmetric)
		draw_rect(Rect2(c.x + wcx - ww * 0.5, c.y + wcz - rad, ww, rad * 2.0), tire_col)

	# 4) The felt parts as panels: ENGINE hood (front), BATTERY box (front-right),
	# FUEL TANK slab (rear). Healthy = quiet; worn+ = loud tier color.
	var eng := Rect2(c.x - hw * 0.72, c.y - hl + 3.0, hw * 1.44, hl * 0.38)
	draw_rect(eng, _tier_color("engine", 0.4 if _tier("engine") == 0 else 0.85))
	if _on_fire:
		var flick := 0.55 + 0.45 * sin(_fire_clock * 22.0)
		draw_rect(eng, Color(1.0, 0.5 * flick, 0.05, 0.5 + 0.35 * flick))
	var bat := Rect2(c.x + hw * 0.26, c.y - hl + hl * 0.44, hw * 0.42, hl * 0.2)
	draw_rect(bat, _tier_color("battery", 0.5 if _tier("battery") == 0 else 0.95))
	var tank := Rect2(c.x - hw * 0.6, c.y + hl - hl * 0.44, hw * 1.2, hl * 0.26)
	draw_rect(tank, _tier_color("fuel_tank", 0.4 if _tier("fuel_tank") == 0 else 0.85))

	# 5) CABIN glass on top (a bike's fairing is too small to read — skipped).
	var cab: Array = _doll.get("cabin", [])
	if cab.size() >= 3 and float(cab[0]) > 0.1:
		var cw: float = float(cab[0]) * s * 0.5
		var cl: float = float(cab[1]) * s * 0.5
		var cz: float = float(cab[2]) * s
		draw_rect(Rect2(c.x - cw, c.y + cz - cl, cw * 2.0, cl * 2.0), Color(0.22, 0.32, 0.40, 0.9))


func _strip(a: float) -> float:
	return 2.0 + clampf(a / 90.0, 0.0, 1.0) * 4.0


func _steel(a: float) -> Color:
	return Color(0.62, 0.68, 0.75, 0.16 + clampf(a / 90.0, 0.0, 1.0) * 0.4)


func _tier(part: String) -> int:
	return int(_tiers.get(part, 0))


## Healthy parts stay QUIET (dim slate — the doll is mostly dark until something
## hurts); tier 1+ shouts in the shared HUD tier palette. A part that just got
## WORSE pulses toward white for a beat (the hit you feel on the instrument).
func _tier_color(part: String, alpha: float) -> Color:
	var t := _tier(part)
	var base: Color
	if t == 0:
		base = Color(0.40, 0.45, 0.42, alpha * 0.4)
	else:
		var col: Color = ProtoHUD.TIER_COLORS[clampi(t, 0, 3)]
		base = Color(col.r, col.g, col.b, alpha)
	var fl: float = clampf(float(_flash.get(part, 0.0)) / 0.7, 0.0, 1.0)
	if fl > 0.0:
		base = base.lerp(Color(1.0, 1.0, 1.0, 1.0), fl * (0.55 + 0.45 * sin(_fire_clock * 26.0)))
	return base
