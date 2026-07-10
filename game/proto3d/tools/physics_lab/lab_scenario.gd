## Deterministic data-card resolver for the standalone lab.
class_name ProtoLabScenario
extends RefCounted

const PATH := "res://data/lab_scenarios.json"
const ORDER: Array[String] = ["pistol_duel", "smg_suppression", "martial_arts_bout",
	"cover_two", "low_light_hunt", "vehicle_gunner_pass", "armored_penetration",
	"tournament_final"]

var current: Dictionary = {}
var cards: Dictionary = {}


func ids() -> Array[String]:
	return ORDER.duplicate()


func rows() -> Dictionary:
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	return (parsed as Dictionary).get("scenarios", {}) if parsed is Dictionary else {}


func start(id: String, seed_override: int = -1) -> Dictionary:
	var all: Dictionary = rows()
	if not all.has(id):
		return {}
	current = (all[id] as Dictionary).duplicate(true)
	current["id"] = id
	current["seed"] = seed_override if seed_override >= 0 else int(current.get("seed", 0))
	# Opening variation is seeded but bounded: timestamps make event order explicit
	# and reproducible without changing the authored sequence.
	var rng := RandomNumberGenerator.new()
	rng.seed = int(current["seed"])
	var events: Array = current.get("opening_events", [])
	var resolved_events: Array[Dictionary] = []
	for i in events.size():
		resolved_events.append({"order": i, "at_s": snappedf(float(i) * 0.65 + rng.randf_range(0.0, 0.08), 0.001),
			"event": String(events[i])})
	current["opening_events"] = resolved_events
	return current.duplicate(true)


func snapshot() -> Dictionary:
	return current.duplicate(true)


func build_cards(parent: Node3D, origin: Vector3) -> void:
	cards.clear()
	var all: Dictionary = rows()
	for i in ORDER.size():
		var id: String = ORDER[i]
		var card := ProtoWorldBuilder.box_visual(parent, Vector3(3.8, 0.14, 2.2),
			origin + Vector3(float(i % 4) * 4.3, 0.12, float(i / 4) * 2.7),
			Color("#5b432c") if i % 2 == 0 else Color("#355b56"))
		card.name = "ScenarioCard_%s" % id
		card.add_to_group("lab_scenario_card")
		var label := Label3D.new()
		label.text = String((all[id] as Dictionary).get("name", id))
		label.font_size = 30
		label.pixel_size = 0.008
		label.position.y = 0.14
		label.rotation_degrees.x = -90.0
		card.add_child(label)
		cards[id] = card
