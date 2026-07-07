## THE CAROUSEL PORTAL (docs/design/CAROUSEL_PORTAL.md) — a WORKING dev build of the
## vendored exit-portal (addons/exit_portal_free, MIT) as an interactable you ACTIVATE.
## Press E → a computer voice counts down "ten… nine… eight…" over ten seconds while the
## ring winds up, then it FIRES. This build is a standalone dev example: it is NOT wired
## to carousel.jump()/the bases yet (per the owner) — firing just announces + resets, the
## hook for the real jump is marked below. One instance is dev-placed by the safehouse.
##
## Interactable contract (matches ProtoGate / every other interactable in proto3d.gd):
## interact_position() · interact_prompt(main) · interact(main).
class_name ProtoCarouselPortal
extends Node3D

signal armed()
signal counted(n: int)     ## fires each second with the number just spoken (10..1)
signal fired()

enum State { IDLE, COUNTDOWN, FIRING }

const AMBER: Color = Color(1.0, 0.66, 0.14)        ## house style, NO purple
const AMBER_HOT: Color = Color(1.0, 0.86, 0.45)
const COUNT_FROM: int = 10
const TICK_SECONDS: float = 1.0
const RESET_AFTER: float = 2.6

var display_name: String = "CAROUSEL PORTAL"
var portal_scale: float = 0.7

var _main: Node = null
var _state: State = State.IDLE
var _t: float = 0.0
var _count: int = 0
var _reset_t: float = 0.0
var _portal: Area3D = null          ## the vendored portal_wobble visual (self-builds its mesh)
var _light: OmniLight3D = null


## Builds a ready-to-place portal. `main` may be null (set later / injected by a sim).
static func create(main: Node = null) -> ProtoCarouselPortal:
	var node := ProtoCarouselPortal.new()
	node._main = main
	node.add_to_group("interactable")

	# The visual: attach the addon's Area3D script to a bare node so it self-builds the
	# wobble mesh in _ready — no demo camera/environment tags along. Recolor to amber.
	var vis := Area3D.new()
	vis.set_script(load("res://addons/exit_portal_free/portal_wobble.gd"))
	vis.set("glow_color", AMBER)
	vis.set("coin_color_a", Color(1.0, 0.5, 0.12))
	vis.set("coin_color_b", Color(1.0, 0.85, 0.35))
	vis.scale = Vector3.ONE * node.portal_scale
	vis.position.y = 1.6 * node.portal_scale
	node._portal = vis
	node.add_child(vis)

	# A spill light so the ring reads at night; brightens as the countdown climbs.
	var lamp := OmniLight3D.new()
	lamp.light_color = AMBER
	lamp.omni_range = 8.0
	lamp.light_energy = 0.35
	lamp.position.y = 1.6 * node.portal_scale
	node._light = lamp
	node.add_child(lamp)
	return node


# --- Interactable contract -------------------------------------------------------

func interact_position() -> Vector3:
	return global_position


func interact_prompt(_main: Node) -> String:
	match _state:
		State.IDLE:
			return "E — ACTIVATE PORTAL"
		State.COUNTDOWN:
			return "PORTAL ARMING — %d" % _count
		_:
			return ""


func interact(main: Node) -> void:
	if _state == State.IDLE:
		arm(main)


# --- Activation + countdown ------------------------------------------------------

## Begin the ten-second arming sequence. Idempotent while already counting.
func arm(main: Node) -> void:
	if _state != State.IDLE:
		return
	if main != null:
		_main = main
	_state = State.COUNTDOWN
	_count = COUNT_FROM
	_t = 0.0
	_play("portal_arm")
	_notify("CAROUSEL PORTAL — arming sequence engaged. Stand clear.")
	armed.emit()
	_speak_count()   # "ten" right now; each second below drops it


## Deterministic advance — driven by _process in-game, called directly by the sim so
## the countdown is testable one manual second at a time (same pattern as ProtoStrikePlayer).
func advance(delta: float) -> void:
	match _state:
		State.COUNTDOWN:
			_t += delta
			while _t >= TICK_SECONDS and _state == State.COUNTDOWN:
				_t -= TICK_SECONDS
				_count -= 1
				if _count >= 1:
					_speak_count()
				else:
					_fire()
		State.FIRING:
			_reset_t -= delta
			if _reset_t <= 0.0:
				_reset()


func _process(delta: float) -> void:
	advance(delta)


func _speak_count() -> void:
	_play("portal_cd_%d" % _count)
	_play("blip")                       # a tick under the voice (existing synth SFX)
	counted.emit(_count)
	_ramp(float(COUNT_FROM - _count) / float(COUNT_FROM))


func _fire() -> void:
	_state = State.FIRING
	_reset_t = RESET_AFTER
	_play("portal_charge")
	_play("portal_go")
	_play("explosion")
	_ramp(1.0)
	# ── THE JUMP HOOK ─────────────────────────────────────────────────────────────
	# When wired to the Carousel (docs/design/CAROUSEL_PORTAL.md), THIS is where a live
	# gate would call carousel.jump(row["id"]). Dev build stops here on purpose.
	_notify("PORTAL ONLINE — (dev example; the Carousel jump is not wired to bases yet)")
	fired.emit()


func _reset() -> void:
	_state = State.IDLE
	_count = 0
	_t = 0.0
	_ramp(0.0)


## Drive the glow/light intensity by countdown progress p (0 = idle … 1 = fire).
func _ramp(p: float) -> void:
	if _light != null and is_instance_valid(_light):
		_light.light_energy = lerpf(0.35, 3.2, clampf(p, 0.0, 1.0))
	if _portal != null and is_instance_valid(_portal):
		_portal.set("glow_color", AMBER.lerp(AMBER_HOT, clampf(p, 0.0, 1.0)))


# --- main-optional plumbing (null-safe for headless sims) ------------------------

func _play(id: String) -> void:
	if _main != null and _main.get("audio") != null:
		_main.get("audio").play_at(id, global_position)


func _notify(text: String) -> void:
	if _main != null and _main.has_method("notify"):
		_main.notify(text)
