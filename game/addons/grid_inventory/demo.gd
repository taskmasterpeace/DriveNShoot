## GRID INVENTORY — runnable demo. Builds an inventory, fills it from the example
## .tres items, and drops a live drag-&-drop grid on screen. Run it:
##   Godot --path game res://addons/grid_inventory/demo.tscn
## Drag stacks to move, drop onto a same-item stack to merge, onto a different item
## to swap. Everything you see is driven by the Inventory signals — no code in here
## touches a cell directly.
extends Control


func _ready() -> void:
	var potion := load("res://addons/grid_inventory/items/potion.tres") as InventoryItem
	var ammo := load("res://addons/grid_inventory/items/ammo.tres") as InventoryItem
	var wrench := load("res://addons/grid_inventory/items/wrench.tres") as InventoryItem

	var inventory := Inventory.new(20)
	inventory.add_item(potion, 7)      # spills into a second stack (max_stack 10)
	inventory.add_item(ammo, 64)
	inventory.add_item(wrench, 1)

	# Print leftovers to prove add_item's return value, and watch the signals.
	inventory.item_added.connect(func(it: InventoryItem, c: int) -> void:
		print("[demo] added %d x %s" % [c, it.display_name]))
	inventory.full.connect(func() -> void: print("[demo] inventory full — item didn't fit"))

	var ui := InventoryUI.new()
	ui.columns = 5
	ui.set_anchors_preset(Control.PRESET_CENTER)
	add_child(ui)
	ui.set_inventory(inventory)
