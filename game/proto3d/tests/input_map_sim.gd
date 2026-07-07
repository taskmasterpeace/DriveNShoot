## Proof for THE INPUT MAP AS ROWS (controller arc): bindings fold from
## data/input_bindings.json into Godot's InputMap (keys + mouse + PAD on one
## action), the descriptor codec round-trips, REAL joypad events drive the same
## actions the keyboard does, and a REBIND applies live + persists to user://
## and resets clean. PS-family parity is visible in every pad label.
## Run: godot --headless --path game res://proto3d/tests/input_map_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("INMAP: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("INMAP: start")
	get_tree().create_timer(45.0).timeout.connect(func() -> void:
		print("INMAP: WATCHDOG"); print("INMAP: FAILURES PRESENT"); get_tree().quit(1))

	# Clean slate: no leftover overrides from an earlier run.
	if FileAccess.file_exists(ProtoInputMap.OVERRIDES_PATH):
		DirAccess.remove_absolute(ProtoInputMap.OVERRIDES_PATH)
	ProtoInputMap._folded = false
	ProtoInputMap.ensure()

	# --- The fold ---------------------------------------------------------------
	_check("the rows LOADED (%d actions)" % ProtoInputMap.actions.size(), ProtoInputMap.actions.size() >= 35)
	_check("new actions exist in the engine map", InputMap.has_action("drivn_fire")
		and InputMap.has_action("drivn_crouch") and InputMap.has_action("drivn_radio"))
	var mu := InputMap.action_get_events("move_up")
	var has_key := false
	var has_pad := false
	for ev in mu:
		if ev is InputEventKey:
			has_key = true
		if ev is InputEventJoypadMotion:
			has_pad = true
	_check("move_up carries BOTH the key AND the stick (one action, two worlds)", has_key and has_pad)

	# --- The descriptor codec round-trips ----------------------------------------
	var all_rt := true
	for d in ["key:E", "key:SHIFT", "mouse:left", "joy:a", "joy:dpad_up", "axis:rt", "axis:ly:-"]:
		var ev := ProtoInputMap.descriptor_to_event(d)
		var back := ProtoInputMap.event_to_descriptor(ev)
		if back != d:
			all_rt = false
			print("INMAP: codec drift %s -> %s" % [d, back])
	_check("the descriptor codec ROUND-TRIPS every kind", all_rt)

	# --- REAL pad events drive the actions ----------------------------------------
	# (Headless quirk, probed: the Input singleton only ingests the FIRST parsed
	# joypad event of a run — real pads are SDL-driven and unaffected. So: the
	# first event proves the POLL path end-to-end; binding-level matching — the
	# exact check the game's event chain runs — proves the rest, deterministically.)
	var stick := InputEventJoypadMotion.new()
	stick.axis = JOY_AXIS_LEFT_Y
	stick.axis_value = -1.0 # stick full north
	Input.parse_input_event(stick)
	await get_tree().physics_frame
	await get_tree().physics_frame
	_check("the LEFT STICK moves like W (axis %.2f)" % Input.get_axis("move_down", "move_up"),
		Input.get_axis("move_down", "move_up") > 0.5)
	var rt := InputEventJoypadMotion.new()
	rt.axis = JOY_AXIS_TRIGGER_RIGHT
	rt.axis_value = 1.0 # trigger squeezed
	_check("RT MATCHES fire (the chain's own check)", rt.is_action_pressed("drivn_fire"))
	var abtn := InputEventJoypadButton.new()
	abtn.button_index = JOY_BUTTON_A
	abtn.pressed = true
	_check("A / ✕ MATCHES the dive (jump action)", abtn.is_action_pressed("jump"))
	var dpad := InputEventJoypadButton.new()
	dpad.button_index = JOY_BUTTON_DPAD_UP
	dpad.pressed = true
	_check("D-PAD ↑ MATCHES the radio", dpad.is_action_pressed("drivn_radio"))

	# --- REBIND: live + persistent + resettable ------------------------------------
	_check("rebind APPLIES (radio Y -> U)", ProtoInputMap.rebind("drivn_radio", "keys", ["key:U"]))
	var ev_u := InputMap.action_get_events("drivn_radio")
	var got_u := false
	for e in ev_u:
		if e is InputEventKey and (e as InputEventKey).physical_keycode == KEY_U:
			got_u = true
	_check("the live map WEARS the rebind", got_u)
	_check("the override PERSISTED to user://", FileAccess.file_exists(ProtoInputMap.OVERRIDES_PATH))
	ProtoInputMap._folded = false
	ProtoInputMap.ensure() # a fresh boot
	got_u = false
	for e in InputMap.action_get_events("drivn_radio"):
		if e is InputEventKey and (e as InputEventKey).physical_keycode == KEY_U:
			got_u = true
	_check("the rebind SURVIVES a reboot", got_u)
	ProtoInputMap.reset_all()
	var back_to_y := false
	for e in InputMap.action_get_events("drivn_radio"):
		if e is InputEventKey and (e as InputEventKey).physical_keycode == KEY_Y:
			back_to_y = true
	_check("RESET returns the stock keys (Y)", back_to_y and not FileAccess.file_exists(ProtoInputMap.OVERRIDES_PATH))

	# --- The panel surface -----------------------------------------------------------
	var rows := ProtoInputMap.rows_for_panel()
	_check("the panel surface lists every row", rows.size() == ProtoInputMap.actions.size())
	_check("PS parity is VISIBLE (A / ✕ on the dive)", ProtoInputMap.pretty("joy:a").contains("✕"))

	print("INMAP RESULTS: %d passed, %d failed" % [passed, failed])
	print("INMAP: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
