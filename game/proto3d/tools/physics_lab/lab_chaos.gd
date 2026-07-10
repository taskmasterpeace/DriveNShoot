## Seeded command transport and explicit load spawning. It reports pressure; it
## never silently lowers counts or quality during a comparison.
class_name ProtoLabChaos
extends RefCounted

const TRANSPORTS: Dictionary = {
	"local": {"latency_ms":0.0, "jitter_ms":0.0, "loss":0.0, "update_hz":60.0},
	"good_coop": {"latency_ms":45.0, "jitter_ms":12.0, "loss":0.01, "update_hz":30.0},
	"bad_wifi": {"latency_ms":120.0, "jitter_ms":45.0, "loss":0.08, "update_hz":20.0},
	"hostile_jitter": {"latency_ms":220.0, "jitter_ms":120.0, "loss":0.18, "update_hz":10.0},
}
const LOAD_MAX: Dictionary = {"spectators":120, "fighters":12, "rigid_props":60,
	"flashes":100, "marks":100, "cars":20}
const BUDGETS: Dictionary = {"frame_cpu_ms":16.7, "script_estimate_ms":5.0,
	"physics_ms":8.0, "render_draw_calls":2200, "load_nodes":412}
const DAMAGE_SAMPLE_INTERVAL_MS: int = 250

var preset_id: String = "local"
var preset: Dictionary = TRANSPORTS["local"].duplicate(true)
var _rng := RandomNumberGenerator.new()
var _queue: Array[Dictionary] = []
var _dropped: int = 0
var _rate_limited: int = 0
var _enqueued: int = 0
var _delivered: int = 0
var _max_delay: float = 0.0
var _last_enqueue_ms: float = -INF
var _load_root: Node3D = null
var _load_counts: Dictionary = {}
var _damage_cache: Dictionary = {"impact_us":0, "impact_events":0, "deform_events":0,
	"mark_reuses":0, "damaged_cars":0, "damage_panels":0, "damage_samples":0}
var _damage_sampled_at_ms: int = -100000
var _damage_samples: int = 0


func configure_transport(id: String, seed: int = 1) -> bool:
	if not TRANSPORTS.has(id):
		return false
	preset_id = id
	preset = (TRANSPORTS[id] as Dictionary).duplicate(true)
	_rng.seed = seed
	_queue.clear()
	_dropped = 0
	_rate_limited = 0
	_enqueued = 0
	_delivered = 0
	_max_delay = 0.0
	_last_enqueue_ms = -INF
	return true


func enqueue(command: RefCounted, now_ms: float) -> bool:
	_enqueued += 1
	var min_interval: float = 1000.0 / float(preset["update_hz"])
	if now_ms - _last_enqueue_ms + 0.001 < min_interval:
		_rate_limited += 1
		_dropped += 1
		return false
	_last_enqueue_ms = now_ms
	if _rng.randf() < float(preset["loss"]):
		_dropped += 1
		return false
	var delay: float = maxf(0.0, float(preset["latency_ms"]) \
		+ _rng.randf_range(-float(preset["jitter_ms"]), float(preset["jitter_ms"])))
	_max_delay = maxf(_max_delay, delay)
	_queue.append({"deliver_ms": now_ms + delay, "sent_ms": now_ms,
		"delay_ms": delay, "command": command.duplicate_frame()})
	return true


func pump(now_ms: float) -> Array:
	_queue.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return float(a["deliver_ms"]) < float(b["deliver_ms"]))
	var delivered: Array = []
	var remaining: Array[Dictionary] = []
	for packet in _queue:
		if float(packet["deliver_ms"]) <= now_ms:
			delivered.append(packet.duplicate(true))
			_delivered += 1
		else:
			remaining.append(packet)
	_queue = remaining
	return delivered


func transport_facts() -> Dictionary:
	return {"preset": preset_id, "enqueued": _enqueued, "delivered": _delivered,
		"dropped": _dropped, "rate_limited": _rate_limited,
		"queued": _queue.size(), "max_delay_ms": _max_delay,
		"latency_ms": float(preset["latency_ms"]),
		"jitter_ms": float(preset["jitter_ms"]), "loss": float(preset["loss"])}


func set_load(parent: Node, amount: float) -> Dictionary:
	clear_load()
	var host := parent as Node
	_load_root = Node3D.new()
	_load_root.name = "ChaosLoad"
	host.add_child(_load_root)
	_load_counts.clear()
	var factor: float = clampf(amount, 0.0, 1.0)
	for category in LOAD_MAX:
		var count: int = int(round(float(LOAD_MAX[category]) * factor))
		_load_counts[category] = count
		for i in count:
			_spawn_load_node(String(category), i)
	return _load_counts.duplicate(true)


func _spawn_load_node(category: String, index: int) -> void:
	var node: Node3D
	if category == "rigid_props":
		var rigid := RigidBody3D.new()
		rigid.mass = 2.0
		rigid.position = Vector3(float(index % 10), 1.0 + float(index / 10), 48)
		var collision := CollisionShape3D.new()
		var shape := BoxShape3D.new()
		shape.size = Vector3(0.35, 0.35, 0.35)
		collision.shape = shape
		rigid.add_child(collision)
		node = rigid
	elif category == "flashes":
		var light := OmniLight3D.new()
		light.omni_range = 2.5
		light.light_energy = 0.6
		light.position = Vector3(float(index % 20) - 10.0, 1.2, 42 + float(index / 20))
		node = light
	else:
		var mesh_node := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = {"spectators":Vector3(0.25,1.5,0.25), "fighters":Vector3(0.4,1.7,0.35),
			"marks":Vector3(0.12,0.01,0.12), "cars":Vector3(1.8,0.8,3.4)}.get(
			category, Vector3(0.25, 0.25, 0.25))
		mesh_node.mesh = box
		mesh_node.material_override = ProtoWorldBuilder.material({"spectators":Color("#6d756f"),
			"fighters":Color("#9b4936"), "marks":Color("#b98132"),
			"cars":Color("#4d655e")}.get(category, Color("#777777")), 0.75)
		mesh_node.position = Vector3(float(index % 20) - 10.0, box.size.y * 0.5,
			38 + float(index / 20) * 2.0)
		node = mesh_node
	node.name = "%s_%03d" % [category, index]
	node.add_to_group("lab_chaos_load")
	node.set_meta("load_category", category)
	_load_root.add_child(node)


func performance_facts(force_damage_sample: bool = false) -> Dictionary:
	# Godot exposes CPU frame/physics time and render workload counters, but no
	# portable per-frame GPU milliseconds here. Keep those facts distinct instead
	# of presenting the same TIME_PROCESS sample under two misleading labels.
	var frame_cpu_ms: float = Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0
	var physics_ms: float = Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0
	var navigation_ms: float = Performance.get_monitor(Performance.TIME_NAVIGATION_PROCESS) * 1000.0
	var script_estimate_ms: float = maxf(0.0, frame_cpu_ms - physics_ms - navigation_ms)
	var render_draw_calls: int = int(Performance.get_monitor(
		Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
	var render_objects: int = int(Performance.get_monitor(
		Performance.RENDER_TOTAL_OBJECTS_IN_FRAME))
	var first: String = ""
	if frame_cpu_ms > float(BUDGETS["frame_cpu_ms"]):
		first = "frame_cpu_ms"
	elif script_estimate_ms > float(BUDGETS["script_estimate_ms"]):
		first = "script_estimate_ms"
	elif physics_ms > float(BUDGETS["physics_ms"]):
		first = "physics_ms"
	elif render_draw_calls > int(BUDGETS["render_draw_calls"]):
		first = "render_draw_calls"
	elif get_load_total() > int(BUDGETS["load_nodes"]):
		first = "load_nodes"
	var damage: Dictionary = _damage_performance_facts(force_damage_sample)
	return {"frame_cpu_ms": frame_cpu_ms, "script_estimate_ms": script_estimate_ms,
		"physics_ms": physics_ms, "navigation_ms": navigation_ms,
		"render_metric": "draw_calls", "render_draw_calls": render_draw_calls,
		"render_objects": render_objects, "first_exceeded": first, "auto_degraded": false,
		"load_counts": _load_counts.duplicate(true), "load_total": get_load_total(),
		"impact_us":damage["impact_us"], "impact_events":damage["impact_events"],
		"deform_events":damage["deform_events"], "mark_reuses":damage["mark_reuses"],
		"damaged_cars":damage["damaged_cars"], "damage_panels":damage["damage_panels"],
		"damage_samples":damage["damage_samples"]}


func _damage_performance_facts(force_sample: bool = false) -> Dictionary:
	var now_ms: int = Time.get_ticks_msec()
	if not force_sample and now_ms - _damage_sampled_at_ms < DAMAGE_SAMPLE_INTERVAL_MS:
		return _damage_cache
	var out: Dictionary = {"impact_us":0, "impact_events":0, "deform_events":0,
		"mark_reuses":0, "damaged_cars":0, "damage_panels":0, "damage_samples":0}
	_damage_sampled_at_ms = now_ms
	_damage_samples += 1
	out["damage_samples"] = _damage_samples
	var main_loop: MainLoop = Engine.get_main_loop()
	if main_loop is not SceneTree:
		_damage_cache = out
		return out
	for raw_visual in (main_loop as SceneTree).get_nodes_in_group("vehicle_damage_visual"):
		var visual := raw_visual as Node
		if visual == null or not is_instance_valid(visual):
			continue
		var deform_events: int = int(visual.get("deform_events"))
		var mark_summaries: Array = visual.get("mark_summaries") as Array
		var has_damage: bool = deform_events > 0 or mark_summaries.any(
			func(summary: Dictionary) -> bool: return not summary.is_empty())
		if not has_damage:
			for severity in (visual.get("zone_state") as Dictionary).values():
				if float(severity) > 0.0001:
					has_damage = true
					break
		if not has_damage:
			continue
		out["damaged_cars"] = int(out["damaged_cars"]) + 1
		out["damage_panels"] = int(out["damage_panels"]) \
			+ (visual.get("rest_transforms") as Dictionary).size()
		out["deform_events"] = int(out["deform_events"]) + deform_events
		out["mark_reuses"] = int(out["mark_reuses"]) + int(visual.get("mark_reuses"))
		var damage_car := visual.get("car") as ProtoCar3D
		if damage_car != null and is_instance_valid(damage_car):
			out["impact_us"] = maxi(int(out["impact_us"]), damage_car.last_impact_us)
			out["impact_events"] = int(out["impact_events"]) + damage_car.impact_events
	_damage_cache = out
	return out


func get_load_total() -> int:
	var total: int = 0
	for value in _load_counts.values():
		total += int(value)
	return total


func clear_load() -> void:
	if _load_root != null and is_instance_valid(_load_root):
		_load_root.queue_free()
	_load_root = null
	_load_counts.clear()
