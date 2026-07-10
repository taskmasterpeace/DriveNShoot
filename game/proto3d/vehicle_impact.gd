## One finite, transport-safe law for every bullet and crash that reaches a
## real vehicle. Resolution is pure; ProtoCar3D owns component/visual effects.
class_name ProtoVehicleImpact
extends RefCounted

const MAX_ENERGY: float = 5000.0
const MAX_PENETRATION: float = 5000.0
const IMPACT_FLOOR: Dictionary = {
	"armor_durability_mult": 2.0, "dent_threshold": 8.0,
	"armor_dent_threshold": 34.0, "max_dent": 0.22, "max_shift": 0.16,
	"max_rotation_deg": 10.0, "mark_cap": 16, "deformation_seed": 1001,
}


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
	var out: Dictionary = {"world_pos": world_pos, "world_normal": world_normal,
		"incoming_dir": incoming, "energy": energy, "penetration": penetration,
		"source": String(raw.get("source", "legacy")),
		"weapon_id": String(raw.get("weapon_id", ""))}
	for optional in ["compatibility", "zone_override", "legacy_armor"]:
		if raw.has(optional):
			out[optional] = raw[optional]
	return out


static func zone_for(vehicle_transform: Transform3D, half_extents: Vector3,
		raw_packet: Dictionary) -> String:
	var hit: Dictionary = packet(raw_packet)
	var inverse: Transform3D = vehicle_transform.affine_inverse()
	var local_pos: Vector3 = inverse * (hit["world_pos"] as Vector3)
	var local_normal: Vector3 = (inverse.basis * (hit["world_normal"] as Vector3)).normalized()
	var half := Vector3(maxf(0.01, absf(half_extents.x)),
		maxf(0.01, absf(half_extents.y)), maxf(0.01, absf(half_extents.z)))
	if local_normal.y > 0.58:
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


static func profile(spec: Dictionary) -> Dictionary:
	var impact: Dictionary = IMPACT_FLOOR.duplicate(true)
	for key in (spec.get("impact", {}) as Dictionary):
		impact[key] = (spec["impact"] as Dictionary)[key]
	var authored: Dictionary = spec.get("armor", {})
	var front: float = maxf(0.0, float(authored.get("front", 30.0)))
	var rear: float = maxf(0.0, float(authored.get("rear", front * 0.75)))
	var side: float = maxf(0.0, float(authored.get("side", front * 0.85)))
	impact["armor"] = {"front":front, "rear":rear, "left":side, "right":side,
		"top":maxf(0.0, float(authored.get("top", front * 0.55))),
		"wheel":maxf(0.0, float(authored.get("wheel", side * 0.45)))}
	impact["legacy_armor"] = front
	return impact


static func initial_armor_durability(profile_in: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	var multiplier: float = maxf(0.0, float(profile_in.get("armor_durability_mult", 2.0)))
	for zone in (profile_in.get("armor", {}) as Dictionary):
		out[zone] = float(profile_in["armor"][zone]) * multiplier
	return out


static func resolve(raw_packet: Dictionary, zone: String, profile_in: Dictionary,
		armor_durability: Dictionary) -> Dictionary:
	var hit: Dictionary = packet(raw_packet)
	var energy: float = float(hit["energy"])
	var armor_faces: Dictionary = profile_in.get("armor", {})
	var resistance: float = maxf(0.0, float(armor_faces.get(zone, 0.0)))
	var multiplier: float = maxf(0.001,
		float(profile_in.get("armor_durability_mult", 2.0)))
	var maximum_durability: float = resistance * multiplier
	var armor_before: float = clampf(float(armor_durability.get(zone, maximum_durability)),
		0.0, maximum_durability)
	if bool(hit.get("compatibility", false)):
		var legacy_armor: float = float(hit.get("legacy_armor",
			profile_in.get("legacy_armor", resistance)))
		var legacy_damage: float = energy * clampf(1.0 - legacy_armor / 140.0, 0.25, 1.0)
		return {"accepted":energy > 0.0, "zone":zone, "resistance":legacy_armor,
			"absorbed":energy - legacy_damage, "remaining_energy":legacy_damage,
			"component_damage":legacy_damage, "severity_delta":legacy_damage / 180.0,
			"armor_before":armor_before, "armor_after":armor_before,
			"penetrated":legacy_damage > 0.0, "mark_allowed":false,
			"compatibility":true}
	var durability_ratio: float = armor_before / maximum_durability \
		if maximum_durability > 0.001 else 0.0
	var effective_resistance: float = maxf(0.0,
		resistance * durability_ratio - float(hit["penetration"]))
	var absorbed: float = minf(energy, effective_resistance)
	var remaining: float = maxf(0.0, energy - absorbed)
	var armor_after: float = maxf(0.0, armor_before - absorbed)
	var shallow: float = minf(0.03, energy / maxf(1.0, resistance) * 0.02) \
		if energy > 0.0 else 0.0
	var severity_delta: float = shallow if remaining <= 0.001 else \
		clampf(remaining / 120.0, 0.005, 0.35)
	return {"accepted":energy > 0.0, "zone":zone, "resistance":resistance,
		"absorbed":absorbed, "remaining_energy":remaining,
		"component_damage":remaining, "severity_delta":severity_delta,
		"armor_before":armor_before, "armor_after":armor_after,
		"penetrated":remaining > 0.001,
		"mark_allowed":energy > 0.0 and String(hit["source"]) == "bullet",
		"compatibility":false}
