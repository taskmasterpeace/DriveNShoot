## THE 19-SLOT PAPERDOLL (docs/design/EQUIPMENT_PAPERDOLL.md) — the data spine for
## wearable equipment. One engine, everything is a ROW: a gear piece is a row in
## CATALOG (the code floor) or in data/equipment.json (folded additively — a new
## gear = a ROW). ProtoCharacter WEARS the gear (one item per slot, every slot
## defaults to bare); this class is only the catalog + slot law, never the wearer.
##
## Design faithful to the spec's "NO hard numbers" rule: armor is expressed as a
## relative SOAK fraction (0..1) over the body PARTS a piece covers, summed and
## clamped so you are never invulnerable — gritty and relative, not clinical.
class_name ProtoGear
extends RefCounted

## The 19 slots (spec Part 4). Every character carries all 19; each holds one id
## ("" = bare). Order is the paperdoll read order (armor, then clothing, then
## accessories) so a future sheet UI can walk it top-to-bottom.
const SLOTS: Array = [
	# --- 6 armor slots (these are the ones that SOAK damage) ---
	"head", "neck", "chest", "arms", "hands", "legs",
	# --- 7 clothing slots (signal/utility/weather; soak 0 for now) ---
	"outer_coat", "shirt", "belt", "footwear", "sash", "face", "back",
	# --- 6 accessory slots (passive; soak 0 for now) ---
	"ear_l", "ear_r", "ring_l", "ring_r", "talisman", "bracelet",
]

## The 6 armor slots — the only ones that carry a soak in this first rung.
const ARMOR_SLOTS: Array = ["head", "neck", "chest", "arms", "hands", "legs"]

## THE CODE FLOOR. Each row: {name, emoji, slot, tier, soak (0..1 armor cut),
## covers (body parts it protects)}. A gritty spread across T1..T4; T5 composite
## lands via data/equipment.json to prove the fold. No purple, ever.
static var CATALOG: Dictionary = {
	# chest — the core HP buffer ladder
	"leather_vest":     {"name": "Leather vest",        "emoji": "🦺", "slot": "chest", "tier": 1, "soak": 0.08, "covers": ["torso"]},
	"scavplate_vest":   {"name": "Scav-plate vest",     "emoji": "🦺", "slot": "chest", "tier": 2, "soak": 0.15, "covers": ["torso"]},
	"kevlar_vest":      {"name": "Kevlar vest",         "emoji": "🦺", "slot": "chest", "tier": 3, "soak": 0.24, "covers": ["torso"]},
	"milspec_body_armor": {"name": "Mil-spec body armor", "emoji": "🛡", "slot": "chest", "tier": 4, "soak": 0.34, "covers": ["torso"]},
	# head
	"leather_cap":      {"name": "Leather cap",         "emoji": "🧢", "slot": "head", "tier": 1, "soak": 0.05, "covers": ["head"]},
	"riot_helm":        {"name": "Riot helm",           "emoji": "⛑", "slot": "head", "tier": 3, "soak": 0.16, "covers": ["head"]},
	"combat_helmet":    {"name": "Combat helmet",       "emoji": "🪖", "slot": "head", "tier": 4, "soak": 0.24, "covers": ["head"]},
	# neck — bleed/junction, small soak across head+torso
	"kevlar_collar":    {"name": "Kevlar collar",       "emoji": "🧣", "slot": "neck", "tier": 2, "soak": 0.06, "covers": ["head", "torso"]},
	# arms
	"arm_guards":       {"name": "Combat arm guards",   "emoji": "💪", "slot": "arms", "tier": 2, "soak": 0.09, "covers": ["l_arm", "r_arm"]},
	# hands — grip; the smallest cut
	"combat_gloves":    {"name": "Combat gloves",       "emoji": "🧤", "slot": "hands", "tier": 2, "soak": 0.03, "covers": ["l_arm", "r_arm"]},
	# legs
	"combat_leggings":  {"name": "Combat leggings",     "emoji": "👖", "slot": "legs", "tier": 2, "soak": 0.10, "covers": ["l_leg", "r_leg"]},
	"battle_plate_legs": {"name": "Battle plate (legs)", "emoji": "🛡", "slot": "legs", "tier": 4, "soak": 0.22, "covers": ["l_leg", "r_leg"]},
	# clothing/accessory anchors — prove the non-armor slots exist and hold gear
	"leather_duster":   {"name": "Leather duster",      "emoji": "🧥", "slot": "outer_coat", "tier": 2, "soak": 0.0, "covers": []},
	"combat_boots":     {"name": "Combat boots",        "emoji": "🥾", "slot": "footwear", "tier": 2, "soak": 0.0, "covers": []},
	"canvas_backpack":  {"name": "Canvas backpack",     "emoji": "🎒", "slot": "back", "tier": 2, "soak": 0.0, "covers": []},
}

static var _folded: bool = false


## Fold data/equipment.json ADDITIVELY onto the code floor. New ids become real
## gear ("a new gear = a ROW"); ids already in code are left untouched (the floor
## wins — stale JSON can never corrupt them). Idempotent; call once at boot.
static func ensure_gear() -> void:
	if _folded:
		return
	_folded = true
	var path := "res://data/equipment.json"
	if not FileAccess.file_exists(path):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		return
	for r in (parsed as Dictionary).get("gear", []):
		if not (r is Dictionary):
			continue
		var row := r as Dictionary
		var gid: String = String(row.get("id", ""))
		var slot: String = String(row.get("slot", ""))
		if gid == "" or CATALOG.has(gid) or not (slot in SLOTS):
			continue # code is the floor; JSON only ADDS new, well-slotted rows
		CATALOG[gid] = {
			"name": String(row.get("name", gid)),
			"emoji": String(row.get("emoji", "🧷")),
			"slot": slot,
			"tier": int(row.get("tier", 1)),
			"soak": clampf(float(row.get("soak", 0.0)), 0.0, 0.6),
			"covers": row.get("covers", []),
		}


## One gear row (or {} if unknown). The single read every consumer uses.
static func row(gear_id: String) -> Dictionary:
	return CATALOG.get(gear_id, {})


## The slot a gear id belongs to ("" if unknown) — so equip never mis-slots.
static func slot_of(gear_id: String) -> String:
	return String(CATALOG.get(gear_id, {}).get("slot", ""))
