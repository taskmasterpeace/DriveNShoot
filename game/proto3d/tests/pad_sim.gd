## Proof for CONTROLLER SUPPORT (the pad arc): pad-shaped input drives the SAME
## game the keyboard does — the stick walks the player, B/circle crouches, L3
## sprints, A/✕ dives, D-PAD ↑ scans the radio THROUGH the real event chain,
## RT tap = the punch (trigger parity with LMB), the triggers become PEDALS when
## you take the wheel and weapons again on foot, and the CONTROLS panel rebinds
## a key by press-to-capture and persists it. Poll-path fields ride action state
## (the stick's own channel); chain verbs ride REAL InputEventJoypad* objects.
## Run: godot --headless --path game res://proto3d/tests/pad_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


class TestFoe:
	extends CharacterBody3D
	var hp: float = 999.0
	var hits: Array = []
	var _stun_t: float = 0.0

	static func create() -> TestFoe:
		var f := TestFoe.new()
		f.add_to_group("threat")
		var shape := CollisionShape3D.new()
		var cap := CapsuleShape3D.new()
		cap.radius = 0.35
		cap.height = 1.7
		shape.shape = cap
		shape.position.y = 0.85
		f.add_child(shape)
		return f

	func take_damage(amount: float, _attacker: Node3D = null) -> void:
		hp -= amount
		hits.append(amount)

	func _physics_process(delta: float) -> void:
		_stun_t = maxf(0.0, _stun_t - delta)


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("PAD: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _pad_button(idx: int, down: bool) -> void:
	var e := InputEventJoypadButton.new()
	e.button_index = idx
	e.pressed = down
	get_tree().root.push_input(e) # the wire a REAL pad rides into the chain


func _pad_trigger(axis: int, v: float) -> void:
	var e := InputEventJoypadMotion.new()
	e.axis = axis
	e.axis_value = v
	get_tree().root.push_input(e)


func _move_up_has_trigger() -> bool:
	for e in InputMap.action_get_events("move_up"):
		if e is InputEventJoypadMotion and (e as InputEventJoypadMotion).axis == JOY_AXIS_TRIGGER_RIGHT:
			return true
	return false


func _ready() -> void:
	print("PAD: start")
	get_tree().create_timer(75.0).timeout.connect(func() -> void:
		print("PAD: WATCHDOG"); print("PAD: FAILURES PRESENT"); get_tree().quit(1))
	if FileAccess.file_exists(ProtoInputMap.OVERRIDES_PATH):
		DirAccess.remove_absolute(ProtoInputMap.OVERRIDES_PATH)
	ProtoInputMap._folded = false
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	main._exit_car()
	var p: ProtoPlayer3D = main.player
	p.global_position = Vector3(6, 0.35, 388)
	p.velocity = Vector3.ZERO
	main.equipped = -1
	main.fists.crit_chance = 0.0
	for _i in 4:
		await get_tree().physics_frame

	# --- The STICK walks the body (the poll channel a stick feeds) --------------
	var from := p.global_position
	Input.action_press("move_up", 1.0)
	for _i in 40:
		await get_tree().physics_frame
	_check("the LEFT STICK walks the player (%.1fm)" % from.distance_to(p.global_position),
		from.distance_to(p.global_position) > 1.5)

	# --- L3 sprints, B/circle crouches (pad bindings on the SAME actions) --------
	Input.action_press("drivn_sprint", 1.0)
	for _i in 20:
		await get_tree().physics_frame
	_check("L3 SPRINTS (drivn_sprint action)", p.sprinting())
	Input.action_release("drivn_sprint")
	Input.action_release("move_up")
	for _i in 8:
		await get_tree().physics_frame # come fully to rest — a crouch-tap at a
		# sprint is a SLIDE (the moveset working as designed), and this test
		# wants the plain crouch, not the slide.
	Input.action_press("drivn_crouch", 1.0)
	for _i in 8:
		await get_tree().physics_frame
	_check("B / ◯ CROUCHES (held)", p.crouching)
	Input.action_release("drivn_crouch")
	for _i in 8:
		await get_tree().physics_frame

	# --- A / ✕ DIVES ---------------------------------------------------------------
	Input.action_press("move_up", 1.0)
	for _i in 4:
		await get_tree().physics_frame
	p._getup_dur = -1.0 # sticky evidence: dive entry always writes this
	Input.action_press("jump")
	for _i in 4:
		await get_tree().physics_frame
	Input.action_release("jump")
	await get_tree().physics_frame
	_check("A / ✕ commits the DIVE (entry ran: getup %.2fs)" % p._getup_dur, p._getup_dur > 0.0)
	Input.action_release("jump")
	Input.action_release("move_up")
	for _i in 60:
		await get_tree().physics_frame # land + recover

	# --- D-PAD ↑ scans the RADIO through the REAL event chain ------------------------
	main.radio._cd = 0.0
	var sig0: String = main.radio.last_signal
	main.radio.rng.seed = 7
	_pad_button(JOY_BUTTON_DPAD_UP, true)
	await get_tree().physics_frame
	_pad_button(JOY_BUTTON_DPAD_UP, false)
	await get_tree().physics_frame
	_check("D-PAD ↑ works the DIAL (chain event: %s)" % main.radio.last_signal,
		main.radio.last_signal != sig0 or main.radio._cd > 0.0)

	# --- RT tap = the PUNCH (trigger parity with LMB) --------------------------------
	var foe := TestFoe.create()
	main.add_child(foe)
	foe.global_position = p.global_position + p.facing() * 1.4
	main.aim_override = foe.global_position - p.global_position
	await get_tree().physics_frame
	_pad_trigger(JOY_AXIS_TRIGGER_RIGHT, 1.0)
	await get_tree().physics_frame
	await get_tree().physics_frame
	_pad_trigger(JOY_AXIS_TRIGGER_RIGHT, 0.0)
	for _i in 6:
		await get_tree().physics_frame
	_check("RT / R2 tap PUNCHES (%d hit)" % foe.hits.size(), foe.hits.size() >= 1)

	# --- Take the wheel: the triggers become PEDALS; on foot, weapons again ----------
	_check("on FOOT the triggers are weapons (no pedal on move_up)", not _move_up_has_trigger())
	main.mode = main.Mode.DRIVE # staging the mode read; boarding is seat_sim's law
	for _i in 3:
		await get_tree().physics_frame
	_check("at the WHEEL, RT is the GAS (pedal event on move_up)", _move_up_has_trigger())
	main.mode = main.Mode.FOOT
	for _i in 3:
		await get_tree().physics_frame
	_check("back on foot, the pedal unbolts", not _move_up_has_trigger())

	# --- The CONTROLS panel rebinds by press-to-capture ------------------------------
	main.toggle_controls_panel()
	_check("the CONTROLS panel opens", main.controls_panel != null and main.controls_panel.is_open)
	main.controls_panel._begin_capture("drivn_radio", "keys", Button.new())
	_check("capture is LISTENING", main.controls_panel.capturing())
	var ev := InputEventKey.new()
	ev.keycode = KEY_U
	ev.physical_keycode = KEY_U
	ev.pressed = true
	get_tree().root.push_input(ev)
	await get_tree().physics_frame
	var got_u := false
	for e in InputMap.action_get_events("drivn_radio"):
		if e is InputEventKey and (e as InputEventKey).physical_keycode == KEY_U:
			got_u = true
	_check("press-to-capture REBINDS (radio → U)", got_u and not main.controls_panel.capturing())
	_check("the rebind PERSISTED", FileAccess.file_exists(ProtoInputMap.OVERRIDES_PATH))
	ProtoInputMap.reset_all()
	main.controls_panel.close()
	_check("the panel closes and the feet come back", not main.controls_panel.is_open)

	# --- Rumble is safe with zero pads (headless) --------------------------------------
	main.pad_rumble(1.0, 1.0, 0.1)
	_check("rumble with no pad connected is a no-op, not a crash", true)

	print("PAD RESULTS: %d passed, %d failed" % [passed, failed])
	print("PAD: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
