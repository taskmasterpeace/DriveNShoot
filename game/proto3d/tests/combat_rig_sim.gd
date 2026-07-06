## Proof for Rung 6: the rig makes combat READ. A shot kicks the aim arm up, a hit
## ROCKS the body back (biped flinch), and a struck animal JOLTS (quadruped flinch) —
## the fight lands on the body, not just a number. Death already flops the player rig.
## Run: godot --headless --path game res://proto3d/tests/combat_rig_sim.tscn
extends Node3D

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CRIG: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _peak(node: Node, sample: Callable, impulse: Callable, frames: int) -> float:
	impulse.call()
	var peak := 0.0
	for _i in frames:
		if node.has_method("animate"):
			pass
		peak = maxf(peak, absf(sample.call()))
	return peak


func _ready() -> void:
	print("CRIG: start")

	# --- BIPED: a shot kicks the aim arm up (recoil) -------------------------
	var p := ProtoPuppet.create({})
	add_child(p)
	p.set_armed(true)
	# settle
	for _i in 20:
		p.animate(1.0 / 60.0, 0.0, 0.0, true, 0.0, false)
	var rest_arm: float = p.aim_arm.rotation.x
	p.recoil()
	var kick := 0.0
	for _i in 12:
		p.animate(1.0 / 60.0, 0.0, 0.0, true, 0.0, false)
		kick = minf(kick, p.aim_arm.rotation.x - rest_arm) # recoil pushes it NEGATIVE (up)
	_check("a shot KICKS the aim arm up (Δ %.3f, want <-0.1)" % kick, kick < -0.1)

	# --- BIPED: a hit rocks the body back (flinch) ---------------------------
	var f := ProtoPuppet.create({})
	add_child(f)
	for _i in 10:
		f.animate(1.0 / 60.0, 0.0, 0.0, false, 0.0, false)
	var rest_torso: float = f.torso.rotation.x
	f.flinch(Vector3(0, 0, -1)) # hit from the front
	var rock := 0.0
	for _i in 12:
		f.animate(1.0 / 60.0, 0.0, 0.0, false, 0.0, false)
		rock = maxf(rock, f.torso.rotation.x - rest_torso)
	_check("a HIT rocks the body back (torso Δ %.3f, want >0.2)" % rock, rock > 0.2)
	# ...and it settles back (a jolt, not a pose).
	for _i in 40:
		f.animate(1.0 / 60.0, 0.0, 0.0, false, 0.0, false)
	_check("the flinch SETTLES (torso back to %.3f)" % f.torso.rotation.x, absf(f.torso.rotation.x - rest_torso) < 0.05)

	# --- BIPED: death flops the rig ------------------------------------------
	var corpse := ProtoPuppet.create({})
	add_child(corpse)
	for _i in 60:
		corpse.animate(1.0 / 60.0, 0.0, 0.0, false, 0.0, true)
	_check("DEATH flops the rig (torso %.2f, want <-0.5)" % corpse.torso.rotation.x, corpse.torso.rotation.x < -0.5)

	# --- QUADRUPED: a hit jolts the animal -----------------------------------
	var q := ProtoQuadruped.create({})
	add_child(q)
	for _i in 10:
		q.animate(1.0 / 60.0, 0.0, 0.7)
	var rest_body: float = q.body.position.y
	q.flinch()
	var hop := 0.0
	for _i in 12:
		q.animate(1.0 / 60.0, 0.0, 0.7)
		hop = maxf(hop, q.body.position.y - rest_body)
	_check("a struck animal JOLTS (body up Δ %.3f, want >0.05)" % hop, hop > 0.05)

	# --- The real dog flinches when shot -------------------------------------
	var dog := ProtoDog.create(ProtoDog.DogType.HUNTER, "Fang", "Shepherd")
	add_child(dog)
	dog.global_position = Vector3.ZERO
	dog.take_damage(5.0)
	_check("ProtoDog.take_damage jolts its rig", dog._quad != null and dog._quad._flinch > 0.5)

	print("CRIG RESULTS: %d passed, %d failed" % [passed, failed])
	print("CRIG: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
