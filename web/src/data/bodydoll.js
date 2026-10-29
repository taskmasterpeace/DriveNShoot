// THE BODY DOLL (docs/design/WEB_UI_EDITOR.md §3.9). Locational damage you can see: a small figure of your own body in
// the HUD (bottom left by default, a HUD layout row like any other) whose parts tint by what is wrong with them, and the
// PACK screen that opens by lifting that same figure up into the full equipment view, your worn containers beside it
// and what lies near your feet.
//
// Where a wound is: a hit lands on a gear part (data/gear.js PARTS: head | torso | arms | legs, rolled from HIT_ODDS by
// what made it, the same roll armor soaks on); arms and legs pick a side, so a wound sits on one of the six DOLL_PARTS
// below (wound.part, saved with the wound). Health is still one pool (the game is balanced on it); what the doll shades
// for "hurt" is the share of your missing health each part took, mending as you mend.

// The six parts, the gear part that covers each, and what the screen calls it.
export const DOLL_PARTS = [
  { id: 'head', gear: 'head', name: 'HEAD' },
  { id: 'torso', gear: 'torso', name: 'TORSO' },
  { id: 'arm_l', gear: 'arms', name: 'LEFT ARM' },
  { id: 'arm_r', gear: 'arms', name: 'RIGHT ARM' },
  { id: 'leg_l', gear: 'legs', name: 'LEFT LEG' },
  { id: 'leg_r', gear: 'legs', name: 'RIGHT LEG' },
];
export const DOLL_PART_IDS = DOLL_PARTS.map((p) => p.id);

// What a part can be, worst first: the doll shows the worst. `wound`: the INJURIES kind (data/survival.js) and the
// test on the wound; `missing` comes from g.needs.lost (no system takes a limb yet: the state is ready for one).
// tone: the CSS class the doll tints the part with (ui/bodydoll.css). No purple.
export const PART_STATES = [
  { id: 'missing', label: 'GONE', tone: 'missing' },
  { id: 'fractured', label: 'BROKEN', tone: 'fractured', wound: 'fracture', test: (w) => !w.set },
  { id: 'bleeding', label: 'BLEEDING', tone: 'bleeding', test: (w, def) => w.open && def.bleeds > 0 },
  { id: 'burned', label: 'BURNED', tone: 'burned', wound: 'burn', test: (w) => w.open },
  { id: 'bitten', label: 'BITTEN', tone: 'bleeding', wound: 'bite', test: (w) => w.open },
  { id: 'sprained', label: 'SPRAINED', tone: 'sprained', wound: 'sprain', test: (w) => !w.set },
  { id: 'splinted', label: 'SPLINTED', tone: 'splinted', test: (w, def) => w.set && def.needs.includes('splint') },
  { id: 'bandaged', label: 'BANDAGED', tone: 'bandaged', test: (w, def) => !w.open && def.needs.includes('bandage') },
  { id: 'hurt', label: 'HURT', tone: 'hurt' },
  { id: 'ok', label: 'FINE', tone: 'ok' },
];
// A part reads "hurt" once it took this share of your full health and you have not mended it.
export const HURT_AT = 0.06;

// The six parts' states from the wounds (and the hurt shares), worst first per part: { head: 'ok', arm_l: 'fractured', ... }.
// injuries: data/survival.js INJURIES. out: reused (no garbage on the HUD's slow tick).
export function partStates(needs, injuries, hurt = null, out = {}) {
  for (const p of DOLL_PART_IDS) out[p] = needs?.lost?.includes(p) ? 'missing' : (hurt?.[p] ?? 0) >= HURT_AT ? 'hurt' : 'ok';
  for (const w of needs?.wounds ?? []) {
    const def = injuries[w.kind], p = w.part ?? 'torso';
    if (!def || out[p] === 'missing') continue;
    const rank = PART_STATES.findIndex((s) => s.id === out[p]);
    for (let i = 1; i < rank; i++) { const s = PART_STATES[i]; if (s.test && (!s.wound || s.wound === w.kind) && s.test(w, def)) { out[p] = s.id; break; } }
  }
  return out;
}

// Where a kind of wound can be at all (data/survival.js INJURIES): a sprain is a joint's, so a limb's; a wound of a kind not
// listed can be anywhere. A wound rolled onto a part it cannot be on moves to one of these.
export const WOUND_PARTS = { sprain: ['arm_l', 'arm_r', 'leg_l', 'leg_r'] };

// The doll part a wound sits on: the gear part the hit landed on (from combat's hit roll, or null / 'all'), else the
// hit odds of what made it, else the torso; arms and legs pick a side. rnd: () => 0..1.
export function woundPart(part, odds = null, rnd = Math.random) {
  if (part === 'all' || (!part && odds === 'all')) return DOLL_PART_IDS[Math.floor(rnd() * DOLL_PART_IDS.length)];
  if (!part && odds) { let r = rnd(); for (const k in odds) if ((r -= odds[k]) < 0) { part = k; break; } }
  if (part === 'arms') return rnd() < 0.5 ? 'arm_l' : 'arm_r';
  if (part === 'legs') return rnd() < 0.5 ? 'leg_l' : 'leg_r';
  return DOLL_PART_IDS.includes(part) ? part : 'torso';
}

// ---- the PACK: the containers you wear ------------------------------------------------------------------------
// What you carry is one list (systems/inventory.js `carried`, BODY_LITRES on your body plus the pack's litres); every
// slot in it is IN one of these compartments (slot.where). A compartment shows while what makes it is worn; its litres
// come out of the body's share, so wearing a belt or a vest never changes how much you can carry, only where it sits.
// The pack's litres are the worn pack's own. order: the screen's order and the order loose things are put away in.
//   when   'always' | 'pack' (a pack on your back) | a gear slot that must be filled (data/gear.js SLOTS)
//   litres a number, or 'pack' (the worn pack's), or 'rest' (whatever of the body's share the others leave, at least 1)
export const COMPARTMENTS = [
  { id: 'pockets', name: 'POCKETS', when: 'always', litres: 'rest', icon: 'pockets' },
  { id: 'belt', name: 'BELT', when: 'belt', litres: 1, icon: 'belt' },
  { id: 'vest', name: 'VEST', when: 'chest', litres: 1, icon: 'vest' },
  { id: 'pack', name: 'BACKPACK', when: 'pack', litres: 'pack', icon: 'pack' },
];

// The compartments you have now: [{ id, name, icon, cap }]. bodyL: BODY_LITRES; packL: the worn pack's litres (0: none);
// worn: the gear slots worn ({ slot: id|null }).
export function compartments(bodyL, packL, worn) {
  const on = COMPARTMENTS.filter((c) => c.when === 'always' || (c.when === 'pack' ? packL > 0 : !!worn?.[c.when]));
  const fixed = on.reduce((t, c) => t + (typeof c.litres === 'number' ? c.litres : 0), 0);
  return on.map((c) => ({ id: c.id, name: c.name, icon: c.icon, cap: c.litres === 'pack' ? packL : c.litres === 'rest' ? Math.max(1, bodyL - fixed) : c.litres }));
}

// What is "near your feet": every container within this reach of you on your own floor (ground piles, the dead, crates,
// a car's trunk you stand at), nearest first.
export const NEAR_REACH = 2.6;
export const NEAR_MAX = 6;

// Where each paperdoll slot sits on the big doll (percent of the doll's box; side l | r: which side its chip hangs on).
export const DOLL_SLOTS = {
  head: { x: 50, y: 8, side: 'r', part: 'head' }, face: { x: 50, y: 12, side: 'l', part: 'head' }, ear_l: { x: 58, y: 9, side: 'r', part: 'head' }, ear_r: { x: 42, y: 9, side: 'l', part: 'head' },
  neck: { x: 50, y: 17, side: 'r', part: 'torso' }, talisman: { x: 50, y: 19, side: 'l', part: 'torso' },
  chest: { x: 50, y: 28, side: 'r', part: 'torso' }, shirt: { x: 50, y: 31, side: 'l', part: 'torso' }, coat: { x: 50, y: 34, side: 'r', part: 'torso' }, back: { x: 50, y: 36, side: 'l', part: 'torso' },
  sash: { x: 50, y: 40, side: 'r', part: 'torso' }, belt: { x: 50, y: 46, side: 'l', part: 'torso' },
  arms: { x: 75, y: 30, side: 'r', part: 'arm_l' }, bracelet: { x: 77, y: 48, side: 'r', part: 'arm_l' }, ring_l: { x: 78, y: 54, side: 'r', part: 'arm_l' },
  hands: { x: 23, y: 52, side: 'l', part: 'arm_r' }, ring_r: { x: 22, y: 54, side: 'l', part: 'arm_r' },
  legs: { x: 57, y: 70, side: 'r', part: 'leg_l' }, feet: { x: 43, y: 94, side: 'l', part: 'leg_r' },
};

// Problems with the rows (empty = good): the selftest runs it.
export function validateBodyDoll(slots) {
  const bad = [];
  for (const s of slots) if (!DOLL_SLOTS[s]) bad.push(`paperdoll slot '${s}' has no place on the doll`);
  for (const [s, d] of Object.entries(DOLL_SLOTS)) if (!DOLL_PART_IDS.includes(d.part)) bad.push(`slot ${s}: unknown part '${d.part}'`);
  const ids = new Set();
  for (const c of COMPARTMENTS) { if (ids.has(c.id)) bad.push(`compartment ${c.id} twice`); ids.add(c.id); }
  if (!COMPARTMENTS.some((c) => c.when === 'always')) bad.push('no compartment is always there');
  return bad;
}
