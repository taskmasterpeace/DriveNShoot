// AUTHORED BUILDINGS as rows (docs/design/WEB_BUILDING_LAB.md): buildings laid out or edited in the Building Lab
// (web/lab.html, EXPORT), each standing in the Phoenix ring in place of what the generator would put there. The row's
// format is in world/authored.js (v1). Paste an export into AUTHORED with a site:
//   site: { lot: 'R3.-9.0' }          that lot's building is replaced (turned to face the lot's street; it must fit the lot)
//   site: { x: 412, z: -700, front }  stood with its footprint centred there (whole metres); the lots of that block it
//                                     covers are cleared. Keep it inside the block's streets.
// Live, without a reload: node tools/dl.mjs author row='<json>' x= z= (and author remove=<id>).
// AUTHORED empty: the ring is exactly what the generator makes.
export const AUTHORED = [];

// Exports kept as fixtures (not placed): the selftest stands LAB_SAMPLES.office2 in the ring and walks it.
// office2: the lab's office floor (offices-4x2, seed 131, 32 x 14 m), a second storey copied up with its flight placed by
// the storeys rules, then edited by hand upstairs (the back open office split, its far half made a break room).
export const LAB_SAMPLES = {
  office2: { v: 1, id: 'lab-office2', name: 'TWO-STOREY OFFICES', kind: 'offices', zone: 'strip', front: 'N', x0: -16, z0: -7, x1: 16, z1: 7, h: 3.52, top: 6.72, seed: 131, units: 1, walkway: 0, plan: 'offices-4x2',
    floors: [
      { y: 0, deck: null,
        rooms: [
          { type: 'officecell', x0: -15.8, z0: -6.8, x1: -10.6, z1: -0.83, unit: 0 }, { type: 'officelobby', x0: -10.2, z0: -6.8, x1: -2.2, z1: -0.83, unit: 0 },
          { type: 'officecell', x0: -1.8, z0: -6.8, x1: 3.4, z1: -0.83, unit: 0 }, { type: 'officeopen', x0: 3.8, z0: -6.8, x1: 15.8, z1: -0.83, unit: 0 },
          { type: 'corr18', x0: -15.8, z0: -0.43, x1: 15.8, z1: 1.37, unit: 0 },
          { type: 'officecell', x0: -15.8, z0: 1.77, x1: -10.6, z1: 6.8, unit: 0 }, { type: 'breakroom', x0: -10.2, z0: 1.77, x1: -4.7, z1: 6.8, unit: 0 },
          { type: 'washroom', x0: -4.3, z0: 1.77, x1: -0.9, z1: 6.8, unit: 0 }, { type: 'officecell', x0: -0.5, z0: 1.77, x1: 4.7, z1: 6.8, unit: 0 },
          { type: 'officeopen', x0: 5.1, z0: 1.77, x1: 15.8, z1: 6.8, unit: 0 },
        ],
        walls: [
          { horizontal: false, fixed: -10.4, a0: -7, a1: -0.63, gaps: [] }, { horizontal: false, fixed: -2, a0: -7, a1: -0.63, gaps: [] }, { horizontal: false, fixed: 3.6, a0: -7, a1: -0.63, gaps: [] },
          { horizontal: true, fixed: -0.63, a0: -16, a1: 16, gaps: [{ at: -3.5, w: 1.8 }, { at: 12.5, w: 1.8 }, { at: 2.25, w: 1.8 }, { at: -11.75, w: 1.8 }] },
          { horizontal: true, fixed: 1.57, a0: -16, a1: 16, gaps: [{ at: 14.5, w: 1.8 }, { at: -8.5, w: 1.8 }, { at: 0.65, w: 1.8 }, { at: -11.75, w: 1.8 }, { at: -3.15, w: 1.8 }] },
          { horizontal: false, fixed: -10.4, a0: 1.57, a1: 7, gaps: [] }, { horizontal: false, fixed: -4.5, a0: 1.57, a1: 7, gaps: [] }, { horizontal: false, fixed: -0.7, a0: 1.57, a1: 7, gaps: [] },
          { horizontal: false, fixed: 4.9, a0: 1.57, a1: 7, gaps: [] },
        ],
        doors: [{ side: 'N', at: -5.5, w: 2.4, kind: 'front', unit: 0 }] },
      { y: 3.52, deck: null,
        rooms: [
          { type: 'officecell', x0: -15.8, z0: -6.8, x1: -10.6, z1: -0.83, unit: 0 }, { type: 'officelobby', x0: -10.2, z0: -6.8, x1: -2.2, z1: -0.83, unit: 0 },
          { type: 'officecell', x0: -1.8, z0: -6.8, x1: 3.4, z1: -0.83, unit: 0 }, { type: 'officeopen', x0: 3.8, z0: -6.8, x1: 15.8, z1: -0.83, unit: 0 },
          { type: 'corr18', x0: -15.8, z0: -0.43, x1: 15.8, z1: 1.37, unit: 0 },
          { type: 'officecell', x0: -15.8, z0: 1.77, x1: -10.6, z1: 6.8, unit: 0 }, { type: 'breakroom', x0: -10.2, z0: 1.77, x1: -4.7, z1: 6.8, unit: 0 },
          { type: 'washroom', x0: -4.3, z0: 1.77, x1: -0.9, z1: 6.8, unit: 0 }, { type: 'officecell', x0: -0.5, z0: 1.77, x1: 4.7, z1: 6.8, unit: 0 },
          { type: 'officeopen', x0: 5.1, z0: 1.77, x1: 10.3, z1: 6.8, unit: 0 }, { type: 'breakroom', x0: 10.7, z0: 1.77, x1: 15.8, z1: 6.8, unit: 0 },
        ],
        walls: [
          { horizontal: false, fixed: -10.4, a0: -7, a1: -0.63, gaps: [] }, { horizontal: false, fixed: -2, a0: -7, a1: -0.63, gaps: [] }, { horizontal: false, fixed: 3.6, a0: -7, a1: -0.63, gaps: [] },
          { horizontal: true, fixed: -0.63, a0: -16, a1: 16, gaps: [{ at: -3.5, w: 1.8 }, { at: 12.5, w: 1.8 }, { at: 2.25, w: 1.8 }, { at: -11.75, w: 1.8 }] },
          { horizontal: true, fixed: 1.57, a0: -16, a1: 16, gaps: [{ at: 14.5, w: 1.8 }, { at: -8.5, w: 1.8 }, { at: 0.65, w: 1.8 }, { at: -11.75, w: 1.8 }, { at: -3.15, w: 1.8 }] },
          { horizontal: false, fixed: -10.4, a0: 1.57, a1: 7, gaps: [] }, { horizontal: false, fixed: -4.5, a0: 1.57, a1: 7, gaps: [] }, { horizontal: false, fixed: -0.7, a0: 1.57, a1: 7, gaps: [] },
          { horizontal: false, fixed: 4.9, a0: 1.57, a1: 7, gaps: [] }, { horizontal: false, fixed: 10.5, a0: 1.57, a1: 7, gaps: [{ at: 4.5, w: 1.8 }] },
        ] },
    ],
    flights: [{ from: 0, x0: 5.35, x1: 10.19, z0: -6.78, z1: -5.38, axis: 'x', dir: 1 }] },
};
