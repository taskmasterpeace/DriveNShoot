# 📣 DRIVN — What's New

Built in public · shipping daily · v0.13.0

## v0.13.0 — July 6, 2026 — Pick Up a Controller
*Full gamepad support and a rebind panel — every button and every key is yours to change.*

### 🆕 New
- **Play the whole game on a controller.** Xbox pads, PlayStation pads (a PS2 pad through a USB adapter reads the same): left stick moves and steers, right stick aims — true twin-stick — RT fires (tap to punch, hold to shove, just like the mouse), A dives, B crouches, D-pad works the radio, pack, views, and character sheet, RB cycles weapons, and the triggers become real pedals the moment you take the wheel.
- **Rebind everything.** F11 (or the title menu's CONTROLS button) opens the controls panel: click any binding, press the new key or button, done. Keyboard and pad each have their own column, PS button names shown beside Xbox ones, and one button resets everything to stock. Your rebinds survive restarts.
- **Rumble.** Take a hit or stand near a blast and the pad answers in your hands.
- **The title menu speaks controller** — D-pad up and down, press to choose, no mouse required.

### ✨ Improved
- Every binding is now data — the same rows drive the keyboard, the mouse, and the pad, so nothing can drift out of sync.

### 🐛 Fixed
- Function-key bindings (F5 save, F6 PvP, F10 dev mode) resolving to nothing in the new binding system.

*Sim-proven: 30 new checks across two test scenarios, full suite green.*

---

## v0.12.0 — July 6, 2026 — The World Editor: Exits & The Building Catalog
*Highways became decisions, and every building in America became an editable row.*

### 🆕 New
- **Exits are real.** Highways now carry numbered exit nodes — click the map in the editor, pick what kind of exit it is (service stop, neighborhood, county seat, industrial, metro, military spur, or a dead one), and the game grows the off-ramp, the return ramp, and a big highway sign you can read at speed: "EXIT 1 — MERIDIAN (T3)". The first one is live on I-95.
- **A building catalog you edit like a spreadsheet with taste.** Seventeen structure types — gas stations to courthouses to military base shells — each defined by what it DOES (loot, jobs, law, events), not just how it looks. Every building must earn its place: the editor refuses rows with no job. Created, deliberately not placed — the roads get arranged first.
- **The editor grew two tools.** An EXIT tool (click, name it, build it — diamonds and ramp lines draw on the map) and a STRUCTURES panel (create and edit building rows with validation that talks back).

### ✨ Improved
- Editing a road's shape no longer erases its soul — nicknames, danger ratings, and tolls now survive every edit. THE CRIMSON MILE stays THE CRIMSON MILE.
- Typing in editor forms no longer flips your brush size mid-word.

*Everything sim-proven: 32 new checks green, all world regressions green.*

---

## v0.11.0 — July 6, 2026 — The Remote Eye & The Fun Pass
*The world changed while you were gone? Send the bird before you send yourself — and bring a friend.*

### 🆕 New
- **The scout drone flies your route while you stay home.** A dock by the safehouse door launches it along your map course; it marks hazards on your map (the 🛸 waypoint), comes home to recharge — and it can be shot down and lost out there. Every launch boots with a fragment of the AI that broke the country.
- **Co-op that keeps you together.** Name tags over your partner, an arrow that always points to them, respawn beside them instead of across the map, a bed rig parked by the safehouse for the drive-and-shoot fantasy, and horns that carry over the wire.
- **PvP with rules you can read.** One key cycles peace → duel → free-for-all. The safehouse yard is holy ground (no spawn camping), kills post a bounty everyone sees on your tag, and your own machine decides what's allowed to hurt you.

### ✨ Improved
- **Every walk, wag, and leap is live-tunable data.** The animator's numbers now live in rows the MotionForge editor drives — tweak in the browser, hit reload in-game, watch the stride change on the next step.

---

## v0.10.0 — July 6, 2026 — The Cinema Update
*The wasteland got screens: a TV in your safehouse, a drive-in off the highway, and a world that broadcasts its own news.*

### 🆕 New
- **The safehouse TV.** Walk up, press E, and watch your own film catalog inside the game — films, shows, trailers, clips. Time passes while a reel rolls (downtime costs daylight, on purpose).
- **The drive-in theater.** A real lot off the Meridian road with a glowing screen you can see from the highway. Fire up the projector and it runs trailers before the feature — drive off mid-show and it stops for you.
- **Films as loot.** DVDs, tapes, and reels lie in the world; take one and that exact film unlocks on your shelf, forever (it's in the save). Locked films scatter their own pickups at the drive-in — drop a new film into MediaForge and its tape appears in the world.
- **Public screens with channels.** Bar TVs run loops nobody chose, tuned by data rows — when a faction takes the state, the screen retunes to their propaganda feed. Breaking news cuts into the loop.
- **The world reports itself.** A state falls → the TV says so. A bounty lands on your head → the radio says so. A dust wall rolls in → it's on the wire. Two channels, two screens, one world.

### ✨ Improved
- The radio and the TV each drain their own news — the dial can't eat the television's bulletins.

*Everything above is sim-proven: 6 new test scenarios, 60+ checks, all green.*

---

## v0.9.0 — July 6, 2026 — The Moveset + the Media Forges
*Your body learned to fight bare-handed, your dog learned to jump, and the game grew a film studio pipeline.*

### 🆕 New
- **Hold CTRL to crouch** — one new key, a whole stealth layer: you read smaller and quieter to everything hunting you, you fit under low gaps, and tapping it at a sprint converts your speed into a slide that ends low.
- **Empty hands are a weapon now.** Tap to punch (a real jab-jab-cross combo), hold to shove space open, strike at a sprint to tackle someone flat — and a new Martial Arts skill levels by doing: kicks unlock, then throws, then ground finishers on downed enemies.
- **Drag bodies and crates.** Hold E on any chest or corpse to haul it behind you — slow and heavy, builds Strength — then drop it where it's actually useful.
- **Water is real terrain.** Wade the shallows slowly; open water makes you swim, drains your lungs, and takes your hands off your weapons. Run out of air and the water starts taking you.
- **Your dogs got their verbs.** They leap fences and gaps on their own to stay at your heel, SIC now launches a flying pounce, and Hunter dogs smell buried caches and dig them up — real loot from the loot tables.
- **MotionForge (port 8896)** — every walk, wag, sniff, and leap in the game is now tunable numbers in a web editor: sliders with stock values ghosted in, and a describe-it box ("make the sniff deeper and slower") that patches the parameters for you.
- **MediaForge (port 8897)** — drop your MP4s in a folder and they become in-game media: one click converts to the engine's format, pulls a poster frame, probes the runtime, and catalogs it. Test reel and test music generate on demand. MP3 folders for radio and game music are live.

### ✨ Improved
- Sprinting, combat stance, and the dive all respect the new low stance — the whole movement kit reads as one body.

### 🐛 Fixed
- A dog ordered to attack a target that died mid-chase no longer spams errors every frame.

*Staged (built + verified, wiring in progress): the safehouse TV, the media catalog, the world-news desk, and radio music stations — the screens that will play what MediaForge converts.*

---
