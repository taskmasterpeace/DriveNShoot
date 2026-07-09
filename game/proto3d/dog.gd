## PROTO-3D dog: four types (Security/Hunter/Companion/Cuddle), each mechanically
## distinct. The law of dogs: a dog always knows what's behind you.
## Design: docs/systems/DOGS.md
class_name ProtoDog
extends CharacterBody3D

enum DogType { SECURITY, HUNTER, COMPANION, CUDDLE }
enum DogState { STRAY, FOLLOW, STAY, ALERT, GUARD, SIC, SEEK, DIG }

## Per-type tuning: [follow_dist, run_speed, threat_radius, rear_bonus, nose_radius, calm_aura, size, color]
const TYPE_PARAMS: Dictionary = {
	DogType.SECURITY: {
		"follow_dist": 3.2, "speed": 8.0, "threat_radius": 26.0, "rear_mult": 1.5,
		"nose_radius": 0.0, "calm_aura": 0.0, "scale": 1.15, "color": Color(0.32, 0.26, 0.18),
		"obey_delay": 0.5, "bark": "GROWLS", "bite": 16.0, "bite_kd": 0.45,
	},
	DogType.HUNTER: {
		"follow_dist": 4.5, "speed": 8.5, "threat_radius": 14.0, "rear_mult": 1.2,
		"nose_radius": 24.0, "calm_aura": 0.0, "scale": 1.0, "color": Color(0.55, 0.42, 0.25),
		"obey_delay": 0.6, "bark": "points", "bite": 9.0, "bite_kd": 0.2,
	},
	DogType.COMPANION: {
		"follow_dist": 2.6, "speed": 8.0, "threat_radius": 16.0, "rear_mult": 1.2,
		"nose_radius": 10.0, "calm_aura": 2.0, "scale": 1.0, "color": Color(0.72, 0.6, 0.4),
		"obey_delay": 0.0, "bark": "barks", "bite": 12.0, "bite_kd": 0.25,
	},
	DogType.CUDDLE: {
		"follow_dist": 1.8, "speed": 7.0, "threat_radius": 8.0, "rear_mult": 1.1,
		"nose_radius": 0.0, "calm_aura": 9.0, "scale": 0.62, "color": Color(0.82, 0.74, 0.62),
		"obey_delay": 0.8, "bark": "grumbles", "bite": 0.0, "bite_kd": 0.0,
	},
}

const TYPE_NAMES: Dictionary = {
	DogType.SECURITY: "Security", DogType.HUNTER: "Hunter",
	DogType.COMPANION: "Companion", DogType.CUDDLE: "Cuddle",
}

## Breed variance UNDER each type (DOGS.md §3) — multipliers over the type's params.
## Adding a breed = adding a row.
const BREED_MODS: Dictionary = {
	"Shepherd": {}, # the baseline guard
	"Rottweiler": {"threat_radius": 0.8, "speed": 1.05}, # shorter nose, faster teeth (bite later)
	"Mastiff": {"threat_radius": 1.15, "speed": 0.82}, # slow wall of intimidation
	"Bloodhound": {"nose_radius": 1.4}, # THE nose
	"Pointer": {"nose_radius": 1.0, "speed": 1.1}, # precise + quick
	"Coyote-cross": {"nose_radius": 1.15, "threat_radius": 1.1}, # wild senses
	"Lab": {"speed": 1.05},
	"Border Collie": {"obey_delay": 0.0}, # the smartest — instant commands
	"Mutt": {}, # lucky later
	"Pocket": {"calm_aura": 1.25, "speed": 1.1}, # fastest calm
	"Wheezer": {"calm_aura": 1.1, "speed": 0.8}, # snores; sleep bonus later
	"Ratter": {"threat_radius": 1.2}, # jumpy — notices everything
}

var dog_type: DogType = DogType.COMPANION
var dog_name: String = "Rex"
var breed: String = "Shepherd"
var adopted: bool = false
var state: DogState = DogState.STRAY
var guard_pos: Vector3 = Vector3.ZERO
var sic_target: Node3D = null
var seek_target: Node3D = null
var hp: float = 50.0
var max_hp: float = 50.0
var riding_in: ProtoCar3D = null ## the vehicle this dog is riding shotgun in

var _owner_ref: Node3D = null
var _main: Node = null ## the proto3d main scene (set at adoption) — sim-safe, no current_scene reliance
var _visual: Node3D
var _quad: ProtoQuadruped = null
var _follow_angle: float = 0.0 ## personal heel offset so dogs don't stack
var _alert_t: float = 0.0
var _alert_face: Vector3 = Vector3.ZERO
var _scan_t: float = 0.0
var _threat_cooldown: float = 0.0
var _pinged_stashes: Array = []
## MOVESET.txt verbs: the auto-JUMP cooldown, the POUNCE launch cooldown, and
## the DIG job (a Hunter unearthing a buried cache).
var _jump_cd: float = 0.0
var _pounce_cd: float = 0.0
var _dig_target: ProtoBuriedCache = null
var _dig_t: float = 0.0
var _obey_queue: Array = [] ## [ [time_left, state] ] — obedience delay per type
var _wag_t: float = 0.0
var _stuck_t: float = 0.0
var _bite_cd: float = 0.0
var balking := false ## THE CHOIR BALK (THE_INFECTED §3.3): dogs refuse the ring — sim-readable
var _balk_bark_cd := 0.0


var _params: Dictionary = {}

static func create(type: DogType, name_in: String, breed_in: String) -> ProtoDog:
	var d := ProtoDog.new()
	d.dog_type = type
	d.dog_name = name_in
	d.breed = breed_in
	d.add_to_group("interactable")
	d.add_to_group("proto_dog")
	# Type params + breed multipliers = this dog's actual senses.
	d._params = TYPE_PARAMS[type].duplicate()
	for key in BREED_MODS.get(breed_in, {}):
		d._params[key] = d._params[key] * BREED_MODS[breed_in][key] if d._params[key] is float else BREED_MODS[breed_in][key]
	var p: Dictionary = d._params
	var s: float = p["scale"]
	var body_color: Color = p["color"]

	# The capsule covers the HEAD's reach (~0.6 forward), not just the body: the
	# visual yaws while this body doesn't, so only a round shape can keep the
	# muzzle out of walls in every facing (playtest: "heads stick through walls").
	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.5 * s
	cap.height = 1.0 * s
	shape.shape = cap
	shape.position.y = 0.42 * s
	d.add_child(shape)

	# THE FOUR-LEGGED PUPPET (quadruped.gd): box parts driven by sin() off speed,
	# and the tail wags/tucks off MORALE. The rig IS the visual root — yawing it
	# (as the AI already does) turns the whole dog.
	d._quad = ProtoQuadruped.create({"scale": s, "color": body_color})
	d._visual = d._quad
	d.add_child(d._visual)

	d._follow_angle = randf() * TAU
	return d


## Morale 0..1 (the tail's readout): high near your owner and calm, low when hurt
## or a threat is close. Cuddle dogs are sunnier; a spooked dog just got scared.
func morale() -> float:
	var m := 0.55
	if _near_owner(4.0):
		m += 0.25
	m += (hp / max_hp - 0.5) * 0.5     # hurt lowers it
	if _alert_t > 0.0:
		m -= 0.25                        # recently spooked
	var nearest := 999.0
	for n in get_tree().get_nodes_in_group("threat"):
		if n is Node3D and is_instance_valid(n):
			nearest = minf(nearest, global_position.distance_to((n as Node3D).global_position))
	if nearest < 12.0:
		m -= (1.0 - nearest / 12.0) * 0.6 # a close threat = fear
	if dog_type == DogType.CUDDLE:
		m += 0.15
	# ⭐ KINSHIP: a bonded pack stands braver beside you.
	if _main and "character" in _main and _main.character:
		m += _main.character.kinship_morale_bonus()
	return clampf(m, 0.0, 1.0)


func params() -> Dictionary:
	return _params if not _params.is_empty() else TYPE_PARAMS[dog_type]


func type_name() -> String:
	return TYPE_NAMES[dog_type]


# --- Interactable contract -------------------------------------------------

func interact_position() -> Vector3:
	return global_position


func interact_prompt(main: Node) -> String:
	if downed:
		if main.backpack.count("bandage") > 0:
			return "E — 🩹 STABILIZE %s (%ds left)" % [dog_name, int(_bleed_out_t)]
		return "🆘 %s is bleeding out (%ds) — NO BANDAGE" % [dog_name, int(_bleed_out_t)]
	if not adopted:
		return "E — Adopt %s (%s · %s)" % [dog_name, type_name(), breed]
	if hp < max_hp - 5.0 and main.backpack.count("meat") > 0:
		return "E — Feed %s (🍖 %d hp)" % [dog_name, int(minf(30.0, max_hp - hp))]
	# The bond is VISIBLE at a glance — the prompt wears the tier.
	if state == DogState.STAY:
		return "E — %s (%s): Follow" % [dog_name, BOND_TIERS[bond_tier()]]
	return "E — %s (%s): Stay" % [dog_name, BOND_TIERS[bond_tier()]]


func interact(main: Node) -> void:
	if downed:
		if main.backpack.remove("bandage", 1):
			_stabilize(main)
		else:
			main.notify("You press your hands to the wound. It's not enough. FIND A BANDAGE.")
		return
	if not adopted:
		adopted = true
		_main = main
		_owner_ref = main.player
		_queue_state(DogState.FOLLOW)
		main.register_dog(self)
		add_bond(10.0, main) # taking one in is where it starts
		if main.has_method("grant_xp"):
			main.grant_xp("kinship", 8.0) # ⭐ taking one in IS the skill
		main.notify("%s the %s %s joins you" % [dog_name, breed, type_name()])
		return
	# A hurt dog eats first — meat heals the pack (improve-the-dogs pass).
	if hp < max_hp - 5.0 and main.backpack.remove("meat", 1):
		hp = minf(max_hp, hp + 30.0)
		add_bond(8.0, main)
		if "daynight" in main and main.daynight:
			last_fed_day = main.daynight.day
		if main.has_method("grant_xp"):
			main.grant_xp("kinship", 3.0) # ⭐ feeding builds the bond
		main.notify("🍖 %s wolfs it down (%d/%d hp)" % [dog_name, int(hp), int(max_hp)])
		if "audio" in main and main.audio:
			main.audio.play_at("bark", global_position, -10.0, 1.2)
		return
	# Toggle stay/follow (obedience delay is part of each type's identity)
	_queue_state(DogState.FOLLOW if state == DogState.STAY else DogState.STAY)


# --- Riding shotgun (the pack goes WITH you) ----------------------------------

## SEAT ANCHORS (RV_PLAN): a rider is PARENTED to a seat on the rig — visible,
## physics off, tail in the wind. A bed anchor shows; a cab/enclosed anchor
## hides (you can't see into the cab). The dog in the truck bed is the poster.
func board(car: ProtoCar3D, anchor: Vector3 = Vector3.INF, seat_type: String = "cab") -> void:
	riding_in = car
	state = DogState.FOLLOW
	set_physics_process(false)
	for c in get_children():
		if c is CollisionShape3D:
			(c as CollisionShape3D).disabled = true
	if anchor != Vector3.INF:
		reparent(car)
		position = anchor
		rotation = Vector3.ZERO
		visible = seat_type == "bed" # ride the bed = seen; ride the cab = hidden
	else:
		visible = false


func unboard(pos: Vector3) -> void:
	riding_in = null
	if get_parent() != null and get_parent() is ProtoCar3D:
		reparent(_main)
	set_physics_process(true)
	for c in get_children():
		if c is CollisionShape3D:
			(c as CollisionShape3D).disabled = false
	process_mode = Node.PROCESS_MODE_INHERIT
	visible = true
	global_position = pos
	velocity = Vector3.ZERO
	command_heel()


## Tail in the wind: a bed-riding dog is parented (physics off), so drive its
## rig here — the wag reads its morale even at 60 mph. (The poster shot.)
func _process(delta: float) -> void:
	if riding_in != null and is_instance_valid(riding_in) and visible and _quad != null:
		_quad.animate(delta, 0.0, clampf(0.6 + 0.4 * (hp / max_hp), 0.0, 1.0))


## Whistle: every adopted dog returns to heel.
func whistle() -> void:
	if adopted:
		_queue_state(DogState.FOLLOW)


# --- Command verbs (whistle patterns + the metasystem) ---------------------

func command_heel() -> void:
	shielding = false
	if adopted:
		_queue_state(DogState.FOLLOW)


func command_guard(pos: Vector3) -> void:
	if adopted:
		shielding = false # a POSTED guard stands its ground; SHIELD moves with you
		guard_pos = pos
		_queue_state(DogState.GUARD)


func command_sic(target: Node3D) -> void:
	if adopted and target != null:
		shielding = false
		sic_target = target
		_queue_state(DogState.SIC)


func command_seek(target: Node3D) -> void:
	if adopted and target != null:
		shielding = false
		seek_target = target
		_queue_state(DogState.SEEK)


# --- THE BOND + PERMADEATH (goal #13 — the emotional signature) ----------------
## Every dog remembers who you are TO IT. Petting, feeding, adoption, and
## carrying it back from the brink all deepen it; the bond pays in obedience and
## the will to stay. And when a dog goes down it goes DOWN — 45 seconds to reach
## it with a bandage, or it's GONE: a grave, a collar in your pack, a name on
## the memorial. Permadeath with a face.
var bond: float = 0.0
var downed: bool = false
var _bleed_out_t: float = 0.0
const BOND_TIERS: Array = ["STRAY", "COMPANION", "PARTNER", "SOULBOUND"]
## MEMORY LINES — the record remembers what you did and didn't do.
var times_saved: int = 0
var last_fed_day: int = 1
var _nag_day: int = 0
## SHIELD (the 5th command, SOULBOUND-only): the dog locks to your hip and the
## guard ring MOVES with you — earned, not bought.
var shielding: bool = false


## Bond tightens the heel: a SOULBOUND partner walks in your shadow.
func follow_mult() -> float:
	return 1.0 - 0.12 * bond_tier()


func command_shield() -> bool:
	if bond_tier() < 3:
		return false
	shielding = true
	_queue_state(DogState.GUARD)
	guard_pos = _owner_ref.global_position if _owner_ref else global_position
	return true


func bond_tier() -> int:
	return 3 if bond >= 80.0 else (2 if bond >= 45.0 else (1 if bond >= 15.0 else 0))


func add_bond(amount: float, main: Node = null) -> void:
	var t0 := bond_tier()
	bond = clampf(bond + amount, 0.0, 100.0)
	if bond_tier() > t0 and main != null and main.has_method("notify"):
		main.notify("💞 %s is your %s now" % [dog_name, BOND_TIERS[bond_tier()]])


func take_damage(amount: float) -> void:
	if downed:
		_bleed_out_t = maxf(0.0, _bleed_out_t - 8.0) # kicking a downed dog shortens its clock
		return
	hp = maxf(0.0, hp - amount)
	if _quad:
		_quad.flinch() # the hit reads on the body
	if _main and "audio" in _main and _main.audio:
		_main.audio.play_at("dog_whine", global_position, -8.0)
	ProtoFloater.pop(get_parent(), global_position + Vector3(0, 1.4, 0), "-%d" % int(amount), Color(0.9, 0.5, 0.4), 90)
	if hp <= 0.0:
		downed = true
		_bleed_out_t = 45.0
		if _quad:
			_quad.pose_dead() # the FLOP — the tail goes still, and you feel it
		if _main and _main.has_method("notify"):
			_main.notify("🆘 %s IS DOWN — 45 seconds. RUN. (a bandage saves %s)" % [dog_name, dog_name])


## The bandage save: you carried it back from the brink — it never forgets.
## And YOU remember: times_saved is a number you'll quote out loud.
func _stabilize(main: Node) -> void:
	downed = false
	hp = 30.0
	times_saved += 1
	if _quad:
		_quad.unpose_dead()
	add_bond(15.0, main)
	if main.has_method("grant_xp"):
		main.grant_xp("first_aid", 6.0)
	if times_saved > 1:
		main.notify("🩹 %s is up — that's %d times you've pulled %s back" % [dog_name, times_saved, dog_name])
	else:
		main.notify("🩹 %s is back on its feet — it looks at you differently now" % dog_name)


## The other ending. A GRAVE you can bury, the REMAINS with a collar you'll
## carry, a name on the memorial. The pack feels it. So do you.
func _die_forever() -> void:
	if _main != null:
		var grave := DogGrave.create(dog_name, BOND_TIERS[bond_tier()])
		_main.add_child(grave)
		grave.global_position = global_position + Vector3(1.2, 0, 0)
		if adopted:
			# The keepsake is LOOTABLE, not automatic — you choose to carry it.
			var remains := ProtoChest.create("%s's remains" % dog_name, {"dog_collar": 1}, false)
			_main.add_child(remains)
			remains.global_position = global_position
			_main.stress = minf(100.0, _main.stress + 25.0)
			if "fallen_dogs" in _main:
				_main.fallen_dogs.append({"name": dog_name, "breed": breed, "bond": BOND_TIERS[bond_tier()], "saves": times_saved})
			_main.notify("☠️ %s (%s · %s) IS GONE. The collar is there if you can face it." % [dog_name, breed, BOND_TIERS[bond_tier()]])
			if "audio" in _main and _main.audio:
				_main.audio.play_at("dog_whine", global_position, -2.0, 0.7) # the pack answers
		else:
			_main.notify("A stray went still out there.")
	queue_free()


## The grave — E to BURY it proper. One act, once: the road gets lighter.
class DogGrave:
	extends StaticBody3D
	var dog_name: String = ""
	var bond_name: String = ""
	var buried: bool = false
	var _marker: MeshInstance3D = null

	static func create(name_in: String, bond_in: String) -> DogGrave:
		var g := DogGrave.new()
		g.dog_name = name_in
		g.bond_name = bond_in
		g.add_to_group("interactable")
		g._marker = MeshInstance3D.new()
		var gm := BoxMesh.new()
		gm.size = Vector3(0.5, 0.9, 0.18)
		g._marker.mesh = gm
		g._marker.material_override = ProtoWorldBuilder.material(Color(0.32, 0.30, 0.27), 0.9)
		g._marker.position.y = 0.45
		g.add_child(g._marker)
		return g

	func interact_position() -> Vector3:
		return global_position

	func interact_prompt(_main_in: Node) -> String:
		return "" if buried else "E — Bury %s proper" % dog_name

	func interact(main: Node) -> void:
		if buried:
			return
		buried = true
		_marker.material_override = ProtoWorldBuilder.material(Color(0.45, 0.40, 0.32), 0.8)
		main.stress = maxf(0.0, main.stress - 20.0)
		if main.has_method("grant_xp"):
			main.grant_xp("kinship", 6.0)
		main.notify("⚰️ You bury %s proper (%s). The road feels a little lighter." % [dog_name, bond_name])


## Metasystem: collapse to a data record, and rebuild from one.
func to_record() -> Dictionary:
	return {"type": dog_type, "name": dog_name, "breed": breed,
		"pos": global_position, "guard_pos": guard_pos, "hp": hp, "bond": bond,
		"times_saved": times_saved, "last_fed_day": last_fed_day,
		"wounded": false, "killed": false}


static func from_record(rec: Dictionary, main_in: Node) -> ProtoDog:
	var d := ProtoDog.create(rec["type"], rec["name"], rec["breed"])
	d.adopted = true
	d._main = main_in
	d._owner_ref = main_in.player
	d.guard_pos = rec["guard_pos"]
	d.hp = rec.get("hp", 50.0)
	d.bond = float(rec.get("bond", 0.0)) # the bond survives the record
	d.times_saved = int(rec.get("times_saved", 0))
	d.last_fed_day = int(rec.get("last_fed_day", 1))
	d.state = DogState.GUARD
	return d


func _queue_state(s: DogState) -> void:
	var delay: float = params()["obey_delay"]
	# ⭐ KINSHIP: a bonded handler's commands land faster — the pack TRUSTS you.
	if _main and "character" in _main and _main.character:
		delay *= _main.character.kinship_obey_mult()
	delay *= 1.0 - 0.12 * bond_tier() # THIS dog's bond: a SOULBOUND barely needs the word
	if delay <= 0.03:
		state = s # instant obedience (Companion's signature; high Kinship earns it for all)
	else:
		_obey_queue.append([delay, s])


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity += get_gravity() * delta

	# DOWN: no legs, no senses — just a clock and shallow breathing. Reach it.
	if downed:
		_bleed_out_t -= delta
		velocity.x = move_toward(velocity.x, 0.0, 20.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 20.0 * delta)
		move_and_slide()
		if _bleed_out_t <= 0.0:
			_die_forever()
		return

	# Obedience delay queue
	var qi := 0
	while qi < _obey_queue.size():
		_obey_queue[qi][0] -= delta
		if _obey_queue[qi][0] <= 0.0:
			state = _obey_queue[qi][1]
			_obey_queue.remove_at(qi)
		else:
			qi += 1

	_threat_cooldown = maxf(0.0, _threat_cooldown - delta)
	_bite_cd = maxf(0.0, _bite_cd - delta)
	_jump_cd = maxf(0.0, _jump_cd - delta)
	_pounce_cd = maxf(0.0, _pounce_cd - delta)

	# MEMORY LINE: a dog that hasn't eaten says so — once a day, when you're close
	# enough to hear it (the nag is a nudge, not a siren).
	if adopted and _main != null and "daynight" in _main and _main.daynight != null:
		var today: int = _main.daynight.day
		if today - last_fed_day >= 2 and today != _nag_day and _near_owner(20.0):
			_nag_day = today
			_main.notify("🍖 %s hasn't eaten since Day %d — it doesn't complain. That's worse." % [dog_name, last_fed_day])
	match state:
		DogState.STRAY:
			velocity.x = move_toward(velocity.x, 0.0, 10.0 * delta)
			velocity.z = move_toward(velocity.z, 0.0, 10.0 * delta)
		DogState.STAY:
			velocity.x = move_toward(velocity.x, 0.0, 14.0 * delta)
			velocity.z = move_toward(velocity.z, 0.0, 14.0 * delta)
			_sense(delta)
		DogState.FOLLOW:
			_do_follow(delta)
			_sense(delta)
		DogState.ALERT:
			velocity.x = move_toward(velocity.x, 0.0, 16.0 * delta)
			velocity.z = move_toward(velocity.z, 0.0, 16.0 * delta)
			if _alert_face.length_squared() > 0.01:
				var yaw := atan2(-_alert_face.x, -_alert_face.z)
				_visual.rotation.y = lerp_angle(_visual.rotation.y, yaw, 14.0 * delta)
			_alert_t -= delta
			if _alert_t <= 0.0:
				state = DogState.FOLLOW if adopted else DogState.STRAY
			_sense(delta)
		DogState.GUARD:
			_do_guard(delta)
		DogState.SIC:
			# Guard BEFORE the typed call: a freed target (howler burned off, foe
			# despawned) would bounce off the Node3D parameter check every frame.
			if sic_target == null or not is_instance_valid(sic_target) \
					or not _chase_and_bite(sic_target, delta):
				sic_target = null
				state = DogState.FOLLOW if adopted else DogState.STRAY
		DogState.SEEK:
			_do_seek(delta)
		DogState.DIG:
			_do_dig(delta)

	# The rig reads STATE: legs run off speed, the tail wags/tucks off MORALE —
	# and a body off the floor flies the LEAP pose (jump/pounce read from above).
	if _quad:
		_quad.air_target = 0.0 if is_on_floor() else 1.0
		_quad.animate(delta, velocity.length(), morale())

	move_and_slide()


func _near_owner(dist: float) -> bool:
	return _owner_ref != null and is_instance_valid(_owner_ref) \
		and global_position.distance_to(_owner_ref.global_position) < dist


func _do_follow(delta: float) -> void:
	if _owner_ref == null or not is_instance_valid(_owner_ref):
		return
	var p: Dictionary = params()
	var heel: Vector3 = _owner_ref.global_position \
		+ Vector3(cos(_follow_angle), 0, sin(_follow_angle)) * p["follow_dist"] * follow_mult()
	var to_heel := heel - global_position
	to_heel.y = 0.0
	var dist := to_heel.length()
	# Catch-up sprint when left far behind; trot at heel.
	var speed: float = p["speed"] * (1.35 if dist > 12.0 else (1.0 if dist > 6.0 else 0.55))
	if dist > 0.6:
		var dir := to_heel.normalized()
		# THE CHOIR BALK (THE_INFECTED §3.3 — the bible's flagship tell): the dog
		# will NOT follow you into the ring. She stops at the edge, growls, and
		# waits — never a HUD marker, the read IS the dog.
		_balk_bark_cd = maxf(0.0, _balk_bark_cd - delta)
		if ProtoCarousel.choir_zone_at(global_position + dir * 7.0) and not ProtoCarousel.choir_zone_at(global_position):
			balking = true
			velocity.x = move_toward(velocity.x, 0.0, 42.0 * delta) # dig in HARD — momentum never carries her over the ring
			velocity.z = move_toward(velocity.z, 0.0, 42.0 * delta)
			if _balk_bark_cd <= 0.0:
				_balk_bark_cd = 4.0
				ProtoFloater.pop(get_parent(), global_position + Vector3(0, 1.4, 0), "grrr…", Color(0.9, 0.6, 0.3), 110)
			move_and_slide()
			return
		balking = false
		# Unstuck: pinned against a post/wall while trying to move → sidestep and
		# re-pick the heel angle (dogs flow around obstacles instead of pushing).
		if velocity.length() < 0.6 and dist > 2.0:
			_stuck_t += delta
			if _stuck_t > 0.35:
				_stuck_t = 0.0
				_follow_angle = randf() * TAU
				var side := Vector3(-dir.z, 0, dir.x) * (1.0 if randf() > 0.5 else -1.0)
				velocity += side * p["speed"] * 0.8
		else:
			_stuck_t = 0.0
		# AUTO-JUMP (MOVESET.txt, the money moment): a low thing between the dog
		# and your heel — fence, crate, truck bed — and the dog LEAPS it instead
		# of pinballing. Knee ray blocked + head-height ray clear = jumpable.
		if is_on_floor() and _jump_cd <= 0.0 and velocity.length() > 1.0 and _leap_blocked(dir):
			velocity.y = float(ProtoQuadruped.MOTION["leap"]["launch_h"]) # a MotionForge row
			velocity.x = dir.x * maxf(speed, 6.0)
			velocity.z = dir.z * maxf(speed, 6.0)
			_jump_cd = 0.9
		velocity.x = move_toward(velocity.x, dir.x * speed, 22.0 * delta)
		velocity.z = move_toward(velocity.z, dir.z * speed, 22.0 * delta)
		var yaw := atan2(-dir.x, -dir.z)
		_visual.rotation.y = lerp_angle(_visual.rotation.y, yaw, 10.0 * delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, 18.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 18.0 * delta)


func _do_guard(delta: float) -> void:
	# SHIELD: the guard ring rides YOUR hip — the post is wherever you are.
	if shielding and _owner_ref != null and is_instance_valid(_owner_ref):
		guard_pos = _owner_ref.global_position
	var p: Dictionary = params()
	var spd: float = p["speed"]
	var threat := _nearest_threat_near(guard_pos, p["threat_radius"])
	if threat:
		_chase_and_bite(threat, delta)
		return
	var to_post := guard_pos - global_position
	to_post.y = 0.0
	if to_post.length() > 1.5:
		var dir := to_post.normalized()
		velocity.x = move_toward(velocity.x, dir.x * spd, 20.0 * delta)
		velocity.z = move_toward(velocity.z, dir.z * spd, 20.0 * delta)
		_visual.rotation.y = lerp_angle(_visual.rotation.y, atan2(-dir.x, -dir.z), 10.0 * delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, 16.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 16.0 * delta)


func _do_seek(delta: float) -> void:
	if seek_target == null or not is_instance_valid(seek_target) \
			or (seek_target is ProtoStash and (seek_target as ProtoStash).taken):
		state = DogState.FOLLOW if adopted else DogState.STRAY
		return
	var p: Dictionary = params()
	var spd: float = p["speed"]
	var to_s := seek_target.global_position - global_position
	to_s.y = 0.0
	if to_s.length() > 1.8:
		var dir := to_s.normalized()
		velocity.x = move_toward(velocity.x, dir.x * spd, 20.0 * delta)
		velocity.z = move_toward(velocity.z, dir.z * spd, 20.0 * delta)
		_visual.rotation.y = lerp_angle(_visual.rotation.y, atan2(-dir.x, -dir.z), 10.0 * delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, 16.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 16.0 * delta)


## Chase a target and bite when in reach. Returns false if the target is gone.
func _chase_and_bite(target: Node3D, delta: float) -> bool:
	if target == null or not is_instance_valid(target) or target.get("dead") == true:
		return false
	var p: Dictionary = params()
	var spd: float = p["speed"]
	var to_t := target.global_position - global_position
	to_t.y = 0.0
	var d := to_t.length()
	if d > 1.5:
		var dir := to_t.normalized()
		# POUNCE (MOVESET.txt): inside the launch window SIC leaves the GROUND —
		# a leaping tackle that carries the teeth in. The read the pack fears.
		if d < 3.6 and is_on_floor() and _pounce_cd <= 0.0 and ProtoWeapon.melee_clear(self, target):
			velocity = dir * maxf(spd * 1.1, 8.0)
			velocity.y = 5.2
			_pounce_cd = 2.2
		velocity.x = move_toward(velocity.x, dir.x * spd, 22.0 * delta)
		velocity.z = move_toward(velocity.z, dir.z * spd, 22.0 * delta)
		_visual.rotation.y = lerp_angle(_visual.rotation.y, atan2(-dir.x, -dir.z), 12.0 * delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, 18.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 18.0 * delta)
		_bite(target)
	return true


## Is there a LOW obstacle between the dog and where it's going — something a
## real dog would clear in a bound? Knee ray hits, head-height ray doesn't.
func _leap_blocked(dir: Vector3) -> bool:
	var space := get_world_3d().direct_space_state
	var from := global_position + Vector3(0, 0.25, 0)
	var q := PhysicsRayQueryParameters3D.create(from, from + dir * 1.6)
	q.exclude = [get_rid()]
	if space.intersect_ray(q).is_empty():
		return false
	var high := global_position + Vector3(0, 1.15, 0)
	var q2 := PhysicsRayQueryParameters3D.create(high, high + dir * 2.4)
	q2.exclude = [get_rid()]
	return space.intersect_ray(q2).is_empty()


## THE DIG (MOVESET.txt): a Hunter walks to the packed earth its nose flagged,
## plants, and PAWS IT OPEN — the buried cache becomes loot on the ground.
func _do_dig(delta: float) -> void:
	if _dig_target == null or not is_instance_valid(_dig_target) or _dig_target.taken:
		_dig_target = null
		_dig_t = 0.0
		if _quad:
			_quad.dig_target = 0.0
		state = DogState.FOLLOW if adopted else DogState.STRAY
		return
	var to_t := _dig_target.global_position - global_position
	to_t.y = 0.0
	if to_t.length() > 1.1:
		var dir := to_t.normalized()
		var p: Dictionary = params()
		velocity.x = move_toward(velocity.x, dir.x * float(p["speed"]) * 0.8, 22.0 * delta)
		velocity.z = move_toward(velocity.z, dir.z * float(p["speed"]) * 0.8, 22.0 * delta)
		_visual.rotation.y = lerp_angle(_visual.rotation.y, atan2(-dir.x, -dir.z), 10.0 * delta)
		return
	velocity.x = move_toward(velocity.x, 0.0, 20.0 * delta)
	velocity.z = move_toward(velocity.z, 0.0, 20.0 * delta)
	if _quad:
		_quad.dig_target = 1.0 # paws to work — dirt flies
	_dig_t += delta
	if _dig_t >= 2.2:
		_dig_t = 0.0
		if _quad:
			_quad.dig_target = 0.0
		_dig_target.unearth(_main, self)
		_dig_target = null
		state = DogState.FOLLOW if adopted else DogState.STRAY


func _bite(target: Node3D) -> void:
	if _bite_cd > 0.0:
		return
	if not ProtoWeapon.melee_clear(self, target):
		return # a wall between = no teeth (the melee law)
	var p: Dictionary = params()
	var dmg: float = p.get("bite", 0.0)
	if dmg <= 0.0:
		return
	_bite_cd = 0.8
	if target.has_method("take_damage"):
		target.take_damage(dmg)
	if target.has_method("knock_down") and randf() < float(p.get("bite_kd", 0.0)):
		target.knock_down()


func _nearest_threat_near(pos: Vector3, radius: float) -> Node3D:
	var best: Node3D = null
	var bd: float = radius
	for node in get_tree().get_nodes_in_group("threat"):
		var t := node as Node3D
		if t and is_instance_valid(t):
			var dd := t.global_position.distance_to(pos)
			if dd < bd:
				bd = dd
				best = t
	return best


## The law of dogs: scan for threats (rear arc counts extra) and stashes (Hunter).
func _sense(delta: float) -> void:
	_scan_t -= delta
	if _scan_t > 0.0 or _owner_ref == null or not is_instance_valid(_owner_ref):
		return
	_scan_t = 0.35
	var p: Dictionary = params()
	var main := _main
	if main == null:
		return

	# Threats — a dog ALWAYS knows what's behind you. "Behind" means behind your
	# GAZE (the Look Arc's blind spot), which is exactly what the dog covers.
	if _threat_cooldown <= 0.0:
		var facing: Vector3 = _owner_ref.call("sight_facing") if _owner_ref.has_method("sight_facing") \
			else (_owner_ref.call("facing") if _owner_ref.has_method("facing") else Vector3.FORWARD)
		for node in get_tree().get_nodes_in_group("threat"):
			var t := node as Node3D
			if t == null or not is_instance_valid(t):
				continue
			var to_t: Vector3 = t.global_position - _owner_ref.global_position
			to_t.y = 0.0
			var d := to_t.length()
			var behind: bool = facing.dot(to_t.normalized()) < -0.25 if d > 0.5 else false
			var radius: float = p["threat_radius"] * (p["rear_mult"] if behind else 1.0)
			if d <= radius:
				_alert_face = to_t.normalized()
				state = DogState.ALERT
				_alert_t = 1.6
				_threat_cooldown = 5.0
				_mark_threat(t)
				if main.has_method("on_dog_alert"):
					main.on_dog_alert(self, t, behind)
				break

	_sense_nose()


## The dog's senses become YOUR senses: a mark floats over what it smelled.
func _mark_threat(t: Node3D) -> void:
	var mark := Label3D.new()
	mark.text = "❗"
	mark.font = ProtoHUD.emoji_font()
	mark.font_size = 220
	mark.pixel_size = 0.006
	mark.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	mark.modulate = Color(0.95, 0.3, 0.15)
	mark.position = Vector3(0, 2.4, 0)
	t.add_child(mark)
	var tw := mark.create_tween()
	tw.tween_interval(2.2)
	tw.tween_property(mark, "modulate:a", 0.0, 0.6)
	tw.tween_callback(mark.queue_free)


func _sense_nose() -> void:
	# Hunter's nose: point out stashes that haven't been looted.
	var p: Dictionary = params()
	var main := _main
	if main == null:
		return
	if p["nose_radius"] > 0.0:
		for node in get_tree().get_nodes_in_group("interactable"):
			if node is ProtoStash:
				var stash := node as ProtoStash
				if stash.taken or _pinged_stashes.has(stash):
					continue
				var d2 := global_position.distance_to(stash.global_position)
				if d2 <= p["nose_radius"]:
					_pinged_stashes.append(stash)
					_alert_face = (stash.global_position - global_position).normalized()
					state = DogState.ALERT
					_alert_t = 1.6
					if main.has_method("on_dog_nose"):
						main.on_dog_nose(self, stash)
					break
			elif node is ProtoBuriedCache:
				# THE DIG (MOVESET.txt): packed earth only a digger can open —
				# the nose flags it, then the dog goes and PAWS IT OUT itself.
				var cache := node as ProtoBuriedCache
				if cache.taken or _pinged_stashes.has(cache):
					continue
				if global_position.distance_to(cache.global_position) <= p["nose_radius"]:
					_pinged_stashes.append(cache)
					_dig_target = cache
					_queue_state(DogState.DIG)
					if main.has_method("notify"):
						main.notify("🐾 %s smells something UNDER the dirt — it starts digging!" % dog_name)
					break
