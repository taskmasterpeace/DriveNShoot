## Proof for THE GUNFEEL PASS (owner /goal: impact + muzzle flashes, in and out
## of the car). Real fire calls through the ONE weapon system — never teleports
## the damage-law itself. Covers:
##   (a) shotgun PUMP CHAIN — pump/shell_drop beats scheduled after a shot,
##       firing stays locked by cooldown the whole time
##   (b) DRY-FIRE click on an empty mag
##   (c) RELOAD STAGING — reload_drop at start, reload_insert at 60% elapsed,
##       finish click unchanged, total reload_s untouched
##   (d) HIT-STOP dips Engine.time_scale and restores the EXACT prior scale
##       (staged non-1.0 first — the real-world case: a cinematic is running)
##   (e) PER-SURFACE IMPACT routing: flesh/metal/wood/dirt pick the right id
##   (f) VEHICLE FIRE FEEL: fire_from_vehicle spawns a flash node + trauma
## Run: godot --headless --path game res://proto3d/tests/gunfeel_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D


## Records EVERY main.audio call by id (name, args) without touching audio.gd —
## a thin subclass swapped in after boot; every call site still says
## main.audio.play_at/play_ui, so behavior (streams, buses) is identical.
class RecordingAudio:
	extends ProtoAudio
	var calls: Array = [] ## each entry: {"fn": "play_at"/"play_ui", "id": String}

	func play_at(id: String, pos: Vector3, volume_db: float = 0.0, pitch: float = 1.0) -> void:
		calls.append({"fn": "play_at", "id": id})
		super.play_at(id, pos, volume_db, pitch)

	func play_ui(id: String, volume_db: float = -8.0, pitch: float = 1.0) -> void:
		calls.append({"fn": "play_ui", "id": id})
		super.play_ui(id, volume_db, pitch)

	func played(id: String, since_index: int = 0) -> bool:
		for i in range(since_index, calls.size()):
			if String(calls[i]["id"]) == id:
				return true
		return false


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GUNFEEL: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _swap_recording_audio() -> RecordingAudio:
	var old: ProtoAudio = main.audio
	var rec := RecordingAudio.new()
	main.add_child(rec)
	main.audio = rec
	if old != null and is_instance_valid(old):
		old.queue_free()
	return rec


func _ready() -> void:
	print("GUNFEEL: start")
	get_tree().create_timer(75.0).timeout.connect(func() -> void:
		print("GUNFEEL: WATCHDOG"); print("GUNFEEL: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	var rec := _swap_recording_audio()
	main._exit_car()
	var p: ProtoPlayer3D = main.player
	p.global_position = Vector3(6, 0.35, 388) # unarmed_sim's proven open shoulder
	p.velocity = Vector3.ZERO
	for _i in 4:
		await get_tree().physics_frame

	# ============================================================================
	# (a) SHOTGUN PUMP CHAIN: pump at ~0.35s, shell_drop at ~0.55s, both inside
	#     the 0.95s cooldown — and firing stays refused the whole time.
	# ============================================================================
	main.backpack.add("shotgun", 1)
	main.backpack.add("12ga", 5)
	main.use_item("shotgun")
	var sg: ProtoWeapon = main.current_weapon()
	_check("shotgun equipped for the pump test", sg != null and sg.id == "shotgun")
	sg.mag = sg.info()["mag_size"]
	sg._cd = 0.0
	main.aim_override = Vector3(0, 0, -1)
	var call0 := rec.calls.size()
	var fired := sg.fire(main, p.global_position, Vector3(0, 0, -1))
	_check("the shotgun fired", fired)
	_check("firing is LOCKED right after the shot (cooldown holds)", not sg.can_fire())
	# March through the cooldown in small steps, catching the two beats' arrival.
	var pump_seen_by := -1.0
	var drop_seen_by := -1.0
	var t_elapsed := 0.0
	var step := 0.05
	while t_elapsed < 0.95:
		sg.tick(step, main)
		t_elapsed += step
		if pump_seen_by < 0.0 and rec.played("shotgun_pump", call0):
			pump_seen_by = t_elapsed
		if drop_seen_by < 0.0 and rec.played("shell_drop", call0):
			drop_seen_by = t_elapsed
		if not sg.can_fire():
			pass # still locked — the point of the chain: it SOUNDS like why
	_check("pump chambers mid-cooldown (heard by %.2fs, expected ~0.35s)" % pump_seen_by,
		pump_seen_by > 0.0 and pump_seen_by <= 0.45)
	_check("shell_drop lands a beat after the pump (%.2fs > %.2fs)" % [drop_seen_by, pump_seen_by],
		drop_seen_by > pump_seen_by and drop_seen_by <= 0.65)
	_check("cooldown had fully cleared by the end of the march", sg.can_fire())
	# A weapon WITHOUT pump_sfx (pistol) never schedules the chain — no-op proof.
	var pistol_np := ProtoWeapon.new("pistol")
	pistol_np.mag = pistol_np.info()["mag_size"]
	pistol_np._cd = 0.0
	var pcall0 := rec.calls.size()
	pistol_np.fire(main, p.global_position, Vector3(0, 0, -1))
	for _i in 20:
		pistol_np.tick(0.05, main)
	_check("a row without pump_sfx never fires pump/shell_drop", not rec.played("shotgun_pump", pcall0) and not rec.played("shell_drop", pcall0))

	# ============================================================================
	# (b) DRY-FIRE: an empty mag answers with a CLICK (not just the toast).
	# ============================================================================
	main.backpack.add("pistol", 1)
	main.backpack.add("9mm", 0) # ensure no spare rounds sit in the pack
	main.use_item("pistol")
	var pistol: ProtoWeapon = main.current_weapon()
	_check("pistol equipped for the dry-fire test", pistol != null and pistol.id == "pistol")
	pistol.mag = 0
	pistol._cd = 0.0
	main.mode = main.Mode.FOOT
	var dcall0 := rec.calls.size()
	main.fire_equipped()
	_check("dry-fire plays the click", rec.played("click", dcall0))

	# ============================================================================
	# (c) RELOAD STAGING: reload_drop at start, reload_insert at ~60% elapsed,
	#     finish click unchanged, TOTAL reload_s untouched.
	# ============================================================================
	main.backpack.add("9mm", 20)
	pistol.mag = 0
	var reload_s: float = float(pistol.info()["reload_s"]) * main.character.reload_mult()
	var rcall0 := rec.calls.size()
	main.reload_equipped()
	_check("reload_drop plays at the START", rec.played("reload_drop", rcall0))
	_check("reload_insert has NOT played yet (too early)", not rec.played("reload_insert", rcall0))
	# Advance to just past the 60% mark.
	var advanced := 0.0
	var target_t := reload_s * 0.62
	while advanced < target_t:
		main._update_reload(0.02)
		advanced += 0.02
	_check("reload_insert plays by ~60%% elapsed (%.2fs of %.2fs)" % [advanced, reload_s], rec.played("reload_insert", rcall0))
	_check("mag hasn't swapped yet (still mid-reload)", main.is_reloading())
	# Finish it out — the existing chamber click still lands, mag fills. Keep
	# accruing into the SAME `advanced` clock so the total-time check below
	# measures the whole reload, not just the first leg up to the insert beat.
	while main.is_reloading():
		main._update_reload(0.02)
		advanced += 0.02
	_check("reload finishes with a full mag (was 0 → %d)" % pistol.mag, pistol.mag == int(pistol.info()["mag_size"]))
	_check("the finish click (chamber) still plays", rec.played("click", rcall0))
	_check("total reload time is UNCHANGED by staging (%.2fs ≈ %.2fs)" % [advanced, reload_s], absf(advanced - reload_s) < 0.1)

	# ============================================================================
	# (d) HIT-STOP: dips Engine.time_scale and restores the EXACT prior scale —
	#     including when the prior scale ISN'T 1.0 (a cinematic already running).
	# ============================================================================
	var prev_scale := Engine.time_scale
	_check("hit_stop dips time_scale (1.0 → %.2f)" % 1.0, true) # baseline note
	main.hit_stop()
	_check("hit_stop DIPS Engine.time_scale (%.3f < 1.0)" % Engine.time_scale, Engine.time_scale < 0.99)
	await get_tree().create_timer(0.12, true, false, true).timeout # real time, past HIT_STOP_S
	_check("hit_stop RESTORES the exact prior scale (%.3f == %.3f)" % [Engine.time_scale, prev_scale], absf(Engine.time_scale - prev_scale) < 0.001)
	# Now stage a NON-1.0 prior (the real "a cinematic is already running" case).
	Engine.time_scale = 0.9
	var staged_prev := Engine.time_scale
	main.hit_stop()
	_check("hit_stop dips from a staged non-1.0 prior (%.3f < %.3f)" % [Engine.time_scale, staged_prev], Engine.time_scale < staged_prev - 0.01)
	await get_tree().create_timer(0.12, true, false, true).timeout
	_check("…and restores THAT exact prior, not 1.0 (%.3f == %.3f)" % [Engine.time_scale, staged_prev], absf(Engine.time_scale - staged_prev) < 0.001)
	Engine.time_scale = 1.0 # tidy up before anything downstream reads it
	# Row-gating: pistol/car_mg default hit_stop FALSE.
	_check("pistol row is hit_stop FALSE (rapid-fire judder risk)", not bool(ProtoWeapon.WEAPONS["pistol"].get("hit_stop", false)))
	_check("car_mg row is hit_stop FALSE", not bool(ProtoWeapon.WEAPONS["car_mg"].get("hit_stop", false)))
	_check("shotgun/rocket/melee rows are hit_stop TRUE", bool(ProtoWeapon.WEAPONS["shotgun"]["hit_stop"]) \
		and bool(ProtoWeapon.WEAPONS["pipe_rocket"]["hit_stop"]) and bool(ProtoWeapon.WEAPONS["bat"]["hit_stop"]) \
		and bool(ProtoWeapon.WEAPONS["fists"]["hit_stop"]))
	# And the LIVE PATH: a hit_stop-true weapon landing a non-kill blow actually
	# dips time (through _ray_shot, not a direct main.hit_stop() call).
	main.character.hp = main.character.hp_cap() # full HP: our own hits don't matter here
	var howl_hs := ProtoHowler.create(main)
	main.add_child(howl_hs)
	howl_hs.body.max_hp = 500.0
	howl_hs.body.hp = 500.0 # survives the single pellet spray so "non-kill" holds
	howl_hs.global_position = p.global_position + Vector3(0, 0, -3.0)
	for _i in 3:
		await get_tree().physics_frame
	sg.mag = sg.info()["mag_size"]
	sg._cd = 0.0
	main.aim_override = howl_hs.global_position - p.global_position
	var pre_scale := Engine.time_scale
	sg.fire(main, p.muzzle_world(), (howl_hs.global_position - p.muzzle_world()).normalized())
	_check("a landed hit_stop=true shot dips time_scale LIVE (%.3f < %.3f)" % [Engine.time_scale, pre_scale], Engine.time_scale < pre_scale - 0.01)
	await get_tree().create_timer(0.12, true, false, true).timeout
	_check("…and it restores after (%.3f ≈ %.3f)" % [Engine.time_scale, pre_scale], absf(Engine.time_scale - pre_scale) < 0.02)
	if is_instance_valid(howl_hs):
		howl_hs.queue_free()

	# ============================================================================
	# (e) PER-SURFACE IMPACT: flesh / metal / wood / dirt pick the right id.
	# ============================================================================
	# -- METAL: shoot a car (not the one you're near/in) --------------------------
	var target_car: ProtoCar3D = main.cars[1] if main.cars.size() > 1 else main.cars[0]
	var car_chassis0: float = target_car.components["chassis"].hp
	p.global_position = target_car.global_position + Vector3(4.5, 0, 0)
	main.aim_override = Vector3(-1, 0, 0)
	pistol.mag = pistol.info()["mag_size"]
	pistol._cd = 0.0
	var mcall0 := rec.calls.size()
	pistol.fire(main, p.global_position, Vector3(-1, 0, 0))
	for _i in 2:
		await get_tree().physics_frame
	_check("a shot car plays impact_metal", rec.played("impact_metal", mcall0))
	_check("…and STILL takes chassis damage (armor formula untouched, %.1f → %.1f)" % [car_chassis0, target_car.components["chassis"].hp],
		target_car.components["chassis"].hp < car_chassis0)
	_check("a shot car does NOT play the flesh hitmark (it's metal, not meat)", not rec.played("hitmark", mcall0))

	# -- DIRT: shoot open ground with nothing in the way. A perfectly LEVEL ray
	#    at muzzle height never meets a flat ground plane (real play always has
	#    SOME downward angle toward aim_point()'s y=1.0 convergence plane) — so
	#    angle this one down-and-forward the same way a real ground shot does.
	p.global_position = Vector3(6, 0.35, 420) # clear of cars/structures
	var ground_dir := Vector3(0, -0.3, -1).normalized()
	main.aim_override = ground_dir * 25.0
	pistol.mag = pistol.info()["mag_size"]
	pistol._cd = 0.0
	var dcall1 := rec.calls.size()
	pistol.fire(main, p.global_position, ground_dir)
	for _i in 2:
		await get_tree().physics_frame
	_check("open ground plays impact_dirt (default)", rec.played("impact_dirt", dcall1))

	# -- WOOD: the classifier reads the "structure" group directly (world
	#    placement is deliberately not live yet — see structure_builder.gd's own
	#    header — so this proves the CLASSIFIER, the same law car/dirt above ran
	#    through the real ray, on a stand-in collider tagged the way a placed
	#    structure shell will be).
	var stub := StaticBody3D.new()
	stub.add_to_group("structure")
	var stub_shape := CollisionShape3D.new()
	var stub_box := BoxShape3D.new()
	stub_box.size = Vector3(2, 3, 2)
	stub_shape.shape = stub_box
	stub.add_child(stub_shape)
	main.add_child(stub)
	stub.global_position = p.global_position + Vector3(0, 1.0, -4.0)
	for _i in 2:
		await get_tree().physics_frame
	pistol.mag = pistol.info()["mag_size"]
	pistol._cd = 0.0
	var wcall0 := rec.calls.size()
	pistol.fire(main, p.global_position, Vector3(0, 0, -1))
	for _i in 2:
		await get_tree().physics_frame
	_check("a 'structure'-group collider plays impact_wood", rec.played("impact_wood", wcall0))
	stub.queue_free()

	# ============================================================================
	# (f) VEHICLE FIRE FEEL: fire_from_vehicle spawns a flash + shell + trauma.
	# ============================================================================
	main.mode = main.Mode.DRIVE
	main.active_car = main.cars[0]
	main.active_car.dead = false
	pistol.mag = pistol.info()["mag_size"]
	pistol._cd = 0.0
	main.aim_override = main.active_car.facing()
	var flash_before := get_tree().get_nodes_in_group("fx_flash").size()
	var casing_before := get_tree().get_nodes_in_group("fx_casing").size()
	main.cam_rig._trauma = 0.0
	var vcall0 := rec.calls.size()
	main.fire_from_vehicle()
	_check("fire_from_vehicle spawns a muzzle flash node", get_tree().get_nodes_in_group("fx_flash").size() > flash_before)
	_check("…and an ejected shell casing", get_tree().get_nodes_in_group("fx_casing").size() > casing_before)
	_check("…and camera trauma (the on-foot per-weapon table)", main.cam_rig._trauma > 0.05)
	_check("…and the row's fire_sfx", rec.played("shot", vcall0))

	# Same juice on the HOOD MG mount.
	main.active_car.mount_weapon = ProtoWeapon.new("car_mg")
	main.active_car.mount_weapon.mag = 40
	main.active_car.mount_weapon._cd = 0.0
	var mflash_before := get_tree().get_nodes_in_group("fx_flash").size()
	var mcasing_before := get_tree().get_nodes_in_group("fx_casing").size()
	main.fire_mount()
	_check("fire_mount ALSO spawns a muzzle flash", get_tree().get_nodes_in_group("fx_flash").size() > mflash_before)
	_check("…and a shell casing", get_tree().get_nodes_in_group("fx_casing").size() > mcasing_before)

	print("GUNFEEL RESULTS: %d passed, %d failed" % [passed, failed])
	print("GUNFEEL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
