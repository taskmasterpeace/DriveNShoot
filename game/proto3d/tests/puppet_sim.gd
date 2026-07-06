## Proof for THE PROCEDURAL PUPPET (Rung 1): one box rig driven by sin() off state.
## Builds puppets, feeds them STATE (speed/aim/turn/hurt/dead), and asserts the pose
## READS the state — legs stride, arms swing, it breathes idle, leans into turns, a
## limp drags one leg, a blind eye goes dark, death flops it — plus the player wears it.
## Run: godot --headless --path game res://proto3d/tests/puppet_sim.tscn
extends Node3D

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("PUP: %s - %s" % ["PASS" if ok else "FAIL", check_name])


## Run animate for `frames` at 60 Hz with fixed state; return the [min,max] range of
## the sampled property so we can measure amplitude deterministically.
func _sweep(p: ProtoPuppet, frames: int, speed: float, turn: float, armed: bool, hurt: float, dead: bool, sample: Callable) -> Array:
	var lo := 1.0e9
	var hi := -1.0e9
	for _i in frames:
		p.animate(1.0 / 60.0, speed, turn, armed, hurt, dead)
		var v: float = sample.call()
		lo = minf(lo, v)
		hi = maxf(hi, v)
	return [lo, hi]


func _ready() -> void:
	print("PUP: start")

	# --- Build ---------------------------------------------------------------
	var p := ProtoPuppet.create({})
	add_child(p)
	_check("the rig builds all parts (torso/head/legs/arms/gun)",
		p.torso != null and p.head != null and p.hip_l != null and p.hip_r != null
		and p.free_arm != null and p.aim_arm != null and p.gun != null)

	# --- Legs STRIDE with speed, and ALTERNATE -------------------------------
	var walk_l := _sweep(p, 120, 6.0, 0.0, false, 0.0, false, func(): return p.hip_l.rotation.x)
	var walk_range: float = walk_l[1] - walk_l[0]
	_check("legs STRIDE when moving (hip sweep %.2f rad, want >0.4)" % walk_range, walk_range > 0.4)
	# At the same phase the two legs are opposite (alternating gait).
	p.animate(1.0 / 60.0, 6.0, 0.0, false, 0.0, false)
	_check("legs ALTERNATE (L %.2f vs R %.2f, opposite signs)" % [p.hip_l.rotation.x, p.hip_r.rotation.x],
		signf(p.hip_l.rotation.x) != signf(p.hip_r.rotation.x) or absf(p.hip_l.rotation.x - p.hip_r.rotation.x) > 0.3)

	# --- Faster = bigger stride ---------------------------------------------
	var slow := _sweep(p, 120, 1.5, 0.0, false, 0.0, false, func(): return p.hip_l.rotation.x)
	var fast := _sweep(p, 120, 7.0, 0.0, false, 0.0, false, func(): return p.hip_l.rotation.x)
	_check("stride SCALES with speed (fast %.2f > slow %.2f)" % [fast[1] - fast[0], slow[1] - slow[0]],
		(fast[1] - fast[0]) > (slow[1] - slow[0]))

	# --- The free arm SWINGS while walking -----------------------------------
	var arm := _sweep(p, 120, 6.0, 0.0, false, 0.0, false, func(): return p.free_arm.rotation.x)
	_check("the free arm SWINGS (%.2f rad, want >0.3)" % (arm[1] - arm[0]), (arm[1] - arm[0]) > 0.3)

	# --- Idle BREATHING (torso rises/falls when standing still) --------------
	var breath := _sweep(p, 200, 0.0, 0.0, false, 0.0, false, func(): return p.torso.position.y)
	_check("it BREATHES when idle (torso bob %.3f, want >0.02)" % (breath[1] - breath[0]), (breath[1] - breath[0]) > 0.02)
	# ...and legs are basically still when idle.
	var idle_legs := _sweep(p, 120, 0.0, 0.0, false, 0.0, false, func(): return p.hip_l.rotation.x)
	_check("legs REST when idle (sweep %.3f, want <0.1)" % (idle_legs[1] - idle_legs[0]), (idle_legs[1] - idle_legs[0]) < 0.1)

	# --- ARMED holds the aim arm level; UNARMED it swings --------------------
	p.set_armed(true)
	var armed_arm := _sweep(p, 120, 6.0, 0.0, true, 0.0, false, func(): return p.aim_arm.rotation.x)
	p.set_armed(false)
	var free_aim := _sweep(p, 120, 6.0, 0.0, false, 0.0, false, func(): return p.aim_arm.rotation.x)
	_check("ARMED = gun arm steady, UNARMED = it swings (armed %.2f < unarmed %.2f)" % [armed_arm[1] - armed_arm[0], free_aim[1] - free_aim[0]],
		(armed_arm[1] - armed_arm[0]) < (free_aim[1] - free_aim[0]) and (armed_arm[1] - armed_arm[0]) < 0.15)

	# --- LEAN into turns -----------------------------------------------------
	var straight := ProtoPuppet.create({})
	add_child(straight)
	for _i in 40:
		straight.animate(1.0 / 60.0, 5.0, 0.0, false, 0.0, false)
	var lean0: float = straight.torso.rotation.z
	for _i in 40:
		straight.animate(1.0 / 60.0, 5.0, 2.5, false, 0.0, false) # hard turn
	_check("it LEANS into a turn (z %.3f → %.3f)" % [lean0, straight.torso.rotation.z], absf(straight.torso.rotation.z) > 0.08)

	# --- A LIMP drags one leg ------------------------------------------------
	var gimp := ProtoPuppet.create({"limp": "r"})
	add_child(gimp)
	var lg := _sweep(gimp, 120, 6.0, 0.0, false, 0.0, false, func(): return gimp.hip_l.rotation.x)
	var rg := _sweep(gimp, 120, 6.0, 0.0, false, 0.0, false, func(): return gimp.hip_r.rotation.x)
	_check("a LIMP shortens the bad leg (good %.2f > bad %.2f)" % [lg[1] - lg[0], rg[1] - rg[0]], (lg[1] - lg[0]) > (rg[1] - rg[0]) * 1.5)

	# --- A BLIND eye goes dark ----------------------------------------------
	var patched := ProtoPuppet.create({"blind_eye": "l"})
	add_child(patched)
	var dark := 0
	for c in patched.neck.get_children():
		if c is MeshInstance3D and (c as MeshInstance3D).material_override:
			var col: Color = ((c as MeshInstance3D).material_override as StandardMaterial3D).albedo_color
			if col.r < 0.2 and col.g < 0.2:
				dark += 1
	_check("a BLIND eye renders dark — and ONLY one (%d dark, no phantom black hat)" % dark, dark == 1)

	# --- DEATH flops the body ------------------------------------------------
	var corpse := ProtoPuppet.create({})
	add_child(corpse)
	for _i in 60:
		corpse.animate(1.0 / 60.0, 0.0, 0.0, false, 0.0, true)
	_check("DEATH flops the torso back+down (pitch %.2f, want <-0.5)" % corpse.torso.rotation.x, corpse.torso.rotation.x < -0.5)

	# --- Left-handed MIRRORS the gun hand ------------------------------------
	var righty := ProtoPuppet.create({"handed": "right"})
	var lefty := ProtoPuppet.create({"handed": "left"})
	add_child(righty)
	add_child(lefty)
	_check("handedness MIRRORS the hand (R x %.2f vs L x %.2f)" % [righty.hand.position.x, lefty.hand.position.x],
		signf(righty.hand.position.x) != signf(lefty.hand.position.x))

	# --- Rung 2: weapons carry their own HAND POSE ---------------------------
	var poser := ProtoPuppet.create({})
	add_child(poser)
	poser.set_hand_pose(ProtoWeapon.WEAPONS["pistol"]["hand_pose"]["offset"], false)
	var pistol_hand: Vector3 = poser.hand.position
	var pistol_freearm: float = poser.free_arm.position.x
	poser.set_hand_pose(ProtoWeapon.WEAPONS["shotgun"]["hand_pose"]["offset"], true)
	var shotgun_hand: Vector3 = poser.hand.position
	var shotgun_freearm: float = poser.free_arm.position.x
	poser.set_hand_pose(ProtoWeapon.WEAPONS["pipe_rocket"]["hand_pose"]["offset"], true)
	var rocket_hand: Vector3 = poser.hand.position
	_check("each weapon poses the hand DIFFERENTLY (pistol %.2f / shotgun %.2f / rocket %.2f y)" % [pistol_hand.y, shotgun_hand.y, rocket_hand.y],
		pistol_hand != shotgun_hand and shotgun_hand != rocket_hand and rocket_hand.y > shotgun_hand.y and shotgun_hand.y > pistol_hand.y)
	_check("a two-handed longarm brings the free hand ACROSS (1-hand x %.2f → 2-hand x %.2f)" % [pistol_freearm, shotgun_freearm],
		signf(pistol_freearm) != signf(shotgun_freearm) or absf(shotgun_freearm) < absf(pistol_freearm))

	# --- Rung 2: 50 survivors from ROWS (look = data) ------------------------
	var scav := ProtoPuppet.create(ProtoPuppet.look("scav"))
	var raider := ProtoPuppet.create(ProtoPuppet.look("raider"))
	var oldtimer := ProtoPuppet.create(ProtoPuppet.look("old_timer"))
	add_child(scav)
	add_child(raider)
	add_child(oldtimer)
	_check("a SURVIVOR row changes the body (scav has a backpack, raider is bigger)",
		scav._pack != null and raider.appearance["torso"].x > scav.appearance["torso"].x)
	_check("the old-timer row carries a LIMP straight into the gait", oldtimer.appearance["limp"] == "l")

	# --- The PLAYER wears the puppet -----------------------------------------
	var player := ProtoPlayer3D.create(ProtoPuppet.look("scav"))
	add_child(player)
	_check("the player is built ON the puppet", player.puppet != null and player.puppet == player._visual)
	player.set_armed(true)
	_check("player.set_armed shows the gun", player._gun.visible)
	var muzzle := player.muzzle_world()
	_check("muzzle_world resolves off the rig's gun", muzzle != Vector3.ZERO and muzzle.y > 0.3)

	print("PUP RESULTS: %d passed, %d failed" % [passed, failed])
	print("PUP: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
