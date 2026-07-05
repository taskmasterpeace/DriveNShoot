## Town NPC v1 (WORLD_NPCS.md §3 — archetype = DATA, never new code). Two ship
## in this slice: the TRADER (core economy node — the Container panel becomes a
## shop) and the SEC-MAN (law/bounties — refuses work if your standing is bad).
## NPCs are hittable: shooting one is a CRIME the Respect Ledger remembers.
class_name ProtoNPC
extends CharacterBody3D

const FACTION := "meridian"

## Archetype rows: adding an NPC type = adding a row (behavior keys, not code).
const ARCHETYPES: Dictionary = {
	"trader": {"name": "Mercy", "title": "TRADER", "role": "trade",
		"color": Color(0.72, 0.55, 0.28),
		"greet": "Mercy: 'Jack talks. What are you buying?'",
		"refuse": "Mercy: 'Not to you. Not after what you did.'",
		"stock": {"bandage": 4, "meat": 3, "9mm": 30, "12ga": 12, "grenade": 2}},
	"secman": {"name": "Bridger", "title": "SEC-MAN", "role": "bounty",
		"color": Color(0.30, 0.40, 0.55),
		"greet": "Bridger: 'Got a lurker problem by the water point. 25 jack for its head.'",
		"refuse": "Bridger: 'Meridian doesn't work with your kind. Walk away.'",
		"stock": {}},
}

## Base prices (jack) — the Respect Ledger's price_mult scales them per faction.
const PRICES: Dictionary = {
	"bandage": 12, "meat": 6, "9mm": 1, "12ga": 2, "grenade": 18, "scrap": 4,
	"wrench": 10, "machete": 25, "pistol": 40, "shotgun": 60, "rocket": 15,
	"pipe_rocket": 75, "eyepatch": 8,
}

var archetype: String = "trader"
var npc_name: String = ""
var role: String = "trade"
var stock: ProtoContainer = null
var hp: float = 60.0
var _visual: Node3D
var _hurt_flash: float = 0.0


static func create(arch: String) -> ProtoNPC:
	var n := ProtoNPC.new()
	n.archetype = arch
	var a: Dictionary = ARCHETYPES[arch]
	n.npc_name = a["name"]
	n.role = a["role"]
	n.add_to_group("interactable")
	n.add_to_group("npc") # sight fan excludes NPCs — bodies aren't walls
	n.stock = ProtoContainer.new("%s's stall" % a["name"])
	for id in a["stock"]:
		n.stock.add(id, a["stock"][id])

	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.34
	cap.height = 1.7
	shape.shape = cap
	shape.position.y = 0.85
	n.add_child(shape)

	n._visual = Node3D.new()
	n.add_child(n._visual)
	var body := MeshInstance3D.new()
	var bmesh := CapsuleMesh.new()
	bmesh.radius = 0.33
	bmesh.height = 1.5
	body.mesh = bmesh
	body.material_override = ProtoWorldBuilder.material(a["color"], 0.85)
	body.position.y = 0.78
	n._visual.add_child(body)
	var head := MeshInstance3D.new()
	var hmesh := SphereMesh.new()
	hmesh.radius = 0.18
	hmesh.height = 0.36
	head.mesh = hmesh
	head.material_override = ProtoWorldBuilder.material(Color(0.80, 0.62, 0.47), 0.9)
	head.position.y = 1.64
	n._visual.add_child(head)
	var tag := Label3D.new()
	tag.text = "%s\n%s" % [a["name"], a["title"]]
	tag.font_size = 96
	tag.pixel_size = 0.0042
	tag.modulate = Color(0.95, 0.85, 0.55)
	tag.position = Vector3(0, 2.35, 0)
	tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	n._visual.add_child(tag)
	return n


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity += get_gravity() * delta
	else:
		velocity.x = move_toward(velocity.x, 0.0, 8.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 8.0 * delta)
	move_and_slide()
	if _hurt_flash > 0.0:
		_hurt_flash = maxf(0.0, _hurt_flash - delta)
		_visual.rotation.z = sin(_hurt_flash * 40.0) * 0.12
	elif _visual.rotation.z != 0.0:
		_visual.rotation.z = 0.0


func interact_position() -> Vector3:
	return global_position


func interact_prompt(main: Node) -> String:
	var a: Dictionary = ARCHETYPES[archetype]
	if main.respect.standing(FACTION) == "SUSPECT":
		return "E — 🚫 %s won't deal with you" % npc_name
	if role == "trade":
		return "E — Trade with %s" % npc_name
	# Sec-Man prompt follows the bounty state machine in main.
	match main.bounty.get("state", ""):
		"open":
			return "E — Bounty is LIVE — bring its head"
		"filled":
			return "E — Claim bounty (%d jack)" % int(main.bounty.get("reward", 25))
		_:
			return "E — Ask %s about WORK" % npc_name


func interact(main: Node) -> void:
	if main.respect.standing(FACTION) == "SUSPECT":
		main.notify(ARCHETYPES[archetype]["refuse"])
		return
	if role == "trade":
		main.notify(ARCHETYPES[archetype]["greet"])
		main.open_trade(self)
	else:
		main.secman_talk(self)


## Shooting a townsperson is a CRIME — the ledger remembers, the town gossips.
func take_damage(amount: float) -> void:
	hp = maxf(1.0, hp - amount) # town NPCs can't die in this slice — Stage 6 full adds it
	_hurt_flash = 0.8
	ProtoFloater.pop(get_parent(), global_position + Vector3(0, 2.0, 0), "CRIME!", Color(0.95, 0.3, 0.2), 130)
	var main := get_tree().current_scene
	if main == null or not main.has_method("on_npc_attacked"):
		main = get_parent()
	if main and main.has_method("on_npc_attacked"):
		main.on_npc_attacked(self, amount)
