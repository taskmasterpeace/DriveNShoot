## THE DATA LIBRARY — the runtime bridge between the data spine (JSON rows) and the
## engine. On first use it reads data/vehicles.json and folds every row into
## ProtoCar3D.VEHICLES: existing classes get their tunable STATS overlaid (so a
## designer's JSON edit re-tunes the fleet with no code change), and brand-new
## vehicles are MATERIALIZED from their archetype's geometry (proving pickup_truck +
## suv are pure data). Also holds the DrivnVehicle rows for the tools + HUD/compare.
class_name DrivnData
extends RefCounted

const VEHICLES_JSON := "res://data/vehicles.json"
const STRUCTURES_JSON := "res://data/world/structure_profiles.json"

## id -> DrivnVehicle (the authored rows; tools + compare view read these).
static var vehicles: Dictionary = {}
static var _loaded: bool = false

## id -> DrivnStructure (the WORLD-STRUCTURES spec §7 rows; MapForge's STRUCTURES
## tab writes the JSON, the shell builder materializes them ON DEMAND — nothing
## world-places them yet: roads + exits get arranged first).
static var structures: Dictionary = {}
static var structure_warnings: Array = [] ## sim/tool hook: every row problem found
static var _structures_loaded: bool = false


static func ensure_structures() -> void:
	if _structures_loaded:
		return
	_structures_loaded = true
	structure_warnings.clear()
	if not FileAccess.file_exists(STRUCTURES_JSON):
		structure_warnings.append("no %s — the catalog is empty (MapForge :8899 creates it)" % STRUCTURES_JSON)
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(STRUCTURES_JSON))
	if not (parsed is Dictionary) or not (parsed as Dictionary).has("structures"):
		structure_warnings.append("%s malformed — expected {structures:[...]}" % STRUCTURES_JSON)
		return
	for d in (parsed as Dictionary)["structures"]:
		if not (d is Dictionary):
			continue
		var row := DrivnStructure.from_dict(d)
		if row.id == "":
			structure_warnings.append("a structure row with no id was skipped")
			continue
		if structures.has(row.id):
			structure_warnings.append("duplicate structure id '%s' skipped" % row.id)
			continue
		for problem in row.validate():
			structure_warnings.append("%s: %s" % [row.id, problem])
		structures[row.id] = row


## Idempotent — safe to call from every ProtoCar3D.create(). First call does the
## load + overlay; later calls are a bool check.
static func ensure() -> void:
	if _loaded:
		return
	_loaded = true # set first: a parse failure must not retry-loop every spawn
	var rows := _read_rows(VEHICLES_JSON)
	for d in rows:
		var row := DrivnVehicle.from_dict(d)
		if row.id == "":
			continue
		vehicles[row.id] = row
		_fold_into_engine(row)


static func _read_rows(path: String) -> Array:
	if not FileAccess.file_exists(path):
		push_warning("DrivnData: %s missing — engine defaults stand." % path)
		return []
	var txt := FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(txt)
	if parsed is Dictionary and (parsed as Dictionary).has("vehicles"):
		return (parsed as Dictionary)["vehicles"]
	if parsed is Array:
		return parsed
	push_warning("DrivnData: %s malformed — expected {vehicles:[...]}." % path)
	return []


## Overlay (existing class) or materialize (new class) a row into ProtoCar3D.VEHICLES.
static func _fold_into_engine(row: DrivnVehicle) -> void:
	var fleet: Dictionary = ProtoCar3D.VEHICLES
	var spec: Dictionary
	if fleet.has(row.id):
		spec = fleet[row.id] # overlay onto the built-in
	else:
		# Materialize a NEW vehicle from its archetype's geometry (deep copy so we
		# never mutate the donor). No archetype (or a bad one) → skip: geometry is
		# the one thing a row can't invent from nothing.
		var arch: String = row.archetype if fleet.has(row.archetype) else ""
		if arch == "":
			push_warning("DrivnData: '%s' has no valid archetype — skipped." % row.id)
			return
		spec = (fleet[arch] as Dictionary).duplicate(true)
		fleet[row.id] = spec

	# --- Tunable STATS from the row become the row's truth ---------------------
	spec["name"] = row.name
	spec["mass"] = row.mass
	spec["engine"] = row.engine_force
	spec["top"] = row.top_speed
	spec["rev"] = row.reverse_top
	spec["tires"] = (spec.get("tires", {}) as Dictionary).duplicate()
	spec["tires"]["grip_f"] = row.tire_grip_front
	spec["tires"]["grip_r"] = row.tire_grip_rear
	spec["tires"]["dirt_mult"] = row.tire_grip_dirt
	spec["trunk_max_w"] = row.trunk_volume
	spec["dog_seats"] = row.dog_seats
	spec["wound_mult"] = row.wound_mult
	# --- Spine additions the engine didn't have (read by tools/HUD, harmless to physics)
	spec["data_id"] = row.id
	spec["family"] = row.family
	spec["passenger_seats"] = row.passenger_seats
	spec["armor"] = {"front": row.armor_front, "rear": row.armor_rear, "side": row.armor_side}
	spec["mounts"] = row.mounts
	for k in row.extra: # open schema: camper, seats, … flow straight onto the spec
		spec[k] = row.extra[k]


## Tool/compare hook: the fleet as sorted DrivnVehicle rows (ensure() first).
static func fleet() -> Array:
	ensure()
	var out: Array = vehicles.values()
	out.sort_custom(func(a, b): return a.family < b.family or (a.family == b.family and a.name < b.name))
	return out
