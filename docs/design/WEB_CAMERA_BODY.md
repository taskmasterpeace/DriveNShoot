# The body views: third-person and over the shoulder (web engine)

**Status:** first version built 2026-11-12 on `feat/web-zed-camera` (base `prep/g0-wave2`).
**Asked by:** Robert, 11-12: "The top-down camera view is kind of unappealing to some people... I want to see how that
look in third-person too. And if we could get an over-the-shoulder third-person where you aiming up and down as well",
then "improve ... camera controls" and "we got to improve the camera with the interiors too, because ... we got several
story buildings".
**Builds on:** `WEB_CAMERA.md` (the boom, the four views that were already there: TOPDOWN, ANGLED, ISO, CHASE).
**Files:** rows `web/src/data/camera.js` (`CAMERA.body`, `validateCameraBody`); the rule `web/src/systems/camrig.js`
(`body`, `updateBody`, `aimPoint`); `web/src/engine/input.js` (mouse deltas, pointer lock); `web/src/main.js` (aim
point, what is drawn of the building you are in); `web/src/ui/hud.js` (reticle); `web/src/ui/qol.js` (settings);
`web/src/data/controls.js` (keys); checks `web/src/agent/cambody-api.js`.

## 1. Overview

Two new views join the camera's cycle (the O key): **THIRD**, a follow camera behind you, and **SHOULDER**, tight over
one shoulder. The mouse (or the right stick) turns the view and looks up and down; W walks the way the view faces. The
game still starts on TOPDOWN and every existing check still runs on it.

Indoors the two views are in the room with you. The camera's boom stops short of the first wall behind you and stays
under the ceiling of the floor you are on, so it never looks through a wall or a floor. In these views the building is
drawn whole (roof and upper floors back on); the top-down views still lift the roof and every floor above yours.

## 2. Player fantasy

You are behind your own shoulder in a dead school corridor, looking down it. You turn and the view turns with you. In a
stairwell the camera tucks in close instead of sliding outside the wall. Outdoors the country runs to the horizon in
front of you. One key and you are back above it all.

## 3. Detailed rules

1. **Views and the cycle.** `CAMERA.views` is TOPDOWN, ANGLED, ISO, CHASE, THIRD, SHOULDER. O cycles them; CHASE is
   skipped on foot (as before) and THIRD and SHOULDER are skipped at the wheel. Get into a car in a body view and it
   reads as CHASE until you get out. The choice is remembered
   (`settings.camView`, the browser's storage) and put back the next time you play; never on the agent's page.
2. **Turning and looking.** Mouse movement turns the view (`orbit`) and tilts it (`pitch`, −55° to +60°) while the mouse
   is held by the game (pointer lock: your first click in a body view takes it and does nothing else; it is let go
   the moment a menu, the map, the pack, a talk, the workshop, a console, the character sheet, the crew panel or its orders wheel, the garden panel,
   sleep, a blackout, the drone or photo mode has the hands, paused or not), or while you drag with the right or middle button. Right stick on a pad: the same, at
   `padRate`. Settings: look speed (five steps) and invert up/down.
3. **Walking.** W is the way the view faces; A/D strafe; S backs up (the same key-turning the ISO view already used).
4. **Aiming.** You aim the way the view faces: the aim point is straight out from you along the view's heading, at the
   first of: a wall that stops a round, somebody or a vehicle standing on the line, the ground where you are looking
   (when you look down), or `aimRange` (30 m). So a hold-up, aim assist and a witness's read of your gun work on the
   person in front of you, and looking down brings a throw or an order in close. **Shots stay on your floor** (the game's law for every view):
   looking up or down moves the view, not the round. The reticle is drawn where the round goes (that point, at chest
   height, projected to the screen), so it does not sit at the screen's centre when you look steeply up or down.
5. **SHOULDER.** The camera pivots 0.55 m to one side of your head; `;` swaps shoulders. Holding aim (right button)
   pulls the boom in to 1.25 m. Against a wall on that side the shoulder offset shrinks so the pivot stays in the room.
6. **Collision.** Each frame: a sight ray from the pivot back along the boom; the boom is cut to stop `pad` (0.3 m)
   short of the first wall. Then height: indoors the camera never rises above `ceil − ceilGap` (2.55 m) over your feet
   and never sinks below `floor` (0.35 m); if the boom would cross either, it shortens along its own line. The boom is
   never shorter than `hardMin` (0.35 m).
7. **What is drawn of the building you are in.** TOPDOWN, ANGLED, ISO, CHASE: the roof is lifted and the floors above
   yours are hidden (as before), so the floor shown is the floor you stand on. THIRD, SHOULDER: nothing is lifted; the
   deck above is your ceiling. Changing view while indoors switches at once.
8. **In sight.** The body views see to the horizon. `g.viewR` (what spawners, clean-ups, the fog and the sun's shadow
   box read as "on screen") is the fixed row `viewR` (110 m), not the frustum's reach.

## 4. Formulas

- Forward (unit): `f = (−sin(orbit)·cos(pitch), sin(pitch), −cos(orbit)·cos(pitch))`. Camera = pivot − f·d.
- Pivot = your position + (0, eye, 0) + right·side·shoulder, `right = (cos(orbit), 0, −sin(orbit))`.
- Wall: `d ← max(hardMin, (t − pad) / cos(pitch))` when the sight ray back along the boom hits at `t < d·cos(pitch) + pad`.
- Ceiling and floor: if `y = eye − f.y·d` leaves `[floor, ceil − ceilGap]`, `d ← (eye − clamp(y)) / f.y`.
- Example: THIRD, `d` 5 m, pitch −10°, a wall 2 m behind you: `d = (2 − 0.3) / 0.985 = 1.73 m`; camera height
  `1.55 + 0.174 × 1.73 = 1.85 m`, under the 2.55 m limit.

## 5. Edge cases

- **Your back against a wall:** the boom is at its hard minimum; the camera is inside your shoulders' space and you fill
  the frame. It does not pass the wall.
- **A window behind you:** the sight ray passes a window opening, so the camera may sit just outside an open window
  looking in. Glass and boards stop it.
- **Low furniture** (under about 1.3 m) does not stop the boom; the camera may sit over a bed or a desk.
- **Stairs:** the ceiling limit is over your feet, so it climbs with you on a flight; near the top of a flight the
  camera can be level with the deck you are climbing through.
- **Z, - and =** step the boom in and out in a body view (the named zoom stops are top-down heights).
- **Outdoors under a bridge deck or a canopy:** no ceiling is applied outdoors; the camera may rise through a deck above.
- **No pointer lock** (the browser refuses it, or the second after Escape): the click that asked is lost; for the next
  3 s clicks are ordinary clicks (you can always fire) and the right or middle button drags the view. Then it asks again; after three refusals in a row it stops asking.
- **HUD chips** (the pulls board, the garden chip) cannot be clicked while the mouse is held; use their keys.
- **Looking down brings the aim point in.** At the starting pitch (−5°) it meets the ground about 18 m out, so somebody
  further than that is not taken by the aim point until you look up a little; the round itself still flies flat.
- **A friend on the line** (a crew member, a dog) takes the aim point like anyone else: a throw or an order lands on them.
- **Birds** cannot be aimed at in these views (the aim point is on your floor).
- **A talk, the pack, the map, a menu:** the mouse is let go and the view stops turning.
- **Not covered yet (said plainly):**
  - **Vertical aim does not move the round.** Combat is flat per floor in this engine; shooting up a stairwell at
    another floor, or down from an upper window by looking down, follows the old rules (down out of a window at the
    street works as it did; up at another floor does not). Real vertical ballistics is its own piece of work.
  - **No sky.** Above the horizon is the haze colour. The top-down views never showed the horizon.
  - **The wall cutaway** (the dither that opens walls between a high camera and you) still runs in these views and can
    thin a wall edge close to the lens.
  - **Top-down extras asked for:** rotate with a held key or right-drag, snap to north, zoom limits per room, and
    fading tall buildings that hide you are not built. ISO already turns in 90° steps (`[` and `]`), the wheel zoom is
    continuous, and indoors the boom is already capped (26 m).
  - **Vehicles:** THIRD at the wheel is the existing CHASE view (it already pulls back with speed); there is no free
    orbit round a car.
  - **Enemies on other floors** are hidden in top-down (as before) and simply behind floors in the body views.
  - **Climbing out of a window** does not exist yet, so neither does its camera hand-over.
  - Draw calls in the body views were not measured at the horizon; the views are behind a key, off by default.

## 6. Dependencies

- `systems/camrig.js` owns it; `main.js` `updateCamera`/`updateInterior` call it and read `cam.body()`.
- `engine/collision.js` `raycast` (RAY_SIGHT for the boom, RAY_BULLET for the aim point).
- `world/storeys.js` `setView` and `world.setRoofVisible` (what is lifted); `ui/hud.js` (reticle); `ui/qol.js`
  (settings); `engine/input.js` (mouse deltas). `agent/camera-checks.js` knows the cycle now has six views and leaves the
  body views out of its frustum check.

## 7. Tuning knobs (`CAMERA.body`)

| Knob | Value | Safe range | What it changes |
|---|---|---|---|
| `THIRD.dMin / dMax / dStart` | 2.2 / 9 / 5 m | 1.5–12 | How far behind you the follow camera sits |
| `SHOULDER.dStart`, `aimD` | 2.0, 1.25 m | 1–3 | The shoulder view's boom, and held aim |
| `SHOULDER.side` | 0.55 m | 0.3–0.8 | How far off your centre line |
| `pitchStart` | −5° | −15 to 0 | Where the view looks when you enter it (lower brings the aim point nearer) |
| `pitch` | −55° to +60° | within ±80° | How far down and up you can look |
| `sens`, `padRate` | 0.0026 rad/px, 2.4 rad/s | 0.001–0.006, 1–4 | Look speed before the setting |
| `pad` | 0.3 m | 0.15–0.8 | How far short of a wall the camera stops |
| `ceil`, `ceilGap` | 2.8, 0.25 m | 2.2–4 | The ceiling it stays under indoors |
| `viewR` | 110 m | 60–300 | What counts as "in sight" in these views |
| `aimRange` | 30 m | 10–80 | How far out the aim point sits |

## 8. Acceptance criteria (selftest, `only="camera body:"`)

1. **Rows:** validate; the six views in order; the game starts on TOPDOWN; a bad pitch range, a boom under its hard
   minimum and a ceiling under head height are each caught.
2. **Never through a wall or a ceiling:** in a Rust Haven shop and on floor 4 of the six-storey tower, THIRD and
   SHOULDER at 12 turns × 3 pitches each (144 placements): the camera is inside the building, a sight line from your
   head to it is clear, and it is between the floor and the ceiling limits. In the open the boom runs its full length.
3. **Walk, aim, floors, wheel, and back:** in SHOULDER turned east, W walks you east; the aim point is straight ahead
   and the reticle is on screen; somebody 6 m in front of you takes the aim point; looking down brings it in to the
   ground you look at; the mouse is wanted while the hands are on the game and let go when they are not; held aim shortens the boom; the other shoulder puts the camera on the other side; on
   TOPDOWN upstairs the floor shown is the floor you stand on with the roof lifted, in THIRD the building is whole and
   the camera is under the deck above; at the wheel THIRD reads as CHASE; back on TOPDOWN the angle, yaw, far and near
   planes and view radius are what they were.

Also kept green: every `camera:` check (two were told about the new views).

Pictures: `docs/renders/web/camera-body/` — the same moment in TOPDOWN, THIRD and SHOULDER on a street, in the clinic,
and at the tower's stairwell on floors 1, 3 and 5.

Critic review 2026-11-12, first pass FAIL, three items, fixed in the next commit: the mouse stayed held under the map and
every paused panel, and under the workshop and console screens; the aim point ignored people (hold-ups, aim assist, a
witness's read, throws and orders all measured from a point 30 m out). Also taken: the click that takes the mouse no
longer fires, Z / - / = step the boom, the wheel's cycle has one chase view again. Known and left: the indoor checks
test the camera against the rule's own ceiling number and ray (only the tower clause tests a real deck); spawners place
new things from about 118 m, which is in plain view on open ground in these views.

Second pass FAIL, two items, fixed: the character sheet, crew panel, garden panel and a blackout now let the mouse go;
a refused pointer lock no longer swallows clicks (3 s of ordinary clicks, then it asks again). The check now stands
bystanders aside and puts them back, and tests the let-go on real frames.
