## POPULATION CELLS (docs/design/POPULATION_WAR.md — Phase 2 of the war goal;
## gated by WAR_AI_RESEARCH.md). The world's population lives here as COUNTS,
## not instances: a persistent ledger keyed by the usmap 500m macro cell,
## ABOVE the disposable 128m streaming chunks. A cell that has never spawned an
## actor can still hold current/desired counts — this is what buys "a cleared
## forest slowly fills back in from its neighbors, not from nothing" instead of
## world_stream's old "destroy on unload, hash-reseed strangers on reload."
##
## THE INSTANTIATION BRIDGE (§3.2) lives in world_stream.gd — this file is the
## bookkeeping ONLY. It never constructs a ProtoHowler/ProtoLurker/ProtoNPC;
## it hands back {group, count} PLANS and world_stream spends its OWN existing
## spawner calls against that budget. That's the component boundary: this
## ledger doesn't know what a howler is, and never will.
class_name ProtoPopulation
extends Node

const TARGETS_PATH := "res://data/population_targets.json"
const GROUPS: PackedStringArray = ["civilian", "worker", "threat", "law", "faction_troops"]

## Code-floor defaults (POPULATION_WAR.md §7 Tuning Knobs). data/population_targets.json's
## "defaults" block folds ADDITIVELY over these — same additive-fold spine as
## ProtoNPC.ensure_prices()/ensure_archetypes(): JSON present replaces; absent, these hold,
## and behavior is IDENTICAL to a game with no targets file at all (backward-compat law).
var refill_unseen_hours: float = 2.0
var refill_step: int = 1
var min_spawn_dist_m: float = 45.0
var max_materialized_per_group: int = 4
var safe_bubble_m: float = 18.0
var render_distance_m: float = 300.0

## zone_tag -> {group: desired_count}. Code floor ships EMPTY on purpose — with
## no targets file (or an empty one) every zone_tag's desired mix is all-zero,
## so no cell is ever "under desired" and tick() is a no-op walk: the ledger
## exists but changes nothing, which IS backward compat (§4 of the brief).
var targets: Dictionary = {}
var _targets_loaded: bool = false

## "cx,cz" -> PopulationCell row (Dictionary; see _new_cell for the schema).
var cells: Dictionary = {}

## Ring-buffer-ish log of the last few refill/bootstrap events (sim assertions).
var log: Array = []

var usmap: ProtoUSMap = null
var _main: Node = null ## optional: SAFEHOUSE/homebase/player/vision_cone reads, all has_method/has-guarded


static func create(main: Node = null, usmap_ref: ProtoUSMap = null) -> ProtoPopulation:
	var p := ProtoPopulation.new()
	p._main = main
	p.usmap = usmap_ref if usmap_ref != null else ProtoUSMap.get_default()
	p._ensure_targets()
	return p


## Fold data/population_targets.json onto the code floor, once. "defaults" overrides
## the tuning knobs; "targets" ADDS zone_tag rows (existing ids in a hand-authored
## future code floor would win — today's floor is empty, so every JSON row lands).
func _ensure_targets() -> void:
	if _targets_loaded:
		return
	_targets_loaded = true
	if not FileAccess.file_exists(TARGETS_PATH):
		return # ABSENT file: floor stays as-is (empty targets, code-default knobs) — parity mode
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(TARGETS_PATH))
	if not (parsed is Dictionary):
		return
	var d: Dictionary = parsed
	var def: Dictionary = d.get("defaults", {})
	refill_unseen_hours = float(def.get("refill_unseen_hours", refill_unseen_hours))
	refill_step = int(def.get("refill_step", refill_step))
	min_spawn_dist_m = float(def.get("min_spawn_dist_m", min_spawn_dist_m))
	max_materialized_per_group = int(def.get("max_materialized_per_group", max_materialized_per_group))
	safe_bubble_m = float(def.get("safe_bubble_m", safe_bubble_m))
	render_distance_m = float(def.get("render_distance_m", render_distance_m))
	for zone_tag in (d.get("targets", {}) as Dictionary):
		if not targets.has(String(zone_tag)): # floor-authoritative on id collision
			targets[String(zone_tag)] = (d["targets"][zone_tag] as Dictionary).duplicate()


# --- The game-hour clock (WAR_AI_RESEARCH §1.2's timers, our 24-min-day timebase) ---------

## Monotonic game-hours since day 0 — daynight.hour wraps every 24h, so a cell's
## timestamp needs the day folded in or a save loaded a day later would look "just seen."
func _now_h() -> float:
	if _main != null and "daynight" in _main and _main.daynight != null:
		return float(_main.daynight.day) * 24.0 + float(_main.daynight.hour)
	return 0.0


# --- Cell identity + bootstrap -------------------------------------------------------------

func cell_key(pos: Vector3) -> String:
	var c := _cell_coord(pos)
	return "%d,%d" % [c.x, c.y]


func _cell_coord(pos: Vector3) -> Vector2i:
	if usmap != null and usmap.ok:
		return usmap.cell_of(pos.x, pos.z)
	var cm: float = usmap.cell_m if usmap != null else 500.0
	return Vector2i(int(floor(pos.x / cm)), int(floor(pos.z / cm)))


## The cell row for a world position — bootstraps it (zone_tag/biome/faction
## derived ONCE, cached) if this is the first time anything has touched it.
## Never returns null: "a cell that has never been visited can still hold
## current_pop counts" (§8 acceptance) — this IS that guarantee.
func cell_at(pos: Vector3) -> Dictionary:
	var key := cell_key(pos)
	if not cells.has(key):
		cells[key] = _new_cell(key, pos)
	var row: Dictionary = cells[key]
	# THE PRE-ECO SAVE HEAL (audit GAP-10): a cell serialized before the eco
	# wire has no "eco" dict — without this backfill the ecosystem is silently
	# DEAD in every already-explored cell of an old save, forever.
	if not row.has("eco"):
		var biome: String = usmap.biome_at(pos) if (usmap != null and usmap.ok) else "scrub"
		row["eco"] = {
			"food_avail": 0.45,
			"prey_density": {"swamp": 0.5, "forest": 0.35, "farmland": 0.3, "plains": 0.3}.get(biome, 0.15),
			"predator_pressure": {"swamp": 0.6, "forest": 0.2}.get(biome, 0.1),
			"corpse_heat": 0.0,
			"water_rot": 0.55 if biome == "swamp" else 0.25,
		}
	return row


func _new_cell(key: String, pos: Vector3) -> Dictionary:
	var zone := _derive_zone_tag(pos)
	var faction := "free_counties"
	if _main != null and "world_state" in _main and _main.world_state != null:
		var st: String = _main.stream.current_state(pos) if ("stream" in _main and _main.stream != null) else ""
		if st != "":
			faction = _main.world_state.controller_of(st)
	var desired: Dictionary = _desired_for_zone(zone)
	var biome: String = usmap.biome_at(pos) if (usmap != null and usmap.ok) else "scrub"
	var row := {
		"id": key,
		"zone_tag": zone,
		"biome": biome,
		"controlling_faction": faction,
		"desired_pop": desired.duplicate(),
		"current_pop": {"civilian": 0, "worker": 0, "threat": 0, "law": 0, "faction_troops": 0},
		"last_seen_time": _now_h(),
		"last_noise_time": 0.0,
		"last_cleared_time": -1.0,
		"protected": _is_protected(pos),
		# THE ECO DICT (LIVING_WOUND_ECOSYSTEM §3.2 — P1 subset of the ten):
		# the sector's living floats, seeded BY BIOME. Humans left; the wild
		# didn't — swamps and forests start rich (the Alley lives on first
		# touch), worked land starts middling, everything else "recovering,
		# not returned". water_rot: swamps start damp.
		"eco": {
			"food_avail": 0.45,
			"prey_density": {"swamp": 0.5, "forest": 0.35, "farmland": 0.3, "plains": 0.3}.get(biome, 0.15),
			"predator_pressure": {"swamp": 0.6, "forest": 0.2}.get(biome, 0.1),
			"corpse_heat": 0.0,
			"water_rot": 0.55 if biome == "swamp" else 0.25,
		},
	}
	# THE ONE AUTHORED NEST (LWE §9-P1 / F3): the Alley's den cell runs hot
	# from first TOUCH — everywhere else the apex bar (0.75) must be earned.
	if key == cell_key(ProtoEcology.AUTHORED_NEST):
		(row["eco"] as Dictionary)["predator_pressure"] = 0.8
	# COLD START (the eco→world bridge's bootstrap half): a fresh cell BANKS the
	# wildlife its floats support, so the first chunk to load here realizes a
	# living sector — not an empty one waiting hours of reconcile ticks.
	if not bool(row["protected"]):
		var wseed: Dictionary = ProtoEcology.wildlife_desired(row)
		for g in wseed:
			row["current_pop"][g] = int(wseed[g])
	log.append("bootstrap %s zone=%s protected=%s" % [key, zone, row["protected"]])
	return row


## zone_tag by the same anchors POPULATION_WAR.md §3.1 names: biome first, then
## road/town proximity narrows it toward the "lived-in" tags. Read-only usmap calls.
func _derive_zone_tag(pos: Vector3) -> String:
	if usmap == null or not usmap.ok:
		return "thick_forest"
	var biome := usmap.biome_at(pos)
	var near_road := not usmap.road_near(pos, 95.0).is_empty()
	var near_town := not usmap.town_near(pos, 200.0).is_empty()
	if biome == "urban" or near_town:
		return "suburbs" if not near_town or String(usmap.town_near(pos, 200.0).get("kind", "")) != "city" else "industrial"
	match biome:
		"swamp":
			# the Alley's own shoulder: rats haunt the wreck lines where the
			# road cuts the swamp (audit GAP-5 — rodents were unreachable in
			# the whole P1 corridor because every swamp cell read thick_forest)
			return "road_shoulder" if near_road else "thick_forest"
		"forest", "mountains":
			return "thick_forest"
		"farmland", "plains":
			return "house_field" if near_road else "thick_forest"
		"scrub", "desert":
			return "road_shoulder" if near_road else "thick_forest"
		_:
			return "road_shoulder" if near_road else "thick_forest"


func _desired_for_zone(zone: String) -> Dictionary:
	var row: Dictionary = targets.get(zone, {})
	var out := {}
	for g in GROUPS:
		out[g] = int(row.get(g, 0))
	return out


## Safehouse suppression (§3.1/§5): ANY anchor (SAFEHOUSE + homebase.HOME today;
## generalized so a future base doesn't need new code — §9's sim proves a SECOND
## anchor works) whose safe_bubble_m radius intersects this position.
func _protected_anchors() -> Array:
	var anchors: Array = []
	if _main != null:
		if "SAFEHOUSE" in _main:
			anchors.append(_main.SAFEHOUSE)
		if "homebase" in _main and _main.homebase != null and "HOME" in _main.homebase:
			anchors.append(_main.homebase.HOME)
	if anchors.is_empty(): # no main/homebase available (a bare-ledger sim) — the doc's own constant
		anchors.append(Vector3(110, 0, -323))
	return anchors


func _is_protected(pos: Vector3) -> bool:
	var p2 := Vector2(pos.x, pos.z)
	for a in _protected_anchors():
		var av: Vector3 = a if a is Vector3 else (a.global_position if (a is Node3D and is_instance_valid(a)) else Vector3.ZERO)
		if Vector2(av.x, av.z).distance_to(p2) <= safe_bubble_m:
			return true
	return false


# --- Perception writes (world_stream/howler call these on real player events) --------------

func mark_seen(pos: Vector3) -> void:
	cell_at(pos)["last_seen_time"] = _now_h()


func mark_cleared(pos: Vector3) -> void:
	cell_at(pos)["last_cleared_time"] = _now_h()


# --- Death / removal write-back (§3.2's "death-removal always fires first") ----------------

## Called from a death handler (ProtoHowler.take_damage/ProtoLurker.take_damage's
## dead=true branch) BEFORE queue_free(). Clears the actor's meta so a subsequent
## unload-bank walk sees a taggless node and does nothing (no double-accounting).
func on_actor_removed(actor: Node) -> void:
	if actor == null or not is_instance_valid(actor):
		return
	if not actor.has_meta("pop_cell") or not actor.has_meta("pop_group"):
		return
	var key: String = String(actor.get_meta("pop_cell"))
	var group: String = String(actor.get_meta("pop_group"))
	actor.remove_meta("pop_cell")
	actor.remove_meta("pop_group")
	# The count is NOT incremented back — it's gone. (current_pop was already
	# decremented at materialize time; this just clears the tag so unload-bank
	# doesn't double-credit a corpse-or-freed node.)
	if not cells.has(key):
		return
	log.append("removed %s from %s" % [group, key])


## The unload-time credit-back (§3.2): a SURVIVING actor (never tagged dead by
## on_actor_removed) banks its one count back when its chunk unloads.
func bank(cell_key_in: String, group: String) -> void:
	if not cells.has(cell_key_in):
		return
	var row: Dictionary = cells[cell_key_in]
	var cur: Dictionary = row["current_pop"]
	cur[group] = int(cur.get(group, 0)) + 1


# --- The instantiation bridge's budget query (world_stream spends this) --------------------

## What a chunk loading inside this cell may materialize RIGHT NOW: {group: count},
## capped by max_materialized_per_group and by what the cell actually has banked.
## Decrements current_pop immediately (§3.2: "count and instance never double-counted") —
## the CALLER is responsible for actually spawning exactly this many, tagging each with
## set_meta("pop_cell", key)/set_meta("pop_group", group) + add_to_group("pop_ledger").
func materialize_budget(pos: Vector3) -> Dictionary:
	var row := cell_at(pos)
	var cur: Dictionary = row["current_pop"]
	var out := {}
	# Humans + wildlife spend through the ONE bridge (LWE §0.4): same cap, same
	# never-double-counted law — a group world_stream has no spawner for just
	# banks forever, which is correct.
	for g in (Array(GROUPS) + Array(ProtoEcology.WILDLIFE)):
		var have := int(cur.get(g, 0))
		if have <= 0:
			continue
		var take := mini(have, max_materialized_per_group)
		if take > 0:
			out[g] = take
			cur[g] = have - take
	return out


## If a planned spawn couldn't find a safe position this tick (never-in-view gate
## failed for every candidate), give the count back — nothing is lost by waiting.
func return_unspent(pos: Vector3, group: String, count: int) -> void:
	if count <= 0:
		return
	var row := cell_at(pos)
	var cur: Dictionary = row["current_pop"]
	cur[group] = int(cur.get(group, 0)) + count


# --- The never-in-view gate (§4 formula: safe_to_spawn) -------------------------------------

## Pure predicate — every human player must clear BOTH the distance gate and the
## cone gate for a candidate spawn point to be safe. No players (headless sim
## staging, or main has none) = trivially safe (nothing to hide from).
func safe_to_spawn(pos: Vector3, players: Array) -> bool:
	for pl in players:
		if pl == null or not is_instance_valid(pl):
			continue
		var ppos: Vector3 = pl.global_position
		var d := pos.distance_to(ppos)
		if d < min_spawn_dist_m:
			return false
		var facing: Vector3 = pl.call("facing") if pl.has_method("facing") else Vector3.FORWARD
		var half_angle := 1.22
		var range_m := 36.0
		if _main != null and "vision_cone" in _main and _main.vision_cone != null:
			half_angle = _main.vision_cone.current_half_angle()
			range_m = _main.vision_cone.last_range_m if _main.vision_cone.last_range_m > 0.0 else range_m
		var to_pos := pos - ppos
		to_pos.y = 0.0
		if to_pos.length_squared() < 0.0001:
			return false # standing on top of the player is never safe
		var f2 := Vector2(facing.x, facing.z)
		var t2 := Vector2(to_pos.x, to_pos.z).normalized()
		if f2.length_squared() > 0.0001:
			var ang := f2.normalized().angle_to(t2)
			if absf(ang) <= half_angle and d <= range_m:
				return false
	return true


## The human players to check against (co-op: all of them). Falls back to the
## single "player3d" group main already uses everywhere else in this codebase.
func _live_players() -> Array:
	if _main != null and _main.has_method("get_tree"):
		return _main.get_tree().get_nodes_in_group("player3d")
	return []


# --- The hourly refill tick (§3.1 rule 1-5, §4 formula) -------------------------------------

## Call once per elapsed game-hour (world_stream/main's hour-tick, or a sim
## driving daynight directly). Walks every KNOWN cell (bootstrapped ones only —
## an untouched cell has no row and needs none: nothing to refill in a cell
## nobody has ever asked about).
func tick(_game_hours: float = 1.0) -> void:
	var now := _now_h()
	for key in cells.keys():
		var row: Dictionary = cells[key]
		if bool(row.get("protected", false)):
			continue
		var unseen_h: float = now - float(row.get("last_seen_time", 0.0))
		if unseen_h < refill_unseen_hours:
			continue
		var desired: Dictionary = row["desired_pop"]
		var current: Dictionary = row["current_pop"]
		for g in GROUPS:
			var want := int(desired.get(g, 0))
			var have := int(current.get(g, 0))
			if have >= want:
				continue
			var src := _find_refill_source(key, g)
			if src == "": # no valid source (no neighbor surplus, no road/town, not first touch)
				continue
			var step := mini(refill_step, want - have)
			current[g] = have + step
			if src != key: # pulled from a neighbor, not minted fresh — that neighbor pays for it
				var src_row: Dictionary = cells[src]
				var src_cur: Dictionary = src_row["current_pop"]
				src_cur[g] = maxi(0, int(src_cur.get(g, 0)) - step)
			log.append("refill +%d %s in %s (from %s)" % [step, g, key, src])


## §3.1 rule 3: an adjacent (8-neighbor) cell with current_pop[G] > 0, OR the
## cell touches a road/town (bootstrapping needs A source — "the road provides"),
## OR it's the cell's very first tick (both counted as zero prior refills so far).
## Returns the SOURCE cell key to pull from ("" = the cell mints for free via
## road/town/first-touch, key==the cell itself in that case is signaled by
## returning the cell's OWN key so the caller doesn't try to debit a neighbor).
## Tie-break (§5 edge case): higher current_pop[G] wins; equal → lexicographic key.
func _find_refill_source(key: String, group: String) -> String:
	var parts: PackedStringArray = key.split(",")
	var cx := int(parts[0])
	var cz := int(parts[1])
	var best := ""
	var best_pop := -1
	for dx in range(-1, 2):
		for dz in range(-1, 2):
			if dx == 0 and dz == 0:
				continue
			var nk := "%d,%d" % [cx + dx, cz + dz]
			if not cells.has(nk):
				continue
			var npop := int((cells[nk]["current_pop"] as Dictionary).get(group, 0))
			if npop <= 0:
				continue
			if npop > best_pop or (npop == best_pop and nk < best):
				best_pop = npop
				best = nk
	if best != "":
		return best
	# No neighbor surplus. Two remaining valid sources, both from §3.1 rule 3:
	# (a) the cell touches a road or town — an ONGOING source, not a one-shot
	#     ("the road provides" keeps providing as long as the road is there), or
	# (b) this is the cell's very first-ever refill (bootstrapping the world
	#     needs *a* source even off the beaten path) — a ONE-SHOT, so a cell
	#     with neither a neighbor nor a road/town can mint exactly once and then
	#     genuinely stalls until a neighbor or the timer produces one.
	var row: Dictionary = cells[key]
	if _touches_road_or_town(row):
		return key # the cell's own key = "mint for free, don't debit anyone"
	if not bool(row.get("_ever_refilled", false)):
		row["_ever_refilled"] = true
		return key
	return ""


func _touches_road_or_town(row: Dictionary) -> bool:
	if usmap == null or not usmap.ok:
		return true # no map file loaded (a bare sim) — don't block the mechanic on missing data
	var parts: PackedStringArray = String(row["id"]).split(",")
	var cx := int(parts[0])
	var cz := int(parts[1])
	var center3 := Vector3(usmap.cell_center(Vector2i(cx, cz)).x, 0.0, usmap.cell_center(Vector2i(cx, cz)).y)
	return not usmap.road_near(center3, usmap.cell_m * 0.6).is_empty() or not usmap.town_near(center3, usmap.cell_m).is_empty()


# --- Serialize / restore (save-hook: see the one-line note in proto3d.gd's save_game) -------

## NOTE for the wiring pass (proto3d.gd is READ-ONLY for this ticket): save_game()
## should add one key, e.g. data["population"] = population.serialize() if population
## != null else {}; load_game()/apply_save() should call
## population.restore(data.get("population", {})) if population != null. Mirrors
## exactly how world_state's "world" key round-trips today (proto3d.gd:3228, 3247).
func serialize() -> Dictionary:
	return {"cells": cells.duplicate(true)}


func restore(data: Dictionary) -> void:
	cells.clear()
	for key in (data.get("cells", {}) as Dictionary):
		cells[String(key)] = (data["cells"][key] as Dictionary).duplicate(true)
