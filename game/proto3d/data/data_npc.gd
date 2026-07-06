## DATA SPINE — an NPC is a ROW. Ties a puppet look + a faction + a role together
## so towns can be populated from data (WORLD_NPCS), not hand-placed in code.
class_name DrivnNPC
extends Resource

@export var id: String = ""
@export var name: String = "Stranger"
@export var look: String = "scav"        ## ProtoPuppet.SURVIVORS key
@export var faction: String = "NEUTRAL"
@export var role: String = "civilian"    ## trader|secman|civilian|guard…
@export var stock_loot_table: String = "" ## traders sell from this DrivnLootTable
@export var dialogue: String = ""         ## dialogue resource id / key


static func from_dict(d: Dictionary) -> DrivnNPC:
	var n := DrivnNPC.new()
	n.id = String(d.get("id", ""))
	n.name = String(d.get("name", n.id.capitalize()))
	n.look = String(d.get("look", "scav"))
	n.faction = String(d.get("faction", "NEUTRAL"))
	n.role = String(d.get("role", "civilian"))
	n.stock_loot_table = String(d.get("stock_loot_table", ""))
	n.dialogue = String(d.get("dialogue", ""))
	return n


func to_dict() -> Dictionary:
	return {"id": id, "name": name, "look": look, "faction": faction,
		"role": role, "stock_loot_table": stock_loot_table, "dialogue": dialogue}
