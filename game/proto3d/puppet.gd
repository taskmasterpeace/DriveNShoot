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
## BUILD (owner 2026-07-08, the mannequin reference): ONE number makes the same
## skeleton skinny (0) → normal (1) → heavy (2). It scales widths and depths only —
## heights and joints never move, so aim/strike/crouch numbers hold on every body.
const DEFAULT: Dictionary = {
	"height": 1.0,                          ## overall scale
	"build": 1.0,                            ## 0 skinny · 1 normal · 2 heavy (widths/depths only)
	"torso": Vector3(0.46, 0.28, 0.24),     ## CHEST box size (waist + pelvis derive from it)
	"skin": Color(0.78, 0.6, 0.45),
	"cloth": Color(0.46, 0.4, 0.32),        ## torso + arms
	"pants": Color(0.3, 0.3, 0.28),         ## pelvis + legs
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
## BUILD is the new variety axis: the raider is a slab, the waif is a rail, the
## trader grew fat on the market — same sixteen blocks, different silhouettes.
const SURVIVORS: Dictionary = {
	"scav": {"cloth": Color(0.5, 0.44, 0.3), "pants": Color(0.32, 0.3, 0.26), "backpack": true, "gait": 1.0},
	"drifter": {"cloth": Color(0.4, 0.36, 0.34), "pants": Color(0.28, 0.26, 0.24), "hat": Color(0.3, 0.26, 0.18), "gait": 0.9, "build": 0.85},
	"raider": {"torso": Vector3(0.50, 0.30, 0.26), "cloth": Color(0.35, 0.2, 0.16), "pants": Color(0.22, 0.2, 0.18), "gait": 1.15, "height": 1.06, "build": 1.6},
	"trader": {"cloth": Color(0.55, 0.45, 0.2), "pants": Color(0.3, 0.28, 0.22), "hat": Color(0.5, 0.42, 0.22), "gait": 0.85, "build": 1.5},
	"guard": {"torso": Vector3(0.48, 0.29, 0.25), "cloth": Color(0.3, 0.34, 0.4), "pants": Color(0.24, 0.26, 0.3), "hat": Color(0.22, 0.24, 0.28), "gait": 1.0, "height": 1.04, "build": 1.3},
	"waif": {"torso": Vector3(0.40, 0.26, 0.20), "cloth": Color(0.5, 0.5, 0.44), "pants": Color(0.34, 0.34, 0.3), "gait": 1.1, "height": 0.92, "build": 0.3},
	"old_timer": {"cloth": Color(0.44, 0.42, 0.4), "pants": Color(0.3, 0.3, 0.3), "hat": Color(0.4, 0.38, 0.34), "gait": 0.75, "limp": "l", "height": 0.98, "build": 0.7},
	# The LURKER on the shared rig: all-black, hooded (a hood mesh rides the head), a
	# slow prowl. The last enemy pulled off its bespoke mesh onto the one puppet.
	"lurker": {"torso": Vector3(0.44, 0.28, 0.22), "cloth": Color(0.12, 0.11, 0.10), "pants": Color(0.10, 0.09, 0.09), "skin": Color(0.14, 0.13, 0.12), "hat": Color(0.09, 0.08, 0.08), "gait": 0.8, "height": 1.02, "build": 0.8},
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
var torso: MeshInstance3D    ## the CHEST piece (upper torso) — lean/twist body
var waist: Node3D            ## LOWER TORSO on the lower-spine swivel — its own piece
var _pelvis: MeshInstance3D  ## PELVIS/HIPS block — rides legs_pivot (faces the walk)
var neck: Node3D             ## the neck BALL joint (head + eyes + hat ride it)
var head: MeshInstance3D
var fingers_r: Node3D        ## knuckle hinges — the hands OPEN and CLOSE
var fingers_l: Node3D
## Rest heights captured at create() so animate() never hardcodes the column
## (the old 1.05/1.44 literals fought any rebuilt geometry).
var _chest_rest_y: float = 1.28
var _waist_rest_y: float = 1.00
var _neck_rest_y: float = 1.42
var _sh_x: float = 0.275     ## shoulder lateral offset (build-scaled at create)
var legs_pivot: Node3D   ## the caller yaws this for feet-vs-body (old "_lower"); ALSO the crouch drop joint
var hip_l: Node3D
var hip_r: Node3D
var _hip_l_box: MeshInstance3D ## the leg mesh itself — the CROUCH no-kiss gap nudges its local Y
var _hip_r_box: MeshInstance3D
var _hip_box_rest_y: float = 0.0 ## the box's stock local Y offset from its pivot (before any gap)
var free_arm: Node3D
var aim_arm: Node3D      ## the caller yaws this to the gaze (old "_upper")
var shoulder: Node3D     ## the REAL joint: raises/hangs/swings the gun arm (playtest: no more feet-orbit float)
var gun: Node3D ## the held-weapon CONTAINER; box children built per-weapon from a SHAPE spec
var _muzzle_z: float = 0.34 ## barrel-tip distance forward of the grip (per weapon)
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

## THE SIGN LAW (verified by render, 2026-07-08 — the wrong-way arms bug was signs):
## the puppet faces LOCAL -Z, and POSITIVE rotation.x swings a hanging limb FORWARD.
## Every pose below is authored to that convention.
## How far the gun arm pitches when RELAXED. Arms hang straight by GEOMETRY on the
## mannequin build, so relaxed = 0 (just hang).
const ARM_HANG: float = 0.0
## AIMING: holding a gun RAISES the hanging arm forward about the shoulder; the
## elbow (AIM_ELBOW) finishes the lift so the forearm lies LEVEL with the barrel.
## 1.2 + 0.37 = π/2: an extended, horizontal point. The wrist counter-rotates the
## whole chain so the gun stays level and the muzzle keeps pointing at the aim.
const AIM_RAISE: float = 1.2
const AIM_ELBOW: float = 0.37
## Arm segment lengths (shoulder→elbow, elbow→wrist) — BOTH arms are built from
## these same numbers (the reference's symmetric bicep/forearm/hand), and the
## 2-bone IK reads them as its a and b, so the solve can never drift from geometry.
const FREE_UPPER_LEN: float = 0.30
const FREE_FORE_LEN: float = 0.28
## Carried-weapon tilt: the hand rolls so a carried wrench lies along the leg.
const HAND_CARRY: float = -0.6
## THE HANDS (owner: "the opening and closing of the hands"): the fingers block
## hinges at the knuckle line — 0 open flat, GRIP_CURL curled shut (fist / wrapped
## around a weapon grip). Idle hands rest half-relaxed, never robot-flat.
const GRIP_CURL: float = 1.35
const GRIP_RELAX: float = 0.22

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
## Fallback held-weapon silhouette (a plain barrel) until a weapon sets its shape.
const DEFAULT_WEAPON_PARTS: Array = [
	{"size": Vector3(0.06, 0.06, 0.5), "pos": Vector3(0, 0, -0.16), "color": Color(0.16, 0.16, 0.18)},
]
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

	# =========================================================================
	# THE MANNEQUIN BODY (owner 2026-07-08: the reference image is the DEFINITIVE
	# spec — docs/design/BODY_RIG_REFERENCE.md). SIXTEEN pieces, each its own box:
	# head · chest · waist · pelvis · upper-arm/forearm/hand ×2 · thigh/lower-leg/
	# foot ×2. Joints per the guide: neck BALL · shoulders BALL · elbows HINGE ·
	# wrists BALL · spine SWIVEL ×2 · hips BALL · knees HINGE · ankles HINGE.
	# BUILD scales widths/depths only — heights and joints never move, so every
	# aim/strike/crouch number holds on every body type, skinny to heavy.
	# =========================================================================
	var build: float = clampf(float(a.get("build", 1.0)), 0.0, 2.0)
	var wm: float = lerpf(0.72, 1.28, build * 0.5)  # torso widths
	var dm: float = lerpf(0.80, 1.30, build * 0.5)  # torso depths (the belly axis)
	var lm: float = lerpf(0.82, 1.18, build * 0.5)  # limb thickness
	# Legacy-save guard: pre-mannequin rows carried plank-torso sizes (y up to 0.74)
	# that would build a broken chest — clamp into the chest's sane band.
	tsz = Vector3(clampf(tsz.x, 0.36, 0.56), clampf(tsz.y, 0.24, 0.34), clampf(tsz.z, 0.18, 0.30))

	# --- UPPER TORSO / CHEST: the lean/twist body the animator drives (1.14→1.42).
	var chest := Vector3(tsz.x * wm, tsz.y, tsz.z * dm)
	p.torso = _box(chest, Vector3(0, 1.28, 0), cloth)
	p._chest_rest_y = 1.28
	p.add_child(p.torso)

	# --- LOWER TORSO / WAIST: its own piece on the LOWER-SPINE swivel (1.00). The
	# box tucks DEEP into the chest above and the pelvis below (no-kiss law: deep
	# overlap is stable, near-coplanar shimmers) — the visible band is the midriff,
	# read as a separate piece by its narrower width step. The belly grows fastest
	# here on a heavy build.
	p.waist = Node3D.new()
	p.waist.position = Vector3(0, 1.00, 0)
	p._waist_rest_y = 1.00
	p.add_child(p.waist)
	var belly: float = lerpf(0.92, 1.22, build * 0.5)
	p.waist.add_child(_box(Vector3(chest.x * 0.78, 0.24, tsz.z * dm * belly), Vector3(0, 0.07, 0), cloth))
	# (PELVIS/HIPS is built with the legs below — it rides legs_pivot, so the hips
	# face where the FEET walk while the chest faces the aim: real counter-rotation.)

	# --- NECK (ball) + HEAD: the neck box rises from the shoulder line; the head
	# sits ON it. Head 0.25 tall ≈ 14% of the body — a head, not a bobble.
	p.neck = Node3D.new()
	p.neck.position = Vector3(0, 1.42, 0)
	p._neck_rest_y = 1.42
	p.add_child(p.neck)
	var neck_col := Color(skin.r * 0.92, skin.g * 0.92, skin.b * 0.92)
	p.neck.add_child(_box(Vector3(0.11, 0.12, 0.11), Vector3(0, 0.05, 0), neck_col))
	p.head = _box(Vector3(0.24, 0.25, 0.23), Vector3(0, 0.23, 0), skin)
	p.neck.add_child(p.head)
	# Eyes read facing from above; a patched eye goes dark. (neck-local, face = -Z)
	for side in [-1.0, 1.0]:
		var blind: bool = (a["blind_eye"] == "l" and side < 0.0) or (a["blind_eye"] == "r" and side > 0.0)
		var eye := _box(Vector3(0.06, 0.06, 0.04),
			Vector3(side * 0.07, 0.26, -0.115), Color(0.05, 0.05, 0.05) if blind else Color(0.9, 0.9, 0.85))
		p.neck.add_child(eye)
	if float(a["hat"].a) > 0.01:
		p._hat = _box(Vector3(0.34, 0.13, 0.33), Vector3(0, 0.38, 0), a["hat"])
		p.neck.add_child(p._hat)

	# --- Backpack (rides the chest depth so it sits ON the back at any build) ----
	if a["backpack"]:
		p._pack = _box(Vector3(0.34, 0.5, 0.22), Vector3(0, 1.22, chest.z * 0.5 + 0.10), Color(0.28, 0.24, 0.18))
		p.add_child(p._pack)

	# --- Legs (RIG V2: hip → THIGH → knee → CALF → foot; the hip pivot still swings
	# the whole limb, so every old animation drives it unchanged — the alias law).
	# Cross-sections STEP DOWN segment to segment and each lower box insets 0.02 from
	# its joint, so no two faces ever sit coplanar (the crouch-shimmer no-kiss law).
	p.legs_pivot = Node3D.new()
	p.add_child(p.legs_pivot)
	# --- PELVIS / HIPS: the third torso piece, child of legs_pivot so it yaws with
	# the walk. Hip BALL joints live inside it. Column: hip 0.90 → knee 0.48 →
	# ankle 0.10 → sole 0 (legs ≈ half the body, per the reference).
	p._pelvis = _box(Vector3(0.36 * wm, 0.16, 0.22 * dm), Vector3(0, 0.92, 0), pants)
	p.legs_pivot.add_child(p._pelvis)
	var hip_x: float = 0.11 * wm
	var thigh_size := Vector3(0.15 * lm, 0.42, 0.17 * lm)
	var calf_size := Vector3(0.125 * lm, 0.38, 0.145 * lm)
	p.hip_l = _limb_pivot(Vector3(-hip_x, 0.90, 0), thigh_size, pants)
	p.hip_r = _limb_pivot(Vector3(hip_x, 0.90, 0), thigh_size, pants)
	p.legs_pivot.add_child(p.hip_l)
	p.legs_pivot.add_child(p.hip_r)
	p.knee_l = _joint_under(p.hip_l, Vector3(0, -0.42, 0))
	p.knee_r = _joint_under(p.hip_r, Vector3(0, -0.42, 0))
	var boot := Color(pants.r * 0.6, pants.g * 0.6, pants.b * 0.6)
	for kn in [p.knee_l, p.knee_r]:
		kn.add_child(_box(calf_size, Vector3(0, -0.19, 0), pants))
	# ANKLE HINGE + FOOT: a low block, toe forward, sole ON the ground; the ankle
	# connector cube (below) doubles as the reference's raised ankle riser.
	p.foot_l = _joint_under(p.knee_l, Vector3(0, -0.38, 0))
	p.foot_r = _joint_under(p.knee_r, Vector3(0, -0.38, 0))
	for ft in [p.foot_l, p.foot_r]:
		ft.add_child(_box(Vector3(0.125 * lm, 0.10, 0.27), Vector3(0, -0.05, -0.055), boot))
	# CROUCH no-kiss fix: the THIGH box is _limb_pivot's sole mesh child — grab it so
	# the animator can nudge its local Y by hip_joint_gap (same law as before).
	p._hip_box_rest_y = -thigh_size.y * 0.5
	p._hip_l_box = p.hip_l.get_child(0) as MeshInstance3D
	p._hip_r_box = p.hip_r.get_child(0) as MeshInstance3D

	# --- ARMS: both sides are THE SAME three pieces (owner: "bicep, forearm and
	# hand — like the left side"), hanging STRAIGHT from ball shoulders. Only the
	# JOB differs: the aim side yaws to the gaze, the free side counter-swings /
	# fore-grips. The aim is a ROTATION in animate() — never baked into geometry.
	p._sh_x = chest.x * 0.5 + 0.045 # arm tucks against the chest edge at any build
	var upper_size := Vector3(0.11 * lm, 0.30, 0.11 * lm)
	var fore_size := Vector3(0.095 * lm, 0.26, 0.095 * lm)

	# FREE ARM (the off hand): shoulder BALL → elbow HINGE → wrist BALL → fingers.
	p.free_arm = _limb_pivot(Vector3(-p._sh_x * right, 1.40, 0), upper_size, cloth)
	p.add_child(p.free_arm)
	p.elbow_l = _joint_under(p.free_arm, Vector3(0, -FREE_UPPER_LEN, 0))
	p.elbow_l.add_child(_box(fore_size, Vector3(0, -0.13, 0), cloth))
	p.hand_l = _joint_under(p.elbow_l, Vector3(0, -FREE_FORE_LEN, 0))
	p.fingers_l = _build_hand(p.hand_l, skin)

	# AIM ARM (the gun side): aim_arm = the YAW pivot at body center (a full-turn
	# aim stays symmetric); shoulder = the REAL ball joint the arm hangs from.
	p.aim_arm = Node3D.new()
	p.add_child(p.aim_arm)
	p.shoulder = Node3D.new()
	p.shoulder.position = Vector3(p._sh_x * right, 1.40, 0)
	p.aim_arm.add_child(p.shoulder)
	p.shoulder.add_child(_box(upper_size, Vector3(0, -0.15, 0), cloth))
	p.elbow_r = Node3D.new()
	p.elbow_r.position = Vector3(0, -FREE_UPPER_LEN, 0)
	p.shoulder.add_child(p.elbow_r)
	p.elbow_r.add_child(_box(fore_size, Vector3(0, -0.13, 0), cloth))
	p.hand = Node3D.new()
	p.hand.position = Vector3(0, -FREE_FORE_LEN, 0) # the WRIST ball; net rest = straight down
	p._gun_rest = p.hand.position
	p.elbow_r.add_child(p.hand)
	p.fingers_r = _build_hand(p.hand, skin)
	# The held-weapon node is a CONTAINER (weapons-as-data): its box children are
	# rebuilt per weapon from a SHAPE spec. The node ORIGIN stays the grip point
	# (grip_r seats it, recoil tweens it, the muzzle reads _muzzle_z forward), so
	# all the existing hold/aim math is weapon-agnostic.
	p.gun = Node3D.new()
	p.gun.visible = false
	p.hand.add_child(p.gun)
	p._build_weapon_mesh(DEFAULT_WEAPON_PARTS) # a plain stub until a weapon sets its shape

	# --- JOINT CONNECTORS (owner 2026-07-08: "everything should be connected
	# through a SQUARE — every joint"). A small box centered at each pivot bridges
	# its two segments, so a bent elbow/knee/shoulder reads as one connected limb
	# instead of two boxes gapping apart. Centered ON the pivot, so no rotation
	# ever opens the seam. Added LAST so earlier get_child(0) segment grabs hold.
	# Sized to MATCH the thinner adjacent segment, never exceed it — from the game's
	# steep top-down the old oversized cubes protruded and read as lumps (playtest).
	_joint_ball(p.shoulder, 0.125 * lm, cloth)  # shoulder balls / deltoids
	_joint_ball(p.free_arm, 0.125 * lm, cloth)
	_joint_ball(p.elbow_r, 0.10 * lm, cloth)    # elbow hinges
	_joint_ball(p.elbow_l, 0.10 * lm, cloth)
	_joint_ball(p.hand, 0.085, skin)            # wrist balls
	_joint_ball(p.hand_l, 0.085, skin)
	_joint_ball(p.hip_l, 0.155 * lm, pants)     # hip balls
	_joint_ball(p.hip_r, 0.155 * lm, pants)
	_joint_ball(p.knee_l, 0.13 * lm, pants)     # knee hinges
	_joint_ball(p.knee_r, 0.13 * lm, pants)
	_joint_ball(p.foot_l, 0.105 * lm, boot)     # ankle hinges (the riser blocks)
	_joint_ball(p.foot_r, 0.105 * lm, boot)
	return p


## A HAND that OPENS AND CLOSES (the reference's grip mitt): a PALM box at the
## wrist and a FINGERS block hinged at the knuckle line, palm-front (-Z, where a
## weapon grip sits). fingers.rotation.x 0 = open flat; +GRIP_CURL = curled shut.
## Returns the fingers hinge node; the palm rides the wrist directly.
static func _build_hand(wrist: Node3D, skin: Color) -> Node3D:
	wrist.add_child(_box(Vector3(0.075, 0.09, 0.055), Vector3(0, -0.045, 0), skin))
	var fingers := Node3D.new()
	fingers.position = Vector3(0, -0.09, -0.02) # the knuckle line
	wrist.add_child(fingers)
	fingers.add_child(_box(Vector3(0.07, 0.075, 0.05), Vector3(0, -0.035, 0), skin))
	return fingers


## A JOINT CONNECTOR: a cube centered on a pivot so its two segments read as
## joined however the joint bends (owner 2026-07-08). Kept a hair bigger than the
## thinner segment so the seam is always covered.
static func _joint_ball(joint: Node3D, size: float, color: Color) -> void:
	if joint != null:
		joint.add_child(_box(Vector3(size, size, size), Vector3.ZERO, color))


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

	# FREE ARM — natural gait law: each arm counter-swings OPPOSITE its own side's
	# leg (left arm back when the left leg strides forward). Unless a punch tween
	# owns it (the off-hand jab) or a two-hand grip has it on the fore-grip.
	var ef: float = float(mg["elbow_follow"])
	var er: float = float(mg["elbow_rest"])
	if _swing_t <= 0.0:
		if _two_handed and raised and armed and gun.visible:
			if _grip_l.is_zero_approx():
				# Legacy posed fore-grip (no grip row): the free arm comes UP AND
				# ACROSS to the barrel — raise forward (+), elbow closing in.
				free_arm.rotation.x = lerpf(free_arm.rotation.x, 1.05, clampf(10.0 * delta, 0.0, 1.0))
				elbow_l.rotation.x = lerpf(elbow_l.rotation.x, 0.42, clampf(10.0 * delta, 0.0, 1.0))
				free_arm.rotation.y = move_toward(free_arm.rotation.y, 0.0, 6.0 * delta)
				free_arm.rotation.z = move_toward(free_arm.rotation.z, 0.0, 6.0 * delta)
			else:
				# RIG V2 PHASE 2: the free hand PLANTS on the weapon's grip point —
				# closed-form 2-bone IK, tracking the live aim chain every frame.
				_solve_foregrip_ik(delta)
		else:
			# The free arm is the LEFT arm when right-handed — oppose the LEFT leg.
			var free_own: float = swing_l if handed_sign > 0.0 else swing_r
			free_arm.rotation.x = -free_own * float(mg["arm_swing"])
			# The elbow bends INTO a forward carry (+, a hinge only folds one way).
			elbow_l.rotation.x = er + ef * maxf(0.0, free_arm.rotation.x)
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
		# HOLD: RAISE the hanging arm to the level iron. RELAXED: hang + counter-
		# swing opposite THIS side's leg (the gun arm is the right when right-handed).
		var gun_own: float = swing_r if handed_sign > 0.0 else swing_l
		var pose_target := (AIM_RAISE + sin(_t * 2.0) * 0.02 + wobble) if hold else ARM_HANG - gun_own * 0.55
		# One smoothed write: raise/lower transitions blend and the post-swing
		# hand-off can't pop (the lerp eats the mismatch in a few frames).
		shoulder.rotation.x = lerpf(shoulder.rotation.x, pose_target, clampf(12.0 * delta, 0.0, 1.0))
		shoulder.rotation.y = move_toward(shoulder.rotation.y, 0.0, 8.0 * delta)
		# A RAISED GUN: the elbow finishes the lift so the FOREARM lies HORIZONTAL
		# in line with the barrel; the WRIST counter-rotates the whole chain so the
		# gun stays level and the muzzle keeps aim. Carried low, the wrist rolls
		# the tool along the leg (HAND_CARRY).
		hand.rotation.x = lerpf(hand.rotation.x, -(AIM_RAISE + AIM_ELBOW) if hold else HAND_CARRY, clampf(10.0 * delta, 0.0, 1.0))
		var elbow_target := AIM_ELBOW if hold else er + ef * maxf(0.0, shoulder.rotation.x) * 0.6
		elbow_r.rotation.x = lerpf(elbow_r.rotation.x, elbow_target, clampf(10.0 * delta, 0.0, 1.0))

	# THE HANDS (owner: "the opening and closing of the hands"): fingers curl shut
	# around a held weapon, relax half-open otherwise; a melee tween owns them
	# (punch/swing set fists directly). Same gate as the arms — no ownership fight.
	if _swing_t <= 0.0 and fingers_r != null and fingers_l != null:
		var grip_r_t: float = 1.0 if (armed and gun.visible) else GRIP_RELAX
		var grip_l_t: float = 1.0 if (_two_handed and raised and armed and gun.visible) else GRIP_RELAX
		fingers_r.rotation.x = lerpf(fingers_r.rotation.x, GRIP_CURL * grip_r_t, clampf(8.0 * delta, 0.0, 1.0))
		fingers_l.rotation.x = lerpf(fingers_l.rotation.x, GRIP_CURL * grip_l_t, clampf(8.0 * delta, 0.0, 1.0))

	# BREATHING + step BOB: idle = slow chest rise; moving = a small vertical lilt.
	# A crouch SINKS the whole column (torso + head ride down together).
	var breath := sin(_t * 1.8) * (float(mg["breath_amp"]) if not moving else 0.0)
	var step_bob := absf(sin(_phase)) * amp * float(mg["step_bob"])
	var drop: float = float(mg["crouch_drop"]) * _crouch
	# The whole SPINE COLUMN rides together off the rests captured at create() —
	# never hardcoded heights (the old 1.05/1.44 literals fought rebuilt geometry).
	# The waist sinks a touch less (0.9) so its box stays tucked DEEP into the
	# compressing chest; the neck sinks more (1.3) so the head tucks low — both
	# keep every piece out of the no-kiss shimmer band at any crouch depth.
	torso.position.y = _chest_rest_y + breath + step_bob - drop
	waist.position.y = _waist_rest_y + (breath + step_bob) * 0.6 - drop * 0.9
	neck.position.y = _neck_rest_y + breath + step_bob - drop * 1.3
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
	# The WAIST carries roughly half the chest's lean/twist — the lower-spine
	# swivel makes the midriff a spine segment, not a rigid plank under the chest.
	waist.rotation.z = _lean * 0.5
	waist.rotation.y = _twist * 0.45
	waist.rotation.x = (speed * 0.02 + _slump) * 0.5 + 0.2 * _crouch
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
	# Thighs FORWARD onto the seat (+, the sign law), calves folded back down.
	hip_l.rotation.x = lerpf(hip_l.rotation.x, 1.15, k)
	hip_r.rotation.x = lerpf(hip_r.rotation.x, 1.15, k)
	knee_l.rotation.x = lerpf(knee_l.rotation.x, 1.35, k)
	knee_r.rotation.x = lerpf(knee_r.rotation.x, 1.35, k)
	foot_l.rotation.x = lerpf(foot_l.rotation.x, -0.15, k)
	foot_r.rotation.x = lerpf(foot_r.rotation.x, -0.15, k)
	torso.rotation.x = lerpf(torso.rotation.x, 0.30, k) # leaned into the bars
	torso.rotation.z = lerpf(torso.rotation.z, 0.0, k)
	waist.rotation.x = lerpf(waist.rotation.x, 0.15, k)
	neck.rotation.x = lerpf(neck.rotation.x, -0.22, k)  # eyes up the road
	free_arm.rotation.x = lerpf(free_arm.rotation.x, 0.85, k) # reach FORWARD to the bar
	free_arm.rotation.y = move_toward(free_arm.rotation.y, 0.0, 6.0 * delta)
	free_arm.rotation.z = move_toward(free_arm.rotation.z, 0.0, 6.0 * delta)
	elbow_l.rotation.x = lerpf(elbow_l.rotation.x, 0.35, k)
	if fingers_l != null:
		fingers_l.rotation.x = lerpf(fingers_l.rotation.x, GRIP_CURL, k) # gripping the bar
	if armed_aim:
		shoulder.rotation.x = lerpf(shoulder.rotation.x, AIM_RAISE, k) # level iron from the saddle
		elbow_r.rotation.x = lerpf(elbow_r.rotation.x, AIM_ELBOW, k)
		hand.rotation.x = lerpf(hand.rotation.x, -(AIM_RAISE + AIM_ELBOW), k)
	else:
		shoulder.rotation.y = move_toward(shoulder.rotation.y, 0.0, 6.0 * delta)
		shoulder.rotation.x = lerpf(shoulder.rotation.x, 0.85, k) # the other bar
		elbow_r.rotation.x = lerpf(elbow_r.rotation.x, 0.35, k)
		hand.rotation.x = lerpf(hand.rotation.x, HAND_CARRY, k)
		if fingers_r != null:
			fingers_r.rotation.x = lerpf(fingers_r.rotation.x, GRIP_CURL, k)


## A body that has fallen: the whole COLUMN collapses (chest, waist, pelvis all
## sink), limbs sprawl with bent joints, the hands fall OPEN. Blended in ~0.3s.
func _pose_dead() -> void:
	var b := _dead_blend
	torso.rotation.x = lerp(torso.rotation.x, -1.3, b)
	torso.position.y = lerp(torso.position.y, 0.35, b)
	waist.rotation.x = lerp(waist.rotation.x, -0.55, b)
	waist.position.y = lerp(waist.position.y, 0.55, b)
	legs_pivot.position.y = lerp(legs_pivot.position.y, -0.30, b) # pelvis+hips to the dirt
	neck.rotation.x = lerp(neck.rotation.x, -0.6, b)
	hip_l.rotation.x = lerp(hip_l.rotation.x, -0.5, b)
	hip_r.rotation.x = lerp(hip_r.rotation.x, 0.4, b)
	free_arm.rotation.x = lerp(free_arm.rotation.x, 1.1, b)
	shoulder.rotation.x = lerp(shoulder.rotation.x, 1.1, b) # arm flung overhead in the sprawl
	shoulder.rotation.y = lerp(shoulder.rotation.y, 0.0, b)
	# The sprawl bends real knees and elbows — a body, not a plank. Elbows are
	# hinges: they only fold FORWARD (+, the sign law).
	knee_l.rotation.x = lerp(knee_l.rotation.x, 0.8, b)
	knee_r.rotation.x = lerp(knee_r.rotation.x, 0.3, b)
	elbow_l.rotation.x = lerp(elbow_l.rotation.x, 0.5, b)
	elbow_r.rotation.x = lerp(elbow_r.rotation.x, 0.35, b)
	# Dead hands fall OPEN — the grip lets go of the world.
	if fingers_r != null:
		fingers_r.rotation.x = lerp(fingers_r.rotation.x, 0.08, b)
	if fingers_l != null:
		fingers_l.rotation.x = lerp(fingers_l.rotation.x, 0.08, b)


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
		free_arm.position.x = -_sh_x * handed_sign # home = the build-scaled shoulder


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
	if fingers_r != null:
		fingers_r.rotation.x = GRIP_CURL # knuckles white on the handle for the swing
	var tw := create_tween()
	tw.set_parallel(true)
	# WINDUP: a short coil back to the weapon side (negative yaw = the gun side),
	# the arm RAISED forward-up ready to chop (sign law: + = forward).
	tw.tween_property(shoulder, "rotation:y", -float(m["windup_yaw"]) * hs, windup_s).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(shoulder, "rotation:x", AIM_RAISE * 0.7 + float(m["windup_lift"]), windup_s).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(gun, "rotation:y", twist * hs, windup_s).set_ease(Tween.EASE_OUT)
	# THE SLASH: whip across the hit arc with a downward bite through the target.
	tw.chain().tween_property(shoulder, "rotation:y", float(m["slash_yaw"]) * hs, slash_s).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(shoulder, "rotation:x", AIM_RAISE * 0.7 - float(m["slash_dip"]), slash_s).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(gun, "rotation:y", -twist * hs, slash_s).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	# SETTLE: quick, everything home; animate()'s smoothed write takes over after
	tw.chain().tween_property(shoulder, "rotation:y", 0.0, settle_s).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)
	tw.parallel().tween_property(shoulder, "rotation:x", AIM_RAISE if raised else ARM_HANG, settle_s).set_ease(Tween.EASE_IN_OUT)
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
	# FISTS UP: both hands ball for the exchange (the reference's closing grip).
	if fingers_r != null:
		fingers_r.rotation.x = GRIP_CURL
	if fingers_l != null:
		fingers_l.rotation.x = GRIP_CURL
	var tw := create_tween()
	# The jab snaps FORWARD (+, the sign law) and returns to the hang.
	tw.tween_property(jab_arm, "rotation:x", float(m["punch_reach"]), out_s).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(jab_arm, "rotation:x", ARM_HANG, back_s).set_ease(Tween.EASE_IN_OUT)


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
	# The leg snaps FORWARD-horizontal (+, the sign law); the torso leans AWAY (-).
	tw.tween_property(hip_r, "rotation:x", float(m["kick_height"]), out_s).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
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


## World-space muzzle tip — rounds LEAVE THE GUN barrel. The tip distance is the
## weapon's own (a long shotgun reaches further than a pistol), set with the shape.
func muzzle_world() -> Vector3:
	if gun and gun.visible:
		return gun.global_position - gun.global_basis.z * _muzzle_z
	return global_position + Vector3(0, 1.2, 0)


## THE WEAPON SHAPE (weapons-as-data 2026-07-08): rebuild the held mesh from a
## list of box PARTS so every weapon looks like its counterpart. Each part is a
## row {size, pos, color, rot?} in gun-local space: -Z is the muzzle/blade
## forward, +Y up, origin = the grip. muzzle_z is where the barrel tip sits.
## Called when the weapon changes (proto3d._apply_hand_pose). Empty = the stub.
func set_weapon_mesh(parts: Array, muzzle_z: float = 0.34) -> void:
	_muzzle_z = maxf(0.05, muzzle_z)
	_build_weapon_mesh(parts if not parts.is_empty() else DEFAULT_WEAPON_PARTS)


func _build_weapon_mesh(parts: Array) -> void:
	if gun == null:
		return
	for c in gun.get_children():
		gun.remove_child(c) # immediate detach so a re-read sees only the new parts
		c.queue_free()
	for part in parts:
		var box := _box(part.get("size", Vector3(0.06, 0.06, 0.3)),
			part.get("pos", Vector3.ZERO), part.get("color", Color(0.16, 0.16, 0.18)))
		var r: Vector3 = part.get("rot", Vector3.ZERO)
		if r != Vector3.ZERO:
			box.rotation = r
		gun.add_child(box)
