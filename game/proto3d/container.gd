## THE Container (multi-use pillar #1): one class backs the backpack, car trunks,
## world chests, corpses, and vendor stock. Items are data rows.
class_name ProtoContainer
extends RefCounted

signal changed

## Item catalog (data — adding an item = a row). use_effect keys into main.use_item().
const ITEMS: Dictionary = {
	"scrap": {"name": "Scrap metal", "emoji": "🔩", "usable": false, "w": 1.2},
	"bandage": {"name": "Bandage", "emoji": "🩹", "usable": true, "w": 0.2},
	"meat": {"name": "Dried meat", "emoji": "🍖", "usable": true, "w": 0.4},
	"jack": {"name": "Jack (coin)", "emoji": "🪙", "usable": false, "w": 0.02},
	"pistol": {"name": "Pistol", "emoji": "🔫", "usable": true, "w": 1.1},
	"shotgun": {"name": "Pump shotgun", "emoji": "🔫", "usable": true, "w": 3.2},
	"pipe_rocket": {"name": "Pipe rocket launcher", "emoji": "🧨", "usable": true, "w": 4.5},
	"9mm": {"name": "9mm rounds", "emoji": "•", "usable": false, "w": 0.02},
	"12ga": {"name": "12ga shells", "emoji": "•", "usable": false, "w": 0.05},
	"rocket": {"name": "Rocket", "emoji": "🚀", "usable": false, "w": 1.5},
}


func total_weight() -> float:
	var w := 0.0
	for id in slots:
		w += ITEMS.get(id, {"w": 0.5}).get("w", 0.5) * slots[id]
	return w

var label: String = "Container"
var slots: Dictionary = {} ## item_id -> count


func _init(label_in: String = "Container") -> void:
	label = label_in


func add(id: String, count: int = 1) -> void:
	slots[id] = slots.get(id, 0) + count
	changed.emit()


func remove(id: String, count: int = 1) -> bool:
	if slots.get(id, 0) < count:
		return false
	slots[id] -= count
	if slots[id] <= 0:
		slots.erase(id)
	changed.emit()
	return true


func count(id: String) -> int:
	return slots.get(id, 0)


func transfer_to(other: ProtoContainer, id: String, count_in: int = 1) -> bool:
	if remove(id, count_in):
		other.add(id, count_in)
		return true
	return false
