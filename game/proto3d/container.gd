## THE Container (multi-use pillar #1): one class backs the backpack, car trunks,
## world chests, corpses, and vendor stock. Items are data rows.
class_name ProtoContainer
extends RefCounted

signal changed

## Item catalog (data — adding an item = a row). use_effect keys into main.use_item().
const ITEMS: Dictionary = {
	"scrap": {"name": "Scrap metal", "emoji": "🔩", "usable": false},
	"bandage": {"name": "Bandage", "emoji": "🩹", "usable": true},
	"meat": {"name": "Dried meat", "emoji": "🍖", "usable": true},
	"jack": {"name": "Jack (coin)", "emoji": "🪙", "usable": false},
}

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
