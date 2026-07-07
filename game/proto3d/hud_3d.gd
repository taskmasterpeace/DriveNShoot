## PROTO-3D HUD: speed, mode, binocular indicator, and the controls line.
class_name ProtoHUD
extends CanvasLayer

var _speed_label: Label
var _mode_label: Label
var _binoc_label: Label
var _help_label: Label
var _prompt_label: Label
var _keys_label: Label
var _toast_label: Label
var _vignette: ColorRect
var _toast_tween: Tween
var _moodle_box: VBoxContainer
var _dash_wrap: VBoxContainer
var _dash_status: Label ## the useful line: vehicle · surface/struggle · cargo (sim hook)
var _dash_box: HBoxContainer
var _dash_labels: Dictionary = {}
var _dash_fuel: Label
var _dash_cook: Label

const TIER_COLORS: Array[Color] = [
	Color(0.92, 0.89, 0.82, 0.55), # GOOD — quiet
	Color(0.96, 0.85, 0.25, 1.0),  # WORN — yellow
	Color(0.98, 0.55, 0.15, 1.0),  # CRITICAL — orange
	Color(0.95, 0.2, 0.12, 1.0),   # BROKEN — red
]

## Current interact prompt text ("" when hidden) — read by sim tests.
var current_prompt: String = ""

## Moodle system (PZ-style): id -> active tier (0 = hidden). Read by sim tests.
var active_moodles: Dictionary = {}
## External conditions (sick/drunk/high/hurt/cold...) set via set_condition().
var _conditions: Dictionary = {}
var _moodle_labels: Dictionary = {}

## The moodle table — HOW YOUR CHARACTER FEELS, as regular emoticons (user spec:
## PZ-style corner, the emoji IS the meter). tiers[0] unused; higher tier = worse.
## Adding a feeling = adding a row. Order in this dict = display priority.
const MOODLES: Dictionary = {
	"stress": {"tiers": ["", "😟", "😰", "😱"]},
	"tired": {"tiers": ["", "😮‍💨", "🥵", "😫"]}, # WINDED, not sleepy (playtest: 🥱 read as a yawn)
	"sick": {"tiers": ["", "🤧", "🤒", "🤮"]},
	"drunk": {"tiers": ["", "🙂", "🥴", "🥴"]},
	"high": {"tiers": ["", "😌", "😵‍💫", "😵"]},
	"hurt": {"tiers": ["", "😣", "🤕", "😵"]},
	"cold": {"tiers": ["", "🥶", "🥶", "🥶"]},
	"hungry": {"tiers": ["", "😐", "😖", "😫"]},
	"happy": {"tiers": ["", "🙂", "😊", "😄"]},
	"heavy": {"tiers": ["", "🎒", "🎒", "🐢"]},
}

const AMBER := Color(0.96, 0.72, 0.2)
const BONE := Color(0.92, 0.89, 0.82)

## Windows color-emoji font for the moodles (default theme font has no emoji glyphs).
static var _emoji_font: SystemFont = null

static var _mixed_font: SystemFont = null

static func emoji_font() -> SystemFont:
	if _emoji_font == null:
		_emoji_font = SystemFont.new()
		_emoji_font.font_names = PackedStringArray(["Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji"])
	return _emoji_font


## Text font that can still draw emoji (for toasts/prompts that mix both).
static func mixed_font() -> SystemFont:
	if _mixed_font == null:
		_mixed_font = SystemFont.new()
		_mixed_font.font_names = PackedStringArray(["Segoe UI", "Segoe UI Emoji", "Noto Color Emoji"])
	return _mixed_font

## THE FULL-SCREEN BINOCULARS (owner ask, 2026-07-07): the old vignette filled
## most of the frame with black — this one is a THIN RIM. Two independent bands,
## both maxed out only right at the frame's true edge, taken together (max, not
## added) so they never stack into something heavier than either alone:
##   RIM  — the four corners only (oval radial falloff, matches the old shape)
##   LENS — a hairline top/bottom curve (the "looking through glass" cue)
## VIGNETTE_MASK_CLEAR_PCT is the measured screen fraction left fully/near-clear
## (alpha < 0.05) at these constants — the sim asserts against it directly since
## a headless run can't read shader pixels back.
const VIGNETTE_RIM_START: float = 1.25   ## d at which the corner rim begins
const VIGNETTE_RIM_END: float = 1.68     ## d at the true corner (max darkness here)
const VIGNETTE_RIM_MAX_ALPHA: float = 0.55
const VIGNETTE_LENS_START: float = 0.95  ## |v-0.5|*2 at which top/bottom shading begins
const VIGNETTE_LENS_END: float = 1.0
const VIGNETTE_LENS_MAX_ALPHA: float = 0.22
const VIGNETTE_MASK_CLEAR_PCT: float = 0.86 ## measured (scripts/vignette_calc*.js) — ≥85% clear

## NOTE: literals below MUST mirror the VIGNETTE_* consts above (a %-formatted
## string is not a valid const expression — the consts exist for sims to assert).
const VIGNETTE_SHADER := "
shader_type canvas_item;
void fragment() {
	vec2 c = UV - vec2(0.5);
	c.x *= 1.35; // slightly oval, like lenses
	float d = length(c) * 2.0;
	float rim = smoothstep(1.25, 1.68, d) * 0.55;
	float vy = abs(UV.y - 0.5) * 2.0;
	float lens = smoothstep(0.95, 1.00, vy) * 0.22;
	float a = max(rim, lens);
	COLOR = vec4(0.0, 0.0, 0.0, a);
}"


static func create() -> ProtoHUD:
	var hud := ProtoHUD.new()

	hud._speed_label = Label.new()
	hud._speed_label.add_theme_font_size_override("font_size", 44)
	hud._speed_label.add_theme_color_override("font_color", AMBER)
	hud._speed_label.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	hud._speed_label.offset_left = 28.0
	hud._speed_label.offset_top = -100.0
	hud._speed_label.offset_bottom = -48.0
	hud._speed_label.text = "0 MPH"
	hud.add_child(hud._speed_label)

	hud._mode_label = Label.new()
	hud._mode_label.add_theme_font_override("font", ProtoHUD.mixed_font())
	hud._mode_label.add_theme_font_size_override("font_size", 20)
	hud._mode_label.add_theme_color_override("font_color", BONE)
	hud._mode_label.set_anchors_preset(Control.PRESET_TOP_LEFT)
	hud._mode_label.position = Vector2(28, 20)
	hud._mode_label.text = "DIVIDED STATES — INTERSTATE 9"
	hud.add_child(hud._mode_label)

	hud._binoc_label = Label.new()
	hud._binoc_label.add_theme_font_size_override("font_size", 30)
	hud._binoc_label.add_theme_color_override("font_color", AMBER)
	hud._binoc_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	hud._binoc_label.offset_left = -110.0
	hud._binoc_label.offset_top = 56.0
	hud._binoc_label.offset_bottom = 96.0
	hud._binoc_label.text = "[ BINOCULARS ]"
	hud._binoc_label.visible = false
	hud.add_child(hud._binoc_label)

	hud._help_label = Label.new()
	hud._help_label.add_theme_font_override("font", ProtoHUD.mixed_font())
	hud._help_label.add_theme_font_size_override("font_size", 15)
	hud._help_label.add_theme_color_override("font_color", Color(BONE, 0.75))
	hud._help_label.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	hud._help_label.offset_left = 28.0
	hud._help_label.offset_top = -42.0
	hud._help_label.offset_bottom = -18.0
	hud.add_child(hud._help_label)

	# Moodle column (PZ-style): top-right, under the key ring. The emoji ARE the
	# meters — no bars. Large enough to read, not so large they shout (user spec).
	hud._moodle_box = VBoxContainer.new()
	hud._moodle_box.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	hud._moodle_box.offset_left = -96.0
	hud._moodle_box.offset_right = -20.0
	hud._moodle_box.offset_top = 56.0
	hud._moodle_box.offset_bottom = 520.0
	hud._moodle_box.alignment = BoxContainer.ALIGNMENT_BEGIN
	hud._moodle_box.add_theme_constant_override("separation", 6)
	hud.add_child(hud._moodle_box)
	for id in MOODLES:
		var lbl := Label.new()
		lbl.add_theme_font_override("font", ProtoHUD.emoji_font())
		lbl.add_theme_font_size_override("font_size", 42)
		lbl.add_theme_color_override("font_outline_color", Color(0.06, 0.05, 0.03))
		lbl.add_theme_constant_override("outline_size", 8)
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		lbl.visible = false
		hud._moodle_box.add_child(lbl)
		hud._moodle_labels[id] = lbl

	# Car dashboard (bottom-right, only while driving) — the USEFUL version:
	# a status line (which rig · what ground · cargo load) over the parts row,
	# each part showing an actual ▮▮▮▱ condition bar, fuel as a bar, 💥 on fire.
	hud._dash_wrap = VBoxContainer.new()
	hud._dash_wrap.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	hud._dash_wrap.offset_left = -560.0
	hud._dash_wrap.offset_right = -20.0
	hud._dash_wrap.offset_top = -110.0
	hud._dash_wrap.offset_bottom = -24.0
	hud._dash_wrap.alignment = BoxContainer.ALIGNMENT_END
	hud._dash_wrap.visible = false
	hud.add_child(hud._dash_wrap)
	hud._dash_status = Label.new()
	hud._dash_status.add_theme_font_override("font", ProtoHUD.mixed_font())
	hud._dash_status.add_theme_font_size_override("font_size", 15)
	hud._dash_status.add_theme_color_override("font_color", BONE)
	hud._dash_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	hud._dash_wrap.add_child(hud._dash_status)
	hud._dash_box = HBoxContainer.new()
	hud._dash_box.alignment = BoxContainer.ALIGNMENT_END
	hud._dash_box.add_theme_constant_override("separation", 10)
	hud._dash_wrap.add_child(hud._dash_box)
	for part in ["engine", "tires", "battery", "fuel_tank", "chassis"]:
		var pl := Label.new()
		pl.add_theme_font_override("font", ProtoHUD.mixed_font())
		pl.add_theme_font_size_override("font_size", 20)
		hud._dash_box.add_child(pl)
		hud._dash_labels[part] = pl
	hud._dash_fuel = Label.new()
	hud._dash_fuel.add_theme_font_override("font", ProtoHUD.mixed_font())
	hud._dash_fuel.add_theme_font_size_override("font_size", 18)
	hud._dash_fuel.add_theme_color_override("font_color", BONE)
	hud._dash_box.add_child(hud._dash_fuel)
	hud._dash_cook = Label.new()
	hud._dash_cook.add_theme_font_override("font", ProtoHUD.mixed_font())
	hud._dash_cook.add_theme_font_size_override("font_size", 24)
	hud._dash_cook.add_theme_color_override("font_color", Color(0.98, 0.4, 0.1))
	hud._dash_box.add_child(hud._dash_cook)

	# Binocular vignette (under the labels)
	hud._vignette = ColorRect.new()
	hud._vignette.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud._vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var shader := Shader.new()
	shader.code = VIGNETTE_SHADER
	var mat := ShaderMaterial.new()
	mat.shader = shader
	hud._vignette.material = mat
	hud._vignette.visible = false
	hud.add_child(hud._vignette)
	hud.move_child(hud._vignette, 0)

	# Interact prompt chip (center-bottom)
	hud._prompt_label = Label.new()
	hud._prompt_label.add_theme_font_override("font", ProtoHUD.mixed_font())
	hud._prompt_label.add_theme_font_size_override("font_size", 24)
	hud._prompt_label.add_theme_color_override("font_color", AMBER)
	hud._prompt_label.add_theme_color_override("font_outline_color", Color(0.08, 0.06, 0.03))
	hud._prompt_label.add_theme_constant_override("outline_size", 10)
	hud._prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud._prompt_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	hud._prompt_label.offset_left = -320.0
	hud._prompt_label.offset_right = 320.0
	hud._prompt_label.offset_top = -140.0
	hud._prompt_label.offset_bottom = -104.0
	hud._prompt_label.visible = false
	hud.add_child(hud._prompt_label)

	# Key ring (top-right)
	hud._keys_label = Label.new()
	hud._keys_label.add_theme_font_override("font", ProtoHUD.mixed_font())
	hud._keys_label.add_theme_font_size_override("font_size", 15)
	hud._keys_label.add_theme_color_override("font_color", Color(BONE, 0.85))
	hud._keys_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	hud._keys_label.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	hud._keys_label.offset_left = -340.0
	hud._keys_label.offset_right = -24.0
	hud._keys_label.offset_top = 20.0
	hud._keys_label.offset_bottom = 44.0
	hud.add_child(hud._keys_label)

	# Toast (center, fades)
	hud._toast_label = Label.new()
	hud._toast_label.add_theme_font_override("font", ProtoHUD.mixed_font())
	hud._toast_label.add_theme_font_size_override("font_size", 26)
	hud._toast_label.add_theme_color_override("font_color", BONE)
	hud._toast_label.add_theme_color_override("font_outline_color", Color(0.08, 0.06, 0.03))
	hud._toast_label.add_theme_constant_override("outline_size", 10)
	hud._toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud._toast_label.set_anchors_preset(Control.PRESET_CENTER)
	hud._toast_label.offset_left = -360.0
	hud._toast_label.offset_right = 360.0
	hud._toast_label.offset_top = -120.0
	hud._toast_label.offset_bottom = -80.0
	hud._toast_label.modulate.a = 0.0
	hud.add_child(hud._toast_label)
	return hud


func show_prompt(text: String) -> void:
	current_prompt = text
	_prompt_label.text = text
	_prompt_label.visible = text != ""


func set_keys(names: Array) -> void:
	_keys_label.text = "" if names.is_empty() else "KEYS: " + ", ".join(names)


func toast(text: String) -> void:
	_toast_label.text = text
	_toast_label.modulate.a = 1.0
	if _toast_tween and _toast_tween.is_valid():
		_toast_tween.kill()
	_toast_tween = create_tween()
	_toast_tween.tween_interval(1.4)
	_toast_tween.tween_property(_toast_label, "modulate:a", 0.0, 0.8)


func set_speed(mph: float, driving: bool) -> void:
	_speed_label.visible = driving
	_speed_label.text = "%d MPH" % int(mph)


## The emoji ARE the meters. Called once per frame with the character's vitals;
## derives moodle tiers, merges external conditions, renders the corner column.
func set_vitals(stamina: float, max_stamina: float, stress: float, comfort_near: bool) -> void:
	var tiers: Dictionary = {}
	# Tired — replaces the stamina bar entirely (user call).
	var sr: float = stamina / maxf(1.0, max_stamina)
	tiers["tired"] = 3 if sr < 0.15 else (2 if sr < 0.35 else (1 if sr < 0.6 else 0))
	# Stressed — replaces the stress bar.
	tiers["stress"] = 3 if stress >= 80.0 else (2 if stress >= 55.0 else (1 if stress >= 30.0 else 0))
	# Happy — a Cuddle dog nearby and a calm mind show as a FEELING, not a buff icon.
	tiers["happy"] = 2 if (comfort_near and stress < 25.0) else 0
	# External conditions (sick/drunk/high/hurt/cold/hungry) — set via set_condition().
	for id in _conditions:
		tiers[id] = _conditions[id]
	_apply_moodles(tiers)


const DASH_EMOJI := {"engine": "🔧", "tires": "🛞", "battery": "🔋", "fuel_tank": "⛽", "chassis": "🛡️"}

## Four-segment condition bar — readable at a glance, no color-decoding needed.
static func _bar(r: float) -> String:
	var segs := clampi(int(ceil(r * 4.0 - 0.001)), 0, 4)
	return "▮".repeat(segs) + "▱".repeat(4 - segs)


## Sim hook (P0-1, CAR_UI_REQUIREMENTS.md): read back a rendered part-bar's text
## without scraping Label internals — "" if the part isn't a dash row.
func dash_part_text(part: String) -> String:
	return (_dash_labels[part] as Label).text if _dash_labels.has(part) else ""


## Sim hook: the rendered fuel/charge readout (P1-4 EV branch shares this slot).
func dash_fuel_text() -> String:
	return _dash_fuel.text


## Sim hook: the rendered status line (occupant clause, P1-2, lands here).
func dash_status_text() -> String:
	return _dash_status.text


## P1-3 (CAR_UI_REQUIREMENTS.md, GPS/tablet device gate — spec hooks only, not
## greenlit): a small glyph beside the location strip, shown ONLY when the
## dashboard dict carries a gps_tier key. Absent key = hidden = today's behavior
## (see set_dashboard's call below). "full" also hides it (nothing to flag when
## the device is maxed out); "none" reads 🚫; anything else (e.g. a future
## "basic") reads 📡. Own Label so _mode_label's text contract (set_location)
## stays untouched.
var _gps_label: Label = null

func set_gps_tier(tier: String) -> void:
	if _gps_label == null:
		_gps_label = Label.new()
		_gps_label.add_theme_font_override("font", ProtoHUD.mixed_font())
		_gps_label.add_theme_font_size_override("font_size", 18)
		_gps_label.add_theme_color_override("font_color", AMBER)
		_gps_label.set_anchors_preset(Control.PRESET_TOP_LEFT)
		_gps_label.position = Vector2(28, 48)
		add_child(_gps_label)
	if tier == "" or tier == "full":
		_gps_label.visible = false
		return
	_gps_label.text = "🚫" if tier == "none" else "📡"
	_gps_label.visible = true

## Sim hook: is the GPS glyph currently shown, and which glyph.
func gps_glyph_shown() -> bool:
	return _gps_label != null and _gps_label.visible

func gps_glyph_text() -> String:
	return _gps_label.text if _gps_label != null else ""


## The car's dashboard: pass ProtoCar3D.dashboard() while driving, null to hide.
## Dict-key contract for producers not yet built (documented, not wired, per
## CAR_UI_REQUIREMENTS.md P1-2/P1-3/P1-4 — every key below is read with .get()
## and a gas-car-safe default, so a dict missing them renders EXACTLY as today):
##   occupants_h  (int, riders/crew excluding the driver)  — P1-2 roster count
##   occupants_d  (int, dogs aboard)                       — P1-2 roster count
##   powertrain   (String "gas" | "electric")               — P1-4 EV branch gate
##   charge_pct   (float 0-100, mirrors "fuel"'s convention) — P1-4, only read if electric
##   max_range_mi (float, full-charge range in miles)        — P1-4 range estimate
##   solar_active (bool)                                     — P1-4 ☀️ trickle badge
##   charge_state (String "DRAINING"|"IDLE"|"CHARGING")      — P1-4, default IDLE
##   gps_tier     (String "full"|"none"|<other>, absent=hidden) — P1-3 glyph
func set_dashboard(d) -> void:
	if d == null:
		_dash_wrap.visible = false
		return
	_dash_wrap.visible = true
	var ratios: Dictionary = d.get("ratios", {})
	for part in _dash_labels:
		var tier: int = d[part]
		var lbl: Label = _dash_labels[part]
		lbl.text = "%s%s" % [DASH_EMOJI[part], _bar(ratios.get(part, 1.0))]
		lbl.modulate = TIER_COLORS[tier]
	# P1-4 (EV row, dormant until a vehicles.json row sets powertrain=="electric"):
	# the SAME bar widget, SAME dash slot — never both fuel and charge at once.
	if String(d.get("powertrain", "gas")) == "electric":
		var charge_pct: float = float(d.get("charge_pct", 100.0))
		var max_range: float = float(d.get("max_range_mi", 0.0))
		var range_mi: int = int(charge_pct * max_range / 100.0)
		var state: String = String(d.get("charge_state", "IDLE"))
		var badge: String = " ☀️" if bool(d.get("solar_active", false)) else ""
		_dash_fuel.text = "🔋CHARGE %s %d%% ~%dmi %s%s" % [_bar(charge_pct / 100.0), int(charge_pct), range_mi, state, badge]
	else:
		# LABELED (playtest: "I don't know what the percentage is") — the number is FUEL.
		_dash_fuel.text = "⛽FUEL %s %d%%" % [_bar(d["fuel"] / 100.0), int(d["fuel"])]
	if d["on_fire"]:
		_dash_cook.text = "💥BLOW %d%%" % int(d["cook"])
		_dash_cook.visible = true
	else:
		_dash_cook.visible = false
	# The status line: WHICH rig, WHAT ground is doing to you, WHAT you're hauling.
	var bits: Array[String] = ["🚗 %s" % d.get("name", "car")]
	if d.get("tires", 0) >= 2:
		bits.append("🛞 TIRES SHOT — limping")
	elif d.get("struggling", false):
		bits.append("🐢 BOGGED — %s tires churning dirt" % d.get("tire_name", ""))
	elif d.get("surface", "road") != "road":
		bits.append("⛰️ DIRT — %s tires (%d%% drive)" % [d.get("tire_name", ""), int(d.get("drive_factor", 1.0) * 100.0)])
	if d.get("load_max", 0.0) > 0.0:
		bits.append("📦 %.0f/%.0f kg" % [d.get("load", 0.0), d.get("load_max", 0.0)])
	# P1-2 (occupant roster, dormant until car/proto3d wires seat counts in): a
	# compact count clause, no names — the physical rig + boarding toast own names.
	var occ_h: int = int(d.get("occupants_h", 0))
	var occ_d: int = int(d.get("occupants_d", 0))
	if occ_h > 0 or occ_d > 0:
		var occ_bits: Array[String] = []
		if occ_h > 0:
			occ_bits.append("🧍×%d" % occ_h)
		if occ_d > 0:
			occ_bits.append("🐕×%d" % occ_d)
		bits.append(" ".join(occ_bits))
	_dash_status.text = "  ·  ".join(bits)
	var alarmed: bool = d.get("struggling", false) or d.get("tires", 0) >= 2
	_dash_status.add_theme_color_override("font_color", Color(0.98, 0.62, 0.2) if alarmed else BONE)
	# P1-3 (GPS glyph, dormant until proto3d wires a device-tier check onto the
	# car dict): absent key → set_gps_tier("") → hidden, zero behavior change.
	set_gps_tier(String(d.get("gps_tier", "")))


## Future/system hook: mark a condition (0 clears; 1-3 = severity). One call = one feeling.
func set_condition(id: String, tier: int) -> void:
	if tier <= 0:
		_conditions.erase(id)
	else:
		_conditions[id] = clampi(tier, 1, 3)


func _apply_moodles(tiers: Dictionary) -> void:
	active_moodles = {}
	for id in MOODLES:
		var tier: int = tiers.get(id, 0)
		var lbl: Label = _moodle_labels[id]
		if tier <= 0:
			lbl.visible = false
			continue
		var was_hidden := not lbl.visible
		active_moodles[id] = tier
		lbl.text = MOODLES[id]["tiers"][tier]
		lbl.visible = true
		if was_hidden: # pop-in: feelings ANNOUNCE themselves
			lbl.scale = Vector2(1.6, 1.6)
			var tw := lbl.create_tween()
			tw.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
			tw.tween_property(lbl, "scale", Vector2.ONE, 0.35)
		# Worst tier pulses gently so it catches the eye without a meter.
		lbl.modulate.a = 0.75 + 0.25 * sin(Time.get_ticks_msec() * 0.006) if tier >= 3 else 1.0


func set_mode(driving: bool) -> void:
	if driving:
		_help_label.text = "W/S throttle · A/D steer · SPACE handbrake · E out · TAB trunk · Y radio · M map · K sheet · F5/F9 save/load · hold B binoculars"
	else:
		_help_label.text = "WASD move · SHIFT sprint · SPACE dive · E interact · C whistle ×1-4 · Y radio · TAB pack · M map · K sheet · T wait · F5/F9 save · hold B binocs"


var _flash: ColorRect = null
var _ammo_label: Label = null
var _hp_label: Label = null

## ❤️ HP / cap — numeric (you count blood like bullets when it's this scarce).
func set_hp(hp: float, cap: float, show: bool) -> void:
	if _hp_label == null:
		_hp_label = Label.new()
		_hp_label.add_theme_font_override("font", ProtoHUD.mixed_font())
		_hp_label.add_theme_font_size_override("font_size", 22)
		_hp_label.add_theme_color_override("font_color", Color(0.9, 0.3, 0.2))
		_hp_label.add_theme_color_override("font_outline_color", Color(0.08, 0.06, 0.03))
		_hp_label.add_theme_constant_override("outline_size", 8)
		_hp_label.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
		_hp_label.offset_left = 28.0
		_hp_label.offset_top = -166.0
		_hp_label.offset_bottom = -138.0
		add_child(_hp_label)
	_hp_label.visible = show
	if show:
		_hp_label.text = "❤️ %d / %d" % [int(hp), int(cap)]
		_hp_label.modulate.a = 0.75 + 0.25 * sin(Time.get_ticks_msec() * 0.008) if hp < 30.0 else 1.0
var _sheet_panel: Panel = null
var _sheet_label: Label = null
var _death_label: Label = null

## The character sheet (K): one FIXED, screen-centered panel that SCROLLS. It
## narrates every system, so the text is long — a content-sized panel grew down
## and off the bottom of the screen (playtest: "K opens at the bottom-left").
## A fixed Panel + inner ScrollContainer keeps it centered and bounded no matter
## how much it says.
func toggle_sheet(text: String) -> void:
	if _sheet_panel == null:
		var vp := get_viewport().get_visible_rect().size
		var w: float = minf(540.0, vp.x - 80.0)
		var h: float = minf(640.0, vp.y - 80.0)
		_sheet_panel = Panel.new() # Panel, NOT PanelContainer — a fixed rect, never grows to content
		_sheet_panel.set_anchors_preset(Control.PRESET_CENTER)
		_sheet_panel.offset_left = -w * 0.5
		_sheet_panel.offset_right = w * 0.5
		_sheet_panel.offset_top = -h * 0.5
		_sheet_panel.offset_bottom = h * 0.5
		var style := StyleBoxFlat.new()
		style.bg_color = Color(0.10, 0.09, 0.07, 0.94)
		style.border_color = AMBER
		style.set_border_width_all(2)
		style.set_corner_radius_all(6)
		_sheet_panel.add_theme_stylebox_override("panel", style)
		var scroll := ScrollContainer.new()
		scroll.set_anchors_preset(Control.PRESET_FULL_RECT)
		scroll.offset_left = 18.0
		scroll.offset_top = 18.0
		scroll.offset_right = -18.0
		scroll.offset_bottom = -18.0
		scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		_sheet_panel.add_child(scroll)
		_sheet_label = Label.new()
		_sheet_label.add_theme_font_override("font", ProtoHUD.mixed_font())
		_sheet_label.add_theme_font_size_override("font_size", 18)
		_sheet_label.add_theme_color_override("font_color", BONE)
		_sheet_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_sheet_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_sheet_label.custom_minimum_size = Vector2(w - 52.0, 0)
		scroll.add_child(_sheet_label)
		add_child(_sheet_panel)
		_sheet_panel.visible = false
	_sheet_panel.visible = not _sheet_panel.visible
	if _sheet_panel.visible:
		_sheet_label.text = text

func sheet_open() -> bool:
	return _sheet_panel != null and _sheet_panel.visible

## Death screen — you went down. R wakes you at the safehouse (soft respawn).
var _death_shade: ColorRect = null
func show_death(text: String) -> void:
	if _death_label == null:
		_death_shade = ColorRect.new()
		_death_shade.set_anchors_preset(Control.PRESET_FULL_RECT)
		_death_shade.color = Color(0.05, 0.02, 0.02, 0.82)
		_death_shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(_death_shade)
		_death_label = Label.new()
		_death_label.add_theme_font_override("font", ProtoHUD.mixed_font())
		_death_label.add_theme_font_size_override("font_size", 34)
		_death_label.add_theme_color_override("font_color", Color(0.9, 0.2, 0.12))
		_death_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_death_label.set_anchors_preset(Control.PRESET_CENTER)
		_death_label.offset_left = -420.0
		_death_label.offset_right = 420.0
		_death_label.offset_top = -70.0
		_death_label.offset_bottom = 70.0
		add_child(_death_label)
	_death_label.text = text
	_death_label.visible = true

# --- Jump sickness (Carousel): the ring TEARS you across the country ------------
## White-out that decays through a sick teal afterimage (~1.6s). GL-compat friendly:
## a driven ColorRect, no shader. jump_flash_active() is the sim hook.
var _jump_flash: ColorRect = null
var _jump_t: float = 0.0

func jump_flash() -> void:
	if _jump_flash == null:
		_jump_flash = ColorRect.new()
		_jump_flash.set_anchors_preset(Control.PRESET_FULL_RECT)
		_jump_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(_jump_flash)
	_jump_t = 1.6
	_jump_flash.color = Color(1, 1, 1, 0.95)
	_jump_flash.visible = true


func jump_flash_active() -> bool:
	return _jump_t > 0.0


func _process(delta: float) -> void:
	if _jump_t <= 0.0:
		return
	_jump_t = maxf(0.0, _jump_t - delta)
	var k := _jump_t / 1.6 # 1 → 0
	# White tear → sick carousel teal → gone. The nausea reads without a shader.
	if k > 0.72:
		_jump_flash.color = Color(1, 1, 1, (k - 0.72) / 0.28 * 0.95)
	else:
		_jump_flash.color = Color(0.45, 0.85, 0.72, k / 0.72 * 0.4)
	if _jump_t <= 0.0:
		_jump_flash.visible = false


func hide_death() -> void:
	if _death_label != null:
		_death_label.visible = false
	if _death_shade != null:
		_death_shade.visible = false

func death_shown() -> bool:
	return _death_label != null and _death_label.visible


# --- THE RETURN BRIEFING (Living World): the "State of the State" wake-up screen ---
## You come home after days away and read what changed BEFORE you step outside — days
## passed, who took what, what's now contraband in your kit, what's on the air. A framed,
## scrolling panel over a shade (the death-screen + sheet pattern). Dismiss with E/any key.
var _brief_shade: ColorRect = null
var _brief_panel: Panel = null
var _brief_label: Label = null

func show_briefing(body: String) -> void:
	if _brief_panel == null:
		_brief_shade = ColorRect.new()
		_brief_shade.set_anchors_preset(Control.PRESET_FULL_RECT)
		_brief_shade.color = Color(0.03, 0.03, 0.05, 0.86)
		_brief_shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(_brief_shade)
		var vp := get_viewport().get_visible_rect().size
		var w: float = minf(640.0, vp.x - 80.0)
		var h: float = minf(560.0, vp.y - 80.0)
		_brief_panel = Panel.new() # fixed rect, never grows off-screen
		_brief_panel.set_anchors_preset(Control.PRESET_CENTER)
		_brief_panel.offset_left = -w * 0.5
		_brief_panel.offset_right = w * 0.5
		_brief_panel.offset_top = -h * 0.5
		_brief_panel.offset_bottom = h * 0.5
		var style := StyleBoxFlat.new()
		style.bg_color = Color(0.09, 0.08, 0.06, 0.96)
		style.border_color = AMBER
		style.set_border_width_all(2)
		style.set_corner_radius_all(6)
		_brief_panel.add_theme_stylebox_override("panel", style)
		var scroll := ScrollContainer.new()
		scroll.set_anchors_preset(Control.PRESET_FULL_RECT)
		scroll.offset_left = 20.0
		scroll.offset_top = 20.0
		scroll.offset_right = -20.0
		scroll.offset_bottom = -20.0
		scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		_brief_panel.add_child(scroll)
		_brief_label = Label.new()
		_brief_label.add_theme_font_override("font", ProtoHUD.mixed_font())
		_brief_label.add_theme_font_size_override("font_size", 18)
		_brief_label.add_theme_color_override("font_color", BONE)
		_brief_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_brief_label.custom_minimum_size = Vector2(w - 56.0, 0)
		scroll.add_child(_brief_label)
		add_child(_brief_panel)
	_brief_label.text = body
	_brief_shade.visible = true
	_brief_panel.visible = true

func hide_briefing() -> void:
	if _brief_panel != null:
		_brief_panel.visible = false
	if _brief_shade != null:
		_brief_shade.visible = false

func briefing_shown() -> bool:
	return _brief_panel != null and _brief_panel.visible


# --- Reticle: the aim cone made visible (blooms per shot, tightens at rest) ----
var _reticle: Node2D = null
var _reticle_ticks: Array = []
var reticle_gap: float = 0.0 ## sim hook
var hit_pulse_t: float = 0.0 ## sim hook — >0 right after a confirmed flesh hit


## A round CONNECTED: the reticle pinches white for a heartbeat.
func pulse_hit() -> void:
	hit_pulse_t = 0.14

func update_reticle(spread_deg: float, mouse: Vector2, show: bool, pinned: bool = false) -> void:
	if _reticle == null:
		_reticle = Node2D.new()
		add_child(_reticle)
		for ang in [0.0, PI / 2, PI, PI * 1.5]:
			var tick := ColorRect.new()
			tick.color = AMBER
			tick.size = Vector2(3, 9)
			tick.rotation = ang
			_reticle.add_child(tick)
			_reticle_ticks.append(tick)
	_reticle.visible = show
	if not show:
		return
	_reticle.position = mouse
	reticle_gap = 8.0 + spread_deg * 5.0
	# Hit pulse: a confirmed flesh hit pinches the reticle tight + white.
	hit_pulse_t = maxf(0.0, hit_pulse_t - get_process_delta_time())
	if hit_pulse_t > 0.0:
		reticle_gap *= 0.55
	# Hot ticks while your eyes lag the gun (firing where you can't fully see).
	var tick_color: Color = Color(1.0, 1.0, 0.95) if hit_pulse_t > 0.0 else (Color(1.0, 0.42, 0.28) if pinned else AMBER)
	var dirs := [Vector2.UP, Vector2.RIGHT, Vector2.DOWN, Vector2.LEFT]
	for i in 4:
		(_reticle_ticks[i] as ColorRect).position = dirs[i] * reticle_gap - Vector2(1.5, 4.5)
		(_reticle_ticks[i] as ColorRect).color = tick_color


# --- Recon tags: the binoculars NAME what they see (+ range) -------------------
var _recon_labels: Array = []
var recon_tag_count: int = 0 ## sim hook
var recon_texts: Array = [] ## sim hook


func set_recon_tags(cam: Camera3D, entries: Array) -> void:
	if _recon_labels.is_empty():
		for i in 6:
			var l := Label.new()
			l.add_theme_font_override("font", ProtoHUD.mixed_font())
			l.add_theme_font_size_override("font_size", 13)
			l.add_theme_color_override("font_color", AMBER)
			l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
			l.add_theme_constant_override("outline_size", 4)
			l.visible = false
			add_child(l)
			_recon_labels.append(l)
	recon_tag_count = 0
	recon_texts = []
	for i in _recon_labels.size():
		var l: Label = _recon_labels[i]
		if cam != null and i < entries.size():
			l.text = entries[i][1]
			l.position = cam.unproject_position(entries[i][0] + Vector3(0, 2.0, 0)) + Vector2(12, -8)
			l.visible = not cam.is_position_behind(entries[i][0])
			recon_tag_count += 1
			recon_texts.append(l.text)
		else:
			l.visible = false


# --- NavHUD: the "arrow stuff" — one waypoint, edge-pinned arrow + distance ----
var _nav_arrow: Label = null
var _nav_dir: Vector2 = Vector2.ZERO ## sim hook: screen-space dir to waypoint

func update_nav(cam: Camera3D, from: Vector3, target: Vector3, label_txt: String) -> void:
	if _nav_arrow == null:
		_nav_arrow = Label.new()
		_nav_arrow.add_theme_font_override("font", ProtoHUD.mixed_font())
		_nav_arrow.add_theme_font_size_override("font_size", 20)
		_nav_arrow.add_theme_color_override("font_color", AMBER)
		_nav_arrow.add_theme_color_override("font_outline_color", Color(0.08, 0.06, 0.03))
		_nav_arrow.add_theme_constant_override("outline_size", 8)
		add_child(_nav_arrow)
	if label_txt == "":
		_nav_arrow.visible = false
		_nav_dir = Vector2.ZERO
		return
	_nav_arrow.visible = true
	var size: Vector2 = _nav_arrow.get_viewport().get_visible_rect().size
	var sp := cam.unproject_position(target + Vector3(0, 1, 0))
	var dist := from.distance_to(target)
	var margin := 46.0
	var rect := Rect2(Vector2(margin, margin), size - Vector2(margin * 2, margin * 2))
	# Direction glyph from screen-space bearing (8-way arrow reads instantly).
	var center := size * 0.5
	_nav_dir = (sp - center).normalized() if (sp - center).length() > 1.0 else Vector2.ZERO
	var arrows := ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"]
	var idx := int(round(atan2(_nav_dir.y, _nav_dir.x) / (PI / 4.0))) % 8
	var glyph: String = arrows[((idx % 8) + 8) % 8] if _nav_dir != Vector2.ZERO else "•"
	_nav_arrow.text = "%s %s %dm" % [glyph, label_txt, int(dist)]
	var pos := sp
	if not rect.has_point(sp): # off-screen: clamp to the edge along the bearing
		pos = center + _nav_dir * (minf(size.x, size.y) * 0.5 - margin)
		pos = pos.clamp(rect.position, rect.position + rect.size)
	_nav_arrow.position = pos - Vector2(40, 34)

## 🔫 mag/reserve — ammo stays NUMERIC (you count bullets; you feel tired).
func set_ammo(emoji: String, name_txt: String, mag: int, reserve: int, show: bool) -> void:
	if _ammo_label == null:
		_ammo_label = Label.new()
		_ammo_label.add_theme_font_override("font", ProtoHUD.mixed_font())
		_ammo_label.add_theme_font_size_override("font_size", 22)
		_ammo_label.add_theme_color_override("font_color", AMBER)
		_ammo_label.add_theme_color_override("font_outline_color", Color(0.08, 0.06, 0.03))
		_ammo_label.add_theme_constant_override("outline_size", 8)
		_ammo_label.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
		_ammo_label.offset_left = 28.0
		_ammo_label.offset_top = -132.0
		_ammo_label.offset_bottom = -104.0
		add_child(_ammo_label)
	_ammo_label.visible = show
	if show:
		_ammo_label.text = "%s %s  %d / %d" % [emoji, name_txt, mag, reserve]

## Red pain flash (crash wounds, hits) — one frame of hurt you FEEL.
func flash_pain() -> void:
	if _flash == null:
		_flash = ColorRect.new()
		_flash.set_anchors_preset(Control.PRESET_FULL_RECT)
		_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_flash.color = Color(0.8, 0.1, 0.05, 0.0)
		add_child(_flash)
	_flash.color.a = 0.38
	var tw := _flash.create_tween()
	tw.tween_property(_flash, "color:a", 0.0, 0.5)


func set_binoculars(on: bool) -> void:
	_binoc_label.visible = on
	_vignette.visible = on


## THE CIRCUIT tracker (goal #16 — the payoff you can SEE): four pips under the
## headline, filling as the loop's beats land. ●●○○ is a promise, ●●●● pays.
var _circuit_label: Label = null
func set_circuit(level: int, beats: Dictionary) -> void:
	if _circuit_label == null:
		_circuit_label = Label.new()
		_circuit_label.add_theme_font_override("font", ProtoHUD.mixed_font())
		_circuit_label.add_theme_font_size_override("font_size", 15)
		_circuit_label.add_theme_color_override("font_color", Color(0.96, 0.72, 0.2))
		_circuit_label.position = Vector2(22, 52)
		add_child(_circuit_label)
	var pips := ""
	for k in ["scavenge", "upgrade", "push", "node"]:
		pips += "●" if beats.get(k, false) else "○"
	_circuit_label.text = "🏁 THE CIRCUIT %d   %s" % [level, pips]


## THE FIRST RUN: one guiding line under the circuit pips. Empty string hides it.
var _objective_label: Label = null
func set_objective(text: String) -> void:
	if _objective_label == null:
		_objective_label = Label.new()
		_objective_label.add_theme_font_override("font", ProtoHUD.mixed_font())
		_objective_label.add_theme_font_size_override("font_size", 15)
		_objective_label.add_theme_color_override("font_color", Color(0.86, 0.86, 0.8))
		_objective_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
		_objective_label.add_theme_constant_override("outline_size", 4)
		_objective_label.position = Vector2(22, 74)
		add_child(_objective_label)
	_objective_label.text = text
	_objective_label.visible = not text.is_empty()


func set_location(text: String) -> void:
	_mode_label.text = text
