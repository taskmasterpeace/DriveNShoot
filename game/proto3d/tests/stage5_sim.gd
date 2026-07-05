## Stage 5 proof: content streams in a ring, unloads behind, is deterministic,
## state lines announce themselves, and M opens the fog-of-war map.
extends Node

var main: Node3D
var t := 0.0
var phase := 0
var phase_t := 0.0
var passed := 0
var failed := 0
var _count0 := 0


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("WLD: scene up")


func _check(name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("WLD: %s - %s" % ["PASS" if ok else "FAIL", name])


func _key(code: Key) -> void:
	for pressed in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = code
		ev.physical_keycode = code
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _warp_car(pos: Vector3) -> void:
	main.active_car.global_transform = Transform3D(main.active_car.global_basis, pos)
	main.active_car.linear_velocity = Vector3.ZERO
	main._safe_timer = -5.0


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0:
			if phase_t > 0.8:
				_check("stream lives; chunks around spawn", main.stream.loaded.size() > 10)
				_count0 = main.stream.loaded.size()
				_warp_car(Vector3(1200, 2, 0)) # deep KANSAS-ward
				_next()
		1:
			if phase_t > 1.0:
				_check("driving deep loads NEW chunks (visited %d)" % main.stream.visited.size(), main.stream.visited.size() > _count0)
				var has_content := false
				for key in main.stream.loaded:
					if main.stream.loaded[key] != null and is_instance_valid(main.stream.loaded[key]) and main.stream.loaded[key].get_child_count() > 0:
						has_content = true
						break
				_check("chunks carry CONTENT (scatter/wrecks/caches)", has_content)
				_check("state read: %s" % main.stream.current_state(1200.0), main.stream.current_state(1200.0) != main.stream.current_state(0.0))
				_next()
		2: # unloading keeps the set bounded
			if phase_t > 0.5:
				_warp_car(Vector3(-1200, 2, 0))
				_next()
		3:
			if phase_t > 1.2:
				var bound: int = 89 # (2*(RING+1)+1)^2 + slack, RING=3
				_check("far chunks UNLOAD (loaded %d ≤ %d)" % [main.stream.loaded.size(), bound], main.stream.loaded.size() <= bound)
				_next()
		4: # welcome toast on a state line
			if phase_t > 0.5:
				_check("crossing announced a state (last: %s)" % main.stream.last_state, main.stream.last_state != "")
				_key(KEY_M)
				_next()
		5:
			if phase_t > 0.5:
				_check("M opens the world map", main.stream.map_open())
				_check("fog-of-war has your trail (%d chunks)" % main.stream.visited.size(), main.stream.visited.size() > 30)
				_key(KEY_M)
				_next()
		6:
			if phase_t > 0.3:
				_check("M closes it", not main.stream.map_open())
				_next()
		7:
			print("WLD RESULTS: %d passed, %d failed" % [passed, failed])
			print("WLD: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 30.0:
		print("WLD: TIMEOUT in phase %d" % phase)
		print("WLD RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
