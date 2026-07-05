## THE CLOCK (WORLD_NPCS.md §5 — dawn/peak/dusk/curfew): a full day in 24 real
## minutes for the proto. Drives the sun, the sky, the fog, every vehicle's
## HEADLIGHTS — and the PERCEPTION ENGINE: night shrinks what you can see, which
## is the whole reason night is dangerous. Hold T to wait (the clock sprints;
## the world doesn't). NPC schedules (Stage 6) will read the same hour.
class_name ProtoDayNight
extends Node

const DAY_MINUTES := 24.0 ## real minutes per in-game day
const WAIT_MULT := 60.0   ## hold T: an hour passes in ~2.5s

var hour: float = 9.0 ## start mid-morning
var day: int = 1
var waiting: bool = false ## T held (sim hook)

var _sun: DirectionalLight3D = null
var _sky_mat: ProceduralSkyMaterial = null
var _env: Environment = null

## [top, horizon, fog] color presets the sky lerps through.
const SKY_DAY := [Color(0.55, 0.62, 0.7), Color(0.82, 0.72, 0.55), Color(0.78, 0.70, 0.55)]
const SKY_DUSK := [Color(0.30, 0.22, 0.30), Color(0.92, 0.45, 0.18), Color(0.55, 0.35, 0.25)]
const SKY_NIGHT := [Color(0.015, 0.025, 0.06), Color(0.04, 0.06, 0.11), Color(0.05, 0.07, 0.10)]


func setup(sun: DirectionalLight3D, env: Environment) -> void:
	_sun = sun
	_env = env
	_sky_mat = env.sky.sky_material as ProceduralSkyMaterial


func _physics_process(delta: float) -> void:
	var speed := WAIT_MULT if waiting else 1.0
	hour += delta * (24.0 / (DAY_MINUTES * 60.0)) * speed
	while hour >= 24.0:
		hour -= 24.0
		day += 1
	_apply()


## 1.0 at high noon → 0.0 deep night (drives light, sky, and sight).
func daylight() -> float:
	return clampf(sin((hour - 6.0) / 12.0 * PI), 0.0, 1.0) if hour >= 6.0 and hour <= 18.0 else 0.0


## Twilight ramps so dusk/dawn aren't a light switch (18-20h and 4:30-6h blend).
func _twilight() -> float:
	if hour > 18.0 and hour < 20.0:
		return 1.0 - (hour - 18.0) / 2.0
	if hour > 4.5 and hour < 6.0:
		return (hour - 4.5) / 1.5
	return 0.0


func is_dark() -> bool:
	return daylight() <= 0.02 and _twilight() < 0.4


## The perception engine's night tax: you SEE less after dark (0.55 deep night).
func vision_mult() -> float:
	var brightness := maxf(daylight(), _twilight() * 0.6)
	return lerpf(0.55, 1.0, clampf(brightness, 0.0, 1.0))


func clock_text() -> String:
	var h := int(hour)
	var m := int((hour - float(h)) * 60.0)
	var icon := "☀️" if not is_dark() else "🌙"
	if hour > 18.0 and hour < 20.5:
		icon = "🌆"
	return "%s %02d:%02d" % [icon, h, m]


func _apply() -> void:
	if _sun == null:
		return
	var dl := daylight()
	var tw := _twilight()
	var bright := maxf(dl, tw * 0.55)
	# The sun wheels overhead: rises east (6h), noon high, sets west (18h).
	_sun.rotation_degrees.x = -lerpf(4.0, 62.0, dl)
	_sun.rotation_degrees.y = -38.0 + (hour - 12.0) * 9.0
	_sun.light_energy = maxf(0.03, bright * 1.25)
	_sun.light_color = Color(1.0, 0.92, 0.78).lerp(Color(1.0, 0.6, 0.35), tw)
	if _env:
		_env.ambient_light_energy = 0.08 + 0.52 * bright
		_env.fog_light_color = SKY_NIGHT[2].lerp(SKY_DUSK[2] if tw > 0.0 else SKY_DAY[2], bright)
	if _sky_mat:
		var top: Color = SKY_NIGHT[0].lerp(SKY_DUSK[0] if tw > 0.0 else SKY_DAY[0], bright)
		var hor: Color = SKY_NIGHT[1].lerp(SKY_DUSK[1] if tw > 0.0 else SKY_DAY[1], bright)
		_sky_mat.sky_top_color = top
		_sky_mat.sky_horizon_color = hor
		_sky_mat.ground_horizon_color = hor
		_sky_mat.ground_bottom_color = top * 0.7
