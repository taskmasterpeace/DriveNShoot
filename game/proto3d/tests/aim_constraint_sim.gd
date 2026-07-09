## Regression for anatomical aim limits: the mouse/controller can ask for any
## direction, but the pistol arm cannot yaw behind the back. The torso must turn
## to catch up while the arm stays inside max_look_yaw_deg.
## Run: godot --headless --path game res://proto3d/tests/aim_constraint_sim.tscn
extends Node

const NORTH := Vector3(0, 0, -1)
const SOUTH := Vector3(0, 0, 1)
const EAST := Vector3(1, 0, 0)

var passed := 0
var failed := 0


func _check(name: String, ok: bool) -> void:
	if ok:
		passed += 1
		print("AIM_CONSTRAINT: PASS - %s" % name)
	else:
		failed += 1
		print("AIM_CONSTRAINT: FAIL - %s" % name)


func _limit(p: ProtoPlayer3D) -> float:
	return deg_to_rad(p.max_look_yaw_deg)


func _arm_yaw(p: ProtoPlayer3D) -> float:
	return wrapf(p.puppet.aim_arm.rotation.y, -PI, PI)


func _ready() -> void:
	print("AIM_CONSTRAINT: start")
	var p := ProtoPlayer3D.create({})
	add_child(p)
	p.snap_orientation(NORTH)
	p.set_armed(true)
	p.max_look_yaw_deg = 60.0

	p.aim_now(SOUTH)
	var instant_arm := absf(_arm_yaw(p))
	_check("aim_now clamps the pistol shoulder instead of spinning behind (%.1f deg <= %.1f)" %
		[rad_to_deg(instant_arm), p.max_look_yaw_deg], instant_arm <= _limit(p) + deg_to_rad(1.0))
	_check("aim_now reports the constrained gun direction, not the unreachable mouse direction",
		p.aim_facing().dot(SOUTH) < 0.65)

	p.snap_orientation(NORTH)
	p.set_aim_intent(SOUTH)
	for _i in 6:
		p._update_orientation(Vector3.ZERO, 1.0 / 60.0)
	var frame_arm := absf(_arm_yaw(p))
	_check("frame update also keeps the arm inside the same shoulder arc (%.1f deg)" %
		rad_to_deg(frame_arm), frame_arm <= _limit(p) + deg_to_rad(1.0))
	_check("the torso starts turning toward an aim behind you instead of leaving the shoulder twisted",
		p.facing().dot(NORTH) < 0.98)

	p.snap_orientation(NORTH)
	p.set_aim_intent(EAST)
	for _i in 6:
		p._update_orientation(Vector3.ZERO, 1.0 / 60.0)
	_check("side aim is still allowed near the edge of the human arc",
		absf(_arm_yaw(p)) <= _limit(p) + deg_to_rad(1.0) and p.aim_facing().dot(EAST) > 0.8)

	print("AIM_CONSTRAINT RESULTS: %d passed, %d failed" % [passed, failed])
	print("AIM_CONSTRAINT: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
