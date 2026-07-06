## Proof for Rung 4: NPCs act their part on the SAME puppet, fed different STATE.
## A trader gestures (free arm lifts), a guard scans (the body turns side to side),
## a paced guard walks his beat (position moves, gait engages), a bandit crouch-aims
## (rig lowered + armed), a drifter idles. No new bodies — the rig reading data.
## Run: godot --headless --path game res://proto3d/tests/npc_act_sim.tscn
extends Node3D

var passed := 0
var failed := 0
var phase := 0
var phase_t := 0.0

var trader: ProtoNPC
var guard: ProtoNPC
var pacer: ProtoNPC
var bandit: ProtoNPC
var drifter: ProtoNPC

var arm_lo := 1e9
var arm_hi := -1e9
var yaw_lo := 1e9
var yaw_hi := -1e9
var pacer_start := Vector3.ZERO


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("NACT: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("NACT: start")
	var ground := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(200, 1, 200)
	shape.shape = box
	shape.position.y = -0.5
	ground.add_child(shape)
	add_child(ground)

	trader = _spawn("trader", Vector3(0, 0.3, 0))
	guard = _spawn("secman", Vector3(4, 0.3, 0))
	drifter = _spawn("drifter", Vector3(8, 0.3, 0))
	pacer = _spawn("secman", Vector3(-4, 0.3, 0))
	pacer.act = "pace"
	bandit = _spawn("secman", Vector3(-8, 0.3, 0))
	bandit.act = "aim_crouch"
	bandit._puppet.set_armed(true)


func _spawn(arch: String, pos: Vector3) -> ProtoNPC:
	var n := ProtoNPC.create(arch)
	add_child(n)
	n.global_position = pos
	return n


func _physics_process(delta: float) -> void:
	phase_t += delta
	match phase:
		0: # let them settle onto the floor
			if phase_t > 0.6:
				pacer_start = pacer.global_position
				_next()
		1: # sample the acts for ~3 s
			arm_lo = minf(arm_lo, trader._puppet.free_arm.rotation.x)
			arm_hi = maxf(arm_hi, trader._puppet.free_arm.rotation.x)
			yaw_lo = minf(yaw_lo, guard._visual.rotation.y)
			yaw_hi = maxf(yaw_hi, guard._visual.rotation.y)
			if phase_t > 3.2:
				_check("every NPC is built on the puppet",
					trader._puppet != null and guard._puppet != null and drifter._puppet != null and bandit._puppet != null)
				_check("the TRADER gestures — the free arm lifts (range %.2f, want >0.5)" % (arm_hi - arm_lo), (arm_hi - arm_lo) > 0.5)
				_check("the GUARD scans — the body turns side to side (yaw range %.2f, want >0.4)" % (yaw_hi - yaw_lo), (yaw_hi - yaw_lo) > 0.4)
				var moved := pacer_start.distance_to(pacer.global_position)
				_check("the paced guard WALKS his beat (moved %.2f m, want >0.6)" % moved, moved > 0.6)
				_check("the BANDIT crouch-aims — rig lowered (%.2f) + armed" % bandit._puppet.position.y,
					bandit._puppet.position.y < -0.1 and bandit._puppet.gun.visible)
				_check("the DRIFTER idles without wandering (%.2f m)" % Vector3(8, 0.3, 0).distance_to(Vector3(drifter.global_position.x, 0.3, drifter.global_position.z)),
					Vector3(8, 0, 0).distance_to(Vector3(drifter.global_position.x, 0, drifter.global_position.z)) < 0.6)
				_report()

	if phase_t > 20.0 and phase == 1:
		_report()


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _report() -> void:
	print("NACT RESULTS: %d passed, %d failed" % [passed, failed])
	print("NACT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
