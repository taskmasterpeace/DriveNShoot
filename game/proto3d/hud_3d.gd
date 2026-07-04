## PROTO-3D HUD: speed, mode, binocular indicator, and the controls line.
class_name ProtoHUD
extends CanvasLayer

var _speed_label: Label
var _mode_label: Label
var _binoc_label: Label
var _help_label: Label

const AMBER := Color(0.96, 0.72, 0.2)
const BONE := Color(0.92, 0.89, 0.82)


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
	return hud


func set_speed(mph: float, driving: bool) -> void:
	_speed_label.visible = driving
	_speed_label.text = "%d MPH" % int(mph)


func set_mode(driving: bool) -> void:
	if driving:
		_help_label.text = "W/S throttle+brake · A/D steer · SPACE handbrake · E get out · SCROLL zoom · hold B binoculars"
	else:
		_help_label.text = "WASD walk · SHIFT run · E enter car · SCROLL zoom · hold B binoculars"


func set_binoculars(on: bool) -> void:
	_binoc_label.visible = on


func set_location(text: String) -> void:
	_mode_label.text = text
