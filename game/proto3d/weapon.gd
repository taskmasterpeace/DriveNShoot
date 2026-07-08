## The Arsenal (COMBAT_AND_GEAR §1): a gun is DATA + one of 3 behaviors, never new
## code. Ammo lives in the backpack (Container multi-use). Same system will bolt
## onto cars later (mount_type).
class_name ProtoWeapon
extends RefCounted

enum Behavior { HITSCAN, HITSCAN_MULTI, PROJECTILE, MELEE }

# hand_pose = how the PUPPET holds this weapon (the pose is the weapon's property,
# not the person's — same rig, different grip). offset moves the gun hand from its
# rest; two_handed pulls the free hand across to a fore-grip. (offset.x is mirrored
# for left-handers by the puppet.)
# GUNFEEL PASS row fields (data, never code — playtest flips rows): "fire_sfx"
# names the shot sound (was a hardcoded id==... ternary at the call sites);
# "pump_sfx" is the post-shot chamber sound (shotgun only today — any future
# pump weapon is just a row with this set); "hit_stop" is the on-hit micro-
# freeze dial — true dips time briefly on a landed non-kill hit so the
# connection reads; rapid-fire guns (pistol, car_mg) default false since a
# steady judder at a 0.32s/0.13s cooldown reads as stutter, not impact.
const WEAPONS: Dictionary = {
	"pistol": {"name": "Pistol", "emoji": "🔫", "behavior": Behavior.HITSCAN, "damage": 18.0,
		"mag_size": 12, "ammo": "9mm", "cooldown": 0.32, "spread_deg": 4.0, "range": 42.0, "reload_s": 0.9,
		"fire_sfx": "shot", "hit_stop": false,
		# RIG V2 recoil rows (rad): kick_pitch snaps the aim arm, torso_jolt rocks the
		# body when the scaled kick crosses stagger_threshold. Strength eats all of it.
		"recoil": {"kick_pitch": 0.09, "torso_jolt": 0.04, "stagger_threshold": 0.3},
		"hand_pose": {"offset": Vector3(0.0, -0.06, 0.03), "two_handed": false}}, # one hand, held low
	"shotgun": {"name": "Pump shotgun", "emoji": "🔫", "behavior": Behavior.HITSCAN_MULTI, "damage": 9.0,
		"pellets": 6, "mag_size": 5, "ammo": "12ga", "cooldown": 0.95, "spread_deg": 11.0, "range": 22.0, "reload_s": 1.6, "shove": 2.6,
		"fire_sfx": "shotgun", "pump_sfx": "shotgun_pump", "hit_stop": true,
		# 12ga at strength 0 = 0.38 >= 0.3: the WEAK get rocked; at strength 8 the
		# scaled 0.20 stays under — the strong eat it with the arm. The fantasy, as data.
		"recoil": {"kick_pitch": 0.38, "torso_jolt": 0.15, "stagger_threshold": 0.3},
		# RIG V2 grips (gun-mesh-local): grip_r seats the stock behind the trigger
		# palm; grip_l is the forend point the free hand 2-bone-IK plants on.
		"hand_pose": {"offset": Vector3(-0.08, 0.16, -0.06), "two_handed": true,
			"grip_r": Vector3(0.0, 0.0, 0.1), "grip_l": Vector3(0.0, -0.02, 0.0)}}, # both hands, at the shoulder
	"pipe_rocket": {"name": "Pipe rocket", "emoji": "🧨", "behavior": Behavior.PROJECTILE, "damage": 60.0,
		"mag_size": 1, "ammo": "rocket", "cooldown": 1.6, "spread_deg": 2.0, "range": 60.0,
		"speed": 20.0, "blast": 5.0, "reload_s": 2.2, "fire_sfx": "shot_rocket", "hit_stop": true, # the tube THOOMPS — never a 9mm crack
		"recoil": {"kick_pitch": 0.5, "torso_jolt": 0.2, "stagger_threshold": 0.3},
		"hand_pose": {"offset": Vector3(-0.12, 0.34, 0.16), "two_handed": true,
			"grip_l": Vector3(0.0, -0.05, -0.12)}}, # hoisted ONTO the shoulder, free hand steadies the tube
	# Melee: no ammo, QUIET (no stress spike), stamina-gated. The wrench doubles
	# as the repair tool (multi-use). Machete hits harder.
	"wrench": {"name": "Wrench", "emoji": "🔧", "behavior": Behavior.MELEE, "damage": 14.0,
		"mag_size": 0, "ammo": "", "cooldown": 0.5, "spread_deg": 0.0, "reach": 2.4, "arc_deg": 100.0, "stamina": 8.0, "knockdown": 0.35, "shove": 1.8, "hit_stop": true,
		"hand_pose": {"offset": Vector3(0.02, -0.02, 0.0), "two_handed": false}},
	"machete": {"name": "Machete", "emoji": "🔪", "behavior": Behavior.MELEE, "damage": 24.0,
		"mag_size": 0, "ammo": "", "cooldown": 0.7, "spread_deg": 0.0, "reach": 2.6, "arc_deg": 80.0, "stamina": 12.0, "knockdown": 0.25, "shove": 3.4, "hit_stop": true,
		"hand_pose": {"offset": Vector3(0.02, -0.02, 0.0), "two_handed": false}},
	# The AXE — slow, two-handed, a committed CHOP: biggest single hit, and it puts
	# them on the ground (knockdown) more than it launches them. Punishes a miss.
	"axe": {"name": "Fire axe", "emoji": "🪓", "behavior": Behavior.MELEE, "damage": 34.0,
		"mag_size": 0, "ammo": "", "cooldown": 0.9, "spread_deg": 0.0, "reach": 2.5, "arc_deg": 62.0, "stamina": 16.0, "knockdown": 0.55, "shove": 3.0, "hit_sfx": "impact_crunch", "hit_stop": true,
		"hand_pose": {"offset": Vector3(0.03, -0.02, 0.0), "two_handed": true}},
	# The BASEBALL BAT — the KNOCKBACK king: long reach, wide arc, fast-ish, and it
	# LAUNCHES (huge shove). Home-run a howler off you. Lower raw damage, all impact.
	"bat": {"name": "Baseball bat", "emoji": "🏏", "behavior": Behavior.MELEE, "damage": 18.0,
		"mag_size": 0, "ammo": "", "cooldown": 0.6, "spread_deg": 0.0, "reach": 2.8, "arc_deg": 95.0, "stamina": 10.0, "knockdown": 0.45, "shove": 7.0, "hit_sfx": "thunk", "hit_stop": true,
		"hand_pose": {"offset": Vector3(0.02, -0.02, 0.0), "two_handed": true}},
	# Vehicle mount (COMBAT_AND_GEAR §5): same system, bolted to the car.
	"car_mg": {"name": "Hood MG", "emoji": "🔫", "behavior": Behavior.HITSCAN, "damage": 10.0,
		"mag_size": 40, "ammo": "9mm", "cooldown": 0.13, "spread_deg": 3.5, "range": 55.0, "fire_sfx": "shot_mg", "hit_stop": false, # a mounted .30's own concussive report
		"recoil": {"kick_pitch": 0.05, "torso_jolt": 0.02, "stagger_threshold": 0.4}},
	# UNARMED (MOVESET.txt): empty hands are never empty. TAP = the combo
	# (jab→jab→cross; KICKS fold in at Martial Arts 2), HOLD = the shove below,
	# SPRINT+tap = the tackle (proto3d). "xp" routes the teach to MARTIAL ARTS.
	"fists": {"name": "Fists", "emoji": "👊", "behavior": Behavior.MELEE, "damage": 8.0,
		"mag_size": 0, "ammo": "", "cooldown": 0.32, "spread_deg": 0.0, "reach": 1.9, "arc_deg": 70.0,
		"stamina": 5.0, "knockdown": 0.08, "shove": 1.2, "xp": "martial_arts", "hit_sfx": "thunk", "hit_stop": true,
		"hand_pose": {"offset": Vector3(0.0, -0.04, 0.0), "two_handed": false}},
	# The SHOVE: create-space, not damage — peel a howler off you, clear a door.
	# At Martial Arts 4+ a shove at grapple range becomes a THROW (guaranteed floor).
	"shove_palm": {"name": "Shove", "emoji": "🖐️", "behavior": Behavior.MELEE, "damage": 2.0,
		"mag_size": 0, "ammo": "", "cooldown": 0.55, "spread_deg": 0.0, "reach": 2.0, "arc_deg": 95.0,
		"stamina": 6.0, "knockdown": 0.15, "shove": 6.0, "xp": "martial_arts", "hit_stop": true,
		"hand_pose": {"offset": Vector3(0.0, -0.04, 0.0), "two_handed": false}},
}

## THE WEAPON SHAPES (weapons-as-data 2026-07-08 goal: "all weapons should look
## like their counterparts"). Each is a silhouette built from box PARTS, in
## gun-local space: the GRIP is the origin, −Z is the muzzle/blade forward, +Y is
## up. ProtoPuppet.set_weapon_mesh rebuilds the held mesh from this when a weapon
## is equipped; "muzzle_z" is where the barrel tip sits (rounds leave there). Melee
## rows need no muzzle. TUNE THESE LIVE with the photobooth contact sheet — one
## place, one render, every weapon in one picture.
const GUNMETAL := Color(0.15, 0.15, 0.17)
const DARKSTEEL := Color(0.09, 0.09, 0.10)
const BRIGHTSTEEL := Color(0.62, 0.64, 0.68)
const WOOD := Color(0.34, 0.22, 0.11)
const MILGREEN := Color(0.28, 0.30, 0.20)
static var SHAPES: Dictionary = {
	# PISTOL — a slide over a grip. Short, unmistakable.
	"pistol": {"muzzle_z": 0.26, "parts": [
		{"size": Vector3(0.055, 0.075, 0.26), "pos": Vector3(0, 0.03, -0.10), "color": GUNMETAL},
		{"size": Vector3(0.05, 0.15, 0.075), "pos": Vector3(0, -0.07, 0.02), "color": DARKSTEEL},
	]},
	# PUMP SHOTGUN — long barrel, pump under it, receiver, a wood stock kicked back.
	"shotgun": {"muzzle_z": 0.55, "parts": [
		{"size": Vector3(0.05, 0.055, 0.5), "pos": Vector3(0, 0.035, -0.30), "color": GUNMETAL},
		{"size": Vector3(0.06, 0.06, 0.14), "pos": Vector3(0, -0.02, -0.22), "color": DARKSTEEL},
		{"size": Vector3(0.065, 0.10, 0.18), "pos": Vector3(0, 0.0, -0.02), "color": GUNMETAL},
		{"size": Vector3(0.045, 0.11, 0.22), "pos": Vector3(0, -0.05, 0.16), "color": WOOD, "rot": Vector3(0.18, 0, 0)},
	]},
	# PIPE ROCKET — a fat scrap tube on the shoulder, a grip and a bent sight.
	"pipe_rocket": {"muzzle_z": 0.52, "parts": [
		{"size": Vector3(0.135, 0.135, 0.64), "pos": Vector3(0, 0.05, -0.18), "color": MILGREEN},
		{"size": Vector3(0.05, 0.12, 0.075), "pos": Vector3(0, -0.07, 0.06), "color": DARKSTEEL},
		{"size": Vector3(0.02, 0.07, 0.03), "pos": Vector3(0, 0.15, -0.02), "color": DARKSTEEL},
	]},
	# WRENCH — a steel handle with a boxy open head.
	"wrench": {"muzzle_z": 0.34, "parts": [
		{"size": Vector3(0.035, 0.04, 0.34), "pos": Vector3(0, 0, -0.13), "color": BRIGHTSTEEL},
		{"size": Vector3(0.11, 0.045, 0.09), "pos": Vector3(0, 0, -0.31), "color": BRIGHTSTEEL},
	]},
	# MACHETE — a short handle and a long flat bright blade.
	"machete": {"muzzle_z": 0.34, "parts": [
		{"size": Vector3(0.04, 0.055, 0.15), "pos": Vector3(0, 0, 0.05), "color": DARKSTEEL},
		{"size": Vector3(0.016, 0.12, 0.42), "pos": Vector3(0, 0.02, -0.22), "color": BRIGHTSTEEL},
	]},
	# FIRE AXE — a long haft, a steel bit head near the top.
	"axe": {"muzzle_z": 0.34, "parts": [
		{"size": Vector3(0.04, 0.04, 0.52), "pos": Vector3(0, 0, -0.06), "color": WOOD},
		{"size": Vector3(0.15, 0.12, 0.05), "pos": Vector3(0.03, 0.02, -0.30), "color": BRIGHTSTEEL},
	]},
	# BASEBALL BAT — a thin handle swelling to a wood barrel.
	"bat": {"muzzle_z": 0.34, "parts": [
		{"size": Vector3(0.035, 0.035, 0.16), "pos": Vector3(0, 0, 0.10), "color": Color(0.28, 0.19, 0.10)},
		{"size": Vector3(0.06, 0.06, 0.46), "pos": Vector3(0, 0, -0.18), "color": Color(0.54, 0.38, 0.20)},
	]},
}


## The held-weapon silhouette for an id: {parts, muzzle_z}, or empty (unarmed /
## the fallback stub). The puppet reads this on equip.
static func shape(weapon_id: String) -> Dictionary:
	return SHAPES.get(weapon_id, {})

var id: String
var mag: int = 0
var bloom: float = 0.0 ## grows per shot, decays at rest — the reticle shows it
var crit_chance: float = 0.15 ## the lucky shot: ×1.8, gold CRIT floater, sharp tick
var _cd: float = 0.0
## THE COMBO (fists only): landed-strike counter; idles out after 1.2s so a
## flurry chains jab→jab→finisher but a lone poke is always a jab.
var _combo: int = 0
var _combo_t: float = 0.0

## THE PUMP CHAIN (GUNFEEL PASS #1): firing is already locked by cooldown —
## these two scheduled beats make it SOUND like why. Counting DOWN from the
## fire-time offsets so they land at fixed points inside the cooldown however
## the frame timing lands; both self-clear (< 0.0 = already fired/idle).
const PUMP_AT_S: float = 0.35   ## pump chambers a beat after the blast
const SHELL_DROP_AT_S: float = 0.55 ## the spent hull hits the floor a beat after that
var _pump_t: float = -1.0
var _shell_drop_t: float = -1.0


func _init(id_in: String) -> void:
	id = id_in
	mag = info()["mag_size"]


func info() -> Dictionary:
	return WEAPONS[id]


## main is optional (bare `tick(delta)` stays legal for anything that never
## needs the pump chain — e.g. a weapon row with no "pump_sfx" never schedules
## it, and the beats are no-ops without a main to play them through).
func tick(delta: float, main: Node = null) -> void:
	_cd = maxf(0.0, _cd - delta)
	bloom = maxf(0.0, bloom - delta * 1.8)
	_combo_t = maxf(0.0, _combo_t - delta)
	if _combo_t <= 0.0:
		_combo = 0
	if _pump_t > 0.0:
		_pump_t -= delta
		if _pump_t <= 0.0 and main != null and "audio" in main and main.audio:
			main.audio.play_at(String(info().get("pump_sfx", "")), _pump_origin(main), -3.0)
	if _shell_drop_t > 0.0:
		_shell_drop_t -= delta
		if _shell_drop_t <= 0.0 and main != null and "audio" in main and main.audio:
			main.audio.play_at("shell_drop", _pump_origin(main), -6.0)


## Where the pump/shell-drop beats sound from: the active car in DRIVE (mount
## or window fire), else the player — same anchor the fire call sites already
## use for their own audio.play_at.
func _pump_origin(main: Node) -> Vector3:
	if "mode" in main and main.mode == main.Mode.DRIVE and "active_car" in main and main.active_car != null:
		return main.active_car.global_position
	return main.player.global_position if "player" in main and main.player else Vector3.ZERO


## Arms the pump chain right after a shot — a no-op for any row without a
## "pump_sfx" (only the shotgun has one today; any future pump weapon is
## just a row with this field set).
func _arm_pump_chain() -> void:
	if String(info().get("pump_sfx", "")) == "":
		return
	_pump_t = PUMP_AT_S
	_shell_drop_t = SHELL_DROP_AT_S


func is_melee() -> bool:
	return info()["behavior"] == Behavior.MELEE


## The melee LAW (playtest: "I can hit them through the wall — they can hit me"):
## no teeth or steel through geometry, in EITHER direction. One chest-height ray,
## both bodies excluded — anything solid between means no hit. Every melee path
## (player swing, dog bite, howler claw, lurker claw) asks this first.
static func melee_clear(a: Node3D, b: Node3D) -> bool:
	if a == null or b == null:
		return false
	var space: PhysicsDirectSpaceState3D = a.get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(
		a.global_position + Vector3(0, 0.7, 0),
		b.global_position + Vector3(0, 0.7, 0))
	var excl: Array[RID] = []
	if a is CollisionObject3D:
		excl.append((a as CollisionObject3D).get_rid())
	if b is CollisionObject3D:
		excl.append((b as CollisionObject3D).get_rid())
	q.exclude = excl
	return space.intersect_ray(q).is_empty()


func can_fire() -> bool:
	return (mag > 0 or is_melee()) and _cd <= 0.0


## Effective spread right now (base × bloom × skill) — the reticle draws this.
func current_spread(main: Node) -> float:
	var skill_mult := 1.0
	var wobble := 0.0
	if "character" in main and main.character:
		skill_mult = clampf(1.0 - 0.06 * main.character.level("marksmanship"), 0.5, 1.0)
		wobble = main.character.aim_wobble() # a shot arm can't hold the barrel still
	return info()["spread_deg"] * (1.0 + bloom) * skill_mult * (1.0 + wobble * 2.2)


## Crit chance right now: base + Marksmanship (the lucky shot gets less lucky).
func current_crit(main: Node) -> float:
	if "character" in main and main.character:
		return crit_chance + main.character.crit_bonus()
	return crit_chance


## POSE-TO-POSE STRIKES (ANIMATION_FIX_PACK §3.4): map a melee weapon + combo beat to
## its strikes.json row id. The fists combo cycles punch_1/2/3 (the finisher beat is a
## kick when Martial Arts unlocked it); the bat has its own authored swing; every other
## swung thing shares the generic weapon_swing. An unknown id => play_strike returns
## false and fire() falls back to the legacy tween.
func _strike_id_for(weapon_id: String, combo: int, is_kick: bool) -> String:
	match weapon_id:
		"fists":
			return "kick" if is_kick else "punch_" + str(((combo - 1) % 3) + 1)
		"shove_palm":
			return "shove"
		"bat":
			return "bat_swing"
		_:
			return "weapon_swing"


## Fires from the player toward aim_dir. Returns true if a shot happened.
func fire(main: Node, from: Vector3, aim_dir: Vector3) -> bool:
	if not can_fire():
		return false
	var w := info()
	if is_melee():
		# Stamina-gated swing, hits everything in the reach arc. QUIET (no heat/
		# stress) — but never silent to the SENSES: you see the arc, feel the lunge,
		# hear the whoosh, and every connection answers with blood + a thunk.
		# THE MELEE SKILL: cheaper swings, harder hits, more knockdown; STRENGTH
		# carries the shove. One skill for every swung thing (PZ's six → 1).
		var ch: Variant = main.character if "character" in main else null
		var stam_cost: float = w["stamina"] * (ch.melee_stam_mult() if ch else 1.0)
		# MARTIAL ARTS vs MELEE: fists/shove teach + scale by their own skill
		# (the "xp" row field); every swung THING stays on the one melee skill.
		var xp_skill := String(w.get("xp", "melee"))
		var ma: int = (ch.level("martial_arts") if ch else 0)
		var dmg_mult: float = 1.0
		if ch:
			dmg_mult = ch.unarmed_dmg_mult() if xp_skill == "martial_arts" else ch.melee_dmg_mult()
		var kd_bonus: float = ch.melee_kd_bonus() if ch else 0.0
		var shove_m: float = ch.shove_mult() if ch else 1.0
		if main.player.stamina < stam_cost:
			return false
		main.player.stamina -= stam_cost
		_cd = w["cooldown"]
		# Per-swing values — the fists COMBO rewrites them on its finisher beat.
		var dmg_base: float = w["damage"]
		var shove_base: float = w.get("shove", 2.5)
		var kd_base: float = w.get("knockdown", 0.3)
		var reach: float = w["reach"]
		var beat_is_kick := false
		if id == "fists":
			# jab → jab → FINISHER: a bare cross, or with KICKS (Martial Arts 2+)
			# a roundhouse — more damage, more reach, a real shove behind it.
			_combo = (_combo + 1) if _combo_t > 0.0 else 1
			_combo_t = 1.2
			if _combo % 3 == 0:
				if ma >= 2:
					beat_is_kick = true
					dmg_base *= 2.2
					shove_base = 4.5
					kd_base += 0.3
					reach += 0.3
				else:
					dmg_base *= 1.5
		# POSE-TO-POSE STRIKES (ANIMATION_FIX_PACK §3.4): the melee READ is now a
		# strikes.json key-pose row on the real joints — snap, not a floaty tween — and
		# the white-plank arc is RETIRED (owner: "a little white line that sticks out of
		# the character... I don't like that"). The swing reads on the arm + weapon mesh;
		# fall back to the legacy tween only if the row id is unknown (never a freeze).
		var strike_id := _strike_id_for(id, _combo, beat_is_kick)
		var played: bool = main.player.has_method("play_strike") and main.player.play_strike(strike_id)
		if not played:
			if id == "fists" and main.player.has_method("punch"):
				if beat_is_kick:
					main.player.kick()
				else:
					main.player.punch(_combo)
			elif id == "shove_palm" and main.player.has_method("punch"):
				main.player.punch(0) # the palm reads as one straight hand
			elif main.player.has_method("swing"):
				main.player.swing()
		main.player.lunge(aim_dir)
		if "audio" in main and main.audio:
			main.audio.play_at("whoosh", main.player.global_position, -8.0)
		var hit_any := false
		# Melee targets = combatant UNION threat: any hostile is meleeable
		# however it's tagged (the ONE DAMAGE LAW). Self excluded below.
		var targets_m: Array = main.get_tree().get_nodes_in_group("combatant").duplicate()
		for th in main.get_tree().get_nodes_in_group("threat"):
			if not targets_m.has(th):
				targets_m.append(th)
		for node in targets_m:
			var t := node as Node3D
			if t == null or not is_instance_valid(t) or t == main.player:
				continue
			var to_t: Vector3 = t.global_position - main.player.global_position
			to_t.y = 0.0
			if to_t.length() <= reach and aim_dir.dot(to_t.normalized()) > cos(deg_to_rad(w["arc_deg"] / 2.0)) \
					and melee_clear(main.player, t):
				if t.has_method("take_damage"):
					var was_valid := true
					var dmg := dmg_base
					var shove_pow := shove_base
					var kd := kd_base
					# THROWS (Martial Arts 4+): a shove at grapple range isn't a
					# push — it's a hip toss: guaranteed floor, half again the shove.
					if id == "shove_palm" and ma >= 4 and to_t.length() < 1.4:
						kd = 1.0
						shove_pow *= 1.5
						ProtoFloater.pop(main, t.global_position + Vector3(0, 2.0, 0), "THROWN", Color(0.95, 0.8, 0.35), 130)
					# FINISHERS (Martial Arts 6+): a punch on a DOWNED body lands ×3
					# (the tackle's down window becomes ground-and-pound).
					var stun_v: Variant = t.get("_stun_t")
					if id == "fists" and ma >= 6 and stun_v is float and float(stun_v) > 0.0:
						dmg *= 3.0
						ProtoFloater.pop(main, t.global_position + Vector3(0, 1.6, 0), "FINISHER", Color(1.0, 0.45, 0.2), 140)
					ProtoFX.blood(main, t.global_position + Vector3(0, 1.1, 0))
					if t.has_method("shove"):
						t.shove(to_t.normalized(), shove_pow * shove_m) # steel × STRENGTH
					var crit := randf() < current_crit(main)
					if crit:
						ProtoFloater.pop(main, t.global_position + Vector3(0, 2.2, 0), "CRIT", Color(1.0, 0.8, 0.2), 150)
					t.take_damage(dmg * dmg_mult * (1.8 if crit else 1.0))
					hit_any = true
					was_valid = is_instance_valid(t)
					var target_killed: bool = (not was_valid) or t.get("dead") == true
					# THE WOW: a killing CRIT holds the world's breath (slow-mo read).
					if crit and target_killed and main.has_method("cinematic_kill"):
						main.cinematic_kill(main.player.global_position)
					if "audio" in main and main.audio:
						main.audio.play_at(String(w.get("hit_sfx", "thunk")), main.player.global_position + to_t, -2.0)
					if "cam_rig" in main and main.cam_rig:
						main.cam_rig.add_trauma(0.16) # the connection lands in your hands
					# GUNFEEL #5: HIT-STOP on a landed NON-kill swing, row-gated
					# (melee weapons default true). A kill already got its own
					# (bigger) slow-mo above — shared _cine_lock means they never
					# both fire for the same swing.
					if not target_killed and bool(w.get("hit_stop", false)) and main.has_method("hit_stop"):
						main.hit_stop()
					# Melee HITS — chance to knock the target flat (feel the impact).
					if was_valid and t.has_method("knock_down") and randf() < kd + kd_bonus:
						t.knock_down()
		if hit_any and main.has_method("grant_xp"):
			main.grant_xp(xp_skill, 1.5)    # swings teach the swing (or the ART)...
			main.grant_xp("strength", 0.4)  # ...and the shove behind it
		return true
	mag -= 1
	_cd = w["cooldown"]
	_arm_pump_chain() # GUNFEEL #1: schedules pump+shell_drop mid-cooldown (no-op sans "pump_sfx")
	var sp := current_spread(main)
	bloom = minf(bloom + 0.45, 2.2) # each shot blooms the cone; rest recovers it
	# Every trigger pull is ANSWERED: flash at the muzzle, brass off to the right.
	ProtoFX.muzzle_flash(main, from, aim_dir)
	ProtoFX.casing(main, from, aim_dir.cross(Vector3.UP).normalized() * -1.0)
	match w["behavior"]:
		Behavior.HITSCAN:
			_ray_shot(main, from, _spread(aim_dir, sp), w["range"], w["damage"])
		Behavior.HITSCAN_MULTI:
			# Pellets at close range carry SHOVE — a shotgun answer you can see.
			for i in int(w["pellets"]):
				_ray_shot(main, from, _spread(aim_dir, sp), w["range"], w["damage"], float(w.get("shove", 1.4)))
		Behavior.PROJECTILE:
			_launch(main, from, _spread(aim_dir, sp), w)
	return true


## Triangular-distribution cone (INTERFACE_AND_BODY §6) — one random angle, top-down.
func _spread(dir: Vector3, deg: float) -> Vector3:
	var t := randf() - randf()
	return dir.rotated(Vector3.UP, t * deg_to_rad(deg))


func _ray_shot(main: Node, from: Vector3, dir: Vector3, rng: float, dmg: float, shove_power: float = 0.0) -> void:
	var space: PhysicsDirectSpaceState3D = main.player.get_world_3d().direct_space_state
	var to := from + dir * rng
	var q := PhysicsRayQueryParameters3D.create(from, to)
	var excl: Array[RID] = [main.player.get_rid()]
	# Shooting from a vehicle: don't shoot your own ride in the back of the head.
	if "active_car" in main and main.active_car != null and is_instance_valid(main.active_car):
		excl.append((main.active_car as PhysicsBody3D).get_rid())
	q.exclude = excl
	var hit: Dictionary = space.intersect_ray(q)
	var end := to
	if not hit.is_empty():
		end = hit["position"]
		var col = hit["collider"]
		var is_car := col is ProtoCar3D
		if col != null and col.has_method("take_damage") and not is_car:
			# FLESH: blood where the round lands, a dry tick in your ear, the
			# reticle pinches — the game says "that one counted."
			ProtoFX.blood(main, end)
			if shove_power > 0.0 and col.has_method("shove"):
				col.shove(dir, shove_power)
			var crit := randf() < current_crit(main)
			if crit:
				ProtoFloater.pop(main, end + Vector3(0, 1.0, 0), "CRIT", Color(1.0, 0.8, 0.2), 150)
			col.take_damage(dmg * (1.8 if crit else 1.0))
			if "audio" in main and main.audio:
				main.audio.play_ui("hitmark", -12.0 if crit else -14.0, 1.5 if crit else 1.0)
			if "hud" in main and main.hud:
				main.hud.pulse_hit()
			if main.has_method("grant_xp"):
				main.grant_xp("marksmanship", 2.0) # hits teach; misses don't
			# GUNFEEL #5: HIT-STOP on a landed NON-kill hit, row-gated (playtest
			# dial). A kill routes through cinematic_kill's bigger slow-mo instead
			# — the shared _cine_lock means the two can never stack or fight.
			var killed: bool = (not is_instance_valid(col)) or col.get("dead") == true
			if not killed and bool(info().get("hit_stop", false)) and main.has_method("hit_stop"):
				main.hit_stop()
		elif is_car:
			# METAL: a shot car keeps its EXISTING chassis damage (armor formula
			# lives on ProtoCar3D.take_damage — untouched), it just answers with
			# the right FX/sound instead of blood (GUNFEEL #6 per-surface).
			col.take_damage(dmg)
			ProtoFX.impact(main, end)
			if "audio" in main and main.audio:
				main.audio.play_at("impact_metal", end, -6.0)
		else:
			# THE WORLD: dust off the wall/ground — even a miss tells you where
			# it went. GUNFEEL #6: pick wood vs dirt by what's actually there.
			ProtoFX.impact(main, end)
			if "audio" in main and main.audio:
				main.audio.play_at(_surface_sfx(col), end, -6.0)
	_tracer(main, from, end)


## GUNFEEL #6: what a round hit, by COLLIDER — wood (a placed structure shell —
## future-proofed for when world placement lands them) or the ground/default.
## Flesh and metal (cars) are resolved above and never reach here.
func _surface_sfx(col: Object) -> String:
	if col is Node and (col as Node).is_in_group("structure"):
		return "impact_wood"
	return "impact_dirt"


## Visible round: shots fly the ROLLED vector, so misses are legible.
func _tracer(main: Node, from: Vector3, to: Vector3) -> void:
	var m := MeshInstance3D.new()
	var box := BoxMesh.new()
	var length := from.distance_to(to)
	box.size = Vector3(0.05, 0.05, maxf(length, 0.4))
	m.mesh = box
	m.material_override = ProtoWorldBuilder.material(Color(1.0, 0.85, 0.4), 0.2, true)
	main.add_child(m)
	m.global_position = (from + to) / 2.0
	if length > 0.1:
		m.look_at(to, Vector3.UP)
	var tw := m.create_tween()
	tw.tween_property(m, "transparency", 1.0, 0.09)
	tw.tween_callback(m.queue_free)


func _launch(main: Node, from: Vector3, dir: Vector3, w: Dictionary) -> void:
	var rocket := ProtoRocket.new()
	rocket.dir = dir
	rocket.speed = w["speed"]
	rocket.damage = w["damage"]
	rocket.blast = w["blast"]
	main.add_child(rocket)
	rocket.global_position = from + dir * 1.2


## Lobbed grenade: ballistic arc + fuse, blast via main.on_explosion.
class ProtoGrenade:
	extends Node3D
	var vel: Vector3
	var fuse: float = 1.6
	var blast: float = 5.0
	var damage: float = 55.0

	func _ready() -> void:
		var m := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.18, 0.18, 0.18)
		m.mesh = box
		m.material_override = ProtoWorldBuilder.material(Color(0.2, 0.28, 0.16), 0.6)
		add_child(m)

	func _physics_process(delta: float) -> void:
		vel.y -= 12.0 * delta
		global_position += vel * delta
		if global_position.y < 0.15:
			global_position.y = 0.15
			vel = vel * 0.35
			vel.y = 0.0
		fuse -= delta
		if fuse <= 0.0:
			var main := get_parent()
			# ONE blast law: damage + knockback + knockdown routed through main.
			if main.has_method("on_explosion"):
				main.on_explosion(global_position, damage, blast)
			queue_free()


## The flying pipe rocket: straight line, explodes on proximity or timeout.
class ProtoRocket:
	extends Node3D
	var dir: Vector3
	var speed: float = 20.0
	var damage: float = 60.0
	var blast: float = 5.0
	var _life: float = 3.0

	func _ready() -> void:
		var m := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.15, 0.15, 0.5)
		m.mesh = box
		m.material_override = ProtoWorldBuilder.material(Color(0.8, 0.3, 0.1), 0.4, true)
		add_child(m)
		if dir.length_squared() > 0.01:
			look_at(global_position + dir, Vector3.UP)

	func _physics_process(delta: float) -> void:
		global_position += dir * speed * delta
		_life -= delta
		var main := get_parent()
		for node in get_tree().get_nodes_in_group("threat"):
			var t := node as Node3D
			if t and is_instance_valid(t) and t.global_position.distance_to(global_position) < 1.6:
				_boom(main)
				return
		if _life <= 0.0:
			_boom(main)

	func _boom(main: Node) -> void:
		# ONE blast law: damage + knockback + knockdown routed through main.
		if main.has_method("on_explosion"):
			main.on_explosion(global_position, damage, blast)
		queue_free()
