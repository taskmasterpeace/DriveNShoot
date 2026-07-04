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
		active_moodles[id] = tier
		lbl.text = MOODLES[id]["tiers"][tier]
		lbl.visible = true
		# Worst tier pulses gently so it catches the eye without a meter.
		lbl.modulate.a = 0.75 + 0.25 * sin(Time.get_ticks_msec() * 0.006) if tier >= 3 else 1.0


func set_mode(driving: bool) -> void:
	if driving:
		_help_label.text = "W/S throttle+brake · A/D steer · SPACE handbrake · E get out · SCROLL zoom · hold B binoculars (mouse aim + wheel magnify)"
	else:
		_help_label.text = "WASD move · SHIFT sprint · SPACE dive · E interact/adopt · C whistle · SCROLL zoom · hold B binoculars"


func set_binoculars(on: bool) -> void:
	_binoc_label.visible = on
	_vignette.visible = on


func set_location(text: String) -> void:
	_mode_label.text = text
