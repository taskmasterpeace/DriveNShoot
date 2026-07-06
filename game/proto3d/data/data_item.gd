## DATA SPINE — an item is a ROW. Mirrors ProtoContainer.ITEMS so the catalog can
## live in data/items.json and be tuned by a tool/model, then stamped to .tres.
class_name DrivnItem
extends Resource

@export var id: String = ""
@export var name: String = "Item"
@export var emoji: String = "❔"
@export var weight: float = 0.5        ## kg
@export var category: String = "loot"  ## weapon|ammo|med|food|tool|loot
@export var usable: bool = false
@export var desc: String = ""


static func from_dict(d: Dictionary) -> DrivnItem:
	var it := DrivnItem.new()
	it.id = String(d.get("id", ""))
	it.name = String(d.get("name", it.id.capitalize()))
	it.emoji = String(d.get("emoji", "❔"))
	it.weight = float(d.get("weight", d.get("w", 0.5)))
	it.category = String(d.get("category", d.get("cat", "loot")))
	it.usable = bool(d.get("usable", false))
	it.desc = String(d.get("desc", ""))
	return it


func to_dict() -> Dictionary:
	return {"id": id, "name": name, "emoji": emoji, "weight": weight,
		"category": category, "usable": usable, "desc": desc}
