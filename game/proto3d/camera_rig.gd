## PROTO-3D camera: top-down follow cam with scroll zoom, velocity look-ahead,
## and binoculars — hold to snap into a narrow-FOV cone looking far in the
## direction you're facing. This is the "you can finally SEE" fix.
class_name ProtoCameraRig
extends Node3D

@export var min_height: float = 9.0
@export var max_height: float = 58.0
@export var normal_fov: float = 62.0
@export var binocular_fov: float = 26.0 ## FOV at 1× magnification; zoom narrows it
@export var binocular_range: float = 240.0 ## how far the view travels to the mouse (owner: "see EVERYWHERE you point")
@export var binocular_sensitivity: float = 0.11 ## meters of aim per pixel of mouse
@export var binocular_zoom_min: float = 1.0
@export var binocular_zoom_max: float = 3.2
@export var lookahead_time: float = 0.55
@export var lookahead_max: float = 16.0
@export var speed_zoom_scale: float = 0.45 ## GTA2 trick: camera pulls out with speed
@export var speed_zoom_max: float = 22.0

var target: Node3D = null
var zoom_t: float = 0.45 ## 0 = close, 1 = far
## THE POKÉMON FIX: on foot the near-vertical camera flattened the 3D world into
## 2D tiles (playtest: "this looks like Pokémon"). When main sets on_foot, the rig
## drops lower and swings back to a ~50° pitch — walking reads as REAL 3D. Driving
## keeps the GTA2 top-down pull-out (that's the signature there).
var on_foot: bool = false
var binoculars: bool = false
## Mouse-aimed binocular offset in world XZ (meters from the player), soft-clamped to range.
var binocular_offset: Vector2 = Vector2.ZERO
var binocular_zoom: float = 1.4 ## magnification; mouse wheel changes it while glassing

var _cam: Camera3D
var _pos_smooth: Vector3
var _look_smooth: Vector3
var _binoc_was_on: bool = false
var _binoc_view: Vector2 = Vector2.ZERO ## eased binocular_offset — this is what kills the snap
var _trauma: float = 0.0 ## AAA juice: impact shake, decays fast, scales quadratically
var _shake_rng := RandomNumberGenerator.new()


## Kick the camera (crash, explosion, gunshot later). 0.3 = bump, 0.9 = explosion.
func add_trauma(amount: float) -> void:
	_trauma = clampf(_trauma + amount, 0.0, 1.0)


static func create() -> ProtoCameraRig:
	var rig := ProtoCameraRig.new()
	rig._cam = Camera3D.new()
	rig._cam.near = 0.5 # tighter depth range = no road shimmer at distance
	rig._cam.far = 600.0
	rig._cam.current = true
	rig.add_child(rig._cam)
	return rig


func add_zoom(amount: float) -> void:
	zoom_t = clampf(zoom_t + amount, 0.0, 1.0)


## Mouse-wheel magnification while binoculars are raised (zoom the far view in/out).
func add_binocular_zoom(amount: float) -> void:
	binocular_zoom = clampf(binocular_zoom + amount, binocular_zoom_min, binocular_zoom_max)


func snap_to_target() -> void:
	if target == null:
		return
	_pos_smooth = _desired_position()
	_look_smooth = target.global_position
	_cam.global_position = _pos_smooth


func _desired_position() -> Vector3:
	var height := lerpf(min_height, max_height, zoom_t)
	# GTA2 signature: the faster you go, the further the camera pulls out.
	var speed := _target_velocity().length()
	height += clampf(speed * speed_zoom_scale, 0.0, speed_zoom_max)
	# Always keep a little southward offset so the camera is never perfectly
	# vertical (look_at degenerates) and close zoom gets a GTA-modern tilt.
	var back := lerpf(7.0, 4.5, zoom_t)
	if on_foot:
		# ~41° pitch (owner 2026-07-08: flatten toward the behind-the-back 3/4 look —
		# more of the body reads, the puppet stops looking squat from straight above).
		# back scales with height so the angle holds at every zoom; buildings get
		# faces, the puppet gets a real silhouette, grass stops reading as tiles.
		height = lerpf(7.0, 34.0, zoom_t)
		back = maxf(6.0, height * 1.15)
	var base := target.global_position + Vector3(0, height, back)
	# Binoculars: the camera itself drifts partway toward where you're glassing,
	# so the view genuinely travels downrange while staying top-down.
	if binoculars:
		base += Vector3(_binoc_view.x, 0, _binoc_view.y) * 0.85 # ride almost all the way downrange
	return base


func _target_velocity() -> Vector3:
	if target is RigidBody3D:
		return (target as RigidBody3D).linear_velocity
	if target is CharacterBody3D:
		return (target as CharacterBody3D).velocity
	return Vector3.ZERO


func _unhandled_input(event: InputEvent) -> void:
	# Binoculars v2: while glassing, the mouse pushes the aim point downrange. Higher magnification
	# = finer aim (divide by zoom). Soft-clamped so hitting max range eases (that hard stop was the
	# "snap" you felt); the _binoc_view easing in _physics_process smooths raise/lower/edge.
	if binoculars and event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		# THE DISTANCE FIX: sweep speed grows with how far out you're looking —
		# near = surgeon, far = fast traverse (crossing 100 m no longer takes a
		# desk of mousepad). Zoom still steadies the hand.
		var far_scale := 1.0 + _binoc_view.length() / 28.0
		binocular_offset += Vector2(mm.relative.x, mm.relative.y) * (binocular_sensitivity * far_scale / binocular_zoom)
		if binocular_offset.length() > binocular_range:
			binocular_offset = binocular_offset.normalized() * binocular_range


## Direction (world XZ) the binoculars are aimed — used to turn the body.
func binocular_aim_dir() -> Vector3:
	if _binoc_view.length_squared() < 4.0:
		return Vector3.ZERO
	return Vector3(_binoc_view.x, 0, _binoc_view.y).normalized()


func _physics_process(delta: float) -> void:
	if target == null:
		return

	# Raise/lower: on raise, target a point a bit ahead of your facing; on lower, relax to zero.
	# We never jump — _binoc_view eases toward the target below, so raise/lower/edge all glide.
	if binoculars and not _binoc_was_on:
		var start_dir: Vector3 = target.call("facing") if target.has_method("facing") else Vector3.FORWARD
		start_dir.y = 0.0
		var d := (start_dir.normalized() if start_dir.length_squared() > 0.01 else Vector3.FORWARD) * 22.0
		binocular_offset = Vector2(d.x, d.z)
	elif not binoculars and _binoc_was_on:
		binocular_offset = Vector2.ZERO
	_binoc_was_on = binoculars

	# Ease the actual view toward the raw mouse target — THIS kills the snap.
	_binoc_view = _binoc_view.lerp(binocular_offset, 1.0 - exp(-7.0 * delta))

	# Where should we look? Ahead of motion normally; where the mouse aims with binoculars.
	var look_point: Vector3 = target.global_position
	if binoculars:
		look_point = target.global_position + Vector3(_binoc_view.x, 0, _binoc_view.y)
	else:
		var vel := _target_velocity()
		vel.y = 0.0
		var ahead := vel * lookahead_time
		if ahead.length() > lookahead_max:
			ahead = ahead.normalized() * lookahead_max
		look_point = target.global_position + ahead

	var k := 1.0 - exp(-6.0 * delta)
	_pos_smooth = _pos_smooth.lerp(_desired_position(), k)
	_look_smooth = _look_smooth.lerp(look_point, 1.0 - exp(-8.0 * delta))
	# Trauma shake: quadratic falloff so big hits SLAM and settle quick.
	_trauma = maxf(0.0, _trauma - delta * 1.6)
	var shake := _trauma * _trauma
	var shake_off := Vector3(
		_shake_rng.randf_range(-1.0, 1.0) * 0.9 * shake,
		_shake_rng.randf_range(-1.0, 1.0) * 0.5 * shake,
		_shake_rng.randf_range(-1.0, 1.0) * 0.9 * shake)
	_cam.global_position = _pos_smooth + shake_off

	var dir_to := (_look_smooth - _cam.global_position).normalized()
	var up := Vector3.UP
	if absf(dir_to.dot(up)) > 0.995:
		up = Vector3(0, 0, -1)
	_cam.look_at(_look_smooth, up)

	# Speed widens the lens a touch (AAA speed-feel), binoculars narrow it hard.
	var fov_target := binocular_fov if binoculars else normal_fov + clampf(_target_velocity().length() * 0.22, 0.0, 7.0)
	_cam.fov = lerpf(_cam.fov, fov_target, 1.0 - exp(-10.0 * delta))
