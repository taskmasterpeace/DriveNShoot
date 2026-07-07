## Proof for THE CAR ENTRY & IGNITION LADDER (goal: locks · lock-picking · glass-smash ·
## engine start/stop · wheel hot-wire). Real main, REAL INPUT (Input.action_press —
## never teleported state): hold-E SMASHES a locked car's glass (loud — emit_noise heard)
## or PICKS it quietly with a lockpick; sitting down doesn't start the engine — the first
## throttle CRANKS it (dead battery just clicks); a keyed car you broke into hot-wires AT
## THE WHEEL; stepping out kills the motor. Run:
## godot --headless --path game res://proto3d/tests/car_entry_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node = null


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("ENTRY: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _frames(n: int) -> void:
	for _i in n:
		await get_tree().physics_frame


func _stage_car(at_off: Vector3, lock: bool, key: String) -> ProtoCar3D:
	var c := ProtoCar3D.create("scavenger", Color(0.4, 0.4, 0.45))
	main.add_child(c)
	c.global_position = main.player.global_position + at_off
	c.locked = lock
	c.key_id = key
	return c


func _ready() -> void:
	get_tree().create_timer(150.0).timeout.connect(func() -> void:
		print("ENTRY: DONE — %d passed, %d failed (WATCHDOG)" % [passed, failed + 1])
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	await _frames(8)
	if main.mode == 0 and main.active_car != null:
		main._exit_car() # the run starts at the wheel — this ladder begins ON FOOT
		await _frames(4)
	# Isolated staging (test-standards): away from the spawn's own car/chest clutter so
	# the interact scan can only grab OUR subject.
	main.player.global_position = Vector3(6, 0.35, 388)
	await _frames(2)

	# --- 1. SMASH THE GLASS (no pick): hold E → 0.6s → open, LOUD. ------------------
	var car_a := _stage_car(Vector3(2.6, 0.6, 0), true, "test_key_a")
	await _frames(3)
	_check("locked + no pick prompts the SMASH", car_a.interact_prompt(main).contains("smash"))
	Input.action_press("interact")
	await _frames(50) # ~0.83s — past the 0.6s smash
	Input.action_release("interact")
	_check("the glass gave — door open", not car_a.locked)
	_check("the window wears the scar", car_a.window_broken)
	var heard: bool = main.noises_in(car_a.global_position).any(func(n): return String(n.get("kind", "")) == "glass")
	_check("the night HEARD it (55m glass noise)", heard)

	# --- 2. PICK THE LOCK (with a pick): quiet, the pick survives. ------------------
	main.backpack.add("lockpick", 1)
	var car_b := _stage_car(Vector3(-2.6, 0.6, 0), true, "test_key_b")
	car_a.queue_free()
	await _frames(3)
	_check("with a pick the prompt offers the QUIET way", car_b.interact_prompt(main).contains("pick"))
	Input.action_press("interact")
	await _frames(330) # ~5.5s — past the mechanics-0 pick (5.0s)
	Input.action_release("interact")
	_check("picked open — no key needed", not car_b.locked)
	_check("no glass, no scar", not car_b.window_broken)
	_check("the pick survives the job", main.backpack.count("lockpick") == 1)
	car_b.queue_free()

	# --- 3. IGNITION: sitting down starts NOTHING; the first throttle CRANKS. -------
	var car_c := _stage_car(Vector3(2.6, 0.6, 0), false, "")
	await _frames(3)
	car_c.interact(main) # the real door: E enters
	_check("you're at the wheel", main.mode == 0 and main.active_car == car_c)
	_check("the engine is OFF until asked", not car_c.engine_on)
	Input.action_press("move_up")
	await _frames(45) # ~0.75s — the 0.5s crank
	_check("the crank catches — engine ON", car_c.engine_on)
	var eng_heard: bool = main.noises_in(car_c.global_position).any(func(n): return String(n.get("kind", "")) == "engine")
	_check("the start was a NOISE event", eng_heard)
	Input.action_release("move_up")

	# --- 4. STOP: stepping out kills the motor. --------------------------------------
	main._exit_car()
	await _frames(2)
	_check("the engine dies with the door", not car_c.engine_on)

	# --- 5. DEAD BATTERY: the crank is a dry click. -----------------------------------
	car_c.components["battery"].hp = 1.0 # CRITICAL tier (staging exception)
	car_c.interact(main)
	Input.action_press("move_up")
	await _frames(90) # 1.5s of trying
	Input.action_release("move_up")
	_check("a critical battery never catches (click)", not car_c.engine_on)
	main._exit_car()
	car_c.queue_free()

	# --- 6. THE WHEEL HOT-WIRE: broke in? wire it, THEN crank. -----------------------
	var car_e := _stage_car(Vector3(-2.6, 0.6, 0), false, "sedan_key_e") # keyed, no key held
	await _frames(3)
	car_e.interact(main)
	_check("no key → ignition reads 'none'", car_e.ignition == "none" and not car_e.engine_on)
	Input.action_press("move_up")
	await _frames(330) # ~5.5s wire (mechanics 0 → 5.0s)
	_check("the wires kissed (hot-wired)", car_e.ignition == "hotwire")
	await _frames(45)  # …and the crank takes over
	Input.action_release("move_up")
	_check("hot-wired crank catches — engine ON", car_e.engine_on)

	print("ENTRY: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
