## VISUAL acceptance for the pixel UI wiring (2026-07-10): boot the REAL game, open the
## GPS map in STATE and COUNTRY modes, then force the drive HUD (gauges + plates) — and
## screenshot each. NON-headless (real GPU); the shots are the proof the frames/needles/
## markers land where the calibration says they do.
extends Node

const OUT := "C:/WINDOWS/TEMP/claude/D--git-carworld/0f71b692-94b3-495a-9db8-c96fa73de59a/scratchpad/photobooth"


func _shot(name_out: String) -> void:
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	print("RENDER_UI: %s -> %s" % [name_out, "ok" if img.save_png("%s/%s.png" % [OUT, name_out]) == OK else "ERR"])


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(OUT)
	get_tree().create_timer(90.0).timeout.connect(func() -> void:
		print("RENDER_UI: WATCHDOG"); get_tree().quit(1))
	var main: Node3D = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 20:
		await get_tree().process_frame

	var stream: ProtoWorldStream = main.stream
	# 1) THE GPS — local, state, country (M, M, M).
	stream.toggle_map() # 1 local
	await _shot("GPS_local")
	stream.toggle_map() # 2 state
	var canvas: Control = stream._map_canvas
	var screen: Control = canvas.get_parent()
	var root: Control = screen.get_parent()
	print("RENDER_UI: root=%s screen=%s canvas=%s" % [root.get_global_rect(), screen.get_global_rect(), canvas.get_global_rect()])
	await _shot("GPS_state")
	stream.toggle_map() # 3 country
	await _shot("GPS_country")
	# THE PHONE SKIN (owner ask 2026-07-10): same map, 9:16 handheld.
	stream._swap_device_skin()
	await _shot("GPS_phone")
	stream._swap_device_skin() # back to the brick
	stream.toggle_map() # off

	# 2) THE DRIVE HUD — gauges + plates, forced through the real HUD calls.
	var hud: ProtoHUD = main.hud
	hud.set_speed(78.0, true)
	hud.set_dashboard({
		"engine": 0, "tires": 1, "battery": 0, "fuel_tank": 0, "chassis": 2,
		"ratios": {"engine": 0.9, "tires": 0.55, "battery": 0.8, "fuel_tank": 0.7, "chassis": 0.35},
		"fuel": 62.0, "on_fire": false, "cook": 38.0, "name": "Rustler",
		"surface": "road", "struggling": false, "tire_name": "stock",
		"drive_factor": 1.0, "load": 40.0, "load_max": 120.0, "vclass": "pickup", "rev": 4.6,
		"doll": ProtoCar3D.doll_spec_for("pickup"), # the damage doll reads spec rows
	})
	hud.set_hp(64.0, 90.0, true)
	hud.set_ammo("🔫", "pistol", 9, 34, true)
	print("RENDER_UI: gauge=%s hp_plate=%s ammo_plate=%s" % [hud._gauge.get_global_rect(), hud._hp_plate.get_global_rect(), hud._ammo_plate.get_global_rect()])
	await _shot("HUD_drive")

	# 2b) THE K SHEET — wounds read ON the body doll (staged torso + leg).
	var chr: ProtoCharacter = main.character
	(chr.body["torso"] as Damageable).hp = (chr.body["torso"] as Damageable).max_hp * 0.5
	(chr.body["r_leg"] as Damageable).hp = (chr.body["r_leg"] as Damageable).max_hp * 0.1
	main.hud.toggle_sheet(main._sheet_text(), main._body_tiers())
	await _shot("SHEET_body")
	main.hud.toggle_sheet("", {}) # close it again

	# 3) THE SKILL TREE (U) — pixel skill icons on every branch header.
	main.skill_tree.open()
	await _shot("SKILL_tree")
	main.skill_tree.close()

	# 4) THE PACK — pixel item icons on the rows (bridge icon_for).
	main.backpack.add("pistol", 1)
	main.backpack.add("9mm", 24)
	main.backpack.add("bandage", 3)
	main.backpack.add("canned_food", 2)
	main.backpack.add("jerry_can", 1)
	main.backpack.add("scrap", 8)
	main.backpack.add("painkillers", 2)
	main.backpack.add("duct_tape", 1)
	main.panel.open(main.backpack, null)
	await _shot("PACK_items")
	main.panel.close()

	# 5) GPS INTERACTIVITY — a zoomed+panned state view (wheel/chips/D-pad territory).
	stream.toggle_map()
	stream.toggle_map() # local -> state
	stream.zoom_at(stream._map_canvas.size * 0.5, 3.0)
	stream.pan_step(Vector2(1, 0))
	await _shot("GPS_state_zoom")
	stream._on_gps_button("power")

	# 6) THE CAR GPS — a REAL course through the live loop: equip the boot rig with
	# gps and select a waypoint; proto3d's own frame tick feeds the dash unit.
	main.active_car.spec["gps"] = true
	main.waypoint_idx = 0 # SAFEHOUSE
	for _i in 12:
		await get_tree().physics_frame
	await _shot("CARGPS")
	main.waypoint_idx = -1
	main.active_car.spec["gps"] = false

	# 7) HOTSPOT CALIBRATION — rebuild the device with the button outlines visible.
	stream.map_debug_buttons = true
	stream._map_layer.queue_free()
	stream._map_layer = null
	stream._map_canvas = null
	stream._map_panel = null
	stream._map_mode = 0
	stream.toggle_map()
	stream.toggle_map()
	await _shot("GPS_buttons_debug")
	stream._on_gps_button("power")
	get_tree().quit(0)
