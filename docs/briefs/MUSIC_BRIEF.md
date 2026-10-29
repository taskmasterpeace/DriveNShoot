# THE MUSIC BRIEF: what to make, for where

**Status:** BRIEF, 2026-10-29. Robert makes the tracks; the game plays them. Owner lane: PULLS (bars) + the radio (`data/radio.js`).
**Today:** the radio has 5 stations, and 3 of them play music: KDST, THE RELAY and the REMNANT. Their 12 tracks are composed by code (`tools/radio-compose.mjs`: plucked strings, organ, bass). They prove the system works but they aren't music anyone wants to hear. The bars have no music at all.

## 1. The one law: music comes FROM something
Every song has a source you could walk up to and break:
- **a jukebox** (shoot it and the room goes quiet);
- **a piano** with a player at it;
- **a live band** on a stage;
- **a radio** in a car or in a pack;
- **a town's loudspeaker.**

There is no soundtrack floating over the world. Out in the open you hear wind, engines and guns, until you switch the radio on. Walk in a bar's door and the music swells as you go in and goes muffled when you step outside.

## 2. The file spec (so a track drops straight in)
| | |
|---|---|
| Format | `.ogg` (Opus or Vorbis). WAV/MP3 are fine as input: the import converts them |
| Length | 90 s – 3:30. Radio songs end. Bar loops are 2:00+ and **loop clean** (no fade-out) |
| Loudness | about -16 LUFS, peaks under -1 dB |
| Vocals | yes, ours. **No real artist names, no covers, no "in the style of X" in any title or lyric** (ip-lint scans the titles) |
| Instrumental twin | for every vocal bar track, an instrumental version as well. The room drops to it when someone near you is talking |
| Name | `<playlist>/<nn>-<short-title>.ogg`, e.g. `saloon-desert/03-dry-county.ogg` |
| Drop folder | `web/public/music/<playlist>/`. Rebuilding the manifest picks it up |

## 3. THE BARS AND VENUES (where people are doing things)
Each venue type plays **its own playlist**, and the region gives it a flavour. Count = tracks needed for a first pass.

| Playlist id | Where | Sound | Mood | Count |
|---|---|---|---|---|
| `saloon-desert` | roadhouse saloons on the Arizona flats (I-10) | dusty country, slide guitar, honky-tonk piano, brushed drums | worn, a drink at noon | 8 |
| `saloon-desert-night` | the same rooms after dark | slow country waltz, a lone steel guitar, a low male/female duet | lonely, late | 6 |
| `piano-hall` | the bar piano itself (the pianist plays it live) | solo upright piano: ragtime, stride, saloon blues | busy, then tipsy | 8 (instrumental) |
| `juke-joint` | Florida bars and the Gulf towns | swamp blues, electric slide, hand claps, a Hammond organ | sweaty, loose | 8 |
| `cantina` | border towns and the southern drifter camps | norteño accordion, bajo sexto, cumbia rhythm, trumpets | lively, a dance in the corner | 8 |
| `biker-bar` | the Dustwolves' bars (raider country) | dirty garage rock, fuzz bass, heavy drums, shouted hooks | dangerous, a fight coming | 8 |
| `fight-pit` | the ring and bare-knuckle nights | pounding drums, war chants, distorted bass, crowd-call hooks | blood up | 6 |
| `speedway` | race nights, motocross, the demolition derby | stadium rock, surf guitar at high speed, a PA announcer bed | fast, loud | 6 |
| `rust-haven-hall` | Rust Haven's town hall and canteen (the wardens) | Appalachian string band: fiddle, banjo, mandolin, close harmony | home, hard work | 6 |
| `remnant-mess` | Remnant outposts: the mess hall and the parade ground | military march band, snare cadences, bugle calls, a proud anthem | order, a little sinister | 6 |
| `church` | funerals, the death rites, Sunday in a town | gospel choir, a hymn on a pump organ, a cappella spirituals | grief, then hope | 6 |
| `market` | trade towns and caravan meets | busker sets: a fingerpicked acoustic, harmonica, a steel drum, hand drums | haggling, bright | 6 |
| `campfire` | drifter camps and the caravans at night | one acoustic guitar, a harmonica, a voice singing low | tired, honest | 6 |
| `brothel-parlor` | the back-lot parlor houses | slinky lounge jazz, muted trumpet, upright bass, brushes | smoky, adult (no lyrics needed) | 4 |
| `dance-hall` | big-town Saturday nights | western swing, big-band horns, a two-step | everyone on the floor | 6 |

**Event stings** (5–15 s, no loop): bar fight breaks out · someone wins big at cards · a round on the house · a race start horn plus a riff · a knockout · last call (closing time). Two each = **12 stings**.

## 4. THE RADIO STATIONS
These are on the dial (`data/radio.js`). A **real** station has a DJ voice between songs (the voice forge renders the IDs), news read from the world's own memory, and its own playlist. Range matters: you only pick up a station near its mast.

| Freq | Station | Who runs it | Sound | Where it reaches | Count |
|---|---|---|---|---|---|
| 98.1 FM | **KDST DUST COUNTRY** (exists, replace its music) | an old DJ in a tower nobody has taken yet | classic desert country, outlaw country | Arizona | 10 |
| 104.5 FM | **THE RELAY** (exists, replace) | an anonymous night host who moves the mast around | slow-burn night drives: synthwave ballads, dream-pop, slow R&B | everywhere after dark | 10 |
| 1220 AM | **VOICE OF THE REMNANT** (exists, replace) | Remnant propaganda | marches, anthems, a choir singing a loyalty hymn | Remnant ground | 6 |
| 89.3 FM | **WRCK RUST RADIO** (new) | Rust Haven, a community station | folk-rock, roots rock, Americana, a call-in show | Rust Haven ground | 10 |
| 92.7 FM | **DEAD AIR** (new) | Dustwolves pirate radio | punk, thrash, raider chants, and threats read on air | raider roads | 8 |
| 101.1 FM | **GULF 101** (new) | a Florida station | swamp blues, zydeco, reggae, Gulf soul | Florida | 10 |
| 96.9 FM | **LA FRONTERA** (new) | border towns | norteño, corridos (our own stories of the roads), cumbia, banda | south | 10 |
| 1080 AM | **THE PULPIT** (new) | a preacher on the AM band | gospel, sermons over an organ, a call to come to his town (truthful… or a trap like the emergency band) | wide AM | 6 |
| 107.7 FM | **THE BOUNCE** (new) | a city station in the bigger towns | hip-hop, trap, funk, boom-bap: songs about the roads, the factions and the wreckage | towns | 10 |
| 1660 AM | STATIC (exists) | the talk and news host | no music: talk beds and stings only | everywhere | 4 beds |

**DJ voices needed** (for the voice forge, not the music): KDST's old DJ, the Relay's night host, the Remnant announcer, the Rust Radio host, the Dead Air raider host, the Gulf host, the Frontera host, the Pulpit preacher, the Bounce host. That's 9 voices, each with about 20 lines.

## 5. The total for a first pass
- **Venues:** 98 tracks, plus their instrumental twins where they have vocals.
- **Radio:** 80 tracks plus 4 talk beds.
- **Stings:** 12.
- **Order to make them in:** `saloon-desert`, `piano-hall`, `biker-bar`, `juke-joint`, then KDST, THE BOUNCE and GULF 101, then the rest. The first four are the bars you can already walk into today.

## 6. What the game does with them (PULLS lane builds this)
- **The jukebox and piano are objects in the bar.**
  - The pianist sits and plays, so their hands move and the music comes from that spot.
  - Shoot the pianist and the music stops mid-bar.
  - Put coins in the jukebox and you pick the song.
- **The music changes the room.**
  - A `biker-bar` track raises the chance a fight breaks out.
  - `last call` sends the drinkers home on the world clock.
- **Ducking:** when someone near you talks, the room drops to the instrumental twin and the voice sits on top.
- **Mixing:** two bars near each other never play the same track at once.
