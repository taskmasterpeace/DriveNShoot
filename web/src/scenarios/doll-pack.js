// THE BODY DOLL AND THE PACK (data/bodydoll.js, ui/bodydoll.js, ui/inventory.js): you are a scavenger two hours into a run
// with a busted left arm, a gash on the right leg that is still bleeding and a graze on the head, standing on the street
// with a full backpack, and things in the dirt around you: a dropped ration and fuel can at your feet, a crate three
// paces off. The doll at the bottom-left shows each wound where it is. I opens the PACK: your gear, the ground and the
// crate side by side; E uses the splint on the arm and the bandage on the leg; drag a thing from the ground to your pack.
// Run: node tools/dl.mjs scenario name=doll-pack
export default async function (DL, game) {
  const g = game, inv = g.inventory, N = g.survival;
  await DL.start();
  await DL.setTime({ hour: 16 });
  await DL.setWeather({ key: 'CLEAR', instant: true });
  if (g.player.inVehicle) await DL.exitVehicle();
  g.zombies.enabled = false; g.raiderTimer = 1e9; g.wanted = 0;
  if (g.invUI?.open) g.invUI.toggle(false);
  await DL.teleport({ x: 2, z: -44 });
  const p = g.player;
  for (const [id, b] of inv.boxes) if (b.kind === 'ground' && Math.hypot(b.x - p.x, b.z - p.z) < 8) inv.boxes.delete(id);
  g.needs?.wounds && (g.needs.wounds.length = 0);
  p.bleed = 0; p.hp = p.maxHp;
  await DL.step({ seconds: 0.3 });
  // The kit of somebody two hours into a run.
  inv.wear('backpack');
  for (const [id, n] of [['bandage', 3], ['splint', 1], ['jerky', 3], ['water_bottle', 2], ['flare', 1], ['knife', 1], ['painkillers', 1]]) await DL.item({ give: id, n });
  // The ground: a pile at your feet and a crate three paces away.
  const gr = inv.groundAt(p.x + 0.4, p.z);
  inv.add(gr, 'ration', 2); inv.add(gr, 'fuel_can', 1);
  const crate = inv.place('crate:tlab-doll', 'garage', p.x - 3, p.z + 1.2, 40, 'ROADSIDE CRATE');
  inv.add(crate, 'duct_tape', 1); inv.add(crate, 'scrap', 3);
  // The wounds, the real way: a fracture and a laceration through survival, a hit to the head through combat.
  g.godMode = false;
  g.survival.wound('fracture', { part: 'arm_l' });
  g.survival.wound('laceration', { part: 'leg_r' });
  g.combat.damage(p, 8, null, 0, 0, 'bullet', 'head');
  await DL.step({ seconds: 1 });
  g.hud.updateSlow?.();
  g.hud.toast('BODY DOLL · broken left arm, bleeding right leg', 'hot');
  g.hud.subtitle('GOAL: press I for the PACK. Splint the arm and bandage the leg (select, E), then pull the ration and the fuel can off the ground into your pack.', 14);
  return { hp: Math.round(p.hp), wounds: N.view?.().wounds ?? g.needs?.wounds?.map((w) => `${w.kind}:${w.part}`), pack: inv.carried.slots.map((s) => `${s.id}x${s.n}`), ground: gr.slots.map((s) => `${s.id}x${s.n}`), crate: crate.id };
}
