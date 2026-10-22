// Named characters of the Divided States. Pure data + small hooks into game state.
// `where`: 'shop:N' = inside Rust Haven building N, or {x,z}.
// Dialogue nodes: { text, choices: [{ t, next | end, req(g), do(g) }] }; a choice's t may be a function of the game
// (a price that depends on what you carry).
import { WEAPONS } from '../systems/combat.js';

const money = (n) => `$${n}`;

// Kenji's garage (data/parts.js): your last ride has to be parked close by.
const nearCar = (g) => { const v = g.lastVehicle; return v && !v.dead && Math.hypot(v.x - g.player.x, v.z - g.player.z) < 40 ? v : null; };
const buyPlates = (g, face, n, price) => {
  const v = nearCar(g);
  if (!v || !g.spend(price)) return;
  const r = g.garage.plate(v, face, n);
  if (!r.ok) { g.cash += price; g.hud.toast(r.why.toUpperCase(), 'warn'); } else g.hud.toast(`PLATED: ${face.toUpperCase()} +${r.added}`, 'job');
};
const buyMount = (g, kind, price) => {
  const v = nearCar(g);
  if (!v || !g.spend(price)) return;
  const r = g.garage.mount(v, kind);
  if (!r.ok) { g.cash += price; g.hud.toast(r.why.toUpperCase(), 'warn'); } else g.hud.toast(`FITTED: ${kind.toUpperCase()}`, 'job');
};
const plateLine = (v) => { const p = v.plates ?? {}; const r = (x) => Math.round(x ?? 0); return `${v.name}: nose ${r(p.front)}, tail ${r(p.rear)}, sides ${r(p.left)}/${r(p.right)}${v.mounts?.front ? `, hood gun ${v.mounts.front.ammo} rounds` : ''}${v.mounts?.rear ? `, ${v.mounts.rear.kind} x${v.mounts.rear.charges}` : ''}.`; };

export const NPCS = [
  {
    id: 'okonkwo', name: 'Sheriff Adaeze Okonkwo', title: 'Warden Captain · Rust Haven', flag: 'NG', faction: 'warden', weapon: 'smg', essential: true, friends: ['reyes'], // quest giver
    where: 'gate', portrait: { seed: 101, skin: '#5a321b', hair: '#1b1410', hat: 'cowboy', mood: 'neutral', shirt: '#4d5a3e', gear: 'bandolier', beard: false },
    start: 'hi',
    nodes: {
      hi: { text: (g) => g.quests.bounty === 'done' ? 'Dustwolves are quieter since you went out there. Haven owes you.' : g.quests.bounty === 'active' ? (g.stats.raiderKills - g.quests.bountyStart >= 6 ? 'Word on the wire says six Dustwolves will not ride again. That your work?' : `Dustwolves down: ${g.stats.raiderKills - g.quests.bountyStart} of 6. Keep going.`) : 'Stranger. You walk in my gate armed, you walk by my rules. No shooting townsfolk. Understood?',
        choices: [
          { t: 'Understood. Got any work?', next: 'work', req: (g) => !g.quests.bounty },
          { t: 'Six Dustwolves are dead. Pay up.', next: 'pay', deed: { v: 'deliver', m: 8 }, req: (g) => g.quests.bounty === 'active' && g.stats.raiderKills - g.quests.bountyStart >= 6, do: (g) => { g.quests.bounty = 'done'; g.give({ cash: 250 }); g.emit('questComplete', { quest: 'bounty', reward: 250 }); } },
          { t: 'What happened to this place?', next: 'lore' },
          { t: '[Leave]', end: true },
        ] },
      work: { text: 'The Dustwolves raid our water convoys out on the Glass Flats. Six of them in the dirt and I pay you $250. Their camps burn fires at night. Easy to find, hard to leave.',
        choices: [
          { t: 'Consider it done.', next: 'accepted', do: (g) => { g.quests.bounty = 'active'; g.quests.bountyStart = g.stats.raiderKills; g.hud.toast('NEW JOB: Dustwolf Bounty (0/6)', 'job'); } },
          { t: 'Not my fight.', end: true },
        ] },
      accepted: { text: 'Take the Whaler if Kenji lets you. It has the harpoon. Hook one, yank it, watch it roll.', choices: [{ t: '[Leave]', end: true }] },
      pay: { text: 'Counted the ears myself. $250, as promised. Rust Haven remembers.', choices: [{ t: 'Pleasure doing business.', end: true }] },
      lore: { text: 'Phoenix died in a week. Grid went, then the water, then the fires. We built a wall out of the car lots and called it home. Most nights it holds.', choices: [{ t: 'Back to business.', next: 'hi' }, { t: '[Leave]', end: true }] },
    },
  },
  {
    id: 'reyes', name: 'Doc Lupe Reyes', title: 'Clinic · Rust Haven', flag: 'MX', faction: 'drifter', essential: true, friends: ['okonkwo'], // healer + respawn point
    where: 'shop:0', portrait: { seed: 202, skin: '#c68863', hair: '#2a1a12', hat: 'long', mood: 'smile', shirt: '#d8d2c4', gear: 'none', beard: false },
    start: 'hi',
    nodes: {
      hi: { text: (g) => g.player.hp < g.player.maxHp ? 'Mira, you are leaking all over my floor. Sit down.' : 'Clean hands, clean needles, fair prices. That is the whole clinic.',
        choices: [
          { t: `Patch me up (${money(40)})`, deed: { v: 'trade' }, req: (g) => g.player.hp < g.player.maxHp, next: 'healed', do: (g) => { if (g.spend(40)) { g.player.hp = g.player.maxHp; g.player.bleed = 0; } } },
          { t: 'Seen a lot of gunshot wounds lately?', next: 'wounds' },
          { t: '[Leave]', end: true },
        ] },
      healed: { text: (g) => g.player.hp === g.player.maxHp ? 'There. Try to keep the blood on the inside this time.' : 'No money, no stitches. I am sorry.', choices: [{ t: '[Leave]', end: true }] },
      wounds: { text: 'Every night. The raiders use cheap nine-mil from a factory out east. If you come back with lead in you, come here first.', choices: [{ t: '[Leave]', end: true }] },
    },
  },
  {
    id: 'ike', name: 'Ike "Two-Hands" Mercer', title: 'Gunsmith · Rust Haven', flag: 'US', faction: 'drifter', friends: ['kenji'],
    where: 'shop:1', portrait: { seed: 303, skin: '#e0ac85', hair: '#8a8682', hat: 'cap', mood: 'neutral', shirt: '#5a4a38', gear: 'goggles', beard: true },
    start: 'hi',
    nodes: {
      hi: { text: 'Everything here shoots. Some of it even shoots straight. What do you need?',
        choices: [
          { t: `Rust-9 SMG (${money(150)})`, deed: { v: 'trade' }, req: (g) => !g.inv.weapons.includes('smg'), next: 'sold', do: (g) => { if (g.spend(150)) { g.inventory.gainGun('smg', { cond: 0.9 }); g.inv.ammo.smg += 64; g.hud.toast('ACQUIRED: RUST-9 SMG', 'job'); } } },
          { t: `Sawn-off shotgun (${money(200)})`, deed: { v: 'trade' }, req: (g) => !g.inv.weapons.includes('shotgun'), next: 'sold', do: (g) => { if (g.spend(200)) { g.inventory.gainGun('shotgun', { cond: 0.9 }); g.inv.ammo.shells += 16; g.hud.toast('ACQUIRED: SAWN-OFF', 'job'); } } },
          { t: `Ammo crate (${money(50)})`, deed: { v: 'trade' }, next: 'sold', do: (g) => { if (g.spend(50)) { g.inv.ammo.pistol += 24; g.inv.ammo.smg += 64; g.inv.ammo.shells += 8; } } },
          // His bench: the gun in your hands back to clean, priced by how worn it is and what it is worth.
          { t: (g) => `Fix my ${WEAPONS[g.inv.current]?.short.toLowerCase() ?? 'gun'} (${money(g.inventory.smithQuote(g.inv.current))})`, deed: { v: 'trade' }, req: (g) => g.inventory.cond(g.inv.current) < 0.995, next: 'fixed', do: (g) => { const r = g.inventory.smithFix(g.inv.current); if (r.ok) g.hud.toast(`${WEAPONS[g.inv.current].short} FIXED · 100%`, 'job'); } },
          { t: `Gun cleaning kit (${money(40)})`, deed: { v: 'trade' }, next: 'sold', do: (g) => { if (g.spend(40)) g.inventory.stow('cleaning_kit', 1); } },
          { t: `Rifle rounds, a box of 30 (${money(45)})`, deed: { v: 'trade' }, req: (g) => g.inv.weapons.includes('rifle'), next: 'rifle', do: (g) => { if (g.spend(45)) g.inv.ammo.rifle += 30; } },
          { t: '[Leave]', end: true },
        ] },
      sold: { text: 'Pleasure. Don\'t point it at my wall, the wall\'s load-bearing.', choices: [{ t: 'One more thing...', next: 'hi' }, { t: '[Leave]', end: true }] },
      fixed: { text: 'Stripped it, scrubbed it, new spring, filed the catch. It\'ll feed now. Keep it out of the sand and it\'ll stay that way a while.', choices: [{ t: 'One more thing...', next: 'hi' }, { t: '[Leave]', end: true }] },
      rifle: { text: 'Government brass. Don\'t ask me where it came from and I won\'t ask you where you got the rifle.', choices: [{ t: 'One more thing...', next: 'hi' }, { t: '[Leave]', end: true }] },
    },
  },
  {
    id: 'kenji', name: 'Kenji Mori', title: 'Mechanic · Rust Haven', flag: 'JP', faction: 'drifter', friends: ['ike'],
    where: 'shop:2', portrait: { seed: 404, skin: '#e0ac85', hair: '#1b1410', hat: 'wrap', mood: 'neutral', shirt: '#2f3b42', gear: 'goggles', beard: false },
    start: 'hi',
    nodes: {
      hi: { text: 'The Whaler out front is mine. Welded the harpoon gun myself. You want to know how it works, or you want to break it?',
        choices: [
          { t: 'How does the harpoon work?', next: 'harpoon' },
          { t: 'Armor up my ride.', next: 'garage', req: (g) => !!nearCar(g) },
          { t: `Repair my last ride (${money(60)})`, deed: { v: 'trade' }, req: (g) => g.lastVehicle && !g.lastVehicle.dead && g.lastVehicle.hp < g.lastVehicle.maxHp, next: 'fixed', do: (g) => { if (g.spend(60)) g.lastVehicle.hp = g.lastVehicle.maxHp; } },
          { t: '[Leave]', end: true },
        ] },
      harpoon: { text: 'Aim with the mouse, press H. It flies. If it bites a car, the cable holds — you tow them. Press H again and you YANK. Light cars roll. People... do not do well.', choices: [{ t: 'Beautiful.', next: 'hi' }, { t: '[Leave]', end: true }] },
      fixed: { text: 'Good as new. Better, actually. I added more rust.', choices: [{ t: '[Leave]', end: true }] },
      garage: { text: (g) => { const v = nearCar(g); return v ? `Plate goes on in slabs. Every slab stops a burst and costs you speed. A gun on the hood fires where the nose points; the tail can drop oil, caltrops or smoke. ${plateLine(v)}` : 'Bring it round the front first.'; },
        choices: [
          { t: `Four slabs on the nose (${money(48)})`, deed: { v: 'trade' }, next: 'garage', do: (g) => buyPlates(g, 'front', 4, 48) },
          { t: `Four slabs on the tail (${money(48)})`, deed: { v: 'trade' }, next: 'garage', do: (g) => buyPlates(g, 'rear', 4, 48) },
          { t: `Four down each side (${money(96)})`, deed: { v: 'trade' }, next: 'garage', do: (g) => buyPlates(g, 'sides', 4, 96) },
          { t: `Twin MG on the hood (${money(300)})`, deed: { v: 'trade' }, req: (g) => !nearCar(g)?.mounts?.front, next: 'garage', do: (g) => buyMount(g, 'mg', 300) },
          { t: `Oil sprayer on the tail (${money(150)})`, deed: { v: 'trade' }, req: (g) => !nearCar(g)?.mounts?.rear, next: 'garage', do: (g) => buyMount(g, 'oil', 150) },
          { t: `Caltrop dropper (${money(120)})`, deed: { v: 'trade' }, req: (g) => !nearCar(g)?.mounts?.rear, next: 'garage', do: (g) => buyMount(g, 'caltrops', 120) },
          { t: `Smoke layer (${money(100)})`, deed: { v: 'trade' }, req: (g) => !nearCar(g)?.mounts?.rear, next: 'garage', do: (g) => buyMount(g, 'smoke', 100) },
          { t: `Refill the guns and droppers (${money(40)})`, deed: { v: 'trade' }, req: (g) => !!(nearCar(g)?.mounts), next: 'garage', do: (g) => { const v = nearCar(g); if (v && g.spend(40)) g.garage.refill(v); } },
          { t: 'That will do.', next: 'hi' },
        ] },
    },
  },
  {
    id: 'mags', name: 'Mags Delacroix', title: 'Water Trader · Rust Haven', flag: 'HT', faction: 'drifter', friends: ['saoirse', 'tomas'],
    where: 'shop:3', portrait: { seed: 505, skin: '#6e3f22', hair: '#1b1410', hat: 'wrap', mood: 'smile', shirt: '#6b3a24', gear: 'none', beard: false },
    start: 'hi',
    nodes: {
      hi: { text: 'Clean water, three filters deep. Under the Solar King that makes me the richest woman in Arizona.',
        choices: [
          { t: `Buy a canteen (${money(15)}) — filtered water`, deed: { v: 'trade' }, next: 'drink', do: (g) => { if (g.spend(15)) g.survival.consume('canteen'); } },
          { t: 'Heard any rumors?', next: 'rumor' },
          { t: '[Leave]', end: true },
        ] },
      drink: { text: 'Slow sips. Your stomach forgot what water is.', choices: [{ t: '[Leave]', end: true }] },
      rumor: { text: 'Old Tomas walks the Flats south of the highway. Swears there\'s a bunker cache under the old gas station. Also: Saoirse on the radio says a storm\'s coming. She\'s never wrong.', choices: [{ t: 'Thanks, Mags.', end: true }] },
    },
  },
  {
    id: 'saoirse', name: 'Saoirse "Static" Byrne', title: 'Radio DJ · STATIC 1660 AM', flag: 'IE', faction: 'drifter', friends: ['mags'],
    where: 'shop:4', portrait: { seed: 606, skin: '#f1c9a5', hair: '#b0301e', hat: 'long', mood: 'smile', shirt: '#2f3b42', gear: 'none', beard: false },
    start: 'hi',
    nodes: {
      hi: { text: (g) => `You're live on Static, sixteen-sixty AM, the last radio station in Arizona! Current conditions: ${g.sky.label}, ${g.sky.clock}. What can the wasteland's favourite voice do for you?`,
        choices: [
          { t: `Call in a storm (${money(20)})`, next: 'storm', do: (g) => { if (g.spend(20)) g.sky.setWeather('STORM'); } },
          { t: `Call in a dust storm (${money(20)})`, next: 'storm', do: (g) => { if (g.spend(20)) g.sky.setWeather('DUST'); } },
          { t: 'Clear skies, please.', next: 'clear', do: (g) => g.sky.setWeather('CLEAR') },
          { t: '[Leave]', end: true },
        ] },
      storm: { text: 'Ha! I don\'t make the weather, love. I just announce it a bit early. Look up.', choices: [{ t: '[Leave]', end: true }] },
      clear: { text: 'Sun\'s on the house. Mind the glare off the glass flats.', choices: [{ t: '[Leave]', end: true }] },
    },
  },
  {
    id: 'tomas', name: 'Old Tomás Varela', title: 'Wanderer · The Glass Flats', flag: 'CU', faction: 'drifter', friends: ['mags'],
    where: { x: 120, z: 352 }, portrait: { seed: 707, skin: '#a86b45', hair: '#d8d4cc', hat: 'cowboy', mood: 'neutral', shirt: '#5a4a38', gear: 'scar', beard: true },
    start: 'hi',
    nodes: {
      hi: { text: 'Sit, sit. Forty years I drive trucks on this road. Now I walk it. The road does not care either way.',
        choices: [
          { t: 'Mags says you know about a cache.', next: 'cache', req: (g) => !g.quests.cache },
          { t: 'What\'s out past the Flats?', next: 'past' },
          { t: '[Leave]', end: true },
        ] },
      cache: { text: 'Under the station on Route 66, far east. I am too old to dig. Take this key. Whatever is in there, share a little with Rust Haven, eh?',
        choices: [{ t: 'Deal.', end: true, do: (g) => { g.quests.cache = 'active'; g.give({ cash: 60, ammo: { pistol: 18 } }); g.hud.toast('Tomás gave you $60 and some rounds', 'job'); } }] },
      past: { text: 'More dust. More dead towns. They say Denver still has power. They say a lot of things.', choices: [{ t: '[Leave]', end: true }] },
    },
  },
  {
    id: 'vo', name: 'Vo Thanh "Ghost"', title: 'Dustwolf Deserter', flag: 'VN', faction: 'drifter', weapon: 'pistol',
    where: { x: -168, z: -176 }, portrait: { seed: 808, skin: '#c68863', hair: '#1b1410', hat: 'mohawk', mood: 'angry', shirt: '#2b2420', gear: 'bandana', beard: false },
    start: 'hi',
    nodes: {
      hi: { text: 'Easy. EASY. I\'m out. I don\'t ride with the Dustwolves anymore. You gonna shoot me or listen?',
        choices: [
          { t: 'Talk.', next: 'intel' },
          { t: 'Why\'d you leave?', next: 'why' },
          { t: '[Leave]', end: true },
        ] },
      intel: { text: 'They run six camps out on the Flats, all at the corners of the map — junk walls, fire barrels. Buggies patrol at night. They hate the harpoon rig. Use that.', choices: [{ t: 'Good to know.', end: true }] },
      why: { text: 'They took a water convoy last month. Kids were on it. Some lines, you don\'t cross twice.', choices: [{ t: '[Leave]', end: true }] },
    },
  },
];

// Ambient one-liners for unnamed townsfolk.
export const BARKS = {
  drifter: [
    'Got any water? No? Then keep walking.',
    'Heard the Dustwolves hit another convoy last night.',
    'My cousin went to Denver. Never wrote back. Nobody writes back.',
    'Rain\'s acid this season. Stay under a roof if it storms.',
    'Saoirse said the dust is coming in from the west.',
    'Don\'t trust anyone who smiles with all their teeth.',
    'I used to be an accountant. Now I count bullets.',
    'Doc Reyes stitched my leg for a can of peaches. Saint, that woman.',
    'They say the old Phoenix towers still have canned food on the top floors.',
  ],
  warden: [
    'Keep your weapon low inside the wall.',
    'Gate closes at midnight. Mostly.',
    'Sheriff\'s looking for hired guns. Talk to her at the north gate.',
  ],
  raider: ['You lost, meat?'],
};

const FIRST = ['Jesse', 'Marisol', 'Dwayne', 'Ana', 'Kofi', 'Liam', 'Rosa', 'Tariq', 'Hyun', 'Pedro', 'Nia', 'Gus', 'Ines', 'Bo', 'Esme', 'Ray', 'Yuki', 'Kwame', 'Lena', 'Mateo'];
const LAST = ['Holt', 'Vega', 'Okafor', 'Price', 'Nguyen', 'Kowalski', 'Ramos', 'Diaz', 'Byrne', 'Silva', 'Park', 'Mensah', 'Rossi', 'Baptiste', 'Cruz'];
// Pairs that already belong to someone famous, real or fictional, are rolled again.
const FAMOUS = new Set(['Rosa Diaz', 'Ray Holt', 'Rosa Park', 'Ray Park', 'Ray Price', 'Bo Diaz', 'Lena Park']);
// Any rng will do: a seeded one (engine/rng.js, the same draws its pick() makes) or Math.random. Passing Math.random
// once threw here (no .pick), which broke `spawn kind=soldier`.
export function randomName(rng = Math.random) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  for (let k = 0; k < 6; k++) { const n = `${pick(FIRST)} ${pick(LAST)}`; if (!FAMOUS.has(n)) return n; }
  return 'Jesse Okafor';
}
