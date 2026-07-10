## Lab-only controller oscilloscope, drift sampler, and named presets. This file
## never reads or writes the campaign's input_overrides.json.
class_name ProtoLabCalibration
extends RefCounted

const PRESET_PATH := "user://physics_lab/input_presets.json"

var deadzone: float = 0.12
var response_exponent: float = 1.0
var aim_sensitivity: float = 1.0
var trigger_threshold: float = 0.15
var rumble: float = 0.75
var hold_threshold: float = 0.18

var _sampling: bool = false
var _sample_duration: float = 5.0
var _sample_elapsed: float = 0.0
var _max_rest: float = 0.0
var _last_raw: Dictionary = {}
var _last_normalized: Dictionary = {}
var _latency_input_us: int = -1
var _latency_command_us: int = -1
var _latency_response_us: int = -1


func begin_drift_sample(duration: float = 5.0) -> void:
	_sampling = true
	_sample_duration = maxf(0.1, duration)
	_sample_elapsed = 0.0
	_max_rest = 0.0


func sample(raw: Dictionary, delta: float) -> void:
	_last_raw = raw.duplicate(true)
	var left: Vector2 = raw.get("left_stick", Vector2.ZERO)
	var right: Vector2 = raw.get("right_stick", Vector2.ZERO)
	_last_normalized = {"left_stick": normalize_stick(left),
		"right_stick": normalize_stick(right),
		"left_trigger": normalize_trigger(float(raw.get("left_trigger", 0.0))),
		"right_trigger": normalize_trigger(float(raw.get("right_trigger", 0.0))),
		"keyboard_move": raw.get("keyboard_move", Vector2.ZERO),
		"mouse": raw.get("mouse", Vector2.ZERO), "buttons": raw.get("buttons", {})}
	if _sampling:
		_max_rest = maxf(_max_rest, maxf(left.length(), right.length()))
		_sample_elapsed += delta
		if _sample_elapsed + 0.0001 >= _sample_duration:
			_sample_elapsed = _sample_duration
			_sampling = false


func drift_result() -> Dictionary:
	return {"complete": not _sampling and _sample_elapsed >= _sample_duration,
		"elapsed": _sample_elapsed, "max_rest_magnitude": _max_rest,
		"recommended_deadzone": clampf(_max_rest + 0.04, 0.08, 0.35)}


func normalize_stick(raw: Vector2) -> Vector2:
	var magnitude: float = raw.length()
	if magnitude <= deadzone:
		return Vector2.ZERO
	var scaled: float = clampf((magnitude - deadzone) / maxf(0.001, 1.0 - deadzone), 0.0, 1.0)
	scaled = pow(scaled, response_exponent) * aim_sensitivity
	return raw.normalized() * minf(1.0, scaled)


func normalize_trigger(raw: float) -> float:
	if raw <= trigger_threshold:
		return 0.0
	return clampf((raw - trigger_threshold) / maxf(0.001, 1.0 - trigger_threshold), 0.0, 1.0)


func classify_hold(duration: float) -> String:
	return "radial" if duration >= hold_threshold else "cycle"


func oscilloscope() -> Dictionary:
	return {"raw": _last_raw.duplicate(true), "normalized": _last_normalized.duplicate(true),
		"sampling": _sampling, "sample_elapsed": _sample_elapsed,
		"latency": latency_facts()}


func note_input() -> void:
	_latency_input_us = Time.get_ticks_usec()
	_latency_command_us = -1
	_latency_response_us = -1


func note_command() -> void:
	_latency_command_us = Time.get_ticks_usec()


func note_response() -> void:
	_latency_response_us = Time.get_ticks_usec()


func latency_facts() -> Dictionary:
	return {"input_to_command_ms": _elapsed_ms(_latency_input_us, _latency_command_us),
		"command_to_response_ms": _elapsed_ms(_latency_command_us, _latency_response_us),
		"input_to_response_ms": _elapsed_ms(_latency_input_us, _latency_response_us)}


func _elapsed_ms(start_us: int, end_us: int) -> float:
	return float(end_us - start_us) / 1000.0 if start_us >= 0 and end_us >= start_us else -1.0


func preset() -> Dictionary:
	return {"deadzone": deadzone, "response_exponent": response_exponent,
		"aim_sensitivity": aim_sensitivity, "trigger_threshold": trigger_threshold,
		"rumble": rumble, "hold_threshold": hold_threshold}


func save_preset(name: String) -> bool:
	if name.strip_edges().is_empty():
		return false
	var presets: Dictionary = _read_presets()
	presets[name] = preset()
	return _write_presets(presets)


func load_preset(name: String) -> bool:
	var presets: Dictionary = _read_presets()
	if not presets.has(name):
		return false
	var row := presets[name] as Dictionary
	deadzone = float(row.get("deadzone", deadzone))
	response_exponent = float(row.get("response_exponent", response_exponent))
	aim_sensitivity = float(row.get("aim_sensitivity", aim_sensitivity))
	trigger_threshold = float(row.get("trigger_threshold", trigger_threshold))
	rumble = float(row.get("rumble", rumble))
	hold_threshold = float(row.get("hold_threshold", hold_threshold))
	return true


func delete_preset(name: String) -> bool:
	var presets: Dictionary = _read_presets()
	if not presets.erase(name):
		return false
	return _write_presets(presets)


func _read_presets() -> Dictionary:
	if not FileAccess.file_exists(PRESET_PATH):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(PRESET_PATH))
	return parsed as Dictionary if parsed is Dictionary else {}


func _write_presets(presets: Dictionary) -> bool:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://physics_lab"))
	var file := FileAccess.open(PRESET_PATH, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(presets, "  "))
	file.close()
	return true
