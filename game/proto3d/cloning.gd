## CLONING C1 (docs/design/CLONING.md): cloning is a PLACE, not a menu. A
## backup SCAN is a VISIT — the chair takes a real game hour, the scrip leaves
## your hand, and what wakes later is the person you were AT THE SCAN.
## THE MEMORY LAW: everything learned after the scan is gone from your head —
## but THE JOURNAL survives the body (reading it restores what you FORGOT, not
## what you FELT). Black-market vats are cheap, no questions, +1 on the defect
## roll (a permanent wound tax the new body carries). THE FAMILY LAW and
## wake-point tiers arrive with the family slices (C2).
class_name ProtoCloning
extends Node

const SCAN_PRICE := 60        ## clinic scrip (DSOA's tier pricing lands at C2)
const VAT_PRICE := 20         ## the back lot asks no questions
const SCAN_HOURS := 1.0       ## an hour in the chair — the world moves
const VAT_DEFECT_CHANCE := 0.35
const DEFECT_TAX := 12.0      ## permanent hp-cap tax a defective body carries

var backup: Dictionary = {}   ## {record, wake_pos: [x,y,z], day_h, vat, defect}
var journal: Array = []       ## [{day, line}] — SURVIVES the wake (the whole point)
var scan_until_h: float = -1.0
var _pending: Dictionary = {}
var _main: Node = null


static func create(main: Node) -> ProtoCloning:
	var c := ProtoCloning.new()
	c._main = main
	return c


func now_h() -> float:
	if _main != null and "daynight" in _main and _main.daynight != null:
		return float(_main.daynight.day) * 24.0 + float(_main.daynight.hour)
	return 0.0


func has_backup() -> bool:
	return not backup.is_empty()


## THE RITUAL: sit the chair. Costs scrip up front; the snapshot completes on
## the clock (tick() watches). vat = the black market — cheap, defect-rolled.
func begin_scan(vat: bool = false) -> bool:
	# THE INFECTED I2 (§0.5/§3.5): a clone clinic SCANS the body, and BITE FEVER is
	# scan-detectable — it will not copy a sick body ("the state fears your body more
	# than your body does"). Cure the fever (a full night's sleep + antibiotics) first.
	if _main.character.fever_active(now_h()):
		_main.notify("🧬 The scanner flags BITE FEVER — the clinic won't copy a sick body. Cure it first.")
		return false
	var price := VAT_PRICE if vat else SCAN_PRICE
	if _main.backpack.count("scrip") < price:
		_main.notify("🧬 The technician shakes his head — %d scrip for the chair." % price)
		return false
	_main.backpack.remove("scrip", price)
	scan_until_h = now_h() + SCAN_HOURS
	_pending = {"vat": vat, "wake_pos": [_main.player.global_position.x,
		_main.player.global_position.y, _main.player.global_position.z]}
	_main.notify("🧬 The chair hums. An hour in the dark — hold still." if not vat
		else "🧬 The vat's fixer counts the scrip twice. No paperwork. Hold still.")
	return true


## Call on the game-hour cadence (proto3d's clock block).
func tick() -> void:
	if scan_until_h < 0.0 or _pending.is_empty():
		return
	if now_h() < scan_until_h:
		return
	var vat: bool = bool(_pending.get("vat", false))
	var defect := {}
	if vat:
		var rng := RandomNumberGenerator.new()
		rng.seed = hash("vat:%d" % int(now_h()))
		if rng.randf() < VAT_DEFECT_CHANCE:
			defect = {"tax": DEFECT_TAX}
	backup = {"record": _main.character.to_record(), "wake_pos": _pending["wake_pos"],
		"day_h": scan_until_h, "vat": vat, "defect": defect}
	scan_until_h = -1.0
	_pending = {}
	_main.notify("🧬 The scan is DONE. What wakes will be the person in that chair — journal what matters."
		+ (" The vat hummed wrong for a second there." if not defect.is_empty() else ""))


## THE JOURNAL: run facts, written as you live them, immune to the wake.
func journal_add(line: String) -> void:
	journal.append({"day": int(now_h() / 24.0), "line": line})


## THE WAKE (THE MEMORY LAW): the character record REVERTS to the scan — every
## level and lesson since is gone from your head; the journal is how you get
## the INTEL back (feelings only return by doing). Returns the wake position.
func wake() -> Vector3:
	if backup.is_empty():
		return Vector3.ZERO
	_main.character.from_record(backup["record"] as Dictionary)
	_main.character.revive()
	_main.character.fever_until_h = -1.0 # a fresh body carries no fever
	var defect: Dictionary = backup.get("defect", {})
	if not defect.is_empty():
		# the vat's discount, collected forever: a permanent cap tax
		_main.character.hp = maxf(10.0, _main.character.hp - float(defect["tax"]))
		_main.notify("🧬 Something in this body sits WRONG — the vat's discount, collected forever.")
	var wp: Array = backup["wake_pos"]
	_main.notify("🧬 You wake at the scan — day %d's you. %d journal entries remember what you don't."
		% [int(float(backup["day_h"]) / 24.0), journal.size()])
	return Vector3(float(wp[0]), float(wp[1]) + 0.3, float(wp[2]))


func serialize() -> Dictionary:
	return {"backup": backup.duplicate(true), "journal": journal.duplicate(true)}


func restore(d: Dictionary) -> void:
	backup = (d.get("backup", {}) as Dictionary).duplicate(true)
	journal = (d.get("journal", []) as Array).duplicate(true)
