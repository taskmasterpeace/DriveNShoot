## WEATHER AS A MECHANIC, not a filter (goal: the world dictates when you travel).
## One state machine, data rows: each state taxes a real system — DUST collapses
## the vision cone (the perception engine IS the horror), RAIN kills tire grip,
## a HEAT WAVE cooks the engine block while you drive. Weather picks by BIOME
## (desert storms, forest rain) and rolls on a timer; devs/sims force() it.
class_name ProtoWeather
extends Node

## The rows. vision multiplies the cone range, grip multiplies tire friction,
## engine_wear = hp/s off the engine while driving under it.
const STATES: Dictionary = {
	"clear": {"icon": "", "vision": 1.0, "grip": 1.0, "engine_wear": 0.0, "label": ""},
	"dust": {"icon": "🌪", "vision": 0.18, "grip": 0.9, "engine_wear": 0.15, "label": "DUST STORM"},
	"rain": {"icon": "🌧", "vision": 0.6, "grip": 0.62, "engine_wear": 0.0, "label": "RAIN"},
	"heat": {"icon": "🥵", "vision": 0.9, "grip": 0.94, "engine_wear": 0.5, "label": "HEAT WAVE"},
}
## What each biome's sky tends to throw (weights; clear fills the rest).
const BIOME_WEATHER: Dictionary = {
	"desert": {"dust": 0.45, "heat": 0.3}, "scrub": {"dust": 0.25, "heat": 0.2},
	"plains": {"rain": 0.2, "dust": 0.1}, "farmland": {"rain": 0.3},
	"forest": {"rain": 0.35}, "swamp": {"rain": 0.5}, "mountains": {"rain": 0.25, "dust": 0.1},
	"urban": {"rain": 0.2},
}

## Cars read this per frame (default 1.0 so every sim without weather is dry).
static var grip_now: float = 1.0

var state: String = "clear"
var _t: float = 0.0
var _next_roll: float = 90.0 ## first front arrives within ~1.5 min
var _main: Node = null
var _rng := RandomNumberGenerator.new()


static func create(main: Node) -> ProtoWeather:
	var w := ProtoWeather.new()
	w._main = main
	w._rng.randomize()
	return w


func vision_mult() -> float:
	return STATES[state]["vision"]


func icon() -> String:
	return STATES[state]["icon"]


func label() -> String:
	return STATES[state]["label"]


## Force a state (dev mode, sims, scripted moments). 0 duration = roll normally.
func force(state_in: String, duration: float = 0.0) -> void:
	if not STATES.has(state_in):
		return
	state = state_in
	ProtoWeather.grip_now = STATES[state]["grip"]
	_t = 0.0
	_next_roll = duration if duration > 0.0 else _rng.randf_range(120.0, 300.0)
	if _main and _main.has_method("notify") and state != "clear":
		_main.notify("%s %s — the sky turns on you" % [icon(), label()])


## Silent restore from a save — set the sky back without the "turns on you" toast.
func restore(state_in: String) -> void:
	if not STATES.has(state_in):
		return
	state = state_in
	ProtoWeather.grip_now = STATES[state]["grip"]
	_t = 0.0


func _physics_process(delta: float) -> void:
	_t += delta
	ProtoWeather.grip_now = STATES[state]["grip"]
	# The HEAT tax: a running engine cooks (drive at noon in a heat wave and the
	# 5-part anatomy pays — repair loop already sells the fix).
	var wear: float = STATES[state]["engine_wear"]
	if wear > 0.0 and _main != null and "active_car" in _main and _main.active_car != null \
			and is_instance_valid(_main.active_car) and _main.active_car.input_throttle > 0.2:
		_main.active_car.components["engine"].damage(wear * delta)
	if _t >= _next_roll:
		_t = 0.0
		_next_roll = _rng.randf_range(120.0, 300.0)
		_roll()


## A front rolls in, weighted by the ground you're standing on.
func _roll() -> void:
	var biome := "scrub"
	if _main != null and "stream" in _main and _main.stream != null:
		var pos: Vector3 = _main.active_car.global_position if ("active_car" in _main and _main.active_car) else _main.player.global_position
		biome = _main.stream.biome_at(pos)
	var weights: Dictionary = BIOME_WEATHER.get(biome, {})
	var r := _rng.randf()
	var acc := 0.0
	for s in weights:
		acc += weights[s]
		if r < acc:
			force(s)
			return
	if state != "clear":
		state = "clear"
		ProtoWeather.grip_now = 1.0
		if _main and _main.has_method("notify"):
			_main.notify("☀️ The sky clears")
