## THE FAMILY EMPIRE, E1 core (docs/design/THE_FAMILY_EMPIRE.md 0.1/0.2 — THE
## HOLLOWPOINT verbs): businesses are structure ROWS with a profit_day; the
## ownership ledger lives ONLY here in the save (capabilities on rows, state in
## `holdings` — the ONE business model). THE PITCH: extort (25% cut, heat and
## resentment ride) or buy in (25 days of profit). The take accrues on the
## game-day clock; you COLLECT in scrip — the self-driven satchel. Heat decays
## daily and speaks at its thresholds. Blocks/city/capital ladders arrive with
## E2+; the wife, the wedding, and the crisis law arrive with the family pass.
class_name ProtoEmpire
extends Node

const EXTORT_CUT := 0.25
const BUYIN_DAYS := 25.0
const STAFF_MULT := 0.55 ## an owned shop still pays its people (floor .55)
const HEAT_PER_EXTORT := 0.4
const HEAT_DECAY := 0.5
const HEAT_THRESHOLDS: Array = [6.0, 12.0, 18.0]

var holdings: Dictionary = {} ## placement_id -> {mode: "extorted"|"owned", sid, since_day, banked, resentment}
var heat: float = 0.0
var _last_day := -1
var _spoken_threshold := 0.0
var _main: Node = null


static func create(main: Node) -> ProtoEmpire:
	var e := ProtoEmpire.new()
	e._main = main
	return e


func _day() -> int:
	if _main != null and "daynight" in _main and _main.daynight != null:
		return int(_main.daynight.day)
	return 1


static func profit_of(sid: String) -> float:
	DrivnData.ensure_structures()
	var row: DrivnStructure = DrivnData.structures.get(sid)
	return float(row.profit_day) if row != null else 0.0


func is_business(sid: String) -> bool:
	return profit_of(sid) > 0.0


## THE PITCH (0.2, extort-only E1): walk in and name the terms. Extortion is
## free to open and costs you the town's warmth; buying in costs 25 days of
## the place's own money and makes it YOURS.
func pitch(placement_id: String, sid: String, buy: bool = false) -> bool:
	if not is_business(sid) or holdings.has(placement_id):
		return false
	if buy:
		var price := int(ceil(profit_of(sid) * BUYIN_DAYS))
		if _main.backpack.count("scrip") < price:
			_main.notify("💼 The owner names the price: %d scrip. You don't have it." % price)
			return false
		_main.backpack.remove("scrip", price)
		holdings[placement_id] = {"mode": "owned", "sid": sid, "since_day": _day(), "banked": 0.0, "resentment": 0.0}
		_main.notify("💼 BOUGHT IN — %s is yours. It pays its people, then it pays you." % sid)
	else:
		holdings[placement_id] = {"mode": "extorted", "sid": sid, "since_day": _day(), "banked": 0.0, "resentment": 0.2}
		heat += HEAT_PER_EXTORT * 2.0 # the pitch itself is loud
		_main.notify("💼 They understood the arrangement. %d%% of %s's take is yours now." % [int(EXTORT_CUT * 100), sid])
	return true


## The game-day tick: every holding banks its cut; heat breathes.
func day_tick(days: int = 1) -> void:
	for i in range(days):
		for pid in holdings:
			var h: Dictionary = holdings[pid]
			var p := profit_of(String(h["sid"]))
			if String(h["mode"]) == "extorted":
				h["banked"] = float(h["banked"]) + p * EXTORT_CUT
				heat += HEAT_PER_EXTORT
				h["resentment"] = minf(1.0, float(h["resentment"]) + 0.02)
			else:
				h["banked"] = float(h["banked"]) + p * STAFF_MULT
		heat = maxf(0.0, heat - HEAT_DECAY)
	# the thresholds SPEAK (surface-every-system) — once per crossing
	for t in HEAT_THRESHOLDS:
		if heat >= float(t) and _spoken_threshold < float(t):
			_spoken_threshold = float(t)
			_main.notify("🔥 The county's talking about you (heat %d) — collectors get robbed at this temperature." % int(heat))
	if heat < _spoken_threshold:
		_spoken_threshold = heat


## THE COLLECT: the satchel run, self-driven — stand at the place, take the
## scrip. What's banked is PHYSICAL the moment you take it (the trunk law).
func collect(placement_id: String) -> int:
	if not holdings.has(placement_id):
		return 0
	var h: Dictionary = holdings[placement_id]
	var take := int(floor(float(h["banked"])))
	if take <= 0:
		return 0
	h["banked"] = float(h["banked"]) - float(take)
	_main.backpack.add("scrip", take)
	_main.notify("💼 Collected %d scrip from %s." % [take, String(h["sid"])])
	return take


func _physics_process(_delta: float) -> void:
	var d := _day()
	if _last_day < 0:
		_last_day = d
	elif d > _last_day:
		day_tick(d - _last_day)
		_last_day = d


func serialize() -> Dictionary:
	return {"holdings": holdings.duplicate(true), "heat": heat}


func restore(d: Dictionary) -> void:
	holdings = (d.get("holdings", {}) as Dictionary).duplicate(true)
	heat = float(d.get("heat", 0.0))
	_last_day = -1
