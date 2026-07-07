## THE ITEM BRIDGE (goal ② quick win): joins the game's data spine (ProtoContainer.ITEMS,
## the code floor + data/items.json fold) to the grid-inventory addon (addons/grid_inventory).
## One resolver both ways: any DRIVN item id becomes an InventoryItem resource (cached, one
## per id), so the drag-&-drop grid, stack-split, tooltips, and save/load all work over REAL
## game items — and a grid Inventory converts to/from a ProtoContainer without loss.
class_name ProtoItemBridge
extends RefCounted

static var _cache: Dictionary = {}   ## id -> InventoryItem (one resource per id, shared)


## Stack sizes by category — ammo/coin pile deep, gear stays chunky.
static func _max_stack(cat: String) -> int:
	match cat:
		"ammo", "loot":
			return 99
		"food", "med":
			return 24
		_:
			return 12


## A DRIVN item id → an InventoryItem (null for an unknown id — the addon drops it safely).
## THE resolver for Inventory.deserialize(data, ProtoItemBridge.resolve).
static func resolve(id: String) -> InventoryItem:
	if _cache.has(id):
		return _cache[id]
	ProtoContainer.ensure_items()
	if not ProtoContainer.ITEMS.has(id):
		return null
	var row: Dictionary = ProtoContainer.ITEMS[id]
	var item := InventoryItem.new()
	item.id = StringName(id)
	item.display_name = "%s %s" % [String(row.get("emoji", "")), String(row.get("name", id))]
	item.description = String(row.get("desc", ""))
	item.max_stack = _max_stack(String(row.get("cat", "loot")))
	_cache[id] = item
	return item


## A game container → a grid Inventory (for showing any chest/pack in the drag-&-drop UI).
static func to_inventory(container: ProtoContainer, size: int = 20) -> Inventory:
	var inv := Inventory.new(size)
	for id in container.slots:
		var item := resolve(String(id))
		if item != null:
			inv.add_item(item, int(container.slots[id]))
	return inv


## …and back: a grid Inventory's contents → {id: count}, ready for ProtoContainer.add().
static func to_counts(inv: Inventory) -> Dictionary:
	var out: Dictionary = {}
	for i in inv.size:
		var item := inv.get_item(i)
		if item != null:
			var id := String(item.id)
			out[id] = int(out.get(id, 0)) + inv.get_count(i)
	return out
