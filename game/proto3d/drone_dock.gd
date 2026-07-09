## THE SAFEHOUSE DRONE DOCK (LIVING_WORLD_DSOA Phase 3): the helipad by the
## door. E launches a ROUTE SCOUT along your map course (or straight up the
## nearest road if no course is set) — the bird flies out, MARKS hazards on the
## map, and comes home to charge. Your body never leaves the couch: this is how
## you check the streets after the world changed without you.
class_name ProtoDroneDock
extends Node3D

## THE CHARGE LAW (owner, 2026-07-07): a drone must CHARGE a QUARTER OF THE DAY between
## flights. The day is 24 real minutes (ProtoDayNight.DAY_MINUTES), so a quarter = 360
## game-scaled seconds — and the charge runs on the GAME clock, so T-waiting the night
## away (or the dev fast-clock) charges the bird too. Patience or time, pick one.
const CHARGE_SECONDS := 360.0

var charging: bool = false ## docked and charging — relaunch when full
var flights: int = 0
var _main: Node = null
var _charge_t: float = 0.0


static func create(main: Node) -> ProtoDroneDock:
	var d := ProtoDroneDock.new()
	d._main = main
	d.add_to_group("interactable")
	d.add_to_group("furniture") # hold-E to move it, wheel to rotate, spot persists (furniture move system)
	d.set_meta("furniture_id", "drone_dock")
	var pad := MeshInstance3D.new()
	var pm := BoxMesh.new()
	pm.size = Vector3(1.6, 0.12, 1.6)
	pad.mesh = pm
	pad.material_override = ProtoWorldBuilder.material(Color(0.22, 0.24, 0.26), 0.8)
	pad.position.y = 0.06
	d.add_child(pad)
	var mark := MeshInstance3D.new()
	var mm := BoxMesh.new()
	mm.size = Vector3(0.9, 0.02, 0.14)
	mark.mesh = mm
	mark.material_override = ProtoWorldBuilder.material(Color(0.96, 0.72, 0.2), 0.5, true)
	mark.position.y = 0.13
	d.add_child(mark)
	return d


func interact_position() -> Vector3:
	return global_position


func interact_prompt(main: Node) -> String:
	if "drone" in main and main.drone != null and is_instance_valid(main.drone):
		return "🛸 The bird is OUT (battery %d%%)" % int((main.drone as ProtoDrone).battery_pct())
	if charging:
		return "🛸 Recharging… %d%% (a quarter of the day, or T-wait it away)" % int(charge_pct())
	return "E — 🛸 Launch the SCOUT (flies your course, marks hazards, comes home)"


func charge_pct() -> float:
	return clampf((CHARGE_SECONDS - _charge_t) / CHARGE_SECONDS * 100.0, 0.0, 100.0)


func interact(main: Node) -> void:
	if _main == null:
		_main = main # a vehicle-mounted bay is built before main exists — adopt on first use
	if charging or ("drone" in main and main.drone != null and is_instance_valid(main.drone)):
		return
	# The route: your COURSE pin if you set one (the 🧭 waypoint), else straight
	# up the road north — the bird always has somewhere to look.
	var target: Vector3 = global_position + Vector3(0, 0, -120.0)
	if "waypoints" in main:
		for wp in main.waypoints:
			if String(wp[0]).begins_with(String(main.COURSE_PREFIX)) and wp[1] is Vector3:
				target = wp[1]
				break
	var bird := ProtoDrone.launch_route(main, self, target)
	main.add_child(bird)
	bird.global_position = global_position + Vector3(0, 1.0, 0)
	main.drone = bird
	flights += 1
	# THE REMOTE EYE (drone fix, 2026-07-09): the old launch was invisible — the bird
	# tore off at 16 m/s and the player read it as "disappeared after launch". Now the
	# split view FOLLOWS the scout (that's the whole dynamic-split tech: your couch on
	# one side, the bird's eye on the other), and the dock hands you a REMOTE so you
	# can take the stick mid-route. The eye folds when the bird docks or dies.
	if "split_view" in main and main.split_view != null and not main.split_view.active \
			and "player" in main and main.player != null:
		if "character" in main and main.character != null:
			main.split_view.max_separation = main.character.pilot_signal_m()
		main.split_view.activate(main.player, bird)
	if "backpack" in main and main.backpack != null and main.backpack.count("drone_remote") < 1:
		main.backpack.add("drone_remote", 1)
	if main.has_method("notify"):
		# The boot line is the LORE keystone: every drone still runs the old
		# national AI's firmware — the thing that carved the states up.
		main.notify("🛸 [BOOT: FEDNET-OPTIMIZER v9 — REQUESTS SUSPENDED] Scout away — watch the split, or USE the REMOTE in your pack to take the stick.")


## The bird is home: charge a beat, ready again. Reusable — a dock, not a vending machine.
func dock_drone(bird: ProtoDrone) -> void:
	charging = true
	_charge_t = CHARGE_SECONDS # THE CHARGE LAW: a quarter of the day before the next flight
	bird._unpair(false) # fold the eye; the REMOTE stays — the bird's home, not lost
	if _main != null:
		if _main.has_method("notify"):
			_main.notify("🛸 The bird is HOME — %d hazard%s marked this flight." % [bird.marks, "" if bird.marks == 1 else "s"])
		if "drone" in _main:
			_main.drone = null
	bird.queue_free()


func _physics_process(delta: float) -> void:
	if charging:
		# The charge rides the GAME clock: waiting (T) or the dev fast-clock charge it too.
		var speed := 1.0
		if _main != null and "daynight" in _main and _main.daynight != null:
			var dn: ProtoDayNight = _main.daynight
			speed = ProtoDayNight.WAIT_MULT if dn.waiting else dn.dev_mult
		_charge_t -= delta * speed
		if _charge_t <= 0.0:
			charging = false
