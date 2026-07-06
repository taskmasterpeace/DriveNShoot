## THE RPG SPINE (Stage 3): one Skill engine (xp -> levels -> effects) + the
## 6-part body paper-doll on Damageable (multi-use) + the PZ HEALTH CAP —
## injuries lower your MAXIMUM hp, so you limp home fragile. Permadeath.
class_name ProtoCharacter
extends RefCounted

signal leveled(skill_id: String, level: int)
signal died

## THE SKILL TREE (10 skills, every one wired to a REAL effect — see the effect
## helpers below; nothing here is a dead stat). Skills level BY USE (UO-style,
## PROGRESSION.md): xp thresholds are quadratic — level = floor(sqrt(xp/40)).
## ⭐ Driving and ⭐ Kinship are the signatures — the car and the dog ARE the game.
## "gain" is the per-level pitch the sheet + level-up toast show.
const SKILLS: Dictionary = {
	"driving": {"name": "Driving", "emoji": "🚗", "star": true,
		"gain": "+5%/lv handling & drift control, less spin, +1%/lv top speed",
		"how": "levels by miles driven"},
	"kinship": {"name": "Kinship", "emoji": "🐕", "star": true,
		"gain": "-12%/lv command delay, braver pack, cheaper taming (lv3/lv6), +4m/lv horn recall",
		"how": "levels by petting, feeding, adopting, taming"},
	"mechanics": {"name": "Mechanics", "emoji": "🔧", "star": false,
		"gain": "-0.5s/lv hotwire, +8%/lv part repairs, +1 salvage scrap every 2 lv",
		"how": "levels by hotwiring, repairs, salvage"},
	"marksmanship": {"name": "Marksmanship", "emoji": "🎯", "star": false,
		"gain": "-6%/lv spread, +1%/lv crit, -4%/lv reload time",
		"how": "levels by landed shots"},
	"melee": {"name": "Melee", "emoji": "🔪", "star": false,
		"gain": "+6%/lv damage, -5%/lv stamina cost, +2%/lv knockdown",
		"how": "levels by connected swings"},
	"endurance": {"name": "Endurance", "emoji": "🏃", "star": false,
		"gain": "+6/lv max stamina, +5%/lv recovery",
		"how": "levels by sprinting and diving"},
	"strength": {"name": "Strength", "emoji": "💪", "star": false,
		"gain": "+2.5kg/lv carry cap, +6%/lv melee shove",
		"how": "levels by hauling heavy and shoving"},
	"stealth": {"name": "Stealth", "emoji": "🤫", "star": false,
		"gain": "-5%/lv detection range while on foot (sprinting spoils it)",
		"how": "levels by moving quiet near threats"},
	"scavenging": {"name": "Scavenging", "emoji": "🔦", "star": false,
		"gain": "bonus finds in caches, +1 chunk map-fragment reveal every 3 lv",
		"how": "levels by opening caches, reading maps"},
	"first_aid": {"name": "First Aid", "emoji": "🩹", "star": false,
		"gain": "+8%/lv treatment from bandages, medkits, pills",
		"how": "levels by treating wounds"},
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


## Blind in one eye (character creation): the same cone penalty as the patch, but the
## dark side follows the chosen eye. "" = both eyes good.
func set_blind_eye(side: String) -> void:
	eyepatch = side != ""
	vision_arc_mult = 0.5 if eyepatch else 1.0
	vision_yaw_offset = -0.55 if side == "r" else (0.55 if side == "l" else 0.0)


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


# --- THE EFFECTS (one place, every consumer calls these) ----------------------
# Each is clamped so runaway grinding can't break the sim-checked feel targets.

## ⭐ Driving: steering authority + drift settle scale up; the spin cap tightens.
func drive_control() -> float:
	return 1.0 + 0.05 * minf(level("driving"), 10)


func drive_top_mult() -> float:
	return 1.0 + 0.01 * minf(level("driving"), 8)


## ⭐ Kinship: the pack answers faster, stands braver, tames cheaper, hears farther.
func kinship_obey_mult() -> float:
	return maxf(0.3, 1.0 - 0.12 * level("kinship"))


func kinship_morale_bonus() -> float:
	return minf(0.3, 0.04 * level("kinship"))


func tame_meat_needed() -> int:
	return 3 - (1 if level("kinship") >= 3 else 0) - (1 if level("kinship") >= 6 else 0)


func horn_recall_radius() -> float:
	return 55.0 + 4.0 * minf(level("kinship"), 10)


## Mechanics: repairs restore more (hotwire time lives in main._hotwire_duration).
func repair_mult() -> float:
	return 1.0 + 0.08 * minf(level("mechanics"), 10)


func salvage_bonus() -> int:
	return int(level("mechanics") / 2.0)


## Marksmanship: crit + reload ride the same skill as the cone (already wired).
func crit_bonus() -> float:
	return 0.01 * minf(level("marksmanship"), 15)


func reload_mult() -> float:
	return maxf(0.6, 1.0 - 0.04 * level("marksmanship"))


## Melee: one skill for every swung thing.
func melee_dmg_mult() -> float:
	return 1.0 + 0.06 * minf(level("melee"), 10)


func melee_stam_mult() -> float:
	return maxf(0.5, 1.0 - 0.05 * level("melee"))


func melee_kd_bonus() -> float:
	return 0.02 * minf(level("melee"), 10)


## Endurance: the tank grows and refills faster.
func stamina_max() -> float:
	return 100.0 + 6.0 * minf(level("endurance"), 12)


func stamina_regen_mult() -> float:
	return 1.0 + 0.05 * minf(level("endurance"), 10)


## Strength: the CARRY_CAP hook made real + shove.
func carry_cap() -> float:
	return 32.0 + 2.5 * minf(level("strength"), 12)


func shove_mult() -> float:
	return 1.0 + 0.06 * minf(level("strength"), 10)


## Stealth: threats notice you later (walking; sprinting spoils it — the player
## body carries the blended value as noise_mult).
func stealth_detect_mult() -> float:
	return maxf(0.5, 1.0 - 0.05 * level("stealth"))


## Scavenging: caches give more; fragments reveal wider.
func scavenge_bonus() -> int:
	return int(level("scavenging") / 2.0)


func fragment_reveal_radius() -> int:
	return 3 + int(level("scavenging") / 3.0)


## First Aid: every treatment lands harder.
func heal_mult() -> float:
	return 1.0 + 0.08 * minf(level("first_aid"), 10)


## The sheet's one-line CURRENT effect readout per skill (compelling = concrete).
func skill_effect_line(id: String) -> String:
	match id:
		"driving": return "handling ×%.2f · top ×%.2f" % [drive_control(), drive_top_mult()]
		"kinship": return "obey ×%.2f · tame %d🍖 · horn %dm" % [kinship_obey_mult(), tame_meat_needed(), int(horn_recall_radius())]
		"mechanics": return "repairs ×%.2f · +%d salvage" % [repair_mult(), salvage_bonus()]
		"marksmanship": return "crit +%d%% · reload ×%.2f" % [int(crit_bonus() * 100), reload_mult()]
		"melee": return "dmg ×%.2f · stam ×%.2f" % [melee_dmg_mult(), melee_stam_mult()]
		"endurance": return "stamina %d · regen ×%.2f" % [int(stamina_max()), stamina_regen_mult()]
		"strength": return "carry %.0fkg · shove ×%.2f" % [carry_cap(), shove_mult()]
		"stealth": return "seen at ×%.2f range" % stealth_detect_mult()
		"scavenging": return "+%d cache finds · reveal %d" % [scavenge_bonus(), fragment_reveal_radius()]
		"first_aid": return "treatment ×%.2f" % heal_mult()
	return ""


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


## Back from the brink — the safehouse cot patches you whole. Clears death, mends
## every part, refills hp. The world outside kept turning; only YOU reset.
func revive() -> void:
	dead = false
	for p in PART_NAMES:
		body[p].restore(9999.0)
	hp = hp_cap()


## Treatment restores part condition (bandage/splint route through here).
func treat(part: String, amount: float) -> void:
	body[part].restore(amount)
	hp = clampf(hp, 0.0, hp_cap())


# --- HUNGER (RV_PLAN rung 1: without the need, the RV is a slow van) ------------
## 100 = fed, 0 = starving. Drains ~2.8/game-hour (full → empty in a day and a
## half). Food gives it back (food_val on the item rows); low hunger empties
## your lungs the way a broken torso does.
var hunger: float = 100.0


func eat(food_val: float) -> void:
	hunger = clampf(hunger + food_val, 0.0, 100.0)


func hunger_tick(game_hours: float) -> void:
	hunger = maxf(0.0, hunger - 2.8 * game_hours)


## The tax: fed 1.0 → starving 0.5 stamina regen.
func hunger_stamina_mult() -> float:
	if hunger >= 30.0:
		return 1.0
	return lerpf(0.5, 1.0, hunger / 30.0)


## Moodle tier for the HUD (0 none … 3 starving).
func hunger_tier() -> int:
	return 3 if hunger <= 8.0 else (2 if hunger <= 18.0 else (1 if hunger <= 32.0 else 0))


# --- WOUNDS READ (goal: injuries with real downstream cost). Damage becomes
# BEHAVIOR: a bad leg limps you, a bad arm wobbles your gun, a cracked head
# narrows the world, a broken torso empties your lungs faster. -------------------

## Which leg drives the limp ("" = both legs walk). Worse leg below 55% = a limp.
func limp_side() -> String:
	var ll: float = body["l_leg"].ratio()
	var rl: float = body["r_leg"].ratio()
	if minf(ll, rl) >= 0.55:
		return ""
	return "l" if ll <= rl else "r"


## Speed tax from the legs: healthy 1.0 → shot-up 0.55 (you LIMP toward the car).
func wound_leg_mult() -> float:
	var worst: float = minf(body["l_leg"].ratio(), body["r_leg"].ratio())
	if worst >= 0.55:
		return 1.0
	return lerpf(0.55, 1.0, worst / 0.55)


## Aim wobble from the arms: 0 = steady, 1 = the barrel won't sit still.
## (Multiplies weapon spread AND shakes the rig's gun arm.)
func aim_wobble() -> float:
	var worst: float = minf(body["l_arm"].ratio(), body["r_arm"].ratio())
	if worst >= 0.6:
		return 0.0
	return clampf(1.0 - worst / 0.6, 0.0, 1.0)


## A cracked head narrows the world (multiplies the vision cone's range).
func head_clarity() -> float:
	var r: float = body["head"].ratio()
	if r >= 0.7:
		return 1.0
	return lerpf(0.55, 1.0, r / 0.7)


## A broken torso empties your lungs: stamina regen tax (1.0 healthy → 0.45).
func wound_stamina_mult() -> float:
	var r: float = body["torso"].ratio()
	if r >= 0.6:
		return 1.0
	return lerpf(0.45, 1.0, r / 0.6)


# --- Serialization (PvP prep — the dog pattern): saves, join-in-progress
# snapshots, and respawn loadouts all ride these two functions. -----------------

func to_record() -> Dictionary:
	var parts: Dictionary = {}
	for p in body:
		parts[p] = body[p].hp
	var sk: Dictionary = {}
	for id in skills:
		sk[id] = {"xp": skills[id]["xp"], "level": skills[id]["level"]}
	return {"hp": hp, "parts": parts, "skills": sk, "dead": dead, "hunger": hunger}


func from_record(rec: Dictionary) -> void:
	for p in rec.get("parts", {}):
		if body.has(p):
			body[p].hp = clampf(float(rec["parts"][p]), 0.0, body[p].max_hp)
	for id in rec.get("skills", {}):
		if skills.has(id):
			skills[id]["xp"] = float(rec["skills"][id]["xp"])
			skills[id]["level"] = int(rec["skills"][id]["level"])
	dead = bool(rec.get("dead", false))
	hp = clampf(float(rec.get("hp", 100.0)), 0.0, hp_cap())
	hunger = clampf(float(rec.get("hunger", 100.0)), 0.0, 100.0) # was leaking — starving loaded back full


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
