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

## Current interact prompt text ("" when hidden) — read by sim tests.
var current_prompt: String = ""

const AMBER := Color(0.96, 0.72, 0.2)
const BONE := Color(0.92, 0.89, 0.82)

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
	hud._help_label.add_theme_font_size_override("font_size", 15)
	hud._help_label.add_theme_color_override("font_color", Color(BONE, 0.75))
	hud._help_label.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	hud._help_label.offset_left = 28.0
	hud._help_label.offset_top = -42.0
	hud._help_label.offset_bottom = -18.0
	hud.add_child(hud._help_label)

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


func set_mode(driving: bool) -> void:
	if driving:
		_help_label.text = "W/S throttle+brake · A/D steer · SPACE handbrake · E get out · SCROLL zoom · hold B binoculars + mouse to aim"
	else:
		_help_label.text = "WASD walk · SHIFT run · SPACE dive · E interact · SCROLL zoom · hold B binoculars + mouse to aim"


func set_binoculars(on: bool) -> void:
	_binoc_label.visible = on
	_vignette.visible = on


func set_location(text: String) -> void:
	_mode_label.text = text
