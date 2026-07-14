## THE NEWSROOM (docs/cinema.md Phase 6): the world simulation gets a PRESS DESK.
## State takeovers, bounties, weather — each becomes a radio bulletin AND a TV
## lower-third, queued through the ONE broadcast law (world_state.broadcast_queue,
## text-first fallback floor: a missing clip/TTS never blocks the news).
## Optional pre-rendered clip ids ride the row as "clip_id" for screens that can
## play them; text is always present.
class_name ProtoNewsroom
extends RefCounted

var _main: Node = null


static func create(main: Node) -> ProtoNewsroom:
	var n := ProtoNewsroom.new()
	n._main = main
	return n


func _queue(medium: String, text: String, clip_id: String = "") -> void:
	if not ("world_state" in _main) or _main.world_state == null:
		return
	_main.world_state.queue_broadcast(medium, text)
	if clip_id != "" and not _main.world_state.broadcast_queue.is_empty():
		var b: Dictionary = _main.world_state.broadcast_queue[-1]
		b["clip_id"] = clip_id # a screen MAY roll footage; the text already works


## A state fell. The dial and the set both say so (the law: player must always
## be able to learn WHY the world changed without leaving home).
func report_takeover(state: String, faction_name: String, law_name: String) -> void:
	_queue("radio", "%s has fallen to %s. %s is in effect. Travelers, know the law before the law knows you." \
		% [state, faction_name, law_name])
	_queue("tv", "%s UNDER NEW LAW — %s declares %s. Checkpoint activity rising." \
		% [state.to_upper(), faction_name, law_name])


## The player's own name on the air (bounty posted).
func report_bounty(amount: int, state: String) -> void:
	_queue("radio", "Word on the wire: a driver's worth %d scrip to the %s houses. Watch your mirrors." % [amount, state])
	_queue("tv", "BOUNTY POSTED — %d scrip. The road knows your rig." % amount)


## Weather worth interrupting the broadcast for.
func report_weather(kind: String) -> void:
	match kind:
		"dust":
			_queue("radio", "Dust wall moving through the grid — visibility near zero. Park it or crawl.")
		"rain":
			_queue("radio", "Rain on the interstates — grip's gone soft. Ease off the pedal.")
		"heat":
			_queue("radio", "Heat advisory — engines cook fast out there. Watch the needle.")


## A raid on the player's walls resolved while they were away.
func report_raid(won: bool, wall_level: int) -> void:
	if won:
		_queue("tv", "OVERNIGHT: raiders tested a walled compound and BOUNCED (wall tier %d held)." % wall_level)
	else:
		_queue("tv", "OVERNIGHT: a compound was breached. Scavengers move at dawn.")


## Console culture is world news: an ad creates a travel reason and a win puts
## the player on both the dial and public lower-thirds.
func report_game_tournament(event: Dictionary, venue_name: String) -> void:
	var game := String(event.get("game_id", "GAME NIGHT")).replace("_", " ").to_upper()
	var prize := int(event.get("prize_scrip", 0))
	_queue("radio", "%s is live at %s. Entry at the counter; %d scrip to the winner." %
		[game, venue_name, prize])
	_queue("tv", "TONIGHT AT %s — %s // PRIZE %d SCRIP" % [venue_name, game, prize])


func report_game_win(event: Dictionary, venue_name: String) -> void:
	var game := String(event.get("game_id", "GAME NIGHT")).replace("_", " ").to_upper()
	_queue("radio", "The RIDER took %s at %s. House records just got rewritten." %
		[game, venue_name])
	_queue("tv", "NEW CHAMPION — RIDER WINS %s AT %s" % [game, venue_name])


## The latest UNHEARD tv-medium bulletin (the media panel's lower-third pulls this).
func latest_tv_line() -> String:
	if not ("world_state" in _main) or _main.world_state == null:
		return ""
	for b in _main.world_state.broadcast_queue:
		if String(b.get("medium", "")) == "tv" and not bool(b.get("heard", false)):
			return String(b.get("text", ""))
	return ""
