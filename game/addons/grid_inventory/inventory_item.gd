## GRID INVENTORY — the ITEM DEFINITION resource.
##
## An item is a Resource you design in the editor and save as a .tres, then hand to
## Inventory.add_item(). Two stacks are "the same item" if they share this resource
## (the usual case — one potion.tres loaded once) OR share a non-empty `id` (so two
## copies of the same logical item still stack). Everything here is @export so a
## non-programmer can author items in the Inspector; nothing in this file is game-
## specific — it's a clean, dependency-free building block.
@tool
class_name InventoryItem
extends Resource

## Stable identity used for stacking + saving. Optional: if left empty, stacking
## falls back to resource identity (same .tres == same item).
@export var id: StringName = &""

## Shown under the icon / in tooltips.
@export var display_name: String = ""

## Grid cell art. Null is fine — the UI falls back to the item's name.
@export var icon: Texture2D = null

## The most of this item one slot may hold. 1 = never stacks. Clamped to >= 1.
@export_range(1, 9999) var max_stack: int = 99

## Free-form flavor / tooltip body.
@export_multiline var description: String = ""


## The stacking-identity test used everywhere (add_item, merge, count_of).
func matches(other: InventoryItem) -> bool:
	if other == null:
		return false
	if self == other:
		return true
	return id != &"" and id == other.id
