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
	# MUSIC STATIONS (owner ask): somebody out there still runs a transmitter.
	# Plays a real mp3 off game/media/music/radio/ — drop a file, it's on the air.
	{"id": "music", "weight": 0.28, "night_mult": 1.3},
	# THE HERD WARNING (THE_INFECTED 0.15 — the howlers-row clone; never "infected"
	# as an id, don't overload the group name): reveals the walking ground.
	{"id": "herd_warning", "weight": 0.18, "night_mult": 1.4},
	# 🚉 THE SEABOARD ON THE AIR (SEABOARD goal R6): dispatch still calls the line —
	# departures/arrivals flavor that reads the LIVE train.
	{"id": "rail_bulletin", "weight": 0.12, "night_mult": 1.0},
]
const LORE: Array = [
	"…heard the Bone Road's got a turn nobody marks. Maple Hill, they call it. Good people, if you find it…", # the §3.4 breadcrumb (MAP_POLISH_PLAN)
	# THE LORE BIBLE (docs/LORE_BIBLE.md §19) — the machine, the split, the static:
	"…the country didn't fall. It split…",
	"…the machine was built to save America. It decided America was the disease…",
	"…don't listen to the static too long…",
	"…if the road is open, somebody opened it for a reason…",
	"…that thing ain't dead. It's waiting for instructions…",
	"…the Carousel don't move people. It moves power…",
	"…Chicago don't need a president. It got a king…",
	"…the Solar King's men burn diesel like the old world never ended…",
	"…Carousel ring lit up over Norfolk last night — flesh only, they say, steel stays…",
	"…Cheyenne Mountain answers no hails. The machines hold the codes now…",
	"…scrip's only paper. Meridian honors it. Most holdouts honor iron…",
	"…if the dust rolls in, park it. Your eyes go before your tires do…",
	# THE KEYSTONE (COOP_PVP_MOBILE lore): the collapse wasn't bombs — it was
	# LOGISTICS. One national AI "optimized" the country into territories. Every
	# drone, ring, and relay still speaks its protocol. One world, one ghost.
	"…same handshake on every band, coast to coast. The optimizer never went dark. It just stopped taking requests…",
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
	# THE DIAL BLEEDS (THE_INFECTED 0.9 — the driver's guaranteed read): inside
	# a Choir zone the machine language OWNS the band — music, signals, all of
	# it dissolves into EBS fragments and nullspeech. Canon: the zone IS where
	# the signal is loud (never explain further, §20).
	if "player" in _main and _main.player != null and ProtoCarousel.choir_zone_at(_main.player.global_position):
		last_signal = "choir_bleed"
		_main.notify("📻 —EE-EEH— …zip code four-oh— …remain in— —EE— …the band is EATEN here…")
		return
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
		"rail_bulletin":
			# 🚉 SEABOARD DISPATCH (R6): where the train IS, read off the live line —
			# a timetable you overhear, not a menu you open.
			var tr: Variant = _main.get("train") if "train" in _main else null
			if tr == null or not is_instance_valid(tr):
				_main.notify("📻 '…Seaboard dispatch — no movement on the line today. Walk it or drive it…'")
				return
			var dw: int = tr.dwelling_station()
			if dw >= 0:
				var nxt_i: int = tr.next_station_index()
				_main.notify("📻 '…Seaboard dispatch — she holds at %s, boarding for %s. Fare's %d scrip…'" %
					[String(tr.stations[dw]["name"]),
					String(tr.stations[nxt_i]["name"]) if nxt_i >= 0 else "the turnaround",
					ProtoTrain.FARE_SCRIP])
			else:
				var nx: int = tr.next_station_index()
				_main.notify("📻 '…Seaboard dispatch — she's rolling. Next call: %s…'" %
					(String(tr.stations[nx]["name"]) if nx >= 0 else "end of the line"))
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
		"herd_warning":
			# the street register, §20-safe: warn, reveal, never explain
			var ang5 := rng.randf() * TAU
			var wpos := origin + Vector3(cos(ang5), 0, sin(ang5)) * rng.randf_range(180.0, 320.0)
			_main.vision_cone.reveal_at(wpos)
			for i5 in 4:
				var s5 := ProtoInfected.create("shambler")
				_main.add_child(s5)
				s5.global_position = wpos + Vector3(2.0 * float(i5), 0.4, 1.5 * float(i5 % 2))
			_main.notify("📻 '…herd crossed the county line at dusk. Forty head. Kill your engine and let the river talk…'")
		"lore":
			_main.notify("📻 %s" % LORE[rng.randi() % LORE.size()])
		"music":
			# A live station: real music off the owner's shelf. An empty shelf
			# reads as static (the world is quiet, never broken).
			if "music" in _main and _main.music != null and _main.music.play_random():
				_main.notify("📻 ♪ …a STATION, actually playing music… (%s)" % _main.music.now_playing)
			else:
				last_signal = "static"
				_main.notify("📻 …static…")
