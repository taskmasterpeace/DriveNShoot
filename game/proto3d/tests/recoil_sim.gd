## Proof for PUPPET RIG V2 PHASE 3 (docs/design/PUPPET_RIG_V2.md §4): RECOIL AS DATA.
## A `recoil` block per WEAPONS row (kick_pitch / torso_jolt / stagger_threshold),
## applied as an ADDITIVE spring-damper layer (v += (-k·x - c·v)·dt; x += v·dt —
## constants are MOTION rows, MotionForge-tunable) scaled by the character:
## kick × (1 − strength_level × strength_eat). A weak character gets thrown — past
## the stagger threshold the WHOLE TORSO rocks; a strong one eats it with the arm.
## Stacks with walking (additive layer), settles ≤ 250 ms (the contract's number).
## Run: godot --headless --path game res://proto3d/tests/recoil_sim.tscn
extends Node

var passed := 0
var failed := 0
var _prev_time_scale: float = 1.0
var _done := false


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RECOIL: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Fire one kick and return the PEAK shoulder deviation over the next ~0.2s of
## real animate() frames — the displacement a player would actually see.
func _peak_kick(p: ProtoPuppet, row: Dictionary, strength: int, speed: float = 0.0) -> float:
	for _i in 30: # settle to the hold first
		p.animate(1.0 / 60.0, speed, 0.0, true, 0.0, false)
	var rest: float = p.shoulder.rotation.x
	p.recoil_kick(row, strength)
	var peak := 0.0
	for _i in 12:
		p.animate(1.0 / 60.0, speed, 0.0, true, 0.0, false)
		peak = maxf(peak, p.shoulder.rotation.x - rest)
	return peak


func _ready() -> void:
	print("RECOIL: start")
	_prev_time_scale = Engine.time_scale
	get_tree().create_timer(30.0, true, false, true).timeout.connect(func() -> void:
		if not _done:
			print("RECOIL: WATCHDOG")
			_check("WATCHDOG did not fire", false)
			_finish(1))

	# === 1. THE ROWS EXIST: spring constants in MOTION, kick blocks per weapon ====
	_check("the spring constants are a MOTION row (recoil: k/c/strength_eat — MotionForge-tunable)",
		ProtoPuppet.MOTION.has("recoil")
		and (ProtoPuppet.MOTION["recoil"] as Dictionary).has("k")
		and (ProtoPuppet.MOTION["recoil"] as Dictionary).has("c")
		and (ProtoPuppet.MOTION["recoil"] as Dictionary).has("strength_eat"))
	var shotgun_recoil: Dictionary = (ProtoWeapon.WEAPONS["shotgun"] as Dictionary).get("recoil", {})
	var pistol_recoil: Dictionary = (ProtoWeapon.WEAPONS["pistol"] as Dictionary).get("recoil", {})
	_check("the shotgun row carries a recoil block (kick_pitch/torso_jolt/stagger_threshold)",
		shotgun_recoil.has("kick_pitch") and shotgun_recoil.has("torso_jolt")
		and shotgun_recoil.has("stagger_threshold"))
	_check("the pistol row carries one too (small, but DATA — never an if)",
		pistol_recoil.has("kick_pitch"))

	# === 2. STRENGTH EATS RECOIL: the contract's displacement-ratio assertion =====
	var weak := ProtoPuppet.create({})
	add_child(weak)
	weak.set_armed(true)
	weak.raised = true
	var strong := ProtoPuppet.create({})
	add_child(strong)
	strong.set_armed(true)
	strong.raised = true
	var weak_peak := _peak_kick(weak, shotgun_recoil, 0)
	var strong_peak := _peak_kick(strong, shotgun_recoil, 8)
	_check("a shotgun kick READS on a weak character (peak %.3f rad > 0.2)" % weak_peak, weak_peak > 0.2)
	var ratio := weak_peak / maxf(strong_peak, 0.0001)
	_check("strength 0 vs 8 displacement ratio ~1/(1-8x0.06)=1.92 (got %.2f, band 1.6-2.3)" % ratio,
		ratio > 1.6 and ratio < 2.3)

	# === 3. THE STAGGER THRESHOLD: the weak get ROCKED, the strong eat it =========
	weak.recoil_kick(shotgun_recoil, 0)
	_check("a weak character's shotgun blast crosses the threshold — the TORSO rocks (%.3f)" % weak._recoil_torso_x,
		absf(weak._recoil_torso_x) > 0.05)
	for _i in 60:
		weak.animate(1.0 / 60.0, 0.0, 0.0, true, 0.0, false)
	strong.recoil_kick(shotgun_recoil, 8)
	_check("a strong character stays UNDER it — arm only, torso still (%.3f)" % strong._recoil_torso_x,
		absf(strong._recoil_torso_x) < 0.001)
	weak.recoil_kick(pistol_recoil, 0)
	_check("a pistol never staggers even the weakest (%.3f)" % weak._recoil_torso_x,
		absf(weak._recoil_torso_x) < 0.05)

	# === 4. SETTLES <= 250ms (the contract's acceptance number) ===================
	var s2 := ProtoPuppet.create({})
	add_child(s2)
	s2.set_armed(true)
	s2.raised = true
	for _i in 30:
		s2.animate(1.0 / 60.0, 0.0, 0.0, true, 0.0, false)
	s2.recoil_kick(shotgun_recoil, 0)
	for _i in 15: # 15 frames at 60fps = exactly 250ms
		s2.animate(1.0 / 60.0, 0.0, 0.0, true, 0.0, false)
	_check("the spring settles within 250ms (residual %.4f rad < 0.03)" % absf(s2._recoil_arm_x),
		absf(s2._recoil_arm_x) < 0.03)

	# === 5. STACKS WITH WALKING: an additive layer, not an ownership fight ========
	var walker := ProtoPuppet.create({})
	add_child(walker)
	walker.set_armed(true)
	walker.raised = true
	var walk_peak := _peak_kick(walker, shotgun_recoil, 0, 5.0)
	_check("the kick still reads mid-stride (peak %.3f rad)" % walk_peak, walk_peak > 0.2)
	var hip_amp := 0.0
	for _i in 60:
		walker.animate(1.0 / 60.0, 5.0, 0.0, true, 0.0, false)
		hip_amp = maxf(hip_amp, absf(walker.hip_l.rotation.x))
	_check("...and the stride never stopped underneath it (hip amp %.2f rad)" % hip_amp, hip_amp > 0.2)

	# === 6. BACK-COMPAT: the old recoil() door still kicks (companions use it) ====
	var legacy := ProtoPuppet.create({})
	add_child(legacy)
	legacy.set_armed(true)
	legacy.raised = true
	for _i in 30:
		legacy.animate(1.0 / 60.0, 0.0, 0.0, true, 0.0, false)
	var rest: float = legacy.shoulder.rotation.x
	legacy.recoil()
	var kick := 0.0
	for _i in 12:
		legacy.animate(1.0 / 60.0, 0.0, 0.0, true, 0.0, false)
		kick = maxf(kick, legacy.shoulder.rotation.x - rest)
	_check("the parameterless recoil() still kicks the arm up (Δ %.3f > 0.1)" % kick, kick > 0.1)

	# === 7. THE DEV TOOL: the motion stage previews the kick (F / SHIFT+F) ========
	# A tuner on the treadmill fires the HELD row's kick at strength 0 (F) or 8
	# (SHIFT+F) and watches the weak/strong contrast live — real key events.
	var packed: PackedScene = load("res://proto3d/tools/motion_stage.tscn")
	var stage: Node3D = packed.instantiate()
	add_child(stage)
	await get_tree().process_frame
	await get_tree().process_frame
	stage._set_item(2) # the shotgun row — the kick with the story
	var ev := InputEventKey.new()
	ev.keycode = KEY_F
	ev.pressed = true
	stage._input(ev)
	await get_tree().process_frame
	var weak_stage_kick: float = stage.puppet._recoil_arm_x
	_check("F on the stage fires the HELD row's kick at strength 0 (%.2f rad)" % weak_stage_kick,
		weak_stage_kick > 0.3)
	for _i in 90:
		stage.puppet.animate(1.0 / 60.0, 0.0, 0.0, true, 0.0, false)
	var ev2 := InputEventKey.new()
	ev2.keycode = KEY_F
	ev2.pressed = true
	ev2.shift_pressed = true
	stage._input(ev2)
	await get_tree().process_frame
	var strong_stage_kick: float = stage.puppet._recoil_arm_x
	_check("SHIFT+F fires it at strength 8 — visibly smaller (%.2f < %.2f x 0.65)" %
		[strong_stage_kick, weak_stage_kick],
		strong_stage_kick > 0.0 and strong_stage_kick < weak_stage_kick * 0.65)

	print("RECOIL RESULTS: %d passed, %d failed" % [passed, failed])
	_finish(0 if failed == 0 else 1)


func _finish(code: int) -> void:
	if _done:
		return
	_done = true
	Engine.time_scale = _prev_time_scale
	print("RECOIL: %s" % ("ALL CHECKS PASSED" if failed == 0 and code == 0 else "FAILURES PRESENT"))
	get_tree().quit(code)
