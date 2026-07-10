## One finite, transport-safe law for every bullet and crash that reaches a
## real vehicle. Resolution is pure; ProtoCar3D owns component/visual effects.
class_name ProtoVehicleImpact
extends RefCounted

const MAX_ENERGY: float = 5000.0
const MAX_PENETRATION: float = 5000.0


static func _finite_vector(value: Variant, fallback: Vector3) -> Vector3:
	if value is Vector3 and (value as Vector3).is_finite():
		return value as Vector3
	return fallback


static func _finite_float(value: Variant, fallback: float = 0.0) -> float:
	var number: float = float(value) if value is float or value is int else fallback
	return number if is_finite(number) else (MAX_ENERGY if number > 0.0 else fallback)


static func packet(raw: Dictionary) -> Dictionary:
	var world_pos: Vector3 = _finite_vector(raw.get("world_pos", Vector3.ZERO), Vector3.ZERO)
	var world_normal: Vector3 = _finite_vector(raw.get("world_normal", Vector3.UP), Vector3.UP)
	if world_normal.length_squared() < 0.000001:
		world_normal = Vector3.UP
	else:
		world_normal = world_normal.normalized()
	var incoming: Vector3 = _finite_vector(raw.get("incoming_dir", -world_normal), -world_normal)
	if incoming.length_squared() < 0.000001:
		incoming = -world_normal
	else:
		incoming = incoming.normalized()
	var energy: float = clampf(_finite_float(raw.get("energy", 0.0)), 0.0, MAX_ENERGY)
	var penetration: float = clampf(_finite_float(raw.get("penetration", 0.0)),
		0.0, MAX_PENETRATION)
	return {"world_pos": world_pos, "world_normal": world_normal,
		"incoming_dir": incoming, "energy": energy, "penetration": penetration,
		"source": String(raw.get("source", "legacy")),
		"weapon_id": String(raw.get("weapon_id", ""))}


static func zone_for(vehicle_transform: Transform3D, half_extents: Vector3,
		raw_packet: Dictionary) -> String:
	var hit: Dictionary = packet(raw_packet)
	var inverse: Transform3D = vehicle_transform.affine_inverse()
	var local_pos: Vector3 = inverse * (hit["world_pos"] as Vector3)
	var local_normal: Vector3 = (inverse.basis * (hit["world_normal"] as Vector3)).normalized()
	var half := Vector3(maxf(0.01, absf(half_extents.x)),
		maxf(0.01, absf(half_extents.y)), maxf(0.01, absf(half_extents.z)))
	if local_normal.y > 0.58 or local_pos.y >= half.y * 0.82:
		return "top"
	var near_wheel_height: bool = local_pos.y <= maxf(0.35, half.y * 0.32)
	var near_side: bool = absf(local_pos.x) >= half.x * 0.72
	var near_axle: bool = absf(local_pos.z) >= half.z * 0.42
	if near_wheel_height and near_side and near_axle:
		return "wheel"
	if absf(local_normal.z) >= 0.58 and absf(local_normal.z) >= absf(local_normal.x):
		return "front" if local_normal.z < 0.0 else "rear"
	if absf(local_normal.x) >= 0.58:
		return "left" if local_normal.x < 0.0 else "right"
	var x_ratio: float = absf(local_pos.x) / half.x
	var z_ratio: float = absf(local_pos.z) / half.z
	if z_ratio >= x_ratio:
		return "front" if local_pos.z < 0.0 else "rear"
	return "left" if local_pos.x < 0.0 else "right"


static func contact_packet(world_pos: Vector3, world_normal: Vector3,
		incoming_dir: Vector3, impulse: float, source: String = "crash") -> Dictionary:
	return packet({"world_pos":world_pos, "world_normal":world_normal,
		"incoming_dir":incoming_dir, "energy":impulse, "penetration":0.0,
		"source":source, "weapon_id":""})
