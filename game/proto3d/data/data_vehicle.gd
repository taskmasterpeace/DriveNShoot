## THE DATA SPINE — a vehicle is a ROW (MASTER_PLAN Goal 1). This Resource is the
## authored, tool-editable, AI-readable schema for one vehicle: the stats a designer
## (human or model) tunes in data/vehicles.json, stamped to .tres, overlaid onto the
## engine's geometry at load. Adding a vehicle = adding a JSON row + an archetype —
## never new code (proven by pickup_truck + suv, which exist ONLY as data).
##
## Geometry (chassis/hull/wheels) stays in ProtoCar3D.VEHICLES keyed by `archetype`
## because rig CONSTRUCTION isn't content to tune; the STATS below are.
class_name DrivnVehicle
extends Resource

@export var id: String = ""             ## unique key (drives ProtoCar3D.create(id, color))
@export var name: String = "Vehicle"    ## display name
## The body to BUILD from — an existing ProtoCar3D.VEHICLES key (scavenger, pickup,
## van, semi…). New vehicles reuse a proven chassis; "" means id IS its own archetype.
@export var archetype: String = ""
@export var family: String = "car"      ## tooling/compare group: car|bike|truck|van|suv|rig

@export_group("Drivetrain")
@export var mass: float = 1000.0
@export var engine_force: float = 6500.0
@export var top_speed: float = 32.0     ## m/s
@export var reverse_top: float = 11.0

@export_group("Tires / Grip")
@export var tire_grip_front: float = 5.5
@export var tire_grip_rear: float = 5.0
@export var tire_grip_dirt: float = 0.8 ## off-road multiplier (knobby 0.95 vs highway 0.68)

@export_group("Cargo & Seats")
@export var trunk_volume: float = 40.0  ## kg the trunk holds (maps to spec.trunk_max_w)
@export var passenger_seats: int = 1    ## humans (driver + riders)
@export var dog_seats: int = 0          ## the pack rides along, up to this many

@export_group("Armor (AAA — front & center)")
@export_range(0, 100) var armor_front: float = 40.0
@export_range(0, 100) var armor_rear: float = 30.0
@export_range(0, 100) var armor_side: float = 30.0
@export var wound_mult: float = 1.0     ## how much crash damage the RIDER takes (exposed bike = 2.5)

@export_group("Weapons")
## Mount points: [{ "id": "hood", "pos": Vector3, "arc_deg": float }] — the mount
## SYSTEM exists in ProtoCar3D; this is the data side (which rigs can bolt a gun).
@export var mounts: Array = []


## Build a DrivnVehicle from a plain JSON dict (the stamper + loader both use this).
static func from_dict(d: Dictionary) -> DrivnVehicle:
	var v := DrivnVehicle.new()
	v.id = String(d.get("id", ""))
	v.name = String(d.get("name", v.id.capitalize()))
	v.archetype = String(d.get("archetype", ""))
	v.family = String(d.get("family", "car"))
	v.mass = float(d.get("mass", 1000.0))
	v.engine_force = float(d.get("engine_force", 6500.0))
	v.top_speed = float(d.get("top_speed", 32.0))
	v.reverse_top = float(d.get("reverse_top", 11.0))
	var grip: Dictionary = d.get("tire_grip", {})
	v.tire_grip_front = float(grip.get("front", 5.5))
	v.tire_grip_rear = float(grip.get("rear", 5.0))
	v.tire_grip_dirt = float(grip.get("dirt", 0.8))
	v.trunk_volume = float(d.get("trunk_volume", 40.0))
	v.passenger_seats = int(d.get("passenger_seats", 1))
	v.dog_seats = int(d.get("dog_seats", 0))
	var armor: Dictionary = d.get("armor", {})
	v.armor_front = float(armor.get("front", 40.0))
	v.armor_rear = float(armor.get("rear", 30.0))
	v.armor_side = float(armor.get("side", 30.0))
	v.wound_mult = float(d.get("wound_mult", 1.0))
	v.mounts = d.get("mounts", [])
	return v


## A single armor rating (mean of the three faces) for compact HUD/compare readouts.
func armor_rating() -> float:
	return (armor_front + armor_rear + armor_side) / 3.0


## Round-trip back to a plain dict (the tool exports this to JSON).
func to_dict() -> Dictionary:
	return {
		"id": id, "name": name, "archetype": archetype, "family": family,
		"mass": mass, "engine_force": engine_force, "top_speed": top_speed, "reverse_top": reverse_top,
		"tire_grip": {"front": tire_grip_front, "rear": tire_grip_rear, "dirt": tire_grip_dirt},
		"trunk_volume": trunk_volume, "passenger_seats": passenger_seats, "dog_seats": dog_seats,
		"armor": {"front": armor_front, "rear": armor_rear, "side": armor_side},
		"wound_mult": wound_mult, "mounts": mounts,
	}
