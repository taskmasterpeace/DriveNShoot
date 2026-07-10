## A typed, bounded 20-second Black Box. At 60 physics frames per second this
## owns at most 1,200 commands and 1,200 matching snapshots; no per-frame JSON.
class_name ProtoLabReplay
extends RefCounted

const MAX_FRAMES := 1200

var frozen: bool = false
var cursor_frame: int = -1
var _next_frame: int = 0
var _frame_ids: Array[int] = []
var _commands: Array[RefCounted] = []
var _snapshots: Array[Dictionary] = []
var _markers: Array[Dictionary] = []


func record_command(command: RefCounted) -> bool:
	if frozen or command == null:
		return false
	_next_frame += 1
	_frame_ids.append(_next_frame)
	_commands.append(command.duplicate_frame())
	_snapshots.append({})
	while _commands.size() > MAX_FRAMES:
		_frame_ids.pop_front()
		_commands.pop_front()
		_snapshots.pop_front()
	_trim_markers()
	return true


func record_snapshot(state: Dictionary) -> bool:
	if frozen or _snapshots.is_empty():
		return false
	_snapshots[-1] = state.duplicate(true)
	return true


func mark(type: String, label: String) -> void:
	if frozen or _frame_ids.is_empty():
		return
	_markers.append({"frame": _frame_ids[-1], "type": type, "label": label})
	_trim_markers()


func _trim_markers() -> void:
	if _frame_ids.is_empty():
		_markers.clear()
		return
	var earliest: int = _frame_ids[0]
	_markers = _markers.filter(func(marker: Dictionary) -> bool:
		return int(marker["frame"]) >= earliest)


func freeze() -> void:
	frozen = true
	cursor_frame = _frame_ids[-1] if not _frame_ids.is_empty() else -1


func unfreeze() -> void:
	frozen = false
	cursor_frame = _frame_ids[-1] if not _frame_ids.is_empty() else -1


func seek(frame: int) -> Dictionary:
	var index: int = _frame_ids.find(frame)
	if index < 0:
		return {}
	cursor_frame = frame
	return _snapshots[index].duplicate(true)


func resume_from(frame: int) -> Dictionary:
	var index: int = _frame_ids.find(frame)
	if index < 0:
		return {}
	cursor_frame = frame
	frozen = false
	return {"frame": frame, "command": _commands[index].duplicate_frame(),
		"snapshot": _snapshots[index].duplicate(true)}


func find_marker(type: String) -> Dictionary:
	for marker in _markers:
		if String(marker.get("type", "")) == type:
			return marker.duplicate(true)
	return {}


func mirror_run(receivers: Array, delta: float = 1.0 / 60.0) -> Dictionary:
	var delivered: int = 0
	for command in _commands:
		for receiver in receivers:
			if receiver != null and receiver.has_method("apply_command"):
				receiver.apply_command((command as RefCounted).duplicate_frame(), delta)
		delivered += 1
	return {"frames": _commands.size(), "receivers": receivers.size(),
		"delivered_per_receiver": delivered}


func command_frames() -> Array[RefCounted]:
	var copies: Array[RefCounted] = []
	for command in _commands:
		copies.append(command.duplicate_frame())
	return copies


func snapshot_at(frame: int) -> Dictionary:
	var index: int = _frame_ids.find(frame)
	return _snapshots[index].duplicate(true) if index >= 0 else {}


func latest_snapshot() -> Dictionary:
	return _snapshots[-1].duplicate(true) if not _snapshots.is_empty() else {}


func frame_count() -> int:
	return _commands.size()


func snapshot_count() -> int:
	return _snapshots.size()


func first_frame() -> int:
	return _frame_ids[0] if not _frame_ids.is_empty() else -1


func last_frame() -> int:
	return _frame_ids[-1] if not _frame_ids.is_empty() else -1


func first_stamp() -> int:
	return int(_commands[0].get("stamp")) if not _commands.is_empty() else -1


func last_stamp() -> int:
	return int(_commands[-1].get("stamp")) if not _commands.is_empty() else -1


func markers() -> Array[Dictionary]:
	return _markers.duplicate(true)


func clear() -> void:
	frozen = false
	cursor_frame = -1
	_next_frame = 0
	_frame_ids.clear()
	_commands.clear()
	_snapshots.clear()
	_markers.clear()
