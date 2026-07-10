## THE PIPE LAW proof — damage smoke pours OUT the tailpipe (side-rear tip for
## most rigs, straight up for the semi's stack), a visible tip mesh is welded on,
## and a husk smolders wide-and-upward from the hull's center instead.
## Run: godot --headless --path game res://proto3d/tests/exhaust_sim.tscn
extends Node

var passed: int = 0
var failed: int = 0


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("EXHAUST: PASS - %s" % name)
	else:
		failed += 1
		print("EXHAUST: FAIL - %s" % name)


func _ready() -> void:
	var dog := Timer.new()
	dog.wait_time = 20.0
	dog.one_shot = true
	dog.timeout.connect(func() -> void:
		print("EXHAUST: WATCHDOG — force quit")
		_finish())
	add_child(dog)
	dog.start()
	call_deferred("_run")


func _run() -> void:
	DrivnData.ensure()
	# --- A smoking scavenger: the plume leaves the SIDE-REAR pipe, rearward ---
	var car := ProtoCar3D.create("scavenger", Color(0.5, 0.3, 0.2))
	car.position = Vector3(6, 0.6, 388) # staged clear of world clutter (house spot)
	car.freeze = true                   # no world floor here — staging, not motion
	add_child(car)
	await get_tree().physics_frame
	car.components["chassis"].hp = car.components["chassis"].max_hp * 0.5
	for i in range(6):
		await get_tree().physics_frame
	var sm: CPUParticles3D = car._smoke
	_check("smoke emitter exists once chassis dips", sm != null)
	if sm != null:
		_check("smoke emits at 50% chassis", sm.emitting)
		_check("smoke sits OUT at the side (x=%.2f < -0.5)" % sm.position.x, sm.position.x < -0.5)
		_check("smoke sits PAST the bumper (z=%.2f > 2.2)" % sm.position.z, sm.position.z > 2.2)
		_check("smoke leaves REARWARD (dir.z=%.2f > 0.7)" % sm.direction.z, sm.direction.z > 0.7)
		_check("smoke is no up-fountain (dir.y=%.2f < 0.5)" % sm.direction.y, sm.direction.y < 0.5)
		_check("puffs GROW over life (scale curve set)", sm.scale_amount_curve != null)
		var smat := (sm.mesh as QuadMesh).material as StandardMaterial3D if sm.mesh is QuadMesh else null
		_check("puffs are BILLBOARDED SOFT DISCS (quad + billboard + sprite)",
			smat != null and smat.billboard_mode == BaseMaterial3D.BILLBOARD_ENABLED
			and smat.albedo_texture != null)
		_check("NO instance-color path (the black-ball artifact law)",
			smat != null and not smat.vertex_color_use_as_albedo and sm.color_ramp == null)
		_check("a whisper of wind bends the column (gravity.x=%.2f > 0)" % sm.gravity.x, sm.gravity.x > 0.0)
		_check("light damage smokes LIGHT gray on the material (r=%.2f > 0.35)" % (smat.albedo_color.r if smat != null else -1.0),
			smat != null and smat.albedo_color.r > 0.35)
	var tip := car.get_node_or_null("exhaust_tip")
	_check("visible exhaust tip welded on", tip is MeshInstance3D)
	if tip is MeshInstance3D:
		var tz: float = (tip as MeshInstance3D).position.z
		_check("tip pokes past the tail (z=%.2f > 2.0)" % tz, tz > 2.0)

	# --- The semi's stack: smoke goes UP from the stack top ---
	var semi := ProtoCar3D.create("semi", Color(0.3, 0.3, 0.35))
	semi.position = Vector3(20, 1.2, 388)
	semi.freeze = true
	add_child(semi)
	await get_tree().physics_frame
	semi.components["chassis"].hp = semi.components["chassis"].max_hp * 0.5
	for i in range(6):
		await get_tree().physics_frame
	var ssm: CPUParticles3D = semi._smoke
	_check("semi smoke emitter exists", ssm != null)
	if ssm != null:
		_check("stack smoke goes UP (dir.y=%.2f > 0.9)" % ssm.direction.y, ssm.direction.y > 0.9)
		_check("stack tip sits high (y=%.2f > 2.0)" % ssm.position.y, ssm.position.y > 2.0)
	_check("semi stack column welded on", semi.get_node_or_null("exhaust_tip") is MeshInstance3D)

	# --- NIGHT GLOW LAW: parked rigs read at distance in the dark (tails brighten) ---
	ProtoCar3D.night_glow = 2.0
	for i in range(3):
		await get_tree().physics_frame
	var tail0: StandardMaterial3D = semi._tail_mats[0]
	_check("night tails idle brighter (%.1f >= 2.4)" % tail0.emission_energy_multiplier,
		tail0.emission_energy_multiplier >= 2.4)
	ProtoCar3D.night_glow = 1.0
	for i in range(3):
		await get_tree().physics_frame
	_check("day restores the idle glow (%.1f < 2.0)" % tail0.emission_energy_multiplier,
		tail0.emission_energy_multiplier < 2.0)

	# --- Husk: wreck-mode smolder from the hull center, wide and upward ---
	car._become_husk(false)
	for i in range(4):
		await get_tree().physics_frame
	if sm != null:
		_check("husk smolder recenters (x=%.2f -> 0)" % sm.position.x, absf(sm.position.x) < 0.01)
		_check("husk smolder goes UP (dir.y=%.2f > 0.9)" % sm.direction.y, sm.direction.y > 0.9)
		_check("husk smolder spreads wide (%.0f deg >= 20)" % sm.spread, sm.spread >= 20.0)
		_check("husk smolders (emitting)", sm.emitting)
		var hmat := (sm.mesh as QuadMesh).material as StandardMaterial3D if sm.mesh is QuadMesh else null
		_check("husk smoke is burnt BLACK on the material (r=%.2f < 0.2)" % (hmat.albedo_color.r if hmat != null else -1.0),
			hmat != null and hmat.albedo_color.r < 0.2)

	_finish()


func _finish() -> void:
	print("EXHAUST RESULTS: %d passed, %d failed" % [passed, failed])
	if failed == 0:
		print("ALL CHECKS PASSED")
	get_tree().quit(0 if failed == 0 else 1)
