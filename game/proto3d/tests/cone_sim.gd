## Perception v2 proof: ZOOMING NEVER CHANGES WHAT YOU SEE (world-meter cone),
## the eye patch halves your arc, binoculars truly extend range, and a dog's
## alert reveals a bubble where it smelled the threat.
extends Node

var main: Node3D
var t := 0.0
var phase := 0
var phase_t := 0.0
var passed := 0
var failed := 0
var _uv0: float = 0.0
var _m0: float = 0.0
var _arc0: float = 0.0


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("CONE: scene up")


func _check(name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CONE: %s - %s" % ["PASS" if ok else "FAIL", name])


func _tap_interact() -> void:
	for pressed in [true, false]:
		var ev := InputEventAction.new()
		ev.action = "interact"
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _key_b(down: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = KEY_B
	ev.physical_keycode = KEY_B
	ev.pressed = down
	Input.parse_input_event(ev)


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0: # settle zoomed IN
			if phase_t > 0.3:
				main.cam_rig.zoom_t = 0.0
				_next()
		1:
			if phase_t > 1.6:
				_uv0 = main.vision_cone._mat.get_shader_parameter("view_range")
				_m0 = main.vision_cone.last_range_m
				main.cam_rig.zoom_t = 1.0 # zoom ALL the way out
				_next()
		2: # THE FIX: world-meters constant, screen-UV shrinks
			if phase_t > 1.6:
				var uv1: float = main.vision_cone._mat.get_shader_parameter("view_range")
				var m1: float = main.vision_cone.last_range_m
				_check("zoom does NOT change sight range (%.1fm -> %.1fm)" % [_m0, m1], absf(m1 - _m0) < 1.0)
				_check("...but the screen circle DOES scale (uv %.3f -> %.3f)" % [_uv0, uv1], uv1 < _uv0 * 0.75)
				main.cam_rig.zoom_t = 0.45
				_tap_interact() # on foot for the rest
				_next()
		3: # eye patch halves the arc
			if phase_t > 1.2:
				_arc0 = main.vision_cone.current_half_angle()
				main.use_item("eyepatch")
				_next()
		4:
			if phase_t > 1.6:
				var a: float = main.vision_cone.current_half_angle()
				_check("EYE PATCH halves the arc (%.2f -> %.2f rad)" % [_arc0, a], a < _arc0 * 0.62)
				main.use_item("eyepatch") # take it off
				_next()
		5:
			if phase_t > 1.6:
				_check("both eyes open restores the arc (%.2f)" % main.vision_cone.current_half_angle(), main.vision_cone.current_half_angle() > _arc0 * 0.9)
				_key_b(true) # raise binoculars
				_next()
		6: # binoculars EXTEND true sight range
			if phase_t > 1.8:
				_check("binoculars EXTEND sight (%.0fm)" % main.vision_cone.last_range_m, main.vision_cone.last_range_m > 90.0)
				_key_b(false)
				_next()
		7: # dog snapshot: alert reveals a bubble at the threat
			if phase_t > 0.6:
				for d in main.all_dogs:
					if d.dog_type == ProtoDog.DogType.SECURITY:
						main.player.global_position = d.global_position + Vector3(1.5, 0.3, 0)
						main.player.velocity = Vector3.ZERO
						d.interact(main)
						break
				_next()
		8:
			if phase_t > 0.8:
				var l: ProtoLurker = ProtoLurker.create()
				l.stalk_range = 0.0
				main.add_child(l)
				l.global_position = main.player.global_position + Vector3(0, 0.4, 8.0)
				_next()
		9:
			if main.vision_cone.reveal_active():
				_check("dog alert REVEALS the spot it smelled (snapshot)", true)
				_next()
			elif phase_t > 5.0:
				_check("dog alert REVEALS the spot it smelled (snapshot)", false)
				_next()
		10: # indoors, the cone clamps to the room (no bleed past the walls)
			if phase_t > 0.4:
				main.player.global_position = main.house.global_position + Vector3(0, 0.4, 0)
				main.player.velocity = Vector3.ZERO
				_next()
		11:
			if phase_t > 1.6:
				# The flat indoor clamp is gone — true LOS occlusion replaced it:
				# range stays honest, and the WALLS are what end your sight.
				_check("indoor flat clamp is DEAD — true range survives (%.0fm)" % main.vision_cone.last_range_m, main.vision_cone.last_range_m > 20.0)
				var walls := 0
				for dirv in [Vector3(1, 0, 0), Vector3(-1, 0, 0), Vector3(0, 0, 1), Vector3(0, 0, -1)]:
					var r: float = main.vision_cone.occl_range_at(dirv)
					if r >= 0.0 and r <= 7.0:
						walls += 1
				_check("...because SIGHT STOPS AT THE WALLS (LOS fan: %d/4 dirs short)" % walls, walls >= 3)
				_next()
		12:
			print("CONE RESULTS: %d passed, %d failed" % [passed, failed])
			print("CONE: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 30.0:
		print("CONE: TIMEOUT in phase %d" % phase)
		print("CONE RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
