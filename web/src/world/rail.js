// The Iron Line: one north–south railway through the west desert, a station, and the
// Route 66 level crossing. Standalone so world gen can keep props/mountains off the track.
export const RAIL = { x: -360, z0: -470, z1: 470, gauge: 1.6 };
export const STATION = { x: -360, z: 110, name: 'DUST BOWL STATION' };
// The station sits north of the Route 66 crossing so a dwelling train never blocks the road.
export const CROSSINGS = [{ z: 0, name: 'ROUTE 66 CROSSING' }];

export function nearRail(x, z, m = 6) { return Math.abs(x - RAIL.x) < m + 3 && z > RAIL.z0 - 10 && z < RAIL.z1 + 10; }
export const RAIL_AVOID = Array.from({ length: 32 }, (_, i) => ({ x: RAIL.x, z: RAIL.z0 + i * 30, r: 14 }));
