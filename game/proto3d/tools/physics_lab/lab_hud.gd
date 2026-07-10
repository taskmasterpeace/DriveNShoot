## Readable lab instrumentation. It reports comparison facts without declaring a
## winner; the player supplies the feel verdict later.
class_name ProtoLabHUD
extends CanvasLayer

const BONE := Color("#eadfca")
const MUTED := Color("#aa9c86")
const AMBER := Color("#e8a33a")
const TEAL := Color("#35b6a6")
const PANEL := Color(0.105, 0.085, 0.068, 0.94)
const BORDER := Color("#5e4b35")

var controls_text: String = "WASD / LEFT STICK move  ·  SHIFT / L3 sprint  ·  SPACE / A dive  ·  LMB / RT fire  ·  G / LT throw  ·  RMB / RB radial  ·  F1/F2/F3 bodies  ·  F4 opponent  ·  F5 xray  ·  F6 day  ·  F7 dust  ·  F8 lights  ·  F9 binoc  ·  F10 zoom  ·  F11 freeze  ·  F12 mirror  ·  U / D-PAD LEFT surface  ·  I / D-PAD UP condition  ·  K / D-PAD DOWN cameras  ·  L calibrate  ·  BACKSPACE reset"
var _mode: Label = null
var _station: Label = null
var _weapon: Label = null
var _telemetry: Label = null
var _tools: Label = null


func setup() -> void:
	layer = 80
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	var top := _panel(Vector2(18, 18), Vector2(520, 244))
	root.add_child(top)
	var badge := _label("PHYSICS & COMBAT LAB", 14, AMBER)
	badge.position = Vector2(16, 12)
	top.add_child(badge)
	_mode = _label("F1  CONTROLLED HYBRID", 22, BONE)
	_mode.position = Vector2(16, 38)
	top.add_child(_mode)
	_station = _label("STATION  BODY LANE", 14, TEAL)
	_station.position = Vector2(16, 72)
	top.add_child(_station)
	_weapon = _label("PISTOL  12 / ∞", 14, BONE)
	_weapon.position = Vector2(16, 100)
	top.add_child(_weapon)
	_telemetry = _label("", 13, MUTED)
	_telemetry.position = Vector2(16, 128)
	_telemetry.size = Vector2(488, 92)
	top.add_child(_telemetry)

	var controls := _panel(Vector2(18, -90), Vector2(980, 66))
	controls.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	root.add_child(controls)
	var control_label := _label(controls_text, 13, BONE)
	control_label.position = Vector2(16, 12)
	control_label.size = Vector2(948, 44)
	control_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	controls.add_child(control_label)
	_tools = _label("TOOLS  X-RAY OFF  ·  MIRROR READY  ·  BLACK BOX 20s", 12, MUTED)
	_tools.position = Vector2(420, 24)
	root.add_child(_tools)


func _panel(pos: Vector2, size_in: Vector2) -> Panel:
	var panel := Panel.new()
	panel.position = pos
	panel.size = size_in
	var style := StyleBoxFlat.new()
	style.bg_color = PANEL
	style.border_color = BORDER
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	style.shadow_color = Color(0, 0, 0, 0.28)
	style.shadow_size = 8
	panel.add_theme_stylebox_override("panel", style)
	return panel


func _label(text_in: String, size_in: int, color_in: Color) -> Label:
	var label := Label.new()
	label.text = text_in
	label.add_theme_font_size_override("font_size", size_in)
	label.add_theme_color_override("font_color", color_in)
	return label


func refresh(mode: String, station: String, weapon: ProtoWeapon, metrics: Dictionary,
		condition: String = "FRESH", opponent: String = "PASSIVE") -> void:
	var mode_name: String = {"hybrid": "CONTROLLED HYBRID", "active_ragdoll": "ACTIVE RAGDOLL",
		"full_physics": "FULL PHYSICS"}.get(mode, mode.to_upper())
	var key: String = {"hybrid": "F1", "active_ragdoll": "F2", "full_physics": "F3"}.get(mode, "F1")
	_mode.text = "%s  %s" % [key, mode_name]
	_station.text = "STATION  %s" % station
	_weapon.text = "%s  %d / ∞" % [String(weapon.info()["name"]).to_upper(), weapon.mag]
	_telemetry.text = "CONDITION  %s     OPPONENT  %s\nFPS  %d     PHYSICS  %.2f ms\nSPEED  %.2f m/s     GRIP L/R  %.1f / %.1f cm\nSPRINT  %.2f     LOW READY  %.2f     DIVE  %s" % [
		condition, opponent, Engine.get_frames_per_second(),
		Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0,
		float(metrics.get("speed", 0.0)), float(metrics.get("grip_left_cm", 0.0)),
		float(metrics.get("grip_right_cm", 0.0)), float(metrics.get("sprint_blend", 0.0)),
		float(metrics.get("low_ready_blend", 0.0)), String(metrics.get("dive_state", "NORMAL"))]


func pulse_hit() -> void:
	if _weapon == null:
		return
	_weapon.modulate = AMBER
	var tween := create_tween()
	tween.tween_property(_weapon, "modulate", Color.WHITE, 0.12)


func set_tools(text: String) -> void:
	if _tools != null:
		_tools.text = text
