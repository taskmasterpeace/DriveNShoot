// The play camera's zoom levels (main.js updateCamera). Heights in metres above the ground: `foot` on foot, `drive`
// the base in a vehicle (speed lifts it further, `speedLift` m per m/s, up to `maxHeight`). Indoors the camera never
// sits higher than `indoor`. Z steps out, Shift+Z steps in (or - and =). A new game starts at `start`.
// Whatever spawns "out of sight" (night hordes, the director's squads, raiders at their camps) and whatever is tidied
// away "out of sight" (old bodies, the infected at dawn) measures against the current view (g.viewR), so a wide zoom
// never watches things pop in or vanish. The sun's shadow box and the fog follow the view too (sky.js).
export const ZOOM = {
  levels: [
    { name: 'CLOSE', foot: 22, drive: 30 },
    { name: 'STREET', foot: 33, drive: 40 },
    { name: 'WIDE', foot: 55, drive: 64 },
    { name: 'FAR', foot: 86, drive: 96 },
    { name: 'HIGH', foot: 130, drive: 140 },
  ],
  start: 1,
  indoor: 26,
  speedLift: 0.75,
  maxHeight: 175,
  follow: 5,       // 1/s: how fast the camera's aim point chases its target (exponential, frame-rate independent)
  heightRate: 2.2, // 1/s: how fast the height settles on a new level
};
