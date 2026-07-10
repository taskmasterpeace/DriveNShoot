## Hardware enters once and leaves as semantic seat snapshots. Cartridges never
## inspect keys/buttons, and two pads can never bleed into the same local seat.
class_name ProtoArcadeInputRouter
extends RefCounted

const ACTIONS: Dictionary = {
	"move_up": "arcade_move_up",
	"move_down": "arcade_move_down",
	"move_left": "arcade_move_left",
	"move_right": "arcade_move_right",
	"aim_up": "arcade_aim_up",
	"aim_down": "arcade_aim_down",
	"aim_left": "arcade_aim_left",
	"aim_right": "arcade_aim_right",
	"primary": "arcade_primary",
	"secondary": "arcade_secondary",
	"mobility": "arcade_mobility",
	"stance": "arcade_stance",
	"reload": "arcade_reload",
	"interact": "arcade_interact",
	"weapon_prev": "arcade_weapon_prev",
	"weapon_next": "arcade_weapon_next",
	"pause": "arcade_pause",
	"help": "arcade_help",
	"scoreboard": "arcade_scoreboard",
}

const PROFILES: Dictionary = {
	"puzzle_grid": ["move_up", "move_down", "move_left", "move_right", "pause", "help"],
	"shared_shooter": ["move_up", "move_down", "move_left", "move_right",
		"aim_up", "aim_down", "aim_left", "aim_right", "primary", "secondary",
		"mobility", "stance", "reload", "interact", "weapon_prev", "weapon_next",
		"scoreboard", "pause", "help"],
}

var _seats: Dictionary = {}
var _device_to_seat: Dictionary = {}


func _init() -> void:
	ProtoInputMap.ensure()


func assign_keyboard(seat: int) -> bool:
	return _assign(seat, -1)


func assign_device(seat: int, device: int) -> bool:
	if device < 0:
		return false
	return _assign(seat, device)


func _assign(seat: int, device: int) -> bool:
	if seat < 0:
		return false
	if _device_to_seat.has(device) and int(_device_to_seat[device]) != seat:
		return false
	unassign_seat(seat)
	_device_to_seat[device] = seat
	_seats[seat] = {
		"device": device,
		"held": {},
		"pressed": {},
		"released": {},
		"cursor": Vector2.ZERO,
		"mouse_aim": Vector2.ZERO,
	}
	return true


func unassign_seat(seat: int) -> void:
	if not _seats.has(seat):
		return
	var state: Dictionary = _seats[seat]
	_device_to_seat.erase(int(state.get("device", -999)))
	_seats.erase(seat)


func feed_event(event: InputEvent) -> void:
	var device := -1 if (event is InputEventKey or event is InputEventMouse) else event.device
	if not _device_to_seat.has(device):
		return
	var seat := int(_device_to_seat[device])
	var state: Dictionary = _seats[seat]
	if event is InputEventMouseMotion:
		var motion := event as InputEventMouseMotion
		state["cursor"] = motion.position
		if motion.relative.length_squared() > 0.001:
			state["mouse_aim"] = motion.relative.normalized()
	for semantic in ACTIONS:
		var action := String(ACTIONS[semantic])
		if event.is_action_pressed(action):
			if not bool((state["held"] as Dictionary).get(semantic, false)):
				(state["pressed"] as Dictionary)[semantic] = true
			(state["held"] as Dictionary)[semantic] = true
		elif event.is_action_released(action):
			if bool((state["held"] as Dictionary).get(semantic, false)):
				(state["released"] as Dictionary)[semantic] = true
			(state["held"] as Dictionary)[semantic] = false


func snapshot_for_seat(seat: int) -> Dictionary:
	if not _seats.has(seat):
		return _empty_snapshot(seat)
	var state: Dictionary = _seats[seat]
	var held: Dictionary = state["held"]
	var move := Vector2(
		float(bool(held.get("move_right", false))) - float(bool(held.get("move_left", false))),
		float(bool(held.get("move_down", false))) - float(bool(held.get("move_up", false))))
	var aim := Vector2(
		float(bool(held.get("aim_right", false))) - float(bool(held.get("aim_left", false))),
		float(bool(held.get("aim_down", false))) - float(bool(held.get("aim_up", false))))
	if move.length_squared() > 1.0:
		move = move.normalized()
	if aim.length_squared() > 1.0:
		aim = aim.normalized()
	if int(state["device"]) == -1 and (state["mouse_aim"] as Vector2).length_squared() > 0.001:
		aim = state["mouse_aim"]
	var out := {
		"seat": seat,
		"device": int(state["device"]),
		"held": held.duplicate(true),
		"pressed": (state["pressed"] as Dictionary).duplicate(true),
		"released": (state["released"] as Dictionary).duplicate(true),
		"move": move,
		"aim": aim,
		"cursor": state["cursor"],
	}
	(state["pressed"] as Dictionary).clear()
	(state["released"] as Dictionary).clear()
	return out


func _empty_snapshot(seat: int) -> Dictionary:
	return {"seat": seat, "device": -999, "held": {}, "pressed": {}, "released": {},
		"move": Vector2.ZERO, "aim": Vector2.ZERO, "cursor": Vector2.ZERO}


func help_labels(profile: String) -> Array:
	ProtoInputMap.ensure()
	var semantics: Array = PROFILES.get(profile, ACTIONS.keys())
	var rows_by_id: Dictionary = {}
	for row_value in ProtoInputMap.actions:
		var row: Dictionary = row_value
		rows_by_id[String(row.get("id", ""))] = row
	var out: Array = []
	for semantic_value in semantics:
		var semantic := String(semantic_value)
		var action := String(ACTIONS.get(semantic, ""))
		if not rows_by_id.has(action):
			continue
		var row: Dictionary = rows_by_id[action]
		var keys: Array[String] = []
		for descriptor in row.get("keys", []):
			keys.append(ProtoInputMap.pretty(String(descriptor)))
		var pads: Array[String] = []
		for descriptor in row.get("pad", []):
			pads.append(ProtoInputMap.pretty(String(descriptor)))
		out.append({
			"semantic": semantic,
			"label": String(row.get("label", semantic)),
			"keyboard": " + ".join(keys) if not keys.is_empty() else "—",
			"pad": " + ".join(pads) if not pads.is_empty() else "—",
		})
	return out
