# INVENTORY STUDY: how six games handle carrying things, and what our PACK screen takes from them

**Why:** Robert 2026-10-24 12:29, "inventory ease of use study other games with inventories". Our PACK screen
(`web/src/ui/inventory.js`, rules in `docs/design/WEB_INVENTORY.md`) works well with a keyboard: W/S pick, A/D side,
E use, Space move, X drop, F wear. With one thumb on a phone, or with a mouse, it takes too many taps. This note looks
at six games that are known for their inventories. For each it says what is easy, what hurts, and what we take or leave.
The last part is the build list for the one-thumb PACK rework (its own PR).

Sources: how each game plays on its current public builds (7 Days to Die 1.x, SCUM 1.0, DayZ 1.2x, Escape from Tarkov
1.0 (out of beta since November 2025), Project Zomboid B41/B42, GTA V). This note describes the designs in our own words; it copies no text or art.

---

## 1. 7 Days to Die: slots, a toolbelt, and LOOT ALL

**How it works.** A grid of equal slots. Stacks are big, so the grid stays short. Under it is a **toolbelt** of 10
slots that is also the hotbar: what sits there is one key away. Open a crate and the crate's grid sits beside yours.
There are three buttons: **Take All**, **Sort**, and **Stash** (put away what the box already has some of).

**Easy.** Take All empties a crate in one press, which matters because you open hundreds of them. Shift-click moves a
whole stack across. Sort stops the grid turning into soup.

**Hurts.** Everything is one size, so weight and size don't matter much. Encumbrance only counts slots, so a pack full
of feathers slows you the same as a pack full of iron.

**Take.** A **Take All** button for the other side, and **Stash** later. Shift-click (for us: tap again) to move a
whole stack. **Leave.** Slots that ignore size; we already count litres and kilograms.

## 2. SCUM: the body as the container

**How it works.** Every worn piece of clothing is a container with its own grid (trouser pockets, the jacket, the
backpack, a belt with pouches). Items take grid cells by size. Your **vicinity** (the ground and nearby boxes) is a
third panel. You drag things between them. The weight you carry feeds stamina, and your stats change how much you
can carry.

**Easy.** It feels real: you know which pocket the bandage is in, and taking a jacket off a body brings its pockets
with it. Showing the vicinity as its own panel means you never have to "open" the ground.

**Hurts.** Everything is drag-and-drop with a mouse. With a pad it is slow, and you can't do it with one thumb. Many
small grids mean a lot of hunting for room. Rotating items to fit is busywork.

**Take.** The ground at your feet always shown as the other side (we do this already). Gear you wear gives you room
(our packs and belts do this). **Leave.** Per-pocket grids and drag-only moves.

## 3. DayZ: the vicinity panel and the hands slot

**How it works.** Three columns: **vicinity** (ground and nearby things) on the left, your **worn gear and its
cargo** in the middle, and your **hands** and the item you inspect on the right. Each container is a grid. There is
a **hands** slot. Using something means putting it in your hands first, and the hotbar (1-9) holds items you have
bound to it.

**Easy.** The vicinity column means looting a body is "look left, take". **Double-click** puts an item in its natural
place (a gun to the shoulder, food into cargo). Middle-click looks at an item without moving it.

**Hurts.** It is still drag-heavy. Packs are long lists of nested grids, so you scroll a lot. With a pad you get a
cursor that crawls.

**Take.** **One action that "does the right thing"** with an item: a gun goes on the sling, a pack is worn, and the
rest goes across. That is our E: it already slings guns and wears armor. **Leave.** The cursor on a pad.

## 4. Escape from Tarkov: the Tetris grid and the quick-move shortcuts

**How it works.** Worn rigs and backpacks are grids. Items take cells by size and can be rotated. The stash is a huge
grid. The shortcuts are the real interface:
- **Ctrl-click** quick-moves an item to the other open container (or into your gear).
- **Alt-click** equips it.
- **Shift-drag** splits a stack.
- **Double-click** opens a container's own grid.

Searching a body takes time and reveals its items one at a time.

**Easy.** Once you know the shortcuts, a raid's loot moves fast. Every item's footprint tells you its bulk at a
glance. Timed searching makes looting a risk (you're crouched over a body, looking down).

**Hurts.** It is famously hard to learn. Every speed-up is a modifier-click, and a phone has no Ctrl or Alt. Tetris
with rotation is fun in the stash and awful in a fight.

**Take.** **Quick-move as the main action**: one tap sends the picked item to the other side, with no drag. Looting
that **takes time and keeps the world running**: our PACK already keeps the world running, and a search time is listed
as phase-2 work in WEB_INVENTORY. **Leave.** Modifier keys, and rotating items.

## 5. Project Zomboid: weight, the loot-all button, and transfer times

**How it works.** A list, not a grid: each row is an item (or a collapsed stack) with its weight. Containers you're
near are **buttons down the right edge of the loot window**: the floor, the shelf, the corpse, the car's seats and
trunk. Your own bags are the same kind of buttons down the right edge of the inventory window. Every transfer takes in-game time, so you watch a little progress bar. There are **Loot All** and
**Transfer All** buttons. Right-click gives the actions an item can do (eat, read, equip, put in a bag).

**Easy.** It is a **list**, which reads well and scales to hundreds of items. The container buttons make it clear what
is nearby. Loot All is used all the time. Weight is the only number that matters, and the screen always shows it.

**Hurts.** The container buttons get tiny and many, and the right-click menu is long. Timed transfers can feel slow when you're
safe.

**Take.** **List rows, not a grid** (we already use lists). **Loot All.** The weight and room bars on screen at all
times (we have WEIGHT and ROOM meters). **Leave.** Right-click menus; a phone has none.

## 6. GTA V: the weapon wheel

**How it works.** Hold a button and, in single player, the world slows down (online it keeps full speed). A **radial wheel** of eight sectors (pistols, SMGs,
rifles, throwables and so on) comes up. Point the stick (or the mouse) at a sector and let go. Each sector cycles
within its kind. It doesn't count weight or space; it's a quick choice and nothing else.

**Easy.** It's the fastest choice in the genre: one hold, one flick, one release, and your eyes stay on the fight.
Pointing in a direction is the most natural thing a thumb can do.

**Hurts.** You can't manage things with it: no dropping, no looting, and nothing about how much you carry.

**Take.** We **already have** this. The radial wheel is in `web/src/ui/weaponbar.js` and in WEB_CONTROLLER's
`radial` binding. The lesson for the PACK is the **thumb arc**: the buttons you press most go where the thumb rests
(the bottom and the right edge in landscape), and they are big. **Leave.** Using a wheel for the whole pack; a wheel
is for choosing, not for managing.

---

## 7. What the six agree on

| Lesson | 7DTD | SCUM | DayZ | Tarkov | PZ | GTA | Our PACK today |
|---|---|---|---|---|---|---|---|
| Nearby things always on screen as "the other side" | box | vicinity | vicinity | open box | container buttons | - | yes: box, body, trunk, else the ground |
| A one-action quick move (no drag) | shift-click | - | double-click | ctrl-click | double-click | - | double-click only, which a phone breaks |
| Take everything at once | Take All | - | - | - | Loot All | - | **no** |
| One "does the right thing" use action | - | - | double-click | alt-click | right-click | - | yes: E slings, wears, eats |
| Weight and room always shown | slots | weight | weight | weight | weight | - | yes: meters |
| Big targets where the thumb rests | - | - | - | - | - | yes | **no**: small rows, buttons in the middle |
| The world keeps running while you look | yes | yes | yes | yes (timed) | yes (timed) | slows | yes |

**Our PACK is already strong** on the basics most of them get right: a list, the other side picked for you, weight and
room on screen, a smart E, and the world still running. **It is weak** in three places, all for the one-thumb case:

1. **Moving needs a double-click.** A phone turns a double-tap into zoom, and because the list redraws after the first
   tap, the second tap often lands on a new row element and the double-click never arrives. A mouse user gets a
   select, then a move. A thumb user gets nothing.
2. **No Take All.** Looting a body is seven picks and seven moves. 7DTD and PZ both prove one button is worth it.
3. **The action buttons are small and sit in the middle** of the detail panel, out of the thumb's reach, with key
   hints a phone player can't use.

## 8. The one-thumb PACK rework (build list, its own PR)

Rules for the build: no new keys that clash with play (the PACK owns the keyboard while it is open, `main.js` 701); no
theft or buying in bulk (TAKE ALL refuses at a counter and on an owned shelf), and no move, take or buy from a single
stray tap (one tap only picks; the pick is used up by any action, key, close or change of the other side); and none of DSA2's files touched (hud.css, hud.js, the touch controls).

1. **Tap again to move.** A tap on the row that is already picked does that row's MOVE: TAKE, PUT IN, BUY or SELL,
   whatever the MOVE button says. The first tap picks it. That replaces the double-click (a desktop double-click is
   exactly "pick, then tap again", so it still moves once, never twice).
2. **TAKE ALL** (key **R**; a button over the other side's list). Moves every slot from the other side into your pack
   until it is full, then says how many came across and what was left. The button is **hidden** at a trader's counter
   (buying all is not a tap) and on an **owned shelf** (stealing all is not a tap). There you pick each thing, and
   theft stays a choice. It never slings a gun or wears a pack; those stay E.
3. **A full-screen phone card with CLOSE.** On a touch screen (`pointer: coarse`) only: the card fills the screen
   with one scrolling body, the item rows first and the doll below them; rows, doll chips, TAKE ALL and **CLOSE** at
   least 44 px; the action bar at the bottom with 48 px buttons; no keyboard hints. CLOSE is the way out on a phone,
   and the touch bar (PACK / MAP / pause) hides while the card is open. With a mouse the PACK looks exactly as
   before, with no CLOSE or TAKE ALL button drawn (R and I / Esc still work). New styles go in `web/src/ui/inventory.css`, which
   `inventory.js` imports, so `hud.css` is left alone.
4. **Proof:** a scenario `pack-thumb` that taps (DOM clicks, the way a thumb arrives) and asserts:
   - a second tap on a picked row moves it;
   - TAKE ALL empties a body into the pack;
   - TAKE ALL is hidden and refuses on an owned shelf;
   - a double-click moves one row once, not twice;
   - one tap after MOVE, USE, TAKE ALL, BUY, closing or a new other side moves and buys nothing;
   - the exact count in "NO ROOM FOR N MORE", and the 44 / 48 px sizes on touch.

   It fails on main.

**Later, not in this PR:** Stash (put away what the box already has, from 7DTD); a search time with noise (Tarkov
and PZ, already open in WEB_INVENTORY); sorting; a pad binding for TAKE ALL (WEB_CONTROLLER's PACK row has LB free).
