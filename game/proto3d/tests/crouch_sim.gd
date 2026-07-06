## Proof for CROUCH + SLIDE (MOVESET.txt live set, the ONE new key): hold CTRL =
## a low stance — slower feet, a smaller/quieter read (noise_mult), a shorter
## capsule (fits low gaps), the rig visibly sinks. SPRINT + tap CTRL = a SLIDE
## that carries meters and ENDS crouched. Real inputs (parsed key events), the
## iron rule — no teleports past the documented position staging.
## Run: godot --headless --path game res://proto3d/tests/crouch_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CROUCH: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Real hardware path: a parsed key event — exactly what the keyboard sends.
func _key(kc: Key, down: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = kc
	ev.physical_keycode = kc
	ev.pressed = down
	Input.parse_input_event(ev)


## Meters covered over n physics frames while holding move_up.
func _walk_distance(p: ProtoPlayer3D, frames: int) -> float:
	var from := p.global_position
	for _i in frames:
		await get_tree().physics_frame
	return from.distance_to(p.global_position)


func _ready() -> void:
	print("CROUCH: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("CROUCH: WATCHDOG"); print("CROUCH: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	main._exit_car()
	var p: ProtoPlayer3D = main.player
	p.global_position = Vector3(6, 0.35, 388) # the proven open shoulder (dive/getup sims)
	p.velocity = Vector3.ZERO
	for _i in 4:
		await get_tree().physics_frame

	# --- 1. Baseline walk rate ------------------------------------------------
	Input.action_press("move_up")
	for _i in 6:
		await get_tree().physics_frame # let speed settle
	var walk_d: float = await _walk_distance(p, 30)
	_check("baseline walk covers ground (%.2fm/30f)" % walk_d, walk_d > 1.2)

	# --- 2. HOLD CTRL = crouch: slower, smaller, quieter, low capsule ---------
	_key(KEY_CTRL, true)
	for _i in 6:
		await get_tree().physics_frame
	_check("holding CTRL enters the crouch", p.crouching)
	var crouch_d: float = await _walk_distance(p, 30)
	_check("crouched feet are SLOWER (%.2fm < %.2fm)" % [crouch_d, walk_d], crouch_d < walk_d * 0.75)
	_check("the capsule DROPS (%.2f) — fits low gaps" % p._cap.height, p._cap.height < 1.2)
	_check("crouched you read QUIETER (noise ×%.2f)" % p.noise_mult(),
		p.noise_mult() < p.stealth_base * 0.6 + 0.001)
	_check("the rig visibly SINKS (blend %.2f)" % p.puppet._crouch, p.puppet._crouch > 0.4)

	# --- 3. Release = stand back up -------------------------------------------
	_key(KEY_CTRL, false)
	for _i in 8:
		await get_tree().physics_frame
	_check("release CTRL stands you up", not p.crouching)
	_check("the capsule restores (%.2f)" % p._cap.height, p._cap.height > 1.6)
	_check("standing noise restores (×%.2f)" % p.noise_mult(),
		absf(p.noise_mult() - p.stealth_base) < 0.001)

	# --- 4. SPRINT + tap CTRL = SLIDE that ends crouched -----------------------
	p.stamina = p.max_stamina
	_key(KEY_SHIFT, true)
	for _i in 20:
		await get_tree().physics_frame # build to a real sprint
	_check("sprinting before the slide", p.sprinting())
	var stam_before: float = p.stamina
	var slide_from := p.global_position
	_key(KEY_CTRL, true)
	var saw_slide := false
	for _i in 40:
		await get_tree().physics_frame
		if p.move_state == ProtoPlayer3D.FootState.SLIDE:
			saw_slide = true
		if saw_slide and p.move_state != ProtoPlayer3D.FootState.SLIDE:
			break
	var slide_d := slide_from.distance_to(p.global_position)
	_check("sprint + CTRL commits a SLIDE", saw_slide)
	_check("the slide CARRIES (%.2fm)" % slide_d, slide_d > 2.0)
	_check("the slide costs stamina", p.stamina < stam_before)
	_check("the slide ENDS crouched (CTRL still held)", p.crouching)
	_key(KEY_CTRL, false)
	_key(KEY_SHIFT, false)
	Input.action_release("move_up")

	print("CROUCH RESULTS: %d passed, %d failed" % [passed, failed])
	print("CROUCH: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
