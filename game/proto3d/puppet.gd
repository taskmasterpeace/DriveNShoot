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
##   aim_arm (the old "_upper": caller yaws it to the gaze) → shoulder → arm + hand → gun
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

## The proof of the pillar: 50 survivors from ONE rig by feeding it ROWS. Each is a
## partial override of DEFAULT — add a look = add a row, never touch code. These
## double as NPC bodies (Rung 4) and character-creation presets (Rung 5).
const SURVIVORS: Dictionary = {
	"scav": {"cloth": Color(0.5, 0.44, 0.3), "pants": Color(0.32, 0.3, 0.26), "backpack": true, "gait": 1.0},
	"drifter": {"cloth": Color(0.4, 0.36, 0.34), "pants": Color(0.28, 0.26, 0.24), "hat": Color(0.3, 0.26, 0.18), "gait": 0.9},
	"raider": {"torso": Vector3(0.56, 0.74, 0.32), "cloth": Color(0.35, 0.2, 0.16), "pants": Color(0.22, 0.2, 0.18), "gait": 1.15, "height": 1.06},
	"trader": {"cloth": Color(0.55, 0.45, 0.2), "pants": Color(0.3, 0.28, 0.22), "hat": Color(0.5, 0.42, 0.22), "gait": 0.85},
	"guard": {"torso": Vector3(0.54, 0.74, 0.32), "cloth": Color(0.3, 0.34, 0.4), "pants": Color(0.24, 0.26, 0.3), "hat": Color(0.22, 0.24, 0.28), "gait": 1.0, "height": 1.04},
	"waif": {"torso": Vector3(0.44, 0.66, 0.26), "cloth": Color(0.5, 0.5, 0.44), "pants": Color(0.34, 0.34, 0.3), "gait": 1.1, "height": 0.92},
	"old_timer": {"cloth": Color(0.44, 0.42, 0.4), "pants": Color(0.3, 0.3, 0.3), "hat": Color(0.4, 0.38, 0.34), "gait": 0.75, "limp": "l", "height": 0.98},
	# The LURKER on the shared rig: all-black, hooded (a hood mesh rides the head), a
	# slow prowl. The last enemy pulled off its bespoke mesh onto the one puppet.
	"lurker": {"torso": Vector3(0.5, 0.72, 0.3), "cloth": Color(0.12, 0.11, 0.10), "pants": Color(0.10, 0.09, 0.09), "skin": Color(0.14, 0.13, 0.12), "hat": Color(0.09, 0.08, 0.08), "gait": 0.8, "height": 1.02},
}


static func look(name_in: String) -> Dictionary:
	return SURVIVORS.get(name_in, {}).duplicate(true)


## MOTIONFORGE (MOVESET.txt SPEC B): the animator's magic numbers are ROWS.
## Stock values live HERE (code is floor); game/data/motions.json — written by
## MotionForge (:8896) — overlays them param-by-param at boot. Tune a walk in the
## browser, F10-FORGE reload, watch it change. No keyframes, no rebuilds.
static var MOTION: Dictionary = {
	"gait": {"cadence_base": 2.0, "cadence_speed": 1.15, "stride_amp": 0.6,
		"arm_swing": 0.85, "step_bob": 0.12, "breath_amp": 0.02, "lean_turn": 0.22,
		"crouch_drop": 0.34,
		# CROUCH NO-KISS FIX (owner: "looks crazy/horrible... blurry" — the torso and
		# hip boxes were z-fighting at full crouch, math-verified 0.51m AABB overlap).
		# The fix is NOT to chase zero overlap (standing already rests 0.09m deep and
		# reads fine — interpenetration alone doesn't shimmer, NEAR-COPLANAR faces do).
		# Instead every pose must stay OUT of the shallow "kiss zone": either clearly
		# separated or deep-stable (>0.05m overlap). Three levers, all ROWS:
		"hip_fold_max": 0.40,     # was a hardcoded 0.55 inline — trimmed + promoted to a row
		"hip_drop_frac": 0.50,    # the hip JOINT sinks this fraction of the torso's own drop
		"hip_joint_gap": 0.03,    # small fixed clearance between the joint and the hip box's rest attach
		"torso_scale_min": 0.81,  # torso compresses (scale.y) toward this at full crouch — the spine curls
		# RIG V2 FOLLOW-THROUGH (PUPPET_RIG_V2.md): the new elbows/knees ride their
		# parents as fractions — every old animation instantly reads alive, no keyframes.
		"knee_follow": 0.55,      # knee bends this fraction of the stride's lift
		"knee_phase": 0.45,       # rad ahead of the hip — the calf trails the thigh
		"knee_rest": 0.06,        # a hair of standing bend (locked knees read robotic)
		"crouch_knee": 0.55,      # extra knee coil at full crouch — the low silhouette
		"elbow_follow": 0.35,     # elbow bends this fraction of the arm's swing
		"elbow_rest": 0.14,       # arms never hang truly straight
		# TORSO TWIST (owner 2026-07-08: "it turns like a DOORKNOB, not like a
		# torso"). A turn is led by the CHEST — the shoulder line twists about the
		# spine while the legs (legs_pivot) track the feet: real shoulder-hip
		# separation, not a rigid column spun flat about its center.
		"turn_twist": 0.34,       # rad of chest lead per rad/s of body turn
		"turn_bank": 0.30},       # rad of roll INTO the turn per rad/s (the lean, strengthened)
	# THE MELEE READ (owner: "the swing is horrible") — every timing + angle is a
	# ROW now, tunable live in MotionForge. Stock = the retuned SNAPPY version:
	# short coil, tight whip, fast settle — a strike, not a twirl.
	"melee": {"windup_s": 0.06, "windup_yaw": 0.7, "windup_lift": 0.25,
		"slash_s": 0.1, "slash_yaw": 0.85, "slash_dip": 0.15, "gun_twist": 0.45,
		"settle_s": 0.12,
		"punch_out_s": 0.05, "punch_reach": 1.45, "punch_back_s": 0.12,
		"kick_out_s": 0.07, "kick_height": 1.5, "kick_back_s": 0.18, "kick_lean": 0.25},
	# RIG V2 PHASE 3 (PUPPET_RIG_V2.md §4): the recoil SPRING is rows too. k/c per
	# the spec's spring-damper (c raised from the spec's sketch ~14 to meet its own
	# acceptance number: settled <= 250ms); strength_eat = how much muscle eats the
	# kick (kick x (1 - level x eat)) — a belt-rank of recoil control is a NUMBER.
	"recoil": {"k": 180.0, "c": 22.0, "strength_eat": 0.06},
}
static var _motion_folded: bool = false
## The pristine code floor, captured before the FIRST fold — every re-fold starts
## from here, so DELETING a row in motions.json actually reverts the live value
## (the old additive-only refold could never un-apply an override until restart —
## the one red motion_stage_sim documented as "restore-timing edge" was this).
static var _motion_stock: Dictionary = {}


static func ensure_motions() -> void:
	if _motion_folded:
		return
	_motion_folded = true
	if _motion_stock.is_empty():
		_motion_stock = MOTION.duplicate(true)
	else:
		MOTION = _motion_stock.duplicate(true)
	fold_motion_file("puppet", MOTION)


## The one fold: data overrides stock, number by number, unknown motions welcome.
## Shared by the quadruped (and any future rig) — same law as ensure_items().
static func fold_motion_file(rig: String, into: Dictionary, path: String = "res://data/motions.json") -> void:
	if not FileAccess.file_exists(path):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		return
	var rigs: Dictionary = (parsed as Dictionary).get("rigs", {})
	var rig_rows: Dictionary = rigs.get(rig, {})
	for m in rig_rows:
		var row_v: Variant = rig_rows[m]
		if not (row_v is Dictionary):
			continue
		if not into.has(String(m)):
			into[String(m)] = {}
		for k in (row_v as Dictionary):
			var val: Variant = (row_v as Dictionary)[k]
			if val is float or val is int:
				(into[String(m)] as Dictionary)[String(k)] = float(val)


var appearance: Dictionary = {}
var handed_sign: float = 1.0 ## +1 gun on the right (local -X? see below), -1 on the left

# Parts (kept for the animator).
var torso: MeshInstance3D
var neck: Node3D
var head: MeshInstance3D
var legs_pivot: Node3D   ## the caller yaws this for feet-vs-body (old "_lower"); ALSO the crouch drop joint
var hip_l: Node3D
var hip_r: Node3D
var _hip_l_box: MeshInstance3D ## the leg mesh itself — the CROUCH no-kiss gap nudges its local Y
var _hip_r_box: MeshInstance3D
var _hip_box_rest_y: float = 0.0 ## the box's stock local Y offset from its pivot (before any gap)
var free_arm: Node3D
var aim_arm: Node3D      ## the caller yaws this to the gaze (old "_upper")
var shoulder: Node3D     ## the REAL joint: raises/hangs/swings the gun arm (playtest: no more feet-orbit float)
var gun: MeshInstance3D
var hand: Node3D
## RIG V2 (PUPPET_RIG_V2.md — "no knee, no elbow, no forearm" fixed): segmented limbs.
## Every new joint is a CHILD of an existing pivot, so every old name (shoulder, free_arm,
## hip_l/r) keeps driving its whole limb — the alias law. Follow-through in animate()
## bends these as fractions of their parents, so every old animation instantly reads better.
var elbow_r: Node3D      ## inside the gun arm (under shoulder) — the forearm hinge
var elbow_l: Node3D      ## inside the free arm
var hand_l: Node3D       ## the free hand's anchor (the two-hand fore-grip lands here)
var knee_l: Node3D
var knee_r: Node3D
var foot_l: Node3D
var foot_r: Node3D
var _hat: MeshInstance3D
var _pack: MeshInstance3D

## A wounded arm can't hold the barrel still: 0 = steady, 1 = full shake.
## (Set live by the wound system; the spread tax lives in the weapon.)
var aim_wobble: float = 0.0

## Does the weapon arm hold level and track the gaze? TRUE for guns (twin-stick:
## the raised iron IS the aim read). Melee sets it FALSE — steel is CARRIED low
## and only comes up in the swing (playtest: the always-raised wrench floated).
var raised: bool = true

## How far down the arm hangs when relaxed (rad about the shoulder; 0 = level).
const ARM_HANG: float = -0.95
## Free-arm segment lengths (shoulder→elbow, elbow→hand) — the 2-bone IK's a and b.
## create() builds the joints from these same numbers so the solve can never drift
## from the geometry.
const FREE_UPPER_LEN: float = 0.30
const FREE_FORE_LEN: float = 0.30
## Carried-weapon tilt: the hand rolls so a carried wrench lies along the leg.
const HAND_CARRY: float = -0.6

var _t: float = 0.0
var _phase: float = 0.0
var _lean: float = 0.0
var _twist: float = 0.0 ## smoothed chest-lead into a turn (the doorknob fix)
var _slump: float = 0.0
## CROUCH (the moveset's one new stance): the caller sets crouch_target (0 stand,
## 1 full crouch); the blend eases so the rig SINKS instead of popping. Lowers the
## torso/head, folds the hips, shortens the stride — a coiled, quiet silhouette.
var crouch_target: float = 0.0
var _crouch: float = 0.0
var _swing_t: float = 0.0      ## >0 while a melee swing tween OWNS the shoulder
var _kick_t: float = 0.0       ## >0 while a KICK tween owns the right hip
var _gun_rest: Vector3 = Vector3(0.0, 1.12, -0.36)
var _hand_offset: Vector3 = Vector3.ZERO ## per-weapon hand pose (set_hand_pose)
var _two_handed: bool = false ## longarm: the free hand rides the fore-grip (RIG V2)
## RIG V2 PHASE 2 (PUPPET_RIG_V2.md §3): per-weapon GRIP POINTS, local to the gun
## mesh. grip_l = where the free hand PLANTS (2-bone IK); grip_r = where the gun
## sits in the trigger palm (the gun re-seats by -grip_r). ZERO grip_l = no row
## data -> the legacy posed hold (never a silent misreach).
var _grip_l: Vector3 = Vector3.ZERO
var _gun_seat: Vector3 = Vector3.ZERO ## gun.position at rest (recoil returns HERE, not 0)
var _dead_blend: float = 0.0
var _flinch: float = 0.0       ## hit reaction — the body rocks away from the blow
var _flinch_side: float = 0.0
## RIG V2 PHASE 3: recoil is an ADDITIVE spring-damper layer (x = the joint offset,
## v = its velocity; constants ride the MOTION["recoil"] row). Arm = the aim
## shoulder's pitch; torso = the whole-body rock past the stagger threshold.
var _recoil_arm_x: float = 0.0
var _recoil_arm_v: float = 0.0
var _recoil_arm_applied: float = 0.0 ## last frame's added offset — peeled off before the
## pose write so the shoulder's smoothing lerp never FEEDS ON the layer (additive
## means additive: without this the lerp compounds the kick ~2.5x its authored rad)
var _recoil_torso_x: float = 0.0
var _recoil_torso_v: float = 0.0


static func create(appearance_in: Dictionary = {}) -> ProtoPuppet:
	ensure_motions() # the rig reads ROWS — fold the data before the first stride
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

	# --- Legs (RIG V2: hip → THIGH → knee → CALF → foot; the hip pivot still swings
	# the whole limb, so every old animation drives it unchanged — the alias law).
	# Cross-sections STEP DOWN segment to segment and each lower box insets 0.02 from
	# its joint, so no two faces ever sit coplanar (the crouch-shimmer no-kiss law).
	p.legs_pivot = Node3D.new()
	p.add_child(p.legs_pivot)
	var thigh_size := Vector3(0.17, 0.38, 0.19)
	var calf_size := Vector3(0.14, 0.34, 0.16)
	p.hip_l = _limb_pivot(Vector3(-0.14, 0.78, 0), thigh_size, pants)
	p.hip_r = _limb_pivot(Vector3(0.14, 0.78, 0), thigh_size, pants)
	p.legs_pivot.add_child(p.hip_l)
	p.legs_pivot.add_child(p.hip_r)
	p.knee_l = _joint_under(p.hip_l, Vector3(0, -0.36, 0))
	p.knee_r = _joint_under(p.hip_r, Vector3(0, -0.36, 0))
	var boot := Color(pants.r * 0.6, pants.g * 0.6, pants.b * 0.6)
	for kn in [p.knee_l, p.knee_r]:
		kn.add_child(_box(calf_size, Vector3(0, -0.19, 0), pants))
	p.foot_l = _joint_under(p.knee_l, Vector3(0, -0.36, 0))
	p.foot_r = _joint_under(p.knee_r, Vector3(0, -0.36, 0))
	for ft in [p.foot_l, p.foot_r]:
		ft.add_child(_box(Vector3(0.15, 0.07, 0.26), Vector3(0, -0.035, -0.05), boot))
	# CROUCH no-kiss fix: the THIGH box is _limb_pivot's sole mesh child — grab it so
	# the animator can nudge its local Y by hip_joint_gap (same law as before).
	p._hip_box_rest_y = -thigh_size.y * 0.5
	p._hip_l_box = p.hip_l.get_child(0) as MeshInstance3D
	p._hip_r_box = p.hip_r.get_child(0) as MeshInstance3D

	# --- Free arm (RIG V2: upper → elbow → forearm → hand_l; the free_arm pivot still
	# swings the whole limb). The HAND anchor is where a two-hand fore-grip lands.
	var free_x := -0.29 * right # opposite the gun hand
	p.free_arm = _limb_pivot(Vector3(free_x, 1.4, 0), Vector3(0.14, 0.32, 0.14), cloth)
	p.add_child(p.free_arm)
	p.elbow_l = _joint_under(p.free_arm, Vector3(0, -FREE_UPPER_LEN, 0))
	p.elbow_l.add_child(_box(Vector3(0.12, 0.28, 0.12), Vector3(0, -0.16, 0), cloth))
	p.hand_l = _joint_under(p.elbow_l, Vector3(0, -FREE_FORE_LEN, 0))
	p.hand_l.add_child(_box(Vector3(0.09, 0.09, 0.09), Vector3.ZERO, skin))

	# --- Aim arm (the gun side; the caller yaws it to the gaze) ------------
	# aim_arm = the YAW pivot (body center, so a full-turn aim stays symmetric).
	# shoulder = the REAL joint inside it: everything hangs off the shoulder so
	# raising/hanging/swinging pivots there — NOT orbiting the feet (the old bug:
	# rotation.x at the root swung the arm on a 1.2 m arc around the body).
	p.aim_arm = Node3D.new()
	p.add_child(p.aim_arm)
	var hand_x := 0.29 * right
	p.shoulder = Node3D.new()
	p.shoulder.position = Vector3(hand_x, 1.4, 0)
	p.aim_arm.add_child(p.shoulder)
	# RIG V2 gun arm: UPPER (shoulder→elbow) + FOREARM (elbow→hand) along the same
	# reach line the old single box took. The HAND now rides the ELBOW — its net rest
	# spot is identical (0,-0.28,-0.36 from the shoulder), so gun/muzzle/recoil math
	# and set_hand_pose all read exactly as before (the alias law, joint by joint).
	var arm_box := _box(Vector3(0.14, 0.28, 0.14), Vector3(0, -0.07, -0.09), cloth)
	p.shoulder.add_child(arm_box)
	p.elbow_r = Node3D.new()
	p.elbow_r.position = Vector3(0, -0.14, -0.18)
	p.shoulder.add_child(p.elbow_r)
	p.elbow_r.add_child(_box(Vector3(0.12, 0.26, 0.12), Vector3(0, -0.06, -0.08), cloth))
	p.hand = Node3D.new()
	p.hand.position = Vector3(0, -0.14, -0.18) # elbow-local; shoulder-net = the old rest
	p._gun_rest = p.hand.position
	p.elbow_r.add_child(p.hand)
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


## RIG V2: a bare child joint (elbow/knee/foot) at an offset inside its parent limb.
static func _joint_under(parent: Node3D, at: Vector3) -> Node3D:
	var j := Node3D.new()
	j.position = at
	parent.add_child(j)
	return j


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
	var mg: Dictionary = MOTION["gait"] # the ROW (MotionForge tunes it live)
	_crouch = move_toward(_crouch, clampf(crouch_target, 0.0, 1.0), delta * 5.0)
	# Cadence rises with speed; frozen when standing (so we don't drift the phase).
	if moving:
		_phase += (float(mg["cadence_base"]) + speed * float(mg["cadence_speed"])) * gait * delta
	var amp := clampf(speed / 7.0, 0.0, 1.0) * float(mg["stride_amp"]) * (1.0 - hurt * 0.4) * (1.0 - _crouch * 0.45)

	# LEGS — alternate. A limp shortens and hitches one leg.
	var limp_l := 1.0
	var limp_r := 1.0
	if appearance["limp"] == "l":
		limp_l = 0.4
	elif appearance["limp"] == "r":
		limp_r = 0.4
	_kick_t = maxf(0.0, _kick_t - delta)
	var swing_l := sin(_phase) * amp
	var swing_r := sin(_phase + PI) * amp
	hip_l.rotation.x = swing_l * limp_l
	if _kick_t <= 0.0: # a live KICK tween owns the right hip
		hip_r.rotation.x = swing_r * limp_r
	# The bad leg stays a touch stiff/bent (a hitch you can read).
	if appearance["limp"] == "l":
		hip_l.rotation.x = maxf(hip_l.rotation.x, -0.12)
	elif appearance["limp"] == "r" and _kick_t <= 0.0:
		hip_r.rotation.x = maxf(hip_r.rotation.x, -0.12)
	# CROUCH: both hips fold forward — the legs coil under the lowered body.
	if _crouch > 0.001:
		var hip_fold: float = float(mg["hip_fold_max"])
		hip_l.rotation.x -= hip_fold * _crouch
		if _kick_t <= 0.0:
			hip_r.rotation.x -= hip_fold * _crouch

	# RIG V2 KNEES: the calf trails the thigh a beat behind (follow-through), never
	# locks straight, and COILS at full crouch — the single biggest look upgrade.
	# Positive-only bend: a knee is a hinge, it only folds one way.
	var kf: float = float(mg["knee_follow"])
	var kr: float = float(mg["knee_rest"])
	var kph: float = float(mg["knee_phase"])
	var crouch_knee: float = float(mg["crouch_knee"]) * _crouch
	knee_l.rotation.x = kr + crouch_knee + kf * maxf(0.0, sin(_phase + kph)) * amp * limp_l
	if _kick_t <= 0.0:
		knee_r.rotation.x = kr + crouch_knee + kf * maxf(0.0, sin(_phase + PI + kph)) * amp * limp_r
	# Feet stay roughly level with the ground under the bend.
	foot_l.rotation.x = -(knee_l.rotation.x + hip_l.rotation.x) * 0.5
	foot_r.rotation.x = -(knee_r.rotation.x + hip_r.rotation.x) * 0.5

	# FREE ARM swings opposite the gun-side leg (natural counter-swing) — unless
	# a punch tween owns it (the off-hand jab of the combo).
	var ef: float = float(mg["elbow_follow"])
	var er: float = float(mg["elbow_rest"])
	if _swing_t <= 0.0:
		if _two_handed and raised and armed and gun.visible:
			if _grip_l.is_zero_approx():
				# RIG V2 TWO-HAND GRIP, legacy posed hold (a row with no grip point):
				# the free arm comes UP AND ACROSS to the fore-grip — reach from the
				# shoulder, elbow closing the distance. Never a silent misreach.
				free_arm.rotation.x = lerpf(free_arm.rotation.x, -1.22, clampf(10.0 * delta, 0.0, 1.0))
				elbow_l.rotation.x = lerpf(elbow_l.rotation.x, -0.42, clampf(10.0 * delta, 0.0, 1.0))
				free_arm.rotation.y = move_toward(free_arm.rotation.y, 0.0, 6.0 * delta)
				free_arm.rotation.z = move_toward(free_arm.rotation.z, 0.0, 6.0 * delta)
			else:
				# RIG V2 PHASE 2: the free hand PLANTS on the weapon's grip point —
				# closed-form 2-bone IK, tracking the live aim chain every frame.
				_solve_foregrip_ik(delta)
		else:
			free_arm.rotation.x = -swing_r * float(mg["arm_swing"])
			# RIG V2 ELBOW: bends INTO the swing (forward = negative), never hyperextends.
			elbow_l.rotation.x = -(er + ef * maxf(0.0, free_arm.rotation.x))
			# Any IK residue on the off axes relaxes home (one-hand rows swing FREE).
			free_arm.rotation.y = move_toward(free_arm.rotation.y, 0.0, 6.0 * delta)
			free_arm.rotation.z = move_toward(free_arm.rotation.z, 0.0, 6.0 * delta)

	# AIM ARM — its YAW is set by the caller (points at the gaze). The SHOULDER
	# does the vertical, pivoting at the joint: a raised gun holds level with a
	# tiny bob; relaxed (unarmed OR carried melee) it hangs at the side and
	# counter-swings with the gait like a real arm. A live melee swing owns the
	# joint (tween) — we keep our hands off until it lands.
	# (First: peel off last frame's recoil offset so the smoothing lerp below
	# reads the clean base pose, never pose+spring.)
	shoulder.rotation.x -= _recoil_arm_applied
	_recoil_arm_applied = 0.0
	_swing_t = maxf(0.0, _swing_t - delta)
	if _swing_t <= 0.0:
		var hold := raised and armed and gun.visible
		# The steady-arm bob — plus the WOUND SHAKE: two off-phase sines that
		# won't settle, exactly like a torn muscle fighting the weight.
		var wobble := (sin(_t * 13.7) * 0.05 + sin(_t * 7.3) * 0.04) * aim_wobble
		var pose_target := (sin(_t * 2.0) * 0.02 + wobble) if hold else ARM_HANG - swing_l * 0.55
		# One smoothed write: raise/lower transitions blend and the post-swing
		# hand-off can't pop (the lerp eats the mismatch in a few frames).
		shoulder.rotation.x = lerpf(shoulder.rotation.x, pose_target, clampf(12.0 * delta, 0.0, 1.0))
		shoulder.rotation.y = move_toward(shoulder.rotation.y, 0.0, 8.0 * delta)
		hand.rotation.x = lerpf(hand.rotation.x, 0.0 if hold else HAND_CARRY, clampf(10.0 * delta, 0.0, 1.0))
		# RIG V2 ELBOW (gun side): a RAISED iron aims down a straight arm; a hanging
		# arm keeps a natural bend that deepens as it swings back with the gait.
		var elbow_target := 0.0 if hold else -(er + ef * maxf(0.0, shoulder.rotation.x - ARM_HANG) * 0.6)
		elbow_r.rotation.x = lerpf(elbow_r.rotation.x, elbow_target, clampf(10.0 * delta, 0.0, 1.0))

	# BREATHING + step BOB: idle = slow chest rise; moving = a small vertical lilt.
	# A crouch SINKS the whole column (torso + head ride down together).
	var breath := sin(_t * 1.8) * (float(mg["breath_amp"]) if not moving else 0.0)
	var step_bob := absf(sin(_phase)) * amp * float(mg["step_bob"])
	var drop: float = float(mg["crouch_drop"]) * _crouch
	torso.position.y = 1.05 + breath + step_bob - drop
	neck.position.y = 1.44 + breath + step_bob - drop * 1.47
	# CROUCH NO-KISS FIX: at full crouch the torso's dropped+pitched bottom face swept
	# 0.51m deep into the hip box (a fixed, math-verified overlap — the hip box's TOP
	# always sits flush with its joint by construction, at any fold angle). Rather than
	# chase zero intersection (proven WRONG: standing already rests 0.09m deep and reads
	# fine — coplanar/near-touching faces shimmer, deep overlap does not), three levers
	# keep every pose either clearly separated or safely deep (verified by crouch_sim):
	#  1) the hip JOINT itself sinks a fraction of the torso's drop (legs_pivot, both
	#     hips move together — no per-leg asymmetry, no knees lifting oddly)
	#  2) the torso itself COMPRESSES (scale.y) toward a hunkered, coiled spine — this
	#     also directly shrinks the torso's own reach toward the hips
	#  3) a small fixed clearance between each hip joint and its box's rest attach
	legs_pivot.position.y = -float(mg["hip_drop_frac"]) * drop
	var torso_scale_min: float = float(mg["torso_scale_min"])
	torso.scale.y = 1.0 - (1.0 - torso_scale_min) * _crouch
	var hip_gap: float = float(mg["hip_joint_gap"]) * _crouch
	if _hip_l_box:
		_hip_l_box.position.y = _hip_box_rest_y - hip_gap
	if _hip_r_box:
		_hip_r_box.position.y = _hip_box_rest_y - hip_gap

	# LEAN into turns (+ a slight forward lean at speed), and SLUMP when hurt.
	var lean_target := clampf(-turn_rate * float(mg["turn_bank"]), -0.35, 0.35)
	_lean = lerp(_lean, lean_target, clampf(9.0 * delta, 0.0, 1.0))
	_slump = lerp(_slump, hurt * 0.3, clampf(4.0 * delta, 0.0, 1.0))
	# THE DOORKNOB FIX (owner 2026-07-08): the chest LEADS the turn — a spine
	# twist about Y — so the torso reads as a torso, not a rigid box spun flat.
	# aim_arm is a SIBLING of the torso (not a child), so this never touches aim;
	# the legs (legs_pivot) track the feet on the caller's side → shoulder-hip
	# separation falls out for free.
	var twist_target := clampf(turn_rate * float(mg["turn_twist"]), -0.55, 0.55)
	_twist = lerp(_twist, twist_target, clampf(7.0 * delta, 0.0, 1.0))
	torso.rotation.z = _lean
	torso.rotation.y = _twist
	torso.rotation.x = speed * 0.02 + _slump + 0.3 * _crouch # crouch leans you over your knees
	neck.rotation.z = _lean * 0.5
	neck.rotation.y = -_twist * 0.5 # the head stays truer to the aim than the leading chest
	neck.rotation.x = -_slump * 0.5 - 0.18 * _crouch # head stays up, scanning, even low

	# COMBAT READS (Rung 6): a hit ROCKS the body back (flinch), a shot KICKS the
	# aim arm up (recoil). Both are impulses that decay — the fight lands ON the rig.
	_flinch = maxf(0.0, _flinch - delta * 5.0)
	if _flinch > 0.0:
		torso.rotation.x += _flinch * 0.5
		torso.rotation.z += _flinch_side * _flinch * 0.28
		neck.rotation.x += _flinch * 0.3
	# RIG V2 PHASE 3: the recoil SPRING (v += (-k·x - c·v)·dt; x += v·dt), an
	# additive layer on top of whatever pose the frame already wrote — it stacks
	# with walking and aiming by construction, exactly like strikes do.
	var rr: Dictionary = MOTION["recoil"]
	var rk: float = float(rr["k"])
	var rc: float = float(rr["c"])
	_recoil_arm_v += (-rk * _recoil_arm_x - rc * _recoil_arm_v) * delta
	_recoil_arm_x += _recoil_arm_v * delta
	_recoil_torso_v += (-rk * _recoil_torso_x - rc * _recoil_torso_v) * delta
	_recoil_torso_x += _recoil_torso_v * delta
	if absf(_recoil_arm_x) > 0.0005 and gun.visible and _swing_t <= 0.0:
		shoulder.rotation.x += _recoil_arm_x # positive at the shoulder = the hand kicks UP
		_recoil_arm_applied = _recoil_arm_x
	if absf(_recoil_torso_x) > 0.0005:
		torso.rotation.x += _recoil_torso_x # the blast rocks the whole body back
		neck.rotation.x += _recoil_torso_x * 0.5


## RIG V2 PHASE 2 (PUPPET_RIG_V2.md §3 + Formulas): the 2-BONE IK. An elbow is a
## hinge, so the whole solve is law-of-cosines — two acos and a cross product per
## frame, no solver library, ever. The grip target is composed down the LIVE local
## chain (aim_arm→shoulder→elbow→hand→gun), so the hold tracks the twin-stick yaw
## for free. A target beyond reach clamps to full extension (never NaN, never a
## stretched limb); the writes lerp so the hand SETTLES onto the grip, no pop.
func _solve_foregrip_ik(delta: float) -> void:
	# The grip point, gun-local -> puppet-root-local (x mirrored for left-handers).
	var grip_local := Vector3(_grip_l.x * handed_sign, _grip_l.y, _grip_l.z)
	var target: Vector3 = aim_arm.transform * (shoulder.transform * (elbow_r.transform
		* (hand.transform * (gun.transform * grip_local))))
	var s := free_arm.position
	var v := target - s
	var a := FREE_UPPER_LEN
	var b := FREE_FORE_LEN
	var d := clampf(v.length(), 0.02, a + b - 0.002)
	var dir := v.normalized()
	# Interior angles (law of cosines); clampf eats the degenerate cases.
	var alpha := acos(clampf((a * a + d * d - b * b) / (2.0 * a * d), -1.0, 1.0))
	# Hinge axis: perpendicular to the reach line. Of the two mirror solutions,
	# take the one that hangs the ELBOW LOWER — the natural read for a fore-grip
	# (and every hold this rig makes: elbows point down, not out at the sky).
	var up_ref := Vector3.UP if absf(dir.dot(Vector3.UP)) < 0.98 else Vector3.FORWARD
	var h := dir.cross(up_ref).normalized()
	var upper_a := dir.rotated(h, alpha)
	var upper_b := dir.rotated(h, -alpha)
	var upper_dir := upper_a if upper_a.y <= upper_b.y else upper_b
	# The upper arm's basis: local -Y runs down the segment, local X is the hinge.
	var bx := h
	var by := -upper_dir
	var bz := bx.cross(by).normalized()
	bx = by.cross(bz).normalized()
	var upper_basis := Basis(bx, by, bz).orthonormalized()
	var eul := upper_basis.get_euler()
	# The elbow is a PURE X hinge by construction (the forearm's target direction
	# lies in the upper basis' Y-Z plane, both being perpendicular to the hinge).
	var elbow_pos := s + upper_dir * a
	var f_local := upper_basis.inverse() * ((target - elbow_pos).normalized())
	var gamma := atan2(-f_local.z, -f_local.y)
	# Sanity rails: acos/atan2 on clamped inputs can't NaN, but a zero-length
	# cross (aim straight up) could — bail to the last pose for a frame.
	if is_nan(eul.x) or is_nan(gamma):
		return
	var k := clampf(10.0 * delta, 0.0, 1.0)
	free_arm.rotation.x = lerp_angle(free_arm.rotation.x, eul.x, k)
	free_arm.rotation.y = lerp_angle(free_arm.rotation.y, eul.y, k)
	free_arm.rotation.z = lerp_angle(free_arm.rotation.z, eul.z, k)
	elbow_l.rotation.x = lerp_angle(elbow_l.rotation.x, gamma, k)


## A hit reaction: rock away from the direction the blow came from (world dir toward
## the attacker). Decays fast — a jolt, not a pose.
func flinch(world_dir: Vector3) -> void:
	_flinch = 1.0
	_flinch_side = signf(global_basis.x.dot(world_dir))


## RIG V2 PHASE 3 (PUPPET_RIG_V2.md §4): RECOIL AS DATA. row = the weapon's
## `recoil` block (kick_pitch / torso_jolt / stagger_threshold, all rad); the
## character's STRENGTH eats it: kick x (1 - level x strength_eat) — a weak
## character gets thrown, a strong one barely moves, and past the stagger
## threshold the whole TORSO rocks, not just the arm. Impulse lands on the
## spring's x (x0 = the scaled kick); the spring in animate() does the rest.
func recoil_kick(row: Dictionary, strength_level: int = 0) -> void:
	var rr: Dictionary = MOTION["recoil"]
	var eat := maxf(0.1, 1.0 - float(strength_level) * float(rr["strength_eat"]))
	var kick := float(row.get("kick_pitch", 0.4)) * eat
	_recoil_arm_x += kick
	if kick >= float(row.get("stagger_threshold", 999.0)):
		_recoil_torso_x -= float(row.get("torso_jolt", 0.0)) * eat # negative pitch = rocked BACK


## The shot's kick, read on the arm (paired with the gun's own z-jab) — the
## parameterless door companions/NPCs still use: a stock kick, no stagger.
func recoil() -> void:
	recoil_kick({"kick_pitch": 0.4, "stagger_threshold": 999.0}, 0)


## THE SADDLE POSE (owner: "see a model on the motorcycle — we need the arm for
## aiming"): rider_exposed rigs pose the puppet ON the seat every frame — hips
## folded, knees gripping the tank, the free hand on the bar. Armed, the gun
## arm holds LEVEL and the caller yaws aim_arm at the mouse (the twin-stick law,
## from the saddle); unarmed, both hands ride the bars. Direct writes — while
## mounted, animate() never runs, so there is no ownership fight.
func pose_riding(delta: float, armed_aim: bool) -> void:
	var k := clampf(10.0 * delta, 0.0, 1.0)
	hip_l.rotation.x = lerpf(hip_l.rotation.x, -1.2, k)
	hip_r.rotation.x = lerpf(hip_r.rotation.x, -1.2, k)
	knee_l.rotation.x = lerpf(knee_l.rotation.x, 1.35, k)
	knee_r.rotation.x = lerpf(knee_r.rotation.x, 1.35, k)
	foot_l.rotation.x = lerpf(foot_l.rotation.x, -0.15, k)
	foot_r.rotation.x = lerpf(foot_r.rotation.x, -0.15, k)
	torso.rotation.x = lerpf(torso.rotation.x, 0.30, k) # leaned into the bars
	torso.rotation.z = lerpf(torso.rotation.z, 0.0, k)
	neck.rotation.x = lerpf(neck.rotation.x, -0.22, k)  # eyes up the road
	free_arm.rotation.x = lerpf(free_arm.rotation.x, -0.95, k) # the bar hand
	free_arm.rotation.y = move_toward(free_arm.rotation.y, 0.0, 6.0 * delta)
	free_arm.rotation.z = move_toward(free_arm.rotation.z, 0.0, 6.0 * delta)
	elbow_l.rotation.x = lerpf(elbow_l.rotation.x, -0.5, k)
	if armed_aim:
		shoulder.rotation.x = lerpf(shoulder.rotation.x, 0.0, k) # level iron
		elbow_r.rotation.x = lerpf(elbow_r.rotation.x, 0.0, k)
		hand.rotation.x = lerpf(hand.rotation.x, 0.0, k)
	else:
		shoulder.rotation.y = move_toward(shoulder.rotation.y, 0.0, 6.0 * delta)
		shoulder.rotation.x = lerpf(shoulder.rotation.x, -0.95, k) # the other bar
		elbow_r.rotation.x = lerpf(elbow_r.rotation.x, -0.5, k)
		hand.rotation.x = lerpf(hand.rotation.x, HAND_CARRY, k)


## A body that has fallen: torso back and down, limbs limp. Blended in over ~0.3s.
func _pose_dead() -> void:
	var b := _dead_blend
	torso.rotation.x = lerp(torso.rotation.x, -1.3, b)
	torso.position.y = lerp(torso.position.y, 0.35, b)
	neck.rotation.x = lerp(neck.rotation.x, -0.6, b)
	hip_l.rotation.x = lerp(hip_l.rotation.x, -0.5, b)
	hip_r.rotation.x = lerp(hip_r.rotation.x, 0.4, b)
	free_arm.rotation.x = lerp(free_arm.rotation.x, 1.1, b)
	shoulder.rotation.x = lerp(shoulder.rotation.x, 1.1, b) # arm flung overhead in the sprawl
	shoulder.rotation.y = lerp(shoulder.rotation.y, 0.0, b)
	# RIG V2: the sprawl bends real knees and elbows now — a body, not a plank.
	knee_l.rotation.x = lerp(knee_l.rotation.x, 0.8, b)
	knee_r.rotation.x = lerp(knee_r.rotation.x, 0.3, b)
	elbow_l.rotation.x = lerp(elbow_l.rotation.x, -0.5, b)
	elbow_r.rotation.x = lerp(elbow_r.rotation.x, -0.35, b)


# --- Weapon hand poses (Rung 2 hook — the pose is the WEAPON's property) ------

## Per-weapon hand offset + a two-hand hint. Moves where the gun sits in the hand;
## the free arm can be pulled up to "support" a long gun. Called when the weapon changes.
## RIG V2 PHASE 2: grip_l (gun-local) is where the FREE hand plants via 2-bone IK —
## ZERO means "no grip row", falling back to the legacy posed hold. grip_r seats the
## gun in the trigger palm by its own grip point (gun.position = -grip_r), so a
## shotgun's stock rides behind the hand while muzzle math keeps reading the mesh.
func set_hand_pose(offset: Vector3, two_handed: bool, grip_l: Vector3 = Vector3.ZERO, grip_r: Vector3 = Vector3.ZERO) -> void:
	_hand_offset = offset
	_two_handed = two_handed
	_grip_l = grip_l
	_gun_seat = Vector3(-grip_r.x * handed_sign, -grip_r.y, -grip_r.z)
	gun.position = _gun_seat
	hand.position = _gun_rest + Vector3(offset.x * handed_sign, offset.y, offset.z)
	# Two-handed longarms bring the free hand across to the fore-grip (RIG V2: animate()
	# then RAISES that arm onto the gun — reach + elbow, a hold the old rig couldn't make).
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
	# The jab is RELATIVE to the seat (grip_r re-seats the gun — recoil must return
	# it there, not to a hardcoded zero that would un-seat a gripped longarm).
	tw.tween_property(gun, "position:z", _gun_seat.z + 0.12, 0.04).set_ease(Tween.EASE_OUT)
	tw.tween_property(gun, "position:z", _gun_seat.z, 0.09).set_ease(Tween.EASE_IN_OUT)


## The melee swing, on the WHOLE ARM — driven entirely by the "melee" MOTION row
## (MotionForge tunes it live; the old hardcoded version was untunable and read
## as a floaty twirl). Windup COILS short, the slash WHIPS tight with the blade
## leading, the settle is quick. While it runs the tween owns the shoulder.
func swing() -> void:
	if gun == null or shoulder == null:
		return
	var m: Dictionary = MOTION["melee"]
	var windup_s: float = float(m["windup_s"])
	var slash_s: float = float(m["slash_s"])
	var settle_s: float = float(m["settle_s"])
	_swing_t = windup_s + slash_s + settle_s
	var hs := handed_sign
	var twist: float = float(m["gun_twist"])
	var tw := create_tween()
	tw.set_parallel(true)
	# WINDUP: a short coil back to the weapon side (negative yaw = the gun side)
	tw.tween_property(shoulder, "rotation:y", -float(m["windup_yaw"]) * hs, windup_s).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(shoulder, "rotation:x", float(m["windup_lift"]), windup_s).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(gun, "rotation:y", twist * hs, windup_s).set_ease(Tween.EASE_OUT)
	# THE SLASH: whip across the hit arc with a downward bite
	tw.chain().tween_property(shoulder, "rotation:y", float(m["slash_yaw"]) * hs, slash_s).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(shoulder, "rotation:x", -float(m["slash_dip"]), slash_s).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(gun, "rotation:y", -twist * hs, slash_s).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	# SETTLE: quick, everything home; animate()'s smoothed write takes over after
	tw.chain().tween_property(shoulder, "rotation:y", 0.0, settle_s).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)
	tw.parallel().tween_property(shoulder, "rotation:x", ARM_HANG if not raised else 0.0, settle_s).set_ease(Tween.EASE_IN_OUT)
	tw.parallel().tween_property(gun, "rotation:y", 0.0, settle_s).set_ease(Tween.EASE_IN_OUT)


## UNARMED (MOVESET.txt): the JAB — a straight, fast hand that snaps out and
## returns. Alternates arms on the combo beat so a flurry reads as boxing.
## Timings/reach ride the "melee" MOTION row (MotionForge-tunable).
func punch(beat: int) -> void:
	if shoulder == null:
		return
	var m: Dictionary = MOTION["melee"]
	var out_s: float = float(m["punch_out_s"])
	var back_s: float = float(m["punch_back_s"])
	_swing_t = out_s + back_s + 0.03
	var off_hand := beat % 2 == 0
	var jab_arm: Node3D = free_arm if off_hand else shoulder
	var tw := create_tween()
	tw.tween_property(jab_arm, "rotation:x", -float(m["punch_reach"]), out_s).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(jab_arm, "rotation:x", 0.0 if off_hand else ARM_HANG, back_s).set_ease(Tween.EASE_IN_OUT)


## The KICK (Martial Arts 2+, the combo's finisher beat): the leg snaps out
## horizontal while the torso leans away — a roundhouse you can read from above.
## Rides the "melee" MOTION row.
func kick() -> void:
	if hip_r == null:
		return
	var m: Dictionary = MOTION["melee"]
	var out_s: float = float(m["kick_out_s"])
	var back_s: float = float(m["kick_back_s"])
	_swing_t = out_s + back_s + 0.03
	_kick_t = _swing_t
	var tw := create_tween()
	tw.set_parallel(true)
	tw.tween_property(hip_r, "rotation:x", -float(m["kick_height"]), out_s).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(torso, "rotation:x", -float(m["kick_lean"]), out_s).set_ease(Tween.EASE_OUT)
	tw.chain().tween_property(hip_r, "rotation:x", 0.0, back_s).set_ease(Tween.EASE_IN_OUT)
	tw.parallel().tween_property(torso, "rotation:x", 0.0, back_s).set_ease(Tween.EASE_IN_OUT)


## True while the melee tween owns the arm (the caller keeps the yaw on the aim).
func is_swinging() -> bool:
	return _swing_t > 0.0


## Should the arm YAW track the gaze this frame? Guns always (twin-stick pillar);
## melee/unarmed only mid-swing — otherwise the arm relaxes home with the body.
func arm_tracks_gaze() -> bool:
	return _swing_t > 0.0 or (raised and gun.visible)


## World-space muzzle tip — rounds LEAVE THE GUN barrel.
func muzzle_world() -> Vector3:
	if gun and gun.visible:
		return gun.global_position - gun.global_basis.z * 0.34
	return global_position + Vector3(0, 1.2, 0)
