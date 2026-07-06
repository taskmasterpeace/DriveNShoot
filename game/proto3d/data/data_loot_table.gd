## DATA SPINE — a loot table is a ROW. A weighted list of item drops (id + count
## range + weight). Chests, corpses, trader stock, and building caches all roll one.
class_name DrivnLootTable
extends Resource

@export var id: String = ""
@export var name: String = "Loot"
## entries: [{ "item": String, "min": int, "max": int, "weight": float }]
@export var entries: Array = []


static func from_dict(d: Dictionary) -> DrivnLootTable:
	var t := DrivnLootTable.new()
	t.id = String(d.get("id", ""))
	t.name = String(d.get("name", t.id.capitalize()))
	t.entries = d.get("entries", [])
	return t


func to_dict() -> Dictionary:
	return {"id": id, "name": name, "entries": entries}


## Roll the table into a flat {item_id: count} dict (what ProtoChest.create wants).
## A seeded RNG in = deterministic loot (sims can assert on it).
func roll(rng: RandomNumberGenerator) -> Dictionary:
	var out: Dictionary = {}
	for e in entries:
		var w: float = float(e.get("weight", 1.0))
		if w < 1.0 and rng.randf() > w:
			continue # weight < 1 = a chance to appear at all
		var lo: int = int(e.get("min", 1))
		var hi: int = int(e.get("max", lo))
		var n: int = rng.randi_range(lo, maxi(lo, hi))
		if n > 0:
			out[String(e.get("item", ""))] = n
	return out
