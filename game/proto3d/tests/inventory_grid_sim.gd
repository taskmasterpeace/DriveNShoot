## Proof for GRID INVENTORY (addons/grid_inventory). Exercises the REAL model logic
## (no mocks: add/stack/leftover, remove, count, move/swap/merge, signals) AND the
## REAL UI (a live InventoryUI in the tree, its cells reflecting the model) — the
## project's iron rule: drive the real path, never poke private state to fake a pass.
## Run: godot --headless --path game res://proto3d/tests/inventory_grid_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("INV: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _make(item_id: String, max_stack: int) -> InventoryItem:
	var it := InventoryItem.new()
	it.id = StringName(item_id)
	it.display_name = item_id
	it.max_stack = max_stack
	return it


func _ready() -> void:
	_test_stacking_and_leftover()
	_test_signals()
	_test_remove_and_count()
	_test_move_swap_merge()
	_test_full_and_nonstacking()
	_test_split()
	_test_serialize_roundtrip()
	_test_tres_load()
	await _test_ui_binding()
	await _test_ui_split_and_tooltip()

	print("INV: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)


func _test_stacking_and_leftover() -> void:
	var potion := _make("potion", 10)
	var inv := Inventory.new(2)
	_check("add 5 into empty returns 0 leftover", inv.add_item(potion, 5) == 0)
	_check("count_of == 5 after add", inv.count_of(potion) == 5)
	_check("slot 0 holds 5", inv.get_count(0) == 5)
	_check("slot 1 still empty", inv.is_slot_empty(1))
	# 8 more: tops slot0 5->10, opens slot1 with 3.
	_check("add 8 more returns 0", inv.add_item(potion, 8) == 0)
	_check("slot0 capped at max_stack 10", inv.get_count(0) == 10)
	_check("slot1 now holds 3", inv.get_count(1) == 3)
	_check("count_of == 13 across two stacks", inv.count_of(potion) == 13)
	# Overflow: slot1 3->10 (put 7), nothing else free -> 93 leftover.
	_check("add 100 returns 93 leftover", inv.add_item(potion, 100) == 93)
	_check("inventory now full", inv.is_full())


func _test_signals() -> void:
	var potion := _make("potion", 10)
	var inv := Inventory.new(1)
	var added := {"item": null, "count": 0, "hits": 0}
	var changed := {"n": 0}
	var full_hit := {"n": 0}
	inv.item_added.connect(func(it: InventoryItem, c: int) -> void:
		added["item"] = it; added["count"] = c; added["hits"] += 1)
	inv.inventory_changed.connect(func() -> void: changed["n"] += 1)
	inv.full.connect(func() -> void: full_hit["n"] += 1)

	var leftover := inv.add_item(potion, 15)   # 1 slot x cap 10 -> 5 leftover
	_check("item_added fired once", int(added["hits"]) == 1)
	_check("item_added reports the 10 that fit", int(added["count"]) == 10)
	_check("item_added carries the item", added["item"] == potion)
	_check("inventory_changed fired", int(changed["n"]) == 1)
	_check("full fired on overflow", int(full_hit["n"]) == 1)
	_check("add_item returned 5 leftover", leftover == 5)

	# A no-op add (count 0) must emit nothing and not change leftover semantics.
	var before := int(changed["n"])
	inv.add_item(potion, 0)
	_check("count-0 add emits no change", int(changed["n"]) == before)


func _test_remove_and_count() -> void:
	var ammo := _make("ammo", 99)
	var inv := Inventory.new(3)
	inv.add_item(ammo, 50)
	_check("removed exactly 20", inv.remove_item(ammo, 20) == 20)
	_check("count_of == 30 after remove", inv.count_of(ammo) == 30)
	_check("over-remove returns only what existed", inv.remove_item(ammo, 999) == 30)
	_check("empty after draining", inv.count_of(ammo) == 0)
	_check("all slots empty again", inv.is_slot_empty(0) and inv.is_slot_empty(1))


func _test_move_swap_merge() -> void:
	var potion := _make("potion", 10)
	var ammo := _make("ammo", 99)

	# MOVE to empty.
	var inv := Inventory.new(4)
	inv.add_item(potion, 3)                      # slot0 = potion x3
	_check("move to empty slot succeeds", inv.move_slot(0, 2))
	_check("source now empty after move", inv.is_slot_empty(0))
	_check("dest holds the moved stack", inv.get_count(2) == 3 and inv.get_item(2) == potion)

	# MERGE same item, with overflow left behind.
	var inv2 := Inventory.new(2)
	inv2.slots[0] = {"item": potion, "count": 8}
	inv2.slots[1] = {"item": potion, "count": 5}
	_check("merge same item succeeds", inv2.move_slot(1, 0))
	_check("dest merged to cap 10", inv2.get_count(0) == 10)
	_check("overflow 3 stays in source", inv2.get_count(1) == 3)

	# SWAP different items.
	var inv3 := Inventory.new(2)
	inv3.slots[0] = {"item": potion, "count": 2}
	inv3.slots[1] = {"item": ammo, "count": 40}
	_check("swap different items succeeds", inv3.move_slot(0, 1))
	_check("slot0 now the ammo", inv3.get_item(0) == ammo and inv3.get_count(0) == 40)
	_check("slot1 now the potion", inv3.get_item(1) == potion and inv3.get_count(1) == 2)

	# NO-OP guards.
	_check("move onto self is a no-op", not inv3.move_slot(1, 1))
	_check("move from empty is a no-op", not Inventory.new(2).move_slot(0, 1))


func _test_full_and_nonstacking() -> void:
	var wrench := _make("wrench", 1)             # never stacks
	var inv := Inventory.new(2)
	_check("add 3 non-stacking returns 1 leftover", inv.add_item(wrench, 3) == 1)
	_check("two separate 1-stacks made", inv.get_count(0) == 1 and inv.get_count(1) == 1)
	_check("non-stacking inventory reads full", inv.is_full())


func _test_split() -> void:
	var potion := _make("potion", 10)
	var inv := Inventory.new(4)
	inv.slots[0] = {"item": potion, "count": 8}
	_check("split 3 off an 8-stack succeeds", inv.split_slot(0, 3))
	_check("source reduced to 5", inv.get_count(0) == 5)
	_check("split landed 3 in the first empty slot", inv.get_count(1) == 3 and inv.get_item(1) == potion)
	_check("split total conserved (5+3==8)", inv.count_of(potion) == 8)
	# Guards.
	_check("can't split the WHOLE stack (that's a move)", not inv.split_slot(0, 5))
	_check("can't split 0", not inv.split_slot(0, 0))
	# Fill the inventory, then a split with no empty slot must fail.
	inv.slots[2] = {"item": potion, "count": 1}
	inv.slots[3] = {"item": potion, "count": 1}
	_check("split fails with no empty slot", not inv.split_slot(0, 2))


func _test_serialize_roundtrip() -> void:
	var potion := _make("potion", 10)
	var ammo := _make("ammo", 99)
	var registry := {"potion": potion, "ammo": ammo}

	var inv := Inventory.new(5)
	inv.add_item(potion, 7)      # 7 in one slot
	inv.add_item(ammo, 40)
	var data := inv.serialize()
	_check("serialize records the size", int(data["size"]) == 5)
	_check("serialize stores id+count per filled slot", String((data["slots"][0] as Dictionary)["id"]) == "potion")

	var restored := Inventory.deserialize(data, func(id: String) -> InventoryItem: return registry.get(id))
	_check("deserialize restores size", restored.size == 5)
	_check("deserialize restores potion count", restored.count_of(potion) == 7)
	_check("deserialize restores ammo count", restored.count_of(ammo) == 40)
	_check("deserialize preserves the item identity", restored.get_item(0) == potion)

	# An id the resolver can't map is dropped, not a crash.
	var bad := {"size": 2, "slots": [{"id": "ghost", "count": 3}, {}]}
	var partial := Inventory.deserialize(bad, func(id: String) -> InventoryItem: return registry.get(id))
	_check("unresolved id drops to empty (no crash)", partial.is_slot_empty(0))


func _test_ui_split_and_tooltip() -> void:
	var potion := _make("potion", 10)
	var inv := Inventory.new(4)
	inv.slots[0] = {"item": potion, "count": 8}

	var ui := InventoryUI.new()
	add_child(ui)
	ui.set_inventory(inv)
	await get_tree().process_frame

	_check("UI owns a tooltip + split selector", ui._tooltip != null and ui._selector != null)

	# Hover feedback: show over a filled slot, hide over empty.
	ui.show_tooltip(0)
	_check("tooltip shows over a filled slot", ui._tooltip.visible)
	ui.show_tooltip(1)
	_check("tooltip hides over an empty slot", not ui._tooltip.visible)

	# Split flow: request opens the dialog; confirming performs the split via the model.
	ui.request_split(0)
	_check("split dialog opens on request", ui._selector.visible)
	ui._selector.confirmed.emit(3)
	await get_tree().process_frame
	_check("confirming the dialog split 3 off (source now 5)", inv.get_count(0) == 5)
	_check("the split 3 landed in an empty slot", inv.get_count(1) == 3)

	ui.queue_free()


func _test_tres_load() -> void:
	var res := load("res://addons/grid_inventory/items/potion.tres")
	_check("potion.tres loads as InventoryItem", res is InventoryItem)
	if res is InventoryItem:
		var it := res as InventoryItem
		_check(".tres carries id 'potion'", it.id == &"potion")
		_check(".tres carries max_stack 10", it.max_stack == 10)


func _test_ui_binding() -> void:
	var potion := _make("potion", 10)
	var inv := Inventory.new(6)
	inv.add_item(potion, 4)

	var ui := InventoryUI.new()
	ui.columns = 3
	add_child(ui)                                 # triggers _ready -> builds grid
	ui.set_inventory(inv)                          # builds cells, refreshes
	await get_tree().process_frame                 # let cells' _ready + refresh settle

	_check("UI built one cell per slot", ui._cells.size() == inv.size)
	_check("cell 0 shows the stacked count '4'", ui._cells[0]._count.text == "4")
	_check("empty cell shows no count", ui._cells[5]._count.text == "")

	# A model change refreshes the bound UI without another set_inventory().
	inv.add_item(potion, 2)                         # slot0 4 -> 6
	await get_tree().process_frame
	_check("UI live-refreshes on inventory_changed", ui._cells[0]._count.text == "6")

	ui.queue_free()
