// The play camera (systems/camrig.js; docs/design/WEB_CAMERA.md). One continuous BOOM: a distance D (m) along an arm
// pitched θ off vertical, yawed ψ round the look point L. camera = L + (D sinθ sinψ, D cosθ, D sinθ cosψ); ψ = 0 puts
// the camera south of L, so north stays up the screen.
//
// VIEWS (O cycles them; pad: VIEW+R3). Each view remembers its own D per mode (on foot / at the wheel).
//   TOPDOWN  the default and the game's identity: today's rig, θ = atan 0.14 ≈ 8°, north up.
//   ANGLED   θ follows D (gap §4.1): close is third-person-ish, far is a map. North up.
//   ISO      a fixed ~35° pitch; [ and ] (or Alt+Q / Alt+E) turn it in 90° snaps (this view only).
//   CHASE    at the wheel only: behind and above the car, the yaw follows its heading. On foot it reads as ANGLED.
//
// ZOOM is continuous: the mouse wheel scales D by wheelStep per notch, in a car too (Alt+wheel cycles weapons). Z /
// Shift+Z / - / = step the five named stops below (a stop's number is D for that mode; `zoom level=` keeps working).
// Getting out of a car eases D to the foot memory (or foot.dStart); getting in eases out to the drive memory.
//
// Whatever spawns "out of sight" (night hordes, the director's squads, raiders at their camps) and whatever is tidied
// away "out of sight" (old bodies, the infected at dawn) measures against the current view (g.viewR): the farthest of
// the four frustum corners on the ground (gap §4.2), so a tilted view never watches things pop in or vanish. The sun's
// shadow box and the fog follow the view too (sky.js).
export const ZOOM = {
  levels: [
    { name: 'CLOSE', foot: 22, drive: 30 },
    { name: 'STREET', foot: 33, drive: 40 },
    { name: 'WIDE', foot: 55, drive: 64 },
    { name: 'FAR', foot: 86, drive: 96 },
    { name: 'HIGH', foot: 130, drive: 140 },
  ],
  start: 0,        // the stop nearest foot.dStart (CLOSE): the selftest's reset puts it back here
  indoor: 26,
  speedLift: 0.75,
  maxHeight: 175,
  follow: 5,       // 1/s: how fast the camera's aim point chases its target (exponential, frame-rate independent)
  heightRate: 2.2, // 1/s: how fast D settles on a new target (a stop, a wheel notch, getting in or out)
};

export const CAMERA = {
  views: ['TOPDOWN', 'ANGLED', 'ISO', 'CHASE', 'THIRD', 'SHOULDER'],
  start: 'TOPDOWN',
  foot: { dMin: 9, dMax: 140, dStart: 22 },
  drive: { dMin: 24, dMax: 175, dStart: 70, speedLift: 0.75 },
  indoor: { dMax: 26, thetaMax: 42 },    // inside a building: D and θ never above these
  wheelStep: 1.15,                       // one notch = x1.15 D (out) or /1.15 (in)
  vfov: 42,                              // degrees (the half, φ = 21°, is the frustum maths' φ)
  thetaSum: 80,                          // θ + φ never above this: the frame's top edge stays on the ground
  thetaRate: 4,                          // 1/s: how fast θ settles (a view change, a zoom on ANGLED)
  yawRate: 3,                            // 1/s: how fast ψ follows (CHASE heading, ISO snaps)
  lean: 0.25,                            // on foot the look point leans toward the cursor by this share...
  leanMax: 8,                            // ...up to this many m (x D/33 when zoomed out)
  // Look far (hold the middle button; pad: the right stick thrown past `padAt` for `padHold` s): the look point goes all
  // the way to the cursor, up to `lookFar` of the view radius (viewR) - scout past the edge of your normal view.
  lookFar: 0.7, padAt: 0.95, padHold: 0.4,
  far: 600, farTilted: 1200,             // the camera's far plane: raised when a pitched view can see far ground
  view: {
    TOPDOWN: { theta: 7.97 },
    ANGLED: { foot: { thetaClose: 50, thetaFar: 10 }, drive: { thetaClose: 36, thetaFar: 8 } },
    ISO: { theta: 35, yawSnap: 90 },
    CHASE: { theta: 52, dStart: 26, dMin: 12, dMax: 90, ahead: 3 }, // ahead: m the look point leads the car
  },
  // THE BODY VIEWS (docs/design/WEB_CAMERA_BODY.md): THIRD follows behind you, SHOULDER sits over one shoulder. On foot
  // only (at the wheel both read as CHASE). The mouse (or the right stick) turns the view and looks up and down; W walks
  // the way the view faces. The boom never passes a wall and never rises through the ceiling of the floor you are on.
  //   dMin/dMax/dStart  the boom (m); side: m off your centre line to the shoulder; eye: m above your feet it pivots at
  //   aimD   SHOULDER while you hold aim (right button): the boom pulls in to this
  //   pitch  [down, up] limits (deg; 0 = level); pitchStart; sens: rad per mouse pixel (x the setting); padRate: rad/s
  //   pad    m the boom stops short of a wall; ceil: the ceiling over a floor you stand on indoors (m), ceilGap under it;
  //   floor  the camera never sinks under this (m over your feet); hardMin: the boom never shorter than this
  //   near   the near plane (m); viewR: the 'in sight' radius reported to spawners and the sun's shadow box (m);
  //   aimRange  how far out the aim point sits when nothing stops it (m); rate: 1/s the boom settles
  body: {
    THIRD: { dMin: 2.2, dMax: 9, dStart: 5, side: 0, eye: 1.55 },
    SHOULDER: { dMin: 1.2, dMax: 2.8, dStart: 2.0, side: 0.55, eye: 1.6, aimD: 1.25 },
    pitch: [-55, 60], pitchStart: -10, sens: 0.0026, padRate: 2.4, pad: 0.3, ceil: 2.8, ceilGap: 0.25, floor: 0.35, hardMin: 0.35,
    near: 0.12, viewR: 110, aimRange: 30, rate: 9,
  },
  // The cutaway (systems/cutaway.js): inside a screen circle of `radius` m round you, whatever stands between the camera
  // and you above `knee` m over your feet dither-fades (walls, roofs, upper storeys, trees, overpass decks). In a car the
  // line is `carClear` m over the car (its own roof and the deck it drives on stay). `soft` is the dithered rim's share.
  cutaway: { radius: 5.5, knee: 0.6, carClear: 1.8, soft: 0.35 },
};

// The body views' rows (CAMERA.body): problems, or [].
export function validateCameraBody() {
  const bad = [], B = CAMERA.body;
  for (const v of ['THIRD', 'SHOULDER']) {
    const r = B[v];
    if (!CAMERA.views.includes(v)) bad.push(`${v}: not in CAMERA.views`);
    if (!r || !(r.dMin >= B.hardMin && r.dMin < r.dMax && r.dStart >= r.dMin && r.dStart <= r.dMax)) bad.push(`${v}: boom dMin <= dStart <= dMax, never under hardMin (${B.hardMin})`);
    if (r && !(r.eye >= 1.2 && r.eye <= 1.9)) bad.push(`${v}.eye: 1.2-1.9 m`);
    if (r && !(Math.abs(r.side) <= 1)) bad.push(`${v}.side: within 1 m`);
    if (r?.aimD !== undefined && !(r.aimD >= B.hardMin && r.aimD <= r.dMax)) bad.push(`${v}.aimD: between hardMin and dMax`);
  }
  if (!(B.pitch[0] < 0 && B.pitch[1] > 0 && B.pitch[0] >= -80 && B.pitch[1] <= 80)) bad.push('body.pitch: [down < 0, up > 0], within 80 degrees');
  if (!(B.pitchStart >= B.pitch[0] && B.pitchStart <= B.pitch[1])) bad.push('body.pitchStart: inside the pitch range');
  if (!(B.ceil >= 2.2 && B.ceil <= 4 && B.ceilGap > 0 && B.ceil - B.ceilGap > 1.9)) bad.push('body.ceil: 2.2-4 m, and head height left under it');
  if (!(B.floor > 0.1 && B.floor < 1)) bad.push('body.floor: 0.1-1 m');
  if (!(B.pad >= 0.15 && B.pad <= 0.8)) bad.push('body.pad: 0.15-0.8 m');
  if (!(B.near > 0.02 && B.near <= 0.3)) bad.push('body.near: 0.02-0.3 m');
  if (!(B.viewR >= 60 && B.viewR <= 300)) bad.push('body.viewR: 60-300 m');
  if (CAMERA.start !== 'TOPDOWN') bad.push('CAMERA.start must stay TOPDOWN');
  return bad;
}
