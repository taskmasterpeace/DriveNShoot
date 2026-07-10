## THE WEATHER MADE VISIBLE proof — rain streaks + dust motes ride the probe on
## law-compliant emitters, the sky grade dims/cools with the storm, the night
## floor survives a midnight downpour, and force("clear") actually clears (the
## old filter left the storm disc alive and it re-derived RAIN a frame later).
## Run: godot --headless --path game res://proto3d/tests/weather_fx_sim.tscn
extends Node

var passed: int = 0
var failed: int = 0
var main: Node3D


func _check(check_name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("WXFX: PASS - %s" % check_name)
	else:
		failed += 1
		print("WXFX: FAIL - %s" % check_name)


func _ready() -> void:
	var dog := Timer.new()
	dog.wait_time = 40.0
	dog.one_shot = true
	dog.timeout.connect(func() -> void:
		print("WXFX: WATCHDOG — force quit")
		_finish())
	add_child(dog)
	dog.start()
	call_deferred("_run")


func _run() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 10:
		await get_tree().process_frame
	var wx: ProtoWeather = main.weather

	# --- RAIN: streaks on, law-compliant, sky graded ---
	wx.force("rain", 10.0)
	for _i in 5:
		await get_tree().physics_frame
	_check("rain streaks exist + emitting", wx._rain_fx != null and wx._rain_fx.emitting)
	_check("dust motes stay OFF in rain", wx._dust_fx != null and not wx._dust_fx.emitting)
	var rm := (wx._rain_fx.mesh as QuadMesh).material as StandardMaterial3D if wx._rain_fx != null else null
	_check("streaks obey the law (own material, no instance color, no ramp)",
		rm != null and not rm.vertex_color_use_as_albedo and wx._rain_fx.color_ramp == null)
	_check("sky grade cools + dims in rain (amt %.2f > 0.2, dim %.2f < 1.0)" % [ProtoWeather.sky_tint_amt, ProtoWeather.sky_dim],
		ProtoWeather.sky_tint_amt > 0.2 and ProtoWeather.sky_dim < 1.0)
	_check("WET AIR thickens the haze (fog x%.1f > 1.5)" % ProtoWeather.fog_mult,
		ProtoWeather.fog_mult > 1.5)

	# --- The night floor survives a midnight downpour (never blind) ---
	main.daynight.hour = 0.5
	for _i in 3:
		await get_tree().physics_frame
	_check("night floor survives the storm (sun %.3f >= 0.05)" % main.daynight._sun.light_energy,
		main.daynight._sun.light_energy >= 0.05)
	main.daynight.hour = 11.0

	# --- DUST: motes on, rain off ---
	wx.force("dust", 10.0)
	for _i in 5:
		await get_tree().physics_frame
	_check("dust motes on, rain streaks off", wx._dust_fx.emitting and not wx._rain_fx.emitting)
	var dm := (wx._dust_fx.mesh as QuadMesh).material as StandardMaterial3D
	_check("motes tint on their own material (amber-ish, r %.2f > 0.5)" % dm.albedo_color.r,
		dm != null and dm.albedo_color.r > 0.5 and not dm.vertex_color_use_as_albedo)

	# --- force(clear) CLEARS and STAYS clear (the stuck-banner regression) ---
	wx.force("clear")
	for _i in 40:
		await get_tree().physics_frame
	_check("force(clear) clears and STAYS clear (state %s, %d systems)" % [wx.state, wx.systems.size()],
		wx.state == "clear" and wx.systems.is_empty())
	_check("clear kills the grade (amt %.2f -> 0)" % ProtoWeather.sky_tint_amt,
		ProtoWeather.sky_tint_amt == 0.0 and ProtoWeather.sky_dim == 1.0)
	_check("clear thins the air back (fog x%.1f -> 1)" % ProtoWeather.fog_mult,
		ProtoWeather.fog_mult == 1.0)
	_check("clear kills the fx", not wx._rain_fx.emitting and not wx._dust_fx.emitting)
	_finish()


func _finish() -> void:
	print("WXFX RESULTS: %d passed, %d failed" % [passed, failed])
	if failed == 0:
		print("ALL CHECKS PASSED")
	get_tree().quit(0 if failed == 0 else 1)
