// Weapon silhouettes for the weapon bar and the weapon wheel (docs/design/WEB_CONTROLLER.md §3.4): side profiles painted
// once at boot as spray-stencilled shapes - bone paint with the stencil's bridges cut through it and a hard drop shadow,
// on the HUD's salvaged-steel language. No files: every shape is drawn here. Keyed by the gun's model (characters.js
// gunModel: revolver, smg, sawnoff, rifle); anything else gets a generic long gun.
import { gunModel } from '../systems/characters.js';

const W = 132, H = 52, DPR = 2;
const cache = new Map();

function poly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill(); }
function rect(g, x, y, w, h) { g.fillRect(x, y, w, h); }

// Each shape draws in a 132 x 52 box, muzzle to the right.
const SHAPES = {
  revolver(g) {
    rect(g, 50, 15, 58, 7);                    // barrel
    rect(g, 104, 13, 4, 3);                    // front sight
    poly(g, [[34, 12], [56, 12], [58, 27], [34, 27]]); // frame + cylinder
    rect(g, 38, 14, 18, 11);
    poly(g, [[30, 13], [36, 10], [38, 14]]);   // hammer
    poly(g, [[34, 24], [46, 24], [42, 44], [30, 46], [26, 40]]); // grip
    g.beginPath(); g.arc(44, 30, 5, 0, Math.PI); g.lineWidth = 2.4; g.strokeStyle = g.fillStyle; g.stroke(); // trigger guard
  },
  smg(g) {
    rect(g, 26, 14, 64, 13);                   // receiver
    rect(g, 88, 17, 24, 6);                    // barrel shroud
    rect(g, 110, 18, 8, 4);                    // muzzle
    rect(g, 44, 26, 9, 22);                    // magazine
    poly(g, [[62, 26], [72, 26], [70, 42], [61, 42]]); // grip
    poly(g, [[26, 15], [8, 18], [8, 26], [26, 24]]);  // wire stock
    rect(g, 34, 11, 6, 3); rect(g, 80, 11, 4, 3);     // sights
  },
  sawnoff(g) {
    rect(g, 40, 14, 66, 6);                    // top barrel
    rect(g, 40, 21, 66, 6);                    // bottom barrel
    poly(g, [[28, 13], [44, 13], [44, 29], [30, 29]]); // action
    poly(g, [[30, 26], [42, 28], [30, 46], [16, 44]]); // cut-down grip
    rect(g, 52, 28, 30, 5);                    // fore-end
    g.beginPath(); g.arc(40, 32, 5, 0, Math.PI); g.lineWidth = 2.4; g.strokeStyle = g.fillStyle; g.stroke();
  },
  rifle(g) {
    poly(g, [[4, 18], [30, 16], [30, 28], [8, 34], [4, 32]]); // stock
    rect(g, 30, 15, 46, 12);                   // receiver
    rect(g, 74, 18, 44, 5);                    // barrel
    rect(g, 116, 16, 6, 7);                    // muzzle device
    poly(g, [[52, 27], [62, 27], [66, 46], [56, 47]]); // curved magazine
    poly(g, [[38, 27], [46, 27], [42, 41], [35, 40]]); // grip
    rect(g, 34, 10, 26, 4);                    // carry rail
    rect(g, 72, 12, 4, 6);                     // front sight
  },
  fists(g) {
    g.beginPath(); g.ellipse(50, 28, 16, 12, -0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(80, 26, 16, 12, 0.2, 0, Math.PI * 2); g.fill();
  },
};

// The stencil's bridges: thin cuts where a paper stencil holds its islands together.
const BRIDGES = { revolver: [47, 86], smg: [41, 76, 100], sawnoff: [50, 86], rifle: [28, 64, 96], fists: [65] };

export function silhouette(weaponRow, key) {
  const model = key === 'fists' ? 'fists' : gunModel(weaponRow) ?? 'rifle';
  if (cache.has(model)) return cache.get(model);
  const c = document.createElement('canvas');
  c.width = W * DPR; c.height = H * DPR;
  const g = c.getContext('2d');
  g.scale(DPR, DPR);
  const draw = SHAPES[model] ?? SHAPES.rifle;
  // Shadow pass, then the paint, then the bridges cut through both.
  g.save(); g.translate(2.5, 3); g.fillStyle = 'rgba(8,6,4,0.75)'; g.strokeStyle = g.fillStyle; draw(g); g.restore();
  g.fillStyle = '#e9dfc6'; g.strokeStyle = '#e9dfc6'; draw(g);
  // overspray: a few soft specks around the paint
  g.globalAlpha = 0.18;
  for (let i = 0; i < 40; i++) { const x = 6 + ((i * 37) % 120), y = 6 + ((i * 53) % 40); g.fillRect(x, y, 1, 1); }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-out';
  for (const x of BRIDGES[model] ?? []) g.fillRect(x, 0, 1.6, H);
  g.globalCompositeOperation = 'source-over';
  const url = c.toDataURL();
  cache.set(model, url);
  return url;
}
