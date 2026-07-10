## Proof for the PIXEL GAUGE CLUSTER (gauge.gd + data/gauges.json + hud_3d wiring —
## goal: "speedometers galore, make sure it functions"). Verifies:
##  - the data spine maps every drivable vclass to its dial (and unknown → sport),
##  - every dial PNG actually loads (the art shipped + imported),
##  - the code needle tracks speed (0 → start, max → start+sweep, half → straight up),
##  - the redline flag flips past the red zone,
##  - the HUD picks + drives the right gauge through the REAL set_dashboard/set_speed path.
## godot --headless --path game res://proto3d/tests/gauge_hud_sim.tscn
extends Node

var passed := 0
var failed := 0


func _check(n: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("GAUGE: %s - %s" % ["PASS" if ok else "FAIL", n])


# The 9 drivable classes → the dial each must pick (mirror of data/gauges.json vclasses).
const EXPECT := {
	"buggy": "sport", "semi": "rig", "scavenger": "salvage", "motorcycle": "ratbike",
	"pickup": "rustler", "van": "boxer", "pickup_truck": "warhauler",
	"rv": "homestead", "suv": "bulwark",
}


# A full, gas-car-safe dashboard dict (set_dashboard reads d[part] directly, no default).
func _make_dash(vclass: String) -> Dictionary:
	return {
		"engine": 0, "tires": 0, "battery": 0, "fuel_tank": 0, "chassis": 0,
		"ratios": {"engine": 1.0, "tires": 1.0, "battery": 1.0, "fuel_tank": 1.0, "chassis": 1.0},
		"fuel": 100.0, "on_fire": false, "cook": 0.0, "name": "Test Rig",
		"surface": "road", "struggling": false, "tire_name": "stock",
		"drive_factor": 1.0, "load": 0.0, "load_max": 0.0, "vclass": vclass,
	}


func _ready() -> void:
	# Watchdog (convention): this sim is synchronous, but never hang a headless run.
	get_tree().create_timer(20.0).timeout.connect(func() -> void:
		print("GAUGE: FAIL - watchdog timeout"); get_tree().quit(1))

	# 1) DATA SPINE — every drivable class maps to its dial; unknown falls back to sport.
	for vc in EXPECT:
		_check("vclass '%s' -> gauge '%s'" % [vc, EXPECT[vc]], ProtoGauge.for_vclass(vc) == EXPECT[vc])
	_check("unknown vclass falls back to 'sport'", ProtoGauge.for_vclass("spaceship") == "sport")

	# 2) THE ART — every dial PNG loads (shipped + imported).
	for id in EXPECT.values():
		_check("dial '%s' texture loads" % id, ProtoGauge.texture(id) is Texture2D)

	# 3) THE NEEDLE MATH — sport is 0..160, 270deg sweep from -135.
	var g := ProtoGauge.create(156.0)
	add_child(g)
	g.apply("sport")
	g.set_value(0.0)
	_check("0 mph -> needle at start (-135deg)", is_equal_approx(g.needle_deg, -135.0))
	g.set_value(80.0)
	_check("half (80) -> needle straight up (~0deg)", absf(g.needle_deg) < 0.5)
	g.set_value(160.0)
	_check("max (160) -> needle at start+sweep (135deg)", is_equal_approx(g.needle_deg, 135.0))
	g.set_value(400.0)
	_check("over-max clamps to 135deg", is_equal_approx(g.needle_deg, 135.0))

	# 4) THE REDLINE — sport redlines at 135.
	g.set_value(100.0)
	_check("below redline -> not hot", not g.redline_hot)
	g.set_value(150.0)
	_check("past redline -> hot (red)", g.redline_hot)

	# 5) THE HUD — picks + drives the right gauge through the real dashboard/speed path.
	var hud := ProtoHUD.create()
	add_child(hud)
	hud.set_dashboard(_make_dash("semi"))
	_check("HUD picks 'rig' for a semi", hud.gauge_id() == "rig")
	hud.set_speed(0.0, true)
	_check("HUD gauge shows a real dial while driving", hud.gauge_has_dial())
	hud.set_speed(50.0, true) # rig maxes at 100 -> 50 is exactly half -> straight up
	_check("HUD needle tracks speed (rig 50/100 -> ~0deg)", absf(hud.gauge_needle_deg()) < 0.5)
	hud.set_dashboard(_make_dash("suv"))
	_check("HUD swaps to 'bulwark' for an suv", hud.gauge_id() == "bulwark")
	hud.set_speed(0.0, false)
	_check("gauge hidden when not driving", not hud._gauge.visible)

	# 6) THE DASH CLUSTER (owner ask: finish the dashboard) — fuel / temp / tach load,
	# and a bottom-pivot fuel gauge's needle maps E(0)->start, F(max)->start+sweep, half->up.
	var dash_ids: Array[String] = ["fuel", "temp", "tach"]
	for did in dash_ids:
		_check("dash gauge '%s' texture loads" % did, ProtoGauge.texture(did) is Texture2D)
	var fg := ProtoGauge.create(84.0)
	add_child(fg)
	fg.apply("fuel")
	fg.set_value(0.0)
	_check("fuel E (0) -> needle at start (-80)", is_equal_approx(fg.needle_deg, -80.0))
	fg.set_value(100.0)
	_check("fuel F (100) -> needle at start+sweep (80)", is_equal_approx(fg.needle_deg, 80.0))
	fg.set_value(50.0)
	_check("fuel half -> needle straight up (~0)", absf(fg.needle_deg) < 0.5)
	_check("HUD built the dash cluster", hud._fuel_gauge != null and hud._temp_gauge != null and hud._tach_gauge != null)

	# 7) THE HUD PLATES (pixel health/ammo readouts) — the real set_hp/set_ammo path.
	hud.set_hp(75.0, 90.0, true)
	hud.set_ammo("🔫", "pistol", 12, 48, true)
	_check("HP plate built with a real plate texture", hud._hp_plate != null and hud._hp_plate.has_plate())
	_check("ammo plate built with a real plate texture", hud._ammo_plate != null and hud._ammo_plate.has_plate())
	_check("HP plate visible while shown", hud._hp_plate.visible)
	hud.set_hp(75.0, 90.0, false)
	_check("HP plate hidden when not shown", not hud._hp_plate.visible)

	print("GAUGE RESULTS: %d passed, %d failed" % [passed, failed])
	if failed == 0:
		print("ALL CHECKS PASSED")
	get_tree().quit(1 if failed > 0 else 0)
