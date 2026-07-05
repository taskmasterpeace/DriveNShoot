## THE RPG SPINE (Stage 3): one Skill engine (xp -> levels -> effects) + the
## 6-part body paper-doll on Damageable (multi-use) + the PZ HEALTH CAP —
## injuries lower your MAXIMUM hp, so you limp home fragile. Permadeath.
class_name ProtoCharacter
extends RefCounted

signal leveled(skill_id: String, level: int)
signal died

## Skill rows (data): xp thresholds are quadratic — level = floor(sqrt(xp/40)).
const SKILLS: Dictionary = {
	"mechanics": {"name": "Mechanics", "emoji": "🔧"},
	"driving": {"name": "Driving", "emoji": "🚗"},
	"marksmanship": {"name": "Marksmanship", "emoji": "🎯"},
}

const PART_NAMES: Array = ["head", "torso", "l_arm", "r_arm", "l_leg", "r_leg"]
const PART_EMOJI: Dictionary = {"head": "🧠", "torso": "🫀", "l_arm": "💪", "r_arm": "💪", "l_leg": "🦵", "r_leg": "🦵"}

var skills: Dictionary = {} ## id -> {xp: float, level: int}
var body: Dictionary = {}   ## part -> Damageable
var hp: float = 100.0
var dead: bool = false

## Perception traits/gear (INTERFACE_AND_BODY: headgear trades protection vs cone).
## Eye patch: one eye = half the arc. Eagle-eyed traits raise these later.
var vision_arc_mult: float = 1.0
var vision_range_mult: float = 1.0
var eyepatch: bool = false


## One eye covered = you lose that SIDE: the arc halves AND swings toward the
## seeing eye (not a symmetric squeeze — playtest feedback).
var vision_yaw_offset: float = 0.0

func set_eyepatch(on: bool) -> void:
	eyepatch = on
	vision_arc_mult = 0.5 if on else 1.0
	vision_yaw_offset = -0.55 if on else 0.0 # right eye patched: the right side goes dark


func _init() -> void:
	for id in SKILLS:
		skills[id] = {"xp": 0.0, "level": 0}
	for part in PART_NAMES:
		body[part] = Damageable.new(part, PART_EMOJI[part], 60.0 if part == "head" else 100.0)


func add_xp(id: String, amount: float) -> void:
	if not skills.has(id) or dead:
		return
	var s: Dictionary = skills[id]
	s["xp"] += amount
	var new_level := int(sqrt(s["xp"] / 40.0))
	if new_level > s["level"]:
		s["level"] = new_level
		leveled.emit(id, new_level)


func level(id: String) -> int:
	return skills.get(id, {"level": 0})["level"]


## The health CAP: every wound lowers your ceiling (PZ dread, one clamp line).
func hp_cap() -> float:
	var lost := 0.0
	for part in body:
		lost += (1.0 - body[part].ratio()) * 22.0
	return maxf(15.0, 100.0 - lost)


## A wound: damage a part + core hp. Head/torso destroyed or hp 0 = the run ends.
func take_wound(part: String, amount: float) -> void:
	if dead:
		return
	body[part].damage(amount)
	hp = clampf(minf(hp - amount * 0.6, hp_cap()), 0.0, hp_cap())
	if hp <= 0.0 or body["head"].tier() == Damageable.Tier.BROKEN \
			or body["torso"].tier() == Damageable.Tier.BROKEN:
		dead = true
		died.emit()


## Treatment restores part condition (bandage/splint route through here).
func treat(part: String, amount: float) -> void:
	body[part].restore(amount)
	hp = clampf(hp, 0.0, hp_cap())


func worst_part() -> String:
	var worst := ""
	var worst_r := 1.1
	for part in body:
		if body[part].ratio() < worst_r:
			worst_r = body[part].ratio()
			worst = part
	return worst


## Random limb for crash/blast wounds (torso-weighted like the hit-table research).
func random_part(rng: RandomNumberGenerator) -> String:
	var pool: Array = ["torso", "torso", "l_arm", "r_arm", "l_leg", "r_leg", "head"]
	return pool[rng.randi() % pool.size()]
