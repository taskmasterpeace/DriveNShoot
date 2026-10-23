// HOT GROUND (docs/design/WEB_FAN_SERVICE_BIBLE.md §3.2, our term) and the strange creatures that live there, as rows
// (docs/design/WEB_GREYBORN_GRAPEVINE.md §3.4). Absorbable: the survival system can take DOSE whole, and the fauna layer
// can take HOT_FAUNA (each row says how it looks and moves without leaning on this module).

// Zones. dose: rad per second at the centre (falls off as (1 - d/r)^1.5); look: colours (all yellow-olive, never purple);
// fauna: what lives there and how many.
export const HOT_GROUND = [
  {
    id: 'fused_flat', name: 'THE FUSED FLAT', x: -50, z: -425, r: 50, dose: 3,
    look: { tint: '#7d7a3c', glow: '#b8c94a', glass: '#c8cfa0', husk: '#3b3328', drum: '#6a4a26' },
    husks: 14, drums: 7, glass: 22,
    fauna: { glassling: 5, lantern: 1 }, wakeR: 120,
  },
];

// The need hook. bands: at a dose, the share of max hp it cuts until treated. decay: rad per game hour once out of the
// zone. treat: the item that brings it down by `by`.
export const DOSE = {
  id: 'dose', unit: 'rad', carMul: 0.5,
  bands: [
    { at: 0, label: 'CLEAN', cut: 0 },
    { at: 100, label: 'MILD', cut: 0.1 },
    { at: 300, label: 'SICK', cut: 0.25 },
    { at: 600, label: 'GRAVE', cut: 0.45 },
  ],
  decay: 4, treat: { item: 'antibiotics', by: 60 },
};

// The creatures. body: how to draw it (the fauna layer can replace this); wake: m at which it comes up; hot: dose added
// by a bite.
export const HOT_FAUNA = {
  glassling: {
    name: 'Glassling', hp: 45, speed: 3.6, claw: 9, hot: 12, wake: 7, leash: 60,
    body: { crouch: true, skin: '#d6d8c2', shirt: '#5d6248', pants: '#4a4e3a' },
    what: 'pale, glass-backed crawlers buried in fused sand; they come up under whatever walks near and the bite is hot',
  },
  lantern: {
    name: 'the Lantern', hp: 140, speed: 1.1, claw: 0, hot: 0, follow: 16, doseMul: 2, near: 20,
    body: { crouch: false, skin: '#e2dfc8', shirt: '#cfccb6', pants: '#bdb9a2', glow: '#d9e66a' },
    what: 'a tall pale figure among the husks whose head glows at night; it never attacks, it follows, and near it the ground runs twice as hot',
  },
};
