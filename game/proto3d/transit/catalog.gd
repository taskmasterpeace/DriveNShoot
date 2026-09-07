class_name ProtoTransitCatalog
extends RefCounted
## Validated public-transport rows over the authoritative world-map geometry.

const STOP_KEYS: PackedStringArray = ["id", "name", "road", "fraction", "side", "shoulder_m", "pad_offset_m"]
const SERVICE_KEYS: PackedStringArray = ["id", "name", "kind", "origin", "destination", "fare", "capacity", "speed_mps", "headway_minutes", "boarding_minutes", "risk"]

var valid: bool = false
var errors: PackedStringArray = []
var stops: Dictionary = {}
var services: Dictionary = {}
var _map: ProtoUSMap


func setup(rows: Dictionary, map: ProtoUSMap) -> bool:
	valid = false
	errors.clear()
	stops.clear()
	services.clear()
	_map = null
	if map == null or not map.ok:
		errors.append("map unavailable")
		return false
	if not _exact_keys(rows, PackedStringArray(["version", "stops", "services"])) or not _integer_number(rows.get("version")) or int(rows.version) != 1 or not rows.get("stops") is Array or not rows.get("services") is Array:
		errors.append("invalid catalog root")
		return false
	var candidate_stops: Dictionary = {}
	for value: Variant in rows.stops:
		if not value is Dictionary:
			errors.append("stop row is not a dictionary")
			continue
		var row: Dictionary = value
		var id: String = String(row.get("id", ""))
		if not _exact_keys(row, STOP_KEYS):
			errors.append("stop %s has unknown or missing fields" % id)
			continue
		if not row.id is String or id.is_empty() or not row.name is String or String(row.name).is_empty() or not row.road is String or String(row.road).is_empty():
			errors.append("stop %s has invalid identity" % id)
			continue
		if candidate_stops.has(id):
			errors.append("duplicate stop %s" % id)
			continue
		if not _finite_number(row.fraction) or float(row.fraction) < 0.0 or float(row.fraction) > 1.0:
			errors.append("stop %s has invalid fraction" % id)
			continue
		if not _integer_number(row.side) or int(row.side) not in [-1, 1]:
			errors.append("stop %s has invalid side" % id)
			continue
		if not _finite_number(row.shoulder_m) or float(row.shoulder_m) < 0.0 or not _finite_number(row.pad_offset_m) or float(row.pad_offset_m) < 0.0:
			errors.append("stop %s has invalid offsets" % id)
			continue
		var road: Dictionary = map.road_by_id(String(row.road))
		if road.is_empty() or not _valid_road_points(road):
			errors.append("stop %s references invalid road" % id)
			continue
		var copy: Dictionary = row.duplicate(true)
		copy.fraction = float(row.fraction)
		copy.side = int(row.side)
		copy.shoulder_m = float(row.shoulder_m)
		copy.pad_offset_m = float(row.pad_offset_m)
		candidate_stops[id] = copy
	var candidate_services: Dictionary = {}
	for value: Variant in rows.services:
		if not value is Dictionary:
			errors.append("service row is not a dictionary")
			continue
		var row: Dictionary = value
		var id: String = String(row.get("id", ""))
		if not _exact_keys(row, SERVICE_KEYS):
			errors.append("service %s has unknown or missing fields" % id)
			continue
		if not row.id is String or id.is_empty() or not row.name is String or String(row.name).is_empty() or not row.kind is String or String(row.kind) not in ["coach", "helicopter"] or not row.origin is String or not row.destination is String or not row.risk is String or String(row.risk).is_empty():
			errors.append("service %s has invalid identity" % id)
			continue
		if candidate_services.has(id):
			errors.append("duplicate service %s" % id)
			continue
		if not _integer_number(row.fare) or int(row.fare) < 0 or not _integer_number(row.capacity) or int(row.capacity) <= 0:
			errors.append("service %s has invalid fare or capacity" % id)
			continue
		if not _positive_number(row.speed_mps) or not _positive_number(row.headway_minutes) or not _positive_number(row.boarding_minutes):
			errors.append("service %s has invalid timing" % id)
			continue
		var origin_id: String = String(row.origin)
		var destination_id: String = String(row.destination)
		if not candidate_stops.has(origin_id) or not candidate_stops.has(destination_id) or origin_id == destination_id:
			errors.append("service %s has absent or repeated endpoints" % id)
			continue
		var origin: Dictionary = candidate_stops[origin_id]
		var destination: Dictionary = candidate_stops[destination_id]
		if origin.road != destination.road or is_equal_approx(float(origin.fraction), float(destination.fraction)):
			errors.append("service %s has no valid corridor direction" % id)
			continue
		var copy: Dictionary = row.duplicate(true)
		copy.fare = int(row.fare)
		copy.capacity = int(row.capacity)
		copy.speed_mps = float(row.speed_mps)
		copy.headway_minutes = float(row.headway_minutes)
		copy.boarding_minutes = float(row.boarding_minutes)
		candidate_services[id] = copy
	if not errors.is_empty():
		return false
	stops = candidate_stops.duplicate(true)
	services = candidate_services.duplicate(true)
	_map = map
	valid = true
	return true


func stop_position(id: String) -> Vector3:
	if not valid or not stops.has(id):
		return Vector3.ZERO
	var stop: Dictionary = stops[id]
	var road: Dictionary = _map.road_by_id(String(stop.road))
	var sample: Dictionary = _sample(road, float(stop.fraction))
	if sample.is_empty():
		return Vector3.ZERO
	var tangent: Vector2 = sample.tangent
	var right := Vector2(-tangent.y, tangent.x)
	var geometry: Dictionary = ProtoUSMap.road_geometry(road)
	var lateral: float = float(geometry.width) * 0.5 + float(stop.shoulder_m)
	var point: Vector2 = sample.point + right * lateral * float(stop.side)
	return Vector3(point.x, ProtoWorldBuilder.ground_y(point.x, point.y), point.y)


func next_departure(service_id: String, now_minutes: float) -> float:
	if not valid or not services.has(service_id) or not is_finite(now_minutes):
		return -1.0
	var headway: float = float(services[service_id].headway_minutes)
	return ceil(now_minutes / headway) * headway


func route_points(service_id: String) -> PackedVector3Array:
	var route := PackedVector3Array()
	if not valid or not services.has(service_id):
		return route
	var service: Dictionary = services[service_id]
	var origin: Dictionary = stops[String(service.origin)]
	var destination: Dictionary = stops[String(service.destination)]
	var road: Dictionary = _map.road_by_id(String(origin.road))
	var origin_fraction: float = float(origin.fraction)
	var destination_fraction: float = float(destination.fraction)
	var direction: int = 1 if destination_fraction > origin_fraction else -1
	var fractions: Array[float] = [origin_fraction]
	var lengths: PackedFloat32Array = _cumulative_lengths(road)
	var total: float = lengths[lengths.size() - 1]
	for index: int in range(1, lengths.size() - 1):
		var fraction: float = float(lengths[index]) / total
		if (direction > 0 and fraction > origin_fraction and fraction < destination_fraction) or (direction < 0 and fraction < origin_fraction and fraction > destination_fraction):
			fractions.append(fraction)
	if direction < 0 and fractions.size() > 1:
		fractions.sort()
		fractions.reverse()
	fractions.append(destination_fraction)
	for fraction: float in fractions:
		var sample: Dictionary = _sample(road, fraction)
		var heading: Vector2 = sample.tangent * float(direction)
		var right := Vector2(-heading.y, heading.x)
		var point: Vector2 = sample.point + right * ProtoUSMap.lane_offset(road, 0)
		route.append(Vector3(point.x, ProtoWorldBuilder.ground_y(point.x, point.y), point.y))
	return route


static func _sample(road: Dictionary, fraction: float) -> Dictionary:
	var points: PackedVector2Array = road["pts"]
	var lengths: PackedFloat32Array = _cumulative_lengths(road)
	if lengths.is_empty() or lengths[lengths.size() - 1] <= 0.0:
		return {}
	var target: float = clampf(fraction, 0.0, 1.0) * lengths[lengths.size() - 1]
	for index: int in range(points.size() - 1):
		var start: float = lengths[index]
		var finish: float = lengths[index + 1]
		if target <= finish or index == points.size() - 2:
			var tangent: Vector2 = (points[index + 1] - points[index]).normalized()
			var weight: float = clampf((target - start) / maxf(finish - start, 0.0001), 0.0, 1.0)
			return {"point": points[index].lerp(points[index + 1], weight), "tangent": tangent}
	return {}


static func _cumulative_lengths(road: Dictionary) -> PackedFloat32Array:
	var points: PackedVector2Array = road["pts"]
	var lengths := PackedFloat32Array([0.0])
	for index: int in range(points.size() - 1):
		lengths.append(lengths[index] + points[index].distance_to(points[index + 1]))
	return lengths


static func _valid_road_points(road: Dictionary) -> bool:
	if not road.get("pts") is PackedVector2Array:
		return false
	var points: PackedVector2Array = road.pts
	if points.size() < 2:
		return false
	var length: float = 0.0
	for index: int in range(points.size()):
		if not points[index].is_finite():
			return false
		if index > 0:
			length += points[index - 1].distance_to(points[index])
	return length > 0.001


static func _exact_keys(row: Dictionary, expected: PackedStringArray) -> bool:
	if row.size() != expected.size():
		return false
	for key: String in expected:
		if not row.has(key):
			return false
	return true


static func _finite_number(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value))


static func _positive_number(value: Variant) -> bool:
	return _finite_number(value) and float(value) > 0.0


static func _integer_number(value: Variant) -> bool:
	return _finite_number(value) and float(value) == floor(float(value))
