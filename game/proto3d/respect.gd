## The Respect Ledger v1 (WORLD_NPCS.md §6 — GTA2 × UO): per-faction Esteem /
## Infamy / Notoriety. Esteem opens work and lowers prices; Infamy closes doors
## and raises them; Notoriety is how KNOWN you are (fame and infamy both build
## it). One faction ships in this slice — MERIDIAN — but the ledger is N-wide.
class_name ProtoRespect
extends RefCounted

signal changed(faction: String)

## Standing bands per the design doc: pedestrian response scales with your net.
const BAND_HERO := 80.0
const BAND_TRUSTED := 40.0
## price curve: esteem discounts, infamy gouges (clamped so trade stays possible)
const PRICE_ESTEEM_RATE := 0.005
const PRICE_INFAMY_RATE := 0.008

var ledger: Dictionary = {"meridian": {"esteem": 0.0, "infamy": 0.0}}


func _pools(faction: String) -> Dictionary:
	if not ledger.has(faction):
		ledger[faction] = {"esteem": 0.0, "infamy": 0.0}
	return ledger[faction]


func add_esteem(faction: String, amount: float) -> void:
	_pools(faction)["esteem"] += amount
	changed.emit(faction)


func add_infamy(faction: String, amount: float) -> void:
	_pools(faction)["infamy"] += amount
	changed.emit(faction)


func esteem(faction: String) -> float:
	return _pools(faction)["esteem"]


func infamy(faction: String) -> float:
	return _pools(faction)["infamy"]


## Fame + infamy both make you KNOWN — the town talks either way.
func notoriety(faction: String) -> float:
	return esteem(faction) + infamy(faction)


func net(faction: String) -> float:
	return esteem(faction) - infamy(faction)


func standing(faction: String) -> String:
	var n := net(faction)
	if n >= BAND_HERO:
		return "HERO"
	if n >= BAND_TRUSTED:
		return "TRUSTED"
	if n >= 0.0:
		return "NEUTRAL"
	return "SUSPECT"


## <1 = they like you (discount), >1 = they gouge you. Clamped: even a monster
## can buy SOMETHING, even a hero pays SOMETHING.
func price_mult(faction: String) -> float:
	return clampf(1.0 - PRICE_ESTEEM_RATE * esteem(faction) + PRICE_INFAMY_RATE * infamy(faction), 0.55, 1.8)
