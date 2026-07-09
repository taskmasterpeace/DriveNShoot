## THE ECOLOGY DIRECTOR (LIVING_WOUND_ECOSYSTEM.md P1 — the eco core): one
## RNG-free pressure loop over the population cells' eco floats, ticked on the
## game hour. Plants regrow (seasons multiply — WINTER is the hungry season),
## grazers eat them, predators follow the grazers with a lag, corpse heat draws
## and decays. Pure float math: deterministic, save-safe, and the same tick
## can replay an offline absence. Creatures-on-the-rig consume these floats
## (P1 part 2); this director never spawns anything itself.
class_name ProtoEcology
extends Node

## per-game-hour rates (LWE tuning-knob idiom; season_mult scales r_plant/r_graze)
const R_PLANT := 0.035        ## regrowth toward 1.0
const R_GRAZE := 0.06         ## food eaten per unit prey
const R_PREY_GROW := 0.03     ## prey logistic growth on food surplus
const R_PREY_DIE := 0.05      ## prey starvation + predation drain
const R_PRED_FOLLOW := 0.04   ## predator pressure chases prey (the lag)
const R_PRED_DECAY := 0.03
const CORPSE_DECAY := 0.05    ## heat cools per gh
const SEASON_PLANT: PackedFloat32Array = [1.5, 1.0, 0.7, 0.4]  ## SPRING…WINTER
const SEASON_GRAZE: PackedFloat32Array = [1.3, 1.0, 0.8, 0.6]

var _main: Node = null
var _last_h: float = -1.0


static func create(main: Node) -> ProtoEcology:
	var e := ProtoEcology.new()
	e._main = main
	return e


func _now_h() -> float:
	if _main != null and "daynight" in _main and _main.daynight != null:
		return float(_main.daynight.day) * 24.0 + float(_main.daynight.hour)
	return 0.0


func _physics_process(_delta: float) -> void:
	var now := _now_h()
	if _last_h < 0.0:
		_last_h = now
		return
	if now - _last_h >= 1.0:
		var hours := now - _last_h
		_last_h = now
		tick(hours)


## The pressure loop — every KNOWN cell (bootstrapped only; an untouched cell
## has no row and needs none). season comes from the weather calendar.
func tick(dt_gh: float) -> void:
	if _main == null or not ("population" in _main) or _main.population == null:
		return
	var season := 1
	if "weather" in _main and _main.weather != null and _main.weather is ProtoWeather:
		season = (_main.weather as ProtoWeather).season()
	var s_plant := SEASON_PLANT[season]
	var s_graze := SEASON_GRAZE[season]
	for key in _main.population.cells:
		var row: Dictionary = _main.population.cells[key]
		var eco: Dictionary = row.get("eco", {})
		if eco.is_empty():
			continue
		var food := float(eco.get("food_avail", 0.4))
		var prey := float(eco.get("prey_density", 0.15))
		var pred := float(eco.get("predator_pressure", 0.1))
		var heat := float(eco.get("corpse_heat", 0.0))
		var rot := float(eco.get("water_rot", 0.25))
		# plants: regrow toward 1, wet ground grows faster; grazers eat them
		food += (R_PLANT * s_plant * (0.7 + 0.6 * rot) * (1.0 - food) - R_GRAZE * s_graze * prey) * dt_gh
		# prey: grow on surplus food, die to hunger + predators
		prey += (R_PREY_GROW * prey * clampf(food - 0.3, -1.0, 1.0) * 3.0
			- R_PREY_DIE * prey * pred * 2.0) * dt_gh
		# predators: follow the prey with a lag, starve without it
		pred += (R_PRED_FOLLOW * clampf(prey - pred, -1.0, 1.0) - R_PRED_DECAY * pred * (1.0 if prey < 0.05 else 0.0)) * dt_gh
		# corpse heat cools; fresh deposits arrive from ProtoCorpse directly
		heat = maxf(0.0, heat - CORPSE_DECAY * dt_gh)
		eco["food_avail"] = clampf(food, 0.0, 1.0)
		eco["prey_density"] = clampf(prey, 0.0, 1.0)
		eco["predator_pressure"] = clampf(pred, 0.0, 1.0)
		eco["corpse_heat"] = clampf(heat, 0.0, 1.0)


## THE CORPSE DEPOSIT (the no-free-lunch ethic): a body's heat draws the
## sector — ProtoCorpse calls this once when it lands. ÷3 = CORPSE_HEAT_NORM.
func deposit_corpse(pos: Vector3, heat: float, infection: float = 0.0) -> void:
	if _main == null or not ("population" in _main) or _main.population == null:
		return
	var row: Dictionary = _main.population.cell_at(pos)
	var eco: Dictionary = row.get("eco", {})
	if eco.is_empty():
		return
	eco["corpse_heat"] = clampf(float(eco.get("corpse_heat", 0.0)) + heat / 3.0, 0.0, 1.0)
	if infection > 0.0:
		eco["infection_deposit"] = float(eco.get("infection_deposit", 0.0)) + infection # F-IP consumes at I2