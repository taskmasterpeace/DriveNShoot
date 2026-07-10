## THE CORPSE (goal: no more loot crates on a kill — loot the BODY). When a character dies
## it leaves a ragdolling, lootable, DECAYING body instead of a wooden chest. Reuses the
## exact loot plumbing every container uses (a ProtoContainer + open_container), so looting
## a body is the same verb as opening a trunk. A car can fling one (launch). No collision
## (like the old loot piles) so you never dent your ride on a body.
##
## Ragdoll here = a lightweight, deterministic box FLOP (launch arc + tumble → land → lie
## flat), not a per-limb physics rig — right for our box actors and sim-testable.
class_name ProtoCorpse
extends Node3D

const GRAVITY := 20.0
const REST_Y := 0.22            ## torso-centre height once it's lying down
const DECAY_SECONDS := 90.0     ## a looted/heavy body lingers ~1.5 min…
const EMPTY_DECAY_SECONDS := 32.0 ## …a picked-clean one goes sooner (how it makes sense)
const FADE_SECONDS := 6.0

var container: ProtoContainer
## THE SHARED ECOSYSTEM FIELDS (one corpse.gd edit serves both arcs — LWE's
## +heat/indoors/gnawed booking and THE_INFECTED's infection float): heat feeds
## scavenger pressure, infection feeds F-IP and the corpse-flies tell.
var infection := 0.0 ## 0..1 — infected bodies spawn 1.0
var heat := 1.0      ## fresh-kill scavenger draw, decays with the body
var indoors := false
var gnawed := false
var _eco_deposited := false ## the sector deposit fires exactly once
var _scav_done := false
var _age := 0.0
var _grounded := false
var _vel := Vector3.ZERO
var _spin := Vector3.ZERO
var _mats: Array[StandardMaterial3D] = []   ## per-corpse (own) mats, so fading one doesn't fade the world
var _fading := false
var _main: Node = null                      ## optional — the landing THUD plays through it
var _rig: Node3D = null                     ## 0.11 BODY LAW: the dead actor's own visual, when handed in


## label: the body's name ("Raider's body"). loot: {item_id: count}. tint: skin/clothing.
## launch: initial velocity (a car hit / blast flings it; melee/gunshot → a small flop).
## main (optional): lets the body THUD when it lands (sound-map pass).
## rig (0.11 BODY LAW, LWE): the killed actor's OWN visual, reparented here and
## posed dead — the body you see IS the body you loot. The 2-box lump below is
## the no-rig FALLBACK only.
static func create(label: String, loot: Dictionary, tint: Color = Color(0.55, 0.45, 0.36), launch: Vector3 = Vector3.ZERO, main: Node = null, rig: Node3D = null) -> ProtoCorpse:
	var c := ProtoCorpse.new()
	c._main = main
	c.add_to_group("interactable")
	c.add_to_group("corpse")
	c.container = ProtoContainer.new(label)
	for id in loot:
		c.container.add(id, loot[id])

	if rig != null:
		c._adopt_rig(rig)
	else:
		# Fallback body: a torso + head box, flat-shaded, tinted. Own materials.
		c._box(Vector3(0.5, 0.55, 0.28), Vector3(0, 0.35, 0), tint)
		c._box(Vector3(0.26, 0.26, 0.26), Vector3(0, 0.72, 0), tint * 1.08)

	# The flop: launch + a tumble spin biased by the launch (a hard hit spins harder).
	# A rig body keeps its feet-down dignity — small hop, no cartwheeling boxes.
	c._vel = launch if launch != Vector3.ZERO else Vector3(0, 2.2, 0)
	var mag := launch.length()
	c._spin = Vector3(2.5 + mag * 0.35, 1.5, 1.0 + mag * 0.2) if rig == null else Vector3(0, 0.6 + mag * 0.1, 0)
	return c


## THE BODY LAW adoption: take the dead actor's rig as our visual, pose it dead
## (the rig's own sprawl law — quadruped/puppet both carry one), and make its
## materials fade-capable so decay works on real bodies too.
func _adopt_rig(rig: Node3D) -> void:
	_rig = rig
	if rig.get_parent() != null:
		rig.get_parent().remove_child(rig)
	add_child(rig)
	rig.position = Vector3.ZERO
	if rig.has_method("pose_dead"):
		rig.call("pose_dead")
	elif rig.has_method("_pose_dead"):
		rig.call("_pose_dead") # the biped puppet's sprawl is underscore-private
	_collect_fade_mats(rig)


func _collect_fade_mats(node: Node) -> void:
	if node is MeshInstance3D:
		var mat: Material = (node as MeshInstance3D).material_override
		if mat is StandardMaterial3D:
			(mat as StandardMaterial3D).transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			_mats.append(mat as StandardMaterial3D)
	for child in node.get_children():
		_collect_fade_mats(child)


func _box(size: Vector3, pos: Vector3, color: Color) -> void:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.9
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA   # so it can FADE on decay
	mi.material_override = mat
	mi.position = pos
	_mats.append(mat)
	add_child(mi)


# --- Interactable contract (loot the body once it's settled) -------------------------

func interact_position() -> Vector3:
	return global_position


func interact_prompt(_main: Node) -> String:
	if not _grounded or _fading:
		return ""   # can't loot a body mid-flight, or one crumbling to dust
	return "E — loot %s" % container.label.to_lower()


func interact(main: Node) -> void:
	# Same scavenging beat as any container — looting a body IS scavenging.
	if not _scav_done:
		_scav_done = true
		if main.has_method("grant_xp"):
			main.grant_xp("scavenging", 3.0)
		if main.has_method("circuit_beat"):
			main.circuit_beat("scavenge")
	main.open_container(container)


# --- Flop + decay --------------------------------------------------------------------

func _physics_process(delta: float) -> void:
	# THE SECTOR DEPOSIT (LWE — no free lunch): a body's heat draws the cell,
	# once, the frame it exists in the world. Infection rides for F-IP (I2).
	if not _eco_deposited:
		_eco_deposited = true
		if _main != null and "ecology" in _main and _main.ecology != null:
			_main.ecology.deposit_corpse(global_position, heat, infection)
	if not _grounded:
		_vel.y -= GRAVITY * delta
		global_position += _vel * delta
		rotation += _spin * delta
		if global_position.y <= REST_Y:
			_land()
	_age += delta
	var life := EMPTY_DECAY_SECONDS if container.slots.is_empty() else DECAY_SECONDS
	if _age >= life:
		_fade(delta, life)


func _land() -> void:
	_grounded = true
	global_position.y = REST_Y
	# Settle into a lying pose: the box lump lies flat; a real rig's pose_dead
	# already owns the sprawl (body on its side, legs stiff) — don't face-plant it.
	rotation = Vector3(PI * 0.5, rotation.y, 0.0) if _rig == null else Vector3(0.0, rotation.y, 0.0)
	# The body hits the dirt — you HEAR the weight (sound-map pass).
	if _main != null and "audio" in _main and _main.audio != null:
		_main.audio.play_at("body_thud", global_position, -2.0)


func _fade(delta: float, life: float) -> void:
	_fading = true
	var a := clampf(1.0 - (_age - life) / FADE_SECONDS, 0.0, 1.0)
	for m in _mats:
		m.albedo_color.a = a
	if a <= 0.0:
		queue_free()
