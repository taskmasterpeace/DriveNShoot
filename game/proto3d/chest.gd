## World chest — same Container, same panel as the trunk and your pack.
class_name ProtoChest
extends StaticBody3D

var container: ProtoContainer = ProtoContainer.new("Chest")
var _scav_done: bool = false ## first open teaches Scavenging + skilled eyes find extras


## solid=false → loot piles/corpses: visible + lootable but NO collision, so
## driving over one never dents the car (playtest: "I hit the crate, I take damage").
static func create(label: String, loot: Dictionary, solid: bool = true) -> ProtoChest:
	var c := ProtoChest.new()
	c.add_to_group("interactable")
	if not solid:
		c.collision_layer = 0
		c.collision_mask = 0
	c.container.label = label
	for id in loot:
		c.container.add(id, loot[id])
	var mesh := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(1.1, 0.7, 0.7)
	mesh.mesh = bm
	mesh.material_override = ProtoWorldBuilder.material(Color(0.42, 0.30, 0.16), 0.8)
	mesh.position.y = 0.35
	c.add_child(mesh)
	var lid := MeshInstance3D.new()
	var lm := BoxMesh.new()
	lm.size = Vector3(1.14, 0.1, 0.74)
	lid.mesh = lm
	lid.material_override = ProtoWorldBuilder.material(Color(0.55, 0.4, 0.2), 0.7)
	lid.position.y = 0.75
	c.add_child(lid)
	var shape := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(1.1, 0.8, 0.7)
	shape.shape = bs
	shape.position.y = 0.4
	c.add_child(shape)
	return c


func interact_position() -> Vector3:
	return global_position


func interact_prompt(_main: Node) -> String:
	return "E — Open %s · hold E to DRAG" % container.label.to_lower()


func interact(main: Node) -> void:
	# SCAVENGING: the first crack of any container teaches the road; skilled eyes
	# find what an amateur misses (bonus scrap tucked in the corners).
	if not _scav_done:
		_scav_done = true
		if main.has_method("grant_xp"):
			main.grant_xp("scavenging", 3.0)
		if main.has_method("circuit_beat"):
			main.circuit_beat("scavenge") # THE CIRCUIT's first beat
		if "character" in main and main.character:
			var bonus: int = main.character.scavenge_bonus()
			if bonus > 0 and not container.slots.is_empty():
				container.add("scrap", bonus)
				main.notify("🔦 Your eye catches extra salvage (+%d scrap)" % bonus)
	main.open_container(container)
