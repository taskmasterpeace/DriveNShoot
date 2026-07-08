## COMBAT FEEL proof (the juice layer): every swing and shot is ANSWERED —
## visible swing arc + lunge + blood + thunk for melee, muzzle flash + casing +
## recoil + hit-pulse for guns, wall dust on world hits, shotgun SHOVE, and the
## skull on a kill. FX self-free fast, so the sim ACCUMULATES group counts every
## frame. Inputs only; aim via main.aim_override (headless mouse exception).
## Run: godot --headless --path game res://proto3d/tests/combat_feel_sim.tscn
extends Node

const EAST := Vector3(1, 0, 0)
const NORTH := Vector3(0, 0, -1)
const FX_KINDS: Array = ["fx_swing", "fx_flash", "fx_casing", "fx_blood", "fx_impact", "fx_skull"]

var main: Node3D
var t: float = 0.0
var phase: int = 0
var phase_t: float = 0.0
var passed: int = 0
var failed: int = 0
var _did: bool = false

var _seen: Dictionary = {} ## fx group -> max count seen THIS phase
var _sound0: int = 0
var _recoil_seen: bool = false
var _pulse_seen: bool = false
var _lurk: ProtoLurker
var _px: float = 0.0
var _lx: float = 0.0
var _lx_max: float = -99999.0 ## shove tracking: max x seen while the target lived
var _skull_ever: bool = false ## kill payoff seen at ANY point (never reset)
var _melee_struck: bool = false ## ANIMATION_FIX_PACK §3.4: the pose-to-pose strike played during the melee phase


func _ready() -> void:
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	print("FEEL: scene up")


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("FEEL: PASS - %s" % name)
	else:
		failed += 1
		print("FEEL: FAIL - %s" % name)


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


func _place(p: Vector3) -> void:
	main.player.global_position = p
	main.player.velocity = Vector3.ZERO


func _spawn_lurker(pos: Vector3, hp: float = 40.0) -> ProtoLurker:
	var l := ProtoLurker.create()
	l.stalk_range = 0.0
	l.body.max_hp = hp # damage() clamps into [0, max_hp] — raise the CEILING too
	l.body.hp = hp
	main.add_child(l)
	l.global_position = pos
	return l


func _next() -> void:
	phase += 1
	phase_t = 0.0
	_did = false
	for k in FX_KINDS:
		_seen[k] = 0
	_sound0 = ProtoAudio.play_count
	_recoil_seen = false
	_pulse_seen = false


func _physics_process(delta: float) -> void:
	t += delta
	phase_t += delta
	# Accumulate: juice is fast — count it the frame it exists.
	for k in FX_KINDS:
		_seen[k] = maxi(_seen.get(k, 0), get_tree().get_nodes_in_group(k).size())
	# ANIMATION_FIX_PACK §3.4: the melee read is the pose-to-pose STRIKE now (no white
	# plank) — catch it while it plays (the strike finishes before the phase check).
	if phase == 1 and main.player and main.player.has_method("is_striking") and main.player.is_striking():
		_melee_struck = true
	if get_tree().get_nodes_in_group("fx_skull").size() > 0:
		_skull_ever = true
	if main.player and main.player.recoil_t > 0.0:
		_recoil_seen = true
	if main.hud and main.hud.hit_pulse_t > 0.0:
		_pulse_seen = true
	if _lurk != null and is_instance_valid(_lurk):
		_lx_max = maxf(_lx_max, _lurk.global_position.x)

	match phase:
		0: # boot, on foot, open ground
			if phase_t > 0.6:
				_tap_interact()
				_place(Vector3(6, 0.3, 300))
				main.player.snap_orientation(NORTH)
				_next()
		1: # MELEE: swing arc + whoosh, lunge INTO it, blood + thunk + SHOVE on the hit
			if not _did:
				_did = true
				main.backpack.add("machete", 1)
				main.use_item("machete")
				_lurk = _spawn_lurker(main.player.global_position + EAST * 2.0 + Vector3(0, 0.4, 0), 300.0)
				main.aim_override = EAST
				_px = main.player.global_position.x
				_lx = _lurk.global_position.x
				_click()
			elif phase_t > 0.5:
				# ANIMATION_FIX_PACK §3.4 (D4): the white-plank arc is RETIRED — the swing
				# reads on the BODY (the pose-to-pose strike whips the arm + weapon mesh),
				# so NO fx_swing node spawns, and the strike played.
				_check("no white-plank arc — the swing reads on the body (fx_swing %d == 0)" % _seen["fx_swing"],
					_seen["fx_swing"] == 0)
				_check("the melee STRIKE played (pose-to-pose, not the floating line)", _melee_struck)
				_check("melee LUNGES you into it (%.2fm forward)" % (main.player.global_position.x - _px),
					main.player.global_position.x - _px > 0.15)
				_check("the hit bleeds (blood burst)", _seen["fx_blood"] >= 1)
				_check("whoosh + thunk played (%d sounds)" % (ProtoAudio.play_count - _sound0), ProtoAudio.play_count - _sound0 >= 2)
				_check("steel carries WEIGHT — the lurker got shoved (%.2fm)" % (_lurk.global_position.x - _lx),
					is_instance_valid(_lurk) and _lurk.global_position.x - _lx > 0.25)
				_next()
		2: # PISTOL: muzzle flash + casing + recoil kick + hit-pulse + hitmark tick
			if not _did:
				_did = true
				main.backpack.add("pistol", 1)
				main.backpack.add("9mm", 24)
				main.use_item("pistol")
				# A FRESH mark: the machete phase's lurker can die to a crit roll —
				# reusing it made this phase silently squeeze at nothing (the flake).
				if is_instance_valid(_lurk):
					_lurk.queue_free()
				_lurk = _spawn_lurker(main.player.global_position + EAST * 2.0 + Vector3(0, 0.4, 0), 300.0)
			elif not _pulse_seen and phase_t < 2.4 and is_instance_valid(_lurk):
				# keep squeezing (cooldown-gated) until one registers — spread is spread.
				# UNNORMALIZED aim = converge AT the target (the mouse-equivalent).
				# (window widened 1.4->2.4s: at 4 deg spread a ~4-shot window flaked
				# ~1-in-3 headless; ~7 shots makes a miss-streak astronomically rare)
				main.aim_override = _lurk.global_position - main.player.global_position
				_click()
			elif phase_t > 2.5:
				_check("MUZZLE FLASH answers the trigger", _seen["fx_flash"] >= 1)
				_check("brass ejects (casing)", _seen["fx_casing"] >= 1)
				_check("the gun KICKS in the hand (recoil)", _recoil_seen)
				_check("flesh hit bleeds + the reticle PULSES", _seen["fx_blood"] >= 1 and _pulse_seen)
				_check("shots + hitmark tick played (%d sounds)" % (ProtoAudio.play_count - _sound0), ProtoAudio.play_count - _sound0 >= 2)
				_next()
		3: # THE WORLD ANSWERS TOO: a round into a wall kicks dust where it landed
			if not _did:
				_did = true
				_place(Vector3(112.0, 0.35, -310.0)) # facing the safehouse's solid front wall
				main.player.snap_orientation(NORTH)
				main.aim_override = NORTH
				_click()
			elif phase_t > 0.5:
				_check("wall hit kicks DUST at the impact point", _seen["fx_impact"] >= 1)
				_next()
		4: # SHOTGUN: point-blank blast SHOVES the target backward
			if not _did:
				_did = true
				main.backpack.add("shotgun", 1)
				main.backpack.add("12ga", 12)
				main.use_item("shotgun")
				if is_instance_valid(_lurk):
					_lurk.queue_free()
				_lurk = _spawn_lurker(Vector3(112.0, 0.4, -310.0) + EAST * 2.5, 5000.0)
				main.aim_override = _lurk.global_position - main.player.global_position
				_lx = _lurk.global_position.x
				_lx_max = _lx
				_click()
			elif phase_t > 0.6:
				# Displacement sampled per-frame while it lived — freed refs never touched.
				_check("point-blank shotgun SHOVES it back (%.2fm)" % (_lx_max - _lx), _lx_max - _lx > 0.4)
				if is_instance_valid(_lurk):
					_lurk.queue_free()
				_next()
		5: # KILL PAYOFF: a fresh mark goes down — the skull pops, the remains drop
			if not _did:
				_did = true
				_lurk = _spawn_lurker(main.player.global_position + EAST * 4.0 + Vector3(0, 0.4, 0))
			elif is_instance_valid(_lurk) and not _lurk.dead:
				main.aim_override = _lurk.global_position - main.player.global_position
				if fmod(phase_t, 0.4) < delta:
					_click()
				if phase_t > 8.0:
					_check("kill pops the SKULL payoff", false)
					_next()
			else:
				_check("kill pops the SKULL payoff", _skull_ever)
				var corpse_found := false
				# CORPSES-not-crates (747db4e): remains are a ProtoCorpse BODY now, not a
				# wooden ProtoChest — this check went stale the night that arc shipped.
				for node in main.get_children():
					if node is ProtoCorpse and node.container.label == "Corpse":
						corpse_found = true
				_check("...and the remains drop where it fell", corpse_found)
				_next()
		6:
			print("FEEL RESULTS: %d passed, %d failed" % [passed, failed])
			print("FEEL: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
			get_tree().quit(0 if failed == 0 else 1)

	if t > 40.0:
		print("FEEL: TIMEOUT in phase %d" % phase)
		print("FEEL RESULTS: %d passed, %d failed" % [passed, failed])
		get_tree().quit(1)
