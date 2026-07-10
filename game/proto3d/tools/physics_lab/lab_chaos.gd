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
const BUDGETS: Dictionary = {"render_ms":16.7, "script_ms":5.0, "physics_ms":8.0,
	"load_nodes":412}

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


func performance_facts() -> Dictionary:
	var render_ms: float = Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0
	var script_ms: float = Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0
	var physics_ms: float = Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0
	var first: String = ""
	if render_ms > float(BUDGETS["render_ms"]):
		first = "render_ms"
	elif script_ms > float(BUDGETS["script_ms"]):
		first = "script_ms"
	elif physics_ms > float(BUDGETS["physics_ms"]):
		first = "physics_ms"
	elif get_load_total() > int(BUDGETS["load_nodes"]):
		first = "load_nodes"
	return {"render_ms": render_ms, "script_ms": script_ms, "physics_ms": physics_ms,
		"first_exceeded": first, "auto_degraded": false,
		"load_counts": _load_counts.duplicate(true), "load_total": get_load_total()}


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
