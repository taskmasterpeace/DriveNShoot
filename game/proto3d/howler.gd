## THE NIGHT THREAT: Howlers hunt in packs after dark. They CIRCLE at the edge
## of what you can actually see (they read your real vision cone), then CHARGE —
## fast, straight, screaming. They fear working headlights, hits STAGGER them
## out of a charge, and dawn burns the whole pack off the map. The moon decides
## how close they get before you ever know: dark night = short cone = close teeth.
class_name ProtoHowler
extends CharacterBody3D

enum HowlState { CIRCLE, CHARGE, FLEE }

## THE PACK BRAIN (goal: give the pack roles and night gets genuinely scary):
## - circler: the baseline — rides the rim of your sight, takes its turn.
## - charger: impatient teeth — charges sooner, from further, a hair faster.
## - screamer: never charges. It SCREAMS: reinforcements answer, and every
##   packmate's patience snaps at once (a coordinated rush). Kill it FIRST.
const ROLES: Dictionary = {
	"circler": {"charge_cd": [2.5, 6.0], "charge_range": 50.0, "speed_mult": 1.0, "scale": 1.0},
	"charger": {"charge_cd": [0.8, 2.2], "charge_range": 62.0, "speed_mult": 1.15, "scale": 0.95},
	"screamer": {"charge_cd": [999.0, 999.0], "charge_range": 0.0, "speed_mult": 0.9, "scale": 1.18},
}
var role: String = "circler"
var _scream_cd: float = 6.0
var _screams_left: int = 2

@export var circle_speed: float = 5.0
@export var charge_speed: float = 9.5
@export var claw_damage: float = 12.0
@export var claw_cooldown: float = 1.1
@export var flee_speed: float = 12.0
@export var despawn_dist: float = 55.0

var state: HowlState = HowlState.CIRCLE
var body: Damageable = Damageable.new("body", "💀", 30.0)
var dead: bool = false
var _stun_t: float = 0.0
var _charge_cd: float = 0.0
var _claw_cd: float = 0.0
var _orbit_sign: float = 1.0
var _player: Node3D = null
var _main: Node = null
var _visual: Node3D
var _quad: ProtoQuadruped = null
var _hit_flash_t: float = 0.0
var _flash_mat: StandardMaterial3D = null
var _rng := RandomNumberGenerator.new()


var tame_progress: int = 0 ## STAGE 7 taming rung 1: staggered + fed meat ×3 = YOURS


static func create(main: Node) -> ProtoHowler:
	var h := ProtoHowler.new()
	h._main = main
	h.add_to_group("threat")
	h.add_to_group("interactable") # taming: E only works while it's STUNNED
	h._rng.randomize()
	h._orbit_sign = 1.0 if h._rng.randf() > 0.5 else -1.0
	h._charge_cd = h._rng.randf_range(2.5, 6.0)
	# Round shape sized to the head's reach — the visual yaws, the body doesn't,
	# so only radius keeps the snout out of walls (same law as the dog).
	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.55
	cap.height = 1.2
	shape.shape = cap
	shape.position.y = 0.55
	h.add_child(shape)
	# The FOUR-LEGGED PUPPET (quadruped.gd), night-predator build: big, dark, and
	# TAILLESS (a howler doesn't wag — it hunts). Its legs lope off its charge speed.
	h._quad = ProtoQuadruped.create({"scale": 1.35, "color": Color(0.16, 0.13, 0.11), "tail": 0.0})
	h._visual = h._quad
	h.add_child(h._visual)
	# The EYES — two hot points on the head, the only thing night shows you until
	# it's close. They ride the neck (which dips as it lopes), still glowing.
	for ex in [-0.08, 0.08]:
		var eye := MeshInstance3D.new()
		var em := SphereMesh.new()
		em.radius = 0.05
		em.height = 0.1
		eye.mesh = em
		eye.material_override = ProtoWorldBuilder.material(Color(1.0, 0.75, 0.2), 0.1, true)
		eye.position = Vector3(ex, 0.08, -0.22)
		h._quad.neck.add_child(eye)
	return h


func is_stunned() -> bool:
	return _stun_t > 0.0


## Hits STAGGER: the charge dies in its tracks — shooting STOPS things now.
func take_damage(amount: float) -> void:
	if dead:
		return
	_stun_t = minf(_stun_t + 0.35, 0.8)
	if state == HowlState.CHARGE:
		state = HowlState.CIRCLE
		_charge_cd = _rng.randf_range(1.6, 3.2)
	ProtoFloater.pop(get_parent(), global_position + Vector3(0, 1.5, 0), "-%d" % int(amount), Color(0.96, 0.86, 0.55), 110)
	if _flash_mat == null:
		_flash_mat = StandardMaterial3D.new()
		_flash_mat.albedo_color = Color(1.0, 0.9, 0.8)
		_flash_mat.emission_enabled = true
		_flash_mat.emission = Color(1.0, 0.55, 0.35)
		_flash_mat.emission_energy_multiplier = 2.4
	_hit_flash_t = 0.12
	for c in _visual.get_children():
		if c is MeshInstance3D:
			(c as MeshInstance3D).material_overlay = _flash_mat
	if _quad:
		_quad.flinch() # the whole body jolts — the hit lands on the rig
	body.damage(amount)
	if body.hp <= 0.0:
		dead = true
		ProtoFX.skull(get_parent(), global_position)
		var corpse := ProtoChest.create("Corpse", {"meat": 1, "jack": 3}, false)
		get_parent().add_child(corpse)
		corpse.global_position = global_position
		queue_free()


func shove(dir: Vector3, power: float) -> void:
	if dead:
		return
	var d := Vector3(dir.x, 0, dir.z)
	if d.length_squared() > 0.01:
		velocity += d.normalized() * power + Vector3(0, power * 0.25, 0)


func knock_down() -> void:
	_stun_t = maxf(_stun_t, 1.2)


## Sim hook: skip the circling patience and come NOW.
func force_charge() -> void:
	state = HowlState.CHARGE
	_charge_cd = 0.0


# --- TAMING (Stage 7, PROGRESSION ladder: dogs → MUTANT HOUNDS → …) ------------
## Only a STAGGERED howler can be approached; meat while it's down builds trust.

func interact_position() -> Vector3:
	return global_position


func interact_prompt(main: Node) -> String:
	if dead or not is_stunned():
		return "" # you don't hand-feed a thing that's charging you
	if main.backpack.count("meat") <= 0:
		return "(it's down — MEAT could tame it)"
	return "E — Offer meat (tamed %d/%d)" % [tame_progress, _meat_needed(main)]


## ⭐ KINSHIP shortens the taming ladder: 3 meat unskilled → 2 at lv3 → 1 at lv6.
func _meat_needed(main: Node) -> int:
	if "character" in main and main.character:
		return main.character.tame_meat_needed()
	return 3


func interact(main: Node) -> void:
	if dead or not is_stunned() or not main.backpack.remove("meat", 1):
		return
	tame_progress += 1
	_stun_t = maxf(_stun_t, 1.4) # eating keeps it down
	if "audio" in main and main.audio:
		main.audio.play_at("growl", global_position, -8.0, 1.3)
	if main.has_method("grant_xp"):
		main.grant_xp("kinship", 10.0) # ⭐ taming a night-hunter is the deepest bond work there is
	if tame_progress < _meat_needed(main):
		main.notify("🍖 It tears the meat apart... and watches you (%d/%d)" % [tame_progress, _meat_needed(main)])
		return
	# TAMED: the howler becomes a MUTANT HOUND — a full pack dog. Every dog
	# system (whistle, guard, ride-along, metaworld) is inherited for free.
	var hound := ProtoDog.create(ProtoDog.DogType.SECURITY, "Fang", "Mutant Hound")
	main.add_child(hound)
	hound.global_position = global_position
	hound.interact(main) # the adoption path — it joins the pack properly
	main.notify("🐺 FANG the Mutant Hound is YOURS — the night just switched sides")
	queue_free()


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity += get_gravity() * delta
	if _hit_flash_t > 0.0:
		_hit_flash_t -= delta
		if _hit_flash_t <= 0.0 and _visual:
			for c in _visual.get_children():
				if c is MeshInstance3D:
					(c as MeshInstance3D).material_overlay = null

	# Staggered: no legs, no teeth — the stagger IS the counterplay.
	if _stun_t > 0.0:
		_stun_t -= delta
		velocity.x = move_toward(velocity.x, 0.0, 20.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 20.0 * delta)
		move_and_slide()
		return

	if _player == null or not is_instance_valid(_player):
		_player = get_tree().get_first_node_in_group("player3d")
		move_and_slide()
		return

	# DAWN BURNS THE PACK: first light, they break and run until they're gone.
	if _main and "daynight" in _main and not _main.daynight.is_dark():
		state = HowlState.FLEE

	var to_p := _player.global_position - global_position
	to_p.y = 0.0
	var dist := to_p.length()
	var dir := to_p.normalized() if dist > 0.1 else Vector3.FORWARD

	match state:
		HowlState.FLEE:
			velocity.x = -dir.x * flee_speed
			velocity.z = -dir.z * flee_speed
			_face(-dir, delta)
			if dist > despawn_dist:
				queue_free()
				return
		HowlState.CIRCLE:
			# Ride the RIM of what the player can actually see — the real cone
			# range (the moon sets it). Dark night = tight circle = close teeth.
			# A SCREAMER hangs a few meters further out — conducting, not biting.
			var ring := 15.0
			if _main and "vision_cone" in _main and _main.vision_cone:
				ring = clampf(_main.vision_cone.last_range_m + 3.0, 10.0, 42.0)
			if role == "screamer":
				ring += 8.0
			var radial := dist - ring
			var tangent := Vector3(dir.z, 0, -dir.x) * _orbit_sign
			var move_dir := (tangent + dir * clampf(radial * 0.25, -1.0, 1.0)).normalized()
			var spd := circle_speed * float(ROLES[role]["speed_mult"])
			velocity.x = move_dir.x * spd
			velocity.z = move_dir.z * spd
			_face(dir, delta)
			_charge_cd -= delta
			if _charge_cd <= 0.0 and dist < float(ROLES[role]["charge_range"]):
				_begin_charge()
			# THE SCREAM: reinforcements + every packmate's patience snaps at once.
			if role == "screamer":
				_scream_cd -= delta
				if _scream_cd <= 0.0 and _screams_left > 0 and dist < 55.0:
					_scream()
		HowlState.CHARGE:
			# Headlight-shy: charging INTO a lit beam breaks the run.
			if _in_headlights():
				state = HowlState.CIRCLE
				_charge_cd = _rng.randf_range(2.0, 4.0)
				_orbit_sign *= -1.0
			else:
				var cspd := charge_speed * float(ROLES[role]["speed_mult"])
				velocity.x = dir.x * cspd
				velocity.z = dir.z * cspd
				_face(dir, delta)

	# Teeth: same two-way law as the lurker's claw — and never through a wall.
	_claw_cd = maxf(0.0, _claw_cd - delta)
	if not dead and _claw_cd <= 0.0 and dist <= 1.7 and ProtoWeapon.melee_clear(self, _player):
		if _main and _main.has_method("on_player_clawed"):
			_claw_cd = claw_cooldown
			_main.on_player_clawed(claw_damage, self)
			state = HowlState.CIRCLE
			_charge_cd = _rng.randf_range(2.0, 4.5)

	_animate_rig(delta)
	move_and_slide()


func _face(dir: Vector3, delta: float) -> void:
	if dir.length_squared() > 0.01 and _visual:
		_visual.rotation.y = lerp_angle(_visual.rotation.y, atan2(-dir.x, -dir.z), 9.0 * delta)


## The rig lopes off the charge speed (low aggressive morale — no happy wag on a
## night-hunter; it has no tail anyway). Called on the active paths, frozen while stunned.
func _animate_rig(delta: float) -> void:
	if _quad:
		_quad.animate(delta, velocity.length(), 0.3)


## Inside any lights-on vehicle's forward beam within 20m? Howlers won't cross it.
func _in_headlights() -> bool:
	if _main == null or not "cars" in _main:
		return false
	for c in _main.cars:
		if c == null or not is_instance_valid(c) or not c.headlights_on:
			continue
		var rel: Vector3 = global_position - (c as Node3D).global_position
		rel.y = 0.0
		if rel.length() < 20.0 and (c as ProtoCar3D).facing().dot(rel.normalized()) > 0.55:
			return true
	return false


# --- The pack brain's hands ----------------------------------------------------

## Take a role (the spawner deals them): scale reads at a glance — the big one
## conducting from the back IS the screamer. Kill it first.
func set_role(role_in: String) -> void:
	role = role_in
	add_to_group("night_pack")
	var r: Array = ROLES[role]["charge_cd"]
	_charge_cd = _rng.randf_range(r[0], r[1])
	scale = Vector3.ONE * float(ROLES[role]["scale"])


## Entering a charge RIPPLES: packmates nearby lose patience — attacks overlap
## instead of queueing politely. This is what makes four feel like a PACK.
func _begin_charge() -> void:
	state = HowlState.CHARGE
	for node in get_tree().get_nodes_in_group("night_pack"):
		var h := node as ProtoHowler
		if h != null and h != self and not h.dead and h.role != "screamer" \
				and h.global_position.distance_to(global_position) < 45.0:
			h._charge_cd = minf(h._charge_cd, 0.6)


## THE SCREAM: the night answers. Two more howlers join, and the whole pack's
## patience snaps NOW. Twice per screamer — then it's just a big coward.
func _scream() -> void:
	_screams_left -= 1
	_scream_cd = _rng.randf_range(11.0, 16.0)
	if _main == null:
		return
	if "audio" in _main and _main.audio:
		_main.audio.play_at("howl", global_position, 8.0, 0.8)
	if _main.has_method("spawn_howler_pack"):
		_main.spawn_howler_pack(global_position + Vector3(12, 0, 8), 2)
	for node in get_tree().get_nodes_in_group("night_pack"):
		var h := node as ProtoHowler
		if h != null and h != self and not h.dead and h.role != "screamer":
			h._charge_cd = 0.0
	if _main.has_method("notify"):
		_main.notify("🌙 The big one SCREAMS — and the dark answers")
