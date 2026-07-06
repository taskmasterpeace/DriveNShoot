## PROTO-3D AudioManager. Two tiers, zero call-site changes:
## 1. REAL SAMPLES from SoundForge (tools/soundforge — ElevenLabs-generated,
##    prompt-customizable per sound) load from res://assets/sfx/<id>.mp3 first.
## 2. SYNTH FALLBACK — any sound with no file keeps its original synthesized
##    buffer, so the game never depends on assets existing.
## Positional one-shots are pooled; loops (engine, fire) attach to their owners.
class_name ProtoAudio
extends Node

const RATE := 22050
const SFX_DIR := "res://assets/sfx"
## Sounds that must LOOP when loaded from files (synth versions set their own).
const LOOPED: Array = [
	"engine", "fire",
	"engine_motorcycle", "engine_diesel", "engine_muscle",
	"amb_desert", "amb_plains", "amb_forest", "amb_town", "amb_night", "amb_wind",
	"breath_sprint",
]

static var streams: Dictionary = {}
static var from_files: int = 0 ## how many streams came from SoundForge (sim/debug hook)
static var play_count: int = 0 ## sim hook

var _ui_player: AudioStreamPlayer


static func _synth(dur: float, gen: Callable) -> AudioStreamWAV:
	var n := int(dur * RATE)
	var data := PackedByteArray()
	data.resize(n * 2)
	for i in n:
		var t := float(i) / RATE
		var v: float = clampf(gen.call(t, float(i) / n), -1.0, 1.0)
		var s := int(v * 32767.0)
		data.encode_s16(i * 2, s)
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = RATE
	wav.data = data
	return wav


static func _build_all() -> void:
	if not streams.is_empty():
		return
	var rng := RandomNumberGenerator.new()
	rng.seed = 0xA0D10
	# Gunshot: sharp noise burst, fast decay
	streams["shot"] = _synth(0.18, func(t, p): return rng.randf_range(-1, 1) * exp(-p * 9.0) * 0.9)
	# Shotgun: bigger, longer boom
	streams["shotgun"] = _synth(0.35, func(t, p): return (rng.randf_range(-1, 1) * 0.7 + sin(t * 90.0 * TAU) * 0.3) * exp(-p * 6.0))
	# Explosion: low rumble + noise, slow decay
	streams["explosion"] = _synth(0.9, func(t, p): return (sin(t * 45.0 * TAU) * 0.5 + rng.randf_range(-1, 1) * 0.5) * exp(-p * 4.0))
	# Reload click
	streams["click"] = _synth(0.06, func(t, p): return sin(t * 1400.0 * TAU) * exp(-p * 14.0) * 0.5)
	# Bark: two short chirps
	streams["bark"] = _synth(0.22, func(t, p): return sin(t * (420.0 + 180.0 * sin(t * 30.0)) * TAU) * (0.8 if fmod(t, 0.11) < 0.06 else 0.0) * exp(-p * 3.0))
	# Growl: low pulsing noise
	streams["growl"] = _synth(0.5, func(t, p): return rng.randf_range(-1, 1) * (0.35 + 0.3 * sin(t * 28.0 * TAU)) * exp(-p * 2.0) * 0.6)
	# Hurt grunt
	streams["hurt"] = _synth(0.2, func(t, p): return sin(t * (180.0 - 80.0 * p) * TAU) * exp(-p * 5.0) * 0.7)
	# UI blip
	streams["blip"] = _synth(0.07, func(t, p): return sin(t * 880.0 * TAU) * exp(-p * 8.0) * 0.3)
	# Door creak: descending squeak
	streams["creak"] = _synth(0.4, func(t, p): return sin(t * (600.0 - 250.0 * p) * TAU + sin(t * 37.0) * 3.0) * 0.25 * exp(-p * 2.0))
	# Melee whoosh: air ripped by a swing (noise swept down, quick)
	streams["whoosh"] = _synth(0.16, func(_t, p): return rng.randf_range(-1, 1) * (0.5 - 0.5 * absf(p - 0.35)) * exp(-p * 4.0) * 0.7)
	# Melee thunk: meat & bone (low sine knock + noise crack)
	streams["thunk"] = _synth(0.14, func(t, p): return (sin(t * 95.0 * TAU) * 0.7 + rng.randf_range(-1, 1) * 0.3) * exp(-p * 10.0))
	# Hit-marker: tiny dry tick — a confirmed round on flesh
	streams["hitmark"] = _synth(0.045, func(t, p): return sin(t * 1900.0 * TAU) * exp(-p * 16.0) * 0.4)
	# Car horn: a two-note blare (calls the pack, and later: heat)
	streams["honk"] = _synth(0.5, func(t, p): return (signf(sin(t * 329.0 * TAU)) * 0.25 + signf(sin(t * 415.0 * TAU)) * 0.25) * minf(1.0, (1.0 - p) * 4.0))
	# The HOWL — the night pack announcing itself (rising-falling wolf tone)
	streams["howl"] = _synth(1.3, func(t, p): return sin(t * (380.0 + 320.0 * sin(p * PI)) * TAU) * (0.55 - 0.4 * absf(p - 0.4)) * exp(-p * 1.1))
	# Engine loop: saw-ish hum (looped)
	var eng := _synth(0.5, func(t, p): return (fmod(t * 65.0, 1.0) * 2.0 - 1.0) * 0.28 + sin(t * 32.5 * TAU) * 0.22)
	eng.loop_mode = AudioStreamWAV.LOOP_FORWARD
	eng.loop_end = int(0.5 * RATE)
	streams["engine"] = eng
	# Fire crackle loop
	var fire := _synth(0.6, func(t, p): return rng.randf_range(-1, 1) * (0.15 + 0.25 * float(rng.randf() > 0.92)))
	fire.loop_mode = AudioStreamWAV.LOOP_FORWARD
	fire.loop_end = int(0.6 * RATE)
	streams["fire"] = fire

	# --- Tier 1: SoundForge samples override the synths where they exist, ------
	# and manifest-only sounds (no synth fallback) load straight from the dir:
	# scan SFX_DIR so a new id needs only a file, never engine code.
	from_files = 0
	var ids: Dictionary = {}
	for id in streams.keys():
		ids[id] = true
	var dir := DirAccess.open(SFX_DIR)
	if dir:
		for f in dir.get_files():
			if f.ends_with(".mp3") or f.ends_with(".mp3.import"):
				ids[f.trim_suffix(".import").trim_suffix(".mp3")] = true
	for id in ids.keys():
		var path := "%s/%s.mp3" % [SFX_DIR, id]
		if not ResourceLoader.exists(path):
			continue
		var mp3: AudioStreamMP3 = load(path)
		if mp3 == null:
			continue
		if id in LOOPED:
			mp3.loop = true
		streams[id] = mp3
		from_files += 1


func _ready() -> void:
	ProtoAudio._build_all()
	_ui_player = AudioStreamPlayer.new()
	add_child(_ui_player)


## Positional one-shot. Self-frees on a timer (headless-safe — no finished signal needed).
func play_at(id: String, pos: Vector3, volume_db: float = 0.0, pitch: float = 1.0) -> void:
	if not streams.has(id):
		return
	ProtoAudio.play_count += 1
	var p := AudioStreamPlayer3D.new()
	p.stream = streams[id]
	p.volume_db = volume_db
	p.pitch_scale = pitch * randf_range(0.94, 1.06)
	p.max_distance = 90.0
	add_child(p)
	p.global_position = pos
	p.play()
	var tw := p.create_tween()
	tw.tween_interval(1.6)
	tw.tween_callback(p.queue_free)


## Flat UI sound (toasts, clicks).
func play_ui(id: String, volume_db: float = -8.0, pitch: float = 1.0) -> void:
	if not streams.has(id):
		return
	ProtoAudio.play_count += 1
	_ui_player.stream = streams[id]
	_ui_player.volume_db = volume_db
	_ui_player.pitch_scale = pitch
	_ui_player.play()


## Attach a looped stream to an owner (engine hum, fire crackle). Returns the player.
func attach_loop(id: String, owner: Node3D, volume_db: float = -6.0) -> AudioStreamPlayer3D:
	var p := AudioStreamPlayer3D.new()
	p.stream = streams[id]
	p.volume_db = volume_db
	p.max_distance = 70.0
	owner.add_child(p)
	p.play()
	return p


## Non-positional loop for YOUR OWN machine — the camera zooming out must never
## silence the engine under you (playtest). Caller frees it when done.
func attach_flat_loop(id: String, volume_db: float = -10.0) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.stream = streams[id]
	p.volume_db = volume_db
	add_child(p)
	p.play()
	return p
