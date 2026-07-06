## DATA SPINE — a building is a ROW. Feeds the authored-placement layer (Goal 2):
## a structure pinned at exact coordinates while biomes stay procedural around it.
class_name DrivnBuilding
extends Resource

@export var id: String = ""
@export var name: String = "Building"
@export var footprint: Vector2 = Vector2(8, 8)  ## world metres (w, d)
@export var floors: int = 1
@export var enterable: bool = true
@export var door_locked: bool = false
@export var key_id: String = ""                 ## which key opens it ("" = no lock)
@export var loot_table: String = ""             ## DrivnLootTable id spawned inside


static func from_dict(d: Dictionary) -> DrivnBuilding:
	var b := DrivnBuilding.new()
	b.id = String(d.get("id", ""))
	b.name = String(d.get("name", b.id.capitalize()))
	var fp: Variant = d.get("footprint", [8, 8])
	if fp is Array and (fp as Array).size() >= 2:
		b.footprint = Vector2(float(fp[0]), float(fp[1]))
	b.floors = int(d.get("floors", 1))
	b.enterable = bool(d.get("enterable", true))
	b.door_locked = bool(d.get("door_locked", false))
	b.key_id = String(d.get("key_id", ""))
	b.loot_table = String(d.get("loot_table", ""))
	return b


func to_dict() -> Dictionary:
	return {"id": id, "name": name, "footprint": [footprint.x, footprint.y],
		"floors": floors, "enterable": enterable, "door_locked": door_locked,
		"key_id": key_id, "loot_table": loot_table}
