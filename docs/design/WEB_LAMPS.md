# Lights inside: the oil lamp (web engine)

**Status:** built 2026-11-12 on `feat/web-zed-lamps` (on top of `feat/web-zed-innerdoors`).
**Asked by:** the coordinator for Robert, 11-12: "lights inside (switches or lamps that work at night, and a flashlight
that matters)".
**Files:** rows `web/src/data/gadgets.js` (`GADGETS.oil_lamp`, `oil_lamp_dry`, their `lamp` block); the item
`web/src/data/makeritems.js` (`oil_lamp`); the rule `web/src/systems/gadgets.js` (`lamp`, `lampToggle`, `lampShine`,
the prompt, the save, the look); command and checks `web/src/agent/lamps-api.js`.

## 1. Overview

A room at night is nearly black. There were two ways to see in it: the flashlight (a cone in front of you, on a
battery cell) and a signal flare (red, 45 seconds, thrown). There was nothing you could leave burning in a room.

The oil lamp already existed as a thing you could build at a workbench, but it did nothing. Now you set it down and it
lights the room with a warm light for six game hours on one flask of lamp oil. You can put it out, light it again,
refill it and carry it off. The infected see it at night if they have a line to it, the same way they see a flare or
your flashlight.

There are no wall switches: nothing in the world has mains power, so a switch would be a lie.

## 2. Player fantasy

It is dark, you are in a kitchen with the door barred, and you put a lamp on the floor so you can see the room and the
door at once without holding a torch. Then you remember the window, and put it out.

## 3. Detailed rules

1. **What it is made of:** `make_oil_lamp` at a workbench: 1 scrap, 1 cloth scrap, 1 flask of lamp oil, pliers,
   mechanics 12. The flask the recipe takes is the oil in the new lamp. Lamp oil is rendered from tallow
   (`render_oil`, `boil_candle_oil`). Neither recipe is new here.
2. **Setting it down:** USE it from the pack. It stands 1.1 m in front of you on your floor, lit, with one flask
   (6 hours) in it.
3. **It burns by the game clock**, only while lit: an hour of game time takes an hour of oil, whether you stand there,
   walk away, wait or sleep.
4. **Tap E beside it:** lit, it goes out; out with oil in it, it lights; dry, it takes one flask of lamp oil from your
   pack and lights; dry with no flask on you, nothing happens and it says so.
5. **It goes out by itself** when the oil is gone, and tells you once if you are within 30 m.
6. **Hold E beside it** to take it up. A lamp that has burned (more than a moment: `grace`) comes back as a **dry
   lamp** and the oil left in it is poured out. A lamp taken straight back up comes back whole. So oil is never gained
   by setting a lamp down and taking it up.
7. **A dry lamp** (its own item, 0.2 kg) is set down unlit and empty, and is filled as in rule 4.
8. **The light:** warm, reaching 11 m, at the lamp. **One lamp carries a real light at a time: the lit one nearest
   you within 45 m.** Every other lit lamp shows its flame and a pool of glow on the floor round it, and lights
   nothing. (The game keeps a fixed number of lights so it never stutters when one appears; the lamps share one.)
9. **The infected** look for lights at night (darker than 0.55). A lit lamp they have a clear line to, within their
   own light range (70 m for most), draws them. A lamp behind solid walls draws nobody; one seen through a window or
   an open door does.
10. **The save** keeps each lamp's place, floor, oil and whether it is lit.
11. The `lamps` command lists every lamp set, which one carries the light, and the rows.

**The flashlight** (not changed here, checked 11-12 with a picture): it is in the starting kit, runs on a battery
cell, throws a cone in front of you that lights walls and floor, and the infected see its pool at night. It is the
light you carry; the lamp is the light you leave.

## 4. Formulas

- Oil left after `h` game hours lit: `max(0, oil − h)`; a flask is `burn` = 6 hours.
- The game clock runs 24 hours in 48 real minutes by default, so a flask lasts 12 real minutes and a 12-hour night
  takes two.
- Clock steps are taken as `((now − last) mod 24 + 24) mod 24`, so midnight and any jump of under a day are counted
  right. A jump of a whole day or more in one step is under-counted (24 h reads as none); that favours the lamp's
  owner by burn time only and makes no oil.
- Light strength: `power × (0.94 + 0.06 × sin(9.1 t) × sin(3.7 t))`: a slow, small waver.
- Example: lit at 22:00 with a new flask, it goes out at 04:00. Lit 22:00 to 23:30, put out, lit again at 03:00: it
  goes out at 07:30.

## 5. Edge cases

- **Two lamps in two rooms:** the one nearer you lights its room; the other is a flame and a glow until you walk
  toward it and it becomes the nearer one. The switch is instant.
- **The light passes through walls.** The game's small lights cast no shadows, so a lamp near a wall brightens the
  floor on the far side too. The same is true of muzzle flashes and flares today.
- **Upstairs:** the lamp stands on the floor you set it on and its light is at that height; it also brightens the
  floor below through the deck (same cause).
- **Turning the clock back** (the agent `setTime` command to an earlier hour) reads as most of a day passing: a lit
  lamp burns out. Players cannot turn the clock back.
- **Free burn time, not free oil:** set down, burned for under `grace` (about 2.4 real seconds) and taken up, a lamp is
  still whole, so re-placing it every two seconds would burn nothing. It lights nothing useful that way.
- **Night goggles:** a lit lamp is glare in them, as a flare is (`systems/kit.js` reads any gadget's `lit`).
- **A lamp whose owner is gone after a load** (owner not found) cannot be lit, put out or taken up. The sentry gun has
  the same limit.
- **Taking up a half-burned lamp** loses the oil in it. The prompt says so before you do it.
- **E beside it** is read by the lamp and by whatever else is in reach (a door, a pile): a tap can do both.
- **In a car:** it cannot be set down from a seat.
- **Multiplayer:** a lamp is a placed gadget; gadgets are per page today (like mines and the sentry gun), so another
  player does not see yours. The same limit as every other gadget.
- **Not covered yet:** it cannot be knocked over, broken or set a fire; it cannot be stood on a table or hung; people
  the game runs do not light lamps and their houses have none; candles and torches still burn as a thrown flare does
  and were not changed; there is no lantern you carry lit in a hand; nothing with mains power or a switch exists.

## 6. Dependencies

- `systems/gadgets.js` (placement, pick-up, save, the per-frame loop, the glow quads), `systems/inventory.js` (`use`,
  `stow`, `spend`, `count`), `systems/sky.js` (`time`, `night`), `systems/zombies.js` (`seekLight` reads any gadget's
  `lit`), `systems/kit.js` (the goggles' glare reads the same `lit`), `data/recipes.js` (`make_oil_lamp`, `render_oil`, `boil_candle_oil`), `data/makeritems.js` (`oil_flask`).
- `systems/zombies.js` now depends on this for one more kind of light (no code change there).
- `WEB_SENTRY.md` shares the tap-E / hold-E pattern at a placed gadget.
- Lights in the scene: +1, always present (dark when no lamp is lit). Draw calls: none added.

## 7. Tuning knobs (`GADGETS.oil_lamp.lamp`, and the same on `oil_lamp_dry`)

| Knob | Value | Safe range | What it changes |
|---|---|---|---|
| `burn` | 6 h | 1–24 | Game hours a flask lasts (how much oil a night costs) |
| `r` | 11 m | 4–20 | How far the light reaches (a room, or a floor) |
| `power` | 30 | 10–60 | How bright (the flare is 46–60) |
| `color` | `#ffc56a` | warm, never purple | The light and its glow |
| `glow` | 7 m | 2–12 | The pool on the floor for a lamp that is not carrying the light |
| `near` | 45 m | more than `r` | How close you must be for a lamp to carry the light |
| `grace` | 0.02 h | 0–0.05 | How long it may burn and still be taken up whole |

## 8. Acceptance criteria (selftest, `only="lamps:"`)

1. **Rows:** the lamp is the built item and is used from the pack; the recipe takes one flask; the dry lamp weighs the
   lamp less the flask; both rows burn the same oil at the same rate and name each other; setting a lamp down adds no
   light to the scene (the count is the same before and after) and the lamp light is dark with none lit.
2. **Your oil by the clock:** used from the pack it stands lit with 6 h and leaves the pack; the light is on at it; an
   hour later it holds 5 h; tapped it is out, the light is dark, and two more hours burn nothing; taken up it is one
   dry lamp and no oil; a fresh lamp taken straight up is still whole; the dry lamp goes down dark; with no flask it
   will not light; with two flasks it takes one; the save record carries oil and lit; half an hour before its end it is
   still lit, an hour later it is out with one `lampOut` event and the second flask untouched.
3. **The dead see it:** at night an infected 18 m from a lit lamp with a clear line, with you 110 m away, turns to it
   (the light count rises and it closes the distance); with the lamp out, no; at noon with it lit, no.

Pictures: `docs/renders/web/lamps/` (the same room at 23:30 dark, by flashlight, and by the lamp).
