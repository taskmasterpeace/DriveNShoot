## STAGE 7 proof — Companions, Animals & the Second Window:
## TAME a staggered howler with meat (→ Fang the Mutant Hound joins the PACK),
## HIRE Sam the Drifter (40 scrip — follows, FIGHTS with his own gun, SCOUTS:
## what he sees that you can't pings your perception), and the SecondaryView
## module cycles REARVIEW/DRONE on V (DOGCAM retired 2026-07-07 — that screen
## real estate is now full-screen binoculars; binocular_sim covers that arc).
## Inputs drive it; teleports stage only.
## Run: godot --headless --path game res://proto3d/tests/stage7_sim.tscn
extends Node

const EAST := Vector3(1, 0, 0)
const NORTH := Vector3(0, 0, -1)

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _step: int = 0
var _howler: ProtoHowler = null
var _lurk: ProtoLurker = null
var _jack0: int = 0
var _fangs: int = 0


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("S7: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("S7: PASS - %s" % name)
	else:
		failed += 1
		print("S7: FAIL - %s" % name)


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


func _tap_key(code: Key) -> void:
	_key(code, true)
	_key(code, false)


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
				_tap_interact() # exit lands NEXT frame — place the player AFTER, not now
				_next()
		1: # TAMING RUNG 1: stagger a howler, feed it meat ×3 → Fang joins the pack
			if _step == 0:
				_step = 1
				_place(Vector3(6, 0.3, 300)) # clear lane, far from the parked car
				main.player.snap_orientation(NORTH)
				main.daynight.hour = 1.0 # howlers are NIGHT things — daylight makes them flee
				main.daynight.moon_phase = 0.6
				main.backpack.add("pistol", 1)
				main.backpack.add("9mm", 36)
				main.backpack.add("meat", 4)
				main.use_item("pistol")
				main.current_weapon().crit_chance = 0.0 # a crit would one-shot the tame target
				_howler = ProtoHowler.create(main)
				main.add_child(_howler)
				_howler.body.max_hp = 200.0 # setup staging: the SUBJECT is taming, not the duel
				_howler.body.hp = 200.0
				_howler.global_position = main.player.global_position + EAST * 10.0 + Vector3(0, 0.4, 0)
				_howler.force_charge()
			elif _step == 1:
				if is_instance_valid(_howler) and _howler.is_stunned():
					_step = 2
					main.current_weapon().crit_chance = 0.15
					_place(_howler.global_position + Vector3(1.2, 0, 0)) # stand at its side NOW
					phase_t = 0.0
				elif is_instance_valid(_howler) and phase_t < 9.0:
					main.aim_override = _howler.global_position + Vector3(0, 0.6, 0) - main.player.global_position
					if _howler.state != ProtoHowler.HowlState.CHARGE:
						_howler.force_charge() # keep it coming — we shoot chargers, not orbiters
					if _howler.global_position.distance_to(main.player.global_position) < 9.0 and fmod(phase_t, 0.45) < delta:
						_click()
				else:
					_check("tame setup: howler staggered", false)
					_next()
			elif _step == 2 and phase_t > 0.1:
				_step = 3
				_tap_interact() # meat 1/3 (feeding refreshes the stagger)
			elif _step == 3 and phase_t > 0.9:
				_step = 4
				_tap_interact() # 2/3
			elif _step == 4 and phase_t > 1.7:
				_step = 5
				_tap_interact() # 3/3 → tamed
			elif _step == 5 and phase_t > 2.4:
				var fang: ProtoDog = null
				for d in main.dogs:
					if is_instance_valid(d) and d.breed == "Mutant Hound":
						fang = d
				_check("meat + a downed howler = FANG the Mutant Hound joins the pack", fang != null)
				_check("...and the wild thing is GONE (tamed, not killed)", not is_instance_valid(_howler) or _howler == null)
				_fangs = main.dogs.size()
				_next()
		2: # HIRE: 40 scrip buys Sam — a gun that walks with you
			if _step == 0:
				_step = 1
				main.daynight.hour = 12.0 # back to daylight — the tame is done
				main.backpack.add("scrip", 50)
				_jack0 = main.backpack.count("scrip")
				_place(Vector3(97.0, 0.35, -311.0)) # at the Drifter
			elif _step == 1 and phase_t > 0.5:
				_step = 2
				_tap_interact()
			elif _step == 2 and phase_t > 1.0:
				_check("40 scrip HIRES Sam (companion joined)", main.companions.size() == 1)
				_check("...and the scrip changed hands (%d -> %d)" % [_jack0, main.backpack.count("scrip")],
					main.backpack.count("scrip") == _jack0 - 40)
				_next()
		3: # FOLLOW: he walks where you walk (one law, animal or human)
			if _step == 0:
				_step = 1
				Input.action_press("move_up")
			elif phase_t > 1.6:
				Input.action_release("move_up")
				var sam: ProtoCompanion = main.companions[0]
				_check("Sam FOLLOWS (%.1fm behind)" % sam.global_position.distance_to(main.player.global_position),
					sam.global_position.distance_to(main.player.global_position) < 8.0)
				_next()
		4: # FIGHT + SCOUT: his gun answers, and what HE sees pings YOUR perception
			if _step == 0:
				_step = 1
				# OPEN GROUND: the boot area is TEST GROUNDS clutter now — pool
				# cars and pens eat Sam's line of fire. Stage the duel on the
				# clear highway north of it (staging positions, the documented
				# exception).
				main.player.global_position = Vector3(6, 0.35, 430)
				main.player.velocity = Vector3.ZERO
				var sam4: ProtoCompanion = main.companions[0]
				sam4.global_position = main.player.global_position + Vector3(1.5, 0.1, -2.0)
				main.player.snap_orientation(NORTH)
				main.aim_override = Vector3.ZERO
				_lurk = ProtoLurker.create()
				_lurk.stalk_range = 0.0
				main.add_child(_lurk)
				# BEHIND you (south), inside Sam's fight range — you can't see it, he can.
				_lurk.global_position = main.player.global_position + Vector3(0, 0.4, 14.0)
			elif is_instance_valid(_lurk) and _lurk.body.hp < 40.0:
				_check("Sam FIGHTS: his gun wounded it (hp %.0f) — you never fired" % _lurk.body.hp, true)
				_check("SCOUT: his contact pinged YOUR perception (reveal)", main.vision_cone.reveal_active())
				_next()
			elif not is_instance_valid(_lurk):
				_check("Sam FIGHTS: he dropped it himself — you never fired", true)
				_check("SCOUT: his contact pinged YOUR perception (reveal)", main.vision_cone.reveal_active())
				_next()
			elif phase_t > 8.0:
				_check("Sam FIGHTS (lurker untouched after 8s)", false)
				_next()
		5: # THE SECOND WINDOW: DOGCAM is retired — V on foot (no car, no drone,
			# a tamed dog IS present) must self-skip every mode and land on OFF.
			# This is the direct proof the eye is gone, not just hidden behind Fang.
			if _step == 0:
				_step = 1
				_tap_key(KEY_V)
			elif _step == 1 and phase_t > 0.4:
				_check("DOGCAM is GONE: V on foot (dog present, no car/drone) self-skips to OFF",
					main.sview.mode == ProtoSecondaryView.SVMode.OFF)
				_next()
		6: # REARVIEW while driving (the pack + Sam board)
			if _step == 0:
				_step = 1
				# Stage the whole crew at the car (the walk from Meridian is not the test).
				_place(main.cars[0].global_position - main.cars[0].global_basis.x * 2.0)
				var sam: ProtoCompanion = main.companions[0]
				sam.global_position = main.cars[0].global_position + main.cars[0].global_basis.x * 2.5 + Vector3(0, 0.3, 0)
				sam.velocity = Vector3.ZERO
				for d in main.dogs:
					if is_instance_valid(d):
						d.global_position = main.cars[0].global_position + Vector3(0, 0.3, 3.0)
						d.velocity = Vector3.ZERO
			elif _step == 1 and phase_t > 0.5:
				_step = 2
				_tap_interact() # enter — Sam + Fang climb in
			elif _step == 2 and phase_t > 1.1:
				_step = 3
				_check("Sam climbs in with you (one boarding law)", main.companions[0].riding_in == main.cars[0])
				_tap_key(KEY_V)
			elif _step == 3 and phase_t > 1.6:
				_check("V in the car = REARVIEW", main.sview.mode == ProtoSecondaryView.SVMode.REARVIEW)
				var behind: float = (main.sview.cam_global() - main.cars[0].global_position).dot(main.cars[0].global_basis.z)
				_check("...looking back over the tail (%.1fm behind)" % behind, behind > 2.0)
				_next()
		7:
			print("S7 RESULTS: %d passed, %d failed" % [passed, failed])
			print("S7: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 55.0:
		print("S7: TIMEOUT in phase %d" % phase)
		print("S7 RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
