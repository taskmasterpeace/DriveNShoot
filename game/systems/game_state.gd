extends Node
## GameState: Town -> Run -> Extract + Profile Persistence

const UNITS_PER_MILE := 5000.0
const HEAT_STEP_MILES := 0.2

enum RunPhase { TOWN, RUN, EXTRACT }
var current_state: RunPhase = RunPhase.TOWN

# Run stats
var run_start_position: Vector2 = Vector2.ZERO
var max_forward_units: float = 0.0
var current_run_miles: float = 0.0
var best_miles: float = 0.0

# Heat
var current_heat: int = 0
var next_heat_mile_threshold: float = HEAT_STEP_MILES
var heat_log: Array[String] = []

# Economy / profile
var scrap: int = 0
var kits_tier: int = 0
var reliability_tier: int = 0
var armor_tier: int = 0

# Signals
signal state_changed(new_state: RunPhase)
signal run_started
signal run_ended(distance_miles: float)
signal distance_updated(miles: float)

signal heat_changed(heat: int)
signal heat_log_changed(log: Array[String])

signal scrap_changed(delta: int, total: int)
signal best_miles_changed(best: float)

signal upgrades_changed(kits: int, reliability: int, armor: int)
signal vehicle_unlocked(id: String)
signal vehicle_selected(id: String)
signal fragments_changed(total: int)

# Vehicle Progression
var lifetime_scrap: int = 0
var fragments: int = 0
var extraction_count: int = 0 ## Successful extractions — drives the escalating threat level.

## Threat scales the Deathlands with each successful extraction (capped): tougher, more frequent
## enemies and a sooner boss. Resets nothing — it's permanent meta-progression.
func get_threat_level() -> int:
	return mini(extraction_count, 10)
var unlocked_vehicles: Array = ["balanced"] ## Untyped so ConfigFile load / array assignment doesn't fail typed coercion.
var selected_vehicle_id: String = "balanced"

# Unlock Milestones
const UNLOCK_MILESTONE_BIKE = 1200
const UNLOCK_MILESTONE_FAST = 2000
const UNLOCK_MILESTONE_TANK = 5000

# Difficulty Constants (Locked for Alpha)
const BREAKDOWN_CHANCE_PER_MILE = 0.2
const BREAKDOWN_PITY_MILES = 0.2
const BREAKDOWN_COOLDOWN_MILES = 0.3
const HEAT_GAIN_DISTANCE = 1
const HEAT_GAIN_LOOT = 10
const HEAT_GAIN_REPAIR = 15
const HEAT_GAIN_CRASH = 5

# Vehicle Resources
const VEHICLE_DATA = {
	"balanced": "res://data/vehicles/vehicle_balanced.tres",
	"bike": "res://data/vehicles/vehicle_bike.tres",
	"fast": "res://data/vehicles/vehicle_fast.tres",
	"tank": "res://data/vehicles/vehicle_tank.tres"
}

# Cost Tables (Public for UI if needed)
const COST_KITS = [15, 35, 70]
const COST_RELIABILITY = [20, 45, 90]
const COST_ARMOR = [15, 40, 85]

# Weapons economy — buy guns at the garage, equip one as your vehicle's primary.
const WEAPON_CATALOG := {
	"machine_gun": {"name": "Machine Gun", "price": 0, "path": "res://items/weapons/machine_gun.tres"},
	"shotgun": {"name": "Shotgun", "price": 120, "path": "res://items/weapons/shotgun.tres"},
	"mine_dropper": {"name": "Mine Dropper", "price": 180, "path": "res://items/weapons/mine_dropper.tres"},
	"flamethrower": {"name": "Flamethrower", "price": 220, "path": "res://items/weapons/flamethrower.tres"},
	"rocket_launcher": {"name": "Rocket Launcher", "price": 350, "path": "res://items/weapons/rocket_launcher.tres"},
}
const WEAPON_ORDER := ["machine_gun", "shotgun", "mine_dropper", "flamethrower", "rocket_launcher"]
var owned_weapons: Array = ["machine_gun"] ## Untyped so ConfigFile loads/array assignments don't fail typed coercion.
var equipped_weapon_id: String = "machine_gun"
signal weapons_changed()

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	load_profile()
	# Push loaded values to UI immediately
	best_miles_changed.emit(best_miles)
	scrap_changed.emit(0, scrap)
	upgrades_changed.emit(kits_tier, reliability_tier, armor_tier)
	heat_changed.emit(current_heat)

# ----- Run lifecycle -----

func start_run() -> void:
	if current_state == RunPhase.RUN:
		return

	current_state = RunPhase.RUN
	run_start_position = Vector2.ZERO
	max_forward_units = 0.0
	current_run_miles = 0.0

	current_heat = 0
	next_heat_mile_threshold = HEAT_STEP_MILES
	heat_log.clear()
	
	# Track run start scrap for delta
	run_start_scrap = scrap

	state_changed.emit(RunPhase.RUN)
	run_started.emit()
	heat_changed.emit(0)
	heat_log_changed.emit(heat_log)

var run_start_scrap: int = 0
signal run_finished(results: Dictionary)

func fail_run(cause: String) -> void:
	if current_state != RunPhase.RUN: return
	_end_run(cause)

func _end_run(cause: String) -> void:
	current_state = RunPhase.EXTRACT # Or FAILED state? Keeping simple for now
	state_changed.emit(RunPhase.EXTRACT)

	# Extract or Die: scrap earned this run is only banked on a successful extraction.
	# Die in the Deathlands and you forfeit it (lifetime progress / unlocks are kept).
	var earned: int = scrap - run_start_scrap
	var banked: int = earned
	if cause != "Extracted":
		if earned > 0:
			scrap = run_start_scrap
			scrap_changed.emit(-earned, scrap)
		banked = 0

	if cause == "Extracted":
		extraction_count += 1 # permanent threat escalation

	if current_run_miles > best_miles and cause == "Extracted":
		best_miles = current_run_miles
		best_miles_changed.emit(best_miles)

	var results = {
		"miles": current_run_miles,
		"best": best_miles,
		"scrap_earned": earned,
		"scrap_banked": banked,
		"scrap_delta": banked,
		"cause": cause
	}

	run_ended.emit(current_run_miles) # Legacy support if needed
	run_finished.emit(results)

	save_profile()
	# Do NOT auto return to town. UI will handle it.

func set_run_start_position(pos: Vector2) -> void:
	# Called by RoadManager after teleport to the road
	run_start_position = pos

func update_distance(player_pos: Vector2) -> void:
	if current_state != RunPhase.RUN:
		return
	if run_start_position == Vector2.ZERO:
		# No distance tracking until start position is set properly.
		return

	# Forward is North (-Y)
	var forward_units := run_start_position.y - player_pos.y
	if forward_units <= max_forward_units:
		return

	max_forward_units = forward_units
	current_run_miles = max_forward_units / UNITS_PER_MILE
	distance_updated.emit(current_run_miles)
	set_contract_progress("distance", int(floor(current_run_miles))) # counts toward a distance bounty

	# Heat ticks deterministically per 0.2 mi thresholds
	while current_run_miles >= next_heat_mile_threshold:
		add_heat(1, "Distance")
		next_heat_mile_threshold += HEAT_STEP_MILES

func extract() -> void:
	if current_state != RunPhase.RUN:
		return

	# Bank miles only if >= 0.3 (Logic handled in _end_run or here? _end_run updates best if Extracted)
	# But we need to ensure local var is updated before calling end?
	# _end_run handles best_miles update if cause is "Extracted".
	
	# Penalty check
	if current_run_miles < 0.3:
		# Too short
		pass # Logic could be improved to show "Too Short" message

	_end_run("Extracted")

func return_to_town() -> void:
	current_state = RunPhase.TOWN
	state_changed.emit(RunPhase.TOWN)

# ----- Heat / Scrap -----

func add_heat(amount: int, source: String = "Unknown") -> void:
	current_heat += amount
	heat_changed.emit(current_heat)

	var log_entry := "[%s] +%d (%s)" % [Time.get_time_string_from_system(), amount, source]
	heat_log.push_front(log_entry)
	if heat_log.size() > 5:
		heat_log.resize(5)
	heat_log_changed.emit(heat_log)

func add_scrap(amount: int, source: String = "Loot") -> void:
	if amount <= 0:
		return
	scrap += amount
	lifetime_scrap += amount # Track lifetime
	scrap_changed.emit(amount, scrap)
	
	_check_unlocks()

func _check_unlocks() -> void:
	if lifetime_scrap >= UNLOCK_MILESTONE_BIKE and not unlocked_vehicles.has("bike"):
		unlocked_vehicles.append("bike")
		vehicle_unlocked.emit("bike")

	if lifetime_scrap >= UNLOCK_MILESTONE_FAST and not unlocked_vehicles.has("fast"):
		unlocked_vehicles.append("fast")
		vehicle_unlocked.emit("fast")
		# Notification?
		
	if lifetime_scrap >= UNLOCK_MILESTONE_TANK and not unlocked_vehicles.has("tank"):
		unlocked_vehicles.append("tank")
		vehicle_unlocked.emit("tank")

func add_fragment(amount: int) -> void:
	fragments += amount
	fragments_changed.emit(fragments)
	save_profile()

# ----- Upgrades API -----

func get_starting_kits() -> int:
	return 1 + kits_tier

func get_breakdown_multiplier() -> float:
	# 0: 1.0, 1: 0.8, 2: 0.6, 3: 0.45
	match reliability_tier:
		1: return 0.8
		2: return 0.6
		3: return 0.45
		_: return 1.0

func get_damage_multiplier() -> float:
	# 0: 1.0, 1: 0.9, 2: 0.8, 3: 0.7
	match armor_tier:
		1: return 0.9
		2: return 0.8
		3: return 0.7
		_: return 1.0

func try_buy_upgrade(type: String) -> bool:
	var tier = 0
	var costs = []
	match type:
		"kits": 
			tier = kits_tier
			costs = COST_KITS
		"reliability": 
			tier = reliability_tier
			costs = COST_RELIABILITY
		"armor": 
			tier = armor_tier
			costs = COST_ARMOR
		_: return false
	
	if tier >= 3: return false
	
	var cost = costs[tier]
	if scrap >= cost:
		scrap -= cost
		scrap_changed.emit(-cost, scrap)
		
		# Update Tier
		match type:
			"kits": kits_tier += 1
			"reliability": reliability_tier += 1
			"armor": armor_tier += 1
			
		upgrades_changed.emit(kits_tier, reliability_tier, armor_tier)
		save_profile()
		return true
		
	return false

## Buy a weapon if affordable and not already owned.
func try_buy_weapon(id: String) -> bool:
	if not WEAPON_CATALOG.has(id) or owned_weapons.has(id):
		return false
	var price: int = WEAPON_CATALOG[id]["price"]
	if scrap < price:
		return false
	scrap -= price
	scrap_changed.emit(-price, scrap)
	owned_weapons.append(id)
	weapons_changed.emit()
	save_profile()
	return true

## Equip an owned weapon as the vehicle's primary.
func equip_weapon(id: String) -> void:
	if owned_weapons.has(id):
		equipped_weapon_id = id
		weapons_changed.emit()
		save_profile()

## The currently equipped weapon resource (mounted on the player's vehicle).
func get_equipped_weapon() -> DataWeapon:
	var entry = WEAPON_CATALOG.get(equipped_weapon_id)
	if entry:
		return load(entry["path"]) as DataWeapon
	return null

# ----- Contracts (town mission board) -----

var active_contract: Dictionary = {} ## {kind, target, progress, reward, done}
signal contract_changed(contract: Dictionary)

## Take a contract if none is active. Returns false if one is already in progress.
func accept_contract(kind: String, target: int, reward: int) -> bool:
	if has_active_contract():
		return false
	active_contract = {"kind": kind, "target": target, "progress": 0, "reward": reward, "done": false}
	contract_changed.emit(active_contract)
	return true

## Report progress toward the active contract (e.g. a pursuer kill). Completes + pays out at target.
func report_contract_progress(kind: String, amount: int = 1) -> void:
	if not has_active_contract() or active_contract.get("kind") != kind:
		return
	active_contract["progress"] += amount
	if active_contract["progress"] >= active_contract["target"]:
		active_contract["done"] = true
		add_scrap(active_contract["reward"], "Contract")
	contract_changed.emit(active_contract)

## Set progress to an absolute value for threshold goals (e.g. miles reached). Only advances,
## never regresses, so a run reset doesn't undo a contract. Completes + pays out at target.
func set_contract_progress(kind: String, value: int) -> void:
	if not has_active_contract() or active_contract.get("kind") != kind:
		return
	if value <= int(active_contract["progress"]):
		return
	active_contract["progress"] = value
	if active_contract["progress"] >= active_contract["target"]:
		active_contract["done"] = true
		add_scrap(active_contract["reward"], "Contract")
	contract_changed.emit(active_contract)

## Hand out a random contract from the catalog (the mission board's rotating jobs).
func offer_random_contract() -> bool:
	if has_active_contract():
		return false
	var pick: Dictionary = Const.CONTRACTS[randi() % Const.CONTRACTS.size()]
	return accept_contract(pick["kind"], pick["target"], pick["reward"])

## Short progress label for the HUD tracker, e.g. "2/3 pursuers".
func contract_summary(c: Dictionary) -> String:
	if c.is_empty():
		return ""
	match c.get("kind"):
		"kills": return "%d/%d pursuers" % [c["progress"], c["target"]]
		"distance": return "%d/%d miles deep" % [c["progress"], c["target"]]
		"extract": return "%d/%d scrap banked" % [c["progress"], c["target"]]
	return "%d/%d" % [c["progress"], c["target"]]

## Briefing text for the contract-giver NPC when handing out the job.
func contract_offer_text(c: Dictionary) -> String:
	match c.get("kind"):
		"kills": return "wreck %d pursuers out in the Deathlands" % c["target"]
		"distance": return "push %d miles into the Deathlands in one run" % c["target"]
		"extract": return "extract with %d scrap banked" % c["target"]
	return "complete the job"

func has_active_contract() -> bool:
	return not active_contract.is_empty() and not active_contract.get("done", false)

func clear_finished_contract() -> void:
	if not active_contract.is_empty() and active_contract.get("done", false):
		active_contract = {}
		contract_changed.emit(active_contract)

func select_vehicle(id: String) -> void:
	if unlocked_vehicles.has(id):
		selected_vehicle_id = id
		vehicle_selected.emit(id)
		save_profile()

func get_selected_vehicle_data() -> DataVehicle:
	var path = VEHICLE_DATA.get(selected_vehicle_id, VEHICLE_DATA["balanced"])
	return load(path) as DataVehicle

# ----- Persistence -----

const SAVE_PATH := "user://save_profile.cfg"

func save_profile() -> void:
	var config := ConfigFile.new()
	config.set_value("Player", "scrap", scrap)
	config.set_value("Player", "lifetime_scrap", lifetime_scrap)
	config.set_value("Player", "fragments", fragments)
	config.set_value("Player", "extraction_count", extraction_count)
	config.set_value("Player", "best_miles", best_miles)
	config.set_value("Player", "selected_vehicle", selected_vehicle_id)
	config.set_value("Player", "unlocked", unlocked_vehicles)
	config.set_value("Player", "owned_weapons", owned_weapons)
	config.set_value("Player", "equipped_weapon", equipped_weapon_id)

	config.set_value("Upgrades", "kits_tier", kits_tier)
	config.set_value("Upgrades", "reliability_tier", reliability_tier)
	config.set_value("Upgrades", "armor_tier", armor_tier)
	var err := config.save(SAVE_PATH)
	if err != OK:
		push_warning("Save failed: %s" % err)

func load_profile() -> void:
	var config := ConfigFile.new()
	var err := config.load(SAVE_PATH)
	if err != OK:
		return

	scrap = int(config.get_value("Player", "scrap", 0))
	lifetime_scrap = int(config.get_value("Player", "lifetime_scrap", 0))
	fragments = int(config.get_value("Player", "fragments", 0))
	extraction_count = int(config.get_value("Player", "extraction_count", 0))
	best_miles = float(config.get_value("Player", "best_miles", 0.0))
	selected_vehicle_id = String(config.get_value("Player", "selected_vehicle", "balanced"))
	unlocked_vehicles = config.get_value("Player", "unlocked", ["balanced"])
	owned_weapons = config.get_value("Player", "owned_weapons", ["machine_gun"])
	equipped_weapon_id = String(config.get_value("Player", "equipped_weapon", "machine_gun"))
	
	kits_tier = int(config.get_value("Upgrades", "kits_tier", 0))
	reliability_tier = int(config.get_value("Upgrades", "reliability_tier", 0))
	armor_tier = int(config.get_value("Upgrades", "armor_tier", 0))
