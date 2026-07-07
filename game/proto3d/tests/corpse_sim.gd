## Proof for THE CORPSE (corpse.gd — goal "no more crates, loot the body"). A killed
## character leaves a ragdolling, lootable, decaying BODY (not a chest): it flops on a
## launch, settles lying down, loots like any container, and rots away — a picked-clean one
## sooner. Drives the real flop/decay one manual delta at a time. Run:
## godot --headless --path game res://proto3d/tests/corpse_sim.tscn
extends Node

var passed := 0
var failed := 0


class StubMain:
	extends Node
	var opened: ProtoContainer = null
	func open_container(c: ProtoContainer) -> void: opened = c
	func grant_xp(_id: String, _amt: float) -> void: pass
	func circuit_beat(_b: String) -> void: pass


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("CORPSE: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _spawn(loot: Dictionary, launch: Vector3, at: Vector3 = Vector3(0, 1.5, 0)) -> ProtoCorpse:
	var c := ProtoCorpse.create("Raider's body", loot, Color(0.5, 0.4, 0.3), launch)
	add_child(c)
	c.set_physics_process(false)   # we drive it deterministically
	c.global_position = at
	return c


func _step(c: ProtoCorpse, frames: int) -> void:
	for _i in frames:
		c._physics_process(1.0 / 60.0)


func _ready() -> void:
	var main := StubMain.new()
	add_child(main)

	# A body, not a crate: groups + the loot it carries.
	var c := _spawn({"scrip": 5, "meat": 1}, Vector3(6, 3, 0))
	_check("corpse is interactable + a 'corpse'", c.is_in_group("interactable") and c.is_in_group("corpse"))
	_check("carries the dead man's loot", not c.container.slots.is_empty() and c.container.label == "Raider's body")
	_check("can't loot it mid-flop (no prompt airborne)", c.interact_prompt(main) == "")

	# THE FLOP: launched forward, arcs down, lands lying flat.
	var x0 := c.global_position.x
	_step(c, 240)
	_check("body settles on the ground (grounded)", c._grounded and absf(c.global_position.y - ProtoCorpse.REST_Y) < 0.05)
	_check("the launch FLUNG it forward (x grew)", c.global_position.x > x0 + 1.0)
	_check("it's lying flat (tipped ~90°)", absf(c.rotation.x - PI * 0.5) < 0.01)

	# Now lootable — same verb as any container.
	_check("grounded body shows the loot prompt", c.interact_prompt(main).begins_with("E — loot"))
	c.interact(main)
	_check("looting opens its container", main.opened == c.container)

	# DECAY: a body with loot lingers; force it past its life and it fades out.
	c._age = ProtoCorpse.DECAY_SECONDS
	_step(c, 30)
	_check("an old body starts fading (alpha < 1)", c._fading and c._mats[0].albedo_color.a < 1.0)

	# EMPTY decays FASTER: at the same age, a picked-clean body is fading while a full one isn't.
	var full := _spawn({"scrip": 9}, Vector3.ZERO)
	var empty := _spawn({}, Vector3.ZERO)
	_step(full, 240); _step(empty, 240)   # land both
	full._age = 40.0; empty._age = 40.0    # 40s: past EMPTY_DECAY (32) but under DECAY (90)
	full._physics_process(1.0 / 60.0); empty._physics_process(1.0 / 60.0)
	_check("picked-clean body is already fading at 40s", empty._fading)
	_check("a still-full body is NOT fading at 40s", not full._fading)

	# It frees itself once fully faded (deferred).
	var doomed := _spawn({}, Vector3.ZERO)
	_step(doomed, 240)
	doomed._age = ProtoCorpse.EMPTY_DECAY_SECONDS + ProtoCorpse.FADE_SECONDS + 1.0
	doomed._physics_process(1.0 / 60.0)
	await get_tree().process_frame
	_check("a fully-decayed body is gone", not is_instance_valid(doomed))

	print("CORPSE: DONE — %d passed, %d failed" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)
