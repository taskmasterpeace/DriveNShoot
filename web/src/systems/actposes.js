// THE ACTION POSES (docs/design/WEB_TIMED_ACTIONS.md §3.5): what a body does while a timed action runs, solved on the
// shared pose solver (systems/characters.js). The solver calls these three when ch.act is set ({ pose, t, k, rung }:
// systems/actions.js keeps it): actLegs moves the foot targets and returns the hip height, actUpper gives the lean,
// twist and the head's tilt down, actArms puts both hand targets. Frames are the solver's: legs in the leg frame
// (feet at y = ANKLE_Y, +z forward, +x the body's LEFT), arms in the upper-body frame (from the waist, leaned with the
// torso). Every pose is chosen to read from straight above: a kneel folds the body short, a pat-down rocks the hands
// over the ground, look-around bows the head and sweeps, a kick throws a boot out ahead, a sledge swings the length of
// the body, a climb puts both hands above the head. LSW bodies retarget from the same joints.
// No allocation: callers pass their own vectors; the upper-body answer is written into one module object.
const ANKLE_Y = 0.08, TAU = Math.PI * 2;
const cyc = (t, period) => ((t % period) + period) % period / period;

export const POSES = {
  kneel: { name: 'kneel and rummage' }, patdown: { name: 'kneel and pat down' }, lookdown: { name: 'head down, scanning the ground' },
  kick: { name: 'boot out' }, pick: { name: 'crouched at the lock' }, pry: { name: 'bar in, heaving' }, cut: { name: 'jaws on the shackle' },
  sledge: { name: 'overhead swing' }, duck: { name: 'bent double under the door' }, climb: { name: 'hand over hand' },
  reach: { name: 'arms up' }, work: { name: 'hands at work' }, board: { name: 'hammering boards' },
};

// Legs: returns hipY.
export function actLegs(a, tgt, footPitch, hipY) {
  const t = a.t;
  switch (a.pose) {
    case 'kneel': case 'patdown': // the left foot planted ahead, the right knee on the ground behind
      tgt[0].set(0.16, ANKLE_Y, 0.24); tgt[1].set(-0.14, ANKLE_Y, -0.42); footPitch[0] = 0; footPitch[1] = 1.1;
      return 0.5;
    case 'pick': // a deep crouch at the lock, staggered
      tgt[0].set(0.17, ANKLE_Y, 0.12); tgt[1].set(-0.15, ANKLE_Y, -0.14); footPitch[0] = footPitch[1] = 0;
      return 0.58;
    case 'duck': // bent double, legs wide and folded
      tgt[0].set(0.2, ANKLE_Y, 0.16 + 0.1 * Math.sin(t * 6)); tgt[1].set(-0.2, ANKLE_Y, -0.16 - 0.1 * Math.sin(t * 6));
      return 0.5;
    case 'pry': case 'cut': case 'sledge': { // a wide braced stance, the back foot driving
      tgt[0].set(0.2, ANKLE_Y, 0.22); tgt[1].set(-0.18, ANKLE_Y, -0.26);
      return a.pose === 'sledge' ? 0.84 - 0.08 * Math.max(0, Math.sin(cyc(t, a.dur || 0.9) * Math.PI)) : 0.84;
    }
    case 'kick': { // wind up, the boot driven out level at the door, back down
      const u = cyc(t, a.dur || 0.6), out = Math.sin(Math.min(1, u / 0.55) * Math.PI);
      tgt[0].set(0.15, ANKLE_Y, -0.06); // the standing leg
      tgt[1].set(-0.1, ANKLE_Y + 0.5 * out, -0.15 + 0.78 * out); footPitch[1] = -0.6 * out;
      return 0.9;
    }
    case 'climb': { // feet on alternate rungs in front, a rung apart
      const odd = (a.rung ?? 0) & 1, step = 0.3;
      tgt[0].set(0.14, ANKLE_Y + (odd ? step : 0) + 0.06, 0.28); tgt[1].set(-0.14, ANKLE_Y + (odd ? 0 : step) + 0.06, 0.28);
      footPitch[0] = footPitch[1] = -0.2;
      return 0.86;
    }
    case 'lookdown': case 'reach': case 'work': case 'board':
    default:
      return hipY;
  }
}

// Upper body: writes out.lean (forward, rad), out.twist, out.tilt (head roll) and out.head (extra head pitch down).
export function actUpper(a, out) {
  const t = a.t;
  out.twist = 0; out.tilt = 0;
  switch (a.pose) {
    case 'kneel': out.lean = 0.55 + 0.06 * Math.sin(t * 3); out.head = 0.45; out.twist = 0.15 * Math.sin(t * 1.3); break;
    case 'patdown': out.lean = 0.7; out.head = 0.4; out.twist = 0.28 * Math.sin(t * 2.2); break;
    case 'lookdown': out.lean = 0.28; out.head = 0.75; out.twist = 0.65 * Math.sin(t * 0.9); out.tilt = 0.12 * Math.sin(t * 0.9 + 1); break;
    case 'kick': { const u = cyc(t, a.dur || 0.6); out.lean = -0.18 * Math.sin(Math.min(1, u / 0.55) * Math.PI); out.head = 0.1; break; }
    case 'pick': out.lean = 0.2; out.head = 0.3; out.tilt = 0.15; break;
    case 'pry': out.lean = 0.25 - 0.22 * Math.max(0, Math.sin(t * 5)); out.head = 0.15; out.twist = -0.2; break;
    case 'cut': out.lean = 0.3; out.head = 0.25; break;
    case 'sledge': { const u = cyc(t, a.dur || 0.9); out.lean = -0.2 + 0.7 * Math.sin(u * Math.PI * 0.5) ** 2 * (u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3); out.head = 0.1; out.twist = -0.35 * (1 - u); break; }
    case 'duck': out.lean = 1.0; out.head = -0.45; break; // the head up to see where it is going
    case 'climb': out.lean = -0.05; out.head = -0.25; break; // looking up the ladder
    case 'reach': out.lean = -0.1; out.head = -0.4; break;
    case 'work': case 'board': out.lean = 0.12; out.head = 0.2; break;
    default: out.lean = 0; out.head = 0;
  }
  return out;
}

// Arms: both hand targets, upper-body frame (the waist), +x the body's left.
export function actArms(a, tgt) {
  const t = a.t;
  switch (a.pose) {
    case 'kneel': { const r = Math.sin(t * 7) * 0.08; tgt[0].set(0.2, -0.05 + r, 0.48); tgt[1].set(-0.18, -0.05 - r, 0.5 + r); break; }
    case 'patdown': { const p = Math.abs(Math.sin(t * 6.5)) * 0.12, s = Math.sin(t * 2.2) * 0.12; tgt[0].set(0.16 + s, -0.12 + p, 0.5); tgt[1].set(-0.16 + s, -0.12 + 0.12 - p, 0.46); break; }
    case 'lookdown': tgt[0].set(0.3, 0.06, 0.14); tgt[1].set(-0.26, 0.2, 0.3); break; // one hand on the thigh, one half out
    case 'kick': tgt[0].set(0.44, 0.42, -0.04); tgt[1].set(-0.42, 0.4, 0.08); break; // out for balance
    case 'pick': { const j = Math.sin(t * 17) * 0.012; tgt[0].set(0.05, 0.28 + j, 0.34); tgt[1].set(-0.04, 0.26 - j, 0.34); break; }
    case 'pry': { const h = Math.max(0, Math.sin(t * 5)) * 0.14; tgt[0].set(0.06, 0.34, 0.46 - h); tgt[1].set(-0.04, 0.12, 0.4 - h); break; }
    case 'cut': { const q = Math.max(0, Math.sin(t * 4)); tgt[0].set(0.26 - 0.14 * q, 0.3, 0.5); tgt[1].set(-0.26 + 0.14 * q, 0.3, 0.5); break; }
    case 'sledge': { // up and back over the shoulder, down and out to the door
      const u = cyc(t, a.dur || 0.9), s = u < 0.7 ? u / 0.7 : 1 - (u - 0.7) / 0.3, y = 0.95 - 0.85 * s, z = 0.02 + 0.6 * s;
      tgt[0].set(0.04, y, z); tgt[1].set(-0.06, y - 0.12, z - 0.06); break;
    }
    case 'duck': tgt[0].set(0.16, 0.08, 0.38); tgt[1].set(-0.16, 0.08, 0.38); break;
    case 'climb': { const odd = (a.rung ?? 0) & 1; tgt[0].set(0.22, 0.78 + (odd ? 0 : 0.18), 0.36); tgt[1].set(-0.22, 0.78 + (odd ? 0.18 : 0), 0.36); break; }
    case 'reach': tgt[0].set(0.14, 1.0, 0.26); tgt[1].set(-0.14, 1.0, 0.26); break;
    case 'work': case 'board': default: { const b = Math.sin(t * 11) * 0.05; tgt[0].set(0.15, 0.32 + b, 0.42); tgt[1].set(-0.15, 0.32 - b, 0.42); }
  }
}
export const _TAU = TAU;
