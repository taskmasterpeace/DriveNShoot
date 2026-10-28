// THE CONTROLS AS ROWS (docs/design/WEB_CONTROLLER.md). Every verb is an ACTION with its keyboard/mouse keys and its pad
// buttons, per context, in one row. The idea is the Godot build's input_bindings.json, ported: data first, rebindable,
// and the player's rebinds (localStorage 'dsoa.bindings') win over these defaults. engine/controls.js folds them.
//
// A row:
//   id      the action
//   label   what the CONTROLS list calls it (player-facing)
//   group   MOVE | ON FOOT | WEAPONS | DRIVING | WORLD | MENUS
//   code    the canonical key code main.js already reads for this verb (I.key('KeyR')). A rebind makes the new key emit
//           this code, so the engine's verbs need no rewrite. null: a verb engine/controls.js answers itself (held/hit).
//   keys    physical keys (KeyboardEvent.code), or 'mouse:left' / 'mouse:right' / 'wheel'
//   pad     { <context>: button } where context is foot | drive | ride | talk | menu | radial, and a button is one of
//           a b x y lb rb lt rt back start l3 r3 up down left right, or a chord 'back+<button>' (hold VIEW, press it).
//           Contexts: foot = on your feet; drive = at the wheel; ride = a passenger seat, hanging on, the train roof;
//           talk = a conversation; menu = the PACK screen; radial = the weapon wheel is open (RB held).
// Pad buttons use the browser's standard mapping (Xbox names; PS-family pads read the same: cross = a, circle = b,
// square = x, triangle = y).
export const BINDINGS = [
  // ---- movement (the sticks are analog and live in PAD below; these are the keys) -------------------------------------
  { id: 'up', label: 'Move north / throttle', group: 'MOVE', code: 'KeyW', keys: ['KeyW', 'ArrowUp'], pad: { menu: 'up' } },
  { id: 'down', label: 'Move south / brake, reverse', group: 'MOVE', code: 'KeyS', keys: ['KeyS', 'ArrowDown'], pad: { menu: 'down' } },
  { id: 'left', label: 'Move west / steer left', group: 'MOVE', code: 'KeyA', keys: ['KeyA', 'ArrowLeft'], pad: { menu: 'left' } },
  { id: 'right', label: 'Move east / steer right', group: 'MOVE', code: 'KeyD', keys: ['KeyD', 'ArrowRight'], pad: { menu: 'right' } },
  { id: 'sprint', label: 'Sprint / boost (pad: click to run, stop to drop it)', group: 'MOVE', code: 'ShiftLeft', keys: ['ShiftLeft', 'ShiftRight'], pad: { foot: 'l3', drive: 'l3' } },
  { id: 'crouch', label: 'Crouch (hold) / dive under water', group: 'MOVE', code: 'ControlLeft', keys: ['ControlLeft', 'ControlRight'], pad: { foot: 'b' } },
  { id: 'prone', label: 'Go prone / get up (toggle): low, slow, hidden in grass', group: 'MOVE', code: 'AltLeft', keys: ['AltLeft'], pad: { foot: 'back+lt' } },
  { id: 'dive', label: 'Dive roll / handbrake', group: 'MOVE', code: 'Space', keys: ['Space'], pad: { foot: 'a', drive: 'a', menu: 'y' } },

  // ---- on foot -----------------------------------------------------------------------------------------------------
  { id: 'fire', label: 'Fire (at the wheel: out of the window, or the hood gun)', group: 'WEAPONS', code: null, keys: ['mouse:left'], pad: { foot: 'rt', ride: 'rt', drive: 'lb' } },
  { id: 'melee', label: 'Melee: tap strike, hold and let go to kick, sprint into it to shove', group: 'WEAPONS', code: null, keys: ['mouse:right'], pad: { foot: 'r3' } },
  { id: 'reload', label: 'Reload / clear a jam', group: 'WEAPONS', code: 'KeyR', keys: ['KeyR'], pad: { foot: 'x', drive: 'x', ride: 'x' } },
  { id: 'holster', label: 'Weapon up or down (tap) / holster or draw (hold)', group: 'WEAPONS', code: null, keys: ['KeyH'], pad: { foot: 'up' } },
  { id: 'grip', label: 'One hand / two hands', group: 'WEAPONS', code: null, keys: ['KeyJ'], pad: { foot: 'lb', ride: 'lb' } },
  { id: 'mode', label: 'Next fire mode (or tap the slot number again)', group: 'WEAPONS', code: null, keys: ['KeyB'], pad: { radial: 'right' } },
  { id: 'modePrev', label: 'Previous fire mode (weapon wheel)', group: 'WEAPONS', code: null, keys: [], pad: { radial: 'left' } },
  { id: 'wheel', label: 'Next weapon (Alt+wheel; pad: tap) / weapon wheel (hold)', group: 'WEAPONS', code: null, keys: ['wheel'], pad: { foot: 'rb', ride: 'rb', drive: 'rb', radial: 'rb' } },
  { id: 'throw', label: 'Throw: hold to aim and cook, let go to throw', group: 'WEAPONS', code: 'KeyQ', keys: ['KeyQ'], pad: { foot: 'lt', drive: 'up', ride: 'lt' } },
  { id: 'nextThrow', label: 'Next throwable', group: 'WEAPONS', code: 'KeyX', keys: ['KeyX'], pad: { foot: 'left', menu: 'x' } },
  { id: 'slot1', label: 'Weapon slot 1 (again: fire mode)', group: 'WEAPONS', code: 'Digit1', keys: ['Digit1'], pad: { talk: 'up' } },
  { id: 'slot2', label: 'Weapon slot 2 (again: fire mode)', group: 'WEAPONS', code: 'Digit2', keys: ['Digit2'], pad: { talk: 'right' } },
  { id: 'slot3', label: 'Weapon slot 3 (again: fire mode)', group: 'WEAPONS', code: 'Digit3', keys: ['Digit3'], pad: { talk: 'down' } },
  { id: 'slot4', label: 'Weapon slot 4 (again: fire mode)', group: 'WEAPONS', code: 'Digit4', keys: ['Digit4'], pad: { talk: 'left' } },
  { id: 'slot5', label: 'Weapon slot 5', group: 'WEAPONS', code: 'Digit5', keys: ['Digit5'], pad: { talk: 'lb' } },
  { id: 'slot6', label: 'Weapon slot 6', group: 'WEAPONS', code: 'Digit6', keys: ['Digit6'], pad: { talk: 'rb' } },

  // ---- the world -----------------------------------------------------------------------------------------------------
  // Pad Y on foot is the smart USE: talk, a door, a box, a bed - or the car in reach (it presses F for you).
  { id: 'interact', label: 'Talk / kick a door / search / horn at the wheel (hold at a window: board it)', group: 'WORLD', code: 'KeyE', keys: ['KeyE'], pad: { foot: 'y', drive: 'r3', talk: 'a', menu: 'a' } },
  { id: 'vehicle', label: 'Drive / get out', group: 'WORLD', code: 'KeyF', keys: ['KeyF'], pad: { drive: 'y', ride: 'y' } },
  { id: 'ride', label: 'Ride along / change seat', group: 'WORLD', code: 'KeyC', keys: ['KeyC'], pad: { foot: 'back+a', drive: 'left', ride: 'left' } },
  { id: 'hang', label: 'Hang onto a car / jump on the train', group: 'WORLD', code: 'KeyG', keys: ['KeyG'], pad: { foot: 'back+b', drive: 'back+b', ride: 'back+b' } },
  { id: 'harpoon', label: 'Harpoon / yank (the Whaler)', group: 'DRIVING', code: 'KeyH', keys: ['KeyH'], pad: { drive: 'rb' } },
  { id: 'detonate', label: 'Set off your remote charges / drop a drone bomb', group: 'WEAPONS', code: 'Backquote', keys: ['Backquote'], pad: { foot: 'back+rt', drive: 'back+rt' } },
  { id: 'dropTail', label: 'The tail (group 2): oil, caltrops, smoke, mines, flares, paint', group: 'DRIVING', code: 'KeyB', keys: ['KeyB'], pad: { drive: 'b' } },
  { id: 'fireTurret', label: 'Fire the roof turret (group 3) where you aim', group: 'DRIVING', code: null, keys: ['mouse:right'], pad: { drive: 'back+rb' } },
  { id: 'workshop', label: 'Workshop (at a garage, your car parked close)', group: 'WORLD', code: 'KeyU', keys: ['KeyU'], pad: { foot: 'back+right' } },
  { id: 'pack', label: 'Pack', group: 'WORLD', code: 'Tab', keys: ['Tab', 'KeyI'], pad: { foot: 'down', drive: 'down', ride: 'down', menu: 'b' } },
  { id: 'use', label: 'Patch up, drink or eat (what you need most)', group: 'WORLD', code: 'KeyV', keys: ['KeyV'], pad: { foot: 'right', drive: 'right', ride: 'right' } },
  { id: 'sleep', label: 'Sleep (a bed, a bedroll, a parked car)', group: 'WORLD', code: 'KeyN', keys: ['KeyN'], pad: { foot: 'back+y', drive: 'back+y' } },
  { id: 'light', label: 'Flashlight', group: 'WORLD', code: 'KeyL', keys: ['KeyL'], pad: { foot: 'back+x', drive: 'back+x', ride: 'back+x' } },
  { id: 'zoomOut', label: 'Zoom out', group: 'WORLD', code: 'Minus', keys: ['Minus'], pad: { foot: 'back+down', drive: 'back+down', ride: 'back+down' } },
  { id: 'zoomIn', label: 'Zoom in', group: 'WORLD', code: 'Equal', keys: ['Equal'], pad: { foot: 'back+up', drive: 'back+up', ride: 'back+up' } },
  { id: 'zoom', label: 'Zoom out a stop (Shift: in) - the mouse wheel zooms smoothly (pad: VIEW + right stick)', group: 'WORLD', code: 'KeyZ', keys: ['KeyZ'], pad: {} },
  { id: 'look', label: 'Look far (hold): the view leans out toward the cursor (pad: the right stick thrown all the way)', group: 'WORLD', code: null, keys: ['mouse:middle'], pad: {} },
  { id: 'camView', label: 'Camera view: top-down / angled / iso / chase (at the wheel)', group: 'WORLD', code: 'KeyO', keys: ['KeyO'], pad: { foot: 'back+r3', drive: 'back+r3', ride: 'back+r3' } },
  { id: 'isoLeft', label: 'ISO view: turn 90 left', group: 'WORLD', code: 'BracketLeft', keys: ['BracketLeft'], pad: {} },
  { id: 'isoRight', label: 'ISO view: turn 90 right', group: 'WORLD', code: 'BracketRight', keys: ['BracketRight'], pad: {} },
  { id: 'map', label: 'Map', group: 'WORLD', code: 'KeyM', keys: ['KeyM'], pad: { foot: 'back', drive: 'back', ride: 'back' } },
  { id: 'pause', label: 'Pause menu / close', group: 'WORLD', code: 'Escape', keys: ['Escape'], pad: { foot: 'start', drive: 'start', ride: 'start', talk: 'b', menu: 'start' } },
  { id: 'fastTime', label: 'Fast time', group: 'WORLD', code: 'KeyT', keys: ['KeyT'], pad: { foot: 'back+lb', drive: 'back+lb' } },
  { id: 'weather', label: 'Next weather', group: 'WORLD', code: 'KeyY', keys: ['KeyY'], pad: { foot: 'back+rb' } },
  { id: 'photo', label: 'Photo mode', group: 'WORLD', code: 'KeyK', keys: ['KeyK'], pad: { foot: 'back+l3' } },
  { id: 'menuPause', label: 'Pause menu (alternate)', group: 'WORLD', code: 'KeyP', keys: ['KeyP'], pad: {} },
  { id: 'save', label: 'Quick save', group: 'WORLD', code: 'F5', keys: ['F5'], pad: { foot: 'back+start' } },
  { id: 'load', label: 'Quick load', group: 'WORLD', code: 'F9', keys: ['F9'], pad: {} },
  { id: 'radioNext', label: 'Radio: next station (in a car, or with a portable radio)', group: 'WORLD', code: null, keys: ['Period'], pad: {} },
  { id: 'radioPrev', label: 'Radio: previous station', group: 'WORLD', code: null, keys: ['Comma'], pad: {} },
  { id: 'charsheet', label: 'Character sheet and journal', group: 'WORLD', code: null, keys: ['Backquote'], pad: {} },
  { id: 'controls', label: 'Controls: every binding, press to rebind', group: 'WORLD', code: null, keys: ['F2'], pad: { foot: 'back+left' } },
  { id: 'hudEdit', label: 'HUD layout editor: move, size, hide and preset the HUD', group: 'WORLD', code: null, keys: ['F6'], pad: {} },
  // The crew (docs/design/WEB_CREW.md): tap for the CREW panel, hold for the orders radial (the pad: hold LB, the right
  // stick picks; LB's tap is still the grip, and a hold that opens the radial puts the grip back).
  { id: 'crew', label: 'Crew: tap the CREW panel, hold for orders (at a garage U is the workshop)', group: 'WORLD', code: null, keys: ['KeyU'], pad: { foot: 'lb', ride: 'lb' } },

  // The PACK screen on a pad: the D-pad walks the list, A uses, Y moves, X drops, B closes (above).
  { id: 'menuWear', label: 'PACK: wear or take off', group: 'MENUS', code: 'KeyF', keys: [], pad: { menu: 'rb' } },
  // The WORKSHOP screen on a pad: the D-pad walks the rack, A fits, X takes off, Y picks the face, LB / RB the tabs, B closes.
  { id: 'menuTabPrev', label: 'WORKSHOP: previous tab', group: 'MENUS', code: 'KeyQ', keys: [], pad: { menu: 'lb' } },
];

// The sticks and triggers. Radial dead zones (a stick at rest reads 0 however worn), then a response curve:
// out = ((|v| - inner) / (outer - inner)) ^ curve, clamped to 0..1, along the stick's own direction.
export const PAD = {
  move: { inner: 0.18, outer: 0.94, curve: 1.15 },
  // Right stick: the aim. Its tilt sets how far out the aim point sits (reach), so a light touch looks close and a full
  // throw looks down the street; the camera's lean follows the aim point (main.js updateCamera), so it leads the view.
  aim: { inner: 0.2, outer: 0.92, curve: 1.6, reach: [4.5, 17], rest: 6, turn: 26, raiseAt: 0.55 },
  trigger: { inner: 0.08, press: 0.32, release: 0.22 }, // hysteresis: a trigger feathered at the line never chatters
  walkMin: 0.32,   // the least speed share a light tilt gives (a creep), on foot
  // Aim assist, PAD ONLY and small: a living person within `cone` degrees of the stick's line and within the weapon's
  // reach draws the aim toward them by `pull` of the gap, never more than `maxDeg`. Never with the mouse.
  assist: { cone: 7, pull: 0.45, maxDeg: 4.5, minRange: 2 },
  holdTime: 0.32,  // s a button counts as held (RB wheel, H holster, slot hold, melee heavy)
  repeat: 0.38,    // s between repeats while a slot number is held (the mode boxes cycle)
  radialAt: 0.5,   // stick tilt that picks a wedge on the weapon wheel
  idleSwitch: 0.25, // a mouse move or a key press this many s after the pad was last touched hands control back
};

// Rumble on the pad (dual-rumble: strong = the big motor, weak = the small one), by what happened.
export const RUMBLE = {
  hurt: { strong: 0.7, weak: 0.4, ms: 140, per: 0.012 }, // + per point of damage (to 1)
  shot: { strong: 0.0, weak: 0.32, ms: 45, per: 0.6 },   // per = weapon shake
  melee: { strong: 0.5, weak: 0.3, ms: 90, per: 0 },
  blast: { strong: 1.0, weak: 0.6, ms: 320, per: 0 },
  crash: { strong: 0.8, weak: 0.5, ms: 180, per: 0 },
};
