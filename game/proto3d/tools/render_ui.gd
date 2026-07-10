## VISUAL acceptance for the pixel UI wiring (2026-07-10): boot the REAL game, open the
## GPS map in STATE and COUNTRY modes, then force the drive HUD (gauges + plates) — and
## screenshot each. NON-headless (real GPU); the shots are the proof the frames/needles/
## markers land where the calibration says they do.
extends Node

const OUT := "C:/WINDOWS/TEMP/claude/D--git-carworld/8e5fe94c-3439-40ce-aa3c-9fe0a08b3d51/scratchpad/photobooth"


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
	})
	hud.set_hp(64.0, 90.0, true)
	hud.set_ammo("🔫", "pistol", 9, 34, true)
	print("RENDER_UI: gauge=%s hp_plate=%s ammo_plate=%s" % [hud._gauge.get_global_rect(), hud._hp_plate.get_global_rect(), hud._ammo_plate.get_global_rect()])
	await _shot("HUD_drive")
	get_tree().quit(0)
