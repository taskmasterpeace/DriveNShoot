## THE STAMPER (MASTER_PLAN Goal 1): JSON → .tres. A content pipeline so any model
## or human edits data/*.json, runs this once, and gets validated Godot Resources
## in res://data/generated/ that the engine (and the editor's inspector) can load.
## Never a one-off: adding content = a JSON row + a stamp, never code.
##
## Run headless:
##   Godot --headless --path game res://proto3d/data/stamp.tscn
## (items.json is auto-bootstrapped from ProtoContainer.ITEMS on first run.)
extends Node

const OUT := "res://data/generated"


func _ready() -> void:
	print("STAMP: start")
	var total := 0
	_bootstrap_items()
	total += _stamp("res://data/vehicles.json", "vehicles", "vehicles", func(d): return DrivnVehicle.from_dict(d))
	total += _stamp("res://data/items.json", "items", "items", func(d): return DrivnItem.from_dict(d))
	total += _stamp("res://data/buildings.json", "buildings", "buildings", func(d): return DrivnBuilding.from_dict(d))
	total += _stamp("res://data/npcs.json", "npcs", "npcs", func(d): return DrivnNPC.from_dict(d))
	total += _stamp("res://data/loot_tables.json", "loot_tables", "loot", func(d): return DrivnLootTable.from_dict(d))
	print("STAMP: %d resources written under %s" % [total, OUT])
	print("STAMP: done")
	get_tree().quit(0)


## Read {key:[rows]} (or a bare array), build a Resource per row, ResourceSaver it.
func _stamp(path: String, key: String, subdir: String, factory: Callable) -> int:
	if not FileAccess.file_exists(path):
		print("STAMP: skip %s (missing)" % path)
		return 0
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	var rows: Array = []
	if parsed is Dictionary and (parsed as Dictionary).has(key):
		rows = (parsed as Dictionary)[key]
	elif parsed is Array:
		rows = parsed
	else:
		print("STAMP: %s malformed" % path)
		return 0
	var dir := "%s/%s" % [OUT, subdir]
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	var n := 0
	for d in rows:
		if not (d is Dictionary) or String((d as Dictionary).get("id", "")) == "":
			continue
		var res: Resource = factory.call(d)
		var out_path := "%s/%s.tres" % [dir, String(d["id"])]
		var err := ResourceSaver.save(res, out_path)
		if err == OK:
			n += 1
		else:
			print("STAMP: FAILED %s (err %d)" % [out_path, err])
	print("STAMP: %s → %d .tres" % [subdir, n])
	return n


## The items catalog IS the live ProtoContainer.ITEMS — export it to JSON once so
## the spine owns a real, complete catalog (migration, not a hand-written stub).
func _bootstrap_items() -> void:
	if FileAccess.file_exists("res://data/items.json"):
		return
	var rows: Array = []
	for id in ProtoContainer.ITEMS:
		var it: Dictionary = ProtoContainer.ITEMS[id]
		rows.append({"id": id, "name": it.get("name", id), "emoji": it.get("emoji", "❔"),
			"weight": it.get("w", 0.5), "category": it.get("cat", "loot"),
			"usable": it.get("usable", false), "desc": it.get("desc", "")})
	var f := FileAccess.open("res://data/items.json", FileAccess.WRITE)
	f.store_string(JSON.stringify({"items": rows}, "  "))
	f.close()
	print("STAMP: bootstrapped items.json (%d items from ProtoContainer.ITEMS)" % rows.size())
