## THE BOOK (docs/design/SPECTACLES.md §2 — ONE betting system, five events):
## odds are honest math off visible strengths with a house vig; winnings are
## physical scrip at the window; FIXING exists and is a crime (the flag rides
## the ticket — the WITNESSED pipeline consumes it at S2). Cards are seeded by
## (venue, day): the same race day always runs the same field.
class_name ProtoBetting
extends RefCounted

const VIG := 0.1 ## the house margin (0.05–0.2)

## A CARD: {venue, day, entrants: [{id, name, strength}], winner: "", settled}
static func open_card(venue: String, day: int, entrants: Array) -> Dictionary:
	return {"venue": venue, "day": day, "entrants": entrants.duplicate(true),
		"winner": "", "settled": false, "tickets": []}


## F-ODDS: odds_i = (1/strength_i) / Σ(1/strength_j) — inverted-strength shares,
## then the decimal odds the window quotes are 1/share (longshots pay long).
static func implied_share(card: Dictionary, id: String) -> float:
	var inv_sum := 0.0
	var inv_i := 0.0
	for e in card["entrants"]:
		var inv := 1.0 / maxf(float(e["strength"]), 0.05)
		inv_sum += inv
		if String(e["id"]) == id:
			inv_i = inv
	if inv_sum <= 0.0 or inv_i <= 0.0:
		return 0.0
	# NOTE the inversion: STRONGER entrants carry BIGGER win shares. The
	# 1/strength shares above are the longshot weights; the win share is the
	# strength's own share of the field.
	var s_sum := 0.0
	var s_i := 0.0
	for e in card["entrants"]:
		s_sum += maxf(float(e["strength"]), 0.05)
		if String(e["id"]) == id:
			s_i = maxf(float(e["strength"]), 0.05)
	return s_i / s_sum


static func decimal_odds(card: Dictionary, id: String) -> float:
	var share := implied_share(card, id)
	return (1.0 / share) if share > 0.0 else 0.0


## F-PAYOUT: payout = stake × odds × (1 − VIG). The ticket carries a `fixed`
## flag when the bettor is also an ENTRANT throwing it — the crime pipeline's
## hook, never the book's business to stop.
static func place(card: Dictionary, id: String, stake: int, fixed: bool = false) -> Dictionary:
	var t := {"id": id, "stake": stake, "odds": decimal_odds(card, id), "fixed": fixed, "paid": 0}
	(card["tickets"] as Array).append(t)
	return t


## The result: seeded by (venue, day) — deterministic per save, weighted by
## strength. Returns the winner id and pays every winning ticket.
static func settle(card: Dictionary, forced_winner: String = "") -> String:
	if bool(card["settled"]):
		return String(card["winner"])
	var winner := forced_winner
	if winner == "":
		var rng := RandomNumberGenerator.new()
		rng.seed = hash("card:%s:%d" % [String(card["venue"]), int(card["day"])])
		var total := 0.0
		for e in card["entrants"]:
			total += maxf(float(e["strength"]), 0.05)
		var roll := rng.randf() * total
		var acc := 0.0
		for e in card["entrants"]:
			acc += maxf(float(e["strength"]), 0.05)
			if roll <= acc:
				winner = String(e["id"])
				break
	card["winner"] = winner
	card["settled"] = true
	for t in card["tickets"]:
		if String(t["id"]) == winner:
			t["paid"] = int(floor(float(t["stake"]) * float(t["odds"]) * (1.0 - VIG)))
	return winner


## RACE DAY at a venue: the card's field, seeded — rig classes as racers with
## strengths off their engine/top-speed rows (visible stats, honest odds).
static func race_card(venue: String, day: int) -> Dictionary:
	var rng := RandomNumberGenerator.new()
	rng.seed = hash("field:%s:%d" % [venue, day])
	var classes: Array = ["scavenger", "sedan", "musclecar", "motorcycle"]
	var names: Array = ["SAL K.", "THE DEACON", "ROSA V.", "HALF-STACK", "MERIDIAN KID", "BONE RIDER"]
	var entrants: Array = []
	for i in range(4):
		var vclass := String(classes[i % classes.size()])
		var strength := 0.5 + rng.randf() * 0.5
		if ProtoCar3D.VEHICLES.has(vclass):
			var s: Dictionary = ProtoCar3D.VEHICLES[vclass]
			strength = clampf(float(s.get("engine", 3000.0)) / 6000.0 + rng.randf_range(-0.15, 0.25), 0.2, 1.5)
		entrants.append({"id": "r%d" % i, "name": String(names[(int(rng.randi()) % names.size() + i) % names.size()]),
			"vclass": vclass, "strength": strength})
	return open_card(venue, day, entrants)
