## THE PROCEDURAL PUPPET (the engine pillar made flesh): ONE rig of box body parts
## moved by sin() math off STATE — speed, aim, hurt, dead. It is NOT an animation;
## it's a machine that reads a data sheet. Feed it an appearance ROW and 50 different
## survivors fall out of the same code (data-driven, adding content ≠ code). The gun
## rides on a HAND whose pose is a property of the WEAPON, not the person. NPCs are
## the same puppet reading different state; the dog is the four-legged sibling.
##
## Hierarchy (all boxes): the root yaws to the body (the caller sets rotation.y/x).
##   torso · neck→head(+eyes,+optional patch,+optional hat) · optional backpack
##   legs_pivot → hip_l/hip_r → leg boxes (stride)
##   free_arm shoulder → arm box (swings opposite its leg)
##   aim_arm (the old "_upper": caller yaws it to the gaze) → gun_arm + hand → gun
class_name ProtoPuppet
extends Node3D

## An appearance ROW — the whole point. Every field has a default so a bare {} works.
const DEFAULT: Dictionary = {
	"height": 1.0,                          ## overall scale
	"torso": Vector3(0.5, 0.72, 0.3),       ## torso box size
	"skin": Color(0.78, 0.6, 0.45),
	"cloth": Color(0.46, 0.4, 0.32),        ## torso + arms
	"pants": Color(0.3, 0.3, 0.28),         ## legs
	"hat": Color(0, 0, 0, 0),                ## alpha 0 = NO hat (a real hat sets alpha 1)
	"backpack": false,
	"gait": 1.0,                             ## cadence multiplier (a fast/slow walker)
	"handed": "right",                       ## "right" | "left" — which hand holds the gun
	"blind_eye": "",                         ## "" | "l" | "r" — an eyepatch on that side
	"limp": "",                              ## "" | "l" | "r" — that leg drags
}

var appearance: Dictionary = {}
var handed_sign: float = 1.0 ## +1 gun on the right (local -X? see below), -1 on the left

# Parts (kept for the animator).
var torso: MeshInstance3D
var neck: Node3D
var head: MeshInstance3D
var legs_pivot: Node3D   ## the caller yaws this for feet-vs-body (old "_lower")
var hip_l: Node3D
var hip_r: Node3D
var free_arm: Node3D
var aim_arm: Node3D      ## the caller yaws this to the gaze (old "_upper")
var gun: MeshInstance3D
var hand: Node3D
var _hat: MeshInstance3D
var _pack: MeshInstance3D

var _t: float = 0.0
var _phase: float = 0.0
var _lean: float = 0.0
var _slump: float = 0.0
var _gun_rest: Vector3 = Vector3(0.0, 1.12, -0.36)
var _hand_offset: Vector3 = Vector3.ZERO ## per-weapon hand pose (set_hand_pose)
var _dead_blend: float = 0.0


static func create(appearance_in: Dictionary = {}) -> ProtoPuppet:
	var p := ProtoPuppet.new()
	var a := DEFAULT.duplicate(true)
	for k in appearance_in:
		a[k] = appearance_in[k]
	p.appearance = a
	p.scale = Vector3.ONE * float(a["height"])
	# In this rig the RIGHT hand sits at local +X. Left-handed mirrors to -X.
	var right := 1.0 if a["handed"] == "right" else -1.0
	p.handed_sign = right
	var skin: Color = a["skin"]
	var cloth: Color = a["cloth"]
	var pants: Color = a["pants"]
	var tsz: Vector3 = a["torso"]

	# --- Torso -------------------------------------------------------------
	p.torso = _box(tsz, Vector3(0, 1.05, 0), cloth)
	p.add_child(p.torso)

	# --- Neck + head (+ eyes, optional patch, optional hat) ----------------
	p.neck = Node3D.new()
	p.neck.position = Vector3(0, 1.44, 0)
	p.add_child(p.neck)
	p.head = _box(Vector3(0.34, 0.34, 0.32), Vector3(0, 0.19, 0), skin)
	p.neck.add_child(p.head)
	# Eyes read facing from above; a patched eye goes dark.
	for side in [-1.0, 1.0]:
		var blind: bool = (a["blind_eye"] == "l" and side < 0.0) or (a["blind_eye"] == "r" and side > 0.0)
		var eye := _box(Vector3(0.07, 0.07, 0.04),
			Vector3(side * 0.09, 0.21, -0.17), Color(0.05, 0.05, 0.05) if blind else Color(0.9, 0.9, 0.85))
		p.neck.add_child(eye)
	if float(a["hat"].a) > 0.01:
		p._hat = _box(Vector3(0.42, 0.16, 0.42), Vector3(0, 0.4, 0), a["hat"])
		p.neck.add_child(p._hat)

	# --- Backpack ----------------------------------------------------------
	if a["backpack"]:
		p._pack = _box(Vector3(0.34, 0.5, 0.22), Vector3(0, 1.05, 0.22), Color(0.28, 0.24, 0.18))
		p.add_child(p._pack)

	# --- Legs (hip pivots; boxes hang DOWN so the pivot swings the stride) --
	p.legs_pivot = Node3D.new()
	p.add_child(p.legs_pivot)
	p.hip_l = _limb_pivot(Vector3(-0.14, 0.78, 0), Vector3(0.17, 0.7, 0.19), pants)
	p.hip_r = _limb_pivot(Vector3(0.14, 0.78, 0), Vector3(0.17, 0.7, 0.19), pants)
	p.legs_pivot.add_child(p.hip_l)
	p.legs_pivot.add_child(p.hip_r)

	# --- Free arm (the non-gun side; swings with the gait) -----------------
	var free_x := -0.29 * right # opposite the gun hand
	p.free_arm = _limb_pivot(Vector3(free_x, 1.4, 0), Vector3(0.14, 0.6, 0.14), cloth)
	p.add_child(p.free_arm)

	# --- Aim arm (the gun side; the caller yaws it to the gaze) ------------
	p.aim_arm = Node3D.new()
	p.add_child(p.aim_arm)
	var hand_x := 0.29 * right
	# upper arm reaching from the shoulder forward toward the hand
	var arm_box := _box(Vector3(0.14, 0.5, 0.14), Vector3(hand_x, 1.28, -0.14), cloth)
	p.aim_arm.add_child(arm_box)
	p.hand = Node3D.new()
	p.hand.position = Vector3(hand_x, 1.12, -0.36)
	p._gun_rest = p.hand.position
	p.aim_arm.add_child(p.hand)
	p.gun = _box(Vector3(0.07, 0.07, 0.62), Vector3.ZERO, Color(0.16, 0.16, 0.18))
	p.gun.visible = false
	p.hand.add_child(p.gun)
	return p


static func _box(size: Vector3, pos: Vector3, color: Color) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	m.mesh = bm
	m.material_override = ProtoWorldBuilder.material(color, 0.85)
	m.position = pos
	return m


## A limb = a pivot Node3D at the joint + a box hanging half its length below,
## so rotating the pivot about X swings the whole limb from the joint.
static func _limb_pivot(joint: Vector3, size: Vector3, color: Color) -> Node3D:
	var pivot := Node3D.new()
	pivot.position = joint
	var box := _box(size, Vector3(0, -size.y * 0.5, 0), color)
	pivot.add_child(box)
	return pivot


# --- The animator: one function, all the life -------------------------------

## Drive the whole puppet off STATE. speed = m/s (horizontal), turn_rate = rad/s of
## body yaw (for lean), armed = gun raised, hurt/dead 0..1-ish. Legs stride, arms
## swing, the aim arm bobs (its yaw is the caller's job), the body breathes when
## idle and leans into turns; hurt slumps; dead collapses.
func animate(delta: float, speed: float, turn_rate: float, armed: bool, hurt: float, dead: bool) -> void:
	_t += delta
	_dead_blend = move_toward(_dead_blend, 1.0 if dead else 0.0, delta * 3.0)
	if _dead_blend > 0.001:
		_pose_dead()
		if _dead_blend >= 0.999:
			return

	var moving := speed > 0.35
	var gait: float = float(appearance["gait"])
	# Cadence rises with speed; frozen when standing (so we don't drift the phase).
	if moving:
		_phase += (2.0 + speed * 1.15) * gait * delta
	var amp := clampf(speed / 7.0, 0.0, 1.0) * 0.6 * (1.0 - hurt * 0.4)

	# LEGS — alternate. A limp shortens and hitches one leg.
	var limp_l := 1.0
	var limp_r := 1.0
	if appearance["limp"] == "l":
		limp_l = 0.4
	elif appearance["limp"] == "r":
		limp_r = 0.4
	var swing_l := sin(_phase) * amp
	var swing_r := sin(_phase + PI) * amp
	hip_l.rotation.x = swing_l * limp_l
	hip_r.rotation.x = swing_r * limp_r
	# The bad leg stays a touch stiff/bent (a hitch you can read).
	if appearance["limp"] == "l":
		hip_l.rotation.x = maxf(hip_l.rotation.x, -0.12)
	elif appearance["limp"] == "r":
		hip_r.rotation.x = maxf(hip_r.rotation.x, -0.12)

	# FREE ARM swings opposite the gun-side leg (natural counter-swing).
	free_arm.rotation.x = -swing_r * 0.85

	# AIM ARM — its YAW is set by the caller (points at the gaze). We add the
	# vertical: unarmed it swings with the gait; armed it holds level with a tiny bob.
	if armed and gun.visible:
		aim_arm.rotation.x = sin(_t * 2.0) * 0.02
	else:
		aim_arm.rotation.x = -swing_l * 0.85

	# BREATHING + step BOB: idle = slow chest rise; moving = a small vertical lilt.
	var breath := sin(_t * 1.8) * (0.02 if not moving else 0.0)
	var step_bob := absf(sin(_phase)) * amp * 0.12
	torso.position.y = 1.05 + breath + step_bob
	neck.position.y = 1.44 + breath + step_bob

	# LEAN into turns (+ a slight forward lean at speed), and SLUMP when hurt.
	var lean_target := clampf(-turn_rate * 0.22, -0.35, 0.35)
	_lean = lerp(_lean, lean_target, clampf(9.0 * delta, 0.0, 1.0))
	_slump = lerp(_slump, hurt * 0.3, clampf(4.0 * delta, 0.0, 1.0))
	torso.rotation.z = _lean
	torso.rotation.x = speed * 0.02 + _slump
	neck.rotation.z = _lean * 0.5
	neck.rotation.x = -_slump * 0.5 # head stays up a bit even when slumping


## A body that has fallen: torso back and down, limbs limp. Blended in over ~0.3s.
func _pose_dead() -> void:
	var b := _dead_blend
	torso.rotation.x = lerp(torso.rotation.x, -1.3, b)
	torso.position.y = lerp(torso.position.y, 0.35, b)
	neck.rotation.x = lerp(neck.rotation.x, -0.6, b)
	hip_l.rotation.x = lerp(hip_l.rotation.x, -0.5, b)
	hip_r.rotation.x = lerp(hip_r.rotation.x, 0.4, b)
	free_arm.rotation.x = lerp(free_arm.rotation.x, 1.1, b)
	aim_arm.rotation.x = lerp(aim_arm.rotation.x, 1.1, b)


# --- Weapon hand poses (Rung 2 hook — the pose is the WEAPON's property) ------

## Per-weapon hand offset + a two-hand hint. Moves where the gun sits in the hand;
## the free arm can be pulled up to "support" a long gun. Called when the weapon changes.
func set_hand_pose(offset: Vector3, two_handed: bool) -> void:
	_hand_offset = offset
	hand.position = _gun_rest + Vector3(offset.x * handed_sign, offset.y, offset.z)
	# Two-handed longarms bring the free hand across to the fore-grip.
	if two_handed:
		free_arm.position.x = 0.12 * handed_sign
	else:
		free_arm.position.x = -0.29 * handed_sign


# --- Held-weapon feel (delegated by the player) -----------------------------

func set_armed(on: bool) -> void:
	if gun:
		gun.visible = on


func gun_recoil() -> void:
	if gun == null:
		return
	var tw := gun.create_tween()
	tw.tween_property(gun, "position:z", 0.12, 0.04).set_ease(Tween.EASE_OUT)
	tw.tween_property(gun, "position:z", 0.0, 0.09).set_ease(Tween.EASE_IN_OUT)


func swing() -> void:
	if gun == null:
		return
	gun.rotation.y = 0.9
	var tw := gun.create_tween()
	tw.tween_property(gun, "rotation:y", -0.9, 0.13).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(gun, "rotation:y", 0.0, 0.12).set_ease(Tween.EASE_IN_OUT)


## World-space muzzle tip — rounds LEAVE THE GUN barrel.
func muzzle_world() -> Vector3:
	if gun and gun.visible:
		return gun.global_position - gun.global_basis.z * 0.34
	return global_position + Vector3(0, 1.2, 0)
