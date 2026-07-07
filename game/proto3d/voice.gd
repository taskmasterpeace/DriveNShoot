## PROXIMITY VOICE CHAT — capture local mic → VAD gates transmission → 16kHz mono
## PCM16 frames over an UNRELIABLE net RPC → each frame plays out of THAT remote
## player's 3D body via AudioStreamPlayer3D + AudioStreamGenerator (the engine
## alone handles closer=louder via the player's max_distance/unit_size — no manual
## attenuation math here). No codec (2-4 players; small talk-frames, zero when
## silent). ONE instance runs locally (captures + owns the local VAD); it also
## hosts RX playback for every remote peer's incoming frames (attach_speaker).
##
## WALKIE-PASS SEAM (read this before touching route_mode): every peer's playback
## path is picked by `route_mode[peer_id]` — "proximity" (default, positional
## AudioStreamPlayer3D, distance falloff) or "walkie" (reserved: flat/bus playback,
## no distance falloff — a future walkie-talkie item flips only this string per
## peer and nothing else downstream changes). started_talking/stopped_talking are
## the hook point for future squelch/click sounds.
class_name ProtoVoice
extends Node

signal started_talking(peer_id: int)
signal stopped_talking(peer_id: int)

# --- Tunables (data-driven exports, not magic numbers buried in logic) ----------

@export_group("Capture")
## Target wire format — 16kHz mono PCM16, per the design. The actual mixer rate
## (44100/48000/etc, whatever the real output device reports) is read at runtime
## in _ready(); the decimation ratio is DERIVED from it, never hardcoded, so this
## stays correct on any device.
@export var target_rate: int = 16000
## VAD (voice-activity detection) RMS threshold on the captured 16-bit samples,
## normalized 0..1. "Default tuned generously" per the design brief — a normal
## speaking voice into a headset mic clears this with margin; a silent room does
## not. Exposed so a settings panel can offer a mic-sensitivity slider later.
@export var vad_threshold: float = 0.02
## How long silence must hold before TALKING → IDLE (the "hangover" window) — this
## is what keeps mid-word pauses from chopping a sentence into a dozen packets.
@export var vad_hangover_sec: float = 0.3
## Hard cap on one wire frame's payload, keeping every packet comfortably under a
## single unreliable ENet MTU (<1300 bytes per the design). Longer pulls are split.
@export var max_frame_bytes: int = 1200

@export_group("Playback / proximity")
## Conversational range: full-ish volume up to this many meters (AudioStreamPlayer3D
## unit_size — the engine's own inverse-distance rolloff does "closer = louder").
@export var hear_full_m: float = 25.0
## Beyond this, a remote voice is inaudible (AudioStreamPlayer3D.max_distance).
@export var hear_gone_m: float = 60.0
## Jitter-lite de-jitter depth: hold this many frames buffered before playback
## starts draining, smoothing out arrival-time wobble from the unreliable channel.
@export var jitter_frames: int = 2
## RX AudioStreamGenerator buffer length (seconds) — must comfortably outrun one
## network hiccup without over-buffering (which would add noticeable delay).
@export var generator_buffer_sec: float = 0.5

const BUS_NAME := "VoiceCapture"
const VAD := {IDLE = 0, TALKING = 1, HANGOVER = 2}

## True once a working capture chain exists (mic device present, effect attached).
## False headless / no-mic-device — the whole node degrades to a no-op capture
## side while RX playback (which needs no mic) still works fully.
var is_capture_ok: bool = false

## peer_id -> "proximity" | "walkie". Read by attach_speaker's routing and by any
## future walkie item; unset peers default to "proximity" (get() below).
var route_mode: Dictionary = {}
## Reserved for the walkie pass: a peer's flat/bus playback path (stubbed, unused
## by proximity peers). Kept here so the seam exists before the walkie feature
## does — see attach_speaker's ROUTING HOOK comment.
var static_mix: Dictionary = {} ## peer_id -> float (0..1 static/noise mix, walkie stub)

## Callable(PackedByteArray_seq_and_pcm) sink the net layer wires in — voice.gd
## does not know or care HOW frames leave the machine, only that they do.
var tx_sink: Callable = Callable()

var _capture_bus_idx: int = -1
var _mic_player: AudioStreamPlayer = null
var _capture_effect: AudioEffectCapture = null
var _mix_rate: float = 44100.0
var _decim_ratio: int = 3 ## derived in _ready() from the real mix rate

var _vad_state: int = VAD.IDLE
var _hangover_t: float = 0.0
var _tx_seq: int = 0

## peer_id -> {"player": AudioStreamPlayer3D, "gen": AudioStreamGeneratorPlayback,
## "queue": Array[PackedByteArray], "seq": int} — RX state per remote speaker.
var _speakers: Dictionary = {}


static func create() -> ProtoVoice:
	var v := ProtoVoice.new()
	v.name = "ProtoVoice"
	return v


func _ready() -> void:
	_mix_rate = float(AudioServer.get_mix_rate())
	if _mix_rate <= 0.0:
		_mix_rate = 44100.0
	_decim_ratio = maxi(1, int(round(_mix_rate / float(target_rate))))
	_ensure_capture_bus()
	_start_capture()
	set_process(true)


## Stop the mic stream before the node tree tears down — a still-`playing`
## AudioStreamPlayer holding an AudioStreamMicrophone otherwise leaks its
## resource + playback object at exit (every real disconnect calls
## net.gd's _teardown_local_voice -> queue_free, not just sim shutdown).
func _exit_tree() -> void:
	if _mic_player != null and is_instance_valid(_mic_player):
		_mic_player.stop()


# --- CAPTURE (a) --------------------------------------------------------------

## Idempotent — safe even if another ProtoVoice / a sim re-enters. Never touches
## audio.gd; this bus is voice-only and owned entirely by this file.
func _ensure_capture_bus() -> void:
	if AudioServer.get_bus_index(BUS_NAME) != -1:
		_capture_bus_idx = AudioServer.get_bus_index(BUS_NAME)
		return
	_capture_bus_idx = AudioServer.bus_count
	AudioServer.add_bus(_capture_bus_idx)
	AudioServer.set_bus_name(_capture_bus_idx, BUS_NAME)
	# Muted at the Master send — this bus exists ONLY to host the capture effect;
	# it must never make the local mic audible as a monitor/echo.
	AudioServer.set_bus_mute(_capture_bus_idx, true)


## Mic-device safety (f): a missing input device, an unsupported driver, or a
## capture effect that fails to attach must never crash — it just leaves
## is_capture_ok false and voice.gd quietly does not transmit. RX (hearing
## others) is unaffected either way.
func _start_capture() -> void:
	is_capture_ok = false
	if not ProjectSettings.get_setting("audio/driver/enable_input", false):
		push_warning("ProtoVoice: audio/driver/enable_input is off — mic capture disabled (RX playback still works).")
		return
	var effect := AudioEffectCapture.new()
	AudioServer.add_bus_effect(_capture_bus_idx, effect)
	_capture_effect = AudioServer.get_bus_effect(_capture_bus_idx, AudioServer.get_bus_effect_count(_capture_bus_idx) - 1) as AudioEffectCapture
	if _capture_effect == null:
		push_warning("ProtoVoice: AudioEffectCapture failed to attach — mic capture disabled.")
		return
	_mic_player = AudioStreamPlayer.new()
	_mic_player.bus = BUS_NAME
	_mic_player.stream = AudioStreamMicrophone.new()
	add_child(_mic_player)
	_mic_player.play()
	# In a headless/no-device run this will "succeed" structurally but never
	# actually deliver frames — can_get_frames() staying at 0 forever is exactly
	# the graceful degrade the design calls for, so we don't special-case it here.
	is_capture_ok = true


func _process(_delta: float) -> void:
	if not is_capture_ok or _capture_effect == null:
		return
	_pull_capture()


## Drains whatever the capture effect has buffered this frame, downsamples
## stereo float → 16kHz mono PCM16 by simple decimation (every Nth sample,
## channels averaged), then feeds the VAD + TX pipeline.
func _pull_capture() -> void:
	var available: int = _capture_effect.get_frames_available()
	if available <= 0:
		return
	var stereo: PackedVector2Array = _capture_effect.get_buffer(available)
	var pcm := PackedByteArray()
	pcm.resize((stereo.size() / _decim_ratio + 1) * 2)
	var out_i := 0
	var i := 0
	while i < stereo.size():
		var frame: Vector2 = stereo[i]
		var mono: float = (frame.x + frame.y) * 0.5
		var s16: int = clampi(int(mono * 32767.0), -32768, 32767)
		pcm.encode_s16(out_i * 2, s16)
		out_i += 1
		i += _decim_ratio
	pcm.resize(out_i * 2)
	if out_i > 0:
		_feed_vad(pcm)


# --- VAD (b): IDLE -> TALKING -> HANGOVER -> IDLE ------------------------------

func _feed_vad(pcm16: PackedByteArray) -> void:
	var loud := _rms_loud(pcm16) >= vad_threshold
	match _vad_state:
		VAD.IDLE:
			if loud:
				_vad_state = VAD.TALKING
				started_talking.emit(0) # 0 = the local mic (peer id unknown to itself)
				_send_frame(pcm16)
		VAD.TALKING:
			if loud:
				_send_frame(pcm16)
			else:
				_vad_state = VAD.HANGOVER
				_hangover_t = 0.0
				_send_frame(pcm16) # trailing frame still goes out (natural word-tail)
		VAD.HANGOVER:
			if loud:
				_vad_state = VAD.TALKING
				_send_frame(pcm16)
			else:
				_hangover_t += float(pcm16.size()) / 2.0 / float(target_rate)
				if _hangover_t >= vad_hangover_sec:
					_vad_state = VAD.IDLE
					stopped_talking.emit(0)
				# else: still in the hangover grace window — stay TALKING-silent,
				# no frame sent (silence costs zero bytes, per the design).


## Normalized RMS (0..1) of a PCM16 buffer — the VAD's loudness read.
static func _rms_loud(pcm16: PackedByteArray) -> float:
	var n: int = pcm16.size() / 2
	if n <= 0:
		return 0.0
	var sum := 0.0
	for i in n:
		var s: float = float(pcm16.decode_s16(i * 2)) / 32768.0
		sum += s * s
	return sqrt(sum / float(n))


func is_talking() -> bool:
	return _vad_state != VAD.IDLE


# --- TX (c): pack + hand to the net sink ---------------------------------------

## Packs seq + PCM bytes and hands to tx_sink, splitting any pull that would
## exceed max_frame_bytes so every wire packet stays comfortably under one
## unreliable ENet MTU. Pure and callable directly by sims (no net required).
func _send_frame(pcm16: PackedByteArray) -> void:
	var offset := 0
	while offset < pcm16.size():
		var chunk_len: int = mini(max_frame_bytes, pcm16.size() - offset)
		var chunk := pcm16.slice(offset, offset + chunk_len)
		offset += chunk_len
		_tx_seq += 1
		if tx_sink.is_valid():
			tx_sink.call(_tx_seq, chunk)


## Wire format helper (also used directly by sims/net to prove round-tripping):
## seq:int32 + raw PCM16 bytes, as one PackedByteArray ready for an RPC arg.
static func pack_frame(seq: int, pcm16: PackedByteArray) -> PackedByteArray:
	var out := PackedByteArray()
	out.resize(4)
	out.encode_s32(0, seq)
	out.append_array(pcm16)
	return out


static func unpack_frame(raw: PackedByteArray) -> Dictionary:
	if raw.size() < 4:
		return {"seq": 0, "pcm": PackedByteArray()}
	return {"seq": raw.decode_s32(0), "pcm": raw.slice(4, raw.size())}


# --- RX / PLAYBACK (d): per-peer jitter-lite buffer -> AudioStreamGenerator ----

## Attaches a positional voice speaker to `body` for `peer_id`. Call when a
## remote player's body is created (net.gd does this on peer_joined); safe to
## call again (idempotent — replaces any stale speaker on the same body).
func attach_speaker(peer_id: int, body: Node3D) -> void:
	detach_speaker(peer_id)
	var mode: String = String(route_mode.get(peer_id, "proximity"))
	var player: AudioStreamPlayer3D = null
	if mode == "walkie":
		# WALKIE STUB: reserved flat/bus path. Structurally wired now so the
		# future walkie pass only needs to build this branch out (bus name +
		## non-positional AudioStreamPlayer) — proximity peers never touch it.
		player = AudioStreamPlayer3D.new() # placeholder object; walkie pass replaces
		player.unit_size = 0.001 # effectively flat until the walkie pass tunes it
		player.max_distance = 0.0 # 0 = no distance falloff cap in Godot's model
	else:
		player = AudioStreamPlayer3D.new()
		player.unit_size = hear_full_m
		player.max_distance = hear_gone_m
	var gen := AudioStreamGenerator.new()
	gen.mix_rate = float(target_rate)
	gen.buffer_length = generator_buffer_sec
	player.stream = gen
	body.add_child(player)
	player.play()
	var playback := player.get_stream_playback() as AudioStreamGeneratorPlayback
	_speakers[peer_id] = {"player": player, "gen": playback, "queue": [], "last_seq": -1}


## Immediate free (not queue_free): attach_speaker calls this synchronously
## right before creating the replacement on the SAME peer id (idempotent
## re-attach), and a deferred free would leave both nodes live for one frame —
## two AudioStreamPlayer3D children fighting over the same peer's audio.
func detach_speaker(peer_id: int) -> void:
	if not _speakers.has(peer_id):
		return
	var entry: Dictionary = _speakers[peer_id]
	var player: AudioStreamPlayer3D = entry.get("player")
	if player != null and is_instance_valid(player):
		player.free()
	_speakers.erase(peer_id)


func has_speaker(peer_id: int) -> bool:
	return _speakers.has(peer_id)


## Net → voice: a raw wire packet arrived for peer_id. Unpacks, queues past the
## jitter-lite depth, then pushes samples into that peer's AudioStreamGenerator.
## Also flips that peer's TALKING state for any HUD/squelch hook (started/
## stopped_talking are keyed by the LOCAL mic's peer_id=0 above; a remote peer's
## talking edge is inferred here from frame arrival, so we track it separately).
func rx(peer_id: int, raw: PackedByteArray) -> void:
	if not _speakers.has(peer_id):
		return
	var unpacked: Dictionary = unpack_frame(raw)
	var seq: int = int(unpacked["seq"])
	var pcm: PackedByteArray = unpacked["pcm"]
	var entry: Dictionary = _speakers[peer_id]
	var last_seq: int = int(entry.get("last_seq", -1))
	if seq <= last_seq and last_seq != -1:
		return # stale/duplicate on the unreliable channel — drop, same law as net.gd
	entry["last_seq"] = seq
	var queue: Array = entry.get("queue", [])
	queue.append(pcm)
	while queue.size() > jitter_frames + 1:
		queue.pop_front()
	entry["queue"] = queue
	_speakers[peer_id] = entry
	if queue.size() >= jitter_frames or last_seq == -1:
		_drain_queue(peer_id)


func _drain_queue(peer_id: int) -> void:
	var entry: Dictionary = _speakers.get(peer_id, {})
	var playback: AudioStreamGeneratorPlayback = entry.get("gen")
	var queue: Array = entry.get("queue", [])
	if playback == null:
		return
	while not queue.is_empty():
		var pcm: PackedByteArray = queue[0]
		var frames := PackedVector2Array()
		var n: int = pcm.size() / 2
		frames.resize(n)
		for i in n:
			var s: float = float(pcm.decode_s16(i * 2)) / 32768.0
			frames[i] = Vector2(s, s)
		if playback.get_frames_available() < frames.size():
			break # generator's ring buffer is full for now — try again next frame
		playback.push_buffer(frames)
		queue.pop_front()
	entry["queue"] = queue
	_speakers[peer_id] = entry


# --- ROUTING HOOK (e): the walkie seam -----------------------------------------

## Flip a peer between "proximity" (default) and "walkie" (reserved). Re-attaches
## the speaker so the mode takes effect immediately if one already exists.
func set_route_mode(peer_id: int, mode: String) -> void:
	route_mode[peer_id] = mode
	if _speakers.has(peer_id):
		var body: Node3D = null
		var player: AudioStreamPlayer3D = _speakers[peer_id].get("player")
		if player != null and is_instance_valid(player):
			body = player.get_parent() as Node3D
		if body != null:
			attach_speaker(peer_id, body)


func set_static_mix(peer_id: int, mix: float) -> void:
	static_mix[peer_id] = clampf(mix, 0.0, 1.0)
