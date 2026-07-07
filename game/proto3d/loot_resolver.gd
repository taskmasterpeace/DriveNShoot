## THE LAYERED LOOT RESOLVER (LOOT_NPC_PRODUCTION_WANTED_SPAWN.md §5.1 + §14 Phase 1):
## a container's loot is not one flat roll. It resolves in layers —
##   furniture base table  ->  building-type weight modifier  ->  law override
## — so a gun safe in a farmhouse under free_counties_law rolls very differently
## than the SAME safe under faith_occupation_law (guns replaced with a paper slip).
## Stateless service (mirrors ProtoContainer's static roll_loot): every call takes
## its own seeded RandomNumberGenerator, so sims get bit-identical results.
class_name ProtoLootResolver
extends RefCounted

const BUILDING_TYPES_JSON := "res://data/building_types.json"
const FURNITURE_DEFS_JSON := "res://data/furniture_defs.json"
const DEFAULT_LAW_OVERRIDE_CHANCE := 0.65 ## spec §5.2 example figure; a row can override via law_sensitivity_chance

static var _building_types: Dictionary = {} ## id -> row Dictionary
static var _furniture_defs: Dictionary = {}  ## id -> row Dictionary
static var _folded: bool = false


## Lazy-loads once; safe to call every time (mirrors ProtoContainer._ensure_loot()).
static func _ensure() -> void:
	if _folded:
		return
	_folded = true
	_building_types = _read_rows_keyed(BUILDING_TYPES_JSON, "building_types")
	_furniture_defs = _read_rows_keyed(FURNITURE_DEFS_JSON, "furniture")


static func _read_rows_keyed(path: String, key: String) -> Dictionary:
	var out: Dictionary = {}
	if not FileAccess.file_exists(path):
		push_warning("ProtoLootResolver: %s missing." % path)
		return out
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary) or not (parsed as Dictionary).has(key):
		push_warning("ProtoLootResolver: %s malformed — expected {%s:[...]}." % [path, key])
		return out
	for row in (parsed as Dictionary)[key]:
		if not (row is Dictionary):
			continue
		var id := String((row as Dictionary).get("id", ""))
		if id == "":
			continue
		out[id] = row
	return out


static func furniture_row(furniture_id: String) -> Dictionary:
	_ensure()
	return _furniture_defs.get(furniture_id, {})


static func building_row(building_type: String) -> Dictionary:
	_ensure()
	return _building_types.get(building_type, {})


## Skill-gate stub for furniture_defs "requires" (spec §14: gate on a skill IF a
## lockpick/skill mechanic exists — no lockpick mechanic exists yet, so this reads
## the closest existing skill, Scavenging, off the player's ProtoCharacter). Returns
## "" if open, or a short reason string ("locked — need Scavenging 2") if blocked.
static func lock_reason(furniture_id: String, main: Node) -> String:
	var row := furniture_row(furniture_id)
	var requires: Dictionary = row.get("requires", {})
	if not bool(requires.get("locked", false)):
		return ""
	var need: int = int(requires.get("scavenging", 0))
	var have: int = 0
	if main != null and "character" in main and main.character != null:
		have = main.character.level("scavenging")
	if have >= need:
		return ""
	return "locked — need Scavenging %d" % need


## THE RESOLVE CALL. furniture_id -> furniture_defs row (base table + tags).
## building_type -> building_types row (weight_mult layer, "" = no modifier — a
## loose furniture piece with no building context, e.g. a sim prop).
## state_id -> ProtoWorldState.law_for(state_id)-compatible id ("" = no law layer).
## main -> optional; only used to read main.world_state.law_for(state_id) when a
## state_id is supplied (sims can skip this and pass a law Dictionary directly via
## law_override, letting law_loot_override_sim stage a law without a live world_state).
## Returns {item_id: count} — the exact shape ProtoContainer/ProtoChest already use,
## so furniture.gd can hand the result straight to its ProtoContainer.
static func resolve(furniture_id: String, building_type: String, state_id: String,
		main: Node, rng: RandomNumberGenerator, law_override: Variant = null) -> Dictionary:
	_ensure()
	var frow := furniture_row(furniture_id)
	var table_id := String(frow.get("loot_table", ""))
	var entries: Array = _table_entries(table_id)

	# --- Layer 1: furniture base table (roll weight -> count) ------------------
	var rolled: Dictionary = {} ## item_id -> {"count": int, "tags": Array}
	for e in entries:
		var entry := e as Dictionary
		var item_id := String(entry.get("item", ""))
		if item_id == "" or item_id == "empty":
			continue # the literal "empty" row is headroom only — never a real drop
		var w: float = float(entry.get("weight", 1.0))
		# --- Layer 2: building-type weight modifier (applied to the ROLL CHANCE,
		# not the count, so a farmhouse's food tag shows up MORE OFTEN, matching
		# the "food_flavor" idea in spec §4.1 without swapping tables entirely) --
		var tags: Array = entry.get("tags", [])
		w *= _building_weight_mult(building_type, tags)
		if w < 1.0 and rng.randf() > w:
			continue
		var lo: int = int(entry.get("min", 1))
		var hi: int = int(entry.get("max", lo))
		var n: int = rng.randi_range(lo, maxi(lo, hi))
		if n <= 0:
			continue
		rolled[item_id] = {"count": n, "tags": tags}

	# --- Layer 3: LAW OVERRIDE (spec §5.2: guns_banned -> confiscation_notice) --
	var law: Dictionary = _resolve_law(state_id, main, law_override)
	if not law.is_empty():
		rolled = _apply_law_override(rolled, law, rng)

	# --- Flatten to {item_id: count} (dropping tags — the caller wants counts) --
	var out: Dictionary = {}
	for item_id in rolled:
		var count: int = int((rolled[item_id] as Dictionary)["count"])
		out[item_id] = out.get(item_id, 0) + count
	return out


static func _table_entries(table_id: String) -> Array:
	if table_id == "":
		return []
	# Loot tables live in ProtoContainer's own cache — reuse it rather than parsing
	# loot_tables.json a second time (one loader, one source of truth).
	ProtoContainer.has_loot_table(table_id) # forces ProtoContainer._ensure_loot()
	return ProtoContainer._loot_tables.get(table_id, [])


## Building-type weight_mult (building_types.json): a Dictionary of tag -> multiplier.
## An entry with NO matching tag is untouched (mult 1.0). building_type == "" (no
## building context) also leaves every roll untouched.
static func _building_weight_mult(building_type: String, tags: Array) -> float:
	if building_type == "":
		return 1.0
	var brow := building_row(building_type)
	var mult_table: Dictionary = brow.get("weight_mult", {})
	if mult_table.is_empty():
		return 1.0
	var mult := 1.0
	for tag in tags:
		if mult_table.has(String(tag)):
			mult *= float(mult_table[String(tag)])
	return mult


## Resolves the active law Dictionary for this roll. Priority: an explicit
## law_override (sims can stage a law without a live ProtoWorldState) beats a
## live main.world_state.law_for(state_id) lookup beats "no law" ({}).
static func _resolve_law(state_id: String, main: Node, law_override: Variant) -> Dictionary:
	if law_override is Dictionary:
		return law_override as Dictionary
	if state_id == "" or main == null or not ("world_state" in main) or main.world_state == null:
		return {}
	return main.world_state.law_for(state_id)


## guns == "contraband" under the active law: any weapon/ammo-tagged roll has a
## DEFAULT_LAW_OVERRIDE_CHANCE (or the law's own "loot_override_chance") to be
## swapped for a confiscation_notice instead (spec §5.2 example: 0.65).
static func _apply_law_override(rolled: Dictionary, law: Dictionary, rng: RandomNumberGenerator) -> Dictionary:
	if String(law.get("guns", "legal")) != "contraband":
		return rolled
	var chance: float = float(law.get("loot_override_chance", DEFAULT_LAW_OVERRIDE_CHANCE))
	var out: Dictionary = {}
	var notices := 0
	for item_id in rolled:
		var entry := rolled[item_id] as Dictionary
		var tags: Array = entry.get("tags", [])
		if tags.has("weapon") and rng.randf() < chance:
			notices += 1
			continue # the gun never makes it into the drop — the law got there first
		out[item_id] = entry
	if notices > 0:
		if out.has("confiscation_notice"):
			(out["confiscation_notice"] as Dictionary)["count"] += notices
		else:
			out["confiscation_notice"] = {"count": notices, "tags": ["evidence"]}
	return out
