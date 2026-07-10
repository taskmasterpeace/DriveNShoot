## Proof for the TV CABINET fleet (tv_face.gd + data/tvs.json + the media_panel skin —
## owner ask: "don't forget the tvs"). Verifies the data spine, each cabinet PNG loads,
## the face keeps the cabinet's aspect, and the SCREEN rect (where the channel/video plays)
## is placed from data — the picture is never baked into the art.
## godot --headless --path game res://proto3d/tests/tv_face_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("TVFACE: %s - %s" % ["PASS" if ok else "FAIL", n])


const EXPECT_SCREEN := {
	"crt": Rect2(0.17, 0.14, 0.53, 0.66),
	"flatscreen": Rect2(0.13, 0.12, 0.73, 0.71),
}


func _ready() -> void:
	get_tree().create_timer(20.0).timeout.connect(func() -> void:
		print("TVFACE: FAIL - watchdog timeout"); get_tree().quit(1))

	_check("2+ TV cabinets in the fleet", ProtoTVFace.ids().size() >= 2)
	var tids: Array[String] = ["crt", "flatscreen"]
	for tid in tids:
		_check("cabinet '%s' texture loads" % tid, ProtoTVFace.texture(tid) is Texture2D)
		var face := ProtoTVFace.create(tid)
		add_child(face)
		_check("'%s' face has a cabinet" % tid, face.has_cabinet())
		var r: Dictionary = ProtoTVFace.row(tid)
		var want_ratio: float = float(r["w"]) / float(r["h"])
		_check("'%s' keeps the cabinet aspect (%.2f)" % [tid, want_ratio], is_equal_approx(face.ratio, want_ratio))
		var exp: Rect2 = EXPECT_SCREEN[tid]
		_check("'%s' screen rect comes from data" % tid, face.screen_frac.is_equal_approx(exp))
		_check("'%s' exposes a screen Control for the video" % tid, face.screen is Control)
	_check("unknown cabinet is a safe null texture", ProtoTVFace.texture("nope") == null)

	print("TVFACE RESULTS: %d passed, %d failed" % [passed, failed])
	if failed == 0:
		print("ALL CHECKS PASSED")
	get_tree().quit(1 if failed > 0 else 0)
