## Proof for WALK & RUN TO THE REFERENCE STRIP (docs/design/ANIMATION_FIX_PACK.md §3.3,
## §4.2). The owner's gripe: "running doesn't look good — look at it from the side."
## Root cause was FOOT-SKATE — the old fixed cadence let the feet cover only ~1.8m/s of
## a 4.2m/s walk (a 2.3x moonwalk). This sim drives the puppet at real speeds and MEASURES
## the mesh: over one stride cycle a foot's ground travel must match the body's (skate
## ratio), the pelvis must BOUNCE (whole-body bob), and at sprint the run form must read —
## deep lean, ~90deg pumping elbows, high knee — while a creep must NOT (no sprint arms
## while walking). Numbers off the LIVE transforms, never internal assumptions.
## Run: godot --headless --path game res://proto3d/tests/run_form_sim.tscn
extends Node

var passed := 0
var failed := 0
var _prev_time_scale: float = 1.0
var _done := false


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("RUN_FORM: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Drive the puppet at a fixed speed and measure ONE full stride cycle off the live rig.
func _measure(p: ProtoPuppet, v: float) -> Dictionary:
	var dt := 1.0 / 60.0
	for _i in 150: # settle the phase + smoothed poses
		p.animate(dt, v, 0.0, false, 0.0, false)
	var phase0: float = p._phase
	var t := 0.0
	var fz_min := 1.0e9
	var fz_max := -1.0e9
	var bob_min := 1.0e9
	var bob_max := -1.0e9
	var el_min := 1.0e9
	var el_max := -1.0e9
	var torso_x := -1.0e9
	var foot_x_max := -1.0e9
	var knee_min := 1.0e9 # most-flexed (most negative) knee this cycle — THE KNEE LAW
	var knee_max := -1.0e9
	var guard := 0
	while p._phase - phase0 < TAU and guard < 3000:
		p.animate(dt, v, 0.0, false, 0.0, false)
		t += dt
		guard += 1
		var fz: float = p.foot_l.global_position.z - p.global_position.z # the swing foot's ground travel
		fz_min = minf(fz_min, fz)
		fz_max = maxf(fz_max, fz)
		bob_min = minf(bob_min, p.legs_pivot.position.y)
		bob_max = maxf(bob_max, p.legs_pivot.position.y)
		el_min = minf(el_min, p.elbow_l.rotation.x)
		el_max = maxf(el_max, p.elbow_l.rotation.x)
		torso_x = maxf(torso_x, p.torso.rotation.x)
		foot_x_max = maxf(foot_x_max, p.foot_l.rotation.x)
		knee_min = minf(knee_min, p.knee_l.rotation.x)
		knee_max = maxf(knee_max, p.knee_l.rotation.x)
	var step: float = fz_max - fz_min # one foot's per-cycle ground travel = one step length
	# A full cycle = TWO steps (left + right); the body must cover exactly that. skate = the
	# fractional mismatch (0 = feet perfectly match the ground, 1 = full moonwalk).
	var body_travel: float = v * t
	var skate: float = absf(body_travel - 2.0 * step) / maxf(0.01, body_travel)
	return {
		"skate": skate, "step": step, "body": body_travel,
		"bob": bob_max - bob_min, "el_min": el_min, "el_max": el_max,
		"torso_x": torso_x, "foot_x": foot_x_max, "knee_min": knee_min, "knee_max": knee_max,
	}


func _ready() -> void:
	print("RUN_FORM: start")
	_prev_time_scale = Engine.time_scale
	get_tree().create_timer(30.0, true, false, true).timeout.connect(func() -> void:
		if not _done:
			print("RUN_FORM: WATCHDOG")
			_check("WATCHDOG did not fire", false)
			_finish(1))

	var p := ProtoPuppet.create({})
	add_child(p)
	await get_tree().process_frame

	# === 1. ANTI-SKATE at every speed — the feet match the ground (D3) ============
	for v in [1.5, 4.2, 7.2]:
		var m := _measure(p, float(v))
		print("RUN_FORM: diag v=%.1f skate=%.3f step=%.3f body=%.3f bob=%.3f elbow=[%.2f,%.2f] torsoX=%.2f footX=%.2f" %
			[v, m["skate"], m["step"], m["body"], m["bob"], m["el_min"], m["el_max"], m["torso_x"], m["foot_x"]])
		_check("v=%.1f: the feet MATCH the ground, no moonwalk (skate %.3f <= 0.25)" % [v, m["skate"]],
			float(m["skate"]) <= 0.25)
		_check("v=%.1f: the whole body BOUNCES (pelvis bob %.3f > 0.01)" % [v, m["bob"]],
			float(m["bob"]) > 0.01)

	# === 2. SPRINT FORM reads like the reference strip's RUN panel ================
	var run := _measure(p, 7.2)
	_check("sprint: the elbows LOCK to ~90deg — pumping arms (elbow %.2f in [1.3,1.7])" % float(run["el_max"]),
		float(run["el_min"]) > 1.3 and float(run["el_max"]) < 1.7)
	_check("sprint: the trunk DRIVES forward — the run lean (torso.x %.2f >= 0.15)" % float(run["torso_x"]),
		float(run["torso_x"]) >= 0.15)
	# THE KNEE LAW (ANIMATION_FIX_PACK_2 §8.1): the swing knee flexes BACK (negative — the
	# shin folds UNDER the thigh, heel toward the butt), never forward (the bird leg).
	_check("sprint: the swing knee folds BACK deep (min %.2f <= -0.9)" % float(run["knee_min"]),
		float(run["knee_min"]) <= -0.9)
	_check("sprint: the knee NEVER hinges forward (max %.3f <= 0.001)" % float(run["knee_max"]),
		float(run["knee_max"]) <= 0.001)
	_check("sprint: the trail foot PUSHES OFF — heel-up plantarflex (foot.x %.2f > 0.2)" % float(run["foot_x"]),
		float(run["foot_x"]) > 0.2)

	# === 3. A CREEP is NOT a sprint — no locked arms while walking slowly =========
	var walk := _measure(p, 1.5)
	_check("creep: the elbows stay RELAXED, not sprint-locked (elbow %.2f <= 0.6)" % float(walk["el_max"]),
		float(walk["el_max"]) <= 0.6)
	_check("creep: no false run lean (torso.x %.2f < 0.12)" % float(walk["torso_x"]),
		float(walk["torso_x"]) < 0.12)

	# === 4. IDLE is STILL — no stride drift when stopped =========================
	var still := _measure(p, 0.0)
	_check("idle: the feet don't drift (step %.3f < 0.05)" % float(still["step"]),
		float(still["step"]) < 0.05)

	print("RUN_FORM RESULTS: %d passed, %d failed" % [passed, failed])
	_finish(0 if failed == 0 else 1)


func _finish(code: int) -> void:
	if _done:
		return
	_done = true
	Engine.time_scale = _prev_time_scale
	print("RUN_FORM: %s" % ("ALL CHECKS PASSED" if failed == 0 and code == 0 else "FAILURES PRESENT"))
	get_tree().quit(code)
