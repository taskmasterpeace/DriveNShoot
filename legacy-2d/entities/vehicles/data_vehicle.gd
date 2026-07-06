## Resource that defines vehicle stats and properties.
## Create different .tres files for different vehicle types (sedan, truck, motorcycle, etc.)
class_name DataVehicle
extends Resource

@export_group("Identity")
@export var vehicle_name: String = "Vehicle"
@export var vehicle_class: String = "sedan" ## sedan, truck, motorcycle, tank, etc.
@export var icon: Texture2D

@export_group("Performance")
@export var max_speed: float = 600.0
@export var acceleration: float = 900.0
@export var braking: float = 1200.0
@export var max_speed_reverse: float = 200.0

@export_group("Handling")
@export var steering_angle: float = 2.5
@export var wheel_base: float = 70.0
@export var slip_speed: float = 350.0
@export var traction_grip: float = 10.0
@export var traction_slip: float = 3.0

@export_group("Durability")
@export var max_armor: int = 100
@export var fuel_capacity: float = 100.0

@export_group("Combat")
@export var ram_damage: int = 20 ## Damage dealt when ramming
@export var weapon_slots: int = 2 ## Number of weapon mount points
@export var default_weapon: DataWeapon ## Primary weapon this vehicle spawns with.
@export var default_weapons: Array[DataWeapon] = [] ## Extra weapons (e.g. assigned by the garage). Capped with default_weapon to weapon_slots.

@export_group("Economy")
@export var price: int = 5000
@export var repair_cost_multiplier: float = 1.0
