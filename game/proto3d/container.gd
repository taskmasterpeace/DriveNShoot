## THE Container (multi-use pillar #1): one class backs the backpack, car trunks,
## world chests, corpses, and vendor stock. Items are data rows.
class_name ProtoContainer
extends RefCounted

signal changed

## Item catalog (data — adding an item = a row). use_effect keys into main.use_item().
## cat groups the panel (CAT_ORDER below); desc is the tooltip in every container.
const ITEMS: Dictionary = {
	# -- weapons --
	"pistol": {"name": "Pistol", "emoji": "🔫", "usable": true, "w": 1.1, "cat": "weapon", "desc": "9mm sidearm. USE equips it."},
	"shotgun": {"name": "Pump shotgun", "emoji": "🔫", "usable": true, "w": 3.2, "cat": "weapon", "desc": "Doors, howlers, arguments. USE equips it."},
	"pipe_rocket": {"name": "Pipe rocket launcher", "emoji": "🧨", "usable": true, "w": 4.5, "cat": "weapon", "desc": "For things with wheels. USE equips it."},
	"wrench": {"name": "Wrench", "emoji": "🔧", "usable": true, "w": 1.4, "cat": "weapon", "desc": "Quiet, heavy, honest. USE equips it."},
	"machete": {"name": "Machete", "emoji": "🔪", "usable": true, "w": 1.1, "cat": "weapon", "desc": "Quiet and mean. USE equips it."},
	"axe": {"name": "Fire axe", "emoji": "🪓", "usable": true, "w": 2.6, "cat": "weapon", "desc": "Two hands, one chop. Puts things DOWN. USE equips it."},
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
