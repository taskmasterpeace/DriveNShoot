## Proof for WEATHER TRACK W (docs/design/WEATHER_AND_SEASONS.md): the sky is a
## FIELD of drifting storm discs — W-INT's smoothstep gradient (never a line),
## W-TAX sampled where you stand, W-SPAWN deterministic per (day,hour,slot),
## W-SEASON's 7-day calendar, W-WET wetting the cells the rain actually covers
## (MUD_AND_MONSTERS reads water_rot), and the COMPAT SHIM (force/state/grip_now)
## holding for every shipped consumer. Save round-trips the whole field.
## Run: godot --headless --path game res://proto3d/tests/wx_field_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("WX: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _finish(prev_scale: float) -> void:
	Engine.time_scale = prev_scale
	print("WX RESULTS: %d passed, %d failed" % [passed, failed])
	print("WX: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)


func _ready() -> void:
	print("WX: start")
	var prev_scale := Engine.time_scale
	Engine.time_scale = 1.0
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("WX: WATCHDOG")
		failed += 1
		_finish(prev_scale))

	var main: Node = load("res://proto3d/proto3d.tscn").instantiate()
	add_child(main)
	for i in range(40):
		await get_tree().physics_frame
	var wx: ProtoWeather = main.weather
	_check("the weather node exists", wx != null)

	# --- 1) W-INT: the gradient law (no squares, no lines) -----------------------
	wx.systems = [{"kind": "rain", "pos": Vector2(50000, 50000), "radius": 2600.0,
		"vel": Vector2.ZERO, "ttl_h": 10.0, "age_h": 2.0}] # mid-life: fade = 1
	var core := wx.intensity_at(Vector3(50000, 0, 50000), "rain")
	var mid := wx.intensity_at(Vector3(50000 + 1900, 0, 50000), "rain")
	var rim := wx.intensity_at(Vector3(50000 + 2650, 0, 50000), "rain")
	_check("full downpour inside the core (I=%.2f at center)" % core, core > 0.99)
	_check("a GRADIENT between core and rim (I=%.2f strictly between)" % mid, mid > 0.05 and mid < 0.95)
	_check("nothing outside the disc (I=%.2f at r+50)" % rim, rim < 0.001)
	var smooth := true
	var prev := wx.intensity_at(Vector3(50000, 0, 50000), "rain")
	for k in range(20):
		var d := 2600.0 * (float(k) + 1.0) / 20.0
		var v := wx.intensity_at(Vector3(50000 + d, 0, 50000), "rain")
		if prev - v > 0.26 or v > prev + 0.001:
			smooth = false
		prev = v
	_check("crossing the disc is a smooth build, never a line (max step < 0.26 per 130 m)", smooth)

	# --- 2) W-TAX where you stand -------------------------------------------------
	var ppos: Vector3 = main.player.global_position
	wx._forced_until_h = -1.0
	wx.systems = [{"kind": "rain", "pos": Vector2(ppos.x, ppos.z), "radius": 2600.0,
		"vel": Vector2.ZERO, "ttl_h": 10.0, "age_h": 2.0}]
	for i in range(4):
		await get_tree().physics_frame
	_check("grip_now hits the rain row's 0.62 in the core (got %.2f)" % ProtoWeather.grip_now,
		absf(ProtoWeather.grip_now - 0.62) < 0.02)
	_check("the derived headline state reads 'rain' over the player", wx.state == "rain")
	# stand at the half-intensity band: the taxes soften with the gradient
	wx.systems[0]["pos"] = Vector2(ppos.x + 1793.0, ppos.z) # I ≈ 0.5 at the player
	for i in range(3):
		await get_tree().physics_frame
	var half_i := wx.intensity_at(ppos, "rain")
	_check("half-deep in the rain (I=%.2f): grip ~lerp band (got %.2f)" % [half_i, ProtoWeather.grip_now],
		ProtoWeather.grip_now > 0.63 and ProtoWeather.grip_now < 0.99)
	wx.systems.clear()
	for i in range(3):
		await get_tree().physics_frame
	_check("the sky clears when no system covers you (grip back to 1.0)",
		absf(ProtoWeather.grip_now - 1.0) < 0.01 and wx.state == "clear")

	# --- 3) W-SPAWN determinism ----------------------------------------------------
	main.daynight.day = 23
	main.daynight.hour = 10.0
	wx.systems.clear()
	wx._hour_tick(1)
	var first: Array = wx.systems.duplicate(true)
	wx.systems.clear()
	wx._hour_tick(1)
	var same := wx.systems.size() == first.size()
	for i in range(mini(wx.systems.size(), first.size())):
		if String(wx.systems[i]["kind"]) != String(first[i]["kind"]) \
				or (wx.systems[i]["pos"] as Vector2).distance_to(first[i]["pos"] as Vector2) > 0.1:
			same = false
	_check("W-SPAWN is deterministic (same day+hour+slot → the same storms, %d spawned)" % first.size(), same)

	# --- 4) W-SEASON: the 7-day calendar --------------------------------------------
	main.daynight.day = 8
	_check("day 8 is SUMMER (season 1)", wx.season() == 1 and wx.season_name() == "SUMMER")
	_check("...with SUMMER's short nights (dark offset -1.5 h)", is_equal_approx(wx.dark_offset_h(), -1.5))
	main.daynight.day = 22
	_check("day 22 is WINTER (season 3)", wx.season() == 3)

	# --- 5) W-WET: rain wets the cells it COVERS ------------------------------------
	var wet_pos := Vector3(-77000, 0, -77000)
	var dry_pos := Vector3(-77000, 0, -50000)
	var wet_row: Dictionary = main.population.cell_at(wet_pos)
	var dry_row: Dictionary = main.population.cell_at(dry_pos)
	var wet_center: Vector2 = main.population.usmap.cell_center(
		main.population.usmap.cell_of(wet_pos.x, wet_pos.z))
	wx.systems = [{"kind": "rain", "pos": wet_center, "radius": 2600.0,
		"vel": Vector2.ZERO, "ttl_h": 10.0, "age_h": 2.0}]
	wx._hour_tick(3)
	var wet_rot := float(wet_row.get("water_rot", 0.0))
	var dry_rot := float(dry_row.get("water_rot", 1.0))
	_check("3 game-hours of rain wets THE COVERED cell (water_rot %.2f >= 0.6)" % wet_rot, wet_rot >= 0.6)
	_check("...while the dry county stays dry (water_rot %.2f <= 0.3)" % dry_rot, dry_rot <= 0.3)
	wx.systems.clear()

	# --- 6) COMPAT: force() still rules for sims + moments ---------------------------
	wx.force("dust")
	for i in range(2):
		await get_tree().physics_frame
	_check("force('dust') pins the state and spawns its disc over the player",
		wx.state == "dust" and wx.systems.size() >= 1)
	wx.force("clear")

	# --- 7) the FIELD rides the save --------------------------------------------------
	wx.systems = [{"kind": "heat", "pos": Vector2(1, 2), "radius": 4200.0,
		"vel": Vector2(3, 0), "ttl_h": 8.0, "age_h": 1.0}]
	var dump: Dictionary = wx.serialize()
	wx.systems.clear()
	wx.restore_field(dump)
	_check("serialize/restore_field round-trips the storm systems",
		wx.systems.size() == 1 and String(wx.systems[0]["kind"]) == "heat")

	_finish(prev_scale)
