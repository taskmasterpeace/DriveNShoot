extends Node
## Guards continuous clock-driven lighting and a real ambient night floor.
var passed: int = 0
var failed: int = 0

func _ready() -> void:
	var sun: DirectionalLight3D = DirectionalLight3D.new()
	add_child(sun)
	var environment: Environment = Environment.new()
	environment.sky = Sky.new()
	environment.sky.sky_material = ProceduralSkyMaterial.new()
	var clock: ProtoDayNight = ProtoDayNight.new()
	add_child(clock)
	clock.set_physics_process(false)
	clock.setup(sun, environment)
	clock.moon_phase = 0.0
	clock.hour = 0.0
	clock._apply()
	check("ambient night floor actually participates", environment.ambient_light_sky_contribution < 0.9 and environment.ambient_light_color.get_luminance() > 0.1)
	var max_jump: float = 0.0
	var previous: float = sun.light_energy
	var colors: Array[Color] = light_colors(sun,environment)
	var color_jump: float = 0.0
	for minute: int in range(1, 1441):
		clock.hour = fmod(minute / 60.0, 24.0)
		clock._apply()
		max_jump = maxf(max_jump, absf(sun.light_energy-previous))
		previous = sun.light_energy
		var current: Array[Color] = light_colors(sun,environment)
		for i: int in current.size():
			var change: Color = current[i]-colors[i]
			color_jump = maxf(color_jump,maxf(absf(change.r),maxf(absf(change.g),absf(change.b))))
		colors = current
	check("sunrise and sunset do not switch abruptly (max minute %.3f)" % max_jump, max_jump < 0.035)
	check("sun sky fog and ambient colors blend (max minute %.3f)" % color_jump, color_jump < 0.035)
	clock.hour = 0.0
	clock._apply()
	var night_ambient: float = environment.ambient_light_energy
	ProtoWeather.sky_dim = 0.0
	clock._apply()
	check("storm cannot erase ambient night floor", environment.ambient_light_energy >= night_ambient)
	ProtoWeather.sky_dim = 1.0
	clock.moon_phase = 1.0
	clock._apply()
	check("moon phase brightens ambient as well as direct light", environment.ambient_light_energy > night_ambient)
	check("night sight rules unchanged", is_equal_approx(clock.vision_mult(),0.75))
	clock.moon_phase = 0.0
	check("new moon sight rules unchanged", is_equal_approx(clock.vision_mult(),0.4))
	print("LIGHTING STATE RESULTS: %d passed, %d failed" % [passed, failed])
	get_tree().quit(0 if failed == 0 else 1)

func light_colors(sun: DirectionalLight3D, environment: Environment) -> Array[Color]:
	var sky: ProceduralSkyMaterial = environment.sky.sky_material
	return [sun.light_color,sky.sky_top_color,sky.sky_horizon_color,
		environment.fog_light_color,environment.ambient_light_color]

func check(label: String, result: bool) -> void:
	passed += int(result)
	failed += int(not result)
	print("LIGHTING STATE: %s %s" % ["PASS" if result else "FAIL", label])
