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

## THE REALIZATION LEDGER GROUPS (LWE §0.4): wildlife counts ride the SAME
## current_pop dict the human groups use, so world_stream's one instantiation
## bridge (materialize_budget → _spawn_pop_actor) spends them with the same
## per-sector cap — no 16×-per-chunk herd multiplication.
const WILDLIFE: PackedStringArray = ["grazer", "rodent", "scavenger", "pack_pred", "apex"]

## THE ONE AUTHORED NEST (LWE §9-P1 / audit F3): the Alligator Alley den —
## the first swamp on the corridor. Its cell runs HOT from day one; everywhere
## else an apex must EARN its ground (pred ≥ APEX_BAR) through corpse heat,
## noise, and breeding — apexes are rare and memorable, never wallpaper.
const AUTHORED_NEST := Vector3(-8000, 0, 6000)
const APEX_BAR := 0.75

var _main: Node = null
var _last_h: float = -1.0


static func create(main: Node) -> ProtoEcology:
	var e := ProtoEcology.new()
	e._main = main
	return e


## Runs once, lazily, on the first tick: the authored nest's ground is hot.
var _nest_seeded: bool = false
func _seed_authored_nest() -> void:
	if _nest_seeded or _main == null or not ("population" in _main) or _main.population == null:
		return
	_nest_seeded = true
	var eco: Dictionary = _main.population.cell_at(AUTHORED_NEST).get("eco", {})
	if not eco.is_empty():
		eco["predator_pressure"] = maxf(float(eco.get("predator_pressure", 0.0)), 0.8)


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
	_seed_authored_nest()
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
		# human noise cools too (F4): the accumulator emit_noise deposits into —
		# go quiet for a few game hours and the land forgets your racket
		eco["human_noise"] = maxf(0.0, float(eco.get("human_noise", 0.0)) - 0.12 * dt_gh)
		eco["food_avail"] = clampf(food, 0.0, 1.0)
		eco["prey_density"] = clampf(prey, 0.0, 1.0)
		eco["predator_pressure"] = clampf(pred, 0.0, 1.0)
		eco["corpse_heat"] = clampf(heat, 0.0, 1.0)
		_reconcile_wildlife(row, dt_gh)


## THE ECO→WORLD BRIDGE, half 1 (the floats' first reader): what the sector's
## numbers say should be ALIVE here, as {group: count}. Pure — population.gd
## calls it at cell bootstrap (cold start: the Alley lives on first touch) and
## tick() steps the banked counts toward it every game hour. RNG-free by law;
## realization (world_stream spending the counts) is where RNG enters.
static func wildlife_desired(row: Dictionary) -> Dictionary:
	var eco: Dictionary = row.get("eco", {})
	if eco.is_empty():
		return {}
	var prey := float(eco.get("prey_density", 0.0))
	var pred := float(eco.get("predator_pressure", 0.0))
	var heat := float(eco.get("corpse_heat", 0.0))
	var food := float(eco.get("food_avail", 0.0))
	var rot := float(eco.get("water_rot", 0.0))
	var biome := String(row.get("biome", "scrub"))
	var zone := String(row.get("zone_tag", ""))
	var out := {}
	# grazers live where plants live — never city cores or open water
	out["grazer"] = 0 if ["urban", "water", "ocean"].has(biome) else int(round(prey * 5.0))
	# rats live where humans lived — wreck lines, dead suburbs, roadside trash —
	# and BOOM where the predators died (F6's backfire: clearing the apex is
	# never a pure win; the rats inherit the earth)
	out["rodent"] = int(round(clampf(food - 0.2, 0.0, 1.0) * 3.0 * (2.0 - pred))) \
		if ["suburbs", "industrial", "house_field", "road_shoulder"].has(zone) else 0
	# vultures ride death — corpse heat IS the read layer made visible. And
	# NO-BIRDS is a sentence too (F7's ABSENT read): they refuse the sky over
	# an apex-hot sector — empty air over wet ground means something worse.
	out["scavenger"] = clampi(1 + int(heat * 2.0), 0, 3) if (heat >= 0.18 and pred < APEX_BAR) else 0
	# pack predators follow the pressure float (the lag is in the float math)
	out["pack_pred"] = int(round(pred * 3.0))
	# an apex nests only where the land runs HOT (F3: the bar is high — the
	# authored Alley nest qualifies from day one; anywhere else must earn it)
	out["apex"] = 1 if (pred >= APEX_BAR and rot >= 0.45) else 0
	return out


## Half 2 of the bridge's ledger side: step each wildlife count toward what the
## floats support — ±1 per elapsed game hour (capped), never a teleport to the
## target. A kill stays killed for hours; a starved sector empties gradually.
func _reconcile_wildlife(row: Dictionary, dt_gh: float) -> void:
	# LWE §3.11: never hunted on your own doorstep — protected cells (safehouse/
	# homebase bubbles) bank NO wildlife, ever (audit GAP-8: the hourly tick
	# used to re-bank predators cold-start had correctly skipped).
	if bool(row.get("protected", false)):
		return
	var cur: Dictionary = row.get("current_pop", {})
	if cur.is_empty():
		return
	var des := wildlife_desired(row)
	var step := clampi(int(dt_gh), 1, 4)
	for g in WILDLIFE:
		var have := int(cur.get(g, 0))
		var want := int(des.get(g, 0))
		if have < want:
			cur[g] = have + mini(step, want - have)
		elif have > want:
			cur[g] = have - mini(step, have - want)


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