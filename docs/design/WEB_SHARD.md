# WEB_SHARD — you log in, and the world is still there

**Status:** 2026-10-23. Shard v0 SHIPPED on `feat/web-shard` (from `1109205b`). A Node shard server (`web/server/`),
the page's net module (`web/src/net/`), a login screen, two dev accounts, agent tooling and a two-client proof
(`node tools/shard-test.mjs`: 36/36). Full `selftest` 135/135 twice on fresh pages, offline.
**Owner of the call:** Robert ("This is a persistent multiplayer world. You log in. Give me a username and a password,
and give yourself one as well so you can test it out.", 2026-10-23). **Engine:** the three.js web engine (`web/`, see
`web/AGENTS.md`).
**Sources:** `docs/skills/em3/SKILL.md` (Ultima Online's persistence: your house, your car, your name, other players),
`docs/design/WEB_STREAMING.md` (save v2, entity tiers), `docs/design/WEB_WORLD_MEMORY.md` (what the world remembers),
the Godot game's ENet co-op (`CLAUDE.md`, Multiplayer and Co-op/PvP rows: client-authoritative 20 Hz player sync,
seq-interpolated remotes, host-authoritative enemies).

---

## 1. Overview

A **shard** is one persistent world on one server. Accounts log in with a username and a password; each account has up
to three **characters**; a character walks into the world, and everybody else in it is out there too.

| Part | File | What it is |
|---|---|---|
| Shard server | `web/server/shard.mjs` | HTTP + WebSocket on one port (default **3280**, path `/shard`). Accounts, sessions, characters, the shared world, presence relay |
| Store | `web/server/store.mjs` | four JSON files in `web/server/data/` (gitignored), written whole and renamed into place, batched 2 s |
| Auth | `web/server/auth.mjs` | scrypt password hashes with a per-user salt, random session tokens kept only as SHA-256, a login throttle |
| Wire rules | `web/src/net/protocol.js` | message list, limits, name/flag/presence validation; imported by the server and the page alike |
| Page net module | `web/src/net/shard.js` | connect, log in, enter; send presence; draw the others; save the character; sync the world; reconnect |
| Login screen | `web/src/net/login.js` | the title's LOG IN, the modal (log in / create account / pick or make a character with a flag), name plates, the roster plate |
| Agent rows | `web/src/net/commands.js` | 13 `shard*` commands in the COMMANDS table (group `shard`, see `web/docs/COMMANDS.md`) |
| Dev accounts | `web/server/seed-dev.mjs` | makes `robert` and `claude` with random passwords, written only to `web/server/.dev-accounts.json` (gitignored) |
| Tools | `web/tools/shard.mjs`, `shard-kit.mjs`, `shard-test.mjs` | start, who, world, log a page in as a dev account; the two-client proof |

**The one change in `main.js`** (the boot hook): an `import { attachShard } from './net/shard.js'` and one call,
`attachShard(game)`, at the top of the content packs' `.then` (after the packs, so a new character starts with the pack's
kit; before the dev reload restore and the bridge). Nothing else in `main.js` or any other system was edited: the net
module wraps `game.frame` from outside (`pre` before the sim, `post` after it) and reads the systems' own `save()`/`load()`.

**Offline is untouched.** Without a login the module does nothing per frame but return. Under `?agent=1` the page does
not even probe for a shard (the selftest page is byte-for-byte the offline game), and a person's title only grows a LOG IN
button when `GET /health` on the shard answers.

## 2. Player Fantasy

*You log in as yourself, pick the character with the Mexican flag on her card, and wake up where you logged out last
night, two streets from the gate, with the jerky and the crowbar still in your pack. Somebody's name plate is moving
up Central Ave: a Japanese flag, BIRCH, SHOTGUN. The Interceptor that used to sit outside the sheriff's is gone - Birch
drove it off yesterday and it is parked by the wash where he left it, locked. The window you boarded up last week is still
boarded. Ike's counter is empty: somebody killed him, and the shard remembers who.*

Fan service (mechanics only, per `WEB_FAN_SERVICE_BIBLE.md`): Ultima Online's shard, account and character select, and
the house that is yours; GTA2's other players as people on the same streets; Project Zomboid's persistent server where a
door you broke stays broken.

## 3. Detailed Rules

### 3.1 Authority model v0: (a)

**Chosen: (a).** The shard is authoritative for accounts, sessions, characters (everything a character carries), the
shared world's persistent state and presence. **Each page simulates its own surroundings** (raiders, the infected,
traffic, doors swinging, bullets) and reports its own player, the way the Godot game's co-op did (client-authoritative
player sync at a fixed rate, interpolated remotes).

Why (a) and not (b) now:
- The engine is a 4,000-line browser simulation with WebGL in the loop (rendering, instancing, the streamer's GPU pools).
  Running it as the authority means running a headless browser per region on the server (`tools/agent.mjs` already can),
  and every system would have to be split into a simulation half and a view half before a server could own it. That is
  the roadmap (section 3.9), not a night's work.
- (a) gives Robert what he asked for today: log in, persistence, see each other, and a foundation whose wire format
  (presence, world patches, character saves) does not change when the authority moves.

**What (a) costs, honestly:**
- **Cheating is easy.** A modified page can save any position, any pack, any amount of money; break every window on the
  island; declare any named NPC dead; take any town car. The shard validates shape and size (types, finite numbers,
  string ids, size caps), never plausibility. It counts warps (a presence jump faster than 120 m/s) and logs them; it
  does not refuse them (agents teleport).
- **Conflicts:** two pages disagree about anything simulated. Each sees its own raiders, its own traffic, its own
  weather and clock. A raider on your page may shoot at another player's body; it cannot hurt them (their body on your
  page has 100,000 hp and is re-asserted every frame). There is **no PvP damage** over the wire in v0.
- **World merge is last-writer-wins per row** (a door's lock, a window). Two players boarding and breaking the same window
  at the same second end with whichever message arrived last.
- **Doors swing locally.** A door's angle is the page's business; only its lock (kicked in, picked, locked again) is the
  world's. A door one player holds open stands closed on another's page.

### 3.2 Accounts and sessions
- **Username:** 3-16 of `a-z 0-9 _`, lowercased. **Password:** 8-128 characters.
- **Hash:** `crypto.scrypt`, N = 16384, r = 8, p = 1, 64-byte key, a fresh 16-byte random salt per user; stored as
  `scrypt$N$r$p$salt$hash`; compared with `timingSafeEqual`. A login for a username that does not exist still burns one
  hash, so the time it takes does not say who has an account. The error is the same for both: "wrong username or password".
- **Throttle:** 5 failed logins on a username within 5 minutes lock it for 60 s; 30 auth attempts a minute from one
  address. Over WebSocket, 60 messages a second per connection (presence is 15); a flood is dropped, not queued.
- **Session token:** 32 random bytes (base64url), handed to the page once at login. The shard keeps only its SHA-256 and an
  expiry (7 days) in `sessions.json`, so a stolen sessions file logs nobody in. `resume {token}` re-authenticates (the
  CONTINUE AS button, and the automatic reconnect); `signout` deletes it on both sides.
- **The page never keeps the password.** It keeps `{url, user, token}` in `localStorage` (`dl.shard.session`).

### 3.3 Characters
- Up to **3 per account**. Name 2-16 characters (a letter first; letters, digits, space, `'`, `-`), **unique on the shard**
  (case-insensitive). A **flag** from the 18 the page can draw (`protocol.js FLAG_CODES` = `ui/portrait.js FLAGS`).
- A **look seed** (random at creation): every page dresses that character from `outfit('player', makeRng(look))`, so they
  look the same to everybody. Their flag goes on the HUD's flag patch, on their name plate, on their card and on the roster.
- **One session per character:** entering with a character already in the world kicks the older session ("logged in
  somewhere else").
- **What is saved** (`Shard.personal()`, the `save` message, at most 256 KB):

| Field | From | Restored through |
|---|---|---|
| `pos` {x, z, gy, face} | the player (or their car) | placed, `standOn`, the streamer made hot there |
| `hp`, `cash`, `inv` (guns, mags, condition, jams, rounds), `quests`, `stats` | `game` | assigned, then `inventory.bindAmmo()` |
| `pack` {worn, carried} | `inventory.save()` | `inventory.load()` with this page's own containers kept |
| `needs`, `skills`, `roles` | `survival` / `skillsSys` / `roles` `.save()` | their `.load()` |
| `society` {factions, memory}, `standing` | standing with every faction, named people's memories of you | `factions.load()` + re-assign, `memory.load()` |
| `car` {type, paint, x, z, h, hp, seed, plates, mounts} | the last car you drove | spawned as `own:<char id>` where you parked it |
| `house` | the claim key | the shard's claim row |

- **Saved:** every 10 s in the world, on `shardSave`, on logout, on `pagehide`/`beforeunload` (best effort), and right
  after entering. A brand-new character starts from the **baseline**: the game as this page booted (with the packs'
  starting kit), captured before anybody played.

### 3.4 The shared world (`world.json`)

| Row | Written when | Applied when |
|---|---|---|
| `interiors.d[id]` {l, h, k} | a door's lock is no longer as built (kicked in, damaged, picked, locked) | every page, on entering and live |
| `interiors.w[id]` {s, hp, b, sd} | a window cracked, shattered, boarded (and from which side), boards damaged | same |
| `deadNpcs[npc]` {name, by, at} | the player killed a named person for good (not downed, not `essential`) | they lie dead on every page |
| `takenVehicles[seed]` | a character drove off in one of the town's own cars | it is gone from every page's town |
| `claims[key]` {char, name, flag, label, x, z} | `shardClaim` (one house per character; not a trader's; not somebody else's) | walking in: "ROBERT'S PLACE - CLAIMED" or "HOME" |
| `standings[char]` | every save (a mirror of that character's standing with each faction: their notoriety) | `/world` |
| `chronicle[]` (1,000 kept) | the player's deeds from the page's chronicle (verb, target, place, where, how many saw) | `shardWorld`; a kill is announced "WORD ON THE SHARD: ..." |

- A page sends what changed **once a second** (`diffInteriors` against what it last sent or was told), the shard merges
  field by field (anything malformed is dropped) and relays the patch to everyone else in the world, who apply it at once.
- The world file is written within 2 s of any change, every 30 s regardless, and on every graceful stop.
- Building keys: `isle:<index in world.buildings>` on the island, `ring:<building id>` in the Phoenix ring.

### 3.5 Presence and other players
- The page sends `p {x, z, y, f, w, a, hp, d, v?}` at **15 Hz of wall time** (not sim time: a `step` that runs 3 s of sim
  in 0.3 s still sends 15 a second). `v` = the car you are in {type, x, z, h, paint, seat}.
- The shard relays, at 15 Hz, each player's newest sample to everyone within **600 m** (`AOI`), stamped with when it
  arrived (`at`) and the shard's clock (`ts`).
- The page draws each other player as a **real body** in `game.chars` (id `net:<char id>`, faction `drifter`, `hold = true`
  so the AI never moves them, 100,000 hp re-asserted each frame), walking with the stride the speed calls for, facing,
  aiming, holding their gun's model, lying down if their page says they are down. In a car: a ghost car `netv:<char id>`
  of the same type and paint, them in its seat (a rider shows on a bike), **locked** (getting in throws you back out:
  "LOCKED - BIRCH'S CAR").
- **Name plates:** the real cloth flag first, the name, then the gun, the car or DOWN. **The roster plate** (top centre):
  the shard, everyone in the world with their flag, LOG OUT.
- **Parked cars** of other characters (online or not) show where the shard last had them, within 400 m (put away past 500).
- A remote with no sample for 5 s (out of range, or gone quiet) is put away until one arrives.

### 3.6 The login screen
- The title (when `/health` answers): a status line `SHARD PHOENIX-1 · n IN THE WASTE`, a gold **LOG IN**, and ENTER THE
  WASTE becomes a steel **PLAY OFFLINE** (the same button: `.title .play`, which the agent bridge still clicks).
- The modal: riveted steel, typed-paper inputs, the stencil heading. **LOG IN** / **CREATE ACCOUNT** / CONTINUE AS
  (a saved token) / PLAY OFFLINE. Then **PICK YOUR CHARACTER**: a card per character with their flag as the whole card's
  backdrop, last seen, house; a NEW CHARACTER card. **NEW CHARACTER**: the name and a grid of the 18 woven flags with a big
  preview. Picking a card goes straight into the world.
- Key events inside the modal never reach the game (the title reads Y for weather even while it is up).

### 3.7 Agent surface
| Command | What |
|---|---|
| `shard` | state, url, shard, account, character, who is online as drawn, parked cars, your car, claims, the named dead, last save, counters, clock offset |
| `shardConnect url=` | say hello to a shard |
| `shardLogin user= pass= create=` | log in (or make the account); returns the characters; never echoes the password |
| `shardChars`, `shardNewChar name= flag=` | list or make characters |
| `shardEnter char=` | walk into the world as that character |
| `shardWho` | everyone else: `shown` (where the body is drawn now), `interpolated`, `latest` sample and its age |
| `shardSave`, `shardLogout signout=` | save now; save and leave (and end the session) |
| `shardClaim`, `shardUnclaim` | your house |
| `shardWorld` | claims, the named dead, taken town cars, the shard's last deeds, changed doors/windows here |
| `shardLoginUi step= close=` | open the modal as a person sees it |

Shell: `npm run shard` (or `node tools/shard.mjs start`), `node tools/shard.mjs who | world | status`,
`DL_URL=http://localhost:3270 node tools/shard.mjs login [user=claude] [char=Claude] [flag=US]` (reads the dev login from
`web/server/.dev-accounts.json`, makes the character if missing, walks in), `... logout`. HTTP: `GET /health` (anyone),
`GET /who` and `GET /world` (this machine only).

### 3.8 Security model
**Protected:** passwords (scrypt + salt, never stored or logged in clear, never sent back); sessions (hashed tokens with an
expiry, revocable); guessing (throttle, uniform error, a dummy hash for unknown users); floods (60 msg/s, 300 KB a message,
256 KB a save, 64 KB a world patch); malformed data (every field type-checked, ids shape-checked, numbers finite and
bounded); one character in one place at a time; the admin views (`/who`, `/world`) answer only on loopback;
`SHARD_ORIGINS` can pin which page origins may connect.

**Not protected yet (say it plainly):**
- **No TLS.** `ws://` carries the password in clear. Fine on this machine; on a LAN anybody sniffing it can read it. Before
  the shard leaves the machine, put it behind a TLS proxy (Caddy or Cloudflare Tunnel) and use `wss://`.
- **The token sits in `localStorage`:** any script injected into the game page could read it. The page renders no HTML
  from other players (names are set as text), but there is no CSP yet.
- **Clients are trusted** with their own character and with world changes (section 3.1): money, packs, positions, kills
  and broken windows can all be forged by a modified page.
- **No password reset, no email, no account deletion, no admin roles, no bans.** The dev seed resets the two dev accounts.
- **No encryption at rest** for the store (it holds only hashes and game state).
- A WebSocket from any origin may connect unless `SHARD_ORIGINS` is set (tokens are not cookies, so another site cannot
  ride a session it does not have).

### 3.9 Roadmap: more players, then server authority
1. **v0.1, hardening:** TLS (`wss://`) and a CSP; plausibility checks on saves (cash and items only change through
   server-known verbs; a position is where the last presence said); PvP damage as a victim-authoritative message (the
   Godot pattern: the one who is hit applies it and reports it); chat.
2. **More players:** presence is already area-of-interest filtered (600 m). Next: delta-only and binary presence (a few
   bytes per player), per-chunk interest sets from the streamer's 256 m chunks, SQLite (`node:sqlite`) when the JSON files
   pass a few MB, one Node process per region past ~100 players.
3. **Shared simulation, step one:** the shard picks one page per area as **host** for the area's NPCs (host-authoritative
   enemies, as the Godot co-op did): its raiders and infected are relayed like presence and the other pages draw ghosts.
4. **(b) Server authority:** run the engine headless on the server (the same page `tools/agent.mjs` already drives, one per
   region), feed it every player's inputs, relay its state; pages become predicting clients. The wire messages above stay;
   `save` and `world` become server-generated instead of client-claimed. The cost: splitting each system's simulation from
   its rendering so a region can run without a GPU.

## 4. Formulas

- **Interpolation:** draw time `t = Date.now() + offset − 120 ms`; find samples A, B with `A.at ≤ t ≤ B.at`;
  `k = (t − A.at) / (B.at − A.at)`; position `A + (B − A)·k`, facing `angleLerp(A.f, B.f, k)`; past the newest sample,
  hold it (no extrapolation). With 15 Hz samples (67 ms apart) 120 ms keeps two in hand.
- **Clock offset:** `offset = max(ts − now)` over snapshots, decaying 2 ms per snapshot (the fastest arrival is the
  truest).
- **Stride:** `speed ← 0.7·speed + 0.3·min(|Δpos|/dt, 12)`; `walk += stridePhase(speed, dt)` (the AI's own gait law).
- **Warp:** a presence step `d > 5 m` with `d / dt > 120 m/s` counts a warp.
- **Message budget:** `budget = min(60, budget + 60·Δt)`, a message costs 1, below 1 it is dropped.
- **Save cadence:** 10 s; world file ≤ 2 s after a change, and every 30 s.

## 5. Edge Cases

- **The shard restarts while you play:** you keep playing; the roster plate goes red ("LOST THE SHARD - RECONNECTING");
  every 1-5 s the page reconnects, resumes with its token and re-enters as the same character **without** reading the
  shard's copy back (this page's player is newer), then saves. Proven in the test.
- **Two pages, one character:** the newer wins; the older is told and drops to its account.
- **A page closes without logging out:** the last 10 s save plus the `pagehide` save; the others see "DROPPED OFF THE SHARD".
- **A name or a username taken:** refused with the reason, the modal keeps what was typed.
- **A wrong password:** "wrong username or password", the same for an unknown user, slower after five.
- **Logging in after playing offline on the same page:** your character replaces the offline player; world rows from the
  shard are merged in, but changes made offline on that page are not sent (they predate the login).
- **A town car you take:** it is yours (`own:<char id>` from then on) and gone from every town; a car you only ride in
  stays where it was on the other pages.
- **A named person you kill:** dead on every page, for good; `essential` ones (Okonkwo, Doc Reyes) are never synced (the
  story must not dead-end).
- **A local save (F5/F9) or a dev reload while logged in:** other players' bodies and cars are kept out of the shard's
  logic by their ids (`net:`, `netv:`); any copy a local load brings back is swept away within a second.
- **A corrupt store file:** moved aside as `<file>.bad`, started fresh, logged.

## 6. Dependencies

- **`ws@8.18.0`** (pinned): the WebSocket server. Justification: Node has a WebSocket *client* built in but no server;
  `ws` is the de facto standard (used by most Node real-time stacks), has **zero dependencies**, is MIT, and is ~100 KB.
  Writing RFC 6455 framing by hand would be more code to trust, not less.
- Node built-ins only otherwise: `http`, `crypto` (scrypt, random, SHA-256), `fs` (atomic JSON).
- The page uses the browser's own `WebSocket`. The shard tools use Node 22+'s global `WebSocket` (Chrome DevTools for
  screenshots) and `fetch`.
- Engine systems read, never edited: `inventory`, `survival`, `skills`, `roles`, `society` (factions, memory, chronicle),
  `interiors`, `vehicles`, `seats`, `garage`, `characters` (`outfit`, `stridePhase`), `hud` (`toast`, `paintFlag`),
  `ui/hudart` (`paintClothFlag`), `ui/portrait` (`FLAGS`, `drawFlag`).

## 7. Tuning Knobs

| Knob | Where | Value |
|---|---|---|
| port, path | `protocol.js SHARD_PORT/SHARD_PATH`, `--port`, `SHARD_PORT` | 3280, `/shard` |
| data folder | `--data`, `SHARD_DATA` | `web/server/data/` |
| shard name | `--name`, `SHARD_NAME` | PHOENIX-1 |
| allowed page origins | `SHARD_ORIGINS` | any |
| presence rate | `LIMITS.presenceHz` | 15 Hz |
| interpolation delay | `shard.js DELAY` | 120 ms |
| stale remote | `STALE_MS` | 5 s |
| area of interest | `shard.mjs AOI` | 600 m |
| warp threshold | `shard.mjs WARP` | 120 m/s |
| character save | `SAVE_MS` | 10 s |
| parked cars shown / put away | `CAR_NEAR` / `CAR_FAR` | 400 / 500 m |
| characters per account | `LIMITS.charsPerAccount` | 3 |
| save / patch / message caps | `LIMITS.saveBytes/patchBytes/messageBytes` | 256 / 64 / 300 KB |
| chronicle kept | `LIMITS.chronicleKeep` | 1,000 |
| scrypt | `auth.mjs N, R, P` | 16384, 8, 1 |
| token life | `TOKEN_TTL_MS` | 7 days |
| throttle | `Throttle` | 5 fails / 5 min → 60 s; 30 tries/min/address |

## 8. Acceptance Criteria

All measured 2026-10-23 on this machine (`node tools/shard-test.mjs`: a throwaway shard with its own data folder, two
headless Chrome pages on :3270 and :3271, two fresh test accounts; never the dev accounts). **36/36 passed:**

- [x] A person's path on page A: the title shows LOG IN with the shard up; CREATE ACCOUNT, NEW CHARACTER (Alder, Mexico),
  the card, into the world.
- [x] Page B the agent's way (`shardLogin create=true`, `shardNewChar`, `shardEnter`) and sees Alder already there; a wrong
  password is refused.
- [x] Both walk (`moveTo`); **each sees the other within 1 m of their true position** (measured 0.03-0.06 m after settling);
  the shard's `/who` lists both; A draws B's name plate.
- [x] **A logs out, the page boots fresh (back at the start), A logs in: where they left (0.0 m), the same pack, the same
  money.**
- [x] A claims a house; B walking in is told "ALDER'S PLACE - CLAIMED".
- [x] B drives off in a town car: A sees B in it, the town copy is gone from A's town; B parks, logs out, a fresh page
  logs in: the car is where B parked it, and the town copy is not there twice.
- [x] A kills a named person: dead on B's page too, and on the shard's chronicle.
- [x] **B breaks and boards a window; A sees it boarded live; the shard is stopped (gracefully) and started again; both
  pages come back on their own; a fresh page has the window intact before logging in and boarded after.** The named dead
  and the claim come back too; they still see each other.
- [x] Full `selftest` **135/135 twice on fresh pages, offline** (game.time under 0 at the start of each battery).
- [x] `node tools/ip-lint.mjs`: 0 deny, 0 review.
- [x] Dev accounts `robert` and `claude` exist on the dev shard; `claude` logged in through `tools/shard.mjs login` and
  showed on `/who`.
- [x] Screenshots (`docs/renders/web/shard/`): `01-title-shard-online.png`, `02-login-modal.png`,
  `03-new-character.png`, `04-pick-character.png`, `05-two-players-from-alder.png`, `06-two-players-from-birch.png`.
- [ ] Not run here: the stress A/B (run centrally).

**How to play it:**
```
cd web
node server/seed-dev.mjs        # once, with the shard stopped: makes robert + claude (passwords in server/.dev-accounts.json)
npm run shard                   # the shard on ws://localhost:3280/shard (Ctrl+C saves and stops)
npm run dev                     # the game on http://localhost:3141 -> LOG IN on the title
node tools/shard-test.mjs       # the two-client proof (uses :3270, :3271, :3280; stop the dev shard first)
```
