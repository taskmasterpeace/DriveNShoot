## GRID INVENTORY — the READY-MADE UI. Point it at an Inventory and it draws a grid
## of cells with working drag & drop (move / swap / merge). Drop it into any scene,
## or build it in code:
##
##   var ui := InventoryUI.new()
##   add_child(ui)
##   ui.set_inventory(inventory)
##
## It rebuilds its cells whenever you set_inventory(), and refreshes the affected
## view whenever the inventory emits inventory_changed. Don't want this UI? Skip it
## and drive your own view off the same Inventory signals — the model needs nothing
## from here.
@tool
class_name InventoryUI
extends Control

## How many cells per row.
@export_range(1, 32) var columns: int = 5:
	set(v):
		columns = maxi(1, v)
		if _grid != null:
			_grid.columns = columns

## Pixel size of each square cell.
@export var cell_size: Vector2 = Vector2(56, 56)

## Gap between cells.
@export var separation: int = 4

## Hover a filled cell → show its name/count/description.
@export var enable_tooltips: bool = true
## Shift-click a stack of >1 → open the split dialog.
@export var enable_split: bool = true

var inventory: Inventory = null

var _grid: GridContainer
var _cells: Array[InventorySlotUI] = []
var _tooltip: InventoryTooltip
var _selector: InventoryQuantitySelector


func _ready() -> void:
	if _grid == null:
		_build_grid()
	_ensure_helpers()


## Lazily build the shared tooltip + split dialog (once).
func _ensure_helpers() -> void:
	if _tooltip == null:
		_tooltip = InventoryTooltip.new()
		add_child(_tooltip)
	if _selector == null:
		_selector = InventoryQuantitySelector.new()
		add_child(_selector)


## A slot calls this on hover (index -1 / empty hides the tooltip).
func show_tooltip(index: int) -> void:
	if not enable_tooltips or _tooltip == null or inventory == null:
		return
	if index < 0 or inventory.is_slot_empty(index):
		_tooltip.hide_tip()
		return
	_tooltip.show_item(inventory.get_item(index), inventory.get_count(index), get_global_mouse_position())


func hide_tooltip() -> void:
	if _tooltip != null:
		_tooltip.hide_tip()


## A slot calls this on Shift-click: pop the split dialog for a stack of >1 and, on
## confirm, split the chosen amount into the first empty slot.
func request_split(index: int) -> void:
	if not enable_split or _selector == null or inventory == null or inventory.is_slot_empty(index):
		return
	if inventory.get_count(index) <= 1:
		return
	_ensure_helpers()
	for c in _selector.confirmed.get_connections():   # one live handler at a time
		_selector.confirmed.disconnect(c["callable"])
	_selector.confirmed.connect(func(amount: int) -> void: inventory.split_slot(index, amount))
	_selector.open(inventory.get_count(index), get_global_mouse_position())


func _build_grid() -> void:
	_grid = GridContainer.new()
	_grid.columns = columns
	_grid.add_theme_constant_override("h_separation", separation)
	_grid.add_theme_constant_override("v_separation", separation)
	add_child(_grid)


## Bind (or rebind) this UI to an inventory: disconnects the old one, builds exactly
## `inventory.size` cells, and draws the current contents. Call it once after creating
## the inventory; call it again to swap to a different one (e.g. opening a chest).
func set_inventory(inv: Inventory) -> void:
	if _grid == null:
		_build_grid()
	if inventory != null and inventory.inventory_changed.is_connected(refresh):
		inventory.inventory_changed.disconnect(refresh)
	inventory = inv
	_rebuild_cells()
	if inventory != null:
		inventory.inventory_changed.connect(refresh)
	refresh()


func _rebuild_cells() -> void:
	for c in _cells:
		c.queue_free()
	_cells.clear()
	if inventory == null:
		return
	for i in inventory.size:
		var cell := InventorySlotUI.new()
		cell.custom_minimum_size = cell_size
		_grid.add_child(cell)
		cell.bind(self, i)
		_cells.append(cell)


## Redraws every cell from the model. Cheap; wired to inventory_changed.
func refresh() -> void:
	if inventory == null:
		return
	for i in _cells.size():
		if i < inventory.size:
			_cells[i].refresh(inventory.get_item(i), inventory.get_count(i))
