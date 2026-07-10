## THE FOOTPRINT FURNISHER (BUILDING_BOOK §2 / AR ruling 0.11 — I1 of the
## Living World loop): the door-safe anchor grid lifted OUT of house.gd so any
## walk-in shell can be furnished from its building-type ROW — and it obeys
## THE LOD LAW: a shell streams in as walls+sign+chest only; the furniture
## WAKES when a player closes to ~40 m and FREES again past ~55 m, so a town
## of shells never carries a town of fridges. Determinism: piece uids derive
## from the shell's own uid seed, so the same shell always wakes the same
## furniture with the same lazily-resolved loot (ProtoFurniture's law).
class_name ProtoFurnisher
extends Node3D

const WAKE_M := 40.0
const SLEEP_M := 55.0          ## hysteresis — no thrash at the boundary
const CHECK_EVERY := 20        ## frames between distance checks (cheap)
## Global awake cap (AR 0.11: ≤2-3 full interiors per chunk; the radius already
## bounds it — this is the backstop against a furniture-mall pileup).
static var awake_count: int = 0
const AWAKE_CAP := 6

var building_type: String = ""
var uid_seed: String = ""
var half_w: float = 5.0
var half_d: float = 4.0
var awake: bool = false
var pieces: Array = []
var _frame: int = 0


static func attach(root: Node3D, w: float, d: float, btype: String, seed_in: String) -> ProtoFurnisher:
	var f := ProtoFurnisher.new()
	f.name = "Furnisher"
	f.building_type = btype
	f.uid_seed = seed_in
	f.half_w = w * 0.5
	f.half_d = d * 0.5
	root.add_child(f)
	return f


func _physics_process(_delta: float) -> void:
	_frame += 1
	if _frame % CHECK_EVERY != 0:
		return
	var near := _nearest_player_dist()
	if not awake and near <= WAKE_M and awake_count < AWAKE_CAP:
		_wake()
	elif awake and near > SLEEP_M:
		_sleep()


func _nearest_player_dist() -> float:
	var best := 1e9
	for pl in get_tree().get_nodes_in_group("player3d"):
		if pl is Node3D and is_instance_valid(pl):
			best = minf(best, global_position.distance_to((pl as Node3D).global_position))
	return best


## house.gd's proven grid, generalized: pieces march the WEST wall from the
## back toward the door, overflow onto the BACK wall, every piece facing into
## the room, nothing ever blocking the (+Z center) doorway.
func _wake() -> void:
	awake = true
	awake_count += 1
	var row: Dictionary = ProtoLootResolver.building_row(building_type)
	var fset: Array = row.get("furniture_set", [])
	var placed := 0
	for i in fset.size():
		var fid := String(fset[i])
		# uid carries the INSTANCE's world position — two house_smalls a state
		# apart must not share a fridge's loot roll (determinism per shell,
		# variety across shells).
		var piece: Node3D = ProtoFurniture.create(fid, "%s@%d,%d:furn_%d" % [uid_seed,
			roundi(global_position.x), roundi(global_position.z), i], building_type)
		if piece == null:
			continue
		var slot: Vector3
		var facing: float
		if placed < 4: # west wall, back → doorward
			slot = Vector3(-half_w + 0.7, 0, -half_d + 1.0 + placed * 1.4)
			facing = -PI * 0.5 # face east, into the room
		else: # overflow: back wall, west → east
			slot = Vector3(-half_w + 1.4 + (placed - 4) * 1.6, 0, -half_d + 0.7)
			facing = 0.0 # face the door
		if slot.z > half_d - 1.6: # never crowd the doorway wall
			break
		add_child(piece)
		piece.position = slot
		piece.rotation.y = facing
		pieces.append(piece)
		placed += 1


func _sleep() -> void:
	awake = false
	awake_count = maxi(0, awake_count - 1)
	for p in pieces:
		if is_instance_valid(p):
			(p as Node).queue_free()
	pieces.clear()


func _exit_tree() -> void:
	if awake:
		awake = false
		awake_count = maxi(0, awake_count - 1)
