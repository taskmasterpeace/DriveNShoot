## Proof for THE DASHBOARD PASS (docs/design/CAR_UI_REQUIREMENTS.md):
## P0-1 — the readout CONFIRMS the physical effect, never invents one. Stages a
##   real car through the real Damageable API to CRITICAL on engine/tires/battery,
##   asserts the PHYSICAL effect (misfire cough / grip drop / headlight strobe)
##   engages AND the dashboard renders the matching CRITICAL bar — plus the
##   fuel bar + 💥BLOW readout don't regress under an on-fire stage.
## P1-2/P1-3/P1-4 — dormant branches (occupant roster, GPS glyph, EV charge row):
##   no producer exists yet, so these feed SYNTHETIC dicts straight to
##   hud.set_dashboard() per the doc's own sim-hook instruction, proving the HUD
##   renders correctly once a producer starts setting the keys, while a dict
##   missing the keys (the real car.dashboard() today) renders unchanged.
## Run: godot --headless --path game res://proto3d/tests/dashboard_sim.tscn
extends Node

var passed := 0
var failed := 0
var main: Node3D
var hud: ProtoHUD


func _check(check_name: String, ok: bool) -> void:
	passed += 1 if ok else 0
	failed += 0 if ok else 1
	print("DASH: %s - %s" % ["PASS" if ok else "FAIL", check_name])


func _ready() -> void:
	print("DASH: start")
	get_tree().create_timer(60.0).timeout.connect(func() -> void:
		print("DASH: WATCHDOG"); print("DASH: FAILURES PRESENT"); get_tree().quit(1))
	main = (load("res://proto3d/proto3d.tscn") as PackedScene).instantiate()
	add_child(main)
	for _i in 8:
		await get_tree().process_frame

	var car: ProtoCar3D = main.cars[0]
	hud = main.hud
	car.use_player_input = false
	car.input_throttle = 1.0

	# --- P0-1a: CRITICAL engine — the MISFIRE (physical) + dashboard CONFIRM together ---
	car.components["engine"].damage(car.components["engine"].max_hp * 0.88) # → CRITICAL (ratio ~0.12)
	_check("engine component reads CRITICAL via the real damage API",
		car.components["engine"].tier() == Damageable.Tier.CRITICAL)
	car._misfire_cd = 0.2 # don't ride the full 1.8-4.2s cough cycle
	var saw_misfire := false
	for _i in 300: # ~5s at 60Hz, plenty for one cough
		await get_tree().physics_frame
		if car.misfiring:
			saw_misfire = true
		hud.set_dashboard(car.dashboard())
		if saw_misfire:
			break # got the cough — don't keep joyriding the compound at full song
	# PARK IT: a full-throttle unattended car can wreck itself into a husk over the
	# next stages (nondeterministic — the flake this sim shipped with), and a dead
	# car's damage-effects gate silently kills the battery-flicker check below.
	car.input_throttle = 0.0
	car.input_brake = 1.0
	_check("the PHYSICAL misfire (cough, cuts power) engages", saw_misfire)
	var d := car.dashboard()
	_check("set_dashboard receives tier == CRITICAL for engine", int(d["engine"]) == Damageable.Tier.CRITICAL)
	var expect_engine_bar := ProtoHUD._bar(car.components["engine"].ratio())
	_check("the rendered bar is the ▮▮▱▱-class CRITICAL string (%s)" % hud.dash_part_text("engine"),
		hud.dash_part_text("engine") == "🔧" + expect_engine_bar and expect_engine_bar.count("▮") <= 1)

	# --- P0-1b: fuel bar + 💥BLOW don't regress under fire staging ------------------
	car.components["engine"].hp = car.components["engine"].max_hp # heal so fire is isolated
	car.fuel = 63.0
	car.fire_state = ProtoCar3D.FireState.OK
	hud.set_dashboard(car.dashboard())
	_check("fuel bar renders %%d correctly pre-fire (%s)" % hud.dash_fuel_text(),
		hud.dash_fuel_text() == "⛽FUEL %s 63%%" % ProtoHUD._bar(0.63))
	car.fire_state = ProtoCar3D.FireState.ON_FIRE
	car.cook = 41.0
	hud.set_dashboard(car.dashboard())
	_check("💥BLOW readout shows while on fire", hud._dash_cook.visible and hud._dash_cook.text == "💥BLOW 41%")
	_check("fuel bar is UNCHANGED by the fire stage (%s)" % hud.dash_fuel_text(),
		hud.dash_fuel_text() == "⛽FUEL %s 63%%" % ProtoHUD._bar(0.63))
	car.fire_state = ProtoCar3D.FireState.OK
	hud.set_dashboard(car.dashboard())
	_check("💥BLOW hides once the fire clears", not hud._dash_cook.visible)

	# --- P0-1c: CRITICAL battery — the FLICKER (physical, strobing light_energy) ------
	# NIGHT first: main re-asserts set_headlights(daynight.is_dark()) every frame
	# (proto3d.gd), so a daytime boot silently forces the beams (and the flicker
	# gate) OFF no matter what this sim sets. Flicker is a night read anyway.
	main.daynight.hour = 23.5
	car.headlights_on = true
	car.set_headlights(true)
	for _i in 3:
		await get_tree().physics_frame # let headlight nodes actually build
	car.components["battery"].hp = 0.0
	car.components["battery"].hp = car.components["battery"].max_hp * 0.15 # CRITICAL, not BROKEN (BROKEN kills lights outright)
	_check("battery component reads CRITICAL via the real damage API",
		car.components["battery"].tier() == Damageable.Tier.CRITICAL)
	var energies: Array[float] = []
	for _i in 40:
		await get_tree().physics_frame
		if not car._headlights.is_empty() and car._headlights[0] is SpotLight3D:
			energies.append((car._headlights[0] as SpotLight3D).light_energy)
	var flickered := false
	for i in range(1, energies.size()):
		if not is_equal_approx(energies[i], energies[0]):
			flickered = true
	_check("the PHYSICAL battery flicker strobes headlight energy (%d samples, dead=%s active=%s)" %
		[energies.size(), car.dead, car.is_active], flickered)
	hud.set_dashboard(car.dashboard())
	var expect_batt_bar := ProtoHUD._bar(car.components["battery"].ratio())
	_check("the dashboard renders CRITICAL for battery too (%s)" % hud.dash_part_text("battery"),
		hud.dash_part_text("battery") == "🔋" + expect_batt_bar and expect_batt_bar.count("▮") <= 1)
	car.components["battery"].hp = car.components["battery"].max_hp # heal

	# --- P0-1d: CRITICAL tires — the SLOP (physical grip drop) + dashboard CONFIRM ---
	var w := car._front_wheels[0]
	car.components["tires"].hp = car.components["tires"].max_hp # start clean for the before-reading
	for _i in 2:
		await get_tree().physics_frame
	var grip_good: float = w.wheel_friction_slip
	car.components["tires"].damage(car.components["tires"].max_hp * 0.88) # → CRITICAL
	_check("tires component reads CRITICAL via the real damage API",
		car.components["tires"].tier() == Damageable.Tier.CRITICAL)
	for _i in 2:
		await get_tree().physics_frame
	var grip_critical: float = w.wheel_friction_slip
	_check("the PHYSICAL tire slop (grip drop, %.2f → %.2f) engages" % [grip_good, grip_critical],
		grip_critical < grip_good * 0.85)
	hud.set_dashboard(car.dashboard())
	var expect_tire_bar := ProtoHUD._bar(car.components["tires"].ratio())
	_check("the dashboard renders CRITICAL for tires too (%s)" % hud.dash_part_text("tires"),
		hud.dash_part_text("tires") == "🛞" + expect_tire_bar and expect_tire_bar.count("▮") <= 1)
	car.components["tires"].hp = car.components["tires"].max_hp # heal

	# --- P1-2: occupant clause — synthetic dict (no producer yet) --------------------
	var base := car.dashboard()
	hud.set_dashboard(base) # baseline: no occupants key at all
	_check("no occupant key → the clause is ABSENT (%s)" % hud.dash_status_text(),
		not hud.dash_status_text().contains("🧍") and not hud.dash_status_text().contains("🐕"))
	var occ := base.duplicate(true)
	occ["occupants_h"] = 2
	occ["occupants_d"] = 1
	hud.set_dashboard(occ)
	_check("occupants_h=2, occupants_d=1 → renders 🧍×2 🐕×1 (%s)" % hud.dash_status_text(),
		hud.dash_status_text().contains("🧍×2") and hud.dash_status_text().contains("🐕×1"))
	var occ_h_only := base.duplicate(true)
	occ_h_only["occupants_h"] = 1
	hud.set_dashboard(occ_h_only)
	_check("occupants_h=1 alone omits the dog glyph (%s)" % hud.dash_status_text(),
		hud.dash_status_text().contains("🧍×1") and not hud.dash_status_text().contains("🐕"))

	# --- P1-4: EV charge branch — synthetic dict (no producer yet) --------------------
	var ev := base.duplicate(true)
	ev["powertrain"] = "electric"
	ev["charge_pct"] = 40.0
	ev["max_range_mi"] = 250.0
	ev["solar_active"] = false
	ev["charge_state"] = "DRAINING"
	hud.set_dashboard(ev)
	_check("EV dict swaps ⛽FUEL for 🔋CHARGE (%s)" % hud.dash_fuel_text(),
		hud.dash_fuel_text().begins_with("🔋CHARGE") and not hud.dash_fuel_text().contains("⛽"))
	_check("EV range estimate ~100mi from 40%% of 250mi (%s)" % hud.dash_fuel_text(),
		hud.dash_fuel_text().contains("~100mi"))
	_check("EV charge_state DRAINING renders, no ☀️ badge (%s)" % hud.dash_fuel_text(),
		hud.dash_fuel_text().contains("DRAINING") and not hud.dash_fuel_text().contains("☀️"))
	var ev_solar := ev.duplicate(true)
	ev_solar["solar_active"] = true
	ev_solar["charge_state"] = "CHARGING"
	hud.set_dashboard(ev_solar)
	_check("solar_active → ☀️ badge shows, state flips to CHARGING (%s)" % hud.dash_fuel_text(),
		hud.dash_fuel_text().contains("☀️") and hud.dash_fuel_text().contains("CHARGING"))
	# A gas dict right after an EV one must render EXACTLY as before (no leak between branches).
	hud.set_dashboard(base)
	_check("a gas dict after an EV one renders ⛽FUEL again, no charge leak (%s)" % hud.dash_fuel_text(),
		hud.dash_fuel_text().begins_with("⛽FUEL") and not hud.dash_fuel_text().contains("🔋"))

	# --- P1-3: GPS glyph — synthetic dict (no producer yet) ---------------------------
	hud.set_dashboard(base) # no gps_tier key at all
	_check("no gps_tier key → the glyph is HIDDEN (today's behavior)", not hud.gps_glyph_shown())
	var gps_full := base.duplicate(true)
	gps_full["gps_tier"] = "full"
	hud.set_dashboard(gps_full)
	_check("gps_tier == 'full' → still HIDDEN (nothing to flag)", not hud.gps_glyph_shown())
	var gps_none := base.duplicate(true)
	gps_none["gps_tier"] = "none"
	hud.set_dashboard(gps_none)
	_check("gps_tier == 'none' → shows 🚫 (%s)" % hud.gps_glyph_text(),
		hud.gps_glyph_shown() and hud.gps_glyph_text() == "🚫")
	var gps_basic := base.duplicate(true)
	gps_basic["gps_tier"] = "basic"
	hud.set_dashboard(gps_basic)
	_check("gps_tier == 'basic' (any non-full tier) → shows 📡 (%s)" % hud.gps_glyph_text(),
		hud.gps_glyph_shown() and hud.gps_glyph_text() == "📡")

	print("DASH RESULTS: %d passed, %d failed" % [passed, failed])
	print("DASH: %s" % ("ALL CHECKS PASSED" if failed == 0 else "FAILURES PRESENT"))
	get_tree().quit(0 if failed == 0 else 1)
