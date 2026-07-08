## THE CLIP-DRIVEN PUPPET (owner 2026-07-08: "we switch to animation clips").
## Wraps a Mesh2Motion-rigged humanoid GLB (mesh + 66-bone skeleton + an
## AnimationPlayer of REAL mocap clips) and drives it by the game's movement state
## — Walk when moving, Death when dead — instead of posing bones with sin(). It
## exposes the SAME interface the game calls on ProtoPuppet / ProtoSkelPuppet
## (aim_arm / legs_pivot / gun / animate / set_weapon_mesh / set_armed /
## muzzle_world / raised / crouch_target / swing / punch / kick / recoil / flinch /
## arm_tracks_gaze / pose_riding) so player_3d and proto3d drive it unchanged.
##
## The model imports upright, ~1.83 m, feet at y=0 (measured) — no scale/flip. New
## clips (Idle, Run, Aim, Crouch, Binoculars, Melee) are DROP-IN: export them from
## Mesh2Motion into the GLB (or a sibling), and the state map below plays them.
class_name ProtoAnimPuppet
extends Node3D

const GLB := "res://assets/models/anim/m2m_char.glb"
## Model faces +Z in its own space; Godot forward is -Z. body_yaw aims the whole
## puppet, so we turn the Orient node 180° to line the front up with the gaze.
## (If the character faces AWAY from the mouse in-game, flip this to 0.0.)
const FRONT_YAW := PI
## Walk clip authored around this world speed (m/s) — playback scales off it so
## fast running doesn't look like a slow amble. Tune when a Run clip lands.
const WALK_REF := 2.4
const MOVE_EPS := 0.4 ## below this we read as standing (idle)

# --- The interface the game reads (mirrors ProtoPuppet / ProtoSkelPuppet) -----
var aim_arm: Node3D
var legs_pivot: Node3D
var gun: Node3D
var raised: bool = false
var binoculars: bool = false
var crouch_target: float = 0.0
var aim_wobble: float = 0.0
var appearance: Dictionary = {}
var handed_sign: float = 1.0

# --- Internals ---------------------------------------------------------------
var skel: Skeleton3D
var mesh: MeshInstance3D
var hand_mount: BoneAttachment3D
var _ap: AnimationPlayer
var _orient: Node3D
var _state: String = ""       ## current clip state (avoid restart thrash)
var _muzzle_z: float = 0.34
var _two_handed: bool = false
var _crouch: float = 0.0
var _base_y: float = 0.0
var _t: float = 0.0
var _clips: Dictionary = {}   ## logical name → actual clip name present in the GLB


static func create(_appearance: Dictionary = {}) -> ProtoAnimPuppet:
	var p := ProtoAnimPuppet.new()
	p._orient = Node3D.new()
	p._orient.name = "Orient"
	p._orient.rotation.y = FRONT_YAW
	p.add_child(p._orient)
	var body := (load(GLB) as PackedScene).instantiate()
	body.name = "Body"
	p._orient.add_child(body)
	p.skel = p._find(body, "Skeleton3D") as Skeleton3D
	p.mesh = p._find(body, "MeshInstance3D") as MeshInstance3D
	p._ap = p._find(body, "AnimationPlayer") as AnimationPlayer
	p.appearance = _appearance.duplicate() if _appearance != null else {}
	p.handed_sign = -1.0 if String(p.appearance.get("handed", "right")) == "left" else 1.0
	# Map logical states → whatever clips this export actually contains, so adding
	# Idle/Run/Aim/Crouch later Just Works with no code change.
	if p._ap != null:
		var have := p._ap.get_animation_list()
		p._clips = {
			"walk": p._pick(have, ["Walk", "Walk_Loop", "walk"]),
			"run": p._pick(have, ["Run", "Run_Loop", "Jog", "run"]),
			"idle": p._pick(have, ["Idle", "Idle_Loop", "idle"]),
			"aim": p._pick(have, ["Aim", "Aim_Idle", "Pistol_Aim", "aim"]),
			"crouch": p._pick(have, ["Crouch", "Crouch_Idle", "crouch"]),
			"binoc": p._pick(have, ["Binoculars", "Binocular", "binoc"]),
			"death": p._pick(have, ["Death01", "Death", "Dying", "death"]),
		}
		# Loop the cyclic clips defensively (some exporters drop the flag).
		for key in ["walk", "run", "idle", "aim", "crouch"]:
			var cn: String = p._clips.get(key, "")
			if cn != "" and p._ap.has_animation(cn):
				p._ap.get_animation(cn).loop_mode = Animation.LOOP_LINEAR
	# Proxy nodes the caller manipulates (aim/leg yaw) — harmless to the clip rig.
	p.aim_arm = Node3D.new(); p.add_child(p.aim_arm)
	p.legs_pivot = Node3D.new(); p.add_child(p.legs_pivot)
	# Weapon mount on the right hand bone.
	if p.skel != null and p.skel.find_bone("hand_r") >= 0:
		p.hand_mount = BoneAttachment3D.new()
		p.hand_mount.bone_name = "hand_r"
		p.skel.add_child(p.hand_mount)
		p.gun = Node3D.new()
		p.gun.visible = false
		p.hand_mount.add_child(p.gun)
	else:
		p.gun = Node3D.new(); p.add_child(p.gun); p.gun.visible = false
	return p


func _ready() -> void:
	# Kick the first state so the body isn't a bind-pose statue on spawn.
	if _ap != null:
		_set_state("idle")


# --- The animator: pick a clip from the movement state -----------------------
func animate(delta: float, speed: float, _turn_rate: float, _armed: bool, _hurt: float, dead: bool) -> void:
	_t += delta
	if _ap == null:
		return
	if dead:
		_set_state("death")
		return
	if binoculars and _clips.get("binoc", "") != "":
		_set_state("binoc")
	elif speed > MOVE_EPS:
		# Prefer Run at a real clip if present + fast, else Walk.
		if speed > WALK_REF * 1.6 and _clips.get("run", "") != "":
			_set_state("run")
			_ap.speed_scale = clampf(speed / (WALK_REF * 2.2), 0.7, 1.8)
		else:
			_set_state("walk")
			_ap.speed_scale = clampf(speed / WALK_REF, 0.55, 2.0)
	else:
		_set_state("idle")
		_ap.speed_scale = 1.0
	# Crouch: sink the body (a real crouch clip refines this later).
	_crouch = lerpf(_crouch, crouch_target, clampf(8.0 * delta, 0.0, 1.0))
	position.y = _base_y - _crouch * 0.28


func _set_state(logical: String) -> void:
	if logical == _state:
		return
	_state = logical
	var clip: String = _clips.get(logical, "")
	if clip == "" or _ap == null or not _ap.has_animation(clip):
		# No clip for this state yet. Fallbacks so it never freezes on bind pose:
		# idle/aim/crouch/binoc → a slow in-place walk reads "alive" until the real
		# clip is exported; run → walk; death → whatever death exists or hold.
		if logical == "death":
			return
		var wc: String = _clips.get("walk", "")
		if wc != "" and _ap != null and _ap.has_animation(wc):
			_ap.play(wc, 0.25)
			_ap.speed_scale = 1.0 if logical == "run" else 0.25
		return
	var oneshot := (logical == "death")
	_ap.play(clip, 0.2)
	if oneshot:
		_ap.speed_scale = 1.0


# --- Held-weapon interface (mirrors ProtoPuppet) -----------------------------
func set_hand_pose(_offset: Vector3, two_handed: bool, _grip_l: Vector3 = Vector3.ZERO, _grip_r: Vector3 = Vector3.ZERO) -> void:
	_two_handed = two_handed


func set_weapon_mesh(parts: Array, muzzle_z: float = 0.34) -> void:
	_muzzle_z = maxf(0.05, muzzle_z)
	if gun == null:
		return
	for c in gun.get_children():
		gun.remove_child(c)
		c.queue_free()
	var use: Array = parts if not parts.is_empty() else [{"size": Vector3(0.06, 0.06, 0.5), "pos": Vector3(0, 0, -0.16), "color": Color(0.16, 0.16, 0.18)}]
	for part in use:
		var m := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = part.get("size", Vector3(0.06, 0.06, 0.3))
		m.mesh = bm
		m.material_override = ProtoWorldBuilder.material(part.get("color", Color(0.16, 0.16, 0.18)), 0.85)
		m.position = part.get("pos", Vector3.ZERO)
		var r: Vector3 = part.get("rot", Vector3.ZERO)
		if r != Vector3.ZERO:
			m.rotation = r
		gun.add_child(m)


func set_armed(on: bool) -> void:
	if gun:
		gun.visible = on


func muzzle_world() -> Vector3:
	if gun != null and gun.visible:
		return gun.global_position - gun.global_basis.z * _muzzle_z
	return global_position + Vector3(0, 1.2, 0)


## Clip-driven: the aim clip (once exported) already faces downrange, so the arm
## does NOT need to chase the gaze proxy. Until then, false keeps the body facing
## the gaze via body_yaw (the game handles that on the root).
func arm_tracks_gaze() -> bool:
	return false


func pose_riding(_delta: float, _armed_aim: bool) -> void:
	# A seated/riding clip is a later export; hold whatever's playing.
	pass


# --- Combat feedback: light + safe until melee/recoil CLIPS land --------------
func swing() -> void:
	pass


func punch(_beat: int) -> void:
	pass


func kick() -> void:
	pass


func is_swinging() -> bool:
	return false


func gun_recoil() -> void:
	pass


func recoil() -> void:
	pass


func recoil_kick(_row: Dictionary, _strength_level: int) -> void:
	pass


func flinch(_world_dir: Vector3 = Vector3.ZERO) -> void:
	pass


func _pick(have: PackedStringArray, names: Array) -> String:
	for n in names:
		if have.has(n):
			return String(n)
	return ""


func _find(n: Node, cls: String) -> Node:
	if n.get_class() == cls:
		return n
	for c in n.get_children():
		var r := _find(c, cls)
		if r != null:
			return r
	return null
