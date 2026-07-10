## Nav + encumbrance proof: N cycles waypoints, the arrow tracks the target,
## an overloaded pack slows you and shows the 🎒 moodle.
extends Node

var main: Node3D
var t := 0.0
var phase := 0
var phase_t := 0.0
var _n_extra := 0
var passed := 0
var failed := 0


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("NAV: scene up")


func _check(name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("NAV: %s - %s" % ["PASS" if ok else "FAIL", name])


func _key(code: Key) -> void:
	for pressed in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = code
		ev.physical_keycode = code
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _next() -> void:
	phase += 1
	phase_t = 0.0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0:
			if phase_t > 0.8:
				_check("no waypoint by default", main.waypoint_idx == -1)
				_key(KEY_N)
				_next()
		1:
			if phase_t > 0.4:
				_check("N sets waypoint SAFEHOUSE", main.waypoint_idx == 0)
				_next()
		2:
			if phase_t > 0.6:
				# Player at highway (z~390), safehouse at z=-325 (north): screen dir should point UP (-y)
				_check("arrow tracks the target (dir.y=%.2f)" % main.hud._nav_dir.y, main.hud._nav_dir.y < -0.5)
				_key(KEY_N)
				_key(KEY_N)
				_next()
		3:
			if phase_t > 0.4:
				_check("N cycles to YOUR CAR", main.waypoint_idx == 2)
				_key(KEY_N)
				_next()
		4:
			if phase_t > 0.4 + 0.35 * _n_extra:
				# The ring gained stops since (⚒ TEST GROUNDS, proto3d.gd:326;
				# partner/drone marks when live) — walk however many remain and
				# assert the ring still ENDS at OFF.
				if main.waypoint_idx != -1 and _n_extra < 4:
					_n_extra += 1
					_key(KEY_N)
					return
				_check("N wraps to OFF (after %d extra stops)" % _n_extra, main.waypoint_idx == -1)
				# Encumbrance: dump 40 scrap (48kg) into a 32kg pack
				main.backpack.add("scrap", 40)
				_next()
		5:
			if phase_t > 0.5:
				_check("overload slows you (mult %.2f)" % main.player.speed_mult, main.player.speed_mult < 0.9)
				_check("🎒 heavy moodle shows", main.hud.active_moodles.has("heavy"))
				main.backpack.remove("scrap", 40)
				_next()
		6:
			if phase_t > 0.5:
				_check("dropping weight restores speed", main.player.speed_mult > 0.99)
				_next()
		7:
			print("NAV RESULTS: %d passed, %d failed" % [passed, failed])
			print("NAV: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 25.0:
		print("NAV: TIMEOUT in phase %d" % phase)
		print("NAV RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
