# DRIVN / DSOA — Cinema, TV, Trailers, and Clips Implementation Plan

## Purpose

Add a diegetic media layer to DRIVN: the player can discover, collect, and watch the creator's own films, TV/show episodes, trailers, and clips inside the game through safehouse TVs, drive-in theaters, public screens, and later regional news channels.

This is not filler. This is a second life for the film catalog, a lore delivery system, a downtime mechanic, and a collectible progression layer.

## Folder Structure

Use four top-level media folders:

```text
DRIVN\\\_Cinema\\\_Media\\\_Template/
  film/
  tvshow/
  trailers/
  clips/
  media\\\_manifest.csv
  media\\\_manifest.json
  IMPLEMENTATION\\\_PLAN.md
```

The user said "3 folders" but named four content types. Keep four. Trailers and clips should stay separate because they serve different jobs:

* trailers sell or preview long content.
* clips are short ambient inserts, news pieces, bumpers, loops, or scene excerpts.

## Design Rule

Everything is a row.

A movie is a row.
A TV episode is a row.
A trailer is a row.
A clip is a row.
A DVD/tape/reel pickup is a row.
A TV channel is a row.
A drive-in schedule is a row.

Do not hardcode the catalog.

## Phase 0 — Ingest Folder Setup

Goal: make it easy to fill the game with owned media.

Deliverables:

* Four folders: `film`, `tvshow`, `trailers`, `clips`.
* `media\\\_manifest.csv` for human editing.
* `media\\\_manifest.json` for runtime loading.
* README files explaining how to drop content.

Acceptance criteria:

* A new film can be added by creating a folder, dropping a source file, and adding one manifest row.
* The manifest has stable IDs, categories, runtime, file paths, poster paths, unlock rules, and screen contexts.

## Phase 1 — Media Registry

Goal: the game can read the media catalog without caring where the media came from.

Data row schema:

```json
{
  "id": "blood\\\_road\\\_1999",
  "category": "film",
  "title": "Blood Road",
  "series": "",
  "season": null,
  "episode": null,
  "runtime\\\_seconds": 5400,
  "encoded\\\_path": "res://media/film/blood\\\_road\\\_1999/encoded/blood\\\_road\\\_1999\\\_game.ogv",
  "poster\\\_path": "res://media/film/blood\\\_road\\\_1999/poster/poster.png",
  "subtitles\\\_path": "res://media/film/blood\\\_road\\\_1999/subtitles/en.srt",
  "unlock\\\_type": "found\\\_dvd",
  "unlock\\\_region": "florida",
  "screen\\\_context": \\\["safehouse\\\_tv", "drive\\\_in"],
  "priority": 1
}
```

Implementation:

* Add `MediaRegistry.gd`.
* Load `media\\\_manifest.json`.
* Validate IDs are unique.
* Validate file paths exist.
* Expose:

  * `get\\\_media(id)`
  * `list\\\_by\\\_category(category)`
  * `list\\\_unlocked(save)`
  * `list\\\_for\\\_context(context, region)`

Acceptance criteria:

* Missing files warn but do not crash.
* Duplicate IDs fail a dev-mode assertion.
* Registry can list all media by category.

## Phase 2 — Safehouse TV MVP

Goal: player can watch owned media inside the safehouse.

Player flow:

1. Walk to safehouse TV.
2. Press E.
3. Media UI opens at about 80% of screen.
4. Player picks Film / TV Show / Trailers / Clips.
5. Player plays a video.
6. Time passes while watching.
7. Player exits and returns to the world.

Implementation:

* Add `ProtoTV.gd` interactable.
* Add `MediaPlayerPanel.gd` modal UI.
* Use engine-supported video playback.
* Add pause/exit controls.
* Add time-passing hook.
* Lock player input while the panel is active.

Acceptance criteria:

* TV interaction opens and closes cleanly.
* Selecting a media row plays video.
* Time advances while video is open.
* Exiting returns control to the player.
* Save records watched/unlocked media.

## Phase 3 — Drive-In Theater

Goal: make the films feel native to a car game.

Player flow:

1. Player drives to a drive-in theater location.
2. Parks facing the screen.
3. Tunes radio or interacts with the projector.
4. The movie plays on the large screen.
5. Audio comes through the radio channel or screen speaker.
6. Time passes.
7. Drive-in can run trailers before the feature.

Implementation:

* Add drive-in site prefab.
* Add screen mesh.
* Add projector interaction.
* Add schedule row:

  * feature film
  * trailer reel
  * start hour
  * region
* Add optional radio audio routing.

Acceptance criteria:

* Drive-in plays trailers then a feature.
* Player can watch from inside vehicle.
* Leaving the area stops or muffles playback.
* The drive-in can be a discovered map destination.

## Phase 4 — Unlocks and Collectibles

Goal: media becomes part of exploration and progression.

Unlock types:

* `always\\\_available`
* `found\\\_dvd`
* `found\\\_tape`
* `found\\\_reel`
* `quest\\\_reward`
* `regional\\\_channel`
* `world\\\_event`

Collectible items:

* DVD
* VHS tape
* Film reel
* Data disc
* Bootleg cartridge
* News archive tape

Implementation:

* Add media item rows.
* On pickup, mark media ID as unlocked in save.
* Add a media shelf at home.
* Shelf visually fills as the player collects items.

Acceptance criteria:

* Picking up a DVD unlocks the correct film.
* Unlocked media persists through save/load.
* The shelf count matches unlocked media.
* Media can be filtered by category.

## Phase 5 — Trailers and Clips as Ambient World Content

Goal: use trailers/clips to make the world feel alive.

Use cases:

* Safehouse TV idle channel.
* Public TVs in stores/bars.
* Drive-in pre-show.
* News clips after state events.
* Regional propaganda.
* Fake commercials.
* Faction warning messages.

Implementation:

* Add `MediaChannel` rows:

  * channel ID
  * region/state
  * allowed categories
  * playlist rules
  * faction owner
* Use trailers/clips for short loops.
* Let the world event system enqueue news clips.

Acceptance criteria:

* Public screens can run a loop without user selection.
* A regional channel can choose clips based on state/faction.
* Trailers can play before drive-in features.
* Clips can be marked as world-event-specific.

## Phase 6 — News / TV From World State

Goal: TV and radio report what the world simulation is doing.

This connects directly to the larger DSOA vision:

* states change hands
* laws change
* guns become contraband
* a faction invades
* the player gets a bounty
* the road gets dangerous

Implementation:

* Add `Newsroom.gd`.
* Inputs:

  * state ruler
  * faction control
  * war state
  * weather
  * bounty
  * player reputation
  * recent deaths
  * home raid result
* Outputs:

  * radio bulletin text
  * TV lower-third text
  * optional generated or pre-rendered video clip ID

Acceptance criteria:

* Force a state takeover, then TV reports it.
* Force a player bounty, then radio reports it.
* Force a weather event, then TV/radio reports it.
* News appears before the player leaves home after offline catch-up.

## Phase 7 — Offline Catch-Up Integration

Goal: when the player has not played for days, the world changes and media explains it.

Flow:

1. Player loads after real-world time away.
2. Game calculates elapsed days.
3. EventDirector rolls offline events.
4. State/faction/law changes are applied.
5. Player wakes at home.
6. TV/radio gives a briefing.
7. Player can check the sheet before stepping outside.

Acceptance criteria:

* If four days pass, the world can change.
* A state takeover can change laws.
* TV/radio summarizes the change.
* Player receives actionable warning before leaving home.

## Phase 8 — Quality and Storage Decision

Main problem: full films are large.

Options:

1. Bundle a small starter pack with the game.
2. Ship optional "Film Vault" download packs.
3. Stream from your own server.
4. Use local folder scanning for dev/private builds.

Recommended path:

* Development: local files in the four folders.
* First public build: bundle trailers/clips plus one short film or one feature.
* Later: optional Film Vault packs.

Acceptance criteria:

* Game still launches if optional media is missing.
* Manifest can mark media as `requires\\\_pack`.
* UI shows "not installed" instead of crashing.

## Phase 9 — Tests / Sims

Required sims:

### media\_registry\_sim

* Loads manifest.
* Asserts all IDs unique.
* Asserts categories are valid.
* Asserts at least one row per category when sample files exist.

### tv\_sim

* Interacts with TV.
* Opens media panel.
* Selects a test clip.
* Advances game time.
* Exits cleanly.

### unlock\_media\_sim

* Picks up a DVD/tape item.
* Asserts the media ID becomes unlocked.
* Saves/loads.
* Asserts unlock persists.

### drive\_in\_sim

* Drives into drive-in trigger.
* Starts schedule.
* Asserts trailer then feature order.
* Exits area.
* Asserts playback stops or attenuates.

### news\_media\_sim

* Forces state event.
* Asserts Newsroom generates bulletin.
* Asserts TV/radio queue receives it.

## Priority Order

1. Folder + manifest structure.
2. Media registry.
3. Safehouse TV MVP.
4. Unlock/save persistence.
5. Trailers/clips playlist.
6. Drive-in theater.
7. Newsroom world-state bulletins.
8. Offline catch-up briefing.
9. Optional AI-generated news video layer.

## Hard Rules

* Do not rely on YouTube as the core runtime path.
* Do not hardcode specific films in code.
* Do not let missing optional media crash the game.
* Do not build AI video first.
* Build the media registry first, then make screens consume it.
* Every video, trailer, and clip must be addressable by ID.
* The player must be able to understand why a clip/news item is being shown.
* The TV must serve gameplay: waiting, stress relief, world-state info, unlocks, and collection.

## First Build Slice

Build this first:

* `film/`, `tvshow/`, `trailers/`, `clips/`
* `media\\\_manifest.json`
* `MediaRegistry.gd`
* Safehouse TV interactable
* One test clip
* Time passes while watching
* Watched/unlocked media saved

Do not start with the drive-in. Do not start with AI video. Do not start with streaming. Start with the safehouse TV and one working clip.

