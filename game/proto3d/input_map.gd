## THE INPUT MAP AS ROWS (controller-support arc): every verb is an ACTION whose
## key/mouse AND pad bindings live in data/input_bindings.json — one fold at boot
## makes Godot's InputMap the single truth for keyboard, mouse, Xbox pads, and
## PS-family pads (PS2-through-adapter reads as the same SDL buttons: cross=a).
## Rebinds from the CONTROLS panel persist to user://input_overrides.json and win
## over the data defaults. Listed actions are OWNED whole (erase-then-bind), so a
## rebind is authoritative; engine actions we don't list (ui_*) are untouched.
class_name ProtoInputMap
extends RefCounted

const BINDINGS_PATH := "res://data/input_bindings.json"
const OVERRIDES_PATH := "user://input_overrides.json"

## Godot 4 JOY_BUTTON_* by our short names (Xbox reads; PS pads land on the same
## SDL indices: cross=a, circle=b, square=x, triangle=y).
const JOY_BUTTONS: Dictionary = {
	"a": JOY_BUTTON_A, "b": JOY_BUTTON_B, "x": JOY_BUTTON_X, "y": JOY_BUTTON_Y,
	"back": JOY_BUTTON_BACK, "guide": JOY_BUTTON_GUIDE, "start": JOY_BUTTON_START,
	"l3": JOY_BUTTON_LEFT_STICK, "r3": JOY_BUTTON_RIGHT_STICK,
	"lb": JOY_BUTTON_LEFT_SHOULDER, "rb": JOY_BUTTON_RIGHT_SHOULDER,
	"dpad_up": JOY_BUTTON_DPAD_UP, "dpad_down": JOY_BUTTON_DPAD_DOWN,
	"dpad_left": JOY_BUTTON_DPAD_LEFT, "dpad_right": JOY_BUTTON_DPAD_RIGHT,
}
const JOY_AXES: Dictionary = {
	"lx": JOY_AXIS_LEFT_X, "ly": JOY_AXIS_LEFT_Y,
	"rx": JOY_AXIS_RIGHT_X, "ry": JOY_AXIS_RIGHT_Y,
	"lt": JOY_AXIS_TRIGGER_LEFT, "rt": JOY_AXIS_TRIGGER_RIGHT,
}
const KEY_ALIASES: Dictionary = {
	"CTRL": KEY_CTRL, "SHIFT": KEY_SHIFT, "ALT": KEY_ALT, "SPACE": KEY_SPACE,
	"TAB": KEY_TAB, "ESCAPE": KEY_ESCAPE, "ENTER": KEY_ENTER, "QUOTELEFT": KEY_QUOTELEFT,
	"1": KEY_1, "2": KEY_2, "3": KEY_3, "4": KEY_4, "5": KEY_5,
	"6": KEY_6, "7": KEY_7, "8": KEY_8, "9": KEY_9, "0": KEY_0,
}

static var actions: Array = []      ## the rows, in file order (the panel lists these)
static var _by_id: Dictionary = {}  ## id -> row (with overrides applied)
static var _folded: bool = false


## The fold: data defaults + user overrides → Godot's InputMap. Idempotent.
static func ensure() -> void:
	if _folded:
		return
	_folded = true
	actions.clear()
	_by_id.clear()
	if not FileAccess.file_exists(BINDINGS_PATH):
		push_warning("InputMap: no %s — engine defaults stand." % BINDINGS_PATH)
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(BINDINGS_PATH))
	if not (parsed is Dictionary):
		push_warning("InputMap: %s malformed." % BINDINGS_PATH)
		return
	var overrides: Dictionary = {}
	if FileAccess.file_exists(OVERRIDES_PATH):
		var ov: Variant = JSON.parse_string(FileAccess.get_file_as_string(OVERRIDES_PATH))
		if ov is Dictionary:
			overrides = ov
	for row_v in (parsed as Dictionary).get("actions", []):
		if not (row_v is Dictionary):
			continue
		var row := (row_v as Dictionary).duplicate(true)
		var id := String(row.get("id", ""))
		if id == "":
			continue
		if overrides.has(id): # the player's rebinds win
			var o: Dictionary = overrides[id]
			if o.has("keys"):
				row["keys"] = (o["keys"] as Array).duplicate()
			if o.has("pad"):
				row["pad"] = (o["pad"] as Array).duplicate()
		actions.append(row)
		_by_id[id] = row
		_apply(row)


## Bind one row into the InputMap — owned whole: erase, then rebind.
static func _apply(row: Dictionary) -> void:
	var id := String(row["id"])
	if not InputMap.has_action(id):
		InputMap.add_action(id, 0.4) # stick directions want a real deadzone
	InputMap.action_erase_events(id)
	for d in (row.get("keys", []) as Array) + (row.get("pad", []) as Array):
		var ev := descriptor_to_event(String(d))
		if ev != null:
			InputMap.action_add_event(id, ev)


## "key:E" / "mouse:left" / "joy:a" / "axis:rt" / "axis:ly:-" → a live InputEvent.
static func descriptor_to_event(d: String) -> InputEvent:
	var parts := d.split(":")
	match parts[0]:
		"key":
			var name := parts[1].to_upper()
			var code: Key = KEY_ALIASES.get(name, OS.find_keycode_from_string(parts[1].capitalize()))
			if code == KEY_NONE:
				push_warning("InputMap: unknown key '%s'" % d)
				return null
			var ev := InputEventKey.new()
			ev.physical_keycode = code
			ev.keycode = code
			return ev
		"mouse":
			var mb := InputEventMouseButton.new()
			mb.button_index = {"left": MOUSE_BUTTON_LEFT, "right": MOUSE_BUTTON_RIGHT,
				"middle": MOUSE_BUTTON_MIDDLE}.get(parts[1], MOUSE_BUTTON_LEFT)
			return mb
		"joy":
			if not JOY_BUTTONS.has(parts[1]):
				push_warning("InputMap: unknown pad button '%s'" % d)
				return null
			var jb := InputEventJoypadButton.new()
			jb.button_index = JOY_BUTTONS[parts[1]]
			return jb
		"axis":
			if not JOY_AXES.has(parts[1]):
				push_warning("InputMap: unknown pad axis '%s'" % d)
				return null
			var jm := InputEventJoypadMotion.new()
			jm.axis = JOY_AXES[parts[1]]
			jm.axis_value = -1.0 if (parts.size() > 2 and parts[2] == "-") else 1.0
			return jm
	push_warning("InputMap: bad descriptor '%s'" % d)
	return null


## A captured InputEvent → a descriptor string ("" = not bindable). The panel's
## press-to-capture runs through here so what you press is what gets saved.
static func event_to_descriptor(ev: InputEvent) -> String:
	if ev is InputEventKey:
		var code: Key = (ev as InputEventKey).physical_keycode
		if code == KEY_NONE:
			code = (ev as InputEventKey).keycode
		for alias in KEY_ALIASES:
			if KEY_ALIASES[alias] == code:
				return "key:%s" % alias
		return "key:%s" % OS.get_keycode_string(code)
	if ev is InputEventMouseButton:
		match (ev as InputEventMouseButton).button_index:
			MOUSE_BUTTON_LEFT: return "mouse:left"
			MOUSE_BUTTON_RIGHT: return "mouse:right"
			MOUSE_BUTTON_MIDDLE: return "mouse:middle"
		return ""
	if ev is InputEventJoypadButton:
		var idx := (ev as InputEventJoypadButton).button_index
		for name in JOY_BUTTONS:
			if JOY_BUTTONS[name] == idx:
				return "joy:%s" % name
		return ""
	if ev is InputEventJoypadMotion:
		var m := ev as InputEventJoypadMotion
		if absf(m.axis_value) < 0.5:
			return "" # drift, not a bind
		for name in JOY_AXES:
			if JOY_AXES[name] == m.axis:
				if name == "lt" or name == "rt":
					return "axis:%s" % name
				return "axis:%s:%s" % [name, "+" if m.axis_value > 0.0 else "-"]
	return ""


## REBIND: replace an action's bindings in one slot ("keys" or "pad"), apply to
## the live InputMap, persist to user://. The panel's SAVE path.
static func rebind(action_id: String, slot: String, descriptors: Array) -> bool:
	if not _by_id.has(action_id) or not (slot == "keys" or slot == "pad"):
		return false
	var row: Dictionary = _by_id[action_id]
	row[slot] = descriptors.duplicate()
	_apply(row)
	_save_overrides()
	return true


## Back to the data defaults: forget every override, re-fold clean.
static func reset_all() -> void:
	if FileAccess.file_exists(OVERRIDES_PATH):
		DirAccess.remove_absolute(OVERRIDES_PATH)
	_folded = false
	ensure()


static func _save_overrides() -> void:
	var out: Dictionary = {}
	# Persist only rows that DIFFER from the data defaults (the file stays honest).
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(BINDINGS_PATH))
	var defaults: Dictionary = {}
	if parsed is Dictionary:
		for r in (parsed as Dictionary).get("actions", []):
			defaults[String((r as Dictionary).get("id", ""))] = r
	for id in _by_id:
		var row: Dictionary = _by_id[id]
		var d: Dictionary = defaults.get(id, {})
		if str(row.get("keys", [])) != str(d.get("keys", [])) or str(row.get("pad", [])) != str(d.get("pad", [])):
			out[id] = {"keys": row.get("keys", []), "pad": row.get("pad", [])}
	var f := FileAccess.open(OVERRIDES_PATH, FileAccess.WRITE)
	f.store_string(JSON.stringify(out, "  "))
	f.close()


## Pretty label for a descriptor — the panel + hints read this. Shows the PS
## face-button name beside the Xbox one (one pad row serves both families).
static func pretty(d: String) -> String:
	var parts := d.split(":")
	match parts[0]:
		"key": return parts[1].to_upper()
		"mouse": return {"left": "LMB", "right": "RMB", "middle": "MMB"}.get(parts[1], "MOUSE")
		"joy":
			return {"a": "A / ✕", "b": "B / ◯", "x": "X / ▢", "y": "Y / △",
				"lb": "LB / L1", "rb": "RB / R1", "l3": "L3", "r3": "R3",
				"start": "START", "back": "BACK / SELECT", "guide": "GUIDE",
				"dpad_up": "D-PAD ↑", "dpad_down": "D-PAD ↓",
				"dpad_left": "D-PAD ←", "dpad_right": "D-PAD →"}.get(parts[1], parts[1].to_upper())
		"axis":
			var base: String = {"rt": "RT / R2", "lt": "LT / L2", "lx": "L-STICK X", "ly": "L-STICK Y",
				"rx": "R-STICK X", "ry": "R-STICK Y"}.get(parts[1], parts[1].to_upper())
			return base + (" %s" % parts[2] if parts.size() > 2 else "")
	return d


## The panel's row surface: [{id, label, group, keys_pretty, pad_pretty}, …].
static func rows_for_panel() -> Array:
	ensure()
	var out: Array = []
	for row in actions:
		var kp: Array = []
		for d in row.get("keys", []):
			kp.append(pretty(String(d)))
		var pp: Array = []
		for d in row.get("pad", []):
			pp.append(pretty(String(d)))
		out.append({"id": row["id"], "label": row.get("label", row["id"]),
			"group": row.get("group", "OTHER"),
			"keys_pretty": " + ".join(kp) if not kp.is_empty() else "—",
			"pad_pretty": " + ".join(pp) if not pp.is_empty() else "—"})
	return out
