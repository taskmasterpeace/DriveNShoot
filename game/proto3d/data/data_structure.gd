## DATA SPINE — a STRUCTURE PROFILE is a ROW (DRIVN_World_Structures spec §7):
## a building with a JOB, not a box. Rows live in data/world/structure_profiles.json
## (edited by MapForge's STRUCTURES tab); the engine folds them additively and the
## shell builder materializes any row on demand. NOTE: nothing places these in the
## world yet — roads + exits get arranged first (owner's order).
class_name DrivnStructure
extends Resource

const FOOTPRINT_NAMES: Array = ["small_rect", "medium_rect", "large_rect", "compound", "landmark"]

@export_group("Identity")
@export var id: String = ""
@export var category: String = "service"       ## service/commercial/residential/civic_law/medical/industrial/monument/media/restricted…
@export var display_name: String = "Structure"
@export var sign_glyph: String = "🏚️"          ## the read-from-the-road identity (§18)

@export_group("Placement Rules")
@export var allowed_tiers: Array = []          ## ["T1".."T4", "special"]
@export var districts: Array = []              ## which district types may host it
@export var footprint: String = "small_rect"   ## §18 shell-size name
@export var footprint_m: Vector2 = Vector2(10, 8) ## world metres (w, d)
@export var floors: int = 1
@export var danger: int = 1                    ## 1 quiet … 5 restricted

@export_group("Shell & Interior")
@export var enterable: bool = true
@export var entrances: Array = []              ## ["front", "rear_optional", …]
@export var interior_template: String = "none"

@export_group("System Hooks (the JOB)")
@export var loot_table: String = ""            ## DrivnLootTable id ("" = no loot)
@export var npc_jobs: Array = []
@export var law_hooks: Array = []
@export var event_hooks: Array = []
@export var faction_overrides: Array = []
@export var power_required: bool = false
@export var can_be_safehouse: bool = false
@export var profit_day: float = 0.0 ## THE BUSINESS BLOCK (FAMILY_EMPIRE 0.1): scrip/game-day the world says this place makes; 0 = not a business


static func from_dict(d: Dictionary) -> DrivnStructure:
	var s := DrivnStructure.new()
	s.id = String(d.get("id", ""))
	s.category = String(d.get("category", "service"))
	s.display_name = String(d.get("display_name", s.id.capitalize()))
	s.sign_glyph = String(d.get("sign_glyph", "🏚️"))
	s.allowed_tiers = (d.get("allowed_tiers", []) as Array).duplicate()
	s.districts = (d.get("districts", []) as Array).duplicate()
	s.footprint = String(d.get("footprint", "small_rect"))
	var fp: Variant = d.get("footprint_m", [10, 8])
	if fp is Array and (fp as Array).size() >= 2:
		s.footprint_m = Vector2(float(fp[0]), float(fp[1]))
	s.floors = int(d.get("floors", 1))
	s.danger = int(d.get("danger", 1))
	s.enterable = bool(d.get("enterable", true))
	s.entrances = (d.get("entrances", []) as Array).duplicate()
	s.interior_template = String(d.get("interior_template", "none"))
	s.loot_table = String(d.get("loot_table", ""))
	s.npc_jobs = (d.get("npc_jobs", []) as Array).duplicate()
	s.law_hooks = (d.get("law_hooks", []) as Array).duplicate()
	s.event_hooks = (d.get("event_hooks", []) as Array).duplicate()
	s.faction_overrides = (d.get("faction_overrides", []) as Array).duplicate()
	s.power_required = bool(d.get("power_required", false))
	s.can_be_safehouse = bool(d.get("can_be_safehouse", false))
	s.profit_day = float(d.get("profit_day", 0.0))
	return s


func to_dict() -> Dictionary:
	return {"id": id, "category": category, "display_name": display_name, "sign_glyph": sign_glyph,
		"allowed_tiers": allowed_tiers, "districts": districts,
		"footprint": footprint, "footprint_m": [footprint_m.x, footprint_m.y],
		"floors": floors, "danger": danger, "enterable": enterable, "entrances": entrances,
		"interior_template": interior_template, "loot_table": loot_table,
		"npc_jobs": npc_jobs, "law_hooks": law_hooks, "event_hooks": event_hooks,
		"faction_overrides": faction_overrides, "power_required": power_required,
		"can_be_safehouse": can_be_safehouse}


## The spec's non-negotiable #1: no raw box without a tagged, usable profile.
## Returns the problems ([] = a lawful row). The sim + MapForge both call this.
func validate() -> Array:
	var bad: Array = []
	if id == "" or not id.is_valid_identifier():
		bad.append("id must be a snake_case identifier")
	if display_name == "":
		bad.append("display_name required")
	if sign_glyph == "":
		bad.append("sign_glyph required (§18: every structure reads from the road)")
	if allowed_tiers.is_empty():
		bad.append("allowed_tiers required")
	if districts.is_empty():
		bad.append("districts required")
	if not FOOTPRINT_NAMES.has(footprint):
		bad.append("footprint '%s' not one of %s" % [footprint, FOOTPRINT_NAMES])
	if footprint_m.x < 2.0 or footprint_m.y < 2.0:
		bad.append("footprint_m too small (<2m)")
	# The multi-use rule (§9): a structure must carry at least one systemic JOB.
	if loot_table == "" and npc_jobs.is_empty() and law_hooks.is_empty() and event_hooks.is_empty():
		bad.append("no job: needs loot_table, npc_jobs, law_hooks, or event_hooks (§2 rule 1 + §9)")
	return bad
