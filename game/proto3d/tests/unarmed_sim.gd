## Proof for the UNARMED KIT (MOVESET.txt): empty hands are a weapon.
## TAP = the punch combo (jab→jab→cross; KICKS fold in at Martial Arts 2) ·
## HOLD = a SHOVE that makes space · SPRINT+strike = a TACKLE that floors them ·
## Martial Arts 6 turns a punch on a DOWNED body into a FINISHER (×3).
## Real mouse/key events through the one melee law; the foe is a real collision
## body in the threat group (melee scans the union — any hostile is meleeable).
## Run: godot --headless --path game res://proto3d/tests/unarmed_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


## A hostile that RECORDS the contract calls (damage/shove/knockdown) — the
## values are the law under test; the physics of falling is howler_sim's job.
class TestFoe:
	extends CharacterBody3D
	var hp: float = 999.0
	var hits: Array = []
	var last_shove: float = 0.0
	var downs: int = 0
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

	func shove(_dir: Vector3, power: float) -> void:
		last_shove = maxf(last_shove, power)

	func knock_down() -> void:
		downs += 1
		_stun_t = 1.2

	func _physics_process(delta: float) -> void:
		_stun_t = maxf(0.0, _stun_t - delta)


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("UNARMED: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _key(kc: Key, down: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = kc
	ev.physical_keycode = kc
	ev.pressed = down
	Input.parse_input_event(ev)


func _mouse(down: bool) -> void:
	var ev := InputEventMouseButton.new()
	ev.button_index = MOUSE_BUTTON_LEFT
	ev.pressed = down
	Input.parse_input_event(ev)


## A TAP: press, a beat, release (inside the shove-hold window).
func _tap() -> void:
	_mouse(true)
	await get_tree().physics_frame
	await get_tree().physics_frame
	_mouse(false)
	for _i in 4:
		await get_tree().physics_frame


func _ready() -> void:
	print("UNARMED: start")
	get_tree().create_timer(75.0).timeout.connect(func() -> void:
		print("UNARMED: WATCHDOG"); print("UNARMED: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	main._exit_car()
	var p: ProtoPlayer3D = main.player
	p.global_position = Vector3(6, 0.35, 388) # the proven open shoulder
	p.velocity = Vector3.ZERO
	main.equipped = -1 # EMPTY HANDS — the whole point
	main.fists.crit_chance = 0.0 # determinism: no lucky ×1.8 in the damage asserts
	main.palm.crit_chance = 0.0
	for _i in 4:
		await get_tree().physics_frame

	var foe := TestFoe.create()
	main.add_child(foe)
	foe.global_position = p.global_position + Vector3(0, 0, -1.4) # in the jab's face
	main.aim_override = foe.global_position - p.global_position
	await get_tree().physics_frame

	# --- 1. TAP = PUNCH (does damage, teaches the ART) -------------------------
	await _tap()
	_check("a TAP punches (%d hit)" % foe.hits.size(), foe.hits.size() == 1)
	_check("the jab does damage (%.1f)" % (foe.hits[0] if not foe.hits.is_empty() else 0.0),
		not foe.hits.is_empty() and foe.hits[0] > 6.0)
	_check("unarmed strikes teach MARTIAL ARTS",
		main.character.skills["martial_arts"]["xp"] > 0.0)

	# --- 2. THE COMBO at Martial Arts 2: third beat is a KICK ------------------
	main.character.add_xp("martial_arts", 4.0 * 40.0) # → level 2 (KICKS)
	_check("staged Martial Arts 2", main.character.level("martial_arts") == 2)
	for _i in 85:
		await get_tree().physics_frame # drain the cooldown AND the combo window
	foe.hits.clear()
	for _i in 3:
		await _tap()
		for _j in 18:
			await get_tree().physics_frame # ride out the fists cooldown
	_check("three taps land three strikes (%d)" % foe.hits.size(), foe.hits.size() == 3)
	_check("the third beat KICKS harder (%.1f > %.1f)" % [
			foe.hits[2] if foe.hits.size() > 2 else 0.0, foe.hits[0] if not foe.hits.is_empty() else 99.0],
		foe.hits.size() == 3 and foe.hits[2] > foe.hits[0] * 1.7)

	# --- 3. HOLD = SHOVE (space, not damage) -----------------------------------
	foe.last_shove = 0.0
	p.stamina = p.max_stamina
	for _i in 30:
		await get_tree().physics_frame # let the palm cooldown clear
	_mouse(true)
	for _i in 30:
		await get_tree().physics_frame # past the hold beat — the shove auto-fires
	_mouse(false)
	_check("HOLD shoves them back (power %.1f)" % foe.last_shove, foe.last_shove >= 5.0)

	# --- 4. SPRINT + strike = TACKLE → they hit the floor ----------------------
	foe.global_position = p.global_position + Vector3(0, 0, -6.0) # up the sprint lane
	foe.downs = 0
	p._stance_t = 0.0 # stage: the combat-stance lull is skills_sim's business
	p.stamina = p.max_stamina
	main.aim_override = foe.global_position - p.global_position
	_key(KEY_SHIFT, true)
	Input.action_press("move_up")
	for _i in 22:
		await get_tree().physics_frame # build to a real sprint
	_check("sprinting into the tackle", p.sprinting())
	_mouse(true)
	await get_tree().physics_frame
	_mouse(false)
	var downed := false
	for _i in 50:
		await get_tree().physics_frame
		if foe.downs > 0:
			downed = true
			break
	Input.action_release("move_up")
	_key(KEY_SHIFT, false)
	_check("the TACKLE floors them (downs %d)" % foe.downs, downed)
	_check("the tackle hurts too", not foe.hits.is_empty() and foe.hits[-1] >= 9.0)

	# --- 5. FINISHER at Martial Arts 6: punish the down window -----------------
	main.character.add_xp("martial_arts", 36.0 * 40.0) # → level 6 (FINISHERS)
	_check("staged Martial Arts 6", main.character.level("martial_arts") >= 6)
	foe.hits.clear()
	foe._stun_t = 1.2 # they're DOWN (the tackle just proved the path that sets this)
	main.aim_override = foe.global_position - p.global_position
	for _i in 6:
		await get_tree().physics_frame
	await _tap()
	_check("a punch on a DOWNED body is a FINISHER (%.1f ≥ 20)" % (foe.hits[-1] if not foe.hits.is_empty() else 0.0),
		not foe.hits.is_empty() and foe.hits[-1] >= 20.0)

	# --- 6. THROW at Martial Arts 4+: a grapple-range shove is a guaranteed floor —
	foe.downs = 0
	foe.last_shove = 0.0
	for _i in 40:
		await get_tree().physics_frame # palm cooldown clear
	_mouse(true)
	for _i in 30:
		await get_tree().physics_frame # hold → the shove fires as a THROW
	_mouse(false)
	_check("grapple-range shove is a THROW — guaranteed floor (downs %d)" % foe.downs, foe.downs >= 1)
	_check("the throw carries extra shove (%.1f ≥ 8)" % foe.last_shove, foe.last_shove >= 8.0)

	print("UNARMED RESULTS: %d passed, %d failed" % [passed, failed])
	print("UNARMED: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
