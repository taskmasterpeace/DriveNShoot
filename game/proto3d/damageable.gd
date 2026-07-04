## The generic damage component (ENGINE.md multi-use pillar): one class backs car
## parts today, body parts and destructible walls tomorrow. 4-tier state model.
class_name Damageable
extends RefCounted

enum Tier { GOOD, WORN, CRITICAL, BROKEN }

signal tier_changed(id: String, tier: Tier)

var id: String
var emoji: String
var max_hp: float
var hp: float


func _init(id_in: String, emoji_in: String, max_in: float) -> void:
	id = id_in
	emoji = emoji_in
	max_hp = max_in
	hp = max_in


func ratio() -> float:
	return clampf(hp / max_hp, 0.0, 1.0)


func tier() -> Tier:
	var r := ratio()
	if r <= 0.0:
		return Tier.BROKEN
	if r < 0.3:
		return Tier.CRITICAL
	if r < 0.65:
		return Tier.WORN
	return Tier.GOOD


func damage(amount: float) -> void:
	var before := tier()
	hp = clampf(hp - amount, 0.0, max_hp)
	if tier() != before:
		tier_changed.emit(id, tier())


func restore(amount: float) -> void:
	var before := tier()
	hp = clampf(hp + amount, 0.0, max_hp)
	if tier() != before:
		tier_changed.emit(id, tier())
