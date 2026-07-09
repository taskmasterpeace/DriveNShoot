## THE TRACTION MATRIX (docs/design/MUD_AND_MONSTERS.md T1): one law, three
## inputs, two outputs — traction(surface, wetness, tire_class) → {speed, grip}.
## THE SLOW-NEVER-STUCK LAW (owner ruling): the speed floor is 0.25 — every
## vehicle ALWAYS moves; mud punishes with crawl + slide, never a stop.
## MUD exists only where it actually rained: dirt-class ground AND the cell's
## water_rot ≥ 0.55 (WEATHER's W-WET writes it, regionally, honestly).
## Rows fold additively from data/traction.json over this code floor.
class_name ProtoTraction
extends RefCounted

const PATH := "res://data/traction.json"

static var floor_speed := 0.25
static var mud_rot_min := 0.55
static var wet_rot_min := 0.35
static var noise_mult: Dictionary = {"street": 1.0, "knobby": 1.1, "big": 1.25, "tread": 1.6, "farm": 1.15, "mud_surface": 0.7}
## surface -> wetness -> tire_class -> [speed, grip]. Code floor covers the
## worked rows the spec asserts; the JSON adds/overrides the rest.
static var matrix: Dictionary = {
	"dirt": {"mud": {"street": [0.3, 0.45], "knobby": [0.55, 0.7], "big": [0.9, 0.85], "tread": [1.0, 1.0], "farm": [0.8, 0.9]}},
}
static var _loaded := false


static func ensure() -> void:
	if _loaded:
		return
	_loaded = true
	if not FileAccess.file_exists(PATH):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	if not (parsed is Dictionary):
		return
	var d: Dictionary = parsed
	floor_speed = float(d.get("floor_speed", floor_speed))
	mud_rot_min = float(d.get("mud_rot_min", mud_rot_min))
	wet_rot_min = float(d.get("wet_rot_min", wet_rot_min))
	for k in (d.get("noise_mult", {}) as Dictionary):
		noise_mult[k] = float(d["noise_mult"][k])
	for surf in (d.get("matrix", {}) as Dictionary):
		if not matrix.has(surf):
			matrix[surf] = {}
		for wet in (d["matrix"][surf] as Dictionary):
			if not (matrix[surf] as Dictionary).has(wet):
				matrix[surf][wet] = {}
			for tire in (d["matrix"][surf][wet] as Dictionary):
				matrix[surf][wet][tire] = (d["matrix"][surf][wet][tire] as Array).duplicate()


## The wetness class for a piece of ground: "dry" | "wet" | "mud".
## MUD needs a dirt-class surface AND real regional rain (water_rot).
static func wetness(surface: String, water_rot: float, raining_i: float) -> String:
	var dirt_class := surface in ["dirt", "grass", "field", "dirt_road"]
	if dirt_class and water_rot >= mud_rot_min:
		return "mud"
	if water_rot >= wet_rot_min or raining_i > 0.25:
		return "wet"
	return "dry"


## The law. Unknown combos fall back sanely (dry → wet → the tire's dry row);
## the SPEED FLOOR is absolute — nothing ever immobilizes.
static func traction(surface: String, wet: String, tire: String) -> Dictionary:
	ensure()
	var surf_key := surface
	if surf_key == "dirt_road":
		surf_key = "dirt"
	elif surf_key == "road":
		surf_key = "asphalt"
	elif surf_key == "field":
		surf_key = "grass"
	var srow: Dictionary = matrix.get(surf_key, matrix.get("dirt", {}))
	var wrow: Dictionary = srow.get(wet, srow.get("wet", srow.get("dry", {})))
	var pair: Array = wrow.get(tire, wrow.get("street", [0.7, 0.7]))
	return {"speed": maxf(floor_speed, float(pair[0])), "grip": clampf(float(pair[1]), 0.1, 1.2)}


static func tire_noise(tire: String) -> float:
	ensure()
	return float(noise_mult.get(tire, 1.0))
