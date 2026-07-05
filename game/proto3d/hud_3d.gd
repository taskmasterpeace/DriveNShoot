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
	"tired": {"tiers": ["", "🥱", "😓", "😫"]},
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

const VIGNETTE_SHADER := "
shader_type canvas_item;
void fragment() {
	vec2 c = UV - vec2(0.5);
	c.x *= 1.35; // slightly oval, like lenses
	float d = length(c) * 2.0;
	float a = smoothstep(0.55, 1.02, d);
	COLOR = vec4(0.0, 0.0, 0.0, a * 0.92);
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
	hud._mode_label.text = "DEATHLANDS — INTERSTATE 9"
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

	# Car dashboard (bottom-right, only while driving): the CAR's moodles —
	# 🔧🛞🔋⛽🛡️ tinted by condition tier, fuel %, and the 💥 cook meter on fire.
	hud._dash_box = HBoxContainer.new()
	hud._dash_box.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	hud._dash_box.offset_left = -430.0
	hud._dash_box.offset_right = -20.0
	hud._dash_box.offset_top = -76.0
	hud._dash_box.offset_bottom = -24.0
	hud._dash_box.alignment = BoxContainer.ALIGNMENT_END
	hud._dash_box.add_theme_constant_override("separation", 10)
	hud._dash_box.visible = false
	hud.add_child(hud._dash_box)
	for part in ["engine", "tires", "battery", "fuel_tank", "chassis"]:
		var pl := Label.new()
		pl.add_theme_font_override("font", ProtoHUD.emoji_font())
		pl.add_theme_font_size_override("font_size", 30)
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

## The car's dashboard: pass ProtoCar3D.dashboard() while driving, null to hide.
func set_dashboard(d) -> void:
	if d == null:
		_dash_box.visible = false
		return
	_dash_box.visible = true
	for part in _dash_labels:
		var tier: int = d[part]
		var lbl: Label = _dash_labels[part]
		lbl.text = DASH_EMOJI[part]
		lbl.modulate = TIER_COLORS[tier]
	_dash_fuel.text = "%d%%" % int(d["fuel"])
	if d["on_fire"]:
		_dash_cook.text = "💥%d%%" % int(d["cook"])
		_dash_cook.visible = true
	else:
		_dash_cook.visible = false


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
		_help_label.text = "W/S throttle+brake · A/D steer · SPACE handbrake · E get out · SCROLL zoom · hold B binoculars (mouse aim + wheel magnify)"
	else:
		_help_label.text = "WASD move · SHIFT sprint · SPACE dive · E interact/adopt · C whistle · SCROLL zoom · hold B binoculars"


var _flash: ColorRect = null
var _ammo_label: Label = null
var _sheet_panel: PanelContainer = null
var _sheet_label: Label = null
var _death_label: Label = null

## The character sheet (K): one styled panel, emoji-forward stats.
func toggle_sheet(text: String) -> void:
	if _sheet_panel == null:
		_sheet_panel = PanelContainer.new()
		_sheet_panel.set_anchors_preset(Control.PRESET_CENTER)
		_sheet_panel.offset_left = -240.0
		_sheet_panel.offset_right = 240.0
		_sheet_panel.offset_top = -220.0
		_sheet_panel.offset_bottom = 220.0
		var style := StyleBoxFlat.new()
		style.bg_color = Color(0.10, 0.09, 0.07, 0.94)
		style.border_color = AMBER
		style.set_border_width_all(2)
		style.set_corner_radius_all(6)
		style.set_content_margin_all(18)
		_sheet_panel.add_theme_stylebox_override("panel", style)
		_sheet_label = Label.new()
		_sheet_label.add_theme_font_override("font", ProtoHUD.mixed_font())
		_sheet_label.add_theme_font_size_override("font_size", 19)
		_sheet_label.add_theme_color_override("font_color", BONE)
		_sheet_panel.add_child(_sheet_label)
		add_child(_sheet_panel)
		_sheet_panel.visible = false
	_sheet_panel.visible = not _sheet_panel.visible
	if _sheet_panel.visible:
		_sheet_label.text = text

func sheet_open() -> bool:
	return _sheet_panel != null and _sheet_panel.visible

## Permadeath screen — the run is over.
func show_death(text: String) -> void:
	if _death_label == null:
		var shade := ColorRect.new()
		shade.set_anchors_preset(Control.PRESET_FULL_RECT)
		shade.color = Color(0.05, 0.02, 0.02, 0.82)
		shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(shade)
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

func death_shown() -> bool:
	return _death_label != null and _death_label.visible


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


func set_location(text: String) -> void:
	_mode_label.text = text
