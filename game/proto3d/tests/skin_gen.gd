## Procedural fallback for the PIXEL-ART SKINS (goal "pixel art, brought into 3D"). Writes
## four 16×16 wasteland tiles — road/wall/dirt/metal — to assets/skins/ so the spike has
## crisp pixel material even before/without PixelLab (which replaces these via the SAME
## material_textured path — a skin is just a PNG). Deterministic (position-hashed). No purple.
## Run: godot --headless --path game res://proto3d/tests/skin_gen.tscn
extends Node

const OUT := "res://assets/skins"
const SIZE := 16


func _n(x: int, y: int, salt: int) -> float:
	# Position-hashed 0..1 (wraps at the tile edge for near-seamless tiling).
	var h := hash(Vector3i(x % SIZE, y % SIZE, salt))
	return float(absi(h) % 100000) / 100000.0


func _road(x: int, y: int) -> Color:
	var base := Color(0.15, 0.14, 0.13)
	var n := _n(x, y, 1)
	if n < 0.12: return Color(0.07, 0.06, 0.06)          # a crack
	if n > 0.92: return Color(0.48, 0.38, 0.20)          # amber dust fleck
	return base * (0.85 + 0.35 * _n(x, y, 2))


func _wall(x: int, y: int) -> Color:
	var base := Color(0.60, 0.57, 0.50)                  # bone concrete
	var n := _n(x, y, 3)
	if n < 0.09: return Color(0.34, 0.32, 0.29)          # a pit
	return base * (0.80 + 0.35 * _n(x, y, 4))


func _dirt(x: int, y: int) -> Color:
	var base := Color(0.52, 0.40, 0.27)
	var n := _n(x, y, 5)
	if n < 0.14: return Color(0.30, 0.22, 0.14)          # dry crack
	if n > 0.88: return Color(0.50, 0.30, 0.16)          # rust patch
	return base * (0.82 + 0.32 * _n(x, y, 6))


func _metal(x: int, y: int) -> Color:
	var base := Color(0.50, 0.30, 0.16)                  # rust
	var v := base * (0.80 + 0.40 * _n(x, y, 7))
	if y % 3 == 0: v *= 0.72                              # corrugation ridge lines
	if _n(x, y, 8) > 0.90: return Color(0.66, 0.46, 0.22) # bright flake
	return v


func _gen(tex_name: String, fn: Callable) -> void:
	var img := Image.create(SIZE, SIZE, false, Image.FORMAT_RGBA8)
	for y in SIZE:
		for x in SIZE:
			var c: Color = fn.call(x, y)
			c.a = 1.0
			img.set_pixel(x, y, c)
	img.save_png("%s/%s.png" % [OUT, tex_name])
	print("SKINGEN: wrote %s.png" % tex_name)


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT))
	_gen("road", _road)
	_gen("wall", _wall)
	_gen("dirt", _dirt)
	_gen("metal", _metal)
	print("SKINGEN: DONE")
	get_tree().quit(0)
