# THE RV ("Homestead") + riders — the mobile-home plan

**The row (pure data, vehicles.json):** rv "Homestead" — mass 2400, engine 7800, top 24,
highway tires, trunk 160 kg, dog_seats 4, wound_mult 0.7, **camper: true** (the one engine flag).
Slow, thirsty, soft in a fight — but it's your house.

## Camp mode — park it, live in it
Parked + E → "Make camp": interior shell spawns anchored to the parked body (house.gd recipe,
small: BED / STOVE / STASH), roof-hide inside, awning + camp light outside. Drive off → stows.
- **BED** → sleep to dawn: daynight.hour → 6.0, stress −30, minor treat() on worst wound.
- **STOVE** → cook: meat → cooked_meal (first crafting; one ITEMS row).
- **STASH** → the RV trunk is the pantry (existing container panel, 160 kg law).
**The risk:** roadside sleep rolls the metaworld raid check — dark biome + no precautions →
howlers at the awning. Mitigations already in-game: dog on GUARD, lights off, camp near town.

## SEATS ARE ANCHORS, not rooms (the multiplayer-proof rule)
A rider on a moving vehicle is only a physics nightmare if they free-walk. A seat is an anchor
on the vehicle row: `"seats": [{"pos":[x,y,z], "type":"cab|shotgun|bed"}, …]`. Mounted = puppet
parented to the truck at the anchor, physics off, **aim arm + gun stay live** (twin-stick rig
doesn't care that your feet are welded to a truck bed). Sam's fight brain runs unchanged from an
anchor. Serializes as one integer ("player X in seat 2 of truck Y") — the PZ-style netcode answer.
- **Bad guys latch the bed** (reversed anchors): raider near a slow/stopped truck (<~4 m/s)
  latches + swings at the cab; counter = bed melee shove, or handbrake whip → rider_thrown tumble.
  Speed = safety; stopping = risk; the bed gunner has a job.
- **RV while moving:** interior = its own POCKET INSTANCE (not physically inside the shell).
  Enter → teleport to pocket; RV keeps driving; exit resolves to wherever it is now. v1 (parked
  camp) builds the exact interior the MP door points at later.

## The pocket must FEEL like it's moving (never move the room)
1. **Windows are screens** — SubViewport cameras on the real RV's flanks (secondary_view.gd
   pattern, 256px/20fps) → window quads show the actual world going by.
2. **Motion bus** — per-frame dict {speed, steer, brake, surface, biome, hour} → interior sway
   (roll into unseen turns), rumble by surface, pothole jolts from wheel contacts.
3. **Sound** — muffled engine loop through the floor, road noise by surface, amb_* beds faint
   through the walls, world play_at audible from inside.
4. **Light** — daynight sun angle/color piped to window light (golden hour on the counter).
5. **Motion has TEETH** — hard brake = stumble; crash at the stove = take_wound + dinner on the
   floor. Riding inside is comfortable, not safe.
6. **Hotspots** — [SHOTGUN SEAT] pocket → seat anchor; [THE DOOR] parked = step out, moving =
   tumble() at road speed if you insist.

## Build rungs (each with a sim)
1. Hunger spine (field + moodle + food_val on ITEMS). Without the need, the RV is a slow van.
2. RV row — spawns, drives, 160 kg trunk (has_room law). *(Row ships now via the data spine.)*
3. Camp deploy/stow + bed/stove/stash prompts.
4. Sleep + cook (clock jump, stress dump, recipe).
5. Night risk + dog guard (deterministic force_raid roll vs guard-dog-present).
6. Seats/anchors: visible riders (dogs in the bed first — the poster shot), fire-from-anchor,
   enemy latch/throw-off, then the pocket interior + motion bus.
