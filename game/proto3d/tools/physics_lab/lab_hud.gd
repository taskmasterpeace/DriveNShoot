## Readable lab instrumentation. It reports comparison facts without declaring a
## winner; the player supplies the feel verdict later.
class_name ProtoLabHUD
extends CanvasLayer

signal verdict_submitted(ratings: Dictionary, note: String)
signal verdict_clear_requested
signal calibration_changed(settings: Dictionary)
signal calibration_sample_requested
signal calibration_save_requested(preset_name: String)
signal calibration_load_requested(preset_name: String)

const BONE := Color("#eadfca")
const MUTED := Color("#aa9c86")
const AMBER := Color("#e8a33a")
const TEAL := Color("#35b6a6")
const PANEL := Color(0.105, 0.085, 0.068, 0.94)
const BORDER := Color("#5e4b35")

var controls_text: String = "WASD / LEFT STICK move  ·  SHIFT / L3 sprint  ·  SPACE / A dive  ·  LMB / RT fire  ·  G / LT throw  ·  RMB / RB radial  ·  F1/F2/F3 or Y bodies  ·  F4 / D-PAD RIGHT opponent  ·  U / D-PAD LEFT surface  ·  I / D-PAD UP condition  ·  K / D-PAD DOWN cameras  ·  L calibration  ·  N / LB scenario  ·  F11 / BACK freeze  ·  START reset  ·  V verdict"
var _mode: Label = null
var _station: Label = null
var _weapon: Label = null
var _telemetry: Label = null
var _tools_panel: Panel = null
var _tools: Label = null
var _impact_panel: Panel = null
var _impact_label: Label = null
var _calibration_panel: Panel = null
var _calibration_spins: Dictionary = {}
var _calibration_name: LineEdit = null
var _calibration_readout: Label = null
var _calibration_status: Label = null
var _recommended_deadzone: float = 0.12
var _verdict_panel: Panel = null
var _verdict_spins: Dictionary = {}
var _verdict_note: LineEdit = null
var _verdict_status: Label = null


func setup() -> void:
	layer = 80
	controls_text += "  ·  Z vehicle  ·  X face  ·  P energy  ·  C apply  ·  Backspace reset"
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

	var controls := _panel(Vector2.ZERO, Vector2.ZERO)
	controls.anchor_left = 0.0
	controls.anchor_right = 1.0
	controls.anchor_top = 1.0
	controls.anchor_bottom = 1.0
	controls.offset_left = 18.0
	controls.offset_right = -18.0
	controls.offset_top = -108.0
	controls.offset_bottom = -18.0
	root.add_child(controls)
	var control_label := _label(controls_text, 11, BONE)
	control_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	control_label.offset_left = 16.0
	control_label.offset_right = -16.0
	control_label.offset_top = 10.0
	control_label.offset_bottom = -10.0
	control_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	controls.add_child(control_label)
	_tools = _label("TOOLS  X-RAY OFF  ·  MIRROR READY  ·  BLACK BOX 20s", 12, MUTED)
	_tools_panel = _panel(Vector2.ZERO, Vector2.ZERO)
	_tools_panel.anchor_left = 1.0
	_tools_panel.anchor_right = 1.0
	_tools_panel.anchor_top = 0.0
	_tools_panel.anchor_bottom = 0.0
	_tools_panel.offset_left = -740.0
	_tools_panel.offset_right = -18.0
	_tools_panel.offset_top = 18.0
	_tools_panel.offset_bottom = 104.0
	root.add_child(_tools_panel)
	_tools.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_tools.offset_left = 14.0
	_tools.offset_right = -14.0
	_tools.offset_top = 8.0
	_tools.offset_bottom = -8.0
	_tools.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_tools_panel.add_child(_tools)
	_build_impact_bay(root)
	_build_calibration(root)
	_build_verdict(root)


func _build_impact_bay(root: Control) -> void:
	_impact_panel = _panel(Vector2(18, 276), Vector2(520, 126))
	root.add_child(_impact_panel)
	_impact_label = _label("IMPACT BAY READY", 12, BONE)
	_impact_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_impact_label.offset_left = 16.0
	_impact_label.offset_right = -16.0
	_impact_label.offset_top = 12.0
	_impact_label.offset_bottom = -12.0
	_impact_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_impact_panel.add_child(_impact_label)
	_impact_panel.visible = false


func _build_calibration(root: Control) -> void:
	_calibration_panel = _panel(Vector2.ZERO, Vector2(560, 538))
	_calibration_panel.set_anchors_preset(Control.PRESET_CENTER)
	_calibration_panel.position = Vector2(-280, -269)
	_calibration_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(_calibration_panel)
	var title := _label("INPUT OSCILLOSCOPE", 22, BONE)
	title.position = Vector2(22, 16)
	_calibration_panel.add_child(title)
	var sub := _label("LAB-ONLY PAD TUNING — CAMPAIGN BINDS STAY UNTOUCHED", 11, MUTED)
	sub.position = Vector2(22, 48)
	_calibration_panel.add_child(sub)
	var configs: Dictionary = {
		"deadzone": [0.0, 0.5, 0.01], "response_exponent": [0.2, 3.0, 0.05],
		"aim_sensitivity": [0.2, 2.5, 0.05], "trigger_threshold": [0.0, 0.8, 0.01],
		"rumble": [0.0, 1.0, 0.05], "hold_threshold": [0.08, 0.5, 0.01],
	}
	var fields: Array[String] = ["deadzone", "response_exponent", "aim_sensitivity",
		"trigger_threshold", "rumble", "hold_threshold"]
	for i in fields.size():
		var id: String = fields[i]
		var field_label := _label(id.replace("_", " ").to_upper(), 12, TEAL)
		field_label.position = Vector2(24, 82 + i * 39)
		_calibration_panel.add_child(field_label)
		var spin := SpinBox.new()
		var config: Array = configs[id]
		spin.min_value = float(config[0])
		spin.max_value = float(config[1])
		spin.step = float(config[2])
		spin.position = Vector2(366, 74 + i * 39)
		spin.size = Vector2(166, 32)
		spin.add_theme_font_size_override("font_size", 13)
		_calibration_panel.add_child(spin)
		_calibration_spins[id] = spin
	_calibration_readout = _label("RAW L 0.00,0.00  R 0.00,0.00\nNORM L 0.00,0.00  R 0.00,0.00", 11, MUTED)
	_calibration_readout.position = Vector2(24, 320)
	_calibration_readout.size = Vector2(508, 56)
	_calibration_panel.add_child(_calibration_readout)
	var sample_button := Button.new()
	sample_button.text = "SAMPLE DRIFT 5s"
	sample_button.position = Vector2(24, 378)
	sample_button.size = Vector2(154, 34)
	sample_button.pressed.connect(func() -> void: calibration_sample_requested.emit())
	_calibration_panel.add_child(sample_button)
	var recommended_button := Button.new()
	recommended_button.text = "USE RECOMMENDED"
	recommended_button.position = Vector2(188, 378)
	recommended_button.size = Vector2(164, 34)
	recommended_button.pressed.connect(_use_recommended_deadzone)
	_calibration_panel.add_child(recommended_button)
	var apply_button := Button.new()
	apply_button.text = "APPLY + RUMBLE"
	apply_button.position = Vector2(362, 378)
	apply_button.size = Vector2(170, 34)
	apply_button.pressed.connect(_emit_calibration)
	_calibration_panel.add_child(apply_button)
	_calibration_name = LineEdit.new()
	_calibration_name.placeholder_text = "preset name"
	_calibration_name.position = Vector2(24, 422)
	_calibration_name.size = Vector2(248, 34)
	_calibration_panel.add_child(_calibration_name)
	var save_button := Button.new()
	save_button.text = "SAVE"
	save_button.position = Vector2(282, 422)
	save_button.size = Vector2(76, 34)
	save_button.pressed.connect(func() -> void:
		_emit_calibration()
		calibration_save_requested.emit(_calibration_name.text))
	_calibration_panel.add_child(save_button)
	var load_button := Button.new()
	load_button.text = "LOAD"
	load_button.position = Vector2(368, 422)
	load_button.size = Vector2(76, 34)
	load_button.pressed.connect(func() -> void:
		calibration_load_requested.emit(_calibration_name.text))
	_calibration_panel.add_child(load_button)
	var close_button := Button.new()
	close_button.text = "CLOSE"
	close_button.position = Vector2(454, 422)
	close_button.size = Vector2(78, 34)
	close_button.pressed.connect(func() -> void: toggle_calibration())
	_calibration_panel.add_child(close_button)
	_calibration_status = _label("L OPENS/CLOSES · APPLY UPDATES THE LIVE LAB COMMAND PATH", 11, AMBER)
	_calibration_status.position = Vector2(24, 470)
	_calibration_status.size = Vector2(508, 48)
	_calibration_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_calibration_panel.add_child(_calibration_status)
	_calibration_panel.visible = false


func _build_verdict(root: Control) -> void:
	_verdict_panel = _panel(Vector2.ZERO, Vector2(460, 408))
	_verdict_panel.set_anchors_preset(Control.PRESET_CENTER)
	_verdict_panel.position = Vector2(-230, -204)
	_verdict_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(_verdict_panel)
	var title := _label("VERDICT BOOK", 22, BONE)
	title.position = Vector2(22, 16)
	_verdict_panel.add_child(title)
	var sub := _label("Objective facts stay separate from your 1–10 feel ratings.", 12, MUTED)
	sub.position = Vector2(22, 46)
	_verdict_panel.add_child(sub)
	var fields: Array[String] = ["feel", "control", "weight", "readability", "fun"]
	for i in fields.size():
		var id: String = fields[i]
		var label := _label(id.to_upper(), 13, TEAL)
		label.position = Vector2(24, 82 + i * 43)
		_verdict_panel.add_child(label)
		var spin := SpinBox.new()
		spin.min_value = 1
		spin.max_value = 10
		spin.step = 1
		spin.value = 7
		spin.position = Vector2(316, 74 + i * 43)
		spin.size = Vector2(116, 34)
		spin.add_theme_font_size_override("font_size", 14)
		_verdict_panel.add_child(spin)
		_verdict_spins[id] = spin
	var note_label := _label("NOTE", 13, TEAL)
	note_label.position = Vector2(24, 300)
	_verdict_panel.add_child(note_label)
	_verdict_note = LineEdit.new()
	_verdict_note.placeholder_text = "What felt right or wrong?"
	_verdict_note.position = Vector2(82, 292)
	_verdict_note.size = Vector2(350, 34)
	_verdict_panel.add_child(_verdict_note)
	var save_button := Button.new()
	save_button.text = "SAVE JSON + MARKDOWN"
	save_button.position = Vector2(22, 344)
	save_button.size = Vector2(194, 38)
	save_button.pressed.connect(_submit_verdict)
	_verdict_panel.add_child(save_button)
	var clear_button := Button.new()
	clear_button.text = "CLEAR ALL"
	clear_button.position = Vector2(226, 344)
	clear_button.size = Vector2(100, 38)
	clear_button.pressed.connect(func() -> void: verdict_clear_requested.emit())
	_verdict_panel.add_child(clear_button)
	var cancel_button := Button.new()
	cancel_button.text = "CLOSE"
	cancel_button.position = Vector2(336, 344)
	cancel_button.size = Vector2(96, 38)
	cancel_button.pressed.connect(toggle_verdict)
	_verdict_panel.add_child(cancel_button)
	_verdict_status = _label("", 11, AMBER)
	_verdict_status.position = Vector2(22, 386)
	_verdict_panel.add_child(_verdict_status)
	_verdict_panel.visible = false


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


func tools_text() -> String:
	return _tools.text if _tools != null else ""


func set_impact_bay(text: String, visible: bool) -> void:
	if _impact_label != null:
		_impact_label.text = text
	if _impact_panel != null:
		_impact_panel.visible = visible


func impact_text() -> String:
	return _impact_label.text if _impact_label != null else ""


func toggle_calibration(settings: Dictionary = {}) -> void:
	if _calibration_panel == null:
		return
	if not settings.is_empty():
		set_calibration_values(settings)
	_calibration_panel.visible = not _calibration_panel.visible
	if _calibration_panel.visible and _calibration_name != null:
		_calibration_name.grab_focus()


func calibration_open() -> bool:
	return _calibration_panel != null and _calibration_panel.visible


func calibration_panel_facts() -> Dictionary:
	return {"visible": calibration_open(), "fields": _calibration_spins.keys(),
		"values": calibration_values()}


func calibration_values() -> Dictionary:
	var values: Dictionary = {}
	for id in _calibration_spins:
		values[id] = float((_calibration_spins[id] as SpinBox).value)
	return values


func set_calibration_values(settings: Dictionary) -> void:
	for id in _calibration_spins:
		if settings.has(id):
			(_calibration_spins[id] as SpinBox).value = float(settings[id])


func refresh_calibration(oscilloscope: Dictionary, drift: Dictionary) -> void:
	if _calibration_readout == null:
		return
	var raw: Dictionary = oscilloscope.get("raw", {})
	var normalized: Dictionary = oscilloscope.get("normalized", {})
	var raw_l: Vector2 = raw.get("left_stick", Vector2.ZERO)
	var raw_r: Vector2 = raw.get("right_stick", Vector2.ZERO)
	var norm_l: Vector2 = normalized.get("left_stick", Vector2.ZERO)
	var norm_r: Vector2 = normalized.get("right_stick", Vector2.ZERO)
	var key_move: Vector2 = raw.get("keyboard_move", Vector2.ZERO)
	var mouse: Vector2 = raw.get("mouse", Vector2.ZERO)
	_recommended_deadzone = float(drift.get("recommended_deadzone", _recommended_deadzone))
	var sample_state: String = "SAMPLING %.1f/5.0s" % float(drift.get("elapsed", 0.0)) \
		if bool(oscilloscope.get("sampling", false)) else "RECOMMENDED DZ %.2f" % _recommended_deadzone
	_calibration_readout.text = "RAW  L %.2f,%.2f  R %.2f,%.2f  LT/RT %.2f/%.2f\nNORM L %.2f,%.2f  R %.2f,%.2f  LT/RT %.2f/%.2f\nKEY %.0f,%.0f  MOUSE %.0f,%.0f  ·  %s" % [
		raw_l.x, raw_l.y, raw_r.x, raw_r.y,
		float(raw.get("left_trigger", 0.0)), float(raw.get("right_trigger", 0.0)),
		norm_l.x, norm_l.y, norm_r.x, norm_r.y,
		float(normalized.get("left_trigger", 0.0)), float(normalized.get("right_trigger", 0.0)),
		key_move.x, key_move.y, mouse.x, mouse.y, sample_state]


func set_calibration_status(status: String) -> void:
	if _calibration_status != null:
		_calibration_status.text = status


func _use_recommended_deadzone() -> void:
	if _calibration_spins.has("deadzone"):
		(_calibration_spins["deadzone"] as SpinBox).value = _recommended_deadzone
	_emit_calibration()


func _emit_calibration() -> void:
	calibration_changed.emit(calibration_values())


func toggle_verdict() -> void:
	if _verdict_panel != null:
		_verdict_panel.visible = not _verdict_panel.visible
		if _verdict_panel.visible and _verdict_note != null:
			_verdict_note.grab_focus()


func verdict_open() -> bool:
	return _verdict_panel != null and _verdict_panel.visible


func verdict_fields() -> Dictionary:
	var out: Dictionary = {}
	for id in _verdict_spins:
		out[id] = int((_verdict_spins[id] as SpinBox).value)
	return out


func set_verdict_status(text: String) -> void:
	if _verdict_status != null:
		_verdict_status.text = text


func _submit_verdict() -> void:
	verdict_submitted.emit(verdict_fields(), _verdict_note.text if _verdict_note != null else "")
