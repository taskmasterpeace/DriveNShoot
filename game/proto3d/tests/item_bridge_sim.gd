## Proof for THE ITEM BRIDGE (item_bridge.gd — goal ② quick win: bridge the inventory
## addon to items.json). DRIVN ids resolve to shared InventoryItems, a game container
## round-trips through the grid Inventory (incl. serialize/deserialize) without loss, and
## a JSON-only item (walkie, from items.json — not the code floor) resolves too. Run:
## godot --headless --path game res://proto3d/tests/item_bridge_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("BRIDGE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	# Resolve: code-floor id, JSON-only id, unknown id.
	var pistol := ProtoItemBridge.resolve("pistol")
	_check("code-floor id resolves (pistol)", pistol != null and String(pistol.id) == "pistol")
	_check("name + desc carried over", pistol.display_name.contains("Pistol") and pistol.description.contains("9mm"))
	_check("weapons stay chunky (max_stack 12)", pistol.max_stack == 12)
	_check("ammo piles deep (max_stack 99)", ProtoItemBridge.resolve("9mm").max_stack == 99)
	_check("a JSON-only row resolves (walkie, via ensure_items)", ProtoItemBridge.resolve("walkie") != null)
	_check("an unknown id resolves to null", ProtoItemBridge.resolve("plasma_sword") == null)
	_check("one shared resource per id (cache)", ProtoItemBridge.resolve("pistol") == pistol)

	# Round trip: game container → grid Inventory → counts → equal.
	var box := ProtoContainer.new("Test box")
	box.add("scrip", 30)
	box.add("bandage", 2)
	box.add("9mm", 120)   # spills past one 99-stack → two grid slots
	var inv := ProtoItemBridge.to_inventory(box)
	_check("container fills the grid (3 ids, 4 stacks)", inv.count_of(ProtoItemBridge.resolve("9mm")) == 120)
	var back := ProtoItemBridge.to_counts(inv)
	_check("round trip is lossless", int(back.get("scrip", 0)) == 30 and int(back.get("bandage", 0)) == 2 and int(back.get("9mm", 0)) == 120)

	# The addon's SAVE path works over real items via the bridge resolver.
	var data := inv.serialize()
	var restored := Inventory.deserialize(data, ProtoItemBridge.resolve)
	_check("serialize→deserialize restores through the bridge", ProtoItemBridge.to_counts(restored) == back)

	print("BRIDGE: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
