## Proof for THE SHOOTDODGE (Max Payne dive): from liftoff to your feet the game
## NEVER ignores you — the mouse keeps the gun (any direction, independent of the
## dive line), LMB fires mid-air AND prone, a movement key rolls you up fast, and
## a vehicle highside keeps its heavy uncancelable recovery. Real inputs: action
## presses + parsed mouse events (aim_override is the documented aim seam).
## Run: godot --headless --path game res://proto3d/tests/dive_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D

const EAST := Vector3(1, 0, 0)


class TargetDummy:
	extends StaticBody3D
	var hp: float = 1000.0
	func take_damage(d: float) -> void:
		hp -= d


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DIVE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _dummy(pos: Vector3) -> TargetDummy:
	var d := TargetDummy.new()
	var cs := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(2.0, 2.4, 2.0)
	cs.shape = box
	d.add_child(cs)
	main.add_child(d)
	d.global_position = pos
	return d


func _click() -> void:
	for pressed in [true, false]:
		var ev := InputEventMouseButton.new()
		ev.button_index = MOUSE_BUTTON_LEFT
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _aim_at(d: TargetDummy) -> void:
	main.aim_override = (d.global_position + Vector3(0, 0.2, 0)) - main.player.global_position


func _ready() -> void:
	print("DIVE: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("DIVE: WATCHDOG")
		print("DIVE: FAILURES PRESENT")
		get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	# --- Stage: on foot, pistol in hand, a dummy due EAST -------------------------
	main._exit_car()
	main.player.global_position = Vector3(6, 0.35, 388) # open interstate shoulder
	main.player.velocity = Vector3.ZERO
	main.backpack.add("pistol", 1)
	main.backpack.add("9mm", 24)
	main.use_item("pistol")
	for _i in 4:
		await get_tree().physics_frame
	var dum := _dummy(main.player.global_position + EAST * 7.0 + Vector3(0, 1.1, 0))
	var p = main.player
	var stamina0: float = p.stamina
	var tscale0: float = Engine.time_scale

	# --- Liftoff: dive NORTH while aiming EAST ------------------------------------
	_aim_at(dum)
	Input.action_press("move_up")
	await get_tree().physics_frame
	Input.action_press("jump")
	await get_tree().physics_frame
	await get_tree().physics_frame
	Input.action_release("jump")
	Input.action_release("move_up") # nothing held → landing can't auto-cancel
	await get_tree().physics_frame
	_check("SPACE commits the dive", p.move_state == ProtoPlayer3D.FootState.DIVE)
	_check("the air runs 0.6× (scale %.2f < %.2f)" % [Engine.time_scale, tscale0], Engine.time_scale < tscale0 - 0.01)
	_check("stamina paid the dive toll (%.0f → %.0f)" % [stamina0, p.stamina], p.stamina <= stamina0 - 15.0)

	# --- MID-AIR: the gun is FREE — aim ≠ dive line, and a shot LANDS -------------
	_aim_at(dum)
	await get_tree().physics_frame
	var aim_east: float = p.aim_facing().dot(EAST)
	var aim_vs_dive: float = p.aim_facing().dot(p._dive_dir)
	_check("mid-air the arm obeys the MOUSE (east dot %.2f, dive-line dot %.2f)" % [aim_east, aim_vs_dive],
		aim_east > 0.85 and absf(aim_vs_dive) < 0.5)
	var hp0: float = dum.hp
	_aim_at(dum)
	_click()
	for _i in 2:
		await get_tree().physics_frame
	_check("a bullet fired MID-DIVE hits (hp %.0f → %.0f, state DIVE)" % [hp0, dum.hp],
		dum.hp < hp0 and p.move_state == ProtoPlayer3D.FootState.DIVE)

	# --- PRONE: landed, still shooting --------------------------------------------
	var frames := 0
	while p.move_state != ProtoPlayer3D.FootState.GETUP and frames < 40:
		frames += 1
		await get_tree().physics_frame
	_check("the dive lands into the prone beat", p.move_state == ProtoPlayer3D.FootState.GETUP)
	var hp1: float = dum.hp
	_aim_at(dum)
	_click()
	for _i in 2:
		await get_tree().physics_frame
	_check("a bullet fired PRONE hits (hp %.0f → %.0f)" % [hp1, dum.hp], dum.hp < hp1)

	# --- CANCEL: a movement key rolls you to your feet NOW ------------------------
	Input.action_press("move_up")
	frames = 0
	while p.move_state != ProtoPlayer3D.FootState.NORMAL and frames < 20:
		frames += 1
		await get_tree().physics_frame
	Input.action_release("move_up")
	_check("movement CANCELS the get-up fast (%d frames ≈ %.2fs)" % [frames, frames / 60.0],
		p.move_state == ProtoPlayer3D.FootState.NORMAL and frames <= 16)

	# --- Dilation restored (the cinematic contract: restore PREVIOUS) -------------
	frames = 0
	while absf(Engine.time_scale - tscale0) > 0.01 and frames < 240:
		frames += 1
		await get_tree().physics_frame
	_check("time scale RESTORED to previous (%.2f)" % Engine.time_scale, absf(Engine.time_scale - tscale0) <= 0.01)

	# --- THROWN from a vehicle: heavy and UNCANCELABLE -----------------------------
	p.tumble(Vector3(6.0, 1.0, 0.0))
	_check("a highside get-up runs LONG (%.2fs ≥ 1.0)" % p._getup_dur, p._getup_dur >= 1.0)
	frames = 0
	while p.move_state != ProtoPlayer3D.FootState.GETUP and frames < 60:
		frames += 1
		await get_tree().physics_frame
	Input.action_press("move_up") # mash movement the whole way down
	for _i in 30: # 0.5s of mashing
		await get_tree().physics_frame
	_check("mashing does NOT cancel a highside (still down at 0.5s)", p.move_state == ProtoPlayer3D.FootState.GETUP)
	frames = 0
	while p.move_state != ProtoPlayer3D.FootState.NORMAL and frames < 120:
		frames += 1
		await get_tree().physics_frame
	Input.action_release("move_up")
	_check("...but you DO get up eventually", p.move_state == ProtoPlayer3D.FootState.NORMAL)

	print("DIVE RESULTS: %d passed, %d failed" % [passed, failed])
	print("DIVE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
