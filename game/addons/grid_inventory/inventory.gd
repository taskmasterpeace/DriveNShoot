## GRID INVENTORY — the MODEL. Pure data + logic, no UI, no scene tree, no autoload.
##
##   var inventory := Inventory.new(20)
##   var leftover := inventory.add_item(potion, 5)   # auto-stacks, returns what didn't fit
##   $InventoryUI.set_inventory(inventory)           # bind a grid to it (optional)
##
## A slot is either EMPTY ({}) or a stack ({"item": InventoryItem, "count": int}).
## Callers never touch that shape directly — use get_item()/get_count()/is_slot_empty().
## Emits inventory_changed (any mutation), item_added(item, count), and full (an add
## couldn't place everything). RefCounted: it lives as long as you hold a reference,
## frees itself when you don't — no cleanup, no _exit_tree.
class_name Inventory
extends RefCounted

## Fired after ANY change to slot contents — the UI listens to this to refresh.
signal inventory_changed
## Fired by add_item for the amount that actually went in (0 is never emitted).
signal item_added(item: InventoryItem, count: int)
## Fired when add_item had leftover it couldn't place (the inventory is out of room
## for that item). Not the same as "every slot filled" — see is_full() for that.
signal full

var size: int = 0
var slots: Array = []          ## Array[Dictionary], length == size


func _init(slot_count: int = 20) -> void:
	size = maxi(0, slot_count)
	slots.resize(size)
	for i in size:
		slots[i] = {}


# --- Reads (the UI + callers use these; the {} / dict shape stays private) ---------

func is_slot_empty(index: int) -> bool:
	return not _valid(index) or (slots[index] as Dictionary).is_empty()


func get_item(index: int) -> InventoryItem:
	if is_slot_empty(index):
		return null
	return (slots[index] as Dictionary)["item"] as InventoryItem


func get_count(index: int) -> int:
	if is_slot_empty(index):
		return 0
	return int((slots[index] as Dictionary)["count"])


## Total quantity of `item` across every slot.
func count_of(item: InventoryItem) -> int:
	var total := 0
	for i in size:
		var it := get_item(i)
		if it != null and it.matches(item):
			total += get_count(i)
	return total


## True only when NO slot can accept another unit of anything — every slot is a full
## stack. (add_item can still emit `full` earlier, when a specific item won't fit.)
func is_full() -> bool:
	for i in size:
		if is_slot_empty(i):
			return false
		var it := get_item(i)
		if get_count(i) < _cap(it):
			return false
	return true


# --- Writes ------------------------------------------------------------------------

## Adds `count` of `item`: first tops up existing stacks of the same item, then fills
## empty slots (each up to the item's max_stack). Returns the LEFTOVER that didn't fit
## (0 == everything placed). Emits item_added for what went in, full if leftover > 0,
## inventory_changed if anything at all changed.
func add_item(item: InventoryItem, count: int = 1) -> int:
	if item == null or count <= 0 or size == 0:
		return maxi(0, count)
	var cap := _cap(item)
	var remaining := count

	# Pass 1: top up existing matching stacks.
	for i in size:
		if remaining <= 0:
			break
		if is_slot_empty(i):
			continue
		var it := get_item(i)
		if not it.matches(item):
			continue
		var room := cap - get_count(i)
		if room <= 0:
			continue
		var put := mini(room, remaining)
		_place(i, it, get_count(i) + put)
		remaining -= put

	# Pass 2: drop into empty slots as fresh stacks.
	for i in size:
		if remaining <= 0:
			break
		if not is_slot_empty(i):
			continue
		var put := mini(cap, remaining)
		_place(i, item, put)
		remaining -= put

	var added := count - remaining
	if added > 0:
		inventory_changed.emit()
		item_added.emit(item, added)
	if remaining > 0:
		full.emit()
	return remaining


## Removes up to `count` of `item` (drains from the LAST slots first so early stacks
## stay tidy). Returns how many were actually removed.
func remove_item(item: InventoryItem, count: int = 1) -> int:
	if item == null or count <= 0:
		return 0
	var to_remove := count
	for i in range(size - 1, -1, -1):
		if to_remove <= 0:
			break
		var it := get_item(i)
		if it == null or not it.matches(item):
			continue
		var take := mini(get_count(i), to_remove)
		var left := get_count(i) - take
		if left > 0:
			_place(i, it, left)
		else:
			slots[i] = {}
		to_remove -= take
	var removed := count - to_remove
	if removed > 0:
		inventory_changed.emit()
	return removed


## Drag & drop's one entry point. Moving `from` onto `to`:
##   * to empty        -> the stack moves.
##   * same item       -> merge up to max_stack; overflow stays in `from`.
##   * different items -> swap the two slots.
## Returns true if anything changed (emits inventory_changed once if so).
func move_slot(from: int, to: int) -> bool:
	if from == to or not _valid(from) or not _valid(to) or is_slot_empty(from):
		return false
	var from_item := get_item(from)
	var from_count := get_count(from)

	if is_slot_empty(to):
		_place(to, from_item, from_count)
		slots[from] = {}
	elif get_item(to).matches(from_item):
		var to_item := get_item(to)
		var cap := _cap(to_item)
		var room := cap - get_count(to)
		if room <= 0:
			_swap(from, to)                     # both full stacks of the same item: just swap
		else:
			var moved := mini(room, from_count)
			_place(to, to_item, get_count(to) + moved)
			var left := from_count - moved
			if left > 0:
				_place(from, from_item, left)
			else:
				slots[from] = {}
	else:
		_swap(from, to)

	inventory_changed.emit()
	return true


## Splits `take` units out of slot `from` into the first EMPTY slot as a new stack
## (the "take some, leave the rest" move — reference: Oen44's QuantitySelector). Returns
## true if it split. Refuses if take is < 1, >= the stack's count (that's just a move),
## or there's no empty slot. Emits inventory_changed on success.
func split_slot(from: int, take: int) -> bool:
	if not _valid(from) or is_slot_empty(from) or take < 1 or take >= get_count(from):
		return false
	var dest := -1
	for i in size:
		if is_slot_empty(i):
			dest = i
			break
	if dest == -1:
		return false
	var item := get_item(from)
	_place(dest, item, take)
	_place(from, item, get_count(from) - take)
	inventory_changed.emit()
	return true


## A plain-data snapshot for saving: {"size", "slots":[{} | {"id","count"}]}. Items are
## stored by their InventoryItem.id — an item with an EMPTY id can't be restored (it has
## no stable handle), so give persisted items an id. Pairs with deserialize().
func serialize() -> Dictionary:
	var out_slots: Array = []
	for i in size:
		if is_slot_empty(i):
			out_slots.append({})
		else:
			out_slots.append({"id": String(get_item(i).id), "count": get_count(i)})
	return {"size": size, "slots": out_slots}


## Rebuilds an Inventory from serialize()'s data. `resolver` is Callable(id: String) ->
## InventoryItem (e.g. a lookup into your item table / a preloaded .tres map); a slot
## whose id doesn't resolve is dropped (left empty), never a crash. Static so load is a
## one-liner: `var inv := Inventory.deserialize(data, func(id): return ITEMS.get(id))`.
static func deserialize(data: Dictionary, resolver: Callable) -> Inventory:
	var inv := Inventory.new(int(data.get("size", 0)))
	var saved: Array = data.get("slots", [])
	for i in mini(inv.size, saved.size()):
		var slot_v: Variant = saved[i]
		if not (slot_v is Dictionary) or (slot_v as Dictionary).is_empty():
			continue
		var slot: Dictionary = slot_v
		var item_v: Variant = resolver.call(String(slot.get("id", ""))) if resolver.is_valid() else null
		if item_v is InventoryItem:
			inv._place(i, item_v as InventoryItem, int(slot.get("count", 1)))
	return inv


## Empties every slot.
func clear() -> void:
	for i in size:
		slots[i] = {}
	inventory_changed.emit()


# --- Internals ---------------------------------------------------------------------

func _valid(index: int) -> bool:
	return index >= 0 and index < size


func _cap(item: InventoryItem) -> int:
	return maxi(1, item.max_stack) if item != null else 1


func _place(index: int, item: InventoryItem, count: int) -> void:
	slots[index] = {"item": item, "count": count}


func _swap(a: int, b: int) -> void:
	var tmp: Dictionary = slots[a]
	slots[a] = slots[b]
	slots[b] = tmp
