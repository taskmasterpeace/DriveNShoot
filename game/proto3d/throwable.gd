## Data-folded throwable law. Preview and projectile both integrate the same
## gravity/velocity values so the arc shown is the arc thrown.
class_name ProtoThrowable
extends RefCounted

const DATA_PATH := "res://data/throwables.json"
const GRENADE_FLOOR: Dictionary = {
	"id": "grenade", "mass": 0.5, "tap_charge": 0.45, "charge_s": 0.9,
	"speed_min": 7.0, "speed_max": 15.0, "up_min": 3.6, "up_max": 7.2,
	"gravity": 12.0, "fuse_s": 1.6, "blast": 5.0, "damage": 55.0,
	"lab_damage": 0.0, "lab_stun": 1.2,
}

static var _loaded: bool = false
static var _rows: Dictionary = {}


static func _ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true
	_rows = {"grenade": GRENADE_FLOOR.duplicate(true)}
	if not FileAccess.file_exists(DATA_PATH):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	if not (parsed is Dictionary):
		return
	for raw in (parsed as Dictionary).get("throwables", []):
		if not (raw is Dictionary):
			continue
		var id: String = String(raw.get("id", ""))
		if id == "":
			continue
		var merged: Dictionary = (_rows.get(id, {"id": id}) as Dictionary).duplicate(true)
		for key in raw:
			merged[key] = raw[key]
		_rows[id] = merged


static func row(id: String) -> Dictionary:
	_ensure_loaded()
	return (_rows.get(id, {}) as Dictionary).duplicate(true)


static func charge_for(held_s: float, throwable_row: Dictionary) -> float:
	var floor_charge: float = float(throwable_row.get("tap_charge", 0.45))
	var duration: float = maxf(0.01, float(throwable_row.get("charge_s", 0.9)))
	return lerpf(floor_charge, 1.0, clampf(held_s / duration, 0.0, 1.0))


static func launch_velocity(dir: Vector3, charge: float, strength: int, mass: float,
		inherited: Vector3, throwable_row: Dictionary) -> Vector3:
	var power: float = lerpf(float(throwable_row["speed_min"]),
		float(throwable_row["speed_max"]), charge)
	power *= clampf(0.82 + 0.035 * float(strength), 0.82, 1.24)
	power *= sqrt(0.5 / maxf(mass, 0.1))
	var up: float = lerpf(float(throwable_row["up_min"]),
		float(throwable_row["up_max"]), charge)
	var forward: Vector3 = dir.normalized() if dir.length_squared() > 0.001 else Vector3.FORWARD
	return forward * power + Vector3.UP * up + inherited * 0.65


static func predict(origin: Vector3, velocity: Vector3, gravity: float,
		steps: int, delta: float) -> PackedVector3Array:
	var points := PackedVector3Array([origin])
	var pos: Vector3 = origin
	var vel: Vector3 = velocity
	for _i in steps:
		vel.y -= gravity * delta
		pos += vel * delta
		points.append(pos)
	return points


static func create_projectile(throwable_row: Dictionary, velocity: Vector3) -> Node3D:
	var projectile := Projectile.new()
	projectile.configure(throwable_row, velocity)
	return projectile


class Projectile extends Node3D:
	var vel: Vector3 = Vector3.ZERO
	var gravity: float = 12.0
	var fuse: float = 1.6
	var blast: float = 5.0
	var damage: float = 55.0
	var lab_damage: float = 0.0
	var lab_stun: float = 1.2

	func configure(throwable_row: Dictionary, velocity: Vector3) -> void:
		vel = velocity
		gravity = float(throwable_row.get("gravity", 12.0))
		fuse = float(throwable_row.get("fuse_s", 1.6))
		blast = float(throwable_row.get("blast", 5.0))
		damage = float(throwable_row.get("damage", 55.0))
		lab_damage = float(throwable_row.get("lab_damage", 0.0))
		lab_stun = float(throwable_row.get("lab_stun", 1.2))

	func _ready() -> void:
		add_to_group("throwable_projectile")
		var mesh := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.18, 0.18, 0.18)
		mesh.mesh = box
		mesh.material_override = ProtoWorldBuilder.material(Color(0.2, 0.28, 0.16), 0.6)
		add_child(mesh)

	func advance_fixed(delta: float) -> void:
		vel.y -= gravity * delta
		global_position += vel * delta

	func _physics_process(delta: float) -> void:
		advance_fixed(delta)
		if global_position.y < 0.15:
			global_position.y = 0.15
			vel *= 0.35
			vel.y = 0.0
		fuse -= delta
		if fuse <= 0.0:
			var main := get_parent()
			if main.has_method("on_explosion"):
				var in_lab: bool = "lab_mode" in main and main.get("lab_mode") == true
				var dealt: float = lab_damage if in_lab else damage
				main.on_explosion(global_position, dealt, blast)
			queue_free()
