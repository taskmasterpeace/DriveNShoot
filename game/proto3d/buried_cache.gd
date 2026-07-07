## BURIED CACHE (MOVESET.txt DIG): a mound of packed earth. Hands can't open it —
## a HUNTER's nose finds it and a Hunter's PAWS get it out of the ground. What's
## inside rides the data spine: loot_tables.json "buried_cache" (a new table = a
## ROW), rolled deterministically per spot.
class_name ProtoBuriedCache
extends Node3D

var taken: bool = false
var loot_table: String = "buried_cache"


static func create(table: String = "buried_cache") -> ProtoBuriedCache:
	var b := ProtoBuriedCache.new()
	b.loot_table = table
	b.add_to_group("interactable")
	var mound := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(1.0, 0.26, 1.0)
	mound.mesh = bm
	mound.material_override = ProtoWorldBuilder.material(Color(0.5, 0.38, 0.24), 0.9)
	mound.position.y = 0.13
	mound.rotation.y = 0.6
	b.add_child(mound)
	return b


func interact_position() -> Vector3:
	return global_position


func interact_prompt(_main: Node) -> String:
	if taken:
		return ""
	return "🐾 Packed earth — a HUNTER could dig here"


func interact(_main: Node) -> void:
	pass # hands can't do it; the prompt names who can (surface the system)


## The dog's paws finish the job: the cache becomes loot on the open ground.
func unearth(main: Node, dog: Node) -> void:
	if taken or main == null:
		return
	taken = true
	var rng := RandomNumberGenerator.new()
	rng.seed = int(global_position.x) * 31 + int(global_position.z) # same spot, same haul
	var loot: Dictionary = ProtoContainer.roll_loot(loot_table, rng)
	if loot.is_empty():
		loot = {"scrap": 2}
	var chest := ProtoChest.create("Dug-up cache", loot, false)
	main.add_child(chest)
	chest.global_position = global_position
	if main.has_method("grant_xp"):
		main.grant_xp("kinship", 4.0) # ⭐ the pack PROVIDES — that's the bond
	if main.has_method("notify"):
		main.notify("🐾 %s DIGS IT UP — a buried cache!" % dog.get("dog_name"))
	visible = false
