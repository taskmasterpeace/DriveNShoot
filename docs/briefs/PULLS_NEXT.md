# PULLS, next: places where people are doing something

**From:** Robert's voice notes, 2026-10-29. This splits them into lanes: what PULLS builds itself, and what other lanes take on.
**The idea:** a public place is somewhere people are DOING something, and you can stand and watch it. Some of it is good and some is bad. Nothing is staged for the player.

## A. THE LIVING ROOM (PULLS builds it): bars and venues as activity slots
- **How a venue works.** It is a set of **activity slots**: card table, darts, piano, jukebox, the counter, a dance floor, a pool table. Each slot has a little loop that runs on the world clock whether or not you're in the room.
  - **Cards:** hands are dealt, chips move between the real purses, somebody leaves broke, a sore loser starts trouble.
  - **Darts:** a throw lands on the board, there are scores, and a bet rides on them.
  - **Piano:** a pianist plays the `piano-hall` playlist (see docs/briefs/MUSIC_BRIEF.md). You can tip them or request a song.
  - **The counter:** the barkeep pours from real stock, the till fills, a drunk gets cut off.
  - **Dance floor:** couples dance two at a time and swap partners.
- **WATCH.** Stand still near a slot (or hold a key) and the camera eases onto it. The HUD shows a small line: "Ruiz is up 40 on the hand", "Darts: 2 to go, 15 scrip on it". You can **join**, **bet on it**, or **break it up**.
- **Dynamic events** come out of the slots, never out of a script:
  - a bar fight starts from a lost hand;
  - a cheat gets caught;
  - a round goes on the house when someone wins big;
  - a stranger walks in with a bounty on them (from the board);
  - last call.
- **The music changes the room.** A biker-bar track raises the chance of a fight, and shooting the jukebox ends the night.
- **The same slot system serves other places:** church (a funeral service), market (stalls and haggling), fight pit, campfire.

## B. THE PASSENGER WHO TURNS (PULLS builds it): a hitchhiker attacks while you drive
- **Today:** a robber hitchhiker only acts once the car has stopped (`robAfter`).
- **Next:** a rider can draw on you **while you're moving**.
  - The tell: a line of dialogue, the rider's hand going under their coat, a glint shown on the seat marker.
  - **Knife:** a struggle. Your steering wobbles, and you choose one:
    - shove them (a timed key) and they go out the door at speed (a real fall, real injury);
    - slam the brakes, and the rider is thrown into the dash;
    - swerve them into the door.
  - **Gun:** "Pull over." Obey and it becomes a robbery. Refuse and they shoot, and you take a wound (top-down reads as a muzzle flash inside the cab plus a blood decal on the seat).
- **Who turns:** a known face on a bounty board, a desperate refugee (their need is real), a drunk from the bar. Not every rider is bad, and the talk on the way gives a hint.
- **Counterplay:** a crewmate in the back seat stops it; a dog in the car warns you.

## C. OTHER LANES (propose a session each; not PULLS)
| Lane | What it is |
|---|---|
| **VOICE CAST** | No player has ever heard a voice: all 40 clips are robot placeholders, muted unless `?voicedev`. Render the proof batch and then the first cast (about 700 lines) with Breeze on cupcake (`web/tools/voiceforge`, $0), plus the 9 radio DJ voices from MUSIC_BRIEF §4. |
| **SMART CURSOR** | The reticle shows the real spread cone for the gun in your hands. It grows when you move, sprint, shoot (bloom) or are wounded, and tightens when you crouch or brace. It also shows range falloff (where the round stops being lethal), a hit-chance tick on the target under the cursor, cover shading, and "out of range" and "friendly" states. It reads the ballistics rows, so nothing is faked. |
| **SPEED AND SPORT** | Race nights on real roads: circuits, point-to-point, motocross on a dirt track, a demolition derby, a fight pit. Purses come from real entry fees and bets, there's a crowd, and rivals remember you. They are venues, so they run on the slot system (A) once it lands. |
| **HUNT AND TRACK** | Animals leave sign (prints, scat, blood, broken brush) as **knowledge facts** that age on the world clock: a fresh print is high confidence, an old one is low. Follow the sign to the animal; pelts and meat go to traders. Bounty hunting tracks people the same way, from the copies you hold and never from the true position. |
| **RADIO STATIONS** | The 6 new stations in MUSIC_BRIEF §4 as rows with mast ranges, DJ IDs and news, once the music and voices exist. |

## Order
1. VOICE CAST, since without it the game is silent.
2. LIVING ROOM (A), the bars first.
3. PASSENGER (B).
4. SMART CURSOR, in parallel with A and B (it touches different files).
5. SPEED AND SPORT, and HUNT AND TRACK, after A.
