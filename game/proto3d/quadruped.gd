## THE FOUR-LEGGED PUPPET — the same idea as ProtoPuppet, on four legs. Box parts
## moved by sin() off STATE: diagonal-pair gait off speed, the head dips to sniff
## when slow, and — the good part — the TAIL IS A READOUT of morale/stress. A happy
## animal wags fast and wide; a scared one TUCKS it. The animation reports the state,
## so the dog's mood is legible at a glance. Dogs, howlers, and lurkers all wear it.
class_name ProtoQuadruped
extends Node3D

const DEFAULT: Dictionary = {
	"scale": 1.0,
	"color": Color(0.5, 0.42, 0.28),
	"tail": 0.3,          ## tail length (0 = no tail — a lurker)
	"snout": true,
	"ears": true,
}

var params: Dictionary = {}
var body: MeshInstance3D
var neck: Node3D
var head: MeshInstance3D
var tail_pivot: Node3D
var legs: Array[Node3D] = [] ## [FL, FR, BL, BR]

var _t: float = 0.0
var _phase: float = 0.0
var _tuck: float = 0.0
var _flinch: float = 0.0 ## hit reaction — the whole animal jolts
## AIRBORNE (MOVESET.txt JUMP/POUNCE): 1 = mid-leap — front legs REACH, hinds
## trail, head up. The dog sets air_target off is_on_floor(); the blend eases.
var air_target: float = 0.0
var _air: float = 0.0
## DIG: 1 = paws to work — head to the ground, a front leg scraping fast.
var dig_target: float = 0.0
var _dig: float = 0.0


static func create(params_in: Dictionary = {}) -> ProtoQuadruped:
	var q := ProtoQuadruped.new()
	var p := DEFAULT.duplicate(true)
	for k in params_in:
		p[k] = params_in[k]
	q.params = p
	var s: float = float(p["scale"])
	var col: Color = p["color"]

	q.body = _box(Vector3(0.34, 0.32, 0.8) * s, Vector3(0, 0.42 * s, 0), col)
	q.add_child(q.body)

	# Neck + head (the head DIPS to sniff) at the FRONT (-Z).
	q.neck = Node3D.new()
	q.neck.position = Vector3(0, 0.55 * s, -0.4 * s)
	q.add_child(q.neck)
	q.head = _box(Vector3(0.26, 0.24, 0.26) * s, Vector3(0, 0.06 * s, -0.05 * s), col * 1.1)
	q.neck.add_child(q.head)
	if p["snout"]:
		var snout := _box(Vector3(0.12, 0.1, 0.16) * s, Vector3(0, 0.0, -0.18 * s), col * 0.7)
		q.neck.add_child(snout)
	if p["ears"]:
		for ex in [-0.08, 0.08]:
			var ear := _box(Vector3(0.06, 0.12, 0.04) * s, Vector3(ex * s, 0.18 * s, 0.0), col * 0.8)
			q.neck.add_child(ear)

	# Tail on a pivot at the REAR (+Z): rotation.y = wag, rotation.x = tuck.
	if float(p["tail"]) > 0.01:
		q.tail_pivot = Node3D.new()
		q.tail_pivot.position = Vector3(0, 0.5 * s, 0.4 * s)
		q.add_child(q.tail_pivot)
		var tail := _box(Vector3(0.06, 0.06, float(p["tail"])) * s, Vector3(0, 0, float(p["tail"]) * 0.5 * s), col * 0.9)
		q.tail_pivot.add_child(tail)

	# Four legs on hip pivots at the corners (boxes hang DOWN).
	for corner in [Vector3(-0.12, 0, -0.28), Vector3(0.12, 0, -0.28), Vector3(-0.12, 0, 0.28), Vector3(0.12, 0, 0.28)]:
		var hip := Node3D.new()
		hip.position = Vector3(corner.x * s, 0.28 * s, corner.z * s)
		var leg := _box(Vector3(0.08, 0.28, 0.08) * s, Vector3(0, -0.14 * s, 0), col * 0.75)
		hip.add_child(leg)
		q.add_child(hip)
		q.legs.append(hip)
	return q


static func _box(size: Vector3, pos: Vector3, color: Color) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	m.mesh = bm
	m.material_override = ProtoWorldBuilder.material(color, 0.9)
	m.position = pos
	return m


## Drive off STATE. speed = m/s, morale 0..1 (1 = happy, 0 = terrified). Legs run in
## diagonal pairs, the head dips to sniff when slow, the tail wags fast when happy and
## TUCKS when scared — the mood made visible.
func animate(delta: float, speed: float, morale: float) -> void:
	_t += delta
	var s: float = float(params["scale"])
	var moving := speed > 0.4
	if moving:
		_phase += (3.0 + speed * 1.4) * delta
	var amp := clampf(speed / 8.0, 0.0, 1.0) * 0.5

	# Diagonal-pair gait (FL+BR together, FR+BL together) — a real trot read.
	var a := sin(_phase) * amp
	var b := sin(_phase + PI) * amp
	legs[0].rotation.x = a  # FL
	legs[3].rotation.x = a  # BR
	legs[1].rotation.x = b  # FR
	legs[2].rotation.x = b  # BL

	# AIRBORNE: the leap pose overrides the trot — front legs REACH, hinds trail.
	_air = move_toward(_air, clampf(air_target, 0.0, 1.0), delta * 7.0)
	if _air > 0.01:
		legs[0].rotation.x = lerpf(legs[0].rotation.x, -0.9, _air)
		legs[1].rotation.x = lerpf(legs[1].rotation.x, -0.9, _air)
		legs[2].rotation.x = lerpf(legs[2].rotation.x, 0.8, _air)
		legs[3].rotation.x = lerpf(legs[3].rotation.x, 0.8, _air)

	# DIG: one front paw SCRAPES fast while the body plants (dirt flies).
	_dig = move_toward(_dig, clampf(dig_target, 0.0, 1.0), delta * 7.0)
	if _dig > 0.01:
		legs[0].rotation.x = lerpf(legs[0].rotation.x, -0.5 + sin(_t * 18.0) * 0.55, _dig)

	# Head DIPS to sniff when slow/idle; rides level at speed. A dig buries the
	# nose in the ground; a leap carries it high.
	var sniff := (-0.25 + sin(_t * 3.0) * 0.12) if speed < 1.5 else 0.0
	neck.rotation.x = lerp(neck.rotation.x, sniff - 0.4 * _dig + 0.35 * _air, clampf(6.0 * delta, 0.0, 1.0))

	# Body lilt with the gait — plus a HIT JOLT (Rung 6): a struck animal flinches up
	# and hunches, so every hit reads on the body, not just a health bar.
	_flinch = maxf(0.0, _flinch - delta * 6.0)
	body.position.y = 0.42 * s + absf(sin(_phase)) * amp * 0.06 + _flinch * 0.12 * s
	body.rotation.x = _flinch * 0.4

	# THE TAIL = THE READOUT. Happy → fast wide wag. Scared → tuck it under.
	if tail_pivot:
		_tuck = lerp(_tuck, clampf((0.4 - morale) / 0.4, 0.0, 1.0), clampf(6.0 * delta, 0.0, 1.0))
		var wag_speed := lerpf(4.0, 16.0, morale)
		var wag_amp := lerpf(0.12, 0.7, morale) * (1.0 - _tuck)
		tail_pivot.rotation.x = -_tuck * 1.2               # tucked down + under when afraid
		tail_pivot.rotation.y = sin(_t * wag_speed) * wag_amp


## A hit reaction — the animal jolts. Decays fast.
func flinch() -> void:
	_flinch = 1.0


# --- The FLOP (mirrors the biped's _pose_dead): a body that has fallen ---------
var _flopped: bool = false
var _pre_flop_y: float = 0.0


func pose_dead() -> void:
	if _flopped:
		return
	_flopped = true
	_pre_flop_y = body.position.y
	body.rotation.z = 1.45
	body.position.y = _pre_flop_y * 0.55
	if neck:
		neck.rotation.x = 0.6
	for l in legs:
		l.rotation.x = 0.35
	if tail_pivot:
		tail_pivot.rotation.y = 0.0 # the tail goes still — that's the read


func unpose_dead() -> void:
	if not _flopped:
		return
	_flopped = false
	body.rotation.z = 0.0
	body.position.y = _pre_flop_y
	if neck:
		neck.rotation.x = 0.0
	for l in legs:
		l.rotation.x = 0.0
