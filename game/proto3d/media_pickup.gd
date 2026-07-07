## MEDIA PICKUPS (docs/cinema.md Phase 4): a DVD case, a VHS tape, a film reel
## lying in the world. E takes it and the film is YOURS — unlocked on the shelf,
## remembered by the save. The world hides the catalog; exploration fills it.
class_name ProtoMediaPickup
extends Node3D

const KINDS: Dictionary = {
	"dvd": {"name": "DVD case", "emoji": "📀", "color": Color(0.75, 0.78, 0.82), "size": Vector3(0.28, 0.04, 0.36)},
	"tape": {"name": "VHS tape", "emoji": "📼", "color": Color(0.15, 0.14, 0.13), "size": Vector3(0.36, 0.06, 0.2)},
	"reel": {"name": "film reel", "emoji": "🎞️", "color": Color(0.6, 0.58, 0.5), "size": Vector3(0.42, 0.06, 0.42)},
}

var media_id: String = ""
var kind: String = "dvd"
var taken: bool = false


static func create(media_id_in: String, kind_in: String = "dvd") -> ProtoMediaPickup:
	var m := ProtoMediaPickup.new()
	m.media_id = media_id_in
	m.kind = kind_in if KINDS.has(kind_in) else "dvd"
	m.add_to_group("interactable")
	var k: Dictionary = KINDS[m.kind]
	var mesh := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = k["size"]
	mesh.mesh = bm
	mesh.material_override = ProtoWorldBuilder.material(k["color"], 0.5, true) # a glint — findable
	mesh.position.y = float((k["size"] as Vector3).y) * 0.5 + 0.02
	m.add_child(mesh)
	return m


func interact_position() -> Vector3:
	return global_position


func interact_prompt(main: Node) -> String:
	if taken:
		return ""
	var title := ""
	if "media_registry" in main and main.media_registry != null:
		title = String(main.media_registry.get_media(media_id).get("title", ""))
	var k: Dictionary = KINDS[kind]
	return "E — %s Take the %s%s" % [k["emoji"], k["name"], (" — “%s”" % title) if title != "" else ""]


func interact(main: Node) -> void:
	if taken:
		return
	taken = true
	if main.has_method("unlock_media"):
		main.unlock_media(media_id, "found a %s" % String(KINDS[kind]["name"]))
	if main.has_method("grant_xp"):
		main.grant_xp("scavenging", 2.0)
	visible = false
