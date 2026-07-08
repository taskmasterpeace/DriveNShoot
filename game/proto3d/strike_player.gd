## POSE-TO-POSE STRIKES (docs/design/POSE_TO_POSE_STRIKES.md): a strike stops being
## math and becomes DATA — an ordered list of hand-authored key poses code snaps/eases
## through on a clock. This node is the PLAYER half: it owns no puppet internals beyond
## joint NAMES (torso_twist/torso_lean/shoulder_yaw/shoulder_pitch/hip_kick) and drives
## whatever Node3D refs it's handed via setup(). puppet.gd/weapon.gd's wiring (which
## joints a strike is allowed to fight for ownership of, and the contact->damage
## callback) is a LATER pass on a clean tree — see the WIRING NOTE at the bottom.
##
## Deterministic timing: driven entirely by _process(delta), no Tween (a Tween free-
## runs off the scene tree's own clock regardless of who's stepping it, which would
## wreck a headless sim's ability to pin "±20% of the row's summed ms" — hand-rolled
## easing keeps the whole player advanceable one manual delta at a time).
class_name ProtoStrikePlayer
extends Node

signal pose_reached(index: int)
signal contact()
signal finished()

## Ease curve ids a pose row may name (spec: never `linear` INTO a contact pose —
## that's the floaty bug being fixed; enforced by content discipline, not code).
const EASE_OUT: String = "out"
const EASE_IN: String = "in"
const EASE_IN_OUT: String = "in_out"
const EASE_LINEAR: String = "linear"

## The ONLY place a joint NAME resolves to a (property) pair. Two names may point at
## the SAME injected node (torso_twist = its Y, torso_lean = its X) — that's fine and
## expected; the player never needs to know they share a node, only that the caller's
## setup() dict has an entry under each name it's handed a pose that uses.
const JOINT_AXIS: Dictionary = {
	"torso_twist": "rotation:y",
	"torso_lean": "rotation:x",
	"shoulder_yaw": "rotation:y",
	"shoulder_pitch": "rotation:x",
	"hip_kick": "rotation:x",
	# RIG V2 (PUPPET_RIG_V2.md): the new hinges are authorable — a katana swing can
	# whip the elbow, a kick can snap the knee. Old rows keep playing untouched.
	"elbow_r": "rotation:x",
	"elbow_l": "rotation:x",
	"knee_r": "rotation:x",
	"knee_l": "rotation:x",
	# FULL-BODY POSING (owner 2026-07-08: "manipulate the arms... the joints aren't
	# all there"). Append-only — existing rows never named these, so they default to
	# rest and every shipped strike plays byte-identical. Now the whole body is
	# authorable/draggable: head, the FREE (off) shoulder, both wrists, both ankles,
	# and the left hip as its own joint (hip_kick stays the RIGHT hip for back-compat).
	"head_yaw": "rotation:y",
	"head_pitch": "rotation:x",
	"free_shoulder_yaw": "rotation:y",
	"free_shoulder_pitch": "rotation:x",
	"wrist_r": "rotation:x",
	"wrist_l": "rotation:x",
	"ankle_r": "rotation:x",
	"ankle_l": "rotation:x",
	"hip_l_pitch": "rotation:x",
	# THE MANNEQUIN SET (owner 2026-07-08, the reference image): the lower-spine
	# swivel (waist) and the knuckle hinges (the hands open and close). Append-only,
	# as ever — old rows never named these, so they hold rest.
	"waist_twist": "rotation:y",
	"waist_lean": "rotation:x",
	"fingers_r": "rotation:x",
	"fingers_l": "rotation:x",
}
const JOINT_NAMES: Array = ["torso_twist", "torso_lean", "shoulder_yaw", "shoulder_pitch", "hip_kick",
	"elbow_r", "elbow_l", "knee_r", "knee_l",
	"head_yaw", "head_pitch", "free_shoulder_yaw", "free_shoulder_pitch",
	"wrist_r", "wrist_l", "ankle_r", "ankle_l", "hip_l_pitch",
	"waist_twist", "waist_lean", "fingers_r", "fingers_l"]

## Code-floor seed rows (mirrors data/strikes.json day one exactly — the fold below
## overlays any JSON edit on top, same additive law as ProtoPuppet.MOTION/motions.json).
## Kept here too (not just JSON) so a missing/corrupt strikes.json still yields a
## playable stock set, matching the "code is floor, JSON overlays" house rule.
static var STRIKES: Dictionary = {
	"punch_1": {
		"poses": [
			{"name": "anticipation", "joints": {"torso_twist": -0.15, "shoulder_pitch": -0.35, "elbow_r": 0.9}, "ease_ms": 60.0, "hold_ms": 20.0, "ease_curve": "out", "contact": false},
			{"name": "contact", "joints": {"torso_twist": 0.14, "shoulder_pitch": 1.5, "elbow_r": 0.12}, "ease_ms": 50.0, "hold_ms": 40.0, "ease_curve": "out", "contact": true},
			{"name": "recovery", "joints": {"torso_twist": 0.0, "shoulder_pitch": 0.0, "elbow_r": 0.14}, "ease_ms": 120.0, "hold_ms": 0.0, "ease_curve": "in_out", "contact": false},
		],
		"req_skill": {"id": "", "level": 0}, "cancel_window_ms": 250.0, "chain_next": "punch_2",
	},
	"punch_2": {
		"poses": [
			{"name": "anticipation", "joints": {"torso_twist": 0.16, "free_shoulder_pitch": -0.35, "elbow_l": 0.9}, "ease_ms": 60.0, "hold_ms": 20.0, "ease_curve": "out", "contact": false},
			{"name": "contact", "joints": {"torso_twist": -0.14, "free_shoulder_pitch": 1.5, "elbow_l": 0.12}, "ease_ms": 50.0, "hold_ms": 40.0, "ease_curve": "out", "contact": true},
			{"name": "recovery", "joints": {"torso_twist": 0.0, "free_shoulder_pitch": 0.0, "elbow_l": 0.14}, "ease_ms": 120.0, "hold_ms": 0.0, "ease_curve": "in_out", "contact": false},
		],
		"req_skill": {"id": "", "level": 0}, "cancel_window_ms": 250.0, "chain_next": "punch_3",
	},
	"punch_3": {
		"poses": [
			{"name": "anticipation", "joints": {"torso_twist": -0.22, "torso_lean": -0.08, "shoulder_pitch": -0.5, "elbow_r": 1.0}, "ease_ms": 80.0, "hold_ms": 30.0, "ease_curve": "out", "contact": false},
			{"name": "contact", "joints": {"torso_twist": 0.18, "torso_lean": 0.12, "shoulder_pitch": 1.62, "elbow_r": 0.08}, "ease_ms": 60.0, "hold_ms": 55.0, "ease_curve": "out", "contact": true},
			{"name": "recovery", "joints": {"torso_twist": 0.0, "torso_lean": 0.0, "shoulder_pitch": 0.0, "elbow_r": 0.14}, "ease_ms": 150.0, "hold_ms": 0.0, "ease_curve": "in_out", "contact": false},
		],
		"req_skill": {"id": "", "level": 0}, "cancel_window_ms": 250.0, "chain_next": "",
	},
	"kick": {
		"poses": [
			{"name": "anticipation", "joints": {"torso_lean": 0.1, "hip_kick": -0.35, "knee_r": 0.9}, "ease_ms": 70.0, "hold_ms": 25.0, "ease_curve": "out", "contact": false},
			{"name": "contact", "joints": {"torso_lean": -0.25, "hip_kick": 1.45, "knee_r": 0.1}, "ease_ms": 70.0, "hold_ms": 50.0, "ease_curve": "out", "contact": true},
			{"name": "recovery", "joints": {"torso_lean": 0.0, "hip_kick": 0.0, "knee_r": 0.06}, "ease_ms": 180.0, "hold_ms": 0.0, "ease_curve": "in_out", "contact": false},
		],
		"req_skill": {"id": "martial_arts", "level": 2}, "cancel_window_ms": 250.0, "chain_next": "",
	},
	"shove": {
		"poses": [
			{"name": "anticipation", "joints": {"torso_lean": -0.1, "shoulder_pitch": 0.35, "free_shoulder_pitch": 0.35, "elbow_r": 0.85, "elbow_l": 0.85}, "ease_ms": 70.0, "hold_ms": 15.0, "ease_curve": "out", "contact": false},
			{"name": "contact", "joints": {"torso_lean": 0.18, "shoulder_pitch": 1.25, "free_shoulder_pitch": 1.25, "elbow_r": 0.15, "elbow_l": 0.15}, "ease_ms": 60.0, "hold_ms": 35.0, "ease_curve": "out", "contact": true},
			{"name": "recovery", "joints": {"torso_lean": 0.0, "shoulder_pitch": 0.0, "free_shoulder_pitch": 0.0, "elbow_r": 0.14, "elbow_l": 0.14}, "ease_ms": 140.0, "hold_ms": 0.0, "ease_curve": "in_out", "contact": false},
		],
		"req_skill": {"id": "", "level": 0}, "cancel_window_ms": 200.0, "chain_next": "",
	},
	"weapon_swing": {
		"poses": [
			{"name": "windup", "joints": {"shoulder_yaw": -0.7, "shoulder_pitch": 1.1}, "ease_ms": 60.0, "hold_ms": 0.0, "ease_curve": "out", "contact": false},
			{"name": "contact", "joints": {"shoulder_yaw": 0.85, "shoulder_pitch": 0.7}, "ease_ms": 100.0, "hold_ms": 30.0, "ease_curve": "out", "contact": true},
			{"name": "overswing", "joints": {"shoulder_yaw": 1.05, "shoulder_pitch": 0.55}, "ease_ms": 40.0, "hold_ms": 20.0, "ease_curve": "out", "contact": false},
			{"name": "settle", "joints": {"shoulder_yaw": 0.0, "shoulder_pitch": 0.0}, "ease_ms": 120.0, "hold_ms": 0.0, "ease_curve": "in_out", "contact": false},
		],
		"req_skill": {"id": "", "level": 0}, "cancel_window_ms": 0.0, "chain_next": "",
	},
	"bat_swing": {
		"poses": [
			{"name": "load", "joints": {"torso_twist": -0.55, "waist_twist": -0.3, "shoulder_yaw": -0.9, "shoulder_pitch": 0.9, "elbow_r": 0.5, "wrist_r": -0.3, "free_shoulder_yaw": -0.5, "free_shoulder_pitch": 0.75, "elbow_l": 0.95, "head_yaw": 0.5, "knee_r": 0.18, "fingers_r": 1.35, "fingers_l": 1.35}, "ease_ms": 110.0, "hold_ms": 45.0, "ease_curve": "out", "contact": false},
			{"name": "contact", "joints": {"torso_twist": 0.6, "waist_twist": 0.35, "shoulder_yaw": 0.55, "shoulder_pitch": 1.15, "elbow_r": 0.1, "wrist_r": 0.0, "free_shoulder_yaw": 0.3, "free_shoulder_pitch": 1.05, "elbow_l": 0.2, "head_yaw": 0.0, "knee_r": 0.06}, "ease_ms": 80.0, "hold_ms": 30.0, "ease_curve": "out", "contact": true},
			{"name": "follow_through", "joints": {"torso_twist": 0.95, "shoulder_yaw": 1.15, "shoulder_pitch": 1.3, "wrist_r": -0.4, "free_shoulder_pitch": 0.85}, "ease_ms": 70.0, "hold_ms": 25.0, "ease_curve": "out", "contact": false},
			{"name": "settle", "joints": {"torso_twist": 0.0, "waist_twist": 0.0, "shoulder_yaw": 0.0, "shoulder_pitch": 0.0, "elbow_r": 0.14, "wrist_r": 0.0, "free_shoulder_yaw": 0.0, "free_shoulder_pitch": 0.0, "elbow_l": 0.14, "head_yaw": 0.0, "knee_r": 0.06, "fingers_r": 0.22, "fingers_l": 0.22}, "ease_ms": 160.0, "hold_ms": 0.0, "ease_curve": "in_out", "contact": false},
		],
		"req_skill": {"id": "", "level": 0}, "cancel_window_ms": 200.0, "chain_next": "",
	},
}


static var _folded: bool = false


## Additive fold (same law as ProtoPuppet.fold_motion_file/ProtoLootResolver._ensure):
## data/strikes.json overrides STRIKES row-by-row, field-by-field; unknown ids welcome.
static func ensure_strikes() -> void:
	if _folded:
		return
	_folded = true
	fold_strikes_file(STRIKES)


static func fold_strikes_file(into: Dictionary, path: String = "res://data/strikes.json") -> void:
	if not FileAccess.file_exists(path):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		return
	var rows: Dictionary = (parsed as Dictionary).get("strikes", {})
	for id in rows:
		var row_v: Variant = rows[id]
		if not (row_v is Dictionary):
			continue
		var row: Dictionary = row_v as Dictionary
		var sid := String(id)
		if not into.has(sid):
			into[sid] = {}
		var dest: Dictionary = into[sid]
		if row.has("poses") and row["poses"] is Array:
			dest["poses"] = (row["poses"] as Array).duplicate(true)
		if row.has("req_skill") and row["req_skill"] is Dictionary:
			dest["req_skill"] = (row["req_skill"] as Dictionary).duplicate(true)
		if row.has("cancel_window_ms"):
			dest["cancel_window_ms"] = float(row["cancel_window_ms"])
		if row.has("chain_next"):
			dest["chain_next"] = String(row["chain_next"])


## --- Injection (setup) -------------------------------------------------------

## joints_in: {joint_name(String) -> Node3D}. A strike row may reference any of
## JOINT_NAMES; the player only ever touches nodes it was explicitly handed — a row
## naming a joint absent from this dict is a data error (skipped, pushes a warning),
## never a hardcoded reach into puppet internals.
var _joints: Dictionary = {}
## The REST value for every injected joint's axis, captured at setup() time (or
## refreshed via rebind_rest()) — pose 1's omitted joints hold this, and the final
## recovery pose is expected to already match it (spec: "on strike end ... ownership
## returns with no pop" is the CALLER's job to author; this player just plays what
## the row says and never assumes rest is zero).
var _rest: Dictionary = {}
## Optional: Callable(skill_id: String) -> int. Missing -> gate always passes (id "").
var _skill_level: Callable = Callable()

var _playing: bool = false
var strike_id: String = ""
var _poses: Array = []
var _pose_index: int = -1          ## last pose FULLY reached (pose_reached already fired)
var _seg_t: float = 0.0            ## elapsed ms into the CURRENT segment (ease, then hold)
var _seg_ease_ms: float = 0.0
var _seg_hold_ms: float = 0.0
var _seg_curve: String = EASE_OUT
var _seg_from: Dictionary = {}     ## joint_name -> float, the value this segment eases FROM
var _seg_to: Dictionary = {}       ## joint_name -> float, the value this segment eases TO (full pose after partial-fill)
var _contact_fired: bool = false
var _seg_snapped: bool = false     ## has THIS segment's pose_reached/contact already fired?
var _current_pose_values: Dictionary = {} ## joint_name -> float, the running "where are we now" (partial-filled across poses)


func _init() -> void:
	ensure_strikes()


## joints_in: {String -> Node3D}. skill_check: Callable(String)->int or an empty
## Callable (gate always passes). Captures each joint's CURRENT axis value as rest.
func setup(joints_in: Dictionary, skill_check: Callable = Callable()) -> void:
	_joints = joints_in.duplicate()
	_skill_level = skill_check
	rebind_rest()


## Re-captures rest from the live joints (call if the rig's idle pose can drift,
## e.g. mid-stride) — cheap, safe to call before every play().
func rebind_rest() -> void:
	_rest.clear()
	for jn in _joints:
		var node: Variant = _joints[jn]
		if node is Node3D and JOINT_AXIS.has(jn):
			_rest[jn] = _axis_value(node as Node3D, String(JOINT_AXIS[jn]))


func _axis_value(node: Node3D, prop: String) -> float:
	if prop == "rotation:y":
		return node.rotation.y
	return node.rotation.x # every JOINT_AXIS entry is rotation:x or rotation:y today


func _set_axis_value(node: Node3D, prop: String, v: float) -> void:
	if prop == "rotation:y":
		node.rotation.y = v
	else:
		node.rotation.x = v


## Is a row known, and (if gated) does the injected skill callable clear its bar?
## Exposed so a caller (weapon.gd, later) can decide fallback behavior on refusal —
## this class never silently substitutes another row.
func can_play(id: String) -> bool:
	if not STRIKES.has(id):
		return false
	var row: Dictionary = STRIKES[id]
	var gate: Dictionary = row.get("req_skill", {"id": "", "level": 0})
	var skill_id := String(gate.get("id", ""))
	if skill_id == "":
		return true
	var need := int(gate.get("level", 0))
	var have := 0
	if _skill_level.is_valid():
		have = int(_skill_level.call(skill_id))
	return have >= need


func is_playing() -> bool:
	return _playing


## Starts strike_id if known + unlocked. Returns true if it started. Re-checks the
## skill gate at THIS call (spec: never cached from combo start).
func play(id: String) -> bool:
	if not can_play(id):
		return false
	var row: Dictionary = STRIKES[id]
	var poses: Variant = row.get("poses", [])
	if not (poses is Array) or (poses as Array).is_empty():
		return false
	strike_id = id
	_poses = (poses as Array).duplicate(true)
	_playing = true
	_pose_index = -1
	_contact_fired = false
	_current_pose_values = _rest.duplicate()
	_start_segment(0)
	return true


func _pose_joint_targets(pose: Dictionary) -> Dictionary:
	var out: Dictionary = _current_pose_values.duplicate()
	var joints_v: Variant = pose.get("joints", {})
	if joints_v is Dictionary:
		for jn in (joints_v as Dictionary):
			out[String(jn)] = float((joints_v as Dictionary)[jn])
	return out


func _start_segment(index: int) -> void:
	var pose: Dictionary = _poses[index]
	_seg_from = _current_pose_values.duplicate()
	_seg_to = _pose_joint_targets(pose)
	_seg_ease_ms = maxf(0.0, float(pose.get("ease_ms", 0.0)))
	_seg_hold_ms = maxf(0.0, float(pose.get("hold_ms", 0.0)))
	_seg_curve = String(pose.get("ease_curve", EASE_OUT))
	_seg_t = 0.0
	_seg_snapped = false


func _write_joints(values: Dictionary) -> void:
	for jn in values:
		var node_v: Variant = _joints.get(jn, null)
		if node_v is Node3D and JOINT_AXIS.has(jn):
			_set_axis_value(node_v as Node3D, String(JOINT_AXIS[jn]), float(values[jn]))


## Deterministic advance — call every frame with a real delta (seconds). No Tween,
## no get_tree().create_timer: the whole player is a function of accumulated delta,
## so a headless sim can drive it in a tight loop and get bit-identical timing.
func _process(delta: float) -> void:
	if not _playing:
		return
	var dt_ms := delta * 1000.0
	_seg_t += dt_ms
	var ease_span := _seg_t
	if ease_span < _seg_ease_ms:
		var t := clampf(ease_span / maxf(_seg_ease_ms, 0.0001), 0.0, 1.0)
		var eased := _ease(t, _seg_curve)
		var blended: Dictionary = {}
		for jn in _seg_to:
			var to_v: float = float(_seg_to[jn])
			var from_v: float = float(_seg_from.get(jn, to_v))
			blended[jn] = lerpf(from_v, to_v, eased)
		_write_joints(blended)
		return
	# Ease finished this frame (possibly mid-hold already, if ease_ms this small
	# is close to zero) — snap fully to the pose target once, fire pose_reached/contact.
	# Flag-gated (not a dict-equality check): a zero-ease pose whose target happens
	# to equal the current values must still fire its signals exactly once.
	if not _seg_snapped:
		_seg_snapped = true
		_current_pose_values = _seg_to.duplicate()
		_write_joints(_current_pose_values)
		_pose_index += 1
		pose_reached.emit(_pose_index)
		var pose: Dictionary = _poses[_pose_index]
		if bool(pose.get("contact", false)) and not _contact_fired:
			_contact_fired = true
			contact.emit()
	# HOLD: sit until hold_ms elapses, then advance to the next pose (or finish).
	if _seg_t < _seg_ease_ms + _seg_hold_ms:
		return
	var next_index := _pose_index + 1
	if next_index >= _poses.size():
		_playing = false
		finished.emit()
		return
	_start_segment(next_index)


## Aborts playback immediately (stagger/death/weapon-swap mid-swing, spec's Edge
## Cases): no contact/finished signal fires for the remainder, no damage — the
## caller (weapon.gd, later) is responsible for easing joints back to animate()'s
## rest over its own short forced ease; this player just stops driving them.
func cancel() -> void:
	_playing = false


func _ease(t: float, curve: String) -> float:
	match curve:
		EASE_IN:
			return t * t * t
		EASE_IN_OUT:
			return t * t * (3.0 - 2.0 * t) # smoothstep
		EASE_LINEAR:
			return t
		_: # EASE_OUT (default) — snap-fast-then-settle
			var inv := 1.0 - t
			return 1.0 - inv * inv * inv


# --- WIRING NOTE (for the LATER pass — not built here, tree is not clean for it) ---
#
# 1. puppet.gd: add ONE ProtoStrikePlayer child (or a lazily-created one) and call
#    setup({"torso_twist": torso, "torso_lean": torso, "shoulder_yaw": shoulder,
#    "shoulder_pitch": shoulder, "hip_kick": hip_r}, Callable) once after create().
#    torso.rotation.y needs to become a REAL axis animate() doesn't fight — today
#    animate() only ever writes torso.rotation.x/z, so twist is free, but it must
#    also start reading _swing_t/_kick_t (or a new _strike_t) to back off
#    shoulder.rotation.x/y, hip_r.rotation.x, and torso.rotation.x/y for the
#    strike's duration — the exact ownership-gate pattern swing()/punch()/kick()
#    already use, just re-pointed at ProtoStrikePlayer.is_playing() instead of a
#    tween-owned _swing_t countdown. call strike_player._process(delta) from
#    inside animate(delta, ...) (or a sibling _physics_process) so ownership and
#    playback share one clock.
# 2. weapon.gd's fire(): swap `main.player.punch(beat)` / `.kick()` / `.swing()`
#    for a row-id lookup — `main.player.play_strike(id)` (a thin ProtoPlayer3D
#    wrapper mirroring today's punch/kick/swing wrappers) that resolves id from
#    the existing _combo beat / id switch (fists tap-beat -> punch_1/2/3, the
#    combo%3==0+ma>=2 finisher -> "kick", shove_palm -> "shove", steel ->
#    "weapon_swing") and calls strike_player.play(id). The skill gate moves from
#    `if ma >= 2: beat_is_kick = true` to strike_player.can_play("kick") — same
#    number (Martial Arts 2), now read off strikes.json's req_skill row instead
#    of an inline branch.
# 3. THE CONTACT CALLBACK is the load-bearing change: fire()'s damage-resolution
#    block (stamina/cooldown/xp bookkeeping stays where it is, spent up front)
#    moves out of the synchronous fire() body and into a handler connected to
#    strike_player.contact — e.g. fire() captures the target list + dmg/shove/kd
#    numbers into a small closure or a queued struct, and connects it (one-shot)
#    to `contact`, so damage lands exactly on the CONTACT pose's arrival instead
#    of at t=0. If the strike is canceled (staggered/downed/weapon-swapped) before
#    `contact` fires, the connection is simply never invoked — no damage, matching
#    the spec's edge case verbatim. ProtoFX.swing_arc/lunge/whoosh-audio (the
#    telegraphing FX) can stay at fire()-time; cam_rig.add_trauma/blood/floater
#    text move to ride alongside `contact` so the hit-stop lands on the snap.
# 4. Unknown/missing strikes.json id for a row weapon.gd tries to play: per spec,
#    fall back to the retired puppet.punch()/.kick()/.swing() call for that one
#    id rather than a silent no-op — `if not strike_player.play(id): <old call>`
#    is the one-line fallback, and it naturally retires itself as every id in the
#    WEAPONS table gets migrated to a strikes.json row.
# 5. Combo chaining (chain_next/cancel_window_ms) and the buffered-input-during-
#    hold edge case are P1 — not required for this file to be useful; weapon.gd's
#    existing _combo/_combo_t idle-out timer can keep deciding WHEN to call
#    play_strike() unchanged for now, with chain_next read later once cancel-into-
#    next-anticipation is built.
