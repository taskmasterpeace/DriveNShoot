# Grid Inventory

Clean, resource-driven inventory for Godot 4 with a ready-made drag-and-drop UI.
Define items as resources, create an inventory, bind it to the grid — done.

```gdscript
var inventory := Inventory.new(20)
inventory.add_item(potion, 5)   # auto-stacks, returns leftover
$InventoryUI.set_inventory(inventory)
```

## What you get

- **Slot-based inventory** with configurable size
- **Stacking** with per-item max stack
- **Drag & drop** — move, swap, and merge stacks out of the box
- **Resource-driven items** (`.tres`) — design them in the editor Inspector
- **UI included** — or drive your own view from the signals
- **Signals:** `inventory_changed`, `item_added(item, count)`, `full`
- **No autoload, no dependencies, ~250 lines**, fully commented
- Works in **Godot 4.3 → 4.6** (built/verified on 4.5)

## Files

| File | Class | What it is |
|---|---|---|
| `inventory_item.gd` | `InventoryItem` (Resource) | An item definition: `id`, `display_name`, `icon`, `max_stack`, `description`. Save as `.tres`. |
| `inventory.gd` | `Inventory` (RefCounted) | The model — slots, stacking, add/remove/move, signals. No UI, no scene tree. |
| `inventory_ui.gd` | `InventoryUI` (Control) | The ready-made grid. `set_inventory(inv)` and it draws + wires drag & drop. |
| `inventory_slot_ui.gd` | `InventorySlotUI` (Panel) | One cell. Built in code by `InventoryUI`; you rarely touch it. |
| `items/*.tres` | — | Example items (potion, ammo, wrench). |
| `demo.tscn` / `demo.gd` | — | A runnable drag-&-drop demo. |

## Quick start

1. **Make an item.** In the FileSystem dock, right-click → *New Resource* → `InventoryItem`,
   set `display_name` / `icon` / `max_stack`, save as e.g. `res://items/potion.tres`.
   (Or copy one from `items/`.)
2. **Create an inventory and add items** — anywhere, no autoload:
   ```gdscript
   var potion := load("res://items/potion.tres") as InventoryItem
   var inventory := Inventory.new(20)
   var leftover := inventory.add_item(potion, 5)   # 0 if it all fit
   ```
3. **Show it.** Drop an `InventoryUI` node into your scene (or `InventoryUI.new()`),
   then:
   ```gdscript
   $InventoryUI.set_inventory(inventory)
   ```
   Set `columns`, `cell_size`, `separation` in the Inspector.

## API — `Inventory`

| Method | Returns | Notes |
|---|---|---|
| `Inventory.new(size)` | — | `size` slots, all empty. |
| `add_item(item, count = 1)` | `int` leftover | Tops up existing stacks first, then fills empty slots. `0` == all placed. |
| `remove_item(item, count = 1)` | `int` removed | Drains from the last slots first. |
| `count_of(item)` | `int` | Total across all slots. |
| `is_full()` | `bool` | True only when every slot is a maxed stack. |
| `move_slot(from, to)` | `bool` changed | Move to empty · merge same item (overflow stays) · swap different items. This is what drag & drop calls. |
| `get_item(i)` / `get_count(i)` / `is_slot_empty(i)` | — | Read a slot without touching its internal shape. |
| `clear()` | — | Empties everything. |

### Signals

- `inventory_changed` — any mutation. Bind your own view to this.
- `item_added(item: InventoryItem, count: int)` — the amount `add_item` actually placed.
- `full` — an `add_item` had leftover it couldn't place.

## Drive your own UI

The model needs nothing from the included UI. Skip `InventoryUI` and:

```gdscript
inventory.inventory_changed.connect(_redraw)
inventory.item_added.connect(func(item, n): _toast("+%d %s" % [n, item.display_name]))
```

## Extending

- **Item categories / rarity / weight** — add `@export` fields to `InventoryItem`; the
  model only cares about `max_stack` and stacking identity (`matches()`).
- **Cross-inventory drag** (chest ↔ backpack) — `InventorySlotUI._can_drop_data` currently
  restricts drops to the same grid. Relax that check and, in `_drop_data`, pull from the
  drag data's source grid instead of the local one.
- **Saving** — `Inventory` is plain data: serialize `[{id, count}]` per slot and rebuild
  with `add_item` on load.
