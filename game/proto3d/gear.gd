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
	# clothing — the NON-armor slots earn their keep via MODS (carry, stealth), not soak.
	"leather_duster":   {"name": "Leather duster",      "emoji": "🧥", "slot": "outer_coat", "tier": 2, "soak": 0.0, "covers": [], "stealth": 0.05},
	"ghillie_poncho":   {"name": "Ghillie poncho",      "emoji": "🥷", "slot": "outer_coat", "tier": 3, "soak": 0.0, "covers": [], "stealth": 0.12},
	"combat_boots":     {"name": "Combat boots",        "emoji": "🥾", "slot": "footwear", "tier": 2, "soak": 0.0, "covers": []},
	"canvas_backpack":  {"name": "Canvas backpack",     "emoji": "🎒", "slot": "back", "tier": 2, "soak": 0.0, "covers": [], "carry": 10.0},
	"frame_pack":       {"name": "Frame pack",          "emoji": "🎒", "slot": "back", "tier": 3, "soak": 0.0, "covers": [], "carry": 18.0},
	# accessories — the ring slots put teeth in your fists (unarmed mod, wired to martial arts).
	"brass_knuckles":   {"name": "Brass knuckles",      "emoji": "🥊", "slot": "ring_l", "tier": 2, "soak": 0.0, "covers": [], "unarmed": 0.12},
	"knuckle_duster":   {"name": "Knuckle duster",      "emoji": "🤜", "slot": "ring_r", "tier": 3, "soak": 0.0, "covers": [], "unarmed": 0.08},
	# belt — carry; sash — faster reload; bracelet — better field repairs (clean single-consumer wires).
	"utility_belt":     {"name": "Utility belt",        "emoji": "🩹", "slot": "belt", "tier": 2, "soak": 0.0, "covers": [], "carry": 6.0},
	"tactical_rig_belt": {"name": "Tactical rig belt",  "emoji": "🎗", "slot": "belt", "tier": 3, "soak": 0.0, "covers": [], "carry": 10.0},
	"ammo_bandolier":   {"name": "Ammo bandolier",      "emoji": "🎯", "slot": "sash", "tier": 2, "soak": 0.0, "covers": [], "reload_speed": 0.08},
	"dual_bandolier":   {"name": "Dual bandolier",      "emoji": "🎯", "slot": "sash", "tier": 3, "soak": 0.0, "covers": [], "reload_speed": 0.14},
	"mechanic_wrap":    {"name": "Mechanic's wraps",    "emoji": "🔧", "slot": "bracelet", "tier": 2, "soak": 0.0, "covers": [], "repair": 0.10},
	"data_cuff":        {"name": "Data cuff",           "emoji": "⌚", "slot": "bracelet", "tier": 4, "soak": 0.0, "covers": [], "repair": 0.18},
	# shirt/under-armor — a thin plate under the vest; soak flows through the SAME law (armor_soak reads every slot).
	"flex_armor_base":  {"name": "Flex armor base",     "emoji": "👕", "slot": "shirt", "tier": 2, "soak": 0.06, "covers": ["head", "torso", "l_arm", "r_arm", "l_leg", "r_leg"]},
	"trauma_plate_insert": {"name": "Trauma plate insert", "emoji": "🛡", "slot": "shirt", "tier": 3, "soak": 0.12, "covers": ["torso"]},
	# talisman — luck: your eye catches extra salvage (feeds scavenge_bonus at every chest).
	"rabbits_foot":     {"name": "Lucky rabbit's foot", "emoji": "🐇", "slot": "talisman", "tier": 1, "soak": 0.0, "covers": [], "luck": 1},
	"scavenger_compass": {"name": "Scavver's compass",  "emoji": "🧭", "slot": "talisman", "tier": 3, "soak": 0.0, "covers": [], "luck": 2},
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
	var parsed: Variant = null
	if FileAccess.file_exists(path):
		parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	for r in ((parsed as Dictionary).get("gear", []) if parsed is Dictionary else []):
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
			"carry": maxf(0.0, float(row.get("carry", 0.0))),
			"stealth": clampf(float(row.get("stealth", 0.0)), 0.0, 0.4),
			"unarmed": clampf(float(row.get("unarmed", 0.0)), 0.0, 0.3),
			"reload_speed": clampf(float(row.get("reload_speed", 0.0)), 0.0, 0.3),
			"repair": clampf(float(row.get("repair", 0.0)), 0.0, 0.3),
			"luck": clampi(int(row.get("luck", 0)), 0, 4),
		}
	_register_as_items()


## Bridge every gear piece into the pack's item catalog so a LOOTED/found piece
## stacks, weighs, and shows like any item — and USE wears it (proto3d.use_item
## already routes gear ids here). Heavier plate weighs more; the code floor wins if
## an id somehow already exists. Runs once, after the fold.
static func _register_as_items() -> void:
	for gid in CATALOG:
		var g: Dictionary = CATALOG[gid]
		var is_armor: bool = String(g.get("slot", "")) in ARMOR_SLOTS
		var tier: int = int(g.get("tier", 1))
		var desc: String = String(g.get("desc", ""))
		if desc == "":
			desc = "T%d %s — worn in the %s slot." % [tier, String(g.get("name", gid)), String(g.get("slot", ""))]
		if not ProtoContainer.ITEMS.has(gid):
			var w: float = (0.8 + 0.7 * float(tier)) if is_armor else 0.5
			ProtoContainer.ITEMS[gid] = {
				"name": String(g.get("name", gid)),
				"emoji": String(g.get("emoji", "🧷")),
				"usable": true,
				"w": w,
				"cat": "armor" if is_armor else "gear",
				"desc": desc,
			}
		# Every item needs a PRICE (Mercy stocks anything) — scale by tier + armor.
		if not ProtoNPC.PRICES.has(gid):
			var base: int = 40 if is_armor else 18
			ProtoNPC.PRICES[gid] = base * maxi(1, tier)


## One gear row (or {} if unknown). The single read every consumer uses.
static func row(gear_id: String) -> Dictionary:
	return CATALOG.get(gear_id, {})


## The slot a gear id belongs to ("" if unknown) — so equip never mis-slots.
static func slot_of(gear_id: String) -> String:
	return String(CATALOG.get(gear_id, {}).get("slot", ""))
