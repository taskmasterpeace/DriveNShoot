## THE Container (multi-use pillar #1): one class backs the backpack, car trunks,
## world chests, corpses, and vendor stock. Items are data rows.
class_name ProtoContainer
extends RefCounted

signal changed

## Item catalog (data — adding an item = a row). use_effect keys into main.use_item().
## cat groups the panel (CAT_ORDER below); desc is the tooltip in every container.
# THE CODE CATALOG is the authoritative FLOOR (these 30+ items always exist). At
# startup, data/items.json folds ADDITIVELY on top via ensure_items() — a JSON row
# with a NEW id appears in-game (so "a new item = a ROW" is true), but a JSON row
# reusing an existing id is ignored (code wins — stale JSON can never corrupt these).
static var ITEMS: Dictionary = {
	# -- weapons --
	"pistol": {"name": "Pistol", "emoji": "🔫", "usable": true, "w": 1.1, "cat": "weapon", "desc": "9mm sidearm. USE equips it."},
	"shotgun": {"name": "Pump shotgun", "emoji": "🔫", "usable": true, "w": 3.2, "cat": "weapon", "desc": "Doors, howlers, arguments. USE equips it."},
	"pipe_rocket": {"name": "Pipe rocket launcher", "emoji": "🧨", "usable": true, "w": 4.5, "cat": "weapon", "desc": "For things with wheels. USE equips it."},
	"wrench": {"name": "Wrench", "emoji": "🔧", "usable": true, "w": 1.4, "cat": "weapon", "desc": "Quiet, heavy, honest. USE equips it."},
	"machete": {"name": "Machete", "emoji": "🔪", "usable": true, "w": 1.1, "cat": "weapon", "desc": "Quiet and mean. USE equips it."},
	"axe": {"name": "Fire axe", "emoji": "🪓", "usable": true, "w": 2.6, "cat": "weapon", "desc": "Two hands, one chop. Puts things DOWN. USE equips it."},
	"mine": {"name": "Proximity mine", "emoji": "💣", "usable": true, "w": 1.6, "cat": "tool", "desc": "USE to plant it. Arms after a beat; the next thing that isn't you loses its legs."},
	"bat": {"name": "Baseball bat", "emoji": "🏏", "usable": true, "w": 1.3, "cat": "weapon", "desc": "Long, fast, and it LAUNCHES. Home-run a howler. USE equips it."},
	"grenade": {"name": "Grenade", "emoji": "💣", "usable": false, "w": 0.5, "cat": "weapon", "desc": "Throw with G."},
	# -- ammo --
	"9mm": {"name": "9mm rounds", "emoji": "•", "usable": false, "w": 0.02, "cat": "ammo", "desc": "Feeds the pistol."},
	"12ga": {"name": "12ga shells", "emoji": "•", "usable": false, "w": 0.05, "cat": "ammo", "desc": "Feeds the shotgun."},
	"rocket": {"name": "Rocket", "emoji": "🚀", "usable": false, "w": 1.5, "cat": "ammo", "desc": "Feeds the pipe launcher."},
	# -- meds --
	"bandage": {"name": "Bandage", "emoji": "🩹", "usable": true, "w": 0.2, "cat": "med", "desc": "Stops bleeding, treats the worst wound (+30)."},
	"medkit": {"name": "Field medkit", "emoji": "⛑️", "usable": true, "w": 1.8, "cat": "med", "desc": "The real thing: stops bleeding, treats EVERY part (+25)."},
	"painkillers": {"name": "Painkillers", "emoji": "💊", "usable": true, "w": 0.15, "cat": "med", "desc": "Takes the edge off — worst wound +12, nerves −8."},
	# -- food & drink --
	"meat": {"name": "Dried meat", "emoji": "🍖", "usable": true, "w": 0.4, "cat": "food", "food_val": 22, "desc": "Settles the nerves (−18 stress) and the stomach. Dogs love it (E to feed)."},
	"canned_food": {"name": "Canned beans", "emoji": "🥫", "usable": true, "w": 0.5, "cat": "food", "food_val": 35, "desc": "A hot meal: worst wound +10, stress −10, belly full."},
	"water": {"name": "Canteen", "emoji": "💧", "usable": true, "w": 0.8, "cat": "food", "food_val": 5, "desc": "Cold and clean. Refills your stamina, stress −6."},
	"coffee": {"name": "Trail coffee", "emoji": "☕", "usable": true, "w": 0.3, "cat": "food", "food_val": 4, "desc": "Stamina +40 and the shakes settle (−15 stress)."},
	"whiskey": {"name": "Rotgut whiskey", "emoji": "🥃", "usable": true, "w": 0.9, "cat": "food", "food_val": 6, "desc": "Stress −30. Your torso pays a little (−4)."},
	"cooked_meal": {"name": "Camp-stove meal", "emoji": "🍲", "usable": true, "w": 0.6, "cat": "food", "food_val": 60, "desc": "Hot food off your own stove. The road feels shorter after (−12 stress)."},
	# -- tools & gear --
	"jerry_can": {"name": "Jerry can (fuel)", "emoji": "🛢️", "usable": true, "w": 6.0, "cat": "tool", "desc": "+40 fuel into a rig within reach."},
	"car_parts": {"name": "Salvaged car parts", "emoji": "⚙️", "usable": true, "w": 3.5, "cat": "tool", "desc": "Field-repairs a rig's worst component (+35)."},
	"tire_kit": {"name": "Tire patch kit", "emoji": "🛞", "usable": true, "w": 1.2, "cat": "tool", "desc": "Patches a rig's tires (+50)."},
	"duct_tape": {"name": "Duct tape", "emoji": "🧷", "usable": true, "w": 0.3, "cat": "tool", "desc": "Holds a chassis together (+12). Briefly."},
	"flare": {"name": "Road flare", "emoji": "🚨", "usable": true, "w": 0.4, "cat": "tool", "desc": "30 seconds of burning red light. The dark blinks first."},
	"map_fragment": {"name": "Map fragment", "emoji": "🗺️", "usable": true, "w": 0.1, "cat": "tool", "desc": "Somebody's road knowledge — marks a town on YOUR map."},
	"eyepatch": {"name": "Eye patch", "emoji": "🏴‍☠️", "usable": true, "w": 0.05, "cat": "tool", "desc": "One eye, half the arc. Looks great."},
	"drone": {"name": "Scout drone", "emoji": "🛸", "usable": true, "w": 3.0, "cat": "tool", "desc": "USE deploys the bird — it patrols and pings threats."},
	"power_cell": {"name": "Power cell", "emoji": "🔋", "usable": false, "w": 0.4, "cat": "tool", "desc": "Mil-spec charge brick. The Carousel drinks one per jump."},
	"dog_collar": {"name": "Old collar", "emoji": "🐕", "usable": false, "w": 0.1, "cat": "loot", "desc": "A name worn smooth by your thumb. You carry it anyway."},
	"targeting_core": {"name": "Targeting core", "emoji": "🎛️", "usable": false, "w": 1.2, "cat": "tool", "desc": "Cheyenne's brain. With this, the Carousel jumps where YOUR map course points — THE DIAL."},
	"mount_schematic": {"name": "Mount schematic", "emoji": "📐", "usable": true, "w": 0.2, "cat": "tool", "desc": "Fort Hood's gift. USE at the wheel to bolt a hood MG to your rig (LMB fires, R reloads 9mm)."},
	# -- loot --
	"scrap": {"name": "Scrap metal", "emoji": "🔩", "usable": false, "w": 1.2, "cat": "loot", "desc": "The wasteland's raw material."},
	"scrip": {"name": "Scrip (coin)", "emoji": "🪙", "usable": false, "w": 0.02, "cat": "loot", "desc": "What passes for money out here."},
}

static var _items_folded: bool = false

## THE DATA-SPINE READ-BACK for items (roadmap #3): fold data/items.json ADDITIVELY
## onto the code floor. New JSON ids become real items ("a new item = a ROW"); ids
## already in code are left untouched (authoritative). Call once at boot. Field map:
## JSON category→cat, weight→w. Idempotent.
static func ensure_items() -> void:
	if _items_folded:
		return
	_items_folded = true
	var path := "res://data/items.json"
	if not FileAccess.file_exists(path):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		return
	for row in (parsed as Dictionary).get("items", []):
		if not (row is Dictionary):
			continue
		var iid: String = String((row as Dictionary).get("id", ""))
		if iid == "" or ITEMS.has(iid):
			continue # code is the floor; JSON only ADDS new rows
		ITEMS[iid] = {
			"name": String(row.get("name", iid)),
			"emoji": String(row.get("emoji", "❔")),
			"usable": bool(row.get("usable", false)),
			"w": float(row.get("weight", 0.5)),
			"cat": String(row.get("category", "loot")),
			"desc": String(row.get("desc", "")),
		}


static var _loot_tables: Dictionary = {} ## id -> [entries], from data/loot_tables.json
static var _loot_loaded: bool = false
static func _ensure_loot() -> void:
	if _loot_loaded:
		return
	_loot_loaded = true
	var p := "res://data/loot_tables.json"
	if not FileAccess.file_exists(p):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(p))
	if parsed is Dictionary:
		for t in (parsed as Dictionary).get("loot_tables", []):
			_loot_tables[String((t as Dictionary).get("id", ""))] = (t as Dictionary).get("entries", [])


## THE DATA-SPINE READ-BACK for loot (roadmap #3): roll a data/loot_tables.json table
## into {item_id: count}. weight = chance the entry appears; min/max = how many. Pass a
## seeded RNG for deterministic sims. Unknown table → empty (caller can fall back).
static func roll_loot(table_id: String, rng: RandomNumberGenerator) -> Dictionary:
	_ensure_loot()
	var out: Dictionary = {}
	for e in _loot_tables.get(table_id, []):
		if rng.randf() <= float((e as Dictionary).get("weight", 1.0)):
			var lo: int = int((e as Dictionary).get("min", 1))
			var hi: int = int((e as Dictionary).get("max", 1))
			var n: int = lo + (rng.randi() % maxi(1, hi - lo + 1))
			if n > 0:
				out[String((e as Dictionary)["item"])] = n
	return out


static func has_loot_table(table_id: String) -> bool:
	_ensure_loot()
	return _loot_tables.has(table_id)

## Panel grouping order (container_panel renders headers in this order).
const CAT_ORDER: Array = ["weapon", "ammo", "med", "food", "tool", "loot"]
const CAT_LABEL: Dictionary = {"weapon": "WEAPONS", "ammo": "AMMO", "med": "MEDS",
	"food": "FOOD & DRINK", "tool": "TOOLS & GEAR", "loot": "LOOT"}


func total_weight() -> float:
	var w := 0.0
	for id in slots:
		w += ITEMS.get(id, {"w": 0.5}).get("w", 0.5) * slots[id]
	return w

var label: String = "Container"
var slots: Dictionary = {} ## item_id -> count
## Hard capacity in kg (0 = unlimited). Trunks use this — a saddlebag holds 10 kg,
## a trailer 400 (VEHICLES.md §3). The backpack stays uncapped (soft encumbrance).
var max_weight: float = 0.0


func _init(label_in: String = "Container", max_weight_in: float = 0.0) -> void:
	label = label_in
	max_weight = max_weight_in


## Room for `count` of `id`? (0 cap = always.)
func has_room(id: String, count_in: int = 1) -> bool:
	if max_weight <= 0.0:
		return true
	var w: float = ITEMS.get(id, {"w": 0.5}).get("w", 0.5)
	return total_weight() + w * count_in <= max_weight + 0.001


func add(id: String, count: int = 1) -> void:
	slots[id] = slots.get(id, 0) + count
	changed.emit()


func remove(id: String, count: int = 1) -> bool:
	if slots.get(id, 0) < count:
		return false
	slots[id] -= count
	if slots[id] <= 0:
		slots.erase(id)
	changed.emit()
	return true


func count(id: String) -> int:
	return slots.get(id, 0)


func transfer_to(other: ProtoContainer, id: String, count_in: int = 1) -> bool:
	if not other.has_room(id, count_in):
		return false # trunk's full — big loads need big vehicles
	if remove(id, count_in):
		other.add(id, count_in)
		return true
	return false
