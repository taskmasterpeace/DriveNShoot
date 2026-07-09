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


## THE NO-KISS-ZONE CHECK (the crouch z-fight fix's own proof): a box's WORLD AABB,
## built from its live global_transform — the puppet's real, running geometry, not
## a theoretical recompute. Reads the MeshInstance3D's BoxMesh half-extents (works
## for any box in the rig) and sweeps all 8 corners through the actual transform.
func _world_aabb(box: MeshInstance3D) -> AABB:
	var bm := box.mesh as BoxMesh
	var half: Vector3 = bm.size * 0.5
	var xform := box.global_transform
	var lo := Vector3.INF
	var hi := -Vector3.INF
	for sx in [-1.0, 1.0]:
		for sy in [-1.0, 1.0]:
			for sz in [-1.0, 1.0]:
				var corner := xform * (Vector3(sx, sy, sz) * half)
				lo = lo.min(corner)
				hi = hi.max(corner)
	return AABB(lo, hi - lo)


## The NO-KISS-ZONE criterion the owner set (coordinator-verified against the
## standing-pose proof: 0.09m of stable overlap reads FINE — interpenetration per
## se doesn't shimmer, NEAR-COPLANAR faces do). Two world AABBs on one axis (Y, the
## vertical column where the torso/hip fight lives) are SAFE if they're either
## clearly separated (> sep_eps) or deep-stable (overlap > deep_eps); the shallow
## band between is the danger zone real z-fighting lives in.
func _no_kiss_y(a: AABB, b: AABB, sep_eps: float = 0.015, deep_eps: float = 0.05) -> Dictionary:
	# signed gap on Y: positive = separated by that much; negative = overlapping by |gap|
	var a_bottom: float = a.position.y
	var a_top: float = a.position.y + a.size.y
	var b_bottom: float = b.position.y
	var b_top: float = b.position.y + b.size.y
	# overlap along Y (both boxes also need X/Z overlap to be a REAL 3D intersection;
	# we check that too so a merely-adjacent-in-Y-but-offset-sideways pair isn't flagged)
	var x_overlap: float = minf(a.position.x + a.size.x, b.position.x + b.size.x) - maxf(a.position.x, b.position.x)
	var z_overlap: float = minf(a.position.z + a.size.z, b.position.z + b.size.z) - maxf(a.position.z, b.position.z)
	var y_gap: float = a_bottom - b_top if a_bottom > b_bottom else b_bottom - a_top
	var shares_footprint: bool = x_overlap > 0.0 and z_overlap > 0.0
	var safe: bool = (not shares_footprint) or y_gap > sep_eps or y_gap < -deep_eps
	return {"safe": safe, "y_gap": y_gap, "x_overlap": x_overlap, "z_overlap": z_overlap}


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

	# --- 2b. THE NO-KISS-ZONE FIX (owner: crouch "looks crazy/horrible... blurry" —
	# the torso box was sweeping 0.51m deep into the hip boxes at full crouch, a
	# math-verified z-fight). Hold at full crouch a few more frames (the blend eases
	# in over ~0.2s) then read the REAL, live puppet transforms — no teleporting.
	for _i in 10:
		await get_tree().physics_frame
	_check("crouch blend reached near-full (%.2f)" % p.puppet._crouch, p.puppet._crouch > 0.9)
	# p.puppet is typed Node3D (either puppet drops in); cast to read the box rig.
	var pup := p.puppet as ProtoPuppet
	var torso_box: MeshInstance3D = pup.torso
	var hip_l_box: MeshInstance3D = pup._hip_l_box
	var hip_r_box: MeshInstance3D = pup._hip_r_box
	var torso_aabb := _world_aabb(torso_box)
	var hip_l_aabb := _world_aabb(hip_l_box)
	var hip_r_aabb := _world_aabb(hip_r_box)
	var vs_l := _no_kiss_y(torso_aabb, hip_l_aabb)
	var vs_r := _no_kiss_y(torso_aabb, hip_r_aabb)
	_check("full crouch: torso/hip_l stay OUT of the kiss zone (y_gap %.4f, footprint x∩%.3f z∩%.3f)"
		% [vs_l["y_gap"], vs_l["x_overlap"], vs_l["z_overlap"]], vs_l["safe"])
	_check("full crouch: torso/hip_r stay OUT of the kiss zone (y_gap %.4f, footprint x∩%.3f z∩%.3f)"
		% [vs_r["y_gap"], vs_r["x_overlap"], vs_r["z_overlap"]], vs_r["safe"])

	# --- 2c. THE SHOULDER LAW (ANIMATION_FIX_PACK §3.1, defect D1: owner "the shoulders
	# don't go down with you… don't connect"). Before the fix the arm roots were pinned
	# at the standing 1.40 while the chest dropped to ~0.94 — the shoulders floated above
	# the tucked head. Now both roots ride the LIVE chest height every frame.
	var sh_expect: float = pup.torso.position.y + pup._sh_above_chest * pup.torso.scale.y
	_check("full crouch: the GUN shoulder rides the chest (y %.3f, chest+%.3f)" %
		[pup.shoulder.position.y, pup._sh_above_chest * pup.torso.scale.y],
		absf(pup.shoulder.position.y - sh_expect) < 0.002)
	_check("full crouch: the FREE shoulder rides the chest too (y %.3f)" % pup.free_arm.position.y,
		absf(pup.free_arm.position.y - sh_expect) < 0.002)
	_check("full crouch: the shoulders actually SANK from the standing 1.40 (y %.3f < 1.20)" % pup.shoulder.position.y,
		pup.shoulder.position.y < 1.20)

	# --- 2d. THE GROUND LAW (ANIMATION_FIX_PACK §3.2, defect D2: owner "when you crouch
	# it goes through the ground"). The old code sank the whole leg tree ~0.17m, putting
	# the SOLES under the floor. Now the crouch is a fold that keeps the boots planted:
	# the lowest sole (read off the live transforms, root-local) never dips below 0.
	var stand_sole: float = pup._lowest_sole_y()
	print("CROUCH: diag full-crouch sole=%.3f legs_pivot=%.3f torso.y=%.3f" %
		[stand_sole, pup.legs_pivot.position.y, pup.torso.position.y])
	_check("full crouch: the soles stay PLANTED, not through the floor (lowest sole %.3f >= -0.02)" % stand_sole,
		stand_sole >= -0.02)

	# --- 2e. THE REAL SQUAT (ANIMATION_FIX_PACK_2 §8.3, defect D9: owner "the crouching
	# doesn't look real"). The old pose was a Z-shaped stool-sit — thighs BACK, shins
	# forward. A real squat drives the KNEES FORWARD over the toes (thighs forward, shins
	# near-vertical). Measure the knee joint ahead of the hip joint in the puppet's own
	# facing frame (forward = -Z). This is the guard against regressing to the stool-sit.
	# Measure in LEGS_PIVOT's frame (where the thigh fold is defined + where -Z is the
	# feet-walk facing) — the puppet ROOT frame misses legs_pivot's own yaw.
	var lp := pup.legs_pivot
	var hipL := lp.to_local(pup.hip_l.global_position)
	var kneeL := lp.to_local(pup.knee_l.global_position)
	var kneeR := lp.to_local(pup.knee_r.global_position)
	var hipR := lp.to_local(pup.hip_r.global_position)
	var knee_fwd_l: float = hipL.z - kneeL.z # forward = -Z → knee ahead of hip is positive
	var knee_fwd_r: float = hipR.z - kneeR.z
	print("CROUCH: diag squat knee_fwd L=%.3f R=%.3f" % [knee_fwd_l, knee_fwd_r])
	_check("full crouch: the knees travel FORWARD over the toes (L %.2fm, R %.2fm ahead of the hips, wants >=0.20)" % [knee_fwd_l, knee_fwd_r],
		knee_fwd_l >= 0.20 and knee_fwd_r >= 0.20)

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
