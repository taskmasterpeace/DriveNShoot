// CAR DOORS (VEHICLES V2 slice 3, Robert 11-12: "cars hold the doors open, and when you get in, give him a second to
// close the door, I want to be able to leave the door open"). systems/cardoors.js runs them; vehicledamage.deform swings
// the door panels (the body's PART.doorL / doorR / doorL2 / doorR2 vertices) round their front edge.
//   getting in   the door swings open, you sit, and it shuts a beat later; keep F held through the beat and it stays open
//   getting out  the door swings open and stays open (you left it open); it shuts the next time someone gets in
//   driving      an open door rides along; past slamSpeed the wind slams it; a side hit while it is open tears it off
// Pure data + pure functions (no three.js): tools/cardoors.test.mjs runs them in node.

export const DOORS = {
  open: 1.15,      // radians a door swings out, fully open (about 66 degrees)
  swing: 0.28,     // seconds from shut to open (and back)
  beat: 0.9,       // seconds after you sit before the door shuts (hold F through it to leave it open)
  slamSpeed: 9,    // m/s: faster than this, an open door is slammed shut by the wind
  tearK: 0.08,     // a crash dent this big on the open door's side tears it off its hinges
};

// The door a seat uses: the side it sits on (left = the driver's side, +x in the body frame), the row (0 front, 1 back).
export function doorFor(seat) {
  if (!seat) return 'doorL';
  const L = seat.side !== 'right';
  return seat.row >= 1 ? (L ? 'doorL2' : 'doorR2') : (L ? 'doorL' : 'doorR');
}
export const DOOR_SIDE = { doorL: 1, doorL2: 1, doorR: -1, doorR2: -1 };
export const DOOR_ZONE = { doorL: 'left', doorL2: 'left', doorR: 'right', doorR2: 'right' };
export const DOOR_BIT = { doorL: 1, doorR: 2, doorL2: 4, doorR2: 8 }; // the multiplayer presence's door bits

// One step of a door toward its target angle (0 shut .. DOORS.open), at the swing's rate.
export function stepDoor(a, want, dt) {
  const rate = DOORS.open / DOORS.swing * dt;
  return a < want ? Math.min(want, a + rate) : Math.max(want, a - rate);
}

// Swing a body-frame point (x, z) of a door round its hinge (hx, hz: the door's front edge, at its skin) by `ang`;
// `side` +1 for a left door (it opens toward +x), -1 for a right one. Returns [x, z].
export function hingeRotate(x, z, hx, hz, ang, side) {
  const dx = x - hx, dz = z - hz, c = Math.cos(ang), s = Math.sin(ang) * side;
  return [hx + dx * c - dz * s, hz + dz * c + dx * s];
}

// Door bits <-> the doors that are open (a door counts as open past half way).
export function doorBits(doors) { let b = 0; for (const k in DOOR_BIT) if ((doors?.[k]?.a ?? 0) > DOORS.open * 0.5) b |= DOOR_BIT[k]; return b; }
export function openFromBits(b) { return Object.keys(DOOR_BIT).filter((k) => b & DOOR_BIT[k]); }
