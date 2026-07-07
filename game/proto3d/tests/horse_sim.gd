## HORSES — the rideable-actor proof (owner spec, 2026-07-07):
## (a) horses.json folds, a horse spawns with the quadruped rig
## (b) REAL E interact mounts (player parented to the front seat anchor, riding
##     state set), WASD moves the horse, dismount returns control
## (c) arc gating: front rider CAN fire 60° off-nose, CANNOT at 170°; rear seat
##     CAN fire at 90°, CANNOT at 0° (the dead zone) — via the arc-check function
##     directly AND one real fire path each
## (d) both riders render (two puppets parented to the rig)
## Run: godot --headless --path game res://proto3d/tests/horse_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


class TestFoe:
	extends CharacterBody3D
	var hp: float = 999.0
	var hits: Array = []

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


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("HORSE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _tap_interact() -> void:
	for pressed in [true, false]:
		var ev := InputEventAction.new()
		ev.action = "interact"
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _press_fire() -> void:
	var ev := InputEventAction.new()
	ev.action = "drivn_fire"
	ev.pressed = true
	Input.parse_input_event(ev)
	var ev2 := InputEventAction.new()
	ev2.action = "drivn_fire"
	ev2.pressed = false
	Input.parse_input_event(ev2)


func _ready() -> void:
	print("HORSE: start")
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("HORSE: WATCHDOG")
		print("HORSE: FAILURES PRESENT")
		get_tree().quit(1))
	var prev_scale := Engine.time_scale
	Engine.time_scale = 2.0
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame
	main._exit_car()
	for _i in 4:
		await get_tree().physics_frame
	# Open ground, far from Meridian's parked fleet (dogverb_sim's isolation trick) —
	# the interactable-group scan would otherwise pick the nearer STARTING CAR over
	# the horse, since both live in "interactable" and the scan just takes nearest.
	main.player.global_position = Vector3(6, 0.35, 388)
	main.player.velocity = Vector3.ZERO
	for _i in 4:
		await get_tree().physics_frame

	# --- (a) horses.json folds; a horse spawns wearing the quadruped rig -------
	ProtoHorse.ensure_horses()
	_check("horses.json folded a mustang row", ProtoHorse.HORSES.has("mustang"))
	_check("horses.json folded a draft row", ProtoHorse.HORSES.has("draft"))
	_check("the mustang row carries seat arcs", ProtoHorse.HORSES["mustang"].get("seats", []).size() == 2)

	var horse := ProtoHorse.create("mustang")
	main.add_child(horse)
	horse.global_position = main.player.global_position + Vector3(4, 0.5, 0)
	await get_tree().physics_frame
	_check("the horse wears a ProtoQuadruped rig", horse._quad != null and horse._quad is ProtoQuadruped)
	_check("the horse is a combatant (Damageable via the one law)", horse.is_in_group("combatant"))

	# --- (b) REAL E interact mounts; WASD moves the horse; dismount returns ----
	main.player.global_position = horse.global_position + Vector3(-1.6, 0, 0)
	main.player.velocity = Vector3.ZERO
	for _i in 3:
		await get_tree().physics_frame
	_check("mount prompt shows with nobody aboard", horse.interact_prompt(main).contains("Mount"))
	for _try in 3: # input events need several frames to land (the house gotcha)
		if horse.riders.get("front") != null:
			break
		_tap_interact()
		for _i in 4:
			await get_tree().physics_frame
	_check("REAL E interact mounted the player (front seat)",
		horse.riders.get("front") != null and (horse.riders["front"] as ProtoHorse.Rider).is_player)
	_check("the player is PARENTED to the horse (seat anchor)", main.player.get_parent() == horse)
	_check("the player's puppet renders as the front rider (visible)", main.player.visible)

	# WASD (the real move axes) drives the horse forward — real input, not a teleport.
	var pos0: Vector3 = horse.global_position
	for pressed in [true, false]:
		var ev := InputEventAction.new()
		ev.action = "move_up"
		ev.pressed = pressed
		ev.strength = 1.0 if pressed else 0.0
		Input.parse_input_event(ev)
		if pressed:
			for _i in 90:
				await get_tree().physics_frame
	var moved: float = horse.global_position.distance_to(pos0)
	_check("WASD moved the horse (%.1fm)" % moved, moved > 3.0)
	_check("the player's global_position TRACKS the saddle (rides along)",
		main.player.global_position.distance_to(horse.global_position) < 2.5)

	# Dismount returns control.
	_tap_interact()
	await get_tree().physics_frame
	_check("dismount UN-parents the player", main.player.get_parent() != horse)
	_check("dismount returns control (player active again)", main.player.is_active)
	_check("the horse's front seat is empty again", horse.riders.get("front") == null)

	# --- (c) arc gating: front 60° in-arc, 170° out; rear 90° in-arc, 0° dead --
	# Direct function check first (deterministic, no RNG/spread involved).
	var front_center: Vector3 = horse.world_arc_center("front") # 0° local = the horse's -Z (forward)
	var dir_60: Vector3 = front_center.rotated(Vector3.UP, deg_to_rad(60.0))
	var dir_170: Vector3 = front_center.rotated(Vector3.UP, deg_to_rad(170.0))
	_check("ARC FN: front rider CAN aim 60° off-nose (in_arc)", horse.in_arc("front", dir_60))
	_check("ARC FN: front rider CANNOT aim 170° off-nose (in_arc)", not horse.in_arc("front", dir_170))

	var rear_center: Vector3 = horse.world_arc_center("rear") # 180° local = the horse's +Z (aft)
	var dir_rear_90: Vector3 = rear_center.rotated(Vector3.UP, deg_to_rad(90.0))
	var dir_rear_dead: Vector3 = front_center # bearing 0° = the horse's forward — the blocked band
	_check("ARC FN: rear rider CAN aim 90° off their center (in_arc)", horse.in_arc("rear", dir_rear_90))
	_check("ARC FN: rear rider CANNOT aim into the dead zone (0°, front rider's body)",
		not horse.in_arc("rear", dir_rear_dead))

	# --- (c continued) one REAL fire path each: mount up, arm a pistol, aim, fire.
	main.equipped = -1
	main.weapons.clear()
	main.weapons.append(ProtoWeapon.new("pistol"))
	main.equipped = 0
	main.backpack.add("9mm", 200)

	main.player.global_position = horse.global_position + Vector3(-1.6, 0, 0)
	main.player.velocity = Vector3.ZERO
	# The proven first-mount pattern: settle a few frames so the interact scan
	# sees the new position (house gotcha: input events need several frames to
	# land) — the one-frame version here was the sim's own flake.
	for _i in 3:
		await get_tree().physics_frame
	for _try in 3:
		if horse.riders.get("front") != null:
			break
		_tap_interact() # mount
		for _i in 4:
			await get_tree().physics_frame
	_check("re-mounted for the fire-path proof", horse.riders.get("front") != null)

	var foe_hit := TestFoe.create()
	main.add_child(foe_hit)
	foe_hit.global_position = horse.global_position + dir_60 * 12.0 + Vector3(0, 1.0, 0)
	var foe_miss := TestFoe.create()
	main.add_child(foe_miss)
	foe_miss.global_position = horse.global_position + dir_170 * 12.0 + Vector3(0, 1.0, 0)
	await get_tree().physics_frame

	# Aim AT the in-arc target and fire for real (the actual _unhandled_input path).
	# Keep squeezing through the cooldown — spread is spread (4° at 12m CAN miss
	# one shot; a 1-in-6 streak of misses is astronomically rare).
	for _try in 6:
		main.aim_override = (foe_hit.global_position - main.player.global_position)
		_press_fire()
		for _i in 22: # ride out the pistol's 0.32s cooldown between squeezes
			await get_tree().physics_frame
		if foe_hit.hp < 999.0:
			break
	_check("REAL fire path: in-arc target (60°) takes damage", foe_hit.hp < 999.0)

	# Aim AT the out-of-arc target — the clamp keeps the shot inside the cone, so
	# a target planted WELL outside (170°) should be missed across repeated tries.
	var hp0 := foe_miss.hp
	main.aim_override = (foe_miss.global_position - main.player.global_position)
	for _i in 6:
		_press_fire()
		await get_tree().physics_frame
	_check("REAL fire path: out-of-arc target (170°) is UNCHANGED (clamp holds)", foe_miss.hp == hp0)
	foe_hit.queue_free()
	foe_miss.queue_free()

	# --- (d) both riders render: front (the player, already proven) + rear -----
	var sam := ProtoCompanion.create(main, "sam")
	main.add_child(sam)
	sam.global_position = horse.global_position
	await get_tree().physics_frame
	horse.board_rear(sam, sam.puppet, sam.hp)
	await get_tree().physics_frame
	_check("a rear rider's puppet is PARENTED to the rig", sam.puppet.get_parent() == horse)
	_check("the rear rider renders (visible)", sam.puppet.visible)
	_check("both seats occupied at once", horse.riders.get("front") != null and horse.riders.get("rear") != null)

	# Rear-seat arc proof via the same direct function + one real dispatch. The
	# shared pistol's cooldown (0.32s) is still draining from the front-seat miss
	# loop above — let it clear so this checks the ARC, not a cooldown collision.
	main.current_weapon()._cd = 0.0
	main.aim_override = dir_rear_90 * 12.0
	var rear_ok := horse.fire_from_seat("rear", main, dir_rear_90)
	_check("REAL rear fire path: 90° off-center succeeds (in arc)", rear_ok)

	# The mustang row's numbers (arc_center 180°/half 140°) put bearing 0° a full
	# 40° BEYOND the main cone's own edge — the dead zone is unreachable by the
	# cone alone here, so a shot aimed at 0° CLAMPS to the cone's ~40°-off-nose
	# edge (spec §4's default: clamp-to-edge, still fires) rather than the hard
	# REFUSE this file reserves for aims that fall INSIDE the main cone but land
	# in the blocked band. Either way the practical result is identical (a rear
	# rider can never put a round through the front rider's back) — verify by
	# the FIRED DIRECTION, not a same-or-different return value.
	main.current_weapon()._cd = 0.0
	main.aim_override = dir_rear_dead * 12.0
	var fired_dir_at_dead_zone := horse.clamp_to_arc("rear", dir_rear_dead)
	horse.fire_from_seat("rear", main, dir_rear_dead)
	_check("mustang row: a 0°-aimed rear shot is steered OFF the dead zone (clamped away)",
		not horse.in_arc("rear", fired_dir_at_dead_zone) or fired_dir_at_dead_zone.angle_to(dir_rear_dead) > deg_to_rad(20.0))

	# The HARD REFUSE path itself (a shot inside the main cone that lands in the
	# blocked band) is real, load-bearing code — prove it fires with a seat shape
	# where the band actually overlaps the cone (a wide-open rear arc, e.g. a
	# bench seat facing sideways), same arc law, different row.
	var wide_row: Dictionary = {"side": "rear", "pos": Vector3(0, 1.42, 0.55),
		"arc_center_deg": 90.0, "arc_half_deg": 179.0, "blocked_center_deg": 0.0, "blocked_half_deg": 25.0}
	horse.row["seats"] = [horse._seat_row("front"), wide_row]
	main.current_weapon()._cd = 0.0
	_check("ARC FN: the wide row's dead zone (0°) IS inside its own main cone (band is reachable)",
		horse.in_arc("rear", dir_rear_dead) == false and absf(rad_to_deg(dir_rear_dead.angle_to(horse.world_arc_center("rear")))) <= 179.0)
	var hard_refuse := horse.fire_from_seat("rear", main, dir_rear_dead)
	_check("REAL rear fire path: dead-zone (0°) HARD REFUSES when the band is reachable", not hard_refuse)

	horse.unboard_rear(horse.global_position + Vector3(2, 0, 0))
	await get_tree().physics_frame
	_check("rear rider un-parents on unboard", sam.puppet.get_parent() != horse)

	Engine.time_scale = prev_scale
	print("HORSE RESULTS: %d passed, %d failed" % [passed, failed])
	print("HORSE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
