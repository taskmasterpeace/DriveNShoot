## THE TRACTION MATRIX (docs/design/MUD_AND_MONSTERS.md T1): one law, three
## inputs, two outputs — traction(surface, wetness, tire_class) → {speed, grip}.
## THE SLOW-NEVER-STUCK LAW (owner ruling): the speed floor is 0.25 — every
## vehicle ALWAYS moves; mud punishes with crawl + slide, never a stop.
## MUD exists only where it actually rained: dirt-class ground AND the cell's
## water_rot ≥ 0.55 (WEATHER's W-WET writes it, regionally, honestly).
## Rows fold additively from data/traction.json over this code floor.
##
## THE HANDLING CHARACTER (owner directive 2026-07-14, "not just slow down —
## make it as realistic as possible"): a SECOND, independent layer on top —
## handling(surface, wetness, tire_class) → the full per-surface FEEL dict
## (rear_bias/steer_response/brake/roll_drag/roughness/yaw_loose/dust/sfx),
## folded from data/surfaces.json over handling_table's code floor. grip/speed
## in that dict fall back to THIS file's own matrix wherever it actually knows
## the surface (asphalt/gravel/dirt/grass/sand); car_3d.gd overrides grip back
## onto its own already-tuned surface_grip_mult() law (road forced 1.0, water's
## dirt_mult*0.5, rain-never-double-taxed) so asphalt driving never changes —
## the two layers stay independent, traction() is untouched.
class_name ProtoTraction
extends RefCounted

const PATH := "res://data/traction.json"
const HANDLING_PATH := "res://data/surfaces.json"

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

## The surfaces the tire matrix actually PRICES (real dry/wet/tire-class rows,
## not the generic [0.7, 0.7] fallback) — handling() trusts these for grip/speed,
## everything else (metal/water/mud-as-ground/unknown) uses its OWN authored row.
const MATRIX_KNOWN_SURFACES: Array = ["asphalt", "gravel", "dirt", "grass", "sand"]

## surface -> {grip, rear_bias, speed, steer_response, brake, roll_drag,
## roughness, yaw_loose, dust:[r,g,b,a], sfx}. Code floor = asphalt-neutral;
## data/surfaces.json overlays key-by-key (a row can tune ONE field without
## blanking its siblings — same deep-merge law as car_3d's _merged_lights).
static var handling_table: Dictionary = {
	"asphalt": {"grip": 1.0, "rear_bias": 1.0, "speed": 1.0, "steer_response": 1.0, "brake": 1.0,
		"roll_drag": 0.0, "roughness": 0.0, "yaw_loose": 0.0, "dust": [0.55, 0.55, 0.55, 0.32], "sfx": ""},
	"dirt": {"grip": 0.7, "rear_bias": 0.88, "speed": 0.85, "steer_response": 0.85, "brake": 0.7,
		"roll_drag": 0.03, "roughness": 0.22, "yaw_loose": 0.22, "dust": [0.62, 0.52, 0.38, 0.5], "sfx": "dirt_kick"},
}
## Wetness shifts a surface's grip toward its slick self — ONLY consulted for
## surfaces the tire matrix doesn't price (metal/water/mud-as-ground/unknown);
## dry/wet asphalt-gravel-dirt-grass-sand already ride the real matrix rows.
## Wet METAL is the steepest shift on the table (a rain-soaked bridge deck):
## 0.92 dry × 0.6 ≈ 0.55, matching the owner's called-out target exactly.
const WET_GRIP_MULT: Dictionary = {"metal": 0.6, "water": 1.0, "mud": 1.0}
const WET_GRIP_MULT_DEFAULT := 0.85
const MUD_WET_EXTRA := 0.85 ## on top of WET_GRIP_MULT when the wetness class is full "mud"
## How hard real rain (wetness()=="mud") drags a DIRT surface's FEEL toward the
## mud row's — grip/speed already move via the tire matrix; this blends the
## NEW fields (rear_bias/steer_response/roll_drag/roughness/yaw_loose) so a
## rained-out dirt road drives progressively mushier without becoming literal
## mud ground (that stays a separate, rarer surface).
const MUD_BLEND := 0.6
static var _handling_loaded := false


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


## Fold data/surfaces.json over handling_table — additive, key-by-key per row.
static func ensure_handling() -> void:
	if _handling_loaded:
		return
	_handling_loaded = true
	if not FileAccess.file_exists(HANDLING_PATH):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(HANDLING_PATH))
	if not (parsed is Dictionary):
		return
	var rows: Dictionary = (parsed as Dictionary).get("surfaces", {})
	for surf in rows:
		var key := String(surf)
		if not handling_table.has(key):
			handling_table[key] = {}
		var dst: Dictionary = handling_table[key]
		var src: Dictionary = rows[surf]
		for field in src:
			dst[field] = src[field]
		handling_table[key] = dst


## The one surface-key normalization law: dirt_road/road/field are the WORLD's
## raw surface_at() spellings; everything downstream (matrix + handling) speaks
## asphalt/dirt/grass/gravel/sand/mud/metal/water.
static func normalize_surface(surface: String) -> String:
	if surface == "dirt_road":
		return "dirt"
	if surface == "road":
		return "asphalt"
	if surface == "field":
		return "grass"
	return surface


## The wetness class for a piece of ground: "dry" | "wet" | "mud".
## MUD needs a dirt-class surface AND real regional rain (water_rot).
static func wetness(surface: String, water_rot: float, raining_i: float) -> String:
	var dirt_class := surface in ["dirt", "grass", "field", "dirt_road"]
	if dirt_class and water_rot >= mud_rot_min:
		return "mud"
	if water_rot >= wet_rot_min or raining_i > 0.25:
		return "wet"
	return "dry"


## The shared matrix lookup (surf_key already normalized) — pulled out of
## traction() so handling() can reuse the identical formula without traction()
## itself changing a single line of behavior.
static func _base_pair(surf_key: String, wet: String, tire: String) -> Dictionary:
	ensure()
	var srow: Dictionary = matrix.get(surf_key, matrix.get("dirt", {}))
	var wrow: Dictionary = srow.get(wet, srow.get("wet", srow.get("dry", {})))
	var pair: Array = wrow.get(tire, wrow.get("street", [0.7, 0.7]))
	return {"speed": maxf(floor_speed, float(pair[0])), "grip": clampf(float(pair[1]), 0.1, 1.2)}


## The law. Unknown combos fall back sanely (dry → wet → the tire's dry row);
## the SPEED FLOOR is absolute — nothing ever immobilizes. UNCHANGED behavior —
## refactored onto _base_pair, not rewritten (traction_sim's worked rows must
## keep computing exactly what they always have).
static func traction(surface: String, wet: String, tire: String) -> Dictionary:
	var surf_key := surface
	if surf_key == "dirt_road":
		surf_key = "dirt"
	elif surf_key == "road":
		surf_key = "asphalt"
	elif surf_key == "field":
		surf_key = "grass"
	return _base_pair(surf_key, wet, tire)


## THE HANDLING CHARACTER — the full per-surface feel dict. grip/speed ride
## the mature tire matrix wherever it actually prices the surface; metal/water/
## mud-as-ground/unknown ground uses the row's own authored numbers, wetness-
## shifted. The NEW fields (rear_bias, steer_response, brake, roll_drag,
## roughness, yaw_loose) always come from handling_table, and drift toward the
## mud row's when real rain has turned dirt-class ground properly muddy.
static func handling(surface: String, wet: String, tire: String) -> Dictionary:
	ensure()
	ensure_handling()
	var surf_key := normalize_surface(surface)
	var row: Dictionary = (handling_table.get(surf_key, handling_table.get("dirt", {})) as Dictionary).duplicate()
	if surf_key in MATRIX_KNOWN_SURFACES:
		var base := _base_pair(surf_key, wet, tire)
		row["grip"] = base["grip"]
		row["speed"] = base["speed"]
	else:
		var wet_mult: float = 1.0
		if wet == "wet":
			wet_mult = float(WET_GRIP_MULT.get(surf_key, WET_GRIP_MULT_DEFAULT))
		elif wet == "mud":
			wet_mult = float(WET_GRIP_MULT.get(surf_key, WET_GRIP_MULT_DEFAULT)) * MUD_WET_EXTRA
		row["grip"] = clampf(float(row.get("grip", 0.7)) * wet_mult, 0.1, 1.2)
		row["speed"] = maxf(floor_speed, float(row.get("speed", 0.7)))
	if wet == "mud" and surf_key != "mud":
		var mrow: Dictionary = handling_table.get("mud", row)
		for k in ["rear_bias", "steer_response", "roll_drag", "roughness", "yaw_loose"]:
			row[k] = lerpf(float(row.get(k, 1.0)), float(mrow.get(k, 1.0)), MUD_BLEND)
	return row


static func tire_noise(tire: String) -> float:
	ensure()
	return float(noise_mult.get(tire, 1.0))
