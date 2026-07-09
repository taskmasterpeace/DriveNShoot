## Proof for PUPPET RIG V2 PHASE 2 (docs/design/PUPPET_RIG_V2.md §3): TWO-HAND GRIPS.
## Each two-hand WEAPONS row gains a grip_l point (local to the weapon mesh); a
## closed-form 2-bone IK (one acos per arm, no solver library) plants the free hand
## ON that grip in animate() — through the LIVE aim chain, so the hold tracks the
## twin-stick yaw. Unreachable targets clamp to full extension (never NaN). One-hand
## rows are untouched, and a two-hand row WITHOUT a grip keeps the legacy posed hold.
## Run: godot --headless --path game res://proto3d/tests/grip_ik_sim.tscn
extends Node

var passed := 0
var failed := 0
var _prev_time_scale: float = 1.0
var _done := false


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GRIP_IK: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Where the grip point actually sits in the WORLD right now (read off the live
## transforms — the same math a screenshot would show, never a re-derivation).
func _grip_world(p: ProtoPuppet, grip_l: Vector3) -> Vector3:
	var local := Vector3(grip_l.x * p.handed_sign, grip_l.y, grip_l.z)
	return p.gun.global_transform * local


func _settle(p: ProtoPuppet, frames: int) -> void:
	for _i in frames:
		p.animate(1.0 / 60.0, 0.0, 0.0, true, 0.0, false)


func _foregrip_case(body_type: String, handed: String, weapon_id: String, crouched: bool) -> Dictionary:
	var pose: Dictionary = ProtoWeapon.WEAPONS[weapon_id]["hand_pose"]
	var p := ProtoPuppet.create({"body_type": body_type, "handed": handed})
	add_child(p)
	p.set_hand_pose(pose["offset"], true, pose.get("grip_l", Vector3.ZERO), pose.get("grip_r", Vector3.ZERO))
	p.set_armed(true)
	p.raised = true
	p.crouch_target = 1.0 if crouched else 0.0
	_settle(p, 150)
	var grip_l: Vector3 = pose.get("grip_l", Vector3.ZERO)
	var target := _grip_world(p, grip_l)
	var reach: float = (p._upper_len + p._fore_len) * p.scale.x
	var target_dist: float = target.distance_to(p.free_arm.global_position)
	var hand_reach: float = p.hand_l.global_position.distance_to(p.free_arm.global_position)
	var miss: float = p.hand_l.global_position.distance_to(target)
	var support_axis: Vector3 = p.elbow_l.global_position - p.free_arm.global_position
	var gun_axis: Vector3 = p.elbow_r.global_position - p.shoulder.global_position
	var axis_sep: float = rad_to_deg(support_axis.normalized().angle_to(gun_axis.normalized()))
	var anat_x: float = -p._sh_x * p.handed_sign
	var shoulder_dist: float = p.free_arm.global_position.distance_to(p.shoulder.global_position)
	var shoulder_min: float = p._sh_x * 2.0 * p.scale.x * 0.95
	var result := {
		"label": "%s/%s/%s/%s" % [body_type, handed, weapon_id, "crouch" if crouched else "stand"],
		"socket_ok": absf(p.free_arm.position.x - anat_x) < 0.004 and absf(p.free_arm.position.z) < 0.004,
		"socket_x": p.free_arm.position.x,
		"socket_z": p.free_arm.position.z,
		"anat_x": anat_x,
		"distinct_sockets": shoulder_dist >= shoulder_min,
		"elbows_down": p.elbow_l.global_position.y < p.free_arm.global_position.y - 0.02
			and p.elbow_r.global_position.y < p.shoulder.global_position.y - 0.02,
		"axis_sep": axis_sep,
		"miss": miss,
		"reachable": target_dist <= reach - 0.02,
		"hand_reach": hand_reach,
		"reach": reach,
		"elbow": p.elbow_l.rotation.x,
	}
	p.queue_free()
	return result


func _ready() -> void:
	print("GRIP_IK: start")
	_prev_time_scale = Engine.time_scale
	get_tree().create_timer(30.0, true, false, true).timeout.connect(func() -> void:
		if not _done:
			print("GRIP_IK: WATCHDOG")
			_check("WATCHDOG did not fire", false)
			_finish(1))

	# === 1. THE ROWS: two-handers carry grips, one-handers don't ==================
	var shotgun_pose: Dictionary = ProtoWeapon.WEAPONS["shotgun"]["hand_pose"]
	var pistol_pose: Dictionary = ProtoWeapon.WEAPONS["pistol"]["hand_pose"]
	_check("the shotgun row carries a grip_l fore-grip point", shotgun_pose.has("grip_l"))
	_check("the pipe rocket row carries a grip_l too",
		(ProtoWeapon.WEAPONS["pipe_rocket"]["hand_pose"] as Dictionary).has("grip_l"))
	_check("the pistol row does NOT (one hand, unchanged)", not pistol_pose.has("grip_l"))
	# ANIMATION_FIX_PACK §3.5.2 DATA GUARD (D5): EVERY two-hand GUN must carry a NONZERO
	# grip_l — a zero grip silently drops the support hand to the legacy posed hold (the
	# "both arms grow from one shoulder" look the owner flagged). Melee two-handers
	# (bat/axe) carry low with no fore-grip, so they're exempt.
	for wid in ProtoWeapon.WEAPONS:
		var w: Dictionary = ProtoWeapon.WEAPONS[wid]
		var hp: Dictionary = w.get("hand_pose", {})
		var is_gun: bool = int(w.get("behavior", -1)) in [
			int(ProtoWeapon.Behavior.HITSCAN), int(ProtoWeapon.Behavior.HITSCAN_MULTI), int(ProtoWeapon.Behavior.PROJECTILE)]
		if is_gun and bool(hp.get("two_handed", false)):
			var g: Vector3 = hp.get("grip_l", Vector3.ZERO)
			_check("two-hand gun '%s' carries a NONZERO grip_l %s (no silent one-shoulder hold)" % [wid, g],
				not g.is_zero_approx())
	for wid2 in ["bat", "axe"]:
		var hp2: Dictionary = (ProtoWeapon.WEAPONS[wid2] as Dictionary).get("hand_pose", {})
		var g2: Vector3 = hp2.get("grip_l", Vector3.ZERO)
		_check("two-hand melee '%s' carries a handle grip_l %s" % [wid2, g2],
			bool(hp2.get("two_handed", false)) and hp2.has("grip_l") and not g2.is_zero_approx() and g2.z < -0.05)

	var p := ProtoPuppet.create({})
	add_child(p)
	await get_tree().process_frame

	# === 2. THE HOLD: the free hand lands ON the shotgun's fore-grip ==============
	var grip_l: Vector3 = shotgun_pose.get("grip_l", Vector3.ZERO)
	p.set_hand_pose(shotgun_pose["offset"], true, grip_l, shotgun_pose.get("grip_r", Vector3.ZERO))
	p.set_armed(true)
	p.raised = true
	_settle(p, 120)
	await get_tree().process_frame
	var target := _grip_world(p, grip_l)
	var miss := p.hand_l.global_position.distance_to(target)
	_check("the free hand PLANTS on the fore-grip (%.3fm off, wants <0.05)" % miss, miss < 0.05)
	_check("the hold is a BENT-elbow hold, not a straight-arm reach (elbow %.2f rad)" % p.elbow_l.rotation.x,
		absf(p.elbow_l.rotation.x) > 0.3)

	# === 3. THE HOLD TRACKS THE AIM: yaw the twin-stick, the hand stays planted ===
	# (yaw TOWARD the support side — the far side legitimately runs out of arm and
	# clamps, which section 4 proves separately)
	p.aim_arm.rotation.y = -0.5
	_settle(p, 120)
	await get_tree().process_frame
	var target_yawed := _grip_world(p, grip_l)
	var miss_yawed := p.hand_l.global_position.distance_to(target_yawed)
	_check("aim yaw moved the gun (%.2fm)" % target_yawed.distance_to(target),
		target_yawed.distance_to(target) > 0.1)
	_check("...and the free hand FOLLOWED, still planted (%.3fm off)" % miss_yawed, miss_yawed < 0.06)
	p.aim_arm.rotation.y = 0.0

	# === 4. UNREACHABLE CLAMPS at full extension — never NaN, never a stretch =====
	p.set_hand_pose(shotgun_pose["offset"], true, Vector3(0, 0, -3.0), Vector3.ZERO)
	_settle(p, 120)
	await get_tree().process_frame
	var reach := p.hand_l.global_position.distance_to(p.free_arm.global_position)
	var sane := not (is_nan(p.free_arm.rotation.x) or is_nan(p.elbow_l.rotation.x)
		or is_nan(p.hand_l.global_position.x))
	_check("a grip beyond reach clamps SANE (no NaN anywhere)", sane)
	_check("the arm is at full extension, not past it (%.3fm of the 0.6m limb)" % reach,
		reach > 0.55 and reach < 0.63)
	_check("a clamped arm is a STRAIGHT arm (elbow %.3f rad ~ 0)" % p.elbow_l.rotation.x,
		absf(p.elbow_l.rotation.x) < 0.1)

	# === 5. ONE-HAND ROWS UNCHANGED + the grip-less two-hander keeps the legacy pose
	p.set_hand_pose(pistol_pose["offset"], false)
	_settle(p, 90)
	_check("a one-hand row returns the free arm home (x=%.2f)" % p.free_arm.position.x,
		is_equal_approx(p.free_arm.position.x, -p._sh_x))
	_check("one-hand: the free arm swings free again (no IK residue on yaw/roll: %.3f/%.3f)" %
		[p.free_arm.rotation.y, p.free_arm.rotation.z],
		absf(p.free_arm.rotation.y) < 0.15 and absf(p.free_arm.rotation.z) < 0.15)
	p.set_hand_pose(shotgun_pose["offset"], true) # 2-arg legacy call — no grip handed over
	_settle(p, 120)
	# SIGN LAW (022a3d1): the posed fore-grip RAISES the free arm FORWARD (+, toward -Z)
	# and closes the elbow — puppet.gd:560-561 lerp to 1.05 / 0.42. (This check was left
	# on the pre-sign-law negative values when the mannequin rig landed — fixed here.)
	_check("a two-hander WITHOUT a grip still takes the legacy posed hold (arm %.2f, elbow %.2f)" %
		[p.free_arm.rotation.x, p.elbow_l.rotation.x],
		p.free_arm.rotation.x > 0.9 and absf(p.elbow_l.rotation.x - 0.42) < 0.12)

	# === 6. grip_r: the gun can sit IN the hand by its own grip point ==============
	var grip_r: Vector3 = shotgun_pose.get("grip_r", Vector3.ZERO)
	p.set_hand_pose(shotgun_pose["offset"], true, grip_l, grip_r)
	_check("grip_r seats the gun in the palm (gun.position = -grip_r, got %s)" % p.gun.position,
		p.gun.position.is_equal_approx(Vector3(-grip_r.x * p.handed_sign, -grip_r.y, -grip_r.z)))
	var muzzle := p.muzzle_world()
	_check("muzzle_world still reads off the (re-seated) gun barrel", muzzle.is_finite())

	# === 7. LEFT-HANDED MIRROR: the whole solve survives handed_sign = -1 =========
	var lefty := ProtoPuppet.create({"handed": "left"})
	add_child(lefty)
	await get_tree().process_frame
	lefty.set_hand_pose(shotgun_pose["offset"], true, grip_l, grip_r)
	lefty.set_armed(true)
	lefty.raised = true
	_settle(lefty, 120)
	await get_tree().process_frame
	var l_target := _grip_world(lefty, grip_l)
	var l_miss := lefty.hand_l.global_position.distance_to(l_target)
	_check("a LEFT-handed puppet plants its free (right) hand on the grip too (%.3fm off)" % l_miss,
		l_miss < 0.06)

	# === 8. MATRIX: grip holds never steal the support shoulder socket ============
	# This is the owner's actual regression: a two-hand hold may blade the chest and
	# solve the arm, but the free arm must still grow from its own shoulder on every
	# body profile and handedness. Small bodies may honestly clamp if a long gun is
	# out of reach; they may not detach the shoulder to fake the reach.
	var body_types: Array[String] = ["adult", "woman", "teen", "kid", "stocky"]
	for body_type in body_types:
		for handed in ["right", "left"]:
			for weapon_id in ["shotgun", "pipe_rocket"]:
				for crouched in [false, true]:
					var c := _foregrip_case(body_type, handed, weapon_id, crouched)
					_check("%s support shoulder stays on its anatomical socket (x %.3f ~= %.3f, z %.3f)" %
						[c["label"], c["socket_x"], c["anat_x"], c["socket_z"]], bool(c["socket_ok"]))
					_check("%s keeps two distinct shoulder sockets" % c["label"], bool(c["distinct_sockets"]))
					_check("%s upper arms separate instead of stacking (%.0f deg)" %
						[c["label"], c["axis_sep"]], float(c["axis_sep"]) >= 25.0)
					_check("%s elbows hang below their shoulder roots" % c["label"], bool(c["elbows_down"]))
					if bool(c["reachable"]):
						_check("%s reachable foregrip plants the hand (%.3fm off)" %
							[c["label"], c["miss"]], float(c["miss"]) < 0.05 and absf(float(c["elbow"])) > 0.25)
					else:
						_check("%s unreachable foregrip clamps without stretching (hand %.3fm / reach %.3fm)" %
							[c["label"], c["hand_reach"], c["reach"]], float(c["hand_reach"]) <= float(c["reach"]) + 0.015)

	print("GRIP_IK RESULTS: %d passed, %d failed" % [passed, failed])
	_finish(0 if failed == 0 else 1)


func _finish(code: int) -> void:
	if _done:
		return
	_done = true
	Engine.time_scale = _prev_time_scale
	print("GRIP_IK: %s" % ("ALL CHECKS PASSED" if failed == 0 and code == 0 else "FAILURES PRESENT"))
	get_tree().quit(code)
