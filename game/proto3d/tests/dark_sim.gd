## THE DARK proof: the MOON sets how far you see at night, HEADLIGHTS carve it
## back open, the HOWLER pack owns the deep dark (circles, CHARGES, staggers on
## hits, burns off at dawn), crits land ×1.8, reloads take real time, and the
## binoculars sweep FAR fast and NAME what they see with ranges.
## Run: godot --headless --path game res://proto3d/tests/dark_sim.tscn
extends Node

const EAST := Vector3(1, 0, 0)

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _step: int = 0
var _r_full: float = 0.0
var _d0: float = 0.0
var _hp0: float = 0.0
var _mag0: int = 0
var _sound0: int = 0
var _howler: ProtoHowler = null
var _dummy: TargetDummy = null
var _lurk: ProtoLurker = null


class TargetDummy:
	extends StaticBody3D
	var hp: float = 1000.0
	func take_damage(d: float) -> void:
		hp -= d


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("DRK: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("DRK: PASS - %s" % name)
	else:
		failed += 1
		print("DRK: FAIL - %s" % name)


func _tap_interact() -> void:
	for pressed in [true, false]:
		var ev := InputEventAction.new()
		ev.action = "interact"
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _click() -> void:
	for pressed in [true, false]:
		var ev := InputEventMouseButton.new()
		ev.button_index = MOUSE_BUTTON_LEFT
		ev.pressed = pressed
		Input.parse_input_event(ev)


func _key(code: Key, pressed: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = code
	ev.physical_keycode = code
	ev.pressed = pressed
	Input.parse_input_event(ev)


func _mouse_move(rel: Vector2) -> void:
	var ev := InputEventMouseMotion.new()
	ev.relative = rel
	Input.parse_input_event(ev)


func _place(p: Vector3) -> void:
	main.player.global_position = p
	main.player.velocity = Vector3.ZERO


func _next() -> void:
	phase += 1
	phase_t = 0.0
	_step = 0


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	match phase:
		0:
			if phase_t > 0.6:
				_tap_interact()
				_place(Vector3(6, 0.3, 300))
				_next()
		1: # THE MOON RUNS THE NIGHT: full moon sees far, new moon is ink
			if _step == 0:
				_step = 1
				main.daynight.hour = 1.0
				main.daynight.moon_phase = 1.0
			elif _step == 1 and phase_t > 1.8:
				_step = 2
				_r_full = main.vision_cone.last_range_m
				_check("FULL MOON night still sees (%.0fm > 24)" % _r_full, _r_full > 24.0)
				main.daynight.moon_phase = 0.0
			elif _step == 2 and phase_t > 3.6:
				var r_new: float = main.vision_cone.last_range_m
				# THE NIGHT FLOOR LAW (SHIP goal, feel_sim): new moon = TENSE, not blind —
				# the floor was deliberately raised to 0.4 (~40 m). This check was stale
				# against that shipped feel change (it demanded the old ink-black <15 m).
				_check("NEW MOON is TENSE, not blind (%.0fm in the 30-48 band)" % r_new,
					r_new >= 30.0 and r_new <= 48.0)
				_check("the moon is the dial (%.0fm vs %.0fm)" % [_r_full, r_new], r_new < _r_full - 8.0)
				_check("clock shows the phase (%s)" % main.daynight.clock_text(), main.daynight.clock_text().contains("🌑"))
				_next()
		2: # HEADLIGHTS CARVE THE NIGHT: in the car, the beam is your sight
			if _step == 0:
				_step = 1
				_place(main.cars[0].global_position - main.cars[0].global_basis.x * 2.0)
			elif _step == 1 and phase_t > 0.4:
				_step = 2
				_tap_interact() # enter — lights are already on (it's dark)
			elif _step == 2 and phase_t > 2.2:
				_check("headlights CARVE the night open (cone %.0fm > 40 vs %.0fm on foot)" % [main.vision_cone.last_range_m, 11.5],
					main.vision_cone.last_range_m > 40.0)
				_tap_interact() # back out
				_next()
		3: # THE PACK: deep night + no grace = howlers, announced by the HOWL
			if _step == 0:
				_step = 1
				# Step AWAY from the lit car first: charges legitimately BREAK on
				# headlight beams (the mechanic), so the duel needs open dark.
				_place(Vector3(60, 0.3, 340))
				_sound0 = ProtoAudio.play_count
				main._pack_cd = 0.0
			elif main.howlers.size() >= 2:
				_check("deep night spawns the HOWLER pack (%d)" % main.howlers.size(), true)
				_check("...announced by a HOWL", ProtoAudio.play_count > _sound0)
				_howler = main.howlers[0]
				_next()
			elif phase_t > 4.0:
				_check("deep night spawns the HOWLER pack", false)
				_next()
		4: # THEY RUN AT YOU
			if _step == 0:
				_step = 1
				_howler.force_charge()
				_d0 = _howler.global_position.distance_to(main.player.global_position)
			elif phase_t > 2.6:
				# 2.0s missed by half a meter when the pack spawned FAR (50 m start —
				# spawn distance varies): same assertion, a fair observation window.
				var d: float = _howler.global_position.distance_to(main.player.global_position) if is_instance_valid(_howler) else 0.0
				_check("the howler RUNS AT YOU (%.0fm -> %.0fm)" % [_d0, d], d < _d0 * 0.65)
				_next()
		5: # HITS STAGGER THE CHARGE
			if _step == 0:
				_step = 1
				main.backpack.add("pistol", 1)
				main.backpack.add("9mm", 36)
				main.use_item("pistol")
				main.current_weapon().crit_chance = 0.0 # a crit could one-shot the subject
			elif is_instance_valid(_howler) and not _howler.is_stunned() and phase_t < 8.0:
				main.aim_override = _howler.global_position + Vector3(0, 0.8, 0) - main.player.global_position
				if _howler.state != ProtoHowler.HowlState.CHARGE:
					_howler.force_charge() # shoot chargers, not distant orbiters
				if _howler.global_position.distance_to(main.player.global_position) < 10.0 and fmod(phase_t, 0.4) < delta:
					_click()
			elif is_instance_valid(_howler) and _howler.is_stunned():
				_check("a hit STAGGERS the charge (stunned)", true)
				main.current_weapon().crit_chance = 0.15
				_next()
			else:
				_check("a hit STAGGERS the charge", is_instance_valid(_howler) and _howler.is_stunned())
				_next()
		6: # DAWN BURNS THE PACK OFF
			if _step == 0:
				_step = 1
				main.daynight.hour = 7.5
			else:
				var alive := 0
				for h in main.howlers:
					if is_instance_valid(h):
						alive += 1
				if alive == 0:
					_check("dawn BURNS the pack off the map", true)
					_next()
				elif phase_t > 8.0:
					_check("dawn BURNS the pack off (still %d alive)" % alive, false)
					_next()
		7: # CRITS: ×1.8, provable
			if _step == 0:
				_step = 1
				main.aim_override = EAST
				var w: ProtoWeapon = main.current_weapon()
				w.crit_chance = 1.0
				w.bloom = 0.0
				_dummy = TargetDummy.new()
				var cs := CollisionShape3D.new()
				var box := BoxShape3D.new()
				box.size = Vector3(2.4, 2.4, 2.4)
				cs.shape = box
				_dummy.add_child(cs)
				main.add_child(_dummy)
				_dummy.global_position = main.player.global_position + EAST * 5.0 + Vector3(0, 1.1, 0)
				_hp0 = _dummy.hp
				main.aim_override = _dummy.global_position - main.player.global_position
				_click()
			elif phase_t > 0.5:
				var dealt: float = _hp0 - _dummy.hp
				_check("CRITS land ×1.8 (dealt %.0f, base 18)" % dealt, dealt > 28.0)
				main.current_weapon().crit_chance = 0.15
				_next()
		8: # RELOAD IS A COMMITMENT: real time, fire blocked meanwhile
			if _step == 0:
				_step = 1
				_mag0 = main.current_weapon().mag
				_key(KEY_R, true)
				_key(KEY_R, false)
			elif _step == 1 and phase_t > 0.3:
				_step = 2
				_check("reload takes TIME (still reloading, mag unchanged)", main.is_reloading() and main.current_weapon().mag == _mag0)
				_click() # try to fire mid-swap
			elif _step == 2 and phase_t > 0.5:
				_step = 3
				_check("fire is BLOCKED mid-reload (mag still %d)" % main.current_weapon().mag, main.current_weapon().mag == _mag0)
			elif _step == 3 and phase_t > 1.4:
				_check("...then the mag lands full (%d)" % main.current_weapon().mag, main.current_weapon().mag == 12)
				_next()
		9: # THE GLASS: sweep far FAST, and it NAMES what it sees with ranges.
			# Down the HIGHWAY lane — the desert's scatter rocks legitimately
			# block LOS (the glass is honest; the test lane must be clear).
			if _step == 0:
				_step = 1
				main.daynight.hour = 12.0
				main.aim_override = Vector3.ZERO
				_place(Vector3(6, 0.3, 300))
				_lurk = ProtoLurker.create()
				_lurk.stalk_range = 0.0
				main.add_child(_lurk)
				_lurk.global_position = main.player.global_position + Vector3(0, 0.4, -70.0) # 70m up the road
				main.player.snap_orientation(Vector3(0, 0, -1))
				# binoculars retired (owner 2026-07-09): drive the machinery via the action
				Input.action_press("drivn_binoculars")
			elif _step == 1:
				_mouse_move(Vector2(0, -220))
				if main.cam_rig.binocular_offset.y < -60.0:
					_step = 2
					_check("the glass SWEEPS far fast now (offset %.0fm in %.1fs)" % [absf(main.cam_rig.binocular_offset.y), phase_t], phase_t < 2.5)
					phase_t = 0.0
				elif phase_t > 3.0:
					_check("the glass SWEEPS far fast (stuck at %.0fm)" % absf(main.cam_rig.binocular_offset.y), false)
					_next()
			elif _step == 2 and phase_t > 1.4:
				var named := false
				for txt in main.hud.recon_texts:
					if String(txt).contains("LURKER") and String(txt).contains("m"):
						named = true
				_check("the glass NAMES what it sees + range (%s)" % str(main.hud.recon_texts), named)
				Input.action_release("drivn_binoculars")
				_next()
		10:
			print("DRK RESULTS: %d passed, %d failed" % [passed, failed])
			print("DRK: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 60.0:
		print("DRK: TIMEOUT in phase %d" % phase)
		print("DRK RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
