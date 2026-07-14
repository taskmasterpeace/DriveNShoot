## WEATHER AS A FIELD, not a filter (docs/design/WEATHER_AND_SEASONS.md, track W):
## 0–4 storm SYSTEMS drift over the map as discs with smoothstep gradients —
## "you can't have rain in a square" (owner). Taxes are sampled WHERE YOU ARE
## (W-INT/W-TAX); spawning is deterministic per game-hour (W-SPAWN); the
## calendar turns (W-SEASON, 7-day seasons); rain WETS the population cells it
## actually covers (W-WET → water_rot — MUD_AND_MONSTERS reads it).
## COMPAT SHIM (binding): STATES rows, grip_now, state, force(), restore(),
## vision_mult() all survive — every shipped consumer keeps working; `state` is
## now DERIVED (the dominant system over the player).
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

# --- THE FIELD (W-INT) --------------------------------------------------------
const MAX_SYSTEMS := 4
const CORE_FRAC := 0.45          ## full intensity inside radius·CORE_FRAC (0.3–0.6)
const SIZES: Dictionary = {"rain": 2600.0, "dust": 3200.0, "heat": 4200.0}
const TTL_H: Dictionary = {"rain": 5.0, "dust": 3.0, "heat": 8.0}   ## game-hours
const SEASONS: PackedStringArray = ["SPRING", "SUMMER", "AUTUMN", "WINTER"]
const SEASON_DAYS := 7
const DARK_OFFSET_H: PackedFloat32Array = [0.0, -1.5, 0.5, 1.5]     ## night length swing
const SEASON_RAIN_MULT: PackedFloat32Array = [1.3, 1.0, 1.2, 0.7]   ## storm frequency by season
const K_WET := 0.15              ## W-WET: water_rot gain per gh at I=1 (0.05–0.3)
const WET_BASE := 0.25           ## mean-revert target when dry
const WET_REVERT := 0.02         ## per gh

## Cars read this per frame (default 1.0 so every sim without weather is dry).
static var grip_now: float = 1.0

## THE SKY GRADE (fidelity loop it.10 — "rain is invisible"): visual channels
## daynight applies to the sun/ambient, same static pattern as grip_now.
## kind -> [dim, tint, max tint amount] — scaled by local intensity.
static var sky_dim: float = 1.0
static var sky_tint: Color = Color(1, 1, 1)
static var sky_tint_amt: float = 0.0
static var fog_mult: float = 1.0 ## WET AIR (it.12): storms thicken the distance haze
## kind -> [dim, tint, max tint amount, fog mult at full intensity]
const GRADE: Dictionary = {
	"rain": [0.85, Color(0.55, 0.62, 0.72), 0.42, 2.3],
	"dust": [0.90, Color(0.85, 0.64, 0.38), 0.38, 3.2],
	"heat": [1.00, Color(1.00, 0.84, 0.62), 0.16, 1.15],
}

## Active storm systems: {kind, pos: Vector2, radius, vel: Vector2 (m/s), ttl_h, age_h}
var systems: Array = []
var state: String = "clear" ## DERIVED: the dominant kind over the player (compat)
var _main: Node = null
var _last_wx_h: float = -1.0
var _forced_until_h: float = -1.0 ## force() pins the derived state for sims/moments
var _fx_root: Node3D = null ## the weather made VISIBLE — streaks/motes ride the probe
var _rain_fx: CPUParticles3D = null
var _dust_fx: CPUParticles3D = null


static func create(main: Node) -> ProtoWeather:
	var w := ProtoWeather.new()
	w._main = main
	return w


# --- W-INT: the gradient law (no squares, no lines) ---------------------------

func _fade(s: Dictionary) -> float:
	var ttl: float = float(s["ttl_h"])
	var age: float = float(s["age_h"])
	if ttl <= 0.0:
		return 1.0
	var up := clampf(age / (ttl * 0.10), 0.0, 1.0)          # ramps in over the first 10%
	var down := clampf((ttl - age) / (ttl * 0.20), 0.0, 1.0) # ramps out over the last 20%
	return minf(up, down)


## Intensity 0..1 of a KIND (or any kind when "") at a world position.
func intensity_at(pos: Vector3, kind: String = "") -> float:
	var best := 0.0
	var p2 := Vector2(pos.x, pos.z)
	for s in systems:
		if kind != "" and String(s["kind"]) != kind:
			continue
		var r: float = float(s["radius"])
		var d: float = (s["pos"] as Vector2).distance_to(p2)
		if d >= r:
			continue
		var edge := 1.0 - smoothstep(r * CORE_FRAC, r, d)
		best = maxf(best, edge * _fade(s))
	return best


## The dominant system kind at a position ("" when the sky is effectively clear).
func kind_at(pos: Vector3) -> String:
	var best_k := ""
	var best_i := 0.05
	var p2 := Vector2(pos.x, pos.z)
	for s in systems:
		var r: float = float(s["radius"])
		var d: float = (s["pos"] as Vector2).distance_to(p2)
		if d >= r:
			continue
		var i := (1.0 - smoothstep(r * CORE_FRAC, r, d)) * _fade(s)
		if i > best_i:
			best_i = i
			best_k = String(s["kind"])
	return best_k


func vision_mult() -> float:
	# W-TAX at the player: lerp(1, kind.vision, I) — the gradient made felt
	if _main != null and "player" in _main and _main.player != null:
		var pos: Vector3 = _main.player.global_position
		var k := kind_at(pos)
		if k != "":
			return lerpf(1.0, float(STATES[k]["vision"]), intensity_at(pos, k))
	return float(STATES[state]["vision"]) # compat fallback (forced state, no field)


func icon() -> String:
	return STATES[state]["icon"]


func label() -> String:
	return STATES[state]["label"]


func season() -> int:
	var day := 1
	if _main != null and "daynight" in _main and _main.daynight != null:
		day = int(_main.daynight.day)
	return int(float(day) / float(SEASON_DAYS)) % 4


func season_name() -> String:
	return SEASONS[season()]


func dark_offset_h() -> float:
	return DARK_OFFSET_H[season()]


# --- COMPAT: force() / restore() ------------------------------------------------

## Force a state (dev mode, sims, scripted moments). Spawns a system CENTERED on
## the player so the field agrees with the fiat. 0 duration = a standard cell.
func force(state_in: String, duration: float = 0.0) -> void:
	if not STATES.has(state_in):
		return
	state = state_in
	if state_in == "clear":
		# The fiat means CLEAR THE SKY — the old filter removed only "clear"-kind
		# systems (none exist), so the storm disc stayed and re-derived its state
		# a frame later (the probe's stuck-RAIN banner).
		systems.clear()
	systems = systems.filter(func(s: Dictionary) -> bool: return String(s["kind"]) != state_in)
	if state_in != "clear":
		var center := Vector2.ZERO
		if _main != null and "player" in _main and _main.player != null:
			center = Vector2(_main.player.global_position.x, _main.player.global_position.z)
		systems.append({"kind": state_in, "pos": center, "radius": float(SIZES.get(state_in, 2600.0)),
			"vel": Vector2(4.0, 1.5), "ttl_h": (duration / 60.0) if duration > 0.0 else float(TTL_H.get(state_in, 4.0)),
			"age_h": 0.4}) # age past the ramp-in so the fiat is at full strength NOW
	ProtoWeather.grip_now = STATES[state]["grip"]
	_forced_until_h = -1.0 if state_in == "clear" else _now_h() + (duration / 60.0 if duration > 0.0 else 2.0)
	if _main and _main.has_method("notify") and state != "clear":
		_main.notify("%s %s — the sky turns on you" % [icon(), label()])


## Silent restore from a save — set the sky back without the "turns on you" toast.
func restore(state_in: String) -> void:
	if not STATES.has(state_in):
		return
	state = state_in
	ProtoWeather.grip_now = STATES[state]["grip"]


func serialize() -> Dictionary:
	var out: Array = []
	for s in systems:
		out.append({"kind": s["kind"], "pos": [s["pos"].x, s["pos"].y], "radius": s["radius"],
			"vel": [s["vel"].x, s["vel"].y], "ttl_h": s["ttl_h"], "age_h": s["age_h"]})
	return {"state": state, "systems": out}


func restore_field(data: Dictionary) -> void:
	restore(String(data.get("state", "clear")))
	systems.clear()
	for s in data.get("systems", []):
		systems.append({"kind": String(s["kind"]), "pos": Vector2(float(s["pos"][0]), float(s["pos"][1])),
			"radius": float(s["radius"]), "vel": Vector2(float(s["vel"][0]), float(s["vel"][1])),
			"ttl_h": float(s["ttl_h"]), "age_h": float(s["age_h"])})


func _now_h() -> float:
	if _main != null and "daynight" in _main and _main.daynight != null:
		return float(_main.daynight.day) * 24.0 + float(_main.daynight.hour)
	return 0.0


func _physics_process(delta: float) -> void:
	# systems DRIFT (real seconds; a storm crosses its own radius in ~10 min)
	var gh_per_s := 24.0 / (24.0 * 60.0) # 24-min day: 1 real second = 1 game-minute
	for s in systems:
		s["pos"] = (s["pos"] as Vector2) + (s["vel"] as Vector2) * delta
		s["age_h"] = float(s["age_h"]) + delta * gh_per_s
	systems = systems.filter(func(s: Dictionary) -> bool: return float(s["age_h"]) < float(s["ttl_h"]))

	# W-TAX at the bodies that pay them
	var now_h := _now_h()
	var probe: Node3D = null
	if _main != null and "active_car" in _main and _main.active_car != null and is_instance_valid(_main.active_car):
		probe = _main.active_car
	elif _main != null and "player" in _main and _main.player != null:
		probe = _main.player
	# THE FIAT PIN (compat law): while force() holds, the row applies EVERYWHERE
	# — sims and scripted moments teleport, and the sky must follow the fiat,
	# not the disc they left behind. The field resumes when the pin expires.
	if now_h <= _forced_until_h and state != "clear":
		ProtoWeather.grip_now = STATES[state]["grip"]
		var fwear: float = STATES[state]["engine_wear"]
		if fwear > 0.0 and _main != null and "active_car" in _main and _main.active_car != null \
				and is_instance_valid(_main.active_car) and _main.active_car.input_throttle > 0.2:
			_main.active_car.components["engine"].damage(fwear * delta)
		if _last_wx_h < 0.0:
			_last_wx_h = now_h
		_update_fx(probe, state, 1.0)
		return
	if probe != null:
		var k := kind_at(probe.global_position)
		var i := intensity_at(probe.global_position, k) if k != "" else 0.0
		_update_fx(probe, k, i)
		ProtoWeather.grip_now = lerpf(1.0, float(STATES.get(k, STATES["clear"])["grip"]), i) if k != "" else 1.0
		var wear: float = (float(STATES[k]["engine_wear"]) * i) if k != "" else 0.0
		if wear > 0.0 and _main != null and "active_car" in _main and _main.active_car != null \
				and is_instance_valid(_main.active_car) and _main.active_car.input_throttle > 0.2:
			_main.active_car.components["engine"].damage(wear * delta)
		# the derived headline state (compat consumers read it) — forced states pin
		if now_h > _forced_until_h:
			var new_state := k if i > 0.35 else "clear"
			if new_state != state:
				state = new_state
				if _main and _main.has_method("notify"):
					if state != "clear":
						_main.notify("%s %s — the sky turns on you" % [icon(), label()])
					else:
						_main.notify("☀️ The sky clears")

	# THE HOURLY TICK: W-SPAWN + W-WET ride the game clock
	if _last_wx_h < 0.0:
		_last_wx_h = now_h
	elif now_h - _last_wx_h >= 1.0:
		var hours := int(now_h - _last_wx_h)
		_last_wx_h = now_h
		_hour_tick(hours)


func _hour_tick(hours: int) -> void:
	var day := int(_now_h() / 24.0)
	var hour := int(fmod(_now_h(), 24.0))
	# W-SPAWN: deterministic per (day, hour, slot) — same save, same storms
	for slot in range(MAX_SYSTEMS):
		if systems.size() >= MAX_SYSTEMS:
			break
		var rng := RandomNumberGenerator.new()
		rng.seed = hash("wx:%d:%d:%d" % [day, hour, slot])
		var um := ProtoUSMap.get_default()
		if um == null or not um.ok:
			break
		# candidate region: a deterministic point in the mapped world
		var cx := rng.randf_range(-55000.0, 12000.0)
		var cz := rng.randf_range(-20000.0, 18000.0)
		var biome := um.biome_at(Vector3(cx, 0, cz))
		var weights: Dictionary = BIOME_WEATHER.get(biome, {})
		var total := 0.0
		for kk in weights:
			total += float(weights[kk]) * (SEASON_RAIN_MULT[season()] if String(kk) == "rain" else 1.0)
		if rng.randf() >= total * 0.5: # ~one system per few hours per region class
			continue
		var pick := rng.randf() * total
		var acc := 0.0
		for kk in weights:
			acc += float(weights[kk]) * (SEASON_RAIN_MULT[season()] if String(kk) == "rain" else 1.0)
			if pick < acc:
				var vel := Vector2(rng.randf_range(2.0, 7.0), rng.randf_range(-2.5, 2.5))
				systems.append({"kind": String(kk), "pos": Vector2(cx, cz),
					"radius": float(SIZES.get(String(kk), 2600.0)) * rng.randf_range(0.85, 1.15),
					"vel": vel, "ttl_h": float(TTL_H.get(String(kk), 4.0)) * rng.randf_range(0.8, 1.3),
					"age_h": 0.0})
				break
	# W-WET: rain wets the population cells it actually covers (MUD + the
	# ecosystem read this). Lives in eco.water_rot now (LWE §3.2) — the plain
	# water_rot key is kept in sync for MUD's shipped consumer.
	if _main != null and "population" in _main and _main.population != null:
		for key in _main.population.cells:
			var row: Dictionary = _main.population.cells[key]
			var parts: PackedStringArray = String(key).split(",")
			var um2: ProtoUSMap = _main.population.usmap
			var c2: Vector2 = um2.cell_center(Vector2i(int(parts[0]), int(parts[1]))) if (um2 != null and um2.ok) else Vector2.ZERO
			var i_rain := intensity_at(Vector3(c2.x, 0, c2.y), "rain")
			var eco: Dictionary = row.get("eco", {})
			var rot := float(eco.get("water_rot", row.get("water_rot", WET_BASE)))
			if i_rain > 0.0:
				rot = minf(1.0, rot + K_WET * i_rain * float(hours))
			else:
				rot = move_toward(rot, WET_BASE, WET_REVERT * float(hours))
			row["water_rot"] = rot
			if not eco.is_empty():
				eco["water_rot"] = rot


# --- THE WEATHER MADE VISIBLE (fidelity loop it.10: "rain is invisible") --------
# Streaks/motes ride the probe (fixed amounts, tints on their OWN materials —
# the black-ball law); the sky grade rides the static channels daynight applies.

func _update_fx(probe: Node3D, k: String, i: float) -> void:
	if k != "" and GRADE.has(k):
		var g: Array = GRADE[k]
		ProtoWeather.sky_dim = lerpf(1.0, float(g[0]), i)
		ProtoWeather.sky_tint = g[1]
		ProtoWeather.sky_tint_amt = float(g[2]) * i
		ProtoWeather.fog_mult = lerpf(1.0, float(g[3]), i)
	else:
		ProtoWeather.sky_dim = 1.0
		ProtoWeather.sky_tint_amt = 0.0
		ProtoWeather.fog_mult = 1.0
	if probe == null or _main == null or not is_inside_tree():
		return
	if _fx_root == null:
		_fx_root = Node3D.new()
		_main.add_child(_fx_root)
		_rain_fx = _make_rain_fx()
		_fx_root.add_child(_rain_fx)
		_dust_fx = _make_dust_fx()
		_fx_root.add_child(_dust_fx)
	_fx_root.global_position = probe.global_position
	_rain_fx.emitting = k == "rain" and i > 0.12
	_dust_fx.emitting = k == "dust" and i > 0.12


## Falling STREAKS: thin billboarded quads sheeting down over the probe.
func _make_rain_fx() -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.amount = 220 # FIXED — the restart law
	p.lifetime = 0.7
	var q := QuadMesh.new()
	q.size = Vector2(0.05, 0.6) # ~3px at the gameplay camera — thinner vanished
	var m := StandardMaterial3D.new()
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.vertex_color_use_as_albedo = false # the law: tint lives HERE
	m.albedo_color = Color(0.66, 0.72, 0.84, 0.55)
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	q.material = m
	p.mesh = q
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	p.emission_box_extents = Vector3(16.0, 0.5, 16.0)
	p.position = Vector3(0, 13.0, 0)
	p.direction = Vector3(0.12, -1.0, 0.06)
	p.spread = 2.0
	p.initial_velocity_min = 22.0
	p.initial_velocity_max = 27.0
	p.gravity = Vector3.ZERO
	p.emitting = false
	return p


## Drifting DUST: soft amber motes streaming sideways through the storm.
func _make_dust_fx() -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.amount = 150 # FIXED — the restart law
	p.lifetime = 1.8
	var q := QuadMesh.new()
	q.size = Vector2(0.5, 0.5)
	var m := ProtoFX.puff_material()
	m.albedo_color = Color(0.70, 0.55, 0.34, 0.22)
	q.material = m
	p.mesh = q
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	p.emission_box_extents = Vector3(15.0, 4.0, 15.0)
	p.position = Vector3(0, 3.0, 0)
	p.direction = Vector3(1.0, 0.06, 0.3)
	p.spread = 9.0
	p.initial_velocity_min = 6.0
	p.initial_velocity_max = 11.0
	p.gravity = Vector3(0.5, 0.15, 0.2)
	p.emitting = false
	return p
