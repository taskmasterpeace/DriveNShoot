## THE RADIO — signal discovery (goal: a diegetic quest-giver and a reason to
## keep the engine on at night). Press Y to SCAN the airwaves: static… static…
## then a SIGNAL — a distress call that drops a real cache (guarded), a trader
## run worth a discount, a howler-pack warning that reveals the threat, or a
## fragment of the Divided States. Signals are ROWS; adding one = adding data.
class_name ProtoRadio
extends Node

const SCAN_CD := 6.0 ## the dial takes a beat to sweep

## The signal catalog. weight picks, night_mult favors the dark (the airwaves
## get busy when the sun dies — the reason to keep the engine running at night).
const SIGNALS: Array = [
	{"id": "distress", "weight": 0.3, "night_mult": 1.6},
	{"id": "trader", "weight": 0.25, "night_mult": 0.8},
	{"id": "howlers", "weight": 0.2, "night_mult": 2.0},
	{"id": "lore", "weight": 0.25, "night_mult": 1.0},
]
const LORE: Array = [
	"…the Solar King's men burn diesel like the old world never ended…",
	"…Carousel ring lit up over Norfolk last night — flesh only, they say, steel stays…",
	"…Cheyenne Mountain answers no hails. The machines hold the codes now…",
	"…scrip's only paper. Meridian honors it. Most holdouts honor iron…",
	"…if the dust rolls in, park it. Your eyes go before your tires do…",
]

var _main: Node = null
var _cd: float = 0.0
var rng := RandomNumberGenerator.new() ## sims seed this for determinism
var last_signal: String = "" ## sim hook


static func create(main: Node) -> ProtoRadio:
	var r := ProtoRadio.new()
	r._main = main
	r.rng.randomize()
	return r


func _physics_process(delta: float) -> void:
	_cd = maxf(0.0, _cd - delta)


## Y — sweep the dial. Roughly half the sweeps are dead air (the world is big
## and mostly quiet); the rest land a signal weighted by the hour.
func scan() -> void:
	if _cd > 0.0:
		_main.notify("📻 …the dial's still sweeping…")
		return
	_cd = SCAN_CD
	if _main.audio:
		_main.audio.play_ui("click", -10.0)
	# THE LIVING WORLD: an EMERGENCY BULLETIN cuts through the static FIRST — the world
	# still announcing a state takeover / new law on the dial after the fact. Text-first
	# (the fallback floor: a missing TTS/video never blocks the bulletin). One per sweep.
	if "world_state" in _main and _main.world_state != null:
		for b in _main.world_state.broadcast_queue:
			# TV bulletins belong to the SET's lower-third — the dial only drains
			# its own medium (otherwise the radio eats the television's news).
			if not bool(b.get("heard", false)) and String(b.get("medium", "radio")) != "tv":
				b["heard"] = true
				last_signal = "bulletin"
				_main.notify("📻 ⚠️ EMERGENCY BULLETIN — %s" % String(b.get("text", "")))
				return
	var dark: bool = _main.daynight.is_dark()
	if rng.randf() < (0.35 if dark else 0.5):
		_main.notify("📻 …static…")
		last_signal = "static"
		return
	# Weighted pick, night-shifted.
	var total := 0.0
	for s in SIGNALS:
		total += s["weight"] * (s["night_mult"] if dark else 1.0)
	var r := rng.randf() * total
	for s in SIGNALS:
		r -= s["weight"] * (s["night_mult"] if dark else 1.0)
		if r <= 0.0:
			_deliver(s["id"])
			return


func _deliver(id: String) -> void:
	last_signal = id
	var origin: Vector3 = _main.player.global_position
	match id:
		"distress":
			# A real place with real stakes: a cache, and the reason it's unclaimed.
			var ang := rng.randf() * TAU
			var pos := origin + Vector3(cos(ang), 0, sin(ang)) * rng.randf_range(250.0, 500.0)
			# Loot ROLLED from data (loot_tables.json chest_common) + a guaranteed
			# medkit so the run out here is always worth it. A data row, not a literal.
			var drop: Dictionary = ProtoContainer.roll_loot("chest_common", rng)
			drop["medkit"] = int(drop.get("medkit", 0)) + 1
			var c := ProtoChest.create("Distress cache", drop)
			_main.add_child(c)
			c.global_position = Vector3(pos.x, 0.05, pos.z)
			for i in 2:
				var l := ProtoLurker.create()
				_main.add_child(l)
				l.global_position = Vector3(pos.x, 0.4, pos.z) + Vector3(4.0 + 2.0 * i, 0, 3.0 - 2.0 * i)
			_main.set_map_course("📻 DISTRESS", Vector3(pos.x, 0, pos.z))
			_main.notify("📻 '…anyone… supplies… they're circling…' — a position, weak but clear")
		"trader":
			var t: Dictionary = _main.stream.usmap.town_near(origin + Vector3(rng.randf_range(-4000, 4000), 0, rng.randf_range(-4000, 4000)), 1e9) if _main.stream.usmap else {}
			if t.is_empty():
				_main.notify("📻 …a trader's manifest, too garbled to place…")
				return
			_main.set_map_course("📻 TRADE RUN", Vector3((t["pos"] as Vector2).x, 0, (t["pos"] as Vector2).y))
			_main.respect.add_esteem(ProtoNPC.FACTION, 2.0) # you passed the word along
			_main.notify("📻 '…%s market's flush this week…' — course set" % t["name"])
		"howlers":
			var ang2 := rng.randf() * TAU
			var hpos := origin + Vector3(cos(ang2), 0, sin(ang2)) * rng.randf_range(150.0, 300.0)
			_main.vision_cone.reveal_at(hpos)
			_main.spawn_howler_pack(hpos, 2)
			_main.notify("📻 '…pack moving near your grid — LIGHTS OUT…' — you know where they are. They don't know you heard.")
		"lore":
			_main.notify("📻 %s" % LORE[rng.randi() % LORE.size()])
